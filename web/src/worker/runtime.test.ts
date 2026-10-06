import { describe, expect, it, vi } from "vitest";
import {
  COMPUTE_PROTOCOL_VERSION,
  type ComputeRequest,
  type ComputeResponse,
} from "../contracts";
import { createComputeRuntime, type ComputeRuntimeOptions, type RuntimeErrorInfo } from "./runtime";
import type { DegradeInfo } from "./types";

type EngineCall = { requestId: string; revision: number; lane: string; operation: string };

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
    ...overrides,
  };
}

type Harness = {
  port: ReturnType<typeof createComputeRuntime>;
  calls: EngineCall[];
  seen: ComputeResponse[];
  flushAll: () => void;
  errors: RuntimeErrorInfo[];
  degrades: DegradeInfo[];
  clock: { value: number };
};

function createHarness(
  overrides: Partial<ComputeRuntimeOptions> & { execute?: ComputeRuntimeOptions["execute"] } = {}
): Harness {
  const calls: EngineCall[] = [];
  const tasks: Array<() => void> = [];
  const seen: ComputeResponse[] = [];
  const errors: RuntimeErrorInfo[] = [];
  const degrades: DegradeInfo[] = [];
  const clock = { value: 0 };

  const execute =
    overrides.execute ??
    ((request: ComputeRequest): ComputeResponse => {
      calls.push({
        requestId: request.requestId,
        revision: request.revision,
        lane: request.lane,
        operation: request.operation,
      });
      clock.value += 3;
      return { status: "ok", evaluation: { revision: request.revision } } as ComputeResponse;
    });

  const port = createComputeRuntime({
    execute,
    now: () => {
      clock.value += 1;
      return clock.value;
    },
    schedule: (task) => {
      tasks.push(task);
    },
    onError: (info) => {
      errors.push(info);
    },
    onDegrade: (info) => {
      degrades.push(info);
    },
    ...overrides,
    ...(overrides.execute === undefined ? {} : { execute })
  });
  port.subscribe((response) => {
    seen.push(response);
  });

  const flushAll = (): void => {
    let guard = 0;
    while (tasks.length > 0) {
      const task = tasks.shift();
      if (task === undefined) break;
      task();
      guard += 1;
      if (guard > 1000) throw new Error("scheduler did not settle");
    }
  };

  return { port, calls, seen, flushAll, errors, degrades, clock };
}

