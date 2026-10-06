import { describe, expect, it } from "vitest";
import { probabilityToColour } from "../design/ramp";
import { buildSceneModel, type RegistrySlice, type SceneModel, type StructureSource } from "../scene";
import { loadProjectRegistry, makeState } from "../scene/testFixtures";
import {
  BELOW_INTENSITY,
  DIM_SATURATION,
  NEUTRAL_RGB,
  desaturate,
  formatColour,
  rampRgb,
  rgbEquals,
  scaleIntensity,
  type Rgb
} from "./colours";
import {
  HOVER_EMISSIVE_BOOST,
  NO_EMISSIVE,
  SELECTION_EMISSIVE_BOOST,
  buildStructureDescriptors,
  presentationalColour,
  stageColourTargets,
  vesselTargetColour
} from "./materials";

const registry: RegistrySlice = loadProjectRegistry();

function makeSource(overrides: Partial<StructureSource["nodes"]> = {}): StructureSource {
  const node = (id: "HEART" | "AORTA" | "LAD" | "LCX" | "RCA", neutral: boolean) => ({
    structureId: id,
    meshNode: id,
    neutral
  });
  const base: StructureSource["nodes"] = {
    HEART: node("HEART", true),
    AORTA: node("AORTA", true),
    LAD: node("LAD", false),
    LCX: node("LCX", false),
    RCA: node("RCA", false)
  };
  return {
    kind: "gltf",
    nodes: { ...base, ...overrides },
    schematic: {
      LAD: { structureId: "LAD", d: "M 0 0 L 1 1", labelAnchor: { x: 1, y: 1 }, strokeWidth: 11, origin: "authored" },
      LCX: { structureId: "LCX", d: "M 0 0 L 2 2", labelAnchor: { x: 2, y: 2 }, strokeWidth: 11, origin: "authored" },
      RCA: { structureId: "RCA", d: "M 0 0 L 3 3", labelAnchor: { x: 3, y: 3 }, strokeWidth: 11, origin: "authored" }
    }
  };
}

function modelFor(args: {
  selection?: "CAD" | "LAD" | "LCX" | "RCA" | null;
  qualityTier?: "Q0" | "Q1" | "Q2" | "Q3";
} = {}): SceneModel {
  const model = buildSceneModel(
    makeState({
      selection: { targetId: args.selection ?? null, hovered: null },
      view: { qualityTier: args.qualityTier ?? "Q0" }
    }),
    registry
  );
  expect(model).not.toBeNull();
  return model as SceneModel;
}

const displayedFrom = (model: SceneModel | null): Record<string, Rgb> =>
  Object.fromEntries(
    Object.entries(stageColourTargets(model, registry)).map(([id, colour]) => [id, colour])
  );

describe("C-11 colour law: base colour is always the exact ramp output", () => {
  it("above + undimmed renders the ramp string byte-for-byte", () => {
    for (let i = 0; i <= 100; i += 1) {
      const p = i / 100;
      const colour = presentationalColour(rampRgb(p), "above", false);
      expect(formatColour(colour)).toBe(probabilityToColour(p));
    }
  });

  it("indeterminate keeps full intensity — only 'below' reduces it", () => {
    for (let i = 0; i <= 20; i += 1) {
      const p = i / 20;
      expect(rgbEquals(presentationalColour(rampRgb(p), "indeterminate", false), rampRgb(p))).toBe(
        true
      );
    }
  });

  it("below is the ramp at reduced intensity, never a different hue family", () => {
    const base = rampRgb(0.6);
    const below = presentationalColour(base, "below", false);
    expect(below).toEqual(scaleIntensity(base, BELOW_INTENSITY));
    expect(below.every((_channel, i) => base[i] > 0)).toBe(true);
    expect(below[0] / base[0]).toBeCloseTo(BELOW_INTENSITY, 10);
    expect(below[1] / base[1]).toBeCloseTo(BELOW_INTENSITY, 10);
    expect(below[2] / base[2]).toBeCloseTo(BELOW_INTENSITY, 10);
    expect(
      presentationalColour(base, "below", false)[0]
    ).toBeLessThan(presentationalColour(base, "above", false)[0]);
  });

  it("dim desaturates the presented colour (never an opacity channel)", () => {
    const base = rampRgb(0.6);
    const dimmed = presentationalColour(base, "above", true);
    expect(dimmed).toEqual(desaturate(base, DIM_SATURATION));
    expect(dimmed).not.toEqual(base);
    expect(luminanceClose(dimmed, base)).toBe(true);
  });
});

function luminanceClose(a: Rgb, b: Rgb): boolean {
  const lum = (c: Rgb) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return Math.abs(lum(a) - lum(b)) < 1e-9;
}

