import { probabilityToColour } from "../design";
import { structureById, vesselStructureIds } from "./registryView";
import { SCHEMATIC_VIEW_BOX } from "./schematic";
import type {
  DecisionState,
  QualityTier,
  RegistrySlice,
  SceneModel,
  StructureSource,
  VesselId
} from "./types";

/**
 * 2D schematic view-model: what to draw, derived from the same `SceneModel`,
 * registry and `StructureSource` as the 3D stage (Architecture §10.4, `C-16`
 * Q3, Implementation_Plan P5 step 15). It is a projection, not a second scene:
 * vessel identity, probability, decision, selection and labels behave
 * identically in 2D and 3D because both read the same store truth.
 *
 * Encoding, exactly per `C-11` L350:
 * - **Colour** — `stroke` comes only from `probabilityToColour` (THE ramp in
 *   `../design`). Colour carries probability only; the decision never changes
 *   the colour, so two vessels with the same probability render the same hue.
 * - **Above** — saturated/solid: full intensity, no hatch, glyph ▲.
 * - **Below** — lower intensity: `intensity: "reduced"`, glyph △.
 * - **Indeterminate** — hatch plus text/badge: `hatch: true` (only while the
 *   tier keeps hatching; Q2 replaces it with solid + text label, `C-16`), glyph ▨.
 * - **Anatomy never becomes translucent**: this view-model has no opacity field
 *   at all; dimming and intensity are separate, explicit channels that the view
 *   layer implements without opacity.
 *
 * Deliberately contains **no probability number**: `INV-C13` — only
 * `ProbabilityReadout` renders probability values. The view layer needs the
 * colour, the decision glyph and the label, all of which are here; the number
 * belongs to `ProbabilityReadout`.
 */

export type DecisionGlyph = "▲" | "△" | "▨";

/** Same glyph system as `ProbabilityReadout` (AGENTS §6.1: one glyph system). */
export const DECISION_GLYPH: Record<DecisionState, DecisionGlyph> = {
  above: "▲",
  below: "△",
  indeterminate: "▨"
};

export type SchematicIntensity = "full" | "reduced";

export type SchematicVesselView = {
  structureId: VesselId;
  label: string;
  d: string;
  labelAnchor: { x: number; y: number };
  strokeWidth: number;
  stroke: string;
  intensity: SchematicIntensity;
  hatch: boolean;
  glyph: DecisionGlyph;
  decisionLabel: DecisionState;
  selected: boolean;
  hovered: boolean;
  dimmed: boolean;
};

export type SchematicViewModel = {
  viewBox: { width: number; height: number };
  vessels: SchematicVesselView[];
  tier: QualityTier;
  hatchingAvailable: boolean;
};

/**
 * Whether the current quality tier keeps hatching: Q0/Q1 full hatch, Q2/Q3
 * replace it with the solid state plus text label (`C-16` tier table).
 */
export function hatchingAvailableForTier(tier: QualityTier): boolean {
  return tier === "Q0" || tier === "Q1";
}

/** Project a `SceneModel` + `StructureSource` + registry into the 2D schematic view. */
export function buildSchematicViewModel(
  sceneModel: SceneModel,
  source: StructureSource,
  registry: RegistrySlice
): SchematicViewModel {
  const vesselIds = vesselStructureIds(registry);
  const hatchingAvailable = hatchingAvailableForTier(sceneModel.qualityTier);

  const vessels: SchematicVesselView[] = vesselIds.map((structureId) => {
    const visual = sceneModel.vessels[structureId];
    const path = source.schematic[structureId];
    const structure = structureById(registry, structureId);

    return {
      structureId,
      label: structure.label,
      d: path.d,
      labelAnchor: path.labelAnchor,
      strokeWidth: path.strokeWidth,
      stroke: probabilityToColour(visual.probability),
      intensity: visual.decision === "below" ? "reduced" : "full",
      hatch: visual.decision === "indeterminate" && hatchingAvailable,
      glyph: DECISION_GLYPH[visual.decision],
      decisionLabel: visual.decision,
      selected: visual.selected,
      hovered: visual.hovered,
      dimmed: visual.dimmed
    };
  });

  return {
    viewBox: SCHEMATIC_VIEW_BOX,
    vessels,
    tier: sceneModel.qualityTier,
    hatchingAvailable
  };
}
