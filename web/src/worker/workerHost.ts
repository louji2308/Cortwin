import { COMPUTE_PROTOCOL_VERSION, type ComputeRequest, type ComputeResponse } from "../contracts";
import {
  createDegradeMessage,
  createEngineErrorMessage,
  createReadyMessage,
  isWorkerControlMessage,
  type EngineArtifactsPayload,
  type WorkerControlMessage,
  type WorkerInitMessage,
} from "./control";
import { computeError, errorResponse } from "./protocol";
import { createComputeRuntime, type RuntimeErrorInfo } from "./runtime";
import type { ComputeEngine } from "./types";

/**
 * C-07 §6.1 worker-side host (Architecture §9.3 worker layer) — all worker
 * logic behind the thin `workerEntry.ts` bootstrap, so it is testable in
 * Node with no DOM, no `self` and no real Worker.
 *
 * Responsibilities:
 *  - `init` control: load artifacts through the single D-16 entry
 *    (imported ONLY by `workerEntry.ts` — this module receives it as a
 *    dependency), post `ready` with `modelId`, or post `engine-error`
 *    (ARTIFACT_INVALID, fixed message) on load failure;
 *  - compute traffic before the engine is ready is buffered and replayed
 *    after `ready` — message order preserved, nothing lost;
 *  - after an engine-load failure the buffer is discarded WITHOUT
 *    responses: the main-side fence answers every outstanding request
 *    (one answer per request, no double delivery);
 *  - compute traffic is handed to the shared `createComputeRuntime` —
 *    the exact same lane/supersession/validation logic as the main-thread
 *    adapter;
 *  - runtime `onDegrade` (G3 engine failure mid-compute) is forwarded as
 *    a `degraded` control message (advisory — never a fence).
 *
 * Direct main→worker control messages other than `init` are a protocol
 * violation and are reported through `onError` (optional; the main port
 * only ever sends `init`).
 */

export type WorkerHostDeps = {
  post: (message: WorkerControlMessage | ComputeResponse) => void;
  loadEngine: (artifacts: EngineArtifactsPayload) => ComputeEngine;
  now?: () => number;
  schedule?: (task: () => void) => void;
  featureCount?: number;
  onError?: (info: RuntimeErrorInfo) => void;
};

export type WorkerHost = {
  handleMessage: (data: unknown) => void;
};

const ARTIFACT_LOAD_ERROR_MESSAGE = "The model artifacts could not be loaded";

export function createWorkerHost(deps: WorkerHostDeps): WorkerHost {
  let engine: ComputeEngine | null = null;
  let initSeen = false;
  let loadFailed = false;
  const buffered: unknown[] = [];

  function report(info: RuntimeErrorInfo): void {
    if (deps.onError === undefined) return;
    try {
      deps.onError(info);
    } catch {
      /* a diagnostic callback must never break the protocol */
    }
  }

  const runtime = createComputeRuntime({
    execute: (request) => {
      if (engine === null) {
        throw new Error("worker host executed before the engine was loaded");
      }
      return engine.execute(request);
    },
    featureCount: deps.featureCount,
    now: deps.now,
    schedule: deps.schedule,
    onError: (info) => {
      report(info);
    },
    onDegrade: (info) => {
      deps.post(createDegradeMessage(info));
    },
  });

  // Every runtime response leaves the worker as C-07 traffic.
  runtime.subscribe((response) => {
    deps.post(response);
  });

  function routeCompute(data: unknown): void {
    if (loadFailed) {
      const partial = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
      deps.post(
        errorResponse(partial, computeError("ARTIFACT_INVALID", ARTIFACT_LOAD_ERROR_MESSAGE))
      );
      return;
    }
    if (engine === null) {
      buffered.push(data);
      return;
    }
    runtime.submit(data as ComputeRequest);
  }

  function handleInit(message: WorkerInitMessage): void {
    if (initSeen) {
      report({
        phase: "transport",
        requestId: "",
        error: computeError("MALFORMED_REQUEST", "Worker init message was received more than once"),
        cause: message,
      });
      return;
    }
    initSeen = true;
    try {
      engine = deps.loadEngine(message.artifacts);
    } catch (cause) {
      loadFailed = true;
      engine = null;
      // The main-side fence answers every outstanding request — the buffer
      // must NOT also answer, or each request would get two responses.
      buffered.length = 0;
      const error = computeError("ARTIFACT_INVALID", ARTIFACT_LOAD_ERROR_MESSAGE);
      deps.post(createEngineErrorMessage(error));
      report({ phase: "transport", requestId: "", error, cause });
      return;
    }
    deps.post(createReadyMessage(engine.modelId));
    const pending = buffered.splice(0);
    for (const item of pending) {
      routeCompute(item);
    }
  }

  function handleMessage(data: unknown): void {
    if (isWorkerControlMessage(data)) {
      if (data.protocolVersion !== COMPUTE_PROTOCOL_VERSION) {
        report({
          phase: "transport",
          requestId: "",
          error: computeError("MALFORMED_REQUEST", "Compute request protocol version must be 1.0.0"),
          cause: data,
        });
        return;
      }
      if (data.kind === "init") {
        handleInit(data);
        return;
      }
      report({
        phase: "transport",
        requestId: "",
        error: computeError("UNSUPPORTED_OPERATION", "Worker control message kind is not supported"),
        cause: data,
      });
      return;
    }
    routeCompute(data);
  }

  return { handleMessage };
}
