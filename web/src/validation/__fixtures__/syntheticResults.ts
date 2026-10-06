// SYNTHETIC FIXTURE — C-04-shaped test double. NOT model output. Never rendered in the product.
//
// Every number below is hand-authored synthetic test data for the Trust pane
// tests. Nothing here is read from, copied from or derived from any generated
// artifact, and no shipped code path imports this file outside tests.

import type {
  AbstentionSweepPoint,
  CalibrationMetrics,
  CurrentCaseMarker,
  DecisionPoint,
  DecisionSweep,
  LeakageLab,
  PerformanceMetrics,
  ReliabilityBin,
  ReliabilityBlock,
  ResultsProtocol,
  SubgroupRow,
  TargetId,
  TrustResults
} from "../types";

/** Authoring sugar: plain literal tuples → bin objects. No computation. */
function bin(
  binLower: number,
  binUpper: number,
  count: number,
  fractionPositive: number,
  meanPredicted: number
): ReliabilityBin {
  return { binLower, binUpper, count, fractionPositive, meanPredicted };
}

/** Authoring sugar: plain literal tuples → sweep points. No computation. */
function point(
  threshold: number,
  precision: number,
  recall: number,
  f1: number
): DecisionPoint {
  return { threshold, precision, recall, f1 };
}

function sweep(
  abstainFraction: number,
  coverage: number,
  accuracyDecided: number
): AbstentionSweepPoint {
  return { abstainFraction, coverage, accuracyDecided };
}

const PROTOCOL: ResultsProtocol = {
  patientCount: 300,
  featureCount: 54,
  outerFolds: 5,
  outerRepeats: 3,
  innerFolds: 4,
  noSmote: true,
  preprocessingInsideFold: true,
  calibrationInsideFold: true,
  thresholdInsideFold: true,
  abstentionInsideFold: true,
  ciMethod: "synthetic interval note",
  stratification: "joint vessel label pattern (synthetic)"
};

const PERFORMANCE: Record<TargetId, PerformanceMetrics> = {
  CAD: {
    accuracy: 0.861,
    precision: 0.874,
    recall: 0.893,
    f1: 0.883,
    rocAuc: 0.888,
    rocAucCI: [0.841, 0.927],
    majorityBaseline: 0.704,
    foldAucMean: 0.891,
    foldAucSd: 0.031
  },
  LAD: {
    accuracy: 0.782,
    precision: 0.741,
    recall: 0.706,
    f1: 0.723,
    rocAuc: 0.842,
    rocAucCI: [0.786, 0.893],
    majorityBaseline: 0.632,
    foldAucMean: 0.845,
    foldAucSd: 0.044
  },
  LCX: {
    accuracy: 0.698,
    precision: 0.652,
    recall: 0.611,
    f1: 0.631,
    rocAuc: 0.771,
    rocAucCI: [0.704, 0.831],
    majorityBaseline: 0.598,
    foldAucMean: 0.774,
    foldAucSd: 0.058
  },
  RCA: {
    accuracy: 0.734,
    precision: 0.697,
    recall: 0.664,
    f1: 0.68,
    rocAuc: 0.803,
    rocAucCI: [0.741, 0.858],
    majorityBaseline: 0.617,
    foldAucMean: 0.806,
    foldAucSd: 0.049
  }
};

