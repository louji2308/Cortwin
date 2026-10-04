# CorTwin — Engineering Contracts

**Version:** `1.0.0` · **Status:** Normative baseline · **Date:** `2026-10-03`
**Applies to:** repository, build pipeline, generated artifacts, browser runtime, optional reference API, verification, deployment, and all human/AI engineering agents.

---

## 0. Purpose and Language
This document is the normative compatibility layer between independently developed CorTwin components, phases, artifacts, runtime subsystems and agents. `ARCHITECTURE.md` defines structure, boundaries and invariants and assigns exact schemas and message formats to this document. A later `Implementation.md` MUST consume it and MUST NOT redefine it. It defines no schedules or staffing.

**MUST / MUST NOT** absolute requirement/prohibition (violation blocks handoff or release) · **SHOULD / SHOULD NOT** strong, deviation needs a documented reason and must not violate another contract · **MAY** permitted, no semantic effect · **BLOCKING** failure prevents phase/release completion · **HUMAN GATE** agent MUST stop for a human decision · **AUTHORITATIVE** the source owns the fact; downstream code MUST NOT recreate it.

## 1. Invariants
| ID | Invariant |
| -- | --------- |
| `INV-C01` | One authoritative identity registry. |
| `INV-C02` | One authoritative store for application truth. |
| `INV-C03` | Numeric clinical/model logic exists only in the domain engine. |
| `INV-C04` | Browser inference uses the shipped model artifact and the TypeScript domain engine. |
| `INV-C05` | Python remains the validation/oracle implementation. |
| `INV-C06` | Python/TypeScript parity is a blocking correctness gate. |
| `INV-C07` | `LAD`, `LCX`, `RCA`, `Cath` never enter model inputs. |
| `INV-C08` | Unprovided evidence is represented by observation state/masking, never zero-fill. |
| `INV-C09` | Unobserved features receive no attribution. |
| `INV-C10` | Attribution reconciliation occurs only in calibrated-margin/log-odds space. |
| `INV-C11` | The CAD headline has an explicit value-source target and a separate CAD decision/reliability reference. |
| `INV-C12` | A probability is never shown without threshold, decision state and reliability tier. |
| `INV-C13` | Only `ProbabilityReadout` renders probability values. |
| `INV-C14` | The 3D scene never reads the model artifact. |
| `INV-C15` | Vessel identity originates only from the registry. |
| `INV-C16` | Vessel colour means whole-vessel probability, never lesion location. |
| `INV-C17` | Validation numbers shown by the UI originate in `results`. |
| `INV-C18` | No patient/case value leaves the browser runtime. |
| `INV-C19` | No patient/case value is persisted by browser storage APIs. |
| `INV-C20` | Ordinary navigation URLs never contain edited patient values. |
| `INV-C21` | Share URLs contain only explicitly approved differences from a named case. |
| `INV-C22` | A stale computation response never becomes current state. |
| `INV-C23` | Invalid/incompatible artifacts cause an explicit boot failure, never guessed compatibility. |
| `INV-C24` | Narrative output is deterministic and template-based. |
| `INV-C25` | No generative model participates in the clinical/risk path. |
| `INV-C26` | Runtime third-party network requests are prohibited. |
| `INV-C27` | The safety banner lives outside views and cannot be removed by a view. |
| `INV-C28` | Release claims distinguish architectural targets from measured values. |
| `INV-C29` | The optional API is never a critical-path dependency. |
| `INV-C30` | No agent weakens a blocking invariant merely to make a test pass. |

## 2. Source Authority and Conflicts
| Level | Source | Authority |
| ----- | ------ | --------- |
| A | Official hackathon rules / Track A requirements | Highest |
| B | `Idea.md`, `Final_demo.md` | Product meaning and experience |
| C | `ARCHITECTURE.md` | Structure, boundaries, invariants, decisions |
| D | `Tech_Stack.md` | Technology, versions, hosting, tooling |
| E | `Implementation.md` | Execution order, ownership, schedule |

Track A weights: Predictive Performance 30%, 3D Visualization 25%, Clinical Interpretability 20%, System Integration 15%, Technical Implementation 10%. Calibration, reliability tiers, evidence progression and audit views are differentiators, not official bonus requirements.

**Conflict procedure:** detect → record conflicting statements → apply higher-authority source → assess materiality → if material, HUMAN GATE → update the owning source or contract revision. A conflict is *material* if it changes model semantics, clinical wording, patient-data handling, runtime dependency, public API, schema, state ownership, URL semantics, safety behaviour, verification criteria or hackathon compliance. Agents MUST NOT silently reconcile or "correct" upstream sources; enforce the safe behaviour here and keep the discrepancy in the decision register.

**Resolved conflicts:**
* `SRC-CONFLICT-01` URL form: fragment routing; edited values never enter ordinary URLs (`C-10`).
* `SRC-CONFLICT-02` Worker failure: same engine on the main thread; the API is never a browser fallback.
* `SRC-CONFLICT-03` "ML backend": satisfied by the offline Python pipeline plus the browser engine, unless organisers explicitly require a network backend (then HUMAN GATE and revise `C-14`/`C-15`).
* `SRC-CONFLICT-04` Any wording making `/predict` mandatory is superseded; the app MUST work without it.

## 3. Scope and Non-Negotiable Rules
CorTwin is a static, client-side clinical-probability instrument: immutable artifacts evaluated by a TypeScript engine in a Web Worker (main-thread fallback). It is not a diagnostic tool, lesion locator, treatment system, persistent service or multi-user platform.

```text
Five evidence groups (History, Exam & symptoms, ECG, Labs, Echo) → 54 model features
  → CAD + LAD + LCX + RCA predictions → 3D vessel correspondence
  → exact model attribution → trust/validation evidence
```

* **Numeric truth.** Every on-screen number MUST be (1) computed by the live engine from the loaded model and current case, or (2) read from a generated artifact. Literal numbers for results, metrics, thresholds, cohort statistics, calibration, AUCs, CIs, reliability or ladder performance are prohibited.
* **Clinical semantics.** Describe probability (not "risk score"), vessel-level probability, model attribution, decision state, reliability tier, cohort applicability and decision-support limits. MUST NOT claim to diagnose, detect lesions, locate plaque, recommend treatment, prove causality, simulate treatment effect or replace diagnostic imaging.
* **Leakage.** The source has 59 columns; the model uses 54 after excluding `LAD`, `LCX`, `RCA`, `Cath` (target-related) and the constant `Exertional CP`. These MUST NOT appear in the feature vector, coefficient maps, tree split indices, training matrix, runtime feature config or exported feature references. They MAY appear in input-audit evidence, leakage-lab results, provenance, source-schema metadata and exclusion docs.

## 4. Contract Registry and Conventions
Existing `C-*` IDs MUST NOT be renumbered or reassigned. Other namespaces: `AG-*` agents, `PH-*` phases, `VC-*` verification, `REL-*` release. `C-07` and `C-08` freeze first.

| ID | Contract | Owner |
| -- | -------- | ----- |
| `C-01` | Manifest | Artifact pipeline |
| `C-02` | Registry | Config / domain foundation |
| `C-03` | Model bundle | Model export pipeline |
| `C-04` | Results | Validation pipeline |
| `C-05` | Cases | Artifact pipeline |
| `C-06` | Golden fixtures | Oracle / verification |
| `C-07` | Compute protocol | Compute client + engine |
| `C-08` | Evaluation and Explanation payloads | Domain engine |
| `C-09` | Store shape, intents, selectors | Store |
| `C-10` | URL grammar | App / router / store |
| `C-11` | SceneModel and StructureSource | Scene |
| `C-12` | Shared component props | Component layer |
| `C-13` | Narrative templates and vocabulary | Domain / copy |
| `C-14` | Reference API | Optional API |
| `C-15` | CSP, privacy, request allowlist | Security / build |
| `C-16` | Quality tiers and budgets | Scene / CI |

