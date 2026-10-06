import { describe, expect, it } from "vitest";
import {
  COMPUTE_PROTOCOL_VERSION,
  type ComputeRequest,
  type ComputeResponse,
} from "../contracts";
import type { Registry } from "../contracts/artifacts";
import type { WorkerControlMessage } from "./control";
import { createMainComputePort } from "./mainComputePort";
import type { ComputeEngine } from "./types";
import { createWorkerComputePort } from "./workerComputePort";
import type { WorkerLike } from "./workerComputePort";
import { createWorkerHost } from "./workerHost";

/**
 * C-07 worker/main equivalence: the SAME request, driven through (a) the
 * worker boundary with structured-clone isolation on BOTH directions of
 * `postMessage`, and (b) the main-thread adapter, must produce
 * byte-identical `JSON.stringify` responses.
 *
 * Worker mode = createWorkerComputePort ⇄ structuredClone ⇄ createWorkerHost
 * Main mode   = createMainComputePort
 * Both share: the same validateRequest, the same createComputeRuntime, the
 * same envelope echo, injected now/schedule (timing = 0 both sides), the
 * same featureCount, and an engine produced by the same factory. Any drift
 * in framing, validation, supersession, normalization or error vocabulary
 * shows up as a string mismatch here.
 */

const ARTIFACTS = { model: {}, registry: {} as Registry } as const;

type Pair = {
  workerPort: ReturnType<typeof createWorkerComputePort>;
  mainPort: ReturnType<typeof createMainComputePort>;
  workerSeen: ComputeResponse[];
  mainSeen: ComputeResponse[];
  flush: () => void;
  dispose: () => void;
};

function createEquivalenceEngine(): ComputeEngine {
  return {
    modelId: "sha256:equivalence",
    execute(request: ComputeRequest): ComputeResponse {
      const envelope = {
        protocolVersion: COMPUTE_PROTOCOL_VERSION,
        requestId: request.requestId,
        channel: request.channel,
        revision: request.revision,
        lane: request.lane,
        operation: request.operation
      };
      switch (request.operation) {
        case "explain":
          return {
            ...envelope,
            status: "ok",
            explanation: {
              revision: request.revision,
              targetId: request.targetId,
              referenceMargin: -0.42,
              outputMargin: 0.13,
              efficiencyResidual: 1e-7
            }
          } as unknown as ComputeResponse;
        case "ladder":
          return {
            ...envelope,
            status: "ok",
            ladder: {
              history: { revision: request.revision },
              exam: null,
              ecg: null
            }
          } as unknown as ComputeResponse;
        case "integrity":
          return {
            ...envelope,
            status: "ok",
            integrity: { fixturesChecked: 12, fixturesPassed: 12 }
          } as unknown as ComputeResponse;
        default:
          return {
            ...envelope,
            status: "ok",
            evaluation: {
              revision: request.revision,
              observedFeatureIds: ["age", "sex"],
              targets: { LAD: { probability: 0.617 } },
              rangeFlags: { age: false }
            }
          } as unknown as ComputeResponse;
      }
    }
  };
}

