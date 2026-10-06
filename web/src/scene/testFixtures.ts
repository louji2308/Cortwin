import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type {
  RegistrySlice,
  SceneEvaluationSlice,
  SceneStateInput
} from "./types";

/**
 * Test-only fixtures for `web/src/scene/**`. Not imported by any runtime
 * module (it reads the filesystem), so it never enters the browser bundle.
 *
 * `loadProjectRegistry()` reads the REAL `config/registry.json` read-only, so
 * the correspondence tests assert against the shipped identity authority rather
 * than a private copy of it. `makeRegistry()` builds a small synthetic registry
 * for the mutation cases (missing/extra structure, broken vessel chain).
 */

export function loadProjectRegistry(): RegistrySlice {
  const url = new URL("../../../config/registry.json", import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), "utf8")) as RegistrySlice;
}

export function makeRegistry(): RegistrySlice {
  return {
    structures: [
      { id: "HEART", label: "Heart", meshNode: "HEART", cameraPreset: "Overview", schematicPath: null },
      { id: "AORTA", label: "Aorta", meshNode: "AORTA", cameraPreset: "Overview", schematicPath: null },
      { id: "LAD", label: "LAD", meshNode: "LAD", cameraPreset: "LAD", schematicPath: null },
      { id: "LCX", label: "LCX", meshNode: "LCX", cameraPreset: "LCX", schematicPath: null },
      { id: "RCA", label: "RCA", meshNode: "RCA", cameraPreset: "RCA", schematicPath: null }
    ],
    targets: [
      { id: "CAD", label: "CAD", kind: "overall", modelKey: "CAD", structureId: null },
      { id: "LAD", label: "LAD", kind: "vessel", modelKey: "LAD", structureId: "LAD" },
      { id: "LCX", label: "LCX", kind: "vessel", modelKey: "LCX", structureId: "LCX" },
      { id: "RCA", label: "RCA", kind: "vessel", modelKey: "RCA", structureId: "RCA" }
    ]
  };
}

/** Final_demo §4.2 wireframe values: LAD 76% ▲, LCX 31% ▨, RCA 18% △. */
export function makeEvaluation(
  probabilities: Record<"LAD" | "LCX" | "RCA", number> = { LAD: 0.76, LCX: 0.31, RCA: 0.18 },
  decisions: Record<"LAD" | "LCX" | "RCA", "above" | "below" | "indeterminate"> = {
    LAD: "above",
    LCX: "indeterminate",
    RCA: "below"
  }
): SceneEvaluationSlice {
  return {
    targets: {
      LAD: { probability: probabilities.LAD, decision: decisions.LAD },
      LCX: { probability: probabilities.LCX, decision: decisions.LCX },
      RCA: { probability: probabilities.RCA, decision: decisions.RCA }
    }
  };
}

export function makeState(
  overrides: {
    eval?: { current: SceneEvaluationSlice | null };
    selection?: SceneStateInput["selection"];
    view?: Partial<SceneStateInput["view"]>;
  } = {}
): SceneStateInput {
  return {
    eval: overrides.eval ?? { current: makeEvaluation() },
    selection: overrides.selection ?? { targetId: null, hovered: null },
    view: {
      cameraPreset: "overview",
      qualityTier: "Q0",
      reducedMotion: false,
      ...overrides.view
    }
  };
}

/** A loaded-glTF fake for loader-injection tests: name → node or null. */
export function makeFakeGltf(present: readonly string[]): {
  getObjectByName(name: string): object | null;
} {
  const nodes = new Map(present.map((name) => [name, { name }]));
  return {
    getObjectByName(name: string): object | null {
      return nodes.get(name) ?? null;
    }
  };
}
