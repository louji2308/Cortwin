/**
 * P5B-1 — boot loader tests: verification gate, designed failure states,
 * G3 fallback, URL state, share application and the golden chain to first
 * truth (all numbers read from the real shipped artifacts — never literals).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COMPUTE_PROTOCOL_VERSION,
  type ComputePort,
  type ComputeRequest,
  type ComputeResponse
} from "../contracts";
import { createCaseEncoder, loadEngine, type Engine } from "../domain";
import { encodeSharePayload } from "../navigation";
import { createCorTwinStore, type CorTwinStore } from "../store";
import { COMPATIBILITY_NOTICE } from "../worker";
import type { BootNotice, BootReady } from "./index";
import { bootCorTwin } from "./index";
import { MANIFEST_BLOCK_ID } from "./manifest";

const PUBLIC_DIR = fileURLToPath(new URL("../../public", import.meta.url));
const MANIFEST_TEXT = readFileSync(join(PUBLIC_DIR, "manifest.json"), "utf8");

type ManifestDoc = {
  artifacts: Record<string, { path: string; sha256: string; sizeBytes: number }>;
};

function manifestDoc(): ManifestDoc {
  return JSON.parse(MANIFEST_TEXT) as ManifestDoc;
}

function readPublic(relativePath: string): Uint8Array {
  return new Uint8Array(readFileSync(join(PUBLIC_DIR, relativePath)));
}

function readPublicText(relativePath: string): string {
  return readFileSync(join(PUBLIC_DIR, relativePath), "utf8");
}

const ARTIFACT_SLOTS = ["registry", "model", "structures", "cases", "results", "fixtures"] as const;

/** File-backed fetcher with per-slot overrides (corruption / size tests). */
function fileFetch(
  overrides: Partial<Record<(typeof ARTIFACT_SLOTS)[number], Uint8Array>> = {}
): { fetchArtifact: (path: string) => Promise<Uint8Array>; fetched: string[] } {
  const fetched: string[] = [];
  const fetchArtifact = async (path: string): Promise<Uint8Array> => {
    fetched.push(path);
    const slot = ARTIFACT_SLOTS.find((key) => manifestDoc().artifacts[key].path === path);
    if (slot !== undefined && overrides[slot] !== undefined) {
      return overrides[slot] as Uint8Array;
    }
    return readPublic(path);
  };
  return { fetchArtifact, fetched };
}

function freshEngine(): Engine {
  return loadEngine({
    model: JSON.parse(readPublicText("model.json")) as unknown,
    registry: JSON.parse(readPublicText("registry.json")) as Parameters<typeof loadEngine>[0]["registry"]
  });
}

