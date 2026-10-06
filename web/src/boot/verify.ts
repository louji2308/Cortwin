/**
 * P5B-1 — fetch + integrity verification of all six C-01 artifacts.
 *
 * Every artifact listed by the manifest is fetched in parallel, then checked
 * against the manifest's `sizeBytes` and SHA-256 before any byte reaches the
 * engine or the store: a corrupted, truncated or tampered file fails loudly
 * with a typed abort, never a partial engine (mission C.1). Nothing is
 * fetched from a path the manifest did not declare (Architecture §6.3).
 *
 * One asymmetry, and it is an *availability* asymmetry only: `results.json`
 * may fail to arrive (Architecture FM-10 → §16.1 G5). Its size and hash are
 * still checked when it does arrive, so a tampered `results.json` is still a
 * G6 boot block — only "the file never came back" is survivable.
 */
import type { Manifest, ManifestArtifactKey } from "../contracts";
import { BootAbort, bootAbort } from "./errors";
import { ARTIFACT_KEYS, assertSafeArtifactPath } from "./manifest";

export type ArtifactBytes = Record<ManifestArtifactKey, Uint8Array>;

/**
 * Verified bytes handed to `validateBundle`.
 *
 * Only `results` may be `null`: its mere ABSENCE is the FM-10 → §16.1 G5
 * state (Explore, the engine and the explanation path never read it), and it
 * is a *fetch* outcome only. Every other slot aborts (G6), and size/SHA-256
 * mismatches abort for all six slots including `results` — G5 is an
 * availability state, never an integrity state (C-CONF-04).
 */
export type VerifiedArtifactBytes = Omit<ArtifactBytes, "results"> & {
  results: Uint8Array | null;
};

export type VerifiedArtifacts = {
  bytes: VerifiedArtifactBytes;
  /** Slots that could not be fetched — always a subset of the optional keys. */
  unavailable: readonly ManifestArtifactKey[];
};

/** The only artifact boot can run without (Architecture FM-10 → §16.1 G5). */
const OPTIONAL_ARTIFACT_KEYS: ReadonlySet<ManifestArtifactKey> = new Set(["results"]);

export type FetchArtifact = (path: string) => Promise<Uint8Array>;

const FETCH_RECOVERY = "Check the failing file in the network panel, then reload the page.";
const REBUILD_RECOVERY =
  "Rebuild the bundle (`make reproduce`, `python -m pipeline.manifest`), redeploy and reload.";

/** SHA-256 of `bytes` as lowercase hex; typed abort when crypto is unavailable. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = (
    globalThis as {
      crypto?: { subtle?: { digest(algorithm: string, data: BufferSource): Promise<ArrayBuffer> } };
    }
  ).crypto?.subtle;
  if (subtle === undefined || typeof subtle.digest !== "function") {
    bootAbort(
      "CRYPTO_UNAVAILABLE",
      "This context cannot compute SHA-256 (crypto.subtle is unavailable).",
      "Serve the app over https or localhost, then reload."
    );
  }
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await subtle.digest("SHA-256", copy.buffer);
  const view = new DataView(digest);
  let hex = "";
  for (let offset = 0; offset < view.byteLength; offset += 1) {
    hex += view.getUint8(offset).toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Fetch every manifest-declared artifact, then verify size and hash for each.
 * Order matters: size first (cheap), digest second — both checked before the
 * bytes are handed on.
 *
 * An unavailable *optional* slot (`results`) is recorded instead of thrown, so
 * the caller can publish the G5 state; an unavailable required slot still
 * aborts with `ARTIFACT_UNAVAILABLE` (Architecture §16.1 G6).
 */
export async function fetchVerifiedArtifacts(
  manifest: Manifest,
  fetchArtifact: FetchArtifact
): Promise<VerifiedArtifacts> {
  const fetched = await Promise.all(
    ARTIFACT_KEYS.map(async (key) => {
      const ref = manifest.artifacts[key];
      assertSafeArtifactPath(ref.path);
      let bytes: Uint8Array | null;
      try {
        bytes = await fetchArtifact(ref.path);
      } catch (cause) {
        const optional = OPTIONAL_ARTIFACT_KEYS.has(key);
        const unavailable =
          !(cause instanceof BootAbort) || cause.failure.code === "ARTIFACT_UNAVAILABLE";
        if (!(optional && unavailable)) {
          if (cause instanceof BootAbort) throw cause;
          bootAbort(
            "ARTIFACT_UNAVAILABLE",
            `The "${key}" artifact at ${ref.path} could not be fetched.`,
            FETCH_RECOVERY
          );
        }
        return { key, ref, bytes: null };
      }
      return { key, ref, bytes };
    })
  );

  const verified: Partial<VerifiedArtifactBytes> = {};
  const unavailable: ManifestArtifactKey[] = [];
  for (const item of fetched) {
    if (item.bytes === null) {
      // Reached only for an optional slot (required slots abort above).
      unavailable.push(item.key);
      if (item.key === "results") {
        // G5: the slot is *absent*, so it must be explicitly null — never
        // `undefined`, which would fall through validate as a bogus read.
        verified.results = null;
      }
      continue;
    }
    if (item.bytes.length !== item.ref.sizeBytes) {
      bootAbort(
        "ARTIFACT_SIZE_MISMATCH",
        `The "${item.key}" artifact is ${item.bytes.length} bytes but the manifest declares ${item.ref.sizeBytes}.`,
        REBUILD_RECOVERY
      );
    }
    const digest = await sha256Hex(item.bytes);
    if (digest !== item.ref.sha256.toLowerCase()) {
      bootAbort(
        "ARTIFACT_HASH_MISMATCH",
        `The "${item.key}" artifact does not match the SHA-256 recorded in the manifest.`,
        REBUILD_RECOVERY
      );
    }
    verified[item.key] = item.bytes;
  }
  // Invariant: no slot may be left `undefined` — the cast below is a promise,
  // and this check is what keeps it honest (AG-06: loud, never silent).
  for (const key of ARTIFACT_KEYS) {
    if (verified[key] === undefined) {
      bootAbort(
        "ARTIFACT_UNAVAILABLE",
        `The "${key}" artifact was not verified.`,
        FETCH_RECOVERY
      );
    }
  }
  return { bytes: verified as VerifiedArtifactBytes, unavailable };
}

/** Browser default: same-origin `fetch` at the manifest-declared path. */
export const defaultFetchArtifact: FetchArtifact = async (path: string) => {
  let response: Response;
  try {
    response = await fetch(path, { cache: "no-store" });
  } catch {
    bootAbort(
      "ARTIFACT_UNAVAILABLE",
      `The artifact at ${path} could not be fetched.`,
      FETCH_RECOVERY
    );
  }
  if (!response.ok) {
    bootAbort(
      "ARTIFACT_UNAVAILABLE",
      `The artifact at ${path} returned HTTP ${response.status}.`,
      FETCH_RECOVERY
    );
  }
  return new Uint8Array(await response.arrayBuffer());
};
