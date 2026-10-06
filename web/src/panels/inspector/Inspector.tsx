import { useState, type KeyboardEvent } from "react";
import type { ExploreInspectorProps } from "../../explore/types";
import * as C from "./copy";
import {
  buildInspectorViewModel,
  initialInspectorLocal,
  nextTab,
  type AttributionRowVm,
  type InspectorLocal,
  type InspectorViewModel,
  type LocalSink,
  type MeasurementGroupVm,
  type MeasurementRowVm,
  type TargetRowVm
} from "./model";
import { Readout } from "./readout";
import "./Inspector.css";

/**
 * P6-INSPECTOR-R3 — the Inspector panel (Implementation_Plan P6 steps 10-13,
 * `C-08` 8.5, Final_demo 4.2/4.6).
 *
 * A thin, prop-driven view over `buildInspectorViewModel`: this file renders,
 * it never derives. Every number, label, threshold, decision, reliability,
 * range and cohort position arrives already assembled from the Registry and
 * the C-08 payloads; the one renderer it may use for a model response is
 * `./readout`, which re-exports the product's single readout component.
 *
 * State is local presentation only (which tab, which modality is expanded,
 * the in-progress edit text) and every case change travels out through the
 * frozen callbacks — this file imports no store, no engine and no artifact.
 */

type ViewProps = {
  props: ExploreInspectorProps;
  local: InspectorLocal;
  onLocal: (patch: Partial<InspectorLocal>) => void;
};

/* ------------------------------------------------------------------ *
 * Shared bits
 * ------------------------------------------------------------------ */

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="ct-ins-empty" data-state="empty">
      <p className="ct-ins-empty-title">{title}</p>
      <p className="ct-ins-empty-body">{body}</p>
    </div>
  );
}

function StatusLine({ status }: { status: InspectorViewModel["status"] }) {
  if (status.text === null) return null;
  return (
    <p className="ct-ins-status" role="status" data-tone={status.tone ?? "info"}>
      {status.text}
    </p>
  );
}

function DirectionTag({ direction }: { direction: NonNullable<AttributionRowVm["direction"]> }) {
  return (
    <span className="ct-ins-dir">
      <span className="ct-ins-dir-glyph" aria-hidden="true">
        {C.DIRECTION_GLYPH[direction]}
      </span>
      <span className="ct-ins-dir-word">{C.DIRECTION_WORD[direction]}</span>
    </span>
  );
}

/**
 * One attribution row. An unobserved row carries no number and no bar at all —
 * only the approved not-provided note (INV-14).
 */
function AttrRow({ row }: { row: AttributionRowVm }) {
  const bar = row.observed ? (
    <span className="ct-ins-bar">
      <span className="ct-ins-bar-fill" style={{ width: `${row.barPercent ?? 0}%` }} />
    </span>
  ) : (
    <span className="ct-ins-bar ct-ins-bar--none" aria-hidden="true" />
  );

  const content = (
    <>
      <span className="ct-ins-attr-label">{row.label}</span>
      {row.subLabel === null ? null : <span className="ct-ins-attr-sub">{row.subLabel}</span>}
      <span className="ct-ins-attr-track" aria-hidden="true">
        {bar}
      </span>
      <span className="ct-ins-attr-value">
        {row.observed ? row.signed : C.NOT_PROVIDED_LABEL}
      </span>
      {row.direction === null ? null : <DirectionTag direction={row.direction} />}
      {row.note === null ? null : <span className="ct-ins-attr-note">{row.note}</span>}
    </>
  );

  const shared = "ct-ins-attr-row";

  if (row.expandable && row.onSelect !== null) {
    return (
      <li
        className={shared}
        data-observed={row.observed ? "yes" : "no"}
        data-attribution-key={row.key}
      >
        <button type="button" className="ct-ins-attr-btn" aria-expanded={row.expanded} onClick={row.onSelect}>
          {content}
        </button>
      </li>
    );
  }
  if (row.onSelect !== null) {
    return (
      <li
        className={shared}
        data-observed={row.observed ? "yes" : "no"}
        data-attribution-key={row.key}
      >
        <button type="button" className="ct-ins-attr-btn" aria-pressed={row.expanded} onClick={row.onSelect}>
          {content}
        </button>
      </li>
    );
  }
  return (
    <li
      className={shared}
      data-observed={row.observed ? "yes" : "no"}
      data-attribution-key={row.key}
    >
      <div className="ct-ins-attr-row-static">{content}</div>
    </li>
  );
}