/** Engine-backed port that answers synchronously (deterministic in tests). */
function autoPort(engine: Engine): ComputePort & { requests: ComputeRequest[] } {
  const listeners = new Set<(response: ComputeResponse) => void>();
  const requests: ComputeRequest[] = [];
  return {
    requests,
    submit(request: ComputeRequest): void {
      requests.push(request);
      const response = engine.execute(request);
      for (const listener of [...listeners]) listener(response);
    },
    subscribe(listener: (response: ComputeResponse) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}

/**
 * Engine-backed port that records every request and answers ONLY when the
 * test delivers a specific index — the harness for delayed/stale traffic.
 */
function deferredPort(
  engine: Engine
): ComputePort & { requests: ComputeRequest[]; deliver(index: number): void } {
  const listeners = new Set<(response: ComputeResponse) => void>();
  const requests: ComputeRequest[] = [];
  return {
    requests,
    submit(request: ComputeRequest): void {
      requests.push(request);
    },
    deliver(index: number): void {
      const request = requests[index];
      if (request === undefined) throw new Error(`no request recorded at index ${index}`);
      const response = engine.execute(request);
      for (const listener of [...listeners]) listener(response);
    },
    subscribe(listener: (response: ComputeResponse) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}

async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("waitFor timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const stores: CorTwinStore[] = [];
const disposers: Array<() => void> = [];

function newStore(): CorTwinStore {
  const store = createCorTwinStore({ settleMs: 60_000 });
  stores.push(store);
  return store;
}

function readyOf(result: Awaited<ReturnType<typeof bootCorTwin>>): BootReady {
  if (result.status !== "ready") {
    throw new Error(`expected ready boot, got ${result.error.code}: ${result.error.message}`);
  }
  return result;
}

afterEach(() => {
  while (disposers.length > 0) (disposers.pop() as () => void)();
  while (stores.length > 0) (stores.pop() as CorTwinStore).dispose();
});

describe("golden boot — real artifacts to first truth", () => {
  it("verifies all six artifacts, falls back to the main thread and commits real probability", async () => {
    const store = newStore();
    const { fetchArtifact, fetched } = fileFetch();
    const notices: BootNotice[] = [];
    const result = readyOf(
      await bootCorTwin({
        store,
        manifest: MANIFEST_TEXT,
        fetchArtifact,
        onNotice: (level, code, message) => notices.push({ level, code, message })
      })
    );
    disposers.push(result.dispose);

    expect(result.computeMode).toBe("main-thread");
    expect(result.modelId).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(result.modelId).toBe(result.manifest.modelId);
    expect(result.registry.features).toHaveLength(54);
    expect(result.caseId).toBe("hypo1");
    expect(result.revision).toBe(1);
    expect(result.artifacts.results, "results.json is available in this run").not.toBeNull();
    expect(result.artifacts.results?.schemaVersion).toBe("1.0.0");
    expect(result.artifacts.structureNodeNames).toEqual(
      expect.arrayContaining(["HEART", "AORTA", "LAD", "LCX", "RCA"])
    );

    const declared = ARTIFACT_SLOTS.map((key) => manifestDoc().artifacts[key].path);
    expect([...fetched].sort()).toEqual([...declared].sort());

    const state = store.getState();
    expect(state.bundle.status).toBe("ready");
    expect(state.bundle.registry).not.toBeNull();
    expect(state.bundle.modelMetadata?.featureCount).toBe(54);
    expect(state.cases.map((entry) => entry.id)).toContain("hypo1");

    const degradation = notices.find((notice) => notice.level === "G3");
    expect(degradation).toMatchObject({
      code: "worker-construction-failed",
      message: COMPATIBILITY_NOTICE
    });
    expect(notices.some((notice) => notice.level === "info")).toBe(false);

    await waitFor(() => store.getState().eval.current !== null);
    const after = store.getState();
    const evaluation = after.eval.current;
    expect(evaluation).not.toBeNull();
    expect(evaluation?.revision).toBe(1);
    expect(after.eval.status).toBe("ready");
    expect(after.eval.error).toBeNull();

    const targetIds = ["CAD", "LAD", "LCX", "RCA"] as const;
    for (const targetId of targetIds) {
      const probability = evaluation?.targets[targetId].probability ?? Number.NaN;
      expect(Number.isFinite(probability)).toBe(true);
      expect(probability).toBeGreaterThanOrEqual(0);
      expect(probability).toBeLessThanOrEqual(1);
    }

    // System truth: the store's numbers equal a fresh engine run on the same case.
    const encoded = createCaseEncoder()({
      registry: result.registry,
      values: after.case.values,
      providedFeatures: after.case.providedFeatures,
      providedModalities: after.case.providedModalities
    });
    const expected = result.engine.execute({
      protocolVersion: COMPUTE_PROTOCOL_VERSION,
      requestId: "boot-parity-1",
      channel: "case",
      revision: after.case.revision,
      lane: "L0",
      operation: "evaluate",
      featureVector: encoded.featureVector,
      observedMask: encoded.observedMask
    });
    expect(expected.status).toBe("ok");
    for (const targetId of targetIds) {
      expect(evaluation?.targets[targetId].probability).toBeCloseTo(
        expected.evaluation?.targets[targetId].probability ?? Number.NaN,
        10
      );
    }
    expect(evaluation?.headlineCad.probability).toBeCloseTo(
      expected.evaluation?.headlineCad.probability ?? Number.NaN,
      10
    );

    store.commitNow();
    expect(store.getState().eval.committed).not.toBeNull();
    expect(store.getState().case.committedRevision).toBe(1);
  });

  it("boots into an injected port without creating a worker", async () => {
    const store = newStore();
    const { fetchArtifact } = fileFetch();
    const engine = freshEngine();
    const port = autoPort(engine);
    const result = readyOf(
      await bootCorTwin({ store, manifest: MANIFEST_TEXT, fetchArtifact, computePort: port })
    );
    disposers.push(result.dispose);
    expect(result.computeMode).toBe("injected");
    // Boot lands the deterministic default target (C-10 resolver default:
    // registry.targets[0] = CAD), and the store's frozen C-07 lane table
    // answers a selected-target change with an L1 explain — so the first
    // compute loop is L0 evaluate then L1 explain, both at revision 1.
    expect(port.requests.map((request) => request.operation)).toEqual([
      "evaluate",
      "explain"
    ]);
    expect(port.requests.map((request) => request.lane)).toEqual(["L0", "L1"]);
    expect(port.requests[0]?.revision).toBe(1);
    expect(port.requests[1]?.targetId).toBe("CAD");
  });

  it("boots from the inlined cortwin-manifest DOM block when nothing is injected", async () => {
    const store = newStore();
    const { fetchArtifact } = fileFetch();
    vi.stubGlobal("document", {
      getElementById: (id: string) =>
        id === MANIFEST_BLOCK_ID ? { textContent: MANIFEST_TEXT } : null
    });
    try {
      const result = readyOf(
        await bootCorTwin({ store, fetchArtifact, computePort: autoPort(freshEngine()) })
      );
      disposers.push(result.dispose);
      expect(result.manifest.schemaVersion).toBe("1.0.0");
      expect(result.manifest.modelId).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(result.caseId).toBe("hypo1");
      expect(result.revision).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("designed failure states — verification gate", () => {
  it("fails typed when the inlined manifest is missing", async () => {
    const store = newStore();
    const result = await bootCorTwin({ store, readManifestText: () => null });
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.error.code).toBe("MANIFEST_MISSING");
    expect(result.error.recovery.length).toBeGreaterThan(0); // designed recovery hint
    expect(result.notices.at(-1)).toMatchObject({ level: "G6", code: "MANIFEST_MISSING" });
    const state = store.getState();
    expect(state.bundle.status).toBe("error");
    expect(state.bundle.registry).toBeNull();
    expect(state.case.revision).toBe(0);
    expect(state.eval.current).toBeNull();
    expect(state.eval.status).toBe("idle");
  });

  it("fails typed when the manifest is malformed", async () => {
    const store = newStore();
    const result = await bootCorTwin({ store, manifest: "{oops" });
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.error.code).toBe("MANIFEST_MALFORMED");
    expect(store.getState().bundle.status).toBe("error");
  });

  it("fails typed when the manifest schemaVersion is unsupported", async () => {
    const store = newStore();
    const doc = JSON.parse(MANIFEST_TEXT) as Record<string, unknown>;
    doc.schemaVersion = "9.9.9";
    const result = await bootCorTwin({ store, manifest: doc });
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.error.code).toBe("MANIFEST_UNSUPPORTED");
    expect(store.getState().bundle.status).toBe("error");
  });

  it("never fetches anything when a manifest path is not same-origin relative", async () => {
    const store = newStore();
    const { fetchArtifact, fetched } = fileFetch();
    const doc = JSON.parse(MANIFEST_TEXT) as ManifestDoc;
    doc.artifacts.results.path = "https://evil.example/results.json";
    const result = await bootCorTwin({ store, manifest: doc, fetchArtifact });
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.error.code).toBe("MANIFEST_UNSUPPORTED");
    expect(fetched).toEqual([]);
  });

  it.each(ARTIFACT_SLOTS)("rejects a corrupted %s artifact with no partial engine", async (slot) => {
    const store = newStore();
    const bytes = readPublic(manifestDoc().artifacts[slot].path);
    bytes[Math.floor(bytes.length / 2)] ^= 0xff; // flip one byte, keep the length
    const { fetchArtifact } = fileFetch({ [slot]: bytes });
    const result = await bootCorTwin({ store, manifest: MANIFEST_TEXT, fetchArtifact });
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.error.code).toBe("ARTIFACT_HASH_MISMATCH");
    expect(result.error.message).toContain(`"${slot}"`);
    const state = store.getState();
    expect(state.bundle.status).toBe("error");
    expect(state.bundle.registry).toBeNull();
    expect(state.bundle.manifest).toBeNull();
    expect(state.case.revision).toBe(0);
    expect(state.eval.current).toBeNull();
  });

  it("rejects a truncated artifact on size before hash", async () => {
    const store = newStore();
    const full = readPublic(manifestDoc().artifacts.cases.path);
    const truncated = full.slice(0, full.length - 1);
    const { fetchArtifact } = fileFetch({ cases: truncated });
    const result = await bootCorTwin({ store, manifest: MANIFEST_TEXT, fetchArtifact });
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.error.code).toBe("ARTIFACT_SIZE_MISMATCH");
    expect(store.getState().bundle.status).toBe("error");
  });

  /**
   * FM-10 → Architecture §16.1 G5 (C-CONF-04 arbiter): the AVAILABILITY of
   * `results.json` is survivable, its INTEGRITY never is.
   */
  it("keeps boot alive when results.json cannot be fetched (G5), never ready-without-bytes", async () => {
    const store = newStore();
    const base = fileFetch();
    const notices: BootNotice[] = [];
    const resultsPath = manifestDoc().artifacts.results.path;
    const result = readyOf(
      await bootCorTwin({
        store,
        manifest: MANIFEST_TEXT,
        fetchArtifact: async (path) => {
          if (path === resultsPath) throw new Error("network down");
          return base.fetchArtifact(path);
        },
        onNotice: (level, code, message) => notices.push({ level, code, message })
      })
    );
    disposers.push(result.dispose);

    // Boot continues: no G6 block, the engine and the catalog are live.
    expect(result.artifacts.results).toBeNull();
    const state = store.getState();
    expect(state.bundle.status).toBe("ready");
    expect(state.bundle.registry).not.toBeNull();
    // The absence is recorded as `error`, never as `ready` with a null slot.
    expect(state.bundle.results).toBeNull();
    expect(state.bundle.resultsStatus).toBe("error");
    expect(
      notices.find((notice) => notice.code === "RESULTS_UNAVAILABLE"),
      "the G5 state must be announced, never silent"
    ).toMatchObject({ level: "info" });

    // Explore's truth is untouched: a real evaluation still lands.
    await waitFor(() => store.getState().eval.current !== null);
    expect(store.getState().eval.status).toBe("ready");
    expect(store.getState().eval.error).toBeNull();
  });

  it("still blocks boot (G6) when a required artifact cannot be fetched", async () => {
    const store = newStore();
    const base = fileFetch();
    const casesPath = manifestDoc().artifacts.cases.path;
    const result = await bootCorTwin({
      store,
      manifest: MANIFEST_TEXT,
      fetchArtifact: async (path) => {
        if (path === casesPath) throw new Error("network down");
        return base.fetchArtifact(path);
      }
    });
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.error.code).toBe("ARTIFACT_UNAVAILABLE");
    expect(store.getState().bundle.status).toBe("error");
    expect(store.getState().bundle.registry).toBeNull();
  });

  it("fails typed when the engine rejects a structurally broken model", async () => {
    const store = newStore();
    const broken = JSON.parse(readPublicText("model.json")) as Record<string, unknown>;
    broken.components = [];
    const bytes = new TextEncoder().encode(JSON.stringify(broken));
    const doc = JSON.parse(MANIFEST_TEXT) as ManifestDoc;
    doc.artifacts.model = {
      path: "model.json",
      sha256: createHash("sha256").update(bytes).digest("hex"),
      sizeBytes: bytes.length
    };
    const { fetchArtifact } = fileFetch({ model: bytes });
    const result = await bootCorTwin({ store, manifest: doc, fetchArtifact });
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.error.code).toBe("ENGINE_LOAD_FAILED");
    const state = store.getState();
    expect(state.bundle.status).toBe("error");
    expect(state.case.revision).toBe(0);
    expect(state.eval.current).toBeNull();
  });
});

describe("URL state", () => {
  it("lands a valid deep link with zero notices", async () => {
    const store = newStore();
    const { fetchArtifact } = fileFetch();
    const result = readyOf(
      await bootCorTwin({
        store,
        manifest: MANIFEST_TEXT,
        fetchArtifact,
        url: "#/trust/calibration?case=cohortA&target=LAD",
        computePort: autoPort(freshEngine())
      })
    );
    disposers.push(result.dispose);
    expect(result.notices).toEqual([]);
    const state = store.getState();
    expect(state.view.route).toBe("trust");
    expect(state.view.pane).toBe("calibration");
    expect(state.case.id).toBe("cohortA");
    expect(state.case.revision).toBe(1);
    expect(state.selection.targetId).toBe("LAD");
    await waitFor(() => store.getState().eval.current !== null);
    expect(store.getState().eval.current?.revision).toBe(1);
  });

  it("falls back to the default case with a notice for an unknown case id", async () => {
    const store = newStore();
    const { fetchArtifact } = fileFetch();
    const result = readyOf(
      await bootCorTwin({
        store,
        manifest: MANIFEST_TEXT,
        fetchArtifact,
        url: "#/explore?case=nope",
        computePort: autoPort(freshEngine())
      })
    );
    disposers.push(result.dispose);
    expect(result.caseId).toBe("hypo1");
    expect(result.revision).toBe(1);
    expect(result.notices).toEqual([
      expect.objectContaining({ level: "info", code: "UNKNOWN_CASE_ID" })
    ]);
    expect(store.getState().case.id).toBe("hypo1");
  });

  it("applies a well-formed share payload over its base case", async () => {
    const store = newStore();
    const { fetchArtifact } = fileFetch();
    const token = encodeSharePayload({
      version: 1,
      baseCase: "hypo1",
      values: { Age: 70 },
      provided: { Age: true }
    });
    const result = readyOf(
      await bootCorTwin({
        store,
        manifest: MANIFEST_TEXT,
        fetchArtifact,
        url: `#/explore?share=${token}`,
        computePort: autoPort(freshEngine())
      })
    );
    disposers.push(result.dispose);
    expect(result.notices).toEqual([]);
    expect(result.caseId).toBe("hypo1");
    // C-09 revision law: case select (1) + the Age field edit (2) + the
    // share's provided-flag intent (3). `setFeatureProvided` increments even
    // when the flag is already true — exactly what the authoritative
    // store/intents.test.ts asserts (CASE_A DM: true → still +1).
    expect(result.revision).toBe(3);
    const state = store.getState();
    expect(state.case.values.Age).toBe(70);
    expect(state.case.providedFeatures.Age).toBe(true);
    await waitFor(() => store.getState().eval.current !== null);
    expect(store.getState().eval.current?.revision).toBe(3);
  });

  it("ignores a share payload that names a different case than the link", async () => {
    const store = newStore();
    const { fetchArtifact } = fileFetch();
    const token = encodeSharePayload({
      version: 1,
      baseCase: "hypo1",
      values: { Age: 70 },
      provided: { Age: true }
    });
    const result = readyOf(
      await bootCorTwin({
        store,
        manifest: MANIFEST_TEXT,
        fetchArtifact,
        url: `#/explore?case=cohortA&share=${token}`,
        computePort: autoPort(freshEngine())
      })
    );
    disposers.push(result.dispose);
    expect(result.notices).toEqual([
      expect.objectContaining({ level: "info", code: "MALFORMED_SHARE" })
    ]);
    const state = store.getState();
    expect(state.case.id).toBe("cohortA");
    expect(state.case.revision).toBe(1);
    expect(state.case.values.Age).not.toBe(70);
  });
});

describe("INV-13 — a delayed stale response never becomes current", () => {
  it("edits to revision 2, discards the delayed revision-1 evaluation, commits the edited truth", async () => {
    const store = newStore();
    const { fetchArtifact } = fileFetch();
    const engine = freshEngine();
    const port = deferredPort(engine);
    const result = readyOf(
      await bootCorTwin({ store, manifest: MANIFEST_TEXT, fetchArtifact, computePort: port })
    );
    disposers.push(result.dispose);
    expect(result.revision).toBe(1);
    expect(port.requests.map((request) => request.operation)).toEqual(["evaluate", "explain"]);

    // Edit: revision bumps exactly once (C-09 field edit → +1).
    expect(store.intents.case.setValue("Age", 70).ok).toBe(true);
    expect(store.getState().case.revision).toBe(2);
    expect(port.requests.map((request) => request.operation)).toEqual([
      "evaluate",
      "explain",
      "evaluate"
    ]);

    // The DELAYED revision-1 evaluation arrives after the edit. It must be
    // discarded before any payload is read: never current, never an error.
    port.deliver(0);
    expect(store.getState().eval.current).toBeNull();
    expect(store.getState().eval.status).toBe("computing");
    expect(store.getState().eval.error).toBeNull();

    // The live revision-2 evaluation arrives and becomes current truth.
    port.deliver(2);
    const live = store.getState();
    expect(live.eval.current?.revision).toBe(2);
    expect(live.eval.status).toBe("ready");
    expect(live.eval.error).toBeNull();

    store.commitNow();
    expect(store.getState().case.committedRevision).toBe(2);
    expect(store.getState().eval.committed?.revision).toBe(2);
  });
});

describe("notice hygiene — patient values never reach a notice", () => {
  function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  it("keeps every success and failure notice free of values from the real cases artifact", async () => {
    const notices: BootNotice[] = [];
    const onNotice = (level: BootNotice["level"], code: BootNotice["code"], message: string) => {
      notices.push({ level, code, message });
    };

    // 1) G6 — manifest absent.
    await bootCorTwin({ store: newStore(), readManifestText: () => null, onNotice });

    // 2) G6 — manifest not JSON.
    await bootCorTwin({ store: newStore(), manifest: "{oops", onNotice });

    // 3) G6 — corrupted artifact fails the SHA-256 check.
    const corrupted = readPublic(manifestDoc().artifacts.results.path);
    corrupted[Math.floor(corrupted.length / 2)] ^= 0xff;
    const f3 = fileFetch({ results: corrupted });
    await bootCorTwin({
      store: newStore(),
      manifest: MANIFEST_TEXT,
      fetchArtifact: f3.fetchArtifact,
      onNotice
    });

    // 4) G6 — engine rejects a structurally broken model (cause is rendered).
    const broken = JSON.parse(readPublicText("model.json")) as Record<string, unknown>;
    broken.components = [];
    const brokenBytes = new TextEncoder().encode(JSON.stringify(broken));
    const brokenDoc = JSON.parse(MANIFEST_TEXT) as ManifestDoc;
    brokenDoc.artifacts.model = {
      path: "model.json",
      sha256: createHash("sha256").update(brokenBytes).digest("hex"),
      sizeBytes: brokenBytes.length
    };
    const f4 = fileFetch({ model: brokenBytes });
    await bootCorTwin({
      store: newStore(),
      manifest: brokenDoc,
      fetchArtifact: f4.fetchArtifact,
      onNotice
    });

    // 5) G6 — a fetch failure whose CAUSE carries patient-like text: the
    //    cause must be dropped, never rendered into the notice.
    const hostile = async (): Promise<Uint8Array> => {
      throw new Error("patient Age=70 SUSPECT-VALUE");
    };
    await bootCorTwin({
      store: newStore(),
      manifest: MANIFEST_TEXT,
      fetchArtifact: hostile,
      onNotice
    });

    // 6) G3 — the real default worker port fails construction in node and
    //    falls back to the main thread with its compatibility notice.
    const f6 = fileFetch();
    const g3 = readyOf(
      await bootCorTwin({
        store: newStore(),
        manifest: MANIFEST_TEXT,
        fetchArtifact: f6.fetchArtifact,
        onNotice
      })
    );
    disposers.push(g3.dispose);

    // 7) info — unknown case id AND a share payload editing Age to 70.
    const token = encodeSharePayload({
      version: 1,
      baseCase: "hypo1",
      values: { Age: 70 },
      provided: { Age: true }
    });
    const f7 = fileFetch();
    const shared = readyOf(
      await bootCorTwin({
        store: newStore(),
        manifest: MANIFEST_TEXT,
        fetchArtifact: f7.fetchArtifact,
        url: `#/explore?case=nope&share=${token}`,
        computePort: autoPort(freshEngine()),
        onNotice
      })
    );
    disposers.push(shared.dispose);
    expect(shared.caseId).toBe("hypo1");
    expect(shared.revision).toBe(3); // share applied over the default case

    // Anti-vacuous guard: every scenario class actually produced a notice.
    const codes = new Set(notices.map((notice) => notice.code));
    for (const expected of [
      "MANIFEST_MISSING",
      "MANIFEST_MALFORMED",
      "ARTIFACT_HASH_MISMATCH",
      "ENGINE_LOAD_FAILED",
      "ARTIFACT_UNAVAILABLE",
      "worker-construction-failed",
      "UNKNOWN_CASE_ID"
    ]) {
      expect(codes.has(expected as BootNotice["code"])).toBe(true);
    }

    // Corpus: every value the real cases artifact ships, plus the sentinels.
    const casesDoc = JSON.parse(readPublicText("cases.json")) as {
      cases: Array<{ values: Record<string, unknown> }>;
    };
    const corpus = new Set<string>(["70", "Age=70", "SUSPECT-VALUE"]);
    for (const entry of casesDoc.cases) {
      for (const value of Object.values(entry.values)) {
        if (typeof value === "number") {
          const text = String(value);
          const significant = Number.isInteger(value) ? Math.abs(value) >= 10 : text.length >= 3;
          if (significant) corpus.add(text);
        } else if (typeof value === "string" && value.length >= 2) {
          corpus.add(value);
        }
      }
    }
    expect(corpus.size).toBeGreaterThan(20); // the scan has real teeth

    for (const notice of notices) {
      for (const valueToken of corpus) {
        const pattern = new RegExp(`(?<![\\w.])${escapeRegExp(valueToken)}(?![\\w.])`, "i");
        expect(
          pattern.test(notice.message),
          `notice [${notice.code}] leaked a case value: "${valueToken}" in "${notice.message}"`
        ).toBe(false);
      }
    }
  });
});
