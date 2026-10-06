import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type {
  CaseDefinition,
  CaseEncoder,
  ComputeError,
  ComputeOperation,
  ComputePort,
  ComputeRequest,
  ComputeResponse,
  CorTwinStoreState,
  DecisionState,
  Evaluation,
  Explanation,
  HeadlineCad,
  LadderPayload,
  Manifest,
  ModelMetadata,
  Registry,
  TargetEvaluation,
  TargetId
} from "../contracts";
import { COMPUTE_PROTOCOL_VERSION } from "../contracts";
import { createCorTwinStore, type CorTwinStore } from "./createCorTwinStore";

/**
 * SYNTHETIC store-test fixtures — test doubles only, never model output.
 *
 * Everything here is either read from the frozen `config/registry.json`
 * (identity truth, C-02) or invented and clearly labelled. No probability,
 * threshold, decision or reliability in this file is a clinical claim: the
 * numbers exist so the store's revision/staleness/ownership rules can be
 * observed deterministically.
 */

/** C-02 registry of record — the same file the registry gate validates. */
const registryPath = fileURLToPath(new URL("../../../config/registry.json", import.meta.url));
export const registry: Registry = JSON.parse(readFileSync(registryPath, "utf8")) as Registry;

export const TARGET_IDS: readonly TargetId[] = ["CAD", "LAD", "LCX", "RCA"];

/** Feature ids used by the synthetic cases (verified against the registry). */
export const FIXTURE_FEATURES = {
  age: "Age",
  sex: "Sex",
  weight: "Weight",
  htn: "HTN",
  dm: "DM",
  bp: "BP",
  functionClass: "Function Class",
  qWave: "Q Wave",
  fbs: "FBS",
  ldl: "LDL",
  efTte: "EF-TTE",
  vhd: "VHD",
  regionRwma: "Region RWMA"
} as const;

/**
 * Case catalog for the store tests (C-05-shaped, SYNTHETIC).
 * `hypo1` carries 13 provided features across all five modalities;
 * `blank` provides nothing (its values must never influence inference).
 */
export const CASE_A: CaseDefinition = {
  id: "hypo1",
  label: "Synthetic · complete-ish",
  provenance: "hypothetical",
  values: {
    Age: 62,
    Sex: "Male",
    Weight: 80.5,
    HTN: 1,
    DM: 0,
    BP: 130,
    "Function Class": 2,
    "Q Wave": 0,
    FBS: 110,
    LDL: 160,
    "EF-TTE": 55,
    VHD: 1,
    "Region RWMA": 2
  },
  providedFeatures: {
    Age: true,
    Sex: true,
    Weight: true,
    HTN: true,
    DM: true,
    BP: true,
    "Function Class": true,
    "Q Wave": true,
    FBS: true,
    LDL: true,
    "EF-TTE": true,
    VHD: true,
    "Region RWMA": true
  },
  providedModalities: { history: true, exam: true, ecg: true, labs: true, echo: true },
  notes: []
};

export const CASE_B: CaseDefinition = {
  id: "blank",
  label: "Synthetic · blank",
  provenance: "blank",
  values: {},
  providedFeatures: {},
  providedModalities: {},
  notes: []
};

export const CASES: readonly CaseDefinition[] = [CASE_A, CASE_B];

/** Expected completion/modality counts implied by `CASE_A` (hardcoded on purpose). */
export const CASE_A_EXPECTED = {
  provided: 13,
  total: 54,
  byModality: {
    history: { provided: 5, total: 17 },
    exam: { provided: 2, total: 13 },
    ecg: { provided: 1, total: 7 },
    labs: { provided: 2, total: 14 },
    echo: { provided: 3, total: 3 }
  }
} as const;

/**
 * Domain-encoder double (Architecture §8 boundary): registry-order vector,
 * numeric values passed through, string values mapped to a deterministic
 * synthetic code, observed mask from per-feature provision. The real encoder
 * ships with the domain module at P4; nothing here encodes clinical meaning.
 */
export const makeEncoder = (): CaseEncoder => (input) => {
  const features = input.registry.features;
  const featureVector = new Float32Array(features.length);
  const observedMask = new Uint8Array(features.length);
  features.forEach((feature, index) => {
    const value = input.values[feature.id];
    if (typeof value === "number") {
      featureVector[index] = value;
    } else if (typeof value === "string") {
      let code = 0;
      for (let i = 0; i < value.length; i += 1) code += value.charCodeAt(i);
      featureVector[index] = code;
    }
    observedMask[index] = input.providedFeatures[feature.id] === true ? 1 : 0;
  });
  return { featureVector, observedMask };
};

/** An encoder that fails like the real one: typed error, message without values. */
export const makeThrowingEncoder = (code?: string): CaseEncoder => (input) => {
  void input;
  if (code === undefined) throw new Error("synthetic encoder failure");
  throw Object.assign(new Error("synthetic encoder failure"), { code });
};

/* ------------------------------------------------------------------ *
 * C-08-shaped synthetic payloads
 * ------------------------------------------------------------------ */

