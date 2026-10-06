import { afterEach, describe, expect, it } from "vitest";
import { parseUrl, resolveUrl, serializeUrl, type UrlContext } from "../navigation";
import {
  selectCompletion,
  selectDisplayedCad,
  selectExplanation,
  selectIsStale,
  selectModalityCounts,
  selectSelectedTarget,
  selectUrlState,
  selectVesselIds,
  selectVesselStates
} from "./selectors";
import {
  CASE_A,
  CASE_B,
  CASE_A_EXPECTED,
  createHarness,
  disposeHarnesses,
  evaluationResponse,
  explanationResponse,
  makeEvaluation,
  makeExplanation,
  registry
} from "./testFixtures";

/**
 * C-09 §7.1 selectors + display channel (Implementation_Plan P5 steps 6–8).
 *
 * The properties under test:
 *   - selectors are pure projections of `state` — they never mutate, never
 *     recompute a metric and never read anything but the `Evaluation` payload;
 *   - the display channel carries interpolated presentation numbers only;
 *   - reduced motion collapses the duration to 0 and leaves truth untouched;
 *   - the URL projection carries ids only — share is never derived.
 */

afterEach(disposeHarnesses);

function respondEvaluate(
  h: ReturnType<typeof createHarness>,
  evaluation: ReturnType<typeof makeEvaluation>,
  requestIndex = 0
): void {
  h.port.respond(evaluationResponse(h.evaluateRequest(requestIndex), evaluation));
}

describe("C-09 completion and modality counts", () => {
  it("reports zeros before the registry is loaded", () => {
    const h = createHarness({ ready: false, autoSelect: false });
    expect(selectCompletion(h.state())).toEqual({ provided: 0, total: 0, fraction: 0 });
    expect(selectModalityCounts(h.state())).toEqual([]);
    expect(selectVesselIds(h.state())).toEqual([]);
  });

  it("counts CASE_A's 13 provided features across the registry's 54", () => {
    const h = createHarness();
    const completion = selectCompletion(h.state());
    expect(completion.provided).toBe(CASE_A_EXPECTED.provided);
    expect(completion.total).toBe(54);
    expect(completion.fraction).toBe(CASE_A_EXPECTED.provided / 54);
  });

  it("reports per-modality provided/total in registry order with exact counts", () => {
    const h = createHarness();
    const counts = selectModalityCounts(h.state());
    expect(counts.map((count) => count.modalityId)).toEqual(
      registry.modalities.map((modality) => modality.id)
    );
    expect(counts).toHaveLength(5);
    for (const count of counts) {
      const expected = CASE_A_EXPECTED.byModality[
        count.modalityId as keyof typeof CASE_A_EXPECTED.byModality
      ];
      expect(expected).toBeDefined();
      expect(count.provided).toBe(expected.provided);
      expect(count.total).toBe(expected.total);
      expect(count.fraction).toBe(expected.provided / expected.total);
      expect(count.label).toBe(
        registry.modalities.find((modality) => modality.id === count.modalityId)?.label
      );
    }
  });

  it("tracks provision changes and case switches", () => {
    const h = createHarness();
    expect(h.store.intents.case.setFeatureProvided("Age", false).ok).toBe(true);
    expect(selectCompletion(h.state()).provided).toBe(12);
    expect(selectModalityCounts(h.state())[0].provided).toBe(4);

    expect(h.store.intents.case.select(CASE_B.id).ok).toBe(true);
    expect(selectCompletion(h.state())).toEqual({ provided: 0, total: 54, fraction: 0 });
  });
});

