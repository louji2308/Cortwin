/**
 * System view types — Contracts §9 (Project/Contracts.md L411–L434).
 *
 * Every prop shape here is render-only: panes display exactly what they are
 * given and never fetch, compute, or invent a value (INV-04, C-09).
 */

/** One requirement row of the System → Requirements pane (Contracts §9, L426). */
export type RequirementEntry = {
  /** Requirement identifier exactly as written in docs/TRACEABILITY.md (e.g. "F1", "N5"). */
  id: string;
  /** Requirement statement, transcribed verbatim from the TRACEABILITY table. */
  description: string;
  /** Contract that satisfies the requirement, transcribed verbatim from the TRACEABILITY "Contracts" cell. */
  satisfactionContract: string;
  /** Verification checklist ID covering the row (e.g. "VC-01", "REL-SUBMISSION"). */
  verifyId: string;
  /** Fragment deep link rendered by "Show me"; must match C-10 (validated by test). */
  deepLink: string;
};

/** A single static or manifest-supplied architecture fact (Contracts §9, L427). */
export type ArchitectureFact = {
  /** Short label, e.g. "Inference", "State", "Manifest version". */
  label: string;
  /** The fact itself — documented invariant only, never an estimate. */
  detail: string;
  /** Where the fact is documented (contract / plan reference). */
  source: string;
};

/** One row of the System → Integrity parity table (Contracts §9, L429). */
export type ParityCheck = {
  /** Metric name as reported by the parity run, e.g. "probability". */
  name: string;
  /** Observed residual from the run. Non-finite values render as "not available". */
  observed: number;
  /** Tolerance this check was compared against. Non-finite values render as "not available". */
  expected: number;
  /** Whether the run reported this check as within tolerance. The ONLY status input. */
  passed: boolean;
};

/** Tolerance set from Contract C-06 golden fixtures. */
export type ParityTolerance = {
  probability: number;
  attribution: number;
  efficiency: number;
  /** Margin tolerance (Contracts L429). Rendered only when supplied. */
  margin?: number;
};

/**
 * What a parity run reports (C-06, C-07). A `null` report is a designed
 * not-run state — the pane must never substitute a fabricated verdict.
 */
export type ParityReport = {
  modelId: string;
  fixtureId: string;
  tolerance: ParityTolerance;
  checks: ParityCheck[];
  /** Largest margin deviation when the run reports it. Rendered only when supplied. */
  maxMarginDeviation?: number;
  /** Fixture pass/fail counts as the run reported them. Rendered only when supplied. */
  fixtures?: { total: number; passed: number; failed: number };
};

/** One manifest artifact row of the boot hash chain (C-01 §5.1, C-09 INV-04). */
export type ArtifactIntegrityRow = {
  /** Manifest artifact key exactly as published (registry, model, structures, …). */
  key: string;
  /** Manifest-declared relative path of the artifact. */
  path: string;
  /** Manifest-declared SHA-256 digest (lowercase hex, no prefix). */
  declaredSha256: string;
  /** Digest observed over the bytes fetched at boot; null when nothing was observed. */
  observedSha256: string | null;
  /** Manifest-declared byte size. */
  declaredBytes: number;
  /** Byte length observed at boot; null when nothing was observed. */
  observedBytes: number | null;
  /** ISO-8601 instant of the observation; null when nothing was observed. */
  observedAt: string | null;
  /** True only when an observation exists and matches both digest and size. */
  verified: boolean;
};

/**
 * The boot hash chain as the Integrity pane receives it (C-01, C-09 INV-04):
 * declared values come from the inlined manifest, observed values from the
 * digests this browser computed over the bytes it fetched at boot.
 */
export type ArtifactIntegrity = {
  /** `bundleId` from the inlined manifest. */
  bundleId: string;
  /** `modelId` from the inlined manifest. */
  modelId: string;
  /** Model id the loaded engine reports; null when the boot exposed none. */
  engineModelId: string | null;
  /** Whether the engine model id equals the manifest model id; null when unknown. */
  engineModelMatches: boolean | null;
  /** Latest observation instant, or null when nothing was observed. */
  verifiedAt: string | null;
  /** One row per manifest artifact, in manifest order. */
  rows: ArtifactIntegrityRow[];
};

/**
 * Model card projection (Contracts §9, L432): every field is supplied by an
 * artifact or fixture. Empty strings / empty lists render as "Not provided".
 */
export type ModelCardData = {
  modelIdentity: string;
  schemaIdentity: string;
  datasetProvenance: string;
  validationProtocol: string;
  limitations: string[];
  attributionCaveats: string[];
  licenceAttribution: string;
  aiUseDisclosure: string;
  artifactIdentity: string;
};
