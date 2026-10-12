/**
 * P6-SHELL — boot lifecycle state machine: loading → ready | failed, retry,
 * dispose-on-unmount (including the finish-after-unmount race), notice
 * collection for the G3 degraded banner, and results publication into the
 * one store. Includes the results-only retry (G5): path, byte size, SHA-256
 * and schema are re-verified against the booted manifest before anything is
 * published.
 *
 * The boot entry is injected, so this suite never fetches an artifact or
 * starts a worker; the `results` payload published to the store is the real
 * shipped `web/public/results.json`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BootOptions, BootReady, BootResult } from "../boot";
import type { BootFailure } from "../boot/errors";
import { sha256Hex } from "../boot/verify";
import type { Manifest, Results } from "../contracts";
import { createCorTwinStore, type CorTwinStore } from "../store";
import { createBootLifecycle, LOADING_PHASE, type BootPhase } from "./bootLifecycle";

const PUBLIC_DIR = fileURLToPath(new URL("../../public", import.meta.url));

const MANIFEST = JSON.parse(readFileSync(join(PUBLIC_DIR, "manifest.json"), "utf8")) as Manifest;

function realResults(): Results {
  return JSON.parse(readFileSync(join(PUBLIC_DIR, "results.json"), "utf8")) as Results;
}

/** Serves public/ artifacts by manifest path — the retry's fetch double. */
function diskFetch(path: string): Promise<Uint8Array> {
  return Promise.resolve(new Uint8Array(readFileSync(join(PUBLIC_DIR, path))));
}

/**
 * Minimal `BootReady` double: the lifecycle only ever reads `status`,
 * `artifacts.results`, `manifest` and `dispose()`, so the remaining contract
 * fields are supplied by the cast rather than fabricated one by one. The
 * manifest is the real shipped one, so a results-only retry verifies against
 * true digests.
 */
function fakeReady(
  dispose = vi.fn(),
  results: Results = realResults(),
  manifest: Manifest = MANIFEST
): BootReady {
  return {
    status: "ready",
    manifest,
    artifacts: { results, fixtures: {}, structureNodeNames: [] },
    dispose,
    notices: []
  } as unknown as BootReady;
}

function fakeFailure(overrides: Partial<BootFailure> = {}): BootFailure {
  return {
    code: "ARTIFACT_HASH_MISMATCH",
    message: "An artifact did not match the digest the manifest declares.",
    recovery: "Rebuild the bundle (`make reproduce`) and reload.",
    ...overrides
  };
}

