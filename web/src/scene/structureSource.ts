import { SceneError } from "./errors";
import {
  REQUIRED_STRUCTURE_IDS,
  isNeutralStructure,
  structureById,
  validateRegistryStructures
} from "./registryView";
import { resolveSchematic } from "./schematic";
import type {
  RegistrySlice,
  SceneNode,
  StructureId,
  StructureSource
} from "./types";

/**
 * Structure source descriptors and node-contract validation
 * (Contracts `C-11` §8.1, Architecture §10.2, Implementation_Plan P5 step 10).
 *
 * Two candidates behind one contract (`D-07`): the detailed mesh shipped from
 * `assets/ready/heart.glb`, and the procedural-tube fallback built from
 * `assets/fallback/heart_tubes.glb`. Both expose exactly the same five named
 * nodes, so vessel correspondence is identical either way (Final_demo §4.4).
 * The third link of the fallback chain — the 2D schematic — is not a
 * `StructureSource` (its `kind` enum is `gltf | procedural`); the chain returns
 * `mode: "schematic"` when both candidates fail (G4 / FM-07).
 *
 * This module performs no I/O: it validates a node lookup it is handed, so the
 * node contract is testable with a plain function and no WebGL.
 */

export type StructureCandidateId = "primary" | "procedural";

export type StructureCandidate = {
  id: StructureCandidateId;
  kind: "gltf" | "procedural";
  /** Same-origin runtime URL the browser fetches (staged into `web/public/`). */
  url: string;
  /** Repository path the URL is staged from — documentation, not fetchable in-browser. */
  documentPath: string;
};

/** Primary structure source: the detailed BodyParts3D-derived mesh (`D-07`). */
export const PRIMARY_STRUCTURE_CANDIDATE: StructureCandidate = {
  id: "primary",
  kind: "gltf",
  url: "/models/heart.glb",
  documentPath: "assets/ready/heart.glb"
};

/** Procedural fallback: CatmullRom tubes over hand-placed centrelines (`D-07`/`D-09`). */
export const PROCEDURAL_STRUCTURE_CANDIDATE: StructureCandidate = {
  id: "procedural",
  kind: "procedural",
  url: "/models/heart_tubes.glb",
  documentPath: "assets/fallback/heart_tubes.glb"
};

/** The fallback chain, in order: primary → procedural (then 2D schematic). */
export function structureCandidates(): StructureCandidate[] {
  return [PRIMARY_STRUCTURE_CANDIDATE, PROCEDURAL_STRUCTURE_CANDIDATE];
}

/** Resolves a node name inside an already-loaded structure to that node (or null). */
export type NodeLookup = (meshNode: string) => unknown;

/**
 * Build the five `C-11` node descriptors from a lookup, validating the node
 * contract first.
 *
 * @throws {SceneError} `INVALID_REGISTRY_STRUCTURES` when the registry is not
 * exactly the five required structures; `MISSING_REQUIRED_NODE` when a loaded
 * structure lacks any of them. A missing node is an error — never a silent
 * substitution of a similarly named node and never a defaulted structure
 * (FM-07: switch source instead).
 */
export function buildSceneNodes(
  lookup: NodeLookup,
  registry: RegistrySlice
): StructureSource["nodes"] {
  validateRegistryStructures(registry);

  const missing: string[] = [];
  for (const structureId of REQUIRED_STRUCTURE_IDS) {
    const node = lookup(structureById(registry, structureId).meshNode);
    if (node === null || node === undefined) missing.push(structureId);
  }
  if (missing.length > 0) {
    throw new SceneError(
      "MISSING_REQUIRED_NODE",
      `Structure is missing required node(s): ${missing.join(", ")}`,
      { detail: { missing }, recoverable: true }
    );
  }

  return {
    HEART: buildSceneNode(registry, "HEART"),
    AORTA: buildSceneNode(registry, "AORTA"),
    LAD: buildSceneNode(registry, "LAD"),
    LCX: buildSceneNode(registry, "LCX"),
    RCA: buildSceneNode(registry, "RCA")
  };
}

function buildSceneNode(registry: RegistrySlice, structureId: StructureId): SceneNode {
  return {
    structureId,
    meshNode: structureById(registry, structureId).meshNode,
    neutral: isNeutralStructure(structureId, registry)
  };
}

/**
 * Assemble a complete `StructureSource` for one candidate: node descriptors
 * validated against the loaded structure plus the registry's schematic paths.
 */
export function buildStructureSource(
  candidate: StructureCandidate,
  lookup: NodeLookup,
  registry: RegistrySlice
): StructureSource {
  return {
    kind: candidate.kind,
    nodes: buildSceneNodes(lookup, registry),
    schematic: resolveSchematic(registry)
  };
}
