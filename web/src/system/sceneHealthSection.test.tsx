import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import {
  registerSceneHealthSource,
  resetSceneHealth,
  type SceneHealthSample
} from "../perf/sceneHealth";
import { SCENE_BUDGET } from "../scene/sceneStats";
import { createCorTwinStore } from "../store";
import {
  createHarness,
  disposeHarnesses,
  makeManifest,
  makeModelMetadata,
  registry
} from "../store/testFixtures";
import {
  BUDGET_ID,
  BUDGET_PROVENANCE,
  MEASURED_PROVENANCE,
  SCENE_COST_TARGETS,
  STRUCTURES_TRANSFER_TARGET_BYTES
} from "./sceneBudgetTargets";
import { SceneHealthSection, type SceneHealthSectionProps } from "./SceneHealthSection";

/**
 * D-22 live 3D health in System → Architecture (C-16 `B-05`/`B-07`,
 * law 16 / C-16 L455).
 *
 * Properties a regression must trip:
 *   - a number appears only when it was measured, and it is labelled MEASURED;
 *     budget limits are labelled TARGET and keep their budget id;
 *   - with no renderer the cells read "not measured yet" and cite no frame —
 *     never a substituted figure, never a fixture value;
 *   - artifact identity (structure size, hash, node names) and the quality tier
 *     come from the store, each citing its own source;
 *   - the TARGET figures are the contract's: equal to `sceneStats.SCENE_BUDGET`
 *     and present in the Architecture §15 budget table.
 */

const DIR = dirname(fileURLToPath(import.meta.url));
const read = (file: string): string => readFileSync(join(DIR, file), "utf8");

const SAMPLE: SceneHealthSample = {
  triangles: 87_432,
  drawCalls: 12,
  textures: 0,
  geometries: 7,
  frame: 138
};

const render = (props?: SceneHealthSectionProps): string =>
  renderToString(<SceneHealthSection {...props} />).replace(/<!-- -->/g, "");

/** The whole `<dt>…</dd>` block for one metric row. */
function metricBlock(html: string, label: string): string {
  const start = html.indexOf(`<dt data-metric="${label}">`);
  expect(start, `metric ${label}`).toBeGreaterThanOrEqual(0);
  const end = html.indexOf("</dd>", start);
  return html.slice(start, end < 0 ? html.length : end + 5);
}

function provenanceOf(block: string): string | null {
  const match = /data-provenance="([^"]+)"/.exec(block);
  return match === null ? null : (match[1] ?? null);
}

/** A store with no bundle (no manifest, no registry) and no renderer. */
function bareStore() {
  const store = createCorTwinStore();
  return {
    store,
    dispose: () => store.dispose()
  };
}

afterEach(() => {
  resetSceneHealth();
  disposeHarnesses();
});

describe("SceneHealthSection — nothing measured", () => {
  it("shows a designed state and no MEASURED cell when no renderer has published", () => {
    const bare = bareStore();
    try {
      const html = render({ store: bare.store });
      expect(html).toContain('data-testid="scene-health-section"');
      expect(html).toContain('data-state="scene-not-measured"');
      expect(html).toContain('data-state="scene-no-renderer"');
      expect(html).toContain("No scene measurement in this session.");
      expect(html).not.toContain(`data-provenance="${MEASURED_PROVENANCE}"`);
      expect(html).not.toContain("last rendered frame");
      expect(html).not.toContain("frame counter");
    } finally {
      bare.dispose();
    }
  });

  it("keeps the TARGET budgets visible next to every unmeasured cell", () => {
    const bare = bareStore();
    try {
      const html = render({ store: bare.store });

      const triangles = metricBlock(html, "Triangles");
      expect(triangles).toContain("not measured yet");
      expect(triangles).toContain("≤ 150,000 · TARGET");
      expect(triangles).toContain(BUDGET_ID.sceneCost);
      expect(triangles).toContain("Architecture §15");
      expect(provenanceOf(triangles)).toBe("not-measured");

      const draws = metricBlock(html, "Draw calls");
      expect(draws).toContain("≤ 30 · TARGET");
      expect(provenanceOf(draws)).toBe("not-measured");

      const textures = metricBlock(html, "Textures");
      expect(textures).toContain("0 · TARGET");
      expect(provenanceOf(textures)).toBe("not-measured");

      const structures = metricBlock(html, "Structures transfer");
      expect(structures).toContain(BUDGET_ID.structuresTransfer);
      expect(structures).toContain("not provided");
      expect(provenanceOf(structures)).toBe("not-provided");
    } finally {
      bare.dispose();
    }
  });
});

