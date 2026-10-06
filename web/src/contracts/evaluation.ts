import type { DecisionState, FeatureId, ModalityId, ReliabilityTier, TargetId } from "./primitives";

/** C-08 §6.2 — verbatim. */
export type TargetEvaluation = {
  targetId: TargetId; probability: number; calibratedMargin: number;
  thresholdProbability: number;
  decision: DecisionState;
  reliability: ReliabilityTier;
  abstention: { lowerProbability: number; upperProbability: number; halfWidthMargin: number };
};

/** C-08 §6.2 — verbatim. */
export type HeadlineCad = {
  probability: number; valueSourceTargetId: TargetId;
  decisionReferenceTargetId: "CAD";
  decision: DecisionState; reliability: ReliabilityTier; thresholdProbability: number;
  explanationSourceTargetId: TargetId;
};

/** C-08 §6.2 — verbatim. */
export type Evaluation = {
  revision: number; observedFeatureIds: FeatureId[];
  targets: Record<TargetId, TargetEvaluation>;
  headlineCad: HeadlineCad; rangeFlags: Record<string, boolean>;
};

/** C-08 §6.2 — verbatim. */
export type Explanation = {
  revision: number; targetId: TargetId;
  referenceMargin: number; outputMargin: number; efficiencyResidual: number;
  featureAttributions: Array<{ featureId: FeatureId; value: number; contribution: number;
    direction: "positive" | "negative" | "neutral" }>;
  displayGroups: Array<{ groupId: string; contribution: number; memberFeatureIds: FeatureId[] }>;
  modalityContributions: Array<{ modalityId: ModalityId; contribution: number; memberFeatureIds: FeatureId[] }>;
  measurements: Array<{ featureId: FeatureId; value: number;
    cohortPosition: { kind: "percentile"; value: number } | { kind: "cohort-share"; value: number };
    contribution: number; direction: "positive" | "negative" | "neutral" }>;
  caveats: string[];
  narrative: { templateId: string; slots: Record<string, string | number> };
};
