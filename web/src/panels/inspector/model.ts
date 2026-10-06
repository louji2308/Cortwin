import type {
  EvalStatus,
  FeatureId,
  FeatureValue,
  ModalityId,
  Registry,
  RegistryFeature,
  RegistryTarget,
  TargetId
} from "../../contracts";
import type { ProbabilityReadoutProps } from "../../components/ProbabilityReadout";
import type { ExploreInspectorProps } from "../../explore/types";
import { commitBinary, commitChoice, commitTextEdit } from "../../profile/handlers";
import type {
  BinaryOutcome,
  ChoiceOutcome,
  DispatchPort,
  EditOutcome
} from "../../profile/handlers";
import {
  controlKindFor,
  displayText,
  featuresForModality,
  fieldId,
  levelMatches,
  modalitiesInStageOrder,
  optionsFor,
  outOfRange,
  parseEntry
} from "../../profile/model";
import type { ControlKind } from "../../profile/model";
import type { FieldControlVm } from "../../profile/view";
import * as C from "./copy";

/**
 * P6-INSPECTOR-R3 - pure view-model for the Inspector (Implementation_Plan P6
 * steps 10-13, Contracts 8.5 `C-08` Inspector projection).
 *
 * Every value the Inspector renders is projected here from the frozen
 * `ExploreInspectorProps` contract: the Registry supplies identity, labels,
 * ranges and levels; the C-08 `Evaluation`/`Explanation` payloads supply every
 * number. This module contains **no** clinical literal, no threshold, no
 * cohort statistic and no probability formatting - probabilities are passed
 * through verbatim inside a complete `ProbabilityReadoutProps` (INV-07/C-12),
 * so the component has nothing to bare-render.
 *
 * Pure: no DOM, no React, no store, no engine, no artifact I/O. The React
 * layer and the tests call the SAME builder, so "the Inspector displayed it"
 * is always the code path under test. Local UI state (tab, expansion, edit
 * draft) is passed in and written back through the injected `LocalSink`; it is
 * presentation state only and never becomes clinical truth.
 */

/* ------------------------------------------------------------------ *
 * Local (presentation) state
 * ------------------------------------------------------------------ */

export type InspectorTab = "why" | "measurements";

export type InspectorLocal = {
  tab: InspectorTab;
  expandedModalityId: string | null;
  draftText: string | null;
  message: string | null;
};

export const initialInspectorLocal = (): InspectorLocal => ({
  tab: "why",
  expandedModalityId: null,
  draftText: null,
  message: null
});

export type LocalSink = { update(patch: Partial<InspectorLocal>): void };

/** Arrow/Home/End over the two-tab list; null = the key moves nothing. */
export function nextTab(current: InspectorTab, key: string): InspectorTab | null {
  if (key === "ArrowRight" || key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowUp") {
    return current === "why" ? "measurements" : "why";
  }
  if (key === "Home") return "why";
  if (key === "End") return "measurements";
  return null;
}

/* ------------------------------------------------------------------ *
 * View-model types
 * ------------------------------------------------------------------ */

export type DirectionWord = C.DirectionWord;

export type InspectorDepth = "empty" | "case" | "target";

export type StatusVm = { text: string | null; tone: "info" | "error" | null };

export type EmptyVm = { kind: "evaluation" | "unknown-target"; title: string; body: string };

/** A complete `ProbabilityReadoutProps` - the only shape a probability takes. */
export type ReadoutVm = ProbabilityReadoutProps;

export type TargetRowVm = {
  targetId: TargetId;
  label: string;
  definition: string;
  selected: boolean;
  hovered: boolean;
  readout: ReadoutVm | null;
  onSelect: () => void;
  onHover: (hovered: boolean) => void;
};

export type ModalityRowVm = {
  modalityId: string;
  label: string;
  provided: boolean;
  observedCount: number;
  total: number;
  selected: boolean;
  onSelect: (() => void) | null;
};

