/**
 * Selection outline — the accent-coloured inverted-hull shell around the
 * selected vessel (C-11 §8.1 "selection outline"; explore F.2: selection is an
 * accent affordance, never a probability colour).
 *
 * Laws:
 * - **Accent injected, never parsed here**: the hull colour arrives as the
 *   `accent` argument. `Stage3D.tsx` (browser-only, WebGL path) passes
 *   `SELECTION_ACCENT_COLOUR` — the value parsed from THE token sheet
 *   (`design/accent.ts`). Keeping the accent out of this module's module-scope
 *   imports is what lets the pure hull maths (`inflateAlongNormals`) stay
 *   loadable in Node/vitest, where `?raw` CSS does not resolve. The colour
 *   therefore reaches three.js only inside the real browser.
 * - **The hull is never a pick target**: picking resolves registry node names
 *   and throws on anything else (`UNKNOWN_MESH_NODE`), so every outline mesh
 *   carries a no-op `raycast` — selection by pointer keeps hitting the vessel
 *   underneath, never the shell around it.
 * - **Explicit disposal**: {@link syncSelectionOutline} disposes the cloned
 *   geometry the moment the selection leaves; the shared hull material is
 *   held by the caller (never in the `materials` record
 *   `disposeStageResources` walks), exactly like the shared pick-proxy
 *   material.
 * - **Selection comes from the model, never from a mesh name**: the caller
 *   passes the selected structure ids it derived from `SceneModel`.
 *
 * Three.js imports are Object3D-level maths only — Node tests run without a
 * WebGL context (threeParts.ts precedent).
 */
import { BackSide, Color, Group, Mesh, MeshBasicMaterial, type BufferGeometry } from "three";
import type { StructureId } from "../scene";

/**
 * Outward inflation along vertex normals, in model units (model radius ≈ 0.071
 * — this is ~1% of radius: a rim at the silhouette, never a floating cage).
 */
export const OUTLINE_INFLATE = 0.0008;

/** Outline nodes live under this prefix so registry picking never sees them. */
export const OUTLINE_NAME_PREFIX = "__ct_selection_outline__";

export function outlineName(structureId: StructureId): string {
  return `${OUTLINE_NAME_PREFIX}${structureId}`;
}

/** Selection outline is never a pick target (picking resolves registry names). */
function noopRaycast(): void {
  /* Intentionally empty — see module doc. */
}

/**
 * The one shared hull material for a stage: BackSide (the classic inverted
 * hull — only the shell's far side draws, producing a silhouette rim), colour
 * = the injected accent. `Color.setStyle` converts from sRGB exactly like the
 * material driver's `setRGB(…, SRGBColorSpace)` path, so the accent reaches
 * the screen unchanged.
 */
export function createSelectionOutlineMaterial(accent: string): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color: new Color().setStyle(accent),
    side: BackSide,
    depthWrite: false
  });
}

/**
 * Clone `geometry` and push every vertex outward along its own normal by
 * `amount` — the hull shell.
 *
 * @throws {RangeError} for a non-finite amount or a geometry without a
 * position attribute (a malformed mesh must fail loudly, not outline nothing).
 */
export function inflateAlongNormals(geometry: BufferGeometry, amount: number): BufferGeometry {
  if (!Number.isFinite(amount)) {
    throw new RangeError(`inflateAlongNormals requires a finite amount, got ${amount}`);
  }
  const copy = geometry.clone();
  if (copy.getAttribute("position") === undefined) {
    copy.dispose();
    throw new RangeError("inflateAlongNormals requires a position attribute");
  }
  if (copy.getAttribute("normal") === undefined) {
    copy.computeVertexNormals();
  }
  const position = copy.getAttribute("position");
  const normal = copy.getAttribute("normal");
  if (position === undefined || normal === undefined) {
    copy.dispose();
    throw new RangeError("inflateAlongNormals could not resolve position/normal attributes");
  }
  for (let index = 0; index < position.count; index += 1) {
    position.setXYZ(
      index,
      position.getX(index) + normal.getX(index) * amount,
      position.getY(index) + normal.getY(index) * amount,
      position.getZ(index) + normal.getZ(index) * amount
    );
  }
  position.needsUpdate = true;
  return copy;
}

/**
 * Make the group's outlines match `selected`: add a hull for each selected
 * structure that has a mesh, remove (and dispose) the rest. Idempotent — call
 * it from one effect whenever selection or structure changes.
 *
 * `material` is the caller-owned shared hull material (see
 * {@link createSelectionOutlineMaterial}); it is never disposed here.
 */
export function syncSelectionOutline(args: {
  group: Group;
  meshes: Partial<Record<StructureId, Mesh>>;
  selected: readonly StructureId[];
  material: MeshBasicMaterial;
}): void {
  const wanted = new Set<StructureId>(args.selected);

  for (const structureId of Object.keys(args.meshes) as StructureId[]) {
    const mesh = args.meshes[structureId];
    const existing = args.group.getObjectByName(outlineName(structureId));
    if (wanted.has(structureId) && mesh !== undefined) {
      if (existing === undefined) {
        const outline = new Mesh(
          inflateAlongNormals(mesh.geometry, OUTLINE_INFLATE),
          args.material
        );
        outline.name = outlineName(structureId);
        outline.raycast = noopRaycast;
        args.group.add(outline);
      }
    } else if (existing !== undefined) {
      args.group.remove(existing);
      const outline = existing as Mesh;
      if (outline.isMesh === true) outline.geometry.dispose();
    }
  }
}
