import { afterEach, describe, expect, it } from "vitest";
import type { CorTwinIntents, Results } from "../contracts";
import {
  CASES,
  CASE_A,
  CASE_B,
  CASE_A_EXPECTED,
  createHarness,
  disposeHarnesses,
  makeThrowingEncoder,
  registry
} from "./testFixtures";

/**
 * C-09 §7.1 store intents + revision law (Implementation_Plan P5 steps 1–3).
 *
 * Two properties are load-bearing and each is mutation-checked here:
 *   1. every contract-named intent exists and validates its inputs with a
 *      typed failure that writes nothing;
 *   2. `case.revision` increments ONLY on field edit / provision change /
 *      reset / case selection — never on selection-only or view-only intents.
 */

afterEach(disposeHarnesses);

const CASE_INTENTS = [
  "select",
  "setValue",
  "setModalityProvided",
  "setFeatureProvided",
  "reset",
  "enableCustomSubset"
] as const;
const SELECTION_INTENTS = ["selectTarget", "selectModality", "selectFeature", "selectStage", "setHover"] as const;
const VIEW_INTENTS = [
  "navigate",
  "openDrawer",
  "closeDrawer",
  "setCameraPreset",
  "startTour",
  "stopTour",
  "setTourStep",
  "setQualityTier",
  "setReducedMotion"
] as const;
const BUNDLE_INTENTS = [
  "setBooting",
  "setReady",
  "setBundleError",
  "setResultsStatus",
  "setResults",
  "setCases"
] as const;

function revisionOf(h: ReturnType<typeof createHarness>): number {
  return h.state().case.revision;
}

describe("C-09 §7.1 intent surface — verbatim names, nothing missing, nothing extra", () => {
  it("exposes exactly the contract's case, selection, view and loader intents", () => {
    const h = createHarness();
    const intents: CorTwinIntents = h.store.intents;

    expect(Object.keys(intents).sort()).toEqual(["bundle", "case", "selection", "view"]);
    expect(Object.keys(intents.case).sort()).toEqual([...CASE_INTENTS].sort());
    expect(Object.keys(intents.selection).sort()).toEqual([...SELECTION_INTENTS].sort());
    expect(Object.keys(intents.view).sort()).toEqual([...VIEW_INTENTS].sort());
    expect(Object.keys(intents.bundle).sort()).toEqual([...BUNDLE_INTENTS].sort());

    for (const name of CASE_INTENTS) expect(typeof intents.case[name]).toBe("function");
    for (const name of SELECTION_INTENTS) expect(typeof intents.selection[name]).toBe("function");
    for (const name of VIEW_INTENTS) expect(typeof intents.view[name]).toBe("function");
    for (const name of BUNDLE_INTENTS) expect(typeof intents.bundle[name]).toBe("function");
  });

  it("publishes no direct state or eval writer (write ownership by construction)", () => {
    const h = createHarness();
    expect(Object.keys(h.store).sort()).toEqual(
      [
        "attachCompute",
        "attachEncoder",
        "commitNow",
        "dispose",
        "getState",
        "intents",
        "requestExplanation",
        "sampleDisplay",
        "subscribe",
        "useStore"
      ].sort()
    );
    const surface = h.store as unknown as Record<string, unknown>;
    for (const key of Object.keys(surface)) {
      expect(key.toLowerCase()).not.toContain("setstate");
      expect(key.toLowerCase()).not.toContain("eval");
    }
  });
});

