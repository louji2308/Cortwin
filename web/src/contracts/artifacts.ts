import type {
  ModalityId,
  ReliabilityTier,
  StageId,
  TargetId,
} from "./primitives";

/**
 * C-06 §5.6 `tolerance` block — parity tolerances as published by the
 * pipeline; the browser compares against them, never recomputes them.
 */
export type FixtureTolerance = {
  probability: number;
  margin: number;
  attribution: number;
  efficiency: number;
};

/** C-01 §5.1 `artifacts` entry: content-addressed path, hash and byte size. */
export type ManifestArtifactRef = { path: string; sha256: string; sizeBytes: number };

/** C-01 §5.1 artifact keys listed by the manifest. */
export type ManifestArtifactKey = "registry" | "model" | "structures" | "cases" | "results" | "fixtures";

/**
 * C-01 §5.1 `attributions[]` entry; required fields per C-15 §10.2
 * ("every external asset records source, licence, attribution and
 * modification status").
 */
export type ManifestAttribution = {
  source: string;
  licence: string;
  attribution: string;
  modificationStatus: string;
};

/** C-01 §5.1 — verbatim; the single boot manifest inlined in index.html. */
export type Manifest = {
  schemaVersion: "1.0.0";
  appVersion: string;
  bundleId: `sha256:${string}`;
  modelId: `sha256:${string}`;
  artifacts: Record<ManifestArtifactKey, ManifestArtifactRef>;
  provenance: {
    dataSha256: string;
    seedSet: Record<string, unknown>;
    sourceRevision: string;
    toolVersions: Record<string, string>;
  };
  attributions: ManifestAttribution[];
};

/** C-02 §5.2 `modalities[]` entry. */
export type RegistryModality = { id: string; label: string; order: number };

/** C-02 §5.2 `features[].encoding` — the three published encoding types. */
export type RegistryEncoding =
  | { type: "identity" }
  | { type: "map"; map: Record<string, number> }
  | { type: "ordinal"; levels: number[] };

/** C-02 §5.2 `features[]` entry — exactly one of the three encodings. */
export type RegistryFeature = {
  id: string;
  label: string;
  modality: string;
  kind: "continuous" | "binary" | "categorical";
  encoding: RegistryEncoding;
  displayGroup: string | null;
  unit: string | null;
  unitStatus: "verified" | "unverified";
  range: { min: number; max: number };
  derived: { formula: string; inputs: string[] } | null;
};

/** C-02 §5.2 `targets[]` entry — ids are exactly the C-08 target set. */
export type RegistryTarget = {
  id: TargetId;
  label: string;
  kind: "overall" | "vessel";
  modelKey: string;
  structureId: string | null;
  labelDefinition: string;
};

/** C-02 §5.2 `structures[]` entry — named-node contract (C-11 §8.1). */
export type RegistryStructure = {
  id: string;
  label: string;
  meshNode: string;
  cameraPreset: "Overview" | "LAD" | "LCX" | "RCA";
  schematicPath: string | null;
};

/** C-02 §5.2 `displayGroups[]` entry — members must be existing features. */
export type RegistryDisplayGroup = { id: string; label: string; features: string[] };

/** C-02 §5.2 `stages[]` entry — a cumulative prefix of modality IDs. */
export type RegistryStage = { id: StageId; order: number; modalitiesThrough: ModalityId[] };

/** C-02 §5.2 `forbiddenInputColumns[]` entry. */
export type RegistryForbiddenColumn = { id: string; reason: string };

/** C-02 §5.2 — verbatim keys; the sole correspondence authority. */
export type Registry = {
  schemaVersion: "1.0.0";
  modalities: RegistryModality[];
  features: RegistryFeature[];
  targets: RegistryTarget[];
  structures: RegistryStructure[];
  displayGroups: RegistryDisplayGroup[];
  stages: RegistryStage[];
  forbiddenInputColumns: RegistryForbiddenColumn[];
};

/** C-03 §5.3 `metadata` — plus `appVersion` (C-01 §5.1 app identity). */
export type ModelMetadata = {
  schemaVersion: "1.0.0";
  modelId: `sha256:${string}`;
  modelFamily: "additive-ensemble";
  featureCount: 54;
  targets: TargetId[];
  appVersion: string;
};

/** C-04 §5.4 `protocol` — exact key set per the blocking results schema test. */
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
  stratification: string;
  ciMethod: string;
};

/** C-04 §5.4 interval values: `[low, high]`, ordered, probability scale. */
export type ConfidenceInterval = [number, number];

/** C-04 §5.4 Performance — exact key set (7 contract keys + fold AUC spread). */
export type TargetPerformance = {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  rocAuc: number;
  rocAucCI: ConfidenceInterval;
  majorityBaseline: number;
  foldAucMean: number;
  foldAucSd: number;
};

