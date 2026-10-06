import { create } from "zustand";
import {
  COMPUTE_ERROR_CODES,
  COMPUTE_PROTOCOL_VERSION,
  type BundleIntents,
  type CaseEncoder,
  type ComputeChannel,
  type ComputeErrorCode,
  type ComputeOperation,
  type ComputePort,
  type ComputeRequest,
  type ComputeResponse,
  type CorTwinIntents,
  type CorTwinState,
  type CorTwinStoreState,
  type Evaluation,
  type Explanation,
  type IntentResult,
  type LadderPayload,
  type Registry,
  type Results,
  type TargetId
} from "../contracts";
import { SYSTEM_PANES, TRUST_PANES } from "../navigation";

/**
 * C-09 §7.1 intent surface as this store implements it, with one documented
 * widening over the contract: `bundle.setResults` also accepts the ABSENCE of
 * results (`null`). That is the FM-10 → §16.1 G5 publication of an
 * unavailable `results.json`, and the store normalises it to
 * `{ results: null, resultsStatus: "error" }` — an absence never reads as
 * "ready" (INV: no empty slot with a ready flag). Every value the contract
 * names is still accepted, so `CorTwinIntents` remains assignable as the
 * caller-facing view (`store/intents.test.ts` asserts it).
 */
type G5BundleIntents = Omit<BundleIntents, "setResults"> & {
  setResults(results: Results | null): void;
};

type RuntimeIntents = Omit<CorTwinIntents, "bundle"> & { bundle: G5BundleIntents };

/**
 * C-09 §7.1 — the store: sole runtime source of truth (Implementation_Plan P5
 * steps 1–6). One zustand store, five contract slices plus the two surfaces
 * the contract assigns elsewhere (the display channel and the C-05 case
 * catalog — see `CorTwinStoreState`).
 *
 * **Write ownership by construction.** Nothing outside this module can write
 * `eval`: the public surface is `intents` (C-09 verbatim names), the bundle
 * loader pathway, and `sampleDisplay`/`commitNow` (presentation timing). There
 * is no exported `setState`, no `eval` setter, no direct mutation API. The
 * compute port and encoder are injected (`attachCompute` / `attachEncoder`),
 * so tests run a typed double and the real worker (P4/P5B) drops in without
 * touching this file.
 *
 * **Revision law (C-07 §6.1).** Revision increments ONLY on field edit,
 * provision change, reset and case selection — never on selection or view
 * changes. Every request carries the current revision; a response whose
 * revision differs from the revision it was issued for is STALE and is
 * discarded before any payload is read: it never touches `eval`, the display
 * channel, the explanation cache, stage evaluations or an error slot.
 *
 * **Errors are typed and total.** Every catch converts its cause into the
 * closed `ComputeError` vocabulary with a message that never contains patient
 * values (generic messages by design: privacy over diagnostics, AGENTS §7).
 */

/** Presentation durations: animation only; truth is never delayed by these. */
export const DISPLAY_DURATION_MS = 400;
export const COMMIT_SETTLE_MS = 400;

export type StoreDeps = {
  /** Domain encoder (Architecture §8.4 boundary). Absent = compute not ready. */
  encoder?: CaseEncoder;
  /** C-07 typed compute port; injected, never constructed here. */
  compute?: ComputePort;
  /** Clock for the display channel; injected for deterministic tests. */
  now?: () => number;
  displayDurationMs?: number;
  settleMs?: number;
};

type PendingRequest = {
  operation: ComputeOperation;
  revision: number;
  targetId?: TargetId;
};

const TARGET_IDS: readonly TargetId[] = ["CAD", "LAD", "LCX", "RCA"];
const CAMERA_PRESETS = ["overview", "CAD", "LAD", "LCX", "RCA"] as const;
const QUALITY_TIERS = ["Q0", "Q1", "Q2", "Q3"] as const;

