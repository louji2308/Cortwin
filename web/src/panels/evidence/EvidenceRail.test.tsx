import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EVIDENCE_RAIL_CAVEAT } from "./copy";
import { EvidenceRail } from "./EvidenceRail";
import { EMPTY_STAGES, buildLadderStages, buildNoneProvidedStages } from "./fixtures";
import type { EvidenceRailProps, EvidenceStage } from "./types";

const noop = (): void => {};

function baseProps(overrides: Partial<EvidenceRailProps> = {}): EvidenceRailProps {
  return {
    stages: buildLadderStages(),
    currentStageId: "history",
    customSubset: false,
    buildUp: { state: "idle" },
    onSelectStage: noop,
    onBuildUpToggle: noop,
    ...overrides
  };
}

function render(props: EvidenceRailProps): string {
  return renderToString(<EvidenceRail {...props} />);
}

function openTag(html: string, testid: string): string {
  const pattern = new RegExp(`<[a-z]+[^>]*data-testid="${testid}"[^>]*>`);
  return html.match(pattern)?.[0] ?? "";
}

const RAIL_DIR = path.dirname(fileURLToPath(import.meta.url));

const SOURCE_FILES = readdirSync(RAIL_DIR)
  .filter((file) => /\.(ts|tsx)$/.test(file) && !file.includes(".test."))
  .sort();

function readSource(file: string): string {
  return readFileSync(path.join(RAIL_DIR, file), "utf8");
}

function importSpecifiers(text: string): string[] {
  const specs: string[] = [];
  for (const match of text.matchAll(/from\s*["']([^"']+)["']/g)) {
    specs.push(match[1]);
  }
  for (const match of text.matchAll(/import\s*["']([^"']+)["']/g)) {
    specs.push(match[1]);
  }
  return specs;
}

const BANNED_MODULES: Array<[string, RegExp]> = [
  ["design tokens / colour ramp", /design|ramp/i],
  ["ProbabilityReadout", /ProbabilityReadout/],
  ["state store", /store|zustand/i],
  ["worker", /worker/i],
  ["domain engine", /domain/i],
  ["json artifact", /\.json$/]
];

/* Labels are written as pattern fragments, never as literal flagged phrases. */
const BANNED_PHRASES: Array<[string, RegExp]> = [
  [String.raw`diagnos(e|ed|is|ing)`, /diagnos(?:e|ed|is|ing)/i],
  [String.raw`detec(t|ted|tion)`, /detec(?:t|ted|tion)/i],
  [String.raw`recommen(d|ded|dation)`, /recommen(?:d|ded|dation)/i],
  [String.raw`treatment impa\w*`, /treatment\s+impa\w*/i],
  [String.raw`treatment effec\w*`, /treatment\s+effec\w*/i],
  [String.raw`caused b\w*`, /caused\s+b\w*/i],
  [String.raw`caus(es|ing)`, /caus(?:es|ing)\b/i],
  [String.raw`prov(es|en)`, /prov(?:es|en)\b/i],
  [String.raw`lesion locat\w*`, /lesion\s+locat\w*/i],
  [String.raw`plaque locat\w*`, /plaque\s+locat\w*/i]
];

function assertVocabulary(text: string, origin: string): void {
  const cleaned = text
    .split("\n")
    .filter((line) => !line.includes("EVIDENCE_RAIL_CAVEAT"))
    .join("\n")
    .replaceAll(EVIDENCE_RAIL_CAVEAT, "");
  for (const [label, pattern] of BANNED_PHRASES) {
    expect(pattern.test(cleaned), `${origin} contains a ${label} phrase`).toBe(false);
  }
}

