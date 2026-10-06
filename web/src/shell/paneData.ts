import { ARTIFACT_KEYS } from "../boot/manifest";
import { defaultFetchArtifact, sha256Hex, type FetchArtifact } from "../boot/verify";
import type { Manifest, Results } from "../contracts";
import { attachFixtureSet, verifyFixtures, type Engine } from "../domain";
import type {
  ArtifactIntegrity,
  ArtifactIntegrityRow,
  ArchitectureFact,
  ParityCheck,
  ParityReport,
  ParityTolerance
} from "../system";
import { TARGET_IDS, type LeakageProbeResult, type TrustResults } from "../validation";

function flattenLeakageLab(results: Results): TrustResults["leakageLab"] {
  const lab = results.leakageLab;
  if (lab === undefined) return undefined;
  const probes: LeakageProbeResult[] = [];
  for (const probe of lab.probes) {
    for (const targetId of TARGET_IDS) {
      const metrics = probe.metrics[targetId];
      if (metrics === undefined) continue;
      for (const [metricName, metricValue] of Object.entries(metrics)) {
        probes.push({
          probeId: `${probe.id}:${targetId}:${metricName}`,
          label: probe.label,
          sourceType: "probe model",
          targetId,
          metricName,
          metricValue,
          note: probe.note ?? null
        });
      }
    }
  }
  return { probes, excludedColumns: lab.excludedColumns };
}

export function toTrustResults(results: Results | null): TrustResults | null {
  if (results === null) return null;
  return {
    schemaVersion: results.schemaVersion,
    protocol: results.protocol,
    performance: results.performance,
    calibration: results.calibration,
    decisions: results.decisions,
    subgroups: results.subgroups,
    evidenceLadder: results.evidenceLadder,
    leakageLab: flattenLeakageLab(results),
    reliability: results.reliability,
    provenance: results.provenance
  };
}

export function manifestFacts(
  manifest: Manifest | null | undefined
): ArchitectureFact[] | null {
  if (manifest === null || manifest === undefined) return null;
  return [
    { label: "App version", detail: manifest.appVersion, source: "C-01 manifest" },
    { label: "Bundle id", detail: manifest.bundleId, source: "C-01 manifest" },
    { label: "Model id", detail: manifest.modelId, source: "C-01 manifest" },
    {
      label: "Data SHA-256",
      detail: manifest.provenance.dataSha256,
      source: "C-01 manifest provenance"
    },
    {
      label: "Source revision",
      detail: manifest.provenance.sourceRevision,
      source: "C-01 manifest provenance"
    }
  ];
}

/**
 * One artifact observation: the digest this browser computed over the exact
 * bytes a fetch returned, with the instant it happened. Observations are made
 * by wrapping the boot fetch (Option A) so nothing is re-downloaded, no new
 * request ever appears on the network, and the bytes hashed are the bytes the
 * boot itself verified (C-01 §5.1, AGENTS §8).
 */
export type ArtifactObservation = {
  path: string;
  sha256: string;
  sizeBytes: number;
  observedAtMs: number;
};

export type ArtifactRecorder = {
  /** Drop-in `fetchArtifact` for `BootOptions.fetchArtifact`. */
  fetch: FetchArtifact;
  /** Latest observation per path (a retried boot overwrites its own record). */
  list(): readonly ArtifactObservation[];
};

/**
 * Records what the boot already fetches. Errors from the inner fetch pass
 * through untouched, so boot behaviour (typed failures, request count, G6
 * ladder) is unchanged; only the successful path adds a record.
 */
export function createArtifactRecorder(
  fetchArtifact: FetchArtifact = defaultFetchArtifact
): ArtifactRecorder {
  const byPath = new Map<string, ArtifactObservation>();
  const fetch: FetchArtifact = async (path: string) => {
    const bytes = await fetchArtifact(path);
    const sha256 = await sha256Hex(bytes);
    byPath.set(path, {
      path,
      sha256,
      sizeBytes: bytes.byteLength,
      observedAtMs: Date.now()
    });
    return bytes;
  };
  return { fetch, list: () => [...byPath.values()] };
}

/**
 * Join declared (manifest) values with observed (boot fetch) values into the
 * Integrity pane's hash-chain rows, in manifest order. Returns `null` when
 * there is nothing to show — a manifest without an `artifacts` block or a
 * session with no observation is a designed absence, never an all-clear.
 */
