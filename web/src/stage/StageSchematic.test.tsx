import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { probabilityToColour } from "../design";
import {
  PRIMARY_STRUCTURE_CANDIDATE,
  buildSceneModel,
  buildSchematicViewModel,
  buildStructureSource,
  type QualityTier,
  type SceneEvaluationSlice,
  type SchematicViewModel
} from "../scene";
import { loadProjectRegistry, makeEvaluation, makeState } from "../scene/testFixtures";
import { BELOW_INTENSITY, DIM_SATURATION, desaturate, formatColour, parseColour, scaleIntensity } from "./colours";
import { StageSchematic, schematicStroke, schematicStrokeWidth } from "./StageSchematic";

const registry = loadProjectRegistry();

const viewFor = (
  evaluation: SceneEvaluationSlice = makeEvaluation(),
  opts: { qualityTier?: QualityTier; targetId?: "CAD" | "LAD" | "LCX" | "RCA" | null } = {}
): SchematicViewModel => {
  const state = makeState({
    eval: { current: evaluation },
    selection: { targetId: opts.targetId ?? null, hovered: null },
    view: { qualityTier: opts.qualityTier ?? "Q0" }
  });
  const scene = buildSceneModel(state, registry);
  expect(scene).not.toBeNull();
  const source = buildStructureSource(
    PRIMARY_STRUCTURE_CANDIDATE,
    (name) => ({ name }),
    registry
  );
  return buildSchematicViewModel(scene!, source, registry);
};

const htmlFor = (model: SchematicViewModel): string =>
  renderToString(<StageSchematic model={model} />);

