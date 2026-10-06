import { COMPUTE_PROTOCOL_VERSION, type ComputeError, type ComputePort, type ComputeRequest, type ComputeResponse } from "../contracts";
import {
  createInitMessage,
  isComputeResponseMessage,
  isWorkerControlMessage,
  type EngineArtifactsPayload,
  type WorkerControlMessage,
} from "./control";
import { computeError, errorResponse, validateRequest } from "./protocol";
import type { RuntimeErrorInfo } from "./runtime";
import { createStartupWatchdog } from "./startupWatchdog";
import { COMPATIBILITY_NOTICE, ENGINE_LOAD_NOTICE, type ComputeListener, type DegradeInfo } from "./types";

/**
 * C-07 §6.1 main-thread worker port (Architecture §9.3 `worker/` consumer,
 * FM-02). One `ComputePort` that frames compute traffic over `postMessage`
 * and owns everything the store must never see:
 *
 *  - startup handshake: `initialize(artifacts)` → `init` control message,
 *    watchdog armed (C-07 L236 — the ONLY timeout in the boundary),
 *    cleared on `ready`;
 *  - typed degradation per Architecture §16.1: worker construction/startup
 *    timeout/error/messageerror → **G3** + compatibility notice (same engine
 *    will run on the main thread — wiring is the app layer's, signalled via
 *    `onDegrade`); artifact load failure → **G6** + reason text;
 *  - on any fence the port terminates the worker, answers every outstanding
 *    and queued request with a typed error (fixed message — no patient
 *    content) so the store can never wait forever, and refuses further
 *    submits with the same typed error;
 *  - requests submitted before `initialize` are queued and posted after
 *    `init`, preserving message order;
 *  - local validation via the SAME shared `validateRequest` (one truth),
 *    delivered asynchronously exactly like the runtime does;
 *  - subscriber isolation (a throwing listener never breaks delivery).
 *
 * There is deliberately NO per-request timeout here (C-07 L236) and NO
 * response-staleness policy — stale responses are discarded by the store
 * (C-07 L234) and by the worker-side runtime (INV-13); this port only
 * routes.
 */

export type WorkerLike = {
  postMessage(message: unknown): void;
  addEventListener(type: "message" | "error" | "messageerror", listener: (event: unknown) => void): void;
  removeEventListener(type: "message" | "error" | "messageerror", listener: (event: unknown) => void): void;
  terminate(): void;
};

export type WorkerComputePortOptions = {
  /** Worker factory; defaults to a module Worker loading `./workerEntry.ts`. */
  createWorker?: () => WorkerLike;
  /** Registry feature count (C-07 L222) — defense in depth on the main side too. */
  featureCount?: number;
  /** Startup watchdog budget in ms (non-normative; default 5000). */
  watchdogMs?: number;
  now?: () => number;
  schedule?: (task: () => void) => void;
  onDegrade?: (info: DegradeInfo) => void;
  onReady?: (info: { modelId: string }) => void;
  onError?: (info: RuntimeErrorInfo) => void;
};

export type WorkerComputePort = ComputePort & {
  initialize: (artifacts: EngineArtifactsPayload) => void;
  dispose: () => void;
};

type PortState = "waiting-init" | "loading" | "ready" | "fenced" | "disposed";

const DEFAULT_WATCHDOG_MS = 5000;

const FENCE_ERROR: ComputeError = {
  code: "INTERNAL_COMPUTE_FAILURE",
  message: "The compute worker is unavailable; the request was not executed",
  recoverable: false,
};

const ENGINE_LOAD_ERROR: ComputeError = {
  code: "ARTIFACT_INVALID",
  message: "The model artifacts could not be loaded",
  recoverable: false,
};

const defaultSchedule = (task: () => void): void => {
  setTimeout(task, 0);
};

const defaultNow = (): number =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

function defaultCreateWorker(): WorkerLike {
  return new Worker(new URL("./workerEntry.ts", import.meta.url), {
    type: "module",
  }) as unknown as WorkerLike;
}

function isDegradeInfo(value: unknown): value is DegradeInfo {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<DegradeInfo>;
  return (
    (candidate.level === "G3" || candidate.level === "G6") &&
    typeof candidate.reason === "string" &&
    typeof candidate.notice === "string" &&
    typeof candidate.at === "number"
  );
}

