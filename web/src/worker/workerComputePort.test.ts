import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COMPUTE_PROTOCOL_VERSION,
  type ComputeRequest,
  type ComputeResponse,
} from "../contracts";
import type { Registry } from "../contracts/artifacts";
import type { RuntimeErrorInfo } from "./runtime";
import type { DegradeInfo } from "./types";
import {
  createWorkerComputePort,
  type WorkerComputePort,
  type WorkerComputePortOptions,
  type WorkerLike,
} from "./workerComputePort";

type Listener = (event: unknown) => void;

type FakeWorker = WorkerLike & {
  posted: unknown[];
  terminated: boolean;
  failNextPost: boolean;
  emit: (type: "message" | "error" | "messageerror", event: unknown) => void;
};

function createFakeWorker(): FakeWorker {
  const listeners = new Map<string, Listener[]>();
  const worker: FakeWorker = {
    posted: [],
    terminated: false,
    failNextPost: false,
    postMessage(message: unknown): void {
      if (worker.failNextPost) {
        worker.failNextPost = false;
        throw new Error("simulated DataCloneError");
      }
      worker.posted.push(structuredClone(message));
    },
    addEventListener(type, listener): void {
      const list = listeners.get(type) ?? [];
      list.push(listener);
      listeners.set(type, list);
    },
    removeEventListener(type, listener): void {
      const list = listeners.get(type) ?? [];
      listeners.set(
        type,
        list.filter((entry) => entry !== listener)
      );
    },
    terminate(): void {
      worker.terminated = true;
    },
    emit(type, event): void {
      for (const listener of [...(listeners.get(type) ?? [])]) {
        listener(event);
      }
    }
  };
  return worker;
}

function makeRequest(overrides: Partial<ComputeRequest> = {}): ComputeRequest {
  return {
    protocolVersion: COMPUTE_PROTOCOL_VERSION,
    requestId: `ct-${Math.random().toString(36).slice(2, 8)}`,
    channel: "case",
    revision: 1,
    lane: "L0",
    operation: "evaluate",
    featureVector: new Float32Array([62, 1, 0, 80.5]),
    observedMask: new Uint8Array([1, 1, 1, 1]),
    ...overrides
  };
}

function okResponse(request: ComputeRequest): ComputeResponse {
  return {
    protocolVersion: COMPUTE_PROTOCOL_VERSION,
    requestId: request.requestId,
    channel: request.channel,
    revision: request.revision,
    lane: request.lane,
    operation: request.operation,
    status: "ok",
    evaluation: { revision: request.revision }
  } as unknown as ComputeResponse;
}

const READY = { kind: "ready", protocolVersion: "1.0.0", modelId: "sha256:fixture" } as const;

const ARTIFACTS = { model: {}, registry: {} as Registry } as const;

type Harness = {
  port: WorkerComputePort;
  worker: FakeWorker;
  seen: ComputeResponse[];
  degrades: DegradeInfo[];
  readys: Array<{ modelId: string }>;
  errors: RuntimeErrorInfo[];
  flush: () => void;
  emitData: (data: unknown) => void;
};

const activePorts: WorkerComputePort[] = [];

function createHarness(options: Partial<WorkerComputePortOptions> = {}): Harness {
  const worker = createFakeWorker();
  const tasks: Array<() => void> = [];
  const seen: ComputeResponse[] = [];
  const degrades: DegradeInfo[] = [];
  const readys: Array<{ modelId: string }> = [];
  const errors: RuntimeErrorInfo[] = [];

  const port = createWorkerComputePort({
    createWorker: () => worker,
    watchdogMs: 60_000,
    now: () => 0,
    schedule: (task) => {
      tasks.push(task);
    },
    onDegrade: (info) => {
      degrades.push(info);
    },
    onReady: (info) => {
      readys.push(info);
    },
    onError: (info) => {
      errors.push(info);
    },
    ...options
  });
  activePorts.push(port);
  port.subscribe((response) => {
    seen.push(response);
  });

  return {
    port,
    worker,
    seen,
    degrades,
    readys,
    errors,
    flush: (): void => {
      let guard = 0;
      while (tasks.length > 0) {
        const task = tasks.shift();
        if (task === undefined) break;
        task();
        guard += 1;
        if (guard > 1000) throw new Error("scheduler did not settle");
      }
    },
    emitData: (data: unknown): void => {
      worker.emit("message", { data: structuredClone(data) });
    }
  };
}