/** C-04 §5.4 calibration reliability-diagram bin. */
export type ReliabilityBin = {
  binLower: number;
  binUpper: number;
  count: number;
  fractionPositive: number;
  meanPredicted: number;
};

/** C-04 §5.4 `reliabilityCurve`: raw and Platt curves, 10 bins each. */
export type ReliabilityCurve = { raw: ReliabilityBin[]; platt: ReliabilityBin[] };

/** C-04 §5.4 Calibration — exact key set; browser never computes Brier/ECE. */
export type TargetCalibration = {
  brierRaw: number;
  brierPlatt: number;
  baseRateBrier: number;
  eceRaw: number;
  ecePlatt: number;
  reliabilityCurve: ReliabilityCurve;
};

/** C-04 §5.4 precomputed decision-sweep point. */
export type ThresholdPoint = { threshold: number; precision: number; recall: number; f1: number };

/** C-03 §5.3 / C-04 §5.4 — learned threshold provenance, never hand-set. */
export type ThresholdSelection = { method: "max_f1_inner_validation"; source: "validated_pipeline" };

/** C-04 §5.4 precomputed abstention sweep point. */
export type AbstentionSweepPoint = { abstainFraction: number; coverage: number; accuracyDecided: number };

/** C-04 §5.4 Decisions — exact key set per target. */
export type TargetDecisions = {
  targetId: TargetId;
  points: ThresholdPoint[];
  selectedThreshold: number;
  thresholdSelection: ThresholdSelection;
  abstention: {
    sweeps: AbstentionSweepPoint[];
    selectedHalfWidthMargin: number;
    selectionRule: string;
  };
};

/** C-04 §5.4 Subgroups — exact key set; small groups carry the pipeline caveat. */
export type SubgroupResult = {
  targetId: TargetId;
  groupId: string;
  n: number;
  rocAuc: number;
  rocAucCI: ConfidenceInterval;
  caveat: string | null;
};

/** C-04 §5.4 evidence-ladder stage row (cumulative, not a work-up order). */
export type EvidenceLadderStage = {
  stageId: StageId;
  order: number;
  modalitiesThrough: ModalityId[];
  targets: Record<TargetId, { rocAuc: number; rocAucCI: ConfidenceInterval; n: number }>;
};

/** C-04 §5.4 Evidence ladder — exact key set. */
export type EvidenceLadder = {
  stageSemantics: string;
  provenance: string;
  stages: EvidenceLadderStage[];
};

/**
 * C-04 §5.4 leakage-lab probe. Probe entries are heterogeneous (per-target
 * accuracy/ROC-AUC probes vs the seed-sensitivity spread probe), so
 * `metrics` is pinned only as numeric maps keyed by target/measure.
 */
export type LeakageProbe = {
  id: string;
  label: "probe model" | "deployed model";
  protocol: string;
  metrics: Partial<Record<TargetId, Record<string, number>>>;
  inflated?: boolean;
  modelFamily?: string;
  note?: string;
};

/** C-04 §5.4 Leakage lab — probe evidence, never merged with deployed results. */
export type LeakageLab = {
  kind: "leakageLab";
  label: string;
  explanation: string;
  excludedColumns: string[];
  probes: LeakageProbe[];
};

/** C-03 §5.3 RT-1 rule evidence — exact key set per the blocking schema test. */
export type ReliabilityRule = {
  ruleId: "RT-1";
  description: string;
  thresholds: {
    strongCiLowMin: number;
    strongUpliftMin: number;
    moderateAucMin: number;
    moderateUpliftMin: number;
  };
};

/** C-03 §5.3 / C-04 §5.4 reliability target block. */
export type ReliabilityTargetEvidence = {
  tier: ReliabilityTier;
  rationaleCode: string;
  evidenceRefs: string[];
};

/** C-04 §5.4 Reliability — exact key set. */
export type Reliability = {
  rule: ReliabilityRule;
  targets: Record<TargetId, ReliabilityTargetEvidence>;
};

/** C-04 §5.4 provenance — exact key set; seeds and tool versions, no patient data. */
export type ResultsProvenance = {
  dataSha256: string;
  seedSet: { base: number; derived: Record<string, number> };
  sourceRevision: string;
  toolVersions: Record<string, string>;
  notes: string[];
};

/**
 * C-04 §5.4 — verbatim section keys. `leakageLab` is present iff the
 * pipeline emitted it (blocking schema test `leakageLab_consistency`).
 */
export type Results = {
  schemaVersion: "1.0.0";
  protocol: ResultsProtocol;
  performance: Record<TargetId, TargetPerformance>;
  calibration: Record<TargetId, TargetCalibration>;
  decisions: Record<TargetId, TargetDecisions>;
  subgroups: SubgroupResult[];
  evidenceLadder: EvidenceLadder;
  leakageLab?: LeakageLab;
  reliability: Reliability;
  provenance: ResultsProvenance;
};
