/**
 * P5B-1 — the boot loader: manifest → verified artifacts → engine → store →
 * first truth (Implementation_Plan P5 steps 4–5, Architecture §9.2).
 *
 * One pass, in order:
 *   A. pure verification, before ANY store write — manifest shape, all six
 *      artifacts fetched at manifest paths and checked against size + SHA-256,
 *      cross-artifact identity (modelId, mesh nodes, fixture provenance),
 *      engine construction;
 *   B. publishing — encoder + verified bundle into the store, compute port
 *      wiring with G3/G6 degradation to a main-thread port, URL state,
 *      `case.select` (revision 1) so the first truth is a real evaluation.
 *
 * `bootCorTwin` never throws: failures return `status: "error"` with a typed
 * `BootFailure`, set `bundle.status = "error"` and emit a G6 notice, so the
 * app always has a designed state (AGENTS §6.6). Notices carry only static,
 * patient-safe text.
 *
 * Sibling areas (stage, scene, profile) are untouched: this module writes
 * only through the store's typed bundle/case/selection/view intents.
 */
import type { ComputePort, Manifest, ModelMetadata, Registry, Results } from "../contracts";
import { createCaseEncoder, loadEngine, type Engine } from "../domain";
import { parseUrl, resolveUrl, type UrlNotice } from "../navigation";
import { store as singletonStore, type CorTwinStore } from "../store";
import {
  createMainComputePort,
  createWorkerComputePort,
  type DegradeInfo,
  type WorkerComputePort
} from "../worker";
import {
  BootAbort,
  bootAbort,
  describeCause,
  internalFailure,
  type BootFailure,
  type BootNotice,
  type BootNotifier
} from "./errors";
import { MANIFEST_BLOCK_ID, parseManifest, readInlineManifestText } from "./manifest";
import {
  defaultFetchArtifact,
  fetchVerifiedArtifacts,
  type FetchArtifact
} from "./verify";
import { validateBundle, type ParsedBundle } from "./validate";

/** Re-exported so consumers (tests, mount layer) can type against `./boot`. */
export type { BootNotice } from "./errors";

/** C-05 default case — preferred when the bundle ships it, else the first one. */
export const DEFAULT_CASE_ID = "hypo1";

export type ComputeMode = "worker" | "main-thread" | "injected";

export type BootOptions = {
  /** Store to boot into; defaults to the C-09 singleton. */
  store?: CorTwinStore;
  /** Raw manifest (string or object) for tests; otherwise the inlined block. */
  manifest?: unknown;
  /** Manifest text reader override; defaults to the DOM block read. */
  readManifestText?: () => string | null;
  /** Artifact fetch override; defaults to same-origin `fetch`. */
  fetchArtifact?: FetchArtifact;
  /** URL override; defaults to `location.hash` ("" outside the browser). */
  url?: string;
  /** Pre-built compute port (tests / advanced wiring); skips worker creation. */
  computePort?: ComputePort;
  /** Observation sink; notices are also collected on the result. */
  onNotice?: BootNotifier;
};

export type BootReady = {
  status: "ready";
  manifest: Manifest;
  registry: Registry;
  modelMetadata: ModelMetadata;
  modelId: string;
  engine: Engine;
  /** Case actually selected after URL resolution (always non-empty on ready). */
  caseId: string;
  /** Case revision after boot — 1 for a plain case, higher when a share applied. */
  revision: number;
  computeMode: ComputeMode;
  /** Parsed artifacts held for lazy consumers (results rail, integrity pane).
   *  `results` is `null` when `results.json` did not arrive — the FM-10 / §16.1
   *  G5 state; every other artifact is verified or boot never reaches ready. */
  artifacts: { results: Results | null; fixtures: unknown; structureNodeNames: string[] };
  notices: BootNotice[];
  /** Detaches this boot's wiring from the store and disposes the worker. */
  dispose(): void;
};

export type BootFailed = {
  status: "error";
  error: BootFailure;
  notices: BootNotice[];
};

export type BootResult = BootReady | BootFailed;

type Attached = { mode: ComputeMode; dispose: () => void };

/** C-05 default case id: `hypo1` when present, otherwise the catalog's first. */
export function pickDefaultCaseId(cases: readonly { id: string }[]): string {
  if (cases.some((entry) => entry.id === DEFAULT_CASE_ID)) return DEFAULT_CASE_ID;
  return cases[0]?.id ?? "";
}

function readDefaultUrl(): string {
  const location = (globalThis as { location?: { hash?: string } }).location;
  return typeof location?.hash === "string" ? location.hash : "";
}

