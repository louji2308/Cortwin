import "./stage.css";

/**
 * In-viewer probability legend — the calibrated colour bar with the displayed
 * target's decision threshold anchored on it (C-11 §8.1 "in-viewer legend";
 * explore F.2).
 *
 * Laws:
 * - **One ramp** (C-11 L354): the bar's colours come from the `ramp` sampler
 *   the caller passes — which is `probabilityToColour`, THE same function that
 *   colours the 3D materials, the vessel tags and `ProbabilityReadout`. No
 *   second ramp, no colour literal here.
 * - **Threshold marker, never a probability value** (INV-C13): the marker
 *   anchors the target's decision threshold (a calibration constant) at its
 *   ramp position. The threshold percentage is expressed in `style` only, as
 *   the CSS-position percentage — F.1 exempts style-attribute `%`, and this
 *   component never renders a number as text. The only percentage-like text
 *   tokens are the fixed scale labels "low" and "high", which carry no
 *   clinical value.
 * - **Follows the displayed target** (coherence): the caller passes the legend
 *   model derived by `stageLegendModel`, so the marker always sits on the
 *   threshold the readout is actually using.
 * - **No colour-only encoding**: the marker is a solid caret above the bar and
 *   the target's threshold is named in text beside it.
 */

/** Number of evenly spaced samples drawn from THE ramp for the bar. */
export const LEGEND_STOP_COUNT = 11;

export type StageLegendProps = {
  /** THE probability→colour ramp sampler (`probabilityToColour`). */
  readonly ramp: (probability: number) => string;
  /** Registry label of the target whose threshold is anchored. */
  readonly targetLabel: string;
  /** Decision threshold as a fraction in [0,1]; null → no marker. */
  readonly threshold: number | null;
};

/** Ramp colours for the legend bar, low→high, one per gradient stop. */
export function legendColours(ramp: (probability: number) => string): string[] {
  const colours: string[] = [];
  for (let index = 0; index < LEGEND_STOP_COUNT; index += 1) {
    colours.push(ramp(index / (LEGEND_STOP_COUNT - 1)));
  }
  return colours;
}

/** Clamp a fraction to a [0,100] CSS-position percentage for the marker. */
export function markerPercent(threshold: number): number {
  if (!Number.isFinite(threshold)) return 0;
  if (threshold <= 0) return 0;
  if (threshold >= 1) return 100;
  return threshold * 100;
}

export function StageLegend({ ramp, targetLabel, threshold }: StageLegendProps) {
  const gradient = `linear-gradient(90deg, ${legendColours(ramp).join(", ")})`;
  const anchored = threshold !== null && Number.isFinite(threshold);

  return (
    <div className="ct-stage__legend" data-anchored={anchored ? "true" : "false"}>
      <div className="ct-stage__legend-row">
        <span className="ct-stage__legend-end">low</span>
        <div
          className="ct-stage__legend-bar"
          style={{ background: gradient }}
          role="img"
          aria-label="Calibrated risk colour ramp, low to high"
        >
          {anchored ? (
            <span
              className="ct-stage__legend-marker"
              style={{ left: `${markerPercent(threshold as number)}%` }}
            />
          ) : null}
        </div>
        <span className="ct-stage__legend-end">high</span>
      </div>
      <div className="ct-stage__legend-row ct-stage__legend-row--caption">
        <span className="ct-stage__legend-caption">
          {anchored ? `${targetLabel} threshold` : "threshold unavailable"}
        </span>
      </div>
    </div>
  );
}
