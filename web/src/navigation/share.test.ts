import { describe, expect, it } from "vitest";
import {
  createSharePayload,
  decodeSharePayload,
  encodeSharePayload
} from "./share";
import type { SharePayloadV1 } from "./types";

function tokenOf(json: string): string {
  return Buffer.from(json, "utf8").toString("base64url");
}

describe("C-10 share codec — symmetric and URL-safe", () => {
  const payload: SharePayloadV1 = {
    version: 1,
    baseCase: "case-a",
    values: { Age: 61, Sex: "Male" },
    provided: { history: true, Exam: false }
  };

  it("round-trips a payload through encode → decode", () => {
    const token = encodeSharePayload(payload);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeSharePayload(token)).toEqual({ ok: true, payload });
  });

  it("survives serialization inside a URL query unchanged", () => {
    const token = encodeSharePayload(payload);
    const decoded = decodeSharePayload(decodeURIComponent(encodeURIComponent(token)));
    expect(decoded).toEqual({ ok: true, payload });
  });
});

describe("C-10 share codec — total rejection, never a throw", () => {
  const REJECT_CASES: Array<{ name: string; token: string }> = [
    { name: "an empty token", token: "" },
    { name: "characters outside the URL-safe alphabet", token: "ab+cd" },
    { name: "characters outside the URL-safe alphabet (slash)", token: "ab/cd" },
    { name: "characters outside the URL-safe alphabet (bang)", token: "ab!cd" },
    { name: "valid base64url that is not JSON", token: tokenOf("not json at all") },
    { name: "valid JSON that is not an object", token: tokenOf("[1,2,3]") },
    { name: "a payload with a foreign version", token: tokenOf(JSON.stringify({ version: 2, baseCase: "a", values: {}, provided: {} })) },
    { name: "a payload missing provided", token: tokenOf(JSON.stringify({ version: 1, baseCase: "a", values: {} })) },
    { name: "a payload with an extra key", token: tokenOf(JSON.stringify({ version: 1, baseCase: "a", values: {}, provided: {}, extra: 1 })) },
    { name: "a payload with an empty base case", token: tokenOf(JSON.stringify({ version: 1, baseCase: "", values: {}, provided: {} })) },
    { name: "a payload whose values are not an object", token: tokenOf(JSON.stringify({ version: 1, baseCase: "a", values: [], provided: {} })) },
    { name: "a payload with a non-finite value entry", token: tokenOf(JSON.stringify({ version: 1, baseCase: "a", values: { Age: null }, provided: {} })) },
    { name: "a payload with a non-boolean provided entry", token: tokenOf(JSON.stringify({ version: 1, baseCase: "a", values: {}, provided: { history: "yes" } })) },
    { name: "truncated UTF-8 bytes", token: Buffer.from([0xff, 0xfe, 0xfd]).toString("base64url") }
  ];

  for (const testCase of REJECT_CASES) {
    it(`rejects ${testCase.name} with MALFORMED_SHARE`, () => {
      const result = decodeSharePayload(testCase.token);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.notice).toEqual({ code: "MALFORMED_SHARE", param: "share" });
      }
    });
  }

  it("never throws for arbitrary garbage tokens", () => {
    const garbage = ["!", "@@@@", "....", "=", "a".repeat(10_000), "\u0000"];
    for (const token of garbage) {
      expect(() => decodeSharePayload(token)).not.toThrow();
    }
  });
});

describe("C-10 share payload — diffs only, never a case copy", () => {
  const base = {
    baseCaseId: "case-a",
    baseValues: { Age: 50, Weight: 70, Height: 170 },
    baseProvidedFeatures: { Age: true, Weight: true, Height: false },
    baseProvidedModalities: { history: false, exam: false }
  };

  it("keeps only the values that differ from the base case", () => {
    const payload = createSharePayload({
      ...base,
      values: { Age: 61, Weight: 70, Height: 170 },
      providedFeatures: base.baseProvidedFeatures,
      providedModalities: base.baseProvidedModalities
    });
    expect(payload).toEqual({ version: 1, baseCase: "case-a", values: { Age: 61 }, provided: {} });
  });

  it("records provided flips for features and modalities under one map", () => {
    const payload = createSharePayload({
      ...base,
      values: base.baseValues,
      providedFeatures: { Age: true, Weight: false, Height: false },
      providedModalities: { history: true, exam: false }
    });
    expect(payload.provided).toEqual({ Weight: false, history: true });
    expect(payload.values).toEqual({});
  });

  it("an untouched case produces an empty diff", () => {
    const payload = createSharePayload({
      ...base,
      values: base.baseValues,
      providedFeatures: base.baseProvidedFeatures,
      providedModalities: base.baseProvidedModalities
    });
    expect(payload).toEqual({ version: 1, baseCase: "case-a", values: {}, provided: {} });
  });

  it("a value equal to the base stays out even when the key exists", () => {
    const payload = createSharePayload({
      ...base,
      values: { Age: 50 },
      providedFeatures: base.baseProvidedFeatures,
      providedModalities: base.baseProvidedModalities
    });
    expect(payload.values).toEqual({});
  });
});
