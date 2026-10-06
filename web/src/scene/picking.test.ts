import { describe, expect, it } from "vitest";
import { SceneError } from "./errors";
import { PICK_PROXY_INFLATE, buildPickingProxies, structureIdForNode } from "./picking";
import {
  PRIMARY_STRUCTURE_CANDIDATE,
  buildStructureSource
} from "./structureSource";
import { loadProjectRegistry, makeFakeGltf, makeRegistry } from "./testFixtures";
import type { StructureSource } from "./types";

const registry = loadProjectRegistry();

const source: StructureSource = buildStructureSource(
  PRIMARY_STRUCTURE_CANDIDATE,
  (name) => ({ name }),
  registry
);

describe("picking (C-11 L351, INV-C15) — identity always via the registry", () => {
  it("builds one invisible, inflated proxy per registry vessel — and only the vessels", () => {
    const proxies = buildPickingProxies(source, registry);
    expect(proxies.map((proxy) => proxy.structureId)).toEqual(["LAD", "LCX", "RCA"]);
    expect(proxies.every((proxy) => proxy.visible === false)).toBe(true);
    expect(proxies.every((proxy) => proxy.inflate === PICK_PROXY_INFLATE)).toBe(true);
    expect(proxies.every((proxy) => proxy.meshNode.length > 0)).toBe(true);
    expect(PICK_PROXY_INFLATE).toBeGreaterThan(1);
    const ids = proxies.map((proxy) => proxy.structureId);
    expect(ids).not.toContain("HEART");
    expect(ids).not.toContain("AORTA");
  });

  it("keeps proxy node names registry-derived, so every proxy hit resolves back", () => {
    const proxies = buildPickingProxies(source, registry);
    for (const proxy of proxies) {
      const structure = registry.structures.find(
        (candidate) => candidate.id === proxy.structureId
      )!;
      expect(proxy.meshNode).toBe(structure.meshNode);
      expect(structureIdForNode(proxy.meshNode, registry)).toBe(proxy.structureId);
    }
    expect(proxies.find((proxy) => proxy.structureId === "LCX")!.meshNode).toBe("LCX");
  });

  it("a source that renames a required node fails validation instead of remapping identity", () => {
    const renamed = makeFakeGltf(["HEART", "AORTA", "LAD", "RCA", "LCX_renamed"]);
    let caught: unknown;
    try {
      buildStructureSource(
        PRIMARY_STRUCTURE_CANDIDATE,
        (name) => renamed.getObjectByName(name),
        registry
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SceneError);
    expect((caught as SceneError).code).toBe("MISSING_REQUIRED_NODE");
  });

  it("resolves a raycast hit to its registry identity, exactly and case-sensitively", () => {
    expect(structureIdForNode("HEART", registry)).toBe("HEART");
    expect(structureIdForNode("AORTA", registry)).toBe("AORTA");
    expect(structureIdForNode("LAD", registry)).toBe("LAD");
    expect(structureIdForNode("LCX", registry)).toBe("LCX");
    expect(structureIdForNode("RCA", registry)).toBe("RCA");
    expect(() => structureIdForNode("lad", registry)).toThrowError(SceneError);
  });

  it("throws UNKNOWN_MESH_NODE for a name the registry does not declare — no inferred identity", () => {
    for (const unknown of ["LAD_D1", "MODEL_ROOT", "RCA "]) {
      let caught: unknown;
      try {
        structureIdForNode(unknown, registry);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(SceneError);
      expect((caught as SceneError).code).toBe("UNKNOWN_MESH_NODE");
      expect((caught as SceneError).recoverable).toBe(false);
      expect((caught as SceneError).detail.nodeName).toBe(unknown);
    }
  });

  it("refuses to resolve a hit against a registry that is not the five contract structures", () => {
    const broken = makeRegistry();
    broken.structures = broken.structures.filter((structure) => structure.id !== "AORTA");
    expect(() => structureIdForNode("HEART", broken)).toThrowError(SceneError);
    expect(() => structureIdForNode("AORTA", broken)).toThrowError(SceneError);
  });

  it("keeps proxies free of colour and probability (presentation belongs to the ramp)", () => {
    const json = JSON.stringify(buildPickingProxies(source, registry));
    expect(json).not.toMatch(/#|rgb\(|hsl\(|probability/i);
  });

  it("works from a plain name lookup — no WebGL, no rendered scene", () => {
    const fake = makeFakeGltf(["HEART", "AORTA", "LAD", "LCX", "RCA"]);
    const built = buildStructureSource(
      PRIMARY_STRUCTURE_CANDIDATE,
      (name) => fake.getObjectByName(name),
      registry
    );
    expect(Object.keys(built.nodes)).toHaveLength(5);
    expect(fake.getObjectByName("LAD")).toEqual({ name: "LAD" });
    expect(fake.getObjectByName("MISSING")).toBeNull();
  });
});