describe("C-09 selected target and registry-derived vessel identity", () => {
  it("reads the selected target straight from the selection slice", () => {
    const h = createHarness();
    expect(selectSelectedTarget(h.state())).toBeNull();
    h.store.intents.selection.selectTarget("LCX");
    expect(selectSelectedTarget(h.state())).toBe("LCX");
  });

  it("derives vessel ids from registry targets, never from a literal list", () => {
    const h = createHarness();
    const vesselIds = selectVesselIds(h.state());
    expect(vesselIds).toEqual(["LAD", "LCX", "RCA"]);
    const fromRegistry = registry.targets
      .filter((target) => target.kind === "vessel")
      .map((target) => target.structureId);
    expect(vesselIds).toEqual(fromRegistry);
  });
});

describe("C-11 vessel visual state — payload values, no colour, no recompute", () => {
  it("is null while there is no evaluation payload", () => {
    const h = createHarness();
    expect(selectVesselStates(h.state())).toBeNull();
  });

  it("copies probability and decision from the payload and layers selection/hover", () => {
    const h = createHarness();
    const evaluation = makeEvaluation(1);
    respondEvaluate(h, evaluation);

    h.store.intents.selection.selectTarget("LAD");
    h.store.intents.selection.setHover({ kind: "vessel", id: "RCA" });
    const vessels = selectVesselStates(h.state());
    expect(vessels).not.toBeNull();
    if (vessels === null) throw new Error("unreachable");

    expect(vessels.LAD.probability).toBe(evaluation.targets.LAD.probability);
    expect(vessels.LCX.probability).toBe(evaluation.targets.LCX.probability);
    expect(vessels.RCA.probability).toBe(evaluation.targets.RCA.probability);
    expect(vessels.LAD.decision).toBe(evaluation.targets.LAD.decision);

    expect(vessels.LAD.selected).toBe(true);
    expect(vessels.LAD.dimmed).toBe(false);
    expect(vessels.LCX.dimmed).toBe(true);
    expect(vessels.RCA.selected).toBe(false);
    expect(vessels.RCA.hovered).toBe(true);
    expect(vessels.LCX.hovered).toBe(false);
  });

  it("selecting a non-vessel target dims nothing and selects nothing", () => {
    const h = createHarness();
    respondEvaluate(h, makeEvaluation(1));
    h.store.intents.selection.selectTarget("CAD");
    const vessels = selectVesselStates(h.state());
    if (vessels === null) throw new Error("expected vessel states");
    expect(vessels.LAD.selected).toBe(false);
    expect(vessels.LCX.selected).toBe(false);
    expect(vessels.RCA.selected).toBe(false);
    expect(vessels.LAD.dimmed).toBe(false);
    expect(vessels.LCX.dimmed).toBe(false);
    expect(vessels.RCA.dimmed).toBe(false);
  });

  it("refuses to produce states when the payload lacks a vessel or is non-finite", () => {
    const h = createHarness();
    respondEvaluate(h, makeEvaluation(1));
    const base = h.state();

    const missing = makeEvaluation(1);
    delete (missing.targets as unknown as Record<string, unknown>).LAD;
    expect(
      selectVesselStates({ ...base, eval: { ...base.eval, current: missing } })
    ).toBeNull();

    const nonFinite = makeEvaluation(1, { probabilities: { LCX: Number.NaN } });
    expect(
      selectVesselStates({ ...base, eval: { ...base.eval, current: nonFinite } })
    ).toBeNull();
  });
});

