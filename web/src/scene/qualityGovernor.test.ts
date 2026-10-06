import { describe, expect, it } from "vitest";
import {
  QUALITY_TIER_ORDER,
  SLOW_FRAME_MS,
  SLOW_FRAMES_TO_DOWNGRADE,
  effectiveQualityTier,
  initialGovernorState,
  isQualityTier,
  reduceGovernor,
  type GovernorState,
  type QualityEvent
} from "./qualityGovernor";

const slow: QualityEvent = { type: "frame-sample", frameTimeMs: 100 };
const healthy: QualityEvent = { type: "frame-sample", frameTimeMs: 10 };
const reduce = (events: QualityEvent[], from: GovernorState = initialGovernorState()): GovernorState =>
  events.reduce((state, event) => reduceGovernor(state, event), from);

describe("quality governor (Architecture §10.4, C-16) — pure, downgrade-only", () => {
  it("starts at Q0 with no streak, no force and an available context", () => {
    expect(initialGovernorState()).toEqual({
      tier: "Q0",
      slowStreak: 0,
      forcedTier: null,
      contextLost: false,
      contextUnavailable: false
    });
    expect(QUALITY_TIER_ORDER).toEqual(["Q0", "Q1", "Q2", "Q3"]);
    expect(isQualityTier("Q2")).toBe(true);
    expect(isQualityTier("Q9")).toBe(false);
  });

  it("treats frames slower than the 30 fps budget as slow and faster as healthy", () => {
    expect(SLOW_FRAME_MS).toBeCloseTo(1000 / 30, 10);
    const justSlow = reduceGovernor(initialGovernorState(), {
      type: "frame-sample",
      frameTimeMs: SLOW_FRAME_MS + 0.001
    });
    expect(justSlow.slowStreak).toBe(1);
    const justHealthy = reduceGovernor(initialGovernorState(), {
      type: "frame-sample",
      frameTimeMs: SLOW_FRAME_MS - 0.001
    });
    expect(justHealthy.slowStreak).toBe(0);
  });

  it("downgrades only after N consecutive slow frames (hysteresis), one tier at a time", () => {
    expect(SLOW_FRAMES_TO_DOWNGRADE).toBe(3);
    expect(reduce([slow]).tier).toBe("Q0");
    expect(reduce([slow, slow]).tier).toBe("Q0");
    expect(reduce([slow, slow, slow]).tier).toBe("Q1");
    expect(reduce([slow, slow, slow, slow, slow, slow]).tier).toBe("Q2");
    // One healthy frame resets the streak: no downgrade can accrue across it.
    expect(reduce([slow, slow, healthy, slow, slow]).tier).toBe("Q0");
    expect(reduce([slow, slow, slow]).slowStreak).toBe(0);
  });

  it("never upgrades on its own — the automatic tier is downgrade-only within a session", () => {
    const stuck = reduce([slow, slow, slow, slow, slow, slow, slow, slow, slow, slow, slow, slow]);
    expect(stuck.tier).toBe("Q3");
    const recovered = reduce(
      [{ type: "frame-sample", frameTimeMs: 1 }, { type: "frame-sample", frameTimeMs: 1 }],
      stuck
    );
    expect(recovered.tier).toBe("Q3");
  });

  it("idle events change nothing (idle time is neither slow nor healthy)", () => {
    const before = reduce([slow, slow]);
    expect(reduceGovernor(before, { type: "idle" })).toBe(before);
    expect(reduceGovernor(before, { type: "idle" }).slowStreak).toBe(2);
  });

  it("malformed frame telemetry degrades toward the safe tier rather than being ignored", () => {
    expect(reduce([{ type: "frame-sample", frameTimeMs: Number.NaN }]).slowStreak).toBe(1);
    expect(reduce([{ type: "frame-sample", frameTimeMs: -1 }]).slowStreak).toBe(1);
    expect(reduce([slow, slow, { type: "frame-sample", frameTimeMs: Number.NaN }]).tier).toBe("Q1");
  });

  it("webgl-unavailable jumps straight to Q3 and is terminal", () => {
    const state = reduceGovernor(initialGovernorState(), { type: "webgl-unavailable" });
    expect(state.tier).toBe("Q3");
    expect(state.contextUnavailable).toBe(true);
    // Frame samples after the context is gone change nothing.
    expect(reduceGovernor(state, slow)).toBe(state);
    // A restore event cannot clear the terminal flag.
    expect(reduceGovernor(state, { type: "context-restored" })).toBe(state);
    expect(effectiveQualityTier(state)).toBe("Q3");
  });

  it("context loss: recoverable keeps the tier and resumes, unrecoverable is terminal Q3", () => {
    const recoverable = reduceGovernor(
      reduce([slow, slow, slow]),
      { type: "context-lost", recoverable: true }
    );
    expect(recoverable.tier).toBe("Q1");
    expect(recoverable.contextLost).toBe(true);
    expect(recoverable.slowStreak).toBe(0);
    expect(reduceGovernor(recoverable, slow)).toBe(recoverable);
    const restored = reduceGovernor(recoverable, { type: "context-restored" });
    expect(restored.contextLost).toBe(false);
    expect(reduceGovernor(restored, slow).slowStreak).toBe(1);

    const unrecoverable = reduceGovernor(initialGovernorState(), {
      type: "context-lost",
      recoverable: false
    });
    expect(unrecoverable).toMatchObject({ tier: "Q3", contextUnavailable: true });
  });

  it("user force is a separate channel: it wins over the auto tier, releasing restores it", () => {
    const atQ1 = reduce([slow, slow, slow]);
    expect(atQ1.tier).toBe("Q1");
    const forced = reduceGovernor(atQ1, { type: "user-force-tier", tier: "Q3" });
    expect(forced.tier).toBe("Q1");
    expect(forced.forcedTier).toBe("Q3");
    expect(effectiveQualityTier(forced)).toBe("Q3");
    const released = reduceGovernor(forced, { type: "user-force-tier", tier: null });
    expect(released.forcedTier).toBeNull();
    expect(effectiveQualityTier(released)).toBe("Q1");
    // An invalid force is rejected untouched.
    expect(reduceGovernor(released, { type: "user-force-tier", tier: "Q9" as never })).toBe(released);
  });

  it("an unavailable context beats any user force", () => {
    const forced = reduceGovernor(initialGovernorState(), {
      type: "user-force-tier",
      tier: "Q1"
    });
    const unavailable = reduceGovernor(forced, { type: "webgl-unavailable" });
    expect(effectiveQualityTier(unavailable)).toBe("Q3");
  });

  it("is pure: events never mutate the input state object", () => {
    const before = initialGovernorState();
    const snapshot = JSON.stringify(before);
    reduce([slow, slow, slow, { type: "user-force-tier", tier: "Q2" }], before);
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(reduceGovernor(before, slow)).not.toBe(before);
    expect(before.tier).toBe("Q0");
  });
});
