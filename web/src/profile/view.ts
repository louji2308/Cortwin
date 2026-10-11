import type { FeatureValue, RegistryFeature, RegistryModality } from "../contracts";
import {
  controlKindFor,
  displayText,
  featuresForModality,
  fieldId,
  isFeatureObserved,
  modalitiesInStageOrder,
  modalitySwitchId,
  outOfRange,
  parseEntry,
  provideId,
  providedCount,
  radioVmFor,
  sliderAttrsFor,
  type ControlKind,
  type FieldOption,
  type ProvidedCount,
  type SliderAttrs
} from "./model";
import {
  commitChoice,
  commitFeatureProvided,
  commitModalityProvided,
  commitSelection,
  commitTextEdit,
  type DispatchPort
} from "./handlers";
import type { ProfileFormProps } from "./types";

/**
 * The Profile form's view model (Implementation_Plan P6 step 5): a pure
 * projection from C-09 props + local draft state to everything the renderer
 * needs — sections in registry stage order, one field per registry feature,
 * its control, its messages and its dispatch closures.
 *
 * Built without React so the SAME structure the component renders is directly
 * drivable in tests: invoking a closure is exactly what the DOM event would
 * invoke, and every dispatch still travels through the injected props (never a
 * store import). No feature id, label, level, range or unit literal exists in
 * this file — all of it comes from the Registry the caller supplied.
 */

/** Local, in-progress keystroke state for one numeric field. */
export type FieldDraft = {
  /** Raw text exactly as typed. */
  text: string;
  /** Whether the text parses to a dispatchable number, is empty or is junk. */
  state: "valid" | "empty" | "invalid";
  /** Parsed value when `state === "valid"`, else null. */
  value: number | null;
  /** Case revision the draft was made against (external edits drop it). */
  revision: number;
  /** Blurred at least once — arms the out-of-range warning (no typing flash). */
  settled: boolean;
};

export type Drafts = Record<string, FieldDraft | undefined>;

/**
 * A draft stays visible only while it still describes the store's truth: its
 * revision has not moved (empty/invalid text was never dispatched, so any
 * revision change is external), or it is the valid text whose value it wrote.
 * This drops drafts on case switch without an effect or a ref.
 */
export function isDraftLive(
  draft: FieldDraft | undefined,
  revision: number,
  raw: FeatureValue | undefined
): boolean {
  if (draft === undefined) return false;
  if (draft.revision === revision) return true;
  return draft.state === "valid" && draft.value !== null && raw === draft.value;
}

/** What an event handler wants the component to do with local draft state. */
export type DraftChange =
  | { kind: "none" }
  | { kind: "keep"; featureId: string; draft: FieldDraft }
  | { kind: "clear"; featureIds: string[] };

/** Slider state for a numeric field (D-29): cohort bounds + live thumb value. */
export type SliderVm = SliderAttrs & {
  /** Current thumb position — live draft value, else store value, else null. */
  value: number | null;
  /** No stored value: the thumb rests at cohort min and the track dims. */
  absent: boolean;
};

export type FieldControlVm =
  | { kind: "number"; slider?: SliderVm }
  | { kind: "radio"; options: FieldOption[]; value: string };

export type FieldVm = {
  feature: RegistryFeature;
  controlId: string;
  provideId: string;
  controlKind: ControlKind;
  control: FieldControlVm;
  /** Encoder observation: both this feature's and its modality's flag. */
  observed: boolean;
  /** The feature's own provision flag (absent key = provided). */
  provided: boolean;
  /** Value control is inert because the evidence is not observed. */
  disabled: boolean;
  /** "not provided" toggle is inert only in view-only mode. */
  missingDisabled: boolean;
  /** Text the value control shows (draft first, masked fields always empty). */
  displayValue: string;
  /** Whether the store holds a value for this feature at all. */
  valuePresent: boolean;
  /** Out-of-range message, armed only after the field settles. */
  warning: string | null;
  invalid: boolean;
  invalidMessage: string | null;
  missingMessage: string | null;
  /** The single stable message slot the field reserves under its control. */
  messageId: string;
  onSelect: () => void;
  onEdit: (text: string) => DraftChange;
  onBlur: () => DraftChange;
  onChoose: (optionValue: string) => DraftChange;
  onToggleProvided: (checked: boolean) => DraftChange;
};

export type SectionVm = {
  modality: RegistryModality;
  headerId: string;
  switchId: string;
  provided: boolean;
  count: ProvidedCount;
  notice: string | null;
  fields: FieldVm[];
  onToggleProvided: (checked: boolean) => DraftChange;
};

export type ProfileViewModel = {
  sections: SectionVm[];
  /** "Updating…" affordance — derived from the injected EvalStatus only. */
  statusText: string;
  readOnly: boolean;
  idPrefix: string;
};

const UPDATING = "Updating\u2026";

function statusTextFor(status: ProfileFormProps["evalStatus"]): string {
  if (status === "computing" || status === "updating") return UPDATING;
  if (status === "error") return "Model response unavailable.";
  return "";
}

/**
 * Registry range as published — stringified verbatim, never rounded and never
 * sourced from an external clinical limit (P6 step 16).
 */
function rangeWarning(feature: RegistryFeature): string {
  const { min, max } = feature.range;
  return `Outside the cohort range (${String(min)} \u2013 ${String(max)}) \u2014 still accepted.`;
}