export function toArtifactIntegrity(
  input: { manifest: Manifest | null | undefined; engineModelId?: string | null },
  observations: readonly ArtifactObservation[]
): ArtifactIntegrity | null {
  const manifest = input.manifest;
  if (manifest === null || manifest === undefined) return null;
  if (observations.length === 0) return null;

  const byPath = new Map<string, ArtifactObservation>();
  for (const observation of observations) byPath.set(observation.path, observation);

  const rows: ArtifactIntegrityRow[] = [];
  for (const key of ARTIFACT_KEYS) {
    const ref = manifest.artifacts?.[key];
    if (ref === undefined) continue;
    const observation = byPath.get(ref.path) ?? null;
    const declaredSha256 = ref.sha256.toLowerCase();
    rows.push({
      key,
      path: ref.path,
      declaredSha256,
      observedSha256: observation === null ? null : observation.sha256,
      declaredBytes: ref.sizeBytes,
      observedBytes: observation === null ? null : observation.sizeBytes,
      observedAt:
        observation === null ? null : new Date(observation.observedAtMs).toISOString(),
      verified:
        observation !== null &&
        observation.sha256 === declaredSha256 &&
        observation.sizeBytes === ref.sizeBytes
    });
  }
  if (rows.length === 0) return null;

  const engineModelId =
    typeof input.engineModelId === "string" && input.engineModelId.length > 0
      ? input.engineModelId
      : null;
  let latest = Number.NEGATIVE_INFINITY;
  for (const observation of observations) {
    latest = Math.max(latest, observation.observedAtMs);
  }

  return {
    bundleId: manifest.bundleId,
    modelId: manifest.modelId,
    engineModelId,
    engineModelMatches:
      engineModelId === null ? null : engineModelId === manifest.modelId,
    verifiedAt: Number.isFinite(latest) ? new Date(latest).toISOString() : null,
    rows
  };
}

/** What `verifyFixtures` reports — kept structural so no second schema exists. */
type DomainParityReport = ReturnType<typeof verifyFixtures>;

/** The Integrity pane's projection of a run (Contracts §9, L429). */
function parityCheck(name: string, observed: number, expected: number): ParityCheck {
  return { name, observed, expected, passed: observed <= expected };
}

/**
 * Map a real in-browser verification run onto the pane's report shape. Every
 * number is copied from the run; `passed` is derived, never carried over.
 */
export function toParityReport(report: DomainParityReport): ParityReport {
  const tolerance: ParityTolerance = { ...report.tolerance };
  const checks: ParityCheck[] = [
    parityCheck("probability", report.maxProbabilityDeviation, report.tolerance.probability),
    parityCheck("margin", report.maxMarginDeviation, report.tolerance.margin),
    parityCheck("attribution", report.maxAttributionDeviation, report.tolerance.attribution),
    parityCheck("efficiency", report.maxEfficiencyResidual, report.tolerance.efficiency)
  ];
  return {
    modelId: report.modelId,
    fixtureId: report.fixtureSetId,
    tolerance,
    checks,
    maxMarginDeviation: report.maxMarginDeviation,
    fixtures: {
      total: report.total,
      passed: report.passed,
      failed: report.failed
    }
  };
}

/** Everything a run needs from a booted bundle, and nothing else. */
export type FixtureRunInput = {
  engine: Engine;
  artifacts: { fixtures: unknown };
};

const parityByEngine = new WeakMap<Engine, ParityReport>();

/**
 * Run the C-06 fixture verification against the booted engine, once per
 * engine (the result is cached, the engine is not mutated). Throws the
 * domain's typed error when the bundle carries no fixture set — callers turn
 * that into a designed failure state, never into a verdict.
 */
export function runFixtureVerification(input: FixtureRunInput): ParityReport {
  const cached = parityByEngine.get(input.engine);
  if (cached !== undefined) return cached;
  attachFixtureSet(input.engine, input.artifacts.fixtures);
  const report = toParityReport(verifyFixtures(input.engine));
  parityByEngine.set(input.engine, report);
  return report;
}

/** Presentation state of the in-browser run — one truth, no side effects. */
export type ParityRunState = {
  status: "idle" | "running" | "ready" | "error";
  report: ParityReport | null;
  /** Plain-language detail for the designed failure state; null otherwise. */
  error: string | null;
};

export const PARITY_IDLE: ParityRunState = { status: "idle", report: null, error: null };

export function parityRunning(): ParityRunState {
  return { status: "running", report: null, error: null };
}

/**
 * Settle a run: a real report when the engine verifies, a designed error
 * state when it cannot, and the untouched idle state when there is no booted
 * bundle to verify. Never throws, never invents a result.
 */
export function paritySettle(input: FixtureRunInput | null): ParityRunState {
  if (input === null) return PARITY_IDLE;
  try {
    return { status: "ready", report: runFixtureVerification(input), error: null };
  } catch (cause) {
    const detail =
      cause instanceof Error && cause.message.trim().length > 0
        ? cause.message
        : "The browser reported no further detail.";
    return { status: "error", report: null, error: detail };
  }
}
