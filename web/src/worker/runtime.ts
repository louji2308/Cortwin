import {
  COMPUTE_LANES,
  type ComputeError,
  type ComputeLane,
  type ComputePort,
  type ComputeRequest,
  type ComputeResponse,
} from "../contracts";
import { COMPATIBILITY_NOTICE, type ComputeListener, type DegradeInfo } from "./types";
import {
  computeError,
  errorResponse,
  normalizeEngineResponse,
  validateRequest,
} from "./protocol";

/**
 * C-07 §6.1 compute runtime — one `ComputePort` implementation shared by
 * the worker boundary and the main-thread adapter (Architecture §9.3).
 *
 * Encodes, with unit coverage for each rule:
 *  - lane priority `L0 > L1 > L2 > L3` (C-07 L232): the pump always runs
 *    the highest-priority lane that holds work;
 *  - in-lane newest-revision supersession (Architecture §8.6 "within a
 *    lane only the newest revision runs"): a queued request with a strictly
 *    older revision is dropped when a newer revision enters the same
 *    channel+lane, and a request arriving behind a newer revision never
 *    runs at all (silently — the newest request always executes and
 *    responds, so a correct monotonic producer is never left waiting);
 *  - running jobs are never aborted (Architecture §8.6) — `execute` runs
 *    to completion, then its response is checked for staleness;
 *  - INV-13 / FM-03: a response whose revision is behind its lane's
 *    high-water mark is dropped on arrival — it never reaches subscribers;
 *  - requestId/revision/lane/channel/operation echo (the runtime owns
 *    framing, the engine owns payload);
 *  - `timing.computeMs` stamped locally and diagnostic-only (C-07 L236);
 *    there is NO per-request timeout anywhere — only the startup watchdog
 *    (separate module) may trigger degradation, and it never touches
 *    numerical results.
 *
 * Dependency-injected: `execute`, `now`, `schedule`, `onError`, `onDegrade`
 * are all injected, so the whole protocol runs deterministically in tests
 * with no domain, worker or timer dependency.
 */

export type RuntimeErrorInfo = {
  phase: "execute" | "dispatch" | "transport";
  requestId: string;
  /** Typed, sanitized error (fixed message — never patient content). */
  error: ComputeError;
  /** Raw cause for local diagnostics only; MUST NOT be logged or sent anywhere (C-15 §10.2). */
  cause?: unknown;
};

export type ComputeRuntimeOptions = {
  /** The single engine entry (`Engine.execute` — D-16); injected, never re-implemented here. */
  execute: (request: ComputeRequest) => ComputeResponse;
  onError?: (info: RuntimeErrorInfo) => void;
  /** Advisory G3 signal (Architecture §9.3 "Computing → Degraded : worker error"); fired at most once. */
  onDegrade?: (info: DegradeInfo) => void;
  /** Registry feature count (C-07 L222) when known — defense in depth. */
  featureCount?: number;
  now?: () => number;
  /** Task scheduler; default is a 0 ms macrotask so same-tick bursts batch before the pump. */
  schedule?: (task: () => void) => void;
};

type QueuedJob = { request: ComputeRequest };

const defaultSchedule = (task: () => void): void => {
  setTimeout(task, 0);
};

const defaultNow = (): number =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

