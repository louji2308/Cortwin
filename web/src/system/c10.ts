/**
 * C-10 deep-link grammar (Project/Contracts.md L319–L330), render side only.
 *
 * The System panes render `href`s as fragment URLs; resolving them into
 * application state belongs to the P6 shell router. This pattern is the same
 * grammar the shell enforces, exported so tests can validate every generated
 * href against one source of truth.
 *
 * Grammar: `#/(explore | trust/<pane> | system/<pane>)` plus an optional
 * query string whose keys appear in canonical order case,target,feature,
 * stage,share. Each key is optional and carries a non-empty value; a key is
 * only consumed together with its `&` separator, so trailing or doubled
 * separators are rejected by `$`.
 */
const ROUTE_PATTERN = String.raw`#\/(?:explore|trust\/(?:performance|calibration|decisions|subgroups|leakage)|system\/(?:requirements|architecture|integrity|model-card))`;

const QUERY_PATTERN = String.raw`\?(?=[^#?]*=)(?:case=[^&#?]+)?(?:&?(?:target=[^&#?]+))?(?:&?(?:feature=[^&#?]+))?(?:&?(?:stage=[^&#?]+))?(?:&?(?:share=[^&#?]+))?`;

/** True when a href is a valid C-10 deep link (route + canonical query). */
export const C10_HREF_PATTERN = new RegExp(`^${ROUTE_PATTERN}(?:${QUERY_PATTERN})?$`);
