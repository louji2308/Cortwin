/**
 * Stage legend model — the pure projection from store state to what the
 * in-viewer probability legend renders (C-11 §8.1 "in-viewer legend"; explore
 * F.2).
 *
 * Laws:
 * - **Threshold only, never a probability value** (INV-C13): the legend
 *   anchors the *decision threshold* of the currently displayed target — a
 *   calibration constant, not a patient measurement. It never carries the
 *   probability; that stays in `ProbabilityReadout`.
 * - **One ramp** (C-11 L354): the legend's colour bar is drawn by the stage
 *   from `probabilityToColour`, the same function that colours the 3D
 *   materials and the vessel tags. This module supplies no colour.
 * - **Follows the displayed target**: CAD headline coherence
 *   (`selectDisplayedCad`) governs the CAD threshold exactly as it governs the
 *   readout, so the legend can never anchor a threshold the readout is not
 *   using.
 * - **No digits, no units**: this model emits no formatted strings. INV-C13's
 *   F.1 law reserves rendered percentage text for `ProbabilityReadout`; the
 *   legend labels its scale with the words "low"/"high" and prints no number.
 *
 * Pure: no React, no DOM, no three.js. Runs in Node tests.
 */
import type { CorTwinStoreState, TargetId } from "../contracts";
import { selectDisplayedCad } from "../store";

export type StageLegendModel = {
  /** The target whose threshold the legend anchors (CAD follows coherence). */
  readonly targetId: TargetId;
  /** Registry label for that target, e.g. "LAD". */
  readonly targetLabel: string;
  /** Decision threshold as a fraction in [0, 1]; null when no evaluation. */
  readonly threshold: number | null;
};

/**
 * The threshold for the currently displayed target — null when there is no
 * evaluation yet (the designed empty state: the legend shows its unanchored
 * scale and no threshold marker).
 */
export function stageLegendModel(
  state: CorTwinStoreState,
  targetId: TargetId,
  targetLabel: string
): StageLegendModel {
  if (targetId === "CAD") {
    const displayed = selectDisplayedCad(state);
    return {
      targetId,
      targetLabel,
      threshold:
        displayed !== null && Number.isFinite(displayed.thresholdProbability)
          ? displayed.thresholdProbability
          : null
    };
  }
  const evaluation = state.eval.current;
  const payload = evaluation === null ? undefined : evaluation.targets[targetId];
  return {
    targetId,
    targetLabel,
    threshold:
      payload !== undefined && Number.isFinite(payload.thresholdProbability)
        ? payload.thresholdProbability
        : null
  };
}
