import { describe, expect, it } from "vitest";
import { SceneError } from "./errors";
import {
  REQUIRED_STRUCTURE_IDS,
  cameraTargetForStructure,
  cameraTargetFromPreset,
  isNeutralStructure,
  isRequiredStructureId,
  structureById,
  validateRegistryStructures,
  vesselStructureIds
} from "./registryView";
import { loadProjectRegistry, makeRegistry } from "./testFixtures";

const expectSceneError = (fn: () => unknown, code: string): void => {
  let caught: unknown;
  let threw = false;
  try {
    fn();
  } catch (error) {
    threw = true;
    caught = error;
  }
  expect(threw).toBe(true);
  expect(caught).toBeInstanceOf(SceneError);
  expect((caught as SceneError).code).toBe(code);
};

describe("registryView — C-02 identity derived, never restated", () => {
  it("accepts the shipped registry against the C-11 five-node contract", () => {
    const registry = loadProjectRegistry();
    expect(() => validateRegistryStructures(registry)).not.toThrow();
    expect([...REQUIRED_STRUCTURE_IDS]).toEqual(["HEART", "AORTA", "LAD", "LCX", "RCA"]);
    expect(registry.structures.map((structure) => structure.id).sort()).toEqual(
      [...REQUIRED_STRUCTURE_IDS].sort()
    );
  });

  it("rejects a missing required structure", () => {
    const registry = makeRegistry();
    registry.structures = registry.structures.filter((structure) => structure.id !== "AORTA");
    expectSceneError(() => validateRegistryStructures(registry), "INVALID_REGISTRY_STRUCTURES");
  });

  it("rejects an extra structure (the C-11 node map has exactly five keys)", () => {
    const registry = makeRegistry();
    registry.structures = [
      ...registry.structures,
      {
        id: "LAD_D1",
        label: "First diagonal",
        meshNode: "LAD_D1",
        cameraPreset: "LAD",
        schematicPath: null
      }
    ];
    expectSceneError(() => validateRegistryStructures(registry), "INVALID_REGISTRY_STRUCTURES");
  });

  it("rejects an empty meshNode", () => {
    const registry = makeRegistry();
    registry.structures[0].meshNode = "   ";
    expectSceneError(() => validateRegistryStructures(registry), "INVALID_REGISTRY_STRUCTURES");
  });

  it("derives vessel ids from vessel targets, in registry order", () => {
    expect(vesselStructureIds(loadProjectRegistry())).toEqual(["LAD", "LCX", "RCA"]);
    expect(vesselStructureIds(makeRegistry())).toEqual(["LAD", "LCX", "RCA"]);
  });

  it("fails loudly when a vessel target loses its structure link", () => {
    const registry = makeRegistry();
    registry.targets[2].structureId = null;
    expectSceneError(() => vesselStructureIds(registry), "REGISTRY_VESSEL_MISMATCH");
  });

  it("fails loudly when a vessel target links to an unknown structure", () => {
    const registry = makeRegistry();
    registry.targets[3].structureId = "CX";
    expectSceneError(() => vesselStructureIds(registry), "REGISTRY_VESSEL_MISMATCH");
  });

  it("derives neutrality from the absence of a vessel target link", () => {
    const registry = loadProjectRegistry();
    expect(isNeutralStructure("HEART", registry)).toBe(true);
    expect(isNeutralStructure("AORTA", registry)).toBe(true);
    expect(isNeutralStructure("LAD", registry)).toBe(false);
    expect(isNeutralStructure("LCX", registry)).toBe(false);
    expect(isNeutralStructure("RCA", registry)).toBe(false);
  });

  it("maps camera presets to C-11 camera targets", () => {
    expect(cameraTargetFromPreset("Overview")).toBe("overview");
    expect(cameraTargetFromPreset("overview")).toBe("overview");
    expect(cameraTargetFromPreset("LAD")).toBe("LAD");
    expect(cameraTargetFromPreset("lcx")).toBe("LCX");
    expect(cameraTargetFromPreset("RCA")).toBe("RCA");
    // CAD and anything unknown fly to the neutral overview (no anatomy to fly to).
    expect(cameraTargetFromPreset("CAD")).toBe("overview");
    expect(cameraTargetFromPreset("not-a-preset")).toBe("overview");

    const registry = loadProjectRegistry();
    expect(cameraTargetForStructure(registry, "HEART")).toBe("overview");
    expect(cameraTargetForStructure(registry, "AORTA")).toBe("overview");
    expect(cameraTargetForStructure(registry, "LCX")).toBe("LCX");
  });

  it("resolves structures by registry id and rejects unknown ids", () => {
    const registry = loadProjectRegistry();
    expect(structureById(registry, "RCA").meshNode).toBe("RCA");
    expect(isRequiredStructureId("LAD")).toBe(true);
    expect(isRequiredStructureId("LAD_D1")).toBe(false);
  });
});
