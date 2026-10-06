import type { Registry, TargetId, ViewRoute } from "../contracts";
import type {
  ParsedUrl,
  ResolvedUrlState,
  SharePayloadV1,
  UrlNotice,
  UrlQueryKey
} from "./types";
import { decodeSharePayload } from "./share";
import {
  DEFAULT_SYSTEM_PANE,
  DEFAULT_TRUST_PANE,
  SYSTEM_PANES,
  TRUST_PANES,
  URL_QUERY_KEYS
} from "./types";

/**
 * C-10 §7.2 — the pure parser (grammar layer).
 *
 * Rules encoded exactly as written in the contract:
 * - routes are `/explore`, `/trust/<5 panes>`, `/system/<4 panes>`;
 * - query keys are only `case, target, feature, stage, share`;
 * - an unknown route resolves to a safe known route plus a notice and is
 *   never interpreted further (a URL is data — nothing in it executes);
 * - unknown parameters are ignored (recorded in `ignoredKeys`, no notice);
 * - malformed percent-encoding or a key with no value yields
 *   `MALFORMED_QUERY` and drops that pair — never a throw;
 * - duplicate keys: the first occurrence wins, later ones are ignored.
 */

function decodeComponent(raw: string): string {
  return decodeURIComponent(raw.replace(/\+/g, "%20"));
}

function tryDecode(raw: string): string | null {
  try {
    return decodeComponent(raw);
  } catch {
    return null;
  }
}

type RouteMatch = { route: ViewRoute; pane: string | null; notice: UrlNotice | null };

function matchRoute(path: string): RouteMatch {
  if (path === "/explore") return { route: "explore", pane: null, notice: null };

  if (path === "/trust" || path.startsWith("/trust/")) {
    const pane = path.slice("/trust/".length);
    if (path === "/trust" || pane === "") {
      return {
        route: "trust",
        pane: DEFAULT_TRUST_PANE,
        notice: { code: "UNKNOWN_PANE", param: "pane" }
      };
    }
    if ((TRUST_PANES as readonly string[]).includes(pane)) {
      return { route: "trust", pane, notice: null };
    }
    return {
      route: "trust",
      pane: DEFAULT_TRUST_PANE,
      notice: { code: "UNKNOWN_PANE", param: "pane" }
    };
  }

  if (path === "/system" || path.startsWith("/system/")) {
    const pane = path.slice("/system/".length);
    if (path === "/system" || pane === "") {
      return {
        route: "system",
        pane: DEFAULT_SYSTEM_PANE,
        notice: { code: "UNKNOWN_PANE", param: "pane" }
      };
    }
    if ((SYSTEM_PANES as readonly string[]).includes(pane)) {
      return { route: "system", pane, notice: null };
    }
    return {
      route: "system",
      pane: DEFAULT_SYSTEM_PANE,
      notice: { code: "UNKNOWN_PANE", param: "pane" }
    };
  }

  // Unknown route: fall back to the safe default view, notice, no interpretation.
  return { route: "explore", pane: null, notice: { code: "UNKNOWN_ROUTE", param: "route" } };
}

/**
 * Parse a fragment URL (`#/trust/subgroups?case=hypo1`) or a bare path
 * (`/trust/subgroups`) into grammar state. Never throws on any input.
 */
