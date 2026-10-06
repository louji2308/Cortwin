/**
 * P6-INSPECTOR-R3 — render evidence (Implementation_Plan P6 steps 10-13).
 *
 * Node-environment `renderToString` markup assertions, the house style of
 * this repo (no jsdom, no testing-library). Every scenario comes from
 * `./fixtures`, i.e. the shipped registry + model + cases run through the real
 * engine, and every expected number is read back out of the payload the props
 * carry — no probability, threshold, contribution or cohort statistic is typed
 * here (INV-04, AGENTS §7 law 8).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import type { FeatureId, FeatureValue } from "../../contracts";
import type { ExploreInspectorProps } from "../../explore/types";
import { displayText, fieldId } from "../../profile/model";
import * as C from "./copy";
import { buildInspectorViewModel, initialInspectorLocal, nextTab, type InspectorLocal } from "./model";
import { InspectorView } from "./Inspector";
import { registry, scenario, withoutTarget } from "./fixtures";

function html(props: ExploreInspectorProps, local?: Partial<InspectorLocal>): string {
  return renderToString(
    <InspectorView
      props={props}
      local={{ ...initialInspectorLocal(), ...local }}
      onLocal={() => undefined}
    />
  ).replace(/<!--.*?-->/g, "");
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** ProbabilityReadout's own percent formatting, mirrored for comparison. */
const pct = (probability: number): string => `${Math.round(probability * 100)}%`;

function feature(id: string) {
  const found = registry.features.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`registry feature not found: ${id}`);
  return found;
}

