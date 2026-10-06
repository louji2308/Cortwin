import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Registry, TargetId } from "../contracts";
import { RegistryError } from "./errors";
import {
  VESSEL_TARGET_IDS,
  cameraPresetForVessel,
  cardForTarget,
  identityChainTable,
  identityForVessel,
  meshNodeForVessel,
  modelKeyForTarget,
  structureForTarget,
  structureForVessel,
  targetForVessel,
  vesselForTarget
} from "./identityChain";
import { auditRegistry } from "./validateRegistry";

const registryPath = fileURLToPath(new URL("../../../config/registry.json", import.meta.url));
const registry: Registry = JSON.parse(readFileSync(registryPath, "utf8")) as Registry;

function cloneRegistry(): Registry {
  return JSON.parse(JSON.stringify(registry)) as Registry;
}

function expectChainBroken(run: () => unknown): RegistryError {
  let thrown: unknown = null;
  try {
    run();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(RegistryError);
  const issue = (thrown as RegistryError).issues[0];
  expect(issue.code).toBe("IDENTITY_CHAIN_BROKEN");
  return thrown as RegistryError;
}

describe("C-02 identity chain — one row per vessel, resolved only from registry fields", () => {
  it("builds exactly the three vessel rows", () => {
    const table = identityChainTable(registry);
    expect(Object.keys(table).sort()).toEqual(["LAD", "LCX", "RCA"]);
    expect([...VESSEL_TARGET_IDS]).toEqual(["LAD", "LCX", "RCA"]);
  });

  for (const vesselId of VESSEL_TARGET_IDS) {
    it(`${vesselId}: vessel → target → model key → structure → mesh node → camera → card holds`, () => {
      const target = targetForVessel(registry, vesselId);
      const structure = structureForVessel(registry, vesselId);
      const row = identityForVessel(registry, vesselId);

      expect(target.kind).toBe("vessel");
      expect(target.structureId).toBe(vesselId);
      expect(vesselForTarget(registry, target.id)).toBe(vesselId);
      expect(modelKeyForTarget(registry, target.id)).toBe(target.modelKey);
      expect(structure.id).toBe(vesselId);
      expect(structureForTarget(registry, target.id)).toBe(structure);
      expect(meshNodeForVessel(registry, vesselId)).toBe(structure.meshNode);
      expect(cameraPresetForVessel(registry, vesselId)).toBe(structure.cameraPreset);

      const card = cardForTarget(registry, target.id);
      expect(card.label).toBe(target.label);
      expect(card.labelDefinition).toBe(target.labelDefinition);

      expect(row).toEqual({
        vesselId,
        targetId: target.id,
        modelKey: target.modelKey,
        structureId: structure.id,
        meshNode: structure.meshNode,
        cameraPreset: structure.cameraPreset,
        cardLabel: card.label,
        cardLabelDefinition: card.labelDefinition,
        explanationTargetId: target.id,
        trustTargetId: target.id
      });
    });
  }

  it("the overall target has no vessel, no structure, and its own card identity", () => {
    expect(vesselForTarget(registry, "CAD")).toBeNull();
    expect(structureForTarget(registry, "CAD")).toBeNull();
    expect(modelKeyForTarget(registry, "CAD")).toBe("CAD");
    const card = cardForTarget(registry, "CAD");
    expect(card.label).toBe(registry.targets[0].label);
    expect(card.labelDefinition).toBe(registry.targets[0].labelDefinition);
  });

  it("explanation and Trust targets are the target id itself — never a second map", () => {
    for (const vesselId of VESSEL_TARGET_IDS) {
      const row = identityForVessel(registry, vesselId);
      expect(row.explanationTargetId).toBe(row.targetId);
      expect(row.trustTargetId).toBe(row.targetId);
      expect(row.structureId).toBe(row.vesselId);
      expect(row.meshNode).toBe(row.structureId);
    }
  });

  it("mesh nodes stay inside the five named C-11 nodes", () => {
    for (const vesselId of VESSEL_TARGET_IDS) {
      expect(["HEART", "AORTA", "LAD", "LCX", "RCA"]).toContain(
        meshNodeForVessel(registry, vesselId)
      );
    }
  });
});

describe("C-02 identity chain — doctored registries fail loudly, never by default", () => {
  it("vessel target with its structure link removed breaks vessel → target", () => {
    const doctored = cloneRegistry();
    doctored.targets[1].structureId = null;
    expectChainBroken(() => targetForVessel(doctored, "LAD"));
    expectChainBroken(() => identityChainTable(doctored));
  });

  it("vessel target linked to an unknown structure breaks vessel → target", () => {
    const doctored = cloneRegistry();
    doctored.targets[1].structureId = "FEMORAL";
    expectChainBroken(() => targetForVessel(doctored, "LAD"));
  });

  it("removed structure row breaks structure and mesh node hops", () => {
    const doctored = cloneRegistry();
    doctored.structures = doctored.structures.filter((structure) => structure.id !== "LAD");
    expectChainBroken(() => structureForVessel(doctored, "LAD"));
    expectChainBroken(() => meshNodeForVessel(doctored, "LAD"));
    expectChainBroken(() => identityChainTable(doctored));
  });

  it("empty mesh node breaks the mesh node hop", () => {
    const doctored = cloneRegistry();
    doctored.structures[2].meshNode = "";
    expectChainBroken(() => meshNodeForVessel(doctored, "LAD"));
  });

  it("empty model key breaks the model key hop", () => {
    const doctored = cloneRegistry();
    doctored.targets[1].modelKey = "";
    expectChainBroken(() => modelKeyForTarget(doctored, "LAD"));
  });

  it("unknown target id breaks the target → vessel hop", () => {
    expectChainBroken(() => vesselForTarget(registry, "ECT" as TargetId));
    expectChainBroken(() => cardForTarget(registry, "ECT" as TargetId));
  });

  it("two vessel targets sharing one structure is caught by the validator first", () => {
    const doctored = cloneRegistry();
    doctored.targets[1].structureId = "RCA";
    const codes = auditRegistry(doctored).map((entry) => entry.code);
    expect(codes).toContain("VESSEL_STRUCTURE_SHARED");
  });

  it("the unmodified registry never breaks any hop", () => {
    for (const vesselId of VESSEL_TARGET_IDS) {
      expect(() => identityForVessel(registry, vesselId)).not.toThrow();
    }
    expect(() => identityChainTable(registry)).not.toThrow();
  });
});
