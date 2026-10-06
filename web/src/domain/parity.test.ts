/**
 * C-06 / P4-1 BLOCKING parity evidence — `tests/test_fixtures.py` mirrored in
 * TypeScript against the frozen corpus (`web/public/fixtures/golden.json`,
 * sha256-pinned by the manifest).
 *
 * Three layers of evidence, in order of strictness:
 *
 * 1. `verifyFixtures` recomputes every stored expectation through the engine's
 *    own encode -> evaluate -> explain path at the contract tolerances
 *    (probability 1e-5, margin 1e-5, attribution 1e-5, efficiency 1e-6) and
 *    writes `web/src/domain/parity-report.json` — the judge-visible artifact.
 * 2. The store-visible path: encode the fixture, issue real C-07 `execute`
 *    requests (evaluate + explain x4), assert envelope echo, payload numbers,
 *    and both failure fixtures' typed error responses.
 * 3. Mutation checks that prove the suite can fail: perturbed expectation,
 *    perturbed provision flags, tampered tolerance band.
 *
 * Latency is printed as MEASURED only — no threshold, no pass/fail claim
 * (AGENTS §7 law 16). Everything else here is blocking: a red assertion fails
 * `npm test`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Registry } from "../contracts/artifacts";
import { COMPUTE_PROTOCOL_VERSION } from "../contracts/compute";
import type { ComputeRequest } from "../contracts/compute";
import { DomainError } from "./errors";
import { attachFixtureSet, createCaseEncoder, loadEngine, verifyFixtures } from "./index";
import { CONTRACT_TARGETS } from "./model";

type GoldenFailure = { failure: { code: string; featureId: string } };

type GoldenTarget = {
  targetId: string;
  probability: number;
  calibratedMargin: number;
  thresholdProbability: number;
  decision: string;
  reliability: string;
  abstention: {
    lowerProbability: number;
    upperProbability: number;
    halfWidthMargin: number;
  };
};

type GoldenExplanation = {
  targetId: string;
  referenceMargin: number;
  outputMargin: number;
  efficiencyResidual: number;
  featureAttributions: Array<{
    featureId: string;
    value: number;
    contribution: number;
    direction: string;
  }>;
  displayGroups: Array<{ groupId: string; contribution: number; memberFeatureIds: string[] }>;
  modalityContributions: Array<{
    modalityId: string;
    contribution: number;
    memberFeatureIds: string[];
  }>;
  caveats: string[];
};

type GoldenNormal = {
  targets: Record<string, GoldenTarget>;
  headlineCad: {
    probability: number;
    valueSourceTargetId: string;
    decision: string;
    reliability: string;
    thresholdProbability: number;
  };
  rangeFlags: Record<string, boolean>;
  explanations: Record<string, GoldenExplanation>;
};

type GoldenFixture = {
  id: string;
  coverageTags: string[];
  input: {
    values: Record<string, unknown>;
    providedFeatures: Record<string, boolean>;
  };
  expected: GoldenFailure | GoldenNormal;
};

type Golden = {
  schemaVersion: string;
  tolerance: { probability: number; margin: number; attribution: number; efficiency: number };
  provenance: {
    modelId: string;
    dataSha256: string;
    generationSeed: number;
    oracleRevision: string;
    registryVersion: string;
    schemaVersion: string;
  };
  fixtures: GoldenFixture[];
};

const REQUIRED_TAGS = [
  "fully-observed",
  "blank",
  "modality-masked",
  "cumulative-stage",
  "multi-modality",
  "categorical-levels",
  "split-threshold",
  "float-rounding",
  "threshold-boundary",
  "abstention-edge",
  "vessel-above-CAD",
  "out-of-range",
  "observed-only",
  "finite-output-failure",
];

function readJson<T>(relativePath: string): T {
  const absolute = fileURLToPath(new URL(relativePath, import.meta.url));
  return JSON.parse(readFileSync(absolute, "utf8")) as T;
}

const registry = readJson<Registry>("../../public/registry.json");
const model = readJson<unknown>("../../public/model.json");
const golden = readJson<Golden>("../../public/fixtures/golden.json");

const engine = loadEngine({ model, registry });
attachFixtureSet(engine, golden);
const encoder = createCaseEncoder();

const normalFixtures = golden.fixtures.filter(
  (fixture) => !("failure" in fixture.expected),
) as Array<GoldenFixture & { expected: GoldenNormal }>;
const failureFixtures = golden.fixtures.filter((fixture) =>
  "failure" in fixture.expected,
) as Array<GoldenFixture & { expected: GoldenFailure }>;

const vectorSize = registry.features.length;

function encodeFixture(fixture: GoldenFixture): {
  featureVector: Float32Array;
  observedMask: Uint8Array;
} {
  return encoder({
    registry,
    values: fixture.input.values as Record<string, number | string>,
    providedFeatures: fixture.input.providedFeatures,
    providedModalities: {},
  });
}

function makeRequest(
  encoded: { featureVector: Float32Array; observedMask: Uint8Array },
  overrides: Partial<ComputeRequest>,
): ComputeRequest {
  return {
    protocolVersion: COMPUTE_PROTOCOL_VERSION,
    requestId: "parity",
    channel: "case",
    revision: 1,
    lane: "L2",
    operation: "evaluate",
    ...overrides,
    featureVector: encoded.featureVector,
    observedMask: encoded.observedMask,
  };
}

function must<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`response is missing ${label}`);
  return value;
}

function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * q;
  const base = Math.floor(position);
  const rest = position - base;
  const next = sorted[base + 1];
  return next === undefined ? sorted[base] : sorted[base] + rest * (next - sorted[base]);
}

function timed(run: (request: ComputeRequest) => unknown, request: ComputeRequest): number {
  const started = performance.now();
  run(request);
  return performance.now() - started;
}

describe("golden corpus parity (C-06 blocking)", () => {
  it("recomputes every stored expectation at the C-06 tolerances and writes the report artifact", () => {
    const report = verifyFixtures(engine);
    const failed = report.fixtures.filter((fixture) => !fixture.passed);

    const artifact = {
      artifact: "C-06 domain-engine parity report",
      generator: "web/src/domain/parity.test.ts",
      protocolVersion: COMPUTE_PROTOCOL_VERSION,
      fixtureSetId: report.fixtureSetId,
      modelId: report.modelId,
      tolerance: report.tolerance,
      total: report.total,
      passed: report.passed,
      failed: report.failed,
      maxProbabilityDeviation: report.maxProbabilityDeviation,
      maxMarginDeviation: report.maxMarginDeviation,
      maxAttributionDeviation: report.maxAttributionDeviation,
      maxEfficiencyResidual: report.maxEfficiencyResidual,
      fixtures: report.fixtures,
    };
    const reportPath = fileURLToPath(new URL("./parity-report.json", import.meta.url));
    writeFileSync(reportPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

    expect(failed.map((fixture) => fixture.fixtureId)).toEqual([]);
    expect(report.total).toBe(40);
    expect(report.passed).toBe(40);
    expect(report.failed).toBe(0);
    expect(report.tolerance).toEqual({
      probability: 1e-5,
      margin: 1e-5,
      attribution: 1e-5,
      efficiency: 1e-6,
    });
    expect(report.modelId).toBe(golden.provenance.modelId);
    expect(report.fixtureSetId).toBe("golden-1.0.0-1.0.0-seed606");
    expect(report.maxProbabilityDeviation).toBeLessThanOrEqual(golden.tolerance.probability);
    expect(report.maxMarginDeviation).toBeLessThanOrEqual(golden.tolerance.margin);
    expect(report.maxAttributionDeviation).toBeLessThanOrEqual(golden.tolerance.attribution);
    expect(report.maxEfficiencyResidual).toBeLessThanOrEqual(golden.tolerance.efficiency);
  });

  it("covers every required coverage class and both typed failure fixtures", () => {
    const tags = new Set(golden.fixtures.flatMap((fixture) => fixture.coverageTags));
    const missing = REQUIRED_TAGS.filter((tag) => !tags.has(tag));
    expect(missing).toEqual([]);
    expect(failureFixtures).toHaveLength(2);
    expect(failureFixtures.map((fixture) => fixture.expected.failure.code)).toEqual([
      "NONFINITE_INPUT",
      "NONFINITE_INPUT",
    ]);
    expect(normalFixtures).toHaveLength(38);
  });

  it("drives the store-visible encode -> execute path for every normal fixture", () => {
    for (const fixture of normalFixtures) {
      const encoded = encodeFixture(fixture);
      const requestId = `e2e-${fixture.id}`;

      const evaluationResponse = engine.execute(
        makeRequest(encoded, { requestId, operation: "evaluate" }),
      );
      expect(evaluationResponse.status).toBe("ok");
      expect(evaluationResponse.protocolVersion).toBe(COMPUTE_PROTOCOL_VERSION);
      expect(evaluationResponse.requestId).toBe(requestId);
      expect(evaluationResponse.channel).toBe("case");
      expect(evaluationResponse.revision).toBe(1);
      expect(evaluationResponse.operation).toBe("evaluate");
      const evaluation = must(evaluationResponse.evaluation, "evaluation");
      expect(evaluation.revision).toBe(1);
      expect(evaluation.observedFeatureIds).toEqual(
        registry.features
          .filter((feature) => fixture.input.providedFeatures[feature.id] === true)
          .map((feature) => feature.id),
      );

      for (const targetId of CONTRACT_TARGETS) {
        const fresh = evaluation.targets[targetId];
        const stored = fixture.expected.targets[targetId];
        expect(fresh.targetId).toBe(stored.targetId);
        expect(fresh.decision).toBe(stored.decision);
        expect(fresh.reliability).toBe(stored.reliability);
        expect(Math.abs(fresh.probability - stored.probability)).toBeLessThanOrEqual(
          golden.tolerance.probability,
        );
        expect(Math.abs(fresh.calibratedMargin - stored.calibratedMargin)).toBeLessThanOrEqual(
          golden.tolerance.margin,
        );
        expect(
          Math.abs(fresh.thresholdProbability - stored.thresholdProbability),
        ).toBeLessThanOrEqual(golden.tolerance.probability);
        expect(
          Math.abs(fresh.abstention.lowerProbability - stored.abstention.lowerProbability),
        ).toBeLessThanOrEqual(golden.tolerance.probability);
        expect(
          Math.abs(fresh.abstention.upperProbability - stored.abstention.upperProbability),
        ).toBeLessThanOrEqual(golden.tolerance.probability);

        const explanationResponse = engine.execute(
          makeRequest(encoded, { requestId, operation: "explain", targetId }),
        );
        expect(explanationResponse.status).toBe("ok");
        expect(explanationResponse.operation).toBe("explain");
        expect(explanationResponse.requestId).toBe(requestId);
        const explanation = must(explanationResponse.explanation, "explanation");
        const storedExplanation = fixture.expected.explanations[targetId];
        expect(explanation.targetId).toBe(targetId);
        expect(explanation.caveats).toEqual(storedExplanation.caveats);
        expect(Math.abs(explanation.efficiencyResidual)).toBeLessThanOrEqual(
          golden.tolerance.efficiency,
        );
        expect(
          Math.abs(explanation.referenceMargin - storedExplanation.referenceMargin),
        ).toBeLessThanOrEqual(golden.tolerance.margin);
        expect(
          Math.abs(explanation.outputMargin - storedExplanation.outputMargin),
        ).toBeLessThanOrEqual(golden.tolerance.margin);
        expect(explanation.measurements.length).toBe(explanation.featureAttributions.length);
        expect(explanation.narrative.templateId).toBeTruthy();
      }

      const headline = evaluation.headlineCad;
      const storedHeadline = fixture.expected.headlineCad;
      expect(headline.valueSourceTargetId).toBe(storedHeadline.valueSourceTargetId);
      expect(headline.decision).toBe(storedHeadline.decision);
      expect(headline.reliability).toBe(storedHeadline.reliability);
      expect(headline.decisionReferenceTargetId).toBe("CAD");
      expect(headline.decision).toBe(evaluation.targets.CAD.decision);
      expect(headline.explanationSourceTargetId).toBe(headline.valueSourceTargetId);
      expect(Math.abs(headline.probability - storedHeadline.probability)).toBeLessThanOrEqual(
        golden.tolerance.probability,
      );
      expect(Math.abs(headline.thresholdProbability - storedHeadline.thresholdProbability))
        .toBeLessThanOrEqual(golden.tolerance.probability);
    }
  });

  it("returns the contract failure codes at both the encoder and the response boundary", () => {
    for (const fixture of failureFixtures) {
      const stored = fixture.expected.failure;
      let caught: unknown = null;
      try {
        encodeFixture(fixture);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(DomainError);
      const domainError = caught as DomainError;
      expect(domainError.code).toBe(stored.code);
      expect(domainError.featureId).toBe(stored.featureId);

      const featureIndex = registry.features.findIndex((feature) => feature.id === stored.featureId);
      expect(featureIndex).toBeGreaterThanOrEqual(0);
      const featureVector = new Float32Array(vectorSize);
      const observedMask = new Uint8Array(vectorSize).fill(1);
      featureVector[featureIndex] = Number.NaN;
      const response = engine.execute(
        makeRequest(
          { featureVector, observedMask },
          { requestId: `failure-${fixture.id}`, operation: "evaluate" },
        ),
      );
      expect(response.status).toBe("error");
      expect(response.requestId).toBe(`failure-${fixture.id}`);
      expect(response.error?.code).toBe(stored.code);
      expect(response.error?.recoverable).toBe(true);
      expect(response.evaluation).toBeUndefined();
    }
  });

  it("emits cumulative stage evaluations for the ladder operation", () => {
    const fixture = normalFixtures[0];
    const encoded = encodeFixture(fixture);
    const response = engine.execute(
      makeRequest(encoded, { requestId: "ladder-001", operation: "ladder", lane: "L1" }),
    );
    expect(response.status).toBe("ok");
    const ladder = must(response.ladder, "ladder");
    const stageIds = [...registry.stages]
      .sort((left, right) => left.order - right.order)
      .map((stage) => stage.id);
    expect(Object.keys(ladder).sort()).toEqual([...stageIds].sort());

    let previousObserved = -1;
    for (const stageId of stageIds) {
      const evaluation = ladder[stageId];
      expect(evaluation).not.toBeNull();
      if (evaluation === null) continue;
      expect(evaluation.revision).toBe(1);
      expect(evaluation.observedFeatureIds.length).toBeGreaterThanOrEqual(previousObserved);
      previousObserved = evaluation.observedFeatureIds.length;
      for (const targetId of CONTRACT_TARGETS) {
        expect(Number.isFinite(evaluation.targets[targetId].probability)).toBe(true);
      }
    }
    const fullyObserved = registry.features.filter(
      (feature) => fixture.input.providedFeatures[feature.id] === true,
    ).length;
    expect(previousObserved).toBe(fullyObserved);
  });

  it("keeps the headline decision bound to CAD for every fixture (coherence rule)", () => {
    for (const fixture of normalFixtures) {
      const encoded = encodeFixture(fixture);
      const response = engine.execute(
        makeRequest(encoded, { requestId: `coherence-${fixture.id}`, operation: "evaluate" }),
      );
      const evaluation = must(response.evaluation, "evaluation");
      expect(evaluation.headlineCad.decision).toBe(evaluation.targets.CAD.decision);
      expect(evaluation.headlineCad.decisionReferenceTargetId).toBe("CAD");
      expect(evaluation.headlineCad.reliability).toBe(evaluation.targets.CAD.reliability);
      expect(["CAD", "LAD", "LCX", "RCA"]).toContain(
        evaluation.headlineCad.valueSourceTargetId,
      );
    }
  });

  it("fails when an expectation is perturbed (mutation check)", () => {
    const clone = structuredClone(golden) as Golden;
    const victim = clone.fixtures[0];
    expect("failure" in victim.expected).toBe(false);
    (victim.expected as GoldenNormal).targets.CAD.probability += 1e-3;
    const mutatedEngine = loadEngine({ model, registry });
    attachFixtureSet(mutatedEngine, clone);
    const report = verifyFixtures(mutatedEngine);
    expect(report.failed).toBeGreaterThanOrEqual(1);
    expect(report.fixtures.find((entry) => entry.fixtureId === victim.id)?.passed).toBe(false);
  });

  it("fails when the observed provision flags disagree (mutation check)", () => {
    const clone = structuredClone(golden) as Golden;
    const victim = clone.fixtures[0];
    expect("failure" in victim.expected).toBe(false);
    (victim.input.providedFeatures as Record<string, boolean>).Age = false;
    const mutatedEngine = loadEngine({ model, registry });
    attachFixtureSet(mutatedEngine, clone);
    const report = verifyFixtures(mutatedEngine);
    expect(report.fixtures.find((entry) => entry.fixtureId === victim.id)?.passed).toBe(false);
  });

  it("fails when a bound decision is flipped (coherence mutation check)", () => {
    const clone = structuredClone(golden) as Golden;
    const victim = clone.fixtures[0];
    expect("failure" in victim.expected).toBe(false);
    const stored = victim.expected as GoldenNormal;
    stored.targets.CAD.decision =
      stored.targets.CAD.decision === "above" ? "below" : "above";
    const mutatedEngine = loadEngine({ model, registry });
    attachFixtureSet(mutatedEngine, clone);
    const report = verifyFixtures(mutatedEngine);
    expect(report.fixtures.find((entry) => entry.fixtureId === victim.id)?.passed).toBe(false);
  });

  it("rejects a fixture set whose tolerance band is not the C-06 contract", () => {
    const clone = structuredClone(golden) as Golden;
    clone.tolerance.probability = 1e-3;
    const mutatedEngine = loadEngine({ model, registry });
    expect(() => attachFixtureSet(mutatedEngine, clone)).toThrow(/C-06/);
  });

  it("rejects a fixture set pinned to a different model identity", () => {
    const clone = structuredClone(golden) as Golden;
    clone.provenance.modelId = "sha256:0000000000000000000000000000000000000000000000000000000000000000";
    const mutatedEngine = loadEngine({ model, registry });
    expect(() => attachFixtureSet(mutatedEngine, clone)).toThrow(/modelId/);
  });

  it("prints MEASURED latency over the corpus (report only, no threshold)", () => {
    const evaluateMs: number[] = [];
    const explainMs: number[] = [];
    for (const fixture of normalFixtures) {
      const encoded = encodeFixture(fixture);
      evaluateMs.push(
        timed(
          (request) => engine.execute(request),
          makeRequest(encoded, { requestId: "perf-evaluate", operation: "evaluate" }),
        ),
      );
      for (const targetId of CONTRACT_TARGETS) {
        explainMs.push(
          timed(
            (request) => engine.execute(request),
            makeRequest(encoded, { requestId: "perf-explain", operation: "explain", targetId }),
          ),
        );
      }
    }
    expect(evaluateMs).toHaveLength(normalFixtures.length);
    expect(explainMs).toHaveLength(normalFixtures.length * CONTRACT_TARGETS.length);
    console.log(
      `[parity] MEASURED evaluate p50=${quantile(evaluateMs, 0.5).toFixed(2)}ms ` +
        `p95=${quantile(evaluateMs, 0.95).toFixed(2)}ms n=${evaluateMs.length}`,
    );
    console.log(
      `[parity] MEASURED explain p50=${quantile(explainMs, 0.5).toFixed(2)}ms ` +
        `p95=${quantile(explainMs, 0.95).toFixed(2)}ms n=${explainMs.length}`,
    );
  });
});
