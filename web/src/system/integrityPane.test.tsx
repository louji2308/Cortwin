/**
 * System → Integrity pane suite (Implementation_Plan P7 steps 11–14;
 * Contracts §9 L429, C-06, AG-04).
 *
 * The integrity pane is the anti-fabrication surface: it must never display a
 * verdict that a run did not report. Properties shown here:
 *   (i)   no non-test source in this directory contains a "PASS"/"FAIL"
 *         string literal, and status text is derived from the reported
 *         boolean (mutation surface pinned in source);
 *   (ii)  an absent run shows the designed not-run state — no verdict,
 *         no glyph, no tolerance words, no alert;
 *   (iii) a failing run is prominent: role="alert" with counts and the
 *         failing row marked from its own boolean;
 *   (iv)  a passing run shows the all-within state with every check row;
 *   (v)   a run that reported no checks shows the designed no-checks state
 *         instead of an all-clear;
 *   (vi)  pane sources never import the test fixtures (and the barrel never
 *         exports them);
 *   (vii) non-finite numbers render "not available", never NaN/Infinity;
 *   (viii) fixture hygiene: every fixture check's boolean matches its own
 *          numbers, and fixture tolerances are the C-06 values;
 *   (ix)  the boot hash chain renders exactly as supplied — declared and
 *         observed digests side by side, a mismatch is an alert, an absent
 *         observation reads "not observed" and never turns red;
 *   (x)   the in-browser run has designed loading and failure states, both
 *         verdict-free;
 *   (xi)  fixture pass/fail counts are shown only when a run supplied them.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  PARITY_REPORT_NO_CHECKS,
  PARITY_REPORT_OUTSIDE,
  PARITY_REPORT_WITHIN
} from "./fixtures";
import { IntegrityPane, type IntegrityPaneProps } from "./IntegrityPane";
import type { ArtifactIntegrity, ArtifactIntegrityRow, ParityReport } from "./types";

const DIR = dirname(fileURLToPath(import.meta.url));

const render = (props: Partial<IntegrityPaneProps> = {}): string =>
  renderToString(<IntegrityPane {...props} />).replace(/<!-- -->/g, "");

const read = (file: string): string => readFileSync(join(DIR, file), "utf8");

const SOURCE_FILES = readdirSync(DIR)
  .filter((file) => /\.tsx?$/.test(file))
  .filter((file) => !/\.test\.tsx?$/.test(file))
  .sort();

function rowsOf(html: string, testId: string): string[] {
  const start = html.indexOf(`data-testid="${testId}"`);
  expect(start).toBeGreaterThanOrEqual(0);
  const window = html.slice(start, html.indexOf("</table>", start));
  return [...window.matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/g)].map((match) => match[0]);
}

describe("IntegrityPane — no verdict literals in component source (i)", () => {
  it("discovers every non-test source in this directory", () => {
    expect(SOURCE_FILES).toContain("IntegrityPane.tsx");
    expect(SOURCE_FILES).toContain("SystemPaneShell.tsx");
    expect(SOURCE_FILES).toContain("index.ts");
    expect(SOURCE_FILES.length).toBeGreaterThanOrEqual(9);
  });

  it("no non-test source contains a quoted PASS or FAIL used as data", () => {
    for (const file of SOURCE_FILES) {
      const text = read(file);
      expect(text, `${file}: quoted PASS`).not.toMatch(/["']PASS["']/);
      expect(text, `${file}: quoted FAIL`).not.toMatch(/["']FAIL["']/);
    }
  });

  it("status words and glyphs are derived from the reported boolean", () => {
    const source = read("IntegrityPane.tsx");
    expect(source).toContain('passed ? "within tolerance" : "outside tolerance"');
    expect(source).toContain('check.passed ? "✓" : "✗"');
    expect(source).toContain("!check.passed");
    expect(source).toContain("Number.isFinite(value) ? String(value) : \"not available\"");
  });
});

describe("IntegrityPane — absent run is a designed not-run state (ii)", () => {
  const html = render({ report: null });

  it("states that no run happened and shows no verdict of any kind", () => {
    expect(html).toContain('data-state="not-run"');
    expect(html).toContain('role="status"');
    expect(html).toContain("No integrity run in this session.");
    expect(html).toContain("never displays a precomputed verdict");
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("within tolerance");
    expect(html).not.toContain("outside tolerance");
    expect(html).not.toContain("✓");
    expect(html).not.toContain("✗");
    expect(html).not.toContain('data-testid="parity-checks"');
    expect(html).not.toContain("NaN");
  });

  it("shows no numeric report content when there is no report", () => {
    expect(html).not.toContain("synthetic-test-model");
    expect(html).not.toContain("0.00001");
  });
});

describe("IntegrityPane — a failing run is prominent (iii)", () => {
  const html = render({ report: PARITY_REPORT_OUTSIDE });

  it("raises an alert naming how many checks are outside tolerance", () => {
    expect(html).toContain('role="alert"');
    expect(html).toContain(
      "✗ Parity check failed — 1 of 3 checks outside tolerance"
    );
    expect(html).not.toContain("All reported checks are within tolerance.");
    expect(html).not.toContain('data-state="not-run"');
  });

  it("marks the failing row from its own boolean", () => {
    const rows = rowsOf(html, "parity-checks");
    // rows[0] = header row, rows[1] = probability (the failing check).
    expect(rows[1]).toContain("ct-sys-row--fail");
    expect(rows[1]).toContain("probability");
    expect(rows[1]).toContain("✗");
    expect(rows[1]).toContain("outside tolerance");
    expect(rows[1]).toContain("ct-sys-status--fail");
    expect(rows[1]).toContain(String(PARITY_REPORT_OUTSIDE.checks[0].observed));
    for (const passing of rows.slice(2)) {
      expect(passing).not.toContain("ct-sys-row--fail");
      expect(passing).toContain("✓");
      expect(passing).toContain("within tolerance");
    }
  });

  it("still renders the given identity, tolerances and check numbers", () => {
    expect(html).toContain(PARITY_REPORT_OUTSIDE.modelId);
    expect(html).toContain(PARITY_REPORT_OUTSIDE.fixtureId);
    expect(html).toContain(String(PARITY_REPORT_OUTSIDE.tolerance.probability));
    expect(html).toContain(String(PARITY_REPORT_OUTSIDE.tolerance.efficiency));
    expect(html).toContain(String(PARITY_REPORT_OUTSIDE.checks[2].observed));
    expect(html).not.toContain("NaN");
  });
});

describe("IntegrityPane — a passing run shows the all-within state (iv)", () => {
  const html = render({ report: PARITY_REPORT_WITHIN });

  it("states every reported check is within tolerance, without an alert", () => {
    expect(html).toContain('role="status"');
    expect(html).not.toContain('role="alert"');
    expect(html).toContain("✓ All reported checks are within tolerance.");
    expect(html).not.toContain("Parity check failed");
    expect(html).not.toContain("ct-sys-row--fail");
  });

  it("renders every check row as reported, with identity and deviations", () => {
    const rows = rowsOf(html, "parity-checks");
    expect(rows).toHaveLength(PARITY_REPORT_WITHIN.checks.length + 1);
    PARITY_REPORT_WITHIN.checks.forEach((check, index) => {
      const row = rows[index + 1];
      expect(row, check.name).toContain(check.name);
      expect(row, check.name).toContain(String(check.observed));
      expect(row, check.name).toContain(String(check.expected));
      expect(row, check.name).toContain("✓ within tolerance");
    });
    expect(html).toContain(PARITY_REPORT_WITHIN.modelId);
    expect(html).toContain(PARITY_REPORT_WITHIN.fixtureId);
    expect(html).toContain('data-testid="parity-deviations"');
    expect(html).toContain(String(PARITY_REPORT_WITHIN.maxMarginDeviation as number));
    expect(html).toContain(String(PARITY_REPORT_WITHIN.tolerance.margin as number));
  });
});

describe("IntegrityPane — a run with no checks shows no status (v)", () => {
  const html = render({ report: PARITY_REPORT_NO_CHECKS });

  it("shows the designed no-checks state instead of an all-clear", () => {
    expect(html).toContain('data-state="no-checks"');
    expect(html).toContain('role="status"');
    expect(html).toContain("This run reported no checks.");
    expect(html).toContain("No status is shown until a run reports checks.");
    expect(html).not.toContain('data-testid="parity-checks"');
    expect(html).not.toContain("within tolerance");
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("✓");
    expect(html).not.toContain("✗");
  });

  it("still renders the given identity and tolerances", () => {
    expect(html).toContain(PARITY_REPORT_NO_CHECKS.modelId);
    expect(html).toContain(PARITY_REPORT_NO_CHECKS.fixtureId);
    expect(html).toContain(String(PARITY_REPORT_NO_CHECKS.tolerance.probability));
  });
});

describe("IntegrityPane — fixtures never enter application sources (vi)", () => {
  it("no pane or data source imports the fixtures module", () => {
    for (const file of SOURCE_FILES) {
      if (file === "fixtures.ts") continue;
      expect(read(file), file).not.toMatch(/from\s+["']\.\/fixtures["']/);
    }
  });

  it("the public barrel never exports the fixtures", () => {
    expect(read("index.ts")).not.toMatch(/from\s+["']\.\/fixtures["']/);
    expect(read("index.ts")).not.toMatch(/export\s+.*fixtures/);
  });
});

describe("IntegrityPane — non-finite numbers never render (vii)", () => {
  const report: ParityReport = {
    modelId: "synthetic-test-model",
    fixtureId: "synthetic-test-fixture-004",
    tolerance: { probability: Number.NaN, attribution: 0.00001, efficiency: 0.000001 },
    checks: [
      {
        name: "probability",
        observed: Number.NaN,
        expected: Number.POSITIVE_INFINITY,
        passed: false
      }
    ]
  };
  const html = render({ report });

  it("reads 'not available' for NaN and Infinity, never the raw value", () => {
    expect(html).toContain("not available");
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("Infinity");
    expect(html).toContain('role="alert"');
    expect(html).toContain("1 of 1");
  });
});

describe("fixture hygiene — reported booleans match their own numbers (viii)", () => {
  const reports = [
    PARITY_REPORT_WITHIN,
    PARITY_REPORT_OUTSIDE,
    PARITY_REPORT_NO_CHECKS
  ];

  it("every fixture check's passed flag equals observed <= expected", () => {
    for (const report of reports) {
      for (const check of report.checks) {
        expect(check.passed, `${report.fixtureId}/${check.name}`).toBe(
          check.observed <= check.expected
        );
      }
    }
  });

  it("fixture tolerances are the C-06 golden-fixture tolerances", () => {
    for (const report of reports) {
      expect(report.tolerance.probability, report.fixtureId).toBe(0.00001);
      expect(report.tolerance.attribution, report.fixtureId).toBe(0.00001);
      expect(report.tolerance.efficiency, report.fixtureId).toBe(0.000001);
    }
  });

  it("fixture identities are explicitly synthetic", () => {
    for (const report of reports) {
      expect(report.modelId.startsWith("synthetic")).toBe(true);
      expect(report.fixtureId.startsWith("synthetic")).toBe(true);
    }
  });
});

const DIGEST_A = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";
const DIGEST_B = "0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0";
const OBSERVED_AT = "2026-10-06T09:30:00.000Z";

function artifactRow(overrides: Partial<ArtifactIntegrityRow> = {}): ArtifactIntegrityRow {
  return {
    key: "registry",
    path: "registry.json",
    declaredSha256: DIGEST_A,
    observedSha256: DIGEST_A,
    declaredBytes: 23053,
    observedBytes: 23053,
    observedAt: OBSERVED_AT,
    verified: true,
    ...overrides
  };
}

function artifactChain(overrides: Partial<ArtifactIntegrity> = {}): ArtifactIntegrity {
  return {
    bundleId: "sha256:bundle-chain",
    modelId: "sha256:model-chain",
    engineModelId: "sha256:model-chain",
    engineModelMatches: true,
    verifiedAt: OBSERVED_AT,
    rows: [artifactRow()],
    ...overrides
  };
}

describe("IntegrityPane — the boot hash chain renders as supplied (ix)", () => {
  const healthy = render({ artifacts: artifactChain() });

  it("shows the verified chain as a status, never an alert", () => {
    expect(healthy).toContain('data-testid="artifact-table"');
    expect(healthy).toContain('data-testid="artifact-banner"');
    expect(healthy).toContain("✓ All 1 artifacts matched their manifest SHA-256 digest");
    expect(healthy).toContain('role="status"');
    expect(healthy).not.toContain('role="alert"');
    expect(healthy).toContain("ct-sys-hash");
    expect(healthy).toContain(DIGEST_A);
    expect(healthy).toContain("23053 / 23053");
    expect(healthy).toContain(OBSERVED_AT);
    expect(healthy).toContain("✓ verified");
  });

  it("shows both model ids and whether they agree", () => {
    expect(healthy).toContain('data-testid="artifact-identity"');
    expect(healthy).toContain("sha256:bundle-chain");
    expect(healthy).toContain("sha256:model-chain");
    expect(healthy).toContain("— matches the manifest");
  });

  it("marks a digest mismatch and raises an alert naming it", () => {
    const broken = render({
      artifacts: artifactChain({
        engineModelMatches: false,
        rows: [
          artifactRow(),
          artifactRow({
            key: "results",
            path: "results.json",
            observedSha256: DIGEST_B,
            declaredBytes: 261136,
            observedBytes: 261136,
            verified: false
          })
        ]
      })
    });

    expect(broken).toContain('role="alert"');
    expect(broken).toContain("✗ Integrity mismatch");
    expect(broken).toContain("1 of 2 artifacts did not match the manifest digest");
    expect(broken).toContain("different model id than the manifest");
    expect(broken).toContain("— differs from the manifest");
    expect(broken).toContain("✗ mismatch");
    expect(broken).toContain("ct-sys-row--fail");
    expect(broken).not.toContain("✓ All 2 artifacts matched");

    const rows = rowsOf(broken, "artifact-table");
    expect(rows[1]).not.toContain("ct-sys-row--fail");
    expect(rows[2]).toContain("ct-sys-row--fail");
    expect(rows[2]).toContain(DIGEST_B);
    expect(rows[2]).toContain("ct-sys-status--fail");
  });

  it("keeps an unobserved artifact neutral and says so", () => {
    const partial = render({
      artifacts: artifactChain({
        engineModelId: null,
        engineModelMatches: null,
        rows: [
          artifactRow({
            key: "fixtures",
            path: "fixtures/golden.json",
            observedSha256: null,
            observedBytes: null,
            observedAt: null,
            verified: false
          })
        ]
      })
    });

    expect(partial).toContain('role="alert"');
    expect(partial).toContain("1 of 1 artifacts were not observed while booting");
    expect(partial).toContain("— not observed");
    expect(partial).toContain("not observed while booting");
    expect(partial).toContain("not provided");
    expect(partial).not.toContain("✗ mismatch");
    expect(partial).not.toContain("ct-sys-row--fail");

    const rows = rowsOf(partial, "artifact-table");
    expect(rows[1]).not.toContain("ct-sys-row--fail");
  });

  it("renders no artifact section when the session observed nothing", () => {
    const html = render({ report: null });
    expect(html).not.toContain('data-testid="artifact-table"');
    expect(html).not.toContain('data-testid="artifact-banner"');
  });
});

describe("IntegrityPane — designed states for the in-browser run (x)", () => {
  it("shows a verdict-free loading state while the run is in progress", () => {
    const html = render({ report: null, loading: true });
    expect(html).toContain('data-testid="parity-loading"');
    expect(html).toContain('data-state="running"');
    expect(html).toContain('role="status"');
    expect(html).toContain("Running fixture verification…");
    expect(html).not.toContain('data-testid="parity-checks"');
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("within tolerance");
    expect(html).not.toContain("outside tolerance");
    expect(html).not.toContain("✓");
    expect(html).not.toContain("✗");
  });

  it("shows a designed failure state carrying the reported detail", () => {
    const html = render({ report: null, error: "The shipped fixture set was rejected." });
    expect(html).toContain('data-testid="parity-error"');
    expect(html).toContain('data-state="run-failed"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("Fixture verification could not run in this browser.");
    expect(html).toContain("The shipped fixture set was rejected.");
    expect(html).not.toContain('data-testid="parity-checks"');
    expect(html).not.toContain("✓");
    expect(html).not.toContain("✗");
  });

  it("an error outranks an absent run in the pane state", () => {
    const html = render({ report: null, loading: true, error: "detail" });
    expect(html).toContain('data-state="run-failed"');
    expect(html).toContain('data-testid="parity-error"');
    expect(html).not.toContain('data-testid="parity-loading"');
  });
});

describe("IntegrityPane — fixture pass/fail counts come from the run (xi)", () => {
  it("shows the counts the run reported under the banner", () => {
    const html = render({
      report: { ...PARITY_REPORT_WITHIN, fixtures: { total: 40, passed: 40, failed: 0 } }
    });
    expect(html).toContain('data-testid="parity-fixtures"');
    expect(html).toContain("✓ Fixture pass/fail:");
    expect(html).toContain("40 of 40 fixtures within tolerance.");
    expect(html).not.toContain('role="alert"');
  });

  it("keeps the glyph aligned with the reported failure count", () => {
    const html = render({
      report: { ...PARITY_REPORT_OUTSIDE, fixtures: { total: 40, passed: 39, failed: 1 } }
    });
    expect(html).toContain("✗ Fixture pass/fail:");
    expect(html).toContain("39 of 40 fixtures within tolerance.");
    expect(html).toContain('role="alert"');
  });

  it("shows no counts when the run reported none", () => {
    const html = render({ report: PARITY_REPORT_NO_CHECKS });
    expect(html).not.toContain('data-testid="parity-fixtures"');
    expect(html).not.toContain("Fixture pass/fail");
  });
});