describe("C-08/C-09 displayed CAD — payload only, never recomputed", () => {
  it("is null without an evaluation", () => {
    const h = createHarness();
    expect(selectDisplayedCad(h.state())).toBeNull();
  });

  it("returns the headline exactly as the payload states it", () => {
    const h = createHarness();
    const evaluation = makeEvaluation(1, {
      headline: {
        probability: 0.93,
        valueSourceTargetId: "CAD",
        explanationSourceTargetId: "CAD"
      }
    });
    respondEvaluate(h, evaluation);

    const displayed = selectDisplayedCad(h.state());
    expect(displayed).not.toBeNull();
    if (displayed === null) throw new Error("unreachable");
    // The four target probabilities max out at 0.71 — the selector must not
    // re-derive the headline (the coherence rule lives in the engine).
    expect(evaluation.targets.LAD.probability).toBe(0.71);
    expect(displayed.probability).toBe(0.93);
    expect(displayed.decision).toBe(evaluation.headlineCad.decision);
    expect(displayed.reliability).toBe(evaluation.headlineCad.reliability);
    expect(displayed.thresholdProbability).toBe(evaluation.headlineCad.thresholdProbability);
  });

  it("eases the number toward the next headline and lands on it exactly", () => {
    let clock = 1_000;
    const h = createHarness({ now: () => clock });

    const first = makeEvaluation(1); // headline 0.71 (LAD leads)
    respondEvaluate(h, first);
    expect(selectDisplayedCad(h.state())?.interpolating).toBe(true);

    clock = 1_400;
    h.store.sampleDisplay();
    const atRest = selectDisplayedCad(h.state());
    if (atRest === null) throw new Error("expected a displayed CAD");
    expect(atRest.interpolating).toBe(false);
    expect(atRest.probability).toBe(first.headlineCad.probability);

    expect(h.store.intents.case.setValue("Age", 70).ok).toBe(true);
    const second = makeEvaluation(2, {
      probabilities: { CAD: 0.31, LAD: 0.4, LCX: 0.2, RCA: 0.15 }
    }); // headline 0.40 (LAD still leads)
    respondEvaluate(h, second, 1);

    clock = 1_600; // halfway through the 400 ms transition
    h.store.sampleDisplay();
    const mid = selectDisplayedCad(h.state());
    if (mid === null) throw new Error("expected a displayed CAD");
    expect(mid.interpolating).toBe(true);
    expect(mid.probability).toBeCloseTo(0.71 + (0.4 - 0.71) * 0.875, 12);
    expect(mid.probability).not.toBe(second.headlineCad.probability);
    expect(mid.decision).toBe(second.headlineCad.decision); // never interpolated

    clock = 1_800;
    h.store.sampleDisplay();
    const settled = selectDisplayedCad(h.state());
    if (settled === null) throw new Error("expected a displayed CAD");
    expect(settled.interpolating).toBe(false);
    expect(settled.probability).toBe(second.headlineCad.probability); // no jump at the end
    expect(h.state().eval.current).toBe(second); // truth untouched by presentation
  });
});

