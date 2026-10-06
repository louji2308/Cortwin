/**
 * Trust → Performance pane (Contracts §9 L419): Accuracy, Precision, Recall,
 * F1, ROC-AUC, CI, majority baseline and reliability tier — every value read
 * from the C-04-shaped `results` props, formatted only.
 */

import { useState } from "react";
import { PaneShell } from "./PaneShell";
import { SegmentedControl } from "./SegmentedControl";
import { TRUST_COPY } from "./copy";
import {
  NOT_PROVIDED,
  formatCount,
  formatFlag,
  formatInterval,
  formatMetric,
  formatTierGlyph
} from "./format";
import { TARGET_IDS, type TargetId, type TrustResults } from "./types";

export type PerformancePaneProps = {
  results: TrustResults | null;
  target?: TargetId;
  onTargetChange?: (target: TargetId) => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: (() => void) | null;
};

function MetricCell({ value }: { value: number | null | undefined }) {
  const text = formatMetric(value);
  return (
    <td className={`ct-num${text === NOT_PROVIDED ? " is-not-provided" : ""}`}>{text}</td>
  );
}

function TierCell({ tier }: { tier: string | undefined }) {
  if (!tier) return <td className="is-not-provided">{NOT_PROVIDED}</td>;
  return (
    <td>
      <span aria-hidden="true">{formatTierGlyph(tier)}</span> {tier}
    </td>
  );
}

