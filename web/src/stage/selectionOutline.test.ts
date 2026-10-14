import { describe, expect, it, vi } from "vitest";
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Group, Mesh } from "three";
import type { StructureId } from "../scene";
import {
  OUTLINE_INFLATE,
  createSelectionOutlineMaterial,
  inflateAlongNormals,
  outlineName,
  syncSelectionOutline
} from "./selectionOutline";

// Accent hex pins the same value design/accent.ts parses from the token sheet
// (--ct-color-accent: #38bdf8). It is written as a literal here — the Node
// test environment cannot resolve `?raw` CSS, so design/accent.ts is not
// imported by this suite; the stage/browser path is what wires the two together.
const ACCENT = "#38bdf8";

describe("selection outline (accent hull)", () => {
  it("inflates every vertex along its own normal and never mutates the source", () => {
    const source = new BoxGeometry(1, 1, 1);
    const before = Float32Array.from(source.getAttribute("position").array as ArrayLike<number>);
    const normals = source.getAttribute("normal");

    const hull = inflateAlongNormals(source, OUTLINE_INFLATE);
    expect(hull).not.toBe(source);
    expect(hull.getAttribute("position").count).toBe(source.getAttribute("position").count);

    const out = hull.getAttribute("position");
    const src = source.getAttribute("position");
    for (let index = 0; index < out.count; index += 1) {
      expect(out.getX(index)).toBeCloseTo(src.getX(index) + normals.getX(index) * OUTLINE_INFLATE, 6);
      expect(out.getY(index)).toBeCloseTo(src.getY(index) + normals.getY(index) * OUTLINE_INFLATE, 6);
      expect(out.getZ(index)).toBeCloseTo(src.getZ(index) + normals.getZ(index) * OUTLINE_INFLATE, 6);
    }
    const after = source.getAttribute("position").array as ArrayLike<number>;
    for (let index = 0; index < before.length; index += 1) {
      expect(after[index]).toBe(before[index]);
    }
  });

  it("computes normals when the geometry ships without them", () => {
    const bare = new BufferGeometry();
    bare.setAttribute(
      "position",
      new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)
    );
    const hull = inflateAlongNormals(bare, 0.01);
    expect(hull.getAttribute("normal")).toBeDefined();
    expect(hull.getAttribute("position").count).toBe(3);
  });

  it("rejects unusable inputs loudly", () => {
    expect(() => inflateAlongNormals(new BoxGeometry(1, 1, 1), Number.NaN)).toThrow(RangeError);
    expect(() => inflateAlongNormals(new BufferGeometry(), 0.1)).toThrow(RangeError);
  });

  it("syncs hulls in and out of the group, disposing what it removes", () => {
    const group = new Group();
    const meshes: Partial<Record<StructureId, Mesh>> = { LAD: new Mesh(new BoxGeometry(1, 1, 1)) };
    const material = createSelectionOutlineMaterial(ACCENT);

    syncSelectionOutline({ group, meshes, selected: [], material });
    expect(group.getObjectByName(outlineName("LAD"))).toBeUndefined();

    syncSelectionOutline({ group, meshes, selected: ["LAD"], material });
    const hull = group.getObjectByName(outlineName("LAD"));
    expect(hull).toBeDefined();

    const hullMesh = hull as unknown as Mesh;
    const dispose = vi.spyOn(hullMesh.geometry, "dispose");
    syncSelectionOutline({ group, meshes, selected: [], material });
    expect(group.getObjectByName(outlineName("LAD"))).toBeUndefined();
    expect(dispose).toHaveBeenCalledTimes(1);
    dispose.mockRestore();
  });

  it("shares one caller-owned accent material and never a pick target", () => {
    const group = new Group();
    const meshes: Partial<Record<StructureId, Mesh>> = {
      LAD: new Mesh(new BoxGeometry(1, 1, 1)),
      LCX: new Mesh(new BoxGeometry(1, 1, 1))
    };
    const material = createSelectionOutlineMaterial(ACCENT);
    syncSelectionOutline({ group, meshes, selected: ["LAD", "LCX"], material });

    const lad = group.getObjectByName(outlineName("LAD")) as Mesh;
    const lcx = group.getObjectByName(outlineName("LCX")) as Mesh;
    expect(lad.material).toBe(material);
    expect(lcx.material).toBe(material);
    expect(lad.material).toBe(lcx.material);
    expect(material.side).toBe(1); // BackSide (three.js: FrontSide 0, BackSide 1, DoubleSide 2)
    expect(material.color.getHexString()).toBe("38bdf8");

    const intersections: unknown[] = [];
    lad.raycast({} as never, intersections as never);
    expect(intersections).toHaveLength(0);
  });

  it("ignores selected ids that have no mesh without throwing", () => {
    const group = new Group();
    const material = createSelectionOutlineMaterial(ACCENT);
    expect(() =>
      syncSelectionOutline({ group, meshes: {}, selected: ["RCA"], material })
    ).not.toThrow();
    expect(group.children).toHaveLength(0);
  });
});
