import { describe, expect, it } from "vitest";
import {
  COMPUTE_ERROR_CODES,
  COMPUTE_PROTOCOL_VERSION,
  type ComputeError,
  type ComputeRequest,
} from "../contracts";
import {
  computeError,
  echoEnvelope,
  errorResponse,
  isComputeErrorCode,
  normalizeEngineResponse,
  validateRequest,
} from "./protocol";

function makeRequest(overrides: Partial<ComputeRequest> = {}): ComputeRequest {
  return {
    protocolVersion: COMPUTE_PROTOCOL_VERSION,
    requestId: "ct-1",
    channel: "case",
    revision: 1,
    lane: "L0",
    operation: "evaluate",
    featureVector: new Float32Array([62, 1, 0, 80.5]),
    observedMask: new Uint8Array([1, 1, 1, 1]),
    ...overrides,
  };
}

function expectInvalid(request: unknown, code: ComputeError["code"], featureCount?: number): ComputeError {
  const outcome = validateRequest(request, featureCount === undefined ? {} : { featureCount });
  expect(outcome.ok).toBe(false);
  if (outcome.ok) throw new Error("unreachable");
  expect(outcome.error.code).toBe(code);
  return outcome.error;
}

describe("C-07 request validation — closed enums, typed errors", () => {
  it("accepts a well-formed request", () => {
    expect(validateRequest(makeRequest(), { featureCount: 4 }).ok).toBe(true);
    expect(validateRequest(makeRequest()).ok).toBe(true);
  });

  it("rejects non-objects", () => {
    expectInvalid(null, "MALFORMED_REQUEST");
    expectInvalid(undefined, "MALFORMED_REQUEST");
    expectInvalid("ct-request", "MALFORMED_REQUEST");
    expectInvalid(42, "MALFORMED_REQUEST");
  });

  it("requires protocolVersion to be exactly 1.0.0", () => {
    expectInvalid(makeRequest({ protocolVersion: "9.9.9" as "1.0.0" }), "MALFORMED_REQUEST");
    expectInvalid(makeRequest({ protocolVersion: undefined as unknown as "1.0.0" }), "MALFORMED_REQUEST");
    expectInvalid(makeRequest({ protocolVersion: "1.0" as "1.0.0" }), "MALFORMED_REQUEST");
  });

  it("requires a non-empty string requestId", () => {
    expectInvalid(makeRequest({ requestId: "" }), "MALFORMED_REQUEST");
    expectInvalid(makeRequest({ requestId: undefined as unknown as string }), "MALFORMED_REQUEST");
    expectInvalid(makeRequest({ requestId: 7 as unknown as string }), "MALFORMED_REQUEST");
  });

  it("requires channel and lane to be closed-enum values", () => {
    expectInvalid(makeRequest({ channel: "live" as "case" }), "MALFORMED_REQUEST");
    expectInvalid(makeRequest({ lane: "L4" as "L3" }), "MALFORMED_REQUEST");
    expectInvalid(makeRequest({ lane: undefined as unknown as "L0" }), "MALFORMED_REQUEST");
  });

  it("requires an integer revision; case channel starts at 1", () => {
    expectInvalid(makeRequest({ revision: 0 }), "MALFORMED_REQUEST");
    expectInvalid(makeRequest({ revision: -3 }), "MALFORMED_REQUEST");
    expectInvalid(makeRequest({ revision: 1.5 }), "MALFORMED_REQUEST");
    expectInvalid(makeRequest({ revision: Number.NaN }), "MALFORMED_REQUEST");
    expectInvalid(makeRequest({ revision: Number.POSITIVE_INFINITY }), "MALFORMED_REQUEST");
    expect(validateRequest(makeRequest({ channel: "verification", revision: 0 })).ok).toBe(true);
  });

  it("maps an unknown operation to UNSUPPORTED_OPERATION", () => {
    const error = expectInvalid(
      makeRequest({ operation: "predict" as "evaluate" }),
      "UNSUPPORTED_OPERATION"
    );
    expect(error.recoverable).toBe(true);
  });

  it("requires a valid targetId, and one on explain", () => {
    expectInvalid(makeRequest({ targetId: "XYZ" as "LAD" }), "MALFORMED_REQUEST");
    expectInvalid(makeRequest({ operation: "explain", lane: "L1" }), "MALFORMED_REQUEST");
    expect(
      validateRequest(
        makeRequest({ operation: "explain", lane: "L1", targetId: "LAD" }),
        { featureCount: 4 }
      ).ok
    ).toBe(true);
  });

  it("requires Float32Array / Uint8Array payload types", () => {
    expectInvalid(
      makeRequest({ featureVector: [62, 1, 0, 80] as unknown as Float32Array }),
      "MALFORMED_REQUEST"
    );
    expectInvalid(
      makeRequest({ observedMask: [1, 1, 1, 1] as unknown as Uint8Array }),
      "MALFORMED_REQUEST"
    );
  });

  it("requires equal, non-empty, registry-matching lengths", () => {
    expectInvalid(
      makeRequest({ observedMask: new Uint8Array([1, 1]) }),
      "INVALID_FEATURE_VECTOR"
    );
    expectInvalid(
      makeRequest({ featureVector: new Float32Array(0), observedMask: new Uint8Array(0) }),
      "INVALID_FEATURE_VECTOR"
    );
    expectInvalid(makeRequest(), "INVALID_FEATURE_VECTOR", 54);
  });

  it("requires mask values of 0 or 1", () => {
    expectInvalid(
      makeRequest({ observedMask: new Uint8Array([1, 2, 1, 1]) }),
      "INVALID_FEATURE_VECTOR"
    );
  });

  it("rejects non-finite values only at observed positions", () => {
    expectInvalid(
      makeRequest({ featureVector: new Float32Array([Number.NaN, 1, 0, 80.5]) }),
      "NONFINITE_INPUT"
    );
    expectInvalid(
      makeRequest({ featureVector: new Float32Array([Number.POSITIVE_INFINITY, 1, 0, 80.5]) }),
      "NONFINITE_INPUT"
    );
    const unobserved = validateRequest(
      makeRequest({
        featureVector: new Float32Array([Number.NaN, 1, 0, 80.5]),
        observedMask: new Uint8Array([0, 1, 1, 1]),
      }),
      { featureCount: 4 }
    );
    expect(unobserved.ok).toBe(true);
  });
});

