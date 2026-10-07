import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { scanSource, violations } from "../copy/copyLint";
import { BANNED_PHRASES } from "../copy/vocabulary";
import {
  COLOUR_EXPLAINER_COPY,
  ColourMeaningExplainer,
  DECISION_GLYPH,
  RELIABILITY_GLYPH
} from "./ColourMeaningExplainer";

/**
 * P1-b blocking suite — the `ⓘ` "what this colour means" explainer.
 *
 * Three groups, each mapped to the mission's acceptance evidence:
 *   1. C-13 copy law: the component source must carry ZERO unpragma'd banned
 *      phrases; the single sanctioned line must carry its `c13-allow:`
 *      pragma; and the mutation case injects EVERY banned phrase into EVERY
 *      copy line (and into the whole source file) and REQUIRES a violation —
 *      if the lint ever stops flagging, this suite goes red.
 *   2. Rendered truths: colour = probability on the cividis ramp only,
 *      identity = label + position, hatch = indeterminate, glyph set,
 *      threshold/decision/tier come from the model artifact, and NO number
 *      or percent sign is rendered (C-12: numbers stay inside
 *      ProbabilityReadout).
 *   3. Disclosure accessibility: native button, aria-expanded/aria-controls
 *      wiring, labelled group panel, hidden until opened — plus host mount,
 *      glyph-set sync with ProbabilityReadout and stylesheet discipline.
 */

const readSource = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

const COMPONENT_SOURCE = readSource("./ColourMeaningExplainer.tsx");
const READOUT_SOURCE = readSource("./ProbabilityReadout.tsx");
const HOST_SOURCE = readSource("../explore/ExploreView.tsx");
const STYLESHEET = readSource("./ColourMeaningExplainer.css");

