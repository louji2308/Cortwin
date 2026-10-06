import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  COMPUTE_PROTOCOL_VERSION,
  type ComputeRequest,
  type ComputeResponse,
} from "../contracts";
import type { Registry } from "../contracts/artifacts";
import { createMainComputePort } from "./mainComputePort";
import type { ComputeEngine, DegradeInfo } from "./types";
import { createWorkerComputePort, type WorkerLike } from "./workerComputePort";
import { createWorkerHost } from "./workerHost";
// Step F exception — the ONLY import of the D-16 domain entry anywhere in
// web/src/worker/** production sources is workerEntry.ts; this test imports
// it deliberately to prove the worker drives the REAL engine, byte for byte.
// wiring.test.ts scans non-test sources only, so this boundary is explicit.
import { loadEngine } from "../domain";

/**
 * Step F (Implementation_Plan P4 · C-07/C-08 pairing): P4-1's D-16 entry
 * has landed, so the worker/runtime claim now includes the REAL engine.
 *
 * Both harnesses load artifacts from `web/public/` (produced by
 * `make reproduce`) through the frozen `loadEngine`:
 *   worker mode → createWorkerHost(loadEngine) ⇄ structuredClone ⇄ port
 *   main mode   → createMainComputePort(loadEngine(...))
 * and require byte-identical JSON responses for real evaluate/explain
 * traffic. If artifacts are missing or invalid the file fails loudly —
 * this is blocking evidence, not a soft skip.
 */

const registry = JSON.parse(
  readFileSync(new URL("../../public/registry.json", import.meta.url), "utf8")
) as Registry;
const model = JSON.parse(
  readFileSync(new URL("../../public/model.json", import.meta.url), "utf8")
) as unknown;

const ARTIFACTS = { model, registry } as const;
const FEATURE_COUNT = registry.features.length;

function makeRequest(overrides: Partial<ComputeRequest> = {}): ComputeRequest {
  const featureVector = Float32Array.from(
    { length: FEATURE_COUNT },
    (_unused, index) => index / 100
  );
  const observedMask = new Uint8Array(FEATURE_COUNT).fill(1);
  return {
    protocolVersion: COMPUTE_PROTOCOL_VERSION,
    requestId: "d16-1",
    channel: "case",
    revision: 1,
    lane: "L0",
    operation: "evaluate",
    featureVector,
    observedMask,
    ...overrides
  };
}

type Pair = {
  workerPort: ReturnType<typeof createWorkerComputePort>;
  mainPort: ReturnType<typeof createMainComputePort>;
  workerSeen: ComputeResponse[];
  mainSeen: ComputeResponse[];
  flush: () => void;
};

function createRealPair(): Pair {
  const tasks: Array<() => void> = [];
  const schedule = (task: () => void): void => {
    tasks.push(task);
  };

  let messageListener: ((event: unknown) => void) | null = null;
  let deliverToMain: ((data: unknown) => void) | null = null;

  const host = createWorkerHost({
    post: (message) => {
      deliverToMain?.(structuredClone(message));
    },
    loadEngine: (artifacts) => loadEngine(artifacts),
    featureCount: FEATURE_COUNT,
    now: () => 0,
    schedule,
    onError: () => {
      /* diagnostics surfaced through assertions below */
    }
  });

  const fakeWorker: WorkerLike = {
    postMessage: (message) => {
      host.handleMessage(structuredClone(message));
    },
    addEventListener: (type, listener) => {
      if (type === "message") messageListener = listener;
    },
    removeEventListener: () => {
      messageListener = null;
    },
    terminate: () => {
      /* harness */
    }
  };
  deliverToMain = (data) => {
    messageListener?.({ data });
  };

  const workerPort = createWorkerComputePort({
    createWorker: () => fakeWorker,
    featureCount: FEATURE_COUNT,
    now: () => 0,
    schedule
  });
  workerPort.initialize(ARTIFACTS);

  const mainPort = createMainComputePort(loadEngine(ARTIFACTS), {
    featureCount: FEATURE_COUNT,
    now: () => 0,
    schedule
  });

  const workerSeen: ComputeResponse[] = [];
  const mainSeen: ComputeResponse[] = [];
  workerPort.subscribe((response) => {
    workerSeen.push(response);
  });
  mainPort.subscribe((response) => {
    mainSeen.push(response);
  });

  return {
    workerPort,
    mainPort,
    workerSeen,
    mainSeen,
    flush: (): void => {
      let guard = 0;
      while (tasks.length > 0) {
        const task = tasks.shift();
        if (task === undefined) break;
        task();
        guard += 1;
        if (guard > 1000) throw new Error("scheduler did not settle");
      }
    }
  };
}