describe("Inspector — depth routing", () => {
  it("renders the designed empty state when there is no model response", () => {
    const h = html(scenario({ withEvaluation: false }));

    expect(h).toContain('data-inspector-depth="empty"');
    expect(h).toContain(`>${C.EMPTY_EVALUATION_TITLE}<`);
    expect(h).toContain(`>${C.EMPTY_EVALUATION_BODY}<`);
    expect(h).not.toContain("ct-prob-readout");
    expect(h).not.toContain(C.CASE_HEADING);
  });

  it("renders the designed empty state for a target the registry does not publish", () => {
    const h = html(scenario({ targetId: "RCA", registry: withoutTarget("RCA") }));

    expect(h).toContain('data-inspector-depth="empty"');
    expect(h).toContain(`>${C.UNKNOWN_TARGET_TITLE}<`);
    expect(h).toContain(`>${C.UNKNOWN_TARGET_BODY}<`);
    expect(h).not.toContain("ct-prob-readout");
  });

  it("renders Case depth with the headline readout and three vessel rows", () => {
    const props = scenario();
    const h = html(props);

    expect(h).toContain('data-inspector-depth="case"');
    expect(h).toContain('aria-label="Inspector"');
    expect(h).toContain(`>${C.CASE_HEADING}<`);
    expect(h).toContain(`>${C.CASE_HINT}<`);
    expect(h).toContain('data-headline="cad"');

    const vessels = registry.targets.filter((entry) => entry.kind === "vessel");
    expect(vessels.map((entry) => entry.id)).toEqual(["LAD", "LCX", "RCA"]);
    for (const vessel of vessels) {
      expect(h).toContain(`data-target-id="${vessel.id}"`);
      expect(h).toContain(`>${C.inspectAction(vessel.label)}<`);
    }

    // Headline number flows from the payload, not from source.
    expect(h).toContain(`>${pct(props.evaluation!.headlineCad.probability)}<`);

    expect(h).toContain(`>${C.MODALITY_HEADING}<`);
    expect(h).toContain(
      `>${C.observedSummary(
        props.evaluation!.observedFeatureIds.length,
        registry.features.length
      )}<`
    );
    for (const modality of registry.modalities) {
      expect(h).toContain(`data-modality="${modality.id}" data-provided="yes"`);
    }
  });

  it("shows the designed no-explanation state under Top reasons when none is loaded", () => {
    const h = html(scenario());
    expect(h).toContain(`>${C.EMPTY_EXPLANATION_TITLE}<`);
    expect(h).toContain(`>${C.EMPTY_EXPLANATION_BODY}<`);
  });

  it("renders real Top reason rows from the explanation payload once one is loaded", () => {
    const props = scenario({ explanationTargetId: "LAD" });
    const h = html(props);
    const contributions = props.explanation!.modalityContributions;

    expect(h).toContain(`aria-label="${C.TOP_REASONS_HEADING}"`);
    expect(contributions.length).toBeGreaterThan(0);
    expect(count(h, 'class="ct-ins-attr-row"')).toBe(contributions.length);
    expect(count(h, 'data-observed="yes"')).toBe(contributions.length);
    for (const contribution of contributions) {
      expect(h).toContain(`data-attribution-key="${contribution.modalityId}"`);
      expect(h).toContain(`>${C.signedContribution(contribution.contribution)}<`);
    }
  });

  it("renders Target depth with breadcrumb, tabs and the Why view", () => {
    const props = scenario({ targetId: "LAD" });
    const h = html(props);
    const registryTarget = registry.targets.find((entry) => entry.id === "LAD")!;

    expect(h).toContain('data-inspector-depth="target"');
    expect(h).toContain(`aria-label="${C.LOCATION_LABEL}"`);
    expect(h).toContain(`>${C.CASE_HEADING}<`);
    expect(h).toContain('aria-current="page"');
    expect(h).toContain(`>${registryTarget.label}<`);
    expect(h).toContain(`>${registryTarget.labelDefinition}<`);
    expect(h).toContain('data-headline="target"');

    expect(h).toContain(`aria-label="${C.VIEWS_LABEL}"`);
    expect(h).toContain(`>${C.WHY_TAB}<`);
    expect(h).toContain(`>${C.MEASUREMENTS_TAB}<`);
    expect(count(h, 'role="tab"')).toBe(2);
    expect(count(h, 'role="tabpanel"')).toBe(1);
    expect(h).toContain('id="ct-ins-panel-why"');
    expect(h).toContain('aria-labelledby="ct-ins-tab-why"');

    expect(h).toContain('data-view="why"');
    expect(h).toContain('data-template-id="');
    expect(h).toContain('data-margin="reference"');
    expect(h).toContain('data-margin="output"');
    expect(h).toContain(`>${C.DISPLAY_GROUPS_HEADING}<`);
    expect(h).toContain(`>${C.MODALITY_ROWS_HEADING}<`);
    expect(h).toContain(`>${C.MARGIN_NOTE}<`);
    expect(h).toContain(
      `>${C.signedContribution(props.explanation!.referenceMargin)}<`
    );
    expect(h).toContain(`>${C.signedContribution(props.explanation!.outputMargin)}<`);

    // Target readout number comes from the payload.
    expect(h).toContain(`>${pct(props.evaluation!.targets.LAD.probability)}<`);

    // Caveats rendered verbatim from the C-08 keys.
    expect(h).toContain(`>${C.CAVEATS_HEADING}<`);
    for (const key of props.explanation!.caveats) {
      expect(h).toContain(`>${C.CAVEAT_TEXT[key] ?? C.CAVEAT_FALLBACK}<`);
    }
  });

  it("renders the Measurements view with grouped, scoped rows", () => {
    const props = scenario({ targetId: "LAD" });
    const h = html(props, { tab: "measurements" });

    expect(h).toContain('data-view="measurements"');
    expect(h).toContain('id="ct-ins-panel-measurements"');
    expect(h).toContain('aria-labelledby="ct-ins-tab-measurements"');
    for (const heading of [
      C.COL_FEATURE,
      C.COL_VALUE,
      C.COL_COHORT,
      C.COL_ATTRIBUTION,
      C.COL_DIRECTION
    ]) {
      expect(h).toContain(`scope="col">${heading}<`);
    }
    expect(h).toContain(`>${C.COL_MODALITY}: <`);
    // react-dom/server 19.3 keeps React's `colSpan` spelling verbatim (pinned
    // stack); HTML parses attribute names case-insensitively, and the lowercase
    // JSX spelling is a TypeScript error plus a React dev warning, so the
    // group header is asserted exactly as the serializer emits it.
    expect(h).toContain('scope="colgroup" colSpan="5"');
    expect(h).toContain('scope="row"');

    for (const modality of registry.modalities) {
      expect(h).toContain(`data-modality="${modality.id}" data-provided="yes"`);
    }
    expect(count(h, "data-feature-id=")).toBe(registry.features.length);
    expect(count(h, 'data-observed="yes"')).toBe(
      props.evaluation!.observedFeatureIds.length
    );

    // Render-follows-props at the value cell: every rendered value is the
    // Profile formatter's output for this snapshot (or the approved
    // not-provided label) — never a typed patient number in component source
    // (AGENTS §7 law 8).
    for (const entry of registry.features) {
      const expected = props.evaluation!.observedFeatureIds.includes(entry.id)
        ? displayText(props.caseSnapshot.values[entry.id], undefined, true)
        : C.NOT_PROVIDED_LABEL;
      expect(h).toContain(`<span class="ct-ins-value">${expected}</span>`);
    }

    // Unit footnote state is registry-derived, never typed.
    expect(h.includes(C.UNIT_UNVERIFIED_NOTE)).toBe(
      registry.features.some((entry) => entry.unitStatus === "unverified")
    );
  });

  it("Why bars and displayed sums reconcile to the explanation total within 1e-6", () => {
    const props = scenario({ targetId: "LAD", explanationTargetId: "LAD" });
    const h = html(props);
    const explanation = props.explanation!;

    const featureSum = explanation.featureAttributions.reduce(
      (total, entry) => total + entry.contribution,
      0
    );
    const groupSum = explanation.displayGroups.reduce(
      (total, entry) => total + entry.contribution,
      0
    );
    const modalitySum = explanation.modalityContributions.reduce(
      (total, entry) => total + entry.contribution,
      0
    );

    expect(Math.abs(featureSum + explanation.referenceMargin - explanation.outputMargin)).toBeLessThanOrEqual(1e-6);
    expect(Math.abs(groupSum - featureSum)).toBeLessThanOrEqual(1e-6);
    expect(Math.abs(modalitySum - featureSum)).toBeLessThanOrEqual(1e-6);
    expect(Math.abs(modalitySum + explanation.referenceMargin - explanation.outputMargin)).toBeLessThanOrEqual(1e-6);

    // Displayed rows carry the payload's own numbers; the view never recomputes.
    // The display groups rendered are exactly the registry-declared ones
    // (Architecture §8: "The registry declares them; the engine sums them; the
    // UI shows the group first"); engine singleton bookkeeping ids are not
    // declared groups and are surfaced through modality/feature rows instead.
    expect(h).toContain(`>${C.signedContribution(explanation.referenceMargin)}<`);
    expect(h).toContain(`>${C.signedContribution(explanation.outputMargin)}<`);
    for (const group of registry.displayGroups) {
      const entry = explanation.displayGroups.find((item) => item.groupId === group.id);
      expect(entry).toBeDefined();
      expect(h).toContain(`>${C.signedContribution(entry!.contribution)}<`);
    }
    for (const entry of explanation.modalityContributions) {
      expect(h).toContain(`>${C.signedContribution(entry.contribution)}<`);
    }
  });
});

