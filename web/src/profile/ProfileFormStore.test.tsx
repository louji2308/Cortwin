import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import {
  CASE_A_EXPECTED,
  createHarness,
  disposeHarnesses,
  registry,
  type Harness
} from "../store/testFixtures";
import { FieldView, ProfileForm } from "./ProfileForm";
import { buildProfileViewModel, type DraftChange, type Drafts, type FieldVm, type ProfileViewModel, type SectionVm } from "./view";
import type { ProfileFormProps } from "./types";

/**
 * Dispatch semantics for the Profile form (P6 B2/B3/B4, C-09 §7.1): the
 * closures the component binds are invoked directly against a real store
 * harness, so "the form dispatched" is always the code path under test.
 * Revision rules, missingness masking and the range/invalid guards are
 * asserted through store truth, never through mocks of it.
 */

afterEach(() => {
  disposeHarnesses();
});

function bind(h: Harness, overrides: Partial<ProfileFormProps> = {}): ProfileFormProps {
  const store = h.store;
  const state = h.state();
  return {
    registry,
    values: state.case.values,
    providedFeatures: state.case.providedFeatures,
    providedModalities: state.case.providedModalities,
    revision: state.case.revision,
    evalStatus: state.eval.status,
    onSelectFeature: (featureId) => {
      store.intents.selection.selectFeature(featureId);
    },
    onSetValue: (featureId, value) => {
      store.intents.case.setValue(featureId, value);
    },
    onSetFeatureProvided: (featureId, provided) => {
      store.intents.case.setFeatureProvided(featureId, provided);
    },
    onSetModalityProvided: (modalityId, provided) => {
      store.intents.case.setModalityProvided(modalityId, provided);
    },
    ...overrides
  };
}

function vmOf(h: Harness, overrides: Partial<ProfileFormProps> = {}, drafts: Drafts = {}): ProfileViewModel {
  return buildProfileViewModel(bind(h, overrides), { drafts });
}

function fieldOf(vm: ProfileViewModel, featureId: string): FieldVm {
  for (const section of vm.sections) {
    const match = section.fields.find((field) => field.feature.id === featureId);
    if (match !== undefined) return match;
  }
  throw new Error(`no field for ${featureId}`);
}

function sectionOf(vm: ProfileViewModel, modalityId: string): SectionVm {
  const match = vm.sections.find((section) => section.modality.id === modalityId);
  if (match === undefined) throw new Error(`no section for ${modalityId}`);
  return match;
}

/** Mirror of the component's draft application, so tests replay the same FSM. */
function applyDrafts(drafts: Drafts, change: DraftChange): Drafts {
  if (change.kind === "none") return drafts;
  if (change.kind === "keep") return { ...drafts, [change.featureId]: change.draft };
  const next = { ...drafts };
  for (const featureId of change.featureIds) delete next[featureId];
  return next;
}

function renderField(field: FieldVm, readOnly = false): string {
  return renderToString(<FieldView field={field} readOnly={readOnly} onEvent={() => undefined} />);
}

function caseSnapshot(h: Harness): ReturnType<Harness["state"]>["case"] {
  return structuredClone(h.state().case);
}

describe("ProfileForm dispatch - C-09 edit intents (B2)", () => {
  it("a numeric edit dispatches case.setValue: revision +1, value stored, provision untouched", () => {
    const h = createHarness();
    const before = h.state().case;
    fieldOf(vmOf(h), "Age").onEdit("70");
    const after = h.state().case;
    expect(after.revision).toBe(before.revision + 1);
    expect(after.values).toEqual({ ...before.values, Age: 70 });
    expect(after.providedFeatures.Age).toBe(true);
  });

  it("map keys dispatch verbatim, ordinal levels dispatch numbers, binary codes come from the registry range", () => {
    const h = createHarness();
    fieldOf(vmOf(h), "Sex").onChoose("Fmale");
    expect(h.state().case.values.Sex).toBe("Fmale");
    fieldOf(vmOf(h), "Function Class").onChoose("3");
    expect(h.state().case.values["Function Class"]).toBe(3);
    expect(typeof h.state().case.values["Function Class"]).toBe("number");
    const dm = registry.features.find((feature) => feature.id === "DM");
    expect(dm).toBeDefined();
    const revisionBefore = h.state().case.revision;
    fieldOf(vmOf(h), "DM").onToggle(true);
    expect(h.state().case.values.DM).toBe((dm as NonNullable<typeof dm>).range.max);
    fieldOf(vmOf(h), "DM").onToggle(false);
    expect(h.state().case.values.DM).toBe((dm as NonNullable<typeof dm>).range.min);
    expect(h.state().case.revision).toBe(revisionBefore + 2);
  });

  it("selection never bumps the revision (C-09) - edit mode and view-only alike", () => {
    const h = createHarness();
    const before = h.state().case.revision;
    fieldOf(vmOf(h), "Age").onSelect();
    expect(h.state().selection.featureId).toBe("Age");
    expect(h.state().case.revision).toBe(before);
    fieldOf(vmOf(h, { readOnly: true }), "Sex").onSelect();
    expect(h.state().selection.featureId).toBe("Sex");
    expect(h.state().case.revision).toBe(before);
  });

  it("view-only mode dispatches nothing: case truth deep-equals its snapshot", () => {
    const h = createHarness();
    const snapshot = caseSnapshot(h);
    fieldOf(vmOf(h, { readOnly: true }), "Age").onEdit("99");
    fieldOf(vmOf(h, { readOnly: true }), "Sex").onChoose("Fmale");
    fieldOf(vmOf(h, { readOnly: true }), "DM").onToggle(true);
    fieldOf(vmOf(h, { readOnly: true }), "Age").onToggleProvided(true);
    sectionOf(vmOf(h, { readOnly: true }), "history").onToggleProvided(true);
    expect(h.state().case).toEqual(snapshot);
    // Selection is still allowed in view-only mode (C-09: no revision change).
    fieldOf(vmOf(h, { readOnly: true }), "Age").onSelect();
    expect(h.state().selection.featureId).toBe("Age");
    expect(h.state().case.revision).toBe(snapshot.revision);
  });
});

