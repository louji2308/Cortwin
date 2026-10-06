import { describe, expect, it } from "vitest";
import {
  NEUTRAL_PROBABILITY_COLOUR,
  PROBABILITY_RAMP_ID,
  probabilityToColour
} from "./ramp";

const parseColour = (colour: string): [number, number, number] | null => {
  const rgb = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(colour);
  if (rgb !== null) {
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  }
  const hex = /^#([0-9a-f]{6})$/.exec(colour);
  if (hex !== null) {
    return [
      parseInt(hex[1].slice(0, 2), 16),
      parseInt(hex[1].slice(2, 4), 16),
      parseInt(hex[1].slice(4, 6), 16)
    ];
  }
  return null;
};

const relativeLuminance = (colour: string): number => {
  const rgb = parseColour(colour);
  if (rgb === null) {
    throw new Error(`not a finite rgb colour: ${colour}`);
  }
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

describe("design/ramp — THE single probability-to-colour function (C-11 L354)", () => {
  it("returns a finite rgb colour for 0, 0.5 and 1", () => {
    for (const p of [0, 0.5, 1]) {
      const colour = probabilityToColour(p);
      expect(colour).toMatch(/^(rgb\(\d+, \d+, \d+\)|#[0-9a-f]{6})$/);
      expect(colour).not.toContain("NaN");
      expect(parseColour(colour)).not.toBeNull();
    }
  });

  it("rejects non-finite input with the neutral colour and never emits NaN", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(probabilityToColour(bad)).toBe(NEUTRAL_PROBABILITY_COLOUR);
    }
    const all = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY].map(
      probabilityToColour
    );
    for (const colour of all) {
      expect(colour).not.toContain("NaN");
      expect(parseColour(colour)).not.toBeNull();
    }
    expect(NEUTRAL_PROBABILITY_COLOUR).not.toBe(probabilityToColour(0));
    expect(NEUTRAL_PROBABILITY_COLOUR).not.toBe(probabilityToColour(1));
  });

  it("clamps finite out-of-range input instead of extrapolating", () => {
    expect(probabilityToColour(-0.4)).toBe(probabilityToColour(0));
    expect(probabilityToColour(1.7)).toBe(probabilityToColour(1));
    expect(probabilityToColour(-Number.MAX_VALUE)).toBe(probabilityToColour(0));
    expect(probabilityToColour(Number.MAX_VALUE)).toBe(probabilityToColour(1));
    expect(probabilityToColour(Number.MAX_VALUE)).not.toContain("NaN");
  });

  it("rises monotonically in luminance across the whole ramp", () => {
    const samples = Array.from({ length: 11 }, (_, i) => probabilityToColour(i / 10));
    const luminances = samples.map(relativeLuminance);
    for (let i = 1; i < luminances.length; i += 1) {
      expect(luminances[i]).toBeGreaterThan(luminances[i - 1]);
    }
    expect(relativeLuminance(probabilityToColour(1))).toBeGreaterThan(0.5);
    expect(relativeLuminance(probabilityToColour(0))).toBeLessThan(0.05);
  });

  it("is deterministic for repeated calls (memoized lookup returns identical strings)", () => {
    for (const p of [0, 0.13, 0.5, 0.761, 1]) {
      const first = probabilityToColour(p);
      const second = probabilityToColour(p);
      const third = probabilityToColour(p);
      expect(second).toBe(first);
      expect(third).toBe(first);
    }
    expect(probabilityToColour(0)).not.toBe(probabilityToColour(1));
  });

  it("declares cividis as the ramp identity", () => {
    expect(PROBABILITY_RAMP_ID).toBe("cividis");
  });
});
