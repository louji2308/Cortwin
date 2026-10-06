import {
  CURRENT_LABEL,
  DONE_STATUS,
  IDLE_STATUS,
  NO_MODALITIES_SUMMARY,
  NO_STAGES_STATUS,
  NONE_PROVIDED_SUMMARY
} from "./copy";
import type {
  BuildUpControl,
  BuildUpState,
  EvidenceModality,
  EvidenceStage,
  ModalitySummary,
  StageChipView
} from "./types";

export function indexOfStage(
  stages: readonly EvidenceStage[],
  stageId: string | null
): number {
  if (stageId === null) return -1;
  return stages.findIndex((stage) => stage.id === stageId);
}

export function resolveSelectedStage(
  stages: readonly EvidenceStage[],
  stageId: string | null
): EvidenceStage | null {
  const index = indexOfStage(stages, stageId);
  if (index < 0) return null;
  const stage: EvidenceStage | undefined = stages[index];
  return stage ?? null;
}

export function stagePositionLabel(index: number, total: number): string {
  return `Stage ${index + 1} of ${total}`;
}

export function modalitySummary(modalities: readonly EvidenceModality[]): ModalitySummary {
  const total = modalities.length;
  let provided = 0;
  for (const modality of modalities) {
    if (modality.provided) provided += 1;
  }
  return {
    total,
    provided,
    noneProvided: total > 0 && provided === 0,
    allProvided: total > 0 && provided === total
  };
}

export function providedSummaryText(summary: ModalitySummary): string {
  if (summary.total === 0) return NO_MODALITIES_SUMMARY;
  if (summary.noneProvided) return NONE_PROVIDED_SUMMARY;
  return `${summary.provided} of ${summary.total} modalities provided.`;
}

export function rovingTabIndex(activeIndex: number, index: number): 0 | -1 {
  return activeIndex === index ? 0 : -1;
}

export function nextRovingIndex(
  key: string,
  current: number,
  count: number
): number | null {
  if (count <= 0) return null;
  const clamped = Math.min(Math.max(current, 0), count - 1);
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (clamped + 1) % count;
    case "ArrowLeft":
    case "ArrowUp":
      return (clamped - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

const BUILD_UP_GLYPHS: Record<BuildUpState, string> = {
  idle: "\u25B6",
  playing: "\u23F8",
  done: "\u2713"
};

export function buildUpControl(state: BuildUpState, stageCount: number): BuildUpControl {
  const glyph = BUILD_UP_GLYPHS[state];
  if (stageCount <= 0) return { disabled: true, busy: false, glyph };
  if (state === "playing") return { disabled: false, busy: true, glyph };
  if (state === "done") return { disabled: true, busy: false, glyph };
  return { disabled: false, busy: false, glyph };
}

export function buildUpStatus(
  state: BuildUpState,
  stages: readonly EvidenceStage[],
  selectedIndex: number
): string {
  if (stages.length === 0) return NO_STAGES_STATUS;
  if (state === "done") return DONE_STATUS;
  if (state === "playing") {
    const stage: EvidenceStage | undefined = stages[selectedIndex];
    if (stage) return `Playing ${stagePositionLabel(selectedIndex, stages.length)} - ${stage.label}.`;
    return `Playing ${stages.length} stages.`;
  }
  return IDLE_STATUS;
}

export function stageChipView(
  stage: EvidenceStage,
  index: number,
  isSelected: boolean,
  activeIndex: number
): StageChipView {
  return {
    label: stage.label,
    glyph: isSelected ? "\u25CF" : "\u25CB",
    stateText: isSelected ? CURRENT_LABEL : null,
    current: isSelected,
    tabIndex: rovingTabIndex(activeIndex, index)
  };
}
