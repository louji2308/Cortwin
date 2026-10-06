import { SceneError } from "./errors";
import { structureById, vesselStructureIds } from "./registryView";
import type { RegistrySlice, StructureSource, VesselId } from "./types";

/**
 * Hand-authored 2D schematic geometry (Implementation_Plan P5 step 15).
 *
 * This is the sanctioned 2D fallback: a simplified, stroke-drawn schematic of
 * the three vessels (Final_demo §7: "a 2D SVG schematic of the three vessels
 * from the same registry"). Hand-drawn simplified geometry is explicitly allowed
 * here — it is a diagrammatic fallback, NOT fabricated 3D anatomy (AGENTS §8):
 * no mesh, no volume, no spatial claims of any kind. The registry's own
 * `schematicPath` field, when present, is authoritative and overrides the
 * authored `d`; the registry shipped today has `null` everywhere, so the
 * authored paths are what renders.
 *
 * Coordinates live in a fixed 360×360 view box (`SCHEMATIC_VIEW_BOX`). Paths are
 * `M`/`L` polylines only, so they validate with a tiny grammar and render with
 * round joins. This file carries no colour whatsoever: identity comes from the
 * registry, colour from THE ramp (`../design`).
 */

export const SCHEMATIC_VIEW_BOX: { width: number; height: number } = {
  width: 360,
  height: 360
};

export type AuthoredSchematicPath = {
  d: string;
  labelAnchor: { x: number; y: number };
  strokeWidth: number;
};

/**
 * Simplified courses: LAD descends toward the apex, LCX curves left, RCA curves
 * right. Label anchors sit just beyond each distal end.
 */
export const AUTHORED_SCHEMATIC_PATHS: Record<VesselId, AuthoredSchematicPath> = {
  LAD: {
    d: "M 168 96 L 161 140 L 153 190 L 147 238 L 143 284",
    labelAnchor: { x: 143, y: 304 },
    strokeWidth: 11
  },
  LCX: {
    d: "M 176 92 L 148 111 L 124 145 L 112 187 L 110 228",
    labelAnchor: { x: 96, y: 248 },
    strokeWidth: 11
  },
  RCA: {
    d: "M 186 98 L 216 117 L 240 152 L 251 197 L 253 242",
    labelAnchor: { x: 266, y: 262 },
    strokeWidth: 11
  }
};

const PATH_GRAMMAR =
  /^(?:\s*(?:[MLHVZmlhvz]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?))+\s*$/;

/**
 * Validate schematic path data: a moveto first, then only `M L H V Z`
 * commands and finite numbers.
 *
 * @throws {SceneError} `INVALID_SCHEMATIC_PATH` — malformed path data is never
 * rendered silently as a broken shape.
 */
export function validateSchematicPath(d: string, structureId: VesselId): void {
  const trimmed = d.trim();
  const valid = trimmed.length > 0 && /^[Mm]/.test(trimmed) && PATH_GRAMMAR.test(trimmed);
  if (!valid) {
    throw new SceneError(
      "INVALID_SCHEMATIC_PATH",
      `Schematic path for "${structureId}" is not a valid M/L path`,
      { detail: { structureId, path: trimmed.slice(0, 120) }, recoverable: false }
    );
  }
}

/**
 * Resolve the schematic paths for the three registry vessels: registry
 * `schematicPath` first (when non-empty), authored path otherwise. Both are
 * validated, and both carry the registry's own structure id — the 2D fallback
 * keeps the same correspondence as the 3D source (`C-11` fallback chain).
 *
 * @throws {SceneError} `REGISTRY_VESSEL_MISMATCH` if the registry's vessel set
 * is not exactly LAD/LCX/RCA, `INVALID_SCHEMATIC_PATH` on bad path data.
 */
export function resolveSchematic(
  registry: RegistrySlice
): StructureSource["schematic"] {
  const vesselIds = vesselStructureIds(registry);
  const schematic = {} as StructureSource["schematic"];

  for (const structureId of vesselIds) {
    const structure = structureById(registry, structureId);
    const authored = AUTHORED_SCHEMATIC_PATHS[structureId];
    const registryPath =
      typeof structure.schematicPath === "string" ? structure.schematicPath.trim() : "";
    const fromRegistry = registryPath !== "";
    const d = fromRegistry ? registryPath : authored.d;

    validateSchematicPath(d, structureId);
    schematic[structureId] = {
      structureId,
      d,
      labelAnchor: authored.labelAnchor,
      strokeWidth: authored.strokeWidth,
      origin: fromRegistry ? "registry" : "authored"
    };
  }

  return schematic;
}