**Identifiers** are ASCII, stable, case-sensitive, immutable once published, unique in their namespace, declared by their owning artifact, and never inferred from display labels (renaming a label MUST NOT rename an ID).

**Numerics:** probability is finite in `[0,1]`; margins/attributions are finite calibrated log-odds; feature vectors use `Float32Array` semantics with float32 split comparisons; accumulation is double precision; parity tolerance is `1e-5` absolute for probability, margin and attribution; additivity residual `≤ 1e-6`; array lengths are explicit and validated; NaN/±Infinity are invalid and MUST NOT cross a committed domain-output boundary. JSON artifacts hold finite numbers only; typed-array order MUST match the `C-02` feature order; JSON property order is not semantic, positional array order is.

**Versioning** `MAJOR.MINOR.PATCH`. MAJOR (breaking): any change to `C-07`, `C-08`, model schema, registry identity, feature order, target IDs, store truth shape, URL grammar, clinical vocabulary, security policy, artifact integrity rules, missingness semantics, persistence policy, network dependency, API contract or clinical semantics. MINOR: backward-compatible additions. PATCH: behaviour-neutral clarifications. Keep `schemaVersion` (artifact shape), `modelId` (content hash of learned model) and `appVersion` (source revision) distinct: code-only changes MUST NOT alter `modelId`; model-content changes MUST.

## 5. Artifact Contracts
Artifacts (`manifest, registry, model, structures, cases, results, fixtures`) are the sole build→runtime coupling. Fact ownership: **Defined** → registry/config, **Learned** → model, **Measured** → results. Artifacts MUST NOT replicate another's authoritative values unless declared derived.

### 5.1 `C-01` Manifest
```json
{ "schemaVersion": "1.0.0", "appVersion": "string",
  "bundleId": "sha256:<hex>", "modelId": "sha256:<hex>",
  "artifacts": { "<registry|model|structures|cases|results|fixtures>": { "path": "string", "sha256": "hex", "sizeBytes": 0 } },
  "provenance": { "dataSha256": "hex", "seedSet": {}, "sourceRevision": "string", "toolVersions": {} },
  "attributions": [] }
```
The manifest MUST be inlined in `index.html`, list every required artifact with SHA-256 and exact byte size, identify the model by content hash, and record data checksum, seeds, source revision, tool versions and required attributions. Artifact paths MUST be content-addressed or tied to their SHA-256.

**Loader:** parse manifest → validate `schemaVersion` → fetch only manifest-listed paths → verify SHA-256 and size → validate cross-artifact identity → reject incompatible artifacts → expose an immutable bundle. No artifact is used before verification; failure → boot-blocked state. Exactly one manifest major version is supported; unknown minor/patch behaviour is rejected unless covered by a versioned compatibility declaration. The loader MUST also reject on registry/model feature-order or target-identity mismatch, registry/structure mismatch, wrong feature count, or fixture/model identity mismatch. No best-effort loading.

### 5.2 `C-02` Registry
The sole correspondence authority for modalities, features, stages, targets and structures.
```json
{ "schemaVersion": "1.0.0",
  "modalities": [{ "id": "history", "label": "History", "order": 0 }],
  "features": [{ "id": "age", "label": "Age", "modality": "history", "kind": "continuous",
    "encoding": { "type": "identity" }, "displayGroup": null, "unit": null,
    "unitStatus": "verified|unverified", "range": { "min": 0, "max": 0 }, "derived": null }],
  "targets": [{ "id": "CAD", "label": "CAD", "kind": "overall", "modelKey": "CAD",
    "structureId": null, "labelDefinition": "string" }],
  "structures": [{ "id": "LAD", "label": "LAD", "meshNode": "LAD", "cameraPreset": "LAD", "schematicPath": "string" }],
  "displayGroups": [],
  "stages": [{ "id": "history", "order": 0, "modalitiesThrough": ["history"] }],
  "forbiddenInputColumns": [{ "id": "LAD", "reason": "target leakage" }] }
```
* **Required entities:** targets exactly `CAD, LAD, LCX, RCA`; exactly 54 features, each in one modality: History 17, Exam & symptoms 13, ECG 7, Labs 14, Echo 3.
* **Encoding:** `Y/N→1/0`; Sex `Male=1, Fmale=0`; BBB `N=0, LBBB=1, RBBB=2`; VHD `N=0, mild=1, Moderate=2, Severe=3`. Unknown categorical/ordinal values throw a typed encoding error; source spellings are case-sensitive. BMI = `Weight / (Length/100)^2`, derived, read-only in the UI, recomputed before encoding.
* **Referential integrity** (validated at build, load, test): every feature → known modality; every target → known model key; every vessel target → one structure; every structure → valid mesh node; feature indices unique; forbidden columns disjoint from model features; display groups contain only existing features; stage sequences monotonic; no ID collisions.
* **Identity chain** (no second mapping table allowed): `vessel ID ↔ target ID ↔ model key ↔ structure ID ↔ mesh node ↔ camera preset ↔ UI card ↔ explanation target ↔ Trust target`.

### 5.3 `C-03` Model Bundle
Sections: `metadata, features, targets, components, decisionParameters, reliabilityReferences, background, percentiles, provenance`. Metadata: `{ schemaVersion, modelId: "sha256:<hex>", modelFamily: "additive-ensemble", featureCount: 54, targets: ["CAD","LAD","LCX","RCA"] }`.

* **Trees** per target: `targetId, baseScore, treeCount, trees[], maxDistinctFeaturesPerTree`. A tree is `{ "nodes": [...] }`; each node is either a split `{featureIndex, threshold, left, right, leaf:null}` or a leaf `{featureIndex:null, threshold:null, left:null, right:null, leaf:<finite>}`, never both. The exporter MUST reject trees exceeding the exact-attribution bound (3 distinct split features for the current depth-2 family). The base score MUST be explicit; the runtime MUST NOT assume a library default.
* **Linear** per target: `intercept, coefficientByFeature, meanByFeature, scaleByFeature`, in registry order. No UI/component may recompute these formulas:
```text
linearMargin      = intercept + Σ coefficient[i]·((x[i] − mean[i]) / scale[i])
rawEnsembleMargin = 0.5·treeMargin + 0.5·linearMargin
calibratedMargin  = plattSlope·rawEnsembleMargin + plattIntercept
probability       = sigmoid(calibratedMargin)
```
* **Decision parameters** per target: `{ thresholdProbability, abstentionHalfWidthMargin, thresholdSelection: { method: "max_f1_inner_validation", source: "validated_pipeline" } }`. Thresholds are learned artifact values. The abstention band is in **margin space**; the threshold margin is derived from threshold probability and the Platt transform, never hand-maintained.
* **Reliability references:** `{ targetId, tier, ruleId: "RT-1", evidenceRef: "results.reliability.targets.<id>" }`. The browser MUST NOT compute reliability from AUC or any metric. `RT-1`: reliability is an *evidence classification*, not a confidence interval or decision state. The pipeline assigns one of `strong` (evidence supports a stable, useful target-level model under the published protocol), `moderate` (useful discrimination but uncertainty, sample limits or spread weaken it) or `limited` (materially weak, near baseline, unstable or insufficient), and emits `ruleId`, `tier`, evidence references and a rationale code. Numbers stay in `results`.
* **Background rows:** fixed set of 60 training rows (fixed seed, model feature order) used only for explanation. Not a second training set, not targets, not patient cases unless represented as cases with provenance.
* **Percentiles:** continuous features carry 101 empirical quantile points (0th–100th) with piecewise-linear interpolation; binary/ordinal features use cohort share of the selected value.
* **Immutability:** a loaded model MUST NOT have coefficients, trees, thresholds, tiers or background rows edited, or features inserted/reordered.

