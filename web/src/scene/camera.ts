/**
 * Camera preset model and pure flight timing (Implementation_Plan P5 step 13).
 *
 * `C-11` L352: "Camera: Overview, LAD, LCX, RCA; ~700 ms flights, immediate
 * under reduced motion." This module owns the *timing* only — it produces no
 * poses, no vectors and no three.js objects, so it is fully testable without a
 * renderer. The camera director that consumes it lives with the 3D components.
 *
 * Orientation captions (`cranial`, `caudal`, `LAO`) are deliberately absent:
 * they need HD-02 clinical review before they may ship.
 */

/** `C-11` / Final_demo §8: camera flights are ~700 ms. */
export const CAMERA_FLIGHT_MS = 700;

/**
 * Duration of a camera flight in ms — `0` under reduced motion, so the camera
 * arrives instantly and truth is unchanged (C-09 display-channel rule).
 */
export function cameraFlightDuration(reducedMotion: boolean): number {
  return reducedMotion ? 0 : CAMERA_FLIGHT_MS;
}

/**
 * Cubic ease-out (decelerating arrival), the "ease-out" of Final_demo §4.7/§8.
 * Pure, monotonic, clamped: `f(0) = 0`, `f(1) = 1`, `f(t) ≥ t` for `t ∈ [0,1]`.
 */
export function easeOutCubic(t: number): number {
  const clamped = t <= 0 ? 0 : t >= 1 ? 1 : t;
  const inverse = 1 - clamped;
  return 1 - inverse * inverse * inverse;
}

/**
 * Progress of a camera flight in `[0, 1]` after `elapsedMs`.
 *
 * Reduced motion short-circuits to `1`: the camera is already at its target
 * (duration 0), so an animation must never be observed. Non-finite or negative
 * elapsed time is treated as `0` rather than propagating `NaN` into a camera.
 */
export function cameraFlightProgress(elapsedMs: number, reducedMotion: boolean): number {
  if (reducedMotion) return 1;
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  return easeOutCubic(elapsedMs / CAMERA_FLIGHT_MS);
}
