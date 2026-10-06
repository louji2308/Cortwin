import { describe, expect, it } from "vitest";
import { C10_HREF_PATTERN } from "./c10";

/**
 * C-10 deep-link grammar, render side (Contracts §7.2, L319–L330).
 * The System panes only emit hrefs; the shell router resolves them. This
 * suite pins the grammar both ways so every href rendered by the panes has
 * exactly one validation source.
 */

const VALID_ROUTES: readonly string[] = [
  "#/explore",
  "#/trust/performance",
  "#/trust/calibration",
  "#/trust/decisions",
  "#/trust/subgroups",
  "#/trust/leakage",
  "#/system/requirements",
  "#/system/architecture",
  "#/system/integrity",
  "#/system/model-card"
];

const VALID_QUERIES: readonly string[] = [
  "#/explore?case=case-001",
  "#/explore?case=case-001&target=LAD",
  "#/explore?case=case-001&target=LAD&feature=Age",
  "#/explore?case=case-001&target=LAD&feature=Age&stage=3",
  "#/explore?case=case-001&target=LAD&feature=Age&stage=3&share=abc123",
  "#/trust/leakage?case=case-001",
  "#/trust/performance?target=CAD&stage=2",
  "#/system/model-card?case=hypo1",
  "#/explore?target=LAD",
  "#/explore?feature=Age",
  "#/explore?stage=1"
];

const INVALID_HREFS: readonly string[] = [
  "",
  "#",
  "#explore",
  "#/bogus",
  "#/trust",
  "#/trust/performancex",
  "#/trust/",
  "#/system",
  "#/system/modelcard",
  "#/system/model card",
  "#/explore?",
  "#/explore?case",
  "#/explore?case=",
  "#/explore?case=a&",
  "#/explore?stage=2&target=LAD",
  "#/explore?case=a&stage=1&target=LAD",
  "https://example.test/explore",
  "/explore",
  "#/explore#fragment",
  "#/explore?case=a&&target=b"
];

describe("C-10 href grammar (Contracts §7.2 L319–L330) — render-side validation", () => {
  it("exports a stable, non-global RegExp", () => {
    expect(C10_HREF_PATTERN).toBeInstanceOf(RegExp);
    expect(C10_HREF_PATTERN.global).toBe(false);
    // .test() must be repeatable — a /g flag would advance lastIndex.
    expect(C10_HREF_PATTERN.test("#/explore")).toBe(true);
    expect(C10_HREF_PATTERN.test("#/explore")).toBe(true);
  });

  it("accepts every canonical route, including all trust and system panes", () => {
    for (const href of VALID_ROUTES) {
      expect(C10_HREF_PATTERN.test(href), href).toBe(true);
    }
  });

  it("accepts canonical-order query keys, with or without earlier keys", () => {
    for (const href of VALID_QUERIES) {
      expect(C10_HREF_PATTERN.test(href), href).toBe(true);
    }
  });

  it("rejects unknown routes, missing separators and out-of-order queries", () => {
    for (const href of INVALID_HREFS) {
      expect(C10_HREF_PATTERN.test(href), JSON.stringify(href)).toBe(false);
    }
  });

  it("rejects absolute or scheme URLs — panes never emit external links", () => {
    expect(C10_HREF_PATTERN.test("https://example.test/explore")).toBe(false);
    expect(C10_HREF_PATTERN.test("http://localhost/explore")).toBe(false);
    expect(C10_HREF_PATTERN.test("javascript:alert(1)")).toBe(false);
  });
});
