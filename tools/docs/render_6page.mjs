// tools/docs/render_6page.mjs
//
// Renders the canonical Track A project document:
//   docs/project_document_6page.md  ->  docs/project_document_6page.pdf
//
// DETERMINISM (decision D-49): the markdown file is the single source of truth.
// The PDF is a derived artifact — regenerate it with:
//     node tools/docs/render_6page.mjs
// Never hand-edit the PDF. Requires the Playwright install already present under
// web/ (resolved via createRequire from web/package.json); no npm install needed.
//
// The markdown converter is a deliberately controlled subset: headings (#..####),
// paragraphs, **bold**, *italic*, `code`, fenced code blocks, ul/ol lists, pipe
// tables, blockquotes, horizontal rules, and links rendered as text (URL).
// HTML comments (e.g. the c13-allow pragma) are ignored. <!-- PAGEBREAK --> forces
// a page break; the document must contain exactly 5 for exactly 6 pages. Anything
// the converter cannot parse fails loudly with the markdown line number.
//
// Page count is asserted twice: the PAGEBREAK-marker count (authoring contract)
// and the /Type /Page object count in the emitted PDF bytes (ground truth).
// A mismatch exits 1 with an actionable message.

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const mdPath = path.join(repoRoot, "docs", "project_document_6page.md");
const pdfPath = path.join(repoRoot, "docs", "project_document_6page.pdf");

const EXPECTED_PAGES = 6;
const EXPECTED_PAGEBREAKS = EXPECTED_PAGES - 1;

function fail(message, lineNo) {
  const where = lineNo ? `docs/project_document_6page.md:${lineNo}: ` : "";
  console.error(`ERROR ${where}${message}`);
  process.exit(1);
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Inline markdown: **bold**, *italic*, `code`, [text](url). Code spans are
// extracted first so their contents are never re-processed.
// ---------------------------------------------------------------------------
function inline(md, lineNo) {
  let s = escapeHtml(md);
  const stash = [];
  s = s.replace(/`([^`]+)`/g, (_, code) => {
    stash.push(`<code>${code}</code>`);
    return `\u0000${stash.length - 1}\u0000`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  s = s.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_, text, url) => `${text} <span class="url">(${url})</span>`
  );
  if (/\*\*/.test(s)) {
    fail("unbalanced bold marker ** (no closing ** on this line)", lineNo);
  }
  if (/`/.test(s)) {
    fail("unbalanced inline code marker ` (no closing ` on this line)", lineNo);
  }
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[Number(i)]);
  return s;
}

