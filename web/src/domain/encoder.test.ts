/**
 * Strict domain encoder — Architecture §8.4 / `pipeline/encode.py` mirrored
 * rule by rule (P4-1 DoD "missingness/observed-only" evidence).
 *
 * Each test pins one domain rule and its C-07 error code, plus the two rules
 * that are easy to get wrong: continuous range violations are NOT errors
 * (they surface as `rangeFlags` only), and unobserved features never need a
 * value while still transporting a finite placeholder slot.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Registry } from "../contracts/artifacts";
import { DomainError } from "./errors";
import { buildCaseEncoder, encodeCase } from "./encoder";

type FixtureEntry = {
  id: string;
  input: {
    values: Record<string, unknown>;
    providedFeatures: Record<string, boolean>;
  };
};

function readJson<T>(relativePath: string): T {
  const absolute = fileURLToPath(new URL(relativePath, import.meta.url));
  return JSON.parse(readFileSync(absolute, "utf8")) as T;
}

const registry = readJson<Registry>("../../public/registry.json");
const golden = readJson<{ fixtures: FixtureEntry[] }>("../../public/fixtures/golden.json");
const encoder = buildCaseEncoder();
const baseFixture = golden.fixtures[0];

function provideAll(overrides: Record<string, boolean> = {}): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  for (const feature of registry.features) flags[feature.id] = true;
  for (const [featureId, flag] of Object.entries(overrides)) flags[featureId] = flag;
  return flags;
}

function encode(
  values: Record<string, unknown>,
  providedFeatures: Record<string, boolean> = provideAll(),
  providedModalities: Record<string, boolean> = {},
): ReturnType<typeof encodeCase> {
  return encoder({
    registry,
    values: values as Record<string, number | string>,
    providedFeatures,
    providedModalities,
  });
}

function catchDomainError(run: () => unknown): DomainError {
  try {
    run();
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error("expected a DomainError but nothing was thrown");
}

describe("strict domain encoder", () => {
  it("rejects a forbidden input column before anything else (leakage guard)", () => {
    const error = catchDomainError(() =>
      encode({ ...baseFixture.input.values, LAD: 1 }),
    );
    expect(error.code).toBe("MALFORMED_REQUEST");
    expect(error.columnId).toBe("LAD");
  });

  it("rejects an unknown feature id last, with the lexicographically smallest id", () => {
    const error = catchDomainError(() =>
      encode({ ...baseFixture.input.values, Zebra: 1, Abacus: 2 }),
    );
    expect(error.code).toBe("INVALID_FEATURE_VECTOR");
    expect(error.featureId).toBe("Abacus");
    expect(error.reason).toBe("unknown feature id");
  });

  it("rejects an unknown categorical level", () => {
    const error = catchDomainError(() =>
      encode({ ...baseFixture.input.values, Sex: "Unknown" }),
    );
    expect(error.code).toBe("INVALID_FEATURE_VECTOR");
    expect(error.featureId).toBe("Sex");
    expect(error.reason).toBe("unknown categorical level");
  });

  it("rejects an observed feature with no value", () => {
    const values = { ...baseFixture.input.values };
    delete (values as Record<string, unknown>).Age;
    const error = catchDomainError(() => encode(values));
    expect(error.code).toBe("INVALID_FEATURE_VECTOR");
    expect(error.featureId).toBe("Age");
  });

  it("rejects non-finite values with NONFINITE_INPUT", () => {
    const error = catchDomainError(() => encode({ ...baseFixture.input.values, Age: "NaN" }));
    expect(error.code).toBe("NONFINITE_INPUT");
    expect(error.featureId).toBe("Age");
    expect(error.reason).toBe("non-finite value");
  });

  it("treats an out-of-range continuous value as valid input, not an error", () => {
    const encoded = encode({ ...baseFixture.input.values, Age: 999 });
    const ageIndex = registry.features.findIndex((feature) => feature.id === "Age");
    expect(encoded.featureVector[ageIndex]).toBe(Math.fround(999));
    expect(encoded.observedMask[ageIndex]).toBe(1);
  });

  it("rejects an identity-encoded discrete value outside its allowed set", () => {
    const binary = registry.features.find(
      (feature) =>
        feature.encoding.type === "identity" &&
        feature.kind !== "continuous" &&
        feature.range.max === 1,
    );
    expect(binary).toBeDefined();
    const error = catchDomainError(() =>
      encode({ ...baseFixture.input.values, [binary?.id ?? "HTN"]: 2 }),
    );
    expect(error.code).toBe("INVALID_FEATURE_VECTOR");
    expect(error.featureId).toBe(binary?.id);
    expect(error.reason).toBe("discrete value out of range");
  });

  it("encodes a fully unobserved case without values (blank case)", () => {
    const encoded = encode(
      {},
      provideAll(
        Object.fromEntries(registry.features.map((feature) => [feature.id, false] as const)),
      ),
    );
    expect([...encoded.observedMask].every((flag) => flag === 0)).toBe(true);
    expect([...encoded.featureVector].every((value) => value === 0)).toBe(true);
  });

  it("drops features of a disabled modality even when individually provided", () => {
    const encoded = encode(
      baseFixture.input.values,
      provideAll(),
      { echo: false },
    );
    for (const [index, feature] of registry.features.entries()) {
      const expectObserved = feature.modality !== "echo";
      expect(encoded.observedMask[index]).toBe(expectObserved ? 1 : 0);
      if (!expectObserved) expect(encoded.featureVector[index]).toBe(0);
    }
  });

  it("defaults provision to observed when a feature is absent from the flags", () => {
    const encoded = encode(baseFixture.input.values, {});
    expect([...encoded.observedMask].every((flag) => flag === 1)).toBe(true);
  });

  it("never lets a non-finite value cross the transport boundary", () => {
    for (const fixture of golden.fixtures) {
      let encoded: ReturnType<typeof encodeCase> | null = null;
      let failure: DomainError | null = null;
      try {
        encoded = encode(fixture.input.values, fixture.input.providedFeatures);
      } catch (error) {
        failure = error instanceof DomainError ? error : null;
        expect(error).toBeInstanceOf(DomainError);
      }
      if (encoded === null) {
        expect(failure?.code).toBe("NONFINITE_INPUT");
        expect(failure?.featureId).toBeTruthy();
        continue;
      }
      expect([...encoded.featureVector].every((value) => Number.isFinite(value))).toBe(true);
      expect(encoded.featureVector).toHaveLength(registry.features.length);
      expect(encoded.observedMask).toHaveLength(registry.features.length);
    }
  });
});