describe("SceneHealthSection — measured against budget", () => {
  it("renders the published sample verbatim, labelled MEASURED", () => {
    const h = createHarness();
    registerSceneHealthSource(() => SAMPLE);
    const html = render({ store: h.store });

    expect(html).toContain('data-state="scene-measured"');
    expect(html).toContain('data-scene-live="true"');

    const triangles = metricBlock(html, "Triangles");
    expect(triangles).toContain(SAMPLE.triangles.toLocaleString("en-US"));
    expect(triangles).toContain(`data-provenance="${MEASURED_PROVENANCE}"`);
    expect(triangles).toContain("≤ 150,000 · TARGET");

    const draws = metricBlock(html, "Draw calls");
    expect(draws).toContain(SAMPLE.drawCalls.toLocaleString("en-US"));
    expect(draws).toContain("≤ 30 · TARGET");

    const frames = metricBlock(html, "Rendered frames");
    expect(frames).toContain(SAMPLE.frame.toLocaleString("en-US"));
    expect(provenanceOf(frames)).toBe(MEASURED_PROVENANCE);
    expect(frames).not.toContain("TARGET");

    const measured = html.match(new RegExp(`data-provenance="${MEASURED_PROVENANCE}"`, "g"));
    expect(measured?.length).toBeGreaterThanOrEqual(4);
  });

  it("keeps the measurement after the stage unmounts and says so", () => {
    const h = createHarness();
    const unregister = registerSceneHealthSource(() => SAMPLE);
    unregister();
    const html = render({ store: h.store });

    expect(html).toContain('data-state="scene-last-frame"');
    expect(html).toContain('data-scene-live="false"');
    expect(html).toContain("the figures below are the last frame it rendered in this session");
    expect(metricBlock(html, "Triangles")).toContain(SAMPLE.triangles.toLocaleString("en-US"));
  });
});

describe("SceneHealthSection — store-owned facts", () => {
  it("shows the live quality tier from the store, not a literal", () => {
    const h = createHarness();
    const tier = metricBlock(render({ store: h.store }), "Quality tier");
    expect(tier).toContain(h.store.getState().view.qualityTier);
    expect(provenanceOf(tier)).toBe("live-store");
    expect(tier).toContain("C-09 §7.1");

    h.store.intents.view.setQualityTier("Q2");
    const updated = metricBlock(render({ store: h.store }), "Quality tier");
    expect(updated).toContain("Q2");
    expect(updated).toContain("C-09 §7.1");
  });

  it("reads the structure size and hash from the session manifest", () => {
    const h = createHarness();
    const manifest = h.store.getState().bundle.manifest;
    if (manifest === null) throw new Error("manifest missing");
    const structures = manifest.artifacts.structures;
    const html = render({ store: h.store });

    const size = metricBlock(html, "Structures transfer");
    expect(size).toContain(structures.sizeBytes.toLocaleString("en-US"));
    expect(size).toContain("C-01 manifest artifacts.structures");
    expect(provenanceOf(size)).toBe("artifact");

    const hash = metricBlock(html, "Structure hash");
    expect(hash).toContain(structures.sha256);
    expect(hash).toContain("the exact file the stage loads");
    expect(provenanceOf(hash)).toBe("artifact");
  });

  it("shows manifest provenance by rendering whatever manifest is given", () => {
    const h = createHarness();
    const manifest = makeManifest();
    manifest.artifacts.structures = {
      path: "structures.glb",
      sha256: "ab".repeat(32),
      sizeBytes: 12_345
    };
    h.store.intents.bundle.setReady({ manifest, registry, modelMetadata: makeModelMetadata() });

    const html = render({ store: h.store });
    expect(metricBlock(html, "Structures transfer")).toContain("12,345");
    expect(metricBlock(html, "Structure hash")).toContain("ab".repeat(32));
  });

  it("lists exactly the registry's named mesh nodes", () => {
    const h = createHarness();
    const html = render({ store: h.store });
    const nodes = metricBlock(html, "Scene mesh nodes");
    for (const structure of registry.structures) {
      expect(nodes, structure.id).toContain(structure.meshNode);
    }
    expect(nodes).toContain(`${registry.structures.length} named nodes`);
    expect(nodes).toContain("C-11 §8.1");
    expect(provenanceOf(nodes)).toBe("registry");
  });
});

describe("SceneHealthSection — TARGET figures are the contract's (C-16, Architecture §15)", () => {
  it("matches sceneStats.SCENE_BUDGET exactly, so the two can never drift", () => {
    expect(SCENE_COST_TARGETS.triangles).toBe(SCENE_BUDGET.triangles);
    expect(SCENE_COST_TARGETS.drawCalls).toBe(SCENE_BUDGET.drawCalls);
    expect(SCENE_COST_TARGETS.textures).toBe(SCENE_BUDGET.textures);
    expect(STRUCTURES_TRANSFER_TARGET_BYTES).toBe(SCENE_BUDGET.structureBytes);
    expect(BUDGET_PROVENANCE).toBe(SCENE_BUDGET.kind);
  });

  it("cites the budget ids that own those targets in Architecture §15", () => {
    expect(BUDGET_ID.sceneCost).toBe("B-05");
    expect(BUDGET_ID.structuresTransfer).toBe("B-07");

    const doc = readFileSync(join(DIR, "..", "..", "..", "Project", "Architecture.md"), "utf8");
    expect(doc).toMatch(
      /\|\s*B-05\s*\|[^|]*\*\*Scene cost\*\*[^|]*\|[^|]*Triangles ≤ 150k total; draw calls ≤ 30; zero textures/
    );
    expect(doc).toMatch(
      /\|\s*B-07\s*\|[^|]*\*\*Structures transfer\*\*[^|]*\|[^|]*≤ 2\.5 MB/
    );
  });

  it("the pane itself writes no measurement figure by hand", () => {
    const text = read("SceneHealthSection.tsx");
    expect(text).not.toMatch(/\b0\.\d+\b/);
    expect(text).not.toMatch(/\b\d{1,3}\s*%/);
    expect(text).not.toMatch(/\b(?:triangles|drawCalls|textures)\s*[:=]\s*\d/);
  });
});
