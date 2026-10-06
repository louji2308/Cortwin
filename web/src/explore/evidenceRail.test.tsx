import { readFileSync } from "node:fs";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Registry } from "../contracts";
import { EvidenceRail } from "../panels/evidence/EvidenceRail";
import type { EvidenceRailProps } from "../panels/evidence/types";
import {
  createHarness,
  disposeHarnesses,
  registry,
  type Harness
} from "../store/testFixtures";
import { answerEvaluations, settleDisplay } from "./exploreTestHarness";
import {
  buildEvidenceRailData,
  createBindings,
  nextBuildUpStep,
  type ExploreEvidenceData
} from "./model";
import { ExploreView } from "./ExploreView";

/**
 * P7-RAIL — the Evidence Rail mounted in the live Explore workspace.
 *
 * Projection, the Contracts 8.4 stage mask, the custom-subset warning
 * producer and the Build Up rule run against a real store harness; JSX-to-rail
 * wiring is asserted by source scan (the Explore suite's convention: effects
 * do not run under `renderToString`). Every assertion reads store or registry
 * truth: no probability is typed here, and the rail section is asserted to
 * carry none.
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

/** A ready harness: first evaluation answered and the display channel settled. */
function readyHarness(): Harness {
  const h = createHarness();
  answerEvaluations(h);
  settleDisplay(h);
  return h;
}

function renderWorkspace(h: Harness): string {
  inspector.captures = [];
  return renderToString(<ExploreView store={h.store} />).replace(/<!--.*?-->/g, "");
}

function renderRail(data: ExploreEvidenceData, overrides: Partial<EvidenceRailProps> = {}): string {
  return renderToString(
    <EvidenceRail
      stages={data.stages}
      currentStageId={data.currentStageId}
      customSubset={data.customSubset}
      buildUp={{ state: "idle" }}
      onSelectStage={() => undefined}
      onBuildUpToggle={() => undefined}
      {...overrides}
    />
  );
}

/** The rendered Evidence Rail section out of a full workspace render. */
function railSectionOf(workspaceHtml: string): string {
  const railAt = workspaceHtml.indexOf('data-testid="evidence-rail"');
  expect(railAt, "the workspace must mount the Evidence Rail").toBeGreaterThan(-1);
  const start = workspaceHtml.lastIndexOf("<section", railAt);
  const inspectorAt = workspaceHtml.indexOf('aria-label="Inspector"');
  expect(inspectorAt, "the inspector section must follow the rail").toBeGreaterThan(railAt);
  const end = workspaceHtml.lastIndexOf("<section", inspectorAt);
  return workspaceHtml.slice(start, end === -1 ? undefined : end);
}

/** `data-provided` per rail row, keyed by the row's modality label. */
function railRowStates(railHtml: string): Record<string, string> {
  const states: Record<string, string> = {};
  for (const match of railHtml.matchAll(
    /<li class="ct-ev-mod" data-provided="(yes|no)"[^>]*>([\s\S]*?)<\/li>/g
  )) {
    const label =
      /ct-ev-mod-label">([^<]+)</.exec(match[2] ?? "")?.[1].replace(/&amp;/g, "&") ?? "?";
    states[label] = match[1] ?? "?";
  }
  return states;
}

/* ------------------------------------------------------------------ *
 * Projection — registry ladder in, case observation truth out
 * ------------------------------------------------------------------ */

