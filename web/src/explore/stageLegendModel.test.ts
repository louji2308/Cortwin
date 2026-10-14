import { describe, expect, it } from "vitest";
import type { CorTwinStoreState } from "../contracts";
import { stageLegendModel } from "./stageLegendModel";

/**
 * stageLegendModel — the pure projection from store state to the in-viewer
 * legend (C-11 §8.1 / explore F.2).
 *
 * The legend anchors a *decision threshold* — a calibration constant copied
 * from the evaluation payload (INV-C13), never a patient probability. Two
 * coherence laws are worth pinning here rather than only in the e2e:
 *  - the CAD branch reads `selectDisplayedCad`, so the legend can never anchor
 *    a threshold the CAD readout is not using;
 *  - a missing evaluation yields `threshold: null` (the designed empty state),
 *    not a fabricated default.
 */

function stateWith(payload?: {
  targets?: Record<string, { thresholdProbability: number }>;
  headlineCad?: { thresholdProbability: number };
}): CorTwinStoreState {
  const state = {
    eval: {
      current:
        payload === undefined
          ? null
          : {
              targets: payload.targets ?? {},
              headlineCad: payload.headlineCad ?? { thresholdProbability: 0.5 }
            }
    },
    display: { current: {}, running: false }
  };
  return state as unknown as CorTwinStoreState;
}

describe("stageLegendModel", () => {
  it("anchors a vessel target's decision threshold from the payload", () => {
    const state = stateWith({ targets: { LAD: { thresholdProbability: 0.62 } } });
    expect(stageLegendModel(state, "LAD", "Left anterior descending")).toEqual({
      targetId: "LAD",
      targetLabel: "Left anterior descending",
      threshold: 0.62
    });
  });

  it("never emits a probability value — only the threshold (INV-C13)", () => {
    const state = stateWith({
      targets: { RCA: { thresholdProbability: 0.4 } },
      headlineCad: { thresholdProbability: 0.9 }
    });
    const model = stageLegendModel(state, "RCA", "Right coronary");
    expect(Object.keys(model)).toEqual(["targetId", "targetLabel", "threshold"]);
    expect(model.threshold).toBe(0.4);
    expect(model).not.toHaveProperty("probability");
  });

  it("reports the designed empty state when there is no evaluation", () => {
    expect(stageLegendModel(stateWith(undefined), "LAD", "LAD").threshold).toBeNull();
  });

  it("reports the empty state when the target is absent from the payload", () => {
    const state = stateWith({ targets: { LAD: { thresholdProbability: 0.5 } } });
    expect(stageLegendModel(state, "RCA", "RCA").threshold).toBeNull();
  });

  it("coerces a non-finite threshold to the empty state, never to a number", () => {
    const state = stateWith({ targets: { LAD: { thresholdProbability: Number.NaN } } });
    expect(stageLegendModel(state, "LAD", "LAD").threshold).toBeNull();
  });

  it("keeps CAD on the coherence path (selectDisplayedCad, not targets.CAD)", () => {
    const state = stateWith({
      targets: { CAD: { thresholdProbability: 0.11 } },
      headlineCad: { thresholdProbability: 0.77 }
    });
    expect(stageLegendModel(state, "CAD", "Coronary artery disease").threshold).toBe(0.77);
  });
});