const RE_PAGEBREAK = /^<!--\s*PAGEBREAK\s*-->$/;
const RE_COMMENT = /<!--[\s\S]*?-->/g;
const RE_FENCE_OPEN = /^```(\S*)\s*$/;
const RE_FENCE_CLOSE = /^```\s*$/;
const RE_HEADING = /^(#{1,6})\s+(.*)$/;
const RE_BARE_HASH = /^#+/;
const RE_HR = /^(?:-{3,}|\*{3,}|_{3,})\s*$/;
const RE_TABLE_ROW = /^\|.*\|\s*$/;
const RE_TABLE_SEP = /^\|[\s:|-]+\|\s*$/;
const RE_QUOTE = /^>\s?(.*)$/;
const RE_UL = /^[-*+]\s+(.*)$/;
const RE_OL = /^\d+\.\s+(.*)$/;

function isBlockStart(trimmed) {
  return (
    RE_PAGEBREAK.test(trimmed) ||
    RE_FENCE_OPEN.test(trimmed) ||
    RE_HEADING.test(trimmed) ||
    RE_BARE_HASH.test(trimmed) ||
    RE_HR.test(trimmed) ||
    RE_TABLE_ROW.test(trimmed) ||
    RE_QUOTE.test(trimmed) ||
    RE_UL.test(trimmed) ||
    RE_OL.test(trimmed)
  );
}

function parseTable(lines, startIdx, lineNos) {
  const rows = [];
  let i = startIdx;
  while (i < lines.length && RE_TABLE_ROW.test(lines[i].trim())) {
    rows.push({ text: lines[i].trim(), lineNo: lineNos[i] });
    i++;
  }
  if (rows.length < 2) {
    fail("table must have a header row and a |---| separator row", rows[0].lineNo);
  }
  if (!RE_TABLE_SEP.test(rows[1].text)) {
    fail("second table row must be a |---| separator row", rows[1].lineNo);
  }
  const parseCells = (row) =>
    row.text.replace(/^\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
  const header = parseCells(rows[0]);
  const nCols = header.length;
  if (nCols < 1) fail("table header has no columns", rows[0].lineNo);
  const body = [];
  for (let r = 2; r < rows.length; r++) {
    const cells = parseCells(rows[r]);
    if (cells.length !== nCols) {
      fail(
        `table row has ${cells.length} columns but the header has ${nCols}`,
        rows[r].lineNo
      );
    }
    body.push(cells);
  }
  const out = [
    "<table><thead><tr>",
    ...header.map((c) => `<th>${inline(c, rows[0].lineNo)}</th>`),
    "</tr></thead><tbody>",
  ];
  for (const cells of body) {
    out.push("<tr>");
    for (const c of cells) out.push(`<td>${inline(c, rows[0].lineNo)}</td>`);
    out.push("</tr>");
  }
  out.push("</tbody></table>");
  return { html: out.join(""), nextIdx: i };
}

// ---------------------------------------------------------------------------
// Block-level converter.
// ---------------------------------------------------------------------------
function convertMarkdown(mdText) {
  const lines = mdText.split(/\r?\n/);
  const lineNos = lines.map((_, i) => i + 1);
  const out = [];
  let pagebreaks = 0;
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (RE_PAGEBREAK.test(trimmed)) {
      out.push('<div class="pagebreak"></div>');
      pagebreaks++;
      i++;
      continue;
    }

    let stripped = trimmed.replace(RE_COMMENT, "").trim();
    if (/<!--/.test(stripped)) {
      fail("unclosed HTML comment (no closing -->)", lineNos[i]);
    }
    if (stripped === "") {
      i++;
      continue;
    }

    const fence = stripped.match(RE_FENCE_OPEN);
    if (fence) {
      const openLine = lineNos[i];
      const lang = fence[1] || "";
      const body = [];
      i++;
      let closed = false;
      while (i < lines.length) {
        if (RE_FENCE_CLOSE.test(lines[i].trim())) {
          closed = true;
          i++;
          break;
        }
        body.push(escapeHtml(lines[i]));
        i++;
      }
      if (!closed) {
        fail("unclosed code fence (no closing ```)", openLine);
      }
      const cls = lang ? ` class="language-${escapeAttr(lang)}"` : "";
      out.push(`<pre><code${cls}>${body.join("\n")}</code></pre>`);
      continue;
    }

    const heading = stripped.match(RE_HEADING);
    if (heading) {
      const level = heading[1].length;
      if (level > 4) {
        fail(`heading depth h${level} is not supported (use #..####)`, lineNos[i]);
      }
      out.push(`<h${level}>${inline(heading[2], lineNos[i])}</h${level}>`);
      i++;
      continue;
    }
    if (RE_BARE_HASH.test(stripped)) {
      fail("heading marker # must be followed by a space and a title", lineNos[i]);
    }

    if (RE_HR.test(stripped)) {
      out.push("<hr>");
      i++;
      continue;
    }

    if (RE_TABLE_ROW.test(stripped)) {
      const { html, nextIdx } = parseTable(lines, i, lineNos);
      out.push(html);
      i = nextIdx;
      continue;
    }

    if (RE_QUOTE.test(stripped)) {
      const parts = [];
      const firstLine = lineNos[i];
      while (i < lines.length && RE_QUOTE.test(lines[i].trim())) {
        const m = lines[i].trim().match(RE_QUOTE);
        let inner = m[1].replace(RE_COMMENT, "").trim();
        inner = inner.replace(RE_COMMENT, "").trim();
        if (inner !== "") parts.push(inner);
        i++;
      }
      out.push(`<blockquote><p>${inline(parts.join(" "), firstLine)}</p></blockquote>`);
      continue;
    }

    const ul = stripped.match(RE_UL);
    const ol = stripped.match(RE_OL);
    if (ul || ol) {
      const ordered = Boolean(ol);
      const tag = ordered ? "ol" : "ul";
      const re = ordered ? RE_OL : RE_UL;
      const items = [];
      const firstLine = lineNos[i];
      while (i < lines.length) {
        const t = lines[i].trim().replace(RE_COMMENT, "").trim();
        const m = t.match(re);
        if (!m) break;
        items.push(`<li>${inline(m[1], lineNos[i])}</li>`);
        i++;
      }
      out.push(`<${tag}>${items.join("")}</${tag}>`);
      void firstLine;
      continue;
    }

    // Paragraph: accumulate consecutive plain lines.
    const para = [];
    const firstLine = lineNos[i];
    while (i < lines.length) {
      const t = lines[i].trim().replace(RE_COMMENT, "").trim();
      if (t === "" || isBlockStart(t)) break;
      para.push(t);
      i++;
    }
    out.push(`<p>${inline(para.join(" "), firstLine)}</p>`);
  }

  return { bodyHtml: out.join("\n"), pagebreaks };
}

// ---------------------------------------------------------------------------
// Print stylesheet. Tuned so each of the six sections fits its page at A4 with
// ~14mm margins; do not cut honesty content from the markdown to fix overflow —
// adjust density here instead.
// ---------------------------------------------------------------------------
const CSS = `
@page { size: A4; margin: 0; }
html, body { margin: 0; padding: 0; }
body {
  font-family: "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif;
  font-size: 9.5pt;
  line-height: 1.35;
  color: #111;
}
h1 { font-size: 15pt; line-height: 1.2; margin: 0 0 6pt 0; }
h2 { font-size: 11.5pt; margin: 10pt 0 4pt 0; page-break-after: avoid; break-after: avoid; }
h3, h4 { font-size: 10pt; margin: 8pt 0 3pt 0; page-break-after: avoid; break-after: avoid; }
p { margin: 0 0 5pt 0; orphans: 3; widows: 3; }
strong { font-weight: 600; }
code {
  font-family: Consolas, "Courier New", monospace;
  font-size: 8.4pt;
}
pre {
  font-family: Consolas, "Courier New", monospace;
  font-size: 8.4pt;
  background: #f4f4f4;
  padding: 5pt 7pt;
  margin: 4pt 0 6pt 0;
  page-break-inside: avoid;
  break-inside: avoid;
  white-space: pre-wrap;
  word-break: break-word;
}
pre code { font-size: 8.4pt; background: none; }
blockquote {
  margin: 5pt 0;
  padding: 4pt 8pt;
  border-left: 3pt solid #2a6a4a;
  background: #f1f6f3;
  font-weight: 600;
  page-break-inside: avoid;
  break-inside: avoid;
}
blockquote p { margin: 0; }
table {
  border-collapse: collapse;
  width: 100%;
  margin: 4pt 0 7pt 0;
  font-size: 8.6pt;
  page-break-inside: avoid;
  break-inside: avoid;
}
th, td {
  border: 0.5pt solid #999;
  padding: 2pt 4pt;
  text-align: left;
  vertical-align: top;
}
th { background: #eef2f6; font-weight: 600; }
tr { page-break-inside: avoid; break-inside: avoid; }
ul, ol { margin: 3pt 0 6pt 16pt; padding: 0; }
li { margin: 1pt 0; }
hr { border: none; border-top: 0.5pt solid #bbb; margin: 8pt 0; }
.url { color: #555; font-size: 8pt; }
.pagebreak { page-break-before: always; break-before: page; height: 0; }
`;

function countPdfPages(pdfBytes) {
  const text = pdfBytes.toString("latin1");
  // Match /Type /Page but never /Type /Pages.
  return (text.match(/\/Type\s*\/Page(?!s)/g) || []).length;
}

async function main() {
  const mdText = readFileSync(mdPath, "utf8");
  const { bodyHtml, pagebreaks } = convertMarkdown(mdText);

  if (pagebreaks !== EXPECTED_PAGEBREAKS) {
    fail(
      `document must contain exactly ${EXPECTED_PAGEBREAKS} <!-- PAGEBREAK --> ` +
        `markers for a ${EXPECTED_PAGES}-page document, found ${pagebreaks}`
    );
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>CorTwin - Multimodal AI Hackathon 2026, Track A project document</title>
<style>${CSS}</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;

  const require = createRequire(path.join(repoRoot, "web", "package.json"));
  const { chromium } = require("playwright");

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 2000 });
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({
      path: pdfPath,
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate:
        '<div style="width:100%;text-align:center;font-size:8px;color:#666;' +
        'font-family:sans-serif;">CorTwin - Track A - page ' +
        '<span class="pageNumber"></span> of <span class="totalPages"></span></div>',
      margin: { top: "14mm", bottom: "16mm", left: "14mm", right: "14mm" },
    });
  } finally {
    await browser.close();
  }

  const pdfBytes = readFileSync(pdfPath);
  const pages = countPdfPages(pdfBytes);
  if (pages === 0) {
    fail(
      "could not find any /Type /Page objects in the emitted PDF bytes; " +
        "the Chromium PDF object layout has likely changed — inspect the file " +
        "and update countPdfPages() in tools/docs/render_6page.mjs"
    );
  }
  if (pages !== EXPECTED_PAGES) {
    fail(
      `emitted PDF has ${pages} pages but the document must render to exactly ` +
        `${EXPECTED_PAGES}; if it has more than ${EXPECTED_PAGES}, some section ` +
        `overflows its page — tighten CSS density in tools/docs/render_6page.mjs ` +
        `(never cut honesty content from the markdown); if it has fewer, a section ` +
        `is missing content or a <!-- PAGEBREAK --> marker was lost`
    );
  }

  const sha256 = createHash("sha256").update(pdfBytes).digest("hex");
  const rel = path.relative(repoRoot, pdfPath).replace(/\\/g, "/");
  console.log(
    `Wrote ${rel} (${pages} pages, ${pdfBytes.length} bytes, sha256 ${sha256})`
  );
}

main().catch((err) => {
  console.error("ERROR renderer crashed:", err && err.stack ? err.stack : err);
  process.exit(1);
});
