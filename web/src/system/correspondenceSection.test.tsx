import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { NEUTRAL_PROBABILITY_COLOUR, probabilityToColour } from "../design/ramp";
import { VESSEL_TARGET_IDS, identityChainTable } from "../registry";
import { createCorTwinStore } from "../store";
import {
  createHarness,
  disposeHarnesses,
  evaluationResponse,
  makeEvaluation,
  registry,
  type Harness
} from "../store/testFixtures";
import { focusActionFor, focusVesselInScene } from "./correspondenceFocus";
import { CorrespondenceSection } from "./CorrespondenceSection";

/**
 * D-22 vessel correspondence — the judge-visible identity proof in
 * System → Architecture (C-02 §5.2, C-11 L354, C-12, INV-07).
 *
 * Properties a regression must trip:
 *   - every hop in a row comes from the registry's own identity chain, never
 *     from a table inside the pane (INV-C15: one mapping authority);
 *   - the only probability shown is the full readout, and only when the store
 *     actually holds an evaluation — otherwise a designed state;
 *   - the stage swatch is the single probability ramp applied to the payload's
 *     own value, and structures with no target sit outside the ramp;
 *   - the focus control moves the store to registry-derived ids only, and the
 *     pane writes nothing a literal could supply (no number is typed here).
 */

const DIR = dirname(fileURLToPath(import.meta.url));
const read = (file: string): string => readFileSync(join(DIR, file), "utf8");

const render = (element: ReactElement): string =>
  renderToString(element).replace(/<!-- -->/g, "");

/** The stage swatch's inline style for one vessel row — the pane's own swatch. */
function stageSwatchStyle(html: string, vesselId: string): string {
  const row = slice(html, `data-vessel-id="${vesselId}"`, "</tr>");
  const match = /class="ct-sys-swatch" style="([^"]+)"/.exec(row);
  expect(match, `${vesselId} swatch style`).not.toBeNull();
  return match?.[1] ?? "";
}

function slice(html: string, marker: string, endMarker: string): string {
  const start = html.indexOf(marker);
  expect(start, marker).toBeGreaterThanOrEqual(0);
  const end = html.indexOf(endMarker, start);
  return html.slice(start, end < 0 ? html.length : end + endMarker.length);
}

function evaluate(h: Harness): void {
  const request = h.evaluateRequest(0);
  h.port.respond(evaluationResponse(request, makeEvaluation(request.revision)));
}

afterEach(disposeHarnesses);

describe("CorrespondenceSection — registry unavailable", () => {
  it("shows a designed state and no table before the registry loads", () => {
    const store = createCorTwinStore();
    try {
      const html = render(<CorrespondenceSection store={store} />);
      expect(html).toContain('data-state="registry-unavailable"');
      expect(html).toContain('role="status"');
      expect(html).not.toContain('data-testid="correspondence-table"');
      expect(html).not.toContain("ct-prob-readout");
    } finally {
      store.dispose();
    }
  });

  it("falls back to the session store when no store is injected", () => {
    const html = render(<CorrespondenceSection />);
    expect(html).toContain('data-testid="correspondence-section"');
    expect(html).toContain('data-state="registry-unavailable"');
  });
});