function createPair(engineFactory: () => ComputeEngine = createEquivalenceEngine): Pair {
  const tasks: Array<() => void> = [];
  const schedule = (task: () => void): void => {
    tasks.push(task);
  };

  let messageListener: ((event: unknown) => void) | null = null;
  let deliverToMain: ((data: unknown) => void) | null = null;

  const host = createWorkerHost({
    post: (message: WorkerControlMessage | ComputeResponse) => {
      // worker → main crosses a structured-clone boundary, like a real Worker
      deliverToMain?.(structuredClone(message));
    },
    loadEngine: () => engineFactory(),
    featureCount: 4,
    now: () => 0,
    schedule
  });

  const fakeWorker: WorkerLike = {
    postMessage: (message: unknown) => {
      // main → worker crosses a structured-clone boundary too
      host.handleMessage(structuredClone(message));
    },
    addEventListener: (type, listener) => {
      if (type === "message") messageListener = listener;
    },
    removeEventListener: (type, listener) => {
      if (type === "message" && messageListener === listener) messageListener = null;
    },
    terminate: () => {
      /* nothing to tear down in the harness */
    }
  };
  deliverToMain = (data) => {
    messageListener?.({ data });
  };

  const workerPort = createWorkerComputePort({
    createWorker: () => fakeWorker,
    featureCount: 4,
    now: () => 0,
    schedule
  });
  workerPort.initialize(ARTIFACTS); // control round-trip is synchronous here

  const mainPort = createMainComputePort(engineFactory(), {
    featureCount: 4,
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

  const pair: Pair = {
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
    },
    dispose: () => {
      workerPort.dispose();
    }
  };
  return pair;
}

function makeRequest(overrides: Partial<ComputeRequest> = {}): ComputeRequest {
  return {
    protocolVersion: COMPUTE_PROTOCOL_VERSION,
    requestId: `eq-${Math.random().toString(36).slice(2, 8)}`,
    channel: "case",
    revision: 1,
    lane: "L0",
    operation: "evaluate",
    featureVector: new Float32Array([62, 1, 0, 80.5]),
    observedMask: new Uint8Array([1, 1, 1, 1]),
    ...overrides
  };
}

function expectSameResponses(pair: Pair, fromIndex: number, label: string): void {
  expect(pair.workerSeen.length, `${label}: worker response count`).toBe(
    pair.mainSeen.length
  );
  for (let index = fromIndex; index < pair.workerSeen.length; index += 1) {
    expect(JSON.stringify(pair.workerSeen[index]), `${label} [${index}]`).toBe(
      JSON.stringify(pair.mainSeen[index])
    );
  }
}

describe("worker ↔ main equivalence — byte-identical C-07 traffic", () => {
  it("produces identical responses for the full operation matrix", () => {
    const pair = createPair();
    try {
      const cases: ComputeRequest[] = [
        makeRequest({ requestId: "eq-evaluate" }),
        makeRequest({
          requestId: "eq-explain",
          revision: 2,
          lane: "L1",
          operation: "explain",
          targetId: "LAD"
        }),
        makeRequest({ requestId: "eq-ladder", revision: 3, lane: "L2", operation: "ladder" }),
        makeRequest({
          requestId: "eq-integrity",
          channel: "verification",
          revision: 1,
          lane: "L3",
          operation: "integrity",
          verificationFixtureId: "fx-001"
        }),
        makeRequest({ requestId: "eq-bad-mask", observedMask: new Uint8Array([1, 9, 1, 1]) }),
        makeRequest({
          requestId: "eq-nonfinite",
          featureVector: new Float32Array([Number.NaN, 1, 0, 80.5]),
          observedMask: new Uint8Array([1, 1, 1, 1])
        }),
        makeRequest({ requestId: "eq-unsupported", operation: "predict" as "evaluate" }),
        makeRequest({ requestId: "eq-bad-version", protocolVersion: "9.9.9" as "1.0.0" }),
        makeRequest({ requestId: "eq-no-target", lane: "L1", operation: "explain" }),
        makeRequest({ requestId: "eq-length", observedMask: new Uint8Array([1, 1]) })
      ];

      for (const request of cases) {
        const before = pair.workerSeen.length;
        pair.workerPort.submit(request);
        pair.mainPort.submit(request);
        pair.flush();
        expectSameResponses(pair, before, request.requestId);
      }

      expect(pair.workerSeen).toHaveLength(cases.length);
      expect(pair.mainSeen).toHaveLength(cases.length);
      // both sides really answered every case (4 ok payloads + 6 typed errors)
      expect(pair.workerSeen.filter((response) => response.status === "ok")).toHaveLength(4);
      expect(pair.workerSeen.filter((response) => response.status === "error")).toHaveLength(6);
    } finally {
      pair.dispose();
    }
  });

  it("is identical under in-lane newest-revision supersession", () => {
    const pair = createPair();
    try {
      const older = makeRequest({ requestId: "eq-old", revision: 1 });
      const newer = makeRequest({ requestId: "eq-new", revision: 2 });
      pair.workerPort.submit(older);
      pair.workerPort.submit(newer);
      pair.mainPort.submit(older);
      pair.mainPort.submit(newer);
      pair.flush();

      expect(pair.workerSeen).toHaveLength(1);
      expect(pair.workerSeen[0].requestId).toBe("eq-new");
      expect(pair.workerSeen[0].revision).toBe(2);
      expectSameResponses(pair, 0, "supersession");
    } finally {
      pair.dispose();
    }
  });

  it("is identical for equal-revision duplicates (both run)", () => {
    const pair = createPair();
    try {
      const one = makeRequest({ requestId: "eq-dup-1", revision: 4 });
      const two = makeRequest({ requestId: "eq-dup-2", revision: 4 });
      pair.workerPort.submit(one);
      pair.workerPort.submit(two);
      pair.mainPort.submit(one);
      pair.mainPort.submit(two);
      pair.flush();

      expect(pair.workerSeen).toHaveLength(2);
      expect(pair.mainSeen).toHaveLength(2);
      expectSameResponses(pair, 0, "equal-revision");
    } finally {
      pair.dispose();
    }
  });

  it("is identical when the engine throws (typed INTERNAL failure, timing 0)", () => {
    const pair = createPair(() => ({
      modelId: "sha256:throwing",
      execute: () => {
        throw new Error("engine exploded with value 42.4242");
      }
    }));
    try {
      const request = makeRequest({ requestId: "eq-throw" });
      pair.workerPort.submit(request);
      pair.mainPort.submit(request);
      pair.flush();

      expect(pair.workerSeen).toHaveLength(1);
      expect(pair.workerSeen[0].error?.code).toBe("INTERNAL_COMPUTE_FAILURE");
      expect(JSON.stringify(pair.workerSeen[0])).not.toContain("42.4242");
      expectSameResponses(pair, 0, "engine-throw");
    } finally {
      pair.dispose();
    }
  });

  it("is identical for engine-declared error passthrough", () => {
    const pair = createPair(() => ({
      modelId: "sha256:error",
      execute: () =>
        ({
          status: "error",
          error: {
            code: "ARTIFACT_INVALID",
            message: "model bundle mismatch",
            recoverable: false
          }
        }) as ComputeResponse
    }));
    try {
      const request = makeRequest({ requestId: "eq-engine-error" });
      pair.workerPort.submit(request);
      pair.mainPort.submit(request);
      pair.flush();

      expect(pair.workerSeen).toHaveLength(1);
      expect(pair.workerSeen[0].error?.code).toBe("ARTIFACT_INVALID");
      expectSameResponses(pair, 0, "engine-error");
    } finally {
      pair.dispose();
    }
  });
});