function bringUp(h: Harness): void {
  h.port.initialize(ARTIFACTS);
  h.emitData(READY);
}

afterEach(() => {
  for (const port of activePorts.splice(0)) {
    port.dispose();
  }
});

describe("handshake — init, ready, ordering", () => {
  it("posts exactly one init control message and reports ready with modelId", () => {
    const h = createHarness();
    expect(h.worker.posted).toHaveLength(0);

    h.port.initialize(ARTIFACTS);
    expect(h.worker.posted).toHaveLength(1);
    expect(h.worker.posted[0]).toEqual({
      kind: "init",
      protocolVersion: "1.0.0",
      artifacts: ARTIFACTS
    });
    expect(h.readys).toHaveLength(0);

    h.emitData(READY);
    expect(h.readys).toEqual([{ modelId: "sha256:fixture" }]);
    expect(h.degrades).toHaveLength(0);
  });

  it("queues requests submitted before initialize and posts them after init", () => {
    const h = createHarness();
    const queued = makeRequest({ requestId: "queued-1" });
    h.port.submit(queued);
    expect(h.worker.posted).toHaveLength(0);

    h.port.initialize(ARTIFACTS);
    expect(h.worker.posted.map((m) => (m as { kind?: string }).kind ?? "request")).toEqual([
      "init",
      "request"
    ]);
    expect(h.worker.posted[1]).toEqual(queued);
  });

  it("posts requests only after initialize while the engine is still loading", () => {
    const h = createHarness();
    h.port.initialize(ARTIFACTS);
    const duringLoad = makeRequest({ requestId: "during-load" });
    h.port.submit(duringLoad);
    // message order on the wire: init first, then compute (C-07 L222)
    expect(h.worker.posted[0]).toMatchObject({ kind: "init" });
    expect(h.worker.posted[1]).toEqual(duringLoad);
    // no ready yet → nothing has been answered
    expect(h.seen).toHaveLength(0);
  });

  it("rejects a second initialize with a typed report and no extra init message", () => {
    const h = createHarness();
    h.port.initialize(ARTIFACTS);
    h.port.initialize(ARTIFACTS);
    expect(h.worker.posted).toHaveLength(1);
    expect(h.errors).toHaveLength(1);
    expect(h.errors[0].error.code).toBe("MALFORMED_REQUEST");
    expect(h.errors[0].error.message).toBe("Initialize was called outside the waiting state");
  });

  it("ignores control messages whose protocolVersion is not 1.0.0", () => {
    const h = createHarness();
    h.port.initialize(ARTIFACTS);
    h.emitData({ kind: "ready", protocolVersion: "9.9.9", modelId: "nope" });
    expect(h.readys).toHaveLength(0);
    expect(h.errors[0].error.message).toBe("Worker control message version mismatch");

    h.emitData(READY);
    expect(h.readys).toHaveLength(1);
  });

  it("reports a ready message that arrives before initialize", () => {
    const h = createHarness();
    h.emitData(READY);
    expect(h.readys).toHaveLength(0);
    expect(h.errors[0].error.message).toBe("Worker ready message arrived out of sequence");
  });
});

describe("response routing — port is a faithful pipe", () => {
  it("delivers worker responses to every subscriber", () => {
    const h = createHarness();
    bringUp(h);
    const request = makeRequest({ requestId: "ct-1" });
    h.port.submit(request);
    expect(h.worker.posted).toHaveLength(2); // init + compute

    h.emitData(okResponse(request));
    expect(h.seen).toHaveLength(1);
    expect(h.seen[0].requestId).toBe("ct-1");
    expect(h.seen[0].status).toBe("ok");
  });

  it("routes a stray response (unknown requestId) to subscribers — the store discards it", () => {
    const h = createHarness();
    bringUp(h);
    h.emitData({
      protocolVersion: "1.0.0",
      requestId: "ghost",
      channel: "case",
      revision: 99,
      lane: "L0",
      operation: "evaluate",
      status: "ok"
    });
    expect(h.seen.map((r) => r.requestId)).toEqual(["ghost"]);
  });

  it("reports unrecognized worker messages without fencing", () => {
    const h = createHarness();
    bringUp(h);
    h.emitData({ nonsense: true });
    expect(h.errors).toHaveLength(1);
    expect(h.errors[0].phase).toBe("transport");
    expect(h.errors[0].error.message).toBe(
      "Unrecognized message received from the compute worker"
    );

    const request = makeRequest({ requestId: "still-alive" });
    h.port.submit(request);
    expect(h.worker.posted).toHaveLength(2); // not fenced — compute still flows
  });

  it("isolates throwing subscribers", () => {
    const h = createHarness();
    bringUp(h);
    const extra: ComputeResponse[] = [];
    h.port.subscribe(() => {
      throw new Error("subscriber bug");
    });
    h.port.subscribe((response) => extra.push(response));

    const request = makeRequest({ requestId: "iso" });
    h.port.submit(request);
    h.emitData(okResponse(request));
    expect(h.seen).toHaveLength(1);
    expect(extra).toHaveLength(1);
    expect(h.errors[0].phase).toBe("dispatch");
  });
});

