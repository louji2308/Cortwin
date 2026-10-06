import { COMPUTE_PROTOCOL_VERSION, type ComputeError, type ComputeResponse } from "../contracts";
import type { Registry } from "../contracts/artifacts";
import type { DegradeInfo } from "./types";

/**
 * C-07 §6.1 worker control channel (non-normative framing around the
 * normative ComputeRequest/ComputeResponse pair).
 *
 * The control channel carries exactly four messages, all discriminated by
 * `kind` (ComputeRequest/ComputeResponse never carry `kind`):
 *
 *   main → worker  `init`         artifacts to load (C-07 L222: the worker
 *                                 validates artifact compatibility FIRST)
 *   worker → main  `ready`        engine loaded; carries `modelId`
 *   worker → main  `engine-error` artifact validation failed at load → G6
 *   worker → main  `degraded`     advisory DegradeInfo (e.g. G3 engine failure)
 *
 * Startup watchdog (C-07 L236) runs main-side and degrades without ever
 * altering numerical results. Nothing on this channel reaches the store —
 * the store only ever sees ComputeResponse traffic.
 */

/**
 * Artifacts shipped over the control channel — structural twin of the
 * domain's `EngineArtifacts`, defined here so `web/src/worker/**` never
 * imports from `web/src/domain` (single-entry law: only `workerEntry.ts`
 * may touch the domain).
 */
export type EngineArtifactsPayload = {
  model: unknown;
  registry: Registry;
};

export type WorkerInitMessage = {
  kind: "init";
  protocolVersion: "1.0.0";
  artifacts: EngineArtifactsPayload;
};

export type WorkerReadyMessage = {
  kind: "ready";
  protocolVersion: "1.0.0";
  modelId: string;
};

export type WorkerEngineErrorMessage = {
  kind: "engine-error";
  protocolVersion: "1.0.0";
  error: ComputeError;
};

export type WorkerDegradeMessage = {
  kind: "degraded";
  protocolVersion: "1.0.0";
  degrade: DegradeInfo;
};

export type WorkerControlMessage =
  | WorkerInitMessage
  | WorkerReadyMessage
  | WorkerEngineErrorMessage
  | WorkerDegradeMessage;

export function createInitMessage(artifacts: EngineArtifactsPayload): WorkerInitMessage {
  return { kind: "init", protocolVersion: COMPUTE_PROTOCOL_VERSION, artifacts };
}

export function createReadyMessage(modelId: string): WorkerReadyMessage {
  return { kind: "ready", protocolVersion: COMPUTE_PROTOCOL_VERSION, modelId };
}

export function createEngineErrorMessage(error: ComputeError): WorkerEngineErrorMessage {
  return { kind: "engine-error", protocolVersion: COMPUTE_PROTOCOL_VERSION, error };
}

export function createDegradeMessage(degrade: DegradeInfo): WorkerDegradeMessage {
  return { kind: "degraded", protocolVersion: COMPUTE_PROTOCOL_VERSION, degrade };
}

export function isWorkerControlMessage(data: unknown): data is WorkerControlMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    "kind" in data &&
    typeof (data as { kind: unknown }).kind === "string"
  );
}

/** Minimal structural check before a worker message is routed to subscribers. */
export function isComputeResponseMessage(data: unknown): data is ComputeResponse {
  if (typeof data !== "object" || data === null) return false;
  const candidate = data as Partial<ComputeResponse>;
  return (
    typeof candidate.requestId === "string" &&
    typeof candidate.protocolVersion === "string" &&
    (candidate.status === "ok" || candidate.status === "error")
  );
}
