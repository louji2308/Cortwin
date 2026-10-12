/**
 * P6-SHELL — the boot lifecycle the shell renders (Implementation_Plan P6
 * steps 2–3, Architecture §9.2 boot + §16 G0–G6).
 *
 * `bootCorTwin` already guarantees it never throws and always leaves the store
 * in a designed state. This module owns the *presentation* state machine on
 * top of it: loading → ready | failed, one run at a time, a real retry action,
 * notices collected for the degraded (G3) banner, and `BootReady.dispose()` on
 * unmount — including the race where a boot finishes after the shell is gone.
 *
 * The boot function is injected, so the whole state machine is testable in
 * Node with a fake: no DOM, no worker, no artifacts.
 *
 * Publishing `artifacts.results` into the store's own bundle slot happens
 * here (C-09 write ownership: bundle → bundle loader), so the Trust view reads
 * one store, never a second copy of `results`.
 */
import {
  bootCorTwin,
  type BootNotice,
  type BootOptions,
  type BootReady,
  type BootResult
} from "../boot";
import {
  BootAbort,
  describeCause,
  internalFailure,
  type BootFailure,
  type BootNotifier
} from "../boot/errors";
import { assertSafeArtifactPath } from "../boot/manifest";
import { validateResults } from "../boot/validate";
import { defaultFetchArtifact, sha256Hex } from "../boot/verify";
import type { Results } from "../contracts";
import { store as singletonStore, type CorTwinStore } from "../store";

export type BootPhaseStatus = "loading" | "ready" | "failed";

export type BootPhase = {
  status: BootPhaseStatus;
  /** Non-null only in the `ready` phase. */
  ready: BootReady | null;
  /** Non-null only in the `failed` phase — reason + recovery, never a stack. */
  failure: BootFailure | null;
};

export const LOADING_PHASE: BootPhase = { status: "loading", ready: null, failure: null };

/** The boot entry as the shell sees it — `bootCorTwin` by default. */
export type BootFn = (options?: BootOptions) => Promise<BootResult>;

export type BootLifecycleOptions = {
  /** Injected boot entry (tests pass a fake; the app passes `bootCorTwin`). */
  boot?: BootFn;
  /** Forwarded to the boot entry (store, manifest, fetch and URL overrides). */
  bootOptions?: BootOptions;
  /** Store the lifecycle publishes `results` into; defaults to the singleton. */
  store?: CorTwinStore;
  /** Called on construction and on every phase transition. */
  onPhase?: (phase: BootPhase) => void;
  /** Called for every boot notice (info / G3 degraded / G6). */
  onNotice?: BootNotifier;
  /**
   * Publish `ready.artifacts.results` into the store after a successful boot.
   * Default true; only turned off by tests that assert the slot stays empty.
   */
  publishResults?: boolean;
};

/**
 * Outcome of the results-only retry (G5 recovery). `message` is a
 * plain-language, patient-safe failure reason shown by the pane's designed
 * error state; this path never throws at the caller (Architecture §16).
 */
export type ResultsRetryOutcome =
  | { ok: true; results: Results }
  | { ok: false; message: string };

export type BootLifecycle = {
  getPhase(): BootPhase;
  getNotices(): readonly BootNotice[];
  /** Run (or re-run after a failure). Concurrent calls share one run. */
  start(): Promise<BootPhase>;
  /** Designed recovery action for the failure screen. */
  retry(): Promise<BootPhase>;
  /**
   * G5 recovery: re-fetch ONLY the results artifact declared by the booted
   * manifest, re-verify its declared size + SHA-256, re-run the results
   * schema gate and publish the document into the store's bundle slot.
   * The rest of the bundle is never refetched or re-validated (the boot
   * already verified it), concurrent calls share one attempt, and every
   * failure resolves as `{ok:false, message}` — this promise never rejects.
   */
  retryResults(): Promise<ResultsRetryOutcome>;
  /** Unmount: dispose a ready boot, drop any result that lands afterwards. */
  dispose(): void;
  /** True once `dispose()` has been called. */
  isDisposed(): boolean;
};

function failedPhase(failure: BootFailure): BootPhase {
  return { status: "failed", ready: null, failure };
}

