/**
 * Trust pane suite (Implementation_Plan P7 steps 5–9; AGENTS §6.5).
 *
 * Four required properties, shown by static rendering (react-dom/server —
 * no browser, no network, no artifact reads):
 *   (a) prop-driven rendering: two fixture variants produce different on-screen
 *       numbers, so nothing is hardcoded in the panes;
 *   (c) designed empty / loading / error states when the results prop is absent
 *       or unusable — never a blank panel, never a fabricated metric;
 *   (e) LeakagePane renders probe and deployed results as distinctly labelled,
 *       never-merged sections;
 *   plus law 7 (value + threshold + decision + tier together) and the
 *   accessibility structure required by AGENTS §6.1.
 */
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CalibrationPane } from "./CalibrationPane";
import { DecisionsPane } from "./DecisionsPane";
import { LeakagePane } from "./LeakagePane";
import { PerformancePane } from "./PerformancePane";
import { SubgroupsPane } from "./SubgroupsPane";
import { resolvePaneState } from "./PaneShell";
import { TRUST_COPY } from "./copy";
import { formatInterval, formatMetric, formatPercent } from "./format";
import type { CalibrationMetrics, PerformanceMetrics, TargetId, TrustResults } from "./types";
import {
  syntheticCurrentCaseA,
  syntheticCurrentCaseB,
  syntheticResults,
  syntheticResultsVariantB
} from "./__fixtures__/syntheticResults";

type PaneInput = {
  results: TrustResults | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: (() => void) | null;
};

const PANES: ReadonlyArray<{ name: string; render: (input: PaneInput) => string }> = [
  {
    name: "PerformancePane",
    render: (input) =>
      renderToString(
        <PerformancePane
          results={input.results}
          loading={input.loading}
          error={input.error}
          onRetry={input.onRetry}
        />
      )
  },
  {
    name: "CalibrationPane",
    render: (input) =>
      renderToString(
        <CalibrationPane
          results={input.results}
          loading={input.loading}
          error={input.error}
          onRetry={input.onRetry}
        />
      )
  },
  {
    name: "DecisionsPane",
    render: (input) =>
      renderToString(
        <DecisionsPane
          results={input.results}
          loading={input.loading}
          error={input.error}
          onRetry={input.onRetry}
        />
      )
  },
  {
    name: "SubgroupsPane",
    render: (input) =>
      renderToString(
        <SubgroupsPane
          results={input.results}
          loading={input.loading}
          error={input.error}
          onRetry={input.onRetry}
        />
      )
  },
  {
    name: "LeakagePane",
    render: (input) =>
      renderToString(
        <LeakagePane
          results={input.results}
          loading={input.loading}
          error={input.error}
          onRetry={input.onRetry}
        />
      )
  }
];

function requirePerf(results: TrustResults, id: TargetId): PerformanceMetrics {
  const row = results.performance?.[id];
  if (!row) throw new Error(`fixture missing performance.${id}`);
  return row;
}

function requireCal(results: TrustResults, id: TargetId): CalibrationMetrics {
  const row = results.calibration?.[id];
  if (!row) throw new Error(`fixture missing calibration.${id}`);
  return row;
}

/** First `<tr>`-split rows after the given table: index 0 = header row. */
function tableRows(html: string, testId: string): string[] {
  const start = html.indexOf(`data-testid="${testId}"`);
  expect(start).toBeGreaterThanOrEqual(0);
  return html.slice(start).split("<tr>").slice(1);
}

/** The highlighted performance row (data-active="true"). */
function activePerformanceRow(html: string): string {
  const start = html.indexOf('data-active="true"');
  expect(start).toBeGreaterThanOrEqual(0);
  return html.slice(start, html.indexOf("</tr>", start));
}

/** Text of one labelled leakage section, from its <section> tag to its close. */
function leakageSection(html: string, name: string): string {
  const marker = `data-section="${name}"`;
  const anchor = html.indexOf(marker);
  expect(anchor).toBeGreaterThanOrEqual(0);
  const start = html.lastIndexOf("<section", anchor);
  return html.slice(start, html.indexOf("</section>", start));
}

/** React SSR text escaping — copy strings must be compared the way they render. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/** React SSR injects `<!-- -->` between adjacent text nodes — strip for assertions. */
function stripSsrComments(html: string): string {
  return html.replace(/<!-- -->/g, "");
}