/** SSR escapes apostrophes (`&#x27;`); unescape so copy matches verbatim. */
const renderExplainer = (defaultOpen?: boolean): string =>
  renderToString(
    defaultOpen === undefined ? (
      <ColourMeaningExplainer />
    ) : (
      <ColourMeaningExplainer defaultOpen={defaultOpen} />
    )
  )
    .replace(/<!--.*?-->/g, "")
    .replace(/&#x27;/g, "'");


/* ------------------------------------------------------------------ *
 * 1. C-13 copy law (blocking) — positive, sanctioned, mutation/negative
 * ------------------------------------------------------------------ */

describe("C-13 copy law over the explainer (blocking)", () => {
  it("the component source contains ZERO unpragma'd banned phrases", () => {
    const findings = scanSource(COMPONENT_SOURCE);
    expect(violations(findings).map((f) => `${f.line} banned: ${f.phrase}`)).toEqual([]);
  });

  it("any sanctioned finding sits on the limitation copy line with a non-empty reason", () => {
    const sanctioned = scanSource(COMPONENT_SOURCE).filter((f) => f.pragma !== null);
    expect(sanctioned.length).toBeGreaterThanOrEqual(1);
    for (const finding of sanctioned) {
      expect(finding.pragma?.length ?? 0).toBeGreaterThan(0);
      const line = COMPONENT_SOURCE.split(/\r?\n/)[finding.line - 1] ?? "";
      expect(line).toContain("limitation:");
      expect(line).toContain(finding.phrase);
    }
  });

  it("every copy line scans clean on its own EXCEPT the sanctioned limitation line", () => {
    for (const [key, line] of Object.entries(COLOUR_EXPLAINER_COPY)) {
      const blocking = violations(scanSource(line));
      if (key === "limitation") {
        // The flagged phrase, unpragma'd in isolation, MUST be a violation —
        // this is the negative case for the explainer's own copy: only the
        // `c13-allow:` pragma on the source line sanctions it (C-13 L409).
        expect(blocking, key).toHaveLength(1);
      } else {
        expect(blocking.map((f) => `${key}: ${f.phrase}`), key).toEqual([]);
      }
    }
  });

  it("MUTATION: every banned phrase injected into every copy line fails the lint", () => {
    const lines = Object.entries(COLOUR_EXPLAINER_COPY);
    expect(BANNED_PHRASES.length).toBeGreaterThan(0);
    expect(lines.length).toBeGreaterThan(5);
    for (const [key, line] of lines) {
      for (const phrase of BANNED_PHRASES) {
        const injected = scanSource(`const copy = "${line} ${phrase}";`);
        expect(
          violations(injected).length,
          `injected "${phrase}" into copy.${key} must be a violation`
        ).toBeGreaterThan(0);
      }
    }
  });

  it("MUTATION: a banned phrase appended anywhere in the component source fails the lint", () => {
    for (const phrase of BANNED_PHRASES) {
      const mutated = scanSource(`${COMPONENT_SOURCE}\n// appended ${phrase}\n`);
      expect(
        violations(mutated).length,
        `injected "${phrase}" into the component source must be a violation`
      ).toBeGreaterThan(0);
    }
  });
});

/* ------------------------------------------------------------------ *
 * 2. Rendered truths — what the judge is taught in one click
 * ------------------------------------------------------------------ */

describe("rendered truths — colour is probability, identity is label+position", () => {
  it("states the one-ramp law: cividis, calibrated probability, one value one colour", () => {
    const html = renderExplainer();
    expect(html).toContain(COLOUR_EXPLAINER_COPY.ramp);
    expect(html).toContain("cividis");
    expect(html).toContain("whole-vessel probability");
    expect(html).toContain("calibrated cividis ramp");
  });

  it("states identity is label and position, never the shade", () => {
    const html = renderExplainer(true);
    expect(html).toContain(COLOUR_EXPLAINER_COPY.identity);
    expect(html).toContain("Colour never identifies a vessel");
    expect(html).toContain("label and the position");
  });

  it("states the explicit limitation: colour never encodes a lesion's position or severity", () => {
    const html = renderExplainer(true);
    expect(html).toContain(COLOUR_EXPLAINER_COPY.limitation);
    expect(COLOUR_EXPLAINER_COPY.limitation).toContain("never encodes");
    expect(COLOUR_EXPLAINER_COPY.limitation).toContain("lesion");
    expect(COLOUR_EXPLAINER_COPY.limitation).toContain("severity of a specific lesion");
  });

  it("threshold, decision and reliability are attributed to the stored artifact / model response", () => {
    const html = renderExplainer(true);
    expect(html).toContain(COLOUR_EXPLAINER_COPY.threshold);
    expect(html).toContain("stored with the model artifact");
    expect(html).toContain("never a fixed default");
    expect(html).toContain("same model response");
    expect(html).toContain(COLOUR_EXPLAINER_COPY.cohort);
    expect(html).toContain("not provided");
    expect(html).toContain("indeterminate");
  });

  it("renders the full glyph set with text beside every glyph", () => {
    const html = renderExplainer(true);
    for (const glyph of Object.values(DECISION_GLYPH)) {
      expect(html, glyph).toMatch(new RegExp(`aria-hidden="true"[^>]*>${glyph}<`));
    }
    for (const glyph of Object.values(RELIABILITY_GLYPH)) {
      expect(html, glyph).toMatch(new RegExp(`aria-hidden="true"[^>]*>${glyph}<`));
    }
    expect(html).toContain(COLOUR_EXPLAINER_COPY.glyphAbove);
    expect(html).toContain(COLOUR_EXPLAINER_COPY.glyphBelow);
    expect(html).toContain(COLOUR_EXPLAINER_COPY.glyphIndeterminate);
    expect(html).toContain("hatched for indeterminate");
    expect(html).toContain(COLOUR_EXPLAINER_COPY.glyphTail);
    expect(html).toContain(COLOUR_EXPLAINER_COPY.reliabilityStrong);
    expect(html).toContain(COLOUR_EXPLAINER_COPY.reliabilityModerate);
    expect(html).toContain(COLOUR_EXPLAINER_COPY.reliabilityLimited);
  });

  it("renders NO number and NO percent sign — every number stays in ProbabilityReadout", () => {
    for (const html of [renderExplainer(), renderExplainer(true)]) {
      expect(html).not.toContain("%");
      expect(html).not.toMatch(/\d+\.\d+/);
    }
  });

  it("renders no data colour: no inline background, no ramp import", () => {
    const html = renderExplainer(true);
    expect(html).not.toContain("background-color");
    expect(html).not.toContain("rgb(");
    expect(COMPONENT_SOURCE).not.toContain("probabilityToColour");
    expect(COMPONENT_SOURCE).not.toMatch(/from "\.\.\/design/);
  });
});

/* ------------------------------------------------------------------ *
 * 3. Disclosure accessibility (keyboard + aria) and host integration
 * ------------------------------------------------------------------ */

describe("accessibility — disclosure pattern", () => {
  it("closed: native button announces aria-expanded=false and controls the hidden panel", () => {
    const html = renderExplainer();
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-expanded="false"');
    const controls = /aria-controls="([^"]+)"/.exec(html);
    expect(controls).not.toBeNull();
    const panelId = controls?.[1] ?? "";
    expect(panelId).not.toBe("");
    expect(html).toContain(`id="${panelId}"`);
    expect(html).toContain("hidden");
    expect(html).toMatch(new RegExp(`id="${panelId}"[^>]*hidden`));
    expect(html).toContain('role="group"');
    expect(html).toContain(`aria-labelledby="ct-colour-key-toggle"`);
    expect(html).toContain('id="ct-colour-key-toggle"');
    expect(html).toContain('data-testid="colour-meaning-explainer"');
  });

  it("open (defaultOpen): aria-expanded=true and the panel is no longer hidden", () => {
    const html = renderExplainer(true);
    expect(html).toContain('aria-expanded="true"');
    const panelTag = /<div[^>]*id="ct-colour-key-panel"[^>]*>/.exec(html);
    expect(panelTag).not.toBeNull();
    expect(panelTag?.[0] ?? "").not.toContain("hidden");
  });

  it("the ⓘ affordance text and its accessible name are the approved wording", () => {
    const html = renderExplainer();
    expect(html).toContain(COLOUR_EXPLAINER_COPY.toggle);
    expect(html).toMatch(/aria-hidden="true"[^>]*>ⓘ</);
  });

  it("glyph-set sync: identical to the glyphs ProbabilityReadout renders (one glyph system)", () => {
    for (const [key, glyph] of Object.entries(DECISION_GLYPH)) {
      expect(READOUT_SOURCE, `decision ${key}`).toContain(`${key}: "${glyph}"`);
    }
    for (const [key, glyph] of Object.entries(RELIABILITY_GLYPH)) {
      expect(READOUT_SOURCE, `reliability ${key}`).toContain(`${key}: "${glyph}"`);
    }
  });

  it("imports nothing but React and its own stylesheet (no store/ramp/artifact/network)", () => {
    const importLines = COMPONENT_SOURCE.split(/\r?\n/).filter((line) => /^\s*import\b/.test(line));
    expect(importLines.length).toBeGreaterThan(0);
    for (const line of importLines) {
      expect(line).toMatch(/from "react"|"\.\/ColourMeaningExplainer\.css"/);
      expect(line).not.toMatch(/store|worker|domain|scene|\.json|public|design|fetch/);
    }
    expect(COMPONENT_SOURCE).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage/);
  });
});

