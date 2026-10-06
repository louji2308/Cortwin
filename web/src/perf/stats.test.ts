import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatMs,
  formatNumber,
  frameStats,
  maxOf,
  meanOf,
  megabytes,
  minOf,
  percentile,
  summarize,
  verdictMax,
  verdictMin
} from "./stats";

describe("percentile — linear interpolation over the sorted sample", () => {
  it("is null for an empty sample (a missing measurement is never a number)", () => {
    expect(percentile([], 0.95)).toBeNull();
    expect(summarize([])).toBeNull();
    expect(meanOf([])).toBeNull();
    expect(maxOf([])).toBeNull();
    expect(minOf([])).toBeNull();
  });

  it("returns the single value for any quantile when n = 1", () => {
    expect(percentile([42], 0)).toBe(42);
    expect(percentile([42], 0.5)).toBe(42);
    expect(percentile([42], 0.95)).toBe(42);
    expect(percentile([42], 1)).toBe(42);
  });

  it("matches the reference definition used by the parity benchmark", () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(values, 0.5)).toBe(55);
    expect(percentile(values, 0.95)).toBeCloseTo(95.5, 10);
    expect(percentile(values, 0)).toBe(10);
    expect(percentile(values, 1)).toBe(100);
  });

  it("is monotone in q and insensitive to input order", () => {
    const values = [5, 1, 9, 3, 7];
    const shuffled = [7, 9, 1, 5, 3];
    const quantiles = [0, 0.1, 0.5, 0.8, 0.95, 1];
    let previous = Number.NEGATIVE_INFINITY;
    for (const q of quantiles) {
      const value = percentile(values, q) as number;
      expect(value).toBeGreaterThanOrEqual(previous);
      expect(percentile(shuffled, q)).toBeCloseTo(value, 10);
      previous = value;
    }
  });
});

describe("summarize", () => {
  it("reports n/min/p50/p95/max/mean over the sample", () => {
    const summary = summarize([1, 2, 3, 4]);
    expect(summary).not.toBeNull();
    expect(summary?.n).toBe(4);
    expect(summary?.min).toBe(1);
    expect(summary?.max).toBe(4);
    expect(summary?.mean).toBeCloseTo(2.5, 10);
    expect(summary?.p50).toBeCloseTo(2.5, 10);
    expect(summary?.p95).toBeCloseTo(3.85, 10);
  });

  it("a single-sample summary collapses to that value", () => {
    const summary = summarize([12.5]);
    expect(summary).toEqual({ n: 1, min: 12.5, p50: 12.5, p95: 12.5, max: 12.5, mean: 12.5 });
  });
});

describe("frameStats — fps and frame time from render timestamps", () => {
  const steady60 = Array.from({ length: 61 }, (_, index) => 1000 + index * (1000 / 60));

  it("reads 60 fps for 60 one-frame-per-16.67 ms renders", () => {
    const stats = frameStats(steady60, 1000, 2000);
    expect(stats).not.toBeNull();
    expect(stats?.frames).toBe(61);
    expect(stats?.fps).toBeCloseTo(60, 0);
    expect(stats?.p95FrameMs).toBeCloseTo(16.67, 1);
    expect(stats?.maxFrameMs).toBeCloseTo(16.67, 1);
  });

  it("returns null when fewer than two renders fall in the window", () => {
    expect(frameStats([], 0, 1000)).toBeNull();
    expect(frameStats([500], 0, 1000)).toBeNull();
    expect(frameStats(steady60, 0, 10)).toBeNull();
  });

  it("restricts the sample to the measured window", () => {
    const bootFrames = Array.from({ length: 100 }, (_, index) => index * 10);
    const stats = frameStats(bootFrames, 500, 700);
    expect(stats?.frames).toBe(21);
    expect(stats?.windowMs).toBeCloseTo(200, 10);
  });

  it("reports the slowest 500 ms bucket rather than hiding it in the mean", () => {
    const burst = [...Array.from({ length: 30 }, (_, i) => i * 16.7), 900, 916.7, 933.4];
    const stats = frameStats(burst, 0, 1000, 500);
    expect(stats).not.toBeNull();
    expect(stats?.minBucketFps).not.toBeNull();
    expect(stats?.minBucketFps as number).toBeLessThan(stats?.fps as number);
  });

  it("ignores buckets with a single frame so an idle gap never reads as 2 fps", () => {
    const stats = frameStats([0, 16.7, 5000], 0, 6000, 500);
    expect(stats?.buckets.every((bucket) => bucket.frames >= 2)).toBe(true);
    expect(stats?.minBucketFps).toBeGreaterThan(0);
  });
});

describe("verdicts — the limit itself is inside the budget", () => {
  it("verdictMax passes at the limit and breaches above it", () => {
    expect(verdictMax(100, 100)).toBe("PASS");
    expect(verdictMax(99.9, 100)).toBe("PASS");
    expect(verdictMax(100.1, 100)).toBe("BREACH");
    expect(verdictMax(null, 100)).toBe("NOT MEASURED");
    expect(verdictMax(Number.NaN, 100)).toBe("NOT MEASURED");
  });

  it("verdictMin passes at the limit and breaches below it", () => {
    expect(verdictMin(30, 30)).toBe("PASS");
    expect(verdictMin(29.9, 30)).toBe("BREACH");
    expect(verdictMin(null, 30)).toBe("NOT MEASURED");
  });

  it("an unmeasured budget can never be reported as a pass", () => {
    expect(verdictMax(null, 0)).toBe("NOT MEASURED");
    expect(verdictMin(null, Number.POSITIVE_INFINITY)).toBe("NOT MEASURED");
  });
});

describe("formatting helpers", () => {
  it("megabytes uses the binary unit", () => {
    expect(megabytes(1_048_576)).toBe(1);
    expect(megabytes(0)).toBe(0);
  });

  it("formatBytes carries both byte and KiB readings", () => {
    expect(formatBytes(2048)).toContain("2,048 B");
    expect(formatBytes(2048)).toContain("2.0 KiB");
  });

  it("missing numbers render as n/a instead of a fabricated digit", () => {
    expect(formatMs(null)).toBe("n/a");
    expect(formatNumber(null)).toBe("n/a");
    expect(formatMs(12.34)).toBe("12.3 ms");
    expect(formatNumber(12.34, 0)).toBe("12");
  });
});
