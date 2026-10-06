/**
 * C-13 copy lint — scanner (Contracts.md L404–409; Implementation_Plan P7 step 16).
 *
 * Two layers:
 *   1. scanSource(text)  — pure function, source text -> findings.
 *      No I/O, no globals; unit-testable by injection.
 *   2. scanRepo()        — repo-scan entry over the user-visible-string scope:
 *      every .ts/.tsx under web/src, every file under docs, README.md.
 *      (File patterns are written as glob literals lower in this file; this
 *      comment avoids "star-slash" sequences that would close it early.)
 *
 * EXCLUSION (deliberate, required): `web/src/copy/**` is NEVER scanned. That
 * directory contains this lint's own banned-phrase list (vocabulary.ts) and
 * its test fixtures, which quote every banned phrase on purpose. Scanning it
 * would flag the linter itself. The filter is applied to every glob key below.
 *
 * scanRepo uses Vite's import.meta.glob(?raw) instead of node:fs so it runs
 * inside vitest's browser-independent transform pipeline with no extra
 * dependency and no @types/node requirement. copyLint.ts is a test/tooling
 * module: only tests import it, so the eager raw imports never enter the app
 * bundle.
 *
 * Strictness note: the scanner matches banned phrases against the WHOLE file
 * text (including comments), a deliberate superset of the contract's
 * "user-visible strings" — anything user-visible is inside a file, so this
 * ordering can never miss user-visible copy. A sanctioned limitation statement
 * is marked with the `c13-allow: <reason>` pragma on the same line. Whether a
 * pragma'd line really reads as a limitation statement remains a human copy
 * review (HD-02 territory); the mechanical rule is non-empty reason only.
 */

import { BANNED_PHRASES, PRAGMA_TOKEN } from "./vocabulary";

export type Finding = {
  /** The banned phrase as written in the contract. */
  phrase: string;
  /** 1-based line number. */
  line: number;
  /** Non-null = `c13-allow:` reason on the same line; null = violation. */
  pragma: string | null;
};

export type RepoFinding = Finding & {
  /** Repo-relative path, e.g. "web/src/App.tsx", "docs/DEMO.md", "README.md". */
  file: string;
};

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Word-boundary, case-insensitive pattern for one banned phrase.
 * Multi-word phrases allow any run of whitespace between words.
 * Word boundaries make "because" safe from the "causes" rule and keep
 * listed stems exact ("diagnose" does not match "diagnosed" and vice versa —
 * each contract stem is listed separately in BANNED_PHRASES).
 */
export function phrasePattern(phrase: string): RegExp {
  const body = phrase
    .split(/\s+/)
    .map(escapeRegExp)
    .join("\\s+");
  return new RegExp(`\\b${body}\\b`, "i");
}

const BANNED_PATTERNS: readonly RegExp[] = BANNED_PHRASES.map(phrasePattern);

/**
 * Pragma for a single line: `c13-allow:` (PRAGMA_TOKEN) followed by a
 * non-empty reason. An empty reason ("c13-allow:" or "c13-allow:   ") yields
 * null so the line stays flagged. Match is case-sensitive (contract spelling).
 */
export function pragmaOnLine(line: string): string | null {
  const token = PRAGMA_TOKEN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${token}[ \\t]*(.*)$`).exec(line);
  if (!match) return null;
  const reason = match[1].trim();
  return reason.length > 0 ? reason : null;
}

/**
 * Pure scanner: source text -> findings.
 * One finding per (phrase, line) pair; lines carrying a valid pragma are
 * reported with `pragma` set (they are sanctioned, not violations).
 */
export function scanSource(source: string): Finding[] {
  const findings: Finding[] = [];
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const pragma = pragmaOnLine(line);
    for (let p = 0; p < BANNED_PHRASES.length; p += 1) {
      if (BANNED_PATTERNS[p].test(line)) {
        findings.push({ phrase: BANNED_PHRASES[p], line: index + 1, pragma });
      }
    }
  }
  return findings;
}

/** The blocking subset: findings with no (or an empty) pragma. */
export function violations<T extends Finding>(findings: readonly T[]): T[] {
  return findings.filter((finding) => finding.pragma === null);
}

/** Human-readable "file:line [phrase]" lines for test failure messages. */
export function formatFindings(findings: readonly RepoFinding[]): string[] {
  return findings.map((f) => `${f.file}:${f.line}  banned: "${f.phrase}"`);
}

/** Repo-relative display path for a glob key produced relative to this file. */
export function toRepoPath(globKey: string): string {
  if (globKey.startsWith("../../../")) return globKey.slice("../../../".length);
  if (globKey.startsWith("../")) return `web/src/${globKey.slice("../".length)}`;
  if (globKey.startsWith("./")) return `web/src/copy/${globKey.slice("./".length)}`;
  return globKey;
}

/**
 * Deliberate exclusion — see module header. Keys are glob results relative to
 * web/src/copy/, so this module's own directory appears as "../copy/...".
 * Never scan it: vocabulary.ts holds the banned list itself.
 */
export function isExcludedFromRepoScan(globKey: string): boolean {
  return globKey.startsWith("../copy/") || globKey.startsWith("./");
}

const WEB_SOURCES = import.meta.glob<string>("../**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true
});

const DOC_SOURCES = import.meta.glob<string>("../../../docs/**/*", {
  query: "?raw",
  import: "default",
  eager: true
});

const README_SOURCE = import.meta.glob<string>("../../../README.md", {
  query: "?raw",
  import: "default",
  eager: true
});

export type RepoScanResult = {
  /** Every finding (pragma'd and not) across the scanned scope. */
  findings: RepoFinding[];
  /** Blocking subset: banned phrases with no valid pragma. */
  violations: RepoFinding[];
  /** Repo-relative paths actually scanned (exclusion already applied). */
  files: string[];
};

/**
 * Repo-scan entry: all .ts/.tsx under web/src + all files under docs +
 * README.md, minus web/src/copy (documented above). Returns findings,
 * violations and the scanned file list so tests can prove coverage + exclusion.
 */
export function scanRepo(): RepoScanResult {
  const findings: RepoFinding[] = [];
  const files: string[] = [];
  const entries: Array<[string, string]> = [
    ...Object.entries(WEB_SOURCES),
    ...Object.entries(DOC_SOURCES),
    ...Object.entries(README_SOURCE)
  ];
  for (const [globKey, text] of entries) {
    if (isExcludedFromRepoScan(globKey)) continue;
    const file = toRepoPath(globKey);
    files.push(file);
    for (const finding of scanSource(text)) {
      findings.push({ ...finding, file });
    }
  }
  files.sort();
  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  return { findings, violations: violations(findings), files };
}
