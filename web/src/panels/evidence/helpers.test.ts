import { describe, expect, it } from "vitest";
import {
  buildUpControl,
  buildUpStatus,
  indexOfStage,
  modalitySummary,
  nextRovingIndex,
  providedSummaryText,
  resolveSelectedStage,
  rovingTabIndex,
  stageChipView,
  stagePositionLabel
} from "./helpers";
import { buildLadderStages, buildNoneProvidedStages, EMPTY_STAGES } from "./fixtures";
import type { EvidenceModality, EvidenceStage } from "./types";

const stages = buildLadderStages();

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

describe("indexOfStage / resolveSelectedStage", () => {
  it("finds a stage by id", () => {
    expect(indexOfStage(stages, "ecg")).toBe(2);
    expect(resolveSelectedStage(stages, "ecg")?.label).toBe("ECG");
  });

  it("returns -1 / null for null, unknown and empty inputs", () => {
    expect(indexOfStage(stages, null)).toBe(-1);
    expect(indexOfStage(EMPTY_STAGES, "history")).toBe(-1);
    expect(indexOfStage(stages, "not-a-stage")).toBe(-1);
    expect(resolveSelectedStage(stages, null)).toBeNull();
    expect(resolveSelectedStage(EMPTY_STAGES, "history")).toBeNull();
    expect(resolveSelectedStage(stages, "not-a-stage")).toBeNull();
  });

  it("does not mutate its inputs", () => {
    const frozen = deepFreeze(buildLadderStages());
    expect(() => resolveSelectedStage(frozen, "history")).not.toThrow();
    expect(frozen).toEqual(buildLadderStages());
  });
});

describe("stagePositionLabel", () => {
  it("formats one-based positions", () => {
    expect(stagePositionLabel(0, 5)).toBe("Stage 1 of 5");
    expect(stagePositionLabel(4, 5)).toBe("Stage 5 of 5");
  });
});

describe("modalitySummary / providedSummaryText", () => {
  const some: EvidenceModality[] = [
    { id: "a", label: "A", provided: true },
    { id: "b", label: "B", provided: false },
    { id: "c", label: "C", provided: true },
    { id: "d", label: "D", provided: false }
  ];

  it("counts provided modalities", () => {
    expect(modalitySummary(some)).toEqual({
      total: 4,
      provided: 2,
      noneProvided: false,
      allProvided: false
    });
  });

  it("flags an all-not-provided set", () => {
    const none = buildNoneProvidedStages()[4]?.modalities ?? [];
    const summary = modalitySummary(none);
    expect(summary.noneProvided).toBe(true);
    expect(summary.allProvided).toBe(false);
    expect(summary.provided).toBe(0);
    expect(providedSummaryText(summary)).toBe(
      "No modalities are provided at this stage."
    );
  });

  it("flags a fully provided set", () => {
    const all = stages[4]?.modalities ?? [];
    const summary = modalitySummary(all);
    expect(summary.allProvided).toBe(true);
    expect(summary.noneProvided).toBe(false);
    expect(providedSummaryText(summary)).toBe("5 of 5 modalities provided.");
  });

  it("treats an empty set as neither all nor none provided", () => {
    const summary = modalitySummary([]);
    expect(summary).toEqual({
      total: 0,
      provided: 0,
      noneProvided: false,
      allProvided: false
    });
    expect(providedSummaryText(summary)).toBe(
      "No modalities are listed for this stage."
    );
  });

  it("formats the partial summary", () => {
    expect(providedSummaryText(modalitySummary(some))).toBe(
      "2 of 4 modalities provided."
    );
  });
});

describe("nextRovingIndex / rovingTabIndex", () => {
  it("moves forward and wraps", () => {
    expect(nextRovingIndex("ArrowRight", 0, 5)).toBe(1);
    expect(nextRovingIndex("ArrowRight", 4, 5)).toBe(0);
    expect(nextRovingIndex("ArrowDown", 2, 5)).toBe(3);
  });

  it("moves backward and wraps", () => {
    expect(nextRovingIndex("ArrowLeft", 2, 5)).toBe(1);
    expect(nextRovingIndex("ArrowLeft", 0, 5)).toBe(4);
    expect(nextRovingIndex("ArrowUp", 2, 5)).toBe(1);
  });

  it("supports Home and End", () => {
    expect(nextRovingIndex("Home", 3, 5)).toBe(0);
    expect(nextRovingIndex("End", 0, 5)).toBe(4);
  });

  it("ignores unrelated keys and degenerate inputs", () => {
    expect(nextRovingIndex("Tab", 0, 5)).toBeNull();
    expect(nextRovingIndex("Enter", 0, 5)).toBeNull();
    expect(nextRovingIndex("ArrowRight", 0, 0)).toBeNull();
    expect(nextRovingIndex("ArrowRight", -3, 5)).toBe(1);
    expect(nextRovingIndex("ArrowRight", 99, 5)).toBe(0);
  });

  it("gives exactly one stop in the roving tab order", () => {
    expect(rovingTabIndex(2, 2)).toBe(0);
    expect(rovingTabIndex(2, 1)).toBe(-1);
    expect(rovingTabIndex(0, 0)).toBe(0);
  });
});

