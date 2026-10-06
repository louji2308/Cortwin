/**
 * C-10 §7.2 URL and navigation — pure parser, resolver, serializer, share codec.
 *
 * One grammar, one truth: the shell router, deep links, tour steps and the
 * System pane's generated hrefs all resolve through these functions.
 */
export {
  DEFAULT_SYSTEM_PANE,
  DEFAULT_TRUST_PANE,
  SYSTEM_PANES,
  TRUST_PANES,
  URL_QUERY_KEYS,
  type HistoryAction,
  type ParsedUrl,
  type ResolvedUrlState,
  type SharePayloadV1,
  type SystemPane,
  type TrustPane,
  type UrlNotice,
  type UrlNoticeCode,
  type UrlQueryKey,
  type UrlStateInput
} from "./types";
export { parseUrl, resolveUrl, type UrlContext } from "./parse";
export {
  createSharePayload,
  decodeSharePayload,
  encodeSharePayload,
  type ShareDecodeResult
} from "./share";
export { historyAction, historyActionBetween, serializeUrl } from "./serialize";