/**
 * One attribution row. `observed === false` carries NO contribution, NO bar
 * and NO direction - only the approved not-provided note (INV-14: never a
 * zero bar for unobserved evidence).
 */
export type AttributionRowVm = {
  key: string;
  label: string;
  subLabel: string | null;
  observed: boolean;
  contribution: number | null;
  signed: string | null;
  direction: DirectionWord | null;
  barPercent: number | null;
  note: string | null;
  expandable: boolean;
  expanded: boolean;
  onSelect: (() => void) | null;
};

export type MarginRowVm = { key: string; label: string; margin: number };

export type WhyVm = {
  referenceRow: MarginRowVm;
  outputRow: MarginRowVm;
  groupRows: AttributionRowVm[];
  modalityRows: AttributionRowVm[];
  featureRows: AttributionRowVm[];
  expandedModalityLabel: string | null;
  hasEvidence: boolean;
  templateId: string | null;
};

export type MeasurementRowVm = {
  featureId: FeatureId;
  label: string;
  observed: boolean;
  valueText: string;
  unitText: string | null;
  cohortText: string | null;
  contribution: number | null;
  signed: string | null;
  direction: DirectionWord | null;
  rangeNote: string | null;
  selected: boolean;
  onSelect: () => void;
};

export type MeasurementGroupVm = {
  modalityId: ModalityId;
  label: string;
  provided: boolean;
  observedCount: number;
  total: number;
  rows: MeasurementRowVm[];
};

export type FeatureFocusVm = {
  featureId: FeatureId;
  controlId: string;
  label: string;
  modalityLabel: string;
  observed: boolean;
  controlKind: ControlKind;
  control: FieldControlVm;
  displayValue: string;
  draftText: string;
  committedText: string;
  message: string | null;
  invalid: boolean;
  rangeNote: string | null;
  unitText: string | null;
  onClose: () => void;
  onDraft: (text: string) => void;
  onCancel: () => void;
  onApply: () => void;
  onChoose: (optionValue: string) => void;
  onToggle: (checked: boolean) => void;
};

export type InspectorViewModel = {
  label: string;
  depth: InspectorDepth;
  status: StatusVm;
  empty: EmptyVm | null;
  breadcrumb: { backLabel: string | null; currentLabel: string | null; definition: string | null };
  headline: ReadoutVm | null;
  targetRows: TargetRowVm[];
  modalityRows: ModalityRowVm[];
  topReasons: AttributionRowVm[] | null;
  observedSummary: string | null;
  targetId: TargetId | null;
  targetLabel: string | null;
  readout: ReadoutVm | null;
  tab: InspectorTab;
  tabs: Array<{ id: InspectorTab; label: string; selected: boolean; tabIndex: number }>;
  why: WhyVm | null;
  measurementGroups: MeasurementGroupVm[] | null;
  focus: FeatureFocusVm | null;
  caveats: string[];
  unitNote: string | null;
  revision: number;
};

/* ------------------------------------------------------------------ *
 * Small helpers (registry lookups, formatting)
 * ------------------------------------------------------------------ */

function findTarget(registry: Registry, targetId: TargetId): RegistryTarget | null {
  return registry.targets.find((entry) => entry.id === targetId) ?? null;
}

function vesselTargets(registry: Registry): RegistryTarget[] {
  return registry.targets.filter((entry) => entry.kind === "vessel");
}

function featureById(registry: Registry, featureId: string): RegistryFeature | null {
  return registry.features.find((entry) => entry.id === featureId) ?? null;
}

function modalityLabel(registry: Registry, modalityId: string): string {
  return registry.modalities.find((entry) => entry.id === modalityId)?.label ?? modalityId;
}

/** Target label is never a bare id fallback the registry did not publish. */
function targetLabel(registry: Registry, targetId: TargetId): string {
  return findTarget(registry, targetId)?.label ?? targetId;
}

function isFiniteProbability(value: number): boolean {
  return Number.isFinite(value);
}

