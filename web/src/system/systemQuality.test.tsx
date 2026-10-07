/**
 * System directory quality gates (AGENTS §6.1, §6.4, C-13, C-15).
 *
 * Cross-cutting properties for web/src/system that the per-pane suites do
 * not cover:
 *   - copy discipline: C-13 banned-phrase scan over every non-test source;
 *   - import discipline: sources import only react, local modules and the
 *     design token sheet — no worker, artifacts, network — with one pinned
 *     exception for the D-22 live-read panes, which may read the store,
 *     registry, contracts, ramp, ProbabilityReadout and scene-health channel
 *     exactly as Architecture §9.1 allows for `system/`;
 *   - colour discipline: every colour in system.css is a design token or
 *     the documented local failure pair, and every text pair meets WCAG AA;
 *   - motion discipline: no transitions/animations (reduced-motion users
 *     get identical behaviour by construction) and no raw durations;
 *   - interaction discipline: no tabindex anywhere, no inline handlers except
 *     a click on a real control in a live-read pane, no runtime network or
 *     storage API — every other pane is a pure render over its props;
 *   - tabular numerals for parity numbers.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { scanSource, violations } from "../copy/copyLint";
import { PARITY_REPORT_WITHIN } from "./fixtures";
import { IntegrityPane } from "./IntegrityPane";

const DIR = dirname(fileURLToPath(import.meta.url));

const read = (file: string): string => readFileSync(join(DIR, file), "utf8");

const SOURCE_FILES = readdirSync(DIR)
  .filter((file) => /\.tsx?$/.test(file))
  .filter((file) => !/\.test\.tsx?$/.test(file))
  .sort();

const CSS = read("system.css");
const CSS_RULES = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
const TOKENS_CSS = readFileSync(
  fileURLToPath(new URL("../design/tokens.css", import.meta.url)),
  "utf8"
);

const IMPORT_SPECIFIER = /(?:from\s+|import\s*\(?\s*)["']([^"'\s]+)["']/g;

/**
 * D-22 live-read exception (recorded as a known deviation, see Progress.md).
 *
 * Two panes are *live* reads over the C-09 store, the C-02 registry and the
 * scene-health channel — precisely the sources Architecture §9.1 permits for
 * `system/` ("store hooks, registry, design, components"; it forbids `domain`,
 * `worker` and scene internals). The blanket rules below still hold for every
 * other file in the directory, the allowlist is closed (exact specifiers only,
 * no prefixes), and `liveReadAllowlistIsClosed` pins it so it cannot grow
 * without this file changing visibly.
 */
const LIVE_READ_SOURCES: ReadonlySet<string> = new Set([
  "CorrespondenceSection.tsx",
  "SceneHealthSection.tsx",
  "correspondenceFocus.ts"
]);

const LIVE_READ_ALLOWLIST: ReadonlySet<string> = new Set([
  "../components/ProbabilityReadout",
  "../contracts",
  "../design/ramp",
  "../perf/sceneHealth",
  "../registry",
  "../store"
]);

function importSpecifiers(text: string): string[] {
  return [...text.matchAll(IMPORT_SPECIFIER)].map((match) => match[1]);
}

function hexOf(pattern: RegExp, text: string): string {
  const match = pattern.exec(text);
  expect(match, pattern.source).not.toBeNull();
  return (match?.[1] ?? "").toLowerCase();
}

function channelLuminance(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const value = hex.replace("#", "");
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  );
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [lighter, darker] = la >= lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
}

