/**
 * Typed domain failures (AG-06: every boundary failure is typed, never bare).
 *
 * `code` is always a member of the C-07 `ComputeError.code` enum, so a caller
 * can surface it without re-mapping (the store reads `error.code` directly).
 * `message` MUST NOT contain patient values (C-07): messages describe the
 * class of problem and may name a feature/column *id* (a schema identifier),
 * never a value.
 */
import type { ComputeErrorCode } from "../contracts/compute";

export type DomainErrorOptions = {
  /** Registry feature id the failure belongs to (schema id, not a value). */
  featureId?: string;
  /** Forbidden-column id, for leakage-guard failures. */
  columnId?: string;
  /** Machine-readable sub-reason, e.g. `"non-finite value"`. */
  reason?: string;
};

export class DomainError extends Error {
  readonly code: ComputeErrorCode;
  readonly featureId: string | undefined;
  readonly columnId: string | undefined;
  readonly reason: string | undefined;

  constructor(code: ComputeErrorCode, message: string, options: DomainErrorOptions = {}) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.featureId = options.featureId;
    this.columnId = options.columnId;
    this.reason = options.reason;
  }
}

/** C-07: a protocol-level failure mapped onto the closed error vocabulary. */
export function isDomainError(value: unknown): value is DomainError {
  return value instanceof DomainError;
}

/** Artifact-shaped load failures are always `ARTIFACT_INVALID`. */
export function artifactError(message: string): DomainError {
  return new DomainError("ARTIFACT_INVALID", message);
}
