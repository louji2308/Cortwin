import type { RequirementEntry } from "./types";

/**
 * Requirement entries for the System → Requirements pane.
 *
 * PROVENANCE — docs/TRACEABILITY.md (read-only source, not edited by this unit):
 *   - `description`        = Requirement cell, transcribed verbatim
 *                            (§B row B1, §D row D7, §E rows F1…N5 and H4).
 *   - `satisfactionContract` = Contracts cell, transcribed verbatim.
 *   - `verifyId`           = primary verification ID of the row's Verification
 *                            cell (first VC-* token, or the release checklist
 *                            ID when the cell names one).
 *   - `deepLink`           = assigned here per Contracts §9 (L426–L430)
 *                            ("Show me" must navigate into the view that
 *                            demonstrates the requirement); NOT taken from the
 *                            doc. Every value is validated against the C-10
 *                            grammar by requirementsPane.test.tsx.
 *
 * docs/TRACEABILITY.md is a Markdown table (no machine-readable JSON/YAML/CSV
 * source exists), so this module transcribes rows and the test re-checks every
 * entry against the document text to prevent drift or fabrication.
 *
 * Row selection: one primary entry per requirement the System view must link
 * into, chosen so each C-10 destination (explore, trust/*, system/*) is
 * exercised. Alternate entries live in fixtures.ts (TEST FIXTURE ONLY).
 */
export const REQUIREMENT_ENTRIES: readonly RequirementEntry[] = [
  {
    id: "F1",
    description:
      "Predict CAD, LAD, LCX, RCA from 54 features; exclude LAD, LCX, RCA, Cath",
    satisfactionContract: "C-02, C-03, C-08",
    verifyId: "VC-01",
    deepLink: "#/trust/leakage",
  },
  {
    id: "F2",
    description:
      "3D heart, three separately selectable vessels coloured by calibrated probability; rotate, zoom, select",
    satisfactionContract: "C-02, C-11",
    verifyId: "VC-09",
    deepLink: "#/explore",
  },
  {
    id: "F3",
    description: "Cards, modality and feature SHAP bars, measurements table with contribution",
    satisfactionContract: "C-08, C-12",
    verifyId: "VC-06",
    deepLink: "#/explore",
  },
  {
    id: "F4",
    description: "Persistent safety disclaimer",
    satisfactionContract: "clinical-safety contract (§31.1), INV-C27",
    verifyId: "VC-12",
    deepLink: "#/explore",
  },
  {
    id: "F5",
    description: "Input form with preloaded patient and per-modality 'not provided'",
    satisfactionContract: "C-09, evidence missingness (§41)",
    verifyId: "VC-07",
    deepLink: "#/explore",
  },
  {
    id: "F6",
    description: "Range guard ('outside training range' chip)",
    satisfactionContract: "range guard (§79), C-08",
    verifyId: "VC-07",
    deepLink: "#/explore",
  },
  {
    id: "F8",
    description:
      "Validation page: CIs, calibration, thresholds, leakage toggle (P0 table, P1 toggle)",
    satisfactionContract: "trust view (§32), C-04",
    verifyId: "VC-04",
    deepLink: "#/trust/performance",
  },
  {
    id: "N1",
    description:
      "Responsive on integrated graphics: render on demand, capped pixel ratio, quality drop",
    satisfactionContract: "3D render/quality (§23), C-16",
    verifyId: "VC-14",
    deepLink: "#/explore",
  },
  {
    id: "N5",
    description: "Patient inputs never leave the browser",
    satisfactionContract: "C-15, INV-C18, INV-C19",
    verifyId: "VC-13",
    deepLink: "#/system/architecture",
  },
  {
    id: "D7",
    description: "Hardcoded demo results",
    satisfactionContract: 'demo integrity contract (§44), "no clinical computation in UI"',
    verifyId: "VC-12",
    deepLink: "#/system/integrity",
  },
  {
    id: "H4",
    description: "Model weights in the repo",
    satisfactionContract: "C-01, C-03",
    verifyId: "REL-SUBMISSION",
    deepLink: "#/system/model-card",
  },
];
