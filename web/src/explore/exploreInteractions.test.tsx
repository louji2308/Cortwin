import { readFileSync } from "node:fs";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComputeError, TargetId } from "../contracts";
import { buildSceneModel } from "../scene";
import type { CorTwinStore } from "../store";
import {
  createHarness,
  disposeHarnesses,
  makeEvaluation,
  registry,
  type Harness
} from "../store/testFixtures";
import {
  answerEvaluations,
  answerExplanation,
  settleDisplay
} from "./exploreTestHarness";
import {
  buildInspectorProps,
  createBindings,
  cycleTargetId,
  headlineReadout,
  type ExploreBindings
} from "./model";
import { IntentErrorNotice } from "./States";
import type { ExploreInspectorProps } from "./types";
import { ExploreView } from "./ExploreView";

/**
 * P6-EXPLORE-R missions B + C - selection, hover, choreography, coherence.
 *
 * Interaction semantics run through `createBindings` - the exact factory
 * ExploreView calls - against a real store harness, so "the workspace
 * dispatched" is always the code path under test (the Profile suite's
 * convention). Component wiring from JSX to those bindings is asserted by
 * source scan; store truth and rendered markup assert the effects.
 */

const inspector = vi.hoisted(() => ({ captures: [] as unknown[] }));

vi.mock("./inspectorHost", () => ({
  InspectorPanel: (props: unknown) => {
    inspector.captures.push(props);
    return null;
  }
}));

afterEach(() => {
  disposeHarnesses();
  inspector.captures = [];
});

function render(store: CorTwinStore): string {
  return renderToString(<ExploreView store={store} />);
}

