import { SceneError } from "./errors";
import { validateRegistryStructures, vesselStructureIds } from "./registryView";
import type { RegistrySlice, StructureId, StructureSource, VesselId } from "./types";

/**
 * Picking descriptors (Contracts `C-11` L351, Architecture §10.2 "Picking").
 *
 * Raycasting thin vessels directly is unreliable, so the renderer casts against
 * **invisible, thicker proxy tubes**. This module produces the pure descriptors
 * for them — no geometry is authored here beyond the 2D schematic, only sizing
 * metadata — and the node → identity map, which always resolves through the
 * registry (INV-C15): a raycast hit is a mesh node name, and a name only becomes
 * an identity because the registry declares it. Never the reverse, never an
 * inferred identity from a raw string.
 *
 * Only the three vessels are pickable: `C-09` selection vocabulary and
 * Final_demo §8.4 (Tab/Arrow cycles LAD, LCX, RCA) define selection for vessels,
 * and HEART/AORTA have no selectable state.
 */

/**
 * Hit-geometry multiplier over the visible vessel radius. A presentational
 * forgiveness parameter (`AG-09`: internal, reversible, semantically invisible);
 * proxies stay invisible and never alter visual semantics.
 */
export const PICK_PROXY_INFLATE = 2;

export type PickingProxy = {
  structureId: VesselId;
  meshNode: string;
  inflate: number;
  /** Proxies are never rendered — only raycast. */
  visible: false;
};

/**
 * Build the picking proxies for a validated structure source: one invisible
 * inflated proxy per registry vessel, using the node name the source actually
 * exposes (so a source/node mismatch cannot produce an un-hittable proxy).
 */
export function buildPickingProxies(
  source: StructureSource,
  registry: RegistrySlice
): PickingProxy[] {
  return vesselStructureIds(registry).map((structureId) => ({
    structureId,
    meshNode: source.nodes[structureId].meshNode,
    inflate: PICK_PROXY_INFLATE,
    visible: false
  }));
}

/**
 * Map a raycast hit (a mesh node name) to its registry identity.
 *
 * Matching is exact and case-sensitive against `structures[].meshNode`
 * (identifiers are case-sensitive, Contracts §4).
 *
 * @throws {SceneError} `UNKNOWN_MESH_NODE` when no registry structure declares
 * the name — a node the registry does not know has no identity to display.
 */
export function structureIdForNode(nodeName: string, registry: RegistrySlice): StructureId {
  // Validating first makes the identity cast sound: the registry is exactly the
  // five contract nodes, so any declared meshNode belongs to a StructureId.
  validateRegistryStructures(registry);
  const structure = registry.structures.find(
    (candidate) => candidate.meshNode === nodeName
  );
  if (structure === undefined) {
    throw new SceneError(
      "UNKNOWN_MESH_NODE",
      `No registry structure declares mesh node "${nodeName}"`,
      { detail: { nodeName }, recoverable: false }
    );
  }
  return structure.id as StructureId;
}
