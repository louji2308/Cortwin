/**
 * Trust → Calibration pane (Contracts §9 L420): reliability diagram (raw vs
 * Platt bins) plus Brier / base-rate Brier / ECE readouts. All values are
 * artifact props (C-04 §5.4: the browser MUST NOT compute Brier/ECE).
 */

import { useState } from "react";
import {
  MAX_POINT_MARKERS,
  PROBABILITY_TICK_LABELS,
  PROBABILITY_TICKS,
  clampIndex,
  probabilityScale,
  toPolyline
} from "./chart";
import { PaneShell } from "./PaneShell";
import { SegmentedControl } from "./SegmentedControl";
import { TRUST_COPY } from "./copy";
import { NOT_PROVIDED, formatCount, formatMetric, formatPercent } from "./format";
import { TARGET_IDS, type TargetId, type TrustResults } from "./types";

type ReliabilityBin = {
  binLower: number;
  binUpper: number;
  count: number;
  fractionPositive: number;
  meanPredicted: number;
};

export type CalibrationPaneProps = {
  results: TrustResults | null;
  target?: TargetId;
  onTargetChange?: (target: TargetId) => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: (() => void) | null;
  /** Optional controlled selection of the inspected reliability bin. */
  binIndex?: number | null;
  onBinIndexChange?: (index: number | null) => void;
};

const WIDTH = 560;
const HEIGHT = 360;
const MARGIN = { left: 56, right: 18, top: 18, bottom: 52 };
const PLOT_X: readonly [number, number] = [MARGIN.left, WIDTH - MARGIN.right];
const PLOT_Y: readonly [number, number] = [HEIGHT - MARGIN.bottom, MARGIN.top];

function Readout({ label, value, hint }: { label: string; value: number | null | undefined; hint: string }) {
  const text = formatMetric(value);
  return (
    <div className="ct-readout">
      <span className="ct-readout__label">{label}</span>
      <span className="ct-readout__value ct-num" data-testid={`readout-${label}`}>
        {text}
      </span>
      <span className="ct-readout__hint">{hint}</span>
    </div>
  );
}