describe("stageColourTargets", () => {
  it("boot (model null) targets neutral for exactly the registry's three vessels", () => {
    const targets = stageColourTargets(null, registry);
    expect(Object.keys(targets).sort()).toEqual(["LAD", "LCX", "RCA"]);
    for (const colour of Object.values(targets)) {
      expect(rgbEquals(colour, NEUTRAL_RGB)).toBe(true);
    }
  });

  it("projects each vessel through ramp + decision + dim from the same SceneModel", () => {
    const model = modelFor({ selection: "LCX" });
    const targets = stageColourTargets(model, registry);
    expect(Object.keys(targets).sort()).toEqual(["LAD", "LCX", "RCA"]);
    expect(formatColour(targets.LAD)).toBe(formatColour(desaturate(rampRgb(0.76), DIM_SATURATION)));
    expect(formatColour(targets.LCX)).toBe(probabilityToColour(0.31));
    expect(targets.RCA).toEqual(
      desaturate(scaleIntensity(rampRgb(0.18), BELOW_INTENSITY), DIM_SATURATION)
    );
  });

  it("selection dims only the non-selected vessels", () => {
    const model = modelFor({ selection: "LCX" });
    const targets = stageColourTargets(model, registry);
    expect(rgbEquals(targets.LCX, rampRgb(0.31))).toBe(true);
    expect(rgbEquals(targets.LAD, desaturate(rampRgb(0.76), DIM_SATURATION))).toBe(true);
    expect(rgbEquals(targets.RCA, desaturate(scaleIntensity(rampRgb(0.18), BELOW_INTENSITY), DIM_SATURATION))).toBe(true);
  });

  it("no selection dims nothing", () => {
    const targets = stageColourTargets(modelFor(), registry);
    expect(formatColour(targets.LAD)).toBe(probabilityToColour(0.76));
    expect(formatColour(targets.LCX)).toBe(probabilityToColour(0.31));
    expect(targets.RCA).toEqual(scaleIntensity(rampRgb(0.18), BELOW_INTENSITY));
  });

  it("CAD selection dims nothing (CAD has no structure)", () => {
    const targets = stageColourTargets(modelFor({ selection: "CAD" }), registry);
    expect(formatColour(targets.LAD)).toBe(probabilityToColour(0.76));
  });
});

describe("buildStructureDescriptors — five named nodes, registry identity", () => {
  it("emits the C-11 node contract in order with source mesh names", () => {
    const model = modelFor();
    const descriptors = buildStructureDescriptors({
      source: makeSource(),
      registry,
      model,
      displayed: displayedFrom(model)
    });
    expect(descriptors.map((d) => d.structureId)).toEqual([
      "HEART",
      "AORTA",
      "LAD",
      "LCX",
      "RCA"
    ]);
    expect(descriptors.map((d) => d.meshNode)).toEqual([
      "HEART",
      "AORTA",
      "LAD",
      "LCX",
      "RCA"
    ]);
    expect(descriptors.map((d) => d.neutral)).toEqual([true, true, false, false, false]);
  });

  it("keeps HEART/AORTA neutral: neutral colour, no emissive, no hatch, no flags", () => {
    const model = modelFor({ selection: "LAD" });
    const [heart, aorta] = buildStructureDescriptors({
      source: makeSource(),
      registry,
      model,
      displayed: displayedFrom(model)
    });
    for (const descriptor of [heart, aorta]) {
      expect(rgbEquals(descriptor.colour, NEUTRAL_RGB)).toBe(true);
      expect(descriptor.emissive).toEqual(NO_EMISSIVE);
      expect(descriptor.hatch).toBe(false);
      expect(descriptor.selected).toBe(false);
      expect(descriptor.hovered).toBe(false);
      expect(descriptor.dimmed).toBe(false);
    }
  });

  it("vessel colours come from the tween output, not re-derived in the renderer", () => {
    const model = modelFor();
    const midFlight = { LAD: [0.5, 0.5, 0.5] as Rgb };
    const descriptors = buildStructureDescriptors({
      source: makeSource(),
      registry,
      model,
      displayed: { ...displayedFrom(model), LAD: midFlight.LAD }
    });
    const lad = descriptors.find((d) => d.structureId === "LAD");
    expect(lad?.colour).toEqual(midFlight.LAD);
  });

  it("identity is registry-derived even when the source lies (INV-C15 mutation)", () => {
    const model = modelFor();
    const lying = makeSource({
      LAD: { structureId: "LAD", meshNode: "LAD_MESH", neutral: true }
    });
    const descriptors = buildStructureDescriptors({
      source: lying,
      registry,
      model,
      displayed: displayedFrom(model)
    });
    const lad = descriptors.find((d) => d.structureId === "LAD");
    expect(lad?.meshNode).toBe("LAD_MESH");
    expect(lad?.neutral).toBe(false);
    expect(lad?.hatch).toBe(false);
  });

  it("never exposes an opacity/transparent channel", () => {
    const model = modelFor({ selection: "RCA" });
    const json = JSON.stringify(
      buildStructureDescriptors({
        source: makeSource(),
        registry,
        model,
        displayed: displayedFrom(model)
      })
    );
    expect(json).not.toMatch(/opacity|transparent/i);
  });
});