const CALIBRATION: Record<TargetId, CalibrationMetrics> = {
  CAD: {
    brierRaw: 0.142,
    brierPlatt: 0.128,
    baseRateBrier: 0.211,
    eceRaw: 0.067,
    ecePlatt: 0.041,
    reliabilityCurve: {
      raw: [
        bin(0, 0.2, 42, 0.07, 0.12),
        bin(0.2, 0.4, 38, 0.29, 0.31),
        bin(0.4, 0.6, 44, 0.55, 0.51),
        bin(0.6, 0.8, 52, 0.77, 0.73),
        bin(0.8, 1, 124, 0.94, 0.92)
      ],
      platt: [
        bin(0, 0.2, 45, 0.11, 0.13),
        bin(0.2, 0.4, 40, 0.3, 0.32),
        bin(0.4, 0.6, 43, 0.53, 0.52),
        bin(0.6, 0.8, 38, 0.74, 0.74),
        bin(0.8, 1, 134, 0.93, 0.93)
      ]
    }
  },
  LAD: {
    brierRaw: 0.167,
    brierPlatt: 0.154,
    baseRateBrier: 0.231,
    eceRaw: 0.079,
    ecePlatt: 0.052,
    reliabilityCurve: {
      raw: [
        bin(0, 0.25, 88, 0.11, 0.14),
        bin(0.25, 0.5, 76, 0.34, 0.36),
        bin(0.5, 0.75, 70, 0.61, 0.58),
        bin(0.75, 1, 66, 0.86, 0.83)
      ],
      platt: [
        bin(0, 0.25, 92, 0.12, 0.15),
        bin(0.25, 0.5, 74, 0.33, 0.35),
        bin(0.5, 0.75, 68, 0.6, 0.59),
        bin(0.75, 1, 66, 0.85, 0.84)
      ]
    }
  },
  LCX: {
    brierRaw: 0.213,
    brierPlatt: 0.198,
    baseRateBrier: 0.247,
    eceRaw: 0.094,
    ecePlatt: 0.071,
    reliabilityCurve: {
      raw: [
        bin(0, 0.25, 105, 0.18, 0.12),
        bin(0.25, 0.5, 88, 0.41, 0.37),
        bin(0.5, 0.75, 62, 0.66, 0.62),
        bin(0.75, 1, 45, 0.9, 0.88)
      ],
      platt: [
        bin(0, 0.25, 110, 0.16, 0.13),
        bin(0.25, 0.5, 84, 0.4, 0.38),
        bin(0.5, 0.75, 60, 0.65, 0.63),
        bin(0.75, 1, 46, 0.89, 0.88)
      ]
    }
  },
  RCA: {
    brierRaw: 0.195,
    brierPlatt: 0.181,
    baseRateBrier: 0.239,
    eceRaw: 0.088,
    ecePlatt: 0.064,
    reliabilityCurve: {
      raw: [
        bin(0, 0.25, 98, 0.14, 0.11),
        bin(0.25, 0.5, 85, 0.38, 0.35),
        bin(0.5, 0.75, 65, 0.63, 0.6),
        bin(0.75, 1, 52, 0.88, 0.86)
      ],
      platt: [
        bin(0, 0.25, 101, 0.13, 0.12),
        bin(0.25, 0.5, 82, 0.37, 0.36),
        bin(0.5, 0.75, 63, 0.62, 0.61),
        bin(0.75, 1, 54, 0.87, 0.86)
      ]
    }
  }
};

