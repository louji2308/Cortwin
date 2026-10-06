import type {
  FeatureValue,
  Registry,
  RegistryFeature,
  RegistryModality
} from "../contracts";

/**
 * Registry-driven projections and input parsing for the Profile form
 * (Implementation_Plan P6 step 5 "configuration-driven field controls",
 * step 16 "out-of-range warnings without inventing external clinical limits",
 * step 17 "patient numbers are never typed into component source").
 *
 * Pure functions only — no DOM, no store, no engine. Every label, level,
 * range, unit and count comes from the Registry the caller supplies; this
 * file contains no feature-specific constant of any kind.
 *
 * `parseEntry` and `levelMatches` mirror the domain
 * encoder (`domain/encoder.ts`, `domain/numbers.ts`) exactly and are pinned to
 * it by parity tests in `model.test.tsx`, so a value the form dispatches is a
 * value the encoder accepts. Observation follows the app-layer convention
 * below, which equals the encoder's mask for every map production ships.
 */

/** Which native control renders a feature — derived from kind + encoding. */
export type ControlKind = "number" | "checkbox" | "select" | "radio";

export function controlKindFor(feature: RegistryFeature): ControlKind {
  if (feature.encoding.type === "ordinal") return "radio";
  if (feature.encoding.type === "map") return "select";
  if (feature.kind === "binary") return "checkbox";
  // identity-encoded continuous (and any identity non-continuous fallback)
  // takes a numeric field; the encoder reads such codes as integers inside
  // the registry range.
  return "number";
}

export type FieldOption = { value: string; label: string };

/**
 * Ordered options for select/radio controls — registry level names verbatim,
 * never translated or extended.
 */
export function optionsFor(feature: RegistryFeature): FieldOption[] {
  const encoding = feature.encoding;
  if (encoding.type === "map") {
    return Object.keys(encoding.map).map((key) => ({ value: key, label: key }));
  }
  if (encoding.type === "ordinal") {
    return encoding.levels.map((level) => ({ value: String(level), label: String(level) }));
  }
  return [];
}

export type EntryParse =
  | { kind: "empty" }
  | { kind: "value"; value: number }
  | { kind: "invalid" };

/** Same accepted grammar as `domain/numbers.ts::pythonFloatFromString`. */
const PLAIN_NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * Parse raw field text before dispatch. Only a finite plain number is
 * dispatchable; empty and unparseable text never leave the form (they stay
 * local draft state), which keeps the store free of junk and the encoder free
 * of failures the user could have seen coming.
 */
export function parseEntry(text: string): EntryParse {
  const trimmed = text.trim();
  if (trimmed === "") return { kind: "empty" };
  if (!PLAIN_NUMBER.test(trimmed)) return { kind: "invalid" };
  const value = Number(trimmed);
  return Number.isFinite(value) ? { kind: "value", value } : { kind: "invalid" };
}

/**
 * Observation test — the app-layer provision convention the store's own
 * selectors use (`selectCompletion` / `selectModalityCounts`: `=== true`),
 * matching C-05 §5.5 "a blank case has all features unprovided" for an empty
 * map: a feature counts as provided only when BOTH its own flag and its
 * modality's flag are explicitly true; an absent key means unprovided.
 *
 * The form must count exactly like the selectors so section counts and the
 * header completion can never disagree (one truth per thing). Production
 * cases carry complete 54-key maps, where this convention and the domain
 * encoder's transport default (absent flags fail open to observed) agree on
 * every feature; the divergence exists only for sparse maps, which the form
 * renders, the selectors count and the harness encoder mask alike.
 */
export function isFeatureObserved(
  feature: RegistryFeature,
  providedFeatures: Record<string, boolean>,
  providedModalities: Record<string, boolean>
): boolean {
  return providedFeatures[feature.id] === true && providedModalities[feature.modality] === true;
}

/**
 * Registry-range comparison for continuous features only (P6 step 16). The
 * bounds come from `feature.range` — the cohort range the pipeline published —
 * never from an external clinical source. Out-of-range stays valid input; this
 * flag only asks the UI to say so.
 */
export function outOfRange(feature: RegistryFeature, raw: FeatureValue | undefined): boolean {
  if (feature.kind !== "continuous" || raw === undefined) return false;
  let numeric: number | null;
  if (typeof raw === "number") {
    numeric = Number.isFinite(raw) ? raw : null;
  } else {
    const parsed = parseEntry(raw);
    numeric = parsed.kind === "value" ? parsed.value : null;
  }
  if (numeric === null) return false;
  return numeric < feature.range.min || numeric > feature.range.max;
}

/** Sections in registry stage order (modalities sorted by their `order`). */
export function modalitiesInStageOrder(registry: Registry): RegistryModality[] {
  return [...registry.modalities].sort((a, b) => a.order - b.order);
}

/** Features of one modality in registry order (row order inside a section). */
export function featuresForModality(registry: Registry, modalityId: string): RegistryFeature[] {
  return registry.features.filter((feature) => feature.modality === modalityId);
}

export type ProvidedCount = { provided: number; total: number };

/**
 * `n / total` features flagged provided - counted EXACTLY like the store's
 * `selectModalityCounts` (feature flags only, modality flag excluded), so this
 * chip can never disagree with the selector's own truth for the same state.
 * Per-field observation stays modality-aware through `isFeatureObserved`.
 */
export function providedCount(
  features: readonly RegistryFeature[],
  providedFeatures: Record<string, boolean>
): ProvidedCount {
  let provided = 0;
  for (const feature of features) {
    if (providedFeatures[feature.id] === true) provided += 1;
  }
  return { provided, total: features.length };
}

/** Lower-case, separator-safe DOM id fragment from an arbitrary identifier. */
export function slugify(id: string): string {
  return id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function fieldId(prefix: string, featureId: string): string {
  return `${prefix}-field-${slugify(featureId)}`;
}

export function provideId(prefix: string, featureId: string): string {
  return `${prefix}-provide-${slugify(featureId)}`;
}

export function modalitySwitchId(prefix: string, modalityId: string): string {
  return `${prefix}-modality-${slugify(modalityId)}`;
}

/**
 * Ordinal comparison mirroring `domain/numbers.ts::levelMatches` semantics for
 * the registry's numeric levels: same type, same value. A stored value of a
 * different type is not a level (the encoder would reject it too).
 */
export function levelMatches(raw: FeatureValue | undefined, level: number): boolean {
  return typeof raw === "number" && raw === level;
}

/**
 * Text shown inside a control: local draft first (while the user is mid-edit),
 * otherwise the stored value, otherwise nothing. Unobserved features always
 * render empty — a masked feature never displays a stand-in value.
 */
export function displayText(
  raw: FeatureValue | undefined,
  draft: string | undefined,
  observed: boolean
): string {
  if (!observed) return "";
  if (draft !== undefined) return draft;
  if (raw === undefined) return "";
  return typeof raw === "number" ? String(raw) : raw;
}
