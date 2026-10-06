import { describe, expect, it } from "vitest";
import { SLOW_FRAME_MS, type QualityTier } from "../scene";
import {
  IDLE_GAP_MS,
  SUSPENDED_GAP_MS,
  antialiasForTier,
  classifyGap,
  dprRangeForTier,
  initialRuntimeState,
  pushEvent,
  shouldForceTier,
  tick,
  type RuntimeState
} from "./governorRuntime";

type DriveResult = {
  state: RuntimeState;
  effectiveTier: QualityTier;
  tierChanged: boolean;
};

/** Drive `count` consecutive ticks spaced `gapMs`, starting at `startMs`. */
function drive(
  startMs: number,
  gapMs: number,
  count: number,
  willContinue = true
): DriveResult {
  let state = initialRuntimeState();
  let last: DriveResult = { state, effectiveTier: "Q0", tierChanged: false };
  let now = startMs;
  for (let i = 0; i < count; i += 1) {
    const result = tick(state, now, willContinue);
    last = {
      state: result.state,
      effectiveTier: result.effectiveTier,
      tierChanged: result.tierChanged
    };
    state = result.state;
    now += gapMs;
  }
  return last;
}

describe("classifyGap — evidence or waiting", () => {
  it("samples any gap while frames are flowing", () => {
    expect(classifyGap(16, false)).toBe("sample");
    expect(classifyGap(IDLE_GAP_MS, false)).toBe("sample");
  });

  it("idles past the idle threshold when nothing asked for continuation", () => {
    expect(classifyGap(IDLE_GAP_MS + 1, false)).toBe("idle");
    expect(classifyGap(10_000, false)).toBe("idle");
  });

  it("samples a long gap when the previous frame asked to continue (slow machine, not idle)", () => {
    expect(classifyGap(1_000, true)).toBe("sample");
    expect(classifyGap(IDLE_GAP_MS + 1, true)).toBe("sample");
  });

  it("treats a suspension-sized gap as idle even with continuation (background tab)", () => {
    expect(classifyGap(SUSPENDED_GAP_MS + 1, true)).toBe("idle");
  });

  it("treats non-finite or negative gaps as idle", () => {
    expect(classifyGap(Number.NaN, true)).toBe("idle");
    expect(classifyGap(-5, true)).toBe("idle");
  });
});

describe("tick — governor telemetry loop", () => {
  it("first frame produces no evidence and no tier change", () => {
    const result = tick(initialRuntimeState(), 1_000, false);
    expect(result.event).toBeNull();
    expect(result.effectiveTier).toBe("Q0");
    expect(result.tierChanged).toBe(false);
    expect(result.state.lastFrameAtMs).toBe(1_000);
  });

  it("healthy frame intervals keep Q0 and reset any slow streak", () => {
    const last = drive(0, 16, 5);
    expect(last.effectiveTier).toBe("Q0");
    expect(last.state.governor.slowStreak).toBe(0);
  });

  it("three consecutive slow frames downgrade Q0 → Q1 exactly once (hysteresis)", () => {
    const gap = Math.ceil(SLOW_FRAME_MS) + 1;
    let state = initialRuntimeState();
    const tiers: string[] = [];
    let now = 0;
    for (let i = 0; i < 4; i += 1) {
      const result = tick(state, now, true);
      state = result.state;
      tiers.push(result.effectiveTier);
      now += gap;
    }
    expect(tiers).toEqual(["Q0", "Q0", "Q0", "Q1"]);
    expect(state.governor.slowStreak).toBe(0);
  });

  it("a healthy frame between slow ones resets the streak (no oscillation)", () => {
    let state = initialRuntimeState();
    const slow = Math.ceil(SLOW_FRAME_MS) + 1;
    state = tick(state, 0, true).state;
    state = tick(state, slow, true).state;
    state = tick(state, slow * 2, true).state;
    expect(state.governor.slowStreak).toBe(2);
    state = tick(state, slow * 2 + 16, true).state;
    expect(state.governor.slowStreak).toBe(0);
    expect(state.governor.tier).toBe("Q0");
  });

  it("downgrade-only: a healthy stretch after a downgrade never upgrades back", () => {
    const slow = Math.ceil(SLOW_FRAME_MS) + 1;
    const downgraded = drive(0, slow, 4);
    expect(downgraded.effectiveTier).toBe("Q1");
    // continue the SAME session with healthy frames: the automatic tier stays
    let state = downgraded.state;
    for (let i = 0; i < 10; i += 1) {
      const result = tick(state, 100_000 + i * 16, false);
      state = result.state;
      expect(result.effectiveTier).toBe("Q1");
    }
    expect(state.governor.tier).toBe("Q1");
    expect(state.governor.slowStreak).toBe(0);
  });

  it("idle gaps change nothing — not healthy, not slow (qualityGovernor law)", () => {
    let state = tick(initialRuntimeState(), 0, false).state;
    const result = tick(state, 60_000, false);
    expect(result.event).toEqual({ type: "idle" });
    expect(result.state.governor.slowStreak).toBe(0);
    expect(result.effectiveTier).toBe("Q0");
    expect(result.tierChanged).toBe(false);
  });

  it("a long continuation gap is sampled as slow evidence", () => {
    let state = tick(initialRuntimeState(), 0, true).state;
    const result = tick(state, 1_000, false);
    expect(result.event).toEqual({ type: "frame-sample", frameTimeMs: 1_000 });
    expect(result.state.governor.slowStreak).toBe(1);
  });

  it("a suspension-sized gap produces idle instead of a false downgrade", () => {
    let state = tick(initialRuntimeState(), 0, true).state;
    const result = tick(state, 60_000, true);
    expect(result.event).toEqual({ type: "idle" });
    expect(result.state.governor.slowStreak).toBe(0);
    expect(result.effectiveTier).toBe("Q0");
  });

  it("a non-finite timestamp after a real frame is idle evidence, not NaN", () => {
    const state = tick(initialRuntimeState(), 0, true).state;
    const result = tick(state, Number.NaN, true);
    expect(result.event).toEqual({ type: "idle" });
    expect(result.state.lastFrameAtMs).toBe(0);
  });
});

