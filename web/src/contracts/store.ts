import type { ComputeError } from "./compute";
import type { CaseDefinition, CaseProvenance } from "./cases";
import type { Manifest, ModelMetadata, Registry, Results } from "./artifacts";
import type { Evaluation, Explanation } from "./evaluation";
import type {
  CameraPreset,
  DrawerId,
  EvalStatus,
  FeatureId,
  FeatureValue,
  ModalityId,
  QualityTier,
  ResultsStatus,
  StageId,
  TargetId,
  ViewRoute,
} from "./primitives";

/** C-09 §7.1 — verbatim. The store is the sole runtime source of truth. */
export type CorTwinState = {
  bundle: { status: "booting" | "ready" | "error";
    manifest: Manifest | null; registry: Registry | null; modelMetadata: ModelMetadata | null;
    resultsStatus: ResultsStatus; results: Results | null };
  case: { id: string; provenance: CaseProvenance;
    values: Record<FeatureId, FeatureValue>;
    providedModalities: Record<ModalityId, boolean>; providedFeatures: Record<FeatureId, boolean>;
    customSubset: boolean; revision: number; committedRevision: number;
    committedValues: Record<FeatureId, FeatureValue> };
  eval: { status: EvalStatus;
    current: Evaluation | null; committed: Evaluation | null;
    stageEvaluations: Record<string, Evaluation | null>;
    explanationCache: Record<string, Explanation>; error: ComputeError | null };
  selection: { targetId: TargetId | null; modalityId: ModalityId | null;
    featureId: FeatureId | null; stageId: StageId | null;
    hovered: { kind: "vessel" | "modality" | "feature"; id: string } | null };
  view: { route: ViewRoute; pane: string | null;
    drawer: DrawerId | null;
    cameraPreset: CameraPreset;
    tourStep: number | null; qualityTier: QualityTier; reducedMotion: boolean };
};

/** Result of a case intent: typed failure without patient data in `message`. */
export type IntentResult = { ok: true } | { ok: false; error: ComputeError };

/**
 * C-09 §7.1 case intents — verbatim names. A failing intent mutates nothing;
 * encode failures surface as `INVALID_FEATURE_VECTOR`.
 */
export type CaseIntents = {
  select(caseId: string): IntentResult;
  setValue(featureId: FeatureId, value: FeatureValue): IntentResult;
  setModalityProvided(modalityId: ModalityId, provided: boolean): IntentResult;
  setFeatureProvided(featureId: FeatureId, provided: boolean): IntentResult;
  reset(): IntentResult;
  /** C-09 §7.1 / C-14 P1 flag: marks the case as a user-built subset (stops
   * cumulative-ladder validation claims; never a revision change). */
  enableCustomSubset(): void;
};

/** C-09 §7.1 selection intents — verbatim names; selection never bumps revision. */
export type SelectionIntents = {
  selectTarget(targetId: TargetId | null): void;
  selectModality(modalityId: ModalityId | null): void;
  selectFeature(featureId: FeatureId | null): void;
  selectStage(stageId: StageId | null): void;
  setHover(hovered: CorTwinState["selection"]["hovered"]): void;
};

/** C-09 §7.1 view intents — verbatim names; view never bumps revision. */
export type ViewIntents = {
  navigate(route: ViewRoute, pane: string | null): void;
  openDrawer(drawer: DrawerId): void;
  closeDrawer(): void;
  setCameraPreset(cameraPreset: CameraPreset): void;
  startTour(): void;
  stopTour(): void;
  setTourStep(step: number | null): void;
  setQualityTier(qualityTier: QualityTier): void;
  setReducedMotion(reducedMotion: boolean): void;
};

/**
 * C-09 §7.1 write ownership ("bundle → bundle loader"): the typed pathway the
 * boot loader uses to publish verified artifacts. Not a user intent; never
 * touches case truth, eval truth, selection or view.
 */
export type BundleIntents = {
  setBooting(): void;
  setReady(input: { manifest: Manifest; registry: Registry; modelMetadata: ModelMetadata }): void;
  setBundleError(): void;
  setResultsStatus(status: ResultsStatus): void;
  setResults(results: Results): void;
  /** Catalog of selectable cases (C-05); applied before `case.select`. */
  setCases(cases: readonly CaseDefinition[]): void;
};

/** C-09 §7.1 intent groups. */
export type CorTwinIntents = {
  case: CaseIntents;
  selection: SelectionIntents;
  view: ViewIntents;
  bundle: BundleIntents;
};

/** C-09 §7.1 display channel — interpolated presentation values only. */
export type DisplayChannel = {
  durationMs: number;
  startedAtMs: number | null;
  running: boolean;
  from: Partial<Record<TargetId, number>>;
  to: Partial<Record<TargetId, number>>;
  current: Partial<Record<TargetId, number>>;
};

/**
 * C-09 §7.1 `CorTwinState` plus the non-truth surfaces the contract
 * assigns elsewhere: the display channel (presentation interpolation only)
 * and the C-05 case catalog the loader publishes (read by `case.select`,
 * never written by user intents).
 */
export type CorTwinStoreState = CorTwinState & {
  display: DisplayChannel;
  cases: readonly CaseDefinition[];
};
