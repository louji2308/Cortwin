import type { Registry, FixtureTolerance } from "./artifacts";
import type { Evaluation, Explanation } from "./evaluation";
import type {
  FeatureId,
  FeatureValue,
  ModalityId,
  StageId,
  TargetId,
} from "./primitives";

/** C-07 §6.1 — `computeProtocolVersion = "1.0.0"`. */
export const COMPUTE_PROTOCOL_VERSION = "1.0.0" as const;

/** C-07 §6.1 `channel`. */
export const COMPUTE_CHANNELS = ["case", "verification"] as const;
export type ComputeChannel = (typeof COMPUTE_CHANNELS)[number];

/** C-07 §6.1 `lane` (priority L0 > L1 > L2 > L3). */
export const COMPUTE_LANES = ["L0", "L1", "L2", "L3"] as const;
export type ComputeLane = (typeof COMPUTE_LANES)[number];

/** C-07 §6.1 `operation`. */
export const COMPUTE_OPERATIONS = ["evaluate", "explain", "ladder", "integrity"] as const;
export type ComputeOperation = (typeof COMPUTE_OPERATIONS)[number];

/** C-07 §6.1 `ComputeError.code` — closed error vocabulary. */
export const COMPUTE_ERROR_CODES = [
  "MALFORMED_REQUEST",
  "ARTIFACT_INVALID",
  "NONFINITE_INPUT",
  "UNSUPPORTED_OPERATION",
  "INVALID_FEATURE_VECTOR",
  "INTERNAL_COMPUTE_FAILURE",
] as const;
export type ComputeErrorCode = (typeof COMPUTE_ERROR_CODES)[number];

/**
 * C-07 §6.1 response `ladder` payload: stage evaluations keyed by registry
 * stage ID (Architecture §9 lane table — "L2 ladder: stage evaluations, no
 * attribution" → C-09 §7.1 `eval.stageEvaluations`). The contract references
 * `LadderPayload` without defining it; this is its projection.
 */
export type LadderPayload = Record<StageId, Evaluation | null>;

/**
 * C-07 §6.1 response `integrity` payload — projection of the System →
 * Integrity report list (§9 System view: "Reports max probability, margin
 * and attribution deviation, efficiency residual, fixture pass/fail,
 * tolerances, and model/fixture IDs").
 */
export type IntegrityPayload = {
  fixtures: Array<{ fixtureId: string; passed: boolean }>;
  maxProbabilityDeviation: number;
  maxMarginDeviation: number;
  maxAttributionDeviation: number;
  maxEfficiencyResidual: number;
  tolerance: FixtureTolerance;
  modelId: string;
  fixtureSetId: string;
};

/** C-07 §6.1 — verbatim. */
export type ComputeRequest = {
  protocolVersion: "1.0.0"; requestId: string; channel: ComputeChannel;
  revision: number; lane: ComputeLane; operation: ComputeOperation;
  featureVector: Float32Array; observedMask: Uint8Array;
  targetId?: TargetId; verificationFixtureId?: string;
};

/** C-07 §6.1 — verbatim. */
export type ComputeResponse = {
  protocolVersion: "1.0.0"; requestId: string; channel: ComputeChannel;
  revision: number; lane: ComputeLane; operation: ComputeOperation;
  status: "ok" | "error";
  evaluation?: Evaluation; explanation?: Explanation; ladder?: LadderPayload; integrity?: IntegrityPayload;
  timing?: { computeMs: number }; error?: ComputeError;
};

/** C-07 §6.1 — verbatim; `message` MUST NOT contain patient values. */
export type ComputeError = {
  code: ComputeErrorCode;
  message: string;
  recoverable: boolean;
};

/**
 * Architecture §9.3 compute-client interface: the store submits requests
 * through a port and receives responses through a subscription; the worker
 * adapter implements it. Defined here so producers and consumers build
 * against one frozen interface.
 */
export type ComputePort = {
  submit(request: ComputeRequest): void;
  subscribe(listener: (response: ComputeResponse) => void): () => void;
};

/** C-07 §6.1 request rules: registry-order vector + observed-feature mask. */
export type EncodedCase = { featureVector: Float32Array; observedMask: Uint8Array };

/**
 * Architecture §8 encoding boundary (C-08 §6.2 missingness: unprovided
 * evidence is the mask, never zero-filled): the store does not implement
 * encoding — the domain encoder is injected. Missingness gating (modality
 * provision vs per-feature provision) is a domain rule evaluated here.
 */
export type CaseEncoder = (input: {
  registry: Registry;
  values: Record<FeatureId, FeatureValue>;
  providedFeatures: Record<FeatureId, boolean>;
  providedModalities: Record<ModalityId, boolean>;
}) => EncodedCase;