describe("step F — real D-16 engine through both compute paths", () => {
  it("loads the shipped artifacts through the frozen loadEngine entry", () => {
    const engine = loadEngine(ARTIFACTS);
    expect(engine.modelId).toMatch(/^sha256:/);
    expect(FEATURE_COUNT).toBeGreaterThan(0);
  });

  it("produces byte-identical real evaluate traffic worker vs main", () => {
    const pair = createRealPair();
    const request = makeRequest({ requestId: "d16-evaluate" });

    pair.workerPort.submit(request);
    pair.mainPort.submit(request);
    pair.flush();

    expect(pair.workerSeen).toHaveLength(1);
    expect(pair.mainSeen).toHaveLength(1);
    expect(JSON.stringify(pair.workerSeen[0])).toBe(JSON.stringify(pair.mainSeen[0]));

    const response = pair.workerSeen[0];
    expect(response.requestId).toBe("d16-evaluate");
    expect(response.timing).toEqual({ computeMs: 0 });
    if (response.status === "ok") {
      expect(response.evaluation).toBeDefined();
      expect(response.evaluation?.revision).toBe(1);
    } else {
      // A typed engine error is acceptable ONLY if identical on both paths
      // (already asserted) — surface it as a hard failure, never as success.
      expect(response.error?.code).toBeDefined();
      throw new Error(`real engine returned a typed error: ${String(response.error?.code)}`);
    }
  });

  it("produces byte-identical real explain traffic worker vs main", () => {
    const pair = createRealPair();
    const request = makeRequest({
      requestId: "d16-explain",
      revision: 2,
      lane: "L1",
      operation: "explain",
      targetId: "LAD"
    });

    pair.workerPort.submit(request);
    pair.mainPort.submit(request);
    pair.flush();

    expect(pair.workerSeen).toHaveLength(1);
    expect(JSON.stringify(pair.workerSeen[0])).toBe(JSON.stringify(pair.mainSeen[0]));

    const response = pair.workerSeen[0];
    if (response.status !== "ok" || response.explanation === undefined) {
      throw new Error(`real explain returned: ${response.status}`);
    }
    expect(response.explanation.targetId).toBe("LAD");
    expect(response.explanation.featureAttributions.length).toBeGreaterThan(0);
  });

  it("turns a real loader failure into the G6 engine-error fence", () => {
    const degrades: DegradeInfo[] = [];
    const seen: ComputeResponse[] = [];
    const tasks: Array<() => void> = [];

    let messageListener: ((event: unknown) => void) | null = null;
    let deliverToMain: ((data: unknown) => void) | null = null;
    const host = createWorkerHost({
      post: (message) => {
        deliverToMain?.(structuredClone(message));
      },
      loadEngine: (artifacts) => loadEngine(artifacts),
      featureCount: FEATURE_COUNT,
      now: () => 0,
      schedule: (task) => tasks.push(task)
    });
    const fakeWorker: WorkerLike = {
      postMessage: (message) => {
        host.handleMessage(structuredClone(message));
      },
      addEventListener: (type, listener) => {
        if (type === "message") messageListener = listener;
      },
      removeEventListener: () => {
        messageListener = null;
      },
      terminate: () => {
        /* harness */
      }
    };
    deliverToMain = (data) => {
      messageListener?.({ data });
    };

    const port = createWorkerComputePort({
      createWorker: () => fakeWorker,
      featureCount: FEATURE_COUNT,
      now: () => 0,
      schedule: (task) => tasks.push(task),
      onDegrade: (info) => degrades.push(info)
    });
    port.subscribe((response) => seen.push(response));

    // submitted BEFORE init → queued → answered by the fence when the real
    // loader rejects the artifacts (one answer per request, no double reply)
    port.submit(makeRequest({ requestId: "d16-broken" }));
    port.initialize({ model: { not: "a model" }, registry });
    while (tasks.length > 0) {
      const task = tasks.shift();
      if (task === undefined) break;
      task();
    }

    expect(degrades).toEqual([
      { level: "G6", reason: "engine-load-failed", notice: "model could not be loaded", at: 0 }
    ]);
    expect(seen).toHaveLength(1);
    expect(seen[0].requestId).toBe("d16-broken");
    expect(seen[0].error).toEqual({
      code: "ARTIFACT_INVALID",
      message: "The model artifacts could not be loaded",
      recoverable: false
    });
    port.dispose();
  });
});

// Compile-time proof: the worker's structural engine projection accepts the
// real D-16 entry without any cast (divergent signatures fail `tsc` here).
const _engineShapeCheck: ComputeEngine = loadEngine(ARTIFACTS);
void _engineShapeCheck;