describe("projection: registry ladder in, case observation truth out", () => {
  it("builds the cumulative stages with registry labels and honest provided flags", () => {
    const h = readyHarness();
    const data = buildEvidenceRailData(h.state(), registry);
    expect(data.stages.map((stage) => stage.id)).toEqual([
      "history",
      "exam",
      "ecg",
      "labs",
      "echo"
    ]);
    expect(data.stages.map((stage) => stage.label)).toEqual([
      "History",
      "Exam & symptoms",
      "ECG",
      "Labs",
      "Echo"
    ]);
    expect(data.stages.map((stage) => stage.modalities.map((modality) => modality.id))).toEqual([
      ["history"],
      ["history", "exam"],
      ["history", "exam", "ecg"],
      ["history", "exam", "ecg", "labs"],
      ["history", "exam", "ecg", "labs", "echo"]
    ]);
    // The default case observes every modality, so every row reads provided.
    expect(data.stages.every((stage) => stage.modalities.every((modality) => modality.provided))).toBe(
      true
    );
    expect(data.currentStageId).toBeNull();
    expect(data.customSubset).toBe(false);
  });

  it("rows follow the case (mutation guard: withholding flips exactly its rows)", () => {
    const h = readyHarness();
    expect(h.store.intents.case.setModalityProvided("labs", false).ok).toBe(true);
    const data = buildEvidenceRailData(h.state(), registry);
    expect(data.stages[3].modalities.map((modality) => modality.provided)).toEqual([
      true,
      true,
      true,
      false
    ]);
    expect(data.stages[4].modalities.map((modality) => modality.provided)).toEqual([
      true,
      true,
      true,
      false,
      true
    ]);
    expect(data.stages[2].modalities.every((modality) => modality.provided)).toBe(true);
  });

  it("labels come from the injected registry, never a literal (mutation guard)", () => {
    const h = readyHarness();
    const doctored: Registry = {
      ...registry,
      modalities: registry.modalities.map((modality) =>
        modality.id === "ecg" ? { ...modality, label: "ECG lead trace" } : modality
      )
    };
    const data = buildEvidenceRailData(h.state(), doctored);
    expect(data.stages[2].label).toBe("ECG lead trace");
    expect(data.stages[2].modalities[2].label).toBe("ECG lead trace");
    // With no labels in the registry at all, the stage id is the honest fallback.
    const bare: Registry = { ...registry, modalities: [] };
    expect(buildEvidenceRailData(h.state(), bare).stages[2].label).toBe("ecg");
  });
});

/* ------------------------------------------------------------------ *
 * Contracts 8.4 L386 — stage selection applies the cumulative mask
 * ------------------------------------------------------------------ */

describe("Contracts 8.4 L386: selecting a stage masks through Profile's own intent", () => {
  it("provides the stage's prefix and withholds the rest, one write per changed modality", () => {
    const h = readyHarness();
    const bindings = createBindings(h.store);
    const revisionBefore = h.state().case.revision;
    const featuresBefore = structuredClone(h.state().case.providedFeatures);

    bindings.onSelectStage("history");
    expect(h.state().selection.stageId).toBe("history");
    expect(h.state().case.providedModalities).toEqual({
      history: true,
      exam: false,
      ecg: false,
      labs: false,
      echo: false
    });
    // Four modalities changed; each write bumps the revision (C-09), nothing else.
    expect(h.state().case.revision).toBe(revisionBefore + 4);
    expect(h.state().case.providedFeatures).toEqual(featuresBefore); // modality mask only

    bindings.onSelectStage("ecg");
    expect(h.state().case.providedModalities).toEqual({
      history: true,
      exam: true,
      ecg: true,
      labs: false,
      echo: false
    });
    expect(h.state().case.revision).toBe(revisionBefore + 6); // exam + ecg provided
    // Re-selecting an unchanged stage writes nothing at all (diffed mask).
    const revisionStable = h.state().case.revision;
    bindings.onSelectStage("ecg");
    expect(h.state().case.revision).toBe(revisionStable);
  });

  it("an unknown stage selects without masking (no invented truth)", () => {
    const h = readyHarness();
    const bindings = createBindings(h.store);
    const revisionBefore = h.state().case.revision;
    bindings.onSelectStage("not-a-stage");
    expect(h.state().selection.stageId).toBe("not-a-stage");
    expect(h.state().case.revision).toBe(revisionBefore);
    expect(h.state().case.providedModalities).toEqual({
      history: true,
      exam: true,
      ecg: true,
      labs: true,
      echo: true
    });
    // The rail resolves it to nothing: no chip current, the designed empty state.
    const html = renderRail(buildEvidenceRailData(h.state(), registry));
    expect(html).toContain('data-testid="no-stage-selected"');
    expect(html).not.toContain('aria-current="step"');
  });
});