const DECISIONS: Record<TargetId, DecisionSweep> = {
  CAD: {
    targetId: "CAD",
    points: [
      point(0.05, 0.64, 1, 0.78),
      point(0.15, 0.68, 0.97, 0.796),
      point(0.25, 0.73, 0.93, 0.821),
      point(0.35, 0.78, 0.89, 0.832),
      point(0.45, 0.84, 0.85, 0.845),
      point(0.55, 0.88, 0.79, 0.833),
      point(0.7, 0.93, 0.68, 0.786),
      point(0.85, 0.96, 0.5, 0.657)
    ],
    selectedThreshold: 0.42,
    thresholdSelection: { method: "max_f1_inner_validation", source: "validated_pipeline" },
    abstention: {
      selectedHalfWidthMargin: 1.35,
      selectionRule:
        "Synthetic fixture wording: deployed half width at the 40th percentile of distance to the threshold; sweeps abstain the closest 0, 20, 40 and 60 percent by the same distance.",
      sweeps: [
        sweep(0, 1, 0.862),
        sweep(0.2, 0.8, 0.913),
        sweep(0.4, 0.6, 0.944),
        sweep(0.6, 0.4, 0.967)
      ]
    }
  },
  LAD: {
    targetId: "LAD",
    points: [
      point(0.08, 0.58, 0.96, 0.722),
      point(0.2, 0.63, 0.91, 0.746),
      point(0.32, 0.7, 0.86, 0.774),
      point(0.45, 0.76, 0.8, 0.779),
      point(0.6, 0.84, 0.71, 0.77),
      point(0.78, 0.91, 0.55, 0.686)
    ],
    selectedThreshold: 0.45,
    thresholdSelection: { method: "max_f1_inner_validation", source: "validated_pipeline" },
    abstention: {
      selectedHalfWidthMargin: 1.1,
      selectionRule: "Synthetic fixture wording: same rule as the CAD sweep, different target.",
      sweeps: [
        sweep(0, 1, 0.791),
        sweep(0.2, 0.8, 0.846),
        sweep(0.4, 0.6, 0.884),
        sweep(0.6, 0.4, 0.912)
      ]
    }
  },
  LCX: {
    targetId: "LCX",
    points: [
      point(0.1, 0.55, 0.93, 0.691),
      point(0.24, 0.61, 0.88, 0.721),
      point(0.38, 0.67, 0.82, 0.736),
      point(0.52, 0.74, 0.74, 0.74),
      point(0.68, 0.83, 0.64, 0.722),
      point(0.85, 0.9, 0.48, 0.627)
    ],
    selectedThreshold: 0.52,
    thresholdSelection: { method: "max_f1_inner_validation", source: "validated_pipeline" },
    abstention: {
      selectedHalfWidthMargin: 1.4,
      selectionRule: "Synthetic fixture wording: same rule as the CAD sweep, different target.",
      sweeps: [
        sweep(0, 1, 0.704),
        sweep(0.2, 0.8, 0.759),
        sweep(0.4, 0.6, 0.806),
        sweep(0.6, 0.4, 0.844)
      ]
    }
  },
  RCA: {
    targetId: "RCA",
    points: [
      point(0.09, 0.57, 0.95, 0.711),
      point(0.22, 0.63, 0.9, 0.741),
      point(0.36, 0.7, 0.84, 0.763),
      point(0.5, 0.77, 0.76, 0.765),
      point(0.66, 0.85, 0.66, 0.744),
      point(0.83, 0.92, 0.5, 0.648)
    ],
    selectedThreshold: 0.5,
    thresholdSelection: { method: "max_f1_inner_validation", source: "validated_pipeline" },
    abstention: {
      selectedHalfWidthMargin: 1.25,
      selectionRule: "Synthetic fixture wording: same rule as the CAD sweep, different target.",
      sweeps: [
        sweep(0, 1, 0.741),
        sweep(0.2, 0.8, 0.797),
        sweep(0.4, 0.6, 0.842),
        sweep(0.6, 0.4, 0.878)
      ]
    }
  }
};