/** Static, patient-safe text for every C-10 URL notice code. */
function urlNoticeMessage(notice: UrlNotice): string {
  switch (notice.code) {
    case "UNKNOWN_ROUTE":
      return "The link's view does not exist; the default view was shown instead.";
    case "UNKNOWN_PANE":
      return "The link's pane does not exist; the default pane was shown instead.";
    case "MALFORMED_QUERY":
      return "A malformed link parameter was ignored.";
    case "UNKNOWN_CASE_ID":
      return "The linked case is not in this bundle; the default case was shown instead.";
    case "UNKNOWN_TARGET_ID":
      return "The linked target does not exist; the default target was selected instead.";
    case "UNKNOWN_FEATURE_ID":
      return "The linked feature does not exist; the feature selection was cleared.";
    case "UNKNOWN_STAGE_ID":
      return "The linked stage does not exist; the stage selection was cleared.";
    case "MALFORMED_SHARE":
      return "The shared view could not be read; the active case was kept unchanged.";
    default:
      return "The link was not fully applied; safe defaults were shown instead.";
  }
}

function resolveManifest(options: BootOptions): Manifest {
  if (options.manifest !== undefined) return parseManifest(options.manifest);
  const text = (options.readManifestText ?? readInlineManifestText)();
  if (text === null || text.trim() === "") {
    bootAbort(
      "MANIFEST_MISSING",
      `The inlined bundle manifest (block "${MANIFEST_BLOCK_ID}") is missing.`,
      "Reload the page; a deployed bundle must ship its inlined manifest."
    );
  }
  return parseManifest(text);
}

function loadEngineSafe(manifest: Manifest, bundle: ParsedBundle): Engine {
  try {
    const engine = loadEngine({ model: bundle.model, registry: bundle.registry });
    if (engine.modelId !== manifest.modelId) {
      bootAbort(
        "ENGINE_LOAD_FAILED",
        "The engine resolved a different modelId than the manifest declares.",
        "Rebuild the bundle (`make reproduce`) and reload."
      );
    }
    return engine;
  } catch (cause) {
    if (cause instanceof BootAbort) throw cause;
    bootAbort(
      "ENGINE_LOAD_FAILED",
      `The engine rejected the model bundle: ${describeCause(cause)}`,
      "Rebuild the bundle (`make reproduce`) and reload."
    );
  }
}

/**
 * Wire compute (C-07 §6.1): the store gets a port before any case is
 * selected. The default path builds the worker port; if it degrades —
 * synchronously at construction (no `Worker` in the runtime) or later on
 * startup failure — boot swaps in the main-thread adapter (Architecture
 * §16.1 G3: same engine, same runtime), emits the ladder notice, and never
 * attaches the fenced worker port to the store.
 */
function attachCompute(input: {
  store: CorTwinStore;
  engine: Engine;
  model: unknown;
  registry: Registry;
  options: BootOptions;
  emit: BootNotifier;
}): Attached {
  const { store, engine, model, registry, options, emit } = input;
  const featureCount = registry.features.length;

  if (options.computePort !== undefined) {
    const detach = store.attachCompute(options.computePort);
    return { mode: "injected", dispose: detach };
  }

  const reportLater = (info: DegradeInfo): void => {
    emit(info.level, info.reason, info.notice);
  };

  let disposed = false;
  let degradedAtConstruction = false;
  let swappedToMain = false;
  let workerPort: WorkerComputePort | null = null;
  let detach: () => void = () => undefined;

  const handleDegrade = (info: DegradeInfo): void => {
    emit(info.level, info.reason, info.notice);
    if (disposed || swappedToMain) return;
    if (workerPort === null) {
      // Construction has not returned yet; swap once it has.
      degradedAtConstruction = true;
      return;
    }
    swappedToMain = true;
    detach = store.attachCompute(createMainComputePort(engine, { featureCount, onDegrade: reportLater }));
    const fenced = workerPort;
    workerPort = null;
    fenced.dispose();
  };

  workerPort = createWorkerComputePort({ featureCount, onDegrade: handleDegrade });

  if (degradedAtConstruction) {
    const fenced = workerPort;
    workerPort = null;
    fenced.dispose();
    swappedToMain = true;
    detach = store.attachCompute(createMainComputePort(engine, { featureCount, onDegrade: reportLater }));
  } else {
    const port = workerPort;
    detach = store.attachCompute(port);
    port.initialize({ model, registry });
  }

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    detach();
    if (workerPort !== null) workerPort.dispose();
    workerPort = null;
  };
  return { mode: swappedToMain ? "main-thread" : "worker", dispose };
}

/**
 * Apply parsed URL state to the store: route/pane, case (revision 1),
 * selections, then the share payload's diffs — every id already validated by
 * `resolveUrl` against the real registry before anything is written.
 */
