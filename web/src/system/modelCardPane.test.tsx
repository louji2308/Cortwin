/**
 * System → Model card pane suite (Implementation_Plan P7 steps 11–14;
 * Contracts §9 L432).
 *
 * Properties shown by static rendering:
 *   - every field renders only the value it is given (two fixture variants
 *     differ; nothing is hardcoded in the pane);
 *   - blank strings and empty lists read "Not provided";
 *   - absent card shows a designed empty state, loading is designed;
 *   - the placeholder variant carries no numeric token at all, so no
 *     metric-like value can reach the card before its artifact exists.
 */
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MODEL_CARD_ALT, MODEL_CARD_PENDING } from "./fixtures";
import { ModelCardPane, type ModelCardPaneProps } from "./ModelCardPane";
import type { ModelCardData } from "./types";

const render = (props: Partial<ModelCardPaneProps> = {}): string =>
  renderToString(<ModelCardPane {...props} />).replace(/<!-- -->/g, "");

/** Visible text only — tags, attributes and SSR markers removed. */
function visibleText(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

const ALL_FIELDS: ReadonlyArray<keyof ModelCardData> = [
  "modelIdentity",
  "schemaIdentity",
  "datasetProvenance",
  "validationProtocol",
  "limitations",
  "attributionCaveats",
  "licenceAttribution",
  "aiUseDisclosure",
  "artifactIdentity"
];

describe("ModelCardPane — every field renders only what it is given", () => {
  it("renders each string field of the pending card verbatim", () => {
    const html = render({ card: MODEL_CARD_PENDING });
    expect(html).toContain('data-testid="model-card-fields"');
    for (const key of ALL_FIELDS) {
      const value = MODEL_CARD_PENDING[key];
      if (typeof value === "string") {
        expect(html, key).toContain(value);
      } else {
        for (const item of value) expect(html, key).toContain(item);
      }
    }
    expect(html).not.toContain("Not provided");
    expect(html).toContain("Dataset provenance");
    expect(html).toContain("AI-use disclosure");
    expect(html).toContain("Artifact identity");
  });

  it("renders the alternate card instead — two variants, one pane", () => {
    const html = render({ card: MODEL_CARD_ALT });
    expect(html).toContain(MODEL_CARD_ALT.modelIdentity);
    expect(html).toContain(MODEL_CARD_ALT.artifactIdentity);
    expect(html).not.toContain("Pending artifact");
    expect(html).toContain("Synthetic variant — identity not supplied");
  });

  it("shows Not provided for empty lists and blank strings", () => {
    const html = render({ card: MODEL_CARD_ALT });
    expect(html.match(/Not provided/g) ?? []).toHaveLength(2);

    const blank: ModelCardData = {
      modelIdentity: "",
      schemaIdentity: "   ",
      datasetProvenance: "",
      validationProtocol: "",
      limitations: [],
      attributionCaveats: [""],
      licenceAttribution: "",
      aiUseDisclosure: "",
      artifactIdentity: ""
    };
    const blankHtml = render({ card: blank });
    expect(blankHtml.match(/Not provided/g) ?? []).toHaveLength(9);
    expect(blankHtml).toContain('data-state="ready"');
    expect(blankHtml).not.toContain("NaN");
  });

  it("the placeholder card carries no numeric token at all (INV-04)", () => {
    const text = visibleText(render({ card: MODEL_CARD_ALT }));
    expect(text).not.toMatch(/\d/);
    expect(text).not.toMatch(/NaN|Infinity/);
  });
});

describe("ModelCardPane — designed non-ready states", () => {
  it("shows a designed empty state when no card is supplied", () => {
    const html = render();
    expect(html).toContain('data-state="empty"');
    expect(html).toContain('role="status"');
    expect(html).toContain("No model card in this session.");
    expect(html).toContain("nothing is reconstructed from memory");
    expect(html).not.toContain('data-testid="model-card-fields"');
    expect(html).not.toContain("Pending artifact");
    expect(html).not.toContain("<dt");
  });

  it("shows a designed loading state with busy semantics", () => {
    const html = render({ loading: true });
    expect(html).toContain('data-state="loading"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Loading model card…");
    expect(html).not.toContain('data-testid="model-card-fields"');
  });

  it("labels the section from its heading with a semantic list structure", () => {
    const html = render({ card: MODEL_CARD_PENDING });
    expect(html).toContain('data-pane="model-card"');
    expect(html).toMatch(/aria-labelledby="[^"]+"/);
    expect(html).toContain("<h2");
    expect(html).toContain("<dl");
    expect(html).toContain("<dt");
    expect(html).toContain("<dd");
  });
});
