import { describe, expect, it } from "vitest";
import { C10_HREF_PATTERN } from "../system/c10";
import { parseUrl } from "./parse";
import { historyAction, historyActionBetween, serializeUrl } from "./serialize";
import type { UrlStateInput } from "./types";

describe("C-10 serializer — canonical form", () => {
  it("emits query keys in the contract order: case, target, feature, stage, share", () => {
    const href = serializeUrl({
      route: "trust",
      pane: "subgroups",
      stageId: "history",
      featureId: "Age",
      targetId: "LAD",
      caseId: "case-a",
      share: "TOKEN"
    });
    expect(href).toBe(
      "#/trust/subgroups?case=case-a&target=LAD&feature=Age&stage=history&share=TOKEN"
    );
  });

  it("omits null, undefined and empty values entirely", () => {
    const href = serializeUrl({
      route: "explore",
      caseId: "case-a",
      targetId: null,
      featureId: undefined,
      stageId: "",
      share: null
    });
    expect(href).toBe("#/explore?case=case-a");
    expect(href).not.toContain("target");
    expect(href).not.toContain("feature");
    expect(href).not.toContain("stage");
    expect(href).not.toContain("share");
  });

  it("never emits share unless an already-encoded token was passed in", () => {
    const ordinary = serializeUrl({ route: "explore", caseId: "case-a", targetId: "LAD" });
    expect(ordinary).toBe("#/explore?case=case-a&target=LAD");
    expect(ordinary).not.toContain("share");
  });

  it("defaults a trust route with no pane to performance", () => {
    expect(serializeUrl({ route: "trust" })).toBe("#/trust/performance");
  });

  it("defaults a system route with an unknown pane to requirements", () => {
    expect(serializeUrl({ route: "system", pane: "bogus" })).toBe("#/system/requirements");
  });

  it("drops the pane on explore", () => {
    expect(serializeUrl({ route: "explore", pane: "leakage" })).toBe("#/explore");
  });

  it("percent-encodes values so they can never break the grammar", () => {
    const href = serializeUrl({ route: "explore", caseId: "case a", featureId: "Q Wave" });
    expect(href).toBe("#/explore?case=case%20a&feature=Q%20Wave");
    expect(C10_HREF_PATTERN.test(href)).toBe(true);
  });
});

describe("C-10 serializer ↔ href grammar — every output matches the published pattern", () => {
  const STATES: UrlStateInput[] = [
    { route: "explore" },
    { route: "explore", caseId: "case-a" },
    { route: "explore", caseId: "case-a", targetId: "LAD" },
    { route: "explore", caseId: "case-a", targetId: "LCX", featureId: "Age", stageId: "history" },
    { route: "trust" },
    { route: "trust", pane: "calibration", caseId: "case-b" },
    { route: "trust", pane: "leakage", caseId: "case-b", targetId: "RCA" },
    { route: "system" },
    { route: "system", pane: "integrity" },
    { route: "system", pane: "model-card", caseId: "case-a", stageId: "echo" },
    { route: "explore", caseId: "case-a", share: "VG9LVU4" },
    { route: "trust", pane: "decisions", caseId: "c 1", featureId: "Q Wave" },
    { route: "explore", caseId: "", targetId: null, featureId: null, stageId: null, share: null }
  ];

  for (const state of STATES) {
    it(`matches C10_HREF_PATTERN: ${serializeUrl(state)}`, () => {
      expect(C10_HREF_PATTERN.test(serializeUrl(state))).toBe(true);
    });
  }

  it("round-trips through the parser with identical route, pane and query", () => {
    for (const state of STATES) {
      const href = serializeUrl(state);
      const parsed = parseUrl(href);
      const reparsed = parseUrl(serializeUrl({
        route: parsed.route,
        pane: parsed.pane,
        caseId: parsed.query.case ?? null,
        targetId: parsed.query.target ?? null,
        featureId: parsed.query.feature ?? null,
        stageId: parsed.query.stage ?? null,
        share: parsed.query.share ?? null
      }));
      expect(reparsed.route).toBe(parsed.route);
      expect(reparsed.pane).toBe(parsed.pane);
      expect(reparsed.query).toEqual(parsed.query);
      expect(reparsed.notices).toEqual([]);
    }
  });
});

describe("C-10 history semantics — selection replaces, view pushes", () => {
  it("maps change kinds to actions", () => {
    expect(historyAction("selection")).toBe("replace");
    expect(historyAction("view")).toBe("push");
  });

  it("a route change pushes", () => {
    expect(
      historyActionBetween({ route: "explore", pane: null }, { route: "trust", pane: null })
    ).toBe("push");
  });

  it("a pane change pushes", () => {
    expect(
      historyActionBetween({ route: "trust", pane: "performance" }, { route: "trust", pane: "leakage" })
    ).toBe("push");
  });

  it("a query-only change replaces — the route and pane are unchanged", () => {
    expect(
      historyActionBetween({ route: "trust", pane: "leakage" }, { route: "trust", pane: "leakage" })
    ).toBe("replace");
  });
});