function readoutFor(
  props: ExploreInspectorProps,
  targetId: TargetId,
  size: "compact" | "large"
): ReadoutVm | null {
  const evaluation = props.evaluation;
  if (evaluation === null) return null;
  const payload = evaluation.targets[targetId];
  if (payload === undefined || !isFiniteProbability(payload.probability)) return null;
  return {
    value: payload.probability,
    targetId,
    targetLabel: targetLabel(props.registry, targetId),
    threshold: payload.thresholdProbability,
    decision: payload.decision,
    reliability: payload.reliability,
    size
  };
}

function headlineReadout(props: ExploreInspectorProps): ReadoutVm | null {
  const evaluation = props.evaluation;
  if (evaluation === null) return null;
  const headline = evaluation.headlineCad;
  if (!isFiniteProbability(headline.probability)) return null;
  const sourceTargetId =
    headline.valueSourceTargetId === "CAD" ? undefined : headline.valueSourceTargetId;
  return {
    value: headline.probability,
    targetId: "CAD",
    targetLabel: targetLabel(props.registry, "CAD"),
    threshold: headline.thresholdProbability,
    decision: headline.decision,
    reliability: headline.reliability,
    size: "large",
    ...(sourceTargetId === undefined ? {} : { sourceTargetId })
  };
}

/** Signed, two-decimal display of a model attribution value. */
function signed(value: number | null): string | null {
  return value === null ? null : C.signedContribution(value);
}

function directionWord(direction: "positive" | "negative" | "neutral" | null): DirectionWord | null {
  return direction === null ? null : direction;
}

function statusFor(evalStatus: EvalStatus, stale: boolean): StatusVm {
  if (evalStatus === "error") return { text: C.UNAVAILABLE_TEXT, tone: "error" };
  if (evalStatus === "computing" || evalStatus === "updating" || stale) {
    return { text: C.UPDATING_TEXT, tone: "info" };
  }
  return { text: null, tone: null };
}

function messageForOutcome(
  outcome: EditOutcome | ChoiceOutcome | BinaryOutcome
): string {
  switch (outcome.kind) {
    case "dispatched":
      return C.EDIT_DISPATCHED;
    case "empty":
      return C.EMPTY_INPUT_TEXT;
    case "invalid":
      return C.INVALID_NUMBER_TEXT;
    case "readonly":
      return C.READ_ONLY_TEXT;
    default:
      return C.UNKNOWN_OPTION_TEXT;
  }
}

/** Bar width as a percentage of the largest displayed absolute contribution. */
function scaleBars(rows: AttributionRowVm[]): void {
  let max = 0;
  for (const row of rows) {
    if (row.contribution === null) continue;
    const magnitude = Math.abs(row.contribution);
    if (magnitude > max) max = magnitude;
  }
  const span = max > 0 ? max : 1;
  for (const row of rows) {
    row.barPercent =
      row.contribution === null ? null : Math.round((Math.abs(row.contribution) / span) * 100);
  }
}

/* ------------------------------------------------------------------ *
 * Attribution rows
 * ------------------------------------------------------------------ */

type RowSeed = {
  key: string;
  label: string;
  subLabel: string | null;
  observed: boolean;
  contribution: number | null;
  direction: DirectionWord | null;
  note: string | null;
  expandable: boolean;
  expanded: boolean;
  onSelect: (() => void) | null;
};

function toRow(seed: RowSeed): AttributionRowVm {
  return { ...seed, signed: signed(seed.contribution), barPercent: null };
}

/** Observed rows first, biggest absolute contribution first, then not-provided. */
function orderAttributions(seeds: RowSeed[]): RowSeed[] {
  const observed = seeds.filter((seed) => seed.observed);
  const missing = seeds.filter((seed) => !seed.observed);
  observed.sort((a, b) => Math.abs(b.contribution ?? 0) - Math.abs(a.contribution ?? 0));
  return [...observed, ...missing];
}