### 5.4 `C-04` Results
One logical file, lazily loaded after first interaction.
```json
{ "schemaVersion": "1.0.0",
  "protocol": { "patientCount": 303, "featureCount": 54, "outerFolds": 5, "outerRepeats": 3, "innerFolds": 4,
    "noSmote": true, "preprocessingInsideFold": true, "calibrationInsideFold": true,
    "thresholdInsideFold": true, "abstentionInsideFold": true },
  "performance": {}, "calibration": {}, "decisions": {}, "subgroups": {},
  "evidenceLadder": {}, "leakageLab": {}, "reliability": {}, "provenance": {} }
```
* **Performance** per target: `accuracy, precision, recall, f1, rocAuc, rocAucCI, majorityBaseline`.
* **Calibration** per target MAY include `raw, platt, brier, baseRateBrier, ece, reliabilityCurve`. The browser MUST NOT compute Brier/ECE.
* **Decision sweeps** are precomputed: `{ targetId, points:[{threshold, precision, recall, f1}], selectedThreshold }`. Abstention coverage/accuracy sweeps are precomputed; the live case may be positioned on them using its margin and band only. The browser MUST NOT regenerate cohort curves.
* **Subgroups** carry target, group ID, `n`, metric and uncertainty metadata; small groups carry the pipeline's caveat.
* **Evidence ladder** (cumulative: History; +Exam; +ECG; +Labs; +Echo) carries `stageId`, stage semantics, cohort AUC, CI where available and provenance. It is cumulative information, NOT a recommended work-up sequence.
* **Custom subsets** MUST NOT claim cohort AUC unless that exact subset was validated; show "Cohort AUC not validated for custom subsets" (or approved equivalent).
* **Leakage lab** results are labelled `probe model` or `deployed model` and never merged. Probes may include: honest pipeline, SMOTE-before-CV, feature-selection-before-CV, target leakage, random-split seed sensitivity.
* `results` MUST NOT contain out-of-fold patient predictions, names, identifiers, raw patient rows or hidden labels. Aggregated summaries are allowed.

### 5.5 `C-05` Cases
```json
{ "schemaVersion": "1.0.0", "cases": [{ "id": "hypo1", "label": "Hypothetical · Complete",
  "provenance": "hypothetical", "values": {}, "providedFeatures": {}, "providedModalities": {}, "notes": [] }] }
```
Provenance is `hypothetical | cohort-record | blank` and immutable in a session. A cohort-record case MUST be marked in-sample/optimistic; a hypothetical case MUST NOT duplicate a cohort record while claiming independence. Example cases (`cases`) and background rows (`model`) are independent. A blank case has all features unprovided; its default values MUST NOT affect inference, and its output is `v(∅)` (reference/cohort-average behaviour).

### 5.6 `C-06` Golden Fixtures
```json
{ "schemaVersion": "1.0.0",
  "tolerance": { "probability": 0.00001, "margin": 0.00001, "attribution": 0.00001, "efficiency": 0.000001 },
  "fixtures": [{ "id": "fixture-001", "coverageTags": ["fully-observed","boundary"],
    "input": { "values": {}, "providedFeatures": {} },
    "expected": { "targets": {}, "headlineCad": {}, "explanations": {} } }] }
```
**Coverage MUST include:** fully observed; blank; each modality masked independently; cumulative stage masks; multi-modality combinations; every categorical and ordinal level; values exactly at split thresholds; float-rounding boundaries; threshold boundaries; abstention-band edges; vessel-above-CAD coherence; out-of-range values; observed-only attribution; selected-target changes; finite-output failures.

Explanation fixtures contain target, reference margin, output margin, observed-feature attributions, display-group sums, modality sums, efficiency residual and caveat keys; unobserved features MUST NOT appear as non-zero attributions. Fixture sets record oracle revision, `modelId`, registry version, data checksum, generation seed and schema version. Fixtures are published only from the validated oracle; a model change invalidates model-dependent fixtures.

## 6. Runtime Compute Contracts
### 6.1 `C-07` Compute Protocol (`computeProtocolVersion = "1.0.0"`)
```ts
type ComputeRequest = {
  protocolVersion: "1.0.0"; requestId: string; channel: "case" | "verification";
  revision: number; lane: "L0" | "L1" | "L2" | "L3";
  operation: "evaluate" | "explain" | "ladder" | "integrity";
  featureVector: Float32Array; observedMask: Uint8Array;
  targetId?: TargetId; verificationFixtureId?: string;
};
type ComputeResponse = {
  protocolVersion: "1.0.0"; requestId: string; channel: "case" | "verification";
  revision: number; lane: "L0" | "L1" | "L2" | "L3";
  operation: "evaluate" | "explain" | "ladder" | "integrity";
  status: "ok" | "error";
  evaluation?: Evaluation; explanation?: Explanation; ladder?: LadderPayload; integrity?: IntegrityPayload;
  timing?: { computeMs: number }; error?: ComputeError;
};
type ComputeError = {
  code: "MALFORMED_REQUEST" | "ARTIFACT_INVALID" | "NONFINITE_INPUT"
      | "UNSUPPORTED_OPERATION" | "INVALID_FEATURE_VECTOR" | "INTERNAL_COMPUTE_FAILURE";
  message: string;   // MUST NOT contain patient values
  recoverable: boolean;
};
```
**Request rules:** `featureVector` and `observedMask` lengths MUST equal the registry feature count, in registry order; mask values are `0|1`; the worker validates artifact compatibility first.

| Lane | Operation | Trigger |
| ---- | --------- | ------- |
| `L0` | `evaluate` | every case revision |
| `L1` | `explain` | selected-target change or settled case change |
| `L2` | `ladder` | settled case revision |
| `L3` | `explain` | idle background cache warming |
| verification | `integrity` | System Integrity |

Priority `L0 > L1 > L2 > L3`; lanes MAY run concurrently only if resource-safe; within a case lane only the newest applicable revision may become current.

**Revision semantics.** The case revision starts at `1`, increments monotonically on every case-value or provision-state change, never decreases in a session, is owned by the store and echoed unchanged by responses. A response is current only if `channel` matches AND `revision` equals the current case revision AND `targetId` matches the current selection where applicable. Stale responses MUST be discarded and MUST NOT update `eval`, the display channel, change summary, explanation or scene. Selecting a vessel does not change the revision; an explanation is valid only for the currently requested target. Superseded jobs MAY finish but are discarded on arrival. While an explanation is pending, the previous one MAY remain visible only with an "updating" state and MUST NOT appear current.

**Timing/timeout.** `timing` is diagnostic only: not clinical output, never transmitted, shown only in local debug modes. There is no normative per-request timeout; a startup watchdog MAY trigger worker degradation but MUST NOT alter numerical results.

