import type {
  ComputeError,
  CorTwinStoreState,
  EvalStatus,
  FeatureId,
  FeatureValue,
  IntentResult,
  QualityTier,
  Registry,
  RegistryTarget,
  TargetId,
  VesselId
} from "../contracts";
import type { ProbabilityReadoutProps } from "../components/ProbabilityReadout";
import type { EvidenceStage } from "../panels/evidence/types";
import {
  selectCompletion,
  selectDisplayedCad,
  selectExplanation,
  selectIsStale,
  selectModalityCounts,
  selectVesselIds,
  type CorTwinStore
} from "../store";
import type { ExploreInspectorProps } from "./types";

/**
 * Explore presentation model (Implementation_Plan P6 steps 4–13).
 *
 * Every function here is pure: `(state, registry) -> view props`. Probabilities,
 * thresholds, decisions and reliability are copied from the C-08 `Evaluation`
 * payload the store already holds — this module never rounds, never compares a
 * value against a threshold, never derives CAD from its parts (the engine's
 * coherence rule, Architecture §8.4, is the only derivation) and never reads an
 * artifact. Colour is not chosen here at all: it belongs to `ProbabilityReadout`
 * and `design/ramp`.
 *
 * The only value that may differ from the payload is the *displayed* number
 * while the C-09 display channel is easing (P-4): data truth and displayed
 * animation are separate surfaces, and `sampleDisplay` settles the channel
 * exactly on the payload.
 */

/* ------------------------------------------------------------------ *
 * Registry-derived identity (never a literal vessel list)
 * ------------------------------------------------------------------ */

/** Vessel prediction targets, in registry order. */
export function vesselTargets(registry: Registry): RegistryTarget[] {
  return registry.targets.filter((target) => target.kind === "vessel");
}

/** Structure id reported by the stage → prediction target id, via the registry. */
export function targetIdForStructure(
  registry: Registry,
  structureId: string
): TargetId | null {
  const target = registry.targets.find(
    (entry) => entry.kind === "vessel" && entry.structureId === structureId
  );
  return target === undefined ? null : target.id;
}

/** Inverse mapping: target id → the `C-11` structure id the stage reports. */
export function structureIdForTarget(
  registry: Registry,
  targetId: TargetId
): string | null {
  const target = registry.targets.find((entry) => entry.id === targetId);
  if (target === undefined || target.kind !== "vessel") return null;
  return target.structureId;
}

/** Target label from the registry (identity authority, C-02). */
export function targetLabel(registry: Registry, targetId: TargetId): string {
  const target = registry.targets.find((entry) => entry.id === targetId);
  return target === undefined ? targetId : target.label;
}

/** Keyboard/arrow cycling over the registry's vessel targets. */
export function cycleTargetId(
  targetIds: readonly TargetId[],
  current: TargetId | null,
  step: number
): TargetId | null {
  if (targetIds.length === 0) return null;
  const index = current === null ? -1 : targetIds.indexOf(current);
  const raw = (index + step) % targetIds.length;
  const wrapped = (raw + targetIds.length) % targetIds.length;
  return targetIds[wrapped];
}

/* ------------------------------------------------------------------ *
 * Displayed values (presentation interpolation over store truth)
 * ------------------------------------------------------------------ */

/**
 * The probability to *show* for a target: the CAD headline rides
 * `selectDisplayedCad` (the coherence-aware, interpolated selector), every
 * other target rides the display channel's eased slot while a transition
 * runs, and the payload otherwise. Null when there is no payload — the
 * designed empty/loading state, never an invented number.
 */
export function displayedProbability(
  state: CorTwinStoreState,
  targetId: TargetId
): number | null {
  if (targetId === "CAD") {
    return selectDisplayedCad(state)?.probability ?? null;
  }
  const evaluation = state.eval.current;
  if (evaluation === null) return null;
  const payload = evaluation.targets[targetId];
  if (payload === undefined || !Number.isFinite(payload.probability)) return null;
  const eased = state.display.current[targetId];
  if (state.display.running && eased !== undefined && Number.isFinite(eased)) {
    return eased;
  }
  return payload.probability;
}

/* ------------------------------------------------------------------ *
 * Readouts (C-12: ProbabilityReadout is the only probability renderer)
 * ------------------------------------------------------------------ */

