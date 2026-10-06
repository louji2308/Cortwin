import { SceneError } from "./errors";
import { cameraTargetFromPreset, vesselStructureIds } from "./registryView";
import type { RegistrySlice, SceneModel, SceneStateInput, VesselId, VesselVisualState } from "./types";

/**
 * `buildSceneModel` — the whole scene's view-model, as a pure projection.
 *
 * Contracts.md `C-11` §8.1 + Implementation_Plan P5 step 9 ("Build `SceneModel`
 * from selectors rather than model data access"):
 *
 * - Input is `C-09`-shaped store state plus the `C-02` registry. Nothing else.
 *   No model or results artifact, no SHAP, no pipeline output (INV-C14,
 *   INV-C17): probabilities and decisions come only from the `Evaluation`
 *   payload inside `state.eval.current`.
 * - Pure: same call in worker/main thread/Node, no I/O, no DOM, no three.js.
 * - Pass-through, not computation: `probability` and `decision` are copied from
 *   the payload verbatim — no rounding, no clamping, no threshold comparison,
 *   no coherence adjustment (the engine's `C-08` coherence rule already applied
 *   it; re-deriving it here would be a second source of clinical truth).
 * - HEART/AORTA neutrality is structural: they are not vessel targets, so they
 *   never appear as keys of `vessels` and can never carry a probability.
 *
 * Returns `null` when there is no `Evaluation` payload to project — boot, idle
 * or error state before the first committed truth. `null` is the designed
 * loading/degraded state (Final_demo §4.1 step 1: neutral anatomy, skeleton
 * cards); it never turns into invented numbers. A non-finite probability in the
 * payload is a contract violation and throws (`NONFINITE_VESSEL_PROBABILITY`)
 * rather than letting `NaN` reach a material or a legend.
 */
export function buildSceneModel(
  state: SceneStateInput,
  registry: RegistrySlice
): SceneModel | null {
  const evaluation = state.eval.current;
  if (evaluation === null || evaluation === undefined) return null;

  const vesselIds = vesselStructureIds(registry);
  const vessels = {} as Record<VesselId, VesselVisualState>;

  const selectedTargetId = state.selection.targetId;
  const selectedVesselId =
    selectedTargetId !== null && vesselIds.includes(selectedTargetId as VesselId)
      ? (selectedTargetId as VesselId)
      : null;

  const hovered = state.selection.hovered;
  const hoveredVesselId =
    hovered !== null && hovered.kind === "vessel" && vesselIds.includes(hovered.id as VesselId)
      ? (hovered.id as VesselId)
      : null;

  for (const vesselId of vesselIds) {
    const payload = evaluation.targets[vesselId];
    if (payload === undefined || payload === null) {
      throw new SceneError(
        "REGISTRY_VESSEL_MISMATCH",
        `Evaluation payload has no target entry for vessel "${vesselId}"`,
        { detail: { vesselId }, recoverable: false }
      );
    }
    if (!Number.isFinite(payload.probability)) {
      throw new SceneError(
        "NONFINITE_VESSEL_PROBABILITY",
        `Evaluation payload for vessel "${vesselId}" is not a finite probability`,
        { detail: { vesselId }, recoverable: false }
      );
    }
    const selected = selectedVesselId === vesselId;
    vessels[vesselId] = {
      probability: payload.probability,
      decision: payload.decision,
      selected,
      hovered: hoveredVesselId === vesselId,
      // Selection dims the others (reduced saturation, never opacity —
      // Architecture §10.2). CAD has no structure, so selecting CAD dims nothing.
      dimmed: selectedVesselId !== null && !selected
    };
  }

  return {
    vessels,
    cameraTarget: cameraTargetFromPreset(state.view.cameraPreset),
    selectedTargetId,
    hoveredEntity: state.selection.hovered,
    qualityTier: state.view.qualityTier,
    reducedMotion: state.view.reducedMotion
  };
}

/** True when the store holds a payload worth projecting (`buildSceneModel` ≠ `null`). */
export function hasSceneTruth(state: SceneStateInput): boolean {
  return state.eval.current !== null && state.eval.current !== undefined;
}
