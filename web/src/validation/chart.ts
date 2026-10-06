/**
 * Axis and marker positioning helpers (Contracts §9 L424: the UI may derive
 * axis scale and marker position — nothing else). No metric arithmetic lives
 * here; scales map artifact values to pixel coordinates.
 */

import { scaleLinear } from "d3-scale";

/** Fixed probability-domain ticks; labels are literal axis text. */
export const PROBABILITY_TICKS: readonly number[] = [0, 0.25, 0.5, 0.75, 1];
export const PROBABILITY_TICK_LABELS: readonly string[] = ["0%", "25%", "50%", "75%", "100%"];

/** Marker/curve drawing budget — rendering constant, not a metric. */
export const MAX_POINT_MARKERS = 25;

/** Maps a probability-domain value into an SVG pixel range. */
export function probabilityScale(range: readonly [number, number]) {
  return scaleLinear().domain([0, 1]).range([range[0], range[1]]);
}

/** Builds an SVG polyline `points` string from pixel coordinates. */
export function toPolyline(points: ReadonlyArray<readonly [number, number]>): string {
  return points.map(([px, py]) => `${px},${py}`).join(" ");
}

/**
 * Index of the precomputed sweep point nearest to `target` (selection only —
 * no metric is derived; ties resolve to the first, i.e. lowest, index).
 * Returns null when there is nothing to select from.
 */
export function nearestSweepIndex(
  points: ReadonlyArray<{ threshold: number }>,
  target: number | null
): number | null {
  if (points.length === 0 || target === null) return null;
  let best = 0;
  let bestDistance = Math.abs(points[0].threshold - target);
  for (let i = 1; i < points.length; i += 1) {
    const distance = Math.abs(points[i].threshold - target);
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Bounds a caller-supplied index into `[0, length - 1]`; null when the
 * collection is empty. Keeps an inspector valid when the target (and with it
 * the point list) changes underneath a stale selection.
 */
export function clampIndex(index: number, length: number): number | null {
  if (length <= 0) return null;
  const rounded = Number.isFinite(index) ? Math.round(index) : 0;
  if (rounded < 0) return 0;
  if (rounded > length - 1) return length - 1;
  return rounded;
}
