import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  BUILD_UP_LABEL,
  CUSTOM_SUBSET_LABEL,
  CUSTOM_SUBSET_WARNING,
  EMPTY_STAGES_BODY,
  EMPTY_STAGES_TITLE,
  EVIDENCE_RAIL_CAVEAT,
  LADDER_LABEL,
  MODALITIES_LABEL,
  NO_STAGE_SELECTED,
  NOT_PROVIDED_LABEL,
  PANEL_LABEL,
  PROVIDED_LABEL,
  RAIL_TITLE
} from "./copy";
import {
  buildUpControl,
  buildUpStatus,
  indexOfStage,
  modalitySummary,
  nextRovingIndex,
  providedSummaryText,
  resolveSelectedStage,
  stageChipView,
  stagePositionLabel
} from "./helpers";
import type { EvidenceRailProps, EvidenceStage } from "./types";

const RAIL_STYLES = `
.ct-ev { display: flex; flex-direction: column; gap: var(--ct-space-3); padding: var(--ct-space-4); border: var(--ct-border-width) solid var(--ct-color-border); border-radius: var(--ct-radius-lg); background: var(--ct-color-surface-raised); color: var(--ct-color-text); font-family: inherit; line-height: var(--ct-leading-normal); animation: ct-enter-fade var(--ct-duration-enter) var(--ct-ease-out) both; }
.ct-ev-head { display: flex; flex-direction: column; gap: var(--ct-space-2); }
.ct-ev-title { margin: 0; font-size: var(--ct-text-lg); font-weight: 700; color: var(--ct-color-text); }
.ct-ev-caveat { margin: 0; padding: var(--ct-space-2) var(--ct-space-3); border-left: 3px solid var(--ct-color-border-strong); background: var(--ct-color-surface-sunken); color: var(--ct-color-text); font-size: var(--ct-text-md); }
.ct-ev-warning { margin: 0; padding: var(--ct-space-2) var(--ct-space-3); border: var(--ct-border-width) solid var(--ct-color-pop-orange); border-radius: var(--ct-radius-md); background: var(--ct-color-surface); color: var(--ct-color-text); font-size: var(--ct-text-md); }
.ct-ev-warning .ct-ev-glyph { color: var(--ct-color-pop-orange); }
.ct-ev-controls { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ct-space-3); }
.ct-ev-buildup { min-height: 44px; min-width: 44px; padding: var(--ct-space-2) var(--ct-space-4); border: var(--ct-border-width) solid var(--ct-color-action); border-radius: var(--ct-radius-md); background: var(--ct-color-action); color: var(--ct-color-on-accent); font: inherit; font-weight: 600; display: inline-flex; align-items: center; gap: var(--ct-space-2); cursor: pointer; transition: background-color var(--ct-transition-fast), border-color var(--ct-transition-fast); }
.ct-ev-buildup:hover:not(:disabled) { background: var(--ct-color-accent); border-color: var(--ct-color-accent); }
.ct-ev-buildup[data-state=playing] { background: var(--ct-color-accent); border-color: var(--ct-color-accent); color: var(--ct-color-on-accent); }
.ct-ev-buildup:disabled { background: var(--ct-color-surface-sunken); border-color: var(--ct-color-border-strong); color: var(--ct-color-text-muted); cursor: not-allowed; }
.ct-ev-buildup:focus-visible { outline: 3px solid var(--ct-color-focus); outline-offset: 2px; }
.ct-ev-buildup-status { margin: 0; font-size: var(--ct-text-sm); color: var(--ct-color-text-muted); }
.ct-ev-stages { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--ct-space-2); }
.ct-ev-chip { min-height: 44px; min-width: 44px; padding: var(--ct-space-2) var(--ct-space-3); border: 2px solid var(--ct-color-border); border-radius: var(--ct-radius-pill); background: var(--ct-color-surface); color: var(--ct-color-text); font: inherit; display: inline-flex; align-items: center; gap: var(--ct-space-2); cursor: pointer; transition: background-color var(--ct-transition-fast), border-color var(--ct-transition-fast); }
.ct-ev-chip:hover { background: var(--ct-color-surface-raised); border-color: var(--ct-color-border-strong); }
.ct-ev-chip[aria-current=step] { background: var(--ct-color-accent); border-color: var(--ct-color-accent); color: var(--ct-color-on-accent); font-weight: 700; }
.ct-ev-chip:focus-visible { outline: 3px solid var(--ct-color-focus); outline-offset: 2px; }
.ct-ev-chip-state { font-size: var(--ct-text-xs); font-weight: 700; text-transform: uppercase; letter-spacing: var(--ct-letter-spacing-caps); color: inherit; }
/* Ornament only (D-26, mirrors the profile rulers and inspector dots): one
   pop hue per stage id. The current step keeps accent fill + on-accent ink
   for contrast; state words and glyphs always carry the meaning. */
.ct-ev-chip:not([aria-current=step])[data-stage-id=history] .ct-ev-glyph { color: var(--ct-color-pop-sand); }
.ct-ev-chip:not([aria-current=step])[data-stage-id=exam] .ct-ev-glyph { color: var(--ct-color-pop-green); }
.ct-ev-chip:not([aria-current=step])[data-stage-id=ecg] .ct-ev-glyph { color: var(--ct-color-pop-pink); }
.ct-ev-chip:not([aria-current=step])[data-stage-id=labs] .ct-ev-glyph { color: var(--ct-color-pop-blue); }
.ct-ev-chip:not([aria-current=step])[data-stage-id=echo] .ct-ev-glyph { color: var(--ct-color-pop-purple); }
.ct-ev-panel { border: var(--ct-border-width) solid var(--ct-color-border); border-radius: var(--ct-radius-md); background: var(--ct-color-surface); padding: var(--ct-space-3); }
.ct-ev-panel-title { margin: 0 0 var(--ct-space-2); font-size: var(--ct-text-md); display: flex; flex-wrap: wrap; gap: var(--ct-space-2); align-items: baseline; color: var(--ct-color-text); }
.ct-ev-panel-pos { color: var(--ct-color-text-muted); font-size: var(--ct-text-sm); font-weight: 400; }
.ct-ev-summary { margin: 0 0 var(--ct-space-2); font-size: var(--ct-text-md); color: var(--ct-color-text); font-weight: 600; }
.ct-ev-mods { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--ct-space-1); }
.ct-ev-mod { display: flex; align-items: center; gap: var(--ct-space-2); min-height: 36px; font-size: var(--ct-text-md); color: var(--ct-color-text); }
.ct-ev-mod .ct-ev-glyph { color: var(--ct-color-pop-green); }
.ct-ev-mod[data-provided=no] .ct-ev-glyph { color: var(--ct-color-text-muted); }
.ct-ev-mod[data-provided=no] .ct-ev-mod-label { color: var(--ct-color-text-muted); }
.ct-ev-mod-state { margin-left: auto; color: var(--ct-color-text-muted); font-size: var(--ct-text-sm); }
.ct-ev-empty { margin: 0; padding: var(--ct-space-3); border: 1px dashed var(--ct-color-border-strong); border-radius: var(--ct-radius-md); background: var(--ct-color-surface); color: var(--ct-color-text-muted); font-size: var(--ct-text-md); }
.ct-ev-empty-title { margin: 0 0 var(--ct-space-1); font-weight: 700; color: var(--ct-color-text); }
.ct-ev-empty-body { margin: 0; }
.ct-ev-visually-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
@media (prefers-reduced-motion: reduce) { .ct-ev, .ct-ev *, .ct-ev *::before, .ct-ev *::after { transition: none !important; animation: none !important; } }
`;

