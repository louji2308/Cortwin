/**
 * Shared primitive identifiers and scalar unions projected verbatim from the
 * frozen contracts. Structure only — no runtime behaviour. Every alias is a
 * textual substitute for an inline union in a contract, never a new value.
 */

/** C-08 §6.2 / C-02 §5.2: exactly these four prediction targets. */
export type TargetId = "CAD" | "LAD" | "LCX" | "RCA";

/** C-11 §8.1 `Record<VesselId, ...>`: the three probability-driven vessels. */
export type VesselId = "LAD" | "LCX" | "RCA";

/** C-09 §7.1 / C-02 §5.2: registry feature identifier (`features[].id`). */
export type FeatureId = string;

/** C-09 §7.1 / C-02 §5.2: registry modality identifier (`modalities[].id`). */
export type ModalityId = string;

/** C-09 §7.1 / C-02 §5.2: registry stage identifier (`stages[].id`). */
export type StageId = string;

/** C-09 §7.1 `case.values`: stored feature value (numeric code or map key). */
export type FeatureValue = number | string;

/** C-08 §6.2: decision state of the current case, never from reliability. */
export type DecisionState = "above" | "below" | "indeterminate";

/** C-08 §6.2 / C-03 §5.3 RT-1: target-level evidence tier. */
export type ReliabilityTier = "strong" | "moderate" | "limited";

/** C-09 §7.1 `view.qualityTier` / C-11 §8.2 render tiers. */
export type QualityTier = "Q0" | "Q1" | "Q2" | "Q3";

/** C-09 §7.1 `view.route`. */
export type ViewRoute = "explore" | "trust" | "system";

/** C-09 §7.1 `view.drawer`. */
export type DrawerId = "input-audit" | "model-card" | "feature-popover";

/** C-09 §7.1 `view.cameraPreset` (superset of C-11 §8.1 `cameraTarget`). */
export type CameraPreset = "overview" | "CAD" | "LAD" | "LCX" | "RCA";

/** C-09 §7.1 `selection.hovered.kind` / C-11 §8.1 `hoveredEntity.kind`. */
export type EntityKind = "vessel" | "modality" | "feature";

/** C-09 §7.1 `bundle.resultsStatus`. */
export type ResultsStatus = "not_loaded" | "loading" | "ready" | "error";

/** C-09 §7.1 `eval.status`. */
export type EvalStatus = "idle" | "computing" | "ready" | "error" | "updating";