describe("host mount — one additive mount in ExploreView", () => {
  it("ExploreView imports the explainer and mounts it exactly once, laws untouched", () => {
    expect(HOST_SOURCE).toContain(
      'import { ColourMeaningExplainer } from "../components/ColourMeaningExplainer"'
    );
    expect((HOST_SOURCE.match(/<ColourMeaningExplainer \/>/g) ?? []).length).toBe(1);
    // The explore laws this unit must not disturb (exploreLaws F.1 / F.5):
    expect((HOST_SOURCE.match(/<ProbabilityReadout /g) ?? []).length).toBe(2);
    expect((HOST_SOURCE.match(/useState</g) ?? []).length).toBe(1);
    expect(HOST_SOURCE).not.toContain("%");
  });

  it("the mount sits in the readouts container beside the vessel colour", () => {
    const start = HOST_SOURCE.indexOf("<ColourMeaningExplainer />");
    const containerStart = HOST_SOURCE.lastIndexOf("ct-explore__readouts", start);
    expect(containerStart).toBeGreaterThanOrEqual(0);
    expect(start).toBeGreaterThan(containerStart);
  });
});

describe("stylesheet discipline — tokens only, 44px, hidden panel, no animation", () => {
  const CSS_RULES = STYLESHEET.replace(/\/\*[\s\S]*?\*\//g, "");

  it("contains no colour literal and no data colour function", () => {
    expect(CSS_RULES).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(CSS_RULES).not.toMatch(/\b(?:rgb|rgba|hsl|hsla|hwb|color-mix|lab|oklch)\(/);
  });

  it("gives the toggle a 44 px target in both axes via the shared token", () => {
    expect(CSS_RULES).toMatch(/\.ct-colour-key__toggle \{[^}]*min-height: var\(--ct-target-min\)/);
    expect(CSS_RULES).toMatch(/\.ct-colour-key__toggle \{[^}]*min-width: var\(--ct-target-min\)/);
  });

  it("keeps the hidden panel actually hidden despite author display rules", () => {
    expect(CSS_RULES).toContain(".ct-colour-key__panel[hidden]");
    expect(CSS_RULES).toMatch(/\.ct-colour-key__panel\[hidden\] \{\s*display: none;/);
  });

  it("has no animation and its only transition rides the shared motion token", () => {
    expect(CSS_RULES).not.toMatch(/animation\s*:/);
    expect(CSS_RULES).not.toMatch(/@keyframes/);
    const transitions = [...CSS_RULES.matchAll(/transition:\s*([^;]+);/g)].map((m) => m[1]);
    expect(transitions.length).toBeGreaterThan(0);
    for (const transition of transitions) {
      expect(transition).toMatch(/var\(--ct-transition-/);
      expect(transition).not.toMatch(/\d+m?s\b/);
    }
  });

  it("text colour comes from the shared text token (AA contrast via tokens.css)", () => {
    expect(CSS_RULES).toMatch(/color: var\(--ct-color-text\)/);
    expect(CSS_RULES).not.toMatch(/color:\s*#[0-9a-fA-F]/);
  });
});
