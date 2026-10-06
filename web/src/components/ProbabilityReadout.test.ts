import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProbabilityReadout, type ProbabilityReadoutProps } from "./ProbabilityReadout";

const DECISION_GLYPH: Record<ProbabilityReadoutProps["decision"], string> = {
  above: "▲",
  below: "△",
  indeterminate: "▨"
};

const RELIABILITY_GLYPH: Record<ProbabilityReadoutProps["reliability"], string> = {
  strong: "●●●",
  moderate: "●●○",
  limited: "●○○"
};

const baseProps: ProbabilityReadoutProps = {
  value: 0.76,
  targetId: "LAD",
  targetLabel: "Left anterior descending",
  threshold: 0.62,
  decision: "above",
  reliability: "strong",
  size: "large"
};

const renderReadout = (overrides: Partial<ProbabilityReadoutProps> = {}): string =>
  renderToString(createElement(ProbabilityReadout, { ...baseProps, ...overrides })).replace(
    /<!-- -->/g,
    ""
  );

const readSource = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

describe("ProbabilityReadout (C-12) — required content for every size and state", () => {
  for (const size of ["compact", "large"] as const) {
    it(`renders numeric probability, threshold relation, decision + glyph, reliability + glyph at size=${size}`, () => {
      for (const decision of ["above", "below", "indeterminate"] as const) {
        for (const reliability of ["strong", "moderate", "limited"] as const) {
          const html = renderReadout({ size, decision, reliability });
          expect(html).toContain(`ct-prob-readout--${size}`);
          expect(html).toContain('role="group"');
          expect(html).toContain("76%");
          expect(html).toContain("Threshold 62%");
          expect(html).toContain("at or above threshold");
          expect(html).toContain(`Decision: ${decision}`);
          expect(html).toContain(DECISION_GLYPH[decision]);
          expect(html).toContain(`Reliability: ${reliability}`);
          expect(html).toContain(RELIABILITY_GLYPH[reliability]);
        }
      }
    });
  }

  it("states the below-threshold relation when the value is below the threshold", () => {
    const html = renderReadout({ value: 0.4, threshold: 0.62 });
    expect(html).toContain("40%");
    expect(html).toContain("Threshold 62%");
    expect(html).toContain("below threshold");
    expect(html).not.toContain("at or above threshold");
  });

  it("has no bare-probability path: even compact renders all four required parts", () => {
    const html = renderReadout({ size: "compact" });
    expect(html).toMatch(/Threshold \d+%/);
    expect(html).toMatch(/Decision: (above|below|indeterminate)/);
    expect(html).toMatch(/Reliability: (strong|moderate|limited)/);
    expect(html).toMatch(/\d+%/);
  });
});

describe("ProbabilityReadout (C-12) — accessibility", () => {
  it("wraps output in an accessible group label naming the target", () => {
    const html = renderReadout();
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Left anterior descending probability readout"');
    expect(html).toContain('data-target-id="LAD"');
  });

  it("includes an aria-live polite region announcing probability, decision and reliability", () => {
    const html = renderReadout({ decision: "indeterminate", reliability: "limited" });
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-atomic="true"');
    const liveRegion = /<div[^>]*aria-live="polite"[^>]*>([\s\S]*)<\/div>\s*<\/div>$/.exec(html);
    expect(liveRegion).not.toBeNull();
    const liveContent = liveRegion?.[1] ?? "";
    expect(liveContent).toContain("76%");
    expect(liveContent).toContain("Decision: indeterminate");
    expect(liveContent).toContain("Reliability: limited");
  });

  it("keeps glyphs as redundant decoration with the text always present", () => {
    const html = renderReadout({ decision: "below", reliability: "moderate" });
    expect(html).toContain(">△<");
    expect(html).toContain(">●●○<");
    expect(html).toContain("Decision: below");
    expect(html).toContain("Reliability: moderate");
  });
});

describe("ProbabilityReadout (C-12) — source disclosure", () => {
  it("discloses sourceTargetId when provided, using the approved wording", () => {
    const html = renderReadout({ targetId: "CAD", targetLabel: "CAD", sourceTargetId: "LAD" });
    expect(html).toContain('data-source-target-id="LAD"');
    expect(html).toContain("CAD shown from LAD");
  });

  it("omits any source disclosure when sourceTargetId is not provided", () => {
    const html = renderReadout();
    expect(html).not.toContain("shown from");
    expect(html).not.toContain("data-source-target-id");
  });
});

describe("ProbabilityReadout (C-12) — colour never carries state alone", () => {
  it("never sets text colour inline; only probability background colours appear", () => {
    const html = renderReadout({ decision: "indeterminate", reliability: "limited" });
    const styles = [...html.matchAll(/style="([^"]*)"/g)].map((match) => match[1]);
    expect(styles.length).toBeGreaterThan(0);
    for (const style of styles) {
      const withoutBackground = style.replace(/background-color:[^;"]*/g, "");
      expect(withoutBackground).not.toContain("color");
      expect(withoutBackground).not.toContain("rgb(");
    }
  });

  it("stylesheet keys no visual rule off decision or reliability", () => {
    const rules = readSource("./ProbabilityReadout.css").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(rules).not.toContain("data-decision");
    expect(rules).not.toContain("data-reliability");
    expect(rules).not.toMatch(/#[0-9a-f]{3,6}/i);
    const stateBlock =
      /\.ct-prob-readout__decision,\s*\.ct-prob-readout__reliability\s*\{[^}]*\}/.exec(rules);
    expect(stateBlock).not.toBeNull();
    expect(stateBlock?.[0] ?? "").toContain("color: var(--ct-color-text)");
    expect(stateBlock?.[0] ?? "").not.toMatch(/background/);
  });
});

describe("ProbabilityReadout (C-12) — designed states", () => {
  it("shows a designed state instead of a number for non-finite input", () => {
    const html = renderReadout({ value: Number.NaN });
    expect(html).toContain("not available");
    expect(html).toContain("cannot compare");
    expect(html).not.toContain("NaN");
  });
});

describe("ProbabilityReadout (C-12 L377) — import graph", () => {
  const componentSource = readSource("./ProbabilityReadout.tsx");
  const rampSource = readSource("../design/ramp.ts");
  const sources = [
    { name: "ProbabilityReadout.tsx", source: componentSource },
    { name: "design/ramp.ts", source: rampSource }
  ];

  it("imports nothing from store, worker, domain, scene or public JSON", () => {
    for (const { name, source } of sources) {
      const importLines = source
        .split(/\r?\n/)
        .filter((line) => /^\s*import\b/.test(line));
      expect(importLines.length, name).toBeGreaterThan(0);
      for (const line of importLines) {
        expect(line, `${name}: ${line}`).not.toMatch(
          /store|worker|domain|scene|\.json|public|App/
        );
      }
    }
  });

  it("never fetches, persists or invokes model code", () => {
    for (const { name, source } of sources) {
      expect(source, name).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/);
      expect(source, name).not.toMatch(/model\.json|results\.json|manifest\.json/);
      expect(source, name).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
    }
  });

  it("is a pure render: no React state or effect hooks in the component", () => {
    expect(componentSource).not.toMatch(/useState|useEffect|useMemo|useRef|useSyncExternalStore/);
    expect(componentSource).not.toMatch(/import[^\n]*from\s+"react"/);
  });

  it("consumes THE single ramp for its colour", () => {
    expect(componentSource).toContain('from "../design"');
    expect(componentSource).toContain("probabilityToColour(");
    expect(rampSource).toContain("interpolateCividis");
    expect(rampSource).toContain("C-11");
  });
});