const COLOUR = {
  bg: hexOf(/--ct-color-bg:\s*(#[0-9a-fA-F]{3,8})/, TOKENS_CSS),
  surface: hexOf(/--ct-color-surface:\s*(#[0-9a-fA-F]{3,8})/, TOKENS_CSS),
  surfaceRaised: hexOf(/--ct-color-surface-raised:\s*(#[0-9a-fA-F]{3,8})/, TOKENS_CSS),
  border: hexOf(/--ct-color-border:\s*(#[0-9a-fA-F]{3,8})/, TOKENS_CSS),
  text: hexOf(/--ct-color-text:\s*(#[0-9a-fA-F]{3,8})/, TOKENS_CSS),
  muted: hexOf(/--ct-color-text-muted:\s*(#[0-9a-fA-F]{3,8})/, TOKENS_CSS),
  accent: hexOf(/--ct-color-accent:\s*(#[0-9a-fA-F]{3,8})/, TOKENS_CSS),
  failText: hexOf(/--ct-sys-fail-text:\s*(#[0-9a-fA-F]{3,8})/, CSS),
  failBg: hexOf(/--ct-sys-fail-bg:\s*(#[0-9a-fA-F]{3,8})/, CSS),
  failBorder: hexOf(/--ct-sys-fail-border:\s*(#[0-9a-fA-F]{3,8})/, CSS)
};

describe("copy discipline — C-13 scan over web/src/system sources", () => {
  it("finds no unpragma'd banned phrase in any non-test source", () => {
    const issues: string[] = [];
    for (const file of SOURCE_FILES) {
      for (const finding of violations(scanSource(read(file)))) {
        issues.push(`${file}:${finding.line} banned:${finding.phrase}`);
      }
    }
    expect(issues).toEqual([]);
  });
});

describe("import discipline — panes are self-contained renders", () => {
  it("sources import only react, local modules, the token sheet or a pinned live-read dep", () => {
    const problems: string[] = [];
    for (const file of SOURCE_FILES) {
      const live = LIVE_READ_SOURCES.has(file);
      for (const spec of importSpecifiers(read(file))) {
        const allowed =
          spec === "react" ||
          spec.startsWith("./") ||
          spec === "../design/tokens.css" ||
          (live && LIVE_READ_ALLOWLIST.has(spec));
        if (!allowed) problems.push(`${file}: ${spec}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("the live-read allowlist is exactly the Architecture §9.1 sources, nothing more", () => {
    expect([...LIVE_READ_ALLOWLIST].sort()).toEqual([
      "../components/ProbabilityReadout",
      "../contracts",
      "../design/ramp",
      "../perf/sceneHealth",
      "../registry",
      "../store"
    ]);
    expect([...LIVE_READ_SOURCES].sort()).toEqual([
      "CorrespondenceSection.tsx",
      "SceneHealthSection.tsx",
      "correspondenceFocus.ts"
    ]);
  });

  it("live-read sources still never import an artifact, worker, engine or scene internal", () => {
    const problems: string[] = [];
    for (const file of SOURCE_FILES) {
      if (!LIVE_READ_SOURCES.has(file)) continue;
      for (const spec of importSpecifiers(read(file))) {
        const isLocal = spec.startsWith("./");
        if (
          !isLocal &&
          !LIVE_READ_ALLOWLIST.has(spec) &&
          /\.json|zustand|worker|domain|scene|stage/i.test(spec)
        ) {
          problems.push(`${file}: ${spec}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("no import points at an artifact, a store, a worker or an engine", () => {
    const problems: string[] = [];
    for (const file of SOURCE_FILES) {
      if (LIVE_READ_SOURCES.has(file)) continue;
      for (const spec of importSpecifiers(read(file))) {
        if (/\.json|zustand|store|worker|domain/i.test(spec)) {
          problems.push(`${file}: ${spec}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("sources use no runtime network or storage API (C-15, INV-C18/C19)", () => {
    for (const file of SOURCE_FILES) {
      const text = read(file);
      expect(text, file).not.toMatch(
        /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB|document\.cookie/
      );
    }
  });

  it("sources are pure renders: no tabindex, handlers only on controls in live-read sources", () => {
    const problems: string[] = [];
    for (const file of SOURCE_FILES) {
      const text = read(file);
      if (/tabindex/i.test(text)) problems.push(`${file}: tabindex`);
      if (LIVE_READ_SOURCES.has(file)) {
        // D-22: the only permitted handler is a click on a real <button>.
        const withoutButtons = text.replace(/<button[\s\S]*?>/g, "");
        if (/onClick/i.test(withoutButtons)) problems.push(`${file}: onClick outside a <button>`);
      } else if (/onClick/i.test(text)) {
        problems.push(`${file}: onClick`);
      }
    }
    expect(problems).toEqual([]);
  });
});

describe("colour discipline — tokens plus one documented failure pair", () => {
  it("every colour in system.css is a design token or the failure pair", () => {
    const tokenHexes = new Set(
      [...TOKENS_CSS.matchAll(/--ct-[a-z-]+:\s*(#[0-9a-fA-F]{3,8})/g)].map((m) =>
        m[1].toLowerCase()
      )
    );
    const failHexes = new Set(
      [
        COLOUR.failText,
        COLOUR.failBg,
        COLOUR.failBorder
      ]
    );
    const unknown = [...CSS_RULES.matchAll(/#[0-9a-fA-F]{3,8}\b/g)]
      .map((m) => m[0].toLowerCase())
      .filter((hex) => !tokenHexes.has(hex) && !failHexes.has(hex));
    expect([...new Set(unknown)]).toEqual([]);
    expect(failHexes.size).toBe(3);
  });

  it("every text pair rendered by these panes meets WCAG AA (4.5:1)", () => {
    const pairs: ReadonlyArray<[string, string, string]> = [
      ["text on bg", COLOUR.text, COLOUR.bg],
      ["text on surface", COLOUR.text, COLOUR.surface],
      ["text on surface-raised", COLOUR.text, COLOUR.surfaceRaised],
      ["muted on bg", COLOUR.muted, COLOUR.bg],
      ["muted on surface", COLOUR.muted, COLOUR.surface],
      ["muted on surface-raised", COLOUR.muted, COLOUR.surfaceRaised],
      ["accent link on surface", COLOUR.accent, COLOUR.surface],
      ["failure text on failure bg", COLOUR.failText, COLOUR.failBg],
      ["failure text on surface", COLOUR.failText, COLOUR.surface],
      ["failure text on bg", COLOUR.failText, COLOUR.bg]
    ];
    for (const [name, fg, bg] of pairs) {
      const ratio = contrastRatio(fg, bg);
      expect(ratio, `${name} ${fg} on ${bg} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        4.5
      );
    }
  });
});

describe("motion discipline — static panes, reduced motion by construction", () => {
  it("defines no transition or animation property", () => {
    expect(CSS_RULES).not.toMatch(/transition|animation/i);
  });

  it("contains no raw time duration", () => {
    expect(CSS_RULES).not.toMatch(/\b\d+(?:\.\d+)?m?s\b/);
  });
});

describe("numeric display discipline", () => {
  it("system.css forces tabular numerals for parity numbers", () => {
    expect(CSS_RULES).toContain("font-variant-numeric: tabular-nums");
  });

  it("the integrity pane renders its numeric cells with the tabular class", () => {
    const html = renderToString(<IntegrityPane report={PARITY_REPORT_WITHIN} />);
    expect((html.match(/class="ct-sys-num"/g) ?? []).length).toBeGreaterThanOrEqual(6);
  });
});
