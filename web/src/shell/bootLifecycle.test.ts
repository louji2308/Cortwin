/**
 * P6-SHELL — boot lifecycle state machine: loading → ready | failed, retry,
 * dispose-on-unmount (including the finish-after-unmount race), notice
 * collection for the G3 degraded banner, and results publication into the
 * one store.
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
import type { Results } from "../contracts";
import { createCorTwinStore, type CorTwinStore } from "../store";
import { createBootLifecycle, LOADING_PHASE, type BootPhase } from "./bootLifecycle";

const PUBLIC_DIR = fileURLToPath(new URL("../../public", import.meta.url));

function realResults(): Results {
  return JSON.parse(readFileSync(join(PUBLIC_DIR, "results.json"), "utf8")) as Results;
}

/**
 * Minimal `BootReady` double: the lifecycle only ever reads `status`,
 * `artifacts.results` and `dispose()`, so the remaining contract fields are
 * supplied by the cast rather than fabricated one by one.
 */
function fakeReady(dispose = vi.fn(), results: Results = realResults()): BootReady {
  return {
    status: "ready",
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