describe("EvidenceRail markup", () => {
  it("renders the default state: caveat, ladder, current stage, Build Up", () => {
    const html = render(baseProps());

    expect(html).toContain('data-testid="evidence-rail"');
    expect(html).toContain("Evidence Rail");
    expect(html).toContain(EVIDENCE_RAIL_CAVEAT);
    expect(EVIDENCE_RAIL_CAVEAT).toContain("cumulative information");
    expect(EVIDENCE_RAIL_CAVEAT).toMatch(/not a recomm\w+ work-up/);

    expect((html.match(/data-testid="stage-chip-/g) ?? []).length).toBe(5);
    expect((html.match(/aria-current="step"/g) ?? []).length).toBe(1);
    expect((html.match(/tabindex="0"/g) ?? []).length).toBe(1);

    const currentChip = html.match(
      /<button[^>]*data-testid="stage-chip-history"[^>]*>[\s\S]*?<\/button>/
    )?.[0];
    expect(currentChip ?? "").toContain('aria-current="step"');
    expect(currentChip ?? "").toContain('tabindex="0"');
    expect(currentChip ?? "").toContain(">current<");

    const otherChip = html.match(
      /<button[^>]*data-testid="stage-chip-ecg"[^>]*>/
    )?.[0];
    expect(otherChip ?? "").not.toContain("aria-current");
    expect(otherChip ?? "").toContain('tabindex="-1"');

    const button = openTag(html, "build-up-button");
    expect(button).toContain('data-state="idle"');
    expect(button).toContain('aria-busy="false"');
    expect(button).not.toContain("disabled");
    expect(html).toContain("Build Up");
    expect(html).toContain("Ready - select a stage, or start Build Up.");

    expect(openTag(html, "stage-panel")).not.toBe("");
    expect(html).toContain("Stage 1 of 5");
    expect(html).toContain("1 of 5 modalities provided.");
    expect(html).toContain(">Provided<");
    expect(html).toContain(">Not provided<");
    expect(html).not.toContain('data-testid="custom-subset-warning"');
  });

  it("shows the contract caveat as a visible limitation statement", () => {
    const html = render(baseProps());
    const caveat = html.match(
      /<p[^>]*data-testid="evidence-caveat"[^>]*>[^<]*<\/p>/
    )?.[0];
    expect(caveat ?? "").toContain(EVIDENCE_RAIL_CAVEAT);
  });

  it("shows the custom-subset warning chip when customSubset is true", () => {
    const html = render(baseProps({ customSubset: true }));
    expect(html).toContain('data-testid="custom-subset-warning"');
    expect(html).toContain("Custom subset (unvalidated)");
    expect(html).toContain(
      "Cumulative-ladder validation claims no longer apply; cohort-AUC display is suppressed."
    );
    expect(html).toContain("⚠");
    expect(html).toContain(EVIDENCE_RAIL_CAVEAT);
  });

  it("omits the custom-subset warning when customSubset is false", () => {
    const html = render(baseProps({ customSubset: false }));
    expect(html).not.toContain('data-testid="custom-subset-warning"');
  });

  it("renders the playing Build Up state as busy and toggleable", () => {
    const html = render(baseProps({ buildUp: { state: "playing" }, currentStageId: "ecg" }));
    const button = openTag(html, "build-up-button");
    expect(button).toContain('data-state="playing"');
    expect(button).toContain('aria-busy="true"');
    expect(button).not.toContain("disabled");
    expect(html).toContain("Playing Stage 3 of 5 - ECG.");
  });

  it("renders the done Build Up state as visibly inert", () => {
    const html = render(baseProps({ buildUp: { state: "done" } }));
    const button = openTag(html, "build-up-button");
    expect(button).toContain('data-state="done"');
    expect(button).toContain('disabled=""');
    expect(html).toContain("Complete - all stages played.");
  });

  it("renders a designed empty state for an empty stage list", () => {
    const html = render(baseProps({ stages: EMPTY_STAGES, currentStageId: null }));

    expect(html).toContain('data-testid="empty-stages"');
    expect(html).toContain("No stages available");
    expect(html).toContain("The evidence ladder has no stages to show yet.");
    expect(html).not.toContain("stage-chip-");
    expect(html).not.toContain('data-testid="stage-panel"');
    expect(openTag(html, "build-up-button")).toContain('disabled=""');
    expect(html).toContain("No stages available to build up.");
    expect(html).toContain(EVIDENCE_RAIL_CAVEAT);
  });

  it("renders an honest none-provided state and trusts the provided flag over stage order", () => {
    const html = render(baseProps({ stages: buildNoneProvidedStages(), currentStageId: "echo" }));

    expect(html).toContain("Stage 5 of 5");
    expect(html).toContain('data-state="none-provided"');
    expect(html).toContain("No modalities are provided at this stage.");
    expect((html.match(/data-provided="no"/g) ?? []).length).toBe(5);
    expect((html.match(/>Not provided</g) ?? []).length).toBe(5);
    expect((html.match(/>Provided</g) ?? []).length).toBe(0);
  });

  it("renders a designed no-selection state instead of a blank rail", () => {
    for (const currentStageId of [null, "missing-stage"]) {
      const html = render(baseProps({ currentStageId }));
      expect(html).not.toContain('aria-current="step"');
      expect(html).toContain('data-testid="no-stage-selected"');
      expect(html).toContain("No stage selected. Choose a stage to see which modalities it provides.");
      expect((html.match(/data-testid="stage-chip-/g) ?? []).length).toBe(5);
      expect((html.match(/tabindex="0"/g) ?? []).length).toBe(1);
    }
  });

  it("renders a designed no-modalities state for a stage with an empty modality list", () => {
    const solo: EvidenceStage = { id: "solo", label: "Solo", modalities: [] };
    const html = render(baseProps({ stages: [solo], currentStageId: "solo" }));
    expect(html).toContain('data-state="no-modalities"');
    expect(html).toContain("No modalities are listed for this stage.");
    expect(html).toContain('data-testid="stage-panel"');
  });

  it("keeps the contract caveat visible in every designed state", () => {
    const cases: EvidenceRailProps[] = [
      baseProps(),
      baseProps({ customSubset: true }),
      baseProps({ buildUp: { state: "playing" } }),
      baseProps({ buildUp: { state: "done" } }),
      baseProps({ stages: EMPTY_STAGES, currentStageId: null }),
      baseProps({ stages: buildNoneProvidedStages(), currentStageId: "echo" }),
      baseProps({ currentStageId: null }),
      baseProps({ currentStageId: "missing-stage" })
    ];
    for (const props of cases) {
      expect(render(props)).toContain(EVIDENCE_RAIL_CAVEAT);
    }
  });
});

describe("EvidenceRail interaction affordances and design states", () => {
  it("honours prefers-reduced-motion in the rail styles", () => {
    const html = render(baseProps());
    expect(html).toContain("prefers-reduced-motion");
    expect(html).toContain("transition: none !important");
    expect(html).toContain("animation: none !important");
  });

  it("provides 44px minimum hit targets and a visible focus ring", () => {
    const html = render(baseProps());
    expect(html).toContain("min-height: 44px");
    expect(html).toContain("min-width: 44px");
    expect(html).toContain(":focus-visible");
    expect(html).toContain("outline: 3px solid #111827");
  });

  it("never conveys state by colour alone: every state carries a glyph and text", () => {
    const html = render(baseProps({ customSubset: true, currentStageId: "labs" }));
    expect(html).toContain(">current<");
    expect(html).toContain(">Provided<");
    expect(html).toContain(">Not provided<");
    expect(html).toContain("⚠");
    expect(html).toContain('aria-hidden="true"');
  });

  it("renders no probability, percentage or decimal clinical value", () => {
    const html = render(
      baseProps({ customSubset: true, currentStageId: "echo", buildUp: { state: "playing" } })
    );
    const visible = html.replace(/<style[\s\S]*?<\/style>/g, "");
    expect(visible).not.toMatch(/\d+\.\d+/);
    expect(visible).not.toContain("%");
    expect(visible).not.toMatch(/data-probability/i);
  });
});

describe("EvidenceRail source scan", () => {
  it("finds the unit's production sources", () => {
    expect(SOURCE_FILES.length).toBeGreaterThan(0);
    expect(SOURCE_FILES).toContain("EvidenceRail.tsx");
    expect(SOURCE_FILES).toContain("helpers.ts");
  });

  it("imports nothing from design/ramp, ProbabilityReadout, store, worker, domain or a json artifact", () => {
    for (const file of SOURCE_FILES) {
      for (const spec of importSpecifiers(readSource(file))) {
        for (const [label, pattern] of BANNED_MODULES) {
          expect(spec, `${file} imports "${spec}" (${label})`).not.toMatch(pattern);
        }
      }
    }
  });

  it("keeps every production import local to this unit or to react", () => {
    for (const file of SOURCE_FILES) {
      for (const spec of importSpecifiers(readSource(file))) {
        const allowed =
          spec === "react" || spec.startsWith("react/") || spec.startsWith("./");
        expect(allowed, `${file} imports "${spec}" which is not local to the unit`).toBe(true);
      }
    }
  });

  it("never references the shared probability renderer in production source", () => {
    for (const file of SOURCE_FILES) {
      expect(readSource(file)).not.toContain("ProbabilityReadout");
    }
  });

  it("uses C-13 approved vocabulary in production source, outside the sanctioned caveat", () => {
    expect(SOURCE_FILES.length).toBeGreaterThan(0);
    for (const file of SOURCE_FILES) {
      assertVocabulary(readSource(file), file);
    }
  });

  it("uses C-13 approved vocabulary in the rendered copy", () => {
    assertVocabulary(render(baseProps({ customSubset: true })), "rendered markup");
  });
});