function createInitialState(durationMs: number): CorTwinStoreState {
  return {
    bundle: {
      status: "booting",
      manifest: null,
      registry: null,
      modelMetadata: null,
      resultsStatus: "not_loaded",
      results: null
    },
    case: {
      id: "",
      provenance: "blank",
      values: {},
      providedModalities: {},
      providedFeatures: {},
      customSubset: false,
      revision: 0,
      committedRevision: 0,
      committedValues: {}
    },
    eval: {
      status: "idle",
      current: null,
      committed: null,
      stageEvaluations: {},
      explanationCache: {},
      error: null
    },
    selection: {
      targetId: null,
      modalityId: null,
      featureId: null,
      stageId: null,
      hovered: null
    },
    view: {
      route: "explore",
      pane: null,
      drawer: null,
      cameraPreset: "overview",
      tourStep: null,
      qualityTier: "Q0",
      reducedMotion: false
    },
    display: {
      durationMs,
      startedAtMs: null,
      running: false,
      from: {},
      to: {},
      current: {}
    },
    cases: []
  };
}

function intentError(code: ComputeErrorCode, message: string): IntentResult {
  return { ok: false, error: { code, message, recoverable: true } };
}

function isComputeErrorCode(value: unknown): value is ComputeErrorCode {
  return (
    typeof value === "string" &&
    (COMPUTE_ERROR_CODES as readonly string[]).includes(value)
  );
}

/** Encoder failures keep their code but never their text (no patient values). */
function codeFromEncoderFailure(error: unknown): ComputeErrorCode {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code: unknown }).code;
    if (isComputeErrorCode(code)) return code;
  }
  return "INVALID_FEATURE_VECTOR";
}

function finiteEvaluation(evaluation: Evaluation | undefined): evaluation is Evaluation {
  if (evaluation === undefined || evaluation === null) return false;
  if (typeof evaluation.revision !== "number") return false;
  for (const targetId of TARGET_IDS) {
    const target = evaluation.targets?.[targetId];
    if (target === undefined) return false;
    if (
      !Number.isFinite(target.probability) ||
      !Number.isFinite(target.calibratedMargin) ||
      !Number.isFinite(target.thresholdProbability) ||
      !Number.isFinite(target.abstention?.lowerProbability) ||
      !Number.isFinite(target.abstention?.upperProbability) ||
      !Number.isFinite(target.abstention?.halfWidthMargin)
    ) {
      return false;
    }
  }
  const headline = evaluation.headlineCad;
  if (headline === undefined) return false;
  return (
    Number.isFinite(headline.probability) &&
    Number.isFinite(headline.thresholdProbability) &&
    TARGET_IDS.includes(headline.valueSourceTargetId) &&
    TARGET_IDS.includes(headline.explanationSourceTargetId) &&
    headline.decisionReferenceTargetId === "CAD"
  );
}

function finiteExplanation(explanation: Explanation | undefined): explanation is Explanation {
  if (explanation === undefined || explanation === null) return false;
  if (typeof explanation.revision !== "number" || !TARGET_IDS.includes(explanation.targetId)) {
    return false;
  }
  if (
    !Number.isFinite(explanation.referenceMargin) ||
    !Number.isFinite(explanation.outputMargin) ||
    !Number.isFinite(explanation.efficiencyResidual)
  ) {
    return false;
  }
  return explanation.featureAttributions.every(
    (entry) => Number.isFinite(entry.value) && Number.isFinite(entry.contribution)
  );
}

/** C-09 display channel: cubic ease-out over the transition window. */
function easeOutCubic(t: number): number {
  const clamped = t <= 0 ? 0 : t >= 1 ? 1 : t;
  const inverse = 1 - clamped;
  return 1 - inverse * inverse * inverse;
}

/**
 * Create an isolated store instance. Tests build one per case; the application
 * uses the singleton in `./index`.
 */
