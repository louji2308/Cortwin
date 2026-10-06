import { readFileSync } from "node:fs";
import path from "node:path";
import type { Plugin, ResolvedConfig } from "vite";

/**
 * C-01 (Project/Contracts.md §5.1) requires the bundle manifest to be inlined in
 * `index.html`; Architecture §6.1 stage 9 inlines it **at build** so a deploy switches
 * the whole bundle atomically (no stale-manifest skew) and §6.3 forbids runtime
 * artifact discovery. This plugin performs exactly that step and nothing else:
 * build only, dev serve untouched, CSP meta untouched.
 */

/** Element id of the inlined manifest data block. Contract-facing constant. */
export const MANIFEST_BLOCK_ID = "cortwin-manifest";

/** Manifest location relative to the resolved Vite root (written by `python -m pipeline.manifest`). */
export const MANIFEST_RELATIVE_PATH = "public/manifest.json";

const OPEN_TAG = `<script type="application/json" id="${MANIFEST_BLOCK_ID}">`;
const CLOSE_TAG = "</script>";

export type ManifestInlineErrorCode =
  | "PLUGIN_STATE"
  | "MANIFEST_READ"
  | "MANIFEST_PARSE"
  | "MANIFEST_INVALID"
  | "NO_HEAD";

export class ManifestInlineError extends Error {
  readonly code: ManifestInlineErrorCode;

  constructor(code: ManifestInlineErrorCode, message: string) {
    super(message);
    this.name = "ManifestInlineError";
    this.code = code;
  }
}

/**
 * Guards the shape the inliner relies on: a bundle manifest object that identifies
 * its model by content hash and lists at least one artifact. Full contract
 * validation stays with the C-01 loader; this is the build-side "no best-effort"
 * guard so garbage never reaches index.html.
 */
export function assertInlinableManifest(manifest: unknown): void {
  if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) {
    const got = manifest === null ? "null" : Array.isArray(manifest) ? "array" : typeof manifest;
    throw new ManifestInlineError(
      "MANIFEST_INVALID",
      `C-01 manifest must be a JSON object; received ${got}`
    );
  }
  const record = manifest as Record<string, unknown>;
  if (typeof record.schemaVersion !== "string" || record.schemaVersion.length === 0) {
    throw new ManifestInlineError(
      "MANIFEST_INVALID",
      "C-01 manifest.schemaVersion must be a non-empty string"
    );
  }
  if (typeof record.modelId !== "string" || !record.modelId.startsWith("sha256:")) {
    throw new ManifestInlineError(
      "MANIFEST_INVALID",
      "C-01 manifest.modelId must identify the model by content hash (sha256:<hex>)"
    );
  }
  const artifacts = record.artifacts;
  if (
    typeof artifacts !== "object" ||
    artifacts === null ||
    Array.isArray(artifacts) ||
    Object.keys(artifacts).length === 0
  ) {
    throw new ManifestInlineError(
      "MANIFEST_INVALID",
      "C-01 manifest.artifacts must be a non-empty object of listed artifacts"
    );
  }
}

/**
 * Serializes a manifest for embedding inside `<script type="application/json">`:
 * every `<` is written as the six-character JSON escape `\\u003c` so the serialized
 * text can never contain `</script>` and break out of the data block.
 * `JSON.parse` turns the escape back into `<`, so the block parses back to a
 * deep-equal manifest.
 */
export function serializeManifestForHtml(manifest: unknown): string {
  const json = JSON.stringify(manifest);
  if (typeof json !== "string") {
    throw new ManifestInlineError(
      "MANIFEST_INVALID",
      "C-01 manifest is not JSON-serializable; refusing to inline"
    );
  }
  return json.replace(/</g, "\\u003c");
}

/** The exact data block for a manifest (asserted shape, escaped payload). */
export function buildManifestBlock(manifest: unknown): string {
  assertInlinableManifest(manifest);
  return `${OPEN_TAG}${serializeManifestForHtml(manifest)}${CLOSE_TAG}`;
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const OWN_BLOCK_WITH_LINE = new RegExp(
  `\\n[ \\t]*${escapeRegExp(OPEN_TAG)}[\\s\\S]*?${escapeRegExp(CLOSE_TAG)}`
);
const OWN_BLOCK = new RegExp(`${escapeRegExp(OPEN_TAG)}[\\s\\S]*?${escapeRegExp(CLOSE_TAG)}`);

/**
 * Returns `html` with exactly one manifest data block in `<head>`.
 * Idempotent: any previously inlined block is removed first, so a double run
 * yields one block, never two.
 */
export function inlineManifestIntoHtml(html: string, manifest: unknown): string {
  const block = buildManifestBlock(manifest);
  const stripped = html.replace(OWN_BLOCK_WITH_LINE, "").replace(OWN_BLOCK, "");
  const headClose = stripped.search(/<\/head>/i);
  if (headClose === -1) {
    throw new ManifestInlineError(
      "NO_HEAD",
      "cannot inline the C-01 manifest: index.html has no </head> element"
    );
  }
  const prefix = stripped.slice(0, headClose).replace(/[ \t]*$/, "");
  return `${prefix}    ${block}\n  ${stripped.slice(headClose)}`;
}

export interface ManifestInlinePluginOptions {
  /** Manifest path relative to the resolved Vite root. Defaults to `public/manifest.json`. */
  manifestPath?: string;
}

/**
 * Vite plugin: on `vite build` only, read the manifest and inline it into index.html
 * as a non-executable JSON data block (CSP `script-src 'self'` compliant: data blocks
 * are never executed, so no CSP directive change is needed or allowed).
 */
export function manifestInlinePlugin(options: ManifestInlinePluginOptions = {}): Plugin {
  let command: "build" | "serve" | null = null;
  let root = "";

  return {
    name: "cortwin:manifest-inline",
    configResolved(config: ResolvedConfig) {
      command = config.command;
      root = config.root;
    },
    transformIndexHtml(html: string): string {
      if (command === null) {
        throw new ManifestInlineError(
          "PLUGIN_STATE",
          "manifestInlinePlugin.transformIndexHtml ran before configResolved; refusing to guess build vs serve"
        );
      }
      if (command !== "build") {
        return html;
      }
      const manifestFile = path.resolve(root, options.manifestPath ?? MANIFEST_RELATIVE_PATH);
      let raw: string;
      try {
        raw = readFileSync(manifestFile, "utf8");
      } catch (cause) {
        throw new ManifestInlineError(
          "MANIFEST_READ",
          `C-01 manifest not readable at ${manifestFile} — run \`python -m pipeline.manifest\` before \`vite build\`: ${
            cause instanceof Error ? cause.message : String(cause)
          }`
        );
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (cause) {
        throw new ManifestInlineError(
          "MANIFEST_PARSE",
          `C-01 manifest at ${manifestFile} is not valid JSON: ${
            cause instanceof Error ? cause.message : String(cause)
          }`
        );
      }
      return inlineManifestIntoHtml(html, parsed);
    }
  };
}