function renderHarness(h: Harness): { html: string; inspectorProps: ExploreInspectorProps } {
  inspector.captures = [];
  const html = render(h.store);
  expect(inspector.captures.length).toBe(1);
  return { html, inspectorProps: inspector.captures[0] as ExploreInspectorProps };
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function readyWithBindings(): { h: Harness; bindings: ExploreBindings } {
  const h = createHarness();
  const bindings = createBindings(h.store);
  answerEvaluations(h);
  settleDisplay(h);
  return { h, bindings };
}

function cardPressed(html: string, targetId: string): string | null {
  const match = new RegExp(
    `<button[^>]*data-target-id="${targetId}"[^>]*>`
  ).exec(html);
  return match === null ? null : match[0];
}

/* ------------------------------------------------------------------ *
 * B - selection and hover: one truth across every representation
 * ------------------------------------------------------------------ */

describe("B - vessel selection through the registry, one intent path", () => {
  it("stage click binding selects the target, flies the camera, never bumps the revision", () => {
    const { h, bindings } = readyWithBindings();
    const revisionBefore = h.state().case.revision;
    const explainsBefore = h.port.requestsFor("explain").length;

    bindings.onVesselSelect("LAD"); // structure id, exactly what the stage reports

    expect(h.state().selection.targetId).toBe("LAD");
    expect(h.state().view.cameraPreset).toBe("LAD");
    expect(h.state().case.revision).toBe(revisionBefore); // C-09: selection is not an edit
    const explains = h.port.requestsFor("explain");
    expect(explains.length).toBe(explainsBefore + 1); // C-07 lane table: L1 on select
    expect(explains[explains.length - 1].targetId).toBe("LAD");
    expect(explains[explains.length - 1].lane).toBe("L1");

    const { html, inspectorProps } = renderHarness(h);
    const ladTag = cardPressed(html, "LAD");
    expect(ladTag).toContain('aria-pressed="true"');
    expect(ladTag).toContain('data-selected="true"');
    expect(cardPressed(html, "LCX")).toContain('aria-pressed="false"');
    expect(cardPressed(html, "RCA")).toContain('aria-pressed="false"');
    // Depth switch input for the sibling Inspector (Case -> Vessel).
    expect(inspectorProps.selection.targetId).toBe("LAD");
    expect(inspectorProps.selection.featureId).toBeNull();

    const scene = buildSceneModel(h.state(), registry);
    if (scene === null) throw new Error("expected a scene model");
    expect(scene.vessels.LAD.selected).toBe(true);
    expect(scene.vessels.LCX.dimmed).toBe(true);
    expect(scene.vessels.RCA.dimmed).toBe(true);
    expect(scene.selectedTargetId).toBe("LAD");
    expect(scene.cameraTarget).toBe("LAD");
  });

  it("the card's click/hover handlers are wired to the bindings (source scan)", () => {
    const source = readFileSync(new URL("./ExploreView.tsx", import.meta.url), "utf8");
    // Vessel cards select/hover through the bindings; the stage reports
    // structure ids through the stage-specific binding pair.
    expect(source).toContain("bindings.onSelectTarget(card.targetId)");
    expect(source).toContain("bindings.onHoverTarget(card.targetId)");
    expect(source).toContain("bindings.onHoverTarget(null)");
    expect(source).toContain("bindings.onSelectFeature(featureId)");
    expect(source).toContain("onVesselHover={bindings.onVesselHover}");
    expect(source).toContain("onVesselSelect={bindings.onVesselSelect}");
    // The Inspector edit callback and the Profile field edit share one function.
    const model = readFileSync(new URL("./model.ts", import.meta.url), "utf8");
    expect(model).toContain("onEditFeature: bindings.onSetValue");
    expect(source).toContain("onSetValue={bindings.onSetValue}");
  });

  it("hover drives stage, card and Inspector from a single store channel", () => {
    const { h, bindings } = readyWithBindings();
    const revisionBefore = h.state().case.revision;
    const requestsBefore =
      h.port.requestsFor("evaluate").length + h.port.requestsFor("explain").length;

    bindings.onVesselHover("LCX"); // structure id from the stage pointer
    expect(h.state().selection.hovered).toEqual({ kind: "vessel", id: "LCX" });
    expect(h.state().case.revision).toBe(revisionBefore);
    const requestsAfter =
      h.port.requestsFor("evaluate").length + h.port.requestsFor("explain").length;
    expect(requestsAfter).toBe(requestsBefore); // hover issues no compute (C-09)

    const first = renderHarness(h);
    expect(first.html).toContain('data-hovered="true"');
    const hoveredTags = [...first.html.matchAll(/<button[^>]*data-target-id="([A-Z]+)"[^>]*>/g)]
      .map((match) => match[0])
      .filter((tag) => tag.includes('data-hovered="true"'));
    expect(hoveredTags).toHaveLength(1);
    expect(hoveredTags[0]).toContain('data-target-id="LCX"');
    expect(first.inspectorProps.selection.hovered).toEqual({ kind: "vessel", id: "LCX" });
    const scene = buildSceneModel(h.state(), registry);
    if (scene === null) throw new Error("expected a scene model");
    expect(scene.vessels.LCX.hovered).toBe(true);
    expect(scene.vessels.LAD.hovered).toBe(false);
    expect(scene.hoveredEntity).toEqual({ kind: "vessel", id: "LCX" });

    // The Inspector's own hover callback lands in the same channel.
    bindings.onHoverTarget("RCA");
    const second = renderHarness(h);
    expect(second.inspectorProps.selection.hovered).toEqual({ kind: "vessel", id: "RCA" });
    expect(second.html).toContain('data-target-id="RCA" data-selected="false" data-hovered="true"');

    // Clearing (pointer leave) clears every representation.
    bindings.onVesselHover(null);
    const third = renderHarness(h);
    expect(third.html).not.toContain('data-hovered="true"');
    expect(third.inspectorProps.selection.hovered).toBeNull();
    const cleared = buildSceneModel(h.state(), registry);
    expect(cleared?.hoveredEntity).toBeNull();

    // An id the registry does not know never hovers anything.
    bindings.onVesselHover("NOT_A_VESSEL");
    expect(h.state().selection.hovered).toBeNull();
  });

  it("Arrow keys cycle the registry's vessels and move focus (source scan + effect)", () => {
    const ids = ["LAD", "LCX", "RCA"] as const;
    expect(cycleTargetId([...ids], null, 1)).toBe("LAD");
    expect(cycleTargetId([...ids], "LAD", 1)).toBe("LCX");
    expect(cycleTargetId([...ids], "LCX", -1)).toBe("LAD");
    expect(cycleTargetId([...ids], "RCA", 1)).toBe("LAD"); // wrap forward
    expect(cycleTargetId([...ids], "LAD", -1)).toBe("RCA"); // wrap backward
    expect(cycleTargetId([], "LAD", 1)).toBeNull();
    expect(cycleTargetId([...ids], "CAD", 1)).toBe("LAD"); // non-vessel falls to first

    const source = readFileSync(new URL("./ExploreView.tsx", import.meta.url), "utf8");
    expect(source).toContain('event.key !== "ArrowLeft" && event.key !== "ArrowRight"');
    expect(source).toContain("cycleTargetId(");
    expect(source).toContain("event.preventDefault()");

    // The effect: the handler's own steps, through the same binding.
    const { h, bindings } = readyWithBindings();
    let current: TargetId | null = null;
    for (const expected of ["LAD", "LCX", "RCA", "LAD"]) {
      current = cycleTargetId([...ids], current, 1);
      expect(current).toBe(expected);
      bindings.onSelectTarget(current);
      expect(h.state().selection.targetId).toBe(expected);
    }
  });

  it("Inspector-driven selection and feature focus ride the same intents", () => {
    const { h } = readyWithBindings();
    inspector.captures = [];
    render(h.store);
    const props = inspector.captures[0] as ExploreInspectorProps;
    const revisionBefore = h.state().case.revision;

    props.onSelectTarget("RCA");
    expect(h.state().selection.targetId).toBe("RCA");
    expect(h.state().view.cameraPreset).toBe("RCA");
    expect(h.state().case.revision).toBe(revisionBefore);

    props.onSelectFeature("Age"); // depth-2 focus, never a revision change
    expect(h.state().selection.featureId).toBe("Age");
    expect(h.state().case.revision).toBe(revisionBefore);

    props.onSelectTarget(null);
    expect(h.state().selection.targetId).toBeNull();
    expect(h.state().view.cameraPreset).toBe("RCA"); // null clears selection, not the camera

    // An unknown structure id is a no-op: selection carries no invented truth.
    const bindings = createBindings(h.store);
    bindings.onVesselSelect("NOT_A_VESSEL");
    expect(h.state().selection.targetId).toBeNull();
    bindings.onVesselSelect("LAD");
    bindings.onVesselSelect("NOT_A_VESSEL");
    expect(h.state().selection.targetId).toBe("LAD");
  });

  it("an explanation lands for the selected target and reaches the Inspector projection", () => {
    const { h, bindings } = readyWithBindings();
    inspector.captures = [];
    render(h.store);
    expect((inspector.captures[0] as ExploreInspectorProps).explanation).toBeNull();

    bindings.onVesselSelect("LAD");
    expect(answerExplanation(h, "LAD")).toBe(1);

    const { inspectorProps } = renderHarness(h);
    expect(inspectorProps.explanation).not.toBeNull();
    expect(inspectorProps.explanation?.targetId).toBe("LAD");
    expect(inspectorProps.explanation?.revision).toBe(h.state().case.revision);
  });
});

/* ------------------------------------------------------------------ *
 * C - choreography: edit -> revision -> evaluation -> displayed truth
 * ------------------------------------------------------------------ */

describe("C - live choreography through the store's display channel", () => {
  it("edit -> revision+1 -> updating -> new evaluation -> displayed number eases to it", () => {
    const { h, bindings } = readyWithBindings();
    const evaluationBefore = h.state().eval.current;
    if (evaluationBefore === null) throw new Error("expected an evaluation");
    const oldLad = evaluationBefore.targets.LAD.probability;
    const revisionBefore = h.state().case.revision;

    bindings.onSetValue("Age", 71);
    expect(h.state().case.revision).toBe(revisionBefore + 1);
    expect(h.state().eval.status).toBe("updating");

    // New payload: LAD drops from 0.71 to 0.63 (SYNTHETIC fixture numbers).
    const dispatched = answerEvaluations(h, { probabilities: { LAD: 0.63 } });
    expect(dispatched).toBe(1);
    const evaluationAfter = h.state().eval.current;
    if (evaluationAfter === null) throw new Error("expected an evaluation");
    expect(evaluationAfter.revision).toBe(revisionBefore + 1);
    expect(evaluationAfter.targets.LAD.probability).toBe(0.63);
    expect(h.state().eval.status).toBe("ready");

    // P-4: data truth has moved, the displayed channel is still easing (400 ms).
    expect(h.state().display.running).toBe(true);
    expect(h.state().display.durationMs).toBe(400);
    const easing = renderHarness(h);
    expect(easing.html).toContain(pct(oldLad));
    expect(easing.html).not.toContain(pct(0.63));
    expect(easing.inspectorProps.stale).toBe(false);

    // The rAF driver's call settles the channel exactly on the payload.
    settleDisplay(h);
    expect(h.state().display.running).toBe(false);
    expect(h.state().display.current.LAD).toBe(0.63);
    const settled = renderHarness(h);
    expect(settled.html).toContain(pct(0.63));
    expect(settled.html).not.toContain(pct(oldLad));
    // The Profile form shows the edited value through the same store write.
    expect(settled.html).toContain('value="71"');
  });

  it("coherence rule: the headline renders the engine's headline, never a UI max()", () => {
    const h = createHarness();
    const request = h.evaluateRequest();
    // Payload where the engine's headline (0.52, CAD) is deliberately NOT the
    // max of the four targets (LAD leads at 0.71): a UI that re-derived the
    // coherence rule would print 71% and fail this test.
    const evaluation = makeEvaluation(request.revision, {
      headline: {
        probability: 0.52,
        valueSourceTargetId: "CAD",
        decisionReferenceTargetId: "CAD",
        decision: "below",
        reliability: "strong",
        thresholdProbability: 0.5,
        explanationSourceTargetId: "CAD"
      }
    });
    h.port.respond({
      protocolVersion: "1.0.0",
      requestId: request.requestId,
      channel: "case",
      revision: request.revision,
      lane: "L0",
      operation: "evaluate",
      status: "ok",
      evaluation
    });
    settleDisplay(h);

    const headline = headlineReadout(h.state(), registry);
    if (headline === null) throw new Error("expected a headline readout");
    expect(headline.value).toBe(evaluation.headlineCad.probability);
    expect(headline.value).toBe(0.52);
    expect(headline.decision).toBe("below");
    expect(headline.sourceTargetId).toBeUndefined(); // CAD is its own source

    const { html } = renderHarness(h);
    expect(html).toContain(pct(0.52)); // headline passes the payload through
    expect(html).toContain(pct(0.71)); // LAD card shows its own payload
    // The headline block itself never carries the recomputed maximum.
    const headlineBlock = /data-testid="headline-readout"[\s\S]*?aria-label="CAD probability readout"[\s\S]*?ct-prob-readout__value">([^<]+)</.exec(html);
    expect(headlineBlock?.[1]).toBe("52%");

    // No derivation or rounding vocabulary anywhere in the presentation model.
    const model = readFileSync(new URL("./model.ts", import.meta.url), "utf8");
    expect(model).not.toMatch(/Math\.(?:max|min|round|floor|ceil)/);
    expect(model).not.toMatch(/toFixed/);
    expect(model).toContain("selectDisplayedCad");
  });

  it("reduced motion collapses the transition to 0 ms with truth unchanged", () => {
    const h = createHarness();
    h.store.intents.view.setReducedMotion(true);
    answerEvaluations(h);
    expect(h.state().display.durationMs).toBe(0);
    expect(h.state().display.running).toBe(false);
    const evaluation = h.state().eval.current;
    if (evaluation === null) throw new Error("expected an evaluation");
    expect(h.state().display.current.CAD).toBe(evaluation.headlineCad.probability);

    const { html } = renderHarness(h);
    expect(html).toContain(pct(evaluation.headlineCad.probability));
    const scene = buildSceneModel(h.state(), registry);
    expect(scene?.reducedMotion).toBe(true);

    // The workspace owns the OS motion preference -> store wiring.
    const source = readFileSync(new URL("./ExploreView.tsx", import.meta.url), "utf8");
    expect(source).toContain("prefers-reduced-motion: reduce");
    expect(source).toContain("setReducedMotion(media.matches)");
    // And the animation rides the store channel, not React state.
    expect(source).toContain("store.sampleDisplay()");
    expect(source).toContain("requestAnimationFrame(loop)");
  });

  it("the Inspector's onEditFeature IS the Profile's edit intent (one intent path)", () => {
    const { h } = readyWithBindings();
    const bindings = createBindings(h.store);
    const props = buildInspectorProps(h.state(), registry, bindings);
    expect(props.onEditFeature).toBe(bindings.onSetValue); // same function object
    expect(props.onSelectTarget).toBe(bindings.onSelectTarget);

    inspector.captures = [];
    render(h.store);
    const live = inspector.captures[0] as ExploreInspectorProps;
    const revisionBefore = h.state().case.revision;
    live.onEditFeature("Age", 71);
    expect(h.state().case.revision).toBe(revisionBefore + 1);
    expect(h.state().case.values.Age).toBe(71);
    // The real ProfileForm, mounted from the real module, shows that write.
    const { html } = renderHarness(h);
    expect(html).toContain('value="71"');
    expect(html).toContain('data-testid="completion"');
  });

  it("a rejected intent reports a typed error through the sink and writes nothing", () => {
    const h = createHarness();
    const errors: ComputeError[] = [];
    const bindings = createBindings(h.store, {
      onIntentError: (error) => errors.push(error)
    });
    const before = structuredClone(h.state().case);

    bindings.onSetValue("NotARegistryFeature", 5);
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe("MALFORMED_REQUEST");
    expect(errors[0].message).toBe("Unknown feature id");
    bindings.onSetValue("Age", Number.NaN);
    expect(errors).toHaveLength(2);
    expect(errors[1].code).toBe("NONFINITE_INPUT");
    expect(h.state().case).toEqual(before);

    // The designed notice for that state (component-level; ExploreView holds
    // the live error in React state, which a server render cannot re-enter).
    const html = renderToString(
      <IntentErrorNotice error={errors[0]} />
    );
    expect(html).toContain('data-testid="intent-error"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("Change not applied.");
    expect(html).toContain("unchanged");
  });

  it("provision, tier and reset bindings write through their C-09 intents", () => {
    const { h, bindings } = readyWithBindings();
    const revisionBefore = h.state().case.revision;

    bindings.onSetModalityProvided("echo", false);
    expect(h.state().case.providedModalities.echo).toBe(false);
    expect(h.state().case.revision).toBe(revisionBefore + 1);

    bindings.onSetFeatureProvided("Age", false);
    expect(h.state().case.providedFeatures.Age).toBe(false);

    bindings.onTierChange("Q2");
    expect(h.state().view.qualityTier).toBe("Q2");

    bindings.onSelectFeature("LDL");
    expect(h.state().selection.featureId).toBe("LDL");

    bindings.onReset();
    expect(h.state().case.providedModalities.echo).toBe(true);
    expect(h.state().case.values).toEqual(h.state().cases[0].values);
    expect(h.state().case.revision).toBe(revisionBefore + 3);
  });
});

/* ------------------------------------------------------------------ *
 * P1-a2 - the stage stays in view after a selection (B-04 defect fix)
 * ------------------------------------------------------------------ */

describe("P1-a2 - stage stays reachable after a vessel selection", () => {
  it("both selection paths keep the stage in view through a scoped, nearest-only scroll", () => {
    const source = readFileSync(new URL("./ExploreView.tsx", import.meta.url), "utf8");
    // Card click AND arrow cycling call the same helper on the workspace root.
    expect(source.match(/keepStageInView\(workspaceRef\.current\)/g) ?? []).toHaveLength(2);
    // `nearest` scrolls only when the stage is off-viewport: an already
    // visible stage never jumps (no layout fatigue, instant = motion-safe).
    expect(source).toContain('block: "nearest"');
    // Scoped to the workspace root, never a document-wide query that could
    // match a stage outside this composition.
    expect(source).not.toContain("document.querySelector");
  });
});
