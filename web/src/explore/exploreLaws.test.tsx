import { readFileSync } from "node:fs";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { scanSource, violations } from "../copy/copyLint";
import type { CorTwinStoreState, Registry } from "../contracts";
import { buildSceneModel } from "../scene";
import {
  createHarness,
  disposeHarnesses,
  makeEvaluation,
  registry
} from "../store/testFixtures";
import { answerEvaluations, settleDisplay } from "./exploreTestHarness";
import {
  buildInspectorProps,
  caseLabelOf,
  createBindings,
  displayedProbability,
  headlineReadout,
  structureIdForTarget,
  structureUrlOf,
  targetIdForStructure,
  targetLabel,
  vesselCardModels,
  vesselStructureIdOrder,
  vesselTargets
} from "./model";
import type { ExploreInspectorProps } from "./types";
import { ExploreView } from "./ExploreView";

/**
 * P6-EXPLORE-R mission F - the blocking presentation laws plus the pure
 * coverage of `./model`. Every law is written so the mutation it guards
 * against turns it RED; the mutation log for this run is in the unit report.
 *
 * Scan scope: every non-test `.ts/.tsx` file in `web/src/explore` (the seven
 * application sources + the shared test harness) and `explore.css`. Test
 * files are excluded because assertions legitimately quote the patterns they
 * forbid - the copy suite applies the same reasoning to `web/src/copy`.
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

const APP_FILES = [
  "types.ts",
  "model.ts",
  "index.tsx",
  "inspectorHost.tsx",
  "ExploreView.tsx",
  "TweeningReadout.tsx",
  "stableSnapshot.ts",
  "EvidenceRailHost.tsx",
  "States.tsx",
  "exploreTestHarness.tsx"
] as const;

function sourceOf(name: string): string {
  return readFileSync(new URL(name, import.meta.url), "utf8");
}

function appSources(): Array<{ name: string; text: string }> {
  return APP_FILES.map((name) => ({ name, text: sourceOf(name) }));
}

/* ------------------------------------------------------------------ *
 * F.1 - ProbabilityReadout is the ONLY probability renderer
 * ------------------------------------------------------------------ */

describe("law: no probability is formatted or derived outside ProbabilityReadout", () => {
  it("no source file formats or rounds a number (modulo aside, no bare %)", () => {
    for (const { name, text } of appSources()) {
      expect(text, `${name}: rounding`).not.toMatch(/Math\.(?:round|floor|ceil|max|min)/);
      expect(text, `${name}: fixed decimals`).not.toMatch(/toFixed\s*\(/);
      expect(text, `${name}: x100 scaling`).not.toMatch(/\*\s*100\b/);
      expect(text, `${name}: ramp colour call`).not.toContain("probabilityToColour");
      expect(text, `${name}: inline style`).not.toContain("style={{");
      if (name.endsWith(".tsx")) {
        // Markup: any % character would be a rendered token of our own.
        expect(text, `${name}: percent character`).not.toContain("%");
      } else {
        // Logic: a percent sign may only appear as the modulo operator
        // (code position); inside any string literal it would mean formatting.
        for (const [i, line] of text.split("\n").entries()) {
          const code = line.replace(/\/\/.*$/, "");
          const strings = code.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g) ?? [];
          for (const literal of strings) {
            expect(literal, `${name}:${i + 1} percent string`).not.toContain("%");
          }
        }
      }
    }
  });

  it("every percentage token in the rendered workspace sits inside a readout", () => {
    const h = createHarness();
    answerEvaluations(h);
    settleDisplay(h);
    inspector.captures = [];
    const html = renderToString(<ExploreView store={h.store} />).replace(/<!--.*?-->/g, "");
    expect(inspector.captures).toHaveLength(1);

    const inside: Array<[number, number]> = [];
    const open = 'class="ct-prob-readout ';
    let cursor = html.indexOf(open);
    const tag = /<div\b|<\/div>/g;
    while (cursor !== -1) {
      const divStart = html.lastIndexOf("<div", cursor);
      tag.lastIndex = divStart;
      let depth = 0;
      let end = -1;
      let match: RegExpExecArray | null;
      while ((match = tag.exec(html)) !== null) {
        depth += match[0] === "<div" ? 1 : -1;
        if (depth === 0) {
          end = tag.lastIndex;
          break;
        }
      }
      inside.push([divStart, end === -1 ? html.length : end]);
      cursor = html.indexOf(open, end === -1 ? html.length : end);
    }
    expect(inside.length).toBe(4);

    // Only *text* percentages are policed; a % inside a tag is a layout
    // dimension (e.g. the stage's width:100%), never a displayed probability.
    let checked = 0;
    for (const match of html.matchAll(/\d+(?:\.\d+)?%/g)) {
      const at = match.index ?? -1;
      if (html.lastIndexOf("<", at) > html.lastIndexOf(">", at)) continue; // inside a tag
      checked += 1;
      const covered = inside.some(([start, end]) => at >= start && at < end);
      expect(covered, `token "${match[0]}" at ${at} is outside every readout`).toBe(true);
    }
    // ...and there really are tokens to check (the law is not vacuous).
    expect(checked).toBeGreaterThanOrEqual(8);
  });

  it("ExploreView renders readouts only through the ProbabilityReadout component", () => {
    // P1-a2 amendment (conformance-preserving): the composition now mounts
    // the two readout instances through `TweeningReadout` (the narrow
    // per-target easing channel), which itself renders exactly one
    // `ProbabilityReadout`. The invariant is unchanged — the product has ONE
    // probability renderer, no second formatter, no readout-owned class or
    // attribute outside it — and the scan now covers the new source file.
    const source = sourceOf("ExploreView.tsx");
    const tween = sourceOf("TweeningReadout.tsx");
    const sources = `${source}\n${tween}`;
    expect(tween).toContain(
      'import { ProbabilityReadout, type ProbabilityReadoutProps } from "../components/ProbabilityReadout"'
    );
    expect(tween.match(/<ProbabilityReadout\b/g) ?? []).toHaveLength(1); // single renderer
    expect(source.match(/<TweeningReadout\b/g) ?? []).toHaveLength(2); // headline + vessels
    expect(source).not.toContain("<ProbabilityReadout"); // never mounted directly
    expect(sources).not.toContain("ct-prob-readout"); // class owned by the readout
    expect(sources).not.toMatch(/data-decision=/); // readout-owned attributes
  });
});

