/**
 * Formatting helpers ONLY. Every function here takes an artifact value and
 * renders a string; none of them computes a metric (Contracts §9 L424:
 * the UI may derive formatting, sorting, axis scale, marker position and
 * highlight — never the metric).
 *
 * Non-finite or absent input renders `not provided`; NaN/Infinity never reach
 * the screen (AGENTS §6.6 numeric doctrine).
 */

export const NOT_PROVIDED = "not provided";

function isPresent(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Unit formatting: fraction → percentage string. */
export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (!isPresent(value)) return NOT_PROVIDED;
  return `${(value * 100).toFixed(digits)}%`;
}

/** Fixed-decimal formatting for artifact metric values. */
export function formatMetric(value: number | null | undefined, digits = 3): string {
  if (!isPresent(value)) return NOT_PROVIDED;
  return value.toFixed(digits);
}

/** Formats a two-sided interval exactly as stored: [low, high]. */
export function formatInterval(
  interval: readonly [number, number] | null | undefined,
  digits = 3
): string {
  if (!interval || !isPresent(interval[0]) || !isPresent(interval[1])) return NOT_PROVIDED;
  return `[${interval[0].toFixed(digits)}, ${interval[1].toFixed(digits)}]`;
}

/** Counts are integers supplied by the artifact; rendered as-is. */
export function formatCount(value: number | null | undefined): string {
  if (!isPresent(value)) return NOT_PROVIDED;
  return String(value);
}

/** Protocol booleans → plain-language flags. */
export function formatFlag(value: boolean | undefined): string {
  if (typeof value !== "boolean") return NOT_PROVIDED;
  return value ? "yes" : "no";
}

/** Decision enum → plain-language state (vocabulary per C-13). */
export function formatDecision(value: string | undefined): string {
  if (value === "above") return "above threshold";
  if (value === "below") return "below threshold";
  if (value === "indeterminate") return "indeterminate";
  return NOT_PROVIDED;
}

/** Group ids like `age_lt_60` fall back to a readable label (pure text transform). */
export function formatGroupIdAsLabel(groupId: string): string {
  return groupId.replace(/_/g, " ");
}

/** Reliability tier → glyph + text (never colour alone, AGENTS §6.1). */
export function formatTierGlyph(tier: string | undefined): string {
  if (tier === "strong") return "●●●";
  if (tier === "moderate") return "●●○";
  if (tier === "limited") return "●○○";
  return "○○○";
}

/**
 * Probe identity from a `LeakageProbeResult.probeId`.
 *
 * The flattening producer encodes the artifact's probe id as the first
 * segment (`probeId = <probe.id>:<target>:<metric>`), while `label` is the
 * C-04 source-type badge (`"probe model"`), which is identical for every
 * row. This pure text transform recovers the judge-visible probe identity
 * (`smote-before-cv` → "smote before cv"); it derives no metric.
 */
export function probeIdentityLabel(probeId: string): string {
  const head = probeId.split(":", 1)[0] ?? probeId;
  const readable = head.replace(/[_-]+/g, " ").trim();
  return readable === "" ? probeId : readable;
}
