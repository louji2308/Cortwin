import { describe, expect, it } from "vitest";
import {
  OVERVIEW_POSE,
  STAGE_CAMERA,
  VESSEL_VIEW_DISTANCE,
  cameraPoseFor,
  interpolatePose,
  vesselPose,
  type Vec3
} from "./cameraPoses";

const distance = (a: Vec3, b: Vec3): number =>
  Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);

describe("validated bench pose (tools/mesh/bench/index.html)", () => {
  it("overview matches the measured camera exactly", () => {
    expect(OVERVIEW_POSE.position).toEqual([0.18, -0.3, 0.22]);
    expect(OVERVIEW_POSE.target).toEqual([0, 0, 0]);
  });

  it("perspective parameters match the bench", () => {
    expect(STAGE_CAMERA).toEqual({ fov: 38, near: 0.01, far: 10 });
  });

  it("cameraPoseFor('overview') is the overview pose for any centre set", () => {
    expect(cameraPoseFor("overview", {})).toEqual(OVERVIEW_POSE);
    expect(cameraPoseFor("overview", { LAD: [1, 0, 0] })).toEqual(OVERVIEW_POSE);
  });
});

describe("vesselPose — radial framing, orientation-agnostic", () => {
  const centres: Record<string, Vec3> = {
    LAD: [0.02, 0.05, 0.04],
    LCX: [-0.05, 0.01, -0.03],
    RCA: [0.04, -0.02, -0.05]
  };

  it("targets the vessel centre and stands off at exactly VESSEL_VIEW_DISTANCE", () => {
    for (const centre of Object.values(centres)) {
      const pose = vesselPose(centre);
      expect(pose.target).toEqual(centre);
      expect(distance(pose.position, centre)).toBeCloseTo(VESSEL_VIEW_DISTANCE, 10);
    }
  });

  it("places the camera outside the model (model radius ≈ 0.071)", () => {
    for (const centre of Object.values(centres)) {
      const pose = vesselPose(centre);
      expect(Math.hypot(...pose.position)).toBeGreaterThan(0.13);
    }
  });

  it("gives each distinct centre a distinct camera position", () => {
    const poses = Object.values(centres).map((centre) => vesselPose(centre));
    const keys = poses.map((pose) => pose.position.map((v) => v.toFixed(6)).join(","));
    expect(new Set(keys).size).toBe(poses.length);
  });

  it("stays finite and correctly distanced for degenerate centres", () => {
    for (const bad of [[0, 0, 0], [Number.NaN, 0, 0], [Number.POSITIVE_INFINITY, 1, 1]] as Vec3[]) {
      const pose = vesselPose(bad);
      expect(pose.position.every(Number.isFinite)).toBe(true);
      expect(distance(pose.position, [0, 0, 0])).toBeCloseTo(VESSEL_VIEW_DISTANCE, 10);
    }
  });

  it("adds the +Y bias: camera sits above the centre line for a level centre", () => {
    const pose = vesselPose([0.05, 0, 0]);
    expect(pose.position[1]).toBeGreaterThan(0);
  });
});

describe("cameraPoseFor", () => {
  it("returns a vessel pose when the centre is known", () => {
    const pose = cameraPoseFor("LAD", { LAD: [0.01, 0.05, 0.02] });
    expect(pose).not.toBeNull();
    expect(pose?.target).toEqual([0.01, 0.05, 0.02]);
  });

  it("returns null — never an invented centre — when the vessel centre is unknown", () => {
    expect(cameraPoseFor("RCA", {})).toBeNull();
    expect(cameraPoseFor("LCX", { LCX: [Number.NaN, 0, 0] })).toBeNull();
  });
});

describe("interpolatePose", () => {
  const a = OVERVIEW_POSE;
  const b = vesselPose([0.05, 0.05, 0.05]);

  it("hits the endpoints exactly and mixes in between", () => {
    expect(interpolatePose(a, b, 0)).toEqual(a);
    expect(interpolatePose(a, b, 1)).toEqual(b);
    const mid = interpolatePose(a, b, 0.5);
    expect(mid.position[0]).toBeCloseTo((a.position[0] + b.position[0]) / 2, 10);
    expect(mid.target).toEqual([
      (a.target[0] + b.target[0]) / 2,
      (a.target[1] + b.target[1]) / 2,
      (a.target[2] + b.target[2]) / 2
    ]);
  });

  it("clamps out-of-range and non-finite t instead of extrapolating NaN", () => {
    expect(interpolatePose(a, b, -1)).toEqual(a);
    expect(interpolatePose(a, b, 2)).toEqual(b);
    expect(interpolatePose(a, b, Number.NaN)).toEqual(a);
  });
});
