/**
 * Typed errors for the scene view-model.
 *
 * Doctrine (AGENTS §6.6): every boundary validates and throws a typed error —
 * never a silent catch, never a blank screen, never a silent substitution of a
 * structure or identity. Messages carry no patient values (there are none here:
 * the scene never sees case data beyond the `SceneModel` projection).
 */

export type SceneErrorCode =
  /** Registry `structures[]` is not exactly the five required named nodes. */
  | "INVALID_REGISTRY_STRUCTURES"
  /** A vessel target maps to a structure this unit cannot represent (`C-11`). */
  | "REGISTRY_VESSEL_MISMATCH"
  /** A loaded glTF is missing at least one required named node. */
  | "MISSING_REQUIRED_NODE"
  /** The loader rejected / failed to deliver a candidate URL. */
  | "STRUCTURE_LOAD_FAILED"
  /** Every candidate in the fallback chain failed → 2D schematic (G4 / FM-07). */
  | "FALLBACK_EXHAUSTED"
  /** Picking received a node name that no registry structure declares. */
  | "UNKNOWN_MESH_NODE"
  /** A non-finite vessel probability reached the scene boundary. */
  | "NONFINITE_VESSEL_PROBABILITY"
  /** Structure stats supplied to the aggregator are absent or invalid. */
  | "INVALID_STRUCTURE_STATS"
  /** A schematic path failed validation (only `M/L/H/V/Z` + finite numbers). */
  | "INVALID_SCHEMATIC_PATH";

export type SceneErrorOptions = {
  detail?: Record<string, unknown>;
  /** Whether the fallback chain can continue after this error. */
  recoverable?: boolean;
  cause?: unknown;
};

export class SceneError extends Error {
  readonly code: SceneErrorCode;
  readonly detail: Record<string, unknown>;
  readonly recoverable: boolean;

  constructor(code: SceneErrorCode, message: string, options: SceneErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "SceneError";
    this.code = code;
    this.detail = options.detail ?? {};
    this.recoverable = options.recoverable ?? false;
  }
}

export function isSceneError(value: unknown): value is SceneError {
  return value instanceof SceneError;
}