export function parseUrl(url: string): ParsedUrl {
  const notices: UrlNotice[] = [];
  const ignoredKeys: string[] = [];

  let rest = url;
  const hashAt = rest.indexOf("#");
  if (hashAt >= 0) rest = rest.slice(hashAt + 1);

  const queryAt = rest.indexOf("?");
  const rawPath = queryAt >= 0 ? rest.slice(0, queryAt) : rest;
  const rawQuery = queryAt >= 0 ? rest.slice(queryAt + 1) : "";

  // Normalize: tolerate a trailing slash, require an absolute-style path.
  let path = rawPath;
  while (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  if (path === "") path = "/explore";
  if (!path.startsWith("/")) path = "\u0000invalid";

  const matched = matchRoute(path);
  if (matched.notice !== null) notices.push(matched.notice);

  const query: Partial<Record<UrlQueryKey, string>> = {};
  if (rawQuery.length > 0) {
    for (const pair of rawQuery.split("&")) {
      if (pair === "") continue;
      const eq = pair.indexOf("=");
      if (eq < 0) {
        notices.push({ code: "MALFORMED_QUERY", param: "query" });
        continue;
      }
      const key = tryDecode(pair.slice(0, eq));
      const value = tryDecode(pair.slice(eq + 1));
      if (key === null || value === null) {
        notices.push({ code: "MALFORMED_QUERY", param: "query" });
        continue;
      }
      if (!(URL_QUERY_KEYS as readonly string[]).includes(key)) {
        ignoredKeys.push(key);
        continue;
      }
      const typedKey = key as UrlQueryKey;
      if (value === "") {
        notices.push({ code: "MALFORMED_QUERY", param: typedKey });
        continue;
      }
      if (query[typedKey] !== undefined) continue; // first occurrence wins
      query[typedKey] = value;
    }
  }

  return {
    route: matched.route,
    pane: matched.pane,
    query,
    ignoredKeys,
    notices
  };
}

/** Validation context for `resolveUrl`: identity sources, never a second registry. */
export type UrlContext = {
  registry: Registry;
  caseIds: readonly string[];
  defaultCaseId: string;
  defaultTargetId: TargetId | null;
};

function shareIssues(
  share: SharePayloadV1,
  context: UrlContext
): string | null {
  if (!context.caseIds.includes(share.baseCase)) return "baseCase";
  const featureIds = new Set(context.registry.features.map((feature) => feature.id));
  const modalityIds = new Set(context.registry.modalities.map((modality) => modality.id));
  for (const key of Object.keys(share.values)) {
    if (!featureIds.has(key)) return "values";
  }
  for (const key of Object.keys(share.provided)) {
    if (!featureIds.has(key) && !modalityIds.has(key)) return "provided";
  }
  return null;
}

/**
 * C-10 §7.2 — resolve parsed grammar state against real identity.
 *
 * - Unknown ids in known parameters yield **the default valid state** plus a
 *   visible notice, and no partial untrusted state is kept: when any present
 *   id is unknown, every query-derived selection falls back to its default.
 * - A malformed share payload is rejected on its own (share becomes `null`,
 *   `MALFORMED_SHARE` notice) and never reaches case application, so the
 *   active case stays unchanged; a well-formed share survives independently
 *   because it names (and validates against) its own base case.
 */
export function resolveUrl(parsed: ParsedUrl, context: UrlContext): ResolvedUrlState {
  const notices: UrlNotice[] = [...parsed.notices];
  const query = parsed.query;

  const caseKnown = query.case === undefined || context.caseIds.includes(query.case);
  const targetKnown =
    query.target === undefined ||
    context.registry.targets.some((target) => target.id === query.target);
  const featureKnown =
    query.feature === undefined ||
    context.registry.features.some((feature) => feature.id === query.feature);
  const stageKnown =
    query.stage === undefined ||
    context.registry.stages.some((stage) => stage.id === query.stage);

  if (!caseKnown) notices.push({ code: "UNKNOWN_CASE_ID", param: "case" });
  if (!targetKnown) notices.push({ code: "UNKNOWN_TARGET_ID", param: "target" });
  if (!featureKnown) notices.push({ code: "UNKNOWN_FEATURE_ID", param: "feature" });
  if (!stageKnown) notices.push({ code: "UNKNOWN_STAGE_ID", param: "stage" });

  let share: SharePayloadV1 | null = null;
  if (query.share !== undefined) {
    const decoded = decodeSharePayload(query.share);
    if (!decoded.ok) {
      notices.push({ code: "MALFORMED_SHARE", param: "share" });
    } else {
      const contextIssue = shareIssues(decoded.payload, context);
      if (contextIssue !== null) {
        notices.push({ code: "MALFORMED_SHARE", param: "share" });
      } else {
        share = decoded.payload;
      }
    }
  }

  const queryValid = caseKnown && targetKnown && featureKnown && stageKnown;

  return {
    route: parsed.route,
    pane: parsed.pane,
    caseId: queryValid && query.case !== undefined ? query.case : context.defaultCaseId,
    targetId:
      queryValid && query.target !== undefined ? (query.target as TargetId) : context.defaultTargetId,
    featureId: queryValid && query.feature !== undefined ? query.feature : null,
    stageId: queryValid && query.stage !== undefined ? query.stage : null,
    share,
    notices
  };
}
