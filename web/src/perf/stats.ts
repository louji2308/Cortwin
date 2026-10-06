export type Summary = {
  n: number;
  min: number;
  p50: number;
  p95: number;
  max: number;
  mean: number;
};

export type Verdict = "PASS" | "BREACH" | "NOT MEASURED";

export type FpsBucket = {
  startMs: number;
  frames: number;
  fps: number;
};

export type FrameStats = {
  frames: number;
  windowMs: number;
  fps: number;
  p95FrameMs: number;
  maxFrameMs: number;
  buckets: FpsBucket[];
  minBucketFps: number | null;
};

export function percentile(values: readonly number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * q;
  const base = Math.floor(position);
  const rest = position - base;
  const next = sorted[base + 1];
  return next === undefined ? sorted[base] : sorted[base] + rest * (next - sorted[base]);
}

export function meanOf(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

export function maxOf(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  let best = values[0];
  for (const value of values) if (value > best) best = value;
  return best;
}

export function minOf(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  let best = values[0];
  for (const value of values) if (value < best) best = value;
  return best;
}

export function summarize(values: readonly number[]): Summary | null {
  if (values.length === 0) return null;
  const p50 = percentile(values, 0.5);
  const p95 = percentile(values, 0.95);
  const average = meanOf(values);
  if (p50 === null || p95 === null || average === null) return null;
  return {
    n: values.length,
    min: minOf(values) as number,
    p50,
    p95,
    max: maxOf(values) as number,
    mean: average
  };
}

function deltas(timestamps: readonly number[]): number[] {
  const out: number[] = [];
  for (let index = 1; index < timestamps.length; index += 1) {
    out.push(timestamps[index] - timestamps[index - 1]);
  }
  return out;
}

export function frameStats(
  timestamps: readonly number[],
  startMs: number,
  endMs: number,
  bucketMs = 500
): FrameStats | null {
  const inside = timestamps.filter((value) => value >= startMs && value <= endMs);
  if (inside.length < 2) return null;
  const windowMs = inside[inside.length - 1] - inside[0];
  if (!(windowMs > 0)) return null;
  const steps = deltas(inside);
  const buckets: FpsBucket[] = [];
  const counts = new Map<number, number>();
  for (const value of inside) {
    const key = Math.floor((value - startMs) / bucketMs);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const key of [...counts.keys()].sort((left, right) => left - right)) {
    const frames = counts.get(key) as number;
    if (frames < 2) continue;
    buckets.push({
      startMs: startMs + key * bucketMs,
      frames,
      fps: (frames * 1000) / bucketMs
    });
  }
  const bucketRates = buckets.map((bucket) => bucket.fps);
  return {
    frames: inside.length,
    windowMs,
    fps: ((inside.length - 1) * 1000) / windowMs,
    p95FrameMs: percentile(steps, 0.95) as number,
    maxFrameMs: maxOf(steps) as number,
    buckets,
    minBucketFps: bucketRates.length > 0 ? (minOf(bucketRates) as number) : null
  };
}

export function verdictMax(value: number | null, limit: number): Verdict {
  if (value === null || Number.isNaN(value)) return "NOT MEASURED";
  return value <= limit ? "PASS" : "BREACH";
}

export function verdictMin(value: number | null, limit: number): Verdict {
  if (value === null || Number.isNaN(value)) return "NOT MEASURED";
  return value >= limit ? "PASS" : "BREACH";
}

export function megabytes(bytes: number): number {
  return bytes / 1_048_576;
}

export function formatBytes(bytes: number): string {
  return `${bytes.toLocaleString("en-US")} B (${(bytes / 1024).toFixed(1)} KiB)`;
}

export function formatMs(value: number | null, digits = 1): string {
  return value === null || Number.isNaN(value) ? "n/a" : `${value.toFixed(digits)} ms`;
}

export function formatNumber(value: number | null, digits = 2): string {
  return value === null || Number.isNaN(value) ? "n/a" : value.toFixed(digits);
}
