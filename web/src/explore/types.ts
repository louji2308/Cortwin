import type {
  CaseProvenance,
  CorTwinState,
  EvalStatus,
  Evaluation,
  Explanation,
  FeatureId,
  FeatureValue,
  ModalityId,
  Registry,
  TargetId
} from "../contracts";

/**
 * Prop contract of the P6 Inspector as consumed by the Explore workspace
 * (Implementation_Plan P6 steps 10–13). The sibling unit owns the component
 * (`web/src/panels/inspector`); this file owns the *assignment* of props so
 * the two halves can be reconciled at one place (`./inspectorHost`) instead of
 * across the workspace.
 *
 * Surface rule (dispatch): case snapshot fields, evaluation, explanation,
 * selection, and the two edit/select callbacks — nothing else. Feature edits
 * travel the same store intent as Profile editing (`case.setValue`, C-09), so
 * one intent path serves both entry points.
 */

export type ExploreCaseSnapshot = {
  id: string;
  label: string;
  provenance: CaseProvenance;
  revision: number;
  values: Record<FeatureId, FeatureValue>;
  providedFeatures: Record<FeatureId, boolean>;
  providedModalities: Record<ModalityId, boolean>;
};

export type ExploreInspectorSelection = {
  targetId: TargetId | null;
  featureId: FeatureId | null;
  modalityId: ModalityId | null;
  hovered: CorTwinState["selection"]["hovered"];
};

export type ExploreInspectorProps = {
  /** C-02 registry — feature/target identity for labels, units and levels. */
  registry: Registry;
  /** `case` slice + catalog label (C-05), snapshot copy taken at render. */
  caseSnapshot: ExploreCaseSnapshot;
  /** C-08 `eval.current` — null in the designed loading/empty state. */
  evaluation: Evaluation | null;
  /** C-08 explanation for the active selection, null until it arrives. */
  explanation: Explanation | null;
  /** C-09 selection slice (target/feature/modality/hover — one hover truth). */
  selection: ExploreInspectorSelection;
  /** `eval.status` — drives the "Updating…" affordance (C-07 §6.1). */
  evalStatus: EvalStatus;
  /** `selectIsStale(state)` — previous truth visible but not current. */
  stale: boolean;
  /** `case.setValue` — the only path a value enters the store (C-09). */
  onEditFeature: (featureId: FeatureId, value: FeatureValue) => void;
  /** `selection.selectTarget` + camera preset (C-09 view intent). */
  onSelectTarget: (targetId: TargetId | null) => void;
  /** `selection.selectFeature` — depth-2 focus, never a revision change. */
  onSelectFeature: (featureId: FeatureId | null) => void;
  /** `selection.setHover` — optional drive from Inspector rows (one hover truth). */
  onHoverTarget?: (targetId: TargetId | null) => void;
};