/* ------------------------------------------------------------------ *
 * Contracts 8.4 L389 — the custom-subset warning producer
 * ------------------------------------------------------------------ */

describe("Contracts 8.4 L389: the custom-subset warning producer", () => {
  it("flags an off-ladder modality set, keeps it through chip masking, clears on reset", () => {
    const h = readyHarness();
    const bindings = createBindings(h.store);
    expect(h.state().case.customSubset).toBe(false);

    bindings.onSetModalityProvided("echo", false); // exactly stage labs: still on the ladder
    expect(h.state().case.providedModalities).toEqual({
      history: true,
      exam: true,
      ecg: true,
      labs: true,
      echo: false
    });
    expect(h.state().case.customSubset).toBe(false);

    bindings.onSetModalityProvided("ecg", false); // history + exam + labs: no cumulative stage
    expect(h.state().case.customSubset).toBe(true);

    bindings.onSelectStage("history"); // back onto a cumulative stage: the warning stays (L389)
    expect(h.state().case.customSubset).toBe(true);

    bindings.onReset(); // the store clears the flag only on case reset/select
    expect(h.state().case.customSubset).toBe(false);
    expect(h.state().case.providedModalities.echo).toBe(true);
  });

  it("flags a feature-observation set that differs from the case definition", () => {
    const h = readyHarness();
    const bindings = createBindings(h.store);
    expect(h.state().case.customSubset).toBe(false);

    bindings.onSetFeatureProvided("Age", false);
    expect(h.state().case.customSubset).toBe(true);

    bindings.onReset();
    expect(h.state().case.customSubset).toBe(false);

    // A value edit of an already-observed feature is not a subset change.
    bindings.onSetValue("Age", 71);
    expect(h.state().case.customSubset).toBe(false);
    expect(h.state().case.values.Age).toBe(71);
  });
});

/* ------------------------------------------------------------------ *
 * Contracts 8.4 L388 — Build Up, one stage per settled real evaluation
 * ------------------------------------------------------------------ */

describe("Build Up: one stage per settled real evaluation (L388)", () => {
  const ladder = ["history", "exam", "ecg", "labs", "echo"].map((id) => ({ id }));

  it("advances only when the evaluation settled and the display finished easing", () => {
    expect(nextBuildUpStep(ladder, "history", "ready", false)).toEqual({
      kind: "advance",
      stageId: "exam"
    });
    expect(nextBuildUpStep(ladder, "labs", "ready", false)).toEqual({
      kind: "advance",
      stageId: "echo"
    });
    expect(nextBuildUpStep(ladder, "history", "updating", false)).toEqual({ kind: "wait" });
    expect(nextBuildUpStep(ladder, "history", "computing", false)).toEqual({ kind: "wait" });
    expect(nextBuildUpStep(ladder, "history", "idle", false)).toEqual({ kind: "wait" });
    expect(nextBuildUpStep(ladder, "history", "ready", true)).toEqual({ kind: "wait" });
  });

  it("completes on the last stage and aborts on error or a broken ladder", () => {
    expect(nextBuildUpStep(ladder, "echo", "ready", false)).toEqual({ kind: "done" });
    expect(nextBuildUpStep(ladder, "history", "error", false)).toEqual({ kind: "abort" });
    expect(nextBuildUpStep(ladder, null, "ready", false)).toEqual({ kind: "abort" });
    expect(nextBuildUpStep(ladder, "not-a-stage", "ready", false)).toEqual({ kind: "abort" });
    expect(nextBuildUpStep([], null, "ready", false)).toEqual({ kind: "abort" });
  });
});

/* ------------------------------------------------------------------ *
 * Mount — the rail inside the live workspace, store-driven
 * ------------------------------------------------------------------ */