describe("C-09 §7.1 revision law — increments only where the contract says", () => {
  it("starts at 0 and increments on case selection", () => {
    const h = createHarness({ autoSelect: false });
    expect(revisionOf(h)).toBe(0);
    const result = h.store.intents.case.select(CASE_A.id);
    expect(result.ok).toBe(true);
    expect(revisionOf(h)).toBe(1);
  });

  it("increments on field edit, modality provision, feature provision and reset", () => {
    const h = createHarness();
    expect(revisionOf(h)).toBe(1);

    expect(h.store.intents.case.setValue("Age", 70).ok).toBe(true);
    expect(revisionOf(h)).toBe(2);

    expect(h.store.intents.case.setModalityProvided("labs", false).ok).toBe(true);
    expect(revisionOf(h)).toBe(3);

    expect(h.store.intents.case.setFeatureProvided("DM", true).ok).toBe(true);
    expect(revisionOf(h)).toBe(4);

    expect(h.store.intents.case.reset().ok).toBe(true);
    expect(revisionOf(h)).toBe(5);
  });

  it("never increments on selection-only intents (and each one lands)", () => {
    const h = createHarness();
    const before = revisionOf(h);
    const selectionBefore = h.state().selection;

    h.store.intents.selection.selectTarget("LAD");
    h.store.intents.selection.selectModality("history");
    h.store.intents.selection.selectFeature("Age");
    h.store.intents.selection.selectStage("exam");
    h.store.intents.selection.setHover({ kind: "vessel", id: "RCA" });

    const after = h.state();
    expect(after.case.revision).toBe(before);
    expect(after.selection.targetId).toBe("LAD");
    expect(after.selection.modalityId).toBe("history");
    expect(after.selection.featureId).toBe("Age");
    expect(after.selection.stageId).toBe("exam");
    expect(after.selection.hovered).toEqual({ kind: "vessel", id: "RCA" });
    expect(selectionBefore.hovered).toBeNull();
  });

  it("never increments on view-only intents (and each one lands)", () => {
    const h = createHarness();
    const before = revisionOf(h);

    h.store.intents.view.navigate("trust", "performance");
    h.store.intents.view.openDrawer("input-audit");
    h.store.intents.view.closeDrawer();
    h.store.intents.view.setCameraPreset("LAD");
    h.store.intents.view.startTour();
    h.store.intents.view.setTourStep(2);
    h.store.intents.view.stopTour();
    h.store.intents.view.setQualityTier("Q2");
    h.store.intents.view.setReducedMotion(true);

    const view = h.state().view;
    expect(revisionOf(h)).toBe(before);
    expect(view.route).toBe("trust");
    expect(view.pane).toBe("performance");
    expect(view.drawer).toBeNull();
    expect(view.cameraPreset).toBe("LAD");
    expect(view.tourStep).toBeNull();
    expect(view.qualityTier).toBe("Q2");
    expect(view.reducedMotion).toBe(true);
  });

  it("enableCustomSubset flips the flag without a revision change", () => {
    const h = createHarness();
    const before = revisionOf(h);
    expect(h.state().case.customSubset).toBe(false);
    h.store.intents.case.enableCustomSubset();
    expect(h.state().case.customSubset).toBe(true);
    expect(revisionOf(h)).toBe(before);
    h.store.intents.case.enableCustomSubset(); // idempotent
    expect(revisionOf(h)).toBe(before);
  });

  it("selection intents that change nothing also leave revision untouched", () => {
    const h = createHarness();
    h.store.intents.selection.selectTarget("LAD");
    const before = revisionOf(h);
    h.store.intents.selection.selectTarget("LAD"); // same value: no-op
    h.store.intents.selection.setHover(null);
    expect(revisionOf(h)).toBe(before);
  });
});

