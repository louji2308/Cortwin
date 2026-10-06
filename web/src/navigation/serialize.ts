import type { ViewRoute } from "../contracts";
import type { HistoryAction, ParsedUrl, UrlQueryKey, UrlStateInput } from "./types";
import {
  DEFAULT_SYSTEM_PANE,
  DEFAULT_TRUST_PANE,
  SYSTEM_PANES,
  TRUST_PANES,
  URL_QUERY_KEYS
} from "./types";

/**
 * C-10 §7.2 — the pure serializer and the history decision helper.
 *
 * - Query keys are emitted in the canonical order `case, target, feature,
 *   stage, share`; absent/null/empty values are omitted entirely.
 * - Values are percent-encoded, so a token can never break the grammar (the
 *   result always matches the C-10 href pattern).
 * - `share` is emitted only when the caller passes an already-encoded token
 *   from an explicit share action; ordinary navigation never populates it.
 * - Ordinary URLs carry ids only — never edited values or patient data. The
 *   serializer has no access to case values at all by construction.
 */

function paneFor(route: ViewRoute, pane: string | null | undefined): string | null {
  if (route === "explore") return null;
  if (route === "trust") {
    return pane !== null && pane !== undefined && (TRUST_PANES as readonly string[]).includes(pane)
      ? pane
      : DEFAULT_TRUST_PANE;
  }
  return pane !== null && pane !== undefined && (SYSTEM_PANES as readonly string[]).includes(pane)
    ? pane
    : DEFAULT_SYSTEM_PANE;
}

/** Serialize URL state to a fragment URL in canonical form. */
export function serializeUrl(state: UrlStateInput): string {
  const pane = paneFor(state.route, state.pane);
  const path = state.route === "explore" ? "/explore" : `/${state.route}/${pane ?? ""}`;

  const pairs: string[] = [];
  const values: Partial<Record<UrlQueryKey, string | null | undefined>> = {
    case: state.caseId,
    target: state.targetId,
    feature: state.featureId,
    stage: state.stageId,
    share: state.share
  };
  for (const key of URL_QUERY_KEYS) {
    const value = values[key];
    if (value === null || value === undefined || value === "") continue;
    pairs.push(`${key}=${encodeURIComponent(value)}`);
  }

  return `#${path}${pairs.length > 0 ? `?${pairs.join("&")}` : ""}`;
}

/** C-10 §7.2: selection changes replace the history entry. */
export function historyAction(change: "selection" | "view"): HistoryAction {
  return change === "view" ? "push" : "replace";
}

/**
 * C-10 §7.2, decision form: a change of route or pane is a view change (push);
 * anything else — case, target, feature, stage, hover — is selection (replace).
 */
export function historyActionBetween(
  previous: Pick<ParsedUrl, "route" | "pane">,
  next: Pick<ParsedUrl, "route" | "pane">
): HistoryAction {
  return previous.route !== next.route || previous.pane !== next.pane ? "push" : "replace";
}
