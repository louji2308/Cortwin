/**
 * Camera poses — pure data and geometry for the stage's camera director
 * (Contracts `C-11` L352: Overview, LAD, LCX, RCA; ~700 ms flights; immediate
 * under reduced motion).
 *
 * - **Overview** is the pose validated by the mesh performance bench
 *   (`tools/mesh/bench/index.html`): the exact position/fov/near/far that were
 *   measured to hold ≥30 fps. Not re-derived, not guessed.
 * - **Vessel poses are radial**: the camera for a vessel is placed on the ray
 *   from the model origin *through that vessel's centre* (plus a small +Y bias
 *   for a less flat angle), at a fixed standoff distance. This is
 *   orientation-agnostic — it never assumes which anatomical axis the GLB uses
 *   — and it guarantees the vessel is the *nearest* anatomy to the camera (the
 *   heart body sits behind it), so no pose can be occluded by the structure it
 *   frames.
 * - Poses are plain number arrays: no three.js, fully testable in Node. The
 *   renderer interpolates them with `cameraFlightProgress`/`easeOutCubic`.
 *
 * Orientation captions (`cranial`, `caudal`, `LAO`) are deliberately absent —
 * they require HD-02 clinical review before shipping.
 */
import type { CameraTarget, VesselId } from "../scene";

export type Vec3 = readonly [number, number, number];

export type CameraPose = {
  position: Vec3;
  target: Vec3;
};

/** Perspective parameters from the validated bench (`fov`, `near`, `far`). */
export const STAGE_CAMERA = { fov: 38, near: 0.01, far: 10 } as const;

/** The bench's validated overview pose (position `0.18, -0.3, 0.22`, look at origin). */
export const OVERVIEW_POSE: CameraPose = {
  position: [0.18, -0.3, 0.22],
  target: [0, 0, 0]
};

/** Standoff distance for a vessel close-up, in model units (model radius ≈ 0.071). */
export const VESSEL_VIEW_DISTANCE = 0.16;

/** Small +Y bias so close-ups are not perfectly equatorial. */
const UP_BIAS = 0.2;

/** Fallback view direction when a centre is degenerate (origin / non-finite). */
const FALLBACK_DIRECTION: Vec3 = [0, 0.2, 1];

function isFiniteVec3(value: Vec3): boolean {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]) &&
    Number.isFinite(value[2])
  );
}

function normalize(v: Vec3): Vec3 {
  const length = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (!Number.isFinite(length) || length === 0) {
    const fallbackLength = Math.sqrt(
      FALLBACK_DIRECTION[0] ** 2 + FALLBACK_DIRECTION[1] ** 2 + FALLBACK_DIRECTION[2] ** 2
    );
    return [
      FALLBACK_DIRECTION[0] / fallbackLength,
      FALLBACK_DIRECTION[1] / fallbackLength,
      FALLBACK_DIRECTION[2] / fallbackLength
    ];
  }
  return [v[0] / length, v[1] / length, v[2] / length];
}

/**
 * Camera pose framing one vessel: target is the vessel's centre; position is
 * the centre pushed out along the outward radial direction by
 * {@link VESSEL_VIEW_DISTANCE}.
 *
 * Non-finite centres are normalised to the origin (degenerate but safe — the
 * fallback direction keeps the pose finite and at the right standoff).
 */
export function vesselPose(centre: Vec3): CameraPose {
  const safe: Vec3 = isFiniteVec3(centre) ? centre : [0, 0, 0];
  const direction = normalize([safe[0], safe[1] + UP_BIAS, safe[2]]);
  return {
    position: [
      safe[0] + direction[0] * VESSEL_VIEW_DISTANCE,
      safe[1] + direction[1] * VESSEL_VIEW_DISTANCE,
      safe[2] + direction[2] * VESSEL_VIEW_DISTANCE
    ],
    target: safe
  };
}

/**
 * Pose for a `C-11` camera target.
 *
 * @returns `null` for a vessel whose centre is not known yet (structure not
 * loaded / not measured) — the caller decides whether to hold the current view
 * or fall back to overview; this function never invents a centre.
 */
export function cameraPoseFor(
  target: CameraTarget,
  vesselCentres: Partial<Record<VesselId, Vec3>>
): CameraPose | null {
  if (target === "overview") return OVERVIEW_POSE;
  const centre = vesselCentres[target];
  if (centre === undefined || !isFiniteVec3(centre)) return null;
  return vesselPose(centre);
}

/** Linear interpolation between two poses; `t` clamped to `[0, 1]`. */
export function interpolatePose(a: CameraPose, b: CameraPose, t: number): CameraPose {
  const k = !Number.isFinite(t) ? 0 : t <= 0 ? 0 : t >= 1 ? 1 : t;
  if (k === 0) return a;
  if (k === 1) return b;
  const mix = (from: Vec3, to: Vec3): Vec3 => [
    from[0] + (to[0] - from[0]) * k,
    from[1] + (to[1] - from[1]) * k,
    from[2] + (to[2] - from[2]) * k
  ];
  return { position: mix(a.position, b.position), target: mix(a.target, b.target) };
}