describe("C-07 framing — echo, timing, exact response shape", () => {
  it("echoes every framing field from the request and stamps local timing", () => {
    const h = createHarness();
    const request = makeRequest({ requestId: "ct-echo", revision: 4, lane: "L2", operation: "ladder" });
    h.port.submit(request);
    h.flushAll();

    expect(h.seen).toHaveLength(1);
    const response = h.seen[0];
    expect(response.protocolVersion).toBe("1.0.0");
    expect(response.requestId).toBe("ct-echo");
    expect(response.channel).toBe("case");
    expect(response.revision).toBe(4);
    expect(response.lane).toBe("L2");
    expect(response.operation).toBe("ladder");
    expect(response.status).toBe("ok");
    expect(response.evaluation).toEqual({ revision: 4 });
    // Deterministic injected clock: startedAt = now() (=1 after two +1 ticks? see
    // harness: now() bumps by 1 per call; execute bumps by 3) → startedAt=1,
    // engine runs (clock 1→4), computeMs = now() (→5) - 1 = 4.
    expect(response.timing).toEqual({ computeMs: 4 });
    expect(Object.keys(response).sort()).toEqual(
      ["channel", "evaluation", "lane", "operation", "protocolVersion", "requestId", "revision", "status", "timing"].sort()
    );
  });

  it("overwrites a misbehaving engine envelope with the request echo", () => {
    const h = createHarness({
      execute: () =>
        ({
          protocolVersion: "0.0.1",
          requestId: "WRONG",
          channel: "verification",
          revision: 999,
          lane: "L3",
          operation: "explain",
          status: "ok",
          evaluation: { revision: 1 }
        }) as unknown as ComputeResponse
    });
    const request = makeRequest({ requestId: "ct-7", revision: 2 });
    h.port.submit(request);
    h.flushAll();

    expect(h.seen).toHaveLength(1);
    expect(h.seen[0].requestId).toBe("ct-7");
    expect(h.seen[0].revision).toBe(2);
    expect(h.seen[0].channel).toBe("case");
    expect(h.seen[0].lane).toBe("L0");
    expect(h.seen[0].operation).toBe("evaluate");
    expect(h.seen[0].protocolVersion).toBe("1.0.0");
  });

  it("delivers validation errors without invoking the engine and without timing", () => {
    const h = createHarness();
    h.port.submit(makeRequest({ protocolVersion: "9.9.9" as "1.0.0", requestId: "ct-bad" }));
    h.port.submit(makeRequest({ operation: "predict" as "evaluate", requestId: "ct-op" }));
    h.port.submit(
      makeRequest({ observedMask: new Uint8Array([1, 2, 1, 1]), requestId: "ct-mask" })
    );
    h.port.submit(
      makeRequest({
        featureVector: new Float32Array([Number.NaN, 1, 0, 80.5]),
        observedMask: new Uint8Array([1, 1, 1, 1]),
        requestId: "ct-nan"
      })
    );
    h.flushAll();

    expect(h.calls).toHaveLength(0);
    expect(h.seen).toHaveLength(4);
    expect(h.seen.map((r) => [r.requestId, r.error?.code])).toEqual([
      ["ct-bad", "MALFORMED_REQUEST"],
      ["ct-op", "UNSUPPORTED_OPERATION"],
      ["ct-mask", "INVALID_FEATURE_VECTOR"],
      ["ct-nan", "NONFINITE_INPUT"]
    ]);
    for (const response of h.seen) {
      expect(response.status).toBe("error");
      expect("timing" in response).toBe(false);
      expect(response.protocolVersion).toBe("1.0.0");
      expect(response.error?.recoverable).toBe(true);
    }
  });

  it("applies the configured feature count", () => {
    const h = createHarness({ featureCount: 54 });
    h.port.submit(makeRequest());
    h.flushAll();
    expect(h.calls).toHaveLength(0);
    expect(h.seen[0].error?.code).toBe("INVALID_FEATURE_VECTOR");
  });
});

describe("lane priority L0 > L1 > L2 > L3", () => {
  it("runs the highest-priority queued lane first regardless of submission order", () => {
    const h = createHarness();
    h.port.submit(makeRequest({ requestId: "a-l3", lane: "L3", operation: "explain", targetId: "RCA" }));
    h.port.submit(makeRequest({ requestId: "b-l2", lane: "L2", operation: "ladder" }));
    h.port.submit(
      makeRequest({ requestId: "c-l1", lane: "L1", operation: "explain", targetId: "LAD" })
    );
    h.port.submit(makeRequest({ requestId: "d-l0", lane: "L0", operation: "evaluate" }));
    h.flushAll();

    expect(h.calls.map((call) => call.lane)).toEqual(["L0", "L1", "L2", "L3"]);
    expect(h.seen.map((r) => r.requestId)).toEqual(["d-l0", "c-l1", "b-l2", "a-l3"]);
  });

  it("lets a later L0 request jump ahead of queued lower lanes", () => {
    const h = createHarness();
    h.port.submit(makeRequest({ requestId: "first-l2", lane: "L2", operation: "ladder" }));
    h.port.submit(makeRequest({ requestId: "later-l0", lane: "L0" }));
    h.flushAll();
    expect(h.calls.map((call) => call.lane)).toEqual(["L0", "L2"]);
  });
});