### 6.2 `C-08` Evaluation and Explanation
```ts
type TargetEvaluation = {
  targetId: "CAD" | "LAD" | "LCX" | "RCA"; probability: number; calibratedMargin: number;
  thresholdProbability: number;
  decision: "above" | "below" | "indeterminate";
  reliability: "strong" | "moderate" | "limited";
  abstention: { lowerProbability: number; upperProbability: number; halfWidthMargin: number };
};
type Evaluation = {
  revision: number; observedFeatureIds: string[];
  targets: Record<TargetId, TargetEvaluation>;
  headlineCad: HeadlineCad; rangeFlags: Record<string, boolean>;
};
type HeadlineCad = {
  probability: number; valueSourceTargetId: "CAD" | "LAD" | "LCX" | "RCA";
  decisionReferenceTargetId: "CAD"; decision: "above" | "below" | "indeterminate";
  reliability: "strong" | "moderate" | "limited"; thresholdProbability: number;
  explanationSourceTargetId: "CAD" | "LAD" | "LCX" | "RCA";
};
type Explanation = {
  revision: number; targetId: TargetId;
  referenceMargin: number; outputMargin: number; efficiencyResidual: number;
  featureAttributions: Array<{ featureId: string; value: number; contribution: number;
    direction: "positive" | "negative" | "neutral" }>;
  displayGroups: Array<{ groupId: string; contribution: number; memberFeatureIds: string[] }>;
  modalityContributions: Array<{ modalityId: string; contribution: number; memberFeatureIds: string[] }>;
  measurements: Array<{ featureId: string; value: number;
    cohortPosition: { kind: "percentile"; value: number } | { kind: "cohort-share"; value: number };
    contribution: number; direction: "positive" | "negative" | "neutral" }>;
  caveats: string[];
  narrative: { templateId: string; slots: Record<string, string | number> };
};
```
* **Decision state** (a property of the current case, never derived from reliability): `above` = clearly above the target threshold and outside the abstention band; `below` = clearly below and outside the band; `indeterminate` = calibrated margin inside the band.
* **Reliability** is a target-level evidence property; it MUST NOT change with selected vessel, case values, decision state or threshold crossing, only when the loaded model/results change.
* **Headline CAD:** `probability = max(P_CAD, P_LAD, P_LCX, P_RCA)`; the argmax target is the value source and the explanation source. Decision, reliability and threshold use CAD's parameters. If the source is a vessel the UI MUST disclose it ("CAD shown from LAD" or approved equivalent). This is an engine rule, not a UI clamp.
* **Missing-evidence value function.** Let `O` = observed features, `B` = background rows, `g(x) = PlattSlope·0.5·(TreeMargin(x)+LinearMargin(x)) + PlattIntercept`. This is the only allowed missing-evidence semantics:
```text
v(S) = mean over b∈B of g(x restricted to S, b elsewhere),   S ⊆ O
displayed p = sigmoid(v(O));   reference r = sigmoid(v(∅))
φ_i = exact Shapley value of i in game (O, v);   Σφ_i + v(∅) = v(O)  (|residual| ≤ 1e-6)
```
* **Missingness:** unprovided evidence is represented by the mask; MUST NOT be zero-filled or turned into a "normal" value; MUST NOT receive attribution or a zero bar; MUST show "Not provided". Stored values of unprovided features are ignored until observed. `v(∅)` is a valid evaluation.
* **Aggregation:** feature → display group → modality by summation, each level reconciling with the one below; no UI component recomputes sums.
* **Caveats:** every explanation carries, and the UI renders, `ATTRIBUTION_NOT_CAUSATION`, `CORRELATED_FEATURES_SHARE_CREDIT`, `BACKGROUND_SET_DEPENDENT`. Correlated features (Weight, Length, BMI) may split credit and MUST NOT be shown as unique biological causes.
* **Domain purity:** the engine is pure, depends only on registry and validated model data, and MUST NOT depend on React, Zustand, Three.js, DOM/Web APIs, worker messaging, network, storage or UI state. The same engine runs in the Web Worker, main-thread adapter and Node verification.

## 7. State and Navigation
### 7.1 `C-09` Store
The store is the sole runtime source of truth.
```ts
type CorTwinState = {
  bundle: { status: "booting" | "ready" | "error";
    manifest: Manifest | null; registry: Registry | null; modelMetadata: ModelMetadata | null;
    resultsStatus: "not_loaded" | "loading" | "ready" | "error"; results: Results | null };
  case: { id: string; provenance: "hypothetical" | "cohort-record" | "blank";
    values: Record<FeatureId, FeatureValue>;
    providedModalities: Record<ModalityId, boolean>; providedFeatures: Record<FeatureId, boolean>;
    customSubset: boolean; revision: number; committedRevision: number;
    committedValues: Record<FeatureId, FeatureValue> };
  eval: { status: "idle" | "computing" | "ready" | "error" | "updating";
    current: Evaluation | null; committed: Evaluation | null;
    stageEvaluations: Record<string, Evaluation | null>;
    explanationCache: Record<string, Explanation>; error: ComputeError | null };
  selection: { targetId: TargetId | null; modalityId: ModalityId | null;
    featureId: FeatureId | null; stageId: StageId | null;
    hovered: { kind: "vessel" | "modality" | "feature"; id: string } | null };
  view: { route: "explore" | "trust" | "system"; pane: string | null;
    drawer: "input-audit" | "model-card" | "feature-popover" | null;
    cameraPreset: "overview" | "CAD" | "LAD" | "LCX" | "RCA";
    tourStep: number | null; qualityTier: "Q0" | "Q1" | "Q2" | "Q3"; reducedMotion: boolean };
};
```
* **Write ownership:** `bundle` → bundle loader; `case`, `selection` → user-intent layer; `eval` → compute client; `view` → navigation/presentation layer. No component mutates `eval.current`.
* **Intents:** `case.{select, setValue, setModalityProvided, setFeatureProvided, reset, enableCustomSubset}` · `selection.{selectTarget, selectModality, selectFeature, selectStage, setHover}` · `view.{navigate, openDrawer, closeDrawer, setCameraPreset, startTour, stopTour, setTourStep, setQualityTier, setReducedMotion}`.
* **Selectors** MAY derive completion %, modality counts, selected target, vessel visual state, displayed CAD, narrative presentation and URL state; they MUST NOT mutate state or perform I/O.
* **Revision** increments on field edit, modality/feature provision change, reset and case selection. Selection-only and view-only changes do not. Selecting a case replaces case truth with no contamination from the previous case.
* **Commit semantics:** truth changes as soon as a valid result arrives; the previous settled evaluation is kept as `committed`; a snapshot is recorded after an edit burst settles (presentation timing only). Change summaries compare committed vs current and MUST be described as "model response to this input change", never treatment or intervention effect.
* **Display channel:** interpolated presentation values only (animated probability, bar length, material parameter, number). It MUST NOT hold patient truth, case, coefficients, decisions, reliability or validation results. With reduced motion, animation duration is `0`; truth is unchanged.

### 7.2 `C-10` URL and Navigation
```text
URL        = "#" route [ "?" query ]
route      = "/explore" / "/trust/" trustPane / "/system/" systemPane
trustPane  = "performance" / "calibration" / "decisions" / "subgroups" / "leakage"
systemPane = "requirements" / "architecture" / "integrity" / "model-card"
query keys, canonical order: case, target, feature, stage, share
```
* Ordinary URLs MAY encode view, pane, case ID, target, feature and stage; MUST NOT encode edited values, raw patient data, names or identifiers.
* Selection changes use history *replace*; view changes create history entries. Unknown parameters are ignored.
* Unknown routes MUST NOT execute code, MUST resolve to a safe known route and show a notice. Unknown IDs in known parameters yield the default valid state plus a visible notice; no partial untrusted state is kept.
* **Share URLs** are the only URLs allowed to carry edited values, only after an explicit user action that states the data-sharing consequence. Payload (URL-safe encoded in `share`): `{ "version": 1, "baseCase": "hypo1", "values": {}, "provided": {} }`, encoding only differences from `baseCase`; no duplicated case data, model, results, arbitrary JSON, credentials or non-registry IDs. Never auto-generated; ordinary navigation never populates `share`. A malformed payload is rejected and the active case stays unchanged.

## 8. Scene and Presentation
### 8.1 `C-11` SceneModel and StructureSource
```ts
type SceneModel = {
  vessels: Record<VesselId, { probability: number; decision: "above" | "below" | "indeterminate";
    selected: boolean; hovered: boolean; dimmed: boolean }>;
  cameraTarget: "overview" | "LAD" | "LCX" | "RCA"; selectedTargetId: TargetId | null;
  hoveredEntity: { kind: "vessel" | "modality" | "feature"; id: string } | null;
  qualityTier: "Q0" | "Q1" | "Q2" | "Q3"; reducedMotion: boolean;
};
interface StructureSource {
  kind: "gltf" | "procedural";
  nodes: { HEART: SceneNode; AORTA: SceneNode; LAD: SceneNode; LCX: SceneNode; RCA: SceneNode };
  schematic: { LAD: SchematicPath; LCX: SchematicPath; RCA: SchematicPath };
}
```
* The scene consumes only `SceneModel`, registry structure metadata, design tokens and `StructureSource`; it MUST NOT consume `model.json`, coefficients, SHAP code or Python output.
* `HEART` and `AORTA` stay neutral (never given a probability); `LAD/LCX/RCA` are probability-driven. No inferred lesion; no spatial colouring that implies plaque coordinates.
* **Decision encoding:** above = saturated/solid; below = lower intensity; indeterminate = hatch plus text/badge. Anatomy MUST NOT become translucent to express indeterminate.
* Selection MAY use outline/emissive accent; identity comes from label/position, probability from the data ramp. Picking MAY use invisible thicker proxy geometry without altering visual semantics.
* **Camera:** Overview, LAD, LCX, RCA; ~700 ms flights, immediate under reduced motion. Orientation captions (`cranial`, `caudal`, `LAO`) need clinical review before approval.
* **Fallback chain:** primary StructureSource → procedural → 2D schematic, all with the same registry IDs.
* **One probability-to-colour function** drives 3D material, legend, vessel tags and probability visuals. The legend shows the selected target's own threshold (never assume `0.5`). Identity is carried by label, position, structure and glyph, not colour.

