/**
 * System → Model card — static prose fields (Contracts §9 L432).
 *
 * These strings are the non-numeric half of the model card: mandated safety
 * and attribution language transcribed from `docs/MODEL_CARD.md` §1/§5/§6,
 * `docs/AI_USE.md` §1 and the C-13 copy law. They carry NO metric, probability
 * or cohort statistic — every number on the card comes from the artifacts via
 * `paneData.toModelCard` (INV-04). Identity, schema, dataset provenance,
 * validation protocol and artifact identity are composed there, never here.
 */

export const MODEL_CARD_LIMITATIONS: readonly string[] = [
  "Educational decision-support prototype; not a medical device and not for clinical diagnosis.", // c13-allow: limitation statement — mandated by Contracts C-13 L409 / docs/MODEL_CARD.md
  "Estimates are cohort-specific; no external validation cohort is recorded in the artifacts.",
  "Vessel outputs are whole-vessel probabilities; they do not localize lesions.",
  "Reliability tiers classify validation evidence (RT-1); they are not confidence statements."
];

export const MODEL_CARD_ATTRIBUTION_CAVEATS: readonly string[] = [
  "Model attribution, not causation.",
  "Correlated features share credit; a single attribution is not unique.",
  "Attributions depend on the background set used for marginalisation."
];

export const MODEL_CARD_AI_USE =
  "AI coding assistants were used across implementation, tests and documentation; " +
  "the full disclosure lives in docs/AI_USE.md and the README Built With section. " +
  "Human verification of the disclosure's status tables is required before submission.";

export const MODEL_CARD_STRUCTURE_NOTE =
  "Structure mesh licence and credits are recorded in the manifest attributions and assets/ATTRIBUTION.md.";
