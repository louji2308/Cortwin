import { describe, expect, it } from "vitest";
import { parseUrl } from "./parse";
import { SYSTEM_PANES, TRUST_PANES } from "./types";

describe("C-10 grammar — route table", () => {
  const ROUTE_CASES: Array<{
    input: string;
    route: "explore" | "trust" | "system";
    pane: string | null;
    notice: string | null;
  }> = [
    { input: "#/explore", route: "explore", pane: null, notice: null },
    { input: "/explore", route: "explore", pane: null, notice: null },
    { input: "#/explore?case=c1", route: "explore", pane: null, notice: null },
    { input: "", route: "explore", pane: null, notice: null },
    { input: "#", route: "explore", pane: null, notice: null },
    { input: "#/trust", route: "trust", pane: "performance", notice: "UNKNOWN_PANE" },
    { input: "#/trust/", route: "trust", pane: "performance", notice: "UNKNOWN_PANE" },
    { input: "#/trust/calibration", route: "trust", pane: "calibration", notice: null },
    { input: "#/trust/decisions", route: "trust", pane: "decisions", notice: null },
    { input: "#/trust/subgroups", route: "trust", pane: "subgroups", notice: null },
    { input: "#/trust/leakage", route: "trust", pane: "leakage", notice: null },
    { input: "#/trust/performance", route: "trust", pane: "performance", notice: null },
    { input: "#/trust/nope", route: "trust", pane: "performance", notice: "UNKNOWN_PANE" },
    { input: "#/system", route: "system", pane: "requirements", notice: "UNKNOWN_PANE" },
    { input: "#/system/", route: "system", pane: "requirements", notice: "UNKNOWN_PANE" },
    { input: "#/system/requirements", route: "system", pane: "requirements", notice: null },
    { input: "#/system/architecture", route: "system", pane: "architecture", notice: null },
    { input: "#/system/integrity", route: "system", pane: "integrity", notice: null },
    { input: "#/system/model-card", route: "system", pane: "model-card", notice: null },
    { input: "#/system/nope", route: "system", pane: "requirements", notice: "UNKNOWN_PANE" },
    { input: "#/nowhere", route: "explore", pane: null, notice: "UNKNOWN_ROUTE" },
    { input: "#/", route: "explore", pane: null, notice: "UNKNOWN_ROUTE" },
    { input: "#/explore/", route: "explore", pane: null, notice: null },
    { input: "#/trust/subgroups/", route: "trust", pane: "subgroups", notice: null }
  ];

  for (const testCase of ROUTE_CASES) {
    it(`parses ${JSON.stringify(testCase.input)} → ${testCase.route}${
      testCase.pane === null ? "" : `/${testCase.pane}`
    }${testCase.notice === null ? "" : ` (+${testCase.notice})`}`, () => {
      const parsed = parseUrl(testCase.input);
      expect(parsed.route).toBe(testCase.route);
      expect(parsed.pane).toBe(testCase.pane);
      if (testCase.notice === null) {
        expect(parsed.notices).toEqual([]);
      } else {
        expect(parsed.notices.map((entry) => entry.code)).toContain(testCase.notice);
      }
    });
  }

  it("covers every published trust pane", () => {
    for (const pane of TRUST_PANES) {
      const parsed = parseUrl(`#/trust/${pane}`);
      expect(parsed.route).toBe("trust");
      expect(parsed.pane).toBe(pane);
      expect(parsed.notices).toEqual([]);
    }
  });

  it("covers every published system pane", () => {
    for (const pane of SYSTEM_PANES) {
      const parsed = parseUrl(`#/system/${pane}`);
      expect(parsed.route).toBe("system");
      expect(parsed.pane).toBe(pane);
      expect(parsed.notices).toEqual([]);
    }
  });

  it("splits the fragment from an absolute URL", () => {
    const parsed = parseUrl("https://example.test/app/#/trust/leakage?case=c2");
    expect(parsed.route).toBe("trust");
    expect(parsed.pane).toBe("leakage");
    expect(parsed.query.case).toBe("c2");
  });
});

describe("C-10 grammar — query keys", () => {
  it("keeps known keys with decoded values", () => {
    const parsed = parseUrl("#/explore?case=c1&target=LAD&feature=Q%20Wave&stage=history");
    expect(parsed.query).toEqual({
      case: "c1",
      target: "LAD",
      feature: "Q Wave",
      stage: "history"
    });
    expect(parsed.notices).toEqual([]);
  });

  it("ignores unknown parameters without a notice", () => {
    const parsed = parseUrl("#/explore?case=c1&zz=1&patient=leak");
    expect(parsed.query).toEqual({ case: "c1" });
    expect(parsed.ignoredKeys).toEqual(["zz", "patient"]);
    expect(parsed.notices).toEqual([]);
  });

  it("drops a valueless pair with MALFORMED_QUERY and keeps the rest", () => {
    const parsed = parseUrl("#/explore?case=c1&broken&target=LAD");
    expect(parsed.query).toEqual({ case: "c1", target: "LAD" });
    expect(parsed.notices).toEqual([{ code: "MALFORMED_QUERY", param: "query" }]);
  });

  it("drops an empty value with MALFORMED_QUERY naming the key", () => {
    const parsed = parseUrl("#/explore?case=");
    expect(parsed.query).toEqual({});
    expect(parsed.notices).toEqual([{ code: "MALFORMED_QUERY", param: "case" }]);
  });

  it("keeps the first occurrence of a duplicated key", () => {
    const parsed = parseUrl("#/explore?case=first&case=second");
    expect(parsed.query.case).toBe("first");
  });

  it("rejects malformed percent-encoding with MALFORMED_QUERY", () => {
    const parsed = parseUrl("#/explore?case=%E0%A4%A");
    expect(parsed.query.case).toBeUndefined();
    expect(parsed.notices.map((entry) => entry.code)).toContain("MALFORMED_QUERY");
  });

  it("decodes '+' as a space", () => {
    const parsed = parseUrl("#/explore?feature=Q+Wave");
    expect(parsed.query.feature).toBe("Q Wave");
  });

  it("parses a query-only fragment as the default route", () => {
    const parsed = parseUrl("#?case=c1");
    expect(parsed.route).toBe("explore");
    expect(parsed.query.case).toBe("c1");
  });

  it("never throws on hostile input", () => {
    const hostile = [
      "#/explore?%=%",
      "#/explore?&&&&",
      "#/explore?====",
      "#".repeat(50),
      "#/trust/../../../etc",
      "#/explore?case=%00%01"
    ];
    for (const input of hostile) {
      expect(() => parseUrl(input)).not.toThrow();
    }
  });
});