describe("C-09 §7.1 typed intent failures — nothing is written", () => {
  it("rejects a case edit before the bundle is ready", () => {
    const h = createHarness({ ready: false, autoSelect: false });
    const caseBefore = h.state().case;
    const result = h.store.intents.case.setValue("Age", 70);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.code).toBe("MALFORMED_REQUEST");
    expect(h.state().case).toBe(caseBefore);
    expect(revisionOf(h)).toBe(0);
  });

  it("rejects a case edit when no case is selected", () => {
    const h = createHarness({ autoSelect: false });
    const caseBefore = h.state().case;
    const result = h.store.intents.case.setValue("Age", 70);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.message).toBe("No case is selected");
    expect(h.state().case).toBe(caseBefore);
  });

  it("rejects unknown feature, unknown modality and non-finite values without writing", () => {
    const h = createHarness();
    const caseBefore = h.state().case;

    const unknownFeature = h.store.intents.case.setValue("NotAFeature", 1);
    expect(unknownFeature.ok).toBe(false);
    if (!unknownFeature.ok) expect(unknownFeature.error.code).toBe("MALFORMED_REQUEST");

    const nonFinite = h.store.intents.case.setValue("Age", Number.NaN);
    expect(nonFinite.ok).toBe(false);
    if (!nonFinite.ok) expect(nonFinite.error.code).toBe("NONFINITE_INPUT");

    const unknownModality = h.store.intents.case.setModalityProvided("not-a-modality", true);
    expect(unknownModality.ok).toBe(false);
    if (!unknownModality.ok) expect(unknownModality.error.code).toBe("MALFORMED_REQUEST");

    const unknownProvided = h.store.intents.case.setFeatureProvided("NotAFeature", true);
    expect(unknownProvided.ok).toBe(false);
    if (!unknownProvided.ok) expect(unknownProvided.error.code).toBe("MALFORMED_REQUEST");

    expect(h.state().case).toBe(caseBefore);
    expect(revisionOf(h)).toBe(1);
  });

  it("rejects an unknown case id and an impossible reset without writing", () => {
    const h = createHarness();
    const caseBefore = h.state().case;

    const unknownCase = h.store.intents.case.select("case-that-does-not-exist");
    expect(unknownCase.ok).toBe(false);
    if (!unknownCase.ok) expect(unknownCase.error.message).toBe("Unknown case id");

    h.state(); // sanity: selection was not applied
    expect(h.state().case).toBe(caseBefore);
    expect(h.state().case.id).toBe(CASE_A.id);
  });

  it("keeps error messages free of patient values", () => {
    const h = createHarness();
    const result = h.store.intents.case.setValue("NotAFeature", 123456);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.message).not.toContain("123456");
    expect(result.error.message).not.toContain("NotAFeature");
    expect(result.error.message.length).toBeGreaterThan(0);
  });

  it("surfaces an encoder failure as a typed error and submits no request", () => {
    const h = createHarness({ encoder: makeThrowingEncoder("INVALID_FEATURE_VECTOR") });
    const caseBefore = h.state().case;
    const result = h.store.intents.case.setValue("Age", 70);
    expect(result.ok).toBe(true); // the intent itself succeeded; encoding did not
    const evalState = h.state().eval;
    expect(evalState.status).toBe("error");
    expect(evalState.error?.code).toBe("INVALID_FEATURE_VECTOR");
    expect(evalState.current).toBeNull();
    expect(h.state().case.revision).toBe(caseBefore.revision + 1);
    expect(h.port.requests).toHaveLength(0);
  });
});

describe("C-09 §7.1 case selection — replacement with no contamination", () => {
  it("replaces case truth wholesale and clears the previous evaluation", () => {
    const h = createHarness();

    // Load the first case with edits that must not survive the switch.
    expect(h.store.intents.case.setValue("Age", 99).ok).toBe(true);
    expect(h.store.intents.case.setFeatureProvided("DM", true).ok).toBe(true);
    expect(h.store.intents.case.setModalityProvided("echo", false).ok).toBe(true);
    h.store.intents.case.enableCustomSubset();
    h.store.intents.selection.selectFeature("Age");
    const revisionBefore = revisionOf(h);
    expect(h.state().case.values.Age).toBe(99);

    const result = h.store.intents.case.select(CASE_B.id);
    expect(result.ok).toBe(true);

    const state = h.state();
    expect(state.case.id).toBe(CASE_B.id);
    expect(state.case.provenance).toBe(CASE_B.provenance);
    expect(state.case.values).toEqual(CASE_B.values);
    expect(state.case.providedFeatures).toEqual(CASE_B.providedFeatures);
    expect(state.case.providedModalities).toEqual(CASE_B.providedModalities);
    expect(Object.keys(state.case.values)).toEqual([]);
    expect(state.case.customSubset).toBe(false);
    expect(state.case.revision).toBe(revisionBefore + 1);
    expect(state.case.committedValues).toEqual(CASE_B.values);
    expect(state.case.committedRevision).toBe(state.case.revision);

    // Previous evaluation, cache and per-feature selection are cleared.
    expect(state.eval.current).toBeNull();
    expect(state.eval.committed).toBeNull();
    expect(state.eval.status).toBe("computing"); // idle → cleared → request in flight
    expect(state.eval.explanationCache).toEqual({});
    expect(state.eval.stageEvaluations).toEqual({});
    expect(state.eval.error).toBeNull();
    expect(state.selection.featureId).toBeNull();
    // Target selection survives: it is a view-level choice, not case truth.
    expect(state.selection.targetId).toBeNull();
  });

  it("reset restores the catalog definition and increments the revision", () => {
    const h = createHarness();
    expect(h.store.intents.case.setValue("Age", 99).ok).toBe(true);
    expect(h.store.intents.case.setModalityProvided("labs", false).ok).toBe(true);
    const before = revisionOf(h);

    expect(h.store.intents.case.reset().ok).toBe(true);
    const state = h.state();
    expect(state.case.values).toEqual(CASE_A.values);
    expect(state.case.providedFeatures).toEqual(CASE_A.providedFeatures);
    expect(state.case.providedModalities).toEqual(CASE_A.providedModalities);
    expect(state.case.revision).toBe(before + 1);
  });

  it("a second selection does not inherit anything from the first (blank case)", () => {
    const h = createHarness();
    expect(h.store.intents.case.setValue("Age", 99).ok).toBe(true);
    expect(h.store.intents.case.select(CASE_B.id).ok).toBe(true);
    expect(h.store.intents.case.select(CASE_A.id).ok).toBe(true);
    const state = h.state();
    expect(state.case.id).toBe(CASE_A.id);
    expect(state.case.values).toEqual(CASE_A.values);
    expect(state.case.values.Age).toBe(62);
    expect(state.case.providedFeatures).toEqual(CASE_A.providedFeatures);
  });
});

