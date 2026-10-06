/**
 * Trust → Decisions pane (Contracts §9 L421): precomputed threshold sweep
 * (threshold vs precision/recall/F1), abstention sweep, and the optional
 * current-case marker positioned from live probability/band props.
 * Curves are artifact data; only marker position, axis scale and formatting
 * are derived here (Contracts §9 L424).
 */

import { useState } from "react";
import {
  MAX_POINT_MARKERS,
  PROBABILITY_TICK_LABELS,
  PROBABILITY_TICKS,
  clampIndex,
  nearestSweepIndex,
  probabilityScale,
  toPolyline
} from "./chart";
import { PaneShell } from "./PaneShell";
import { SegmentedControl } from "./SegmentedControl";
import { TRUST_COPY } from "./copy";
import { NOT_PROVIDED, formatCount, formatDecision, formatMetric, formatPercent } from "./format";
import {
  TARGET_IDS,
  type CurrentCaseMarker,
  type TargetId,
  type TrustResults
} from "./types";

export type DecisionsPaneProps = {
  results: TrustResults | null;
  target?: TargetId;
  onTargetChange?: (target: TargetId) => void;
  /** Optional live marker: probability, abstention band, decision and tier. */
  currentCase?: CurrentCaseMarker | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: (() => void) | null;
  /** Optional controlled sweep-point selection for the threshold inspector. */
  thresholdIndex?: number | null;
  onThresholdIndexChange?: (index: number | null) => void;
};

const SWEEP_W = 640;
const SWEEP_H = 360;
const SWEEP_MARGIN = { left: 56, right: 18, top: 34, bottom: 52 };
const SWEEP_X: readonly [number, number] = [SWEEP_MARGIN.left, SWEEP_W - SWEEP_MARGIN.right];
const SWEEP_Y: readonly [number, number] = [SWEEP_H - SWEEP_MARGIN.bottom, SWEEP_MARGIN.top];

const ABST_W = 560;
const ABST_H = 320;
const ABST_MARGIN = { left: 56, right: 18, top: 18, bottom: 52 };
const ABST_X: readonly [number, number] = [ABST_MARGIN.left, ABST_W - ABST_MARGIN.right];
const ABST_Y: readonly [number, number] = [ABST_H - ABST_MARGIN.bottom, ABST_MARGIN.top];

