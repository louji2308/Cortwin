/**
 * C-04-shaped presentation props for the Trust panes.
 *
 * Shapes follow Contracts.md §5.4 (C-04 Results) and §9 (Trust view L418–L424),
 * with per-target key names confirmed by reading the unfrozen root `results.json`
 * (READ-ONLY key-name inspection; that file is never imported, copied or referenced
 * by any shipped code path).
 *
 * Every section is optional: absence renders a designed "not provided" state in the
 * pane, never a blank panel and never a fabricated default metric (Architecture §16,
 * AGENTS §6.6). Panes read these props and format them; they never compute a metric.
 */

export type TargetId = "CAD" | "LAD" | "LCX" | "RCA";

export const TARGET_IDS: readonly TargetId[] = ["CAD", "LAD", "LCX", "RCA"];

export type DecisionState = "above" | "below" | "indeterminate";
export type ReliabilityTier = "strong" | "moderate" | "limited";

/** C-04 `protocol` block (§5.4). */
export type ResultsProtocol = {
  patientCount: number;
  featureCount: number;
  outerFolds: number;
  outerRepeats: number;
  innerFolds: number;
  noSmote: boolean;
  preprocessingInsideFold: boolean;
  calibrationInsideFold: boolean;
  thresholdInsideFold: boolean;
  abstentionInsideFold: boolean;
  ciMethod?: string;
  stratification?: string;
};

/** C-04 performance per target (§5.4). `foldAuc*` are optional variance readouts. */
export type PerformanceMetrics = {
  accuracy: number | null;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  rocAuc: number | null;
  rocAucCI: readonly [number, number] | null;
  majorityBaseline: number | null;
  foldAucMean?: number | null;
  foldAucSd?: number | null;
};

/** One precomputed reliability-diagram bin (C-04 calibration, §5.4). */
export type ReliabilityBin = {
  binLower: number;
  binUpper: number;
  count: number;
  fractionPositive: number;
  meanPredicted: number;
};

/**
 * C-04 calibration per target. Contract §5.4 names `raw, platt, brier,
 * baseRateBrier, ece, reliabilityCurve`; §9 L420 requires the diagram to show
 * raw vs Platt, so the readouts carry the raw/Platt pair explicitly.
 * The browser MUST NOT compute Brier/ECE — these are artifact values.
 */
export type CalibrationMetrics = {
  brierRaw: number | null;
  brierPlatt: number | null;
  baseRateBrier: number | null;
  eceRaw: number | null;
  ecePlatt: number | null;
  reliabilityCurve: {
    raw: readonly ReliabilityBin[];
    platt: readonly ReliabilityBin[];
  };
};

export type DecisionPoint = {
  threshold: number;
  precision: number;
  recall: number;
  f1: number;
};

export type AbstentionSweepPoint = {
  abstainFraction: number;
  coverage: number;
  accuracyDecided: number;
};

/** C-04 decision sweeps are precomputed; the browser must not regenerate them (§5.4). */
export type DecisionSweep = {
  targetId: TargetId;
  points: readonly DecisionPoint[];
  selectedThreshold: number | null;
  thresholdSelection?: { method: string; source: string };
  abstention?: {
    selectedHalfWidthMargin?: number | null;
    selectionRule?: string;
    sweeps?: readonly AbstentionSweepPoint[];
  };
};

/** C-04 subgroups (§5.4): identity, n, metric, uncertainty, pipeline caveat. */
export type SubgroupRow = {
  targetId: TargetId;
  groupId: string;
  label?: string;
  n: number;
  rocAuc: number | null;
  rocAucCI: readonly [number, number] | null;
  caveat: string | null;
};

export type ReliabilityTargetEvidence = {
  tier: ReliabilityTier;
  rationaleCode?: string;
  evidenceRefs?: readonly string[];
};

/** Reliability is an evidence classification from the pipeline (C-03 RT-1, C-04 §5.4). */
export type ReliabilityBlock = {
  rule?: { ruleId: string; description?: string };
  targets: Partial<Record<TargetId, ReliabilityTargetEvidence>>;
};

export type LeakageProbeKind =
  | "honest"
  | "smote_before_cv"
  | "feature_selection_before_cv"
  | "target_leakage"
  | "seed_sensitivity";

/** C-04 §5.4: leakage-lab rows are labelled `probe model` and never merged with deployed results. */
export type LeakageProbeResult = {
  probeId: string;
  label: string;
  kind?: LeakageProbeKind;
  sourceType: "probe model";
  targetId: TargetId | "pooled";
  metricName: string;
  metricValue: number | null;
  note?: string | null;
};

export type LeakageLab = {
  probes: readonly LeakageProbeResult[];
  excludedColumns: readonly string[];
  provenanceNote?: string;
};

/**
 * C-04 provenance subset the Trust panes render: the pipeline's own protocol
 * notes (artifact strings, rendered verbatim — never authored here).
 */
export type ProvenanceBlock = {
  notes?: readonly string[];
};

/** The C-04-shaped object the Trust panes consume (Contracts §5.4 top-level keys). */
export type TrustResults = {
  schemaVersion?: string;
  protocol?: ResultsProtocol;
  performance?: Partial<Record<TargetId, PerformanceMetrics>>;
  calibration?: Partial<Record<TargetId, CalibrationMetrics>>;
  decisions?: Partial<Record<TargetId, DecisionSweep>>;
  subgroups?: readonly SubgroupRow[];
  evidenceLadder?: unknown;
  leakageLab?: LeakageLab;
  reliability?: ReliabilityBlock;
  provenance?: ProvenanceBlock;
};

/** C-04 top-level keys (§5.4). The synthetic fixture carries all of them. */
export const C04_TOP_LEVEL_KEYS = [
  "schemaVersion",
  "protocol",
  "performance",
  "calibration",
  "decisions",
  "subgroups",
  "evidenceLadder",
  "leakageLab",
  "reliability",
  "provenance"
] as const;

/** Subset of C-04 top-level keys the five Trust panes actually read. */
export const TRUST_RESULTS_KEYS_PANES_READ = [
  "protocol",
  "performance",
  "calibration",
  "decisions",
  "subgroups",
  "leakageLab",
  "reliability",
  "provenance"
] as const;

/**
 * Live evaluation values used for the optional current-case marker on the
 * threshold sweep (C-08 TargetEvaluation / C-04 L421 "current-case marker from
 * live margin/band"). The pane renders value + threshold + decision + tier
 * together — never a bare probability (AGENTS §7 law 7).
 */
export type CurrentCaseMarker = {
  probability: number;
  thresholdProbability: number;
  lowerProbability: number;
  upperProbability: number;
  decision: DecisionState;
  reliability: ReliabilityTier;
};
