/**
 * Horizontal bar rows for the Trust panes (Final_demo §5: "grouped bars" for
 * subgroups, "horizontal bars per pipeline" for the leakage audit).
 *
 * Presentation only: every bar length, interval whisker and label is an
 * artifact prop mapped through an axis scale (Contracts §9 L424 — axis scale
 * and marker position are derivations the UI MAY make; the metric is never
 * computed here). The numeric text next to each bar is the artifact value,
 * formatted verbatim, so colour is never the only channel.
 */

import { probabilityScale } from "./chart";
import { NOT_PROVIDED, formatCount, formatInterval, formatMetric } from "./format";

export type BarItem = {
  key: string;
  /** Full text identity (rendered as the row's visible label). */
  label: string;
  /** Short qualifier rendered next to the label (e.g. target, metric name). */
  badge?: string | null;
  value: number | null;
  ci?: readonly [number, number] | null;
  n?: number | null;
  /** Optional caveat marker text (e.g. "wide uncertainty"). */
  note?: string | null;
  noteTitle?: string | null;
};

export type BarListProps = {
  items: ReadonlyArray<BarItem>;
  caption: string;
  testId?: string;
};

const WIDTH_SCALE = probabilityScale([0, 100]);

function pct(value: number): number {
  const scaled = WIDTH_SCALE(value);
  if (scaled < 0) return 0;
  if (scaled > 100) return 100;
  return scaled;
}

export function BarList({ items, caption, testId = "bar-list" }: BarListProps) {
  return (
    <div className="ct-bars">
      <p className="ct-note">{caption}</p>
      <ul className="ct-bars__list" data-testid={testId}>
        {items.map((item) => {
          const rawValue = item.value;
          const hasValue = typeof rawValue === "number" && Number.isFinite(rawValue);
          const valueText = formatMetric(item.value);
          const intervalText = formatInterval(item.ci ?? null);
          const left = hasValue ? pct(rawValue) : 0;
          const whisker =
            item.ci != null && intervalText !== NOT_PROVIDED
              ? {
                  left: pct(item.ci[0]),
                  width: Math.max(pct(item.ci[1]) - pct(item.ci[0]), 0)
                }
              : null;
          return (
            <li key={item.key} className="ct-bars__row">
              <span className="ct-bars__label">
                {item.label}
                {item.badge ? <span className="ct-bars__badge"> {item.badge}</span> : null}
                {item.note ? (
                  <span className="ct-bars__note" title={item.noteTitle ?? undefined}>
                    {" "}
                    [{item.note}]
                  </span>
                ) : null}
              </span>
              <span className="ct-bars__track" aria-hidden="true">
                {hasValue && <span className="ct-bars__fill" style={{ width: `${left}%` }} />}
                {whisker && (
                  <span
                    className="ct-bars__whisker"
                    style={{ left: `${whisker.left}%`, width: `${whisker.width}%` }}
                  />
                )}
              </span>
              <span className="ct-bars__value ct-num">
                {valueText}
                {intervalText !== NOT_PROVIDED ? ` ${intervalText}` : ""}
                {item.n != null ? ` · n ${formatCount(item.n)}` : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
