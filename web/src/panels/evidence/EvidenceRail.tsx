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
.ct-ev { display: flex; flex-direction: column; gap: 12px; padding: 16px; border: 1px solid #cbd5e1; border-radius: 12px; background: #ffffff; color: #0f172a; font-family: inherit; line-height: 1.45; }
.ct-ev-head { display: flex; flex-direction: column; gap: 8px; }
.ct-ev-title { margin: 0; font-size: 1.05rem; font-weight: 700; }
.ct-ev-caveat { margin: 0; padding: 8px 12px; border-left: 4px solid #475569; background: #f1f5f9; color: #1e293b; font-size: 0.9rem; }
.ct-ev-warning { margin: 0; padding: 8px 12px; border: 1px solid #b45309; border-radius: 8px; background: #fef3c7; color: #713f12; font-size: 0.9rem; }
.ct-ev-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.ct-ev-buildup { min-height: 44px; min-width: 44px; padding: 8px 16px; border: 1px solid #1d4ed8; border-radius: 8px; background: #1d4ed8; color: #ffffff; font: inherit; font-weight: 600; display: inline-flex; align-items: center; gap: 8px; cursor: pointer; transition: background-color 300ms ease-out, border-color 300ms ease-out; }
.ct-ev-buildup:hover:not(:disabled) { background: #1e40af; border-color: #1e40af; }
.ct-ev-buildup[data-state=playing] { background: #e2e8f0; border-color: #334155; color: #0f172a; }
.ct-ev-buildup:disabled { background: #f1f5f9; border-color: #cbd5e1; color: #475569; cursor: not-allowed; }
.ct-ev-buildup:focus-visible { outline: 3px solid #111827; outline-offset: 2px; }
.ct-ev-buildup-status { margin: 0; font-size: 0.9rem; color: #334155; }
.ct-ev-stages { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
.ct-ev-chip { min-height: 44px; min-width: 44px; padding: 6px 14px; border: 2px solid #cbd5e1; border-radius: 999px; background: #ffffff; color: #0f172a; font: inherit; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; transition: background-color 300ms ease-out, border-color 300ms ease-out; }
.ct-ev-chip:hover { background: #f1f5f9; }
.ct-ev-chip[aria-current=step] { background: #dbeafe; border-color: #1e3a8a; color: #1e3a8a; font-weight: 700; }
.ct-ev-chip:focus-visible { outline: 3px solid #111827; outline-offset: 2px; }
.ct-ev-chip-state { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #1e3a8a; }
.ct-ev-panel { border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; padding: 12px; }
.ct-ev-panel-title { margin: 0 0 8px; font-size: 0.95rem; display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; }
.ct-ev-panel-pos { color: #475569; font-size: 0.85rem; font-weight: 400; }
.ct-ev-summary { margin: 0 0 8px; font-size: 0.9rem; color: #1e293b; font-weight: 600; }
.ct-ev-mods { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.ct-ev-mod { display: flex; align-items: center; gap: 8px; min-height: 36px; font-size: 0.9rem; }
.ct-ev-mod[data-provided=no] .ct-ev-mod-label { color: #475569; }
.ct-ev-mod-state { margin-left: auto; color: #334155; font-size: 0.85rem; }
.ct-ev-empty { margin: 0; padding: 12px; border: 1px dashed #94a3b8; border-radius: 8px; background: #f8fafc; color: #334155; font-size: 0.9rem; }
.ct-ev-empty-title { margin: 0 0 4px; font-weight: 700; color: #0f172a; }
.ct-ev-empty-body { margin: 0; }
.ct-ev-visually-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
@media (prefers-reduced-motion: reduce) { .ct-ev *, .ct-ev *::before, .ct-ev *::after { transition: none !important; animation: none !important; } }
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
