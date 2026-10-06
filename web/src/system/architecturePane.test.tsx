/**
 * System → Architecture pane suite (Implementation_Plan P7 steps 11–14;
 * Contracts §9 L427).
 *
 * Properties shown by static rendering:
 *   - static facts render exactly the facts given, each with its source;
 *   - manifest facts appear only when supplied — otherwise a designed
 *     "Manifest not available yet" state, with no version, hash or size
 *     ever invented by the pane;
 *   - prop-driven rendering (two fixture variants differ);
 *   - designed empty and loading states.
 */
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ARCHITECTURE_FACTS_ALT,
  MANIFEST_FACTS_FIXTURE
} from "./fixtures";
import { ArchitecturePane, type ArchitecturePaneProps } from "./ArchitecturePane";
import { ARCHITECTURE_FACTS } from "./architectureData";

const render = (props: Partial<ArchitecturePaneProps> = {}): string =>
  renderToString(<ArchitecturePane {...props} />).replace(/<!-- -->/g, "");

describe("ArchitecturePane — static facts (C-9 L427)", () => {
  it("renders every default fact with its detail and cited source", () => {
    const html = render();
    expect(html).toContain('data-testid="architecture-facts"');
    expect(ARCHITECTURE_FACTS.length).toBeGreaterThanOrEqual(6);
    for (const fact of ARCHITECTURE_FACTS) {
      expect(html, fact.label).toContain(`<dt>${fact.label}</dt>`);
      expect(html, fact.label).toContain(fact.detail);
      expect(html, fact.label).toContain(`Source: ${fact.source}`);
    }
  });

  it("cites contract and invariant identifiers, not free text", () => {
    const html = render();
    for (const identifier of ["C-02", "C-15", "INV-04", "INV-C01", "INV-C18"]) {
      expect(html).toContain(identifier);
    }
  });
});

describe("ArchitecturePane — manifest facts are given, never invented", () => {
  it("shows a designed not-available state when no manifest is supplied", () => {
    const html = render();
    expect(html).toContain('data-state="manifest-unavailable"');
    expect(html).toContain('role="status"');
    expect(html).toContain("Manifest not available yet.");
    expect(html).toContain("Versions and hashes appear only from the manifest itself");
    expect(html).not.toContain('data-testid="manifest-facts"');
    expect(html).not.toContain("0.0.0-fixture");
    expect(html).not.toContain("sha256");
    expect(html).not.toContain("Manifest version");
  });

  it("treats an explicit null exactly like an absent manifest", () => {
    const html = render({ manifestFacts: null });
    expect(html).toContain("Manifest not available yet.");
    expect(html).not.toContain('data-testid="manifest-facts"');
    expect(html).not.toContain("0.0.0-fixture");
  });

  it("renders supplied manifest facts verbatim with their labels", () => {
    const html = render({ manifestFacts: MANIFEST_FACTS_FIXTURE });
    expect(html).toContain('data-testid="manifest-facts"');
    for (const fact of MANIFEST_FACTS_FIXTURE) {
      expect(html, fact.label).toContain(`<dt>${fact.label}</dt>`);
      expect(html, fact.label).toContain(fact.detail);
    }
    expect(html).not.toContain("Manifest not available yet.");
  });
});

describe("ArchitecturePane — prop-driven rendering", () => {
  it("renders only the facts it is given", () => {
    const html = render({ facts: ARCHITECTURE_FACTS_ALT });
    expect(html).toContain('data-testid="architecture-facts"');
    expect(html).toContain("<dt>Inference</dt>");
    expect(html).toContain("<dt>State</dt>");
    expect(html).not.toContain("<dt>Hosting</dt>");
    expect(html).not.toContain("<dt>Extensibility</dt>");
    expect(html).not.toContain("Static assets on static hosting");
  });
});

describe("ArchitecturePane — designed non-ready states", () => {
  it("shows a designed empty state when no facts are given", () => {
    const html = render({ facts: [] });
    expect(html).toContain('data-state="empty"');
    expect(html).toContain('role="status"');
    expect(html).toContain("No architecture facts in this session.");
    expect(html).not.toContain('data-testid="architecture-facts"');
    expect(html).not.toContain("Static assets on static hosting");
    expect(html).not.toContain("NaN");
  });

  it("shows a designed loading state with busy semantics", () => {
    const html = render({ loading: true });
    expect(html).toContain('data-state="loading"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Loading architecture facts…");
    expect(html).not.toContain('data-testid="architecture-facts"');
  });

  it("keeps the section labelled and the fact lists semantic", () => {
    const html = render({ manifestFacts: MANIFEST_FACTS_FIXTURE });
    expect(html).toContain('data-pane="architecture"');
    expect(html).toMatch(/aria-labelledby="[^"]+"/);
    expect(html).toContain("<h2");
    expect(html).toContain("<h3");
    expect(html).toContain("<dl");
    expect(html).toContain("<dt");
    expect(html).toContain("<dd");
  });
});