describe("local validation — one truth with the runtime", () => {
  it("answers invalid requests locally without posting them", () => {
    const h = createHarness({ featureCount: 4 });
    bringUp(h);
    h.port.submit(
      makeRequest({ requestId: "bad", observedMask: new Uint8Array([1, 2, 1, 1]) })
    );
    h.flush();
    expect(h.worker.posted).toHaveLength(1); // only init
    expect(h.seen).toHaveLength(1);
    expect(h.seen[0].error?.code).toBe("INVALID_FEATURE_VECTOR");
    expect(h.seen[0].requestId).toBe("bad");
    expect("timing" in h.seen[0]).toBe(false);
  });

  it("applies the configured feature count", () => {
    const h = createHarness({ featureCount: 54 });
    bringUp(h);
    h.port.submit(makeRequest());
    h.flush();
    expect(h.seen[0].error?.code).toBe("INVALID_FEATURE_VECTOR");
    expect(h.worker.posted).toHaveLength(1);
  });
});

describe("typed fences — Architecture §16.1 degradation ladder", () => {
  it("startup watchdog fires once, terminates the worker and answers everything (FM-02)", () => {
    vi.useFakeTimers();
    try {
      const h = createHarness({ watchdogMs: 100 });
      h.port.initialize(ARTIFACTS);
      const inFlight = makeRequest({ requestId: "in-flight" });
      h.port.submit(inFlight);

      vi.advanceTimersByTime(99);
      expect(h.degrades).toHaveLength(0);

      vi.advanceTimersByTime(1);
      expect(h.degrades).toEqual([
        {
          level: "G3",
          reason: "worker-startup-timeout",
          notice: "running in compatibility mode",
          at: 0
        }
      ]);
      expect(h.worker.terminated).toBe(true);
      expect(h.seen).toHaveLength(1);
      expect(h.seen[0]).toMatchObject({
        requestId: "in-flight",
        status: "error",
        error: {
          code: "INTERNAL_COMPUTE_FAILURE",
          message: "The compute worker is unavailable; the request was not executed",
          recoverable: false
        }
      });
      expect(h.errors[0].cause).toBe("startup watchdog fired");

      const later = makeRequest({ requestId: "later" });
      h.port.submit(later);
      h.flush();
      expect(h.seen[1].requestId).toBe("later");
      expect(h.seen[1].error?.code).toBe("INTERNAL_COMPUTE_FAILURE");
      expect(h.worker.posted).toHaveLength(2); // init + in-flight only; "later" never posted
      expect(h.degrades).toHaveLength(1); // degrade signalled exactly once
    } finally {
      vi.useRealTimers();
    }
  });

  it("worker error event fences with G3 and answers outstanding work", () => {
    const h = createHarness();
    bringUp(h);
    const request = makeRequest({ requestId: "dying" });
    h.port.submit(request);

    h.worker.emit("error", new Error("worker crashed"));
    expect(h.degrades).toEqual([
      {
        level: "G3",
        reason: "worker-error",
        notice: "running in compatibility mode",
        at: 0
      }
    ]);
    expect(h.worker.terminated).toBe(true);
    expect(h.seen).toHaveLength(1);
    expect(h.seen[0].requestId).toBe("dying");
    expect(h.seen[0].error?.recoverable).toBe(false);
    expect(h.errors[0].phase).toBe("transport");
  });

  it("messageerror fences with reason worker-message-error", () => {
    const h = createHarness();
    bringUp(h);
    h.worker.emit("messageerror", { data: "unclonable" });
    expect(h.degrades[0].reason).toBe("worker-message-error");
    expect(h.worker.terminated).toBe(true);
  });

  it("a postMessage failure (DataCloneError) fences and answers the request", () => {
    const h = createHarness();
    bringUp(h);
    h.worker.failNextPost = true;
    const request = makeRequest({ requestId: "unclonable" });
    h.port.submit(request);

    expect(h.degrades[0].reason).toBe("worker-error");
    expect(h.worker.terminated).toBe(true);
    expect(h.seen).toHaveLength(1);
    expect(h.seen[0].requestId).toBe("unclonable");
    expect(h.seen[0].error?.message).toBe(
      "The compute worker is unavailable; the request was not executed"
    );
  });

  it("engine-error control fences with G6 and the engine's own error", () => {
    const h = createHarness();
    bringUp(h);
    const request = makeRequest({ requestId: "victim" });
    h.port.submit(request);

    h.emitData({
      kind: "engine-error",
      protocolVersion: "1.0.0",
      error: { code: "ARTIFACT_INVALID", message: "model bundle mismatch", recoverable: false }
    });

    expect(h.degrades).toEqual([
      { level: "G6", reason: "engine-load-failed", notice: "model could not be loaded", at: 0 }
    ]);
    expect(h.worker.terminated).toBe(true);
    expect(h.seen).toHaveLength(1);
    expect(h.seen[0].requestId).toBe("victim");
    expect(h.seen[0].error).toEqual({
      code: "ARTIFACT_INVALID",
      message: "model bundle mismatch",
      recoverable: false
    });
  });

  it("falls back to the fixed artifact error when engine-error carries garbage", () => {
    const h = createHarness();
    bringUp(h);
    const request = makeRequest({ requestId: "victim" });
    h.port.submit(request);
    h.emitData({ kind: "engine-error", protocolVersion: "1.0.0", error: 42 });
    expect(h.degrades[0].reason).toBe("engine-load-failed");
    expect(h.seen).toHaveLength(1);
    expect(h.seen[0].requestId).toBe("victim");
    expect(h.seen[0].error).toEqual({
      code: "ARTIFACT_INVALID",
      message: "The model artifacts could not be loaded",
      recoverable: false
    });
  });

  it("forwards advisory degraded control messages without fencing", () => {
    const h = createHarness();
    bringUp(h);
    h.emitData({
      kind: "degraded",
      protocolVersion: "1.0.0",
      degrade: {
        level: "G3",
        reason: "engine-failure",
        notice: "running in compatibility mode",
        at: 42
      }
    });
    expect(h.degrades).toHaveLength(1);
    expect(h.degrades[0].reason).toBe("engine-failure");

    const request = makeRequest({ requestId: "still-works" });
    h.port.submit(request);
    expect(h.worker.posted).toHaveLength(2); // init + request — advisory only
  });

  it("construction failure degrades immediately and answers subsequent submits", () => {
    const errors: RuntimeErrorInfo[] = [];
    const degrades: DegradeInfo[] = [];
    const seen: ComputeResponse[] = [];
    const tasks: Array<() => void> = [];
    const port = createWorkerComputePort({
      createWorker: () => {
        throw new Error("Worker is not supported here");
      },
      now: () => 0,
      schedule: (task) => tasks.push(task),
      onDegrade: (info) => degrades.push(info),
      onError: (info) => errors.push(info)
    });
    activePorts.push(port);
    port.subscribe((response) => seen.push(response));

    expect(degrades).toEqual([
      {
        level: "G3",
        reason: "worker-construction-failed",
        notice: "running in compatibility mode",
        at: 0
      }
    ]);

    port.submit(makeRequest({ requestId: "no-worker" }));
    while (tasks.length > 0) {
      const task = tasks.shift();
      if (task === undefined) break;
      task();
    }
    expect(seen).toHaveLength(1);
    expect(seen[0].error?.code).toBe("INTERNAL_COMPUTE_FAILURE");
    expect(errors[0].phase).toBe("transport");
  });

  it("dispose terminates the worker, answers nothing further and ignores stragglers", () => {
    const h = createHarness();
    bringUp(h);
    const request = makeRequest({ requestId: "pending" });
    h.port.submit(request);
    h.port.dispose();
    expect(h.worker.terminated).toBe(true);
    expect(h.seen).toHaveLength(0); // dispose does not answer — the app is shutting down

    h.emitData(READY); // straggler ignored
    expect(h.readys).toHaveLength(1); // only the one from bringUp — nothing new

    h.port.submit(makeRequest({ requestId: "post-dispose" }));
    h.flush();
    expect(h.seen[0].error?.code).toBe("INTERNAL_COMPUTE_FAILURE");
    expect(h.seen[0].error?.message).toBe(
      "The compute worker is unavailable; the request was not executed"
    );
  });
});
