import { scaleLinear } from "d3-scale";
import { interpolateCividis } from "d3-scale-chromatic";

/**
 * THE probability → colour ramp for the whole product.
 *
 * Contracts §8.1 `C-11` L354: "**One probability-to-colour function** drives 3D
 * material, legend, vessel tags and probability visuals." This module is the
 * single source of truth for probability colour: the scene material driver, the
 * threshold legend, the vessel tags, the charts and `ProbabilityReadout` all
 * call {@link probabilityToColour}, so the same value can never be coloured
 * differently in two places.
 *
 * Properties:
 * - Cividis (d3-scale-chromatic) — perceptually ordered, colour-blind safe,
 *   luminance rises monotonically with probability, so the highest-probability
 *   vessel is the most visible on the dark stage (Architecture §9.8).
 * - Input is clamped to [0, 1]; out-of-range finite input never extrapolates.
 * - Non-finite input (`NaN`, `±Infinity`, non-numbers) is rejected and returns
 *   {@link NEUTRAL_PROBABILITY_COLOUR} — this function never emits an
 *   `rgb(NaN, …)` colour (raw `interpolateCividis(NaN)` would).
 * - Memoized: repeated calls for the same quantised probability (1e-6 grid)
 *   return the identical string without re-interpolating.
 *
 * Colour carries probability only. Identity comes from label, position and
 * glyph (Contracts C-11 L354) — never encode identity or decision in this ramp.
 */
export const PROBABILITY_RAMP_ID = "cividis" as const;

/**
 * Neutral (probability-free) colour returned for non-finite input and used for
 * structures that carry no probability (HEART, AORTA). Deliberately outside the
 * cividis ramp so "no probability" can never be mistaken for a low value.
 */
export const NEUTRAL_PROBABILITY_COLOUR = "#9aa3ad";

const CACHE_LIMIT = 4096;
const QUANTISER = 1e6;

const unitScale = scaleLinear().domain([0, 1]).range([0, 1]).clamp(true);

const memo = new Map<number, string>();

/**
 * Convert a calibrated probability in [0, 1] to its canonical colour string
 * (`"rgb(r, g, b)"`, or the neutral colour for non-finite input).
 *
 * This is THE one probability-to-colour function (C-11 L354). Do not write a
 * second ramp anywhere: scene, legend, tags, charts and readouts consume this.
 *
 * @param probability calibrated probability, finite number expected; values
 * outside [0, 1] are clamped, non-finite values return the neutral colour.
 * @returns a CSS colour string that always contains finite channel values.
 */
export function probabilityToColour(probability: number): string {
  if (!Number.isFinite(probability)) {
    return NEUTRAL_PROBABILITY_COLOUR;
  }
  const key = Math.round(unitScale(probability) * QUANTISER) / QUANTISER;
  const cached = memo.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const colour = interpolateCividis(key);
  if (memo.size >= CACHE_LIMIT) {
    memo.clear();
  }
  memo.set(key, colour);
  return colour;
}
