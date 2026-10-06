import { describe, expect, it, vi } from "vitest";
import {
  COMPUTE_PROTOCOL_VERSION,
  type ComputeRequest,
  type ComputeResponse,
} from "../contracts";
import { createMainComputePort, type MainComputeEngine } from "./mainComputePort";
import type { DegradeInfo } from "./types";

function makeRequest(overrides: Partial<ComputeRequest> = {}): ComputeRequest {
  return {
    protocolVersion: COMPUTE_PROTOCOL_VERSION,
    requestId: "ct-main-1",
    channel: "case",
    revision: 1,
    lane: "L0",
    operation: "evaluate",
    featureVector: new Float32Array([62, 1, 0, 80.5]),
    observedMask: new Uint8Array([1, 1, 1, 1]),
    ...overrides,
  };
}

function createHarness(engine: MainComputeEngine, featureCount?: number) {
  const tasks: Array<() => void> = [];
  const seen: ComputeResponse[] = [];
  const degrades: DegradeInfo[] = [];
  const port = createMainComputePort(engine, {
    featureCount,
    now: () => 0,
    schedule: (task) => tasks.push(task),
    onDegrade: (info) => degrades.push(info),
  });
  port.subscribe((response) => seen.push(response));
  const flush = (): void => {
    while (tasks.length > 0) {
      const task = tasks.shift();
      if (task === undefined) break;
      task();
    }
  };
  return { port, seen, flush, degrades };
}

describe("main-thread adapter — same runtime, same protocol", () => {
  it("routes requests through engine.execute and echoes the envelope", () => {
    const execute = vi.fn((request: ComputeRequest) =>
      ({
        status: "ok",
        evaluation: { revision: request.revision }
      }) as unknown as ComputeResponse
    ) as unknown as MainComputeEngine["execute"];
    const h = createHarness({ execute });

    h.port.submit(makeRequest({ requestId: "ct-a", revision: 7 }));
    h.flush();

    expect(execute).toHaveBeenCalledTimes(1);
    expect(h.seen).toHaveLength(1);
    expect(h.seen[0]).toMatchObject({
      protocolVersion: "1.0.0",
      requestId: "ct-a",
      revision: 7,
      channel: "case",
      lane: "L0",
      operation: "evaluate",
      status: "ok",
      timing: { computeMs: 0 }
    });
  });

  it("applies the featureCount gate exactly like the worker", () => {
    const h = createHarness(
      {
        execute: () => ({ status: "ok", evaluation: { revision: 1 } }) as ComputeResponse
      },
      54
    );
    h.port.submit(makeRequest());
    h.flush();
    expect(h.seen[0].status).toBe("error");
    expect(h.seen[0].error?.code).toBe("INVALID_FEATURE_VECTOR");
  });

  it("converts a throwing engine into a typed failure and an advisory G3 degrade", () => {
    const h = createHarness({
      execute: () => {
        throw new Error("boom");
      }
    });
    h.port.submit(makeRequest());
    h.flush();
    expect(h.seen[0].error?.code).toBe("INTERNAL_COMPUTE_FAILURE");
    expect(h.seen[0].error?.recoverable).toBe(false);
    expect(h.degrades).toEqual([
      { level: "G3", reason: "engine-failure", notice: "running in compatibility mode", at: 0 }
    ]);
  });

  it("is a plain ComputePort — submit + subscribe + unsubscribe", () => {
    const h = createHarness({
      execute: () => ({ status: "ok", evaluation: { revision: 1 } }) as ComputeResponse
    });
    const extra: ComputeResponse[] = [];
    const unsubscribe = h.port.subscribe((response) => extra.push(response));
    h.port.submit(makeRequest({ requestId: "one" }));
    h.flush();
    unsubscribe();
    h.port.submit(makeRequest({ requestId: "two", revision: 2 }));
    h.flush();
    expect(h.seen.map((r) => r.requestId)).toEqual(["one", "two"]);
    expect(extra.map((r) => r.requestId)).toEqual(["one"]);
  });
});