describe("buildUpControl", () => {
  it("is enabled and idle at rest", () => {
    expect(buildUpControl("idle", 5)).toEqual({
      disabled: false,
      busy: false,
      glyph: "\u25B6"
    });
  });

  it("is busy but toggleable while playing", () => {
    expect(buildUpControl("playing", 5)).toEqual({
      disabled: false,
      busy: true,
      glyph: "\u23F8"
    });
  });

  it("is visibly inert when done", () => {
    expect(buildUpControl("done", 5)).toEqual({
      disabled: true,
      busy: false,
      glyph: "\u2713"
    });
  });

  it("is disabled for every state when there are no stages", () => {
    for (const state of ["idle", "playing", "done"] as const) {
      expect(buildUpControl(state, 0).disabled).toBe(true);
      expect(buildUpControl(state, -1).disabled).toBe(true);
    }
  });
});

describe("buildUpStatus", () => {
  it("reports readiness at idle", () => {
    expect(buildUpStatus("idle", stages, 0)).toBe(
      "Ready - select a stage, or start Build Up."
    );
  });

  it("reports the current stage while playing", () => {
    expect(buildUpStatus("playing", stages, 2)).toBe(
      "Playing Stage 3 of 5 - ECG."
    );
  });

  it("falls back to a stage count while playing with no selection", () => {
    expect(buildUpStatus("playing", stages, -1)).toBe("Playing 5 stages.");
  });

  it("reports completion", () => {
    expect(buildUpStatus("done", stages, 4)).toBe("Complete - all stages played.");
  });

  it("reports the empty ladder honestly", () => {
    expect(buildUpStatus("idle", EMPTY_STAGES, -1)).toBe(
      "No stages available to build up."
    );
    expect(buildUpStatus("playing", EMPTY_STAGES, -1)).toBe(
      "No stages available to build up."
    );
  });
});

describe("stageChipView", () => {
  it("presents the selected stage as current with a single tab stop", () => {
    const view = stageChipView(stages[0] as EvidenceStage, 0, true, 0);
    expect(view).toEqual({
      label: "History",
      glyph: "\u25CF",
      stateText: "current",
      current: true,
      tabIndex: 0
    });
  });

  it("presents unselected stages as inactive and unfocused", () => {
    const view = stageChipView(stages[3] as EvidenceStage, 3, false, 0);
    expect(view.glyph).toBe("\u25CB");
    expect(view.stateText).toBeNull();
    expect(view.current).toBe(false);
    expect(view.tabIndex).toBe(-1);
  });

  it("keeps the roving stop on the focused stage even when another is current", () => {
    const view = stageChipView(stages[1] as EvidenceStage, 1, false, 1);
    expect(view.tabIndex).toBe(0);
    expect(view.current).toBe(false);
  });

  it("is deterministic", () => {
    const stage = stages[2] as EvidenceStage;
    expect(stageChipView(stage, 2, true, 2)).toEqual(
      stageChipView(stage, 2, true, 2)
    );
  });
});

describe("purity guard", () => {
  it("never mutates frozen inputs", () => {
    const frozenStages = deepFreeze(buildLadderStages());
    const frozenNone = deepFreeze(buildNoneProvidedStages());
    expect(() => {
      for (const list of [frozenStages, frozenNone]) {
        list.forEach((stage, index) => {
          indexOfStage(list, stage.id);
          resolveSelectedStage(list, stage.id);
          modalitySummary(stage.modalities);
          providedSummaryText(modalitySummary(stage.modalities));
          stageChipView(stage, index, index === 0, index);
          buildUpControl("playing", list.length);
          buildUpStatus("playing", list, index);
          nextRovingIndex("ArrowRight", index, list.length);
        });
      }
      nextRovingIndex("End", 0, 0);
      providedSummaryText(modalitySummary([]));
    }).not.toThrow();
    expect(frozenStages).toEqual(buildLadderStages());
    expect(frozenNone).toEqual(buildNoneProvidedStages());
  });
});