function fakeFailedBoot(failure: BootFailure = fakeFailure()) {
  return async (): Promise<BootResult> => ({ status: "error", error: failure, notices: [] });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const stores: CorTwinStore[] = [];

function newStore(): CorTwinStore {
  const store = createCorTwinStore({ settleMs: 60_000 });
  stores.push(store);
  return store;
}

afterEach(() => {
  while (stores.length > 0) (stores.pop() as CorTwinStore).dispose();
});

describe("loading → ready", () => {
  it("reports loading first, then ready, and publishes results into the store", async () => {
    const store = newStore();
    const phases: string[] = [];
    const lifecycle = createBootLifecycle({
      boot: async () => (fakeReady()),
      store,
      onPhase: (phase) => phases.push(phase.status)
    });

    expect(lifecycle.getPhase()).toEqual(LOADING_PHASE);
    const settled = await lifecycle.start();

    expect(phases).toEqual(["loading", "ready"]);
    expect(settled.status).toBe("ready");
    expect(lifecycle.getPhase().ready).not.toBeNull();
    expect(lifecycle.getPhase().failure).toBeNull();
    expect(store.getState().bundle.resultsStatus).toBe("ready");
    expect(store.getState().bundle.results).not.toBeNull();
  });

  it("leaves the store's results slot alone when publication is switched off", async () => {
    const store = newStore();
    const lifecycle = createBootLifecycle({
      boot: async () => (fakeReady()),
      store,
      publishResults: false
    });
    await lifecycle.start();
    expect(store.getState().bundle.results).toBeNull();
    expect(store.getState().bundle.resultsStatus).toBe("not_loaded");
  });

  it("reports the phase on construction so a subscriber never misses loading", () => {
    const seen: BootPhase[] = [];
    createBootLifecycle({
      boot: async () => (fakeReady()),
      onPhase: (phase) => seen.push(phase)
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual(LOADING_PHASE);
  });
});

describe("loading → failed (designed failure, never a blank screen)", () => {
  it("surfaces the typed failure's reason and recovery with no stack trace", async () => {
    const failure = fakeFailure();
    const store = newStore();
    const phases: string[] = [];
    const lifecycle = createBootLifecycle({
      boot: fakeFailedBoot(failure),
      store,
      onPhase: (phase) => phases.push(phase.status)
    });

    const settled = await lifecycle.start();

    expect(phases).toEqual(["loading", "failed"]);
    expect(settled.status).toBe("failed");
    expect(lifecycle.getPhase().ready).toBeNull();
    expect(lifecycle.getPhase().failure).toEqual(failure);
    expect(lifecycle.getPhase().failure?.recovery).toBe(failure.recovery);
    expect(lifecycle.getPhase().failure).not.toHaveProperty("stack");
    expect(store.getState().bundle.results).toBeNull();
  });

  it("converts a throwing boot entry into a designed failure instead of a rejection", async () => {
    const store = newStore();
    const lifecycle = createBootLifecycle({
      boot: () => Promise.reject(new Error("exploded")),
      store
    });

    await expect(lifecycle.start()).resolves.toMatchObject({ status: "failed" });
    expect(lifecycle.getPhase().failure?.code).toBe("INTERNAL_BOOT_FAILURE");
    expect(lifecycle.getPhase().failure?.message).toContain("exploded");
    expect(lifecycle.getPhase().failure?.recovery).toBeTruthy();
  });

  it("retry runs the boot again and can reach ready", async () => {
    const store = newStore();
    let calls = 0;
    const boot = async (): Promise<BootResult> => {
      calls += 1;
      return calls === 1
        ? { status: "error", error: fakeFailure(), notices: [] }
        : fakeReady();
    };
    const lifecycle = createBootLifecycle({ boot, store });

    await lifecycle.start();
    expect(lifecycle.getPhase().status).toBe("failed");

    await lifecycle.retry();
    expect(lifecycle.getPhase().status).toBe("ready");
    expect(calls).toBe(2);
  });

  it("a second start while one is running shares the same run", async () => {
    const store = newStore();
    const gate = deferred<BootResult>();
    const boot = vi.fn((_options?: BootOptions): Promise<BootResult> => gate.promise);
    const lifecycle = createBootLifecycle({ boot, store });

    const first = lifecycle.start();
    const second = lifecycle.start();
    expect(boot).toHaveBeenCalledTimes(1);

    gate.resolve(fakeReady());
    await Promise.all([first, second]);
    expect(lifecycle.getPhase().status).toBe("ready");
  });
});

describe("dispose on unmount", () => {
  it("disposes a ready boot exactly once", async () => {
    const dispose = vi.fn();
    const lifecycle = createBootLifecycle({
      boot: async () => (fakeReady(dispose)),
      store: newStore()
    });
    await lifecycle.start();
    expect(dispose).not.toHaveBeenCalled();

    lifecycle.dispose();
    lifecycle.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(lifecycle.isDisposed()).toBe(true);
  });

  it("disposes a boot that finishes after the shell unmounted", async () => {
    const dispose = vi.fn();
    const gate = deferred<BootResult>();
    const lifecycle = createBootLifecycle({
      boot: () => gate.promise,
      store: newStore()
    });

    const run = lifecycle.start();
    lifecycle.dispose();
    gate.resolve(fakeReady(dispose));
    await run;

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(lifecycle.getPhase().status).toBe("loading");
    expect(lifecycle.getPhase().ready).toBeNull();
  });

  it("ignores any start requested after disposal", async () => {
    const boot = vi.fn(
      async (): Promise<BootResult> => (fakeReady())
    );
    const lifecycle = createBootLifecycle({ boot, store: newStore() });
    lifecycle.dispose();
    await lifecycle.start();
    expect(boot).not.toHaveBeenCalled();
  });
});

describe("notices (G3 degraded surfacing)", () => {
  it("collects notices for the shell and forwards them to an observer", async () => {
    const observed: string[] = [];
    const lifecycle = createBootLifecycle({
      boot: async (options) => {
        options?.onNotice?.("G3", "worker-construction-failed", "Running on the main thread.");
        options?.onNotice?.("info", "UNKNOWN_ROUTE", "The link's view does not exist.");
        return fakeReady();
      },
      store: newStore(),
      onNotice: (_level, code) => observed.push(code)
    });

    await lifecycle.start();

    expect(observed).toEqual(["worker-construction-failed", "UNKNOWN_ROUTE"]);
    expect(lifecycle.getNotices().map((n) => n.level)).toEqual(["G3", "info"]);
    expect(lifecycle.getNotices()[0]?.message).toBe("Running on the main thread.");
  });

  it("an observer that throws never breaks the boot run", async () => {
    const lifecycle = createBootLifecycle({
      boot: async (options) => {
        options?.onNotice?.("info", "UNKNOWN_PANE", "notice");
        return fakeReady();
      },
      store: newStore(),
      onNotice: () => {
        throw new Error("observer blew up");
      }
    });
    await expect(lifecycle.start()).resolves.toMatchObject({ status: "ready" });
  });
});

describe("results-only retry (G5) — verified against the booted manifest", () => {
  const ref = MANIFEST.artifacts?.results;

  /** Boot double whose bundle never carried results: the retry is the only source. */
  function bootWithoutResults(): Promise<BootResult> {
    return Promise.resolve(fakeReady(vi.fn(), null as unknown as Results));
  }

  it("refetches only results.json, verifies size + SHA-256, and publishes it", async () => {
    if (ref === undefined || ref === null) throw new Error("manifest missing artifacts.results");
    const store = newStore();
    const fetched: string[] = [];
    const lifecycle = createBootLifecycle({
      boot: bootWithoutResults,
      store,
      bootOptions: {
        fetchArtifact: (path: string) => {
          fetched.push(path);
          return diskFetch(path);
        }
      }
    });

    await lifecycle.start();
    expect(store.getState().bundle.results).toBeNull();
    expect(store.getState().bundle.resultsStatus).toBe("error");

    const outcome = await lifecycle.retryResults();
    if (!outcome.ok) throw new Error(`retry failed: ${outcome.message}`);
    expect(outcome.results).not.toBeNull();
    expect(fetched).toEqual([ref.path]);
    expect(store.getState().bundle.results).not.toBeNull();
    expect(store.getState().bundle.resultsStatus).toBe("ready");
  });

  it("rejects tampered bytes and never publishes them", async () => {
    const store = newStore();
    const lifecycle = createBootLifecycle({
      boot: bootWithoutResults,
      store,
      bootOptions: {
        fetchArtifact: async (path: string) => {
          const bytes = await diskFetch(path);
          bytes[0] = (bytes[0] ?? 0) ^ 1; // same length, different content
          return bytes;
        }
      }
    });

    await lifecycle.start();
    const outcome = await lifecycle.retryResults();
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("tampered bytes must not verify");
    expect(outcome.message).toContain("SHA-256");
    expect(store.getState().bundle.results).toBeNull();
    expect(store.getState().bundle.resultsStatus).toBe("error");
  });

  it("turns a fetch rejection into a designed outcome with the real reason", async () => {
    const store = newStore();
    const lifecycle = createBootLifecycle({
      boot: bootWithoutResults,
      store,
      bootOptions: {
        fetchArtifact: () => Promise.reject(new Error("network down"))
      }
    });

    await lifecycle.start();
    const outcome = await lifecycle.retryResults();
    expect(outcome).toEqual({ ok: false, message: "network down" });
    expect(store.getState().bundle.results).toBeNull();
    expect(store.getState().bundle.resultsStatus).toBe("error");
  });

  it("refuses before the bundle is ready", async () => {
    const lifecycle = createBootLifecycle({ boot: async () => fakeReady(), store: newStore() });
    const outcome = await lifecycle.retryResults();
    expect(outcome).toEqual({
      ok: false,
      message: "The bundle is not ready yet, so results cannot be reloaded."
    });
  });

  it("refuses after dispose and never fetches", async () => {
    const fetchArtifact = vi.fn((path: string): Promise<Uint8Array> => diskFetch(path));
    const lifecycle = createBootLifecycle({
      boot: async () => fakeReady(),
      store: newStore(),
      bootOptions: { fetchArtifact }
    });
    await lifecycle.start();
    lifecycle.dispose();

    const outcome = await lifecycle.retryResults();
    expect(outcome).toEqual({
      ok: false,
      message: "This session has ended; reload the page to start again."
    });
    expect(fetchArtifact).not.toHaveBeenCalled();
  });

  it("publishes nothing when the artifact fails the schema gate", async () => {
    const store = newStore();
    // Bytes that pass the size and SHA-256 checks against a manifest built for
    // them, then fail the results schema gate — the last door before publish.
    const invalid = new TextEncoder().encode(
      JSON.stringify({ schemaVersion: 1, not: "a results document" })
    );
    const digest = await sha256Hex(invalid);
    const manifest = {
      ...MANIFEST,
      artifacts: {
        ...MANIFEST.artifacts,
        results: { path: "results.json", sha256: digest, sizeBytes: invalid.byteLength }
      }
    } as Manifest;
    const lifecycle = createBootLifecycle({
      boot: () => Promise.resolve(fakeReady(vi.fn(), null as unknown as Results, manifest)),
      store,
      bootOptions: {
        fetchArtifact: () => Promise.resolve(invalid)
      }
    });

    await lifecycle.start();
    const outcome = await lifecycle.retryResults();
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("an invalid document must not publish");
    expect(store.getState().bundle.results).toBeNull();
    expect(store.getState().bundle.resultsStatus).toBe("error");
  });
});
