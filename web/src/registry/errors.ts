/** C-02 §5.2 — typed failures for registry parsing, integrity and identity. */

export type RegistryIssueCode =
  | "MALFORMED_JSON"
  | "SCHEMA_VERSION"
  | "MALFORMED_COLLECTION"
  | "MALFORMED_ENTRY"
  | "MALFORMED_FIELD"
  | "DUPLICATE_ID"
  | "UNKNOWN_MODALITY"
  | "UNEXPECTED_MODALITY"
  | "FEATURE_COUNT"
  | "MODALITY_FEATURE_COUNT"
  | "TARGET_SET"
  | "TARGET_KIND"
  | "TARGET_MODEL_KEY"
  | "VESSEL_STRUCTURE_MISSING"
  | "VESSEL_STRUCTURE_SHARED"
  | "STRUCTURE_SET"
  | "STRUCTURE_MESH_NODE"
  | "FORBIDDEN_OVERLAP"
  | "DISPLAY_GROUP_UNKNOWN_FEATURE"
  | "STAGE_ORDER_NOT_MONOTONIC"
  | "STAGE_PREFIX_INVALID"
  | "DERIVED_INPUT_UNKNOWN"
  | "ENCODING_MALFORMED"
  | "RANGE_MALFORMED"
  | "IDENTITY_CHAIN_BROKEN";

/** One validation finding: closed code + a registry path (never patient data). */
export type RegistryIssue = { code: RegistryIssueCode; path: string; detail?: string };

function describe(issue: RegistryIssue): string {
  return `${issue.path}: ${issue.code}${issue.detail ? ` (${issue.detail})` : ""}`;
}

/** Thrown by `parseRegistry` and by identity-chain lookups on a broken chain. */
export class RegistryError extends Error {
  readonly issues: RegistryIssue[];

  constructor(issues: RegistryIssue[]) {
    super(
      issues.length === 1
        ? `Registry validation failed — ${describe(issues[0])}`
        : `Registry validation failed — ${issues.length} issues; first: ${describe(issues[0])}`
    );
    this.name = "RegistryError";
    this.issues = issues;
  }
}