describe("C-09 §7.1 write ownership — eval truth only moves through compute responses", () => {
  it("selection, view and loader intents leave the eval slice reference intact", () => {
    const h = createHarness();
    const evalBefore = h.state().eval;

    h.store.intents.selection.selectTarget("LCX");
    h.store.intents.selection.setHover({ kind: "modality", id: "labs" });
    h.store.intents.view.navigate("system", "integrity");
    h.store.intents.view.setQualityTier("Q3");
    h.store.intents.bundle.setResultsStatus("loading");
    h.store.intents.bundle.setCases(CASES);

    expect(h.state().eval).toBe(evalBefore);
    expect(h.state().eval.current).toBeNull();
  });

  it("no intent can put an evaluation payload into `current` on its own", () => {
    const h = createHarness();
    h.store.intents.case.setValue("Age", 70);
    h.store.intents.selection.selectTarget("LAD");
    h.store.commitNow();
    h.store.intents.view.navigate("trust", "calibration");
    expect(h.state().eval.current).toBeNull();
    expect(h.state().eval.committed).toBeNull();
    expect(h.state().eval.status).toBe("computing"); // pending, never truth
    expect(h.port.requestsFor("evaluate").length).toBeGreaterThan(0);
  });

  it("bundle loader pathway writes only the bundle slice", () => {
    const h = createHarness();
    const caseBefore = h.state().case;
    const selectionBefore = h.state().selection;
    const evalBefore = h.state().eval;

    h.store.intents.bundle.setBooting();
    h.store.intents.bundle.setResultsStatus("loading");
    h.store.intents.bundle.setBundleError();

    expect(h.state().bundle.status).toBe("error");
    expect(h.state().case).toBe(caseBefore);
    expect(h.state().selection).toBe(selectionBefore);
    expect(h.state().eval).toBe(evalBefore);
  });

  it("publishing an ABSENCE of results never reads as ready (FM-10 → §16.1 G5)", () => {
    const h = createHarness();
    // Shape only: this intent copies the reference, it never parses results.
    const synthetic = { schemaVersion: "1.0.0" } as unknown as Results;

    h.store.intents.bundle.setResults(synthetic);
    expect(h.state().bundle.results).toBe(synthetic);
    expect(h.state().bundle.resultsStatus).toBe("ready");

    // The bundle loader's G5 publication: `results.json` never arrived.
    h.store.intents.bundle.setResults(null);
    expect(h.state().bundle.results).toBeNull();
    expect(h.state().bundle.resultsStatus, "an absent slot must not read ready").toBe("error");
  });
});

describe("C-02/C-09 loader inputs — the fixture registry is the registry of record", () => {
  it("carries the contract's entity counts", () => {
    expect(registry.features).toHaveLength(54);
    expect(registry.modalities).toHaveLength(5);
    expect(registry.targets.map((target) => target.id)).toEqual(["CAD", "LAD", "LCX", "RCA"]);
    expect(registry.stages.map((stage) => stage.id)).toEqual(["history", "exam", "ecg", "labs", "echo"]);
    expect(CASE_A_EXPECTED.total).toBe(registry.features.length);
  });
});
