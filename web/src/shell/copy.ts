/**
 * P6-SHELL — shell copy of record (C-13 §8.7).
 *
 * Every user-visible string the shell itself renders lives here so the copy
 * lint, the banner test and a human copy review (HD-02) see one surface.
 * Nothing in this file is computed from an artifact and nothing carries a
 * probability, a metric or a clinical claim.
 */

import type { UrlNotice, UrlNoticeCode } from "../navigation";

/**
 * INV-12 / Contract §9 L412 — the persistent, non-dismissible disclaimer.
 *
 * Exact wording of Project/Final_demo.md L44 (the global frame) and README.md
 * L9. Never reworded here: safety language is a human gate (HD-02).
 */
export const SAFETY_BANNER_GLYPH = "\u26a0";

export const SAFETY_BANNER_TEXT =
  "Educational decision-support prototype. Not a substitute for diagnostic imaging.";

/** Static chrome copy. Route labels use the C-10 route vocabulary. */
export const SHELL_COPY = {
  appName: "CorTwin",
  tagline: "Local clinical-probability instrument",
  skipLinkId: "ct-skip-target",
  skipLink: "Skip to main content",
  navLabel: "Primary views",
  mainLabel: "Main content",
  bannerLabel: "Safety notice",
  noticeRegionLabel: "Link notices",
  announcerLabel: "Current view",
  viewNames: {
    explore: "Explore",
    trust: "Trust",
    system: "System"
  } as Record<string, string>,
  loadingHeading: "Loading model\u2026",
  loadingBody: "Checking the shipped bundle before anything is displayed.",
  loadingSkeletonLabel: "Loading",
  failureHeading: "The model bundle could not be loaded",
  failureWhatToDo: "What to do",
  retry: "Try again",
  degradedHeading: "Running without a background worker",
  degradedBody:
    "Inference is running on the main thread instead. Numbers are unchanged; the page may feel less responsive while it works.",
  trustPaneTitles: {
    performance: "Performance",
    calibration: "Calibration",
    decisions: "Decisions",
    subgroups: "Subgroups",
    leakage: "Leakage Audit"
  } as Record<string, string>,
  systemPaneTitles: {
    requirements: "Requirements",
    architecture: "Architecture",
    integrity: "Integrity",
    "model-card": "Model Card"
  } as Record<string, string>,
  trustPanesLabel: "Trust sections",
  systemPanesLabel: "System sections",
  zoneErrorHeading: "This section could not be displayed",
  zoneErrorBody:
    "Something went wrong while rendering this part of the page. The rest of the application keeps working.",
  zoneErrorRetry: "Reload this section",
  pendingHeading: "Section not yet wired",
  pendingBody:
    "This pane's artifact source is not connected in this release, so no values are shown here. Nothing appears on its behalf."
} as const;

/**
 * Static, patient-safe text for every C-10 URL notice code.
 *
 * The boot loader carries its own private copy for the notices it emits while
 * resolving the initial URL; the shell needs the same text for notices it
 * discovers later (back/forward to a hand-edited fragment). The router notice
 * test asserts one message per `UrlNoticeCode` so a new code cannot ship
 * without copy here.
 */
const URL_NOTICE_COPY: Record<UrlNoticeCode, string> = {
  UNKNOWN_ROUTE: "The link's view does not exist; the default view was shown instead.",
  UNKNOWN_PANE: "The link's pane does not exist; the default pane was shown instead.",
  MALFORMED_QUERY: "A malformed link parameter was ignored.",
  UNKNOWN_CASE_ID: "The linked case is not in this bundle; the default case was shown instead.",
  UNKNOWN_TARGET_ID: "The linked target does not exist; the default target was selected instead.",
  UNKNOWN_FEATURE_ID: "The linked feature does not exist; the feature selection was cleared.",
  UNKNOWN_STAGE_ID: "The linked stage does not exist; the stage selection was cleared.",
  MALFORMED_SHARE: "The shared view could not be read; the active case was kept unchanged."
};

const URL_NOTICE_FALLBACK =
  "The link was not fully applied; safe defaults were shown instead.";

/** Message for one router-discovered URL notice. Never echoes raw URL text. */
export function urlNoticeMessage(notice: UrlNotice): string {
  return URL_NOTICE_COPY[notice.code] ?? URL_NOTICE_FALLBACK;
}
