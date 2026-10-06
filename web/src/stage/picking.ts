/**
 * Stage picking — pure rules that turn raycast hits into registry identities
 * (Contracts `C-11` L351, Architecture §10.2 "Picking").
 *
 * The renderer does the geometry work (invisible inflated proxy tubes from
 * `buildPickingProxies`, because thin vessels are unreliable to hit directly);
 * this module owns only the decision rules, so they are testable without WebGL:
 *
 * - **Nearest hit wins.** Raycaster intersections are ordered by distance; the
 *   first hit that resolves to a known structure *is* what the pointer aimed
 *   at. A proxy in front of the anatomy forgives imperfect aim; the heart
 *   surface in front of a vessel correctly keeps a stray click on anatomy.
 * - **Identity only through the registry (INV-C15).** A hit is a mesh *name*;
 *   `structureIdForNode` turns it into an identity. Nothing here maps a string
 *   to a vessel directly — rename a node in the registry and picking follows.
 * - **Vessel vs context.** Vessel hits carry a `VesselId` (selectable, `C-09`);
 *   HEART/AORTA hits are `kind: "context"` — present for the caller to ignore
 *   or clear selection with, never a vessel identity.
 * - **Proxy naming.** Proxy meshes are named `<meshNode>` + {@link PROXY_NAME_SUFFIX}
 *   so they never collide with the loaded glTF's own `getObjectByName` lookups;
 *   the suffix is stripped before the registry is consulted.
 *
 * An unknown mesh name is a renderer bug (the render group contains only
 * registry-named nodes), so it throws `UNKNOWN_MESH_NODE` loudly instead of
 * silently ignoring the hit.
 */
import { structureIdForNode, vesselStructureIds } from "../scene";
import type { RegistrySlice, StructureId, VesselId } from "../scene";

/** Suffix appended to proxy object names (see module doc). */
export const PROXY_NAME_SUFFIX = "__proxy";

/** AG-09 presentational: pointer travel beyond this cancels a click (orbit drag). */
export const CLICK_DRAG_THRESHOLD_PX = 4;

/** One raycast hit as the pure rule sees it (three.js reduced to data). */
export type PickCandidate = {
  /** Object name — vessel/context mesh, or proxy name carrying the suffix. */
  nodeName: string;
  /** Ray distance from the camera; non-finite values are treated as far. */
  distance: number;
};

export type PickResult =
  | { kind: "vessel"; structureId: VesselId; via: "mesh" | "proxy" }
  | { kind: "context"; structureId: StructureId; via: "mesh" | "proxy" };

function normalisedDistance(distance: number): number {
  return Number.isFinite(distance) ? distance : Number.POSITIVE_INFINITY;
}

/**
 * Resolve the first hit the ray meets to a registry identity.
 *
 * @returns the nearest resolved hit — a `vessel` pick (selectable, `C-09`) or
 * a `context` pick (HEART/AORTA, presentational only) — else `null` (empty
 * air, no pick). Nearest-wins across kinds: anatomy in front of a vessel keeps
 * a stray click on anatomy, a proxy in front of the anatomy forgives aim.
 * @throws {SceneError} `UNKNOWN_MESH_NODE` when a hit names a node no registry
 * structure declares — an invariant violation, never a silent skip.
 */
export function resolvePick(
  hits: readonly PickCandidate[],
  registry: RegistrySlice
): PickResult | null {
  const ordered = [...hits].sort(
    (a, b) => normalisedDistance(a.distance) - normalisedDistance(b.distance)
  );

  for (const hit of ordered) {
    const isProxy = hit.nodeName.endsWith(PROXY_NAME_SUFFIX);
    const meshNode = isProxy
      ? hit.nodeName.slice(0, hit.nodeName.length - PROXY_NAME_SUFFIX.length)
      : hit.nodeName;
    const structureId = structureIdForNode(meshNode, registry);
    const via = isProxy ? "proxy" : "mesh";

    if (vesselStructureIds(registry).includes(structureId as VesselId)) {
      return { kind: "vessel", structureId: structureId as VesselId, via };
    }
    return { kind: "context", structureId, via };
  }
  return null;
}

/**
 * True when pointer travel from press to release is within the drag threshold
 * — separating a click (select) from an orbit drag (camera). Measured in CSS
 * pixels of pointer travel, not time.
 */
export function isClick(
  from: { x: number; y: number },
  to: { x: number; y: number },
  thresholdPx: number = CLICK_DRAG_THRESHOLD_PX
): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return false;
  return Math.sqrt(dx * dx + dy * dy) <= thresholdPx;
}