describe("Inspector — missingness and no-evidence states (INV-14)", () => {
  it("renders masked modalities as Not provided rows with no bar and no zero", () => {
    const props = scenario({ caseId: "hypo2", targetId: "LAD" });
    const h = html(props, { tab: "measurements" });
    const masked = registry.modalities.filter(
      (modality) => props.caseSnapshot.providedModalities[modality.id] !== true
    );
    expect(masked.length).toBeGreaterThan(0);

    for (const modality of masked) {
      expect(h).toContain(`data-modality="${modality.id}" data-provided="no"`);
    }
    expect(h).toContain(`>${C.NOT_PROVIDED_LABEL}<`);
    expect(h).toContain(`>${C.NOT_PROVIDED_NOTE}<`);

    const unobservedRows = h
      .split("<tr")
      .filter((chunk) => chunk.includes('data-observed="no"'));
    expect(unobservedRows.length).toBeGreaterThan(0);
    for (const row of unobservedRows) {
      expect(row).toContain(`>${C.NOT_PROVIDED_LABEL}<`);
      expect(row).toContain('data-col="attribution"');
      expect(row).not.toMatch(/data-col="attribution"[^<]*>-?\d/);
      expect(row).not.toContain("ct-ins-bar-fill");
      expect(row).not.toContain("ct-ins-dir-glyph");
      expect(row).not.toContain("ct-ins-dir-word");
    }
  });

  it("renders unobserved Top reason / Why rows hatched with the approved sentence", () => {
    const props = scenario({
      caseId: "hypo2",
      targetId: "LAD",
      explanationTargetId: "LAD"
    });
    const h = html(props);
    const unobserved = h
      .split('class="ct-ins-attr-row"')
      .filter((chunk) => chunk.startsWith(' data-observed="no"'));
    expect(unobserved.length).toBeGreaterThan(0);
    for (const row of unobserved) {
      expect(row).toContain("ct-ins-bar--none");
      expect(row).toContain(`>${C.NOT_PROVIDED_LABEL}<`);
      expect(row).toContain(C.NOT_PROVIDED_NOTE);
      expect(row).not.toContain("ct-ins-bar-fill");
    }
  });

  it("renders the no-evidence state for a blank case", () => {
    const caseDepth = html(scenario({ caseId: "blank" }));
    expect(caseDepth).toContain(`>${C.observedSummary(0, registry.features.length)}<`);
    for (const modality of registry.modalities) {
      expect(caseDepth).toContain(`data-modality="${modality.id}" data-provided="no"`);
    }

    const why = html(scenario({ caseId: "blank", targetId: "LAD" }));
    expect(why).toContain(`>${C.NO_EVIDENCE_TITLE}<`);
    expect(why).toContain(`>${C.NO_EVIDENCE_BODY}<`);

    const measurements = html(scenario({ caseId: "blank", targetId: "LAD" }), {
      tab: "measurements"
    });
    expect(measurements).toContain(`>${C.NO_EVIDENCE_TITLE}<`);
    expect(measurements).not.toContain("ct-ins-table");
  });
});

