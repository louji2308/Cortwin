import { describe, expect, it } from "vitest";
import type { VesselId } from "../scene";
import { projectTags, tagAnchors, type TagAnchor } from "./overlay";

/** Column-major identity: clip space == world space. */
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;

const viewport = { width: 200, height: 100 };

const anchor = (id: VesselId, x: number, y: number, z: number): TagAnchor => ({
  id,
  world: [x, y, z]
});

describe("tag projection (pure view transform)", () => {
  it("maps NDC corners to viewport pixels", () => {
    const [centre] = projectTags([anchor("LAD", 0, 0, 0)], IDENTITY, viewport);
    expect(centre?.visible).toBe(true);
    expect(centre?.x).toBeCloseTo(100, 6);
    expect(centre?.y).toBeCloseTo(50, 6);

    const [topLeft] = projectTags([anchor("LAD", -1, 1, 0)], IDENTITY, viewport);
    expect(topLeft?.x).toBeCloseTo(0, 6);
    expect(topLeft?.y).toBeCloseTo(0, 6);

    const [bottomRight] = projectTags([anchor("LAD", 1, -1, 0)], IDENTITY, viewport);
    expect(bottomRight?.x).toBeCloseTo(200, 6);
    expect(bottomRight?.y).toBeCloseTo(100, 6);
  });

  it("hides anchors outside NDC instead of pinning them to an edge", () => {
    const layouts = projectTags(
      [anchor("LAD", 2, 0, 0), anchor("LCX", -1.5, 0, 0)],
      IDENTITY,
      viewport
    );
    expect(layouts[0]?.visible).toBe(false);
    expect(layouts[1]?.visible).toBe(false);
  });

  it("hides anchors behind the camera (non-positive clip w)", () => {
    // w = -z via the third column of the w-row.
    const behind = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, -1, 0, 0, 0, 1] as const;
    const [layout] = projectTags([anchor("LAD", 0, 0, 1)], behind, viewport);
    expect(layout?.visible).toBe(false);
  });

  it("scales through a perspective divide", () => {
    // x_clip = 0.5 * x, w = 1 → ndc halves → pixel moves toward centre.
    const halfX = [0.5, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;
    const [layout] = projectTags([anchor("LAD", 1, 0, 0)], halfX, viewport);
    expect(layout?.visible).toBe(true);
    expect(layout?.x).toBeCloseTo(150, 6);
  });

  it("hides everything when the viewport is not laid out yet", () => {
    const layouts = projectTags([anchor("LAD", 0, 0, 0)], IDENTITY, {
      width: 0,
      height: 0
    });
    expect(layouts[0]?.visible).toBe(false);
  });

  it("rejects a malformed view-projection matrix loudly", () => {
    expect(() => projectTags([], [1, 0, 0], viewport)).toThrow(RangeError);
    expect(() =>
      projectTags([], [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, Number.NaN, 1], viewport)
    ).toThrow(RangeError);
  });

  it("keeps registry order and skips missing or non-finite centres", () => {
    const ids: VesselId[] = ["LAD", "LCX", "RCA"];
    const anchors = tagAnchors(ids, {
      LAD: [0, 0, 0],
      LCX: [Number.NaN, 0, 0],
      RCA: [0.01, 0, 0]
    });
    expect(anchors.map((entry) => entry.id)).toEqual(["LAD", "RCA"]);
    expect(anchors[0]?.world).toEqual([0, 0, 0]);
  });
});