### 8.2 Render and Quality (supports `C-16`)
The renderer MUST draw zero frames when idle (except bounded attract mode), requesting frames only for animation, control/camera damping, hover, resize, quality change or attract mode.

| Tier | Behaviour |
| ---- | --------- |
| `Q0` | Full pixel ratio, anti-aliasing, full hatch |
| `Q1` | Lower pixel-ratio cap, no anti-aliasing |
| `Q2` | Pixel ratio 1; hatching replaced by solid state plus text label |
| `Q3` | 2D schematic |

Quality is downgrade-only within a session, uses hysteresis, and MUST NOT flap. Q3 derives from the same `SceneModel`, registry and vessel IDs and preserves correspondence, probability, decision, selection and labels. Scene targets: ≤150k triangles, ≤30 draw calls, 0 textures; no external environment maps or hosted fonts.

### 8.3 `C-12` Shared Components
`ProbabilityReadout` is the only probability renderer.
```ts
type ProbabilityReadoutProps = {
  value: number; targetId: TargetId; targetLabel: string; threshold: number;
  decision: "above" | "below" | "indeterminate"; reliability: "strong" | "moderate" | "limited";
  size: "compact" | "large"; sourceTargetId?: TargetId;
};
```
Every readout MUST show numeric probability, threshold relation, textual decision state + glyph, and reliability text + glyph. No bare-probability variant; colour alone never conveys decision or reliability. It MUST NOT fetch results, compute thresholds/reliability/probabilities, invoke model code or choose a source target itself.

### 8.4 Interaction
Every interaction follows: trigger → intent → store mutation → revision/selection evaluation → compute request if needed → truth update → display-channel update → presentation → accessibility announcement. No view bypasses the store.
* **Boot:** index + manifest → critical artifact verification → registry/model/structures/cases ready → deterministic default (or URL-selected) case, preloaded without a "Load" action → revision 1 → L0 → first truth → reveal (neutral anatomy → staggered vessel recolour ~600 ms → count-up ~400 ms → coach prompt). Durations are presentation only.
* **Edit:** field intent → revision +1 → L0 → truth → 3D, number and bars animate together. No Run button.
* **Modality "Not provided":** mask updates, revision increments, model re-marginalises, section greys out, no zeros inserted, attribution for those features disappears, UI says "Not provided".
* **Feature editor:** a SHAP or Measurements row click selects the feature and opens a popover (value, cohort distribution, contribution, valid edit) feeding the standard edit loop; it is not a second state system.
* **Vessel selection:** hover/click/keyboard (Tab/Arrow; LAD, LCX, RCA). Selection flies the camera, triggers L1 and MUST update mesh, vessel card, Inspector, Evidence Rail, Trust selector and explanation together.
* **Hover** changes only the hover channel (no revision change, inference, selection change or truth mutation) and highlights every representation of the entity.
* **Evidence Rail** (part of Explore) states that it shows cumulative information, not a recommended work-up. Selecting stage `k` provides modalities `≤ k` and not-provides the rest, using the same mask semantics and engine.
* **Build Up** is the only global play control: History → Exam → ECG → Labs → Echo over ~8 s with real evaluations and no prerecorded probabilities.
* **Custom subset:** feature/modality observation may be edited; cumulative-ladder validation claims stop applying, cohort-AUC display is suppressed and the unvalidated-AUC warning stays visible.
* **Deltas:** a chip MAY persist ~2.5 s. Approved: "LAD 76 → 63 · Typical chest pain Yes → No · model response to this input". Probability-point deltas and log-odds attributions are distinct and MUST NOT be conflated. Prohibited: treatment impact, intervention effect, clinical benefit.
* **Tour/Export:** a tour is a declarative list of valid store states using ordinary intents, with no hidden inference/scene API. Export uses browser print-to-PDF from the current view-model, preserving disclaimer, caveats, target/context and model version, adding no unsupported claims, with no PDF service or network.

### 8.5 Inspector
Three depths: Case → Vessel → Feature.
* **Case:** CAD headline (with source disclosure), decision, reliability, three vessel results, top modality contributors.
* **Vessel:** identity, probability, threshold, decision, reliability, Why, Measurements, Evidence.
* **Why:** reference margin → display groups → modalities → output margin; MUST reconcile.
* **Measurements:** per row, feature value, cohort percentile or cohort share, attribution, direction; no outside clinical range replaces the cohort range.
* **Evidence:** target AUC, CI, majority baseline, reliability tier, one-line rationale, all from `results`.

### 8.6 Inputs and Range Guard
Feature editors MUST reject unknown categorical levels and non-numeric, non-finite or malformed ordinal values. Out-of-range numerics (outside cohort min/max) remain valid for inference and show an informational "outside training range" flag that MUST NOT change value, probability, attribution or decision. The UI MUST NOT expose `LAD/LCX/RCA/Cath` as inputs (Input Audit may list them as excluded). Unverified units stay `unitStatus="unverified"` and MUST NOT be invented; verification is a human gate.

### 8.7 `C-13` Narrative and Copy
Narrative = domain artifact + approved template + approved vocabulary; no runtime LLM. Templates MAY consume feature/modality/target labels and values, probability changes, attribution direction, decision, reliability, validated cohort/ladder values and approved caveat text; MUST NOT consume free text, external model output or hidden clinical facts. The system MUST distinguish "model response to input change" from "treatment/intervention effect".

Preferred vocabulary: probability, model attribution, not provided, indeterminate, estimated, cohort, model response, whole-vessel probability, "≥50% stenosis under the cohort label".

Copy lint MUST flag at minimum: `diagnose/diagnosed/diagnosis`, `detect/detected/detection`, `recommend/recommended/recommendation`, `treatment impact`, `treatment effect`, `caused by`, `causes`, `proves/proven`, `lesion location`, `plaque location`. A flagged phrase MAY appear only in an explicit limitation statement explaining that CorTwin does not make that claim. Lint covers user-visible strings, templates, route labels, safety copy and Trust/System headings; failure blocks demo/submission.

## 9. Safety, Trust and System Views
* **Disclaimer:** the shell permanently shows a non-dismissible educational decision-support disclaimer that no route or view unmounts.
* **Probability framing:** always carries target, threshold, decision state, reliability and cohort/label context. The model is cohort-specific with no external validation; probabilities are never described as universal population probabilities.
* **Provenance badges** stay visible: "Hypothetical · Complete", "Hypothetical · No labs/echo", "Cohort record · in-sample", "Blank profile" (wording variants allowed if semantics are kept).
* **Anatomy/attribution:** anatomy never implies plaque position, lesion geometry, length or spatial severity; attributions explain the model, not causation. "Not provided" never implies measurement.
* **Patient vs cohort:** the UI distinguishes *This patient* (live probability, margin, attribution, stage prediction) from *Cohort* (AUC, CI, calibration, subgroups, leakage, baseline) and never merges them into one unlabelled series.

**Trust view** is read-only over `results` with no live cohort calculation:
* *Performance:* Accuracy, Precision, Recall, F1, ROC-AUC, CI, majority baseline, reliability tier.
* *Calibration:* reliability diagram, raw vs Platt, Brier, base-rate Brier, ECE.
* *Decisions:* threshold sweep, precision/recall/F1 trade-off, abstention curve, plus a current-case marker from live margin/band.
* *Subgroups:* identity, `n`, metrics and caveats.
* *Leakage Audit:* shows probe results separately from deployed results, lists excluded columns, and explains why inflated probe results are not evidence of deployed performance.
* The UI MAY derive only marker position, formatting, sorting, axis scale and highlight, never the metric.

