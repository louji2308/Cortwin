/**
 * P6-INSPECTOR-R3 - Inspector copy of record (C-13 8.7, Contracts L407).
 *
 * Every user-visible string the Inspector itself renders lives here so the
 * C-13 copy lint, the vocabulary law test and a human copy review (HD-02)
 * see exactly one surface. Nothing in this file is computed from an artifact:
 * no probability, no threshold, no cohort statistic and no clinical claim is
 * typed here - templated strings receive their numbers from the view-model.
 *
 * Hatched "not provided" rows use the approved Final_demo sentence verbatim
 * (Project/Final_demo.md, Inspector 4.6): unobserved evidence is surfaced as
 * a not-provided row and never as a zero attribution (Architecture INV-14).
 */

/* ------------------------------------------------------------------ *
 * Frame, depth headings and navigation
 * ------------------------------------------------------------------ */

export const INSPECTOR_LABEL = "Inspector";
export const LOCATION_LABEL = "Inspector location";

export const CASE_HEADING = "Case";
export const CASE_HINT = "Select a target to open its Why and Measurements views.";
export const CASE_LABEL_PREFIX = "Case";

export const TARGETS_HEADING = "Targets";
export const INSPECT_ACTION = "Inspect";

export const MODALITY_HEADING = "Modality completeness";
export const TOP_REASONS_HEADING = "Top reasons";

/** Target-depth sub-navigation (Evidence is a sibling panel, P7). */
export const VIEWS_LABEL = "Inspector views";
export const WHY_TAB = "Why";
export const MEASUREMENTS_TAB = "Measurements";

/* ------------------------------------------------------------------ *
 * Status, loading and empty states (AGENTS 6.1 "every state is designed")
 * ------------------------------------------------------------------ */

export const UPDATING_TEXT = "Updating…";
export const UNAVAILABLE_TEXT = "Model response unavailable.";

export const EMPTY_EVALUATION_TITLE = "No model response for this case yet.";
export const EMPTY_EVALUATION_BODY =
  "The inspector shows the current model response as soon as an evaluation is available.";

export const EMPTY_EXPLANATION_TITLE = "No explanation for this selection yet.";
export const EMPTY_EXPLANATION_BODY =
  "Model attributions appear when an explanation for the current selection is available.";

export const NO_EVIDENCE_TITLE = "No observed evidence for this selection";
export const NO_EVIDENCE_BODY =
  "No model features are provided for this case, so there are no attributions to show.";

export const UNKNOWN_TARGET_TITLE = "Target not in the registry";
export const UNKNOWN_TARGET_BODY =
  "Vessel identity comes from the shipped registry; this selection has no entry in it.";

/* ------------------------------------------------------------------ *
 * Observation, missingness and provenance rows
 * ------------------------------------------------------------------ */

export const PROVIDED_LABEL = "Provided";
export const NOT_PROVIDED_LABEL = "Not provided";

/** Architecture INV-14 / Project/Final_demo.md 4.6 - verbatim. */
export const NOT_PROVIDED_NOTE =
  "Not provided: handled by cohort averaging, no attribution.";

export function observedSummary(observed: number, total: number): string {
  return `${observed} of ${total} model features provided.`;
}

export function modalityProvidedSummary(provided: number, total: number): string {
  return `${provided} of ${total}`;
}

export function inspectAction(targetLabel: string): string {
  return `${INSPECT_ACTION} ${targetLabel}`;
}

export function attributionFor(targetLabel: string): string {
  return `Model attribution for ${targetLabel}`;
}

export function breadcrumbBack(targetLabel: string): string {
  return `${CASE_HEADING} / ${targetLabel}`;
}

/* ------------------------------------------------------------------ *
 * Why view (Project/Contracts.md 8.5 - margins, not probabilities)
 * ------------------------------------------------------------------ */

export const WHY_HEADING = "Why";
export const WHY_INTRO =
  "Margin attribution for this selection, from the cohort reference to the case output.";
export const REFERENCE_ROW = "Cohort reference";
export const OUTPUT_ROW = "Case output";
export const MARGIN_NOTE =
  "Margins are model attribution values on the model margin scale; they are not a probability.";
