import {
  COMPUTE_CHANNELS,
  COMPUTE_ERROR_CODES,
  COMPUTE_LANES,
  COMPUTE_OPERATIONS,
  COMPUTE_PROTOCOL_VERSION,
  type ComputeChannel,
  type ComputeError,
  type ComputeErrorCode,
  type ComputeLane,
  type ComputeOperation,
  type ComputeRequest,
  type ComputeResponse,
} from "../contracts";

/**
 * C-07 §6.1 protocol runtime core — pure request validation, the closed
 * error vocabulary, honest `recoverable` mapping and response-envelope
 * construction (requestId / revision / lane / channel / operation echo).
 *
 * Rules encoded here, in order (C-07 L200–236):
 *  - `protocolVersion` must be exactly "1.0.0" → `MALFORMED_REQUEST`;
 *  - closed enums: bad `channel`/`lane` → `MALFORMED_REQUEST`, unknown
 *    `operation` → `UNSUPPORTED_OPERATION`;
 *  - `featureVector: Float32Array`, `observedMask: Uint8Array`, equal
 *    lengths (optionally == registry feature count), mask values `0|1`
 *    → `INVALID_FEATURE_VECTOR`;
 *  - non-finite values at OBSERVED positions → `NONFINITE_INPUT`
 *    (unobserved slots are ignored by the value function, C-08 §6.2
 *    "Stored values of unprovided features are ignored until observed");
 *  - error `message` NEVER interpolates request content — fixed strings
 *    only, so no patient value can ride an error (C-07 L218).
 *
 * No numeric clinical semantics live here (INV-C03): this module never
 * touches probabilities, margins or payloads — only protocol framing.
 */

const TARGET_IDS = ["CAD", "LAD", "LCX", "RCA"] as const;

/**
 * C-07 `recoverable` honesty rule used for runtime-generated errors:
 * `true` = the caller can correct the request and resubmit successfully
 * without changing artifacts, engine or app code; `false` = resubmitting
 * cannot succeed until artifacts or code change. Engine-provided errors
 * pass through with their own flag untouched.
 */
const RECOVERABLE_BY_CODE: Record<ComputeErrorCode, boolean> = {
  MALFORMED_REQUEST: true,
  UNSUPPORTED_OPERATION: true,
  INVALID_FEATURE_VECTOR: true,
  NONFINITE_INPUT: true,
  ARTIFACT_INVALID: false,
  INTERNAL_COMPUTE_FAILURE: false,
};

export function isComputeErrorCode(value: unknown): value is ComputeErrorCode {
  return (
    typeof value === "string" &&
    (COMPUTE_ERROR_CODES as readonly string[]).includes(value)
  );
}

function isChannel(value: unknown): value is ComputeChannel {
  return typeof value === "string" && (COMPUTE_CHANNELS as readonly string[]).includes(value);
}

function isLane(value: unknown): value is ComputeLane {
  return typeof value === "string" && (COMPUTE_LANES as readonly string[]).includes(value);
}

function isOperation(value: unknown): value is ComputeOperation {
  return typeof value === "string" && (COMPUTE_OPERATIONS as readonly string[]).includes(value);
}

function isTargetId(value: unknown): boolean {
  return typeof value === "string" && (TARGET_IDS as readonly string[]).includes(value);
}

/** Builds a `ComputeError` with the fixed `recoverable` mapping above. */
export function computeError(code: ComputeErrorCode, message: string): ComputeError {
  return { code, message, recoverable: RECOVERABLE_BY_CODE[code] };
}

export type ValidationOutcome =
  | { ok: true }
  | { ok: false; error: ComputeError };

export type ValidationOptions = {
  /** Registry feature count (C-07 L222); when known, both arrays must match it. */
  featureCount?: number;
};

/**
 * Validates one C-07 request. Pure; never throws; returns the first
 * violation as a typed `ComputeError` (fixed message, no input content).
 */
