/**
 * Trust → Global Drivers pane: the per-target global driver importance table
 * (mean absolute model attribution per feature) recorded in the results
 * artifact.
 *
 * Presentation only: rows are shown in artifact order (never re-sorted), the
 * top 15 by artifact order are displayed, bar widths come from an axis-scale
 * derivation over the displayed rows, and every value is the artifact number
 * formatted by `formatMetric` — never a percentage (the scale is the margin,
 * recorded in `globalImportanceMeta`) and never recomputed here (C-04 §9 L424,
 * INV-04, AGENTS §7 law 8).
 */

import { useState } from "react";
import { BarList } from "./BarList";
import { PaneShell } from "./PaneShell";
import { SegmentedControl } from "./SegmentedControl";
import { TRUST_COPY } from "./copy";
import { NOT_PROVIDED, formatCount } from "./format";
import {
  TARGET_IDS,
  type GlobalImportanceRow,
  type TargetId,
  type TrustResults
} from "./types";

export type ImportancePaneProps = {
  results: TrustResults | null;
  target?: TargetId;
  onTargetChange?: (target: TargetId) => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: (() => void) | null;
};

/** How many artifact-ordered rows the bar list shows (display budget, not a metric). */
const TOP_ROWS = 15;

function magnitudeDomain(rows: readonly GlobalImportanceRow[]): readonly [number, number] {
  let max = 0;
  for (const row of rows) {
    if (Number.isFinite(row.meanAbsShap) && row.meanAbsShap > max) max = row.meanAbsShap;
  }
  return [0, max > 0 ? max : 1];
}

export function ImportancePane({
  results,
  target,
  onTargetChange,
  loading,
  error,
  onRetry
}: ImportancePaneProps) {
  const [internalTarget, setInternalTarget] = useState<TargetId>("CAD");
  const activeTarget = target ?? internalTarget;

  const selectTarget = (next: TargetId) => {
    setInternalTarget(next);
    onTargetChange?.(next);
  };

  const rows = results?.globalImportance?.[activeTarget] ?? null;
  const meta = results?.globalImportanceMeta ?? null;
  const shown = rows != null && rows.length > 0 ? rows.slice(0, TOP_ROWS) : null;
  const domain = shown == null ? ([0, 1] as const) : magnitudeDomain(shown);

  return (
    <PaneShell
      title="Global Drivers"
      subtitle={TRUST_COPY.importanceSubtitle}
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

      <h3 className="ct-block-title">
        {TRUST_COPY.importanceHeading}{" "}
        <span className="ct-num" data-testid="importance-target">
          {activeTarget}
        </span>
      </h3>
      {shown != null ? (
        <>
          <BarList
            testId="importance-bars"
            caption={TRUST_COPY.importanceBarsCaption}
            items={shown.map((row) => ({
              key: row.feature,
              label: row.feature,
              value: row.meanAbsShap
            }))}
            domain={domain}
            neutralFill
          />
          <p className="ct-note">{TRUST_COPY.importanceNoRecompute}</p>
        </>
      ) : (
        <p className="ct-note" data-testid="importance-missing">
          {TRUST_COPY.importanceMissing}
        </p>
      )}

      <h3 className="ct-block-title">{TRUST_COPY.importanceMetaHeading}</h3>
      {meta ? (
        <dl className="ct-protocol ct-num" data-testid="importance-meta" aria-label={TRUST_COPY.importanceMetaHeading}>
          <div>
            <dt>{TRUST_COPY.importanceMetaMethod}</dt>
            <dd className={meta.method == null ? "is-not-provided" : undefined}>
              {meta.method ?? NOT_PROVIDED}
            </dd>
          </div>
          <div>
            <dt>{TRUST_COPY.importanceMetaScale}</dt>
            <dd className={meta.scale == null ? "is-not-provided" : undefined}>
              {meta.scale ?? NOT_PROVIDED}
            </dd>
          </div>
          <div>
            <dt>{TRUST_COPY.importanceMetaPatients}</dt>
            <dd className={meta.patients == null ? "is-not-provided" : undefined}>
              {meta.patients == null ? NOT_PROVIDED : formatCount(meta.patients)}
            </dd>
          </div>
          <div>
            <dt>{TRUST_COPY.importanceMetaBackground}</dt>
            <dd className={meta.background == null ? "is-not-provided" : undefined}>
              {meta.background ?? NOT_PROVIDED}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="ct-note" data-testid="importance-meta-missing">
          {TRUST_COPY.importanceMetaMissing}
        </p>
      )}
    </PaneShell>
  );
}
