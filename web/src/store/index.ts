import { createCorTwinStore } from "./createCorTwinStore";

export {
  COMMIT_SETTLE_MS,
  DISPLAY_DURATION_MS,
  createCorTwinStore,
  type CorTwinStore,
  type StoreDeps
} from "./createCorTwinStore";
export {
  selectCompletion,
  selectDisplayedCad,
  selectExplanation,
  selectIsStale,
  selectModalityCounts,
  selectSelectedTarget,
  selectUrlState,
  selectVesselIds,
  selectVesselStates,
  type CompletionStats,
  type DisplayedCad,
  type ModalityCount,
  type VesselVisualState
} from "./selectors";

/**
 * C-09 §7.1 — one store, one truth. The application binds to this singleton;
 * tests build isolated instances via `createCorTwinStore` instead (no shared
 * state, no cross-test leakage).
 */
export const store = createCorTwinStore();