describe("C-09 display channel — presentation values only", () => {
  it("contains exactly the six presentation fields and nothing else", () => {
    const h = createHarness();
    respondEvaluate(h, makeEvaluation(1));
    const display = h.state().display;

    expect(Object.keys(display).sort()).toEqual(
      ["current", "durationMs", "from", "running", "startedAtMs", "to"].sort()
    );
    const serialized = JSON.stringify(display);
    for (const forbidden of [
      "decision",
      "reliability",
      "threshold",
      "committed",
      "error",
      "status",
      "revision",
      "patient"
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("carries finite numbers keyed by target only", () => {
    const h = createHarness();
    const evaluation = makeEvaluation(1);
    respondEvaluate(h, evaluation);
    const display = h.state().display;

    for (const map of [display.from, display.to, display.current]) {
      expect(Object.keys(map).sort()).toEqual(["CAD", "LAD", "LCX", "RCA"]);
      for (const value of Object.values(map)) {
        expect(typeof value).toBe("number");
        expect(Number.isFinite(value)).toBe(true);
      }
    }
    expect(display.to.CAD).toBe(evaluation.headlineCad.probability);
    expect(display.to.LAD).toBe(evaluation.targets.LAD.probability);
    expect(typeof display.durationMs).toBe("number");
    expect(typeof display.running).toBe("boolean");
  });

  it("moves every target over one shared interval from one driver", () => {
    let clock = 5_000;
    const h = createHarness({ now: () => clock });
    const first = makeEvaluation(1);
    respondEvaluate(h, first);

    expect(h.store.intents.case.setValue("Age", 70).ok).toBe(true);
    const second = makeEvaluation(2, {
      probabilities: { CAD: 0.9, LAD: 0.95, LCX: 0.1, RCA: 0.05 }
    });
    respondEvaluate(h, second, 1);
    const startedAt = h.state().display.startedAtMs;
    expect(startedAt).toBe(clock);

    clock += 400;
    h.store.sampleDisplay();
    const display = h.state().display;
    expect(display.running).toBe(false);
    expect(display.to.CAD).toBe(second.headlineCad.probability);
    expect(display.current.CAD).toBe(display.to.CAD);
    expect(display.current.LAD).toBe(second.targets.LAD.probability);
    expect(display.current.LCX).toBe(second.targets.LCX.probability);
    expect(display.current.RCA).toBe(second.targets.RCA.probability);
  });
});

describe("C-09 reduced motion — duration 0, truth unchanged", () => {
  it("collapses the transition when reduced motion is on before truth arrives", () => {
    const h = createHarness();
    h.store.intents.view.setReducedMotion(true);
    const evaluation = makeEvaluation(1);
    respondEvaluate(h, evaluation);

    const display = h.state().display;
    expect(display.durationMs).toBe(0);
    expect(display.running).toBe(false);
    expect(display.startedAtMs).toBeNull();
    expect(display.current.CAD).toBe(evaluation.headlineCad.probability);

    const truth = h.state().eval;
    expect(truth.current).toBe(evaluation);
    const displayed = selectDisplayedCad(h.state());
    expect(displayed?.probability).toBe(evaluation.headlineCad.probability);
    expect(displayed?.interpolating).toBe(false);
    expect(displayed?.decision).toBe(evaluation.headlineCad.decision);
    expect(displayed?.reliability).toBe(evaluation.headlineCad.reliability);
  });

  it("snaps a running transition to its destination without touching truth", () => {
    let clock = 9_000;
    const h = createHarness({ now: () => clock });
    const evaluation = makeEvaluation(1);
    respondEvaluate(h, evaluation);
    expect(h.state().display.running).toBe(true);

    h.store.intents.view.setReducedMotion(true);
    const display = h.state().display;
    expect(display.durationMs).toBe(0);
    expect(display.running).toBe(false);
    expect(display.startedAtMs).toBeNull();
    expect(display.current.CAD).toBe(display.to.CAD);

    expect(h.state().eval.current).toBe(evaluation); // truth unchanged
    expect(selectDisplayedCad(h.state())?.probability).toBe(evaluation.headlineCad.probability);
  });
});

describe("C-09 stale and explanation selectors", () => {
  it("reports stale exactly while the previous truth is provisional", () => {
    const h = createHarness();
    expect(selectIsStale(h.state())).toBe(false);
    respondEvaluate(h, makeEvaluation(1));
    expect(selectIsStale(h.state())).toBe(false);
    h.store.intents.case.setValue("Age", 70);
    expect(selectIsStale(h.state())).toBe(true);
  });

  it("returns null until an explanation exists for the live revision", () => {
    const h = createHarness();
    expect(selectExplanation(h.state())).toBeNull();
    h.store.intents.selection.selectTarget("CAD"); // L1 explain lane
    const explanation = makeExplanation(1, "CAD");
    const request = h.port.requestsFor("explain")[0];
    if (request === undefined) throw new Error("no explain request");
    h.port.respond(explanationResponse(request, explanation));
    expect(selectExplanation(h.state())).toBe(explanation);
  });
});

describe("C-10 URL-state projection — ids only, share never derived", () => {
  const contextFor = (caseIds: readonly string[]): UrlContext => ({
    registry,
    caseIds,
    defaultCaseId: CASE_A.id,
    defaultTargetId: null
  });

  it("projects view, case and selection ids", () => {
    const h = createHarness();
    h.store.intents.view.navigate("trust", "calibration");
    h.store.intents.selection.selectTarget("LAD");
    h.store.intents.selection.selectFeature("Age");
    h.store.intents.selection.selectStage("labs");

    expect(selectUrlState(h.state())).toEqual({
      route: "trust",
      pane: "calibration",
      caseId: CASE_A.id,
      targetId: "LAD",
      featureId: "Age",
      stageId: "labs",
      share: null
    });
  });

  it("omits an unselected case and never carries edited values", () => {
    const h = createHarness({ autoSelect: false });
    expect(selectUrlState(h.state()).caseId).toBeNull();

    h.store.intents.case.select(CASE_A.id);
    expect(h.store.intents.case.setValue("Age", 77).ok).toBe(true);
    h.store.intents.selection.selectTarget("LAD");

    const href = serializeUrl(selectUrlState(h.state()));
    expect(href).toBe("#/explore?case=hypo1&target=LAD");
    expect(href).not.toContain("share=");
    expect(href).not.toContain("77"); // the edited value never serializes
    expect(href).not.toContain("Age");
  });

  it("round-trips through parse + resolve to the same state", () => {
    const h = createHarness();
    h.store.intents.view.navigate("system", "integrity");
    h.store.intents.selection.selectTarget("RCA");
    h.store.intents.selection.selectFeature("BP");
    h.store.intents.selection.selectStage("exam");

    const projected = selectUrlState(h.state());
    const href = serializeUrl(projected);
    expect(href).toBe("#/system/integrity?case=hypo1&target=RCA&feature=BP&stage=exam");

    const resolved = resolveUrl(parseUrl(href), contextFor([CASE_A.id, CASE_B.id]));
    expect(resolved.notices).toEqual([]);
    expect(resolved.share).toBeNull();
    expect(resolved.route).toBe("system");
    expect(resolved.pane).toBe("integrity");
    expect(resolved.caseId).toBe(CASE_A.id);
    expect(resolved.targetId).toBe("RCA");
    expect(resolved.featureId).toBe("BP");
    expect(resolved.stageId).toBe("exam");
  });

  it("keeps `share` null through every selector call — only an explicit action supplies it", () => {
    const h = createHarness();
    respondEvaluate(h, makeEvaluation(1));
    h.store.intents.case.setValue("Age", 77);
    h.store.intents.view.navigate("trust", "leakage");
    const projected = selectUrlState(h.state());
    expect(projected.share).toBeNull();
    expect(serializeUrl(projected)).not.toContain("share=");
    expect(resolveUrl(parseUrl(serializeUrl(projected)), contextFor([CASE_A.id, CASE_B.id])).share).toBeNull();
  });
});

describe("selector purity — reading never writes", () => {
  it("leaves the state JSON byte-identical after every selector runs", () => {
    const h = createHarness();
    respondEvaluate(h, makeEvaluation(1));
    h.store.intents.selection.selectTarget("LAD");
    h.store.intents.selection.setHover({ kind: "feature", id: "Age" });

    const before = JSON.stringify(h.state());
    selectVesselIds(h.state());
    selectCompletion(h.state());
    selectModalityCounts(h.state());
    selectSelectedTarget(h.state());
    selectVesselStates(h.state());
    selectDisplayedCad(h.state());
    selectIsStale(h.state());
    selectExplanation(h.state());
    selectUrlState(h.state());
    expect(JSON.stringify(h.state())).toBe(before);
  });

  it("is a pure function of its input state", () => {
    const h = createHarness();
    respondEvaluate(h, makeEvaluation(1));
    const state = h.state();
    const first = selectCompletion(state);
    const second = selectCompletion(state);
    expect(second).toEqual(first);
    expect(selectVesselStates(state)).toEqual(selectVesselStates(state));
    expect(selectVesselIds(state)).toEqual(selectVesselIds(state));
  });
});
