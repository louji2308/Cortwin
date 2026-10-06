import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Registry, RegistryFeature } from "../contracts";
import { encodeCase } from "../domain/encoder";
import { parseFiniteNumber } from "../domain/numbers";
import {
  controlKindFor,
  displayText,
  featuresForModality,
  fieldId,
  isFeatureObserved,
  levelMatches,
  modalitiesInStageOrder,
  modalitySwitchId,
  optionsFor,
  outOfRange,
  parseEntry,
  provideId,
  providedCount,
  slugify,
  type ControlKind
} from "./model";

/** The frozen registry of record — the same file the registry gate validates. */
const registryPath = fileURLToPath(new URL("../../../config/registry.json", import.meta.url));
const registry: Registry = JSON.parse(readFileSync(registryPath, "utf8")) as Registry;

function featureById(id: string): RegistryFeature {
  const found = registry.features.find((feature) => feature.id === id);
  if (found === undefined) throw new Error(`registry has no feature ${id}`);
  return found;
}

const flagsFor = (value: boolean, ids: readonly string[]): Record<string, boolean> =>
  Object.fromEntries(ids.map((id) => [id, value]));

const allFeaturesTrue = flagsFor(true, registry.features.map((f) => f.id));
const allFeaturesFalse = flagsFor(false, registry.features.map((f) => f.id));
const allModalitiesTrue = flagsFor(true, registry.modalities.map((m) => m.id));
const allModalitiesFalse = flagsFor(false, registry.modalities.map((m) => m.id));

describe("controlKindFor — control type per encoding", () => {
  it("maps representative features to their expected control", () => {
    expect(controlKindFor(featureById("Age"))).toBe("number");
    expect(controlKindFor(featureById("FBS"))).toBe("number");
    expect(controlKindFor(featureById("EF-TTE"))).toBe("number");
    expect(controlKindFor(featureById("DM"))).toBe("checkbox");
    expect(controlKindFor(featureById("Current Smoker"))).toBe("checkbox");
    expect(controlKindFor(featureById("Sex"))).toBe("select");
    expect(controlKindFor(featureById("BBB"))).toBe("select");
    expect(controlKindFor(featureById("VHD"))).toBe("select");
    expect(controlKindFor(featureById("Function Class"))).toBe("radio");
    expect(controlKindFor(featureById("Region RWMA"))).toBe("radio");
  });

  it("matches an independently written encoding→control table for all 54 features", () => {
    const table: Record<string, Record<string, ControlKind>> = {
      ordinal: { continuous: "radio", binary: "radio", categorical: "radio" },
      map: { continuous: "select", binary: "select", categorical: "select" },
      identity: { continuous: "number", binary: "checkbox", categorical: "number" }
    };
    for (const feature of registry.features) {
      expect(controlKindFor(feature), feature.id).toBe(table[feature.encoding.type][feature.kind]);
    }
    const counts: Record<ControlKind, number> = { number: 0, checkbox: 0, select: 0, radio: 0 };
    for (const feature of registry.features) counts[controlKindFor(feature)] += 1;
    expect(counts).toEqual({ number: 21, checkbox: 11, select: 20, radio: 2 });
    expect(registry.features).toHaveLength(54);
  });
});

describe("optionsFor — registry levels verbatim", () => {
  it("exposes map keys in registry order for select controls", () => {
    expect(optionsFor(featureById("Sex"))).toEqual([
      { value: "Male", label: "Male" },
      { value: "Fmale", label: "Fmale" }
    ]);
    expect(optionsFor(featureById("BBB"))).toEqual([
      { value: "N", label: "N" },
      { value: "LBBB", label: "LBBB" },
      { value: "RBBB", label: "RBBB" }
    ]);
    expect(optionsFor(featureById("VHD"))).toEqual([
      { value: "N", label: "N" },
      { value: "mild", label: "mild" },
      { value: "Moderate", label: "Moderate" },
      { value: "Severe", label: "Severe" }
    ]);
  });

  it("exposes ordinal levels as ordered option values", () => {
    expect(optionsFor(featureById("Function Class"))).toEqual([
      { value: "0", label: "0" },
      { value: "1", label: "1" },
      { value: "2", label: "2" },
      { value: "3", label: "3" }
    ]);
    expect(optionsFor(featureById("Region RWMA"))).toEqual([
      { value: "0", label: "0" },
      { value: "1", label: "1" },
      { value: "2", label: "2" },
      { value: "3", label: "3" },
      { value: "4", label: "4" }
    ]);
  });

  it("offers no options for identity-encoded features", () => {
    expect(optionsFor(featureById("Age"))).toEqual([]);
    expect(optionsFor(featureById("DM"))).toEqual([]);
  });
});

