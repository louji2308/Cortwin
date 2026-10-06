import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Source-level scan of `web/src/scene/**` — the constraints that must hold for
 * every file in this claim, enforced as a blocking test rather than a promise:
 *
 * - **WebGL-free, React-free, network-free** (AGENTS §6.2, INV-C14): no
 *   `three`, no React, no `model.json` / `results.json`, no fetch/XHR, no
 *   storage, no DOM globals.
 * - **One colour truth**: the only probability→colour mapping is THE ramp in
 *   `web/src/design/`; this directory holds no colour literal, no `rgb()`/`hsl()`
 *   call and no second chromatic scale.
 * - **No second store / no truth elsewhere**: nothing here imports the store,
 *   registry, navigation, worker or domain modules (C-09 owns state; C-02 owns
 *   identity; this unit only projects them through its parameters).
 * - **Copy law (C-13)**: no diagnostic vocabulary in any file of this claim.
 */

const SCENE_DIR = fileURLToPath(new URL(".", import.meta.url));
const SELF = "sceneSourceScan.test.ts";

const listFiles = (): string[] =>
  readdirSync(SCENE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => entry.name)
    .sort();

const read = (name: string): string => readFileSync(join(SCENE_DIR, name), "utf8");
const files = listFiles();
const sourceFiles = files.filter((name) => !name.endsWith(".test.ts"));
const allButSelf = files.filter((name) => name !== SELF);

describe("scene source scan — the claim polices itself", () => {
  it("every file in the directory is accounted for (no stray unreviewed module)", () => {
    expect(files.length).toBeGreaterThan(10);
    expect(files.filter((name) => name === SELF)).toHaveLength(1);
    for (const name of files) {
      expect(name).toMatch(/^[A-Za-z0-9]+(\.test)?\.ts$/);
    }
  });

  it("imports no WebGL, React, state, network or DOM dependency (pure, offline, injectable)", () => {
    const forbidden = [
      /from\s+["']three["']/,
      /from\s+["']@react-three\//,
      /from\s+["']react["']/,
      /from\s+["']react-dom/,
      /from\s+["']zustand["']/,
      /from\s+["']\.\.\/(store|registry|navigation|contracts|worker|domain|panels|components|system|validation|copy)["']/,
      /model\.json/,
      /results\.json/,
      /\bfetch\s*\(/,
      /XMLHttpRequest/,
      /WebSocket/,
      /localStorage|sessionStorage|indexedDB/,
      /\bdocument\s*\./,
      /\bwindow\s*\./,
      /navigator\./
    ];
    for (const name of sourceFiles) {
      const source = read(name);
      for (const pattern of forbidden) {
        const match = source.match(pattern);
        expect(match, `${name} matches forbidden pattern ${pattern}`).toBeNull();
      }
    }
  });

  it("holds no colour literal and no second chromatic scale", () => {
    const colourPatterns = [
      /#[0-9a-fA-F]{3,8}\b/,
      /\brgb\s*\(/,
      /\brgba\s*\(/,
      /\bhsl\s*\(/,
      /\bhsla\s*\(/,
      /d3-scale-chromatic/,
      /cividis|magma|viridis|inferno|plasma/i,
      /PROBABILITY_RAMP_ID|NEUTRAL_PROBABILITY_COLOUR/
    ];
    for (const name of sourceFiles) {
      const source = read(name);
      for (const pattern of colourPatterns) {
        const match = source.match(pattern);
        expect(match, `${name} contains a colour literal / second ramp (${pattern})`).toBeNull();
      }
    }
  });

  it("the ramp import lives in exactly one module: schematicViewModel.ts", () => {
    const valueImporters = sourceFiles.filter((name) =>
      /(^|\n)\s*import\s+(?!type\b)[^;]*from\s+["']\.\.\/design["']/.test(read(name))
    );
    expect(valueImporters).toEqual(["schematicViewModel.ts"]);
    expect(read("schematicViewModel.ts")).toContain("probabilityToColour");
    const typeImporters = sourceFiles.filter(
      (name) =>
        /from\s+["']\.\.\/design["']/.test(read(name)) && !valueImporters.includes(name)
    );
    expect(typeImporters).toEqual(["types.ts"]);
    for (const name of sourceFiles.filter((file) => file !== "schematicViewModel.ts")) {
      expect(read(name)).not.toContain("probabilityToColour");
    }
  });

  it("no file of this claim uses the C-13 banned vocabulary", () => {
    const banned = [
      /\bdiagnos(es|ed|ing|is|e)?\b/i,
      /\blesion\b/i,
      /\btreatment\b/i,
      /\brecommend(s|ed|ation)?\b/i,
      /\bdetects?\b/i,
      /\bcancer\b/i,
      /\bsevere coronary\b/i
    ];
    for (const name of allButSelf) {
      const source = read(name);
      for (const pattern of banned) {
        const match = source.match(pattern);
        expect(match, `${name} uses banned copy vocabulary (${pattern})`).toBeNull();
      }
    }
  });

  it("probability never renders here — no percentage formatting, no readout code", () => {
    const readoutPatterns = [/%\s*100|toFixed\s*\(|toLocalePercent|percent/i];
    for (const name of sourceFiles) {
      const source = read(name);
      for (const pattern of readoutPatterns) {
        expect(source.match(pattern), `${name} formats a probability (${pattern})`).toBeNull();
      }
    }
  });

  it("every TODO(integration) marker is reported, not silently duplicated", () => {
    const markers = sourceFiles
      .map((name) => ({ name, count: (read(name).match(/TODO\(integration\)/g) ?? []).length }))
      .filter((entry) => entry.count > 0);
    expect(markers.map((entry) => entry.name)).toEqual(["index.ts", "types.ts"]);
  });
});
