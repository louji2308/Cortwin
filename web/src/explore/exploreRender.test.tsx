import { readFileSync } from "node:fs";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CorTwinStore } from "../store";
import {
  createHarness,
  disposeHarnesses,
  makeEvaluation,
  registry,
  type Harness
} from "../store/testFixtures";
import type { ExploreInspectorProps } from "./types";
import { ExploreView } from "./ExploreView";

/**
 * P6-EXPLORE-R mission A/D/E - composition, designed states, accessibility.
 *
 * The sibling Inspector is integrated through `./inspectorHost` (the frozen
 * seam): tests mock THAT module, never `../panels/inspector`, so this suite
 * runs green before the sibling unit lands. Everything else - ProfileForm,
 * Stage3D/StageSchematic, ProbabilityReadout, the store - is the real module.
 *
 * Numbers on screen come only from the C-08 payload the harness delivers;
 * nothing here types a probability into an assertion source except by reading
 * it back out of `makeEvaluation`'s labelled SYNTHETIC fixture.
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

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** Dispatch a happy-path evaluate response for the harness's pending L0 request. */
function answerFirstEvaluate(h: Harness, probabilities?: Record<string, number>): void {
  const request = h.evaluateRequest();
  const evaluation = makeEvaluation(
    request.revision,
    probabilities === undefined ? {} : { probabilities }
  );
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
}

