/**
 * Trust → Leakage Audit pane (Contracts §9 L423): probe results shown in a
 * section visually and semantically separate from deployed-model evidence,
 * the excluded-columns list, and the explanation of why an inflated probe
 * result is not evidence of deployed performance. Probe and deployed rows
 * are never merged (C-04 §5.4).
 */

import { useState } from "react";
import { BarList } from "./BarList";
import { PaneShell } from "./PaneShell";
import { SegmentedControl } from "./SegmentedControl";
import { TRUST_COPY } from "./copy";
import { NOT_PROVIDED, formatInterval, formatMetric, formatTierGlyph, probeIdentityLabel } from "./format";
import { TARGET_IDS, type TargetId, type TrustResults } from "./types";

export type LeakagePaneProps = {
  results: TrustResults | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: (() => void) | null;
  /** Optional probe-row filter: a single target scope, or "ALL". */
  targetFilter?: TargetId | "ALL";
  onTargetFilterChange?: (filter: TargetId | "ALL") => void;
};

type ProbeFilterValue = TargetId | "ALL";

const PROBE_FILTER_OPTIONS: ReadonlyArray<{ value: ProbeFilterValue; label: string }> = [
  { value: "ALL", label: "All scopes" },
  ...TARGET_IDS.map((id) => ({ value: id as ProbeFilterValue, label: id }))
];

export function LeakagePane({
  results,
  loading,
  error,
  onRetry,
  targetFilter,
  onTargetFilterChange
}: LeakagePaneProps) {
  const [internalFilter, setInternalFilter] = useState<ProbeFilterValue>("ALL");
  const activeFilter = targetFilter ?? internalFilter;
  const selectFilter = (next: ProbeFilterValue) => {
    setInternalFilter(next);
    onTargetFilterChange?.(next);
  };

  const leakageLab = results?.leakageLab;
  const allProbes = leakageLab?.probes ?? [];
  const probes = allProbes.filter((probe) => activeFilter === "ALL" || probe.targetId === activeFilter);
  const excludedColumns = leakageLab?.excludedColumns ?? [];
  const performanceByTarget = results?.performance;
  const reliabilityTargets = results?.reliability?.targets;

  return (
    <PaneShell
      title="Leakage Audit"
      subtitle={TRUST_COPY.leakageSubtitle}
      hasData={results != null}
      loading={loading}
      error={error}
      onRetry={onRetry}
    >
      <div className="ct-callout">
        <h3>{TRUST_COPY.leakageHowToReadHeading}</h3>
        <p>{TRUST_COPY.leakageExplanation}</p>
      </div>

      <section
        className="ct-leak ct-leak--probe"
        data-section="probe"
        aria-labelledby="leakage-probe-heading"
      >
        <h3 className="ct-leak__heading" id="leakage-probe-heading">
          {TRUST_COPY.leakageProbeHeading}
          <span className="ct-leak__badge">probe model</span>
        </h3>
        <p className="ct-leak__caption">{TRUST_COPY.leakageProbeCaption}</p>
        <SegmentedControl
          legend={TRUST_COPY.leakageScopeLabel}
          value={activeFilter}
          onChange={selectFilter}
          options={PROBE_FILTER_OPTIONS}
        />
        {allProbes.length === 0 ? (
          <p className="ct-note">{TRUST_COPY.leakageProbeEmpty}</p>
        ) : probes.length === 0 ? (
          <p className="ct-note" data-testid="leakage-filter-empty">
            {TRUST_COPY.leakageFilterEmpty}
          </p>
        ) : (
          <>
            <div className="ct-scroll">
              <table className="ct-table" data-testid="leakage-probe-table">
                <caption>{TRUST_COPY.leakageProbeTableCaption}</caption>
                <thead>
                  <tr>
                    <th scope="col">Probe</th>
                    <th scope="col">Scope</th>
                    <th scope="col">Metric</th>
                    <th scope="col">Value</th>
                    <th scope="col">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {probes.map((probe) => (
                    <tr key={probe.probeId} data-probe-id={probe.probeId}>
                      <th scope="row">{probeIdentityLabel(probe.probeId)}</th>
                      <td className="ct-num">{probe.targetId}</td>
                      <td>{probe.metricName}</td>
                      <td className={`ct-num${formatMetric(probe.metricValue) === NOT_PROVIDED ? " is-not-provided" : ""}`}>
                        {formatMetric(probe.metricValue)}
                      </td>
                      <td>{probe.note ?? NOT_PROVIDED}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h4 className="ct-block-title">{TRUST_COPY.leakageBarsHeading}</h4>
            <BarList
              items={probes.map((probe) => ({
                key: probe.probeId,
                label: probeIdentityLabel(probe.probeId),
                badge: probe.metricName,
                value: probe.metricValue,
                note: probe.targetId
              }))}
              caption={TRUST_COPY.leakageBarsCaption}
              testId="leakage-bars"
            />
          </>
        )}
      </section>

      <section
        className="ct-leak ct-leak--deployed"
        data-section="deployed"
        aria-labelledby="leakage-deployed-heading"
      >
        <h3 className="ct-leak__heading" id="leakage-deployed-heading">
          {TRUST_COPY.leakageDeployedHeading}
          <span className="ct-leak__badge">deployed model</span>
        </h3>
        <p className="ct-leak__caption">{TRUST_COPY.leakageDeployedCaption}</p>
        {!performanceByTarget ? (
          <p className="ct-note">{TRUST_COPY.leakageDeployedEmpty}</p>
        ) : (
          <div className="ct-scroll">
            <table className="ct-table" data-testid="leakage-deployed-table">
              <caption>{TRUST_COPY.leakageDeployedTableCaption}</caption>
              <thead>
                <tr>
                  <th scope="col">Target</th>
                  <th scope="col">ROC-AUC</th>
                  <th scope="col">ROC-AUC 95% interval</th>
                  <th scope="col">Majority baseline</th>
                  <th scope="col">Reliability</th>
                </tr>
              </thead>
              <tbody>
                {TARGET_IDS.map((id) => {
                  const row = performanceByTarget[id];
                  const tier = reliabilityTargets?.[id]?.tier;
                  if (!row) {
                    return (
                      <tr key={id}>
                        <th scope="row">{id}</th>
                        <td colSpan={4} className="is-not-provided">
                          {NOT_PROVIDED}
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={id}>
                      <th scope="row" className="ct-num">
                        {id}
                      </th>
                      <td className="ct-num">{formatMetric(row.rocAuc)}</td>
                      <td className="ct-num">{formatInterval(row.rocAucCI)}</td>
                      <td className="ct-num">{formatMetric(row.majorityBaseline)}</td>
                      <td>
                        {tier ? (
                          <>
                            <span aria-hidden="true">{formatTierGlyph(tier)}</span> {tier}
                          </>
                        ) : (
                          NOT_PROVIDED
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <h3 className="ct-block-title">{TRUST_COPY.leakageExcludedHeading}</h3>
      <p className="ct-note">{TRUST_COPY.leakageExcludedNote}</p>
      {excludedColumns.length === 0 ? (
        <p className="ct-note">{TRUST_COPY.leakageExcludedEmpty}</p>
      ) : (
        <ul className="ct-chips" data-testid="leakage-excluded-columns">
          {excludedColumns.map((column) => (
            <li key={column}>{column}</li>
          ))}
        </ul>
      )}
    </PaneShell>
  );
}
