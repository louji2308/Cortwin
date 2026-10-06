import { describe, expect, it } from "vitest";
import { SceneError, type RegistrySlice } from "../scene";
import { loadProjectRegistry, makeRegistry } from "../scene/testFixtures";
import {
  CLICK_DRAG_THRESHOLD_PX,
  PROXY_NAME_SUFFIX,
  isClick,
  resolvePick
} from "./picking";

const registry: RegistrySlice = loadProjectRegistry();

describe("resolvePick — nearest hit wins, identity only through the registry", () => {
  it("returns null when the ray hit nothing", () => {
    expect(resolvePick([], registry)).toBeNull();
  });

  it("resolves a direct vessel mesh hit", () => {
    expect(resolvePick([{ nodeName: "LAD", distance: 10 }], registry)).toEqual({
      kind: "vessel",
      structureId: "LAD",
      via: "mesh"
    });
  });

  it("resolves a proxy hit by stripping the suffix before consulting the registry", () => {
    expect(
      resolvePick([{ nodeName: `RCA${PROXY_NAME_SUFFIX}`, distance: 4.5 }], registry)
    ).toEqual({ kind: "vessel", structureId: "RCA", via: "proxy" });
  });

  it("nearest wins across kinds: context in front of a vessel keeps the click on anatomy", () => {
    const hits = [
      { nodeName: `LCX${PROXY_NAME_SUFFIX}`, distance: 12 },
      { nodeName: "HEART", distance: 9 }
    ];
    expect(resolvePick(hits, registry)).toEqual({
      kind: "context",
      structureId: "HEART",
      via: "mesh"
    });
  });

  it("nearest wins: a proxy in front of the anatomy forgives aim", () => {
    const hits = [
      { nodeName: "HEART", distance: 9 },
      { nodeName: `LCX${PROXY_NAME_SUFFIX}`, distance: 8 }
    ];
    expect(resolvePick(hits, registry)).toEqual({
      kind: "vessel",
      structureId: "LCX",
      via: "proxy"
    });
  });

  it("nearest wins: a nearer vessel beats a farther vessel regardless of input order", () => {
    const hits = [
      { nodeName: "RCA", distance: 20 },
      { nodeName: `LAD${PROXY_NAME_SUFFIX}`, distance: 5 },
      { nodeName: "LCX", distance: 7 }
    ];
    expect(resolvePick(hits, registry)).toEqual({
      kind: "vessel",
      structureId: "LAD",
      via: "proxy"
    });
  });

  it("treats a non-finite distance as far rather than propagating NaN into order", () => {
    const hits = [
      { nodeName: "HEART", distance: Number.NaN },
      { nodeName: "AORTA", distance: 3 }
    ];
    expect(resolvePick(hits, registry)).toEqual({
      kind: "context",
      structureId: "AORTA",
      via: "mesh"
    });
  });

  it("identity comes from the registry's meshNode, never a hardcoded name mapping", () => {
    const renamed: RegistrySlice = {
      structures: registry.structures.map((structure) =>
        structure.id === "LAD" ? { ...structure, meshNode: "lad_surface" } : structure
      ),
      targets: registry.targets
    };
    expect(resolvePick([{ nodeName: "lad_surface", distance: 1 }], renamed)).toEqual({
      kind: "vessel",
      structureId: "LAD",
      via: "mesh"
    });
    // the OLD name no longer resolves once the registry renamed the node:
    // picking follows the registry, not the string that used to work.
    expect(() => resolvePick([{ nodeName: "LAD", distance: 1 }], renamed)).toThrow(
      SceneError
    );
  });

  it("treats HEART/AORTA as context picks — never a vessel identity", () => {
    expect(resolvePick([{ nodeName: "AORTA", distance: 2 }], registry)).toEqual({
      kind: "context",
      structureId: "AORTA",
      via: "mesh"
    });
  });
});

describe("resolvePick — unknown node is an invariant violation, never a silent skip", () => {
  it("throws SceneError UNKNOWN_MESH_NODE for a name no structure declares", () => {
    let caught: unknown;
    try {
      resolvePick(
        [
          { nodeName: "LAD", distance: 5 },
          { nodeName: "MYSTERY_NODE", distance: 1 }
        ],
        registry
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SceneError);
    expect((caught as SceneError).code).toBe("UNKNOWN_MESH_NODE");
  });

  it("throws for an unknown name hiding behind the proxy suffix", () => {
    expect(() =>
      resolvePick([{ nodeName: `GHOST${PROXY_NAME_SUFFIX}`, distance: 1 }], registry)
    ).toThrow(SceneError);
  });

  it("fails loudly when the registry's vessel chain is broken instead of guessing a classification", () => {
    const noVessels: RegistrySlice = { ...makeRegistry(), targets: [{ id: "CAD", label: "CAD", kind: "overall", modelKey: "CAD", structureId: null }] };
    expect(() => resolvePick([{ nodeName: "LAD", distance: 1 }], noVessels)).toThrow(
      SceneError
    );
  });
});

describe("isClick — click vs orbit drag", () => {
  it("accepts pointer travel at or below the threshold", () => {
    expect(isClick({ x: 0, y: 0 }, { x: CLICK_DRAG_THRESHOLD_PX, y: 0 })).toBe(true);
    expect(isClick({ x: 10, y: 10 }, { x: 12, y: 12 })).toBe(true);
  });

  it("rejects travel beyond the threshold (an orbit drag)", () => {
    expect(
      isClick({ x: 0, y: 0 }, { x: CLICK_DRAG_THRESHOLD_PX + 0.01, y: 0 })
    ).toBe(false);
    expect(isClick({ x: 0, y: 0 }, { x: 30, y: 40 })).toBe(false);
  });

  it("rejects non-finite coordinates instead of returning true by accident", () => {
    expect(isClick({ x: 0, y: 0 }, { x: Number.NaN, y: 0 })).toBe(false);
  });
});