/* ------------------------------------------------------------------ *
 * Builder
 * ------------------------------------------------------------------ */

export function buildInspectorViewModel(
  props: ExploreInspectorProps,
  local: InspectorLocal,
  sink: LocalSink
): InspectorViewModel {
  const { registry, caseSnapshot, evaluation, explanation, selection } = props;
  const status = statusFor(props.evalStatus, props.stale);
  const observed = new Set(evaluation === null ? [] : evaluation.observedFeatureIds);
  const selectedTargetId = selection.targetId;
  const registryTarget = selectedTargetId === null ? null : findTarget(registry, selectedTargetId);

  let depth: InspectorDepth;
  let empty: EmptyVm | null = null;
  if (evaluation === null) {
    depth = "empty";
    empty = { kind: "evaluation", title: C.EMPTY_EVALUATION_TITLE, body: C.EMPTY_EVALUATION_BODY };
  } else if (selectedTargetId !== null && registryTarget === null) {
    depth = "empty";
    empty = { kind: "unknown-target", title: C.UNKNOWN_TARGET_TITLE, body: C.UNKNOWN_TARGET_BODY };
  } else {
    depth = selectedTargetId === null ? "case" : "target";
  }

  const caveats =
    explanation === null
      ? []
      : explanation.caveats.map((key) => C.CAVEAT_TEXT[key] ?? C.CAVEAT_FALLBACK);

  const vm: InspectorViewModel = {
    label: C.INSPECTOR_LABEL,
    depth,
    status,
    empty,
    breadcrumb: {
      backLabel: depth === "target" && registryTarget !== null ? C.CASE_HEADING : null,
      currentLabel: depth === "target" && registryTarget !== null ? registryTarget.label : null,
      definition: depth === "target" && registryTarget !== null ? registryTarget.labelDefinition : null
    },
    headline: null,
    targetRows: [],
    modalityRows: [],
    topReasons: null,
    observedSummary:
      evaluation === null ? null : C.observedSummary(observed.size, registry.features.length),
    targetId: depth === "target" && registryTarget !== null ? registryTarget.id : null,
    targetLabel: depth === "target" && registryTarget !== null ? registryTarget.label : null,
    readout: null,
    tab: local.tab,
    tabs: [
      { id: "why", label: C.WHY_TAB, selected: local.tab === "why", tabIndex: local.tab === "why" ? 0 : -1 },
      {
        id: "measurements",
        label: C.MEASUREMENTS_TAB,
        selected: local.tab === "measurements",
        tabIndex: local.tab === "measurements" ? 0 : -1
      }
    ],
    why: null,
    measurementGroups: null,
    focus: null,
    caveats,
    unitNote: registry.features.some((feature) => feature.unitStatus === "unverified")
      ? C.UNIT_UNVERIFIED_NOTE
      : null,
    revision: caseSnapshot.revision
  };

  if (depth === "empty") return vm;

  /* ---- shared: modality completeness (mask truth, one per thing) ---- */
  vm.modalityRows = modalitiesInStageOrder(registry).map((modality) => {
    const features = featuresForModality(registry, modality.id);
    let count = 0;
    for (const feature of features) {
      if (observed.has(feature.id)) count += 1;
    }
    return {
      modalityId: modality.id,
      label: modality.label,
      provided: count > 0,
      observedCount: count,
      total: features.length,
      selected: selection.modalityId === modality.id,
      onSelect: null
    };
  });

  /* ---- shared: feature focus (Depth 2) ---- */
  const focusFeature =
    selection.featureId === null ? null : featureById(registry, selection.featureId);
  if (focusFeature !== null) {
    vm.focus = buildFocus(props, focusFeature, local, sink, observed);
  }

  /* ---- Case depth ---- */
  if (depth === "case") {
    vm.headline = headlineReadout(props);
    vm.targetRows = vesselTargets(registry).map((target) => {
      const readout = readoutFor(props, target.id, "compact");
      return {
        targetId: target.id,
        label: target.label,
        definition: target.labelDefinition,
        selected: false,
        hovered: selection.hovered?.kind === "vessel" && selection.hovered.id === target.id,
        readout,
        onSelect: () => props.onSelectTarget(target.id),
        onHover: (hovered: boolean) => props.onHoverTarget?.(hovered ? target.id : null)
      };
    });
    vm.topReasons = buildTopReasons(props);
    return vm;
  }

  /* ---- Target depth ---- */
  const target = registryTarget as RegistryTarget;
  vm.readout = readoutFor(props, target.id, "large");

  if (local.tab === "measurements") {
    vm.measurementGroups = buildMeasurements(props, observed, selection);
  } else {
    vm.why = buildWhy(props, observed, local, sink);
  }
  return vm;
}

