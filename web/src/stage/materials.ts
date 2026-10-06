/**
 * Stage material descriptors — the pure projection from `SceneModel` +
 * `StructureSource` + registry to what each named node renders.
 *
 * Laws encoded here (Contracts §8.1 `C-11` L350, Architecture §10.2):
 * - **Colour carries probability only**: vessel colour starts at `rampRgb`
 *   (THE ramp, via `colours.ts`); decision never changes hue.
 * - **Above = full intensity, below = lower intensity** (`BELOW_INTENSITY`
 *   luminance scale) — a post-ramp presentation transform, so the base colour
 *   before intensity is always the exact ramp output.
 * - **Indeterminate = hatch**, only while the quality tier keeps hatching
 *   (`C-16`: Q0/Q1 hatch, Q2 solid + text label, Q3 schematic).
 * - **Selection dims the others by desaturation, never opacity** (no alpha
 *   channel exists in these descriptors — anatomy never becomes translucent).
 * - **Selection/hover accents are emissive boosts of the vessel's own colour**,
 *   so the accent hue is still the probability hue — identity never rides on
 *   colour.
 * - **Neutrality is registry-derived** (`isNeutralStructure`), never read from
 *   a mesh name or hardcoded id list (INV-C15).
 *
 * Pure: no three.js, no React, no store. Descriptor order follows the `C-11`
 * node contract (`REQUIRED_STRUCTURE_IDS`) so the renderer's index mapping is
 * stable and testable.
 */
import {
  REQUIRED_STRUCTURE_IDS,
  hatchingAvailableForTier,
  isNeutralStructure,
  vesselStructureIds
} from "../scene";
import type {
  DecisionState,
  RegistrySlice,
  SceneModel,
  StructureId,
  StructureSource,
  VesselId,
  VesselVisualState
} from "../scene";
import {
  BELOW_INTENSITY,
  DIM_SATURATION,
  NEUTRAL_RGB,
  desaturate,
  rampRgb,
  scaleIntensity,
  type Rgb
} from "./colours";

/** AG-09 presentational accent: selection glows with the vessel's own colour. */
export const SELECTION_EMISSIVE_BOOST = 0.45;

/** AG-09 presentational accent: hover is a smaller lift than selection. */
export const HOVER_EMISSIVE_BOOST = 0.2;

/** No accent: emissive stays black so the material shows pure albedo. */
export const NO_EMISSIVE: Rgb = [0, 0, 0];

/**
 * Apply the `C-11` decision/selection presentation transforms on top of an
 * exact ramp colour: intensity first (decision), then desaturation (dim).
 * With `"above"` and `dimmed: false` the result is the input unchanged — the
 * one-ramp provenance test leans on that identity.
 */
export function presentationalColour(
  base: Rgb,
  decision: DecisionState,
  dimmed: boolean
): Rgb {
  const intensified =
    decision === "below" ? scaleIntensity(base, BELOW_INTENSITY) : base;
  return dimmed ? desaturate(intensified, DIM_SATURATION) : intensified;
}

/** Target colour for one vessel: exact ramp colour → presentation transforms. */
export function vesselTargetColour(visual: VesselVisualState): Rgb {
  return presentationalColour(rampRgb(visual.probability), visual.decision, visual.dimmed);
}

/**
 * Per-vessel tween targets keyed by registry vessel id.
 *
 * `model === null` (boot / no evaluation yet) targets the neutral colour for
 * every vessel — the designed "neutral anatomy" loading state, never invented
 * colours (Final_demo §4.1 step 1).
 */
export function stageColourTargets(
  model: SceneModel | null,
  registry: RegistrySlice
): Record<string, Rgb> {
  const targets: Record<string, Rgb> = {};
  for (const structureId of vesselStructureIds(registry)) {
    const visual = model === null ? undefined : model.vessels[structureId as VesselId];
    targets[structureId] = visual === undefined ? NEUTRAL_RGB : vesselTargetColour(visual);
  }
  return targets;
}

export type StructureDescriptor = {
  structureId: StructureId;
  /** Node name inside the loaded source (`C-11` named-node contract). */
  meshNode: string;
  /** Registry-derived neutrality: HEART/AORTA never carry a probability. */
  neutral: boolean;
  /** Final albedo (vessel: tweened presentation colour; neutral: neutral grey). */
  colour: Rgb;
  /** Emissive accent of `colour` — selection/hover, black otherwise. */
  emissive: Rgb;
  /** Indeterminate + hatching available at the current tier (`C-16`). */
  hatch: boolean;
  selected: boolean;
  hovered: boolean;
  dimmed: boolean;
};

export type DescriptorArgs = {
  source: StructureSource;
  registry: RegistrySlice;
  model: SceneModel | null;
  /** Current tween colours for vessels (from `stepTweens`). */
  displayed: Readonly<Record<string, Rgb>>;
};

/**
 * Build the render descriptors for all five named nodes, in `C-11` node order.
 *
 * Neutrality comes from the registry (not the mesh name, not the source's own
 * flag), so a source/registry mismatch resolves to registry identity — the
 * registry is the single identity authority (INV-C15).
 */
export function buildStructureDescriptors(args: DescriptorArgs): StructureDescriptor[] {
  const { source, registry, model, displayed } = args;
  const hatchAvailable =
    model !== null && hatchingAvailableForTier(model.qualityTier);

  return REQUIRED_STRUCTURE_IDS.map((structureId) => {
    const node = source.nodes[structureId];
    const neutral = isNeutralStructure(structureId, registry);

    if (neutral) {
      return {
        structureId,
        meshNode: node.meshNode,
        neutral: true,
        colour: NEUTRAL_RGB,
        emissive: NO_EMISSIVE,
        hatch: false,
        selected: false,
        hovered: false,
        dimmed: false
      };
    }

    const vesselId = structureId as VesselId;
    const visual = model === null ? undefined : model.vessels[vesselId];
    const colour = displayed[structureId] ?? NEUTRAL_RGB;
    const selected = visual?.selected ?? false;
    const hovered = visual?.hovered ?? false;
    const boost = selected
      ? SELECTION_EMISSIVE_BOOST
      : hovered
        ? HOVER_EMISSIVE_BOOST
        : 0;

    return {
      structureId,
      meshNode: node.meshNode,
      neutral: false,
      colour,
      emissive: boost > 0 ? scaleIntensity(colour, boost) : NO_EMISSIVE,
      hatch: hatchAvailable && visual?.decision === "indeterminate",
      selected,
      hovered,
      dimmed: visual?.dimmed ?? false
    };
  });
}
