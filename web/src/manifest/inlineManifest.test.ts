import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Plugin, ResolvedConfig } from "vite";
import {
  MANIFEST_BLOCK_ID,
  ManifestInlineError,
  assertInlinableManifest,
  inlineManifestIntoHtml,
  manifestInlinePlugin,
  serializeManifestForHtml
} from "./inlineManifest";

const WEB_ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const MANIFEST_FILE = path.join(WEB_ROOT, "public", "manifest.json");
const INDEX_HTML_FILE = path.join(WEB_ROOT, "index.html");
const VITE_CONFIG_FILE = path.join(WEB_ROOT, "vite.config.ts");

const manifest = JSON.parse(readFileSync(MANIFEST_FILE, "utf8")) as Record<string, unknown>;

const SAMPLE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>CorTwin sample</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`;

const BLOCK_PATTERN = /<script type="application\/json" id="([^"]*)">([\s\S]*?)<\/script>/;

const extractBlock = (html: string): { id: string; json: string } => {
  const match = BLOCK_PATTERN.exec(html);
  if (match === null) {
    throw new Error("no <script type=\"application/json\"> manifest block found in html");
  }
  return { id: match[1], json: match[2] };
};

const countBlocks = (html: string): number => (html.match(new RegExp(BLOCK_PATTERN.source, "g")) ?? []).length;

const fakeConfig = (command: "build" | "serve", root: string): ResolvedConfig =>
  ({ command, root }) as unknown as ResolvedConfig;

const applyConfig = (plugin: Plugin, config: ResolvedConfig): void => {
  const hook = plugin.configResolved;
  if (typeof hook !== "function") {
    throw new Error("expected a function configResolved hook");
  }
  (hook as (config: ResolvedConfig) => void).call(plugin, config);
};

const runTransform = (plugin: Plugin, html: string): string => {
  const hook = plugin.transformIndexHtml;
  if (typeof hook !== "function") {
    throw new Error("expected a function transformIndexHtml hook");
  }
  const result = (hook as (value: string, ctx: unknown) => unknown).call(plugin, html, {
    path: "/index.html",
    filename: "/index.html"
  });
  if (typeof result !== "string") {
    throw new Error(`transformIndexHtml returned ${typeof result}, expected a string`);
  }
  return result;
};

const expectManifestError = (fn: () => unknown, code: string): void => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ManifestInlineError);
    expect((error as ManifestInlineError).code).toBe(code);
    return;
  }
  throw new Error(`expected a ManifestInlineError with code ${code}, but nothing was thrown`);
};

describe("C-01 manifest data block", () => {
  it("inlines a valid JSON block with id exactly cortwin-manifest, deep-equal to public/manifest.json", () => {
    const html = inlineManifestIntoHtml(SAMPLE_HTML, manifest);
    expect(html).toContain('<script type="application/json" id="cortwin-manifest">');
    const block = extractBlock(html);
    expect(block.id).toBe(MANIFEST_BLOCK_ID);
    expect(block.id).toBe("cortwin-manifest");
    expect(() => JSON.parse(block.json)).not.toThrow();
    expect(JSON.parse(block.json)).toEqual(manifest);
    expect(html.indexOf("cortwin-manifest")).toBeLessThan(html.indexOf("</head>"));
  });

  it("the real bundle manifest carries modelId by content hash and all six artifacts with sha256 + sizeBytes", () => {
    expect(typeof manifest.modelId).toBe("string");
    expect(String(manifest.modelId)).toMatch(/^sha256:[0-9a-f]{64}$/);
    const artifacts = manifest.artifacts as Record<string, { sha256?: unknown; sizeBytes?: unknown }>;
    expect(Object.keys(artifacts).sort()).toEqual([
      "cases",
      "fixtures",
      "model",
      "registry",
      "results",
      "structures"
    ]);
    for (const key of Object.keys(artifacts)) {
      expect(String(artifacts[key].sha256), `${key}.sha256`).toMatch(/^[0-9a-f]{64}$/);
      expect(Number.isInteger(artifacts[key].sizeBytes), `${key}.sizeBytes`).toBe(true);
      expect(Number(artifacts[key].sizeBytes)).toBeGreaterThan(0);
    }
  });

  it("escapes `<` as \\u003c so no </script> can break out, and round-trips to a deep-equal manifest", () => {
    const hostile = {
      schemaVersion: "1.0.0",
      modelId: "sha256:aa",
      artifacts: {
        registry: { note: "</script><script>window.pwned=true</script><!--" }
      },
      payload: "a<b>c"
    };
    const serialized = serializeManifestForHtml(hostile);
    expect(serialized).not.toContain("<");
    const html = inlineManifestIntoHtml(SAMPLE_HTML, hostile);
    const block = extractBlock(html);
    expect(JSON.parse(block.json)).toEqual(hostile);
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(html).not.toContain("</script><script>");
  });

  it("is idempotent: a second inline yields exactly one byte-identical block", () => {
    const once = inlineManifestIntoHtml(SAMPLE_HTML, manifest);
    const twice = inlineManifestIntoHtml(once, manifest);
    expect(countBlocks(twice)).toBe(1);
    expect(twice).toBe(once);
  });

  it("throws a typed NO_HEAD error instead of silently skipping when there is no </head>", () => {
    expectManifestError(() => inlineManifestIntoHtml("<html><body></body></html>", manifest), "NO_HEAD");
  });

  it("rejects non-contract manifests with a typed MANIFEST_INVALID error", () => {
    for (const bad of [
      null,
      [],
      "manifest",
      {},
      { schemaVersion: "1.0.0", modelId: "df8ced59", artifacts: { model: {} } },
      { schemaVersion: "1.0.0", modelId: "sha256:aa", artifacts: {} },
      { modelId: "sha256:aa", artifacts: { model: {} } }
    ]) {
      expectManifestError(() => assertInlinableManifest(bad), "MANIFEST_INVALID");
    }
  });
});

describe("manifestInlinePlugin (build-time inlining, Architecture §6.1 stage 9)", () => {
  it("on build, inlines public/manifest.json into index.html and keeps the CSP meta byte-exact", () => {
    const source = readFileSync(INDEX_HTML_FILE, "utf8");
    const cspMeta = /<meta http-equiv="Content-Security-Policy" content="[^"]*" \/>/.exec(source);
    if (cspMeta === null) {
      throw new Error("source web/index.html no longer carries the C-15 CSP meta tag");
    }

    const plugin = manifestInlinePlugin();
    applyConfig(plugin, fakeConfig("build", WEB_ROOT));
    const out = runTransform(plugin, source);

    const block = extractBlock(out);
    expect(block.id).toBe("cortwin-manifest");
    expect(JSON.parse(block.json)).toEqual(manifest);

    expect(out).toContain(cspMeta[0]);
    expect(out.match(/http-equiv="Content-Security-Policy"/g)).toHaveLength(1);
    expect(out).toContain('<div id="root"></div>');
    expect(countBlocks(out)).toBe(1);
  });

  it("on serve, leaves the html byte-identical (dev serve stays untouched)", () => {
    const source = readFileSync(INDEX_HTML_FILE, "utf8");
    const plugin = manifestInlinePlugin();
    applyConfig(plugin, fakeConfig("serve", WEB_ROOT));
    expect(runTransform(plugin, source)).toBe(source);
  });

  it("fails loudly (MANIFEST_READ) when the manifest is absent at build time", () => {
    const bareRoot = mkdtempSync(path.join(tmpdir(), "cortwin-manifest-"));
    try {
      const plugin = manifestInlinePlugin();
      applyConfig(plugin, fakeConfig("build", bareRoot));
      expectManifestError(() => runTransform(plugin, SAMPLE_HTML), "MANIFEST_READ");
    } finally {
      rmSync(bareRoot, { recursive: true, force: true });
    }
  });

  it("vite.config.ts registers the plugin next to react()", () => {
    const configSource = readFileSync(VITE_CONFIG_FILE, "utf8");
    expect(configSource).toContain('from "./src/manifest/inlineManifest.ts"');
    expect(configSource).toMatch(/plugins:\s*\[\s*react\(\),\s*manifestInlinePlugin\(\)\s*\]/);
  });
});
