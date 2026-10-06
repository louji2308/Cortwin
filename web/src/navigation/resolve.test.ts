import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Registry } from "../contracts";
import { parseUrl, resolveUrl, type UrlContext } from "./parse";
import { createSharePayload, encodeSharePayload } from "./share";

const registryPath = fileURLToPath(new URL("../../../config/registry.json", import.meta.url));
const registry: Registry = JSON.parse(readFileSync(registryPath, "utf8")) as Registry;

const context: UrlContext = {
  registry,
  caseIds: ["case-a", "case-b"],
  defaultCaseId: "case-a",
  defaultTargetId: null
};

function resolve(url: string): ReturnType<typeof resolveUrl> {
  return resolveUrl(parseUrl(url), context);
}

describe("C-10 resolve — known identity passes through untouched", () => {
  it("keeps every known id", () => {
    const resolved = resolve("#/trust/subgroups?case=case-b&target=LAD&feature=Age&stage=history");
    expect(resolved.route).toBe("trust");
    expect(resolved.pane).toBe("subgroups");
    expect(resolved.caseId).toBe("case-b");
    expect(resolved.targetId).toBe("LAD");
    expect(resolved.featureId).toBe("Age");
    expect(resolved.stageId).toBe("history");
    expect(resolved.share).toBeNull();
    expect(resolved.notices).toEqual([]);
  });

  it("falls back to defaults when the query is absent", () => {
    const resolved = resolve("#/explore");
    expect(resolved.caseId).toBe("case-a");
    expect(resolved.targetId).toBeNull();
    expect(resolved.featureId).toBeNull();
    expect(resolved.stageId).toBeNull();
    expect(resolved.notices).toEqual([]);
  });
});

describe("C-10 resolve — unknown ids yield defaults plus a visible notice, never partial state", () => {
  it("unknown case id: case falls back and every query-derived selection with it", () => {
    const resolved = resolve("#/explore?case=ghost&target=LAD&feature=Age");
    expect(resolved.caseId).toBe("case-a");
    expect(resolved.targetId).toBeNull();
    expect(resolved.featureId).toBeNull();
    expect(resolved.notices).toContainEqual({ code: "UNKNOWN_CASE_ID", param: "case" });
  });

  it("unknown target id: even the known case falls back — no partial untrusted state", () => {
    const resolved = resolve("#/explore?case=case-b&target=ECT");
    expect(resolved.caseId).toBe("case-a");
    expect(resolved.targetId).toBeNull();
    expect(resolved.notices).toContainEqual({ code: "UNKNOWN_TARGET_ID", param: "target" });
  });

  it("unknown feature id: everything query-derived falls back", () => {
    const resolved = resolve("#/explore?case=case-b&target=LAD&feature=Ghost");
    expect(resolved.caseId).toBe("case-a");
    expect(resolved.targetId).toBeNull();
    expect(resolved.featureId).toBeNull();
    expect(resolved.notices).toContainEqual({ code: "UNKNOWN_FEATURE_ID", param: "feature" });
  });

  it("unknown stage id: everything query-derived falls back", () => {
    const resolved = resolve("#/explore?case=case-b&stage=ghost");
    expect(resolved.caseId).toBe("case-a");
    expect(resolved.stageId).toBeNull();
    expect(resolved.notices).toContainEqual({ code: "UNKNOWN_STAGE_ID", param: "stage" });
  });

  it("carries grammar notices from the parse layer through resolution", () => {
    const resolved = resolve("#/trust/ghost");
    expect(resolved.route).toBe("trust");
    expect(resolved.pane).toBe("performance");
    expect(resolved.notices.map((entry) => entry.code)).toContain("UNKNOWN_PANE");
  });
});

describe("C-10 resolve — the share payload is validated on its own terms", () => {
  function shareUrl(payload: ReturnType<typeof createSharePayload>): string {
    return `#/explore?share=${encodeURIComponent(encodeSharePayload(payload))}`;
  }

  const baseCase = {
    id: "case-a",
    values: { Age: 50, Weight: 70 },
    providedFeatures: { Age: true, Weight: false },
    providedModalities: { history: false }
  };

  it("accepts a well-formed payload naming a known base case", () => {
    const payload = createSharePayload({
      baseCaseId: "case-a",
      baseValues: baseCase.values,
      baseProvidedFeatures: baseCase.providedFeatures,
      baseProvidedModalities: baseCase.providedModalities,
      values: { ...baseCase.values, Age: 61 },
      providedFeatures: { ...baseCase.providedFeatures },
      providedModalities: { ...baseCase.providedModalities, history: true }
    });
    const resolved = resolve(shareUrl(payload));
    expect(resolved.share).toEqual(payload);
    expect(resolved.notices).toEqual([]);
  });

  it("rejects a malformed token with MALFORMED_SHARE and keeps the active case", () => {
    const resolved = resolve("#/explore?case=case-b&share=not_a_token%21");
    expect(resolved.share).toBeNull();
    expect(resolved.caseId).toBe("case-b");
    expect(resolved.notices).toContainEqual({ code: "MALFORMED_SHARE", param: "share" });
  });

  it("rejects a payload whose base case is unknown", () => {
    const payload = createSharePayload({
      baseCaseId: "ghost-case",
      baseValues: {},
      baseProvidedFeatures: {},
      baseProvidedModalities: {},
      values: { Age: 61 },
      providedFeatures: {},
      providedModalities: {}
    });
    const resolved = resolve(shareUrl(payload));
    expect(resolved.share).toBeNull();
    expect(resolved.notices).toContainEqual({ code: "MALFORMED_SHARE", param: "share" });
  });

  it("rejects a payload carrying a feature the registry does not know", () => {
    const payload = createSharePayload({
      baseCaseId: "case-a",
      baseValues: {},
      baseProvidedFeatures: {},
      baseProvidedModalities: {},
      values: { Ghost: 1 },
      providedFeatures: {},
      providedModalities: {}
    });
    const resolved = resolve(shareUrl(payload));
    expect(resolved.share).toBeNull();
    expect(resolved.notices).toContainEqual({ code: "MALFORMED_SHARE", param: "share" });
  });

  it("rejects a payload whose provided keys are neither features nor modalities", () => {
    const payload = createSharePayload({
      baseCaseId: "case-a",
      baseValues: {},
      baseProvidedFeatures: {},
      baseProvidedModalities: {},
      values: {},
      providedFeatures: {},
      providedModalities: {}
    });
    const tampered = { ...payload, provided: { Ghost: true } };
    const resolved = resolve(shareUrl(tampered));
    expect(resolved.share).toBeNull();
    expect(resolved.notices).toContainEqual({ code: "MALFORMED_SHARE", param: "share" });
  });

  it("keeps a known case id while the share payload alone is rejected", () => {
    const resolved = resolve("#/explore?case=case-b&share=@@@");
    expect(resolved.caseId).toBe("case-b");
    expect(resolved.share).toBeNull();
    expect(resolved.notices.map((entry) => entry.code)).toContain("MALFORMED_SHARE");
  });
});
