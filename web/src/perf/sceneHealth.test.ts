import { afterEach, describe, expect, it } from "vitest";
import {
  getSceneHealthSnapshot,
  refreshSceneHealth,
  registerSceneHealthSource,
  resetSceneHealth,
  subscribeSceneHealth,
  type SceneHealthSample,
  type SceneHealthSource
} from "./sceneHealth";

/**
 * D-22 scene-health channel: the one place renderer statistics are published
 * (C-16 `B-05`, C-16 L455). Properties a regression must trip:
 *   - no publisher means `absent`, and a publisher without a frame means
 *     `pending` — a zero count is never shown as a measurement;
 *   - a sample passes through verbatim (no rounding, clamping or defaults);
 *   - an unusable sample is refused whole, never partially accepted;
 *   - unregistering keeps the last measurement and flips `stageMounted`;
 *   - subscribers are notified only when the reading actually changes.
 */

const SAMPLE: SceneHealthSample = {
  triangles: 87_432,
  drawCalls: 12,
  textures: 0,
  geometries: 7,
  frame: 138
};

const sourceWith = (sample: SceneHealthSample | null): SceneHealthSource => () => sample;

afterEach(() => {
  resetSceneHealth();
});

describe("scene-health channel states", () => {
  it("starts absent with a stable snapshot identity", () => {
    const first = getSceneHealthSnapshot();
    expect(first).toEqual({ status: "absent" });
    refreshSceneHealth();
    expect(getSceneHealthSnapshot()).toBe(first);
  });

  it("reports pending when a renderer is registered but has not drawn", () => {
    registerSceneHealthSource(sourceWith(null));
    expect(getSceneHealthSnapshot()).toEqual({ status: "pending" });
    refreshSceneHealth();
    expect(getSceneHealthSnapshot()).toEqual({ status: "pending" });
  });

  it("reports measured with the stage mounted while the publisher is registered", () => {
    registerSceneHealthSource(sourceWith(SAMPLE));
    expect(getSceneHealthSnapshot()).toEqual({
      status: "measured",
      stageMounted: true,
      sample: SAMPLE
    });
  });

  it("keeps the last measurement after unregistering, labelled stage-not-mounted", () => {
    const unregister = registerSceneHealthSource(sourceWith(SAMPLE));
    unregister();
    expect(getSceneHealthSnapshot()).toEqual({
      status: "measured",
      stageMounted: false,
      sample: SAMPLE
    });
    refreshSceneHealth();
    expect(getSceneHealthSnapshot()).toEqual({
      status: "measured",
      stageMounted: false,
      sample: SAMPLE
    });
  });
});

describe("sample integrity (C-16 L455)", () => {
  it("passes a valid sample through verbatim", () => {
    registerSceneHealthSource(sourceWith(SAMPLE));
    const reading = getSceneHealthSnapshot();
    expect(reading.status === "measured" ? reading.sample : null).toEqual(SAMPLE);
  });

  it("refuses a sample with a non-finite, negative or missing field", () => {
    const partial = { triangles: SAMPLE.triangles };
    const bad: unknown[] = [
      partial,
      { ...SAMPLE, triangles: Number.NaN },
      { ...SAMPLE, triangles: Number.POSITIVE_INFINITY },
      { ...SAMPLE, textures: -1 },
      { ...SAMPLE, triangles: "12" },
      "not-an-object",
      null
    ];
    for (const value of bad) {
      registerSceneHealthSource(() => value as SceneHealthSample | null);
      const reading = getSceneHealthSnapshot();
      expect(reading.status, JSON.stringify(value) ?? "value").toBe("pending");
    }
  });

  it("goes back to measured on the next usable sample", () => {
    registerSceneHealthSource(() => null);
    expect(getSceneHealthSnapshot().status).toBe("pending");
    const unregister = registerSceneHealthSource(sourceWith(SAMPLE));
    expect(getSceneHealthSnapshot().status).toBe("measured");
    unregister();
    expect(getSceneHealthSnapshot().status).toBe("measured");
  });
});

describe("subscription discipline", () => {
  it("notifies only when the reading changes", () => {
    let notified = 0;
    const stop = subscribeSceneHealth(() => {
      notified += 1;
    });
    const baseline = notified;

    refreshSceneHealth(); // still absent — no change, no notification
    expect(notified).toBe(baseline);

    const unregister = registerSceneHealthSource(sourceWith(SAMPLE)); // absent → measured
    expect(notified).toBe(baseline + 1);

    refreshSceneHealth(); // same sample, same stageMounted — no notification
    expect(notified).toBe(baseline + 1);

    unregister(); // stageMounted flips
    expect(notified).toBe(baseline + 2);

    stop();
    const afterUnsubscribe = notified;
    registerSceneHealthSource(sourceWith(SAMPLE));
    expect(notified).toBe(afterUnsubscribe);
  });

  it("hands the subscriber the same object the reader sees", () => {
    let seen: unknown = null;
    const stop = subscribeSceneHealth(() => {
      seen = getSceneHealthSnapshot();
    });
    registerSceneHealthSource(sourceWith(SAMPLE));
    expect(seen).toBe(getSceneHealthSnapshot());
    stop();
  });
});