export function EvidenceRail({
  stages,
  currentStageId,
  customSubset,
  buildUp,
  onSelectStage,
  onBuildUpToggle
}: EvidenceRailProps) {
  const list: readonly EvidenceStage[] = stages;
  const selectedIndex = indexOfStage(list, currentStageId);
  const selected = resolveSelectedStage(list, currentStageId);
  const summary = selected ? modalitySummary(selected.modalities) : null;

  const [focusIdx, setFocusIdx] = useState(-1);
  const chipRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    setFocusIdx(selectedIndex);
  }, [selectedIndex]);

  const activeIdx =
    focusIdx >= 0 && focusIdx < list.length
      ? focusIdx
      : selectedIndex >= 0
        ? selectedIndex
        : 0;

  const control = buildUpControl(buildUp.state, list.length);
  const statusText = buildUpStatus(buildUp.state, list, selectedIndex);

  const handleChipKeyDown = (index: number) => (event: KeyboardEvent<HTMLButtonElement>) => {
    const next = nextRovingIndex(event.key, index, list.length);
    if (next === null) return;
    event.preventDefault();
    setFocusIdx(next);
    const target: HTMLButtonElement | null = chipRefs.current[next] ?? null;
    target?.focus();
  };

  return (
    <section className="ct-ev" aria-label={RAIL_TITLE} data-testid="evidence-rail">
      <style data-ct-ev-styles="" dangerouslySetInnerHTML={{ __html: RAIL_STYLES }} />

      <div className="ct-ev-head">
        <h2 className="ct-ev-title">{RAIL_TITLE}</h2>
        <p className="ct-ev-caveat" data-testid="evidence-caveat">
          {EVIDENCE_RAIL_CAVEAT}
        </p>
      </div>

      {customSubset ? (
        <p className="ct-ev-warning" role="status" data-testid="custom-subset-warning">
          <span className="ct-ev-glyph" aria-hidden="true">
            &#9888;
          </span>{" "}
          <strong>{CUSTOM_SUBSET_LABEL}:</strong> {CUSTOM_SUBSET_WARNING}
        </p>
      ) : null}

      <div className="ct-ev-controls">
        <button
          type="button"
          className="ct-ev-buildup"
          data-state={buildUp.state}
          data-testid="build-up-button"
          disabled={control.disabled}
          aria-busy={control.busy}
          onClick={onBuildUpToggle}
        >
          <span className="ct-ev-glyph" aria-hidden="true">
            {control.glyph}
          </span>
          <span>{BUILD_UP_LABEL}</span>
        </button>
        <p className="ct-ev-buildup-status" data-testid="build-up-status">
          {statusText}
        </p>
      </div>

      {list.length === 0 ? (
        <div className="ct-ev-empty" data-testid="empty-stages">
          <p className="ct-ev-empty-title">
            <span className="ct-ev-glyph" aria-hidden="true">
              &#9675;
            </span>{" "}
            {EMPTY_STAGES_TITLE}
          </p>
          <p className="ct-ev-empty-body">{EMPTY_STAGES_BODY}</p>
        </div>
      ) : (
        <>
          <ol className="ct-ev-stages" aria-label={LADDER_LABEL}>
            {list.map((stage, index) => {
              const view = stageChipView(stage, index, index === selectedIndex, activeIdx);
              return (
                <li key={stage.id} className="ct-ev-stage-item">
                  <button
                    type="button"
                    className="ct-ev-chip"
                    data-testid={`stage-chip-${stage.id}`}
                    data-stage-id={stage.id}
                    aria-current={view.current ? "step" : undefined}
                    tabIndex={view.tabIndex}
                    onClick={() => onSelectStage(stage.id)}
                    onFocus={() => setFocusIdx(index)}
                    onKeyDown={handleChipKeyDown(index)}
                    ref={(element) => {
                      chipRefs.current[index] = element;
                    }}
                  >
                    <span className="ct-ev-glyph" aria-hidden="true">
                      {view.glyph}
                    </span>
                    <span className="ct-ev-chip-label">{view.label}</span>
                    {view.stateText ? (
                      <span className="ct-ev-chip-state">{view.stateText}</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ol>

          <p className="ct-ev-visually-hidden" role="status" data-testid="stage-live">
            {selected
              ? `Selected ${stagePositionLabel(selectedIndex, list.length)}: ${selected.label}.`
              : NO_STAGE_SELECTED}
          </p>

          {selected && summary ? (
            <section className="ct-ev-panel" aria-label={PANEL_LABEL} data-testid="stage-panel">
              <h3 className="ct-ev-panel-title">
                <span className="ct-ev-glyph" aria-hidden="true">
                  &#9656;
                </span>
                <span className="ct-ev-panel-name">{selected.label}</span>
                <span className="ct-ev-panel-pos">
                  {stagePositionLabel(selectedIndex, list.length)}
                </span>
              </h3>
              <p
                className="ct-ev-summary"
                data-testid="provided-summary"
                data-state={
                  summary.total === 0
                    ? "no-modalities"
                    : summary.noneProvided
                      ? "none-provided"
                      : "some-provided"
                }
              >
                {providedSummaryText(summary)}
              </p>
              <ul className="ct-ev-mods" aria-label={MODALITIES_LABEL}>
                {selected.modalities.map((modality) => (
                  <li
                    key={modality.id}
                    className="ct-ev-mod"
                    data-provided={modality.provided ? "yes" : "no"}
                  >
                    <span className="ct-ev-glyph" aria-hidden="true">
                      {modality.provided ? "\u2713" : "\u25CB"}
                    </span>
                    <span className="ct-ev-mod-label">{modality.label}</span>
                    <span className="ct-ev-mod-state">
                      {modality.provided ? PROVIDED_LABEL : NOT_PROVIDED_LABEL}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="ct-ev-empty" data-testid="no-stage-selected">
              {NO_STAGE_SELECTED}
            </p>
          )}
        </>
      )}
    </section>
  );
}