describe("ProfileForm dispatch - missingness (B3)", () => {
  it("withholding a valued feature masks the display, keeps the stored value, writes no placeholder", () => {
    const h = createHarness();
    const before = caseSnapshot(h);
    fieldOf(vmOf(h), "Age").onToggleProvided(true);
    const after = h.state().case;
    expect(after.providedFeatures.Age).toBe(false);
    expect(after.revision).toBe(before.revision + 1);
    expect(after.values).toEqual(before.values); // no placeholder, value masked not deleted
    const field = fieldOf(vmOf(h), "Age");
    expect(field.provided).toBe(false);
    expect(field.observed).toBe(false);
    expect(field.displayValue).toBe("");
    expect(field.missingMessage).toBe("Not provided.");
    expect(field.missingDisabled).toBe(false); // stored value present: re-provide allowed
    expect(field.disabled).toBe(false); // modality still provided: typing stays available
    const html = renderField(field);
    expect(html).toContain('data-role="field-missing"');
    expect(html).toContain("Not provided.");
    // Re-provide restores the stored value to view.
    field.onToggleProvided(false);
    expect(h.state().case.providedFeatures.Age).toBe(true);
    expect(fieldOf(vmOf(h), "Age").displayValue).toBe("62");
  });

  it("shows 'No value recorded.' for a flagged feature with no value, and withholding it writes no key", () => {
    const h = createHarness();
    const valueless = registry.features.find(
      (feature) => h.state().case.values[feature.id] === undefined
    );
    expect(valueless).toBeDefined();
    const id = (valueless as NonNullable<typeof valueless>).id;
    expect(Object.prototype.hasOwnProperty.call(h.state().case.values, id)).toBe(false);
    // Defensive state: a supplied case may flag a feature provided yet carry no
    // value. The form itself can never create this state (empty-provide is
    // locked below); it must render it honestly and never invent a number.
    const flagged = { ...h.state().case.providedFeatures, [id]: true };
    const before = caseSnapshot(h);
    const field = fieldOf(vmOf(h, { providedFeatures: flagged }), id);
    expect(field.provided).toBe(true);
    expect(field.observed).toBe(true);
    expect(field.missingMessage).toBe("No value recorded.");
    expect(field.missingDisabled).toBe(false); // withholding is always allowed
    field.onToggleProvided(true);
    expect(h.state().case.providedFeatures[id]).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(h.state().case.values, id)).toBe(false);
    expect(h.state().case.revision).toBe(before.revision + 1);
    const withheld = fieldOf(vmOf(h), id);
    expect(withheld.observed).toBe(false);
    expect(withheld.missingMessage).toBe("Not provided.");
    expect(withheld.missingDisabled).toBe(true); // no empty-provide path
    expect(renderField(withheld)).toContain("disabled");
    expect(withheld.disabled).toBe(false); // typing a value is the documented way out
  });

  it("withholding a modality greys its section, keeps values, keeps selector-consistent counts", () => {
    const h = createHarness();
    const before = caseSnapshot(h);
    sectionOf(vmOf(h), "history").onToggleProvided(true);
    expect(h.state().case.providedModalities.history).toBe(false);
    expect(h.state().case.revision).toBe(before.revision + 1);
    expect(h.state().case.values).toEqual(before.values);
    const vm = vmOf(h);
    const section = sectionOf(vm, "history");
    expect(section.provided).toBe(false);
    expect(section.notice).toBe("This section is not provided.");
    expect(section.count).toEqual({
      provided: CASE_A_EXPECTED.byModality.history.provided,
      total: CASE_A_EXPECTED.byModality.history.total
    });
    const age = fieldOf(vm, "Age");
    expect(age.disabled).toBe(true);
    expect(age.observed).toBe(false);
    expect(age.displayValue).toBe("");
    const html = renderToString(<ProfileForm {...bind(h)} />);
    expect(html).toContain('data-modality-id="history" data-provided="false"');
    expect(html).toContain("This section is not provided.");
    const sectionTag = /<section[^>]*data-modality-id="history"[^>]*>/.exec(html)?.[0];
    expect(sectionTag).toBeDefined();
  });
});

