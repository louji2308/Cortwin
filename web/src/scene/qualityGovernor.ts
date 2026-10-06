import type { QualityTier } from "./types";

/**
 * Quality governor — a pure state machine (Architecture §10.4, `C-16`).
 *
 * Rules implemented exactly as written:
 * - **Downgrade-only within a session**: the automatic tier index only ever
 *   increases (Q0 → Q1 → Q2 → Q3). A session never recovers quality on its own,
 *   so the visible tier cannot flap.
 * - **Hysteresis**: `SLOW_FRAMES_TO_DOWNGRADE` *consecutive* slow frames are
 *   required before one downgrade; a single healthy frame resets the run. A
 *   borderline frame rate therefore idles at its current tier instead of
 *   oscillating.
 * - **Measures only while frames are produced**: `idle` events are neither slow
 *   nor healthy — they change nothing (idle time is not slowness).
 * - **Q3 = 2D schematic**, reached by sustained slowness at Q2 or immediately by
 *   no-WebGL / unrecoverable context loss (G4 / FM-06).
 * - **User may force a tier**: `forcedTier` is a separate, explicit override
 *   channel; it never mutates the automatic tier, so releasing it restores the
 *   governor's own (downgrade-only) state with no hidden upgrade.
 *
 * The governor consumes frame telemetry only. It holds no clinical truth, never
 * touches `SceneModel`, and its output feeds `view.qualityTier` in the store.
 */

/** Frames slower than this count as slow: the `B-04` target is ≥30 fps. */
export const SLOW_FRAME_MS = 1000 / 30;

/** Consecutive slow frames required before one downgrade (hysteresis). */
export const SLOW_FRAMES_TO_DOWNGRADE = 3;

export const QUALITY_TIER_ORDER: readonly QualityTier[] = ["Q0", "Q1", "Q2", "Q3"];

export type QualityEvent =
  /** One rendered frame's wall time. Only emitted while frames are produced. */
  | { type: "frame-sample"; frameTimeMs: number }
  /** Nothing is being rendered: not evidence of health, not evidence of slowness. */
  | { type: "idle" }
  /** WebGL is unavailable up front → G4, Q3 immediately. */
  | { type: "webgl-unavailable" }
  /** Context lost; `recoverable` says whether a restore attempt is meaningful. */
  | { type: "context-lost"; recoverable: boolean }
  /** A previously lost context was restored; measurement resumes. */
  | { type: "context-restored" }
  /** Explicit user override; `null` releases it. */
  | { type: "user-force-tier"; tier: QualityTier | null };

export type GovernorState = {
  /** Automatic tier (downgrade-only). */
  tier: QualityTier;
  /** Consecutive slow frames since the last reset. */
  slowStreak: number;
  /** Explicit user override, if any. */
  forcedTier: QualityTier | null;
  /** Context is lost and no frames are being produced. */
  contextLost: boolean;
  /** No usable WebGL context at all: terminal, Q3 wins over any user force. */
  contextUnavailable: boolean;
};

export function initialGovernorState(): GovernorState {
  return {
    tier: "Q0",
    slowStreak: 0,
    forcedTier: null,
    contextLost: false,
    contextUnavailable: false
  };
}

export function isQualityTier(value: string): value is QualityTier {
  return QUALITY_TIER_ORDER.includes(value as QualityTier);
}

function tierAt(index: number): QualityTier {
  const bounded = index < 0 ? 0 : index >= QUALITY_TIER_ORDER.length ? QUALITY_TIER_ORDER.length - 1 : index;
  return QUALITY_TIER_ORDER[bounded];
}

function downgrade(state: GovernorState): GovernorState {
  const index = QUALITY_TIER_ORDER.indexOf(state.tier);
  const next = tierAt(index + 1);
  return { ...state, tier: next, slowStreak: 0 };
}

/** Apply one event. Pure: never mutates the input state. */
export function reduceGovernor(state: GovernorState, event: QualityEvent): GovernorState {
  switch (event.type) {
    case "idle":
      return state;

    case "frame-sample": {
      if (state.contextLost || state.contextUnavailable) return state;
      // Telemetry is not truth: a malformed sample degrades (the safe direction
      // for a purely presentational tier) rather than being silently dropped.
      const malformed = !Number.isFinite(event.frameTimeMs) || event.frameTimeMs < 0;
      const slow = malformed || event.frameTimeMs > SLOW_FRAME_MS;
      if (!slow) {
        return state.slowStreak === 0 ? state : { ...state, slowStreak: 0 };
      }
      const slowStreak = state.slowStreak + 1;
      if (slowStreak >= SLOW_FRAMES_TO_DOWNGRADE) {
        return downgrade({ ...state, slowStreak });
      }
      return { ...state, slowStreak };
    }

    case "webgl-unavailable":
      return { ...state, tier: "Q3", slowStreak: 0, contextUnavailable: true };

    case "context-lost":
      if (!event.recoverable) {
        return { ...state, tier: "Q3", slowStreak: 0, contextLost: false, contextUnavailable: true };
      }
      return { ...state, slowStreak: 0, contextLost: true };

    case "context-restored":
      return state.contextUnavailable ? state : { ...state, contextLost: false, slowStreak: 0 };

    case "user-force-tier":
      if (event.tier !== null && !isQualityTier(event.tier)) return state;
      return { ...state, forcedTier: event.tier };
  }
}

/**
 * The tier the renderer should actually use: an unavailable context beats any
 * user force (there is nothing to render), then the explicit user override,
 * then the automatic tier.
 */
export function effectiveQualityTier(state: GovernorState): QualityTier {
  if (state.contextUnavailable) return "Q3";
  if (state.forcedTier !== null) return state.forcedTier;
  return state.tier;
}
