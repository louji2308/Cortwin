import type { EvidenceStage } from "./types";

/* Synthetic ladder fixtures for the Evidence Rail unit tests only.
   The `provided` flags below are fixture data; the component never derives them. */

const MODALITY_DEFS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "symptoms", label: "Symptoms and history" },
  { id: "physical", label: "Physical examination" },
  { id: "resting-ecg", label: "Resting ECG" },
  { id: "laboratory", label: "Laboratory tests" },
  { id: "echocardiography", label: "Echocardiography" }
];

const STAGE_DEFS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "history", label: "History" },
  { id: "exam", label: "Exam" },
  { id: "ecg", label: "ECG" },
  { id: "labs", label: "Labs" },
  { id: "echo", label: "Echo" }
];

export function buildLadderStages(): EvidenceStage[] {
  return STAGE_DEFS.map((stage, index) => ({
    id: stage.id,
    label: stage.label,
    modalities: MODALITY_DEFS.map((modality, modalityIndex) => ({
      id: modality.id,
      label: modality.label,
      provided: modalityIndex <= index
    }))
  }));
}

export function buildNoneProvidedStages(): EvidenceStage[] {
  return STAGE_DEFS.map((stage) => ({
    id: stage.id,
    label: stage.label,
    modalities: MODALITY_DEFS.map((modality) => ({
      id: modality.id,
      label: modality.label,
      provided: false
    }))
  }));
}

export const EMPTY_STAGES: EvidenceStage[] = [];