describe("StageSchematic — 2D projection of the same scene truth (C-11 Q3)", () => {
  it("renders the registry's three vessels with authored paths, labels and the 360 box", () => {
    const model = viewFor();
    const html = htmlFor(model);

    expect(html).toContain('viewBox="0 0 360 360"');
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Coronary artery schematic"');
    expect(model.vessels.map((vessel) => vessel.structureId)).toEqual(["LAD", "LCX", "RCA"]);
    for (const vessel of model.vessels) {
      expect(html).toContain(`d="${vessel.d}"`);
      expect(html).toContain(`aria-label="${vessel.label} vessel, `);
      expect(html).toContain(`data-structure-id="${vessel.structureId}"`);
    }
    expect(html).not.toContain("HEART");
    expect(html).not.toContain("AORTA");
  });

  it("shows the decision glyph as text so nothing is encoded by colour alone", () => {
    const html = htmlFor(viewFor());
    expect(html).toContain("▲");
    expect(html).toContain("△");
    expect(html).toContain("▨");
    expect(html).toContain("at or above threshold");
    expect(html).toContain("below threshold");
    expect(html).toContain("indeterminate");
  });

  it("never renders a probability number (INV-C13: ProbabilityReadout owns values)", () => {
    const html = htmlFor(viewFor());
    expect(html).not.toContain("0.76");
    expect(html).not.toContain("0.31");
    expect(html).not.toContain("0.18");
    expect(html).not.toContain("%");
  });

  it("gives above/indeterminate strokes the exact ramp colour", () => {
    const html = htmlFor(viewFor());
    expect(html).toContain(`stroke="${probabilityToColour(0.76)}"`);
    expect(html).toContain(`stroke="${probabilityToColour(0.31)}"`);
  });

  it("gives a below vessel the same reduced intensity the 3D materials use", () => {
    const html = htmlFor(viewFor());
    const expected = formatColour(scaleIntensity(parseColour(probabilityToColour(0.18)), BELOW_INTENSITY));
    expect(html).toContain(`stroke="${expected}"`);
    expect(expected).not.toBe(probabilityToColour(0.18));
  });

  it("hatches indeterminate vessels while the tier keeps hatching", () => {
    const html = htmlFor(viewFor(undefined, { qualityTier: "Q0" }));
    expect(html).toContain("<pattern");
    expect(html).toContain('stroke="url(#ct-stage-hatch-');
    expect(html).toContain('class="ct-stage-schematic__hatch"');
    expect(html.match(/class="ct-stage-schematic__hatch"/g)).toHaveLength(1);
  });

  it("Q2 replaces the hatch with the glyph + text label, still no colour-only state", () => {
    const html = htmlFor(viewFor(undefined, { qualityTier: "Q2" }));
    expect(html).not.toContain("<pattern");
    expect(html).not.toContain("url(#");
    expect(html).toContain("▨");
    expect(html).toContain("indeterminate");
    expect(html).toContain('data-tier="Q2"');
  });

  it("selection widens the stroke and dims the others by desaturation, never opacity", () => {
    const model = viewFor(undefined, { targetId: "LAD" });
    const html = htmlFor(model);

    const lad = model.vessels.find((vessel) => vessel.structureId === "LAD")!;
    const lcx = model.vessels.find((vessel) => vessel.structureId === "LCX")!;
    expect(lad.selected).toBe(true);
    expect(lcx.dimmed).toBe(true);

    expect(html).toContain('data-selected="true"');
    expect(html).toContain('data-selected="false"');
    expect(html).toContain(`stroke-width="${schematicStrokeWidth(lad)}"`);
    expect(schematicStrokeWidth(lad)).toBe(lad.strokeWidth + 3);

    const dimmedExpected = formatColour(
      desaturate(parseColour(probabilityToColour(0.31)), DIM_SATURATION)
    );
    expect(html).toContain(`stroke="${dimmedExpected}"`);
    expect(dimmedExpected).not.toBe(probabilityToColour(0.31));
    expect(html).not.toContain("opacity");
    expect(html).not.toContain('stroke-opacity');
    expect(html).not.toContain('fill-opacity');
  });

  it("keyboard path: every vessel is a focusable button that selects on activation", () => {
    const html = htmlFor(viewFor());
    expect(html.match(/role="button"/g)).toHaveLength(3);
    expect(html.match(/tabindex="0"/g)).toHaveLength(3);
    expect(html.match(/aria-pressed="/g)).toHaveLength(3);
  });
});

describe("schematicStroke / schematicStrokeWidth", () => {
  it("is the identity for an above, non-dimmed vessel (one-ramp provenance)", () => {
    const stroke = probabilityToColour(0.76);
    expect(schematicStroke({ stroke, decisionLabel: "above", dimmed: false })).toBe(stroke);
  });

  it("keeps indeterminate hue unchanged — decision never recolours", () => {
    const stroke = probabilityToColour(0.31);
    expect(schematicStroke({ stroke, decisionLabel: "indeterminate", dimmed: false })).toBe(stroke);
  });

  it("applies below-intensity then dim, in that order, without opacity", () => {
    const stroke = probabilityToColour(0.18);
    const dimmedOnly = schematicStroke({ stroke, decisionLabel: "above", dimmed: true });
    expect(dimmedOnly).toBe(formatColour(desaturate(parseColour(stroke), DIM_SATURATION)));

    const belowDimmed = schematicStroke({ stroke, decisionLabel: "below", dimmed: true });
    expect(belowDimmed).toBe(
      formatColour(desaturate(scaleIntensity(parseColour(stroke), BELOW_INTENSITY), DIM_SATURATION))
    );
  });

  it("fails loudly on a colour the ramp could never emit", () => {
    expect(() =>
      schematicStroke({ stroke: "hotpink", decisionLabel: "above", dimmed: false })
    ).toThrow(RangeError);
  });

  it("width: selection outranks hover; hover alone lifts slightly", () => {
    expect(schematicStrokeWidth({ strokeWidth: 11, selected: true, hovered: false })).toBe(14);
    expect(schematicStrokeWidth({ strokeWidth: 11, selected: true, hovered: true })).toBe(14);
    expect(schematicStrokeWidth({ strokeWidth: 11, selected: false, hovered: true })).toBe(12.5);
    expect(schematicStrokeWidth({ strokeWidth: 11, selected: false, hovered: false })).toBe(11);
  });
});