**System view:**
* *Requirements:* declarative entries (ID, description, satisfaction contract, deep link, verification ID); every "Show me" link MUST parse into a valid state.
* *Architecture:* static architecture info plus live manifest facts; does not duplicate `ARCHITECTURE.md`.
* *Integrity:* uses the same compute client, production TypeScript engine and golden fixtures. MUST NOT use a mock engine, precomputed "PASS" strings, suppress failures or mutate case truth. Reports max probability, margin and attribution deviation, efficiency residual, fixture pass/fail, tolerances, and model/fixture IDs. A parity failure MUST be prominent while the app stays otherwise functional.
* *Model Card:* model/schema identity, dataset provenance, validation protocol, limitations, attribution caveats, licence/attribution, AI-use disclosure, artifact identity.

**Accessibility:** keyboard vessel selection; AA contrast; reduced-motion support; no colour-only state; probability announcements via `aria-live`; accessible vessel/probability labels; visible focus; accessible 2D fallback controls; accessibility state consistent with store state.

**Responsive:** ≥1280 px three-zone layout; 768–1279 px Profile drawer + Inspector bottom sheet; <768 px stage on top, Inspector bottom sheet, views in bottom bar. Layouts are projections of the same store, never a second state model.

## 10. API, Security and Budgets
### 10.1 `C-14` Reference API (optional)
Wraps the same Python implementation; the web app never calls it and its absence affects nothing. The **only** endpoint is `POST /predict` (no `/health`, `/version`, `/docs`, upload, cohort search or auth). Purpose: inspectable reference, manual cross-check, local container demo.
```json
{ "protocolVersion": "1.0.0", "case": { "values": {}, "providedFeatures": {} },
  "targetId": null, "explanation": { "requested": false, "targetId": null } }
```
Responses use the `C-08` `Evaluation`/`Explanation` shapes (no second schema). Status: `200` valid; `400` malformed structure/invalid JSON; `422` semantically invalid values/categories; `500` unexpected failure. The API MUST NOT log request bodies, persist inputs/results, forward inputs to third parties or echo case values in errors. CORS is deny-by-default; `Access-Control-Allow-Origin: *` is prohibited; hosted deployments allowlist explicit origins. No browser code path may depend on `/predict`.

### 10.2 `C-15` Security, Privacy and Requests
* **Data:** case values, evaluations and explanations are sensitive, memory only. Model, results, background rows and example cases are public static artifacts with attribution.
* **Network:** only same-origin static `GET`. Prohibited: cross-origin fetch, XHR, WebSocket, Beacon, analytics, telemetry, third-party fonts/decoders, hosted models, and any browser traffic to the optional API.
* **CSP minimum:** `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none';` The request audit stays mandatory because CSP cannot prove same-origin requests carry no case data.
* **Storage:** case values MUST NOT go to localStorage, sessionStorage, IndexedDB, cookies, Cache API, persistent files or service-worker state. Static caching of public artifacts is allowed.
* **Logging/telemetry:** never log case values, feature values, patient-derived probabilities/attributions or share payloads; diagnostics use opaque IDs. No analytics, error-reporting SaaS, session recording, beacons or remote performance logging; local diagnostics only.
* **Dependencies:** commit lockfiles; clean installs from lock state; no runtime CDNs; libraries MUST NOT activate hidden fetching.
* **Licensing:** every external asset records source, licence, attribution and modification status. BodyParts3D-derived meshes are share-alike: attribution ships with the product and code/asset licences stay distinguishable. Licence ambiguity is a human gate.

### 10.3 `C-16` Budgets
All values are **targets** until measured; reports MUST label each number `TARGET` or `MEASURED`.

| ID | Target | Measurement |
| -- | ------ | ----------- |
| `B-01` | p95 input → first display update ≤100 ms | performance marks |
| `B-02` | four-target evaluation ≤15 ms | benchmark fixtures |
| `B-03` | selected-target explanation ≤60 ms off-thread | benchmark fixtures |
| `B-04` | ≥30 fps during interaction (integrated graphics) | frame sampling |
| `B-05` | ≤150k triangles, ≤30 draw calls, 0 textures | scene statistics |
| `B-06` | critical JS + registry + model ≤1.5 MB | build report |
| `B-07` | structures ≤2.5 MB | build report |
| `B-08` | first coloured heart ≤3 s | performance marks |
| `B-09` | page ≤300 MB, worker ≤100 MB | profiler |
| `B-10` | accessibility requirements met | automated + manual |
| `B-11` | evergreen browsers, WebGL2 preferred, 2D fallback | browser matrix |
| `B-12` | clean reproduction in a reasonable laptop session | Level-1 run log |

## 11. Failure and Degradation
No degradation affecting user-visible semantics may be silent, and no fallback may change the meaning of a probability.

| Failure | Behaviour | Visibility |
| ------- | --------- | ---------- |
| Artifact hash/schema mismatch | boot block, no partial run | explicit failure screen |
| Worker startup/runtime failure | main-thread engine (same code) | compatibility notice |
| Stale revision | discard result | none (stays current) |
| Non-finite engine output | invalid evaluation, nothing committed | calculation-error state |
| Invalid category/value | keep previous valid value | field-level error |
| WebGL unavailable / context loss | Q3 2D schematic | visible notice |
| Primary mesh failure | procedural source; both fail → Q3 | visible degradation state |
| Unknown URL ID / route | valid default state | visible notice |
| Results unavailable | Explore continues; Trust offers retry | inline retry |
| In-app parity failure | show deviation, app stays functional | prominent |
| API unavailable / host outage | no app effect / use mirror or local preview | optional / operator-level |
| CI or request-audit failure | release blocked | engineering-only |

## 12. Verification and Reproducibility
Chain: schema → leakage → encoding → pipeline → compile → oracle parity → TS parity → domain → store → registry → view-model → copy → E2E → request audit → budgets → deployment smoke. Parity, leakage, request audit and artifact integrity are always blocking.

| ID | Gate | MUST verify |
| -- | ---- | ----------- |
| `VC-01` | Schema | required columns, row count, feature count, encodings, forbidden set, constant-column exclusion, modality coverage |
| `VC-02` | Leakage | fail if a forbidden column enters training features, a proxy is built from an excluded field, or forbidden columns appear in exported feature references |
| `VC-03` | Encoding | every declared categorical/ordinal level; unknown value fails |
| `VC-04` | Validation protocol | nested CV, outer scoring isolation, inner-fit preprocessing, in-fold calibration/threshold/abstention, no SMOTE |
| `VC-05` | Compile | runtime walker equals trained model, additivity, tree footprint, explicit base score, feature order |
| `VC-06` | Parity | Python fixtures vs TypeScript for probability, margin, feature/display-group/modality attribution, efficiency |
| `VC-07` | Domain | encoding, value function, missingness, decision state, reliability reference, headline coherence, percentiles, deltas, narratives, range flags |
| `VC-08` | Store | revision increments, stale rejection, single-source selection, commit semantics, no private clinical state |
| `VC-09` | Registry | exhaustive chain vessel → target → model result → structure → mesh node → card → explanation → Trust; one broken mapping is `S1` |
| `VC-10` | View-model | without WebGL: probability, decision, hatch, selected, hover, quality-tier mappings |
| `VC-11` | Copy | lint all relevant user-visible strings |
| `VC-12` | E2E | boot → default case → real inference → vessel click → explanation → edit → updated inference → Rail → Trust → System; disclaimer asserted on every route |
| `VC-13` | Request audit | record URL, method, origin, initiator, body presence/classification as `allowed / forbidden-cross-origin / forbidden-case-egress / forbidden-third-party`; fail on cross-origin, case-bearing same-origin, analytics/telemetry, or third-party font/model/decoder requests |
| `VC-14` | Budget | report JS, model, registry, structures size, triangles, draw calls vs `C-16` |
| `VC-15` | Deployment smoke | primary and mirror pass boot, integrity, real inference, vessel click, no console errors, request audit |