const SUBGROUPS: SubgroupRow[] = [
  {
    targetId: "CAD",
    groupId: "age_lt_60",
    label: "Age < 60",
    n: 148,
    rocAuc: 0.901,
    rocAucCI: [0.851, 0.941],
    caveat: null
  },
  {
    targetId: "CAD",
    groupId: "age_ge_60",
    label: "Age ≥ 60",
    n: 152,
    rocAuc: 0.872,
    rocAucCI: [0.814, 0.918],
    caveat: null
  },
  {
    targetId: "CAD",
    groupId: "female",
    label: "Female",
    n: 118,
    rocAuc: 0.895,
    rocAucCI: [0.836, 0.937],
    caveat: null
  },
  {
    targetId: "CAD",
    groupId: "diabetes_present",
    label: "Diabetes recorded",
    n: 27,
    rocAuc: 0.812,
    rocAucCI: [0.672, 0.905],
    caveat: "Small group (n = 27); the interval is wide under the published protocol."
  },
  {
    targetId: "LAD",
    groupId: "age_lt_60",
    label: "Age < 60",
    n: 148,
    rocAuc: 0.845,
    rocAucCI: [0.781, 0.897],
    caveat: null
  },
  {
    targetId: "LAD",
    groupId: "age_ge_60",
    label: "Age ≥ 60",
    n: 152,
    rocAuc: 0.836,
    rocAucCI: [0.769, 0.888],
    caveat: null
  },
  {
    targetId: "LAD",
    groupId: "female",
    label: "Female",
    n: 118,
    rocAuc: 0.851,
    rocAucCI: [0.786, 0.901],
    caveat: null
  },
  {
    targetId: "LCX",
    groupId: "age_lt_60",
    label: "Age < 60",
    n: 148,
    rocAuc: 0.764,
    rocAucCI: [0.691, 0.824],
    caveat: null
  },
  {
    targetId: "LCX",
    groupId: "age_ge_60",
    label: "Age ≥ 60",
    n: 152,
    rocAuc: 0.779,
    rocAucCI: [0.706, 0.836],
    caveat: null
  },
  {
    targetId: "LCX",
    groupId: "female",
    label: "Female",
    n: 118,
    rocAuc: 0.752,
    rocAucCI: [0.672, 0.817],
    caveat: null
  },
  {
    targetId: "RCA",
    groupId: "age_lt_60",
    label: "Age < 60",
    n: 148,
    rocAuc: 0.798,
    rocAucCI: [0.731, 0.851],
    caveat: null
  },
  {
    targetId: "RCA",
    groupId: "age_ge_60",
    label: "Age ≥ 60",
    n: 152,
    rocAuc: 0.809,
    rocAucCI: [0.744, 0.861],
    caveat: null
  },
  {
    targetId: "RCA",
    groupId: "female",
    label: "Female",
    n: 118,
    rocAuc: 0.816,
    rocAucCI: [0.75, 0.868],
    caveat: null
  }
];

const LEAKAGE_LAB: LeakageLab = {
  probes: [
    {
      probeId: "honest",
      label: "Honest pipeline (reference run)",
      kind: "honest",
      sourceType: "probe model",
      targetId: "pooled",
      metricName: "ROC-AUC",
      metricValue: 0.868,
      note: "Everything fitted inside the fold; this reference run mirrors the published protocol."
    },
    {
      probeId: "smote_before_cv",
      label: "SMOTE before cross-validation",
      kind: "smote_before_cv",
      sourceType: "probe model",
      targetId: "pooled",
      metricName: "ROC-AUC",
      metricValue: 0.947,
      note: "Oversampling happens before the split, so near-duplicate rows cross folds and the score inflates."
    },
    {
      probeId: "feature_selection_before_cv",
      label: "Feature selection before cross-validation",
      kind: "feature_selection_before_cv",
      sourceType: "probe model",
      targetId: "pooled",
      metricName: "ROC-AUC",
      metricValue: 0.932,
      note: "Selection sees every fold before splitting, which lifts the score above the honest run."
    },
    {
      probeId: "target_leakage",
      label: "Target leakage (catheter-report column as an input)",
      kind: "target_leakage",
      sourceType: "probe model",
      targetId: "pooled",
      metricName: "ROC-AUC",
      metricValue: 0.996,
      note: "The label's own source column enters the feature vector; the inflated score carries no evidence value."
    },
    {
      probeId: "seed_sensitivity",
      label: "Random-split seed sensitivity",
      kind: "seed_sensitivity",
      sourceType: "probe model",
      targetId: "pooled",
      metricName: "ROC-AUC",
      metricValue: 0.891,
      note: "A single random split instead of stratified nested folds; the score moves with the seed."
    }
  ],
  excludedColumns: ["LAD", "LCX", "RCA", "Cath", "Exertional CP"],
  provenanceNote: "Synthetic fixture: probe rows are hand-authored test data, not pipeline output."
};