describe("CorrespondenceSection — identity chain (C-02 §5.2)", () => {
  it("renders exactly one row per probability-driven vessel", () => {
    const h = createHarness();
    const html = render(<CorrespondenceSection store={h.store} />);
    expect(html).toContain('data-testid="correspondence-table"');
    for (const vesselId of VESSEL_TARGET_IDS) {
      expect(html, vesselId).toContain(`data-vessel-id="${vesselId}"`);
    }
    expect(html.match(/data-vessel-id=/g)).toHaveLength(VESSEL_TARGET_IDS.length);
  });

  it("resolves every hop of the chain from the registry", () => {
    const h = createHarness();
    const html = render(<CorrespondenceSection store={h.store} />);
    const table = identityChainTable(registry);
    const hops = [
      "vessel",
      "target",
      "model",
      "structure",
      "mesh node",
      "camera",
      "card",
      "explanation",
      "trust"
    ] as const;

    for (const vesselId of VESSEL_TARGET_IDS) {
      const identity = table[vesselId];
      const row = slice(html, `data-vessel-id="${vesselId}"`, "</tr>");
      for (const label of hops) expect(row, `${vesselId} hop label`).toContain(label);
      const values = [
        identity.vesselId,
        identity.targetId,
        identity.modelKey,
        identity.structureId,
        identity.meshNode,
        identity.cameraPreset,
        identity.cardLabel,
        identity.cardLabelDefinition,
        identity.explanationTargetId,
        identity.trustTargetId
      ];
      for (const value of values) expect(row, `${vesselId}: ${value}`).toContain(value);
    }
  });

  it("cites the identity-chain evidence and the contract that owns it", () => {
    const h = createHarness();
    const html = render(<CorrespondenceSection store={h.store} />);
    expect(html).toContain('data-testid="correspondence-evidence"');
    expect(html).toContain("registry/identityChain.ts");
    expect(html).toContain("registry/identityChain.test.ts");
    expect(html).toContain("C-02 §5.2");
  });
});

describe("CorrespondenceSection — probability display (C-12, INV-07)", () => {
  it("shows a designed state and no readout when the store has no evaluation", () => {
    const h = createHarness();
    const html = render(<CorrespondenceSection store={h.store} />);
    expect(html).toContain('data-state="no-evaluation"');
    expect(html).not.toContain("ct-prob-readout");
    expect(html).not.toContain("Threshold");
  });

  it("shows the full readout from the payload once an evaluation exists", () => {
    const h = createHarness();
    evaluate(h);
    const evaluation = h.store.getState().eval.current;
    expect(evaluation).not.toBeNull();

    const html = render(<CorrespondenceSection store={h.store} />);
    for (const vesselId of VESSEL_TARGET_IDS) {
      const payload = evaluation?.targets[vesselId];
      expect(payload, vesselId).toBeDefined();
      if (payload === undefined) continue;
      const row = slice(html, `data-vessel-id="${vesselId}"`, "</tr>");
      expect(row, `${vesselId} readout`).toContain("ct-prob-readout");
      expect(row).toContain(`data-target-id="${vesselId}"`);
      expect(row).toContain(`data-decision="${payload.decision}"`);
      expect(row).toContain(`data-reliability="${payload.reliability}"`);
      expect(row).toContain(`${Math.round(payload.probability * 100)}%`);
      expect(row).toContain(`Threshold ${Math.round(payload.thresholdProbability * 100)}%`);
    }
  });

  it("paints the stage swatch from the one probability ramp, never a per-vessel colour", () => {
    const h = createHarness();
    evaluate(h);
    const evaluation = h.store.getState().eval.current;
    const html = render(<CorrespondenceSection store={h.store} />);

    for (const vesselId of VESSEL_TARGET_IDS) {
      const payload = evaluation?.targets[vesselId];
      if (payload === undefined || payload === null) throw new Error("payload missing");
      const colour = probabilityToColour(payload.probability);
      const style = stageSwatchStyle(html, vesselId);
      expect(style, `${vesselId} swatch ${colour}`).toContain(colour);
      expect(style).not.toContain(NEUTRAL_PROBABILITY_COLOUR);
    }
  });

  it("colours two vessels differently when the payload says they differ", () => {
    const h = createHarness();
    evaluate(h);
    const evaluation = h.store.getState().eval.current;
    if (evaluation === null) throw new Error("no evaluation");
    const html = render(<CorrespondenceSection store={h.store} />);

    const lad = probabilityToColour(evaluation.targets.LAD.probability);
    const rca = probabilityToColour(evaluation.targets.RCA.probability);
    expect(lad).not.toBe(rca);
    expect(stageSwatchStyle(html, "LAD")).toContain(lad);
    expect(stageSwatchStyle(html, "RCA")).toContain(rca);
  });
});

