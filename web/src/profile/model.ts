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
export type ControlKind = "number" | "radio";

/**
 * D-29: two control families only. Every categorical encoding (ordinal, any
 * width map, identity binary) renders as a segmented radio group — two-level
 * choices become a full-width No/Yes toggle, wider sets wrap as pills.
 * Continuous features pair a number input with a cohort-range slider.
 */
export function controlKindFor(feature: RegistryFeature): ControlKind {
  if (feature.encoding.type === "ordinal") return "radio";
  if (feature.encoding.type === "map") return "radio";
  if (feature.kind === "binary") return "radio";
  // identity-encoded continuous (and any identity non-continuous fallback)
  // takes a numeric field; the encoder reads such codes as integers inside
  // the registry range.
  return "number";
}

export type FieldOption = { value: string; label: string };

/** Synthesised labels for an identity-encoded binary — UI affordance words, */
const BINARY_NO = "No";
const BINARY_YES = "Yes";

/**
 * Options for a radio control — registry level names verbatim, never
 * translated or extended. An identity binary gains the two option values
 * `No`/`Yes`; their stored codes come from `binaryCodeFor` (range min/max),
 * so this file never hardcodes 0/1.
 */
export function optionsFor(feature: RegistryFeature): FieldOption[] {
  const encoding = feature.encoding;
  if (encoding.type === "map") {
    return Object.keys(encoding.map).map((key) => ({ value: key, label: key }));
  }
  if (encoding.type === "ordinal") {
    return encoding.levels.map((level) => ({ value: String(level), label: String(level) }));
  }
  if (feature.kind === "binary") {
    return [
      { value: BINARY_NO, label: BINARY_NO },
      { value: BINARY_YES, label: BINARY_YES }
    ];
  }
  return [];
}

/**
 * Stored code for a chosen radio option on an identity-encoded binary, or
 * null when the feature is not identity binary (map codes live in the
 * encoding's own map). The min/max endpoints are the registry's published
 * codes — the single synthesis point for the No/Yes affordance.
 */
export function binaryCodeFor(feature: RegistryFeature, optionValue: string): number | null {
  if (feature.encoding.type !== "identity" || feature.kind !== "binary") return null;
  if (optionValue === BINARY_NO) return feature.range.min;
  if (optionValue === BINARY_YES) return feature.range.max;
  return null;
}

export type SliderAttrs = { min: number; max: number; step: number };

/**
 * Cohort-range slider bounds for a continuous feature — verbatim from
 * `feature.range`, never an external clinical limit. Integer endpoint pairs
 * step by 1; anything else steps by 0.01 (two painted decimals, matching
 * `displayText`).
 */
export function sliderAttrsFor(feature: RegistryFeature): SliderAttrs | null {
  if (feature.kind !== "continuous") return null;
  const { min, max } = feature.range;
  const step = Number.isInteger(min) && Number.isInteger(max) ? 1 : 0.01;
  return { min, max, step };
}

/**
 * Shared radio selection state for the Profile form and the Inspector focus
 * editor (one truth per thing): map keys match verbatim, ordinal levels match
 * by `levelMatches`, identity binaries map the stored code back to No/Yes.
 * Unobserved or unmatched renders no selection — the message slot says so.
 */
export function radioVmFor(
  feature: RegistryFeature,
  raw: FeatureValue | undefined,
  observed: boolean
): { options: FieldOption[]; value: string } {
  const encoding = feature.encoding;
  let value = "";
  if (observed && raw !== undefined) {
    if (encoding.type === "map" && typeof raw === "string") {
      if (Object.prototype.hasOwnProperty.call(encoding.map, raw)) value = raw;
    } else if (encoding.type === "ordinal") {
      const match = encoding.levels.find((entry) => levelMatches(raw, entry));
      value = match === undefined ? "" : String(match);
    } else if (feature.kind === "binary" && encoding.type === "identity") {
      if (typeof raw === "number") {
        if (raw === feature.range.min) value = BINARY_NO;
        else if (raw === feature.range.max) value = BINARY_YES;
      }
    }
  }
  return { options: optionsFor(feature), value };
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
 *
 * Stored numbers keep full double precision (fixtures and encoders own the
 * truth); only the PAINTED text trims to 2 decimals so derived values such as
 * BMI do not show 15 significant digits. The store round-trips on edit, not
 * on display, so nothing numeric changes here.
 */
export function displayText(
  raw: FeatureValue | undefined,
  draft: string | undefined,
  observed: boolean
): string {
  if (!observed) return "";
  if (draft !== undefined) return draft;
  if (raw === undefined) return "";
  if (typeof raw !== "number") return raw;
  const trimmed = Math.round(raw * 100) / 100;
  return String(trimmed);
}
