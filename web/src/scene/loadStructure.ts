import { SceneError } from "./errors";
import {
  PRIMARY_STRUCTURE_CANDIDATE,
  buildStructureSource,
  structureCandidates,
  type NodeLookup,
  type StructureCandidate
} from "./structureSource";
import type { RegistrySlice, StructureSource } from "./types";

/**
 * Thin structure loader with the GLTF loader **injected**
 * (Implementation_Plan P5 "3D asset loader", AGENTS §8: this unit prepares and
 * validates assets, it never authors anatomy).
 *
 * The three.js `GLTFLoader` never appears here: callers pass a `GltfLoader`
 * (a promise-returning function), so every test runs against a fake loader with
 * zero WebGL, zero network and zero three.js import. The integration adapter
 * that wraps `GLTFLoader.load(url, onLoad, …)` into this signature belongs to
 * the renderer unit; this module only owns the node contract and the chain.
 *
 * No fetch happens anywhere in `web/src/scene/**` — a fake loader in a test
 * exercises the chain without touching the network.
 */

/** Minimal loaded-glTF surface this module needs: name → node (or null). */
export type LoadedGltf = {
  getObjectByName(name: string): unknown;
};

/** Injected loader: URL → loaded glTF. Rejects with any error on failure. */
export type GltfLoader = (url: string) => Promise<LoadedGltf>;

export type LoadStructureArgs = {
  candidate: StructureCandidate;
  registry: RegistrySlice;
  loadGltf: GltfLoader;
};

/**
 * Load one candidate and validate it into a `StructureSource`.
 *
 * @throws {SceneError}
 * - `STRUCTURE_LOAD_FAILED` when the loader rejects or yields no scene
 *   (recoverable: the chain tries the next candidate);
 * - `MISSING_REQUIRED_NODE` when a required node is absent — no silent
 *   substitution, no defaulted structure (FM-07);
 * - `INVALID_REGISTRY_STRUCTURES` when the registry itself breaks `C-11`.
 */
export async function loadStructure(args: LoadStructureArgs): Promise<StructureSource> {
  const { candidate, registry, loadGltf } = args;

  let gltf: LoadedGltf;
  try {
    gltf = await loadGltf(candidate.url);
  } catch (cause) {
    throw new SceneError(
      "STRUCTURE_LOAD_FAILED",
      `Failed to load structure source "${candidate.url}"`,
      { detail: { candidateId: candidate.id, url: candidate.url }, recoverable: true, cause }
    );
  }

  if (
    gltf === null ||
    gltf === undefined ||
    typeof gltf.getObjectByName !== "function"
  ) {
    throw new SceneError(
      "STRUCTURE_LOAD_FAILED",
      `Structure source "${candidate.url}" did not yield a scene with named nodes`,
      { detail: { candidateId: candidate.id, url: candidate.url }, recoverable: true }
    );
  }

  const lookup: NodeLookup = (meshNode) => gltf.getObjectByName(meshNode);
  return buildStructureSource(candidate, lookup, registry);
}

export type StructureAttempt = {
  candidateId: StructureCandidate["id"];
  url: string;
  ok: boolean;
  error: SceneError | null;
};

/**
 * `C-11` fallback chain result:
 * - `mode: "source"` — a validated source (primary, or `degraded` procedural);
 * - `mode: "schematic"` — every candidate failed; degrade to the 2D schematic
 *   (G4 / FM-07) with the typed reason. The caller MUST surface the visible
 *   degradation notice — no silent fallback.
 */
export type StructureResolution =
  | {
      mode: "source";
      source: StructureSource;
      candidate: StructureCandidate;
      degraded: boolean;
      attempts: StructureAttempt[];
    }
  | {
      mode: "schematic";
      attempts: StructureAttempt[];
      error: SceneError;
    };

/**
 * Resolve the structure source: primary → procedural → 2D schematic, keeping
 * the same registry IDs throughout. Never throws for candidate failures (they
 * are recorded in `attempts` and the resolution states the outcome); a broken
 * registry still throws, because no candidate could ever satisfy it.
 */
export async function resolveStructureSource(
  registry: RegistrySlice,
  loadGltf: GltfLoader,
  candidates: StructureCandidate[] = structureCandidates()
): Promise<StructureResolution> {
  const attempts: StructureAttempt[] = [];

  for (const candidate of candidates) {
    try {
      const source = await loadStructure({ candidate, registry, loadGltf });
      attempts.push({ candidateId: candidate.id, url: candidate.url, ok: true, error: null });
      return {
        mode: "source",
        source,
        candidate,
        degraded: candidate.id !== PRIMARY_STRUCTURE_CANDIDATE.id,
        attempts
      };
    } catch (cause) {
      const error =
        cause instanceof SceneError
          ? cause
          : new SceneError("STRUCTURE_LOAD_FAILED", `Structure candidate "${candidate.url}" failed`, {
              detail: { candidateId: candidate.id, url: candidate.url },
              recoverable: true,
              cause
            });
      attempts.push({ candidateId: candidate.id, url: candidate.url, ok: false, error });
    }
  }

  const failure = new SceneError(
    "FALLBACK_EXHAUSTED",
    `All ${attempts.length} structure candidate(s) failed; degrading to the 2D schematic`,
    {
      detail: {
        attempts: attempts.map((attempt) => ({
          candidateId: attempt.candidateId,
          code: attempt.error?.code ?? null
        }))
      },
      recoverable: false
    }
  );
  return { mode: "schematic", attempts, error: failure };
}