/* ------------------------------------------------------------------ *
 * Case depth: top modality reasons
 * ------------------------------------------------------------------ */

function buildTopReasons(props: ExploreInspectorProps): AttributionRowVm[] | null {
  const explanation = props.explanation;
  if (explanation === null) return null;
  const { registry } = props;
  const byId = new Map(explanation.modalityContributions.map((entry) => [entry.modalityId, entry]));

  const seeds: RowSeed[] = modalitiesInStageOrder(registry).map((modality) => {
    const entry = byId.get(modality.id);
    return {
      key: modality.id,
      label: modality.label,
      subLabel: null,
      observed: entry !== undefined,
      contribution: entry === undefined ? null : entry.contribution,
      direction: entry === undefined ? null : directionOf(entry.contribution),
      note: entry === undefined ? C.NOT_PROVIDED_NOTE : null,
      expandable: false,
      expanded: false,
      onSelect: null
    };
  });

  const rows = orderAttributions(seeds).map(toRow);
  scaleBars(rows);
  return rows;
}

function directionOf(value: number): DirectionWord {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "neutral";
}

/* ------------------------------------------------------------------ *
 * Why view
 * ------------------------------------------------------------------ */

function buildWhy(
  props: ExploreInspectorProps,
  observed: ReadonlySet<string>,
  local: InspectorLocal,
  sink: LocalSink
): WhyVm | null {
  const explanation = props.explanation;
  if (explanation === null) return null;
  const { registry } = props;

  const groupSeeds: RowSeed[] = registry.displayGroups.map((group) => {
    const entry = explanation.displayGroups.find((item) => item.groupId === group.id);
    const isObserved = entry !== undefined;
    return {
      key: group.id,
      label: group.label,
      subLabel: group.features.join(", "),
      observed: isObserved,
      contribution: entry === undefined ? null : entry.contribution,
      direction: entry === undefined ? null : directionOf(entry.contribution),
      note: isObserved ? null : C.NOT_PROVIDED_NOTE,
      expandable: false,
      expanded: false,
      onSelect: null
    };
  });

  const modalityById = new Map(explanation.modalityContributions.map((e) => [e.modalityId, e]));
  const modalitySeeds: RowSeed[] = modalitiesInStageOrder(registry).map((modality) => {
    const entry = modalityById.get(modality.id);
    const isObserved = entry !== undefined;
    const expanded = isObserved && local.expandedModalityId === modality.id;
    return {
      key: modality.id,
      label: modality.label,
      subLabel: null,
      observed: isObserved,
      contribution: entry === undefined ? null : entry.contribution,
      direction: entry === undefined ? null : directionOf(entry.contribution),
      note: isObserved ? null : C.NOT_PROVIDED_NOTE,
      expandable: isObserved,
      expanded,
      onSelect: isObserved
        ? () =>
            sink.update({
              expandedModalityId: expanded ? null : modality.id
            })
        : null
    };
  });

  const groupRows = orderAttributions(groupSeeds).map(toRow);
  const modalityRows = orderAttributions(modalitySeeds).map(toRow);
  scaleBars(groupRows);
  scaleBars(modalityRows);

  const expandedModality =
    local.expandedModalityId === null
      ? undefined
      : registry.modalities.find((m) => m.id === local.expandedModalityId);

  const featureSeeds: RowSeed[] =
    expandedModality === undefined
      ? []
      : featuresForModality(registry, expandedModality.id)
          .filter((feature) => observed.has(feature.id))
          .map((feature) => {
            const attribution = explanation.featureAttributions.find(
              (item) => item.featureId === feature.id
            );
            const value = attribution === undefined ? null : attribution.contribution;
            return {
              key: feature.id,
              label: feature.label,
              subLabel: null,
              observed: true,
              contribution: value,
              direction: value === null ? null : directionOf(value),
              note: null,
              expandable: false,
              expanded: props.selection.featureId === feature.id,
              onSelect: () => props.onSelectFeature(feature.id)
            };
          });

  const featureRows = orderAttributions(featureSeeds).map(toRow);
  scaleBars(featureRows);

  return {
    referenceRow: { key: "reference", label: C.REFERENCE_ROW, margin: explanation.referenceMargin },
    outputRow: { key: "output", label: C.OUTPUT_ROW, margin: explanation.outputMargin },
    groupRows,
    modalityRows,
    featureRows,
    expandedModalityLabel: expandedModality?.label ?? null,
    hasEvidence: explanation.featureAttributions.length > 0,
    templateId: explanation.narrative.templateId
  };
}

