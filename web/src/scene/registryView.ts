import { SceneError } from "./errors";
import type {
  CameraTarget,
  RegistrySlice,
  RegistryStructure,
  StructureId,
  VesselId
} from "./types";

/**
 * Registry-derived scene identity.
 *
 * INV-C15: vessel identity originates only from the registry. Nothing in this
 * module hardcodes which structures exist or which are vessels — every answer is
 * derived from `C-02` rows. The only fixed sets are the contract's own node
 * contract (`C-11` `StructureSource.nodes` has exactly five keys) and the
 * `VesselId`/`StructureId` unions, which mirror `config/*.json`.
 */

/** `C-11` node contract: exactly these five named nodes, no more, no fewer. */
export const REQUIRED_STRUCTURE_IDS = ["HEART", "AORTA", "LAD", "LCX", "RCA"] as const;

/** Context structures: present in the scene, never given a probability (`C-11`). */
export const CONTEXT_STRUCTURE_IDS = ["HEART", "AORTA"] as const;

export function isRequiredStructureId(value: string): value is StructureId {
  return (REQUIRED_STRUCTURE_IDS as readonly string[]).includes(value);
}

/**
 * Validate the registry against the `C-11` node contract.
 *
 * @throws {SceneError} `INVALID_REGISTRY_STRUCTURES` when the structure id set
 * differs from the five required nodes (missing or extra), so a registry change
 * that breaks `C-11` fails loudly instead of silently rendering fewer nodes.
 */
export function validateRegistryStructures(registry: RegistrySlice): void {
  const observed = registry.structures.map((structure) => structure.id);
  const expected: string[] = [...REQUIRED_STRUCTURE_IDS];
  const missing = expected.filter((id) => !observed.includes(id));
  const extra = observed.filter((id) => !expected.includes(id));
  if (missing.length > 0 || extra.length > 0) {
    throw new SceneError(
      "INVALID_REGISTRY_STRUCTURES",
      `Registry structures do not match the C-11 node contract (missing: ${
        missing.join(", ") || "none"
      }; extra: ${extra.join(", ") || "none"})`,
      { detail: { expected, observed, missing, extra }, recoverable: false }
    );
  }
  for (const structure of registry.structures) {
    if (structure.meshNode.trim() === "") {
      throw new SceneError(
        "INVALID_REGISTRY_STRUCTURES",
        `Registry structure "${structure.id}" declares an empty meshNode`,
        { detail: { structureId: structure.id }, recoverable: false }
      );
    }
  }
}

/**
 * The vessel structures, in registry target order, derived from the registry's
 * own `kind: "vessel"` targets and their `structureId` link (the `C-02`
 * identity chain). Not a literal list: add a vessel to the registry and this
 * follows — but `C-11`'s `VesselId` union must be revised in the same change,
 * which this function enforces rather than papering over.
 *
 * @throws {SceneError} `REGISTRY_VESSEL_MISMATCH` when a vessel target has no
 * structure link, links to an unknown structure, or when the derived set is not
 * exactly `LAD, LCX, RCA` (a missing vessel would silently produce an incomplete
 * `Record<VesselId, …>` and an uncoloured vessel).
 */
export function vesselStructureIds(registry: RegistrySlice): VesselId[] {
  const structureIds = new Set(registry.structures.map((structure) => structure.id));
  const vesselIds: VesselId[] = [];
  const problems: string[] = [];

  for (const target of registry.targets) {
    if (target.kind !== "vessel") continue;
    const structureId = target.structureId;
    if (structureId === null || structureId === undefined) {
      problems.push(`target "${target.id}" has no structureId`);
      continue;
    }
    if (!structureIds.has(structureId)) {
      problems.push(`target "${target.id}" links to unknown structure "${structureId}"`);
      continue;
    }
    if (!isVesselId(structureId)) {
      problems.push(
        `target "${target.id}" links to structure "${structureId}" which is outside the C-11 VesselId union`
      );
      continue;
    }
    if (!vesselIds.includes(structureId)) vesselIds.push(structureId);
  }

  const expected: VesselId[] = ["LAD", "LCX", "RCA"];
  const missing = expected.filter((id) => !vesselIds.includes(id));
  if (missing.length > 0) {
    problems.push(`missing vessel structures: ${missing.join(", ")}`);
  }
  if (vesselIds.length !== expected.length) {
    problems.push(`expected exactly ${expected.length} vessels, derived ${vesselIds.length}`);
  }

  if (problems.length > 0) {
    throw new SceneError(
      "REGISTRY_VESSEL_MISMATCH",
      `Registry vessel chain is incomplete: ${problems.join("; ")}`,
      { detail: { expected, observed: vesselIds, problems }, recoverable: false }
    );
  }
  return vesselIds;
}

function isVesselId(value: string): value is VesselId {
  return value === "LAD" || value === "LCX" || value === "RCA";
}

/**
 * A structure is neutral exactly when no vessel target links to it — "the
 * aorta and left main stay neutral because the model doesn't predict them"
 * (Final_demo §4.4). Derived, never hardcoded per id.
 */
export function isNeutralStructure(structureId: string, registry: RegistrySlice): boolean {
  return !registry.targets.some(
    (target) => target.kind === "vessel" && target.structureId === structureId
  );
}

export function structureById(
  registry: RegistrySlice,
  structureId: StructureId
): RegistryStructure {
  const structure = registry.structures.find((candidate) => candidate.id === structureId);
  if (structure === undefined) {
    throw new SceneError(
      "INVALID_REGISTRY_STRUCTURES",
      `Registry has no structure "${structureId}"`,
      { detail: { structureId }, recoverable: false }
    );
  }
  return structure;
}

/**
 * Map a registry / store camera preset to a `C-11` camera target.
 *
 * `"Overview"` (registry spelling) and `"overview"` (store spelling) both mean
 * the overview. `"CAD"` — a `C-09` preset with no anatomy to fly to — and any
 * context/unknown preset resolve to `overview`: the neutral, never-wrong view.
 * Camera position carries no clinical meaning, so this default is safe and
 * reversible; a typo in the registry is caught by VC-09, not here.
 */
export function cameraTargetFromPreset(preset: string): CameraTarget {
  const normalized = preset.trim().toLowerCase();
  if (normalized === "lad" || normalized === "lcx" || normalized === "rca") {
    return normalized.toUpperCase() as CameraTarget;
  }
  return "overview";
}

/** The registry's camera preset for a structure → a `C-11` camera target. */
export function cameraTargetForStructure(
  registry: RegistrySlice,
  structureId: StructureId
): CameraTarget {
  return cameraTargetFromPreset(structureById(registry, structureId).cameraPreset);
}
