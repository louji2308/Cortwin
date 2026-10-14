/**
 * Tag projection — the pure view transform that places the DOM vessel tags
 * over the 3D canvas (C-11 §8.1 vessel tags; AGENTS §6.1: hover/selection
 * highlights every representation of the same entity).
 *
 * Laws:
 * - **One projection per frame**: `SceneContents` feeds the camera's
 *   view-projection matrix (three.js column-major elements) and the CSS pixel
 *   viewport; this module only multiplies — no three.js import, so the maths
 *   is testable in Node without a WebGL context.
 * - **Off-screen or behind the camera → `visible: false`, never a wrapped or
 *   mirrored coordinate**: a tag that would lie outside the stage is hidden,
 *   not pinned to an edge (a position that lies about where the vessel is
 *   would mislead).
 * - **Registry order**: {@link tagAnchors} keeps the caller's vessel order and
 *   skips centres that do not exist yet — an unloaded structure yields fewer
 *   anchors, never invented coordinates.
 *
 * Pure: no React, no DOM, no store. Runs in Node tests.
 */
import type { VesselId } from "../scene";
import type { Vec3 } from "./cameraPoses";

export type TagAnchor = {
  readonly id: VesselId;
  readonly world: Vec3;
};

export type TagLayout = {
  readonly id: VesselId;
  /** CSS pixel X inside the stage viewport (only meaningful when visible). */
  readonly x: number;
  /** CSS pixel Y inside the stage viewport (only meaningful when visible). */
  readonly y: number;
  readonly visible: boolean;
};

export type ViewportSize = {
  readonly width: number;
  readonly height: number;
};

/** Three.js `Matrix4.elements` — column-major, 16 finite numbers. */
export type Matrix4ColumnMajor = readonly number[];

function isFiniteVec3(value: Vec3): boolean {
  return (
    value.length === 3 &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]) &&
    Number.isFinite(value[2])
  );
}

/**
 * Anchors for the tag layer: the caller's vessel order, keeping only ids whose
 * world centre exists and is finite (structure not loaded / not measured yet
 * contributes no anchor — the tag simply does not render).
 */
export function tagAnchors(
  vesselIds: readonly VesselId[],
  centres: Readonly<Partial<Record<string, Vec3>>>
): TagAnchor[] {
  const anchors: TagAnchor[] = [];
  for (const id of vesselIds) {
    const world = centres[id];
    if (world !== undefined && isFiniteVec3(world)) {
      anchors.push({ id, world });
    }
  }
  return anchors;
}

/**
 * Project anchors to CSS pixels through `viewProjection`.
 *
 * @throws {RangeError} when the matrix is not 16 finite numbers — that can
 * only be a programming error upstream (three.js always produces one), and a
 * silently invisible tag layer would hide the failure instead of naming it.
 */
export function projectTags(
  anchors: readonly TagAnchor[],
  viewProjection: Matrix4ColumnMajor,
  viewport: ViewportSize
): TagLayout[] {
  if (viewProjection.length !== 16) {
    throw new RangeError(`viewProjection must have 16 elements, got ${viewProjection.length}`);
  }
  for (const element of viewProjection) {
    if (!Number.isFinite(element)) {
      throw new RangeError("viewProjection must be finite");
    }
  }
  const width = Number.isFinite(viewport.width) && viewport.width > 0 ? viewport.width : 0;
  const height = Number.isFinite(viewport.height) && viewport.height > 0 ? viewport.height : 0;

  return anchors.map((anchor) => {
    const [x, y, z] = anchor.world;
    const m = viewProjection;
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
    const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
    const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(cw) || cw <= 0) {
      // Behind the camera (or non-finite clip): hidden, never wrapped.
      return { id: anchor.id, x: 0, y: 0, visible: false };
    }
    if (width === 0 || height === 0) {
      // Viewport not laid out yet: hidden, not pinned at the origin.
      return { id: anchor.id, x: 0, y: 0, visible: false };
    }
    const ndcX = cx / cw;
    const ndcY = cy / cw;
    const visible = Math.abs(ndcX) <= 1 && Math.abs(ndcY) <= 1;
    return {
      id: anchor.id,
      x: (ndcX * 0.5 + 0.5) * width,
      y: (0.5 - ndcY * 0.5) * height,
      visible
    };
  });
}