const RELIABILITY: ReliabilityBlock = {
  rule: {
    ruleId: "RT-1",
    description:
      "Synthetic fixture: tier labels are assigned by the pipeline's published reliability rule. This placeholder description stands in for the artifact's rule text."
  },
  targets: {
    CAD: {
      tier: "strong",
      rationaleCode: "synthetic_fixture_strong",
      evidenceRefs: ["results.performance.CAD.rocAuc"]
    },
    LAD: {
      tier: "moderate",
      rationaleCode: "synthetic_fixture_moderate",
      evidenceRefs: ["results.performance.LAD.rocAuc"]
    },
    LCX: {
      tier: "limited",
      rationaleCode: "synthetic_fixture_below_moderate",
      evidenceRefs: ["results.performance.LCX.rocAuc"]
    },
    RCA: {
      tier: "moderate",
      rationaleCode: "synthetic_fixture_moderate",
      evidenceRefs: ["results.performance.RCA.rocAuc"]
    }
  }
};

/** Primary synthetic double used by the pane tests. */
export const syntheticResults: TrustResults = {
  schemaVersion: "1.0.0",
  protocol: PROTOCOL,
  performance: PERFORMANCE,
  calibration: CALIBRATION,
  decisions: DECISIONS,
  subgroups: SUBGROUPS,
  evidenceLadder: {
    stages: [],
    note: "Synthetic fixture: not consumed by the Trust panes."
  },
  leakageLab: LEAKAGE_LAB,
  reliability: RELIABILITY,
  provenance: {
    notes: [
      "Synthetic fixture: protocol notes stand in for the artifact's provenance block.",
      "Synthetic fixture: hyperparameters were fixed before any cross-validation ran."
    ]
  }
};

/**
 * Second double with deliberately different metric values. Tests render both
 * and assert the screen follows the props — proving no hardcoded numbers.
 */
export const syntheticResultsVariantB: TrustResults = {
  ...syntheticResults,
  protocol: { ...PROTOCOL, patientCount: 180 },
  performance: {
    ...PERFORMANCE,
    CAD: {
      accuracy: 0.712,
      precision: 0.688,
      recall: 0.735,
      f1: 0.711,
      rocAuc: 0.731,
      rocAucCI: [0.663, 0.791],
      majorityBaseline: 0.704,
      foldAucMean: 0.735,
      foldAucSd: 0.062
    }
  },
  calibration: {
    ...CALIBRATION,
    CAD: {
      ...CALIBRATION.CAD,
      brierRaw: 0.256,
      brierPlatt: 0.241,
      eceRaw: 0.133,
      ecePlatt: 0.118
    }
  },
  decisions: {
    ...DECISIONS,
    CAD: { ...DECISIONS.CAD, selectedThreshold: 0.61 }
  },
  subgroups: SUBGROUPS.map((row) =>
    row.targetId === "CAD" && row.groupId === "age_lt_60"
      ? { ...row, n: 96, rocAuc: 0.741, rocAucCI: [0.652, 0.818] as const }
      : row
  ),
  leakageLab: {
    ...LEAKAGE_LAB,
    probes: LEAKAGE_LAB.probes.map((probe) =>
      probe.probeId === "smote_before_cv" ? { ...probe, metricValue: 0.912 } : probe
    )
  },
  reliability: {
    ...RELIABILITY,
    targets: { ...RELIABILITY.targets, CAD: { tier: "limited", rationaleCode: "synthetic_fixture_variant_b" } }
  }
};

/** Live marker doubles for the optional current-case marker on the sweep. */
export const syntheticCurrentCaseA: CurrentCaseMarker = {
  probability: 0.632,
  thresholdProbability: 0.42,
  lowerProbability: 0.31,
  upperProbability: 0.53,
  decision: "above",
  reliability: "strong"
};

export const syntheticCurrentCaseB: CurrentCaseMarker = {
  probability: 0.287,
  thresholdProbability: 0.61,
  lowerProbability: 0.5,
  upperProbability: 0.72,
  decision: "below",
  reliability: "limited"
};

