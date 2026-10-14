import { describe, expect, it } from "vitest";
import { OVERVIEW_POSE, STAGE_MIN_ORBIT_DISTANCE } from "./cameraPoses";
import {
  FIT_FRAME_MARGIN,
  INITIAL_VIEW_COMMAND,
  OVERVIEW_STANDOFF,
  STAGE_MAX_ORBIT_DISTANCE,
  STAGE_VIEW_PRESETS,
  clampOrbitDistance,
  fitDistance,
  fitPose,
  nextViewCommand,
  presetPose,
  viewPoseFor,
  type StageViewPresetId
} from "./viewControls";

const norm = (v: readonly number[]): number => Math.hypot(v[0], v[1], v[2]);

describe("view controls (pure camera-command geometry)", () => {
  it("ships the three neutral orientation presets at the overview standoff", () => {
    for (const id of ["back", "side", "top"] as StageViewPresetId[]) {
      const pose = STAGE_VIEW_PRESETS[id];
      expect(norm(pose.position)).toBeCloseTo(OVERVIEW_STANDOFF, 2);
      expect(pose.target).toEqual([0, 0, 0]);
    }
  });

  it("places Back opposite the anterior overview direction", () => {
    const front = [
      OVERVIEW_POSE.position[0] - OVERVIEW_POSE.target[0],
      OVERVIEW_POSE.position[1] - OVERVIEW_POSE.target[1],
      OVERVIEW_POSE.position[2] - OVERVIEW_POSE.target[2]
    ];
    const back = STAGE_VIEW_PRESETS.back.position;
    const dot = front[0] * back[0] + front[1] * back[1] + front[2] * back[2];
    expect(dot).toBeLessThan(0);
  });

  it("fitDistance grows with extent and matches the FOV formula in frame", () => {
    const expected014 =
      ((0.14 / 2) / Math.tan((38 * Math.PI) / 360)) * FIT_FRAME_MARGIN;
    expect(fitDistance(0.14)).toBeCloseTo(expected014, 6);
    expect(fitDistance(0.1)).toBeGreaterThan(fitDistance(0.05));
  });

  it("fitDistance clamps to the OrbitControls window on both ends", () => {
    expect(fitDistance(100)).toBe(STAGE_MAX_ORBIT_DISTANCE);
    expect(fitDistance(0.001)).toBe(STAGE_MIN_ORBIT_DISTANCE);
  });

  it("fitDistance falls back to the overview standoff for unusable extents", () => {
    expect(fitDistance(0)).toBeCloseTo(OVERVIEW_STANDOFF, 6);
    expect(fitDistance(-1)).toBeCloseTo(OVERVIEW_STANDOFF, 6);
    expect(fitDistance(Number.NaN)).toBeCloseTo(OVERVIEW_STANDOFF, 6);
  });

  it("fitPose keeps the current view direction and frames from the origin", () => {
    const from = { position: [0.3, 0.1, 0] as const, target: [0, 0, 0] as const };
    const pose = fitPose(0.14, from);
    expect(pose.target).toEqual([0, 0, 0]);
    expect(norm(pose.position)).toBeCloseTo(fitDistance(0.14), 6);
    expect(pose.position[0]).toBeGreaterThan(0);
    expect(pose.position[2]).toBeCloseTo(0, 6);
  });

  it("fitPose adopts the overview direction for a degenerate from-pose", () => {
    const pose = fitPose(0.14, { position: [0, 0, 0], target: [0, 0, 0] });
    expect(pose.position[0]).toBeCloseTo(0, 6);
    expect(pose.position[1]).toBeCloseTo(0, 6);
    expect(pose.position[2]).toBeCloseTo(fitDistance(0.14), 6);
  });

  it("viewPoseFor dispatches reset / fit / presets", () => {
    const from = { position: [0, 0, 0.4] as const, target: [0, 0, 0] as const };
    expect(viewPoseFor("reset", from, 0.14)).toEqual(OVERVIEW_POSE);
    expect(viewPoseFor("fit", from, 0.14)).toEqual(fitPose(0.14, from));
    expect(viewPoseFor("back", from, 0.14)).toEqual(presetPose("back"));
    expect(viewPoseFor("side", from, 0.14)).toEqual(presetPose("side"));
    expect(viewPoseFor("top", from, 0.14)).toEqual(presetPose("top"));
  });

  it("the boot command is inert and every press advances the sequence", () => {
    expect(INITIAL_VIEW_COMMAND).toEqual({ seq: 0, kind: "reset" });
    expect(nextViewCommand(INITIAL_VIEW_COMMAND, "fit")).toEqual({ seq: 1, kind: "fit" });
    expect(nextViewCommand({ seq: 4, kind: "top" }, "side")).toEqual({ seq: 5, kind: "side" });
  });

  it("clampOrbitDistance clamps into the exact orbit window", () => {
    expect(clampOrbitDistance(0)).toBe(STAGE_MIN_ORBIT_DISTANCE);
    expect(clampOrbitDistance(0.2)).toBe(0.2);
    expect(clampOrbitDistance(99)).toBe(STAGE_MAX_ORBIT_DISTANCE);
    expect(clampOrbitDistance(Number.NaN)).toBeCloseTo(OVERVIEW_STANDOFF, 6);
  });
});
