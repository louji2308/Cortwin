/**
 * C-07 engine envelope + lifecycle — `worker/protocol.ts::validateRequest`
 * mirrored (the engine never trusts its caller), the honest `recoverable`
 * mapping, artifact-load rejection, the integrity operation, and determinism.
 *
 * Payload numbers are NOT re-asserted here; `parity.test.ts` owns the C-06
 * numeric evidence. This file owns protocol behaviour at the response
 * boundary — what the store actually sees.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Registry } from "../contracts/artifacts";
import { COMPUTE_PROTOCOL_VERSION } from "../contracts/compute";
import type { ComputeRequest } from "../contracts/compute";
import {
  attachFixtureSet,
  createCaseEncoder,
  loadEngine,
  verifyFixtures,
} from "./index";
import type { Engine } from "./index";

type Golden = {
  provenance: { modelId: string };
  fixtures: Array<{
    id: string;
    input: {
      values: Record<string, number | string>;
      providedFeatures: Record<string, boolean>;
    };
  }>;
};

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

const baseFixture = golden.fixtures[0];
const baseCase = encoder({
  registry,
  values: baseFixture.input.values,
  providedFeatures: baseFixture.input.providedFeatures,
  providedModalities: {},
});

function request(overrides: Partial<ComputeRequest> = {}): ComputeRequest {
  return {
    protocolVersion: COMPUTE_PROTOCOL_VERSION,
    requestId: "req-1",
    channel: "case",
    revision: 1,
    lane: "L2",
    operation: "evaluate",
    featureVector: baseCase.featureVector,
    observedMask: baseCase.observedMask,
    ...overrides,
  };
}

describe("C-07 envelope validation (mirror of worker validateRequest)", () => {
  it("rejects a non-object request without throwing", () => {
    const response = engine.execute(null as unknown as ComputeRequest);
    expect(response.status).toBe("error");
    expect(response.error).toEqual({
      code: "MALFORMED_REQUEST",
      message: "Compute request must be an object",
      recoverable: true,
    });
    expect(response.requestId).toBe("");
    expect(response.channel).toBe("case");
    expect(response.revision).toBe(0);
    expect(response.lane).toBe("L0");
    expect(response.operation).toBe("evaluate");
    expect(response.protocolVersion).toBe(COMPUTE_PROTOCOL_VERSION);
  });

  it("rejects a wrong protocol version", () => {
    const response = engine.execute(
      request({ protocolVersion: "0.9.0" as "1.0.0" }),
    );
    expect(response.status).toBe("error");
    expect(response.error?.code).toBe("MALFORMED_REQUEST");
    expect(response.error?.message).toBe(
      `Compute request protocol version must be ${COMPUTE_PROTOCOL_VERSION}`,
    );
    expect(response.error?.recoverable).toBe(true);
  });

  it("rejects an unknown operation with UNSUPPORTED_OPERATION and the fallback echo", () => {
    const response = engine.execute(
      request({ operation: "predict" as "evaluate" }),
    );
    expect(response.status).toBe("error");
    expect(response.error?.code).toBe("UNSUPPORTED_OPERATION");
    expect(response.error?.message).toBe("Compute request operation is not supported");
    expect(response.operation).toBe("evaluate");
  });

  it("falls back to contract-valid envelope fields for invalid framing", () => {
    const response = engine.execute(
      request({ channel: "bogus" as "case", lane: "L9" as "L2" }),
    );
    expect(response.status).toBe("error");
    expect(response.error?.code).toBe("MALFORMED_REQUEST");
    expect(response.channel).toBe("case");
    expect(response.lane).toBe("L0");
  });

  it("requires case-channel revisions to start at 1", () => {
    const zero = engine.execute(request({ revision: 0 }));
    expect(zero.status).toBe("error");
    expect(zero.error?.code).toBe("MALFORMED_REQUEST");
    expect(zero.error?.message).toBe("Case-channel revision must be 1 or higher");
    const negative = engine.execute(request({ revision: -2 }));
    expect(negative.status).toBe("error");
    expect(negative.error?.code).toBe("MALFORMED_REQUEST");
    const verificationZero = engine.execute(
      request({ channel: "verification", revision: 0 }),
    );
    expect(verificationZero.status).toBe("ok");
    expect(verificationZero.revision).toBe(0);
  });

  it("requires a targetId for explain", () => {
    const response = engine.execute(request({ operation: "explain" }));
    expect(response.status).toBe("error");
    expect(response.error?.code).toBe("MALFORMED_REQUEST");
    expect(response.error?.message).toBe(
      "Compute request explain operation requires a targetId",
    );
  });

  it("rejects an unknown targetId", () => {
    const response = engine.execute(
      request({ operation: "explain", targetId: "LEAD" as "CAD" }),
    );
    expect(response.status).toBe("error");
    expect(response.error?.code).toBe("MALFORMED_REQUEST");
    expect(response.error?.message).toBe(
      "Compute request targetId must be CAD, LAD, LCX or RCA",
    );
  });

  it("validates vector/mask types, lengths and mask values", () => {
    const wrongType = engine.execute(
      request({ featureVector: new Float64Array(54) as unknown as Float32Array }),
    );
    expect(wrongType.error?.code).toBe("MALFORMED_REQUEST");

    const short = engine.execute(
      request({ featureVector: new Float32Array(10), observedMask: new Uint8Array(10) }),
    );
    expect(short.status).toBe("error");
    expect(short.error?.code).toBe("INVALID_FEATURE_VECTOR");

    const badMask = new Uint8Array(registry.features.length).fill(1);
    badMask[3] = 2;
    const maskResponse = engine.execute(
      request({ featureVector: new Float32Array(registry.features.length), observedMask: badMask }),
    );
    expect(maskResponse.error?.code).toBe("INVALID_FEATURE_VECTOR");
    expect(maskResponse.error?.recoverable).toBe(true);
  });

  it("rejects non-finite observed values with a patient-free message", () => {
    const vector = new Float32Array(registry.features.length);
    vector[7] = Number.NaN;
    const mask = new Uint8Array(registry.features.length).fill(1);
    const response = engine.execute(request({ featureVector: vector, observedMask: mask }));
    expect(response.status).toBe("error");
    expect(response.error).toEqual({
      code: "NONFINITE_INPUT",
      message: "Observed feature values must be finite",
      recoverable: true,
    });
    expect(response.evaluation).toBeUndefined();
  });

  it("echoes valid framing exactly and returns the explain payload", () => {
    const response = engine.execute(
      request({ requestId: "echo-42", operation: "explain", targetId: "RCA", lane: "L0" }),
    );
    expect(response.status).toBe("ok");
    expect(response.requestId).toBe("echo-42");
    expect(response.operation).toBe("explain");
    expect(response.lane).toBe("L0");
    expect(response.protocolVersion).toBe(COMPUTE_PROTOCOL_VERSION);
    expect(response.explanation?.targetId).toBe("RCA");
  });
});

describe("artifact loading", () => {
  it("rejects a model document with no metadata block", () => {
    let caught: unknown = null;
    try {
      loadEngine({ model: { nothing: true }, registry });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as { code?: string }).code).toBe("ARTIFACT_INVALID");
  });

  it("rejects a model whose feature order differs from the registry", () => {
    const clone = JSON.parse(JSON.stringify(model)) as { features: string[] };
    clone.features.reverse();
    expect(() => loadEngine({ model: clone, registry })).toThrow(/feature order/);
  });

  it("exposes the bundle modelId on the engine", () => {
    expect(engine.modelId).toBe(golden.provenance.modelId);
    expect(engine.modelId).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe("integrity operation", () => {
  it("reports the full corpus through the response boundary", () => {
    const response = engine.execute(
      request({ channel: "verification", revision: 0, operation: "integrity", lane: "L3" }),
    );
    expect(response.status).toBe("ok");
    const integrity = response.integrity;
    expect(integrity).toBeDefined();
    if (integrity === undefined) return;
    expect(integrity.fixtures).toHaveLength(40);
    expect(integrity.fixtures.every((fixture) => fixture.passed)).toBe(true);
    expect(integrity.modelId).toBe(golden.provenance.modelId);
    expect(integrity.fixtureSetId).toBe("golden-1.0.0-1.0.0-seed606");
    expect(integrity.tolerance).toEqual({
      probability: 1e-5,
      margin: 1e-5,
      attribution: 1e-5,
      efficiency: 1e-6,
    });
    expect(integrity.maxProbabilityDeviation).toBeLessThanOrEqual(1e-5);
    expect(integrity.maxEfficiencyResidual).toBeLessThanOrEqual(1e-6);
  });

  it("supports a single-fixture verification request", () => {
    const response = engine.execute(
      request({
        channel: "verification",
        revision: 0,
        operation: "integrity",
        verificationFixtureId: "fixture-014",
      }),
    );
    expect(response.status).toBe("ok");
    expect(response.integrity?.fixtures).toEqual([
      { fixtureId: "fixture-014", passed: true },
    ]);
  });

  it("rejects an unknown verification fixture id", () => {
    const response = engine.execute(
      request({
        channel: "verification",
        revision: 0,
        operation: "integrity",
        verificationFixtureId: "fixture-999",
      }),
    );
    expect(response.status).toBe("error");
    expect(response.error?.code).toBe("MALFORMED_REQUEST");
  });

  it("fails closed with ARTIFACT_INVALID when no corpus is attached", () => {
    const bare: Engine = loadEngine({ model, registry });
    const response = bare.execute(
      request({ channel: "verification", revision: 0, operation: "integrity" }),
    );
    expect(response.status).toBe("error");
    expect(response.error?.code).toBe("ARTIFACT_INVALID");
    expect(response.error?.recoverable).toBe(false);
    expect(() => verifyFixtures(bare)).toThrow(/fixtures/i);
  });
});

describe("determinism", () => {
  /** Payload only — `timing.computeMs` is diagnostic and varies by design. */
  function payloadOf(response: ReturnType<Engine["execute"]>): string {
    const clone = { ...response };
    delete clone.timing;
    return JSON.stringify(clone);
  }

  it("produces byte-identical payloads for repeated identical requests", () => {
    const first = engine.execute(request({ requestId: "det-1" }));
    const second = engine.execute(request({ requestId: "det-1" }));
    expect(payloadOf(first)).toBe(payloadOf(second));
    const explainFirst = engine.execute(
      request({ requestId: "det-2", operation: "explain", targetId: "LAD" }),
    );
    const explainSecond = engine.execute(
      request({ requestId: "det-2", operation: "explain", targetId: "LAD" }),
    );
    expect(payloadOf(explainFirst)).toBe(payloadOf(explainSecond));
  });

  it("never puts a non-finite number on an ok response", () => {
    const response = engine.execute(request());
    expect(response.status).toBe("ok");
    const evaluation = response.evaluation;
    expect(evaluation).toBeDefined();
    if (evaluation === undefined) return;
    for (const targetId of ["CAD", "LAD", "LCX", "RCA"] as const) {
      const target = evaluation.targets[targetId];
      expect(Number.isFinite(target.probability)).toBe(true);
      expect(target.probability).toBeGreaterThanOrEqual(0);
      expect(target.probability).toBeLessThanOrEqual(1);
      expect(Number.isFinite(target.calibratedMargin)).toBe(true);
      expect(Number.isFinite(target.abstention.lowerProbability)).toBe(true);
      expect(Number.isFinite(target.abstention.upperProbability)).toBe(true);
    }
  });
});
