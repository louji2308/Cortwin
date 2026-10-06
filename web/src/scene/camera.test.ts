import { describe, expect, it } from "vitest";
import {
  CAMERA_FLIGHT_MS,
  cameraFlightDuration,
  cameraFlightProgress,
  easeOutCubic
} from "./camera";

describe("camera timing (C-11 ~700 ms flights)", () => {
  it("ships the contract flight duration", () => {
    expect(CAMERA_FLIGHT_MS).toBe(700);
  });

  it("reduces to an instant arrival under reduced motion, never to a negative", () => {
    expect(cameraFlightDuration(false)).toBe(700);
    expect(cameraFlightDuration(true)).toBe(0);
    expect(cameraFlightDuration(true)).toBeGreaterThanOrEqual(0);
  });

  it("ease-out cubic is clamped, monotonic and endpoint-exact", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(2)).toBe(1);
    let previous = -Infinity;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const value = easeOutCubic(t);
      expect(value).toBeGreaterThanOrEqual(previous);
      expect(value).toBeGreaterThanOrEqual(t <= 1 ? t : 1);
      previous = value;
    }
  });

  it("progress reaches 1 at the flight duration and never exceeds it", () => {
    expect(cameraFlightProgress(0, false)).toBe(0);
    expect(cameraFlightProgress(CAMERA_FLIGHT_MS, false)).toBeCloseTo(1, 12);
    expect(cameraFlightProgress(CAMERA_FLIGHT_MS * 2, false)).toBe(1);
    expect(cameraFlightProgress(CAMERA_FLIGHT_MS / 2, false)).toBeGreaterThan(0);
    expect(cameraFlightProgress(CAMERA_FLIGHT_MS / 2, false)).toBeLessThan(1);
  });

  it("reduced motion short-circuits to a finished flight at any elapsed time", () => {
    expect(cameraFlightProgress(0, true)).toBe(1);
    expect(cameraFlightProgress(1, true)).toBe(1);
    expect(cameraFlightProgress(99999, true)).toBe(1);
  });

  it("never emits NaN or a negative progress for hostile input", () => {
    for (const hostile of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -100]) {
      const progress = cameraFlightProgress(hostile, false);
      expect(Number.isFinite(progress)).toBe(true);
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(progress).toBeLessThanOrEqual(1);
    }
  });

  it("is pure: repeated calls agree", () => {
    expect(cameraFlightProgress(350, false)).toBe(cameraFlightProgress(350, false));
    expect(easeOutCubic(0.42)).toBe(easeOutCubic(0.42));
  });
});
