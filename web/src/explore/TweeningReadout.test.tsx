import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import type { ProbabilityReadoutProps } from "../components/ProbabilityReadout";
import { createHarness, disposeHarnesses } from "../store/testFixtures";
import { answerEvaluations, readyHarness, settleDisplay } from "./exploreTestHarness";
import { easedValueFor, TweeningReadout } from "./TweeningReadout";

/**
 * P1-a2 — the narrow eased-value readout channel.
 *
 * The workspace composition subscribes through the committed-stable snapshot
 * (see `stableSnapshot.test.ts`); this unit covers the other half of the
 * contract: the per-frame eased number still reaches the single probability
 * renderer, reads the channel's own slot (never a re-derived value) while a
 * transition runs, settles exactly on the payload, and collapses to the
 * committed value under reduced motion.
 */

afterEach(() => {
  disposeHarnesses();
});

function readoutPropsFor(
  h: ReturnType<typeof createHarness>,
  targetId: "LAD" | "LCX" | "RCA"
): ProbabilityReadoutProps {
  const evaluation = h.state().eval.current;
  if (evaluation === null) throw new Error("expected an evaluation");
  const payload = evaluation.targets[targetId];
  return {
    value: payload.probability,
    targetId,
    targetLabel: targetId,
    threshold: payload.thresholdProbability,
    decision: payload.decision,
    reliability: payload.reliability,
    size: "compact"
  };
}

describe("easedValueFor — the channel's slot, never a derived number", () => {
  it("falls back to the settled prop before the first evaluation (no invented value)", () => {
    const h = createHarness();
    expect(easedValueFor(h.store, "LAD", 0.42)).toBe(0.42);
  });

  it("reads the channel's eased slot while a transition runs, then the exact payload", () => {
    const h = createHarness();
    answerEvaluations(h);
    const evaluation = h.state().eval.current;
    if (evaluation === null) throw new Error("expected an evaluation");
    expect(h.state().display.running).toBe(true);
    expect(easedValueFor(h.store, "LAD", -1)).toBe(h.state().display.current.LAD);

    const started = h.state().display.startedAtMs;
    const duration = h.state().display.durationMs;
    if (started === null || duration <= 0) throw new Error("expected a running transition");
    h.store.sampleDisplay(started + duration * 0.5);
    expect(easedValueFor(h.store, "LAD", -1)).toBe(h.state().display.current.LAD);

    settleDisplay(h);
    expect(h.state().display.running).toBe(false);
    expect(easedValueFor(h.store, "LAD", -1)).toBe(evaluation.targets.LAD.probability);
  });

  it("reduced motion: the zero-frame window renders the payload immediately", () => {
    const h = readyHarness({ reducedMotion: true });
    const evaluation = h.state().eval.current;
    if (evaluation === null) throw new Error("expected an evaluation");
    expect(h.state().display.running).toBe(false);
    expect(easedValueFor(h.store, "CAD", -1)).toBe(evaluation.headlineCad.probability);
  });
});

describe("TweeningReadout — renders through the single probability renderer", () => {
  it("SSR renders the readout markup with the settled number (no wrapper, no extra state)", () => {
    const h = createHarness();
    answerEvaluations(h);
    settleDisplay(h);
    const props = readoutPropsFor(h, "LAD");
    const html = renderToString(
      <TweeningReadout store={h.store} targetId="LAD" readout={props} />
    );
    expect(html).toContain('class="ct-prob-readout');
    expect(html).toContain('data-target-id="LAD"');
    expect(html).toContain(`${Math.round(props.value * 100)}%`);
    // The element IS the readout: no wrapper layer sits above it.
    expect(html.startsWith('<div class="ct-prob-readout')).toBe(true);
  });
});