/* ------------------------------------------------------------------ *
 * F.2 - colour comes from the one ramp (via tokens), never a literal
 * ------------------------------------------------------------------ */

describe("law: chrome colour is token-only, probability colour is readout-only", () => {
  it("explore.css and the TSX sources contain no colour literal", () => {
    const css = sourceOf("explore.css");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\b(?:rgb|rgba|hsl|hsla|hwb|color-mix|lab|oklch)\(/);
    for (const { name, text } of appSources()) {
      expect(text, name).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(text, name).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\(/);
      expect(text, name).not.toContain("backgroundColor");
      expect(text, name).not.toContain("borderColor:");
    }
  });

  it("selection uses the accent token (never a probability colour of its own)", () => {
    const css = sourceOf("explore.css");
    expect(css).toMatch(/\[data-selected="true"\][^{]*\{[^}]*var\(--ct-color-accent\)/);
    expect(css).toMatch(/border-color:\s*var\(--ct-color-accent\)/);
  });

  it("hover is styled through tokens for every representation (shared channel)", () => {
    const css = sourceOf("explore.css");
    expect(css).toMatch(/\[data-hovered="true"\][^{]*\{[^}]*var\(--ct-color-surface-raised\)/);
    expect(css).toMatch(/\[data-hovered="true"\][^{]*\{[^}]*var\(--ct-focus-outline\)/);
  });
});

/* ------------------------------------------------------------------ *
 * F.3 - no clinical truth outside the store / no second registry
 * ------------------------------------------------------------------ */

describe("law: Explore reads truth only from the store and the registry", () => {
  it("no application source imports the engine, artifacts or a second registry", () => {
    for (const { name, text } of appSources()) {
      expect(text, name).not.toMatch(/from "\.\.\/domain/);
      expect(text, name).not.toMatch(/from "\.\.\/worker/);
      expect(text, name).not.toMatch(/from "\.\.\/manifest/);
      expect(text, name).not.toMatch(/model\.json|results\.json|registry\.json/);
      expect(text, name).not.toMatch(/fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage/);
    }
    // Identity comes from the injected registry object, never a literal list.
    const model = sourceOf("model.ts");
    expect(model).toContain('target.kind === "vessel"');
    expect(model).not.toMatch(/structureId === "LAD"[^\n]*structureId === "LCX"/);
  });

  it("vessel mapping follows a doctored registry, not hardcoded ids (mutation guard)", () => {
    const doctored: Registry = {
      ...registry,
      targets: registry.targets.map((target) =>
        target.id === "LAD" ? { ...target, structureId: "CUSTOM_LAD_NODE" } : target
      )
    };
    expect(targetIdForStructure(doctored, "CUSTOM_LAD_NODE")).toBe("LAD");
    // A hardcoded "structureId === LAD" mapping would return "LAD" here -> RED.
    expect(targetIdForStructure(doctored, "LAD")).toBeNull();
    expect(structureIdForTarget(doctored, "LAD")).toBe("CUSTOM_LAD_NODE");
    expect(targetIdForStructure(doctored, "NOT_IN_REGISTRY")).toBeNull();
    expect(structureIdForTarget(doctored, "CAD")).toBeNull(); // CAD has no structure
  });

  it("the stage never receives a vessel list of our own", () => {
    expect(vesselStructureIdOrder(registry)).toEqual(["LAD", "LCX", "RCA"]);
    expect(vesselTargets(registry).map((target) => target.id)).toEqual(["LAD", "LCX", "RCA"]);
    expect(buildSceneModel(captureState(createHarness()), registry)).toBeNull(); // no eval -> null
  });
});

/* ------------------------------------------------------------------ *
 * F.4 - copy vocabulary (C-13) over every explore file
 * ------------------------------------------------------------------ */

describe("law: C-13 copy lint over every file this unit owns", () => {
  it("no banned phrase appears in any explore source", () => {
    const files = [...APP_FILES, "explore.css", "exploreRender.test.tsx", "exploreInteractions.test.tsx", "exploreLaws.test.tsx", "evidenceRail.test.tsx", "TweeningReadout.test.tsx", "stableSnapshot.test.ts"];
    for (const name of files) {
      const findings = scanSource(sourceOf(name));
      const blocking = violations(findings);
      expect(blocking.map((f) => `${name}:${f.line} ${f.phrase}`)).toEqual([]);
    }
  });
});

/* ------------------------------------------------------------------ *
 * F.5 - choreography is store-driven, never React-state animation
 * ------------------------------------------------------------------ */

describe("law: animation rides the store's display channel", () => {
  it("no timers or clocks exist in the presentation code", () => {
    for (const { name, text } of appSources()) {
      expect(text, name).not.toMatch(/setTimeout\s*\(|setInterval\s*\(|Date\.now\s*\(/);
    }
    const source = sourceOf("ExploreView.tsx");
    expect(source).toContain("store.sampleDisplay()");
    expect(source).toContain("requestAnimationFrame(loop)");
    expect(source).toContain("cancelAnimationFrame(frame)");
    // The only React state is the typed intent-error notice - never a number.
    expect((source.match(/useState</g) ?? []).length).toBe(1);
    expect(source).toContain("useState<ComputeError | null>(null)");
    expect(source).not.toMatch(/useState<(?:number|string)/);
  });
});

/* ------------------------------------------------------------------ *
 * F.6 - pure coverage of ./model (presentation model)
 * ------------------------------------------------------------------ */

function captureState(h: ReturnType<typeof createHarness>): CorTwinStoreState {
  return h.state();
}

describe("model - registry-derived identity", () => {
  it("target labels come from the registry, falling back to the id", () => {
    expect(targetLabel(registry, "CAD")).toBe("CAD");
    expect(targetLabel(registry, "LAD")).toBe("LAD");
    expect(targetLabel(registry, "NOT_A_TARGET" as never)).toBe("NOT_A_TARGET");
  });

  it("structure URL comes from the verified manifest, else undefined", () => {
    const h = createHarness();
    expect(structureUrlOf(h.state())).toBe("synthetic");
    const noManifest = { ...h.state(), bundle: { ...h.state().bundle, manifest: null } };
    expect(structureUrlOf(noManifest)).toBeUndefined();
  });

  it("case label is the catalog label for the active case, the id otherwise", () => {
    const h = createHarness();
    expect(caseLabelOf(h.state())).toBe("Synthetic · complete-ish");
    const ghost = { ...h.state(), case: { ...h.state().case, id: "ghost" } };
    expect(caseLabelOf(ghost)).toBe("ghost");
  });
});

describe("model - displayed values are payload pass-through", () => {
  it("null before the first evaluation (designed empty state)", () => {
    const h = createHarness();
    expect(headlineReadout(h.state(), registry)).toBeNull();
    expect(vesselCardModels(h.state(), registry)).toEqual([]);
    expect(displayedProbability(h.state(), "CAD")).toBeNull();
    expect(displayedProbability(h.state(), "LAD")).toBeNull();
  });

  it("after an evaluation: cards mirror the payload, headline rides selectDisplayedCad", () => {
    const h = createHarness();
    answerEvaluations(h);
    settleDisplay(h);
    const state = h.state();
    const evaluation = state.eval.current;
    if (evaluation === null) throw new Error("expected an evaluation");

    const cards = vesselCardModels(state, registry);
    expect(cards.map((card) => card.targetId)).toEqual(["LAD", "LCX", "RCA"]);
    expect(cards.map((card) => card.structureId)).toEqual(["LAD", "LCX", "RCA"]);
    for (const card of cards) {
      const payload = evaluation.targets[card.targetId];
      expect(card.readout.value).toBe(payload.probability);
      expect(card.readout.threshold).toBe(payload.thresholdProbability);
      expect(card.readout.decision).toBe(payload.decision);
      expect(card.readout.reliability).toBe(payload.reliability);
      expect(card.readout.size).toBe("compact");
      expect(card.selected).toBe(false);
      expect(card.hovered).toBe(false);
    }
    expect(displayedProbability(state, "LCX")).toBe(evaluation.targets.LCX.probability);

    const headline = headlineReadout(state, registry);
    if (headline === null) throw new Error("expected a headline");
    expect(headline.value).toBe(evaluation.headlineCad.probability);
    expect(headline.threshold).toBe(evaluation.headlineCad.thresholdProbability);
    expect(headline.decision).toBe(evaluation.headlineCad.decision);
    expect(headline.reliability).toBe(evaluation.headlineCad.reliability);
    expect(headline.size).toBe("large");
    expect(headline.targetId).toBe("CAD");
  });

  it("non-finite payload values never surface as a number", () => {
    const h = createHarness();
    answerEvaluations(h);
    settleDisplay(h);
    const state = h.state();
    const evaluation = state.eval.current;
    if (evaluation === null) throw new Error("expected an evaluation");
    const broken: CorTwinStoreState = {
      ...state,
      eval: {
        ...state.eval,
        current: {
          ...evaluation,
          targets: {
            ...evaluation.targets,
            LCX: { ...evaluation.targets.LCX, probability: Number.NaN }
          }
        }
      }
    };
    expect(displayedProbability(broken, "LCX")).toBeNull();
    // The other targets still pass through; the broken one drops out of cards.
    expect(displayedProbability(broken, "LAD")).toBe(evaluation.targets.LAD.probability);
    const cards = vesselCardModels(broken, registry);
    expect(cards.map((card) => card.targetId)).toEqual(["LAD", "RCA"]);
  });

  it("while the display channel eases, the displayed number is the channel's slot", () => {
    const h = createHarness();
    answerEvaluations(h);
    const state = h.state();
    const evaluation = state.eval.current;
    if (evaluation === null) throw new Error("expected an evaluation");
    expect(state.display.running).toBe(true); // 400 ms window, not settled
    const easing: CorTwinStoreState = {
      ...state,
      display: { ...state.display, current: { ...state.display.current, LAD: 0.99 } }
    };
    expect(displayedProbability(easing, "LAD")).toBe(0.99);
    // Settled: the channel reports the payload exactly.
    settleDisplay(h);
    expect(displayedProbability(h.state(), "LAD")).toBe(evaluation.targets.LAD.probability);
  });
});

describe("model - inspector projection and bindings", () => {
  it("buildInspectorProps projects the frozen surface with binding identity", () => {
    const h = createHarness();
    answerEvaluations(h);
    settleDisplay(h);
    const bindings = createBindings(h.store);
    const props: ExploreInspectorProps = buildInspectorProps(h.state(), registry, bindings);
    expect(props.registry).toBe(registry);
    expect(props.caseSnapshot.id).toBe("hypo1");
    expect(props.caseSnapshot.provenance).toBe("hypothetical");
    expect(props.caseSnapshot.providedFeatures).toBe(h.state().case.providedFeatures);
    expect(props.evaluation).toBe(h.state().eval.current);
    expect(props.explanation).toBeNull();
    expect(props.evalStatus).toBe(h.state().eval.status);
    expect(props.stale).toBe(false);
    expect(props.onEditFeature).toBe(bindings.onSetValue); // one intent path
    expect(props.onSelectTarget).toBe(bindings.onSelectTarget);
    expect(props.onSelectFeature).toBe(bindings.onSelectFeature);
    expect(props.onHoverTarget).toBe(bindings.onHoverTarget);
  });

  it("the projection tracks selection, hover and staleness as state moves", () => {
    const h = createHarness();
    answerEvaluations(h);
    settleDisplay(h);
    const bindings = createBindings(h.store);
    bindings.onVesselSelect("LCX");
    bindings.onVesselHover("RCA");
    let props = buildInspectorProps(h.state(), registry, bindings);
    expect(props.selection).toEqual({
      targetId: "LCX",
      featureId: null,
      modalityId: null,
      hovered: { kind: "vessel", id: "RCA" }
    });
    h.store.intents.case.setValue("Age", 70);
    props = buildInspectorProps(h.state(), registry, bindings);
    expect(props.stale).toBe(true);
    expect(props.evalStatus).toBe("updating");
    expect(props.caseSnapshot.revision).toBe(2);
    // The stage's own view-model stays consistent with the same state.
    const scene = buildSceneModel(h.state(), registry);
    expect(scene?.selectedTargetId).toBe("LCX");
    expect(scene?.hoveredEntity).toEqual({ kind: "vessel", id: "RCA" });
  });
});

void makeEvaluation; // fixture re-export stays available for sibling suites
