import { describe, expect, it } from "vitest";
import { probabilityToColour } from "../design";
import { buildSceneModel } from "./buildSceneModel";
import { DECISION_GLYPH, buildSchematicViewModel, hatchingAvailableForTier } from "./schematicViewModel";
import { loadProjectRegistry, makeEvaluation, makeState } from "./testFixtures";
import type { DecisionState, QualityTier, SceneEvaluationSlice, VesselId } from "./types";

const registry = loadProjectRegistry();

const viewFor = (
  evaluation: SceneEvaluationSlice,
  view: { qualityTier?: QualityTier; reducedMotion?: boolean } = {},
  selection: { targetId?: "CAD" | "LAD" | "LCX" | "RCA" | null } = {}
) => {
  const state = makeState({
    eval: { current: evaluation },
    selection: { targetId: selection.targetId ?? null, hovered: null },
    view
  });
  const model = buildSceneModel(state, registry);
  expect(model).not.toBeNull();
  const source = {
    kind: "gltf" as const,
    nodes: {
      HEART: { structureId: "HEART" as const, meshNode: "HEART", neutral: true },
      AORTA: { structureId: "AORTA" as const, meshNode: "AORTA", neutral: true },
      LAD: { structureId: "LAD" as const, meshNode: "LAD", neutral: false },
      LCX: { structureId: "LCX" as const, meshNode: "LCX", neutral: false },
      RCA: { structureId: "RCA" as const, meshNode: "RCA", neutral: false }
    },
    schematic: {
      LAD: { structureId: "LAD" as const, d: "M 0 0 L 1 1", labelAnchor: { x: 1, y: 1 }, strokeWidth: 11, origin: "authored" as const },
      LCX: { structureId: "LCX" as const, d: "M 0 0 L 2 2", labelAnchor: { x: 2, y: 2 }, strokeWidth: 11, origin: "authored" as const },
      RCA: { structureId: "RCA" as const, d: "M 0 0 L 3 3", labelAnchor: { x: 3, y: 3 }, strokeWidth: 11, origin: "authored" as const }
    }
  };
  return buildSchematicViewModel(model!, source, registry);
};

