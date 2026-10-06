/**
 * P5B-1 — manifest read + structural validation (C-01 §5.1).
 *
 * The inline block id is declared here instead of imported from
 * `../manifest/inlineManifest`: that module value-imports `node:fs` and
 * `vite` (build-time only) and must never enter the browser bundle.
 * `manifest.test.ts` asserts the two constants stay equal, so the loader and
 * the build-time inliner can never drift.
 *
 * `parseManifest` is total-but-strict: anything that is not the frozen
 * manifest shape fails with a typed `MANIFEST_*` abort before a single
 * artifact byte is requested (Architecture §6.3 — no runtime artifact
 * discovery).
 */
import type { Manifest, ManifestArtifactKey } from "../contracts";
import { bootAbort } from "./errors";

export const MANIFEST_BLOCK_ID = "cortwin-manifest";

/** The six artifact slots of C-01 §5.1 — fetches never invent a seventh. */
export const ARTIFACT_KEYS: readonly ManifestArtifactKey[] = [
  "registry",
  "model",
  "structures",
  "cases",
  "results",
  "fixtures"
];

const SHA256_FIELD = /^sha256:[0-9a-f]{64}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

const REBUILD_RECOVERY =
  "Rebuild the bundle (`make reproduce`, `python -m pipeline.manifest`), redeploy and reload.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Path policy: artifacts load from the same origin at build-known relative
 * paths. Absolute paths, URL schemes, backslashes and dot segments are
 * rejected so a tampered manifest can never route the loader off-origin.
 */
export function assertSafeArtifactPath(path: string): void {
  const segments = path.split("/");
  const unsafe =
    path === "" ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.includes(":") ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..");
  if (unsafe) {
    bootAbort(
      "MANIFEST_UNSUPPORTED",
      `The artifact path "${path}" is not a safe same-origin relative path.`,
      REBUILD_RECOVERY
    );
  }
}

/** DOM read of the inlined manifest block; `null` outside the browser. */
export function readInlineManifestText(): string | null {
  if (typeof document === "undefined") return null;
  const block = document.getElementById(MANIFEST_BLOCK_ID);
  return block === null ? null : block.textContent;
}

/** Throws `BootAbort` on anything that is not the frozen C-01 manifest. */
export function parseManifest(source: unknown): Manifest {
  if (source === null || source === undefined || source === "") {
    bootAbort(
      "MANIFEST_MISSING",
      `No bundle manifest was found (inlined block "${MANIFEST_BLOCK_ID}" is absent).`,
      "Reload the page; a deployed bundle must ship its inlined manifest."
    );
  }

  let doc: unknown = source;
  if (typeof source === "string") {
    try {
      doc = JSON.parse(source) as unknown;
    } catch {
      bootAbort("MANIFEST_MALFORMED", "The bundle manifest is not valid JSON.", REBUILD_RECOVERY);
    }
  }

  if (!isRecord(doc)) {
    bootAbort(
      "MANIFEST_MALFORMED",
      "The bundle manifest is not a JSON object.",
      REBUILD_RECOVERY
    );
  }
  if (doc["schemaVersion"] !== "1.0.0") {
    bootAbort(
      "MANIFEST_UNSUPPORTED",
      'The manifest schemaVersion is not "1.0.0".',
      REBUILD_RECOVERY
    );
  }
  if (typeof doc["appVersion"] !== "string" || doc["appVersion"] === "") {
    bootAbort("MANIFEST_UNSUPPORTED", "The manifest has no appVersion.", REBUILD_RECOVERY);
  }
  for (const field of ["bundleId", "modelId"] as const) {
    const value = doc[field];
    if (typeof value !== "string" || !SHA256_FIELD.test(value)) {
      bootAbort(
        "MANIFEST_UNSUPPORTED",
        `The manifest field "${field}" is not a sha256:<hex> content id.`,
        REBUILD_RECOVERY
      );
    }
  }

  const artifacts = doc["artifacts"];
  if (!isRecord(artifacts)) {
    bootAbort("MANIFEST_UNSUPPORTED", "The manifest has no artifacts block.", REBUILD_RECOVERY);
  }
  for (const key of Object.keys(artifacts)) {
    if (!(ARTIFACT_KEYS as readonly string[]).includes(key)) {
      bootAbort(
        "MANIFEST_UNSUPPORTED",
        `The manifest declares an unknown artifact slot "${key}".`,
        REBUILD_RECOVERY
      );
    }
  }
  for (const key of ARTIFACT_KEYS) {
    const ref = artifacts[key];
    if (!isRecord(ref)) {
      bootAbort(
        "MANIFEST_UNSUPPORTED",
        `The manifest artifact "${key}" is not an object.`,
        REBUILD_RECOVERY
      );
    }
    if (typeof ref["path"] !== "string") {
      bootAbort(
        "MANIFEST_UNSUPPORTED",
        `The manifest artifact "${key}" has no path.`,
        REBUILD_RECOVERY
      );
    }
    assertSafeArtifactPath(ref["path"]);
    if (typeof ref["sha256"] !== "string" || !SHA256_HEX.test(ref["sha256"])) {
      bootAbort(
        "MANIFEST_UNSUPPORTED",
        `The manifest artifact "${key}" has no lowercase SHA-256 digest.`,
        REBUILD_RECOVERY
      );
    }
    const size = ref["sizeBytes"];
    if (typeof size !== "number" || !Number.isInteger(size) || size <= 0) {
      bootAbort(
        "MANIFEST_UNSUPPORTED",
        `The manifest artifact "${key}" has no positive integer sizeBytes.`,
        REBUILD_RECOVERY
      );
    }
  }

  const provenance = doc["provenance"];
  if (!isRecord(provenance) || typeof provenance["dataSha256"] !== "string") {
    bootAbort("MANIFEST_UNSUPPORTED", "The manifest has no data provenance.", REBUILD_RECOVERY);
  }
  if (!Array.isArray(doc["attributions"])) {
    bootAbort("MANIFEST_UNSUPPORTED", "The manifest has no attributions list.", REBUILD_RECOVERY);
  }

  return doc as unknown as Manifest;
}
