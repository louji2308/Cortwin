/**
 * Governor runtime — the frame-telemetry adapter around `scene/qualityGovernor`
 * (Architecture §10.4, `C-16`). The governor itself is frozen, tested truth;
 * this module answers only one question: *was this gap evidence about
 * rendering performance, or just render-on-demand waiting for input?*
 *
 * Classification (the settle decision recorded in Progress.md):
 * - `gap ≤ IDLE_GAP_MS` → **sample**: frames are flowing; the gap is the frame
 *   interval (≥30 fps target = `SLOW_FRAME_MS` inside the governor).
 * - `gap > IDLE_GAP_MS` **and the previous frame asked for continuation** →
 *   **sample**: an animation/orbit was running, so a huge gap is a *slow*
 *   machine, not an idle one. Without this rule a 2 fps machine would produce
 *   only "idle" evidence and never downgrade.
 * - `gap > SUSPENDED_GAP_MS` → **idle** even with continuation: a gap that
 *   long means the tab was backgrounded or suspended (rAF paused), not that
 *   rendering took that long. Prevents a false downgrade on tab return.
 * - otherwise → **idle**: render-on-demand waiting for the next interaction.
 *   Idle changes nothing (qualityGovernor's own law) — it is neither healthy
 *   nor slow.
 *
 * The effective tier (including the user-force channel and the terminal Q3
 * states) is what the renderer applies; `tierChanged` tells the component to
 * publish it (`setQualityTier` round-trip is P6 wiring). Pure state machine —
 * no timers, no DOM, no three.js.
 */
import {
  effectiveQualityTier,
  initialGovernorState,
  reduceGovernor,
  type GovernorState,
  type QualityEvent,
  type QualityTier
} from "../scene";

/** Below this gap the frames are flowing: the gap is a frame interval. */
export const IDLE_GAP_MS = 250;

/** Above this gap the frame clock was suspended (tab hidden / debugger), not slow. */
export const SUSPENDED_GAP_MS = 5_000;

export type RuntimeState = {
  governor: GovernorState;
  /** `performance.now()` of the last tick, or null before the first frame. */
  lastFrameAtMs: number | null;
  /** Whether the last frame asked for another one (animation in progress). */
  pendingContinuation: boolean;
};

export function initialRuntimeState(): RuntimeState {
  return {
    governor: initialGovernorState(),
    lastFrameAtMs: null,
    pendingContinuation: false
  };
}

/** How a frame gap is classified before it reaches the governor. */
export function classifyGap(gapMs: number, willContinue: boolean): "sample" | "idle" {
  if (!Number.isFinite(gapMs) || gapMs < 0) return "idle";
  if (gapMs <= IDLE_GAP_MS) return "sample";
  if (gapMs > SUSPENDED_GAP_MS) return "idle";
  return willContinue ? "sample" : "idle";
}

export type TickResult = {
  state: RuntimeState;
  /** Evidence fed to the governor (null on the very first frame — no gap yet). */
  event: QualityEvent | null;
  effectiveTier: QualityTier;
  tierChanged: boolean;
};

function withGovernor(
  state: RuntimeState,
  governor: GovernorState
): { state: RuntimeState; effectiveTier: QualityTier; tierChanged: boolean } {
  const before = effectiveQualityTier(state.governor);
  const after = effectiveQualityTier(governor);
  return {
    state: { ...state, governor },
    effectiveTier: after,
    tierChanged: after !== before
  };
}

/**
 * Record one rendered frame at `nowMs`.
 *
 * `willContinue` is what the frame's own logic reported: tweens/camera flights
 * still running, controls still dragging — i.e. this frame asked for another.
 */
export function tick(
  state: RuntimeState,
  nowMs: number,
  willContinue: boolean
): TickResult {
  const finiteNow = Number.isFinite(nowMs);

  if (state.lastFrameAtMs === null) {
    const next: RuntimeState = {
      ...state,
      lastFrameAtMs: finiteNow ? nowMs : null,
      pendingContinuation: finiteNow ? willContinue : state.pendingContinuation
    };
    return {
      state: next,
      event: null,
      effectiveTier: effectiveQualityTier(next.governor),
      tierChanged: false
    };
  }

  if (!finiteNow) {
    return {
      state,
      event: { type: "idle" },
      effectiveTier: effectiveQualityTier(state.governor),
      tierChanged: false
    };
  }

  const gap = nowMs - state.lastFrameAtMs;
  const kind = classifyGap(gap, state.pendingContinuation);
  const event: QualityEvent =
    kind === "sample" ? { type: "frame-sample", frameTimeMs: gap } : { type: "idle" };

  const applied = withGovernor(state, reduceGovernor(state.governor, event));
  return {
    state: {
      ...applied.state,
      lastFrameAtMs: nowMs,
      pendingContinuation: willContinue
    },
    event,
    effectiveTier: applied.effectiveTier,
    tierChanged: applied.tierChanged
  };
}

/**
 * Feed a non-frame quality event (WebGL unavailable, context lost/restored,
 * user tier override) through the governor. Same output shape as {@link tick}.
 */
export function pushEvent(state: RuntimeState, event: QualityEvent): TickResult {
  const applied = withGovernor(state, reduceGovernor(state.governor, event));
  return {
    state: applied.state,
    event,
    effectiveTier: applied.effectiveTier,
    tierChanged: applied.tierChanged
  };
}

/**
 * Whether a `view.qualityTier` prop change is a genuine external force (the
 * user pinning a tier through the store) rather than the echo of the tier this
 * stage just published.
 *
 * Without the echo rule the stage would feed its own publication back in as a
 * `user-force-tier` event and pin the governor to whatever it just measured —
 * freezing quality forever. The mount case (`lastSeen === null`) forces only
 * when the store's tier already differs from the runtime's initial tier.
 */
export function shouldForceTier(
  lastSeen: QualityTier | null,
  next: QualityTier,
  published: QualityTier | null,
  runtimeEffective: QualityTier
): boolean {
  if (next === lastSeen) return false;
  if (lastSeen === null) return next !== runtimeEffective;
  if (next === published) return false;
  return true;
}

/* ------------------------------------------------------------------ *
 * Tier → renderer configuration (Architecture §10.4 tier table,
 * Contracts §8.2 `C-16`). AG-09 presentational values: the contract
 * specifies "full / lower / 1" caps without numbers, so these are the
 * recorded stage picks — Q0 keeps the device ratio up to 2 (bench
 * configuration), Q1 lowers the cap, Q2 locks to 1.
 * ------------------------------------------------------------------ */

export const DPR_CAP_BY_TIER: Record<QualityTier, number> = {
  Q0: 2,
  Q1: 1.25,
  Q2: 1,
  Q3: 1
};

/** The r3f `dpr` range for a tier: `[1, cap]`. */
export function dprRangeForTier(tier: QualityTier): [number, number] {
  return [1, DPR_CAP_BY_TIER[tier]];
}

/** Anti-aliasing exists at Q0 only (context creation is fixed per mount). */
export function antialiasForTier(tier: QualityTier): boolean {
  return tier === "Q0";
}