describe("Inspector — designed status states", () => {
  it("shows Updating… while computing, while updating, and when the selection is stale", () => {
    for (const options of [
      { evalStatus: "computing" as const },
      { evalStatus: "updating" as const },
      { stale: true }
    ]) {
      const h = html(scenario(options));
      expect(h).toContain('class="ct-ins-status" role="status"');
      expect(h).toContain(`>${C.UPDATING_TEXT}<`);
      expect(h).not.toContain(C.UNAVAILABLE_TEXT);
    }
  });

  it("shows the model-response-unavailable state on error", () => {
    const h = html(scenario({ evalStatus: "error" }));
    expect(h).toContain(`>${C.UNAVAILABLE_TEXT}<`);
    expect(h).toContain('data-tone="error"');
    expect(h).not.toContain(C.UPDATING_TEXT);
  });

  it("renders no status line when the response is current", () => {
    expect(html(scenario())).not.toContain('class="ct-ins-status"');
  });
});

describe("Inspector — depth-2 feature focus", () => {
  it("renders the registry-driven control for each encoding family", () => {
    const cases: Array<[string, string]> = [
      ["Age", "number"],
      ["DM", "checkbox"],
      ["BBB", "select"],
      ["Function Class", "radio"]
    ];
    for (const [featureId, control] of cases) {
      expect(feature(featureId)).toBeDefined();
      const h = html(scenario({ targetId: "LAD", featureId }));
      expect(h).toContain(`data-feature-focus="${featureId}"`);
      expect(h).toContain(`data-control="${control}"`);
      expect(h).toContain(`aria-label="${C.FOCUS_HEADING}"`);
      expect(h).toContain(`>${C.FOCUS_HEADING}<`);
      expect(h).toContain(`>${C.FOCUS_HINT}<`);
      expect(h).toContain(`id="${fieldId("ct-ins", featureId)}-messages"`);
      expect(h).toContain('aria-describedby=');
    }
  });

  it("uses the Profile form's range warning byte for byte", () => {
    const age = feature("Age");
    const note = C.OUT_OF_RANGE_NOTE(age.range.min, age.range.max);
    const outOfRange = { Age: age.range.max + 10 };

    expect(
      html(
        scenario({ targetId: "LAD", featureId: "Age", values: outOfRange })
      )
    ).toContain(`>${note}<`);
    expect(html(scenario({ targetId: "LAD", values: outOfRange }), {
      tab: "measurements"
    })).toContain(`>${note}<`);
    expect(html(scenario({ targetId: "LAD", featureId: "Age" }))).not.toContain(note);
  });

  it("shows the approved not-provided note for an unobserved focused feature", () => {
    const props = scenario({ caseId: "hypo2", targetId: "LAD", featureId: "BUN" });
    expect(props.evaluation!.observedFeatureIds).not.toContain("BUN");
    const h = html(props);
    expect(h).toContain('data-feature-focus="BUN"');
    expect(h).toContain('data-observed="no"');
    expect(h).toContain(C.NOT_PROVIDED_NOTE);
  });
});