const decisionFor = (probability: number): DecisionState =>
  probability >= 0.55 ? "above" : probability <= 0.45 ? "below" : "indeterminate";

const logit = (p: number): number => Math.log(p / (1 - p));

const RELIABILITY_DEFAULT: Record<TargetId, TargetEvaluation["reliability"]> = {
  CAD: "strong",
  LAD: "moderate",
  LCX: "limited",
  RCA: "limited"
};

export type EvaluationOptions = {
  probabilities?: Partial<Record<TargetId, number>>;
  decisions?: Partial<Record<TargetId, DecisionState>>;
  headline?: Partial<HeadlineCad>;
  observedFeatureIds?: string[];
  rangeFlags?: Record<string, boolean>;
};

/** Default synthetic probabilities — distinct enough to spot a mix-up. */
export const DEFAULT_PROBABILITIES: Record<TargetId, number> = {
  CAD: 0.62,
  LAD: 0.71,
  LCX: 0.44,
  RCA: 0.38
};

/**
 * Well-formed `Evaluation` for a given revision. The headline defaults to the
 * C-08 coherence rule (max over the four targets, vessel as value source when
 * it wins) so tests exercise the "CAD shown from LAD" case, and can be
 * overridden to a value the selector must pass through untouched.
 */
export function makeEvaluation(revision: number, options: EvaluationOptions = {}): Evaluation {
  const probabilities = { ...DEFAULT_PROBABILITIES, ...options.probabilities };
  const targets = {} as Record<TargetId, TargetEvaluation>;
  for (const targetId of TARGET_IDS) {
    const probability = probabilities[targetId];
    const abstentionWidth = 0.03;
    targets[targetId] = {
      targetId,
      probability,
      calibratedMargin: logit(probability),
      thresholdProbability: 0.5,
      decision: options.decisions?.[targetId] ?? decisionFor(probability),
      reliability: RELIABILITY_DEFAULT[targetId],
      abstention: {
        lowerProbability: probability - abstentionWidth,
        upperProbability: probability + abstentionWidth,
        halfWidthMargin: 0.08
      }
    };
  }

  let valueSource: TargetId = "CAD";
  for (const targetId of TARGET_IDS) {
    if (probabilities[targetId] > probabilities[valueSource]) valueSource = targetId;
  }
  const headline: HeadlineCad = {
    probability: probabilities[valueSource],
    valueSourceTargetId: valueSource,
    decisionReferenceTargetId: "CAD",
    decision: targets.CAD.decision,
    reliability: targets.CAD.reliability,
    thresholdProbability: targets.CAD.thresholdProbability,
    explanationSourceTargetId: valueSource,
    ...options.headline
  };

  return {
    revision,
    observedFeatureIds: options.observedFeatureIds ?? [],
    targets,
    headlineCad: headline,
    rangeFlags: options.rangeFlags ?? {}
  };
}

/** Well-formed `Explanation` for a given revision/target (synthetic numbers). */
export function makeExplanation(revision: number, targetId: TargetId): Explanation {
  return {
    revision,
    targetId,
    referenceMargin: -0.25,
    outputMargin: 0.42,
    efficiencyResidual: 1e-7,
    featureAttributions: [
      { featureId: "Age", value: 62, contribution: 0.12, direction: "positive" },
      { featureId: "Weight", value: 80.5, contribution: -0.05, direction: "negative" }
    ],
    displayGroups: [
      { groupId: "demographics", contribution: 0.12, memberFeatureIds: ["Age"] }
    ],
    modalityContributions: [
      { modalityId: "history", contribution: 0.07, memberFeatureIds: ["Age"] }
    ],
    measurements: [
      {
        featureId: "Age",
        value: 62,
        cohortPosition: { kind: "percentile", value: 55 },
        contribution: 0.12,
        direction: "positive"
      }
    ],
    caveats: [
      "ATTRIBUTION_NOT_CAUSATION",
      "CORRELATED_FEATURES_SHARE_CREDIT",
      "BACKGROUND_SET_DEPENDENT"
    ],
    narrative: { templateId: "synthetic-template", slots: {} }
  };
}

/* ------------------------------------------------------------------ *
 * C-07-shaped synthetic request/response plumbing
 * ------------------------------------------------------------------ */

export type TestComputePort = ComputePort & {
  readonly requests: ComputeRequest[];
  lastRequest(): ComputeRequest | undefined;
  requestsFor(operation: ComputeOperation): ComputeRequest[];
  respond(response: ComputeResponse): void;
  setSubmitFailure(fails: boolean): void;
  listenerCount(): number;
};

