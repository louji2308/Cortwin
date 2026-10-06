import type { RegistryFeature } from "../contracts";
import { parseEntry } from "./model";
import type { ProfileFormProps } from "./types";

/**
 * Dispatch decisions for the Profile form (Implementation_Plan P6 steps 5-6,
 * C-09 §7.1 intents). Pure functions: every side effect goes through the
 * callback the container injected via props — this module never imports a
 * store, never reads an artifact and never computes clinical truth.
 *
 * The React layer and the tests call the SAME functions, so "the form
 * dispatched" is always the code path under test.
 */
export type DispatchPort = Pick<
  ProfileFormProps,
  "readOnly" | "onSelectFeature" | "onSetValue" | "onSetFeatureProvided" | "onSetModalityProvided"
>;

export type EditOutcome =
  | { kind: "dispatched"; value: number }
  | { kind: "empty" }
  | { kind: "invalid" }
  | { kind: "readonly" };

/**
 * Numeric field edit. Only a finite plain number leaves the form (garbage and
 * empty text stay local draft state), the grammar is the domain parser's
 * (`domain/numbers.ts`) so a dispatched value is a value the encoder accepts.
 * Out-of-range numbers are dispatched on purpose — the registry range drives a
 * warning, never a block (P6 step 16).
 */
export function commitTextEdit(
  feature: RegistryFeature,
  text: string,
  port: DispatchPort
): EditOutcome {
  if (port.readOnly === true) return { kind: "readonly" };
  const parsed = parseEntry(text);
  if (parsed.kind === "empty") return { kind: "empty" };
  if (parsed.kind === "invalid") return { kind: "invalid" };
  port.onSetValue(feature.id, parsed.value);
  return { kind: "dispatched", value: parsed.value };
}

export type ChoiceOutcome =
  | { kind: "dispatched"; value: number | string }
  | { kind: "unknown" }
  | { kind: "readonly" };

/**
 * Select/radio choice. Map-encoded features dispatch the registry level key
 * verbatim (the encoder reads the string); ordinal features dispatch the
 * registry level number (the encoder compares numbers, never strings).
 * An option that is not a published level is ignored — the form invents no
 * level of its own.
 */
export function commitChoice(
  feature: RegistryFeature,
  optionValue: string,
  port: DispatchPort
): ChoiceOutcome {
  if (port.readOnly === true) return { kind: "readonly" };
  const encoding = feature.encoding;
  if (encoding.type === "map") {
    if (!Object.prototype.hasOwnProperty.call(encoding.map, optionValue)) {
      return { kind: "unknown" };
    }
    port.onSetValue(feature.id, optionValue);
    return { kind: "dispatched", value: optionValue };
  }
  if (encoding.type === "ordinal") {
    const level = encoding.levels.find((entry) => String(entry) === optionValue);
    if (level === undefined) return { kind: "unknown" };
    port.onSetValue(feature.id, level);
    return { kind: "dispatched", value: level };
  }
  return { kind: "unknown" };
}

export type BinaryOutcome =
  | { kind: "dispatched"; value: number }
  | { kind: "readonly" };

/**
 * Boolean field edit. The codes come from the feature's own published range
 * (identity-encoded booleans publish {min: 0, max: 1}), so nothing is
 * hardcoded here and the encoder's integer-in-range rule always holds.
 */
export function commitBinary(
  feature: RegistryFeature,
  checked: boolean,
  port: DispatchPort
): BinaryOutcome {
  if (port.readOnly === true) return { kind: "readonly" };
  const value = checked ? feature.range.max : feature.range.min;
  port.onSetValue(feature.id, value);
  return { kind: "dispatched", value };
}

export type ProvisionOutcome = { kind: "dispatched" } | { kind: "readonly" };

/**
 * Per-feature "not provided" toggle. The caller passes the checkbox state
 * (checked = not provided) and this inverts it into the C-09 provision flag.
 * No value is written: absence is the mask, never a stand-in number
 * (C-08 §8.2 missingness).
 */
export function commitFeatureProvided(
  featureId: string,
  notProvided: boolean,
  port: DispatchPort
): ProvisionOutcome {
  if (port.readOnly === true) return { kind: "readonly" };
  port.onSetFeatureProvided(featureId, !notProvided);
  return { kind: "dispatched" };
}

/** Per-modality "not provided" toggle — same inversion, canonical mask (C-09). */
export function commitModalityProvided(
  modalityId: string,
  notProvided: boolean,
  port: DispatchPort
): ProvisionOutcome {
  if (port.readOnly === true) return { kind: "readonly" };
  port.onSetModalityProvided(modalityId, !notProvided);
  return { kind: "dispatched" };
}

/**
 * Field selection intent. Allowed even in view-only mode: selection is not a
 * case change and never bumps the revision (C-09 §7.1 "Selection-only and
 * view-only changes do not [increment revision]").
 */
export function commitSelection(featureId: string, port: DispatchPort): void {
  port.onSelectFeature(featureId);
}