describe("mounted in the live workspace", () => {
  it("renders five registry chips, the caveat, Build Up and the designed empty state", () => {
    const h = readyHarness();
    const html = renderWorkspace(h);
    expect(inspector.captures).toHaveLength(1);
    expect(html).toContain('data-testid="evidence-rail"');
    expect(html).toContain('data-testid="evidence-caveat"');
    expect((html.match(/data-testid="stage-chip-/g) ?? []).length).toBe(5);
    expect(html).toContain('data-testid="stage-chip-history"');
    expect(html).toContain('data-testid="stage-chip-echo"');
    expect(html).toContain('data-testid="no-stage-selected"');
    expect(html).toContain('data-testid="build-up-button"');
    expect(html).toContain('data-state="idle"');
    expect(html).not.toContain('aria-current="step"');
    expect(html).not.toContain('data-testid="custom-subset-warning"');
  });

  it("the rail section carries no probability, no readout and no percent token", () => {
    const h = readyHarness();
    const rail = railSectionOf(renderWorkspace(h));
    expect(rail).toContain('data-testid="evidence-rail"');
    expect(rail).toContain('data-testid="stage-chip-labs"');
    expect(rail).not.toContain('data-testid="stage-panel"'); // no stage selected yet
    expect(rail).not.toContain("ct-prob-readout");
    expect(rail).not.toContain("%");
  });

  it("stage masking is one truth: rail rows and the Profile section agree", () => {
    const h = readyHarness();
    const bindings = createBindings(h.store);
    bindings.onSelectStage("ecg"); // mask: labs and echo withheld

    let html = renderWorkspace(h);
    expect(html).toMatch(/data-testid="stage-chip-ecg"[^>]*aria-current="step"/);
    const rail = railSectionOf(html);
    expect(railRowStates(rail)).toEqual({ History: "yes", "Exam & symptoms": "yes", ECG: "yes" });
    // The Profile sections in the same render say exactly the same thing.
    expect(html).toContain('data-modality-id="ecg" data-provided="true"');
    expect(html).toContain('data-modality-id="labs" data-provided="false"');
    expect(html).toContain('data-modality-id="echo" data-provided="false"');
    expect(html).not.toContain('data-testid="custom-subset-warning"');

    // Withholding one observed modality off the ladder: the rail row, the
    // Profile section and the unvalidated warning all move together.
    bindings.onSetModalityProvided("exam", false);
    html = renderWorkspace(h);
    const updated = railSectionOf(html);
    expect(railRowStates(updated)).toEqual({ History: "yes", "Exam & symptoms": "no", ECG: "yes" });
    expect(html).toContain('data-modality-id="exam" data-provided="false"');
    expect(html).toContain('data-testid="custom-subset-warning"');
    expect(html).toContain('data-testid="build-up-button"');
  });

  it("the host is mounted with store truth and bindings (source scan)", () => {
    const view = readFileSync(new URL("./ExploreView.tsx", import.meta.url), "utf8");
    expect(view).toContain('import { EvidenceRailHost } from "./EvidenceRailHost"');
    expect(view).toContain(
      "<EvidenceRailHost state={state} registry={registry} bindings={bindings} />"
    );

    const host = readFileSync(new URL("./EvidenceRailHost.tsx", import.meta.url), "utf8");
    expect(host).toContain("buildEvidenceRailData(state, registry)");
    expect(host).toContain("onSelectStage={handleSelectStage}");
    expect(host).toContain("onBuildUpToggle={handleToggle}");
    expect(host).toContain("nextBuildUpStep(");
    expect(host).toContain('if (buildUp !== "playing") return;');
    expect(host).toContain("bindings.onSelectStage(step.stageId)");
    // Law F.5: the pacing rides real evaluations, never a timer or a clock.
    expect(host).not.toMatch(/setTimeout\s*\(|setInterval\s*\(|Date\.now\s*\(/);

    const model = readFileSync(new URL("./model.ts", import.meta.url), "utf8");
    expect(model).toContain("store.intents.case.enableCustomSubset()");
    expect(model).toContain("stage.modalitiesThrough");
    expect(model).toContain("onSelectStage(stageId)");
  });
});