export function headlineReadout(
  state: CorTwinStoreState,
  registry: Registry
): ProbabilityReadoutProps | null {
  const displayed = selectDisplayedCad(state);
  const evaluation = state.eval.current;
  if (displayed === null || evaluation === null) return null;
  const sourceTargetId =
    evaluation.headlineCad.valueSourceTargetId === "CAD"
      ? undefined
      : evaluation.headlineCad.valueSourceTargetId;
  return {
    value: displayed.probability,
    targetId: "CAD",
    targetLabel: targetLabel(registry, "CAD"),
    threshold: displayed.thresholdProbability,
    decision: displayed.decision,
    reliability: displayed.reliability,
    size: "large",
    ...(sourceTargetId === undefined ? {} : { sourceTargetId })
  };
}

export type VesselCardModel = {
  targetId: TargetId;
  structureId: string;
  label: string;
  selected: boolean;
  hovered: boolean;
  readout: ProbabilityReadoutProps;
};

/**
 * One card per registry vessel target. Every number comes from the payload
 * (through `displayedProbability`); selection and hover come from the store's
 * selection slice, so card, stage and Inspector share one truth. Empty before
 * the first evaluation — the caller renders skeletons, never placeholder
 * numbers.
 */
export function vesselCardModels(
  state: CorTwinStoreState,
  registry: Registry
): VesselCardModel[] {
  const evaluation = state.eval.current;
  if (evaluation === null) return [];
  const selectedTargetId = state.selection.targetId;
  const hovered = state.selection.hovered;
  const cards: VesselCardModel[] = [];
  for (const target of vesselTargets(registry)) {
    const payload = evaluation.targets[target.id];
    const value = displayedProbability(state, target.id);
    if (payload === undefined || value === null) continue;
    const structureId = target.structureId ?? target.id;
    cards.push({
      targetId: target.id,
      structureId,
      label: target.label,
      selected: selectedTargetId === target.id,
      hovered: hovered !== null && hovered.kind === "vessel" && hovered.id === structureId,
      readout: {
        value,
        targetId: target.id,
        targetLabel: target.label,
        threshold: payload.thresholdProbability,
        decision: payload.decision,
        reliability: payload.reliability,
        size: "compact"
      }
    });
  }
  return cards;
}

/** Registry vessel structure ids, in registry order (stage key order). */
export function vesselStructureIdOrder(registry: Registry): VesselId[] {
  const ordered: VesselId[] = [];
  for (const target of vesselTargets(registry)) {
    const structureId = target.structureId;
    if (structureId !== null) ordered.push(structureId as VesselId);
  }
  return ordered;
}

/* ------------------------------------------------------------------ *
 * Inspector / shell projections
 * ------------------------------------------------------------------ */

export function caseLabelOf(state: CorTwinStoreState): string {
  const active = state.cases.find((entry) => entry.id === state.case.id);
  return active === undefined ? state.case.id : active.label;
}

/** Structure asset URL from the verified manifest (C-01), never a second path. */
export function structureUrlOf(state: CorTwinStoreState): string | undefined {
  return state.bundle.manifest?.artifacts.structures.path;
}

/** The frozen P6 Inspector surface, projected from store truth + bindings. */
export function buildInspectorProps(
  state: CorTwinStoreState,
  registry: Registry,
  bindings: ExploreBindings
): ExploreInspectorProps {
  return {
    registry,
    caseSnapshot: {
      id: state.case.id,
      label: caseLabelOf(state),
      provenance: state.case.provenance,
      revision: state.case.revision,
      values: state.case.values,
      providedFeatures: state.case.providedFeatures,
      providedModalities: state.case.providedModalities
    },
    evaluation: state.eval.current,
    explanation: selectExplanation(state),
    selection: {
      targetId: state.selection.targetId,
      featureId: state.selection.featureId,
      modalityId: state.selection.modalityId,
      hovered: state.selection.hovered
    },
    evalStatus: state.eval.status,
    stale: selectIsStale(state),
    onEditFeature: bindings.onSetValue,
    onSelectTarget: bindings.onSelectTarget,
    onSelectFeature: bindings.onSelectFeature,
    onHoverTarget: bindings.onHoverTarget
  };
}

/** Completion + per-modality counts, straight from the store selectors. */
export { selectCompletion, selectModalityCounts, selectVesselIds };

/* ------------------------------------------------------------------ *
 * Evidence Rail projection + Build Up rule (P7-RAIL, Contracts 8.4)
 * ------------------------------------------------------------------ */

export type ExploreEvidenceData = {
  stages: EvidenceStage[];
  currentStageId: string | null;
  customSubset: boolean;
};