describe("selection / hover accents are emissive boosts of the vessel's own colour", () => {
  it("selected vessel glows with its colour at the selection boost", () => {
    const model = modelFor({ selection: "LAD" });
    const descriptors = buildStructureDescriptors({
      source: makeSource(),
      registry,
      model,
      displayed: displayedFrom(model)
    });
    const lad = descriptors.find((d) => d.structureId === "LAD");
    const lcx = descriptors.find((d) => d.structureId === "LCX");
    expect(lad?.selected).toBe(true);
    expect(lad?.emissive).toEqual(scaleIntensity(lad!.colour, SELECTION_EMISSIVE_BOOST));
    expect(lcx?.dimmed).toBe(true);
    expect(lcx?.emissive).toEqual(NO_EMISSIVE);
  });

  it("hovered-but-not-selected vessel uses the smaller hover boost", () => {
    const model = modelFor();
    model.vessels.RCA.hovered = true;
    const descriptors = buildStructureDescriptors({
      source: makeSource(),
      registry,
      model,
      displayed: displayedFrom(model)
    });
    const rca = descriptors.find((d) => d.structureId === "RCA");
    expect(rca?.hovered).toBe(true);
    expect(rca?.emissive).toEqual(scaleIntensity(rca!.colour, HOVER_EMISSIVE_BOOST));
  });

  it("selection outranks hover when both are true", () => {
    const model = modelFor({ selection: "LAD" });
    model.vessels.LAD.hovered = true;
    const descriptors = buildStructureDescriptors({
      source: makeSource(),
      registry,
      model,
      displayed: displayedFrom(model)
    });
    const lad = descriptors.find((d) => d.structureId === "LAD");
    expect(lad?.emissive).toEqual(scaleIntensity(lad!.colour, SELECTION_EMISSIVE_BOOST));
  });

  it("no model (boot) → no accents, no hatch", () => {
    const descriptors = buildStructureDescriptors({
      source: makeSource(),
      registry,
      model: null,
      displayed: displayedFrom(null)
    });
    for (const descriptor of descriptors) {
      expect(descriptor.emissive).toEqual(NO_EMISSIVE);
      expect(descriptor.hatch).toBe(false);
      expect(descriptor.selected).toBe(false);
      expect(descriptor.hovered).toBe(false);
    }
  });
});

describe("C-16 tier hatching", () => {
  it("hatches only the indeterminate vessel while the tier keeps hatching", () => {
    const model = modelFor({ qualityTier: "Q0" });
    const descriptors = buildStructureDescriptors({
      source: makeSource(),
      registry,
      model,
      displayed: displayedFrom(model)
    });
    const hatchById = Object.fromEntries(descriptors.map((d) => [d.structureId, d.hatch]));
    expect(hatchById).toEqual({
      HEART: false,
      AORTA: false,
      LAD: false,
      LCX: true,
      RCA: false
    });
  });

  it("replaces hatching with the solid state at Q2 and Q3", () => {
    for (const qualityTier of ["Q2", "Q3"] as const) {
      const model = modelFor({ qualityTier });
      const descriptors = buildStructureDescriptors({
        source: makeSource(),
        registry,
        model,
        displayed: displayedFrom(model)
      });
      expect(descriptors.every((d) => !d.hatch)).toBe(true);
      expect(descriptors.find((d) => d.structureId === "LCX")?.selected).toBe(false);
    }
  });
});

describe("vesselTargetColour", () => {
  it("is ramp ∘ presentation for one vessel visual state", () => {
    const visual = {
      probability: 0.42,
      decision: "below" as const,
      selected: false,
      hovered: false,
      dimmed: false
    };
    expect(vesselTargetColour(visual)).toEqual(
      scaleIntensity(rampRgb(0.42), BELOW_INTENSITY)
    );
    expect(formatColour(vesselTargetColour({ ...visual, decision: "above" }))).toBe(
      probabilityToColour(0.42)
    );
  });
});
