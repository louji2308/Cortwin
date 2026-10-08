import { useSyncExternalStore, type ReactElement } from "react";
import { ProbabilityReadout, type ProbabilityReadoutProps } from "../components/ProbabilityReadout";
import type { TargetId } from "../contracts";
import type { CorTwinStore } from "../store";
import { displayedProbability } from "./model";

/**
 * P1-a2 — the eased-value readout mount for the Explore composition.
 *
 * The workspace subscribes through the committed-stable snapshot
 * (`./stableSnapshot`), so per-frame display easing no longer re-renders
 * the whole composition. This component is the narrow channel that still
 * receives the per-frame eased number: it subscribes to the store, projects
 * exactly one target through `displayedProbability` (P-4 — data truth and
 * displayed animation stay separate surfaces) and renders the value through
 * the product's single probability renderer (C-12 / INV-07: every number,
 * threshold relation, glyph and bar belongs to `ProbabilityReadout`).
 *
 * `readout` carries the committed props (threshold, decision, reliability,
 * labels); `value` is the eased slot while a transition runs and settles
 * exactly on the payload when the channel completes. Reduced motion
 * collapses the window to zero frames at the store, so this renders the
 * committed value immediately with meaning unchanged.
 */
export type TweeningReadoutProps = {
  store: CorTwinStore;
  targetId: TargetId;
  readout: ProbabilityReadoutProps;
};

export function TweeningReadout({
  store,
  targetId,
  readout
}: TweeningReadoutProps): ReactElement {
  const value = useSyncExternalStore(
    store.subscribe,
    () => easedValueFor(store, targetId, readout.value),
    () => readout.value
  );
  return <ProbabilityReadout {...readout} value={value} />;
}

/**
 * The pure per-frame projection behind the subscription: the channel's eased
 * slot for `targetId` while easing, otherwise the settled value `readout`
 * already carries — never a derived, clamped or invented number.
 */
export function easedValueFor(
  store: CorTwinStore,
  targetId: TargetId,
  settled: number
): number {
  const state = store.getState();
  return displayedProbability(state, targetId) ?? settled;
}