/* ------------------------------------------------------------------ *
 * Measurements view
 * ------------------------------------------------------------------ */

function buildMeasurements(
  props: ExploreInspectorProps,
  observed: ReadonlySet<string>,
  selection: ExploreInspectorProps["selection"]
): MeasurementGroupVm[] {
  const explanation = props.explanation;
  const { registry, caseSnapshot, evaluation } = props;
  const measurementByFeature = new Map(
    (explanation?.measurements ?? []).map((entry) => [entry.featureId, entry])
  );

  return modalitiesInStageOrder(registry).map((modality) => {
    const features = featuresForModality(registry, modality.id);
    let count = 0;
    const rows: MeasurementRowVm[] = features.map((feature) => {
      const isObserved = observed.has(feature.id);
      if (isObserved) count += 1;
      const raw = caseSnapshot.values[feature.id];
      const measurement = measurementByFeature.get(feature.id);
      const rangeHit =
        outOfRange(feature, raw) || evaluation?.rangeFlags[feature.id] === true;
      return {
        featureId: feature.id,
        label: feature.label,
        observed: isObserved,
        valueText: isObserved ? displayText(raw, undefined, true) : C.NOT_PROVIDED_LABEL,
        unitText: feature.unit,
        cohortText: isObserved && measurement !== undefined ? cohortText(measurement.cohortPosition) : null,
        contribution: isObserved && measurement !== undefined ? measurement.contribution : null,
        signed: isObserved && measurement !== undefined ? signed(measurement.contribution) : null,
        direction:
          isObserved && measurement !== undefined ? directionWord(measurement.direction) : null,
        rangeNote: isObserved && rangeHit ? C.OUT_OF_RANGE_NOTE(feature.range.min, feature.range.max) : null,
        selected: selection.featureId === feature.id,
        onSelect: () => props.onSelectFeature(feature.id)
      };
    });
    return {
      modalityId: modality.id,
      label: modality.label,
      provided: count > 0,
      observedCount: count,
      total: features.length,
      rows
    };
  });
}

type CohortPosition = { kind: "percentile"; value: number } | { kind: "cohort-share"; value: number };

function cohortText(position: CohortPosition): string {
  if (position.kind === "percentile") return C.COHORT_PERCENTILE(position.value);
  return C.COHORT_SHARE(position.value);
}

/* ------------------------------------------------------------------ *
 * Feature focus (Depth 2)
 * ------------------------------------------------------------------ */