/** A C-07 port double: records requests, dispatches responses synchronously. */
export function makePort(): TestComputePort {
  const listeners = new Set<(response: ComputeResponse) => void>();
  const requests: ComputeRequest[] = [];
  let fails = false;
  return {
    requests,
    submit(request) {
      if (fails) throw new Error("synthetic port failure");
      requests.push(request);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    respond(response) {
      for (const listener of [...listeners]) listener(response);
    },
    lastRequest() {
      return requests[requests.length - 1];
    },
    requestsFor(operation) {
      return requests.filter((request) => request.operation === operation);
    },
    setSubmitFailure(next) {
      fails = next;
    },
    listenerCount() {
      return listeners.size;
    }
  };
}

function baseResponse(request: ComputeRequest, patch: Partial<ComputeResponse>): ComputeResponse {
  return {
    protocolVersion: COMPUTE_PROTOCOL_VERSION,
    requestId: request.requestId,
    channel: request.channel,
    revision: request.revision,
    lane: request.lane,
    operation: request.operation,
    status: "ok",
    ...patch
  };
}

/** A well-formed evaluate response that echoes its request (the happy path). */
export function evaluationResponse(
  request: ComputeRequest,
  evaluation: Evaluation,
  patch: Partial<ComputeResponse> = {}
): ComputeResponse {
  return baseResponse(request, { evaluation, ...patch });
}

export function explanationResponse(
  request: ComputeRequest,
  explanation: Explanation,
  patch: Partial<ComputeResponse> = {}
): ComputeResponse {
  return baseResponse(request, { explanation, ...patch });
}

export function ladderResponse(
  request: ComputeRequest,
  ladder: LadderPayload,
  patch: Partial<ComputeResponse> = {}
): ComputeResponse {
  return baseResponse(request, { ladder, ...patch });
}

export function errorResponse(
  request: ComputeRequest,
  error: ComputeError,
  patch: Partial<ComputeResponse> = {}
): ComputeResponse {
  return baseResponse(request, { status: "error", error, ...patch });
}

/* ------------------------------------------------------------------ *
 * Boot manifest / metadata doubles (shape only, clearly synthetic)
 * ------------------------------------------------------------------ */

const FAKE_SHA = "0".repeat(64);

export function makeManifest(): Manifest {
  const artifact = { path: "synthetic", sha256: FAKE_SHA, sizeBytes: 1 };
  return {
    schemaVersion: "1.0.0",
    appVersion: "0.0.0-test",
    bundleId: `sha256:${FAKE_SHA}`,
    modelId: `sha256:${FAKE_SHA}`,
    artifacts: {
      registry: artifact,
      model: artifact,
      structures: artifact,
      cases: artifact,
      results: artifact,
      fixtures: artifact
    },
    provenance: {
      dataSha256: FAKE_SHA,
      seedSet: {},
      sourceRevision: "test",
      toolVersions: {}
    },
    attributions: [
      {
        source: "synthetic",
        licence: "synthetic",
        attribution: "synthetic test double",
        modificationStatus: "synthetic"
      }
    ]
  };
}

export function makeModelMetadata(): ModelMetadata {
  return {
    schemaVersion: "1.0.0",
    modelId: `sha256:${FAKE_SHA}`,
    modelFamily: "additive-ensemble",
    featureCount: 54,
    targets: ["CAD", "LAD", "LCX", "RCA"],
    appVersion: "0.0.0-test"
  };
}

/* ------------------------------------------------------------------ *
 * Harness
 * ------------------------------------------------------------------ */

export type HarnessOptions = {
  ready?: boolean;
  autoSelect?: boolean;
  cases?: readonly CaseDefinition[];
  encoder?: CaseEncoder;
  withPort?: boolean;
  settleMs?: number;
  displayDurationMs?: number;
  now?: () => number;
};

export type Harness = {
  store: CorTwinStore;
  port: TestComputePort;
  state(): CorTwinStoreState;
  evaluateRequest(index?: number): ComputeRequest;
  dispose(): void;
};

const harnesses: Harness[] = [];

/**
 * Boot a store through the contract's own pathways (bundle loader + case
 * selection). Commit timers default to a long settle so tests stay inert;
 * a test that wants the timer passes `settleMs`.
 */
export function createHarness(options: HarnessOptions = {}): Harness {
  const {
    ready = true,
    autoSelect = true,
    cases = CASES,
    encoder = makeEncoder(),
    withPort = true,
    settleMs = 60_000,
    displayDurationMs = 400,
    now
  } = options;

  const store = createCorTwinStore({ settleMs, displayDurationMs, now });
  store.attachEncoder(encoder);
  if (ready) {
    store.intents.bundle.setReady({
      manifest: makeManifest(),
      registry,
      modelMetadata: makeModelMetadata()
    });
    store.intents.bundle.setCases(cases);
  }
  if (autoSelect && ready) {
    const result = store.intents.case.select(cases[0].id);
    if (!result.ok) throw new Error(`harness boot failed: ${result.error.message}`);
  }

  const port = makePort();
  if (withPort) store.attachCompute(port);

  const harness: Harness = {
    store,
    port,
    state: () => store.getState(),
    evaluateRequest(index = 0) {
      const requests = port.requestsFor("evaluate");
      const request = requests[index];
      if (request === undefined) throw new Error("no evaluate request was submitted");
      return request;
    },
    dispose() {
      store.dispose();
    }
  };
  harnesses.push(harness);
  return harness;
}

/** `afterEach` hook: every harness created in the test is disposed. */
export function disposeHarnesses(): void {
  while (harnesses.length > 0) {
    const harness = harnesses.pop();
    if (harness !== undefined) harness.dispose();
  }
}
