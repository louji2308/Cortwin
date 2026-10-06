import { probabilityToColour, type TargetId } from "../design";
import "./ProbabilityReadout.css";

/**
 * `ProbabilityReadout` — the only probability renderer in the product
 * (Contracts §8.3 `C-12` L369, INV-07/INV-C12).
 *
 * Renders ONLY from props: it never fetches results, never computes
 * probabilities, thresholds or reliability, never invokes model code and never
 * chooses a source target (C-12 L377). Every render shows, for both sizes and
 * every state: numeric probability, threshold relation, textual decision state
 * + glyph, and reliability text + glyph. There is no bare-probability variant,
 * and colour alone never conveys decision or reliability — glyphs and text are
 * always present, colour (from design/ramp.ts) carries probability only.
 */
export type ProbabilityReadoutProps = {
  value: number;
  targetId: TargetId;
  targetLabel: string;
  threshold: number;
  decision: "above" | "below" | "indeterminate";
  reliability: "strong" | "moderate" | "limited";
  size: "compact" | "large";
  sourceTargetId?: TargetId;
};

/** Decision glyphs: solid above, outline below, hatched indeterminate (Final_demo §4.2). */
const DECISION_GLYPH: Record<ProbabilityReadoutProps["decision"], string> = {
  above: "▲",
  below: "△",
  indeterminate: "▨"
};

/** Reliability glyphs: filled dots = strong, partial = moderate, single = limited (AGENTS §6.1). */
const RELIABILITY_GLYPH: Record<ProbabilityReadoutProps["reliability"], string> = {
  strong: "●●●",
  moderate: "●●○",
  limited: "●○○"
};

const formatPercent = (value: number): string =>
  Number.isFinite(value) ? `${Math.round(value * 100)}%` : "not available";

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

/**
 * Threshold relation is a presentation comparison of two values the caller
 * supplied — it derives no threshold, no probability and no decision (the
 * decision, including the abstention band, always comes from props).
 */
const thresholdRelation = (
  value: number,
  threshold: number
): "at or above threshold" | "below threshold" | "cannot compare" => {
  if (!Number.isFinite(value) || !Number.isFinite(threshold)) {
    return "cannot compare";
  }
  return value >= threshold ? "at or above threshold" : "below threshold";
};

export function ProbabilityReadout({
  value,
  targetId,
  targetLabel,
  threshold,
  decision,
  reliability,
  size,
  sourceTargetId
}: ProbabilityReadoutProps) {
  const colour = probabilityToColour(value);
  const fillWidth = Number.isFinite(value) ? `${clamp01(value) * 100}%` : "0%";
  const tickLeft = Number.isFinite(threshold) ? `${clamp01(threshold) * 100}%` : null;

  return (
    <div
      className={`ct-prob-readout ct-prob-readout--${size}`}
      role="group"
      aria-label={`${targetLabel} probability readout`}
      data-target-id={targetId}
      data-decision={decision}
      data-reliability={reliability}
    >
      <div className="ct-prob-readout__live" aria-live="polite" aria-atomic="true">
        <div className="ct-prob-readout__target">{targetLabel}</div>

        <div className="ct-prob-readout__value-row">
          <span className="ct-prob-readout__value">{formatPercent(value)}</span>
          <span
            className="ct-prob-readout__swatch"
            style={{ backgroundColor: colour }}
            aria-hidden="true"
          />
        </div>

        <div className="ct-prob-readout__threshold">
          <span className="ct-prob-readout__threshold-label">
            {`Threshold ${formatPercent(threshold)}`}
          </span>
          <span className="ct-prob-readout__sep" aria-hidden="true">
            ·
          </span>
          <span className="ct-prob-readout__relation">{thresholdRelation(value, threshold)}</span>
        </div>

        <div className="ct-prob-readout__bar" aria-hidden="true">
          <span
            className="ct-prob-readout__fill"
            style={{ width: fillWidth, backgroundColor: colour }}
          />
          {tickLeft === null ? null : (
            <span className="ct-prob-readout__tick" style={{ left: tickLeft }} />
          )}
        </div>

        <div className="ct-prob-readout__decision">
          <span className="ct-prob-readout__glyph" aria-hidden="true">
            {DECISION_GLYPH[decision]}
          </span>
          <span className="ct-prob-readout__text">{`Decision: ${decision}`}</span>
        </div>

        <div className="ct-prob-readout__reliability">
          <span className="ct-prob-readout__glyph" aria-hidden="true">
            {RELIABILITY_GLYPH[reliability]}
          </span>
          <span className="ct-prob-readout__text">{`Reliability: ${reliability}`}</span>
        </div>

        {sourceTargetId ? (
          <div className="ct-prob-readout__source" data-source-target-id={sourceTargetId}>
            {`${targetId} shown from ${sourceTargetId}`}
          </div>
        ) : null}
      </div>
    </div>
  );
}
