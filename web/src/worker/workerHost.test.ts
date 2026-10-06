import { describe, expect, it, vi } from "vitest";
import {
  COMPUTE_PROTOCOL_VERSION,
  type ComputeRequest,
  type ComputeResponse,
} from "../contracts";
import type { Registry } from "../contracts/artifacts";
import {
  createInitMessage,
  type EngineArtifactsPayload,
  type WorkerControlMessage,
} from "./control";
import type { RuntimeErrorInfo } from "./runtime";
import type { ComputeEngine } from "./types";
import { createWorkerHost, type WorkerHost } from "./workerHost";

const ARTIFACTS = { model: { kind: "stub" }, registry: {} as Registry } as const;

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

function createFakeEngine(): ComputeEngine {
  return {
    modelId: "sha256:fixture",
    execute(request: ComputeRequest): ComputeResponse {
      if (request.operation === "explain") {
        return {
          status: "ok",
          explanation: { revision: request.revision, targetId: request.targetId }
        } as unknown as ComputeResponse;
      }
      return {
        status: "ok",
        evaluation: { revision: request.revision }
      } as unknown as ComputeResponse;
    }
  };
}

type Harness = {
  host: WorkerHost;
  posts: Array<WorkerControlMessage | ComputeResponse>;
  errors: RuntimeErrorInfo[];
  flush: () => void;
};

function createHarness(
  loadEngine: (artifacts: EngineArtifactsPayload) => ComputeEngine = () => createFakeEngine()
): Harness {
  const posts: Array<WorkerControlMessage | ComputeResponse> = [];
  const errors: RuntimeErrorInfo[] = [];
  const tasks: Array<() => void> = [];
  const host = createWorkerHost({
    post: (message) => {
      posts.push(message);
    },
    loadEngine,
    featureCount: 4,
    now: () => 0,
    schedule: (task) => {
      tasks.push(task);
    },
    onError: (info) => {
      errors.push(info);
    }
  });
  return {
    host,
    posts,
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
    }
  };
}

function isControl(
  message: WorkerControlMessage | ComputeResponse
): message is WorkerControlMessage {
  return "kind" in message;
}

describe("worker host — init/ready and buffered compute", () => {
  it("loads the engine and posts ready with modelId", () => {
    const h = createHarness();
    h.host.handleMessage(createInitMessage(ARTIFACTS));
    expect(h.posts).toHaveLength(1);
    expect(h.posts[0]).toEqual({
      kind: "ready",
      protocolVersion: "1.0.0",
      modelId: "sha256:fixture"
    });
    expect(h.errors).toHaveLength(0);
  });

  it("answers compute traffic through the shared runtime (echo + timing)", () => {
    const h = createHarness();
    h.host.handleMessage(createInitMessage(ARTIFACTS));
    const request = makeRequest({ requestId: "ct-host", revision: 5, lane: "L2", operation: "ladder" });
    h.host.handleMessage(request);
    h.flush();

    expect(h.posts).toHaveLength(2);
    const response = h.posts[1] as ComputeResponse;
    expect(response).toMatchObject({
      protocolVersion: "1.0.0",
      requestId: "ct-host",
      revision: 5,
      lane: "L2",
      operation: "ladder",
      status: "ok",
      timing: { computeMs: 0 }
    });
    expect(isControl(response)).toBe(false);
  });

  it("buffers compute that arrives before init and replays it after ready, in order", () => {
    const h = createHarness();
    const first = makeRequest({ requestId: "first" });
    const second = makeRequest({ requestId: "second" });
    h.host.handleMessage(first);
    h.host.handleMessage(second);
    expect(h.posts).toHaveLength(0);

    h.host.handleMessage(createInitMessage(ARTIFACTS));
    h.flush();

    const kinds = h.posts.map((message) => (isControl(message) ? message.kind : "response"));
    expect(kinds).toEqual(["ready", "response", "response"]);
    expect((h.posts[1] as ComputeResponse).requestId).toBe("first");
    expect((h.posts[2] as ComputeResponse).requestId).toBe("second");
  });

  it("keeps pre-init compute buffered without answering prematurely", () => {
    const h = createHarness();
    h.host.handleMessage(makeRequest({ requestId: "early" }));
    expect(h.posts).toHaveLength(0); // buffered, not answered, not dropped
    h.host.handleMessage(createInitMessage(ARTIFACTS));
    h.flush();
    expect((h.posts[1] as ComputeResponse).requestId).toBe("early");
  });
});

describe("worker host — engine load failure (G6 path)", () => {
  it("posts engine-error with the fixed message and answers later traffic with it", () => {
    const h = createHarness(() => {
      throw new Error("schema mismatch at field 17 value 42.4242");
    });
    const buffered = makeRequest({ requestId: "buffered" });
    h.host.handleMessage(buffered);

    h.host.handleMessage(createInitMessage(ARTIFACTS));
    expect(h.posts).toHaveLength(1);
    expect(h.posts[0]).toEqual({
      kind: "engine-error",
      protocolVersion: "1.0.0",
      error: {
        code: "ARTIFACT_INVALID",
        message: "The model artifacts could not be loaded",
        recoverable: false
      }
    });
    const serialized = JSON.stringify(h.posts);
    expect(serialized).not.toContain("42.4242"); // C-07 L218 hygiene

    // the buffered request is NOT answered here — the main-side fence owns it
    // (one answer per request); traffic after the failure IS answered directly.
    const late = makeRequest({ requestId: "late" });
    h.host.handleMessage(late);
    const response = h.posts[1] as ComputeResponse;
    expect(response.status).toBe("error");
    expect(response.requestId).toBe("late");
    expect(response.error).toEqual({
      code: "ARTIFACT_INVALID",
      message: "The model artifacts could not be loaded",
      recoverable: false
    });
    expect(h.errors[0].phase).toBe("transport");
    expect(h.errors[0].error.code).toBe("ARTIFACT_INVALID");
  });

  it("answers a buffered malformed request with a typed error once the load failed", () => {
    const h = createHarness(() => {
      throw new Error("nope");
    });
    h.host.handleMessage("garbage");
    h.host.handleMessage(createInitMessage(ARTIFACTS));
    h.host.handleMessage(makeRequest({ requestId: "post-fail" }));
    expect(h.posts).toHaveLength(2);
    expect((h.posts[1] as ComputeResponse).requestId).toBe("post-fail");
  });
});