export function PerformancePane({
  results,
  target,
  onTargetChange,
  loading,
  error,
  onRetry
}: PerformancePaneProps) {
  const [internalTarget, setInternalTarget] = useState<TargetId>("CAD");
  const activeTarget = target ?? internalTarget;

  const selectTarget = (next: TargetId) => {
    setInternalTarget(next);
    onTargetChange?.(next);
  };

  const performanceByTarget = results?.performance;
  const reliabilityTargets = results?.reliability?.targets;
  const reliabilityRule = results?.reliability?.rule;
  const protocol = results?.protocol;
  const provenanceNotes = results?.provenance?.notes;

  return (
    <PaneShell
      title="Performance"
      subtitle={TRUST_COPY.performanceSubtitle}
      hasData={results != null}
      loading={loading}
      error={error}
      onRetry={onRetry}
    >
      <SegmentedControl
        legend="Highlight target"
        value={activeTarget}
        onChange={selectTarget}
        options={TARGET_IDS.map((id) => ({ value: id, label: id }))}
      />

      <h3 className="ct-block-title">{TRUST_COPY.protocolHeading}</h3>
      {protocol ? (
        <dl className="ct-protocol ct-num" aria-label={TRUST_COPY.protocolCaption}>
          <div>
            <dt>Patients</dt>
            <dd>{formatCount(protocol.patientCount)}</dd>
          </div>
          <div>
            <dt>Features</dt>
            <dd>{formatCount(protocol.featureCount)}</dd>
          </div>
          <div>
            <dt>Outer validation</dt>
            <dd>
              {formatCount(protocol.outerFolds)} folds × {formatCount(protocol.outerRepeats)}{" "}
              repeats
            </dd>
          </div>
          <div>
            <dt>Inner folds</dt>
            <dd>{formatCount(protocol.innerFolds)}</dd>
          </div>
          <div>
            <dt>No SMOTE</dt>
            <dd>{formatFlag(protocol.noSmote)}</dd>
          </div>
          <div>
            <dt>Preprocessing inside fold</dt>
            <dd>{formatFlag(protocol.preprocessingInsideFold)}</dd>
          </div>
          <div>
            <dt>Calibration inside fold</dt>
            <dd>{formatFlag(protocol.calibrationInsideFold)}</dd>
          </div>
          <div>
            <dt>Threshold inside fold</dt>
            <dd>{formatFlag(protocol.thresholdInsideFold)}</dd>
          </div>
          <div>
            <dt>Abstention inside fold</dt>
            <dd>{formatFlag(protocol.abstentionInsideFold)}</dd>
          </div>
          <div>
            <dt>{TRUST_COPY.protocolCiMethodLabel}</dt>
            <dd className={protocol.ciMethod == null ? "is-not-provided" : undefined}>
              {protocol.ciMethod ?? NOT_PROVIDED}
            </dd>
          </div>
          <div>
            <dt>{TRUST_COPY.protocolStratificationLabel}</dt>
            <dd className={protocol.stratification == null ? "is-not-provided" : undefined}>
              {protocol.stratification ?? NOT_PROVIDED}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="ct-note">{TRUST_COPY.protocolMissing}</p>
      )}

      <div className="ct-scroll">
        <table className="ct-table" data-testid="performance-table">
          <caption>{TRUST_COPY.performanceTableCaption}</caption>
          <thead>
            <tr>
              <th scope="col">Target</th>
              <th scope="col">Accuracy</th>
              <th scope="col">Precision</th>
              <th scope="col">Recall</th>
              <th scope="col">F1</th>
              <th scope="col">ROC-AUC</th>
              <th scope="col">ROC-AUC 95% interval</th>
              <th scope="col">Fold AUC mean ± sd</th>
              <th scope="col">Majority baseline</th>
              <th scope="col">Reliability</th>
            </tr>
          </thead>
          <tbody>
            {TARGET_IDS.map((id) => {
              const row = performanceByTarget?.[id];
              const isActive = id === activeTarget;
              const foldPair =
                row && row.foldAucMean != null && row.foldAucSd != null
                  ? `${formatMetric(row.foldAucMean)} ± ${formatMetric(row.foldAucSd)}`
                  : null;
              return (
                <tr key={id} data-active={isActive ? "true" : "false"} aria-current={isActive ? "true" : undefined}>
                  <th scope="row" className="ct-num">
                    {id}
                    {isActive ? <span className="ct-visually-hidden"> (highlighted)</span> : null}
                  </th>
                  {row ? (
                    <>
                      <MetricCell value={row.accuracy} />
                      <MetricCell value={row.precision} />
                      <MetricCell value={row.recall} />
                      <MetricCell value={row.f1} />
                      <MetricCell value={row.rocAuc} />
                      <td className={`ct-num${formatInterval(row.rocAucCI) === NOT_PROVIDED ? " is-not-provided" : ""}`}>
                        {formatInterval(row.rocAucCI)}
                      </td>
                      <td className={`ct-num${foldPair === null ? " is-not-provided" : ""}`}>
                        {foldPair ?? NOT_PROVIDED}
                      </td>
                      <MetricCell value={row.majorityBaseline} />
                      <TierCell tier={reliabilityTargets?.[id]?.tier} />
                    </>
                  ) : (
                    <td colSpan={9} className="is-not-provided">
                      {NOT_PROVIDED}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h3 className="ct-block-title">{TRUST_COPY.reliabilityRuleHeading}</h3>
      {reliabilityRule?.description ? (
        <>
          <p className="ct-note" data-testid="reliability-rule">
            {reliabilityRule.description}
          </p>
          <ul className="ct-list">
            {TARGET_IDS.map((id) => {
              const rationale = reliabilityTargets?.[id]?.rationaleCode;
              return (
                <li key={id} className="ct-list__row ct-num">
                  <span>{id}</span>
                  <span className={rationale == null ? "is-not-provided" : undefined}>
                    {rationale ?? NOT_PROVIDED}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="ct-note">{TRUST_COPY.reliabilityRuleMissing}</p>
      )}

      <details className="ct-disclosure" data-testid="performance-disclosures">
        <summary>{TRUST_COPY.disclosuresHeading}</summary>
        <p className="ct-note">{TRUST_COPY.disclosuresFraming}</p>
        <p className="ct-note">{TRUST_COPY.disclosuresNotesIntro}</p>
        {provenanceNotes != null && provenanceNotes.length > 0 ? (
          <ul className="ct-list">
            {provenanceNotes.map((note, index) => (
              <li key={`${index}:${note.slice(0, 24)}`} className="ct-list__row">
                {note}
              </li>
            ))}
          </ul>
        ) : (
          <p className="ct-note">{TRUST_COPY.disclosuresMissing}</p>
        )}
      </details>
    </PaneShell>
  );
}
