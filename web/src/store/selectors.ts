import type {
  CorTwinStoreState,
  DecisionState,
  Explanation,
  ReliabilityTier,
  TargetId,
  VesselId
} from "../contracts";
import type { UrlStateInput } from "../navigation";

/**
 * C-09 §7.1 / Implementation_Plan P5 — pure store selectors.
 *
 * Every selector is `(state: CorTwinStoreState) => T`: no I/O, no DOM, no
 * mutation, no re-derivation of clinical truth. Probabilities, decisions,
 * thresholds and reliability are copied from the `Evaluation` payload only
 * (INV-C14 / INV-C17); the selectors never round, clamp, compare against a
 * threshold or reconcile CAD — the engine already did (C-08 coherence rule).
 *
 * Vessel identity comes from the registry's `kind: "vessel"` targets (INV-C15),
 * never from a literal list; the `VesselId` union mirrors the registry and is
 * enforced by the registry validator, not re-checked here.
 */

export type CompletionStats = { provided: number; total: number; fraction: number };

export type ModalityCount = {
  modalityId: string;
  label: string;
  provided: number;
  total: number;
  fraction: number;
};

/** C-11 §8.1 per-vessel visual state — colour itself is never selected here. */
export type VesselVisualState = {
  probability: number;
  decision: DecisionState;
  selected: boolean;
  hovered: boolean;
  dimmed: boolean;
};

/** The CAD headline as displayed: truth from the payload, interpolation on top. */
export type DisplayedCad = {
  probability: number;
  decision: DecisionState;
  reliability: ReliabilityTier;
  thresholdProbability: number;
  /** True while the display channel is still easing toward `probability`. */
  interpolating: boolean;
};

/** Registry vessel targets → their structure ids, in registry target order. */
export function selectVesselIds(state: CorTwinStoreState): VesselId[] {
  const registry = state.bundle.registry;
  if (registry === null) return [];
  const vesselIds: VesselId[] = [];
  for (const target of registry.targets) {
    if (target.kind !== "vessel") continue;
    const structureId = target.structureId;
    if (structureId === "LAD" || structureId === "LCX" || structureId === "RCA") {
      if (!vesselIds.includes(structureId)) vesselIds.push(structureId);
    }
  }
  return vesselIds;
}

/** Case completion: provided features over the registry's 54 (0 before boot). */
export function selectCompletion(state: CorTwinStoreState): CompletionStats {
  const registry = state.bundle.registry;
  if (registry === null) return { provided: 0, total: 0, fraction: 0 };
  let provided = 0;
  for (const feature of registry.features) {
    if (state.case.providedFeatures[feature.id] === true) provided += 1;
  }
  const total = registry.features.length;
  return { provided, total, fraction: total > 0 ? provided / total : 0 };
}

/** Per-modality provided/total counts, in registry modality order. */
export function selectModalityCounts(state: CorTwinStoreState): ModalityCount[] {
  const registry = state.bundle.registry;
  if (registry === null) return [];
  return registry.modalities.map((modality) => {
    const members = registry.features.filter((feature) => feature.modality === modality.id);
    const provided = members.filter(
      (feature) => state.case.providedFeatures[feature.id] === true
    ).length;
    const total = members.length;
    return {
      modalityId: modality.id,
      label: modality.label,
      provided,
      total,
      fraction: total > 0 ? provided / total : 0
    };
  });
}

/** The selected prediction target (null on the default Explore state). */
export function selectSelectedTarget(state: CorTwinStoreState): TargetId | null {
  return state.selection.targetId;
}

/**
 * Per-vessel visual state for the 3D stage — the same projection
 * `scene/buildSceneModel` produces for its `vessels` slot (asserted equal by
 * the store↔scene parity test).
 *
 * Returns `null` when there is no evaluation payload (boot/idle/degraded — the
 * designed loading state) or when the payload is missing/non-finite for a
 * registry vessel (apply-time gate: NaN never reaches a material or a legend;
 * the typed error is raised where the payload is accepted, in the store).
 */
export function selectVesselStates(
  state: CorTwinStoreState
): Record<VesselId, VesselVisualState> | null {
  const evaluation = state.eval.current;
  if (evaluation === null) return null;

  const selectedTargetId = state.selection.targetId;
  const selectedVesselId =
    selectedTargetId === "LAD" || selectedTargetId === "LCX" || selectedTargetId === "RCA"
      ? selectedTargetId
      : null;
  const hovered = state.selection.hovered;
  const hoveredVesselId =
    hovered !== null && hovered.kind === "vessel"
      ? hovered.id === "LAD" || hovered.id === "LCX" || hovered.id === "RCA"
        ? hovered.id
        : null
      : null;

  const vesselIds = selectVesselIds(state);
  if (vesselIds.length === 0) return null;

  const vessels = {} as Record<VesselId, VesselVisualState>;
  for (const vesselId of vesselIds) {
    const payload = evaluation.targets[vesselId];
    if (payload === undefined) return null;
    if (!Number.isFinite(payload.probability)) return null;
    const selected = selectedVesselId === vesselId;
    vessels[vesselId] = {
      probability: payload.probability,
      decision: payload.decision,
      selected,
      hovered: hoveredVesselId === vesselId,
      dimmed: selectedVesselId !== null && !selected
    };
  }
  return vessels;
}

/**
 * The headline CAD number as displayed: the payload's calibrated probability,
 * with the display channel's eased value layered on top while an edit
 * transition is running (P-4 — data truth and displayed animation are
 * separate). Decision, reliability and threshold are never interpolated.
 */
export function selectDisplayedCad(state: CorTwinStoreState): DisplayedCad | null {
  const evaluation = state.eval.current;
  if (evaluation === null) return null;
  const headline = evaluation.headlineCad;
  let probability = headline.probability;
  let interpolating = false;
  const eased = state.display.current.CAD;
  if (state.display.running && eased !== undefined && Number.isFinite(eased)) {
    probability = eased;
    interpolating = true;
  }
  return {
    probability,
    decision: headline.decision,
    reliability: headline.reliability,
    thresholdProbability: headline.thresholdProbability,
    interpolating
  };
}

/** True while a previous truth is visible but not current ("updating"). */
export function selectIsStale(state: CorTwinStoreState): boolean {
  return state.eval.status === "updating";
}

/**
 * The current explanation for the active selection, or null. The cache is
 * keyed by revision (the store only ever reads the live revision's entries),
 * so a stale revision's payload can never be served.
 */
export function selectExplanation(state: CorTwinStoreState): Explanation | null {
  const targetId = state.selection.targetId ?? "CAD";
  const key = `${state.case.revision}:${targetId}`;
  return state.eval.explanationCache[key] ?? null;
}

/**
 * The URL-state projection of the store (C-10 input to `serializeUrl`).
 * `share` is deliberately absent: it is never derived from application state —
 * only an explicit user action supplies an already-encoded token (C-10).
 */
export function selectUrlState(state: CorTwinStoreState): UrlStateInput {
  return {
    route: state.view.route,
    pane: state.view.pane,
    caseId: state.case.id === "" ? null : state.case.id,
    targetId: state.selection.targetId,
    featureId: state.selection.featureId,
    stageId: state.selection.stageId,
    share: null
  };
}
