import { describe, expect, it } from "vitest";
import {
  formatFindings,
  pragmaOnLine,
  scanRepo,
  scanSource,
  violations
} from "./copyLint";
import { BANNED_PHRASES, PREFERRED_VOCABULARY, PRAGMA_TOKEN } from "./vocabulary";

describe("C-13 vocabulary of record (Contracts.md L407/L409)", () => {
  it("banned list is EXACTLY the contract minimum, in contract order", () => {
    expect([...BANNED_PHRASES]).toEqual([
      "diagnose",
      "diagnosed",
      "diagnosis",
      "detect",
      "detected",
      "detection",
      "recommend",
      "recommended",
      "recommendation",
      "treatment impact",
      "treatment effect",
      "caused by",
      "causes",
      "proves",
      "proven",
      "lesion location",
      "plaque location"
    ]);
  });

  it("preferred vocabulary is EXACTLY the contract list (L407)", () => {
    expect([...PREFERRED_VOCABULARY]).toEqual([
      "probability",
      "model attribution",
      "not provided",
      "indeterminate",
      "estimated",
      "cohort",
      "model response",
      "whole-vessel probability",
      "≥50% stenosis under the cohort label"
    ]);
  });

  it("pragma token matches the contract spelling", () => {
    expect(PRAGMA_TOKEN).toBe("c13-allow:");
  });
});

describe("scanSource — mutation cases (blocking)", () => {
  it("flags 'diagnose' without a pragma", () => {
    const findings = scanSource("This tool may diagnose the patient.");
    expect(findings).toEqual([{ phrase: "diagnose", line: 1, pragma: null }]);
    expect(violations(findings)).toHaveLength(1);
  });

  it("allows 'diagnose' with `c13-allow: limitation statement` on the same line", () => {
    const findings = scanSource(
      "This tool may diagnose the patient. // c13-allow: limitation statement — CorTwin does not diagnose."
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].pragma).toBe(
      "limitation statement — CorTwin does not diagnose."
    );
    expect(violations(findings)).toHaveLength(0);
  });

  it("does NOT flag 'because' via the 'causes' rule", () => {
    expect(scanSource("Because the cohort is small, estimates are limited.")).toEqual([]);
    expect(scanSource("because becausebecause causes")).toHaveLength(1);
  });

  it("keeps 'causes' itself flagged (control for the boundary rule)", () => {
    const findings = scanSource("Weight causes the margin to shift.");
    expect(findings).toHaveLength(1);
    expect(findings[0].phrase).toBe("causes");
  });

  it("still flags a pragma with an EMPTY reason", () => {
    expect(violations(scanSource("may diagnose x // c13-allow:"))).toHaveLength(1);
    expect(violations(scanSource("may diagnose x // c13-allow:   "))).toHaveLength(1);
    expect(pragmaOnLine("c13-allow:")).toBeNull();
    expect(pragmaOnLine("c13-allow:   ")).toBeNull();
  });

  it("a pragma on a DIFFERENT line does not sanction the flagged line", () => {
    const findings = scanSource(
      "may diagnose the patient.\n// c13-allow: limitation statement"
    );
    expect(findings).toEqual([{ phrase: "diagnose", line: 1, pragma: null }]);
    expect(violations(findings)).toHaveLength(1);
  });

  it("detects every banned phrase from the contract list", () => {
    for (const phrase of BANNED_PHRASES) {
      const findings = scanSource(`A sentence containing ${phrase} here.`);
      expect(findings.map((f) => f.phrase), `phrase: ${phrase}`).toEqual([phrase]);
      expect(violations(findings), `phrase: ${phrase}`).toHaveLength(1);
    }
  });

  it("is case-insensitive", () => {
    expect(scanSource("The DIAGNOSIS is unknown.")).toHaveLength(1);
    expect(scanSource("Proven beyond doubt.")).toHaveLength(1);
    expect(scanSource("Treatment Impact is prohibited.")).toHaveLength(1);
  });

  it("matches multi-word phrases across runs of whitespace", () => {
    expect(scanSource("this is treatment    impact")).toHaveLength(1);
    expect(scanSource("caused     by")).toHaveLength(1);
  });

  it("keeps stems exact: bare 'prove' is not flagged (contract lists proves/proven)", () => {
    expect(scanSource("This will prove the parity harness works.")).toEqual([]);
    expect(scanSource("proves")).toHaveLength(1);
    expect(scanSource("proven")).toHaveLength(1);
  });

  it("reports 1-based line numbers per (phrase, line) pair", () => {
    const findings = scanSource("ok line\nc13-allow: reason diagnose here\nok");
    expect(findings).toEqual([
      { phrase: "diagnose", line: 2, pragma: "reason diagnose here" }
    ]);
  });

  it("handles CRLF line endings", () => {
    const findings = scanSource("ok\r\nmay diagnose x\r\nok");
    expect(findings).toEqual([{ phrase: "diagnose", line: 2, pragma: null }]);
  });

  it("sanctioned findings are reported but are not violations", () => {
    const findings = scanSource("detect // c13-allow: limitation statement");
    expect(findings).toHaveLength(1);
    expect(violations(findings)).toHaveLength(0);
  });
});

describe("repo scan — web/src, docs, README (VC-11, blocking)", () => {
  const result = scanRepo();

  it("actually covers the declared scope (guards against vacuous pass)", () => {
    expect(result.files).toContain("README.md");
    expect(result.files).toContain("web/src/App.tsx");
    expect(result.files.some((f) => f.startsWith("docs/"))).toBe(true);
    expect(result.files.some((f) => f.startsWith("web/src/"))).toBe(true);
    expect(result.files.length).toBeGreaterThanOrEqual(8);
  });

  it("excludes web/src/copy/** — the directory holding the banned list itself", () => {
    expect(result.files.filter((f) => f.startsWith("web/src/copy/"))).toEqual([]);
    // The exclusion is load-bearing: the banned list itself, scanned as text,
    // yields violations — which is exactly why copy/** must stay out of scope.
    const selfScan = scanSource(BANNED_PHRASES.join(" · "));
    expect(violations(selfScan).length).toBeGreaterThan(0);
  });

  it("finds ZERO unpragma'd banned phrases across the scope", () => {
    // Honest failure: every violation renders as "file:line  banned: \"phrase\"".
    expect(formatFindings(result.violations)).toEqual([]);
  });
});