describe("pushEvent — control-channel events", () => {
  it("webgl-unavailable is terminal Q3 and reports the change", () => {
    const result = pushEvent(initialRuntimeState(), { type: "webgl-unavailable" });
    expect(result.effectiveTier).toBe("Q3");
    expect(result.tierChanged).toBe(true);
    expect(result.state.governor.contextUnavailable).toBe(true);
  });

  it("user force tier overrides the automatic tier; release restores it", () => {
    let state = initialRuntimeState();
    const forced = pushEvent(state, { type: "user-force-tier", tier: "Q2" });
    expect(forced.effectiveTier).toBe("Q2");
    expect(forced.tierChanged).toBe(true);
    expect(forced.state.governor.tier).toBe("Q0");
    const released = pushEvent(forced.state, { type: "user-force-tier", tier: null });
    expect(released.effectiveTier).toBe("Q0");
    expect(released.tierChanged).toBe(true);
  });

  it("unavailable context beats a user force (nothing to render)", () => {
    const forced = pushEvent(initialRuntimeState(), { type: "user-force-tier", tier: "Q0" });
    const unavailable = pushEvent(forced.state, { type: "webgl-unavailable" });
    const stillForced = pushEvent(unavailable.state, { type: "user-force-tier", tier: "Q0" });
    expect(stillForced.effectiveTier).toBe("Q3");
  });

  it("recoverable context loss pauses measurement and restoration resumes it", () => {
    let state = tick(initialRuntimeState(), 0, false).state;
    const lost = pushEvent(state, { type: "context-lost", recoverable: true });
    expect(lost.state.governor.contextLost).toBe(true);
    expect(lost.effectiveTier).toBe("Q0");
    const restored = pushEvent(lost.state, { type: "context-restored" });
    expect(restored.state.governor.contextLost).toBe(false);
  });
});

describe("shouldForceTier — external force vs echo of our own publication", () => {
  it("ignores an unchanged prop", () => {
    expect(shouldForceTier("Q0", "Q0", null, "Q0")).toBe(false);
  });

  it("mount: forces only when the store tier already differs from the runtime", () => {
    expect(shouldForceTier(null, "Q0", null, "Q0")).toBe(false);
    expect(shouldForceTier(null, "Q2", null, "Q0")).toBe(true);
  });

  it("ignores the echo of the tier this stage just published", () => {
    expect(shouldForceTier("Q0", "Q1", "Q1", "Q1")).toBe(false);
  });

  it("treats any other change as a genuine user force", () => {
    expect(shouldForceTier("Q1", "Q0", "Q1", "Q1")).toBe(true);
    expect(shouldForceTier("Q0", "Q3", null, "Q1")).toBe(true);
  });
});

describe("tier → renderer configuration (C-16 tier table)", () => {
  it("Q0 keeps the full (capped) pixel ratio with anti-aliasing", () => {
    expect(dprRangeForTier("Q0")).toEqual([1, 2]);
    expect(antialiasForTier("Q0")).toBe(true);
  });

  it("Q1 lowers the pixel-ratio cap and drops anti-aliasing", () => {
    expect(dprRangeForTier("Q1")).toEqual([1, 1.25]);
    expect(antialiasForTier("Q1")).toBe(false);
  });

  it("Q2 locks the pixel ratio to 1; Q3 has no canvas at all (2D schematic)", () => {
    expect(dprRangeForTier("Q2")).toEqual([1, 1]);
    expect(dprRangeForTier("Q3")).toEqual([1, 1]);
    expect(antialiasForTier("Q2")).toBe(false);
    expect(antialiasForTier("Q3")).toBe(false);
  });
});