describe("parseEntry — parity with the domain number parser", () => {
  const PARITY_SAMPLES = [
    "5",
    "5.5",
    "-2",
    "+3",
    "1e3",
    ".5",
    "5.",
    " 42 ",
    "",
    "   ",
    "abc",
    "NaN",
    "nan",
    "Infinity",
    "-inf",
    "0x10",
    "1_0",
    "1e400",
    "1,5",
    "5a",
    "--5"
  ];

  it("agrees with parseFiniteNumber on kind for every sample", () => {
    for (const text of PARITY_SAMPLES) {
      const mine = parseEntry(text);
      const theirs = parseFiniteNumber(text);
      if (mine.kind === "empty") {
        // Form-layer vs domain-layer divergence, asserted deliberately on both
        // sides: an empty (or whitespace-only) box is the form's "nothing
        // entered yet" state — never dispatched, never an error. The domain has
        // no such state: `parseFiniteNumber` classifies "" as non-numeric,
        // because domain "missing" means null/undefined, never a string
        // (domain/numbers.ts, C-08 §8 boundary). Every dispatched value below
        // is checked for exact kind+value agreement.
        expect(theirs.kind, `parseFiniteNumber(${JSON.stringify(text)})`).toBe("non-numeric");
        continue;
      }
      const mineKind = mine.kind === "value" ? "value" : "invalid";
      const theirKind =
        theirs.kind === "value" ? "value" : theirs.kind === "missing" ? "missing" : "invalid";
      expect(mineKind, `parseEntry(${JSON.stringify(text)})`).toBe(theirKind);
      if (mine.kind === "value" && theirs.kind === "value") {
        expect(mine.value).toBe(theirs.value);
      }
    }
  });

  it("parses dispatchable numbers and rejects everything else", () => {
    expect(parseEntry("58")).toEqual({ kind: "value", value: 58 });
    expect(parseEntry(" 27.5 ")).toEqual({ kind: "value", value: 27.5 });
    expect(parseEntry("")).toEqual({ kind: "empty" });
    expect(parseEntry("abc")).toEqual({ kind: "invalid" });
    expect(parseEntry("58y")).toEqual({ kind: "invalid" });
    expect(parseEntry("Infinity")).toEqual({ kind: "invalid" });
  });
});

describe("isFeatureObserved - app-layer provision semantics", () => {
  function syntheticValues(): Record<string, number | string> {
    const values: Record<string, number | string> = {};
    for (const feature of registry.features) {
      const encoding = feature.encoding;
      if (encoding.type === "map") {
        values[feature.id] = Object.keys(encoding.map)[0];
      } else if (encoding.type === "ordinal") {
        values[feature.id] = encoding.levels[0];
      } else {
        values[feature.id] = feature.range.min;
      }
    }
    return values;
  }

  const scenarios: Array<{
    name: string;
    pf: Record<string, boolean>;
    pm: Record<string, boolean>;
  }> = [
    { name: "everything provided", pf: allFeaturesTrue, pm: allModalitiesTrue },
    { name: "nothing provided", pf: allFeaturesFalse, pm: allModalitiesFalse },
    { name: "one feature withheld", pf: { ...allFeaturesTrue, Age: false }, pm: allModalitiesTrue },
    {
      name: "one modality withheld",
      pf: allFeaturesTrue,
      pm: { ...allModalitiesTrue, history: false }
    },
    {
      name: "withheld feature inside a withheld modality",
      pf: { ...allFeaturesTrue, DM: false },
      pm: { ...allModalitiesTrue, history: false }
    },
    { name: "one feature restored", pf: { ...allFeaturesFalse, Age: true }, pm: allModalitiesTrue }
  ];

  it("treats absent provision keys as unprovided - store-selector / C-05 blank-case convention", () => {
    // Deliberate, documented divergence from the domain encoder's transport
    // default (absent flags fail open to observed): the form must count
    // exactly like selectCompletion/selectModalityCounts (`=== true`) so its
    // section counts, the header completion and the harness encoder mask can
    // never disagree (C-05 5.5: a blank case has ALL features unprovided for
    // an empty map). Production cases carry complete 54-key maps, where both
    // conventions agree feature-for-feature - that agreement is what the
    // parity test below pins.
    registry.features.forEach((feature) => {
      expect(isFeatureObserved(feature, {}, {}), feature.id).toBe(false);
    });
    const first = registry.features[0];
    expect(isFeatureObserved(first, { [first.id]: true }, {})).toBe(false);
    expect(isFeatureObserved(first, { [first.id]: true }, { [first.modality]: true })).toBe(true);
  });

  it("agrees with encodeCase wherever provision maps name every key explicitly", () => {
    const values = syntheticValues();
    for (const scenario of scenarios) {
      const encoded = encodeCase({
        registry,
        values,
        providedFeatures: scenario.pf,
        providedModalities: scenario.pm
      });
      registry.features.forEach((feature, index) => {
        expect(isFeatureObserved(feature, scenario.pf, scenario.pm), `${scenario.name} · ${feature.id}`).toBe(
          encoded.observedMask[index] === 1
        );
      });
    }
  });
});