export function validateRequest(
  request: unknown,
  options: ValidationOptions = {}
): ValidationOutcome {
  if (typeof request !== "object" || request === null) {
    return { ok: false, error: computeError("MALFORMED_REQUEST", "Compute request must be an object") };
  }
  const candidate = request as Partial<ComputeRequest>;

  if (candidate.protocolVersion !== COMPUTE_PROTOCOL_VERSION) {
    return {
      ok: false,
      error: computeError(
        "MALFORMED_REQUEST",
        `Compute request protocol version must be ${COMPUTE_PROTOCOL_VERSION}`
      ),
    };
  }
  if (typeof candidate.requestId !== "string" || candidate.requestId.length === 0) {
    return {
      ok: false,
      error: computeError("MALFORMED_REQUEST", "Compute request requestId must be a non-empty string"),
    };
  }
  if (!isChannel(candidate.channel)) {
    return {
      ok: false,
      error: computeError("MALFORMED_REQUEST", "Compute request channel must be case or verification"),
    };
  }
  if (!Number.isInteger(candidate.revision) || (candidate.revision as number) < 0) {
    return {
      ok: false,
      error: computeError("MALFORMED_REQUEST", "Compute request revision must be a non-negative integer"),
    };
  }
  // C-07 L234: the case revision starts at 1 and increases monotonically.
  if (candidate.channel === "case" && (candidate.revision as number) < 1) {
    return {
      ok: false,
      error: computeError("MALFORMED_REQUEST", "Case-channel revision must be 1 or higher"),
    };
  }
  if (!isLane(candidate.lane)) {
    return { ok: false, error: computeError("MALFORMED_REQUEST", "Compute request lane must be L0, L1, L2 or L3") };
  }
  if (!isOperation(candidate.operation)) {
    return { ok: false, error: computeError("UNSUPPORTED_OPERATION", "Compute request operation is not supported") };
  }
  if (candidate.targetId !== undefined && !isTargetId(candidate.targetId)) {
    return {
      ok: false,
      error: computeError("MALFORMED_REQUEST", "Compute request targetId must be CAD, LAD, LCX or RCA"),
    };
  }
  if (candidate.operation === "explain" && candidate.targetId === undefined) {
    return {
      ok: false,
      error: computeError("MALFORMED_REQUEST", "Compute request explain operation requires a targetId"),
    };
  }
  if (
    candidate.verificationFixtureId !== undefined &&
    (typeof candidate.verificationFixtureId !== "string" || candidate.verificationFixtureId.length === 0)
  ) {
    return {
      ok: false,
      error: computeError("MALFORMED_REQUEST", "Compute request verificationFixtureId must be a non-empty string"),
    };
  }
  if (!(candidate.featureVector instanceof Float32Array)) {
    return {
      ok: false,
      error: computeError("MALFORMED_REQUEST", "Compute request featureVector must be a Float32Array"),
    };
  }
  if (!(candidate.observedMask instanceof Uint8Array)) {
    return {
      ok: false,
      error: computeError("MALFORMED_REQUEST", "Compute request observedMask must be a Uint8Array"),
    };
  }

  const vector = candidate.featureVector;
  const mask = candidate.observedMask;
  const lengthOk =
    vector.length > 0 &&
    vector.length === mask.length &&
    (options.featureCount === undefined || vector.length === options.featureCount);
  if (!lengthOk) {
    return {
      ok: false,
      error: computeError(
        "INVALID_FEATURE_VECTOR",
        "featureVector and observedMask lengths must be equal and match the registry feature count"
      ),
    };
  }
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] !== 0 && mask[index] !== 1) {
      return { ok: false, error: computeError("INVALID_FEATURE_VECTOR", "Observed mask must contain only 0 or 1") };
    }
  }
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] === 1 && !Number.isFinite(vector[index])) {
      return {
        ok: false,
        error: computeError("NONFINITE_INPUT", "Observed feature values must be finite"),
      };
    }
  }
  return { ok: true };
}

/**
 * Envelope echo for a response whose request was structurally valid: every
 * framing field comes back exactly as submitted (C-07 L232–234 revision
 * semantics; store `handleResponse` re-checks the echo).
 * For structurally invalid requests the offending fields fall back to
 * contract-valid defaults so the response itself always stays well-formed;
 * consumers match responses by `requestId` first, and a non-current
 * revision can never become current (INV-13).
 */
export function echoEnvelope(request: Partial<ComputeRequest>): Pick<
  ComputeResponse,
  "protocolVersion" | "requestId" | "channel" | "revision" | "lane" | "operation"
> {
  return {
    protocolVersion: COMPUTE_PROTOCOL_VERSION,
    requestId: typeof request.requestId === "string" ? request.requestId : "",
    channel: isChannel(request.channel) ? request.channel : "case",
    revision: typeof request.revision === "number" && Number.isFinite(request.revision) ? request.revision : 0,
    lane: isLane(request.lane) ? request.lane : "L0",
    operation: isOperation(request.operation) ? request.operation : "evaluate",
  };
}

/** Builds an `status: "error"` response for a (possibly invalid) request. */
export function errorResponse(request: Partial<ComputeRequest>, error: ComputeError): ComputeResponse {
  return {
    ...echoEnvelope(request),
    status: "error",
    error,
  };
}

/**
 * Normalizes whatever `engine.execute` returned into a well-formed
 * C-07 response: envelope fields are overwritten with the request echo
 * (the runtime owns framing; the engine owns payload), `status` and
 * `error` are coerced into the closed vocabulary, `timing.computeMs` is
 * stamped locally (C-07 L236 — diagnostic only, never transmitted).
 */
export function normalizeEngineResponse(
  request: ComputeRequest,
  raw: unknown,
  computeMs: number
): ComputeResponse {
  const envelope = echoEnvelope(request);
  const timing = { computeMs };

  if (typeof raw !== "object" || raw === null) {
    return {
      ...envelope,
      status: "error",
      timing,
      error: computeError("INTERNAL_COMPUTE_FAILURE", "The compute engine returned an invalid response"),
    };
  }
  const candidate = raw as Partial<ComputeResponse>;
  if (candidate.status !== "ok" && candidate.status !== "error") {
    return {
      ...envelope,
      status: "error",
      timing,
      error: computeError("INTERNAL_COMPUTE_FAILURE", "The compute engine returned an invalid status"),
    };
  }
  if (candidate.status === "error") {
    const provided = candidate.error;
    if (provided === undefined || typeof provided !== "object" || provided === null) {
      return {
        ...envelope,
        status: "error",
        timing,
        error: computeError("INTERNAL_COMPUTE_FAILURE", "The compute engine returned an error without a valid code"),
      };
    }
    if (!isComputeErrorCode(provided.code)) {
      return {
        ...envelope,
        status: "error",
        timing,
        error: computeError("INTERNAL_COMPUTE_FAILURE", "The compute engine returned an error without a valid code"),
      };
    }
    return {
      ...envelope,
      status: "error",
      timing,
      error: {
        code: provided.code,
        message: typeof provided.message === "string" ? provided.message.slice(0, 200) : "",
        recoverable: provided.recoverable === true,
      },
    };
  }
  return {
    ...envelope,
    status: "ok",
    timing,
    ...(candidate.evaluation !== undefined ? { evaluation: candidate.evaluation } : {}),
    ...(candidate.explanation !== undefined ? { explanation: candidate.explanation } : {}),
    ...(candidate.ladder !== undefined ? { ladder: candidate.ladder } : {}),
    ...(candidate.integrity !== undefined ? { integrity: candidate.integrity } : {}),
  };
}
