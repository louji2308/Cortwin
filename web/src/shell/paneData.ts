import { ARTIFACT_KEYS } from "../boot/manifest";
import { defaultFetchArtifact, sha256Hex, type FetchArtifact } from "../boot/verify";
import type { Manifest, ModelMetadata, Results } from "../contracts";
import { attachFixtureSet, verifyFixtures, type Engine } from "../domain";
import {
  MODEL_CARD_AI_USE,
  MODEL_CARD_ATTRIBUTION_CAVEATS,
  MODEL_CARD_LIMITATIONS
} from "../system/modelCardData";
import type {
  ArtifactIntegrity,
  ArtifactIntegrityRow,
  ArchitectureFact,
  ModelCardData,
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
    provenance: results.provenance,
    globalImportance: results.globalImportance,
    globalImportanceMeta: results.globalImportanceMeta
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

/** Shorten a sha256 string for compact display without inventing identity. */
function shortSha(value: string): string {
  return value.length > 19 ? `${value.slice(0, 19)}…` : value;
}

/**
 * One licence/attribution line per manifest entry (C-15 §10.2). The shipped
 * manifest carries `{title, licence, credits, status}` while the C-01 type
 * names `{source, licence, attribution, modificationStatus}` — both shapes
 * are read defensively (the boot passes the runtime manifest through) so
 * either produces a credit and neither invents one. Missing strings are
 * skipped so a sparse entry degrades instead of fabricating a licence.
 */
function attributionLine(entry: Manifest["attributions"][number]): string {
  const record = entry as unknown as Record<string, unknown>;
  const text = (key: string): string => {
    const value = record[key];
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
  };
  const creditsRaw = record["credits"];
  const credits = Array.isArray(creditsRaw)
    ? creditsRaw.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const source = text("title") || text("source");
  const licence = text("licence");
  const attribution = credits.length > 0 ? credits.join("; ") : text("attribution");
  const status = text("status") || text("modificationStatus");
  const parts: string[] = [];
  if (source.length > 0) parts.push(source);
  if (licence.length > 0) parts.push(`licence ${licence}`);
  if (attribution.length > 0) parts.push(attribution);
  if (status.length > 0) parts.push(status);
  return parts.join(" — ");
}

/**
 * System → Model card projection (Contracts §9 L432). Identity, schema,
 * provenance, protocol and artifact identity are copied from the verified
 * artifacts; limitations, attribution caveats and the AI-use line are the
 * frozen prose of `system/modelCardData`. `null` only when no manifest exists
 * (designed empty state) — a missing `results` degrades individual fields to
 * "" so the pane reads "Not provided", never a fabricated protocol.
 */
export function toModelCard(input: {
  manifest: Manifest | null | undefined;
  modelMetadata?: ModelMetadata | null;
  results?: Results | null;
}): ModelCardData | null {
  const manifest = input.manifest;
  if (manifest === null || manifest === undefined) return null;

  const metadata = input.modelMetadata ?? null;
  const results = input.results ?? null;
  const protocol = results?.protocol ?? null;

  const modelIdentity =
    metadata === null
      ? `Model ${shortSha(manifest.modelId)} (app ${manifest.appVersion})`
      : `${metadata.modelFamily} · ${metadata.targets.join("/")} · model ${shortSha(
          manifest.modelId
        )} · app ${manifest.appVersion}`;

  const schemaIdentity =
    metadata === null
      ? ""
      : `${metadata.featureCount} model features · schema ${metadata.schemaVersion}`;

  const provenance = manifest.provenance;
  const toolVersions: Record<string, string> = provenance?.toolVersions ?? {};
  const toolchain = Object.entries(toolVersions)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, version]) => `${name} ${version}`)
    .join(", ");
  const datasetProvenance =
    `UCI Extension of Z-Alizadeh Sani · data sha256 ${provenance?.dataSha256 ?? ""}` +
    ` · source revision ${provenance?.sourceRevision ?? ""}` +
    (toolchain.length > 0 ? ` · toolchain ${toolchain}` : "");

  const validationProtocol =
    protocol === null
      ? ""
      : `${protocol.outerFolds}-fold outer × ${protocol.outerRepeats} repeats, ` +
        `${protocol.innerFolds}-fold inner · stratified on ${protocol.stratification} · ` +
        `preprocessing/calibration/threshold/abstention inside fold: ` +
        `${protocol.preprocessingInsideFold}/${protocol.calibrationInsideFold}/` +
        `${protocol.thresholdInsideFold}/${protocol.abstentionInsideFold} · ` +
        `SMOTE: ${protocol.noSmote ? "none" : "applied"} · ${protocol.ciMethod}`;

  const limitedTargets =
    results === null
      ? []
      : TARGET_IDS.filter((id) => results.reliability?.targets?.[id]?.tier === "limited");
  const limitations =
    limitedTargets.length > 0
      ? [...MODEL_CARD_LIMITATIONS, `Reliability tier "limited" for: ${limitedTargets.join(", ")}.`]
      : [...MODEL_CARD_LIMITATIONS];

  const attributions = Array.isArray(manifest.attributions) ? manifest.attributions : [];
  const licenceParts = attributions.map(attributionLine).filter((line) => line.length > 0);
  const licenceAttribution = licenceParts.length > 0 ? licenceParts.join(" · ") : "";

  const artifacts: Partial<Record<string, { sha256: string; sizeBytes: number }>> =
    manifest.artifacts ?? {};
  const artifactParts = [
    `bundle ${shortSha(manifest.bundleId)}`,
    `model ${shortSha(manifest.modelId)}`,
    ...(["registry", "model", "results", "structures"] as const)
      .map((key) => {
        const ref = artifacts[key];
        return ref === undefined ? null : `${key} ${shortSha(ref.sha256)} (${ref.sizeBytes} B)`;
      })
      .filter((part): part is string => part !== null)
  ];
  const artifactIdentity = artifactParts.join(" · ");

  return {
    modelIdentity,
    schemaIdentity,
    datasetProvenance,
    validationProtocol,
    limitations,
    attributionCaveats: [...MODEL_CARD_ATTRIBUTION_CAVEATS],
    licenceAttribution,
    aiUseDisclosure: MODEL_CARD_AI_USE,
    artifactIdentity
  };
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
