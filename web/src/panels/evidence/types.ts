export type EvidenceModality = {
  id: string;
  label: string;
  provided: boolean;
};

export type EvidenceStage = {
  id: string;
  label: string;
  modalities: EvidenceModality[];
};

export type BuildUpState = "idle" | "playing" | "done";

export type BuildUpControl = {
  disabled: boolean;
  busy: boolean;
  glyph: string;
};

export type ModalitySummary = {
  total: number;
  provided: number;
  noneProvided: boolean;
  allProvided: boolean;
};

export type StageChipView = {
  label: string;
  glyph: string;
  stateText: string | null;
  current: boolean;
  tabIndex: 0 | -1;
};

export type EvidenceRailProps = {
  stages: EvidenceStage[];
  currentStageId: string | null;
  customSubset: boolean;
  buildUp: { state: BuildUpState };
  onSelectStage: (stageId: string) => void;
  onBuildUpToggle: () => void;
};
