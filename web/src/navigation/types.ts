import type { FeatureValue, TargetId, ViewRoute } from "../contracts";

/**
 * C-10 §7.2 URL grammar — route table and query keys.
 *
 * Pure declarations and closed vocabularies only: no DOM, no `location`, no
 * history API. Parsing, resolving and serializing are pure string functions so
 * the whole grammar is testable in Node (Architecture §9.6 fragment routing).
 */

/** C-10 §7.2 `trustPane` — exactly these five panes. */
export const TRUST_PANES = [
  "performance",
  "calibration",
  "decisions",
  "subgroups",
  "leakage"
] as const;
export type TrustPane = (typeof TRUST_PANES)[number];

/** C-10 §7.2 `systemPane` — exactly these four panes. */
export const SYSTEM_PANES = [
  "requirements",
  "architecture",
  "integrity",
  "model-card"
] as const;
export type SystemPane = (typeof SYSTEM_PANES)[number];

/** C-10 §7.2 query keys in their canonical order (the serializer's order). */
export const URL_QUERY_KEYS = ["case", "target", "feature", "stage", "share"] as const;
export type UrlQueryKey = (typeof URL_QUERY_KEYS)[number];

/** Pane used when a trust/system route omits or mistypes its pane (safe default). */
export const DEFAULT_TRUST_PANE: TrustPane = "performance";
export const DEFAULT_SYSTEM_PANE: SystemPane = "requirements";

/** C-10 §7.2: every abnormal parse/resolve outcome is a typed, visible notice. */
export type UrlNoticeCode =
  | "UNKNOWN_ROUTE"
  | "UNKNOWN_PANE"
  | "MALFORMED_QUERY"
  | "UNKNOWN_CASE_ID"
  | "UNKNOWN_TARGET_ID"
  | "UNKNOWN_FEATURE_ID"
  | "UNKNOWN_STAGE_ID"
  | "MALFORMED_SHARE";

/**
 * A visible notice for the URL layer. `param` names the offending parameter
 * (or `route`/`pane`) and deliberately never carries the raw query text, so no
 * untrusted string can reach copy from this channel.
 */
export type UrlNotice = { code: UrlNoticeCode; param: string };

/**
 * C-10 §7.2 — the grammar-level parse of one fragment URL. `route` and `pane`
 * are already resolved to safe known values; `query` holds decoded raw values
 * for known keys only (validation against registry/case identity happens in
 * `resolveUrl`, never here — no untrusted value becomes state in this layer).
 */
export type ParsedUrl = {
  route: ViewRoute;
  pane: string | null;
  query: Partial<Record<UrlQueryKey, string>>;
  ignoredKeys: string[];
  notices: UrlNotice[];
};

/** C-10 §7.2 share payload, version 1 — diffs from `baseCase` only. */
export type SharePayloadV1 = {
  version: 1;
  baseCase: string;
  values: Record<string, FeatureValue>;
  provided: Record<string, boolean>;
};

/**
 * C-10 §7.2 — the fully validated URL state: every id is known or falls back
 * to its default, `caseId` is always resolvable, and `share` is present only
 * when its payload passed both structural and registry-context validation.
 */
export type ResolvedUrlState = {
  route: ViewRoute;
  pane: string | null;
  caseId: string;
  targetId: TargetId | null;
  featureId: string | null;
  stageId: string | null;
  share: SharePayloadV1 | null;
  notices: UrlNotice[];
};

/**
 * Input to the serializer. `share` is an ALREADY-ENCODED token supplied by an
 * explicit user action; the serializer never builds one from application state
 * (C-10: share is "never auto-generated; ordinary navigation never populates
 * `share`").
 */
export type UrlStateInput = {
  route: ViewRoute;
  pane?: string | null;
  caseId?: string | null;
  targetId?: string | null;
  featureId?: string | null;
  stageId?: string | null;
  share?: string | null;
};

/** C-10 §7.2 history semantics: selection changes replace, view changes push. */
export type HistoryAction = "push" | "replace";