function BinTable({
  caption,
  rows
}: {
  caption: string;
  rows: ReadonlyArray<ReliabilityBin>;
}) {
  return (
    <div className="ct-scroll">
      <table className="ct-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Bin</th>
            <th scope="col">n</th>
            <th scope="col">Mean estimated</th>
            <th scope="col">Observed</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((bin) => (
            <tr key={`${bin.binLower}-${bin.binUpper}`}>
              <th scope="row" className="ct-num">
                {formatPercent(bin.binLower, 0)}–{formatPercent(bin.binUpper, 0)}
              </th>
              <td className="ct-num">{formatCount(bin.count)}</td>
              <td className="ct-num">{formatPercent(bin.meanPredicted)}</td>
              <td className="ct-num">{formatPercent(bin.fractionPositive)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReliabilityDiagram({
  target,
  raw,
  platt,
  highlightIndex
}: {
  target: TargetId;
  raw: ReadonlyArray<ReliabilityBin>;
  platt: ReadonlyArray<ReliabilityBin>;
  highlightIndex?: number | null;
}) {
  const x = probabilityScale(PLOT_X);
  const y = probabilityScale(PLOT_Y);
  const rawLine = toPolyline(raw.map((bin) => [x(bin.meanPredicted), y(bin.fractionPositive)] as const));
  const plattLine = toPolyline(
    platt.map((bin) => [x(bin.meanPredicted), y(bin.fractionPositive)] as const)
  );
  const drawRawMarkers = raw.length > 0 && raw.length <= MAX_POINT_MARKERS;
  const drawPlattMarkers = platt.length > 0 && platt.length <= MAX_POINT_MARKERS;

  return (
    <div>
      <svg
        className="ct-chart"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-labelledby={`reliability-title-${target} reliability-desc-${target}`}
        data-testid="reliability-diagram"
      >
        <title id={`reliability-title-${target}`}>
          {`Reliability diagram for ${target}: raw and Platt bins`}
        </title>
        <desc id={`reliability-desc-${target}`}>
          {TRUST_COPY.calibrationDiagramSummary}
        </desc>

        {PROBABILITY_TICKS.map((tick) => (
          <g key={`grid-${tick}`}>
            <line
              className="ct-chart__grid"
              x1={x(tick)}
              y1={PLOT_Y[0]}
              x2={x(tick)}
              y2={PLOT_Y[1]}
            />
            <line
              className="ct-chart__grid"
              x1={PLOT_X[0]}
              y1={y(tick)}
              x2={PLOT_X[1]}
              y2={y(tick)}
            />
          </g>
        ))}

        <line
          className="ct-chart__identity"
          x1={x(0)}
          y1={y(0)}
          x2={x(1)}
          y2={y(1)}
        />

        <line
          className="ct-chart__axis"
          x1={PLOT_X[0]}
          y1={PLOT_Y[0]}
          x2={PLOT_X[1]}
          y2={PLOT_Y[0]}
        />
        <line
          className="ct-chart__axis"
          x1={PLOT_X[0]}
          y1={PLOT_Y[0]}
          x2={PLOT_X[0]}
          y2={PLOT_Y[1]}
        />

        {PROBABILITY_TICKS.map((tick, index) => (
          <g key={`tick-${tick}`}>
            <text className="ct-chart__tick" x={x(tick)} y={PLOT_Y[0] + 18} textAnchor="middle">
              {PROBABILITY_TICK_LABELS[index]}
            </text>
            <text className="ct-chart__tick" x={PLOT_X[0] - 8} y={y(tick) + 4} textAnchor="end">
              {PROBABILITY_TICK_LABELS[index]}
            </text>
          </g>
        ))}

        <text
          className="ct-chart__axis-label"
          x={(PLOT_X[0] + PLOT_X[1]) / 2}
          y={HEIGHT - 12}
          textAnchor="middle"
        >
          Mean estimated probability in bin
        </text>
        <text
          className="ct-chart__axis-label"
          transform={`translate(16 ${(PLOT_Y[0] + PLOT_Y[1]) / 2}) rotate(-90)`}
          textAnchor="middle"
        >
          Observed frequency in bin
        </text>

        <polyline className="ct-chart__series-b" points={rawLine} />
        <polyline className="ct-chart__series-a" points={plattLine} />

        {drawRawMarkers &&
          raw.map((bin, index) => (
            <g key={`raw-${bin.binLower}`}>
              {highlightIndex != null && index === highlightIndex && (
                <rect
                  data-testid="bin-highlight"
                  className="ct-chart__inspect-halo"
                  x={x(bin.meanPredicted) - 8}
                  y={y(bin.fractionPositive) - 8}
                  width={16}
                  height={16}
                />
              )}
              <circle
                className="ct-chart__marker-b"
                cx={x(bin.meanPredicted)}
                cy={y(bin.fractionPositive)}
                r={4}
              >
                <title>
                  {`Raw bin ${formatPercent(bin.binLower, 0)}–${formatPercent(bin.binUpper, 0)}: mean estimated ${formatPercent(bin.meanPredicted)}, observed ${formatPercent(bin.fractionPositive)}, n ${formatCount(bin.count)}`}
                </title>
              </circle>
            </g>
          ))}

        {drawPlattMarkers &&
          platt.map((bin) => (
            <rect
              key={`platt-${bin.binLower}`}
              className="ct-chart__marker-a"
              x={x(bin.meanPredicted) - 4}
              y={y(bin.fractionPositive) - 4}
              width={8}
              height={8}
            >
              <title>
                {`Platt bin ${formatPercent(bin.binLower, 0)}–${formatPercent(bin.binUpper, 0)}: mean estimated ${formatPercent(bin.meanPredicted)}, observed ${formatPercent(bin.fractionPositive)}, n ${formatCount(bin.count)}`}
              </title>
            </rect>
          ))}
      </svg>

      <ul className="ct-legend">
        <li>
          <svg width="26" height="12" aria-hidden="true" focusable="false">
            <line x1="1" y1="6" x2="25" y2="6" className="ct-chart__series-b" />
            <circle cx="13" cy="6" r="3.5" className="ct-chart__marker-b" />
          </svg>
          Raw bins (dashed, round markers)
        </li>
        <li>
          <svg width="26" height="12" aria-hidden="true" focusable="false">
            <line x1="1" y1="6" x2="25" y2="6" className="ct-chart__series-a" />
            <rect x="9" y="2" width="8" height="8" className="ct-chart__marker-a" />
          </svg>
          Platt bins (solid, square markers)
        </li>
        <li>
          <svg width="26" height="12" aria-hidden="true" focusable="false">
            <line x1="1" y1="11" x2="25" y2="1" className="ct-chart__identity" />
          </svg>
          Identity line (perfect agreement)
        </li>
      </ul>
      <p className="ct-summary">{TRUST_COPY.calibrationDiagramSummary}</p>
    </div>
  );
}

export function CalibrationPane({
  results,
  target,
  onTargetChange,
  loading,
  error,
  onRetry,
  binIndex,
  onBinIndexChange
}: CalibrationPaneProps) {
  const [internalTarget, setInternalTarget] = useState<TargetId>("CAD");
  const [internalBin, setInternalBin] = useState(0);
  const activeTarget = target ?? internalTarget;
  const selectTarget = (next: TargetId) => {
    setInternalTarget(next);
    onTargetChange?.(next);
  };

  const calibration = results?.calibration?.[activeTarget];
  const rawBins = calibration?.reliabilityCurve?.raw ?? [];
  const plattBins = calibration?.reliabilityCurve?.platt ?? [];
  const hasCurve = rawBins.length > 0 || plattBins.length > 0;
  const binOptions = rawBins.length > 0 ? rawBins : plattBins;

  const requestedBin = binIndex !== undefined ? binIndex : internalBin;
  const inspectedBin = clampIndex(requestedBin ?? 0, binOptions.length);
  const rawBin = inspectedBin != null ? rawBins[inspectedBin] : undefined;
  const plattBin = inspectedBin != null ? plattBins[inspectedBin] : undefined;

  const setInspectedBin = (next: number | null) => {
    setInternalBin(next ?? 0);
    onBinIndexChange?.(next);
  };

  return (
    <PaneShell
      title="Calibration"
      subtitle={TRUST_COPY.calibrationSubtitle}
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

      {!calibration ? (
        <p className="ct-note">{TRUST_COPY.calibrationMissing}</p>
      ) : (
        <>
          <h3 className="ct-block-title">{TRUST_COPY.calibrationReadoutsHeading}</h3>
          <div className="ct-readouts">
            <Readout label="Brier (raw)" value={calibration.brierRaw} hint={TRUST_COPY.calibrationBrierNote} />
            <Readout label="Brier (Platt)" value={calibration.brierPlatt} hint={TRUST_COPY.calibrationBrierNote} />
            <Readout label="Base-rate Brier" value={calibration.baseRateBrier} hint={TRUST_COPY.calibrationBaseRateNote} />
            <Readout label="ECE (raw)" value={calibration.eceRaw} hint={TRUST_COPY.calibrationEceNote} />
            <Readout label="ECE (Platt)" value={calibration.ecePlatt} hint={TRUST_COPY.calibrationEceNote} />
          </div>
          <p className="ct-note">{TRUST_COPY.calibrationNoRecompute}</p>

          <h3 className="ct-block-title">Reliability diagram · {activeTarget}</h3>
          {hasCurve ? (
            <ReliabilityDiagram
              target={activeTarget}
              raw={rawBins}
              platt={plattBins}
              highlightIndex={inspectedBin}
            />
          ) : (
            <p className="ct-note">{TRUST_COPY.calibrationCurveMissing}</p>
          )}

          {hasCurve && (
            <div className="ct-inspect" data-testid="bin-inspector">
              <h4 className="ct-inspect__heading">{TRUST_COPY.binInspectHeading}</h4>
              <label
                className="ct-inspect__label"
                htmlFor={`bin-inspect-${activeTarget}`}
              >
                {TRUST_COPY.binInspectLabel}
              </label>
              <select
                id={`bin-inspect-${activeTarget}`}
                className="ct-inspect__select"
                data-testid="bin-inspect-select"
                value={inspectedBin ?? 0}
                onChange={(event) => setInspectedBin(Number(event.target.value))}
              >
                {binOptions.map((bin, index) => (
                  <option key={`${bin.binLower}-${bin.binUpper}`} value={index}>
                    {formatPercent(bin.binLower, 0)}–{formatPercent(bin.binUpper, 0)}
                  </option>
                ))}
              </select>
              <p className="ct-note">{TRUST_COPY.binInspectHint}</p>
              <p
                className="ct-inspect__readout ct-num"
                aria-live="polite"
                data-testid="bin-inspect-readout"
              >
                {rawBin ? (
                  <>
                    {TRUST_COPY.binRawLabel} · {formatPercent(rawBin.binLower, 0)}–
                    {formatPercent(rawBin.binUpper, 0)} · mean estimated{" "}
                    {formatPercent(rawBin.meanPredicted)} · observed{" "}
                    {formatPercent(rawBin.fractionPositive)} · n {formatCount(rawBin.count)}
                  </>
                ) : (
                  NOT_PROVIDED
                )}
              </p>
              <p className="ct-inspect__readout ct-num" data-testid="bin-inspect-readout-platt">
                {plattBin ? (
                  <>
                    {TRUST_COPY.binPlattLabel} · {formatPercent(plattBin.binLower, 0)}–
                    {formatPercent(plattBin.binUpper, 0)} · mean estimated{" "}
                    {formatPercent(plattBin.meanPredicted)} · observed{" "}
                    {formatPercent(plattBin.fractionPositive)} · n {formatCount(plattBin.count)}
                  </>
                ) : (
                  NOT_PROVIDED
                )}
              </p>
            </div>
          )}

          {hasCurve && (
            <details className="ct-details">
              <summary>Show exact bin values</summary>
              <p className="ct-note">{TRUST_COPY.calibrationBinsSummary}</p>
              <BinTable caption={`Raw bins · ${activeTarget}`} rows={rawBins} />
              <BinTable caption={`Platt bins · ${activeTarget}`} rows={plattBins} />
            </details>
          )}
        </>
      )}
    </PaneShell>
  );
}