export function createBootLifecycle(options: BootLifecycleOptions = {}): BootLifecycle {
  const boot = options.boot ?? bootCorTwin;
  const store = options.store ?? singletonStore;
  const publishResults = options.publishResults !== false;

  let phase: BootPhase = LOADING_PHASE;
  const notices: BootNotice[] = [];
  let disposed = false;
  let inFlight: Promise<BootPhase> | null = null;
  let held: BootReady | null = null;
  let resultsRetry: Promise<ResultsRetryOutcome> | null = null;

  const report = (next: BootPhase): void => {
    const unchanged =
      next.status === phase.status &&
      next.ready === phase.ready &&
      next.failure === phase.failure;
    phase = next;
    if (unchanged) return;
    options.onPhase?.(next);
  };

  // Construction reports `loading` once, so a subscriber attached after
  // `createBootLifecycle` still learns the initial phase (the option's own
  // contract: "called on construction and on every phase transition").
  options.onPhase?.(phase);

  const release = (): void => {
    if (held !== null) {
      try {
        held.dispose();
      } catch {
        /* best-effort teardown, mirroring BootReady.dispose */
      }
      held = null;
    }
  };

  async function run(): Promise<BootPhase> {
    if (disposed) return phase;
    if (inFlight !== null) return inFlight;

    report(LOADING_PHASE);
    const attempt = (async (): Promise<BootPhase> => {
      let result: BootResult;
      try {
        result = await boot({
          ...options.bootOptions,
          onNotice(level, code, message) {
            notices.push({ level, code, message });
            try {
              options.onNotice?.(level, code, message);
            } catch {
              /* an observer must never break boot */
            }
          }
        });
      } catch (cause) {
        // `bootCorTwin` never throws; a substituted entry still must not blank
        // the screen (AGENTS §6.6 — every failure has a designed state).
        return failedPhase(internalFailure(cause));
      }

      if (disposed) {
        // The shell went away mid-boot: tear the orphan wiring down at once.
        if (result.status === "ready") result.dispose();
        return phase;
      }

      if (result.status === "error") return failedPhase(result.error);

      if (publishResults) {
        store.intents.bundle.setResults(result.artifacts.results);
      }
      held = result;
      return { status: "ready", ready: result, failure: null };
    })();

    inFlight = attempt;
    try {
      const settled = await attempt;
      if (!disposed) report(settled);
      return settled;
    } finally {
      if (inFlight === attempt) inFlight = null;
    }
  }

  /**
   * One results-only retry attempt. The booted manifest is the authority for
   * the path, byte size and SHA-256 of `results.json`; the boot's own fetch
   * function, byte-size check, digest check and results schema gate are
   * reused, so this path verifies exactly what the boot verifies — no second
   * schema, no hand-rolled hash, no refetch of any other artifact.
   */
  async function attemptResultsRetry(): Promise<ResultsRetryOutcome> {
    if (disposed) {
      return { ok: false, message: "This session has ended; reload the page to start again." };
    }
    const readyBoot = held;
    if (readyBoot === null) {
      return { ok: false, message: "The bundle is not ready yet, so results cannot be reloaded." };
    }
    const ref = readyBoot.manifest.artifacts?.results;
    if (ref === undefined || ref === null) {
      return { ok: false, message: "The manifest does not declare a results artifact." };
    }

    store.intents.bundle.setResultsStatus("loading");
    try {
      assertSafeArtifactPath(ref.path);
      const fetchArtifact = options.bootOptions?.fetchArtifact ?? defaultFetchArtifact;
      const bytes = await fetchArtifact(ref.path);

      if (bytes.byteLength !== ref.sizeBytes) {
        store.intents.bundle.setResultsStatus("error");
        return {
          ok: false,
          message: `The results artifact is ${bytes.byteLength} bytes but the manifest declares ${ref.sizeBytes}.`
        };
      }
      const digest = (await sha256Hex(bytes)).toLowerCase();
      if (digest !== ref.sha256.toLowerCase()) {
        store.intents.bundle.setResultsStatus("error");
        return {
          ok: false,
          message: "The results artifact does not match the SHA-256 recorded in the manifest."
        };
      }

      let doc: unknown;
      try {
        doc = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
      } catch {
        store.intents.bundle.setResultsStatus("error");
        return { ok: false, message: "The results artifact is not valid UTF-8 JSON." };
      }

      const results = validateResults(doc);
      if (disposed) {
        // The shell went away while the retry was in flight: publish nothing.
        return { ok: false, message: "This session has ended; reload the page to start again." };
      }
      store.intents.bundle.setResults(results);
      return { ok: true, results };
    } catch (cause) {
      store.intents.bundle.setResultsStatus("error");
      if (cause instanceof BootAbort) return { ok: false, message: cause.failure.message };
      return { ok: false, message: describeCause(cause) };
    }
  }

  const retryResults = (): Promise<ResultsRetryOutcome> => {
    if (resultsRetry !== null) return resultsRetry;
    const attempt = (async (): Promise<ResultsRetryOutcome> => {
      try {
        return await attemptResultsRetry();
      } catch (cause) {
        // attemptResultsRetry is written not to throw; this is the last net
        // so the caller always sees a designed outcome, never a rejection.
        return { ok: false, message: describeCause(cause) };
      }
    })();
    resultsRetry = attempt;
    void attempt.finally(() => {
      if (resultsRetry === attempt) resultsRetry = null;
    });
    return attempt;
  };

  return {
    getPhase: () => phase,
    getNotices: () => notices,
    start: run,
    retry: run,
    retryResults,
    dispose() {
      if (disposed) return;
      disposed = true;
      release();
    },
    isDisposed: () => disposed
  };
}
