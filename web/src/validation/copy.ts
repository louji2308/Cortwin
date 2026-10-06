/**
 * Approved user-visible copy for the Trust panes (C-13 vocabulary only:
 * probability, cohort, estimated, indeterminate, not provided, model
 * attribution, model response). No banned phrase appears in this file.
 */

export const TRUST_COPY = {
  cohortNote:
    "Cohort values are precomputed by the validated pipeline. This view formats them; it never recomputes a metric.",

  loadingHeading: "Loading validation results",
  loadingBody: "Reading the results artifact…",
  emptyHeading: "Validation results not loaded",
  emptyBody:
    "This pane reads the validated pipeline's results artifact. Metrics appear once the artifact is loaded — nothing here is estimated, filled in or cached.",
  errorHeading: "Validation results unavailable",
  errorPrefix: "The results artifact could not be used:",
  errorSuffix: "Other Trust panes remain available.",
  retryLabel: "Reload validation results",

  performanceSubtitle:
    "Cohort · out-of-fold estimates under the published nested cross-validation protocol.",
  performanceTableCaption:
    "Cohort performance per target. All values are read from the results artifact.",
  performanceMissingTarget: "No performance row for this target in the artifact.",
  protocolHeading: "Validation protocol",
  protocolCaption: "Protocol fields as recorded in the results artifact.",
  protocolMissing: "Validation protocol not provided in this artifact.",
  protocolCiMethodLabel: "Confidence interval method",
  protocolStratificationLabel: "Stratification",
  disclosuresHeading: "Disclosures",
  disclosuresFraming: "The model is cohort-specific with no external validation.",
  disclosuresNotesIntro: "Protocol notes recorded in the results artifact:",
  disclosuresMissing: "Protocol notes not provided in this artifact.",
  reliabilityRuleHeading: "Reliability rule",
  reliabilityRationaleHeading: "Tier rationale recorded in the artifact",
  reliabilityRuleMissing: "Reliability rule not provided in this artifact.",

  calibrationSubtitle:
    "Cohort · reliability diagram and calibration readouts from the precomputed artifact.",
  calibrationReadoutsHeading: "Calibration readouts",
  calibrationMissing: "Calibration readouts not provided for this target in the artifact.",
  calibrationBrierNote: "Brier score · lower is better",
  calibrationBaseRateNote: "Base-rate reference · lower is better",
  calibrationEceNote: "Expected calibration error · lower is better",
  calibrationDiagramSummary:
    "Reliability diagram: binned cohort estimates against observed frequency in each bin, with the identity line for reference. Raw bins use dashed lines with round markers; Platt bins use solid lines with square markers. Exact bin values are listed below.",
  calibrationCurveMissing:
    "Reliability curve not provided for this target in the artifact.",
  calibrationBinsSummary: "Bin table: counts and values exactly as stored in the artifact.",
  calibrationNoRecompute: "Brier and expected calibration error are artifact values; this view does not recompute them.",
  binInspectLabel: "Inspect bin",
  binInspectHeading: "Bin inspection",
  binInspectHint:
    "Select a bin to read its stored values. Counts and frequencies are exactly as recorded in the results artifact.",
  binRawLabel: "Raw bins",
  binPlattLabel: "Platt bins",

  decisionsSubtitle:
    "Cohort · precomputed threshold and abstention sweeps, with this patient's live marker when provided.",
  decisionsMissing: "Decision sweeps not provided for this target in the artifact.",
  decisionsSweepSummary:
    "Threshold sweep: precision, recall and F1 across precomputed thresholds for the selected target. The vertical line marks the deployed threshold from the artifact.",
  decisionsSweepMissing: "Threshold sweep not provided for this target in the artifact.",
  decisionsAbstentionSummary:
    "Abstention sweep: cohort coverage against accuracy on decided cases at precomputed abstention fractions.",
  decisionsAbstentionMissing:
    "Abstention sweep not provided for this target in the artifact.",
  decisionsThresholdLabel: "Deployed threshold",
  decisionsNoThreshold: "Deployed threshold not provided in the artifact.",
  thresholdInspectLabel: "Inspect precomputed threshold point",
  thresholdInspectHint:
    "Move the slider or use the arrow keys to read precision, recall and F1 at a precomputed threshold point. Values are read from the results artifact; the sweep is never recomputed.",
  thresholdInspectDeployed: "Deployed threshold (results artifact)",
  thresholdSelectionLabel: "Threshold selection",
  currentCaseHeading: "This patient (live evaluation)",
  currentCaseBandLabel: "Abstention band",
  currentCaseHint:
    "The marker shows where this patient's estimated probability sits relative to the deployed threshold and the abstention band. Cohort curves are not recomputed for this patient.",

  subgroupsSubtitle:
    "Cohort · precomputed subgroup estimates with sample sizes and pipeline caveats.",
  subgroupsCaption:
    "Cohort subgroup estimates per target. Values are read from the results artifact.",
  subgroupsEmpty: "Subgroup analysis not provided in this artifact.",
  subgroupsFilterEmpty: "No subgroup rows for this target in the artifact.",
  subgroupsBarsHeading: "Grouped bars",
  subgroupsBarsCaption:
    "Subgroup ROC-AUC with 95% interval and sample size — values read from the results artifact.",
  subgroupsCaveatNone: "",
  subgroupsCaveatBadge: "wide uncertainty",
  subgroupsCustomSubsetNote:
    "Cohort AUC not validated for custom subsets. Custom subsets never claim a cohort AUC.",

  leakageSubtitle:
    "Audit · probe results are labelled separately from the deployed model and never merged.",
  leakageHowToReadHeading: "How to read this audit",
  leakageExplanation:
    "Probe models are audit-only validation runs that each break one rule of the published protocol. They show how far a validation score moves when that rule is broken. An inflated probe result is not evidence of deployed performance — only the deployed section reports the validated pipeline's out-of-fold estimates. Probe and deployed results are never merged.",
  leakageProbeHeading: "Probe models — audit only, not the deployed model",
  leakageProbeCaption:
    "Probe model results. Each row is a deliberately misspecified validation run, not the deployed model.",
  leakageProbeTableCaption: "Probe values exactly as stored in the artifact (probe model only).",
  leakageProbeEmpty: "Probe results not provided in this artifact.",
  leakageScopeLabel: "Probe scope",
  leakageFilterEmpty: "No probe rows for this target in the artifact.",
  leakageBarsHeading: "Probe values",
  leakageBarsCaption:
    "Probe metric values for the selected scope. Probe rows are audit-only evidence and are never merged with the deployed model.",
  leakageDeployedHeading: "Deployed model — validated pipeline results",
  leakageDeployedCaption:
    "Deployed model cohort results from the validated pipeline (out-of-fold estimates).",
  leakageDeployedTableCaption: "Deployed model values exactly as stored in the artifact.",
  leakageDeployedEmpty: "Deployed performance not provided in this artifact.",
  leakageExcludedHeading: "Columns excluded from every model input",
  leakageExcludedNote:
    "These columns are forbidden model inputs; the schema gate asserts they never enter a feature vector.",
  leakageExcludedEmpty: "Excluded-column list not provided in this artifact."
} as const;
