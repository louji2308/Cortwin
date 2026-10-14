import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { StageTagLayer, type StageTagContentEntry } from "./StageTagLayer";

/**
 * StageTagLayer — the C-11 §8.1 "vessel tags" DOM labels (AGENTS §6.1).
 *
 * Tags float over the 3D canvas and therefore CANNOT be interactive controls:
 * they are `aria-hidden` and carry no `tabindex`, so they never enter the tab
 * order. That keeps the a11y T1 budget intact (stage container → vessel cards
 * within 8 tabs) and keeps the T6 44px sweep from measuring a label that
 * overlaps the canvas. Identity is the registry label + the decision glyph;
 * colour is the descriptor albedo the 3D material shows, and nothing is
 * encoded by colour alone.
 */

const content: StageTagContentEntry[] = [
  { id: "LAD", label: "Left anterior descending", colour: "#c9d94a", glyph: "▲", selected: true },
  { id: "LCX", label: "Left circumflex", colour: "#5b6c8f", glyph: "△", selected: false },
  { id: "RCA", label: "Right coronary", colour: "#2b3a55", glyph: "▨", selected: false }
];

describe("StageTagLayer", () => {
  it("renders one tag per vessel", () => {
    const html = renderToString(<StageTagLayer layouts={[]} content={content} />);
    expect((html.match(/class="ct-stage__tag"/g) ?? []).length).toBe(3);
  });

  it("hides the layer from assistive technology (tags are not controls)", () => {
    const html = renderToString(<StageTagLayer layouts={[]} content={content} />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("tabindex");
    expect(html).not.toContain("role=");
    expect(html).not.toContain("<button");
  });

  it("never encodes identity by colour alone: every tag carries label + glyph", () => {
    const html = renderToString(<StageTagLayer layouts={[]} content={content} />);
    expect(html).toContain("Left anterior descending");
    expect(html).toContain("▲");
    expect(html).toContain("Left circumflex");
    expect(html).toContain("△");
    expect(html).toContain("Right coronary");
    expect(html).toContain("▨");
  });

  it("carries the exact descriptor albedo on the dot (one truth per colour)", () => {
    const html = renderToString(<StageTagLayer layouts={[]} content={content} />);
    expect(html).toContain('class="ct-stage__tag-dot"');
    expect(html).toContain("background:#c9d94a");
    expect(html).toContain("background:#5b6c8f");
    expect(html).toContain("background:#2b3a55");
  });

  it("marks the selected vessel structurally, not by colour alone", () => {
    const html = renderToString(<StageTagLayer layouts={[]} content={content} />);
    expect(html).toContain('data-selected="true"');
    expect(html).toContain('data-selected="false"');
    expect(html).toContain('data-structure-id="LAD"');
  });

  it("never renders a probability number (INV-C13)", () => {
    const html = renderToString(<StageTagLayer layouts={[]} content={content} />);
    const textOnly = html.replace(/<[^>]*>/g, " ");
    expect(textOnly).not.toMatch(/\d/);
    expect(textOnly).not.toMatch(/%/);
  });

  it("keeps a tag hidden until the projector supplies a visible layout", () => {
    const html = renderToString(<StageTagLayer layouts={[]} content={content} />);
    expect(html).toContain("visibility:hidden");
  });

  it("positions a projected tag with the imperative transform channel", () => {
    const html = renderToString(
      <StageTagLayer
        layouts={[
          { id: "LAD", x: 120, y: 80, visible: true },
          { id: "LCX", x: 40, y: 200, visible: false }
        ]}
        content={content}
      />
    );
    expect(html).toContain("translate3d(120px, 80px, 0)");
    expect(html).toContain("visibility:visible");
    expect(html).toContain("translate3d(40px, 200px, 0)");
  });
});
