import { describe, expect, it } from "vitest";
import { NEUTRAL_PROBABILITY_COLOUR, probabilityToColour } from "../design/ramp";
import { easeOutCubic } from "../scene";
import {
  BELOW_INTENSITY,
  DIM_SATURATION,
  NEUTRAL_RGB,
  STAGE_TWEEN_MS,
  desaturate,
  evalTween,
  formatColour,
  initialTweenState,
  luminance,
  mixRgb,
  parseColour,
  rampRgb,
  rgbEquals,
  scaleIntensity,
  stepTweens
} from "./colours";

const LAD_X = rampRgb(0.6);
const LCX_Y = rampRgb(0.25);
const RCA_Z = rampRgb(0.9);

describe("one-ramp law (D-202): stage colours come only from probabilityToColour", () => {
  it("formatColour ∘ rampRgb is the identity over the whole ramp", () => {
    const mismatches: string[] = [];
    for (let i = 0; i <= 100; i += 1) {
      const p = i / 100;
      const canonical = probabilityToColour(p);
      const roundTrip = formatColour(rampRgb(p));
      if (roundTrip !== canonical) mismatches.push(`${p}: ${roundTrip} !== ${canonical}`);
    }
    expect(mismatches).toEqual([]);
  });

  it("non-finite probability resolves to the neutral colour, never rgb(NaN, …)", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(rgbEquals(rampRgb(bad), NEUTRAL_RGB)).toBe(true);
      expect(Number.isFinite(NEUTRAL_RGB[0])).toBe(true);
    }
    expect(formatColour(NEUTRAL_RGB)).toBe(formatColour(parseColour(NEUTRAL_PROBABILITY_COLOUR)));
  });
});

describe("parseColour / formatColour", () => {
  it("parses rgb() and hex forms into [0, 1] channels", () => {
    expect(parseColour("rgb(255, 0, 0)")).toEqual([1, 0, 0]);
    expect(parseColour("rgb(0, 0, 0)")).toEqual([0, 0, 0]);
    expect(parseColour("#9aa3ad")).toEqual(NEUTRAL_RGB);
    expect(parseColour("#fff")).toEqual([1, 1, 1]);
    expect(parseColour("rgb(127, 124, 117)")).toEqual([
      127 / 255,
      124 / 255,
      117 / 255
    ]);
  });

  it("rejects formats the ramp can never emit", () => {
    expect(() => parseColour("nope")).toThrow(RangeError);
    expect(() => parseColour("rgb(1, 2)")).toThrow(RangeError);
    expect(() => parseColour("hsl(0, 0%, 0%)")).toThrow(RangeError);
  });

  it("formatColour round-trips parseColour for ramp outputs", () => {
    expect(formatColour(parseColour(probabilityToColour(0.42)))).toBe(
      probabilityToColour(0.42)
    );
  });
});

describe("colour maths", () => {
  it("mixRgb interpolates and clamps t", () => {
    const a: readonly [number, number, number] = [0, 0, 0];
    const b: readonly [number, number, number] = [1, 0.5, 0.25];
    expect(mixRgb(a, b, 0)).toEqual(a);
    expect(mixRgb(a, b, 1)).toEqual(b);
    expect(mixRgb(a, b, -1)).toEqual(a);
    expect(mixRgb(a, b, 2)).toEqual(b);
    expect(mixRgb(a, b, 0.5)).toEqual([0.5, 0.25, 0.125]);
  });

  it("luminance is 1 for white and 0 for black", () => {
    expect(luminance([1, 1, 1])).toBeCloseTo(1, 10);
    expect(luminance([0, 0, 0])).toBe(0);
  });

  it("desaturate blends toward same-luminance grey without changing luminance", () => {
    const red: readonly [number, number, number] = [1, 0, 0];
    const grey = desaturate(red, 1);
    expect(grey[0]).toBeCloseTo(grey[1], 10);
    expect(grey[1]).toBeCloseTo(grey[2], 10);
    expect(luminance(grey)).toBeCloseTo(luminance(red), 10);
    expect(desaturate(red, 0)).toEqual(red);
    const half = desaturate(red, DIM_SATURATION);
    expect(half[0]).toBeLessThan(1);
    expect(half[0]).toBeGreaterThan(half[1]);
  });

  it("scaleIntensity scales every channel and clamps the factor", () => {
    expect(scaleIntensity([1, 0.5, 0.2], BELOW_INTENSITY)).toEqual([
      BELOW_INTENSITY,
      0.5 * BELOW_INTENSITY,
      0.2 * BELOW_INTENSITY
    ]);
    expect(scaleIntensity([1, 1, 1], 0)).toEqual([0, 0, 0]);
    expect(scaleIntensity([1, 1, 1], 2)).toEqual([1, 1, 1]);
  });
});

