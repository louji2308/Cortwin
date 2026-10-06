import { readFileSync } from "node:fs";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import type { Registry } from "../contracts";
import {
  CASE_A_EXPECTED,
  createHarness,
  disposeHarnesses,
  registry,
  type Harness
} from "../store/testFixtures";
import { ProfileForm } from "./ProfileForm";
import { controlKindFor, fieldId, modalitiesInStageOrder, optionsFor } from "./model";
import type { ProfileFormProps } from "./types";

/**
 * Markup evidence for the Profile form (P6 B1/B4-display/B5, steps 5/6/15/16/17).
 * Dispatch semantics live in ProfileFormStore.test.tsx; this file shows the
 * render output is registry-derived, accessible and copy-safe.
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

function renderForm(h: Harness, overrides: Partial<ProfileFormProps> = {}): string {
  return renderToString(<ProfileForm {...bind(h, overrides)} />);
}

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function labelFor(html: string, controlId: string): string | null {
  const match = new RegExp(`<label[^>]*for="${escapeRe(controlId)}"[^>]*>([^<]*)</label>`).exec(
    html
  );
  return match === null ? null : match[1];
}

function tagWith(html: string, selector: string): string | null {
  const match = new RegExp(`<[^>]*${escapeRe(selector)}[^>]*>`).exec(html);
  return match === null ? null : match[0];
}

function selectHtmlFor(html: string, controlId: string): string {
  const match = new RegExp(`<select[^>]*id="${escapeRe(controlId)}"[^>]*>[\\s\\S]*?</select>`).exec(
    html
  );
  if (match === null) throw new Error(`no select for ${controlId}`);
  return match[0];
}

function hasOption(html: string, value: string, label: string): boolean {
  return new RegExp(`<option[^>]*value="${escapeRe(value)}"[^>]*>${escapeRe(label)}</option>`).test(
    html
  );
}

describe("ProfileForm - registry-driven generation (B1)", () => {
  it("renders all 54 registry features with the control their encoding declares", () => {
    const h = createHarness();
    const html = renderForm(h);
    expect(registry.features).toHaveLength(54);
    const counts: Record<string, number> = { number: 0, checkbox: 0, select: 0, radio: 0 };
    for (const feature of registry.features) {
      const expected = controlKindFor(feature);
      counts[expected] += 1;
      const tag = tagWith(html, `data-feature-id="${feature.id}"`);
      expect(tag, `field tag for ${feature.id}`).not.toBeNull();
      expect(tag as string, feature.id).toContain(`data-control="${expected}"`);
    }
    // Encoding census of the registry of record (C-02): 21 numeric, 11 binary,
    // 20 map selects, 2 ordinal radios.
    expect(counts).toEqual({ number: 21, checkbox: 11, select: 20, radio: 2 });
    const radioInputs = registry.features
      .filter((feature) => controlKindFor(feature) === "radio")
      .reduce((total, feature) => total + optionsFor(feature).length, 0);
    expect(html.match(/data-role="value-input"/g)).toHaveLength(52 + radioInputs);
    expect(html.match(/data-feature-id="/g)).toHaveLength(54);
  });

  it("labels, level options and the derived note come from the registry verbatim", () => {
    const h = createHarness();
    const html = renderForm(h);
    for (const id of ["Age", "Sex", "EF-TTE", "BMI"]) {
      const feature = registry.features.find((entry) => entry.id === id);
      expect(feature, id).toBeDefined();
      expect(labelFor(html, fieldId("ct", id)), id).toBe(feature?.label);
    }
    const sex = registry.features.find((entry) => entry.id === "Sex");
    expect(sex).toBeDefined();
    for (const option of optionsFor(sex as NonNullable<typeof sex>)) {
      expect(hasOption(html, option.value, option.label), option.value).toBe(true);
    }
    const ordinal = registry.features.filter(
      (entry) => entry.encoding.type === "ordinal"
    );
    expect(ordinal).toHaveLength(2);
    for (const feature of ordinal) {
      const groupLabelId = `${fieldId("ct", feature.id)}-label`;
      expect(html).toContain(`id="${groupLabelId}"`);
      expect(html).toContain(`>${feature.label}</span>`);
      for (const option of optionsFor(feature)) {
        expect(html, `${feature.id}:${option.label}`).toContain(`>${option.label}</label>`);
      }
    }
    // The registry of record publishes no units: no unit chip renders...
    expect(html).not.toContain("ct-field__unit");
    // ...and a unit the registry does declare renders - registry-derived copy.
    const withUnit: Registry = {
      ...registry,
      features: registry.features.map((entry) =>
        entry.id === "BP" ? { ...entry, unit: "mmHg" } : entry
      )
    };
    expect(renderForm(h, { registry: withUnit })).toContain(">mmHg<");
  });

  it("follows a renamed registry label, level and modality (no hardcoded copy)", () => {
    const h = createHarness();
    const renamed: Registry = {
      ...registry,
      modalities: registry.modalities.map((modality) =>
        modality.id === "history" ? { ...modality, label: "Patient history" } : modality
      ),
      features: registry.features.map((feature) => {
        if (feature.id === "Age") return { ...feature, label: "Age at study entry" };
        if (feature.id === "Sex") {
          return { ...feature, encoding: { type: "map", map: { Female: 0, Male: 1 } } };
        }
        return feature;
      })
    };
    const html = renderForm(h, { registry: renamed });
    expect(labelFor(html, fieldId("ct", "Age"))).toBe("Age at study entry");
    expect(html).not.toMatch(/>Age<\/label>/);
    expect(html).toContain("Patient history");
    expect(html).not.toMatch(/>History<\/span>/);
    expect(hasOption(html, "Female", "Female")).toBe(true);
    expect(html).not.toContain('value="Fmale"');
    // The case still stores Sex="Male", a key of the renamed map: still selectable.
    expect(hasOption(html, "Male", "Male")).toBe(true);
  });

  it("renders sections in stage order with counts equal to the selector's own truth (A1)", () => {
    const h = createHarness();
    const html = renderForm(h);
    const ids = [...html.matchAll(/data-modality-id="([^"]+)"/g)].map((match) => match[1]);
    expect(ids).toEqual(["history", "exam", "ecg", "labs", "echo"]);
    const counts = [...html.matchAll(/data-role="modality-count">([^<]+)</g)].map(
      (match) => match[1]
    );
    const expected = ids.map((id) => {
      const cell = CASE_A_EXPECTED.byModality[id as keyof typeof CASE_A_EXPECTED.byModality];
      return `${cell.provided} / ${cell.total} provided`;
    });
    expect(counts).toEqual(expected);
    const escapeHtml = (text: string): string =>
      text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    for (const modality of modalitiesInStageOrder(registry)) {
      expect(html, modality.id).toContain(`>${escapeHtml(modality.label)}</span>`);
    }
  });

  it("shows the derived formula only when the derived feature has a value", () => {
    const h = createHarness();
    const bmi = registry.features.find((entry) => entry.id === "BMI");
    expect(bmi?.derived).not.toBeNull();
    const withoutValue = renderForm(h);
    expect(withoutValue).not.toContain('data-role="field-note"');
    const withValue = renderForm(h, {
      values: { ...h.state().case.values, BMI: 23.4 },
      providedFeatures: { ...h.state().case.providedFeatures, BMI: true }
    });
    expect(withValue).toContain('data-role="field-note"');
    expect(withValue).toContain(bmi?.derived?.formula as string);
  });
});

describe("ProfileForm - range guard display (A3/B4)", () => {
  it("warns with registry bounds when the stored value is out of range, silently when in range", () => {
    const h = createHarness();
    const age = registry.features.find((entry) => entry.id === "Age");
    expect(age).toBeDefined();
    const bounds = age as NonNullable<typeof age>;
    const out = renderForm(h, {
      values: { ...h.state().case.values, Age: bounds.range.max + 50 }
    });
    expect(out).toContain('data-role="range-warning"');
    expect(out).toContain(
      `Outside the cohort range (${String(bounds.range.min)} \u2013 ${String(bounds.range.max)}) \u2014 still accepted.`
    );
    expect(out).toContain('aria-hidden="true"');
    const within = renderForm(h, { values: { ...h.state().case.values, Age: bounds.range.min } });
    expect(within).not.toContain('data-role="range-warning"');
  });
});

describe("ProfileForm - missingness rendering (B3 display)", () => {
  it("masks an unprovided select behind a 'not provided' placeholder and message", () => {
    const h = createHarness();
    const html = renderForm(h);
    expect(selectHtmlFor(html, fieldId("ct", "Sex"))).not.toContain("select-placeholder");
    const withheld = renderForm(h, {
      providedFeatures: { ...h.state().case.providedFeatures, Sex: false }
    });
    const sexSelect = selectHtmlFor(withheld, fieldId("ct", "Sex"));
    expect(sexSelect).toContain('data-role="select-placeholder"');
    expect(sexSelect).toContain(">not provided</option>");
    expect(sexSelect).not.toContain('value="Male" selected');
    expect(withheld).toContain('data-role="field-missing"');
    expect(withheld).toContain("Not provided.");
    const fieldTag = tagWith(withheld, 'data-feature-id="Sex"');
    expect(fieldTag).toContain('data-observed="false"');
  });
});

describe("ProfileForm - view-only mode (B2 display)", () => {
  it("shows the banner, marks controls aria-readonly and disables provision toggles", () => {
    const h = createHarness();
    const html = renderForm(h, { readOnly: true });
    expect(html).toContain("View-only \u2014 edits are not recorded.");
    const controls = [...html.matchAll(/<(?:input|select)\b[^>]*>/g)].map((match) => match[0]);
    const valueInputs = controls.filter((tag) => tag.includes('data-role="value-input"'));
    expect(valueInputs.length).toBeGreaterThan(0);
    for (const tag of valueInputs) expect(tag).toContain('aria-readonly="true"');
    const toggles = controls.filter((tag) =>
      /data-role="(?:feature|modality)-provide"/.test(tag)
    );
    expect(toggles).toHaveLength(59);
    for (const tag of toggles) expect(tag).toContain("disabled");
    expect(renderForm(h)).not.toContain("View-only \u2014 edits are not recorded.");
  });
});

describe("ProfileForm - status line (A4)", () => {
  it("renders the status text only from the injected eval status", () => {
    const h = createHarness();
    expect(renderForm(h, { evalStatus: "computing" })).toContain("Updating\u2026");
    expect(renderForm(h, { evalStatus: "updating" })).toContain("Updating\u2026");
    expect(renderForm(h, { evalStatus: "error" })).toContain("Model response unavailable.");
    const idle = renderForm(h, { evalStatus: "idle" });
    expect(idle).not.toContain("Updating\u2026");
    expect(idle).not.toContain("Model response unavailable.");
    expect(idle).toContain('data-eval-status="idle"');
    // The affordance has no clock of its own: status text is props-only.
    const source = readFileSync(new URL("./ProfileForm.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/setTimeout|setInterval|requestAnimationFrame|Date\.now/);
  });
});

describe("ProfileForm - accessibility smoke (B5)", () => {
  it("names every control, keeps ids unique, resolves every label target, no roving tabindex", () => {
    const h = createHarness();
    const html = renderForm(h);
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    const labelTargets = [...html.matchAll(/<label[^>]*for="([^"]+)"/g)].map((match) => match[1]);
    expect(labelTargets.length).toBeGreaterThan(0);
    for (const target of labelTargets) expect(ids, `label -> ${target}`).toContain(target);
    const namedByLabel = new Set(labelTargets);
    const controls = [...html.matchAll(/<(?:input|select|textarea)\b[^>]*>/g)].map(
      (match) => match[0]
    );
    expect(controls.length).toBeGreaterThan(100);
    for (const tag of controls) {
      const ariaLabel = /\baria-label="([^"]*)"/.exec(tag)?.[1];
      const ownId = /\bid="([^"]+)"/.exec(tag)?.[1];
      const labelledBy = /\baria-labelledby="([^"]+)"/.exec(tag)?.[1];
      const named =
        (ariaLabel !== undefined && ariaLabel.trim() !== "") ||
        (ownId !== undefined && namedByLabel.has(ownId)) ||
        (labelledBy !== undefined &&
          labelledBy.split(/\s+/).every((ref) => ids.includes(ref)));
      expect(named, `unnamed control: ${tag}`).toBe(true);
    }
    expect(html).not.toContain('tabindex="-1"');
    for (const match of html.matchAll(/<div[^>]*role="radiogroup"[^>]*>/g)) {
      const by = /aria-labelledby="([^"]+)"/.exec(match[0])?.[1];
      expect(by).toBeDefined();
      expect(ids).toContain(by as string);
    }
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-label="Patient inputs"');
  });

  it("keeps the 44px target and focus-visible rules in the shared tokens, with no colour literals", () => {
    const css = readFileSync(new URL("./ProfileForm.css", import.meta.url), "utf8");
    expect(css).toMatch(/min-height:\s*var\(--ct-target-min\)/);
    expect(css).toMatch(/:focus-visible/);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\(/);
  });
});