describe("2D schematic view-model (C-11 Q3) — same ids, same truth as the 3D stage", () => {
  it("renders exactly the registry's three vessels with their registry labels and paths", () => {
    const view = viewFor(makeEvaluation());
    expect(view.vessels.map((vessel) => vessel.structureId)).toEqual(["LAD", "LCX", "RCA"]);
    expect(view.vessels.map((vessel) => vessel.label)).toEqual(["LAD", "LCX", "RCA"]);
    expect(view.vessels.map((vessel) => vessel.d)).toEqual(["M 0 0 L 1 1", "M 0 0 L 2 2", "M 0 0 L 3 3"]);
    expect(view.viewBox).toEqual({ width: 360, height: 360 });
    expect(view.tier).toBe("Q0");
  });

  it("gets every stroke colour from THE ramp import and nowhere else", () => {
    const evaluation = makeEvaluation({ LAD: 0.9, LCX: 0.42, RCA: 0.07 }, {
      LAD: "above",
      LCX: "below",
      RCA: "below"
    });
    const view = viewFor(evaluation);
    expect(view.vessels[0].stroke).toBe(probabilityToColour(0.9));
    expect(view.vessels[1].stroke).toBe(probabilityToColour(0.42));
    expect(view.vessels[2].stroke).toBe(probabilityToColour(0.07));
  });

  it("colour carries probability only — identical probability renders identical colour regardless of decision", () => {
    const same = makeEvaluation({ LAD: 0.5, LCX: 0.5, RCA: 0.5 }, {
      LAD: "above",
      LCX: "below",
      RCA: "indeterminate"
    });
    const view = viewFor(same);
    expect(new Set(view.vessels.map((vessel) => vessel.stroke)).size).toBe(1);
  });

  it("encodes decisions per C-11: above solid/full, below reduced, indeterminate hatched + glyph", () => {
    const view = viewFor(
      makeEvaluation({ LAD: 0.9, LCX: 0.4, RCA: 0.9 }, {
        LAD: "above",
        LCX: "below",
        RCA: "indeterminate"
      })
    );
    const [lad, lcx, rca] = view.vessels;

    expect(lad).toMatchObject({ intensity: "full", hatch: false, glyph: "▲", decisionLabel: "above" });
    expect(lcx).toMatchObject({ intensity: "reduced", hatch: false, glyph: "△", decisionLabel: "below" });
    expect(rca).toMatchObject({ intensity: "full", hatch: true, glyph: "▨", decisionLabel: "indeterminate" });
    expect(DECISION_GLYPH).toEqual({ above: "▲", below: "△", indeterminate: "▨" });
  });

  it("replaces hatching with the solid state plus text label at Q2/Q3 (C-16 tiers)", () => {
    const evaluation = makeEvaluation({ LAD: 0.9, LCX: 0.9, RCA: 0.9 }, {
      LAD: "indeterminate",
      LCX: "indeterminate",
      RCA: "indeterminate"
    });
    expect(viewFor(evaluation, { qualityTier: "Q0" }).vessels.every((v) => v.hatch)).toBe(true);
    expect(viewFor(evaluation, { qualityTier: "Q1" }).vessels.every((v) => v.hatch)).toBe(true);
    const q2 = viewFor(evaluation, { qualityTier: "Q2" });
    expect(q2.vessels.every((v) => v.hatch)).toBe(false);
    expect(q2.vessels.every((v) => v.decisionLabel === "indeterminate")).toBe(true);
    expect(q2.hatchingAvailable).toBe(false);
    const q3 = viewFor(evaluation, { qualityTier: "Q3" });
    expect(q3.vessels.every((v) => v.hatch)).toBe(false);
    expect(hatchingAvailableForTier("Q3")).toBe(false);
  });

  it("carries selection, hover and dimming from the same SceneModel as the 3D stage", () => {
    const view = viewFor(makeEvaluation(), {}, { targetId: "LCX" });
    expect(view.vessels.find((v) => v.structureId === "LCX")).toMatchObject({
      selected: true,
      dimmed: false
    });
    expect(view.vessels.filter((v) => v.dimmed).map((v) => v.structureId)).toEqual(["LAD", "RCA"]);
  });

  it("never exposes a probability number (INV-C13: only ProbabilityReadout renders probabilities)", () => {
    const view = viewFor(makeEvaluation({ LAD: 0.76, LCX: 0.31, RCA: 0.18 }));
    const keys = view.vessels.flatMap((vessel) => Object.keys(vessel));
    expect(keys).not.toContain("probability");
    expect(keys).not.toContain("value");
    const json = JSON.stringify(view);
    expect(json).not.toContain("0.76");
  });

  it("never exposes an opacity channel — anatomy must not become translucent", () => {
    const view = viewFor(makeEvaluation());
    for (const vessel of view.vessels) {
      expect(Object.keys(vessel)).not.toContain("opacity");
      expect(Object.keys(vessel)).not.toContain("fillOpacity");
      expect(Object.keys(vessel)).not.toContain("transparent");
    }
    expect(JSON.stringify(view)).not.toMatch(/opacity/i);
  });

  it("keeps only vessel ids in the 2D view — HEART/AORTA are never drawn as probability carriers", () => {
    const view = viewFor(makeEvaluation());
    const ids = view.vessels.map((vessel) => vessel.structureId);
    expect(ids).toEqual(["LAD", "LCX", "RCA"] as VesselId[]);
    expect(ids).not.toContain("HEART");
    expect(ids).not.toContain("AORTA");
  });

  it("preserves decision identity even when the payload mixes values", () => {
    const decisions: DecisionState[] = ["above", "below", "indeterminate"];
    const view = viewFor(
      makeEvaluation({ LAD: 0.6, LCX: 0.6, RCA: 0.6 }, {
        LAD: decisions[0],
        LCX: decisions[1],
        RCA: decisions[2]
      })
    );
    expect(view.vessels.map((vessel) => vessel.decisionLabel)).toEqual(decisions);
    expect(view.vessels.map((vessel) => vessel.glyph)).toEqual(["▲", "△", "▨"]);
  });
});