describe("outOfRange — registry range only", () => {
  it("compares continuous values against the published cohort range", () => {
    const age = featureById("Age");
    expect(age.range).toEqual({ min: 30, max: 86 });
    expect(outOfRange(age, 29)).toBe(true);
    expect(outOfRange(age, 87)).toBe(true);
    expect(outOfRange(age, 30)).toBe(false);
    expect(outOfRange(age, 86)).toBe(false);
    expect(outOfRange(age, 50)).toBe(false);
    expect(outOfRange(age, "87")).toBe(true);
    expect(outOfRange(age, "50")).toBe(false);
    expect(outOfRange(age, "abc")).toBe(false);
    expect(outOfRange(age, undefined)).toBe(false);
  });

  it("never flags non-continuous features", () => {
    expect(outOfRange(featureById("DM"), 5)).toBe(false);
    expect(outOfRange(featureById("Sex"), 9)).toBe(false);
    expect(outOfRange(featureById("Function Class"), 9)).toBe(false);
  });

  it("treats the exact published bounds as in range", () => {
    const bmi = featureById("BMI");
    expect(outOfRange(bmi, bmi.range.min)).toBe(false);
    expect(outOfRange(bmi, bmi.range.max)).toBe(false);
    expect(outOfRange(bmi, bmi.range.min - 0.01)).toBe(true);
    expect(outOfRange(bmi, bmi.range.max + 0.01)).toBe(true);
  });
});

describe("stage order, feature order and counts", () => {
  it("orders sections by the registry's stage order", () => {
    expect(modalitiesInStageOrder(registry).map((modality) => modality.id)).toEqual([
      "history",
      "exam",
      "ecg",
      "labs",
      "echo"
    ]);
    const reversed: Registry = { ...registry, modalities: [...registry.modalities].reverse() };
    expect(modalitiesInStageOrder(reversed).map((modality) => modality.id)).toEqual([
      "history",
      "exam",
      "ecg",
      "labs",
      "echo"
    ]);
  });

  it("lists each modality's features in registry order with the published counts", () => {
    expect(featuresForModality(registry, "history").map((f) => f.id).slice(0, 5)).toEqual([
      "Age",
      "Weight",
      "Length",
      "Sex",
      "BMI"
    ]);
    expect(featuresForModality(registry, "history")).toHaveLength(17);
    expect(featuresForModality(registry, "exam")).toHaveLength(13);
    expect(featuresForModality(registry, "ecg")).toHaveLength(7);
    expect(featuresForModality(registry, "labs")).toHaveLength(14);
    expect(featuresForModality(registry, "echo")).toHaveLength(3);
  });

  it("counts features flagged provided - the selector's own convention", () => {
    // Absent keys are unprovided (C-05 blank case) - not fail-open observed.
    expect(providedCount(registry.features, {})).toEqual({ provided: 0, total: 54 });
    expect(providedCount(registry.features, allFeaturesFalse)).toEqual({
      provided: 0,
      total: 54
    });
    expect(providedCount(registry.features, { ...allFeaturesTrue, Age: false })).toEqual({
      provided: 53,
      total: 54
    });
    // Counting ignores the modality flag - exactly like selectModalityCounts -
    // so the section chip and the store selector can never disagree.
    expect(providedCount(featuresForModality(registry, "history"), allFeaturesTrue)).toEqual({
      provided: 17,
      total: 17
    });
  });
});

describe("DOM id helpers", () => {
  it("builds unique ids for every feature and modality", () => {
    const slugs = registry.features.map((feature) => slugify(feature.id));
    expect(new Set(slugs).size).toBe(registry.features.length);
    const all = registry.features.flatMap((feature) => [
      fieldId("ct", feature.id),
      provideId("ct", feature.id)
    ]);
    expect(new Set(all).size).toBe(registry.features.length * 2);
    expect(
      new Set(registry.modalities.map((modality) => modalitySwitchId("ct", modality.id))).size
    ).toBe(registry.modalities.length);
  });

  it("produces stable, readable id fragments", () => {
    expect(fieldId("ct", "Current Smoker")).toBe("ct-field-current-smoker");
    expect(provideId("ct", "Current Smoker")).toBe("ct-provide-current-smoker");
    expect(modalitySwitchId("ct", "history")).toBe("ct-modality-history");
    expect(fieldId("ct", "EF-TTE")).toBe("ct-field-ef-tte");
  });
});

describe("levelMatches and displayText", () => {
  it("matches ordinal levels with the encoder's strictness", () => {
    expect(levelMatches(2, 2)).toBe(true);
    expect(levelMatches(0, 0)).toBe(true);
    expect(levelMatches("2", 2)).toBe(false);
    expect(levelMatches(undefined, 0)).toBe(false);
    expect(levelMatches(2.5, 2)).toBe(false);
  });

  it("renders drafts first, stored values second, nothing when unobserved", () => {
    expect(displayText(58, undefined, true)).toBe("58");
    expect(displayText("Male", undefined, true)).toBe("Male");
    expect(displayText(58, "58a", true)).toBe("58a");
    expect(displayText(undefined, "", true)).toBe("");
    expect(displayText(undefined, undefined, true)).toBe("");
    expect(displayText(58, undefined, false)).toBe("");
    expect(displayText(58, "58a", false)).toBe("");
  });
});