function clampLabelX(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function SweepChart({
  target,
  points,
  selectedThreshold,
  currentCase,
  inspectIndex
}: {
  target: TargetId;
  points: ReadonlyArray<{ threshold: number; precision: number; recall: number; f1: number }>;
  selectedThreshold: number | null;
  currentCase?: CurrentCaseMarker | null;
  inspectIndex?: number | null;
}) {
  const x = probabilityScale(SWEEP_X);
  const y = probabilityScale(SWEEP_Y);
  const precisionLine = toPolyline(points.map((p) => [x(p.threshold), y(p.precision)] as const));
  const recallLine = toPolyline(points.map((p) => [x(p.threshold), y(p.recall)] as const));
  const f1Line = toPolyline(points.map((p) => [x(p.threshold), y(p.f1)] as const));

  const thresholdX = selectedThreshold != null ? x(selectedThreshold) : null;
  const caseX = currentCase ? x(currentCase.probability) : null;
  const bandLeft = currentCase ? x(currentCase.lowerProbability) : null;
  const bandRight = currentCase ? x(currentCase.upperProbability) : null;

  return (
    <div>
      <svg
        className="ct-chart"
        viewBox={`0 0 ${SWEEP_W} ${SWEEP_H}`}
        role="img"
        aria-labelledby={`sweep-title-${target} sweep-desc-${target}`}
        data-testid="threshold-sweep-chart"
      >
        <title id={`sweep-title-${target}`}>{`Threshold sweep for ${target}`}</title>
        <desc id={`sweep-desc-${target}`}>{TRUST_COPY.decisionsSweepSummary}</desc>

        {PROBABILITY_TICKS.map((tick) => (
          <g key={`grid-${tick}`}>
            <line
              className="ct-chart__grid"
              x1={x(tick)}
              y1={SWEEP_Y[0]}
              x2={x(tick)}
              y2={SWEEP_Y[1]}
            />
            <line
              className="ct-chart__grid"
              x1={SWEEP_X[0]}
              y1={y(tick)}
              x2={SWEEP_X[1]}
              y2={y(tick)}
            />
          </g>
        ))}

        {bandLeft != null && bandRight != null && (
          <rect
            className="ct-chart__band"
            data-testid="abstention-band"
            x={Math.min(bandLeft, bandRight)}
            y={SWEEP_Y[1]}
            width={Math.abs(bandRight - bandLeft)}
            height={SWEEP_Y[0] - SWEEP_Y[1]}
          />
        )}

        <line
          className="ct-chart__axis"
          x1={SWEEP_X[0]}
          y1={SWEEP_Y[0]}
          x2={SWEEP_X[1]}
          y2={SWEEP_Y[0]}
        />
        <line
          className="ct-chart__axis"
          x1={SWEEP_X[0]}
          y1={SWEEP_Y[0]}
          x2={SWEEP_X[0]}
          y2={SWEEP_Y[1]}
        />

        {PROBABILITY_TICKS.map((tick, index) => (
          <g key={`tick-${tick}`}>
            <text
              className="ct-chart__tick"
              x={x(tick)}
              y={SWEEP_Y[0] + 18}
              textAnchor="middle"
            >
              {PROBABILITY_TICK_LABELS[index]}
            </text>
            <text
              className="ct-chart__tick"
              x={SWEEP_X[0] - 8}
              y={y(tick) + 4}
              textAnchor="end"
            >
              {PROBABILITY_TICK_LABELS[index]}
            </text>
          </g>
        ))}

        <text
          className="ct-chart__axis-label"
          x={(SWEEP_X[0] + SWEEP_X[1]) / 2}
          y={SWEEP_H - 12}
          textAnchor="middle"
        >
          Decision threshold
        </text>
        <text
          className="ct-chart__axis-label"
          transform={`translate(16 ${(SWEEP_Y[0] + SWEEP_Y[1]) / 2}) rotate(-90)`}
          textAnchor="middle"
        >
          Metric value
        </text>

        <polyline className="ct-chart__series-a" points={precisionLine} />
        <polyline className="ct-chart__series-b" points={recallLine} />
        <polyline className="ct-chart__series-c" points={f1Line} />

        {inspectIndex != null && points[inspectIndex] != null && (
          <g data-testid="inspected-point-marker">
            <line
              className="ct-chart__inspect-line"
              x1={x(points[inspectIndex].threshold)}
              y1={SWEEP_Y[1]}
              x2={x(points[inspectIndex].threshold)}
              y2={SWEEP_Y[0]}
            />
            <circle
              className="ct-chart__series-a ct-chart__inspect-dot"
              cx={x(points[inspectIndex].threshold)}
              cy={y(points[inspectIndex].precision)}
              r="4"
            />
            <circle
              className="ct-chart__series-b ct-chart__inspect-dot"
              cx={x(points[inspectIndex].threshold)}
              cy={y(points[inspectIndex].recall)}
              r="4"
            />
            <circle
              className="ct-chart__series-c ct-chart__inspect-dot"
              cx={x(points[inspectIndex].threshold)}
              cy={y(points[inspectIndex].f1)}
              r="4"
            />
          </g>
        )}

        {thresholdX != null && (
          <g data-testid="threshold-marker">
            <line
              className="ct-chart__threshold"
              x1={thresholdX}
              y1={SWEEP_Y[1]}
              x2={thresholdX}
              y2={SWEEP_Y[0]}
            />
            <text
              className="ct-chart__threshold-label"
              x={clampLabelX(thresholdX, SWEEP_X[0] + 66, SWEEP_X[1] - 66)}
              y={SWEEP_Y[1] - 8}
              textAnchor="middle"
            >
              {`${TRUST_COPY.decisionsThresholdLabel} ${formatMetric(selectedThreshold)}`}
            </text>
          </g>
        )}

        {caseX != null && currentCase && (
          <g data-testid="case-marker-line">
            <line
              className="ct-chart__case"
              x1={caseX}
              y1={SWEEP_Y[1]}
              x2={caseX}
              y2={SWEEP_Y[0]}
            />
            <polygon
              className="ct-chart__marker-a"
              points={`${caseX},${SWEEP_Y[1] - 2} ${caseX - 6},${SWEEP_Y[1] - 12} ${caseX + 6},${SWEEP_Y[1] - 12}`}
            />
            <text
              className="ct-chart__threshold-label"
              x={clampLabelX(caseX, SWEEP_X[0] + 44, SWEEP_X[1] - 44)}
              y={SWEEP_Y[0] + 36}
              textAnchor="middle"
            >
              {`This patient ${formatPercent(currentCase.probability)}`}
            </text>
          </g>
        )}
      </svg>

      <ul className="ct-legend">
        <li>
          <svg width="26" height="12" aria-hidden="true" focusable="false">
            <line x1="1" y1="6" x2="25" y2="6" className="ct-chart__series-a" />
          </svg>
          Precision (solid, blue)
        </li>
        <li>
          <svg width="26" height="12" aria-hidden="true" focusable="false">
            <line x1="1" y1="6" x2="25" y2="6" className="ct-chart__series-b" />
          </svg>
          Recall (dashed, amber)
        </li>
        <li>
          <svg width="26" height="12" aria-hidden="true" focusable="false">
            <line x1="1" y1="6" x2="25" y2="6" className="ct-chart__series-c" />
          </svg>
          F1 (dotted, green)
        </li>
        <li>
          <svg width="26" height="12" aria-hidden="true" focusable="false">
            <line x1="13" y1="1" x2="13" y2="11" className="ct-chart__threshold" />
          </svg>
          {TRUST_COPY.thresholdInspectDeployed}
        </li>
        {inspectIndex != null && (
          <li>
            <svg width="26" height="12" aria-hidden="true" focusable="false">
              <circle cx="13" cy="6" r="4" className="ct-chart__series-a ct-chart__inspect-dot" />
            </svg>
            Inspected sweep point (selected in the inspector)
          </li>
        )}
        {currentCase && (
          <li>
            <svg width="26" height="12" aria-hidden="true" focusable="false">
              <rect x="1" y="1" width="24" height="10" className="ct-chart__band" />
            </svg>
            Abstention band · this patient (live evaluation)
          </li>
        )}
      </ul>
      <p className="ct-summary">{TRUST_COPY.decisionsSweepSummary}</p>
    </div>
  );
}

function AbstentionChart({
  target,
  sweeps
}: {
  target: TargetId;
  sweeps: ReadonlyArray<{ abstainFraction: number; coverage: number; accuracyDecided: number }>;
}) {
  const x = probabilityScale(ABST_X);
  const y = probabilityScale(ABST_Y);
  const line = toPolyline(
    sweeps.map((sweep) => [x(sweep.coverage), y(sweep.accuracyDecided)] as const)
  );

  return (
    <div>
      <svg
        className="ct-chart"
        viewBox={`0 0 ${ABST_W} ${ABST_H}`}
        role="img"
        aria-labelledby={`abstention-title-${target} abstention-desc-${target}`}
        data-testid="abstention-chart"
      >
        <title id={`abstention-title-${target}`}>{`Abstention sweep for ${target}`}</title>
        <desc id={`abstention-desc-${target}`}>{TRUST_COPY.decisionsAbstentionSummary}</desc>

        {PROBABILITY_TICKS.map((tick) => (
          <g key={`agrid-${tick}`}>
            <line
              className="ct-chart__grid"
              x1={x(tick)}
              y1={ABST_Y[0]}
              x2={x(tick)}
              y2={ABST_Y[1]}
            />
            <line
              className="ct-chart__grid"
              x1={ABST_X[0]}
              y1={y(tick)}
              x2={ABST_X[1]}
              y2={y(tick)}
            />
          </g>
        ))}

        <line
          className="ct-chart__axis"
          x1={ABST_X[0]}
          y1={ABST_Y[0]}
          x2={ABST_X[1]}
          y2={ABST_Y[0]}
        />
        <line
          className="ct-chart__axis"
          x1={ABST_X[0]}
          y1={ABST_Y[0]}
          x2={ABST_X[0]}
          y2={ABST_Y[1]}
        />

        {PROBABILITY_TICKS.map((tick, index) => (
          <g key={`atick-${tick}`}>
            <text
              className="ct-chart__tick"
              x={x(tick)}
              y={ABST_Y[0] + 18}
              textAnchor="middle"
            >
              {PROBABILITY_TICK_LABELS[index]}
            </text>
            <text
              className="ct-chart__tick"
              x={ABST_X[0] - 8}
              y={y(tick) + 4}
              textAnchor="end"
            >
              {PROBABILITY_TICK_LABELS[index]}
            </text>
          </g>
        ))}

        <text
          className="ct-chart__axis-label"
          x={(ABST_X[0] + ABST_X[1]) / 2}
          y={ABST_H - 12}
          textAnchor="middle"
        >
          Cohort coverage
        </text>
        <text
          className="ct-chart__axis-label"
          transform={`translate(16 ${(ABST_Y[0] + ABST_Y[1]) / 2}) rotate(-90)`}
          textAnchor="middle"
        >
          Accuracy on decided cases
        </text>

        <polyline className="ct-chart__series-a" points={line} />

        {sweeps.length <= MAX_POINT_MARKERS &&
          sweeps.map((sweep) => (
            <polygon
              key={`sweep-${sweep.abstainFraction}`}
              className="ct-chart__marker-a"
              points={`${x(sweep.coverage)},${y(sweep.accuracyDecided) - 5} ${x(sweep.coverage) + 5},${y(sweep.accuracyDecided)} ${x(sweep.coverage)},${y(sweep.accuracyDecided) + 5} ${x(sweep.coverage) - 5},${y(sweep.accuracyDecided)}`}
            >
              <title>
                {`Abstain ${formatPercent(sweep.abstainFraction, 0)}: coverage ${formatPercent(sweep.coverage)}, accuracy on decided ${formatPercent(sweep.accuracyDecided)}`}
              </title>
            </polygon>
          ))}
      </svg>
      <p className="ct-summary">{TRUST_COPY.decisionsAbstentionSummary}</p>
    </div>
  );
}

function CurrentCaseReadout({ currentCase, threshold }: { currentCase: CurrentCaseMarker; threshold: number | null }) {
  return (
    <div className="ct-case" data-testid="current-case-marker">
      <h3>{TRUST_COPY.currentCaseHeading}</h3>
      <p className="ct-num">
        Estimated probability {formatPercent(currentCase.probability)} · threshold{" "}
        {threshold != null ? formatPercent(threshold) : NOT_PROVIDED} · decision{" "}
        {formatDecision(currentCase.decision)} · reliability {currentCase.reliability}
      </p>
      <p className="ct-num">
        {TRUST_COPY.currentCaseBandLabel} {formatPercent(currentCase.lowerProbability)}–
        {formatPercent(currentCase.upperProbability)}
      </p>
      <p className="ct-note">{TRUST_COPY.currentCaseHint}</p>
    </div>
  );
}

export function DecisionsPane({
  results,
  target,
  onTargetChange,
  currentCase,
  loading,
  error,
  onRetry,
  thresholdIndex,
  onThresholdIndexChange
}: DecisionsPaneProps) {
  const [internalIndex, setInternalIndex] = useState<number | null>(null);
  const [internalTarget, setInternalTarget] = useState<TargetId>("CAD");
  const activeTarget = target ?? internalTarget;
  const selectTarget = (next: TargetId) => {
    setInternalTarget(next);
    onTargetChange?.(next);
  };

  const decision = results?.decisions?.[activeTarget];
  const points = [...(decision?.points ?? [])].sort((a, b) => a.threshold - b.threshold);
  const sweeps = decision?.abstention?.sweeps ?? [];
  const selectedThreshold = decision?.selectedThreshold ?? null;

  const deployedIndex = nearestSweepIndex(points, selectedThreshold);
  const requestedIndex = thresholdIndex !== undefined ? thresholdIndex : internalIndex;
  const inspectedIndex =
    requestedIndex != null
      ? clampIndex(requestedIndex, points.length)
      : deployedIndex;
  const inspectedPoint = inspectedIndex != null ? points[inspectedIndex] : undefined;

  const setInspectedIndex = (next: number | null) => {
    setInternalIndex(next);
    onThresholdIndexChange?.(next);
  };

  return (
    <PaneShell
      title="Decisions"
      subtitle={TRUST_COPY.decisionsSubtitle}
      hasData={results != null}
      loading={loading}
      error={error}
      onRetry={onRetry}
    >
      <SegmentedControl
        legend="Target"
        value={activeTarget}
        onChange={selectTarget}
        options={TARGET_IDS.map((id) => ({ value: id, label: id }))}
      />

      {!decision ? (
        <p className="ct-note">{TRUST_COPY.decisionsMissing}</p>
      ) : (
        <>
          {currentCase && (
            <CurrentCaseReadout currentCase={currentCase} threshold={selectedThreshold} />
          )}

          <div className="ct-grid-2">
            <section aria-label={`Threshold sweep for ${activeTarget}`}>
              <h3 className="ct-block-title">Threshold sweep · {activeTarget}</h3>
              {points.length > 0 ? (
                <SweepChart
                  target={activeTarget}
                  points={points}
                  selectedThreshold={selectedThreshold}
                  currentCase={currentCase}
                  inspectIndex={inspectedIndex}
                />
              ) : (
                <p className="ct-note">{TRUST_COPY.decisionsSweepMissing}</p>
              )}

              {points.length > 0 && (
                <div className="ct-inspect" data-testid="threshold-inspector">
                  <label className="ct-inspect__label" htmlFor={`threshold-inspect-${activeTarget}`}>
                    {TRUST_COPY.thresholdInspectLabel}
                  </label>
                  <input
                    id={`threshold-inspect-${activeTarget}`}
                    className="ct-inspect__slider"
                    data-testid="threshold-inspect-slider"
                    type="range"
                    min={0}
                    max={points.length - 1}
                    step={1}
                    value={inspectedIndex ?? 0}
                    onChange={(event) => setInspectedIndex(Number(event.target.value))}
                  />
                  <p className="ct-note">{TRUST_COPY.thresholdInspectHint}</p>
                  {inspectedPoint ? (
                    <p
                      className="ct-inspect__readout ct-num"
                      aria-live="polite"
                      data-testid="threshold-inspect-readout"
                    >
                      Threshold {formatMetric(inspectedPoint.threshold)} · Precision{" "}
                      {formatMetric(inspectedPoint.precision)} · Recall{" "}
                      {formatMetric(inspectedPoint.recall)} · F1 {formatMetric(inspectedPoint.f1)}
                    </p>
                  ) : (
                    <p className="ct-inspect__readout is-not-provided">{NOT_PROVIDED}</p>
                  )}
                  {decision.thresholdSelection && (
                    <p className="ct-note">
                      {TRUST_COPY.thresholdSelectionLabel}: {decision.thresholdSelection.method} ·
                      source {decision.thresholdSelection.source}
                    </p>
                  )}
                </div>
              )}

              {selectedThreshold == null && (
                <p className="ct-note">{TRUST_COPY.decisionsNoThreshold}</p>
              )}
            </section>

            <section aria-label={`Abstention sweep for ${activeTarget}`}>
              <h3 className="ct-block-title">Abstention sweep · {activeTarget}</h3>
              {sweeps.length > 0 ? (
                <AbstentionChart target={activeTarget} sweeps={sweeps} />
              ) : (
                <p className="ct-note">{TRUST_COPY.decisionsAbstentionMissing}</p>
              )}
            </section>
          </div>

          {points.length > 0 && (
            <details className="ct-details">
              <summary>Show exact sweep points</summary>
              <div className="ct-scroll">
                <table className="ct-table">
                  <caption>{`Precomputed sweep points · ${activeTarget}`}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Threshold</th>
                      <th scope="col">Precision</th>
                      <th scope="col">Recall</th>
                      <th scope="col">F1</th>
                    </tr>
                  </thead>
                  <tbody>
                    {points.map((point) => (
                      <tr key={point.threshold}>
                        <th scope="row" className="ct-num">
                          {formatMetric(point.threshold)}
                        </th>
                        <td className="ct-num">{formatMetric(point.precision)}</td>
                        <td className="ct-num">{formatMetric(point.recall)}</td>
                        <td className="ct-num">{formatMetric(point.f1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          {sweeps.length > 0 && (
            <details className="ct-details">
              <summary>Show exact abstention values</summary>
              <div className="ct-scroll">
                <table className="ct-table">
                  <caption>{`Abstention sweep values · ${activeTarget}`}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Abstain fraction</th>
                      <th scope="col">Coverage</th>
                      <th scope="col">Accuracy on decided cases</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sweeps.map((sweep) => (
                      <tr key={sweep.abstainFraction}>
                        <th scope="row" className="ct-num">
                          {formatPercent(sweep.abstainFraction)}
                        </th>
                        <td className="ct-num">{formatPercent(sweep.coverage)}</td>
                        <td className="ct-num">{formatPercent(sweep.accuracyDecided)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {decision.abstention?.selectionRule && (
                <p className="ct-note">
                  Selection rule: {decision.abstention.selectionRule} (
                  {formatCount(points.length)} sweep points)
                </p>
              )}
            </details>
          )}
        </>
      )}
    </PaneShell>
  );
}
