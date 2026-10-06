import type { EvalStatus, FeatureValue, Registry } from "../contracts";

/**
 * Props of the Profile form (C-09 §7.1 surfaces, Implementation_Plan P6 steps
 * 5–6). The form renders ONLY from these props: it never imports the store
 * singleton, never reads an artifact and never computes clinical truth.
 *
 * Dispatch callbacks arrive from the container so the same form runs against
 * the real store (mounting), a store harness (tests) or a read-only projection.
 * `revision` lets the form drop in-progress draft text when case truth moves;
 * `evalStatus` powers the polite "Updating…" affordance (C-07 §6.1).
 */
export type ProfileFormProps = {
  /** C-02 registry — sole source of feature identity, levels, ranges, units. */
  registry: Registry;
  /** `case.values` slice. */
  values: Record<string, FeatureValue>;
  /** `case.providedFeatures` slice (absent key = unprovided; selector convention). */
  providedFeatures: Record<string, boolean>;
  /** `case.providedModalities` slice (absent key = unprovided). */
  providedModalities: Record<string, boolean>;
  /** `case.revision` — used only to discard stale drafts, never dispatched. */
  revision?: number;
  /** `eval.status` — drives the aria-live status line. */
  evalStatus?: EvalStatus;
  /** View-only mode: controls are inert, no dispatch callback ever fires. */
  readOnly?: boolean;
  /** DOM id prefix so two forms can coexist without id collisions. */
  idPrefix?: string;
  /** Selection intent (view-only interaction): never a revision change. */
  onSelectFeature: (featureId: string) => void;
  /** `case.setValue` — the only path a value enters the store. */
  onSetValue: (featureId: string, value: FeatureValue) => void;
  /** `case.setFeatureProvided` — per-field missingness toggle. */
  onSetFeatureProvided: (featureId: string, provided: boolean) => void;
  /** `case.setModalityProvided` — per-modality canonical masking toggle. */
  onSetModalityProvided: (modalityId: string, provided: boolean) => void;
};
