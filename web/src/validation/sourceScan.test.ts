/**
 * Source scan for web/src/validation (Implementation_Plan P7 step 6;
 * AGENTS §6.5, §7 laws 8/12). Reads the directory from disk at test time.
 *
 * Scope: every non-test .ts/.tsx file in this directory (pane sources, shared
 * helpers and the fixture). Test files are excluded from rules 2–4 — they
 * assert behaviour and never ship to the app bundle.
 *
 * Blocking rules:
 *   1. imports stay inside this directory (bare packages from a fixed
 *      allowlist) — so no artifact file, no results/model JSON, no code from
 *      outside the pane layer can ever enter a pane source;
 *   2. no metric-computing arithmetic: a metric-named operand directly used
 *      with an arithmetic operator and a numeric literal, or a metric name
 *      assigned a numeric literal (formatting, sorting, axis scale, marker
 *      position and highlight are the only derivations allowed — C-04 §9 L424);
 *   3. no runtime network or storage API (privacy: patient-facing inputs never
 *      leave the browser; no telemetry, no persistence);
 *   4. test fixtures are imported only by tests, never by pane sources;
 *   5. no C-13 banned phrase in any pane source (copy law, contract §8.7);
 *   6. no console/debug logging in pane sources (AGENTS §6.6 logging doctrine).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { scanSource, violations } from "../copy/copyLint";

/** Absolute path of this directory, no trailing separator. */
const DIR = dirname(fileURLToPath(import.meta.url));

function staysInside(candidate: string): boolean {
  return candidate === DIR || candidate.startsWith(DIR + sep);
}

const BARE_ALLOWLIST: ReadonlyArray<string> = ["react", "d3-scale"];

const IMPORT_SPECIFIER = /(?:from\s+|import\s*\(?\s*)["']([^"'\s]+)["']/g;

const JSON_ARTIFACT_IMPORT =
  /from\s+["'][^"']*\.json["']|import\s*\(\s*["'][^"']*\.json["']/;

/** Metric-named operand directly used in arithmetic against a numeric literal. */
const METRIC_ARITHMETIC = new RegExp(
  String.raw`\b(?:brierRaw|brierPlatt|baseRateBrier|brier|eceRaw|ecePlatt|ece|rocAuc|` +
    String.raw`majorityBaseline|accuracy|precision|recall|f1|auc|coverage|accuracyDecided|` +
    String.raw`fractionPositive|meanPredicted|metricValue|selectedThreshold|threshold|probability)` +
    String.raw`\s*[*/+-]\s*[\d.]`,
  "i"
);

/** Metric name assigned a numeric literal (fabricated-value pattern). */
const METRIC_ASSIGNMENT = new RegExp(
  String.raw`\b(?:brierRaw|brierPlatt|baseRateBrier|brier|eceRaw|ecePlatt|ece|rocAuc|` +
    String.raw`majorityBaseline|accuracy|precision|recall|f1|auc|threshold|probability)` +
    String.raw`\w*\s*=\s*[\d.]`,
  "i"
);

const FORBIDDEN_RUNTIME: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: "fetch(", pattern: /\bfetch\s*\(/ },
  { name: "XMLHttpRequest", pattern: /XMLHttpRequest/ },
  { name: "WebSocket", pattern: /\bnew\s+WebSocket\b/ },
  { name: "localStorage", pattern: /localStorage/ },
  { name: "sessionStorage", pattern: /sessionStorage/ },
  { name: "indexedDB", pattern: /indexedDB/ },
  { name: "dynamic import(", pattern: /\bimport\s*\(/ }
];

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...listFiles(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

const SOURCES = listFiles(DIR)
  .filter((file) => /\.tsx?$/.test(file))
  .filter((file) => !/\.test\.tsx?$/.test(file))
  .sort();

function relPath(file: string): string {
  return file.startsWith(DIR + sep) ? file.slice(DIR.length + 1) : file;
}

function read(file: string): string {
  return readFileSync(file, "utf8");
}

describe("source scan — web/src/validation non-test sources", () => {
  it("discovers the sources it is meant to guard", () => {
    const names = SOURCES.map(relPath);
    for (const expected of [
      "PerformancePane.tsx",
      "CalibrationPane.tsx",
      "DecisionsPane.tsx",
      "SubgroupsPane.tsx",
      "LeakagePane.tsx",
      "PaneShell.tsx",
      join("__fixtures__", "syntheticResults.ts")
    ]) {
      expect(names).toContain(expected);
    }
    expect(SOURCES.length).toBeGreaterThanOrEqual(12);
  });

  it("imports only inside the directory; bare packages come from the allowlist", () => {
    const problems: string[] = [];
    for (const file of SOURCES) {
      const text = read(file);
      for (const match of text.matchAll(IMPORT_SPECIFIER)) {
        const spec = match[1];
        if (spec.startsWith(".")) {
          const resolved = resolve(dirname(file), spec);
          if (!staysInside(resolved)) {
            problems.push(`${relPath(file)}: escapes directory -> ${spec}`);
          }
        } else if (!BARE_ALLOWLIST.includes(spec)) {
          problems.push(`${relPath(file)}: package not allowlisted -> ${spec}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("imports no .json artifact anywhere in a source", () => {
    const problems: string[] = [];
    for (const file of SOURCES) {
      if (JSON_ARTIFACT_IMPORT.test(read(file))) {
        problems.push(`${relPath(file)}: json import`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("contains no metric-computing arithmetic", () => {
    const problems: string[] = [];
    for (const file of SOURCES) {
      const text = read(file);
      if (METRIC_ARITHMETIC.test(text)) {
        problems.push(`${relPath(file)}: metric operand used with an operator`);
      }
      if (METRIC_ASSIGNMENT.test(text)) {
        problems.push(`${relPath(file)}: metric name assigned a literal`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("uses no runtime network or storage API", () => {
    const problems: string[] = [];
    for (const file of SOURCES) {
      const text = read(file);
      for (const rule of FORBIDDEN_RUNTIME) {
        if (rule.pattern.test(text)) {
          problems.push(`${relPath(file)}: ${rule.name}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("imports test fixtures only from test files", () => {
    const problems: string[] = [];
    for (const file of SOURCES) {
      if (file.includes("__fixtures__")) continue;
      if (read(file).includes("__fixtures__")) {
        problems.push(`${relPath(file)}: fixture import`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("contains no C-13 banned phrase (copy law applies to pane sources)", () => {
    const problems: string[] = [];
    for (const file of SOURCES) {
      for (const finding of violations(scanSource(read(file)))) {
        problems.push(`${relPath(file)}: "${finding.phrase}" at line ${finding.line}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("uses no console or debug logging in pane sources", () => {
    const problems: string[] = [];
    for (const file of SOURCES) {
      if (/\bconsole\s*\./.test(read(file))) {
        problems.push(`${relPath(file)}: console usage`);
      }
    }
    expect(problems).toEqual([]);
  });
});