describe("worker host — control hygiene", () => {
  it("reports a duplicate init without posting a second ready", () => {
    const h = createHarness();
    h.host.handleMessage(createInitMessage(ARTIFACTS));
    h.host.handleMessage(createInitMessage(ARTIFACTS));
    expect(h.posts).toHaveLength(1);
    expect(h.errors[0].error.code).toBe("MALFORMED_REQUEST");
    expect(h.errors[0].error.message).toBe(
      "Worker init message was received more than once"
    );
  });

  it("reports main→worker control messages other than init", () => {
    const h = createHarness();
    h.host.handleMessage({ kind: "ready", protocolVersion: "1.0.0", modelId: "x" });
    expect(h.errors[0].error.code).toBe("UNSUPPORTED_OPERATION");
    expect(h.posts).toHaveLength(0);
  });

  it("rejects an init with the wrong protocolVersion and allows a later valid init", () => {
    const h = createHarness();
    h.host.handleMessage({ kind: "init", protocolVersion: "9.9.9", artifacts: ARTIFACTS });
    expect(h.errors[0].error.code).toBe("MALFORMED_REQUEST");
    expect(h.posts).toHaveLength(0);

    h.host.handleMessage(createInitMessage(ARTIFACTS));
    expect(h.posts).toHaveLength(1);
    expect(isControl(h.posts[0]) && h.posts[0].kind === "ready").toBe(true);
  });

  it("answers unattributable garbage with a typed envelope once the engine is up", () => {
    const h = createHarness();
    h.host.handleMessage(createInitMessage(ARTIFACTS));
    h.host.handleMessage(42);
    h.flush();
    expect(h.posts[1]).toMatchObject({
      status: "error",
      requestId: "",
      error: { code: "MALFORMED_REQUEST" }
    });
  });
});

describe("worker host — runtime faults are reported upward, never silently", () => {
  it("forwards a G3 degraded control and the typed failure when execute throws", () => {
    const engine: ComputeEngine = {
      modelId: "sha256:boom",
      execute: () => {
        throw new Error("engine exploded");
      }
    };
    const h = createHarness(() => engine);
    h.host.handleMessage(createInitMessage(ARTIFACTS));
    h.host.handleMessage(makeRequest({ requestId: "boom" }));
    h.flush();

    expect(h.posts).toHaveLength(3); // ready, degraded, error response
    expect(isControl(h.posts[1]) && h.posts[1].kind === "degraded").toBe(true);
    if (isControl(h.posts[1]) && h.posts[1].kind === "degraded") {
      expect(h.posts[1].degrade).toEqual({
        level: "G3",
        reason: "engine-failure",
        notice: "running in compatibility mode",
        at: 0
      });
    }
    const response = h.posts[2] as ComputeResponse;
    expect(response.status).toBe("error");
    expect(response.error?.code).toBe("INTERNAL_COMPUTE_FAILURE");
    expect(h.errors[0].phase).toBe("execute");
    expect(h.errors[0].cause).toBeInstanceOf(Error);
  });

  it("signals the advisory degrade at most once across repeated failures", () => {
    const engine: ComputeEngine = {
      modelId: "sha256:boom",
      execute: () => {
        throw new Error("always");
      }
    };
    const h = createHarness(() => engine);
    h.host.handleMessage(createInitMessage(ARTIFACTS));
    h.host.handleMessage(makeRequest({ requestId: "one", revision: 1 }));
    h.flush();
    h.host.handleMessage(makeRequest({ requestId: "two", revision: 2 }));
    h.flush();

    const degrades = h.posts.filter(
      (message) => isControl(message) && message.kind === "degraded"
    );
    const responses = h.posts.filter((message) => !isControl(message));
    expect(degrades).toHaveLength(1);
    expect(responses).toHaveLength(2);
    expect(h.errors).toHaveLength(2);
  });
});

describe("worker host — engine invoked exactly as the request demands", () => {
  it("passes explain requests through with their targetId", () => {
    const execute = vi.fn(createFakeEngine().execute);
    const h = createHarness(() => ({ modelId: "sha256:x", execute }));
    h.host.handleMessage(createInitMessage(ARTIFACTS));
    const request = makeRequest({
      requestId: "ct-explain",
      lane: "L1",
      operation: "explain",
      targetId: "RCA"
    });
    h.host.handleMessage(request);
    h.flush();

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][0]).toEqual(request);
    const response = h.posts[1] as ComputeResponse;
    expect(response.status).toBe("ok");
    expect(response.explanation).toEqual({ revision: 1, targetId: "RCA" });
  });
});
