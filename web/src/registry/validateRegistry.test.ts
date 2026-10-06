import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Registry } from "../contracts";
import { RegistryError } from "./errors";
import { auditRegistry, parseRegistry } from "./validateRegistry";

const registryPath = fileURLToPath(new URL("../../../config/registry.json", import.meta.url));
const rawRegistry: unknown = JSON.parse(readFileSync(registryPath, "utf8"));

function cloneRegistry(): Registry {
  return JSON.parse(JSON.stringify(rawRegistry)) as Registry;
}

function cloneRaw(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(rawRegistry)) as Record<string, unknown>;
}

function codesOf(raw: unknown): string[] {
  return auditRegistry(raw).map((entry) => entry.code);
}

function expectRejectsWithCode(raw: unknown, code: string): void {
  const issues = auditRegistry(raw);
  expect(issues.map((entry) => entry.code)).toContain(code);
  let thrown: unknown = null;
  try {
    parseRegistry(raw);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(RegistryError);
  expect((thrown as RegistryError).issues.map((entry) => entry.code)).toContain(code);
}

describe("C-02 published registry — accepted as the sole correspondence authority", () => {
  it("passes shape and referential integrity with zero issues", () => {
    expect(auditRegistry(rawRegistry)).toEqual([]);
  });

  it("parses to the contract collections and required entity counts", () => {
    const registry = parseRegistry(rawRegistry);
    expect(registry.schemaVersion).toBe("1.0.0");
    expect(registry.modalities).toHaveLength(5);
    expect(registry.features).toHaveLength(54);
    expect(registry.targets.map((target) => target.id)).toEqual(["CAD", "LAD", "LCX", "RCA"]);
    expect(registry.structures.map((structure) => structure.id)).toEqual([
      "HEART",
      "AORTA",
      "LAD",
      "LCX",
      "RCA"
    ]);
    expect(registry.stages.map((stage) => stage.id)).toEqual([
      "history",
      "exam",
      "ecg",
      "labs",
      "echo"
    ]);
  });

  it("carries the forbidden input columns and the derived BMI feature", () => {
    const registry = parseRegistry(rawRegistry);
    expect(registry.forbiddenInputColumns.map((column) => column.id)).toEqual([
      "LAD",
      "LCX",
      "RCA",
      "Cath",
      "Exertional CP"
    ]);
    const bmi = registry.features.find((feature) => feature.id === "BMI");
    expect(bmi?.derived?.inputs).toEqual(["Weight", "Length"]);
  });
});

type IntegrityCase = { name: string; code: string; edit: (registry: Registry) => void };

const INTEGRITY_CASES: IntegrityCase[] = [
  {
    name: "a duplicated feature id",
    code: "DUPLICATE_ID",
    edit: (registry) => {
      registry.features[1].id = registry.features[0].id;
    }
  },
  {
    name: "a feature pointing at an unknown modality",
    code: "UNKNOWN_MODALITY",
    edit: (registry) => {
      registry.features[0].modality = "vitals";
    }
  },
  {
    name: "a feature count other than 54",
    code: "FEATURE_COUNT",
    edit: (registry) => {
      registry.features.pop();
    }
  },
  {
    name: "a modality whose feature count drifts from the contract table",
    code: "MODALITY_FEATURE_COUNT",
    edit: (registry) => {
      registry.features[0].modality = "exam";
    }
  },
  {
    name: "an extra modality outside the contract label table",
    code: "UNEXPECTED_MODALITY",
    edit: (registry) => {
      registry.modalities.push({ id: "vitals", label: "Vitals", order: 5 });
    }
  },
  {
    name: "a missing target",
    code: "TARGET_SET",
    edit: (registry) => {
      registry.targets = registry.targets.filter((target) => target.id !== "LAD");
    }
  },
  {
    name: "a target whose kind contradicts its id",
    code: "TARGET_KIND",
    edit: (registry) => {
      registry.targets[0].kind = "vessel";
    }
  },
  {
    name: "an empty target model key",
    code: "TARGET_MODEL_KEY",
    edit: (registry) => {
      registry.targets[1].modelKey = "";
    }
  },
  {
    name: "two targets sharing one model key",
    code: "TARGET_MODEL_KEY",
    edit: (registry) => {
      registry.targets[1].modelKey = registry.targets[3].modelKey;
    }
  },
  {
    name: "a vessel target without a structure link",
    code: "VESSEL_STRUCTURE_MISSING",
    edit: (registry) => {
      registry.targets[1].structureId = null;
    }
  },
  {
    name: "two vessel targets claiming one structure",
    code: "VESSEL_STRUCTURE_SHARED",
    edit: (registry) => {
      registry.targets[1].structureId = "RCA";
    }
  },
  {
    name: "a missing named structure",
    code: "STRUCTURE_SET",
    edit: (registry) => {
      registry.structures = registry.structures.filter((structure) => structure.id !== "AORTA");
    }
  },
  {
    name: "a structure whose mesh node leaves the named-node contract",
    code: "STRUCTURE_MESH_NODE",
    edit: (registry) => {
      registry.structures[2].meshNode = "BRACHIAL";
    }
  },
  {
    name: "a forbidden column re-entering the feature set",
    code: "FORBIDDEN_OVERLAP",
    edit: (registry) => {
      registry.forbiddenInputColumns.push({ id: "Age", reason: "injected" });
    }
  },
  {
    name: "a display group member that does not exist",
    code: "DISPLAY_GROUP_UNKNOWN_FEATURE",
    edit: (registry) => {
      registry.displayGroups[0].features.push("Ghost Feature");
    }
  },
  {
    name: "a non-monotonic stage order",
    code: "STAGE_ORDER_NOT_MONOTONIC",
    edit: (registry) => {
      registry.stages[1].order = registry.stages[0].order;
    }
  },
  {
    name: "a stage list that is not the modality prefix",
    code: "STAGE_PREFIX_INVALID",
    edit: (registry) => {
      registry.stages[2].modalitiesThrough = ["history", "labs"];
    }
  },
  {
    name: "a derived feature referencing an unknown input",
    code: "DERIVED_INPUT_UNKNOWN",
    edit: (registry) => {
      const bmi = registry.features.find((feature) => feature.id === "BMI");
      if (bmi === undefined || bmi.derived === null) throw new Error("fixture lost BMI");
      bmi.derived.inputs = ["Weight", "Ghost"];
    }
  }
];

describe("C-02 referential integrity — every rule rejects a doctored registry", () => {
  for (const testCase of INTEGRITY_CASES) {
    it(`rejects ${testCase.name} with ${testCase.code} and throws on parse`, () => {
      const registry = cloneRegistry();
      testCase.edit(registry);
      expectRejectsWithCode(registry, testCase.code);
    });
  }
});

type ShapeCase = { name: string; code: string; edit: (raw: Record<string, unknown>) => void };

const SHAPE_CASES: ShapeCase[] = [
  {
    name: "a foreign schema version",
    code: "SCHEMA_VERSION",
    edit: (raw) => {
      raw.schemaVersion = "9.9.9";
    }
  },
  {
    name: "a collection that is not an array",
    code: "MALFORMED_COLLECTION",
    edit: (raw) => {
      raw.features = {};
    }
  },
  {
    name: "a non-object entry",
    code: "MALFORMED_ENTRY",
    edit: (raw) => {
      (raw.targets as unknown[])[0] = 42;
    }
  },
  {
    name: "an unknown feature kind",
    code: "MALFORMED_FIELD",
    edit: (raw) => {
      ((raw.features as Array<Record<string, unknown>>)[0]).kind = "weird";
    }
  },
  {
    name: "an encoding outside the three published types",
    code: "ENCODING_MALFORMED",
    edit: (raw) => {
      const features = raw.features as Array<Record<string, unknown>>;
      const categorical = features.find(
        (feature) => (feature.encoding as { type: string }).type === "map"
      );
      if (categorical === undefined) throw new Error("fixture lost a map encoding");
      categorical.encoding = { type: "onehot" };
    }
  },
  {
    name: "an inverted range",
    code: "RANGE_MALFORMED",
    edit: (raw) => {
      ((raw.features as Array<Record<string, unknown>>)[0]).range = { min: 10, max: 1 };
    }
  }
];

describe("C-02 shape layer — malformed artifacts are rejected before integrity runs", () => {
  for (const testCase of SHAPE_CASES) {
    it(`rejects ${testCase.name} with ${testCase.code}`, () => {
      const raw = cloneRaw();
      testCase.edit(raw);
      expectRejectsWithCode(raw, testCase.code);
    });
  }

  it("rejects a non-object document with MALFORMED_JSON", () => {
    expect(codesOf(42)).toEqual(["MALFORMED_JSON"]);
    expect(codesOf("[1,2]")).toEqual(["MALFORMED_JSON"]);
  });

  it("rejects unparseable JSON text with MALFORMED_JSON", () => {
    expect(codesOf("{ not json")).toEqual(["MALFORMED_JSON"]);
  });

  it("reports shape findings only — integrity never runs on an untrustworthy shape", () => {
    const raw = cloneRaw();
    (raw.features as Array<Record<string, unknown>>)[0].kind = "weird";
    raw.targets = ((raw.targets as unknown[]).filter(
      (target) => (target as { id: string }).id !== "LAD"
    ));
    const codes = codesOf(raw);
    expect(codes).toContain("MALFORMED_FIELD");
    expect(codes).not.toContain("TARGET_SET");
  });
});

describe("C-02 collection semantics — every finding, not just the first", () => {
  it("collects multiple independent integrity issues in one audit", () => {
    const registry = cloneRegistry();
    registry.features.pop();
    registry.stages[1].order = registry.stages[0].order;
    const codes = codesOf(registry);
    expect(codes).toContain("FEATURE_COUNT");
    expect(codes).toContain("STAGE_ORDER_NOT_MONOTONIC");
    expect(codes.length).toBeGreaterThanOrEqual(2);
  });

  it("parseRegistry throws one RegistryError carrying every issue", () => {
    const registry = cloneRegistry();
    registry.features.pop();
    registry.structures = registry.structures.filter((structure) => structure.id !== "AORTA");
    let thrown: RegistryError | null = null;
    try {
      parseRegistry(registry);
    } catch (error) {
      thrown = error as RegistryError;
    }
    expect(thrown).toBeInstanceOf(RegistryError);
    const codes = thrown!.issues.map((entry) => entry.code);
    expect(codes).toContain("FEATURE_COUNT");
    expect(codes).toContain("STRUCTURE_SET");
  });
});
