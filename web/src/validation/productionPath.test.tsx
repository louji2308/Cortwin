/**
 * Production-path audit (P7-TRUST-DATA): the five Trust panes consume the real
 * results artifact through the shell's `toTrustResults` adapter.
 *
 * This is the test that answers "where does the number come from": every value
 * asserted below is computed at test time from `web/public/results.json` (read
 * with node:fs — test code only; pane sources may not import artifacts, see
 * sourceScan rule 2). Fixture-derived strings are asserted ABSENT, so a pane
 * that ever renders fixture or hardcoded data fails here.
 *
 * Also encodes the shell-side findings of the audit as source laws:
 * TrustView binds every pane to `results={trustResults}` from
 * `toTrustResults(results)`, and no shell source imports test fixtures.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Results } from "../contracts";
import { toTrustResults } from "../shell/paneData";
import { TRUST_COPY } from "./copy";
import { CalibrationPane } from "./CalibrationPane";
import { DecisionsPane } from "./DecisionsPane";
import { formatCount, formatInterval, formatMetric, formatPercent, probeIdentityLabel } from "./format";
import { LeakagePane } from "./LeakagePane";
import { PerformancePane } from "./PerformancePane";
import { SubgroupsPane } from "./SubgroupsPane";
import { TRUST_RESULTS_KEYS_PANES_READ, type TrustResults } from "./types";
import { syntheticResults } from "./__fixtures__/syntheticResults";

const HERE = dirname(fileURLToPath(import.meta.url));
const RESULTS_PATH = join(HERE, "..", "..", "public", "results.json");
const SHELL_DIR = join(HERE, "..", "shell");

/** The calibration readout must never degrade to not-provided against the real artifact. */
const NOT_PROVIDED_SENTINEL = "not provided";

const realResults = JSON.parse(readFileSync(RESULTS_PATH, "utf8")) as Results;
const trust = toTrustResults(realResults);

function requireTrust(): TrustResults {
  if (trust === null) throw new Error("toTrustResults returned null for the real artifact");
  return trust;
}

