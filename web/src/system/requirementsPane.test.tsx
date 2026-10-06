/**
 * System → Requirements pane suite (Implementation_Plan P7 steps 11–14;
 * Contracts §9 L426).
 *
 * Properties shown by static rendering (react-dom/server — no browser, no
 * network, no artifact reads):
 *   (i)   every rendered "Show me" href parses against the C-10 grammar;
 *   (ii)  every entry's description / contract / verification ID exists in
 *         docs/TRACEABILITY.md — the pane transcribes, never invents;
 *   (iii) designed empty and loading states — never a blank panel;
 *   (iv)  prop-driven rendering — a different entries array renders
 *         different rows (nothing hardcoded in the pane);
 *   (v)   accessibility structure: caption, row/column scopes, unique
 *         accessible names for the Show me links.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { C10_HREF_PATTERN } from "./c10";
import { REQUIREMENT_ENTRIES_ALT } from "./fixtures";
import { RequirementsPane, type RequirementsPaneProps } from "./RequirementsPane";
import { REQUIREMENT_ENTRIES } from "./requirementsData";

const render = (props: Partial<RequirementsPaneProps> = {}): string =>
  renderToString(<RequirementsPane {...props} />).replace(/<!-- -->/g, "");

const readSource = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

/** Read-only source of record for requirement rows (not edited by this unit). */
const TRACEABILITY = readSource("../../../docs/TRACEABILITY.md");

/** React SSR text escaping — strings must be compared the way they render. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
}

describe("RequirementsPane — declarative table (C-9 L426)", () => {
  it("renders every entry: id, description, contract, verification and Show me", () => {
    const html = render();
    for (const entry of REQUIREMENT_ENTRIES) {
      expect(html, entry.id).toContain(`data-requirement="${entry.id}"`);
      expect(html, entry.id).toContain(escapeHtml(entry.description));
      expect(html, entry.id).toContain(escapeHtml(entry.satisfactionContract));
      expect(html, entry.id).toContain(escapeHtml(entry.verifyId));
    }
    const anchors = hrefs(html);
    expect(anchors).toHaveLength(REQUIREMENT_ENTRIES.length);
    expect(html.match(/>Show me<\/a>/g) ?? []).toHaveLength(REQUIREMENT_ENTRIES.length);
  });

  it("gives every Show me link a unique accessible name carrying its target", () => {
    const html = render();
    const labels = [...html.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]);
    expect(labels).toHaveLength(REQUIREMENT_ENTRIES.length);
    expect(new Set(labels).size).toBe(REQUIREMENT_ENTRIES.length);
    for (const entry of REQUIREMENT_ENTRIES) {
      expect(labels).toContain(`Show me requirement ${entry.id} at ${entry.deepLink}`);
    }
  });
});

describe("RequirementsPane — every href parses to a valid state (C-10)", () => {
  it("all rendered hrefs are fragment deep links matching the grammar", () => {
    const html = render();
    for (const href of hrefs(html)) {
      expect(href.startsWith("#/"), href).toBe(true);
      expect(C10_HREF_PATTERN.test(href), href).toBe(true);
    }
  });
});

describe("RequirementsPane — provenance against docs/TRACEABILITY.md", () => {
  const docLines = TRACEABILITY.split(/\r?\n/);

  function rowExistsInDoc(
    id: string,
    description: string,
    satisfactionContract: string,
    verifyId: string
  ): boolean {
    return docLines.some(
      (line) =>
        line.startsWith(`| ${id} |`) &&
        line.includes(description) &&
        line.includes(satisfactionContract) &&
        line.includes(verifyId)
    );
  }

  it("every rendered entry transcribes a real TRACEABILITY row", () => {
    expect(REQUIREMENT_ENTRIES.length).toBeGreaterThanOrEqual(10);
    for (const entry of REQUIREMENT_ENTRIES) {
      expect(
        rowExistsInDoc(entry.id, entry.description, entry.satisfactionContract, entry.verifyId),
        `entry ${entry.id}`
      ).toBe(true);
    }
  });

  it("the alternate fixture rows are transcribed from the document too", () => {
    for (const entry of REQUIREMENT_ENTRIES_ALT) {
      expect(
        rowExistsInDoc(entry.id, entry.description, entry.satisfactionContract, entry.verifyId),
        `fixture entry ${entry.id}`
      ).toBe(true);
    }
  });

  it("entry ids are unique and deep links are assigned (never copied from the doc)", () => {
    const ids = REQUIREMENT_ENTRIES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of REQUIREMENT_ENTRIES) {
      expect(C10_HREF_PATTERN.test(entry.deepLink), entry.deepLink).toBe(true);
    }
    // The document has no deep-link column, so no rendered link appears in it.
    for (const entry of REQUIREMENT_ENTRIES) {
      expect(TRACEABILITY.includes(entry.deepLink), entry.deepLink).toBe(false);
    }
  });
});

describe("RequirementsPane — prop-driven rendering (no hardcoded rows)", () => {
  it("renders only the entries it is given", () => {
    const html = render({ entries: REQUIREMENT_ENTRIES_ALT });
    expect(html).toContain('data-requirement="F8"');
    expect(html).toContain('data-requirement="H4"');
    expect(html).toContain('data-requirement="B1"');
    expect(html).toContain('href="#/trust/calibration"');
    expect(html).not.toContain('data-requirement="F1"');
    expect(html).not.toContain('href="#/trust/leakage"');
    expect(html).not.toContain(escapeHtml(REQUIREMENT_ENTRIES[0].description));
    expect(hrefs(html)).toHaveLength(REQUIREMENT_ENTRIES_ALT.length);
  });
});

describe("RequirementsPane — designed non-ready states", () => {
  it("shows a designed empty state when no entries are given", () => {
    const html = render({ entries: [] });
    expect(html).toContain('data-state="empty"');
    expect(html).toContain('role="status"');
    expect(html).toContain("No requirement entries in this session.");
    expect(html).toContain("nothing is generated at runtime");
    expect(html).not.toContain("<table");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("NaN");
  });

  it("shows a designed loading state with busy semantics", () => {
    const html = render({ loading: true });
    expect(html).toContain('data-state="loading"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="status"');
    expect(html).toContain("Loading requirements…");
    expect(html).not.toContain("<table");
    expect(html).not.toContain("NaN");
  });
});

describe("RequirementsPane — accessibility structure (AGENTS 6.1)", () => {
  it("labels the section from its heading and scopes every header and row header", () => {
    const html = render();
    expect(html).toContain('data-testid="system-pane"');
    expect(html).toContain('data-pane="requirements"');
    expect(html).toMatch(/aria-labelledby="[^"]+"/);
    expect(html).toContain("<h2");
    expect(html).toContain("<caption");
    expect(html).toContain('scope="col"');
    expect(html).toContain('scope="row"');
  });
});
