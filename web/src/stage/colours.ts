/**
 * Stage colour primitives — the only place in `stage/` that touches THE ramp
 * (Contracts `C-11` L354: one probability→colour function drives 3D material,
 * legend, tags and readouts).
 *
 * Laws this module enforces:
 * - **One ramp (D-202):** every colour starts as `probabilityToColour` (or the
 *   neutral constant for non-probability structures). No second ramp, no colour
 *   literal anywhere in `stage/` — `stageSourceScan.test.ts` polices both.
 * - **Display channel only (P-4 / `C-09`):** `stepTweens` animates *colour
 *   channels*, never a probability. Data truth arrives as a target colour; the
 *   tween is presentation and can be killed by reduced motion without touching
 *   truth.
 * - **Intensity ≠ hue:** decision "below" lowers intensity (`BELOW_INTENSITY`
 *   luminance scale, `C-11` L350) and selection dims the others by
 *   desaturation (`DIM_SATURATION`, Architecture §10.2 "reduced saturation,
 *   never opacity"). Both are applied *after* the ramp output, so the base
 *   colour before intensity is always the exact ramp result.
 *
 * Pure: no three.js, no React, no DOM, no store. Runs in Node tests.
 */
import { NEUTRAL_PROBABILITY_COLOUR, probabilityToColour } from "../design/ramp";
import { easeOutCubic } from "../scene";

/** Colour channels in `[0, 1]`, immutable. */
export type Rgb = readonly [number, number, number];

/** `Final_demo` §4.7 / §8: one edit animates colour over 400 ms ease-out. */
export const STAGE_TWEEN_MS = 400;

/** `C-11` L350: decision "below" renders at reduced intensity, never a new hue. */
export const BELOW_INTENSITY = 0.78;

/** Architecture §10.2: non-selected vessels lose saturation, never opacity. */
export const DIM_SATURATION = 0.5;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

function toChannel(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError("Colour channel is not finite");
  }
  return clamp01(value / 255);
}

const RGB_FUNC =
  /^rgba?\(\s*([0-9]{1,3}(?:\.[0-9]+)?)\s*,\s*([0-9]{1,3}(?:\.[0-9]+)?)\s*,\s*([0-9]{1,3}(?:\.[0-9]+)?)(?:\s*,\s*[0-9.]+\s*)?\s*\)$/;
const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Parse a CSS colour produced by the ramp (`"rgb(r, g, b)"`) or a hex string
 * into `[0, 1]` channels.
 *
 * @throws {RangeError} for anything the ramp can never emit — a parse failure
 * here means a non-ramp colour entered the stage, which must fail loudly.
 */
export function parseColour(colour: string): Rgb {
  if (typeof colour !== "string") {
    throw new RangeError("Colour must be a string");
  }
  const trimmed = colour.trim();
  const func = RGB_FUNC.exec(trimmed);
  if (func !== null) {
    return [toChannel(Number(func[1])), toChannel(Number(func[2])), toChannel(Number(func[3]))];
  }
  const hex = HEX.exec(trimmed);
  if (hex !== null) {
    const digits = hex[1];
    const full =
      digits.length === 3
        ? `${digits[0]}${digits[0]}${digits[1]}${digits[1]}${digits[2]}${digits[2]}`
        : digits;
    return [
      toChannel(parseInt(full.slice(0, 2), 16)),
      toChannel(parseInt(full.slice(2, 4), 16)),
      toChannel(parseInt(full.slice(4, 6), 16))
    ];
  }
  throw new RangeError(`Unrecognised colour format: ${trimmed}`);
}

/**
 * Channels → the exact string format `d3-scale-chromatic` emits
 * (`"rgb(141, 141, 146)"`, integer channels, `", "` separator), so
 * `formatColour(parseColour(s)) === s` for every ramp output.
 */
export function formatColour(rgb: Rgb): string {
  const r = Math.round(clamp01(rgb[0]) * 255);
  const g = Math.round(clamp01(rgb[1]) * 255);
  const b = Math.round(clamp01(rgb[2]) * 255);
  return `rgb(${r}, ${g}, ${b})`;
}

export function rgbEquals(a: Rgb, b: Rgb): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

/** Linear interpolation between two colours; `t` is clamped to `[0, 1]`. */
export function mixRgb(from: Rgb, to: Rgb, t: number): Rgb {
  const k = clamp01(t);
  return [
    from[0] + (to[0] - from[0]) * k,
    from[1] + (to[1] - from[1]) * k,
    from[2] + (to[2] - from[2]) * k
  ];
}