function stripSsrComments(html: string): string {
  return html.replace(/<!-- -->/g, "");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function blockWindow(html: string, testId: string): string {
  const start = html.indexOf(`data-testid="${testId}"`);
  expect(start).toBeGreaterThanOrEqual(0);
  return stripSsrComments(html.slice(start, start + 2400));
}

function countOccurrences(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

function nearestSweep<T extends { threshold: number }>(points: readonly T[], target: number): T {
  let best = points[0];
  for (const point of points) {
    if (Math.abs(point.threshold - target) < Math.abs(best.threshold - target)) {
      best = point;
    }
  }
  return best;
}

/** Fixture-only strings: present in __fixtures__ files, absent from the real artifact. */
const FIXTURE_CI = formatInterval([0.841, 0.927] as const);
const FIXTURE_PROTOCOL_NOTE = syntheticResults.protocol?.ciMethod ?? "MISSING_FIXTURE_CI_METHOD";
const FIXTURE_THRESHOLD = `Deployed threshold ${formatMetric(
  syntheticResults.decisions?.CAD?.selectedThreshold ?? 0
)}`;

describe("production path: real artifact → adapter → panes", () => {
  it("reads web/public/results.json and adapts every key the panes consume", () => {
    const data = requireTrust();
    expect(realResults.schemaVersion).toBeTruthy();
    for (const key of TRUST_RESULTS_KEYS_PANES_READ) {
      expect(Object.keys(data)).toContain(key);
    }
    expect(data.leakageLab?.probes.length ?? 0).toBeGreaterThan(0);
    expect((data.subgroups ?? []).length).toBeGreaterThan(0);
  });

  it("PerformancePane shows real performance, protocol and reliability values — not fixtures", () => {
    const data = requireTrust();
    const html = renderToString(<PerformancePane results={data} />);
    const cad = data.performance?.CAD;
    if (!cad) throw new Error("real artifact missing performance.CAD");

    expect(html).toContain(formatMetric(cad.rocAuc));
    expect(html).toContain(formatInterval(cad.rocAucCI));
    expect(html).toContain(formatCount(data.protocol?.patientCount));
    expect(html).toContain(data.protocol?.ciMethod ?? "MISSING_CI_METHOD");
    expect(html).toContain(data.protocol?.stratification ?? "MISSING_STRATIFICATION");
    expect(html).toContain(data.reliability?.targets?.CAD?.tier ?? "MISSING_TIER");
    expect(html).toContain(escapeHtml(data.reliability?.rule?.description ?? "MISSING_RULE"));
    expect(html).toContain(TRUST_COPY.disclosuresFraming);
    for (const note of data.provenance?.notes ?? []) {
      expect(html).toContain(escapeHtml(note));
    }

    expect(html).not.toContain(FIXTURE_CI);
    expect(html).not.toContain(FIXTURE_PROTOCOL_NOTE);
    expect(html).not.toContain("synthetic_fixture_");
    expect(html).not.toContain("Synthetic fixture:");
    expect(html).not.toContain("NaN");
  });

  it("CalibrationPane shows real Brier/ECE and the real bin structure", () => {
    const data = requireTrust();
    const html = renderToString(<CalibrationPane results={data} />);
    const cad = data.calibration?.CAD;
    if (!cad) throw new Error("real artifact missing calibration.CAD");

    expect(html).toContain(formatMetric(cad.brierRaw));
    expect(html).toContain(formatMetric(cad.brierPlatt));
    expect(html).toContain(formatMetric(cad.eceRaw));
    expect(html).toContain(formatMetric(cad.ecePlatt));

    const raw = cad.reliabilityCurve?.raw ?? [];
    expect(raw.length).toBeGreaterThan(0);
    const select = html.slice(html.indexOf('data-testid="bin-inspect-select"'));
    expect(select.split("<option").length - 1).toBe(raw.length);
    const readout = blockWindow(html, "bin-inspect-readout");
    expect(readout).toContain(formatPercent(raw[0].meanPredicted));
    expect(readout).toContain(formatPercent(raw[0].fractionPositive));
    expect(readout).not.toContain(NOT_PROVIDED_SENTINEL);

    expect(html).not.toContain(FIXTURE_CI);
    expect(html).not.toContain("Synthetic fixture:");
    expect(html).not.toContain("NaN");
  });

  it("DecisionsPane shows the real deployed threshold and sweep — not the fixture's", () => {
    const data = requireTrust();
    const html = renderToString(<DecisionsPane results={data} />);
    const cad = data.decisions?.CAD;
    if (!cad) throw new Error("real artifact missing decisions.CAD");

    expect(html).toContain(`Deployed threshold ${formatMetric(cad.selectedThreshold)}`);
    expect(html).not.toContain(FIXTURE_THRESHOLD);

    const nearest = nearestSweep(cad.points ?? [], cad.selectedThreshold ?? 0);
    const readout = blockWindow(html, "threshold-inspect-readout");
    expect(readout).toContain(`Threshold ${formatMetric(nearest.threshold)}`);
    expect(readout).toContain(`F1 ${formatMetric(nearest.f1)}`);

    const stripped = stripSsrComments(html);
    expect(stripped).toContain(
      `Threshold selection: ${cad.thresholdSelection?.method ?? "MISSING_METHOD"}`
    );
    expect(html).not.toContain("NaN");
  });

  it("SubgroupsPane shows every real subgroup row with its artifact metrics", () => {
    const data = requireTrust();
    const html = renderToString(<SubgroupsPane results={data} />);
    const rows = data.subgroups ?? [];
    expect(rows.length).toBeGreaterThan(0);

    const start = html.indexOf('data-testid="subgroups-table"');
    expect(start).toBeGreaterThanOrEqual(0);
    const body = html.slice(start);
    expect(body.split("<tr>").length - 1).toBe(rows.length + 1);
    expect(body).toContain(formatCount(rows[0].n));
    expect(body).toContain(formatMetric(rows[0].rocAuc));

    const bars = html.slice(html.indexOf('data-testid="subgroups-bars"'));
    expect(bars).toContain(formatMetric(rows[0].rocAuc));
    expect(html).not.toContain(FIXTURE_CI);
    expect(html).not.toContain("Synthetic fixture:");
  });

  it("LeakagePane renders real probe identity — never the shared source-type label as identity", () => {
    const data = requireTrust();
    const html = renderToString(<LeakagePane results={data} />);
    const probes = data.leakageLab?.probes ?? [];
    expect(probes.length).toBeGreaterThan(0);

    expect(countOccurrences(html, "data-probe-id=")).toBe(probes.length);
    expect(html).not.toContain('<th scope="row">probe model</th>');
    for (const probe of probes) {
      const identity = probeIdentityLabel(probe.probeId);
      expect(html).toContain(`>${identity}<`);
    }
    const first = probes[0];
    expect(html).toContain(`data-probe-id="${first.probeId}"`);
    expect(html).toContain(formatMetric(first.metricValue));
    expect(html).toContain('data-testid="leakage-bars"');
    expect(html).not.toContain(FIXTURE_CI);
    expect(html).not.toContain("NaN");
  });

  it("every pane renders a ready state with no fabricated-number markers", () => {
    const data = requireTrust();
    const rendered = [
      renderToString(<PerformancePane results={data} />),
      renderToString(<CalibrationPane results={data} />),
      renderToString(<DecisionsPane results={data} />),
      renderToString(<SubgroupsPane results={data} />),
      renderToString(<LeakagePane results={data} />)
    ];
    for (const html of rendered) {
      expect(html).toContain('data-pane-state="ready"');
      expect(html).not.toContain("NaN");
      expect(html).not.toContain("Infinity");
      expect(html).not.toContain("synthetic_fixture_");
      expect(html).not.toContain("Synthetic fixture:");
    }
  });
});

describe("production path: shell binding source laws (audit evidence)", () => {
  const shellApp = readFileSync(join(SHELL_DIR, "ShellApp.tsx"), "utf8");
  const paneData = readFileSync(join(SHELL_DIR, "paneData.ts"), "utf8");

  it("TrustView adapts results through toTrustResults and binds every pane to it", () => {
    expect(shellApp).toContain("const trustResults = toTrustResults(results);");
    expect(shellApp).toMatch(/results=\{trustResults\}/);
    const bindings = shellApp.split("results={trustResults}").length - 1;
    expect(bindings).toBeGreaterThanOrEqual(5);
    expect(paneData).toContain("export function toTrustResults");
  });

  it("no shell source imports test fixtures or fixture data", () => {
    const shellFiles = readdirSync(SHELL_DIR)
      .filter((name) => /\.tsx?$/.test(name))
      .filter((name) => !/\.test\.tsx?$/.test(name));
    expect(shellFiles.length).toBeGreaterThan(0);
    for (const name of shellFiles) {
      const text = readFileSync(join(SHELL_DIR, name), "utf8");
      expect(text).not.toContain("__fixtures__");
      expect(text).not.toContain("syntheticResults");
    }
  });
});