/** Fixed window from a data-testid anchor — enough to hold one small block. */
function blockWindow(html: string, testId: string): string {
  const start = html.indexOf(`data-testid="${testId}"`);
  expect(start).toBeGreaterThanOrEqual(0);
  return stripSsrComments(html.slice(start, start + 2400));
}

describe("resolvePaneState precedence", () => {
  it("ranks error above loading above empty above ready", () => {
    expect(resolvePaneState({ hasData: false })).toBe("empty");
    expect(resolvePaneState({ hasData: false, loading: true })).toBe("loading");
    expect(resolvePaneState({ hasData: true })).toBe("ready");
    expect(resolvePaneState({ hasData: false, loading: true, error: "boom" })).toBe("error");
    expect(resolvePaneState({ hasData: true, error: "boom" })).toBe("error");
  });
});

describe("designed non-ready states (requirement c)", () => {
  for (const pane of PANES) {
    it(`${pane.name}: designed empty state when results is null`, () => {
      const html = pane.render({ results: null });
      expect(html).toContain('data-pane-state="empty"');
      expect(html).toContain(TRUST_COPY.emptyHeading);
      expect(html).toContain(escapeHtml(TRUST_COPY.emptyBody));
      expect(html).not.toContain("NaN");
      expect(html).not.toContain(formatMetric(requirePerf(syntheticResults, "CAD").f1));
      expect(html).not.toContain(formatMetric(requireCal(syntheticResults, "CAD").brierRaw));
    });

    it(`${pane.name}: designed loading state with busy semantics`, () => {
      const html = pane.render({ results: null, loading: true });
      expect(html).toContain('data-pane-state="loading"');
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain(TRUST_COPY.loadingHeading);
      expect(html).not.toContain("NaN");
    });

    it(`${pane.name}: designed error state carrying the failure message`, () => {
      const html = pane.render({ results: null, error: "checksum mismatch" });
      expect(html).toContain('data-pane-state="error"');
      expect(html).toContain('role="alert"');
      expect(html).toContain("checksum mismatch");
      expect(html).toContain(TRUST_COPY.errorHeading);
      expect(html).toContain(TRUST_COPY.errorSuffix);
      expect(html).not.toContain("NaN");
    });
  }
});