describe("stepTweens — display-channel animation (P-4)", () => {
  const seed = NEUTRAL_RGB;

  it("boot reveal: seeded neutrals tween to the first target over STAGE_TWEEN_MS", () => {
    const prev = initialTweenState(["LAD"]);
    const result = stepTweens(prev, { LAD: LAD_X }, 0, { reducedMotion: false });
    expect(result.active).toBe(true);
    expect(rgbEquals(result.colours.LAD, seed)).toBe(true);
    expect(result.state.LAD.durationMs).toBe(STAGE_TWEEN_MS);

    const mid = stepTweens(result.state, { LAD: LAD_X }, STAGE_TWEEN_MS / 2, {
      reducedMotion: false
    });
    const expected = mixRgb(seed, LAD_X, easeOutCubic(0.5));
    expect(rgbEquals(mid.colours.LAD, expected)).toBe(true);

    const done = stepTweens(result.state, { LAD: LAD_X }, STAGE_TWEEN_MS, {
      reducedMotion: false
    });
    expect(rgbEquals(done.colours.LAD, LAD_X)).toBe(true);
    expect(done.active).toBe(false);
  });

  it("reduced motion snaps to targets and never reports active", () => {
    const prev = initialTweenState(["LAD", "LCX", "RCA"]);
    const result = stepTweens(prev, { LAD: LAD_X, LCX: LCX_Y, RCA: RCA_Z }, 0, {
      reducedMotion: true
    });
    expect(result.active).toBe(false);
    expect(rgbEquals(result.colours.LAD, LAD_X)).toBe(true);
    expect(rgbEquals(result.colours.LCX, LCX_Y)).toBe(true);
    expect(rgbEquals(result.colours.RCA, RCA_Z)).toBe(true);
    expect(result.state.LAD.durationMs).toBe(0);
  });

  it("retarget mid-flight restarts from the currently displayed colour (no jump)", () => {
    const prev = initialTweenState(["LAD"]);
    const first = stepTweens(prev, { LAD: LAD_X }, 0, { reducedMotion: false });
    const halfway = STAGE_TWEEN_MS / 2;
    const before = stepTweens(first.state, { LAD: LAD_X }, halfway, { reducedMotion: false });

    const retarget = stepTweens(first.state, { LAD: LCX_Y }, halfway, {
      reducedMotion: false
    });
    expect(rgbEquals(retarget.colours.LAD, before.colours.LAD)).toBe(true);
    expect(rgbEquals(retarget.state.LAD.from, before.colours.LAD)).toBe(true);
    expect(rgbEquals(retarget.state.LAD.to, LCX_Y)).toBe(true);
    expect(retarget.active).toBe(true);

    const arrived = stepTweens(retarget.state, { LAD: LCX_Y }, halfway + STAGE_TWEEN_MS, {
      reducedMotion: false
    });
    expect(rgbEquals(arrived.colours.LAD, LCX_Y)).toBe(true);
    expect(arrived.active).toBe(false);
  });

  it("keeps an in-flight tween untouched when the target is unchanged", () => {
    const prev = initialTweenState(["LAD"]);
    const first = stepTweens(prev, { LAD: LAD_X }, 0, { reducedMotion: false });
    const second = stepTweens(first.state, { LAD: LAD_X }, 10, { reducedMotion: false });
    expect(second.state.LAD).toBe(first.state.LAD);
    expect(second.active).toBe(true);
  });

  it("prunes ids that disappear and snaps brand-new ids to their target", () => {
    const prev = initialTweenState(["LAD", "RCA"]);
    const result = stepTweens(prev, { LAD: LAD_X, LCX: LCX_Y }, 0, {
      reducedMotion: false
    });
    expect(Object.keys(result.state).sort()).toEqual(["LAD", "LCX"]);
    expect(result.state.LCX.durationMs).toBe(0);
    expect(rgbEquals(result.colours.LCX, LCX_Y)).toBe(true);
  });

  it("never mutates the previous state", () => {
    const prev = initialTweenState(["LAD"]);
    const snapshot = JSON.stringify(prev);
    stepTweens(prev, { LAD: LAD_X }, 123, { reducedMotion: false });
    expect(JSON.stringify(prev)).toBe(snapshot);
  });

  it("treats a non-finite timestamp as zero instead of propagating NaN", () => {
    const prev = initialTweenState(["LAD"]);
    const result = stepTweens(prev, { LAD: LAD_X }, Number.NaN, {
      reducedMotion: false
    });
    expect(Number.isFinite(result.state.LAD.startedAt)).toBe(true);
    expect(rgbEquals(result.colours.LAD, NEUTRAL_RGB)).toBe(true);
    expect(result.active).toBe(true);
  });

  it("evalTween clamps elapsed time outside [0, duration]", () => {
    const entry = { from: NEUTRAL_RGB, to: LAD_X, startedAt: 100, durationMs: 400 };
    expect(rgbEquals(evalTween(entry, -1e9), NEUTRAL_RGB)).toBe(true);
    expect(rgbEquals(evalTween(entry, 1e9), LAD_X)).toBe(true);
  });
});
