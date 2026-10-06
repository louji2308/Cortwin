/**
 * C-13 Narrative and Copy — approved vocabulary of record.
 *
 * Source of truth: Project/Contracts.md section 8.7 (C-13)
 *   L407 — preferred vocabulary
 *   L409 — minimum banned list the copy lint MUST flag
 *
 * Nothing in this module is user-visible copy. `web/src/copy/**` is excluded
 * from the repo copy-lint scan precisely because this file (and its tests)
 * contain the banned phrases verbatim — see copyLint.ts REPO_SCAN_EXCLUSION.
 */

/**
 * Pragma marker. A flagged phrase is permitted only on a line that also carries
 * `c13-allow: <reason>` with a non-empty reason — contract L409 allows a banned
 * phrase solely inside an explicit limitation statement.
 */
export const PRAGMA_TOKEN = "c13-allow:";

/**
 * Contracts.md L409 — copy lint MUST flag at minimum exactly these phrases.
 * Matching is case-insensitive with word boundaries (so "because" never matches
 * "causes"). The stems "proves"/"proven" are listed as-is; bare "prove" is not
 * banned by the contract and is not flagged here.
 */
export const BANNED_PHRASES = [
  "diagnose",
  "diagnosed",
  "diagnosis",
  "detect",
  "detected",
  "detection",
  "recommend",
  "recommended",
  "recommendation",
  "treatment impact",
  "treatment effect",
  "caused by",
  "causes",
  "proves",
  "proven",
  "lesion location",
  "plaque location"
] as const;

/**
 * Contracts.md L407 — preferred vocabulary for narrative templates, route
 * labels, safety copy and Trust/System headings.
 */
export const PREFERRED_VOCABULARY = [
  "probability",
  "model attribution",
  "not provided",
  "indeterminate",
  "estimated",
  "cohort",
  "model response",
  "whole-vessel probability",
  "≥50% stenosis under the cohort label"
] as const;

export type BannedPhrase = (typeof BANNED_PHRASES)[number];
export type PreferredTerm = (typeof PREFERRED_VOCABULARY)[number];