function isComputeError(value: unknown): value is ComputeError {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<ComputeError>;
  return (
    typeof candidate.code === "string" &&
    typeof candidate.message === "string" &&
    typeof candidate.recoverable === "boolean"
  );
}

export function createWorkerComputePort(options: WorkerComputePortOptions = {}): WorkerComputePort {
  const onDegrade = options.onDegrade;
  const onReady = options.onReady;
  const onError = options.onError;
  const now = options.now ?? defaultNow;
  const schedule = options.schedule ?? defaultSchedule;
  const featureCount = options.featureCount;

  let state: PortState = "waiting-init";
  let worker: WorkerLike | null = null;
  const listeners = new Set<ComputeListener>();
  const outstanding = new Map<string, ComputeRequest>();
  const queuedBeforeInit: ComputeRequest[] = [];

  function report(info: RuntimeErrorInfo): void {
    if (onError === undefined) return;
    try {
      onError(info);
    } catch {
      /* a diagnostic callback must never break the protocol */
    }
  }

  function deliver(response: ComputeResponse): void {
    for (const listener of [...listeners]) {
      try {
        listener(response);
      } catch (cause) {
        report({
          phase: "dispatch",
          requestId: response.requestId,
          error: computeError("INTERNAL_COMPUTE_FAILURE", "A compute response listener failed"),
          cause,
        });
      }
    }
  }

  function scheduleDelivery(response: ComputeResponse): void {
    schedule(() => {
      deliver(response);
    });
  }

  function postControl(message: unknown): void {
    try {
      worker?.postMessage(message);
    } catch (cause) {
      report({
        phase: "transport",
        requestId: "",
        error: { ...FENCE_ERROR },
        cause,
      });
      fence("worker-error", "G3", COMPATIBILITY_NOTICE, FENCE_ERROR);
    }
  }

  function postRequest(request: ComputeRequest): void {
    outstanding.set(request.requestId, request);
    try {
      worker?.postMessage(request);
    } catch (cause) {
      report({
        phase: "transport",
        requestId: request.requestId,
        error: { ...FENCE_ERROR },
        cause,
      });
      fence("worker-error", "G3", COMPATIBILITY_NOTICE, FENCE_ERROR);
    }
  }

  function fence(
    reason: DegradeInfo["reason"],
    level: DegradeInfo["level"],
    notice: string,
    error: ComputeError
  ): void {
    if (state === "fenced" || state === "disposed") return;
    state = "fenced";
    watchdog.cancel();
    if (worker !== null) {
      try {
        worker.terminate();
      } catch {
        /* termination is best-effort; state already fenced */
      }
      worker = null;
    }
    const pending = [...outstanding.values(), ...queuedBeforeInit];
    outstanding.clear();
    queuedBeforeInit.length = 0;
    for (const request of pending) {
      deliver(errorResponse(request, error));
    }
    onDegrade?.({ level, reason, notice, at: now() });
  }

  const watchdog = createStartupWatchdog({
    timeoutMs: options.watchdogMs ?? DEFAULT_WATCHDOG_MS,
    onTimeout: () => {
      report({
        phase: "transport",
        requestId: "",
        error: { ...FENCE_ERROR },
        cause: "startup watchdog fired",
      });
      fence("worker-startup-timeout", "G3", COMPATIBILITY_NOTICE, FENCE_ERROR);
    },
  });

  function handleControl(data: WorkerControlMessage): void {
    // Runtime check against untrusted cross-realm data: the type guard
    // above only checks `kind`.
    const version: unknown = data.protocolVersion;
    if (version !== COMPUTE_PROTOCOL_VERSION) {
      report({
        phase: "transport",
        requestId: "",
        error: computeError("INTERNAL_COMPUTE_FAILURE", "Worker control message version mismatch"),
        cause: data,
      });
      return;
    }
    switch (data.kind) {
      case "ready": {
        if (state !== "loading") {
          report({
            phase: "transport",
            requestId: "",
            error: computeError("INTERNAL_COMPUTE_FAILURE", "Worker ready message arrived out of sequence"),
            cause: data,
          });
          return;
        }
        watchdog.cancel();
        state = "ready";
        if (typeof data.modelId === "string") {
          onReady?.({ modelId: data.modelId });
        } else {
          report({
            phase: "transport",
            requestId: "",
            error: computeError("INTERNAL_COMPUTE_FAILURE", "Worker ready message is missing a modelId"),
            cause: data,
          });
        }
        return;
      }
      case "engine-error": {
        const error = isComputeError(data.error) ? data.error : ENGINE_LOAD_ERROR;
        fence("engine-load-failed", "G6", ENGINE_LOAD_NOTICE, error);
        return;
      }
      case "degraded": {
        if (!isDegradeInfo(data.degrade)) {
          report({
            phase: "transport",
            requestId: "",
            error: computeError("INTERNAL_COMPUTE_FAILURE", "Worker degraded message is not a valid DegradeInfo"),
            cause: data,
          });
          return;
        }
        onDegrade?.(data.degrade);
        return;
      }
      default: {
        report({
          phase: "transport",
          requestId: "",
          error: computeError("UNSUPPORTED_OPERATION", "Worker control message kind is not supported"),
          cause: data,
        });
      }
    }
  }

  function handleMessage(event: unknown): void {
    if (state === "fenced" || state === "disposed") return;
    const data = (event as { data?: unknown } | null)?.data;
    if (isWorkerControlMessage(data)) {
      handleControl(data);
      return;
    }
    if (isComputeResponseMessage(data)) {
      outstanding.delete(data.requestId);
      deliver(data);
      return;
    }
    report({
      phase: "transport",
      requestId: "",
      error: computeError("INTERNAL_COMPUTE_FAILURE", "Unrecognized message received from the compute worker"),
      cause: data,
    });
  }

  function onWorkerError(event: unknown): void {
    report({
      phase: "transport",
      requestId: "",
      error: { ...FENCE_ERROR },
      cause: event,
    });
    fence("worker-error", "G3", COMPATIBILITY_NOTICE, FENCE_ERROR);
  }

  function onWorkerMessageError(event: unknown): void {
    report({
      phase: "transport",
      requestId: "",
      error: { ...FENCE_ERROR },
      cause: event,
    });
    fence("worker-message-error", "G3", COMPATIBILITY_NOTICE, FENCE_ERROR);
  }

  // Construction — a Worker factory that throws degrades immediately (G3).
  try {
    const factory = options.createWorker ?? defaultCreateWorker;
    worker = factory();
    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", onWorkerError);
    worker.addEventListener("messageerror", onWorkerMessageError);
  } catch (cause) {
    if (worker !== null) {
      try {
        worker.terminate();
      } catch {
        /* best-effort */
      }
    }
    worker = null;
    state = "fenced";
    report({
      phase: "transport",
      requestId: "",
      error: { ...FENCE_ERROR },
      cause,
    });
    onDegrade?.({
      level: "G3",
      reason: "worker-construction-failed",
      notice: COMPATIBILITY_NOTICE,
      at: now(),
    });
  }

  function initialize(artifacts: EngineArtifactsPayload): void {
    if (state !== "waiting-init") {
      report({
        phase: "transport",
        requestId: "",
        error: computeError("MALFORMED_REQUEST", "Initialize was called outside the waiting state"),
        cause: state,
      });
      return;
    }
    state = "loading";
    watchdog.arm();
    postControl(createInitMessage(artifacts));
    // If posting `init` fenced the port, `fence()` already cleared and
    // answered the queue — splicing then yields nothing to post.
    for (const queued of queuedBeforeInit.splice(0)) {
      postRequest(queued);
    }
  }

  function submit(request: ComputeRequest): void {
    const outcome = validateRequest(request, { featureCount });
    if (!outcome.ok) {
      scheduleDelivery(errorResponse(request, outcome.error));
      return;
    }
    if (state === "fenced" || state === "disposed") {
      scheduleDelivery(errorResponse(request, { ...FENCE_ERROR }));
      return;
    }
    if (state === "waiting-init") {
      queuedBeforeInit.push(request);
      return;
    }
    postRequest(request);
  }

  function subscribe(listener: ComputeListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function dispose(): void {
    if (state === "disposed") return;
    state = "disposed";
    watchdog.cancel();
    if (worker !== null) {
      try {
        worker.terminate();
      } catch {
        /* best-effort */
      }
      worker = null;
    }
    outstanding.clear();
    queuedBeforeInit.length = 0;
    // Subscribers stay attached on purpose: a submit racing teardown must
    // still receive its typed "unavailable" answer (C-07 liveness), never
    // silence. The port object itself becomes garbage once callers drop it.
  }

  return { submit, subscribe, initialize, dispose };
}
