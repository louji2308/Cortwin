/**
 * Integrity data path (Contracts §9 L429, C-01 §5.1, AG-04, AG-12).
 *
 * Properties checked here, against the shipped files in web/public:
 *   (1) the recorder digests exactly the bytes it fetched, and every row of
 *       the boot hash chain verifies against the real manifest;
 *   (2) one corrupted byte in one artifact turns that row red — the digest is
 *       recomputed from the corrupted bytes, never copied from the manifest;
 *   (3) an absence stays an absence: no observation, no artifacts block, no
 *       manifest → null, and the pane shows its designed pending state;
 *   (4) the parity report shown by the pane is built from the shipped
 *       web/src/domain/parity-report.json, field by field;
 *   (5) a live run of the production engine over the shipped model, registry
 *       and golden fixtures agrees with that shipped report;
 *   (6) the run state machine reports idle / ready / designed error, and
 *       never throws.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ARTIFACT_KEYS } from "../boot/manifest";
import type { FetchArtifact } from "../boot/verify";
import type { Manifest } from "../contracts";
import { loadEngine, type Engine } from "../domain";
import { IntegrityPane } from "../system";
import type { ArtifactIntegrity, ArtifactIntegrityRow } from "../system/types";
import {
  createArtifactRecorder,
  PARITY_IDLE,
  paritySettle,
  runFixtureVerification,
  toArtifactIntegrity,
  toParityReport,
  type ArtifactObservation
} from "./paneData";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(HERE, "..", "..", "public");
const SHIPPED_REPORT_PATH = join(HERE, "..", "domain", "parity-report.json");

const MANIFEST = JSON.parse(readFileSync(join(PUBLIC_DIR, "manifest.json"), "utf8")) as Manifest;
const SHIPPED_REPORT = JSON.parse(
  readFileSync(SHIPPED_REPORT_PATH, "utf8")
) as Parameters<typeof toParityReport>[0];

const diskFetch: FetchArtifact = (path) =>
  Promise.resolve(new Uint8Array(readFileSync(join(PUBLIC_DIR, path))));

const renderPane = (props: Record<string, unknown>): string =>
  renderToString(<IntegrityPane {...props} />).replace(/<!-- -->/g, "");

async function observedWith(fetchArtifact: FetchArtifact): Promise<readonly ArtifactObservation[]> {
  const recorder = createArtifactRecorder(fetchArtifact);
  for (const key of ARTIFACT_KEYS) {
    await recorder.fetch(MANIFEST.artifacts[key].path);
  }
  return recorder.list();
}

function loadShippedEngine(): Engine {
  const registry = JSON.parse(readFileSync(join(PUBLIC_DIR, "registry.json"), "utf8"));
  const model = JSON.parse(readFileSync(join(PUBLIC_DIR, "model.json"), "utf8"));
  return loadEngine({ model, registry });
}

function loadShippedFixtures(): unknown {
  return JSON.parse(readFileSync(join(PUBLIC_DIR, "fixtures", "golden.json"), "utf8"));
}

describe("boot hash chain — observed digests verify against the real manifest (1)", () => {
  it("records every artifact fetched at boot and every row verifies", async () => {
    const integrity = toArtifactIntegrity({ manifest: MANIFEST }, await observedWith(diskFetch));
    expect(integrity).not.toBeNull();
    if (integrity === null) return;

    expect(integrity.bundleId).toBe(MANIFEST.bundleId);
    expect(integrity.modelId).toBe(MANIFEST.modelId);
    expect(integrity.engineModelId).toBeNull();
    expect(integrity.engineModelMatches).toBeNull();
    expect(integrity.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(integrity.rows.map((row) => row.key)).toEqual([...ARTIFACT_KEYS]);

    for (const row of integrity.rows) {
      const declared = MANIFEST.artifacts[row.key as keyof Manifest["artifacts"]];
      expect(row.verified, row.key).toBe(true);
      expect(row.path, row.key).toBe(declared.path);
      expect(row.observedSha256, row.key).toBe(declared.sha256);
      expect(row.declaredSha256, row.key).toBe(declared.sha256.toLowerCase());
      expect(row.observedBytes, row.key).toBe(declared.sizeBytes);
      expect(row.declaredBytes, row.key).toBe(declared.sizeBytes);
      expect(row.observedAt, row.key).not.toBeNull();
    }
  });

  it("renders the verified chain in the pane, with no alert raised", async () => {
    const integrity = toArtifactIntegrity(
      { manifest: MANIFEST, engineModelId: MANIFEST.modelId },
      await observedWith(diskFetch)
    );
    const html = renderPane({ artifacts: integrity });

    expect(html).toContain('data-testid="artifact-table"');
    expect(html).toContain('data-testid="artifact-identity"');
    expect(html).toContain("✓ All 6 artifacts matched their manifest SHA-256 digest");
    expect(html).toContain("verified at boot");
    expect(html).toContain(MANIFEST.bundleId);
    expect(html).toContain(MANIFEST.modelId);
    expect(html).toContain("— matches the manifest");
    expect(html).not.toContain('role="alert"');
    expect(html).toContain('data-state="not-run"');

    const rows = [...html.matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/g)].map((match) => match[0]);
    const artifactRows = rows.filter((row) => row.includes("ct-sys-hash"));
    expect(artifactRows).toHaveLength(ARTIFACT_KEYS.length);
    for (const row of artifactRows) {
      expect(row).toContain("✓ verified");
      expect(row).not.toContain("✗ mismatch");
    }
  });
});

describe("boot hash chain — one corrupted byte is reported, not hidden (2)", () => {
  it("recomputes the digest of the corrupted bytes and marks that row red", async () => {
    const corrupted: FetchArtifact = (path) =>
      diskFetch(path).then((bytes) => {
        if (path === "results.json") bytes[0] = bytes[0] ^ 0xff;
        return bytes;
      });

    const integrity = toArtifactIntegrity({ manifest: MANIFEST }, await observedWith(corrupted));
    expect(integrity).not.toBeNull();
    if (integrity === null) return;

    const healthy = integrity.rows.filter((row) => row.key !== "results");
    for (const row of healthy) expect(row.verified, row.key).toBe(true);

    const results = integrity.rows.find((row) => row.key === "results");
    expect(results).toBeDefined();
    if (results === undefined) return;
    expect(results.verified).toBe(false);
    expect(results.observedSha256).not.toBe(results.declaredSha256);
    expect(results.observedSha256).toHaveLength(64);
    // Size is unchanged, so only the digest can catch the corruption.
    expect(results.observedBytes).toBe(results.declaredBytes);

    const html = renderPane({ artifacts: integrity });
    expect(html).toContain('role="alert"');
    expect(html).toContain("✗ Integrity mismatch");
    expect(html).toContain("1 of 6 artifacts did not match the manifest digest");
    expect(html).toContain("✗ mismatch");
    expect(html).not.toContain("✓ All 6 artifacts matched");
  });
});

describe("boot hash chain — absence stays a designed absence (3)", () => {
  const observation: ArtifactObservation = {
    path: "registry.json",
    sha256: "aa".repeat(32),
    sizeBytes: 1,
    observedAtMs: 1
  };

  it("returns null with no observation, no manifest or no artifacts block", () => {
    expect(toArtifactIntegrity({ manifest: MANIFEST }, [])).toBeNull();
    expect(toArtifactIntegrity({ manifest: null }, [observation])).toBeNull();
    expect(
      toArtifactIntegrity(
        { manifest: { ...MANIFEST, artifacts: undefined } as unknown as Manifest },
        [observation]
      )
    ).toBeNull();
  });

  it("the pane shows the designed pending state instead of a verdict", () => {
    const html = renderPane({ report: null });
    expect(html).not.toContain('data-testid="artifact-table"');
    expect(html).toContain('data-state="not-run"');
    expect(html).toContain('role="status"');
    expect(html).not.toContain('role="alert"');
  });

  it("a failing fetch fails loudly and records nothing", async () => {
    const recorder = createArtifactRecorder(() => Promise.reject(new Error("network is down")));
    await expect(recorder.fetch("registry.json")).rejects.toThrow("network is down");
    expect(recorder.list()).toHaveLength(0);
  });

  it("a retried path replaces its own record instead of stacking one", async () => {
    const recorder = createArtifactRecorder(diskFetch);
    await recorder.fetch("registry.json");
    const first = recorder.list()[0];
    await recorder.fetch("registry.json");
    expect(recorder.list()).toHaveLength(1);
    expect(recorder.list()[0].observedAtMs).toBeGreaterThanOrEqual(first.observedAtMs);
  });
});

describe("parity report — built from the shipped run, field by field (4)", () => {
  const report = toParityReport(SHIPPED_REPORT);

  it("copies the shipped identities, tolerances and counts", () => {
    expect(report.modelId).toBe(SHIPPED_REPORT.modelId);
    expect(report.fixtureId).toBe(SHIPPED_REPORT.fixtureSetId);
    expect(report.tolerance.probability).toBe(SHIPPED_REPORT.tolerance.probability);
    expect(report.tolerance.margin).toBe(SHIPPED_REPORT.tolerance.margin);
    expect(report.tolerance.attribution).toBe(SHIPPED_REPORT.tolerance.attribution);
    expect(report.tolerance.efficiency).toBe(SHIPPED_REPORT.tolerance.efficiency);
    expect(report.maxMarginDeviation).toBe(SHIPPED_REPORT.maxMarginDeviation);
    expect(report.fixtures).toEqual({
      total: SHIPPED_REPORT.total,
      passed: SHIPPED_REPORT.passed,
      failed: SHIPPED_REPORT.failed
    });
  });

  it("derives each check's status from its own numbers", () => {
    expect(report.checks.map((check) => check.name)).toEqual([
      "probability",
      "margin",
      "attribution",
      "efficiency"
    ]);
    for (const check of report.checks) {
      expect(check.passed, check.name).toBe(check.observed <= check.expected);
    }
    expect(report.checks.every((check) => check.passed)).toBe(true);
  });

  it("the pane shows the shipped identities and fixture counts", () => {
    const html = renderPane({ report });
    expect(html).toContain(SHIPPED_REPORT.modelId);
    expect(html).toContain(SHIPPED_REPORT.fixtureSetId);
    expect(html).toContain('data-testid="parity-fixtures"');
    expect(html).toContain("✓ Fixture pass/fail:");
    expect(html).toContain(
      `${SHIPPED_REPORT.passed} of ${SHIPPED_REPORT.total} fixtures within tolerance.`
    );
    expect(html).toContain('data-testid="parity-checks"');
    expect(html).toContain("✓ All reported checks are within tolerance.");
    expect(html).not.toContain('role="alert"');
  });
});

describe("parity run — the production engine over the shipped artifacts (5)", () => {
  it("verifies the shipped golden fixtures and matches the shipped report", () => {
    const engine = loadShippedEngine();
    const live = runFixtureVerification({ engine, artifacts: { fixtures: loadShippedFixtures() } });

    expect(live.modelId).toBe(SHIPPED_REPORT.modelId);
    expect(live.fixtureId).toBe(SHIPPED_REPORT.fixtureSetId);
    expect(live.fixtures).toEqual({
      total: SHIPPED_REPORT.total,
      passed: SHIPPED_REPORT.passed,
      failed: SHIPPED_REPORT.failed
    });
    expect(live.checks.every((check) => check.passed)).toBe(true);
    for (const check of live.checks) expect(check.observed).toBeLessThanOrEqual(check.expected);
  });

  it("runs once per engine and reuses the verified result", () => {
    const engine = loadShippedEngine();
    const input = { engine, artifacts: { fixtures: loadShippedFixtures() } };
    const first = runFixtureVerification(input);
    const second = runFixtureVerification(input);
    expect(second).toBe(first);
  });
});

describe("parity run state machine — idle, ready, designed error (6)", () => {
  it("stays idle when there is no booted bundle", () => {
    expect(paritySettle(null)).toEqual(PARITY_IDLE);
  });

  it("settles to the real report when the engine verifies", () => {
    const state = paritySettle({
      engine: loadShippedEngine(),
      artifacts: { fixtures: loadShippedFixtures() }
    });
    expect(state.status).toBe("ready");
    expect(state.error).toBeNull();
    expect(state.report).not.toBeNull();
    expect(state.report?.fixtures?.failed).toBe(0);
  });

  it("settles to a designed error, never a verdict, when verification cannot run", () => {
    const state = paritySettle({ engine: loadShippedEngine(), artifacts: { fixtures: {} } });
    expect(state.status).toBe("error");
    expect(state.report).toBeNull();
    expect(typeof state.error).toBe("string");
    expect((state.error ?? "").length).toBeGreaterThan(0);
  });

  it("reports the failure in the pane instead of a status", () => {
    const state = paritySettle({ engine: loadShippedEngine(), artifacts: { fixtures: {} } });
    const html = renderPane({ report: null, error: state.error });
    expect(html).toContain('data-testid="parity-error"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('data-state="run-failed"');
    expect(html).toContain("Fixture verification could not run in this browser.");
    expect(html).not.toContain('data-testid="parity-checks"');
    expect(html).not.toContain("✓");
    expect(html).not.toContain("✗");
  });
});

describe("pane types stay render-only (7)", () => {
  it("a row with an absent observation renders 'not observed', never a number", () => {
    const row: ArtifactIntegrityRow = {
      key: "fixtures",
      path: "fixtures/golden.json",
      declaredSha256: "0".repeat(64),
      observedSha256: null,
      declaredBytes: 3504052,
      observedBytes: null,
      observedAt: null,
      verified: false
    };
    const artifacts: ArtifactIntegrity = {
      bundleId: "sha256:bundle",
      modelId: "sha256:model",
      engineModelId: null,
      engineModelMatches: null,
      verifiedAt: null,
      rows: [row]
    };
    const html = renderPane({ artifacts });
    expect(html).toContain("— not observed");
    expect(html).toContain("3504052 / not observed");
    expect(html).toContain('role="status"');
    // An unobserved artifact is a designed absence banner, not a verdict.
    expect(html).toContain('role="alert"');
    expect(html).toContain("not observed while booting");
    expect(html).not.toContain("✓ verified");
    expect(html).not.toContain("NaN");
  });
});