describe("A - composition: three zones, one store, one registry", () => {
  it("mounts the real ProfileForm, Stage3D and four ProbabilityReadouts from store truth", () => {
    const h = createHarness();
    expect(h.port.requestsFor("evaluate").length).toBeGreaterThan(0);
    answerFirstEvaluate(h);
    const { html, inspectorProps } = renderHarness(h);

    // Landmarks: the three zones of Final_demo section 4.2.
    expect(html).toContain('aria-label="Case profile"');
    expect(html).toContain('aria-label="Vessel stage"');
    expect(html).toContain('aria-label="Inspector"');

    // Left: the REAL ProfileForm, registry-driven (54 features, 5 modalities).
    expect(count(html, "data-feature-id=")).toBe(54);
    expect(count(html, "data-modality-id=")).toBe(5);
    expect(html).toContain("13 / 54 provided");
    expect(html).toContain("LAD, LCX, RCA, Cath, Exertional CP are never model inputs.");

    // Centre: the REAL stage + exactly four readouts (CAD headline + 3 vessels).
    expect(html).toContain('class="ct-stage"');
    expect(count(html, "ct-prob-readout ct-prob-readout--")).toBe(4);
    expect(count(html, "ct-prob-readout--large")).toBe(1);
    expect(count(html, "ct-prob-readout--compact")).toBe(3);

    // Values: read straight back from the payload the harness delivered.
    const evaluation = h.state().eval.current;
    if (evaluation === null) throw new Error("expected an evaluation");
    expect(html).toContain(pct(evaluation.headlineCad.probability));
    expect(html).toContain(pct(evaluation.targets.LAD.probability));
    expect(html).toContain(pct(evaluation.targets.LCX.probability));
    expect(html).toContain(pct(evaluation.targets.RCA.probability));
    expect(html).toContain("Threshold 50%");
    expect(html).toContain("Decision: above");
    expect(html).toContain("Reliability: moderate");
    // C-08 coherence disclosure: the headline's value source is a vessel.
    expect(evaluation.headlineCad.valueSourceTargetId).toBe("LAD");
    expect(html).toContain("CAD shown from LAD");

    // Right: the Inspector projection carries store truth (frozen surface).
    expect(inspectorProps.registry).toBe(h.state().bundle.registry);
    expect(inspectorProps.registry).toBe(registry);
    expect(inspectorProps.evaluation).toBe(evaluation);
    expect(inspectorProps.caseSnapshot.revision).toBe(h.state().case.revision);
    expect(inspectorProps.caseSnapshot.values).toEqual(h.state().case.values);
    expect(inspectorProps.evalStatus).toBe("ready");
    expect(inspectorProps.stale).toBe(false);
    expect(inspectorProps.selection).toEqual({
      targetId: null,
      featureId: null,
      modalityId: null,
      hovered: null
    });
    expect(typeof inspectorProps.onEditFeature).toBe("function");
    expect(typeof inspectorProps.onSelectTarget).toBe("function");
    expect(typeof inspectorProps.onSelectFeature).toBe("function");
  });

  it("keeps the frozen ExploreWorkspace export: no props, singleton store binding", () => {
    const source = readFileSync(new URL("./index.tsx", import.meta.url), "utf8");
    expect(source).toMatch(/export function ExploreWorkspace\(\): ReactElement \{/);
    expect(source).toContain("<ExploreView store={store} />");
    expect(source).not.toMatch(/ExploreWorkspace\s*\(\s*[a-zA-Z]/);
    // The frozen prop contract the sibling codes against, verbatim fields.
    const types = readFileSync(new URL("./types.ts", import.meta.url), "utf8");
    for (const field of [
      "registry",
      "caseSnapshot",
      "evaluation",
      "explanation",
      "selection",
      "evalStatus",
      "stale",
      "onEditFeature",
      "onSelectTarget",
      "onSelectFeature",
      "onHoverTarget"
    ]) {
      expect(types, field).toContain(field);
    }
  });
});

describe("D - designed states: loading, empty, stale, error, degraded", () => {
  it("loading: bundle not ready renders the skeleton with a busy live region", () => {
    const h = createHarness({ ready: false });
    const html = render(h.store);
    expect(html).toContain('data-testid="explore-skeleton"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Loading the model bundle\u2026");
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain("ct-prob-readout");
    expect(inspector.captures).toHaveLength(0);
  });

  it("bundle failure: designed alert screen, no blank page (Architecture G6)", () => {
    const h = createHarness({ ready: false });
    h.store.intents.bundle.setBundleError();
    const html = render(h.store);
    expect(html).toContain('data-testid="explore-failed"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("Model bundle unavailable");
    expect(html).toContain("Reload");
  });

  it("empty: before the first evaluation, skeleton readouts and an awaiting notice - no numbers", () => {
    const h = createHarness();
    const { html, inspectorProps } = renderHarness(h);
    expect(count(html, 'data-testid="readout-skeleton"')).toBe(2);
    expect(html).toContain('data-testid="awaiting-eval"');
    expect(html).toContain("Waiting for the first model response\u2026");
    expect(html).not.toContain("ct-prob-readout");
    expect(html).toContain('data-eval-status="computing"');
    expect(inspectorProps.evalStatus).toBe("computing");
    expect(inspectorProps.evaluation).toBeNull();
  });

  it("stale-but-visible: an unanswered edit keeps truth on screen with Updating copy", () => {
    const h = createHarness();
    answerFirstEvaluate(h);
    const before = h.state().eval.current;
    if (before === null) throw new Error("expected an evaluation");

    const result = h.store.intents.case.setValue("Age", 71);
    expect(result.ok).toBe(true);
    const { html, inspectorProps } = renderHarness(h);

    expect(h.state().eval.status).toBe("updating");
    expect(inspectorProps.stale).toBe(true);
    expect(inspectorProps.evalStatus).toBe("updating");
    expect(html).toContain('data-testid="stale-notice"');
    expect(html).toContain("Updating\u2026");
    // The stale notice itself carries the C-07 §6.1 updating affordance.
    const staleTag = html.match(/<span class="ct-explore__stale"[^>]*>[^<]*<\/span>/)?.[0] ?? "";
    expect(staleTag).toContain("Updating\u2026");
    // Previous truth stays visible - never blanked, never presented as current.
    expect(html).toContain(pct(before.targets.LAD.probability));
    expect(html).toContain('data-eval-status="updating"');
  });

  it("compute error: designed alert with the contract error code and a way out", () => {
    const h = createHarness();
    const request = h.evaluateRequest();
    h.port.respond({
      protocolVersion: "1.0.0",
      requestId: request.requestId,
      channel: "case",
      revision: request.revision,
      lane: "L0",
      operation: "evaluate",
      status: "error",
      error: {
        code: "INTERNAL_COMPUTE_FAILURE",
        message: "Computation failed",
        recoverable: true
      }
    });
    const { html, inspectorProps } = renderHarness(h);
    expect(html).toContain('data-testid="eval-error"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('data-error-code="INTERNAL_COMPUTE_FAILURE"');
    expect(html).toContain("Model response unavailable.");
    expect(inspectorProps.evalStatus).toBe("error");
  });

  it("Q3 degrade: the same scene model renders the real 2D schematic", () => {
    const h = createHarness();
    h.store.intents.view.setQualityTier("Q3");
    answerFirstEvaluate(h);
    const { html } = renderHarness(h);
    expect(html).toContain('class="ct-stage"');
    expect(html).toContain('data-tier="Q3"');
    expect(html).toContain('aria-label="2D vessel schematic"');
    expect(html).toContain('aria-label="Coronary artery schematic"');
    for (const structureId of ["LAD", "LCX", "RCA"]) {
      expect(html, structureId).toContain(`data-structure-id="${structureId}"`);
    }
    expect(html).not.toContain("ct-stage__canvas");
  });
});

describe("E - accessibility surface", () => {
  it("probability changes announce through aria-live, status through role=status", () => {
    const h = createHarness();
    answerFirstEvaluate(h);
    const { html } = renderHarness(h);
    // One live region per readout (4) + the workspace status line.
    expect(count(html, 'aria-live="polite"')).toBeGreaterThanOrEqual(5);
    expect(html).toContain('role="status"');
    expect(html).toContain('role="group" aria-label="Vessel probabilities"');
    expect(count(html, "aria-pressed=")).toBe(3);
    expect(html).toContain('aria-label="CAD probability readout"');
    expect(html).toContain('aria-label="LAD probability readout"');
    expect(html).toContain('data-testid="headline-readout"');
  });

  it("44px targets, visible focus and zero colour literals live in explore.css", () => {
    const css = readFileSync(new URL("./explore.css", import.meta.url), "utf8");
    expect(css).toMatch(/min-height:\s*var\(--ct-target-min\)/);
    // Chrome colour comes from tokens only: no literal may exist here.
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\b(?:rgb|rgba|hsl|hsla|hwb|color-mix)\(/);
    // Selection is an accent affordance, never a probability colour.
    expect(css).toMatch(/\[data-selected="true"\][^{]*\{[^}]*var\(--ct-color-accent\)/);
    // Global keyboard focus + reduced motion are owned by the shared tokens.
    const tokens = readFileSync(new URL("../design/tokens.css", import.meta.url), "utf8");
    expect(tokens).toContain(":focus-visible {");
    expect(tokens).toContain("prefers-reduced-motion: reduce");
  });
});