describe("C-07 error hygiene — messages never carry request content", () => {
  it("never echoes patient-like values or the vector into any error message", () => {
    const sensitiveValues = ["98765.4321", "-12345.6789", "42.4242", "77.25"];
    const vector = new Float32Array([98765.4321, -12345.6789, 42.4242, 77.25]);
    const requests: unknown[] = [
      null,
      "not-an-object",
      makeRequest({ protocolVersion: "9.9.9" as "1.0.0" }),
      makeRequest({ requestId: "" }),
      makeRequest({ channel: "live" as "case" }),
      makeRequest({ revision: Number.NaN }),
      makeRequest({ lane: "L9" as "L3" }),
      makeRequest({ operation: "predict" as "evaluate" }),
      makeRequest({ targetId: "SENSITIVE-ID" as "LAD" }),
      makeRequest({ operation: "explain", lane: "L1" }),
      makeRequest({ featureVector: vector, observedMask: new Uint8Array([1, 2, 1, 1]) }),
      makeRequest({ featureVector: vector, observedMask: new Uint8Array([1, 1]) }),
      makeRequest({
        featureVector: new Float32Array([98765.4321, Number.NaN, 0, 0]),
        observedMask: new Uint8Array([1, 1, 1, 1]),
      }),
      makeRequest({ featureVector: [1, 2, 3, 4] as unknown as Float32Array }),
    ];

    const messages: string[] = [];
    for (const request of requests) {
      const outcome = validateRequest(request, { featureCount: 4 });
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) messages.push(outcome.error.message);
    }
    expect(messages.length).toBe(requests.length);

    const serialized = JSON.stringify(messages);
    const forbidden = [...sensitiveValues, ...[...vector].map((value) => String(value))];
    for (const value of forbidden) {
      expect(serialized).not.toContain(value);
    }
    expect(serialized).not.toContain(JSON.stringify([...vector]));
    for (const message of messages) {
      expect(message.length).toBeLessThanOrEqual(200);
      expect(message.trim().length).toBeGreaterThan(0);
    }
    // The observed-position rule fires without quoting the offending value:
    const nonfinite = validateRequest(
      makeRequest({ featureVector: new Float32Array([Number.NaN, 1, 0, 80.5]) }),
      { featureCount: 4 }
    );
    expect(nonfinite.ok).toBe(false);
    if (!nonfinite.ok) expect(nonfinite.error.message).toBe("Observed feature values must be finite");
  });

  it("produces fixed strings for every validation class", () => {
    const seen = new Set<string>();
    const collect = (request: unknown): void => {
      const outcome = validateRequest(request, { featureCount: 4 });
      if (!outcome.ok) seen.add(outcome.error.message);
    };
    collect(null);
    collect(makeRequest({ protocolVersion: "0.0.1" as "1.0.0" }));
    collect(makeRequest({ channel: "x" as "case" }));
    collect(makeRequest({ lane: "x" as "L0" }));
    collect(makeRequest({ operation: "x" as "evaluate" }));
    collect(makeRequest({ observedMask: new Uint8Array([1, 1]) }));
    collect(makeRequest({ observedMask: new Uint8Array([3, 1, 1, 1]) }));
    collect(makeRequest({ featureVector: new Float32Array([Number.NaN, 1, 0, 80.5]) }));
    expect(seen.size).toBe(8);
  });
});