/**
 * The Evidence Rail's props, projected from C-09 truth: registry identity in,
 * case observation truth out (Contracts 8.4 L386–L389).
 *
 * `stages` is the registry's cumulative ladder in `order`; every row label
 * comes from the registry's own modality labels (C-02 identity authority, with
 * the stage id as the honest fallback); `provided` reads the case's modality
 * map with `=== true`, so an absent key is honestly "not provided". Nothing
 * here derives a probability or a metric — the rail shows observation state
 * only, never a bare or invented number.
 */
export function buildEvidenceRailData(
  state: CorTwinStoreState,
  registry: Registry
): ExploreEvidenceData {
  const labelOf = new Map(registry.modalities.map((modality) => [modality.id, modality.label]));
  const stages: EvidenceStage[] = [...registry.stages]
    .sort((left, right) => left.order - right.order)
    .map((stage) => {
      const through = stage.modalitiesThrough;
      const last = through[through.length - 1];
      return {
        id: stage.id,
        label: (last !== undefined ? labelOf.get(last) : undefined) ?? stage.id,
        modalities: through.map((id) => ({
          id,
          label: labelOf.get(id) ?? id,
          provided: state.case.providedModalities[id] === true
        }))
      };
    });
  return {
    stages,
    currentStageId: state.selection.stageId,
    customSubset: state.case.customSubset
  };
}

export type BuildUpStep =
  | { kind: "wait" }
  | { kind: "advance"; stageId: string }
  | { kind: "done" }
  | { kind: "abort" };

/**
 * Build Up's next move (Contracts 8.4 L388): one stage per *settled real
 * evaluation* — never a timer (explore law F.5), never a prerecorded
 * probability. `stages` must be in ladder order. The rule advances only when
 * the case evaluation has settled and the display channel finished easing,
 * reports `done` on the last stage, and aborts (back to idle) on a compute
 * error or a ladder the current stage does not belong to.
 */
export function nextBuildUpStep(
  stages: readonly { id: string }[],
  currentStageId: string | null,
  evalStatus: EvalStatus,
  displayRunning: boolean
): BuildUpStep {
  if (stages.length === 0) return { kind: "abort" };
  if (evalStatus === "error") return { kind: "abort" };
  if (evalStatus !== "ready" || displayRunning) return { kind: "wait" };
  const at = currentStageId === null ? -1 : stages.findIndex((stage) => stage.id === currentStageId);
  if (at < 0) return { kind: "abort" };
  if (at === stages.length - 1) return { kind: "done" };
  const next = stages[at + 1];
  return next === undefined ? { kind: "abort" } : { kind: "advance", stageId: next.id };
}

/* ------------------------------------------------------------------ *
 * Bindings — every interaction resolves to a C-09 intent
 * ------------------------------------------------------------------ */

export type ExploreBindings = {
  /** Profile: `case.setValue`. */
  onSetValue: (featureId: FeatureId, value: FeatureValue) => void;
  onSetFeatureProvided: (featureId: FeatureId, provided: boolean) => void;
  onSetModalityProvided: (modalityId: string, provided: boolean) => void;
  onSelectFeature: (featureId: FeatureId | null) => void;
  /** Evidence Rail chip / Build Up: `selection.selectStage` + the cumulative
   *  modality mask (Contracts 8.4 L386, through Profile's own intent). */
  onSelectStage: (stageId: string) => void;
  /** Stage/schematic hover: structure id → `selection.setHover`. */
  onVesselHover: (structureId: string | null) => void;
  /** Stage/schematic click or ←/→: structure id → target select + camera flight. */
  onVesselSelect: (structureId: string | null) => void;
  onTierChange: (tier: QualityTier) => void;
  onSelectTarget: (targetId: TargetId | null) => void;
  onHoverTarget: (targetId: TargetId | null) => void;
  onReset: () => void;
};

export type BindingOptions = {
  /** Typed intent-failure sink; its message never contains patient values. */
  onIntentError?: (error: ComputeError) => void;
};

/**
 * C-09 `case.enableCustomSubset` producer (Contracts 8.4 L389): after an
 * observation write, the case counts as a user-built subset when its modality
 * set is off the validated cumulative ladder, or when its feature-observation
 * set differs from the active case definition. The store's intent is one-way
 * by design — the warning then stays visible until case select or reset, and a
 * plain value edit of an already-observed feature never sets it.
 */
