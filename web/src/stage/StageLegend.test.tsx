import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import {
  LEGEND_STOP_COUNT,
  StageLegend,
  legendColours,
  markerPercent
} from "./StageLegend";

/**
 * StageLegend — the C-11 §8.1 in-viewer probability legend (explore F.2).
 *
 * INV-C13 / F.1: the legend must never render a clinical number as text. The
 * threshold is expressed only as a CSS-position percentage inside a `style`
 * attribute (which the explore F.1 law exempts), so the only percentage-like
 * *text* tokens are the fixed scale captions "low" and "high". The colour bar
 * is sampled from THE ramp the caller passes (`probabilityToColour`); this
 * component owns no colour literal.
 */

/** A deterministic stand-in for THE ramp: asserts the sampler is what draws. */
const ramp = (probability: number): string => `rgb(${Math.round(probability * 100)},0,0)`;

describe("legendColours", () => {
  it("samples THE ramp once per stop, low to high", () => {
    const colours = legendColours(ramp);
    expect(colours).toHaveLength(LEGEND_STOP_COUNT);
    expect(colours[0]).toBe("rgb(0,0,0)");
    expect(colours[LEGEND_STOP_COUNT - 1]).toBe("rgb(100,0,0)");
    for (let index = 1; index < colours.length; index += 1) {
      expect(colours[index]).not.toBe(colours[index - 1]);
    }
  });
});

describe("markerPercent", () => {
  it("clamps a fraction to a [0,100] CSS-position percentage", () => {
    expect(markerPercent(0.5)).toBe(50);
    expect(markerPercent(0)).toBe(0);
    expect(markerPercent(1)).toBe(100);
    expect(markerPercent(-1)).toBe(0);
    expect(markerPercent(2)).toBe(100);
    expect(markerPercent(Number.NaN)).toBe(0);
    expect(markerPercent(Number.POSITIVE_INFINITY)).toBe(0);
    expect(markerPercent(Number.NEGATIVE_INFINITY)).toBe(0);
  });
});

describe("StageLegend", () => {
  it("draws the colour bar from THE ramp, never a literal of its own", () => {
    const html = renderToString(
      <StageLegend ramp={ramp} targetLabel="LAD" threshold={0.5} />
    );
    expect(html).toContain("linear-gradient(90deg, rgb(0,0,0),");
    expect(html).toContain("rgb(100,0,0))");
  });

  it("anchors the threshold marker at its ramp position, in style only", () => {
    const html = renderToString(
      <StageLegend ramp={ramp} targetLabel="LAD" threshold={0.5} />
    );
    expect(html).toContain("ct-stage__legend-marker");
    expect(html).toContain('style="left:50%"');
  });

  it("labels the marker with the target's threshold in text (not colour alone)", () => {
    const html = renderToString(
      <StageLegend ramp={ramp} targetLabel="LAD" threshold={0.5} />
    );
    expect(html).toContain("LAD threshold");
  });

  it("hides the marker and names the empty state when there is no evaluation", () => {
    const html = renderToString(
      <StageLegend ramp={ramp} targetLabel="LAD" threshold={null} />
    );
    expect(html).toContain('data-anchored="false"');
    expect(html).not.toContain("ct-stage__legend-marker");
    expect(html).toContain("threshold unavailable");
  });

  it("never renders a clinical number as text (INV-C13 / F.1)", () => {
    const anchored = renderToString(
      <StageLegend ramp={ramp} targetLabel="LAD" threshold={0.73} />
    );
    const unanchored = renderToString(
      <StageLegend ramp={ramp} targetLabel="LAD" threshold={null} />
    );
    for (const html of [anchored, unanchored]) {
      // Strip every attribute: F.1 exempts style-attribute `%`, not text.
      const textOnly = html.replace(/<[^>]*>/g, " ");
      expect(textOnly).not.toMatch(/\d/);
      expect(textOnly).not.toMatch(/%/);
      expect(textOnly).not.toMatch(/0\.73/);
    }
    expect(anchored).toContain('style="left:73%"');
  });

  it("labels the colour ramp for assistive technology", () => {
    const html = renderToString(
      <StageLegend ramp={ramp} targetLabel="LAD" threshold={0.5} />
    );
    expect(html).toContain('aria-label="Calibrated risk colour ramp, low to high"');
  });
});