describe("in-lane newest-revision supersession", () => {
  it("drops a queued older revision when a newer one enters the same lane", () => {
    const h = createHarness();
    const older = makeRequest({ requestId: "old", revision: 1 });
    const newer = makeRequest({ requestId: "new", revision: 2 });
    h.port.submit(older);
    h.port.submit(newer);
    h.flushAll();

    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].requestId).toBe("new");
    expect(h.calls[0].revision).toBe(2);
    expect(h.seen).toHaveLength(1);
    expect(h.seen[0].requestId).toBe("new");
    expect(h.seen[0].revision).toBe(2);
  });

  it("keeps every same-revision request (distinct work, same lane)", () => {
    const h = createHarness();
    h.port.submit(makeRequest({ requestId: "dup-1", revision: 3 }));
    h.port.submit(makeRequest({ requestId: "dup-2", revision: 3 }));
    h.flushAll();
    expect(h.calls.map((call) => call.requestId)).toEqual(["dup-1", "dup-2"]);
    expect(h.seen).toHaveLength(2);
  });

  it("never supersedes across lanes or channels", () => {
    const h = createHarness();
    h.port.submit(
      makeRequest({ requestId: "case-l1", revision: 5, lane: "L1", operation: "explain", targetId: "LAD" })
    );
    h.port.submit(
      makeRequest({ requestId: "case-l2", revision: 4, lane: "L2", operation: "ladder" })
    );
    h.port.submit(
      makeRequest({
        requestId: "verify-l2",
        revision: 1,
        lane: "L2",
        channel: "verification",
        operation: "integrity"
      })
    );
    h.port.submit(makeRequest({ requestId: "case-l0", revision: 9, lane: "L0" }));
    h.flushAll();

    expect(h.calls.map((call) => call.requestId)).toEqual([
      "case-l0",
      "case-l1",
      "case-l2",
      "verify-l2"
    ]);
  });

  it("refuses a request that arrives behind its lane's high-water mark", () => {
    const h = createHarness();
    h.port.submit(makeRequest({ requestId: "first", revision: 3 }));
    h.flushAll();
    expect(h.seen).toHaveLength(1);

    h.port.submit(makeRequest({ requestId: "late", revision: 2 }));
    h.flushAll();
    expect(h.calls).toHaveLength(1);
    expect(h.seen).toHaveLength(1);
  });
});

describe("INV-13 — superseded response discarded on arrival, running job never aborted", () => {
  it("drops the in-flight response when a newer revision lands mid-execution", () => {
    const calls: number[] = [];
    const completed: number[] = [];
    const tasks: Array<() => void> = [];
    const seen: ComputeResponse[] = [];
    const errors: RuntimeErrorInfo[] = [];
    const degrades: DegradeInfo[] = [];
    let port: ReturnType<typeof createComputeRuntime> | null = null;

    port = createComputeRuntime({
      execute: (request) => {
        calls.push(request.revision);
        if (request.revision === 1) {
          // An edit lands while the job is running; the job is never aborted.
          port!.submit(makeRequest({ requestId: "during", revision: 2 }));
        }
        completed.push(request.revision);
        return { status: "ok", evaluation: { revision: request.revision } } as ComputeResponse;
      },
      now: () => 0,
      schedule: (task) => tasks.push(task),
      onError: (info) => errors.push(info),
      onDegrade: (info) => degrades.push(info)
    });
    port.subscribe((response) => seen.push(response));

    port.submit(makeRequest({ requestId: "first", revision: 1 }));
    while (tasks.length > 0) {
      const task = tasks.shift();
      if (task === undefined) break;
      task();
    }

    expect(calls).toEqual([1, 2]); // the running job finished before the newer one started
    expect(completed).toEqual([1, 2]);
    expect(seen).toHaveLength(1); // revision-1 response discarded on arrival
    expect(seen[0].requestId).toBe("during");
    expect(seen[0].revision).toBe(2);
    expect(errors).toHaveLength(0);
    expect(degrades).toHaveLength(0);
  });
});

