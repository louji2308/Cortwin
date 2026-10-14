/**
 * View controls — pure geometry for the stage toolbar's camera commands
 * (C-11 §8.1 in-viewer controls: fit / reset / orientation presets).
 *
 * Laws:
 * - **Local commands, store untouched** (C-09): every command is a `{seq, kind}`
 *   value Stage3D keeps in component state and flies inside the canvas. The
 *   store's `cameraPreset` union and its own preset effect are never written by
 *   this module — the toolbar and the store's vessel framing are two inputs to
 *   one camera director, last command wins.
 * - **Neutral orientation vocabulary (HD-02, resolved 2026-10-14)**: presets
 *   use the geometric captions Back / Side / Top; "Reset view" IS the front
 *   (anterior) framing (`OVERVIEW_POSE`), so the toolbar ships five camera
 *   buttons — a separate Front button would duplicate Reset view.
 * - **Fit = same direction, whole model in frame**: {@link fitPose} keeps the
 *   current view direction, moves the target to the model origin and pulls back
 *   to {@link fitDistance} — never an axis assumption, never a store write.
 * - **Orbit window**: every produced distance is clamped to the exact
 *   `OrbitControls` min/max Stage3D wires, so a command can never park the
 *   camera where the controls would silently snap it somewhere else.
 *
 * Pure: no three.js, no React, no DOM. Runs in Node tests.
 */
import {
  OVERVIEW_POSE,
  STAGE_CAMERA,
  STAGE_MIN_ORBIT_DISTANCE,
  type CameraPose,
  type Vec3
} from "./cameraPoses";

/** OrbitControls `maxDistance` — must stay identical to Stage3D's wiring. */
export const STAGE_MAX_ORBIT_DISTANCE = 1.5;

/** Frame margin around the model when fitting — a design constant, documented here. */
export const FIT_FRAME_MARGIN = 1.25;

/** Standoff of the opening view: the distance Reset view and presets sit at. */
export const OVERVIEW_STANDOFF = Math.hypot(
  OVERVIEW_POSE.position[0],
  OVERVIEW_POSE.position[1],
  OVERVIEW_POSE.position[2]
);

/** Orientation presets: geometric captions only (HD-02), origin target. */
export const STAGE_VIEW_PRESETS: {
  readonly back: CameraPose;
  readonly side: CameraPose;
  readonly top: CameraPose;
} = {
  back: { position: [0, 0, -0.27], target: [0, 0, 0] },
  side: { position: [0.27, 0.02, 0], target: [0, 0, 0] },
  top: { position: [0, 0.27, 0.01], target: [0, 0, 0] }
};

export type StageViewPresetId = keyof typeof STAGE_VIEW_PRESETS;

/** Toolbar command kinds: reset (anterior), fit, or one orientation preset. */
export type StageViewCommandKind = "reset" | "fit" | StageViewPresetId;

export type StageViewCommand = {
  readonly seq: number;
  readonly kind: StageViewCommandKind;
};

/**
 * Boot command (`seq: 0`): Stage3D skips it so the opening pose stays exactly
 * what the boot presentation validated — commands only act once a button
 * presses them into a higher sequence.
 */
export const INITIAL_VIEW_COMMAND: StageViewCommand = { seq: 0, kind: "reset" };

/** Next command in the sequence — every button press is observable by `seq`. */
export function nextViewCommand(
  current: StageViewCommand,
  kind: StageViewCommandKind
): StageViewCommand {
  return { seq: current.seq + 1, kind };
}

/** Clamp a distance into the OrbitControls window (invalid → overview standoff). */
export function clampOrbitDistance(distance: number): number {
  const value = Number.isFinite(distance) ? distance : OVERVIEW_STANDOFF;
  if (value < STAGE_MIN_ORBIT_DISTANCE) return STAGE_MIN_ORBIT_DISTANCE;
  if (value > STAGE_MAX_ORBIT_DISTANCE) return STAGE_MAX_ORBIT_DISTANCE;
  return value;
}

/**
 * Distance that frames an extent-wide model at the stage FOV: half the extent
 * over `tan(fov/2)`, times {@link FIT_FRAME_MARGIN}, clamped to the orbit
 * window. A non-positive / non-finite extent (structure not measured yet)
 * falls back to the overview standoff — a fit command before load lands on the
 * opening distance, never on NaN.
 */
export function fitDistance(extent: number): number {
  if (!Number.isFinite(extent) || extent <= 0) {
    return clampOrbitDistance(OVERVIEW_STANDOFF);
  }
  const halfFovRadians = (STAGE_CAMERA.fov * Math.PI) / 360;
  const raw = ((extent / 2) / Math.tan(halfFovRadians)) * FIT_FRAME_MARGIN;
  return clampOrbitDistance(raw);
}

function directionOf(from: CameraPose): Vec3 {
  const dx = from.position[0] - from.target[0];
  const dy = from.position[1] - from.target[1];
  const dz = from.position[2] - from.target[2];
  const length = Math.hypot(dx, dy, dz);
  if (!Number.isFinite(length) || length === 0) {
    // Degenerate from-pose: adopt the anterior overview direction rather than
    // inventing one (cameraPoses' fallback rule).
    const ox = OVERVIEW_POSE.position[0] - OVERVIEW_POSE.target[0];
    const oy = OVERVIEW_POSE.position[1] - OVERVIEW_POSE.target[1];
    const oz = OVERVIEW_POSE.position[2] - OVERVIEW_POSE.target[2];
    const ol = Math.hypot(ox, oy, oz);
    return [ox / ol, oy / ol, oz / ol];
  }
  return [dx / length, dy / length, dz / length];
}

/** Fit: current view direction kept, target on the model origin, distance = fit. */
export function fitPose(extent: number, from: CameraPose): CameraPose {
  const direction = directionOf(from);
  const distance = fitDistance(extent);
  const target = OVERVIEW_POSE.target;
  return {
    position: [
      target[0] + direction[0] * distance,
      target[1] + direction[1] * distance,
      target[2] + direction[2] * distance
    ],
    target
  };
}

/** One orientation preset at the overview standoff (neutral captions only). */
export function presetPose(id: StageViewPresetId): CameraPose {
  const pose = STAGE_VIEW_PRESETS[id];
  return { position: pose.position, target: pose.target };
}

/** Pose for a toolbar command. `extent` feeds fit; presets ignore it. */
export function viewPoseFor(
  kind: StageViewCommandKind,
  from: CameraPose,
  extent: number
): CameraPose {
  switch (kind) {
    case "reset":
      return { position: OVERVIEW_POSE.position, target: OVERVIEW_POSE.target };
    case "fit":
      return fitPose(extent, from);
    default:
      return presetPose(kind);
  }
}
