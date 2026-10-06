/**
 * P5B-1 — boot failure + notice vocabulary (Architecture §16 ladder G3/G6,
 * AGENTS §6.6 uniform doctrine).
 *
 * Every boundary the loader crosses validates its input and, on failure,
 * throws a `BootAbort` carrying a `BootFailure`: a closed error-code union, a
 * plain-language message and a recovery action. `bootCorTwin` itself never
 * throws — it converts the abort into `status: "error"` plus a designed store
 * state (`bundle.status = "error"`) so the app never renders a blank screen.
 *
 * Message law: codes name the artifact or boundary; messages never carry
 * patient values (the loader sees no case values before the engine is live)
 * and never use copy-linted vocabulary (the C-13 banned list in `../copy`).
 */
import type { UrlNoticeCode } from "../navigation";
import type { DegradeInfo } from "../worker";

/** Closed set of boot failure codes — extend only with a recorded decision. */
export const BOOT_ERROR_CODES = [
  "MANIFEST_MISSING",
  "MANIFEST_MALFORMED",
  "MANIFEST_UNSUPPORTED",
  "ARTIFACT_UNAVAILABLE",
  "ARTIFACT_SIZE_MISMATCH",
  "ARTIFACT_HASH_MISMATCH",
  "ARTIFACT_INVALID",
  "CRYPTO_UNAVAILABLE",
  "ENGINE_LOAD_FAILED",
  "CASE_APPLY_FAILED",
  "INTERNAL_BOOT_FAILURE"
] as const;

export type BootErrorCode = (typeof BOOT_ERROR_CODES)[number];

export type BootFailure = {
  code: BootErrorCode;
  message: string;
  recovery: string;
};

/** Ladder level of a boot notice: informational, G3 fallback, G6 unavailable. */
export type BootNoticeLevel = "info" | "G3" | "G6";

export type BootNoticeCode =
  | BootErrorCode
  | UrlNoticeCode
  | DegradeInfo["reason"]
  | "SHARE_APPLY_FAILED"
  /** FM-10 → §16.1 G5: `results.json` did not arrive; boot continues. Level `info`. */
  | "RESULTS_UNAVAILABLE";

export type BootNotice = {
  level: BootNoticeLevel;
  code: BootNoticeCode;
  message: string;
};

export type BootNotifier = (
  level: BootNoticeLevel,
  code: BootNoticeCode,
  message: string
) => void;

/** Internal control-flow exception; never escapes `bootCorTwin`. */
export class BootAbort extends Error {
  readonly failure: BootFailure;

  constructor(failure: BootFailure) {
    super(failure.message);
    this.name = "BootAbort";
    this.failure = failure;
  }
}

export function bootAbort(code: BootErrorCode, message: string, recovery: string): never {
  throw new BootAbort({ code, message, recovery });
}

/** Compact, patient-safe rendering of an unexpected cause for a failure message. */
export function describeCause(cause: unknown, limit = 160): string {
  const raw = cause instanceof Error ? cause.message : String(cause);
  return raw.replace(/\s+/g, " ").trim().slice(0, limit);
}

/** Last-resort wrapper so an unexpected throw still yields a typed failure. */
export function internalFailure(cause: unknown): BootFailure {
  const detail = describeCause(cause);
  return {
    code: "INTERNAL_BOOT_FAILURE",
    message:
      detail === ""
        ? "Boot stopped before the bundle was ready"
        : `Boot stopped before the bundle was ready: ${detail}`,
    recovery:
      "Reload the page; if this repeats, rebuild the bundle and report the message above."
  };
}