function flagCustomSubset(store: CorTwinStore): void {
  const state = store.getState();
  const registry = state.bundle.registry;
  if (registry === null) return;
  const observed = Object.keys(state.case.providedModalities).filter(
    (id) => state.case.providedModalities[id] === true
  );
  const onLadder = registry.stages.some(
    (stage) =>
      stage.modalitiesThrough.length === observed.length &&
      stage.modalitiesThrough.every((id) => observed.includes(id))
  );
  if (!onLadder) {
    store.intents.case.enableCustomSubset();
    return;
  }
  const base = state.cases.find((entry) => entry.id === state.case.id);
  if (base === undefined) return;
  const sameSet = (left: readonly string[], right: readonly string[]): boolean =>
    left.length === right.length && right.every((id) => left.includes(id));
  const baseObserved = Object.keys(base.providedFeatures).filter(
    (id) => base.providedFeatures[id] === true
  );
  const nowObserved = Object.keys(state.case.providedFeatures).filter(
    (id) => state.case.providedFeatures[id] === true
  );
  if (!sameSet(baseObserved, nowObserved)) {
    store.intents.case.enableCustomSubset();
  }
}

/**
 * Bind the store's C-09 intents to the shapes the Explore children expect.
 * Selection never bumps a revision, edits always do (C-09 §7.1); a failing
 * intent reports through `onIntentError` and writes nothing. The Inspector's
 * feature edit and the Profile's field edit are the *same* function here —
 * one intent path by construction (C-09, P6 step 13).
 */
export function createBindings(
  store: CorTwinStore,
  options: BindingOptions = {}
): ExploreBindings {
  const guard = (result: IntentResult): void => {
    if (!result.ok) options.onIntentError?.(result.error);
  };
  const registryOf = (): Registry | null => store.getState().bundle.registry;

  return {
    onSetValue(featureId, value) {
      const result = store.intents.case.setValue(featureId, value);
      guard(result);
      if (result.ok) flagCustomSubset(store);
    },
    onSetFeatureProvided(featureId, provided) {
      const result = store.intents.case.setFeatureProvided(featureId, provided);
      guard(result);
      if (result.ok) flagCustomSubset(store);
    },
    onSetModalityProvided(modalityId, provided) {
      const result = store.intents.case.setModalityProvided(modalityId, provided);
      guard(result);
      if (result.ok) flagCustomSubset(store);
    },
    onSelectFeature(featureId) {
      store.intents.selection.selectFeature(featureId);
    },
    onSelectStage(stageId) {
      // Contracts 8.4 L386: selecting stage k provides modalities <= k and
      // not-provides the rest — the same per-modality mask Profile's switches
      // use (never a second missingness path), diffed so an unchanged
      // modality never bumps a revision.
      store.intents.selection.selectStage(stageId);
      const registry = registryOf();
      if (registry === null) return;
      const stage = registry.stages.find((entry) => entry.id === stageId);
      if (stage === undefined) return; // unknown stage: selection only, no mask
      const through = new Set(stage.modalitiesThrough);
      const ordered = [...registry.modalities].sort((left, right) => left.order - right.order);
      for (const modality of ordered) {
        const want = through.has(modality.id);
        const current = store.getState().case.providedModalities[modality.id] === true;
        if (want === current) continue;
        const result = store.intents.case.setModalityProvided(modality.id, want);
        guard(result);
        if (!result.ok) return;
      }
    },
    onVesselHover(structureId) {
      const registry = registryOf();
      if (structureId !== null && registry !== null) {
        const targetId = targetIdForStructure(registry, structureId);
        if (targetId !== null) {
          store.intents.selection.setHover({ kind: "vessel", id: structureId });
          return;
        }
      }
      store.intents.selection.setHover(null);
    },
    onVesselSelect(structureId) {
      const registry = registryOf();
      if (structureId === null || registry === null) {
        store.intents.selection.selectTarget(null);
        return;
      }
      const targetId = targetIdForStructure(registry, structureId);
      if (targetId === null) return;
      store.intents.selection.selectTarget(targetId);
      store.intents.view.setCameraPreset(targetId);
    },
    onTierChange(tier) {
      store.intents.view.setQualityTier(tier);
    },
    onSelectTarget(targetId) {
      store.intents.selection.selectTarget(targetId);
      if (targetId !== null) store.intents.view.setCameraPreset(targetId);
    },
    onHoverTarget(targetId) {
      const registry = registryOf();
      const structureId =
        targetId === null || registry === null ? null : structureIdForTarget(registry, targetId);
      if (structureId === null) {
        store.intents.selection.setHover(null);
        return;
      }
      store.intents.selection.setHover({ kind: "vessel", id: structureId });
    },
    onReset() {
      guard(store.intents.case.reset());
    }
  };
}