describe("prop-driven rendering: variant A vs variant B (requirement a)", () => {
  it("PerformancePane shows the numbers of the props it receives", () => {
    const htmlA = renderToString(<PerformancePane results={syntheticResults} />);
    const htmlB = renderToString(<PerformancePane results={syntheticResultsVariantB} />);
    const cadA = requirePerf(syntheticResults, "CAD");
    const cadB = requirePerf(syntheticResultsVariantB, "CAD");

    expect(htmlA).toContain(formatMetric(cadA.f1));
    expect(htmlB).toContain(formatMetric(cadB.f1));
    expect(htmlA).not.toContain(formatMetric(cadB.f1));
    expect(htmlB).not.toContain(formatMetric(cadA.f1));

    expect(htmlA).toContain(formatMetric(cadA.rocAuc));
    expect(htmlB).toContain(formatMetric(cadB.rocAuc));
    expect(htmlA).not.toContain(formatMetric(cadB.rocAuc));
    expect(htmlB).not.toContain(formatMetric(cadA.rocAuc));

    expect(htmlA).toContain("300");
    expect(htmlB).toContain("180");
    expect(htmlB).not.toContain("300");

    expect(activePerformanceRow(htmlA)).toContain(formatInterval(cadA.rocAucCI));
    expect(activePerformanceRow(htmlB)).toContain(formatInterval(cadB.rocAucCI));
    expect(activePerformanceRow(htmlA)).toContain("strong");
    expect(activePerformanceRow(htmlB)).toContain("limited");
  });

  it("CalibrationPane shows the readouts of the props it receives", () => {
    const htmlA = renderToString(<CalibrationPane results={syntheticResults} />);
    const htmlB = renderToString(<CalibrationPane results={syntheticResultsVariantB} />);
    const calA = requireCal(syntheticResults, "CAD");
    const calB = requireCal(syntheticResultsVariantB, "CAD");

    expect(htmlA).toContain(formatMetric(calA.brierRaw));
    expect(htmlA).toContain(formatMetric(calA.eceRaw));
    expect(htmlB).toContain(formatMetric(calB.brierRaw));
    expect(htmlB).toContain(formatMetric(calB.eceRaw));
    expect(htmlA).not.toContain(formatMetric(calB.brierRaw));
    expect(htmlB).not.toContain(formatMetric(calA.brierRaw));

    expect(htmlA).toContain('data-testid="reliability-diagram"');
    expect(htmlA).toContain("Raw bins (dashed, round markers)");
    expect(htmlA).toContain("Platt bins (solid, square markers)");
  });

  it("DecisionsPane shows the threshold, marker and band of the props it receives", () => {
    const htmlA = renderToString(
      <DecisionsPane results={syntheticResults} currentCase={syntheticCurrentCaseA} />
    );
    const htmlB = renderToString(
      <DecisionsPane results={syntheticResultsVariantB} currentCase={syntheticCurrentCaseB} />
    );

    expect(htmlA).toContain(`Deployed threshold ${formatMetric(0.42)}`);
    expect(htmlB).toContain(`Deployed threshold ${formatMetric(0.61)}`);
    expect(htmlB).not.toContain(`Deployed threshold ${formatMetric(0.42)}`);

    const markerA = blockWindow(htmlA, "current-case-marker");
    const markerB = blockWindow(htmlB, "current-case-marker");
    expect(markerA).toContain(formatPercent(syntheticCurrentCaseA.probability));
    expect(markerA).toContain(formatPercent(syntheticCurrentCaseA.thresholdProbability));
    expect(markerA).toContain("above threshold");
    expect(markerA).toContain(syntheticCurrentCaseA.reliability);
    expect(markerB).toContain(formatPercent(syntheticCurrentCaseB.probability));
    expect(markerB).toContain(formatPercent(syntheticCurrentCaseB.thresholdProbability));
    expect(markerB).toContain("below threshold");
    expect(markerB).toContain(syntheticCurrentCaseB.reliability);

    expect(htmlA).not.toContain(formatPercent(syntheticCurrentCaseB.probability));
    expect(htmlB).not.toContain(formatPercent(syntheticCurrentCaseA.probability));

    expect(htmlA).toContain('data-testid="abstention-band"');
    expect(htmlA).toContain('data-testid="case-marker-line"');
    expect(htmlA).toContain('data-testid="threshold-marker"');
    expect(htmlA).toContain('data-testid="threshold-sweep-chart"');
    expect(htmlA).toContain('data-testid="abstention-chart"');
  });

  it("SubgroupsPane shows the rows of the props it receives", () => {
    const htmlA = renderToString(<SubgroupsPane results={syntheticResults} />);
    const htmlB = renderToString(<SubgroupsPane results={syntheticResultsVariantB} />);
    const rowsA = tableRows(htmlA, "subgroups-table");
    const rowsB = tableRows(htmlB, "subgroups-table");

    expect(rowsA.length).toBe(rowsB.length);
    expect(rowsA.length).toBeGreaterThan(1);
    // Sorted body: header row is index 0, CAD age_ge_60 index 1, CAD age_lt_60 index 2.
    const rowA = rowsA[2];
    const rowB = rowsB[2];
    expect(rowA).toContain("148");
    expect(rowA).toContain(formatMetric(0.901));
    expect(rowA).toContain(formatInterval([0.851, 0.941] as const));
    expect(rowB).toContain("96");
    expect(rowB).toContain(formatMetric(0.741));
    expect(rowB).toContain(formatInterval([0.652, 0.818] as const));
    expect(rowA).not.toContain(formatMetric(0.741));
    expect(rowB).not.toContain(formatMetric(0.901));
  });

  it("LeakagePane shows the probe values of the props it receives", () => {
    const htmlA = renderToString(<LeakagePane results={syntheticResults} />);
    const htmlB = renderToString(<LeakagePane results={syntheticResultsVariantB} />);
    const probeA = leakageSection(htmlA, "probe");
    const probeB = leakageSection(htmlB, "probe");

    expect(probeA).toContain(formatMetric(0.947));
    expect(probeB).toContain(formatMetric(0.912));
    expect(probeA).not.toContain(formatMetric(0.912));
    expect(probeB).not.toContain(formatMetric(0.947));
  });
});