function applyUrlState(input: {
  store: CorTwinStore;
  bundle: ParsedBundle;
  options: BootOptions;
  emit: BootNotifier;
}): void {
  const { store, bundle, options, emit } = input;
  const url = options.url ?? readDefaultUrl();
  const resolved = resolveUrl(parseUrl(url), {
    registry: bundle.registry,
    caseIds: bundle.cases.map((entry) => entry.id),
    defaultCaseId: pickDefaultCaseId(bundle.cases),
    defaultTargetId: bundle.registry.targets[0]?.id ?? null
  });
  for (const notice of resolved.notices) {
    emit("info", notice.code, urlNoticeMessage(notice));
  }

  store.intents.view.navigate(resolved.route, resolved.pane);
  const selected = store.intents.case.select(resolved.caseId);
  if (!selected.ok) {
    bootAbort(
      "CASE_APPLY_FAILED",
      `The case "${resolved.caseId}" could not be applied to the store.`,
      "Reload the page; if this repeats, rebuild the bundle."
    );
  }
  store.intents.selection.selectTarget(resolved.targetId);
  store.intents.selection.selectFeature(resolved.featureId);
  store.intents.selection.selectStage(resolved.stageId);

  const share = resolved.share;
  if (share === null) return;
  if (share.baseCase !== resolved.caseId) {
    emit(
      "info",
      "MALFORMED_SHARE",
      "The shared view names a different case than the link, so it was ignored."
    );
    return;
  }

  // Values first, then `provided`: the missingness flag is the final
  // authority for whether a stored value counts as observed (C-08 §6.2).
  let failed = false;
  for (const [featureId, value] of Object.entries(share.values)) {
    if (!store.intents.case.setValue(featureId, value).ok) {
      failed = true;
      break;
    }
  }
  const modalityIds = new Set(bundle.registry.modalities.map((modality) => modality.id));
  if (!failed) {
    for (const [id, provided] of Object.entries(share.provided)) {
      const result = modalityIds.has(id)
        ? store.intents.case.setModalityProvided(id, provided)
        : store.intents.case.setFeatureProvided(id, provided);
      if (!result.ok) {
        failed = true;
        break;
      }
    }
  }
  if (failed) {
    // No partial share: restore the clean base case and say so.
    store.intents.case.select(share.baseCase);
    emit(
      "info",
      "SHARE_APPLY_FAILED",
      "The shared view could not be applied, so the base case was restored."
    );
  }
}

/** Boot the application. Never throws: read the failure as a designed state. */
export async function bootCorTwin(options: BootOptions = {}): Promise<BootResult> {
  const notices: BootNotice[] = [];
  const emit: BootNotifier = (level, code, message) => {
    notices.push({ level, code, message });
    try {
      options.onNotice?.(level, code, message);
    } catch {
      /* an observer must never break boot */
    }
  };
  const store = options.store ?? singletonStore;
  let teardown: (() => void) | null = null;

  try {
    store.intents.bundle.setBooting();
    const manifest = resolveManifest(options);
    const verified = await fetchVerifiedArtifacts(
      manifest,
      options.fetchArtifact ?? defaultFetchArtifact
    );
    const bundle = validateBundle(manifest, verified.bytes);
    const engine = loadEngineSafe(manifest, bundle);

    store.attachEncoder(createCaseEncoder());
    store.intents.bundle.setReady({
      manifest,
      registry: bundle.registry,
      modelMetadata: bundle.modelMetadata
    });
    store.intents.bundle.setCases(bundle.cases);

    if (bundle.results === null) {
      // FM-10 → Architecture §16.1 G5: `results.json` did not arrive. The
      // engine, Explore and the explanation path never read it, so boot goes
      // on; Trust renders its designed not-loaded state. The status is set
      // here as well as by the lifecycle's publication of `null`, so a boot
      // driven without the shell still cannot read "ready" without bytes.
      store.intents.bundle.setResultsStatus("error");
      emit(
        "info",
        "RESULTS_UNAVAILABLE",
        "The validation results file could not be fetched; Explore is unaffected and Trust shows its not-loaded state."
      );
    }

    const attached = attachCompute({
      store,
      engine,
      model: bundle.model,
      registry: bundle.registry,
      options,
      emit
    });
    teardown = attached.dispose;

    applyUrlState({ store, bundle, options, emit });

    const state = store.getState();
    return {
      status: "ready",
      manifest,
      registry: bundle.registry,
      modelMetadata: bundle.modelMetadata,
      modelId: engine.modelId,
      engine,
      caseId: state.case.id,
      revision: state.case.revision,
      computeMode: attached.mode,
      artifacts: {
        results: bundle.results,
        fixtures: bundle.fixtures,
        structureNodeNames: bundle.structureNodeNames
      },
      notices,
      dispose: () => {
        try {
          teardown?.();
        } catch {
          /* best-effort teardown */
        }
      }
    };
  } catch (cause) {
    const failure: BootFailure =
      cause instanceof BootAbort ? cause.failure : internalFailure(cause);
    if (teardown !== null) {
      try {
        teardown();
      } catch {
        /* best-effort teardown */
      }
    }
    store.intents.bundle.setBundleError();
    emit("G6", failure.code, failure.message);
    return { status: "error", error: failure, notices };
  }
}