function dispatchPort(props: ExploreInspectorProps): DispatchPort {
  return {
    readOnly: false,
    onSelectFeature: props.onSelectFeature,
    onSetValue: props.onEditFeature,
    onSetFeatureProvided: () => undefined,
    onSetModalityProvided: () => undefined
  };
}

/** Store value as a number when it is one (or parses as one), else null. */
function numericValue(raw: FeatureValue | undefined): number | null {
  if (raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const parsed = parseEntry(raw);
  return parsed.kind === "value" ? parsed.value : null;
}

/**
 * Which control renders the focused feature and what it currently holds —
 * the same projection `profile/view.ts` makes, so the Inspector's inline edit
 * and the Profile form can never disagree about a control for the same
 * feature (one truth per thing).
 */
function controlVmFor(
  feature: RegistryFeature,
  raw: FeatureValue | undefined,
  observed: boolean
): FieldControlVm {
  const controlKind = controlKindFor(feature);
  if (controlKind === "number") return { kind: "number" };
  if (controlKind === "checkbox") {
    const value = numericValue(raw);
    return {
      kind: "checkbox",
      checked: observed && value !== null && value === feature.range.max
    };
  }
  if (controlKind === "select") {
    const encoding = feature.encoding;
    const value =
      observed &&
      typeof raw === "string" &&
      encoding.type === "map" &&
      Object.prototype.hasOwnProperty.call(encoding.map, raw)
        ? raw
        : "";
    return { kind: "select", options: optionsFor(feature), value };
  }
  const encoding = feature.encoding;
  const level =
    observed && encoding.type === "ordinal"
      ? encoding.levels.find((entry) => levelMatches(raw, entry))
      : undefined;
  return {
    kind: "radio",
    options: optionsFor(feature),
    value: level === undefined ? "" : String(level)
  };
}

function buildFocus(
  props: ExploreInspectorProps,
  feature: RegistryFeature,
  local: InspectorLocal,
  sink: LocalSink,
  observed: ReadonlySet<string>
): FeatureFocusVm {
  const port = dispatchPort(props);
  const isObserved = observed.has(feature.id);
  const raw = props.caseSnapshot.values[feature.id];
  const committed = displayText(raw, undefined, isObserved);
  const draft = local.draftText;
  const shown = draft !== null ? draft : committed;
  const parsed = draft === null ? null : parseEntry(draft);
  const rangeHit = isObserved && outOfRange(feature, raw);

  return {
    featureId: feature.id,
    controlId: fieldId("ct-ins", feature.id),
    label: feature.label,
    modalityLabel: modalityLabel(props.registry, feature.modality),
    observed: isObserved,
    controlKind: controlKindFor(feature),
    control: controlVmFor(feature, raw, isObserved),
    displayValue: shown,
    draftText: shown,
    committedText: committed,
    message: local.message,
    invalid: parsed !== null && parsed.kind === "invalid",
    rangeNote: rangeHit ? C.OUT_OF_RANGE_NOTE(feature.range.min, feature.range.max) : null,
    unitText: feature.unit,
    onClose: () => {
      props.onSelectFeature(null);
      sink.update({ draftText: null, message: null });
    },
    onDraft: (text: string) => sink.update({ draftText: text, message: null }),
    onCancel: () => sink.update({ draftText: null, message: null }),
    onApply: () => {
      const outcome = commitTextEdit(feature, draft ?? "", port);
      sink.update({
        message: messageForOutcome(outcome),
        draftText: outcome.kind === "dispatched" ? null : draft
      });
    },
    onChoose: (optionValue: string) => {
      const outcome = commitChoice(feature, optionValue, port);
      sink.update({ message: messageForOutcome(outcome), draftText: null });
    },
    onToggle: (checked: boolean) => {
      const outcome = commitBinary(feature, checked, port);
      sink.update({ message: messageForOutcome(outcome), draftText: null });
    }
  };
}