* **Demo integrity:** the app MUST NOT special-case the demo case ID, animate prerecorded probabilities, replace SHAP with fixtures, use static values on edit, or fake parity/leakage results. E2E loads the deterministic case, reads a live probability, edits an approved feature, waits for the new revision, and asserts the scene and Inspector consume that same live output.
* **Leakage lab quarantine:** the probe model MUST NOT be imported by the production training path, write to the deployed artifact, or be shown unlabelled; a dedicated import-boundary test blocks the build on failure.
* **Reproducibility:** every result traces to data checksum, seed set, source revision, tool versions, `modelId` and artifact version. The raw-data checksum is validated before training; a changed checksum invalidates the reproducibility claim. *Level 0* (every CI run, no retraining): hash chain, fixture integrity, leakage, schema, static checks. *Level 1* (full): raw data → preprocessing → nested CV → calibration → thresholds → results → model → fixtures, matching the committed reference within declared tolerance.
* **Data facts:** UCI Extension of Z-Alizadeh Sani, 303 rows × 59 columns, no reported missing values (runtime missingness still uses `providedFeatures`). The registry is the feature-order authority for model, Python/TypeScript encoders and fixtures.
* **Unverified status:** JavaScript parity, mesh quality/frame rate and the observed-feature-only attribution unit test are unverified until their gates pass and MUST NOT be reported as verified; earlier exploratory metrics MUST NOT override regenerated `results.json`.

## 13. Engineering Agent Contracts
* **AG-01 Inspect first.** Before editing, read this document, the relevant `ARCHITECTURE.md` section, `Tech_Stack.md`, relevant `Idea.md`/`Final_demo.md` requirements, owning tests/fixtures and the files to be modified. Do not implement from a ticket lacking interface context.
* **AG-02 Ownership.** State Phase, Owner area, Contracts consumed/produced, Allowed/Forbidden files and Verification required before editing. Do not edit another owner's files for convenience.
* **AG-03 No contract invention.** Do not invent APIs, endpoints, field semantics, alternative sources of truth, hidden persistence, hosted models, telemetry, auth, clinical claims, thresholds, validation results or benchmarks. For open details, make a reversible internal choice with no observable semantic change, or stop under `AG-10`.
* **AG-04 No weakening tests.** Do not loosen parity tolerances, remove failing fixtures, delete leakage tests, hide warnings, reduce assertion coverage, change a metric source to pass a dashboard, replace live computation with hardcoded output, or mark a failing integrity check non-blocking. Tests change only when the contract changed or the test is proven wrong.
* **AG-05 Evidence before completion.** Completion reports use this structure; "build passes" is never sufficient:
```text
PHASE / CONTRACTS IMPLEMENTED / FILES CHANGED / FILES NOT CHANGED / ARTIFACTS PRODUCED /
INTERFACES CHANGED / TESTS RUN / TESTS PASSED / TESTS FAILED / KNOWN DEVIATIONS /
OPEN BLOCKERS / HUMAN DECISIONS REQUIRED / CONTRACT VERSION
```
* **AG-06 Provenance.** Facts attributed to a source, dataset, validation run or rule identify provenance as `defined | learned | measured | assumed | unresolved`.
* **AG-07 Uncertainty.** Never turn uncertainty into certainty: not verified ≠ verified; target ≠ measured; example ≠ benchmark; proposal ≠ measured capability.
* **AG-08 Human gate** when: sources materially conflict; clinical semantics, model target, model family or missingness semantics change; patient data would leave the device; persistence, a new external service, cost or a critical-path API is introduced; a licence is ambiguous; a destructive change or public interface break is ambiguous; a hackathon rule forces architectural change; a safety rule would weaken; source material is missing; or two materially different interpretations cannot be resolved. A gate records Decision ID, issue, relevant contracts, evidence, consequences of each option, safety/privacy/cost/release impact, decision, owner and date; the agent stops after producing it.
* **AG-09 Proceed without asking** when the architecture, product spec or tech stack already decides it, the change is mechanically required by an existing contract, or the choice is internal, reversible, semantically invisible and keeps all blocking tests valid.
* **AG-10 Mandatory stop** on parity failure, leakage failure, artifact-integrity failure, critical security-audit failure, clinical-safety violation, patient data in a public request, an unsatisfiable contract, unsupported facts that would need inventing, or contradiction of a higher-authority source. Report as `BLOCKED / Contract / Problem / Evidence / Impact / Options / Required human decision`.
* **AG-11 Handoff.** Leave repository state sufficient for a downstream agent without chat history: input state, artifacts available, contracts assumed/changed, tests passed, limitations, open questions, expected downstream inputs. Record: `handoff: { phase, contractVersion, consumedContracts[], producedContracts[], artifacts[{path, identity, status}], tests{passed[], failed[]}, changes{filesChanged[], interfacesChanged[]}, knownDeviations[], blockers[], humanDecisionsRequired[] }`.
* **AG-12 Generated artifacts.** Never hand-edit `model.json`, `results.json`, fixtures, manifest, registry build copies, calibration data, validation curves or cohort metrics when a producer exists; fix the producer and regenerate.
* **AG-13 Disclosure.** The repository MUST include an AI-use disclosure (tool, assisted areas, human-reviewed areas); agents MUST NOT conceal AI-assisted work.
* **Clinical review gate.** Human clinical review is mandatory for orientation captions, new clinical terminology, label semantics, new disease-interpretation claims, any treatment/intervention language, and any attempt to turn vessel probability into spatial pathology.
* **Parallel work** is allowed only if writable areas do not overlap, shared interfaces are frozen, neither agent edits the same generated artifact, and neither changes a producer schema the other consumes without a contract revision. Serialize: worker protocol vs UI types before `C-07` freeze; Python vs TS payloads before `C-08` freeze; feature order vs form generation; target rename vs scene; URL grammar vs routing; clinical copy edits.

## 14. Phases and Ownership
Phases are interface boundaries, not schedules.

| ID | Phase | Owns / constraints | Exit |
| -- | ----- | ------------------ | ---- |
| `PH-01` | Contract freeze | contract definitions, source authority, conflict register; no schedules, no rewriting upstream docs | all `C-01`–`C-16` defined or explicitly unresolved |
| `PH-02` | Data and schema | raw-data verification, feature config, encodings, modality groups, target exclusion, dataset checksum | `VC-01`–`VC-03` |
| `PH-03` | Validation and training | nested validation, fitting, calibration, thresholds, reliability/abstention evidence, leakage lab; no out-of-fold preprocessing, leakage columns, SMOTE, or shipped out-of-fold patient predictions | valid `results` + model candidate |
| `PH-04` | Model export | runtime-form serialization, manifest, hashes, additivity/footprint/order checks, explicit base score, calibration, thresholds, reliability refs, content-hash `modelId` | `C-01`, `C-03` |
| `PH-05` | Oracle and fixtures | Python runtime-form walker and exact attribution; validate against the trained library and reference SHAP; cover masking and boundaries | `C-06` |
| `PH-06` | TS engine and worker | walker, linear eval, Platt, value function, exact SHAP, worker; no React/DOM/store access | `C-07`, `C-08`, parity |
| `PH-07` | Store and compute | ownership, intents, selectors, revisions, stale protection, URL sync, display channel; no clinical recomputation | `C-09`, revision tests |
| `PH-08` | Registry and scene | correspondence, SceneModel, StructureSource, 2D/3D, selection/hover; no model access, invented mappings or lesion inference | `C-02`, `C-11` tests |
| `PH-09` | Explore interaction | Profile, Stage, Rail, Inspector, edit choreography, accessibility; use intents, domain outputs, `ProbabilityReadout`, banner | Explore golden path |
| `PH-10` | Trust and System | measured-evidence surfaces, integrity UI, requirements map, model card; no recomputed/typed metrics, no mock engine | Trust/System verification |
| `PH-11` | Verification and security | all blocking `VC-*`, request audit, budgets, dependency audit | blocking gates pass |
| `PH-12` | Deployment | immutable static bundle, primary + mirror, smoke test; no env vars, API key or backend | smoke + request audit |
| `PH-13` | Submission readiness | reproducibility evidence, public repo, demo integrity, disclosure, deliverable linkage | `REL-SUBMISSION` |