function AttributionList({ rows, label }: { rows: AttributionRowVm[]; label: string }) {
  return (
    <ul className="ct-ins-attrs" aria-label={label}>
      {rows.map((row) => (
        <AttrRow key={row.key} row={row} />
      ))}
    </ul>
  );
}

function MarginBlock({ row, where }: { row: { label: string; margin: number }; where: string }) {
  return (
    <p className="ct-ins-margin" data-margin={where}>
      <span className="ct-ins-margin-label">{row.label}</span>
      <span className="ct-ins-margin-value">{C.signedContribution(row.margin)}</span>
    </p>
  );
}

/* ------------------------------------------------------------------ *
 * Case depth
 * ------------------------------------------------------------------ */

function TargetRow({ row }: { row: TargetRowVm }) {
  return (
    <li className="ct-ins-target" data-target-id={row.targetId} data-hovered={row.hovered ? "yes" : "no"}>
      <div className="ct-ins-target-readout">
        {row.readout === null ? (
          <EmptyState title={C.EMPTY_EVALUATION_TITLE} body={C.EMPTY_EVALUATION_BODY} />
        ) : (
          <Readout {...row.readout} />
        )}
      </div>
      <button
        type="button"
        className="ct-ins-btn"
        aria-pressed={row.selected}
        onClick={row.onSelect}
        onPointerEnter={() => row.onHover(true)}
        onPointerLeave={() => row.onHover(false)}
        onFocus={() => row.onHover(true)}
        onBlur={() => row.onHover(false)}
      >
        {C.inspectAction(row.label)}
      </button>
    </li>
  );
}