describe("LeakagePane keeps probe and deployed distinct (requirement e)", () => {
  const html = renderToString(<LeakagePane results={syntheticResults} />);

  it("renders two separately labelled sections", () => {
    expect(html).toContain('data-section="probe"');
    expect(html).toContain('data-section="deployed"');

    const probe = leakageSection(html, "probe");
    const deployed = leakageSection(html, "deployed");

    expect(probe).toContain("ct-leak ct-leak--probe");
    expect(probe).toContain(">probe model</span>");
    expect(probe).toContain(TRUST_COPY.leakageProbeHeading);
    expect(probe).not.toContain("ct-leak--deployed");
    expect(probe).not.toContain(">deployed model</span>");

    expect(deployed).toContain("ct-leak ct-leak--deployed");
    expect(deployed).toContain(">deployed model</span>");
    expect(deployed).toContain(TRUST_COPY.leakageDeployedHeading);
    expect(deployed).not.toContain("ct-leak--probe");
    expect(deployed).not.toContain(">probe model</span>");
  });

  it("keeps probe values out of the deployed section and vice versa", () => {
    const probe = leakageSection(html, "probe");
    const deployed = leakageSection(html, "deployed");

    expect(probe).toContain(formatMetric(0.947));
    expect(probe).not.toContain(formatMetric(0.888));
    expect(deployed).toContain(formatMetric(0.888));
    expect(deployed).not.toContain(formatMetric(0.947));
    expect(deployed).not.toContain(formatMetric(0.996));
  });

  it("carries the audit explanation and the excluded-column list", () => {
    expect(html).toContain(escapeHtml(TRUST_COPY.leakageExplanation));
    expect(html).toContain("not evidence of deployed performance");
    expect(html).toContain("Probe and deployed results are never merged");

    const start = html.indexOf('data-testid="leakage-excluded-columns"');
    expect(start).toBeGreaterThanOrEqual(0);
    const chips = html.slice(start, html.indexOf("</ul>", start));
    for (const column of ["LAD", "LCX", "RCA", "Cath", "Exertional CP"]) {
      expect(chips).toContain(column);
    }
  });
});

