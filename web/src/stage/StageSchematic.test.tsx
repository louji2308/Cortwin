import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { buildSceneModel } from "../scene/buildSceneModel";
import { buildSchematicViewModel } from "../scene/schematicViewModel";
import { loadProjectRegistry, makeEvaluation, makeState } from "../scene/testFixtures";
import { StageSchematic } from "./StageSchematic";
import type { QualityTier, SceneEvaluationSlice } from "../scene/types";

/**
 * StageSchematic mode laws — the two variants of the one schematic renderer.
 *
 * `"stage"` is the full interactive 2D vessel map (C-11 Q3): a focusable
 * group with a per-vessel tab stop and an accessible name.
 *
 * `"mirror"` is the compact non-interactive minimap shown inside the 3D stage
 * (C-11 §8.1). Its root MUST NOT carry the `ct-stage-schematic` class: the
 * degraded-mode e2e specs count `svg.ct-stage-schematic` page-wide and scoped
 * to the stage, and a second instance would break that count. It is
 * `aria-hidden` with no `tabindex`, so it never enters the a11y T1 tab
 * budget or the T6 44px target sweep.
 */

const registry = loadProjectRegistry();

function viewFor(evaluation: SceneEvaluationSlice) {
  const state = makeState({
    eval: { current: evaluation },
    selection: { targetId: null, hovered: null },
    view: { qualityTier: "Q3" as QualityTier }
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
}

const model = viewFor(makeEvaluation());

describe("StageSchematic stage variant (default)", () => {
  const html = renderToString(
    <StageSchematic
      model={model}
      onVesselHover={() => undefined}
      onVesselSelect={() => undefined}
    />
  );

  it("uses the interactive schematic class and an accessible name", () => {
    expect(html).toContain('class="ct-stage-schematic"');
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Coronary artery schematic"');
    expect(html).not.toContain("ct-stage-schematic--minimap");
  });

  it("exposes a per-vessel tab stop for keyboard selection", () => {
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('role="button"');
  });

  it("is not itself hidden from assistive technology", () => {
    // Decorative <text> labels are aria-hidden inside the group — that is
    // correct; only the root must stay announced.
    expect(html).not.toMatch(/^<svg[^>]*aria-hidden/);
  });
});

describe("StageSchematic mirror variant (the in-3D minimap)", () => {
  const html = renderToString(<StageSchematic model={model} variant="mirror" />);

  it("uses the minimap class and NOT the interactive schematic class", () => {
    expect(html).toContain('class="ct-stage-schematic--minimap"');
    expect(html).not.toMatch(/class="ct-stage-schematic"/);
  });

  it("hides the whole minimap from assistive technology", () => {
    expect(html).toContain('aria-hidden="true"');
  });

  it("carries no accessible name and no group role", () => {
    expect(html).not.toContain("role=");
    expect(html).not.toContain("aria-label=");
  });

  it("is not tabbable and exposes no button semantics", () => {
    expect(html).not.toContain("tabindex");
    expect(html).not.toContain('role="button"');
  });

  it("still draws the three vessels by structure id (identity preserved)", () => {
    // data-structure-id appears on both the <g> wrapper and the vessel <path>.
    expect((html.match(/data-structure-id="/g) ?? []).length).toBe(6);
    expect((html.match(/class="ct-stage-schematic__vessel"/g) ?? []).length).toBe(3);
    expect(html).toContain('data-structure-id="LAD"');
    expect(html).toContain('data-structure-id="LCX"');
    expect(html).toContain('data-structure-id="RCA"');
  });
});