export const MODALITY_ROWS_HEADING = "Modality contributions";
export const DISPLAY_GROUPS_HEADING = "Display groups";
export const FEATURE_ROWS_HEADING = "Feature attributions";

/* ------------------------------------------------------------------ *
 * Measurements view
 * ------------------------------------------------------------------ */

export const MEASUREMENTS_HEADING = "Measurements";
export const MEASUREMENTS_INTRO =
  "Observed model inputs with their cohort position and model attribution.";
export const COL_FEATURE = "Feature";
export const COL_MODALITY = "Modality";
export const COL_VALUE = "Value";
export const COL_COHORT = "Cohort position";
export const COL_ATTRIBUTION = "Model attribution";
export const COL_DIRECTION = "Direction";

/** English ordinal suffix: 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st. */
const ordinalSuffix = (n: number): string => {
  const rem100 = Math.abs(Math.trunc(n)) % 100;
  const rem10 = rem100 % 10;
  if (rem100 >= 11 && rem100 <= 13) return "th";
  if (rem10 === 1) return "st";
  if (rem10 === 2) return "nd";
  if (rem10 === 3) return "rd";
  return "th";
};

/** Engine percentile (0–100) as prose, rounded to one decimal for display. */
export const COHORT_PERCENTILE = (percentile: number): string => {
  const n = Math.round(percentile * 10) / 10;
  return `${n}${ordinalSuffix(n)} percentile of the cohort`;
};

/** Engine level share (0–1) as prose; never renders a misleading `0%`. */
export const COHORT_SHARE = (share: number): string => {
  const percent = share * 100;
  if (percent > 0 && percent < 1) return "under 1% of the cohort";
  return `${Math.round(percent)}% of the cohort`;
};

export const COHORT_UNKNOWN = "Not available";

/** Byte-for-byte the Profile form's range warning (one truth per sentence). */
export const OUT_OF_RANGE_NOTE = (min: number, max: number): string =>
  `Outside the cohort range (${String(min)} – ${String(max)}) — still accepted.`;

export const UNIT_UNVERIFIED_NOTE = "Unit not independently verified.";

/* ------------------------------------------------------------------ *
 * Direction glyphs + words (colour alone never carries meaning)
 * ------------------------------------------------------------------ */

export type DirectionWord = "positive" | "negative" | "neutral";

export const DIRECTION_GLYPH: Record<DirectionWord, string> = {
  positive: "▲",
  negative: "▼",
  neutral: "■"
};

export const DIRECTION_WORD: Record<DirectionWord, string> = {
  positive: "positive",
  negative: "negative",
  neutral: "neutral"
};

/** Signed, two-decimal display of a model attribution value. */
export function signedContribution(value: number): string {
  if (!Number.isFinite(value)) return COHORT_UNKNOWN;
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toFixed(2)}`;
}

/* ------------------------------------------------------------------ *
 * Feature focus / inline edit (Project/Final_demo.md 4.6 depth 2)
 * ------------------------------------------------------------------ */

export const FOCUS_HEADING = "Selected feature";
export const FOCUS_HINT = "Edits use the same case intent as the Profile form.";
export const APPLY_ACTION = "Apply";
export const CANCEL_ACTION = "Cancel";
export const CLOSE_ACTION = "Close";
export const INVALID_NUMBER_TEXT = "Enter a plain number before applying.";
export const EMPTY_INPUT_TEXT = "Enter a value before applying.";
export const UNKNOWN_OPTION_TEXT = "Choose one of the published levels.";
export const READ_ONLY_TEXT = "This case is read only.";
export const EDIT_DISPATCHED = "Value applied.";

/* ------------------------------------------------------------------ *
 * Caveats (C-08 keys, rendered verbatim by the UI)
 * ------------------------------------------------------------------ */

export const CAVEATS_HEADING = "Caveats";

export const CAVEAT_TEXT: Record<string, string> = {
  ATTRIBUTION_NOT_CAUSATION: "Model attribution, not causation.",
  CORRELATED_FEATURES_SHARE_CREDIT:
    "Correlated features share credit; a single attribution is not unique.",
  BACKGROUND_SET_DEPENDENT:
    "Attributions depend on the background set used for marginalisation."
};

export const CAVEAT_FALLBACK = CAVEAT_TEXT.ATTRIBUTION_NOT_CAUSATION;