describe("runtime fault paths — typed internal failure, advisory degrade", () => {
  it("converts a throwing engine into INTERNAL_COMPUTE_FAILURE and signals G3 once", () => {
    const h = createHarness({
      execute: () => {
        throw new Error("engine exploded with 42.4242");
      }
    });
    h.port.submit(makeRequest({ requestId: "boom-1", revision: 1 }));
    h.flushAll();
    h.port.submit(makeRequest({ requestId: "boom-2", revision: 2 }));
    h.flushAll();

    expect(h.seen).toHaveLength(2);
    for (const response of h.seen) {
      expect(response.status).toBe("error");
      expect(response.error?.code).toBe("INTERNAL_COMPUTE_FAILURE");
      expect(response.error?.recoverable).toBe(false);
      expect(response.error?.message).toBe("The compute engine failed while executing the request");
      expect(response.error?.message).not.toContain("42.4242");
      expect(response.timing).toBeDefined();
    }
    expect(h.errors).toHaveLength(2);
    expect(h.errors[0].phase).toBe("execute");
    expect(h.errors[0].cause).toBeInstanceOf(Error);
    expect(h.degrades).toHaveLength(1);
    expect(h.degrades[0]).toEqual({
      level: "G3",
      reason: "engine-failure",
      notice: "running in compatibility mode",
      at: expect.any(Number)
    });
  });

  it("passes engine-declared errors through untouched", () => {
    const h = createHarness({
      execute: () =>
        ({
          status: "error",
          error: { code: "ARTIFACT_INVALID", message: "model bundle mismatch", recoverable: false }
        }) as ComputeResponse
    });
    h.port.submit(makeRequest());
    h.flushAll();
    expect(h.seen[0].status).toBe("error");
    expect(h.seen[0].error).toEqual({
      code: "ARTIFACT_INVALID",
      message: "model bundle mismatch",
      recoverable: false
    });
    expect(h.degrades).toHaveLength(0);
  });

  it("isolates throwing listeners and keeps delivering to the rest", () => {
    const h = createHarness();
    const extra: ComputeResponse[] = [];
    h.port.subscribe(() => {
      throw new Error("listener bug");
    });
    h.port.subscribe((response) => extra.push(response));

    h.port.submit(makeRequest({ requestId: "ct-iso" }));
    h.flushAll();

    expect(h.seen).toHaveLength(1);
    expect(extra).toHaveLength(1);
    expect(h.errors).toHaveLength(1);
    expect(h.errors[0].phase).toBe("dispatch");
    expect(h.errors[0].requestId).toBe("ct-iso");
  });

  it("unsubscribe stops delivery", () => {
    const h = createHarness();
    const local: ComputeResponse[] = [];
    const unsubscribe = h.port.subscribe((response) => local.push(response));
    h.port.submit(makeRequest({ requestId: "one" }));
    h.flushAll();
    expect(local).toHaveLength(1);

    unsubscribe();
    h.port.submit(makeRequest({ requestId: "two", revision: 2 }));
    h.flushAll();
    expect(local).toHaveLength(1);
    expect(h.seen).toHaveLength(2);
  });
});

describe("C-07 L236 — no normative per-request timeout", () => {
  it("never emits a timeout response, no matter how much time passes", () => {
    vi.useFakeTimers();
    try {
      const seen: ComputeResponse[] = [];
      const port = createComputeRuntime({
        execute: (request) =>
          ({ status: "ok", evaluation: { revision: request.revision } }) as ComputeResponse,
        now: () => 0
        // default scheduler (0 ms macrotask) and no per-request timeout by design
      });
      port.subscribe((response) => seen.push(response));
      port.submit(makeRequest({ requestId: "patient" }));

      vi.advanceTimersByTime(60 * 60 * 1000); // one hour elapses before the pump runs
      expect(seen).toHaveLength(1);
      expect(seen[0].status).toBe("ok");
      expect(seen[0].requestId).toBe("patient");

      vi.advanceTimersByTime(24 * 60 * 60 * 1000); // a full day more
      expect(seen).toHaveLength(1); // still exactly one response — no synthetic timeout
    } finally {
      vi.useRealTimers();
    }
  });
});