function CaseDepth({ vm }: { vm: InspectorViewModel }) {
  return (
    <>
      <h2 className="ct-ins-h2">{C.CASE_HEADING}</h2>
      <p className="ct-ins-hint">{C.CASE_HINT}</p>

      {vm.headline === null ? null : (
        <div className="ct-ins-headline" data-headline="cad">
          <Readout {...vm.headline} />
        </div>
      )}

      <section className="ct-ins-sec" aria-labelledby="ct-ins-targets-h">
        <h3 className="ct-ins-h3" id="ct-ins-targets-h">
          {C.TARGETS_HEADING}
        </h3>
        <ul className="ct-ins-targets">
          {vm.targetRows.map((row) => (
            <TargetRow key={row.targetId} row={row} />
          ))}
        </ul>
      </section>

      <section className="ct-ins-sec" aria-labelledby="ct-ins-mod-h">
        <h3 className="ct-ins-h3" id="ct-ins-mod-h">
          {C.MODALITY_HEADING}
        </h3>
        <p className="ct-ins-summary" data-observed-summary>
          {vm.observedSummary}
        </p>
        <ul className="ct-ins-mods">
          {vm.modalityRows.map((row) => (
            <li
              key={row.modalityId}
              className="ct-ins-mod"
              data-modality={row.modalityId}
              data-provided={row.provided ? "yes" : "no"}
            >
              <span className="ct-ins-mod-label">{row.label}</span>
              <span className="ct-ins-mod-count">{`${row.observedCount} / ${row.total}`}</span>
              <span className="ct-ins-mod-state">
                {row.provided ? C.PROVIDED_LABEL : C.NOT_PROVIDED_LABEL}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="ct-ins-sec" aria-labelledby="ct-ins-top-h">
        <h3 className="ct-ins-h3" id="ct-ins-top-h">
          {C.TOP_REASONS_HEADING}
        </h3>
        {vm.topReasons === null ? (
          <EmptyState title={C.EMPTY_EXPLANATION_TITLE} body={C.EMPTY_EXPLANATION_BODY} />
        ) : vm.topReasons.length === 0 ? (
          <EmptyState title={C.NO_EVIDENCE_TITLE} body={C.NO_EVIDENCE_BODY} />
        ) : (
          <AttributionList rows={vm.topReasons} label={C.TOP_REASONS_HEADING} />
        )}
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Target depth — Why view
 * ------------------------------------------------------------------ */

function WhyView({ vm }: { vm: InspectorViewModel }) {
  const why = vm.why;
  if (why === null) {
    return <EmptyState title={C.EMPTY_EXPLANATION_TITLE} body={C.EMPTY_EXPLANATION_BODY} />;
  }
  if (!why.hasEvidence) {
    return <EmptyState title={C.NO_EVIDENCE_TITLE} body={C.NO_EVIDENCE_BODY} />;
  }

  return (
    <div className="ct-ins-why" data-view="why" data-template-id={why.templateId ?? undefined}>
      <h3 className="ct-visually-hidden">{C.WHY_HEADING}</h3>
      <p className="ct-ins-intro">{C.WHY_INTRO}</p>

      <MarginBlock row={why.referenceRow} where="reference" />

      <h4 className="ct-ins-h4">{C.DISPLAY_GROUPS_HEADING}</h4>
      <AttributionList rows={why.groupRows} label={C.DISPLAY_GROUPS_HEADING} />

      <h4 className="ct-ins-h4">{C.MODALITY_ROWS_HEADING}</h4>
      <AttributionList rows={why.modalityRows} label={C.MODALITY_ROWS_HEADING} />

      {why.featureRows.length > 0 ? (
        <>
          <h4 className="ct-ins-h4">{C.FEATURE_ROWS_HEADING}</h4>
          <p className="ct-ins-sub">{why.expandedModalityLabel}</p>
          <AttributionList rows={why.featureRows} label={C.FEATURE_ROWS_HEADING} />
        </>
      ) : null}

      <MarginBlock row={why.outputRow} where="output" />
      <p className="ct-ins-note">{C.MARGIN_NOTE}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Target depth — Measurements view
 * ------------------------------------------------------------------ */

function MeasurementRowView({ row }: { row: MeasurementRowVm }) {
  return (
    <tr
      data-feature-id={row.featureId}
      data-observed={row.observed ? "yes" : "no"}
      data-selected={row.selected ? "yes" : "no"}
    >
      <th scope="row" className="ct-ins-th">
        <button type="button" className="ct-ins-link" aria-pressed={row.selected} onClick={row.onSelect}>
          {row.label}
        </button>
      </th>
      <td data-col="value">
        <span className="ct-ins-value">{row.valueText}</span>
        {row.unitText === null ? null : <span className="ct-ins-unit">{row.unitText}</span>}
        {row.rangeNote === null ? null : <span className="ct-ins-note">{row.rangeNote}</span>}
      </td>
      <td data-col="cohort">{row.cohortText}</td>
      <td data-col="attribution" className="ct-ins-num">
        {row.signed}
      </td>
      <td data-col="direction">
        {row.direction === null ? null : <DirectionTag direction={row.direction} />}
      </td>
    </tr>
  );
}

function MeasurementGroupView({ group }: { group: MeasurementGroupVm }) {
  return (
    <tbody data-modality={group.modalityId} data-provided={group.provided ? "yes" : "no"}>
      <tr
        className="ct-ins-group"
        data-modality-group={group.modalityId}
        data-provided={group.provided ? "yes" : "no"}
      >
        <th scope="colgroup" colSpan={5} className="ct-ins-group-th">
          <span className="ct-visually-hidden">{`${C.COL_MODALITY}: `}</span>
          <span className="ct-ins-group-label">{group.label}</span>
          <span className="ct-ins-group-count">{`${group.observedCount} / ${group.total}`}</span>
          <span className="ct-ins-group-state">
            {group.provided ? C.PROVIDED_LABEL : C.NOT_PROVIDED_LABEL}
          </span>
          {group.provided ? null : <span className="ct-ins-attr-note">{C.NOT_PROVIDED_NOTE}</span>}
        </th>
      </tr>
      {group.rows.map((row) => (
        <MeasurementRowView key={row.featureId} row={row} />
      ))}
    </tbody>
  );
}

function MeasurementsView({ vm }: { vm: InspectorViewModel }) {
  if (vm.measurementGroups === null) {
    return <EmptyState title={C.EMPTY_EXPLANATION_TITLE} body={C.EMPTY_EXPLANATION_BODY} />;
  }
  if (vm.measurementGroups.every((group) => group.observedCount === 0)) {
    return <EmptyState title={C.NO_EVIDENCE_TITLE} body={C.NO_EVIDENCE_BODY} />;
  }
  return (
    <div className="ct-ins-measure" data-view="measurements">
      <h3 className="ct-visually-hidden">{C.MEASUREMENTS_HEADING}</h3>
      <p className="ct-ins-intro">{C.MEASUREMENTS_INTRO}</p>
      <div className="ct-ins-tablewrap">
        <table className="ct-ins-table">
          <caption className="ct-visually-hidden">{C.MEASUREMENTS_HEADING}</caption>
          <thead>
            <tr>
              <th scope="col">{C.COL_FEATURE}</th>
              <th scope="col">{C.COL_VALUE}</th>
              <th scope="col">{C.COL_COHORT}</th>
              <th scope="col">{C.COL_ATTRIBUTION}</th>
              <th scope="col">{C.COL_DIRECTION}</th>
            </tr>
          </thead>
          {vm.measurementGroups.map((group) => (
            <MeasurementGroupView key={group.modalityId} group={group} />
          ))}
        </table>
      </div>
      {vm.unitNote === null ? null : <p className="ct-ins-foot">{vm.unitNote}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Target depth
 * ------------------------------------------------------------------ */

function TargetDepth({
  vm,
  local,
  onLocal,
  onBack
}: {
  vm: InspectorViewModel;
  local: InspectorLocal;
  onLocal: (patch: Partial<InspectorLocal>) => void;
  onBack: () => void;
}) {
  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const moved = nextTab(local.tab, event.key);
    if (moved === null) return;
    event.preventDefault();
    onLocal({ tab: moved });
  };

  return (
    <>
      <nav className="ct-ins-crumb" aria-label={C.LOCATION_LABEL}>
        <button type="button" className="ct-ins-link" onClick={onBack}>
          {C.CASE_HEADING}
        </button>
        <span className="ct-ins-crumb-sep" aria-hidden="true">
          {"›"}
        </span>
        <span className="ct-ins-crumb-current" aria-current="page">
          {vm.targetLabel}
        </span>
      </nav>

      <h2 className="ct-ins-h2">{vm.targetLabel}</h2>
      <p className="ct-ins-hint">{vm.breadcrumb.definition}</p>

      {vm.readout === null ? (
        <EmptyState title={C.EMPTY_EVALUATION_TITLE} body={C.EMPTY_EVALUATION_BODY} />
      ) : (
        <div className="ct-ins-headline" data-headline="target">
          <Readout {...vm.readout} />
        </div>
      )}

      <div className="ct-ins-tabs" role="tablist" aria-label={C.VIEWS_LABEL} onKeyDown={onTabKeyDown}>
        {vm.tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`ct-ins-tab-${tab.id}`}
            aria-controls={`ct-ins-panel-${tab.id}`}
            aria-selected={tab.selected}
            tabIndex={tab.tabIndex}
            className="ct-ins-tab"
            onClick={() => onLocal({ tab: tab.id })}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`ct-ins-panel-${vm.tab}`}
        aria-labelledby={`ct-ins-tab-${vm.tab}`}
        tabIndex={0}
        className="ct-ins-panel"
      >
        {vm.tab === "why" ? <WhyView vm={vm} /> : <MeasurementsView vm={vm} />}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Feature focus (Depth 2)
 * ------------------------------------------------------------------ */

function FocusEditor({ focus }: { focus: NonNullable<InspectorViewModel["focus"]> }) {
  const messageId = `${focus.controlId}-messages`;

  const control = (() => {
    const vm = focus.control;
    if (vm.kind === "number") {
      return (
        <input
          id={focus.controlId}
          className="ct-ins-input"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={focus.displayValue}
          aria-invalid={focus.invalid}
          aria-describedby={messageId}
          onChange={(event) => focus.onDraft(event.target.value)}
        />
      );
    }
    if (vm.kind === "checkbox") {
      return (
        <label className="ct-ins-check" htmlFor={focus.controlId}>
          <input
            id={focus.controlId}
            className="ct-ins-checkbox"
            type="checkbox"
            checked={vm.checked}
            aria-describedby={messageId}
            onChange={(event) => focus.onToggle(event.target.checked)}
          />
          <span>{focus.label}</span>
        </label>
      );
    }
    if (vm.kind === "select") {
      return (
        <select
          id={focus.controlId}
          className="ct-ins-input ct-ins-select"
          value={vm.value}
          aria-describedby={messageId}
          onChange={(event) => focus.onChoose(event.target.value)}
        >
          <option value="" data-role="select-placeholder">
            {focus.observed ? C.UNKNOWN_OPTION_TEXT : C.NOT_PROVIDED_LABEL}
          </option>
          {vm.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }
    return (
      <fieldset className="ct-ins-radio-group">
        <legend className="ct-visually-hidden">{focus.label}</legend>
        {vm.options.map((option) => (
          <label className="ct-ins-check" key={option.value} htmlFor={`${focus.controlId}-${option.value}`}>
            <input
              id={`${focus.controlId}-${option.value}`}
              className="ct-ins-radio"
              type="radio"
              name={focus.controlId}
              value={option.value}
              checked={vm.value === option.value}
              aria-describedby={messageId}
              onChange={() => focus.onChoose(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>
    );
  })();

  return (
    <section
      className="ct-ins-focus"
      aria-label={C.FOCUS_HEADING}
      data-feature-focus={focus.featureId}
      data-control={focus.controlKind}
      data-observed={focus.observed ? "yes" : "no"}
    >
      <div className="ct-ins-focus-head">
        <h3 className="ct-ins-h3">{C.FOCUS_HEADING}</h3>
        <button type="button" className="ct-ins-link" onClick={focus.onClose}>
          {C.CLOSE_ACTION}
        </button>
      </div>
      <p className="ct-ins-sub">
        <span className="ct-ins-focus-label">{focus.label}</span>
        <span className="ct-ins-focus-modality">{focus.modalityLabel}</span>
      </p>
      <p className="ct-ins-hint">{C.FOCUS_HINT}</p>

      {focus.observed ? null : <p className="ct-ins-attr-note">{C.NOT_PROVIDED_NOTE}</p>}

      <div className="ct-ins-field">
        <label className="ct-ins-field-label" htmlFor={focus.controlId}>
          {focus.label}
        </label>
        {control}
      </div>

      <p className="ct-ins-message" id={messageId} role="status">
        {focus.message}
      </p>
      {focus.rangeNote === null ? null : <p className="ct-ins-note">{focus.rangeNote}</p>}

      <div className="ct-ins-focus-actions">
        {focus.control.kind === "number" ? (
          <button type="button" className="ct-ins-btn" onClick={focus.onApply}>
            {C.APPLY_ACTION}
          </button>
        ) : null}
        <button type="button" className="ct-ins-link" onClick={focus.onCancel}>
          {C.CANCEL_ACTION}
        </button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Panel
 * ------------------------------------------------------------------ */

export function InspectorView({ props, local, onLocal }: ViewProps) {
  const sink: LocalSink = { update: onLocal };
  const vm = buildInspectorViewModel(props, local, sink);

  return (
    <section className="ct-ins" aria-label={vm.label} data-inspector-depth={vm.depth}>
      <StatusLine status={vm.status} />

      {vm.empty !== null ? <EmptyState title={vm.empty.title} body={vm.empty.body} /> : null}

      {vm.depth === "case" ? <CaseDepth vm={vm} /> : null}

      {vm.depth === "target" ? (
        <TargetDepth
          vm={vm}
          local={local}
          onLocal={onLocal}
          onBack={() => props.onSelectTarget(null)}
        />
      ) : null}

      {vm.focus === null ? null : <FocusEditor focus={vm.focus} />}

      {vm.caveats.length === 0 ? null : (
        <section className="ct-ins-sec ct-ins-caveats" aria-labelledby="ct-ins-caveats-h">
          <h3 className="ct-ins-h3" id="ct-ins-caveats-h">
            {C.CAVEATS_HEADING}
          </h3>
          <ul className="ct-ins-caveat-list">
            {vm.caveats.map((text) => (
              <li key={text} className="ct-ins-caveat">
                {text}
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}

export function Inspector(props: ExploreInspectorProps) {
  const [local, setLocal] = useState<InspectorLocal>(initialInspectorLocal);
  const onLocal = (patch: Partial<InspectorLocal>) =>
    setLocal((previous) => ({ ...previous, ...patch }));
  return <InspectorView props={props} local={local} onLocal={onLocal} />;
}