describe("accessibility and display structure (AGENTS 6.1)", () => {
  it("performance table has caption and row/column scopes, target control is pressed-state labelled", () => {
    const html = renderToString(<PerformancePane results={syntheticResults} />);
    expect(html).toContain("<caption");
    expect(html).toContain('scope="col"');
    expect(html).toContain('scope="row"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('data-testid="performance-table"');
  });

  it("charts expose role=img with title and desc", () => {
    const cal = renderToString(<CalibrationPane results={syntheticResults} />);
    expect(cal).toContain('role="img"');
    expect(cal).toContain("<title");
    expect(cal).toContain("<desc");
    expect(cal).toContain(TRUST_COPY.calibrationDiagramSummary);

    const dec = renderToString(
      <DecisionsPane results={syntheticResults} currentCase={syntheticCurrentCaseA} />
    );
    expect(dec).toContain('role="img"');
    expect(dec).toContain("<desc");
    expect(dec).toContain(TRUST_COPY.decisionsSweepSummary);
    expect(dec).toContain(TRUST_COPY.decisionsAbstentionSummary);
  });

  it("law 7: the current-case readout always pairs value, threshold, decision and tier", () => {
    const html = renderToString(
      <DecisionsPane results={syntheticResults} currentCase={syntheticCurrentCaseA} />
    );
    const marker = blockWindow(html, "current-case-marker");
    expect(marker).toContain(formatPercent(syntheticCurrentCaseA.probability));
    expect(marker).toContain(formatPercent(0.42));
    expect(marker).toContain("above threshold");
    expect(marker).toContain("strong");
    expect(marker).toContain(TRUST_COPY.currentCaseBandLabel);
  });
});

/** Slice from a data-testid anchor to the closing tag (bounded, exact window). */
function untilEnd(html: string, testId: string, endTag: string): string {
  const start = html.indexOf(`data-testid="${testId}"`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = html.indexOf(endTag, start);
  expect(end).toBeGreaterThan(start);
  return stripSsrComments(html.slice(start, end));
}

/** Sweep point nearest to `target` (independent selection, mirrors no production code path). */
function nearestSweep<T extends { threshold: number }>(points: readonly T[], target: number): T {
  let best = points[0];
  for (const point of points) {
    if (Math.abs(point.threshold - target) < Math.abs(best.threshold - target)) {
      best = point;
    }
  }
  return best;
}

describe("G5 inline retry affordance (Architecture §16.1)", () => {
  it("never renders a retry control when no handler is wired (no fake affordance)", () => {
    for (const pane of PANES) {
      expect(pane.render({ results: null })).not.toContain('data-testid="pane-retry"');
      expect(pane.render({ results: null, error: "checksum mismatch" })).not.toContain(
        'data-testid="pane-retry"'
      );
      expect(pane.render({ results: syntheticResults, error: "checksum mismatch" })).not.toContain(
        'data-testid="pane-retry"'
      );
    }
  });

  it("renders the retry control in empty and error states when a handler is supplied", () => {
    const noop = () => {};
    for (const pane of PANES) {
      const empty = pane.render({ results: null, onRetry: noop });
      expect(empty).toContain('data-testid="pane-retry"');
      expect(empty).toContain(TRUST_COPY.retryLabel);
      expect(empty).toContain('type="button"');

      const errored = pane.render({ results: null, error: "checksum mismatch", onRetry: noop });
      expect(errored).toContain('data-testid="pane-retry"');
      expect(errored).toContain('data-pane-state="error"');

      const ready = pane.render({ results: syntheticResults, onRetry: noop });
      expect(ready).not.toContain('data-testid="pane-retry"');
      expect(ready).toContain('data-pane-state="ready"');
    }
  });
});

describe("DecisionsPane threshold trade control (P1 Validation interactions)", () => {
  const cad = syntheticResults.decisions?.CAD;
  const cadPoints = cad?.points ?? [];
  expect(cadPoints.length).toBeGreaterThan(2);

  it("defaults to the sweep point nearest the deployed threshold and shows the full readout", () => {
    const html = renderToString(<DecisionsPane results={syntheticResults} />);
    const nearest = nearestSweep(cadPoints, cad?.selectedThreshold ?? 0);

    const readout = blockWindow(html, "threshold-inspect-readout");
    expect(readout).toContain(`Threshold ${formatMetric(nearest.threshold)}`);
    expect(readout).toContain(`Precision ${formatMetric(nearest.precision)}`);
    expect(readout).toContain(`Recall ${formatMetric(nearest.recall)}`);
    expect(readout).toContain(`F1 ${formatMetric(nearest.f1)}`);

    expect(html).toContain('data-testid="threshold-inspector"');
    expect(html).toContain('data-testid="threshold-inspect-slider"');
    const slider = untilEnd(html, "threshold-inspect-slider", ">");
    expect(slider).toContain(`max="${cadPoints.length - 1}"`);
    expect(slider).toContain('min="0"');
    expect(html).toContain('data-testid="inspected-point-marker"');
    const stripped = stripSsrComments(html);
    expect(stripped).toContain("Threshold selection: max_f1_inner_validation");
    expect(stripped).toContain("source validated_pipeline");
  });

  it("follows the props: variant B and target LCX inspect their own artifact points", () => {
    const variantBCad = syntheticResultsVariantB.decisions?.CAD;
    const htmlB = renderToString(<DecisionsPane results={syntheticResultsVariantB} />);
    const nearestB = nearestSweep(variantBCad?.points ?? [], variantBCad?.selectedThreshold ?? 0);
    const readoutB = blockWindow(htmlB, "threshold-inspect-readout");
    expect(readoutB).toContain(`Threshold ${formatMetric(nearestB.threshold)}`);
    expect(readoutB).toContain(`F1 ${formatMetric(nearestB.f1)}`);

    const lcx = syntheticResults.decisions?.LCX;
    const htmlLcx = renderToString(<DecisionsPane results={syntheticResults} target="LCX" />);
    const nearestLcx = nearestSweep(lcx?.points ?? [], lcx?.selectedThreshold ?? 0);
    const readoutLcx = blockWindow(htmlLcx, "threshold-inspect-readout");
    expect(readoutLcx).toContain(`Threshold ${formatMetric(nearestLcx.threshold)}`);
    expect(readoutLcx).toContain(`F1 ${formatMetric(nearestLcx.f1)}`);
    expect(formatMetric(nearestLcx.f1)).not.toBe(formatMetric(nearestSweep(cadPoints, cad?.selectedThreshold ?? 0).f1));
  });

  it("a controlled thresholdIndex overrides the default selection", () => {
    const html = renderToString(<DecisionsPane results={syntheticResults} thresholdIndex={0} />);
    const readout = blockWindow(html, "threshold-inspect-readout");
    expect(readout).toContain(`Threshold ${formatMetric(cadPoints[0].threshold)}`);
    expect(readout).toContain(`F1 ${formatMetric(cadPoints[0].f1)}`);
    const deployedNearest = nearestSweep(cadPoints, cad?.selectedThreshold ?? 0);
    expect(formatMetric(cadPoints[0].threshold)).not.toBe(formatMetric(deployedNearest.threshold));
    expect(readout).not.toContain(`F1 ${formatMetric(deployedNearest.f1)}`);
  });
});

describe("CalibrationPane bin inspection (P1 Validation interactions)", () => {
  const curve = syntheticResults.calibration?.CAD?.reliabilityCurve;
  const raw = curve?.raw ?? [];
  const platt = curve?.platt ?? [];
  expect(raw.length).toBeGreaterThan(1);

  it("defaults to the first bin with raw and Platt readouts and a diagram highlight", () => {
    const html = renderToString(<CalibrationPane results={syntheticResults} />);
    const select = untilEnd(html, "bin-inspect-select", "</select>");
    expect(select).toContain('value="0"');
    expect(select.split("<option").length - 1).toBe(raw.length);

    const rawReadout = blockWindow(html, "bin-inspect-readout");
    expect(rawReadout).toContain(TRUST_COPY.binRawLabel);
    expect(rawReadout).toContain(formatPercent(raw[0].meanPredicted));
    expect(rawReadout).toContain(formatPercent(raw[0].fractionPositive));

    const plattReadout = blockWindow(html, "bin-inspect-readout-platt");
    expect(plattReadout).toContain(TRUST_COPY.binPlattLabel);
    expect(plattReadout).toContain(formatPercent(platt[0].meanPredicted));

    expect(html).toContain('data-testid="bin-highlight"');
    expect(html).toContain(TRUST_COPY.binInspectHeading);
    expect(html).toContain(TRUST_COPY.binInspectHint);
  });

  it("a controlled binIndex inspects another stored bin", () => {
    const last = raw.length - 1;
    const html = renderToString(<CalibrationPane results={syntheticResults} binIndex={last} />);
    const readout = blockWindow(html, "bin-inspect-readout");
    expect(readout).toContain(formatPercent(raw[last].binLower, 0));
    expect(readout).toContain(formatPercent(raw[last].binUpper, 0));
    expect(readout).toContain(formatPercent(raw[last].meanPredicted));
    const select = untilEnd(html, "bin-inspect-select", "</select>");
    expect(select).toContain(`value="${last}"`);
  });
});

describe("grouped bar views (Final_demo §5)", () => {
  it("SubgroupsPane renders artifact rows as bars with identity, interval and n", () => {
    const html = renderToString(<SubgroupsPane results={syntheticResults} />);
    const bars = untilEnd(html, "subgroups-bars", "</ul>");
    expect(bars).toContain("Age ≥ 60");
    expect(bars).toContain(formatMetric(0.901));
    expect(bars).toContain(formatInterval([0.851, 0.941] as const));
    expect(bars).toContain("n 148");
    expect(bars).toContain("CAD");
    expect(html).toContain(TRUST_COPY.subgroupsBarsCaption);
  });

  it("a target filter narrows the bars and rows to that target", () => {
    const html = renderToString(
      <SubgroupsPane results={syntheticResults} targetFilter="LCX" />
    );
    const rows = tableRows(html, "subgroups-table");
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows.slice(1)) {
      expect(row).toContain("<th scope=\"row\" class=\"ct-num\">LCX</th>");
    }
    const bars = untilEnd(html, "subgroups-bars", "</ul>");
    expect(bars).not.toContain("Diabetes recorded");
    expect(bars).toContain("Female");
  });

  it("shows the designed filter-empty note when no rows match", () => {
    const withoutCad: TrustResults = {
      ...syntheticResults,
      subgroups: (syntheticResults.subgroups ?? []).filter((row) => row.targetId !== "CAD")
    };
    const html = renderToString(<SubgroupsPane results={withoutCad} targetFilter="CAD" />);
    expect(html).toContain('data-testid="subgroups-filter-empty"');
    expect(html).toContain(TRUST_COPY.subgroupsFilterEmpty);
    expect(html).not.toContain('data-testid="subgroups-table"');
  });
});

describe("LeakagePane probe identity and scope filter", () => {
  it("renders probe identity derived from probeId, not the shared source-type label", () => {
    const html = renderToString(<LeakagePane results={syntheticResults} />);
    const probe = leakageSection(html, "probe");
    expect(probe).toContain('data-probe-id="smote_before_cv"');
    expect(probe).toContain(">smote before cv<");
    expect(probe).toContain(">feature selection before cv<");
    expect(probe).toContain(">target leakage<");
    expect(probe).not.toContain('<th scope="row">SMOTE before cross-validation</th>');
    expect(probe).toContain('data-testid="leakage-bars"');
  });

  it("stays distinct even when every probe row carries the shared 'probe model' label", () => {
    const shared: TrustResults = {
      ...syntheticResults,
      leakageLab: {
        ...syntheticResults.leakageLab,
        excludedColumns: syntheticResults.leakageLab?.excludedColumns ?? [],
        probes: (syntheticResults.leakageLab?.probes ?? []).map((probe) => ({
          ...probe,
          label: "probe model"
        }))
      }
    };
    const probe = leakageSection(renderToString(<LeakagePane results={shared} />), "probe");
    expect(probe).toContain(">honest<");
    expect(probe).toContain(">smote before cv<");
    expect(probe).toContain(">seed sensitivity<");
    expect(probe).not.toContain('<th scope="row">probe model</th>');
  });

  it("probe bars carry metric badge, scope and artifact value", () => {
    const html = renderToString(<LeakagePane results={syntheticResults} />);
    const probe = leakageSection(html, "probe");
    const bars = untilEnd(probe, "leakage-bars", "</ul>");
    expect(bars).toContain("smote before cv");
    expect(bars).toContain("ROC-AUC");
    expect(bars).toContain("pooled");
    expect(bars).toContain(formatMetric(0.947));
    expect(html).toContain(TRUST_COPY.leakageBarsCaption);
  });

  it("shows the designed filter-empty note when no probe rows match the scope", () => {
    const html = renderToString(<LeakagePane results={syntheticResults} targetFilter="CAD" />);
    expect(html).toContain('data-testid="leakage-filter-empty"');
    expect(html).toContain(TRUST_COPY.leakageFilterEmpty);
    expect(html).not.toContain('data-testid="leakage-probe-table"');
  });
});

describe("PerformancePane disclosures, reliability rule and protocol details", () => {
  it("renders CI method, stratification, RT-1 rationale and artifact provenance notes", () => {
    const html = renderToString(<PerformancePane results={syntheticResults} />);
    expect(html).toContain(TRUST_COPY.protocolCiMethodLabel);
    expect(html).toContain(syntheticResults.protocol?.ciMethod ?? "MISSING");
    expect(html).toContain(TRUST_COPY.protocolStratificationLabel);
    expect(html).toContain(syntheticResults.protocol?.stratification ?? "MISSING");

    expect(html).toContain('data-testid="reliability-rule"');
    expect(html).toContain(
      escapeHtml(syntheticResults.reliability?.rule?.description ?? "MISSING")
    );
    expect(html).toContain("synthetic_fixture_strong");

    const disclosures = untilEnd(html, "performance-disclosures", "</details>");
    expect(disclosures).toContain(TRUST_COPY.disclosuresHeading);
    expect(disclosures).toContain(TRUST_COPY.disclosuresFraming);
    for (const note of syntheticResults.provenance?.notes ?? []) {
      expect(disclosures).toContain(escapeHtml(note));
    }
  });

  it("shows the designed disclosures-missing note when provenance has no notes", () => {
    const noNotes: TrustResults = { ...syntheticResults, provenance: {} };
    const html = renderToString(<PerformancePane results={noNotes} />);
    expect(html).toContain(TRUST_COPY.disclosuresMissing);
  });
});
