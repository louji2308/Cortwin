/**
 * Trust → Subgroups pane (Contracts §9 L422): identity, n, metrics and
 * caveats from the precomputed C-04 subgroups array. Rows are sorted for
 * display only; every number is an artifact prop.
 */

import { useState } from "react";
import { BarList } from "./BarList";
import { PaneShell } from "./PaneShell";
import { SegmentedControl } from "./SegmentedControl";
import { TRUST_COPY } from "./copy";
import { NOT_PROVIDED, formatCount, formatGroupIdAsLabel, formatInterval, formatMetric } from "./format";
import { TARGET_IDS, type TargetId, type TrustResults } from "./types";

export type SubgroupsPaneProps = {
  results: TrustResults | null;
  /** Optional row filter: a single target, or "ALL". */
  targetFilter?: TargetId | "ALL";
  onTargetFilterChange?: (filter: TargetId | "ALL") => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: (() => void) | null;
};

type FilterValue = TargetId | "ALL";

const FILTER_OPTIONS: ReadonlyArray<{ value: FilterValue; label: string }> = [
  { value: "ALL", label: "All targets" },
  ...TARGET_IDS.map((id) => ({ value: id as FilterValue, label: id }))
];

function targetOrder(id: TargetId): number {
  const index = TARGET_IDS.indexOf(id);
  return index < 0 ? TARGET_IDS.length : index;
}

export function SubgroupsPane({
  results,
  targetFilter,
  onTargetFilterChange,
  loading,
  error,
  onRetry
}: SubgroupsPaneProps) {
  const [internalFilter, setInternalFilter] = useState<FilterValue>("ALL");
  const activeFilter = targetFilter ?? internalFilter;
  const selectFilter = (next: FilterValue) => {
    setInternalFilter(next);
    onTargetFilterChange?.(next);
  };

  const allRows = results?.subgroups ?? [];
  const rows = allRows
    .filter((row) => activeFilter === "ALL" || row.targetId === activeFilter)
    .slice()
    .sort(
      (a, b) => targetOrder(a.targetId) - targetOrder(b.targetId) || a.groupId.localeCompare(b.groupId)
    );

  return (
    <PaneShell
      title="Subgroups"
      subtitle={TRUST_COPY.subgroupsSubtitle}
      hasData={results != null}
      loading={loading}
      error={error}
      onRetry={onRetry}
    >
      <SegmentedControl
        legend="Filter rows"
        value={activeFilter}
        onChange={selectFilter}
        options={FILTER_OPTIONS}
      />

      {allRows.length === 0 ? (
        <p className="ct-note">{TRUST_COPY.subgroupsEmpty}</p>
      ) : rows.length === 0 ? (
        <p className="ct-note" data-testid="subgroups-filter-empty">
          {TRUST_COPY.subgroupsFilterEmpty}
        </p>
      ) : (
        <>
          <div className="ct-scroll">
            <table className="ct-table" data-testid="subgroups-table">
            <caption>{TRUST_COPY.subgroupsCaption}</caption>
            <thead>
              <tr>
                <th scope="col">Target</th>
                <th scope="col">Group</th>
                <th scope="col">n</th>
                <th scope="col">ROC-AUC</th>
                <th scope="col">ROC-AUC 95% interval</th>
                <th scope="col">Caveat</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const label = row.label ?? formatGroupIdAsLabel(row.groupId);
                const auc = formatMetric(row.rocAuc);
                const interval = formatInterval(row.rocAucCI);
                return (
                  <tr key={`${row.targetId}-${row.groupId}`}>
                    <th scope="row" className="ct-num">
                      {row.targetId}
                    </th>
                    <td>{label}</td>
                    <td className="ct-num">{formatCount(row.n)}</td>
                    <td className={`ct-num${auc === NOT_PROVIDED ? " is-not-provided" : ""}`}>
                      {auc}
                    </td>
                    <td className={`ct-num${interval === NOT_PROVIDED ? " is-not-provided" : ""}`}>
                      {interval}
                    </td>
                    <td>
                      {row.caveat ? (
                        row.caveat
                      ) : (
                        <>
                          <span aria-hidden="true">—</span>
                          <span className="ct-visually-hidden">No caveat for this group.</span>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>

          <h3 className="ct-block-title">{TRUST_COPY.subgroupsBarsHeading}</h3>
          <BarList
            items={rows.map((row) => ({
              key: `${row.targetId}-${row.groupId}`,
              label: `${row.label ?? formatGroupIdAsLabel(row.groupId)}`,
              badge: row.targetId,
              value: row.rocAuc,
              ci: row.rocAucCI,
              n: row.n,
              note: row.caveat ? TRUST_COPY.subgroupsCaveatBadge : null,
              noteTitle: row.caveat ?? null
            }))}
            caption={TRUST_COPY.subgroupsBarsCaption}
            testId="subgroups-bars"
          />
        </>
      )}

      <p className="ct-note">{TRUST_COPY.subgroupsCustomSubsetNote}</p>
    </PaneShell>
  );
}
