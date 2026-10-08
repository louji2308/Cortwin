import { afterEach, describe, expect, it } from "vitest";
import { createHarness, disposeHarnesses } from "../store/testFixtures";
import { answerEvaluations, settleDisplay } from "./exploreTestHarness";
import { stableCorTwinSnapshot } from "./stableSnapshot";

/**
 * P1-a2 — the committed-stable subscription snapshot.
 *
 * `useSyncExternalStore` re-renders exactly when the snapshot reference
 * changes, so identity stability across a driven easing window IS the
 * reduction of `ExploreView`'s React commits from one-per-frame to exactly
 * two per transition (edit commit + settle). The raw-state assertions
 * document why the cache exists: `sampleDisplay` hands out a NEW top-level
 * state object on every frame, which the old whole-state subscription turned
 * into a full workspace re-render ~60×/s (P-4 violation, B-04 cost).
 *
 * Every mutation it guards is driven through the real store harness — no
 * fabricated state objects.
 */

afterEach(() => {
  disposeHarnesses();
});

describe("stableCorTwinSnapshot — identity across easing frames", () => {
  it("the raw store hands out a new object every easing frame (the bug)", () => {
    const h = createHarness();
    answerEvaluations(h);
    const started = h.state().display.startedAtMs;
    const duration = h.state().display.durationMs;
    if (started === null || duration <= 0) throw new Error("expected a running transition");
    const first = h.state();
    h.store.sampleDisplay(started + duration * 0.5);
    expect(h.state()).not.toBe(first); // fresh state object per frame
  });

  it("the Explore snapshot keeps ONE identity across every easing frame", () => {
    const h = createHarness();
    answerEvaluations(h);
    const started = h.state().display.startedAtMs;
    const duration = h.state().display.durationMs;
    if (started === null || duration <= 0) throw new Error("expected a running transition");
    const snapshot = stableCorTwinSnapshot(h.store);
    for (const fraction of [0.25, 0.5, 0.75]) {
      h.store.sampleDisplay(started + duration * fraction);
      expect(stableCorTwinSnapshot(h.store)).toBe(snapshot); // React bails out
    }
  });

  it("the settle boundary (running flips) rebuilds the snapshot", () => {
    const h = createHarness();
    answerEvaluations(h);
    const snapshot = stableCorTwinSnapshot(h.store);
    settleDisplay(h);
    const settled = stableCorTwinSnapshot(h.store);
    expect(settled).not.toBe(snapshot); // the second commit of the transition
    expect(settled.display.running).toBe(false);
  });

  it("committed and structural changes rebuild the snapshot", () => {
    const h = createHarness();
    answerEvaluations(h);
    settleDisplay(h);

    const beforeSelection = stableCorTwinSnapshot(h.store);
    h.store.intents.selection.selectTarget("LAD");
    expect(stableCorTwinSnapshot(h.store)).not.toBe(beforeSelection);

    const beforeEdit = stableCorTwinSnapshot(h.store);
    h.store.intents.case.setValue("Age", 70);
    expect(stableCorTwinSnapshot(h.store)).not.toBe(beforeEdit);

    const beforeMotion = stableCorTwinSnapshot(h.store);
    h.store.intents.view.setReducedMotion(true);
    expect(stableCorTwinSnapshot(h.store)).not.toBe(beforeMotion);
  });
});