describe("CorrespondenceSection — structures outside the ramp", () => {
  it("lists exactly the structures no vessel target links to, in the neutral colour", () => {
    const h = createHarness();
    const html = render(<CorrespondenceSection store={h.store} />);
    const list = slice(html, 'data-testid="neutral-structures"', "</ul>");
    const linked = new Set(
      registry.targets.filter((target) => target.kind === "vessel").map((t) => t.structureId)
    );

    for (const structure of registry.structures) {
      if (linked.has(structure.id)) {
        expect(list, structure.id).not.toContain(structure.meshNode);
      } else {
        expect(list, structure.id).toContain(structure.meshNode);
        expect(list).toContain(structure.label);
      }
    }
    expect(list).toContain(NEUTRAL_PROBABILITY_COLOUR);
    expect(list).toContain("no prediction target");
  });

  it("reports the overall target with structure and mesh node not provided", () => {
    const h = createHarness();
    const html = render(<CorrespondenceSection store={h.store} />);
    const note = slice(html, 'data-testid="overall-target-note"', "</p>");
    expect(note).toContain("<code>CAD</code>");
    expect(note).toContain("overall target");
    expect(note).toContain("not provided");
  });
});

describe("CorrespondenceSection — focus in scene (C-09, C-10, C-11)", () => {
  it("derives the action from the registry row, never from a literal", () => {
    const table = identityChainTable(registry);
    for (const vesselId of VESSEL_TARGET_IDS) {
      const identity = table[vesselId];
      const action = focusActionFor(identity);
      expect(action.route).toBe("explore");
      expect(action.pane).toBeNull();
      expect(action.targetId).toBe(identity.targetId);
      expect(action.cameraPreset).toBe(identity.targetId);
      expect(String(identity.cameraPreset)).toBe(String(identity.targetId));
    }
  });

  it("moves a real store to the registry-derived selection, preset and route", () => {
    const table = identityChainTable(registry);
    const h = createHarness();
    for (const vesselId of VESSEL_TARGET_IDS) {
      const identity = table[vesselId];
      focusVesselInScene(h.store, identity);
      const state = h.store.getState();
      expect(state.selection.targetId, vesselId).toBe(identity.targetId);
      expect(state.view.cameraPreset, vesselId).toBe(identity.targetId);
      expect(state.view.route).toBe("explore");
      expect(state.view.pane).toBeNull();
    }
  });

  it("wires the row's button to that same action", () => {
    const source = read("CorrespondenceSection.tsx");
    expect(source).toMatch(
      /<button[\s\S]{0,600}onClick=\{\(\) => focusVesselInScene\(store, identity\)\}/
    );
    expect(source).toContain('className="ct-sys-btn"');
    expect(source).not.toMatch(/<button[^>]*onClick=\{(?!\(\) => focusVesselInScene)/);
  });
});

describe("CorrespondenceSection — no typed clinical numbers", () => {
  const SOURCES = [
    "CorrespondenceSection.tsx",
    "SceneHealthSection.tsx",
    "correspondenceFocus.ts"
  ];

  const BANNED: ReadonlyArray<[string, RegExp]> = [
    ["fraction literal", /\b0\.\d+\b/],
    ["percent literal", /\b\d{1,3}\s*%/],
    ["probability or threshold assigned a number", /\b(?:probability|threshold)\w*\s*[:=]\s*\d/]
  ];

  it("contains no probability, threshold or percentage written by hand", () => {
    const found: string[] = [];
    for (const file of SOURCES) {
      const text = read(file);
      for (const [name, pattern] of BANNED) {
        if (pattern.test(text)) found.push(`${file}: ${name} ${pattern}`);
      }
    }
    expect(found).toEqual([]);
  });
});
