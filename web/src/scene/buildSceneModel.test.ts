import { describe, expect, it } from "vitest";
import { buildSceneModel, hasSceneTruth } from "./buildSceneModel";
import { SceneError } from "./errors";
import { loadProjectRegistry, makeEvaluation, makeRegistry, makeState } from "./testFixtures";
import type { SceneEvaluationSlice, VesselId } from "./types";

const VESSEL_IDS: VesselId[] = ["LAD", "LCX", "RCA"];

describe("buildSceneModel (C-11) — pure projection of C-09 state + C-02 registry", () => {
  const registry = loadProjectRegistry();

  it("returns exactly the C-11 SceneModel keys", () => {
    const model = buildSceneModel(makeState(), registry);
    expect(model).not.toBeNull();
    expect(Object.keys(model!).sort()).toEqual([
      "cameraTarget",
      "hoveredEntity",
      "qualityTier",
      "reducedMotion",
      "selectedTargetId",
      "vessels"
    ]);
    expect(Object.keys(model!.vessels).sort()).toEqual(["LAD", "LCX", "RCA"]);
  });

  it("projects probability and decision through verbatim (pass-through table)", () => {
    const probabilities = { LAD: 0.76, LCX: 0.31, RCA: 0.18000000000000002 };
    const decisions = {
      LAD: "above",
      LCX: "indeterminate",
      RCA: "below"
    } as const;
    const state = makeState({ eval: { current: makeEvaluation(probabilities, decisions) } });

    const model = buildSceneModel(state, registry)!;
    for (const id of VESSEL_IDS) {
      expect(model.vessels[id].probability).toBe(probabilities[id]);
      expect(model.vessels[id].decision).toBe(decisions[id]);
    }
  });

  it("never recomputes the decision from the probability (payload is authoritative)", () => {
    const state = makeState({
      eval: {
        current: makeEvaluation(
          { LAD: 0.49, LCX: 0.95, RCA: 0.02 },
          { LAD: "above", LCX: "below", RCA: "indeterminate" }
        )
      }
    });
    const model = buildSceneModel(state, registry)!;
    expect(model.vessels.LAD).toMatchObject({ probability: 0.49, decision: "above" });
    expect(model.vessels.LCX).toMatchObject({ probability: 0.95, decision: "below" });
    expect(model.vessels.RCA).toMatchObject({ probability: 0.02, decision: "indeterminate" });
  });

  it("keeps HEART and AORTA out of the vessels record entirely (never carry a probability)", () => {
    const model = buildSceneModel(makeState(), registry)!;
    expect(Object.keys(model.vessels)).toEqual(VESSEL_IDS);
    expect("HEART" in model.vessels).toBe(false);
    expect("AORTA" in model.vessels).toBe(false);
    expect(JSON.stringify(model)).not.toContain("HEART");
    expect(JSON.stringify(model)).not.toContain("AORTA");

    // Neutrality is derived from the registry: structures with no vessel target
    // link are context structures and can never receive a projected probability.
    const neutral = registry.structures
      .map((structure) => structure.id)
      .filter((id) => !VESSEL_IDS.includes(id as VesselId));
    expect(neutral.sort()).toEqual(["AORTA", "HEART"]);
    for (const id of neutral) {
      expect(model.vessels).not.toHaveProperty(id);
    }
  });

  it("projects selection: selected flag, dimming of the others, CAD dims nothing", () => {
    const none = buildSceneModel(makeState(), registry)!;
    for (const id of VESSEL_IDS) {
      expect(none.vessels[id].selected).toBe(false);
      expect(none.vessels[id].dimmed).toBe(false);
    }

    const lad = buildSceneModel(
      makeState({ selection: { targetId: "LAD", hovered: null } }),
      registry
    )!;
    expect(lad.vessels.LAD.selected).toBe(true);
    expect(lad.vessels.LAD.dimmed).toBe(false);
    expect(lad.vessels.LCX).toMatchObject({ selected: false, dimmed: true });
    expect(lad.vessels.RCA).toMatchObject({ selected: false, dimmed: true });
    expect(lad.selectedTargetId).toBe("LAD");

    const cad = buildSceneModel(
      makeState({ selection: { targetId: "CAD", hovered: null } }),
      registry
    )!;
    expect(cad.selectedTargetId).toBe("CAD");
    for (const id of VESSEL_IDS) {
      expect(cad.vessels[id].selected).toBe(false);
      expect(cad.vessels[id].dimmed).toBe(false);
    }
  });

  it("projects hover: only the hovered vessel is hovered, and the channel passes through", () => {
    const model = buildSceneModel(
      makeState({ selection: { targetId: null, hovered: { kind: "vessel", id: "LCX" } } }),
      registry
    )!;
    expect(model.vessels.LCX.hovered).toBe(true);
    expect(model.vessels.LAD.hovered).toBe(false);
    expect(model.vessels.RCA.hovered).toBe(false);
    expect(model.hoveredEntity).toEqual({ kind: "vessel", id: "LCX" });

    const modalityHover = buildSceneModel(
      makeState({ selection: { targetId: null, hovered: { kind: "modality", id: "ecg" } } }),
      registry
    )!;
    expect(modalityHover.hoveredEntity).toEqual({ kind: "modality", id: "ecg" });
    for (const id of VESSEL_IDS) expect(modalityHover.vessels[id].hovered).toBe(false);
  });

  it("maps camera presets: CAD (and unknown) → overview, vessels → their target", () => {
    expect(buildSceneModel(makeState({ view: { cameraPreset: "CAD" } }), registry)!.cameraTarget).toBe(
      "overview"
    );
    expect(buildSceneModel(makeState({ view: { cameraPreset: "LAD" } }), registry)!.cameraTarget).toBe(
      "LAD"
    );
    expect(buildSceneModel(makeState({ view: { cameraPreset: "LCX" } }), registry)!.cameraTarget).toBe(
      "LCX"
    );
    expect(buildSceneModel(makeState({ view: { cameraPreset: "RCA" } }), registry)!.cameraTarget).toBe(
      "RCA"
    );
    expect(
      buildSceneModel(makeState({ view: { cameraPreset: "overview" } }), registry)!.cameraTarget
    ).toBe("overview");
  });

  it("passes quality tier and reduced motion through untouched", () => {
    const model = buildSceneModel(
      makeState({ view: { qualityTier: "Q3", reducedMotion: true } }),
      registry
    )!;
    expect(model.qualityTier).toBe("Q3");
    expect(model.reducedMotion).toBe(true);
  });

  it("returns null when there is no Evaluation payload (boot/error, no invented truth)", () => {
    expect(buildSceneModel(makeState({ eval: { current: null } }), registry)).toBeNull();
    expect(hasSceneTruth(makeState({ eval: { current: null } }))).toBe(false);
    expect(hasSceneTruth(makeState())).toBe(true);
  });

  it("throws a typed error instead of projecting a non-finite probability", () => {
    const bad = makeEvaluation();
    (bad.targets.LAD as { probability: number }).probability = Number.NaN;
    expect(() => buildSceneModel(makeState({ eval: { current: bad } }), registry)).toThrowError(
      SceneError
    );
    try {
      buildSceneModel(makeState({ eval: { current: bad } }), registry);
    } catch (error) {
      expect((error as SceneError).code).toBe("NONFINITE_VESSEL_PROBABILITY");
      expect((error as SceneError).recoverable).toBe(false);
    }
  });

  it("throws when the payload omits a vessel target (incomplete record is not silently partial)", () => {
    const incomplete = { targets: { LAD: { probability: 0.5, decision: "above" } } } as unknown as
      SceneEvaluationSlice;
    expect(() =>
      buildSceneModel(makeState({ eval: { current: incomplete } }), registry)
    ).toThrowError(SceneError);
  });

  it("is pure: same input → equal output, input state never mutated", () => {
    const state = makeState();
    const snapshot = JSON.stringify(state);
    const first = buildSceneModel(state, registry);
    const second = buildSceneModel(state, registry);
    expect(second).toEqual(first);
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it("derives the vessel set from the registry, not from a local list", () => {
    const broken = makeRegistry();
    broken.targets = broken.targets.filter((target) => target.id !== "RCA");
    expect(() => buildSceneModel(makeState(), broken)).toThrowError(SceneError);
    try {
      buildSceneModel(makeState(), broken);
    } catch (error) {
      expect((error as SceneError).code).toBe("REGISTRY_VESSEL_MISMATCH");
    }
  });
});
