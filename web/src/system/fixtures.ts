import type {
  ArchitectureFact,
  ModelCardData,
  ParityReport,
  RequirementEntry,
} from "./types";

/**
 * TEST FIXTURES ONLY — never imported by application code.
 *
 * These values are synthetic inputs for the System pane tests. They are
 * clearly labelled, they exist in this file only, and
 * systemQuality.test.tsx asserts that no pane or data module imports from
 * `./fixtures`, so a fixture can never reach a rendered application surface.
 *
 * Tolerances mirror Contract C-06 golden-fixture tolerances
 * (probability 1e-5, attribution 1e-5, efficiency 1e-6) so the test tables
 * read like a real parity report.
 */

/** Alternate requirement rows (docs/TRACEABILITY.md §B row B1, §E rows F8/H4) with alternate deep links. */
export const REQUIREMENT_ENTRIES_ALT: readonly RequirementEntry[] = [
  {
    id: "F8",
    description:
      "Validation page: CIs, calibration, thresholds, leakage toggle (P0 table, P1 toggle)",
    satisfactionContract: "trust view (§32), C-04",
    verifyId: "VC-04",
    deepLink: "#/trust/calibration",
  },
  {
    id: "H4",
    description: "Model weights in the repo",
    satisfactionContract: "C-01, C-03",
    verifyId: "REL-SUBMISSION",
    deepLink: "#/system/architecture",
  },
  {
    id: "B1",
    description:
      "Overall CAD classification plus stenosis status/probability for LAD, LCX, RCA from demographic, clinical, ECG, lab and echocardiographic features",
    satisfactionContract: "C-02, C-03, C-08",
    verifyId: "VC-05",
    deepLink: "#/explore",
  },
];

/** Subset of the static facts — used to prove the pane renders only what it is given. */
export const ARCHITECTURE_FACTS_ALT: readonly ArchitectureFact[] = [
  {
    label: "Inference",
    detail:
      "A pure TypeScript engine evaluates the model artifact inside a Web Worker, with a main-thread adapter running the same engine if the worker fails. Inference never reaches a server.",
    source: "Architecture.md; C-07",
  },
  {
    label: "State",
    detail:
      "One case, one store, one registry: a single store owns state and one identity registry owns vessel and target identity. Views read artifacts; the UI never recomputes a metric.",
    source: "P-3; INV-04; INV-C01",
  },
];

/** Synthetic manifest facts — placeholder digests, never a real artifact value. */
export const MANIFEST_FACTS_FIXTURE: readonly ArchitectureFact[] = [
  { label: "Manifest version", detail: "0.0.0-fixture (test fixture)", source: "C-01 (test fixture)" },
  {
    label: "model.json sha256",
    detail: "0000000000000000000000000000000000000000000000000000000000000000 (test fixture)",
    source: "C-01 (test fixture)",
  },
  { label: "model.json size (bytes)", detail: "0 (test fixture)", source: "C-01 (test fixture)" },
];

const SHARED_TOLERANCE = {
  probability: 0.00001,
  attribution: 0.00001,
  efficiency: 0.000001,
  margin: 0.00001,
} as const;

/** Every check within tolerance. */
export const PARITY_REPORT_WITHIN: ParityReport = {
  modelId: "synthetic-test-model",
  fixtureId: "synthetic-test-fixture-001",
  tolerance: { ...SHARED_TOLERANCE },
  checks: [
    { name: "probability", observed: 0.0000042, expected: 0.00001, passed: true },
    { name: "attribution", observed: 0.0000009, expected: 0.00001, passed: true },
    { name: "efficiency", observed: 0.0000004, expected: 0.000001, passed: true },
    { name: "margin", observed: 0.000005, expected: 0.00001, passed: true },
  ],
  maxMarginDeviation: 0.000005,
};

/** One check outside tolerance (probability 0.000031 > 0.00001) — renders the failure state. */
export const PARITY_REPORT_OUTSIDE: ParityReport = {
  modelId: "synthetic-test-model",
  fixtureId: "synthetic-test-fixture-002",
  tolerance: { ...SHARED_TOLERANCE },
  checks: [
    { name: "probability", observed: 0.000031, expected: 0.00001, passed: false },
    { name: "attribution", observed: 0.0000021, expected: 0.00001, passed: true },
    { name: "efficiency", observed: 0.0000007, expected: 0.000001, passed: true },
  ],
};

/** A run that reported no checks — designed "no status" state. */
export const PARITY_REPORT_NO_CHECKS: ParityReport = {
  modelId: "synthetic-test-model",
  fixtureId: "synthetic-test-fixture-003",
  tolerance: { ...SHARED_TOLERANCE },
  checks: [],
};

/** Model card with every field a clearly-labelled placeholder (pre-artifact state). */
export const MODEL_CARD_PENDING: ModelCardData = {
  modelIdentity: "Pending artifact — model identity is filled from model.json at integration",
  schemaIdentity: "Pending artifact — feature schema is filled from the registry at integration",
  datasetProvenance:
    "Pending artifact — dataset documentation is filled at integration",
  validationProtocol:
    "Pending artifact — protocol is filled from results.json at integration",
  limitations: [
    "Pending artifact — limitations are filled from the documentation at integration.",
  ],
  attributionCaveats: [
    "Pending artifact — attribution caveats are filled from the explanation contract at integration.",
  ],
  licenceAttribution:
    "Pending artifact — licence and attribution text is filled from assets/ATTRIBUTION.md at integration",
  aiUseDisclosure:
    "Pending artifact — AI-use disclosure is filled from docs/AI_USE.md at integration",
  artifactIdentity: "Pending artifact — filled from model.json at integration",
};

/** Alternate wording plus empty lists — shows prop-driven rendering and "Not provided". */
export const MODEL_CARD_ALT: ModelCardData = {
  modelIdentity: "Synthetic variant — identity not supplied in this fixture",
  schemaIdentity: "Synthetic variant — schema not supplied in this fixture",
  datasetProvenance: "Synthetic variant — dataset documentation not supplied in this fixture",
  validationProtocol: "Synthetic variant — protocol not supplied in this fixture",
  limitations: [],
  attributionCaveats: [],
  licenceAttribution: "Synthetic variant — licence text not supplied in this fixture",
  aiUseDisclosure: "Synthetic variant — disclosure not supplied in this fixture",
  artifactIdentity: "Synthetic variant — artifact identity not supplied in this fixture",
};