export function createComputeRuntime(options: ComputeRuntimeOptions): ComputePort {
  const execute = options.execute;
  const onError = options.onError;
  const onDegrade = options.onDegrade;
  const now = options.now ?? defaultNow;
  const schedule = options.schedule ?? defaultSchedule;

  const queues: Record<ComputeLane, QueuedJob[]> = { L0: [], L1: [], L2: [], L3: [] };
  /** Highest revision accepted per `${channel}:${lane}` — supersession + staleness reference. */
  const highWater = new Map<string, number>();
  const listeners = new Set<ComputeListener>();
  const deliveries: ComputeResponse[] = [];
  let scheduled = false;
  let flushing = false;
  let degradeSignalled = false;

  const laneKey = (channel: string, lane: ComputeLane): string => `${channel}:${lane}`;

  function reportError(info: RuntimeErrorInfo): void {
    if (onError !== undefined) {
      try {
        onError(info);
      } catch {
        /* a diagnostic callback must never break the protocol */
      }
    }
  }

  function signalDegrade(): void {
    if (degradeSignalled || onDegrade === undefined) return;
    degradeSignalled = true;
    onDegrade({
      level: "G3",
      reason: "engine-failure",
      notice: COMPATIBILITY_NOTICE,
      at: now(),
    });
  }

  function dispatch(response: ComputeResponse): void {
    for (const listener of [...listeners]) {
      try {
        listener(response);
      } catch (cause) {
        reportError({
          phase: "dispatch",
          requestId: response.requestId,
          error: computeError("INTERNAL_COMPUTE_FAILURE", "A compute response listener failed"),
          cause,
        });
      }
    }
  }

  function runJob(job: QueuedJob): void {
    const request = job.request;
    const startedAt = now();
    let response: ComputeResponse;
    let raw: unknown;
    let threw: unknown = null;
    let didThrow = false;
    try {
      raw = execute(request);
    } catch (cause) {
      didThrow = true;
      threw = cause;
      raw = undefined;
    }
    const computeMs = now() - startedAt;
    if (didThrow) {
      const error = computeError(
        "INTERNAL_COMPUTE_FAILURE",
        "The compute engine failed while executing the request"
      );
      reportError({ phase: "execute", requestId: request.requestId, error, cause: threw });
      response = { ...errorResponse(request, error), timing: { computeMs } };
      signalDegrade();
    } else {
      response = normalizeEngineResponse(request, raw, computeMs);
    }

    // INV-13: discard a superseded response on arrival — never routed.
    const key = laneKey(request.channel, request.lane);
    const current = highWater.get(key);
    if (current !== undefined && response.revision < current) return;
    dispatch(response);
  }

  function flush(): void {
    flushing = true;
    try {
      for (;;) {
        while (deliveries.length > 0) {
          const delivery = deliveries.shift();
          if (delivery !== undefined) dispatch(delivery);
        }
        let lane: ComputeLane | null = null;
        for (const candidate of COMPUTE_LANES) {
          if (queues[candidate].length > 0) {
            lane = candidate;
            break;
          }
        }
        if (lane === null) return;
        const job = queues[lane].shift();
        if (job === undefined) return;
        runJob(job);
      }
    } finally {
      flushing = false;
    }
  }

  function scheduleFlush(): void {
    if (flushing || scheduled) return;
    scheduled = true;
    schedule(() => {
      scheduled = false;
      flush();
    });
  }

  function submit(request: ComputeRequest): void {
    const outcome = validateRequest(request, { featureCount: options.featureCount });
    if (!outcome.ok) {
      // Typed protocol rejections are traffic, not internal faults: they are
      // delivered (asynchronously, like every other response) and never
      // reach the engine.
      deliveries.push(errorResponse(request, outcome.error));
      scheduleFlush();
      return;
    }

    const key = laneKey(request.channel, request.lane);
    const previous = highWater.get(key);
    if (previous !== undefined && request.revision < previous) {
      // Stale on arrival (C-07 L234 "only the newest applicable revision"):
      // a correct producer's revision is monotonic per lane, so nothing a
      // consumer is waiting on is lost — the newest request always runs.
      return;
    }
    if (previous === undefined || request.revision > previous) {
      highWater.set(key, request.revision);
    }

    const queue = queues[request.lane];
    if (previous !== undefined) {
      // In-lane newest-revision supersession: queued older work never runs.
      for (let index = queue.length - 1; index >= 0; index -= 1) {
        const queued = queue[index];
        if (
          queued.request.channel === request.channel &&
          queued.request.revision < request.revision
        ) {
          queue.splice(index, 1);
        }
      }
    }
    queue.push({ request });
    scheduleFlush();
  }

  function subscribe(listener: ComputeListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return { submit, subscribe };
}
