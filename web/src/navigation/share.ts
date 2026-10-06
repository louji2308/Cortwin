import type { FeatureValue } from "../contracts";
import type { SharePayloadV1, UrlNotice } from "./types";

/**
 * C-10 §7.2 — the `share` payload codec.
 *
 * Share URLs are the ONLY URLs allowed to carry edited values, and only after
 * an explicit user action that states the data-sharing consequence. This
 * module therefore has two halves:
 *
 * - `createSharePayload` computes **diffs only** from a named base case. It is
 *   called from the explicit share action — ordinary navigation never calls
 *   it, and the URL serializer never derives a share token from state.
 * - `encodeSharePayload` / `decodeSharePayload` are a symmetric URL-safe
 *   token codec (base64url of JSON). Decoding is total: any malformed,
 *   non-canonical, wrong-version or non-JSON token returns a typed rejection
 *   notice instead of throwing, and the caller keeps the active case
 *   unchanged.
 *
 * Structural validation lives here; registry/case membership validation
 * (`values` keys must be registry features, `provided` keys must be features
 * or modalities, `baseCase` must be a known case) happens in `resolveUrl`,
 * where identity is available.
 */

const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(token: string): Uint8Array | null {
  const padded = token.replace(/-/g, "+").replace(/_/g, "/");
  const withPadding = padded + "=".repeat((4 - (padded.length % 4)) % 4);
  try {
    const binary = atob(withPadding);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFeatureValue(value: unknown): value is FeatureValue {
  if (typeof value === "string") return true;
  return typeof value === "number" && Number.isFinite(value);
}

function structuralCheck(value: unknown): SharePayloadV1 | null {
  if (!isPlainObject(value)) return null;
  const keys = Object.keys(value);
  const allowed = ["version", "baseCase", "values", "provided"];
  if (keys.length !== allowed.length || allowed.some((key) => !keys.includes(key))) return null;
  if (value.version !== 1) return null;
  if (typeof value.baseCase !== "string" || value.baseCase.length === 0) return null;
  if (!isPlainObject(value.values)) return null;
  if (!isPlainObject(value.provided)) return null;
  for (const entry of Object.values(value.values)) {
    if (!isFeatureValue(entry)) return null;
  }
  for (const entry of Object.values(value.provided)) {
    if (typeof entry !== "boolean") return null;
  }
  return value as unknown as SharePayloadV1;
}

export type ShareDecodeResult =
  | { ok: true; payload: SharePayloadV1 }
  | { ok: false; notice: UrlNotice };

/** Total decoder: malformed input is a typed rejection, never a throw. */
export function decodeSharePayload(token: string): ShareDecodeResult {
  const reject: ShareDecodeResult = {
    ok: false,
    notice: { code: "MALFORMED_SHARE", param: "share" }
  };
  if (token.length === 0 || !TOKEN_PATTERN.test(token)) return reject;
  const bytes = base64UrlToBytes(token);
  if (bytes === null) return reject;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return reject;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return reject;
  }
  const payload = structuralCheck(parsed);
  return payload === null ? reject : { ok: true, payload };
}

/** URL-safe token for an explicit share action. */
export function encodeSharePayload(payload: SharePayloadV1): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
}

/**
 * C-10 §7.2 — build a version-1 payload holding **only the differences**
 * between the named base case and the current edits (no duplicated case data,
 * model, results or non-registry ids — membership is validated downstream).
 * Invoked only from the explicit share action; never by navigation.
 */
export function createSharePayload(input: {
  baseCaseId: string;
  baseValues: Record<string, FeatureValue>;
  baseProvidedFeatures: Record<string, boolean>;
  baseProvidedModalities: Record<string, boolean>;
  values: Record<string, FeatureValue>;
  providedFeatures: Record<string, boolean>;
  providedModalities: Record<string, boolean>;
}): SharePayloadV1 {
  const values: Record<string, FeatureValue> = {};
  for (const [key, value] of Object.entries(input.values)) {
    if (!(key in input.baseValues) || input.baseValues[key] !== value) values[key] = value;
  }
  const provided: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(input.providedFeatures)) {
    if (input.baseProvidedFeatures[key] !== value) provided[key] = value;
  }
  for (const [key, value] of Object.entries(input.providedModalities)) {
    if (input.baseProvidedModalities[key] !== value) provided[key] = value;
  }
  return { version: 1, baseCase: input.baseCaseId, values, provided };
}