describe("Inspector — accessibility structure", () => {
  it("wires the tablist, tabs and tabpanel together with roving tabindex", () => {
    const why = html(scenario({ targetId: "LAD" }));
    expect(why).toContain('role="tablist"');
    expect(why).toContain('aria-selected="true"');
    expect(why).toContain('aria-selected="false"');
    expect(why).toContain('tabindex="0"');
    expect(why).toContain('tabindex="-1"');
    expect(why).toContain('role="tabpanel"');

    const measurements = html(scenario({ targetId: "LAD" }), { tab: "measurements" });
    expect(measurements).toContain('aria-selected="false"');
    expect(measurements).toContain('id="ct-ins-panel-measurements"');
  });

  it("carries direction as glyph AND word, never colour alone", () => {
    const h = html(scenario({ targetId: "LAD", explanationTargetId: "LAD" }), {
      tab: "measurements"
    });
    expect(h).toContain('class="ct-ins-dir-glyph"');
    expect(h).toContain('class="ct-ins-dir-word"');
    for (const direction of ["positive", "negative", "neutral"] as const) {
      if (h.includes(C.DIRECTION_WORD[direction])) {
        expect(h).toContain(C.DIRECTION_GLYPH[direction]);
      }
    }
  });

  it("never renders a bare probability readout without decision, reliability and threshold", () => {
    for (const props of [
      scenario(),
      scenario({ targetId: "LAD" }),
      scenario({ caseId: "hypo2", targetId: "LCX" })
    ]) {
      const h = html(props);
      const readouts = count(h, "ct-prob-readout ct-prob-readout--");
      expect(readouts).toBeGreaterThan(0);
      expect(count(h, "data-decision=")).toBe(readouts);
      expect(count(h, "data-reliability=")).toBe(readouts);
      expect(count(h, "Threshold ")).toBe(readouts);
      expect(count(h, "Decision: ")).toBe(readouts);
      expect(count(h, "Reliability: ")).toBe(readouts);
    }
  });
});

describe("Inspector — source law and dispatch (P6-INSPECTOR-R5)", () => {
  it("dispatches onEditFeature and onSelectFeature with the exact frozen arguments", () => {
    const editLog: Array<{ featureId: FeatureId; value: FeatureValue }> = [];
    const selected: Array<FeatureId | null> = [];
    const props: ExploreInspectorProps = {
      ...scenario({ targetId: "LAD", featureId: "Age", editLog }),
      onSelectFeature: (featureId) => {
        selected.push(featureId);
      }
    };
    const age = feature("Age");
    const draft = String(age.range.max + 10);
    const patches: Array<Partial<InspectorLocal>> = [];
    const vm = buildInspectorViewModel(
      props,
      { ...initialInspectorLocal(), tab: "measurements", draftText: draft },
      { update: (patch) => patches.push(patch) }
    );

    expect(vm.focus).not.toBeNull();
    expect(vm.focus!.featureId).toBe("Age");
    vm.focus!.onApply();
    expect(editLog).toEqual([{ featureId: "Age", value: age.range.max + 10 }]);
    expect(patches).toEqual([{ message: C.EDIT_DISPATCHED, draftText: null }]);

    const ageRow = vm.measurementGroups!
      .flatMap((group) => group.rows)
      .find((row) => row.featureId === "Age");
    expect(ageRow).toBeDefined();
    ageRow!.onSelect();
    expect(selected).toEqual(["Age"]);
  });

  it("holds the runtime source law: no store, engine, worker or fixture import", () => {
    const forbidden = [
      /\.\.\/\.\.\/store/,
      /\.\.\/\.\.\/domain/,
      /\.\.\/\.\.\/worker/,
      /\.\.\/\.\.\/system/,
      /\.\.\/\.\.\/boot/,
      /zustand/,
      /from "\.\/fixtures"/
    ];
    for (const name of ["Inspector.tsx", "model.ts", "copy.ts", "readout.ts", "index.ts"]) {
      const source = readFileSync(new URL(name, import.meta.url), "utf8");
      for (const pattern of forbidden) {
        expect(`${name} matches ${pattern} => ${pattern.test(source)}`).toBe(
          `${name} matches ${pattern} => false`
        );
      }
    }
  });

  it("moves between the two tabs with arrows, Home and End", () => {
    expect(nextTab("why", "ArrowRight")).toBe("measurements");
    expect(nextTab("why", "ArrowDown")).toBe("measurements");
    expect(nextTab("measurements", "ArrowLeft")).toBe("why");
    expect(nextTab("measurements", "ArrowUp")).toBe("why");
    expect(nextTab("measurements", "Home")).toBe("why");
    expect(nextTab("why", "End")).toBe("measurements");
    expect(nextTab("why", "Enter")).toBeNull();
    expect(nextTab("why", "Tab")).toBeNull();
  });
});