/** Rec. 709 relative luminance in `[0, 1]`. */
export function luminance(rgb: Rgb): number {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

/**
 * Reduce saturation by blending toward a grey of the same luminance — the
 * Architecture §10.2 dim. Never an alpha change: opacity would let the stage
 * background bleed through and read as a different anatomy.
 */
export function desaturate(rgb: Rgb, amount: number): Rgb {
  const l = luminance(rgb);
  return mixRgb(rgb, [l, l, l], clamp01(amount));
}

/** Scale every channel by `factor` (clamped to `[0, 1]`) — the intensity knob. */
export function scaleIntensity(rgb: Rgb, factor: number): Rgb {
  const k = clamp01(factor);
  return [rgb[0] * k, rgb[1] * k, rgb[2] * k];
}

/** Neutral (no-probability) colour as channels — HEART / AORTA. */
export const NEUTRAL_RGB: Rgb = parseColour(NEUTRAL_PROBABILITY_COLOUR);

/**
 * THE ramp, as channels: `probabilityToColour` then parse. The only colour
 * source for vessel material; out-of-range/non-finite input follows the ramp's
 * own contract (clamp / neutral) rather than inventing a value here.
 */
export function rampRgb(probability: number): Rgb {
  return parseColour(probabilityToColour(probability));
}

/* ------------------------------------------------------------------ *
 * Display-channel tween engine (P-4: data truth and displayed
 * animation are separate; reduced motion kills the animation only).
 * ------------------------------------------------------------------ */

export type TweenEntry = {
  from: Rgb;
  to: Rgb;
  startedAt: number;
  durationMs: number;
};

/** Tween state keyed by entity id (vessel id). Held in refs — never app state. */
export type TweenState = Record<string, TweenEntry>;

/**
 * Neutral-seeded starting state for the boot reveal: every id begins at the
 * neutral colour, so the first `stepTweens` call tweened neutrals into vessel
 * colours over 400 ms (`Final_demo` §4.1: vessels tween to colour).
 */
export function initialTweenState(ids: readonly string[], seed: Rgb = NEUTRAL_RGB): TweenState {
  const state: TweenState = {};
  for (const id of ids) {
    state[id] = { from: seed, to: seed, startedAt: 0, durationMs: 0 };
  }
  return state;
}

/** Colour of one tween entry at `nowMs` (ease-out, clamped, non-finite-safe). */
export function evalTween(entry: TweenEntry, nowMs: number): Rgb {
  if (entry.durationMs <= 0) return entry.to;
  const now = Number.isFinite(nowMs) ? nowMs : 0;
  const elapsed = now - entry.startedAt;
  if (!Number.isFinite(elapsed) || elapsed <= 0) return entry.from;
  if (elapsed >= entry.durationMs) return entry.to;
  return mixRgb(entry.from, entry.to, easeOutCubic(elapsed / entry.durationMs));
}

export type StepTweensResult = {
  /** Updated state — pass it back in on the next frame. */
  state: TweenState;
  /** Current displayed colour per id (post-tween, pre-intensity). */
  colours: Record<string, Rgb>;
  /** True when at least one tween still needs frames. */
  active: boolean;
};

/**
 * Advance every tween to `nowMs` and retarget any whose desired colour changed.
 *
 * - Target unchanged → the running tween continues untouched.
 * - Target changed mid-flight → the tween restarts *from the currently
 *   displayed colour* (no visual jump, no overshoot).
 * - New id with no history → appears instantly at its target (boot seeding is
 *   explicit via {@link initialTweenState}, not implicit here).
 * - Reduced motion → `durationMs: 0`: colours snap to targets, `active` false.
 * - Ids absent from `targets` are pruned from the returned state.
 */
export function stepTweens(
  prev: TweenState,
  targets: Readonly<Record<string, Rgb>>,
  nowMs: number,
  opts: { reducedMotion: boolean }
): StepTweensResult {
  const now = Number.isFinite(nowMs) ? nowMs : 0;
  const durationMs = opts.reducedMotion ? 0 : STAGE_TWEEN_MS;
  const state: TweenState = {};
  const colours: Record<string, Rgb> = {};
  let active = false;

  for (const id of Object.keys(targets)) {
    const desired = targets[id];
    const entry = prev[id];
    let next: TweenEntry;
    if (entry !== undefined && rgbEquals(entry.to, desired)) {
      next = entry;
    } else if (entry === undefined) {
      next = { from: desired, to: desired, startedAt: now, durationMs: 0 };
    } else {
      next = { from: evalTween(entry, now), to: desired, startedAt: now, durationMs };
    }
    state[id] = next;
    colours[id] = evalTween(next, now);
    if (next.durationMs > 0 && now - next.startedAt < next.durationMs) active = true;
  }

  return { state, colours, active };
}