describe("ProfileForm dispatch - range guard lifecycle (A3/B4)", () => {
  it("an out-of-range edit dispatches immediately but warns only once settled", () => {
    const h = createHarness();
    const age = registry.features.find((feature) => feature.id === "Age");
    expect(age).toBeDefined();
    const bounds = age as NonNullable<typeof age>;
    const out = bounds.range.max + 10;
    const revisionBefore = h.state().case.revision;
    let drafts: Drafts = applyDrafts({}, fieldOf(vmOf(h), "Age").onEdit(String(out)));
    expect(h.state().case.values.Age).toBe(out);
    expect(h.state().case.revision).toBe(revisionBefore + 1);
    const typing = fieldOf(vmOf(h, {}, drafts), "Age");
    expect(typing.displayValue).toBe(String(out));
    expect(typing.warning).toBeNull(); // no flash while typing
    drafts = applyDrafts(drafts, typing.onBlur());
    const settled = fieldOf(vmOf(h, {}, drafts), "Age");
    expect(settled.warning).toBe(
      `Outside the cohort range (${String(bounds.range.min)} \u2013 ${String(bounds.range.max)}) \u2014 still accepted.`
    );
    const html = renderField(settled);
    expect(html).toContain('data-role="range-warning"');
    expect(html).toContain("\u25B3");
    // In-range edits dispatch and stay silent.
    const revision2 = h.state().case.revision;
    drafts = applyDrafts({}, fieldOf(vmOf(h), "Age").onEdit(String(bounds.range.min)));
    expect(h.state().case.values.Age).toBe(bounds.range.min);
    expect(h.state().case.revision).toBe(revision2 + 1);
    const inRange = fieldOf(vmOf(h, {}, drafts), "Age");
    expect(inRange.warning).toBeNull();
    drafts = applyDrafts(drafts, inRange.onBlur());
    expect(fieldOf(vmOf(h, {}, drafts), "Age").warning).toBeNull();
  });
});

describe("ProfileForm dispatch - invalid and stale drafts (B4)", () => {
  it("junk text never dispatches: invalid state renders, blur restores store truth", () => {
    const h = createHarness();
    const before = caseSnapshot(h);
    let drafts: Drafts = applyDrafts({}, fieldOf(vmOf(h), "Age").onEdit("abc"));
    expect(h.state().case).toEqual(before); // no dispatch at all
    const invalidField = fieldOf(vmOf(h, {}, drafts), "Age");
    expect(invalidField.invalid).toBe(true);
    expect(invalidField.invalidMessage).toBe("Enter a number.");
    expect(invalidField.displayValue).toBe("abc");
    const html = renderField(invalidField);
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('data-role="field-error"');
    expect(html).toContain("Enter a number.");
    drafts = applyDrafts(drafts, invalidField.onBlur());
    expect(drafts).toEqual({});
    const restored = fieldOf(vmOf(h, {}, drafts), "Age");
    expect(restored.displayValue).toBe(String(before.values.Age));
    expect(restored.invalid).toBe(false);
  });

  it("an emptied field dispatches nothing, shows nothing, and recovers on blur", () => {
    const h = createHarness();
    const before = caseSnapshot(h);
    let drafts: Drafts = applyDrafts({}, fieldOf(vmOf(h), "Age").onEdit(""));
    expect(h.state().case).toEqual(before);
    const empty = fieldOf(vmOf(h, {}, drafts), "Age");
    expect(empty.displayValue).toBe("");
    expect(empty.invalid).toBe(false);
    drafts = applyDrafts(drafts, empty.onBlur());
    expect(fieldOf(vmOf(h, {}, drafts), "Age").displayValue).toBe(String(before.values.Age));
  });

  it("in-progress text is dropped when case truth moves (revision never goes stale)", () => {
    const h = createHarness();
    const selectBlank = h.store.intents.case.select("blank");
    expect(selectBlank.ok).toBe(true);
    let drafts: Drafts = applyDrafts({}, fieldOf(vmOf(h), "Age").onEdit("70"));
    expect(h.state().case.values.Age).toBe(70);
    const selectBack = h.store.intents.case.select("hypo1");
    expect(selectBack.ok).toBe(true);
    const field = fieldOf(vmOf(h, {}, drafts), "Age");
    expect(field.displayValue).toBe("62"); // the restored case's truth, not the stale "70"
    expect(field.invalid).toBe(false);
  });
});