/** Store value as a number when it is one (or parses as one), else null. */
function numericValue(raw: FeatureValue | undefined): number | null {
  if (raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const parsed = parseEntry(raw);
  return parsed.kind === "value" ? parsed.value : null;
}

export function buildProfileViewModel(
  props: ProfileFormProps,
  local: { drafts: Drafts }
): ProfileViewModel {
  const registry = props.registry;
  const revision = props.revision ?? 0;
  const readOnly = props.readOnly === true;
  const idPrefix = props.idPrefix ?? "ct";
  const port: DispatchPort = props;

  const sections: SectionVm[] = modalitiesInStageOrder(registry).map((modality) => {
    const features = featuresForModality(registry, modality.id);
    const modalityProvided = props.providedModalities[modality.id] === true;

    const fields: FieldVm[] = features.map((feature) => {
      const controlId = fieldId(idPrefix, feature.id);
      const provideControlId = provideId(idPrefix, feature.id);
      const raw = props.values[feature.id];
      const provided = props.providedFeatures[feature.id] === true;
      const observed = isFeatureObserved(feature, props.providedFeatures, props.providedModalities);
      const draft = local.drafts[feature.id];
      const live = isDraftLive(draft, revision, raw) ? draft : undefined;
      const controlKind = controlKindFor(feature);

      const invalid = live?.state === "invalid" ? true : false;
      const settled = live === undefined ? true : live.settled;
      const warning =
        observed && controlKind === "number" && settled && outOfRange(feature, raw)
          ? rangeWarning(feature)
          : null;
      // Unprovided evidence (feature flag or modality flag) always says so
      // (C-08 missingness: shown as "not provided", never blank-silent);
      // provided-but-valueless is an empty record, not an absent one.
      const missingMessage = observed
        ? raw === undefined
          ? "No value recorded."
          : null
        : "Not provided.";

      let control: FieldControlVm;
      if (controlKind === "number") {
        // D-29: number input + cohort-range slider (one dispatch path —
        // `onEdit`, same as typing). Thumb tracks the live draft, else the
        // store value; an absent value rests at cohort min, dimmed.
        const attrs = sliderAttrsFor(feature);
        const slid =
          live !== undefined && live.state === "valid" && live.value !== null
            ? live.value
            : numericValue(raw);
        control = {
          kind: "number",
          slider:
            attrs === null
              ? undefined
              : { ...attrs, value: slid, absent: raw === undefined }
        };
      } else {
        // radio (D-29): map keys, ordinal levels and identity binaries share
        // one selection builder (Profile form + Inspector). Unprovided or
        // unmatched shows no selection — the message slot says
        // "Not provided." (C-08), never blank-silent.
        const radio = radioVmFor(feature, raw, observed);
        control = { kind: "radio", options: radio.options, value: radio.value };
      }

      const field: FieldVm = {
        feature,
        controlId,
        provideId: provideControlId,
        controlKind,
        control,
        observed,
        provided,
        // A withheld modality greys its section (C-08: the section switch
        // restores it). A withheld feature keeps its control editable:
        // using it dispatches `setValue`, which provides the field as a side
        // effect (C-09), so there is no dead end. Display stays masked
        // through `observed` above - stored values never leak until observed.
        disabled: !modalityProvided,
        // No empty-provide: offering a feature that has no stored value would
        // hand the encoder an observed slot with no value (typed domain
        // error). Withholding stays available; once withheld without a value
        // the toggle locks until the user types a value (which auto-provides),
        // so every state has a way out.
        missingDisabled: readOnly || (!provided && raw === undefined),
        displayValue: displayText(raw, live?.text, observed),
        valuePresent: raw !== undefined,
        warning,
        invalid,
        invalidMessage: invalid ? "Enter a number." : null,
        missingMessage,
        messageId: `${controlId}-messages`,
        onSelect: () => {
          commitSelection(feature.id, port);
        },
        onEdit: (text: string): DraftChange => {
          const outcome = commitTextEdit(feature, text, port);
          if (outcome.kind === "readonly") return { kind: "none" };
          const next: FieldDraft = {
            text,
            state: outcome.kind === "dispatched" ? "valid" : outcome.kind === "empty" ? "empty" : "invalid",
            value: outcome.kind === "dispatched" ? outcome.value : null,
            revision,
            settled: false
          };
          return { kind: "keep", featureId: feature.id, draft: next };
        },
        onBlur: (): DraftChange => {
          const current = local.drafts[feature.id];
          if (current === undefined || !isDraftLive(current, revision, raw)) {
            return { kind: "none" };
          }
          if (current.state !== "valid") {
            // Junk or emptied text never left the form: drop it so the field
            // shows the store's truth again (no silent divergence).
            return { kind: "clear", featureIds: [feature.id] };
          }
          if (current.settled) return { kind: "none" };
          return { kind: "keep", featureId: feature.id, draft: { ...current, settled: true } };
        },
        onChoose: (optionValue: string): DraftChange => {
          commitChoice(feature, optionValue, port);
          return { kind: "none" };
        },
        onToggleProvided: (checked: boolean): DraftChange => {
          const outcome = commitFeatureProvided(feature.id, checked, port);
          if (outcome.kind === "readonly") return { kind: "none" };
          return { kind: "clear", featureIds: [feature.id] };
        }
      };
      return field;
    });

    return {
      modality,
      headerId: `${idPrefix}-section-${modality.id}`,
      switchId: modalitySwitchId(idPrefix, modality.id),
      provided: modalityProvided,
      count: providedCount(features, props.providedFeatures),
      notice: modalityProvided ? null : "This section is not provided.",
      fields,
      onToggleProvided: (checked: boolean): DraftChange => {
        const outcome = commitModalityProvided(modality.id, checked, port);
        if (outcome.kind === "readonly") return { kind: "none" };
        return { kind: "clear", featureIds: features.map((feature) => feature.id) };
      }
    };
  });

  return {
    sections,
    statusText: statusTextFor(props.evalStatus),
    readOnly,
    idPrefix
  };
}
