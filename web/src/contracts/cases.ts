import type { FeatureId, FeatureValue, ModalityId } from "./primitives";

/** C-05 §5.5: `hypothetical | cohort-record | blank`, immutable per session. */
export type CaseProvenance = "hypothetical" | "cohort-record" | "blank";

/** C-05 §5.5 — one entry of `cases[]`. */
export type CaseDefinition = {
  id: string;
  label: string;
  provenance: CaseProvenance;
  values: Record<FeatureId, FeatureValue>;
  providedFeatures: Record<FeatureId, boolean>;
  providedModalities: Record<ModalityId, boolean>;
  notes: string[];
};

/** C-05 §5.5 — the cases artifact. */
export type CasesBundle = {
  schemaVersion: "1.0.0";
  cases: CaseDefinition[];
};