describe("recoverable mapping — honest flags", () => {
  it("maps every runtime-generated code to its documented flag", () => {
    expect(computeError("MALFORMED_REQUEST", "x").recoverable).toBe(true);
    expect(computeError("UNSUPPORTED_OPERATION", "x").recoverable).toBe(true);
    expect(computeError("INVALID_FEATURE_VECTOR", "x").recoverable).toBe(true);
    expect(computeError("NONFINITE_INPUT", "x").recoverable).toBe(true);
    expect(computeError("ARTIFACT_INVALID", "x").recoverable).toBe(false);
    expect(computeError("INTERNAL_COMPUTE_FAILURE", "x").recoverable).toBe(false);
  });

  it("recognizes exactly the closed vocabulary", () => {
    for (const code of COMPUTE_ERROR_CODES) expect(isComputeErrorCode(code)).toBe(true);
    expect(isComputeErrorCode("NOT_A_CODE")).toBe(false);
    expect(isComputeErrorCode(7)).toBe(false);
    expect(isComputeErrorCode(undefined)).toBe(false);
  });
});

describe("response envelope — echo and normalization", () => {
  it("echoes requestId, revision, channel, lane and operation from the request", () => {
    const request = makeRequest({ revision: 7, lane: "L2", operation: "ladder", requestId: "ct-77" });
    const response = errorResponse(request, computeError("NONFINITE_INPUT", "Observed feature values must be finite"));
    expect(response.protocolVersion).toBe("1.0.0");
    expect(response.requestId).toBe("ct-77");
    expect(response.revision).toBe(7);
    expect(response.channel).toBe("case");
    expect(response.lane).toBe("L2");
    expect(response.operation).toBe("ladder");
    expect(response.status).toBe("error");
  });

  it("falls back to contract-valid defaults for structurally broken requests", () => {
    const envelope = echoEnvelope({
      protocolVersion: "9.9.9" as "1.0.0",
      requestId: undefined as unknown as string,
      channel: "live" as "case",
      revision: Number.NaN,
      lane: "L9" as "L0",
      operation: "predict" as "evaluate",
    });
    expect(envelope).toEqual({
      protocolVersion: "1.0.0",
      requestId: "",
      channel: "case",
      revision: 0,
      lane: "L0",
      operation: "evaluate",
    });
  });

  it("keeps a finite non-integer revision echo (consumer discards it as non-current)", () => {
    expect(echoEnvelope(makeRequest({ revision: 1.5 })).revision).toBe(1.5);
  });

  it("normalizes a well-formed ok engine response and stamps local timing", () => {
    const request = makeRequest({ revision: 3 });
    const raw = {
      protocolVersion: "0.0.1",
      requestId: "WRONG",
      channel: "verification",
      revision: 999,
      lane: "L3",
      operation: "explain",
      status: "ok",
      evaluation: { revision: 3 },
      extraJunk: "dropped",
    };
    const response = normalizeEngineResponse(request, raw, 12.5);
    expect(response).toEqual({
      protocolVersion: "1.0.0",
      requestId: "ct-1",
      channel: "case",
      revision: 3,
      lane: "L0",
      operation: "evaluate",
      status: "ok",
      timing: { computeMs: 12.5 },
      evaluation: { revision: 3 },
    });
    expect("extraJunk" in response).toBe(false);
  });

  it("coerces invalid engine responses into typed internal failures", () => {
    const request = makeRequest();
    for (const raw of [null, undefined, "ok", 42, { status: "banana" }]) {
      const response = normalizeEngineResponse(request, raw, 1);
      expect(response.status).toBe("error");
      expect(response.error?.code).toBe("INTERNAL_COMPUTE_FAILURE");
      expect(response.error?.recoverable).toBe(false);
      expect(response.requestId).toBe("ct-1");
      expect(response.revision).toBe(1);
    }
    const missingBody = normalizeEngineResponse(request, { status: "error" }, 1);
    expect(missingBody.error?.code).toBe("INTERNAL_COMPUTE_FAILURE");
    const badCode = normalizeEngineResponse(
      request,
      { status: "error", error: { code: "NOT_A_CODE", message: "x", recoverable: true } },
      1
    );
    expect(badCode.error?.code).toBe("INTERNAL_COMPUTE_FAILURE");
    expect(badCode.error?.recoverable).toBe(false);
  });

  it("passes engine errors through with sliced message and boolean recoverable", () => {
    const request = makeRequest();
    const response = normalizeEngineResponse(
      request,
      {
        status: "error",
        error: { code: "ARTIFACT_INVALID", message: "y".repeat(500), recoverable: false },
      },
      2
    );
    expect(response.error).toEqual({
      code: "ARTIFACT_INVALID",
      message: "y".repeat(200),
      recoverable: false,
    });
    const coerced = normalizeEngineResponse(
      request,
      { status: "error", error: { code: "NONFINITE_INPUT", message: "m", recoverable: undefined } },
      2
    );
    expect(coerced.error?.recoverable).toBe(false);
    expect(coerced.timing).toEqual({ computeMs: 2 });
  });
});