**Repository ownership.** Runtime dependencies point downward only. A change crossing ownership areas MUST name the primary and secondary contracts, why the crossing is needed, and the covering tests; crossing a protected boundary with no contract path is a human gate. Per-area prohibitions:

| Area | MUST NOT |
| ---- | -------- |
| `config/`, `web/src/registry/` | contain learned metrics or coefficients |
| `pipeline/` | be imported by runtime web code |
| `data/` | ship an arbitrary patient corpus |
| `web/src/domain/` | import React, Three.js, Zustand or the DOM |
| `web/src/worker/` | import React, Three.js or the store |
| `web/src/store/`, `web/src/panels/` | compute clinical numbers or own clinical truth |
| `web/src/bundle/` | compute predictions |
| `web/src/components/` | call the domain engine directly |
| `web/src/scene/` | access the model artifact or domain |
| `web/src/validation/`, `web/src/system/` | compute metrics or fake integrity output |
| `web/src/design/` | store case truth |
| `web/src/app/` | hide the safety banner |
| `web/public/`, `docs/` | hand-edit generated metrics/model or hardcode differing figures |
| `tests/` | delete blocking checks for convenience |
| `api/` | become a browser dependency |
| `assets/` | ship unlicensed assets |
| `.github/` | fetch secrets into runtime |

**Required reviewers:** `C-01` architecture · `C-02` domain · `C-03` domain + verification · `C-04` trust · `C-05` product · `C-06` verification · `C-07` domain + store · `C-08` worker + verification · `C-09` app · `C-10` store · `C-11` registry · `C-12` UX/accessibility · `C-13` safety · `C-14`/`C-15` architecture + security · `C-16` scene/build. A reviewer MAY be skipped only if the contract is unchanged and the change is mechanically internal.

## 15. Release, Change and Severity
**Release states**
* **REL-DEV:** lint/type checks and schema checks pass, no known critical boundary violation, local build works.
* **REL-INT:** `C-07`/`C-08`, parity, store-revision and registry-correspondence tests pass; leakage, artifact integrity, copy lint and real inference path pass.
* **REL-DEMO:** everything in REL-INT, plus 3D vessel selection, probability context, SHAP, missingness, persistent banner, Rail (if included), Trust from `results`, System Integrity on the production engine, request audit, accessibility, performance budgets, licence/attribution, live deployment smoke, acceptable weak-hardware behaviour, offline local preview.
* **REL-SUBMISSION:** everything in REL-DEMO, plus mirror smoke, model card consistent with artifacts, AI disclosure, public-resource attribution, documentation within official limits (≤6 pages), a 3–10 minute demo video of the actual implementation, public repository with prediction pipeline/weights and explanation dashboard, and no unresolved `S0`/`S1`.

**Severity**
| Severity | Meaning | Action |
| -------- | ------- | ------ |
| `S0` | Safety, privacy or model-correctness failure (leakage column in input, patient data to a third party, parity failure shown as pass, fake metrics, causal/treatment claim, wrong vessel correspondence) | immediate block; human review |
| `S1` | Critical integration failure (`C-07`/`C-08` mismatch, stale result committed, invalid artifact accepted, broken registry chain, request-audit failure) | release blocked |
| `S2` | Recoverable degraded behaviour | proceed only within the degraded contract |
| `S3` | Local quality issue | non-blocking unless it affects a release gate |

A violation report MUST include Violation ID, Contract ID, file/module, observed vs expected behaviour, reproduction, severity, containment and required decision, and MUST NOT be buried in general test output.

**Change management.** *Non-breaking:* optional diagnostic metadata, semantics-neutral copy, non-authoritative debug fields, new internal tests. *Potentially breaking:* target rename, feature reorder, output meaning change, new required worker field, changed URL parameter, probability or safety-vocabulary change, model schema change. *Breaking:* see §4. Every breaking change records Change ID, old/new contract, reason, impact, migration, fixture impact, artifact invalidation, tests, approval and new contract version. Model/schema changes regenerate affected fixtures; expected values are never hand-edited. A dependency change needs reason, compatibility check, clean install, test suite, budget check, request audit and licence review where relevant.

**Priorities.** `P0` mandatory: real prediction, 3D vessels, input form, SHAP, measurements, safety banner, validation evidence, static deployment, artifact integrity, parity, leakage protection. `P1` important: Evidence Rail, range guard, reliability/abstention display, validation interaction, Input Audit, deep links. `P2` optional: reference API, similar-patient lookup, report/image upload, territory overlays; P2 features MUST NOT add critical dependencies, patient-data egress, persistence, hidden infrastructure, duplicate model truth or registry changes.

**Deployment.** One production build deploys to the primary static host (GitHub Pages), a mirror (Cloudflare Pages) and local preview, with relative asset paths, from the same repository state. The manifest and content-addressed artifacts form one atomic release; mixed-version loading is prohibited. No runtime env vars, API key or backend dependency. The demo MUST run with networking disabled.

**Model and AI constraints.** The risk path is XGBoost + logistic regression, margin averaging, Platt calibration and exact attribution. Tie-break priority: correctness > safety/honesty > responsiveness > resilience > visual fidelity > extensibility > peak predictive accuracy. Do not swap in a higher-performing non-additive model without a breaking architecture revision. No external generative, text or vision API enters the risk path without a human decision, contract revision, security/privacy/clinical-safety review and parity strategy. "Multimodal" means five clinical evidence groups, not image/audio AI. Pinned stack (per `Tech_Stack.md`): React 19.3, TypeScript 6.0.3, Vite 8.3, Three.js 0.186, React Three Fiber 9.8, drei 10.7, Zustand 5.0, Python 3.12, pandas 3.0, NumPy 2.5, scikit-learn 1.9, XGBoost 3.4, SHAP 0.52 (oracle only).

## 16. Open and Closed Questions
| Open | Question | Safe default | Owner |
| ---- | -------- | ------------ | ----- |
| `Q-3` | Background-set size vs explanation latency | keep the committed `C-03` set; do not shrink it for an unmeasured budget | performance owner |
| `Q-4` | Mesh compression within the structure budget without an external decoder | decoder-free or self-contained; no external decoder fetches | asset/scene owner |
| `Q-7` | Attract-mode maximum duration/frame cap | bounded, low frame rate, stops at first interaction, cannot alter truth | performance owner |
| `Q-10` | Discord-only organiser requirements | treat none as fact; implement none silently | human project owner |

**Closed:** `Q-1` reliability → `RT-1` evidence classification · `Q-2` abstention band → calibrated-margin distance · `Q-5` results → one logical `results.json`, lazy loaded · `Q-6` share encoding → versioned diff payload against a named base case · `Q-8` percentiles → 101 quantile points, 0–100 inclusive · `Q-9` cohort examples vs background → separate `cases` and `model` background.

## 17. Compatibility Law
Two independently developed CorTwin components are compatible only if they share the same contract major version, artifact schema, registry identities, feature order, target identities, missingness semantics, compute protocol, evaluation/explanation payload, state ownership, safety vocabulary and privacy guarantees, **and** all applicable blocking tests pass. Compiling, rendering, responding to a click, producing plausible numbers or passing isolated unit tests is not integration.

```text
Defined (registry/config) → Learned (model) → Validated (results + fixtures)
  → Runtime (Evaluation / Explanation) → Store truth → Scene / Inspector / Evidence / Trust
```
The system is complete only when every link in this chain is traceable, verifiable and owned. When correctness, safety and convenience conflict, correctness and safety win.

**End of contract.**