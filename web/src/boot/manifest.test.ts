/**
 * P5B-1 — manifest layer tests: inlined-block id parity with the build-time
 * inliner, DOM read, and strict typed failure for every malformed shape.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MANIFEST_BLOCK_ID as INLINER_BLOCK_ID } from "../manifest/inlineManifest";
import { BootAbort, type BootFailure } from "./errors";
import {
  ARTIFACT_KEYS,
  MANIFEST_BLOCK_ID,
  assertSafeArtifactPath,
  parseManifest,
  readInlineManifestText
} from "./manifest";

const PUBLIC_DIR = fileURLToPath(new URL("../../public", import.meta.url));

function failureOf(run: () => unknown): BootFailure {
  try {
    run();
  } catch (error) {
    if (error instanceof BootAbort) return error.failure;
    throw error;
  }
  throw new Error("expected a BootAbort");
}

function realManifest(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(PUBLIC_DIR, "manifest.json"), "utf8")) as Record<
    string,
    unknown
  >;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("manifest block identity", () => {
  it("matches the build-time inliner constant exactly", () => {
    expect(MANIFEST_BLOCK_ID).toBe(INLINER_BLOCK_ID);
    expect(MANIFEST_BLOCK_ID).toBe("cortwin-manifest");
  });

  it("declares exactly the six C-01 artifact slots", () => {
    expect([...ARTIFACT_KEYS]).toEqual([
      "registry",
      "model",
      "structures",
      "cases",
      "results",
      "fixtures"
    ]);
  });
});

describe("readInlineManifestText", () => {
  it("returns null when there is no document (non-DOM runtime)", () => {
    expect(readInlineManifestText()).toBeNull();
  });

  it("returns the block text when the element exists", () => {
    vi.stubGlobal("document", {
      getElementById: (id: string) =>
        id === MANIFEST_BLOCK_ID ? { textContent: '{"schemaVersion":"1.0.0"}' } : null
    });
    expect(readInlineManifestText()).toBe('{"schemaVersion":"1.0.0"}');
  });

  it("returns null when another block id is used", () => {
    vi.stubGlobal("document", {
      getElementById: (id: string) => (id === "other" ? { textContent: "x" } : null)
    });
    expect(readInlineManifestText()).toBeNull();
  });
});

describe("parseManifest", () => {
  it("accepts the shipped manifest and exposes all six artifacts", () => {
    const parsed = parseManifest(readFileSync(join(PUBLIC_DIR, "manifest.json"), "utf8"));
    expect(parsed.schemaVersion).toBe("1.0.0");
    expect(parsed.modelId).toMatch(/^sha256:[0-9a-f]{64}$/);
    for (const key of ARTIFACT_KEYS) {
      expect(parsed.artifacts[key].path).not.toMatch(/^\/|:|\\/);
      expect(parsed.artifacts[key].sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(parsed.artifacts[key].sizeBytes).toBeGreaterThan(0);
    }
  });

  it("fails typed when the manifest is absent", () => {
    expect(failureOf(() => parseManifest(null)).code).toBe("MANIFEST_MISSING");
    expect(failureOf(() => parseManifest(undefined)).code).toBe("MANIFEST_MISSING");
    expect(failureOf(() => parseManifest("")).code).toBe("MANIFEST_MISSING");
  });

  it("fails typed when the manifest is not JSON or not an object", () => {
    expect(failureOf(() => parseManifest("{oops")).code).toBe("MANIFEST_MALFORMED");
    expect(failureOf(() => parseManifest('"text"')).code).toBe("MANIFEST_MALFORMED");
    expect(failureOf(() => parseManifest('[1,2]')).code).toBe("MANIFEST_MALFORMED");
  });

  it("fails typed on an unsupported schemaVersion or missing appVersion", () => {
    const wrongVersion = realManifest();
    wrongVersion.schemaVersion = "2.0.0";
    expect(failureOf(() => parseManifest(wrongVersion)).code).toBe("MANIFEST_UNSUPPORTED");

    const noApp = realManifest();
    delete noApp.appVersion;
    expect(failureOf(() => parseManifest(noApp)).code).toBe("MANIFEST_UNSUPPORTED");
  });

  it("fails typed on malformed content ids", () => {
    const badModelId = realManifest();
    (badModelId as { modelId: unknown }).modelId = "sha256:not-hex";
    expect(failureOf(() => parseManifest(badModelId)).code).toBe("MANIFEST_UNSUPPORTED");

    const badBundle = realManifest();
    (badBundle as { bundleId: unknown }).bundleId = 42;
    expect(failureOf(() => parseManifest(badBundle)).code).toBe("MANIFEST_UNSUPPORTED");
  });

  it("fails typed on unsafe artifact paths before anything is fetched", () => {
    for (const path of ["../secrets.json", "/etc/passwd", "https://evil.example/x.json", "a//b", "models\\heart.glb", ""]) {
      const tampered = realManifest();
      const artifacts = tampered.artifacts as Record<string, { path: string }>;
      artifacts.results.path = path;
      expect(failureOf(() => parseManifest(tampered)).code).toBe("MANIFEST_UNSUPPORTED");
      expect(() => assertSafeArtifactPath(path)).toThrow(BootAbort);
    }
  });

  it("fails typed on unknown slots, bad digests and bad sizes", () => {
    const extra = realManifest();
    (extra.artifacts as Record<string, unknown>).surprise = {
      path: "surprise.json",
      sha256: "a".repeat(64),
      sizeBytes: 1
    };
    expect(failureOf(() => parseManifest(extra)).code).toBe("MANIFEST_UNSUPPORTED");

    const badSha = realManifest();
    (badSha.artifacts as Record<string, { sha256: string }>).model.sha256 = "abc";
    expect(failureOf(() => parseManifest(badSha)).code).toBe("MANIFEST_UNSUPPORTED");

    const badSize = realManifest();
    (badSize.artifacts as Record<string, { sizeBytes: number }>).model.sizeBytes = 0;
    expect(failureOf(() => parseManifest(badSize)).code).toBe("MANIFEST_UNSUPPORTED");
  });

  it("fails typed when provenance or attributions are missing", () => {
    const noProvenance = realManifest();
    delete noProvenance.provenance;
    expect(failureOf(() => parseManifest(noProvenance)).code).toBe("MANIFEST_UNSUPPORTED");

    const noAttributions = realManifest();
    delete noAttributions.attributions;
    expect(failureOf(() => parseManifest(noAttributions)).code).toBe("MANIFEST_UNSUPPORTED");
  });
});