export function createCorTwinStore(deps: StoreDeps = {}) {
  const now = deps.now ?? (() => Date.now());
  const displayDurationMs = deps.displayDurationMs ?? DISPLAY_DURATION_MS;
  const settleMs = deps.settleMs ?? COMMIT_SETTLE_MS;

  let encoder = deps.encoder;
  let port: ComputePort | null = deps.compute ?? null;
  let detachPort: (() => void) | null = null;
  let requestCounter = 0;
  let commitTimer: ReturnType<typeof setTimeout> | null = null;
  const pending = new Map<string, PendingRequest>();

  const store = create<CorTwinStoreState>(() => createInitialState(displayDurationMs));
  const get = () => store.getState();
  const set = (partial: Partial<CorTwinStoreState>) => store.setState(partial);

  function flagError(code: ComputeErrorCode, message: string): void {
    const state = get();
    set({
      eval: {
        ...state.eval,
        status: "error",
        error: { code, message, recoverable: true }
      }
    });
  }

  function canCompute(): boolean {
    const state = get();
    return (
      encoder !== undefined &&
      port !== null &&
      state.bundle.registry !== null &&
      state.case.revision >= 1
    );
  }

  function buildRequest(
    operation: ComputeOperation,
    targetId?: TargetId
  ): ComputeRequest | null {
    const state = get();
    const registry = state.bundle.registry as Registry;
    let encoded;
    try {
      encoded = encoder!({
        registry,
        values: state.case.values,
        providedFeatures: state.case.providedFeatures,
        providedModalities: state.case.providedModalities
      });
    } catch (error) {
      flagError(codeFromEncoderFailure(error), "Case encoding failed");
      return null;
    }

    const featureCount = registry.features.length;
    if (
      encoded.featureVector.length !== featureCount ||
      encoded.observedMask.length !== featureCount
    ) {
      flagError("INVALID_FEATURE_VECTOR", "Encoded case length does not match the registry");
      return null;
    }
    for (const flag of encoded.observedMask) {
      if (flag !== 0 && flag !== 1) {
        flagError("INVALID_FEATURE_VECTOR", "Observed mask must contain only 0 or 1");
        return null;
      }
    }
    for (const value of encoded.featureVector) {
      if (!Number.isFinite(value)) {
        flagError("NONFINITE_INPUT", "Encoded case contains a non-finite value");
        return null;
      }
    }

    requestCounter += 1;
    const channel: ComputeChannel = "case";
    return {
      protocolVersion: COMPUTE_PROTOCOL_VERSION,
      requestId: `ct-${requestCounter}`,
      channel,
      revision: state.case.revision,
      lane: operation === "evaluate" ? "L0" : operation === "explain" ? "L1" : "L2",
      operation,
      featureVector: encoded.featureVector,
      observedMask: encoded.observedMask,
      ...(targetId === undefined ? {} : { targetId })
    };
  }

  function submit(request: ComputeRequest): void {
    pending.set(request.requestId, {
      operation: request.operation,
      revision: request.revision,
      targetId: request.targetId
    });
    try {
      port!.submit(request);
    } catch {
      pending.delete(request.requestId);
      flagError("INTERNAL_COMPUTE_FAILURE", "Compute port rejected the request");
    }
  }

  function requestEvaluate(): void {
    if (!canCompute()) return;
    const request = buildRequest("evaluate");
    if (request === null) return;
    const state = get();
    set({
      eval: {
        ...state.eval,
        status: state.eval.current === null ? "computing" : "updating",
        error: null
      }
    });
    submit(request);
  }

  function requestExplanation(targetId?: TargetId): void {
    if (!canCompute()) return;
    const state = get();
    const target = targetId ?? state.selection.targetId ?? "CAD";
    const request = buildRequest("explain", target);
    if (request !== null) submit(request);
  }

  function requestLadder(): void {
    if (!canCompute()) return;
    const request = buildRequest("ladder");
    if (request !== null) submit(request);
  }

  function startDisplayTransition(evaluation: Evaluation): void {
    const state = get();
    const duration = state.view.reducedMotion ? 0 : displayDurationMs;
    const to: Partial<Record<TargetId, number>> = {};
    const from: Partial<Record<TargetId, number>> = {};
    for (const targetId of TARGET_IDS) {
      const target = evaluation.targets[targetId];
      if (target === undefined) continue;
      // The CAD slot animates the number the UI displays — the C-08 headline
      // (which may be a vessel's probability when it leads) — so the eased
      // value lands exactly on `headlineCad.probability` instead of jumping
      // to it when the transition ends. Vessel slots animate their own value.
      const destination =
        targetId === "CAD" ? evaluation.headlineCad.probability : target.probability;
      to[targetId] = destination;
      from[targetId] = state.display.current[targetId] ?? destination;
    }
    set({
      display: {
        durationMs: duration,
        startedAtMs: duration > 0 ? now() : null,
        running: duration > 0,
        from,
        to,
        current: duration > 0 ? { ...from } : { ...to }
      }
    });
  }

  function scheduleCommit(): void {
    if (commitTimer !== null) clearTimeout(commitTimer);
    commitTimer = setTimeout(() => {
      commitTimer = null;
      commitNow();
    }, settleMs);
  }

  function commitNow(): void {
    if (commitTimer !== null) {
      clearTimeout(commitTimer);
      commitTimer = null;
    }
    const state = get();
    if (state.case.revision < 1) return;
    set({
      case: {
        ...state.case,
        committedRevision: state.case.revision,
        committedValues: { ...state.case.values }
      },
      eval: { ...state.eval, committed: state.eval.current }
    });
    // C-07 lane table: a settled case revision triggers L1 explain + L2 ladder.
    requestExplanation();
    requestLadder();
  }

  function applyEvaluation(response: ComputeResponse, issued: PendingRequest): void {
    const evaluation = response.evaluation;
    if (!finiteEvaluation(evaluation)) {
      flagError("INTERNAL_COMPUTE_FAILURE", "Evaluation payload is incomplete or non-finite");
      return;
    }
    if (evaluation.revision !== issued.revision) {
      flagError("MALFORMED_REQUEST", "Evaluation payload revision does not echo the request");
      return;
    }
    const state = get();
    set({
      eval: { ...state.eval, current: evaluation, status: "ready", error: null }
    });
    startDisplayTransition(evaluation);
    scheduleCommit();
  }

  function applyExplanation(response: ComputeResponse, issued: PendingRequest): void {
    const explanation = response.explanation;
    if (!finiteExplanation(explanation)) {
      flagError("INTERNAL_COMPUTE_FAILURE", "Explanation payload is incomplete or non-finite");
      return;
    }
    if (explanation.revision !== issued.revision) {
      flagError("MALFORMED_REQUEST", "Explanation payload revision does not echo the request");
      return;
    }
    if (issued.targetId !== undefined && explanation.targetId !== issued.targetId) {
      flagError("MALFORMED_REQUEST", "Explanation payload target does not match the request");
      return;
    }
    const state = get();
    const key = `${explanation.revision}:${explanation.targetId}`;
    set({
      eval: {
        ...state.eval,
        explanationCache: { ...state.eval.explanationCache, [key]: explanation }
      }
    });
  }

  function applyLadder(response: ComputeResponse): void {
    const ladder: LadderPayload | undefined = response.ladder;
    if (ladder === undefined) {
      flagError("INTERNAL_COMPUTE_FAILURE", "Ladder payload is missing");
      return;
    }
    const state = get();
    set({ eval: { ...state.eval, stageEvaluations: { ...ladder } } });
  }

  function handleResponse(response: ComputeResponse): void {
    const issued = pending.get(response.requestId);
    if (issued === undefined) return; // never issued here — not our traffic
    pending.delete(response.requestId);
    if (response.protocolVersion !== COMPUTE_PROTOCOL_VERSION) {
      flagError("MALFORMED_REQUEST", "Compute response protocol version mismatch");
      return;
    }
    if (response.channel !== "case") return; // verification traffic never touches case truth
    if (response.revision !== issued.revision) return; // echo mismatch: stale, discarded
    if (issued.revision !== get().case.revision) return; // case moved on: stale, discarded
    if (response.operation !== issued.operation) {
      flagError("MALFORMED_REQUEST", "Compute response operation does not match the request");
      return;
    }
    if (response.status === "error") {
      const error = response.error;
      if (error !== undefined && isComputeErrorCode(error.code)) {
        const state = get();
        set({
          eval: {
            ...state.eval,
            status: "error",
            error: {
              code: error.code,
              message: error.message.slice(0, 200),
              recoverable: error.recoverable === true
            }
          }
        });
      } else {
        flagError("INTERNAL_COMPUTE_FAILURE", "Compute returned an error without a valid code");
      }
      return;
    }
    switch (response.operation) {
      case "evaluate":
        applyEvaluation(response, issued);
        break;
      case "explain":
        applyExplanation(response, issued);
        break;
      case "ladder":
        applyLadder(response);
        break;
      case "integrity":
        break; // never issued on the case channel
    }
  }

  function afterCaseEdit(): void {
    scheduleCommit();
    const state = get();
    // The previous truth, if any, is now provisional: it may remain visible
    // only as "updating", never as current (C-07 §6.1 revision semantics).
    if (state.eval.current !== null && state.eval.status !== "updating") {
      set({ eval: { ...state.eval, status: "updating" } });
    }
    requestEvaluate();
  }

  const intents: RuntimeIntents = {
    case: {
      select(caseId: string): IntentResult {
        const state = get();
        if (state.bundle.registry === null) {
          return intentError("MALFORMED_REQUEST", "Registry is not ready");
        }
        const found = state.cases.find((entry) => entry.id === caseId);
        if (found === undefined) {
          return intentError("MALFORMED_REQUEST", "Unknown case id");
        }
        const revision = state.case.revision + 1;
        set({
          case: {
            id: found.id,
            provenance: found.provenance,
            values: { ...found.values },
            providedFeatures: { ...found.providedFeatures },
            providedModalities: { ...found.providedModalities },
            customSubset: false,
            revision,
            committedRevision: revision,
            committedValues: { ...found.values }
          },
          eval: {
            status: "idle",
            current: null,
            committed: null,
            stageEvaluations: {},
            explanationCache: {},
            error: null
          },
          selection: { ...state.selection, featureId: null }
        });
        scheduleCommit();
        requestEvaluate();
        return { ok: true };
      },
      setValue(featureId: string, value: number | string): IntentResult {
        const state = get();
        if (state.bundle.registry === null) {
          return intentError("MALFORMED_REQUEST", "Registry is not ready");
        }
        if (state.case.id === "") {
          return intentError("MALFORMED_REQUEST", "No case is selected");
        }
        if (!state.bundle.registry.features.some((feature) => feature.id === featureId)) {
          return intentError("MALFORMED_REQUEST", "Unknown feature id");
        }
        if (typeof value === "number" && !Number.isFinite(value)) {
          return intentError("NONFINITE_INPUT", "Feature value must be finite");
        }
        if (typeof value !== "number" && typeof value !== "string") {
          return intentError("MALFORMED_REQUEST", "Feature value must be a number or string");
        }
        const revision = state.case.revision + 1;
        set({
          case: {
            ...state.case,
            values: { ...state.case.values, [featureId]: value },
            // Editing a field provides it: stored values of unprovided features
            // are ignored until observed (C-08 §6.2), and this edit observes it.
            providedFeatures: { ...state.case.providedFeatures, [featureId]: true },
            revision
          }
        });
        afterCaseEdit();
        return { ok: true };
      },
      setModalityProvided(modalityId: string, provided: boolean): IntentResult {
        const state = get();
        const registry = state.bundle.registry;
        if (registry === null) return intentError("MALFORMED_REQUEST", "Registry is not ready");
        if (!registry.modalities.some((modality) => modality.id === modalityId)) {
          return intentError("MALFORMED_REQUEST", "Unknown modality id");
        }
        const revision = state.case.revision + 1;
        set({
          case: {
            ...state.case,
            providedModalities: { ...state.case.providedModalities, [modalityId]: provided },
            revision
          }
        });
        afterCaseEdit();
        return { ok: true };
      },
      setFeatureProvided(featureId: string, provided: boolean): IntentResult {
        const state = get();
        const registry = state.bundle.registry;
        if (registry === null) return intentError("MALFORMED_REQUEST", "Registry is not ready");
        if (!registry.features.some((feature) => feature.id === featureId)) {
          return intentError("MALFORMED_REQUEST", "Unknown feature id");
        }
        const revision = state.case.revision + 1;
        set({
          case: {
            ...state.case,
            providedFeatures: { ...state.case.providedFeatures, [featureId]: provided },
            revision
          }
        });
        afterCaseEdit();
        return { ok: true };
      },
      reset(): IntentResult {
        const state = get();
        const registry = state.bundle.registry;
        if (registry === null) return intentError("MALFORMED_REQUEST", "Registry is not ready");
        const base = state.cases.find((entry) => entry.id === state.case.id);
        if (base === undefined) {
          return intentError("MALFORMED_REQUEST", "Active case is not in the catalog");
        }
        const revision = state.case.revision + 1;
        set({
          case: {
            ...state.case,
            values: { ...base.values },
            providedFeatures: { ...base.providedFeatures },
            providedModalities: { ...base.providedModalities },
            customSubset: false,
            revision
          }
        });
        afterCaseEdit();
        return { ok: true };
      },
      enableCustomSubset(): void {
        const state = get();
        if (state.case.customSubset) return;
        set({ case: { ...state.case, customSubset: true } }); // no revision change (C-09)
      }
    },
    selection: {
      selectTarget(targetId: TargetId | null): void {
        const state = get();
        if (targetId !== null) {
          const registry = state.bundle.registry;
          if (registry !== null && !registry.targets.some((target) => target.id === targetId)) {
            return; // unknown selection target: no-op, selection carries no truth
          }
        }
        if (state.selection.targetId === targetId) return;
        set({ selection: { ...state.selection, targetId } });
        requestExplanation(); // C-07 lane table: L1 on selected-target change
      },
      selectModality(modalityId: string | null): void {
        const state = get();
        if (state.selection.modalityId === modalityId) return;
        set({ selection: { ...state.selection, modalityId } });
      },
      selectFeature(featureId: string | null): void {
        const state = get();
        if (state.selection.featureId === featureId) return;
        set({ selection: { ...state.selection, featureId } });
      },
      selectStage(stageId: string | null): void {
        const state = get();
        if (state.selection.stageId === stageId) return;
        set({ selection: { ...state.selection, stageId } });
      },
      setHover(hovered: CorTwinState["selection"]["hovered"]): void {
        const state = get();
        set({ selection: { ...state.selection, hovered } }); // hover: no revision, no request
      }
    },
    view: {
      navigate(route: CorTwinState["view"]["route"], pane: string | null): void {
        const state = get();
        let nextPane: string | null = null;
        if (route === "trust" && pane !== null && (TRUST_PANES as readonly string[]).includes(pane)) {
          nextPane = pane;
        } else if (
          route === "system" &&
          pane !== null &&
          (SYSTEM_PANES as readonly string[]).includes(pane)
        ) {
          nextPane = pane;
        }
        set({ view: { ...state.view, route, pane: nextPane } });
      },
      openDrawer(drawer: CorTwinState["view"]["drawer"]): void {
        const state = get();
        if (drawer === null) return;
        set({ view: { ...state.view, drawer } });
      },
      closeDrawer(): void {
        const state = get();
        if (state.view.drawer === null) return;
        set({ view: { ...state.view, drawer: null } });
      },
      setCameraPreset(cameraPreset: CorTwinState["view"]["cameraPreset"]): void {
        const state = get();
        if (!(CAMERA_PRESETS as readonly string[]).includes(cameraPreset)) return;
        set({ view: { ...state.view, cameraPreset } });
      },
      startTour(): void {
        const state = get();
        set({ view: { ...state.view, tourStep: 0 } });
      },
      stopTour(): void {
        const state = get();
        if (state.view.tourStep === null) return;
        set({ view: { ...state.view, tourStep: null } });
      },
      setTourStep(step: number | null): void {
        const state = get();
        set({ view: { ...state.view, tourStep: step } });
      },
      setQualityTier(qualityTier: CorTwinState["view"]["qualityTier"]): void {
        const state = get();
        if (!(QUALITY_TIERS as readonly string[]).includes(qualityTier)) return;
        set({ view: { ...state.view, qualityTier } });
      },
      setReducedMotion(reducedMotion: boolean): void {
        const state = get();
        set({ view: { ...state.view, reducedMotion } });
        if (reducedMotion && state.display.running) {
          // Duration collapses to 0: snap the presentation. Truth is unchanged.
          set({
            display: {
              ...state.display,
              durationMs: 0,
              running: false,
              startedAtMs: null,
              current: { ...state.display.to }
            }
          });
        }
      }
    },
    bundle: {
      setBooting(): void {
        set({ bundle: { ...get().bundle, status: "booting" } });
      },
      setReady(input): void {
        set({
          bundle: {
            ...get().bundle,
            status: "ready",
            manifest: input.manifest,
            registry: input.registry,
            modelMetadata: input.modelMetadata
          }
        });
        requestEvaluate(); // resume any case already selected
      },
      setBundleError(): void {
        set({ bundle: { ...get().bundle, status: "error" } });
      },
      setResultsStatus(status): void {
        set({ bundle: { ...get().bundle, resultsStatus: status } });
      },
      setResults(results): void {
        // FM-10 / G5: the bundle loader may publish an ABSENCE (`null`) when
        // `results.json` never arrived. Ready without bytes would be a lie
        // (INV-04/AGENTS §7.3), so the absence is recorded as `error`.
        set({
          bundle: {
            ...get().bundle,
            results,
            resultsStatus: results === null ? "error" : "ready"
          }
        });
      },
      setCases(cases): void {
        set({ cases: [...cases] });
      }
    }
  };

  function attachCompute(nextPort: ComputePort): () => void {
    const previous = detachPort;
    detachPort = null;
    if (previous !== null) previous(); // old port checks `port === oldPort`: no clobber
    port = nextPort;
    let detached = false;
    const unsubscribe = nextPort.subscribe(handleResponse);
    const detach = (): void => {
      if (detached) return; // idempotent: safe to call twice
      detached = true;
      unsubscribe();
      if (port === nextPort) {
        port = null;
        detachPort = null;
      }
    };
    detachPort = detach;
    if (get().eval.status !== "ready") requestEvaluate();
    return detach;
  }

  function sampleDisplay(atMs?: number): void {
    const state = get();
    const channel = state.display;
    if (!channel.running || channel.startedAtMs === null) return;
    const timestamp = atMs ?? now();
    const elapsed = timestamp - channel.startedAtMs;
    const raw =
      channel.durationMs <= 0 ? 1 : Math.min(1, Math.max(0, elapsed / channel.durationMs));
    if (raw >= 1) {
      // Settled: snap to the destination exactly — a lerp that ends on a
      // rounding residue would leave the displayed number off by an ULP from
      // the truth it is presenting.
      set({ display: { ...channel, current: { ...channel.to }, running: false } });
      return;
    }
    const eased = easeOutCubic(raw);
    const current: Partial<Record<TargetId, number>> = {};
    for (const targetId of Object.keys(channel.to) as TargetId[]) {
      const from = channel.from[targetId] ?? channel.to[targetId] ?? 0;
      const to = channel.to[targetId] ?? from;
      current[targetId] = from + (to - from) * eased;
    }
    set({
      display: { ...channel, current, running: true }
    });
  }

  function dispose(): void {
    if (commitTimer !== null) {
      clearTimeout(commitTimer);
      commitTimer = null;
    }
    if (detachPort !== null) detachPort();
    pending.clear();
  }

  return {
    useStore: store as unknown as <U>(selector: (state: CorTwinStoreState) => U) => U,
    getState: store.getState,
    subscribe: store.subscribe,
    intents,
    attachEncoder(next: CaseEncoder): void {
      encoder = next;
      requestEvaluate();
    },
    attachCompute,
    requestExplanation,
    sampleDisplay,
    commitNow,
    dispose
  };
}

export type CorTwinStore = ReturnType<typeof createCorTwinStore>;
