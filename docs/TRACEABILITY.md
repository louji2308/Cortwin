# CorTwin — Traceability Map

**Purpose:** prove nothing was dropped. Every official requirement line, every internal requirement
row, every contract and every verification ID maps to a source, a proof artefact/test and a status.

**Owner:** documentation session (B0-4). Read-only with respect to `Project/**`, `Progress.md` and all
code. When statuses disagree with `Progress.md`, **`Progress.md` is authoritative** — see §9.

**Status legend**

| Status | Meaning |
|---|---|
| not started | no code, artefact or test exists yet |
| in progress | work under way |
| verified | executed in this repository with evidence recorded |

**Row statuses in §B–§K were captured when this map was written (2026-10-03) and are not live —
they read `not started` from that scaffold date.** Current state lives in `Progress.md` §1 (phases),
§7 (verification board) and §8 (rubric scoreboard), which are authoritative (§9 below). The rubric
rows in §A are refreshed at each gate; latest refresh 2026-10-08.

---

## A. Official Track A rubric — `Project/Hackathon.md` §4

Weights verbatim: "Predictive Performance = 30%; 3D Visualization = 25%; Clinical Interpretability =
20%; System Integration = 15%; Technical Implementation = 10%."

| # | Criterion (weight) | Judge-facing question (source §4) | What strong evidence looks like (source §4) | Contracts | Verification | Where the proof will live | Status |
|---|---|---|---|---|---|---|---|
| A1 | Predictive Performance (30%) | "Does the model work, and is the validation credible?" | "Per-target accuracy, precision, recall, F1 and ROC-AUC; leakage-free preprocessing; reproducible cross-validation; honest reporting of variance." | C-02, C-03, C-04, C-06 | VC-02, VC-04, VC-05, VC-06 | Trust → Performance + Calibration + Leakage Audit panes; `results.json`; `make reproduce` | **verified** (2026-10-08: model trained, panes live, gates CI-green) |
| A2 | 3D Visualization (25%) | "Does the 3D layer communicate the model output clearly and interactively?" | "Correct LAD/LCX/RCA correspondence, useful interaction, clean probability encoding, responsive browser performance." | C-02, C-08, C-11, C-16 | VC-09, VC-10, VC-12, VC-14 | Explore Stage (three selectable vessels, colour = probability); registry test; budget report | **verified** (three vessels live; budgets measured in `tools/qa/perf-report.md`; B-04 demo-hardware re-measure open) |
| A3 | Clinical Interpretability (20%) | "Can a reviewer understand why this patient received this risk?" | "Global + patient-level feature attribution, directional contribution, physiological context, clear limitations." | C-06, C-08, C-13 | VC-06, VC-07, VC-11 | Inspector waterfall, measurements table, modality → feature drill-down, caveats | **verified** (exact SHAP + measurements live; copy lint green) |
| A4 | System Integration (15%) | "Is this one working system rather than separate demos?" | "Real input -> preprocessing -> model -> explanation -> synchronized 3D/dashboard update." | C-07, C-09, C-10, C-12 | VC-08, VC-12, VC-13 | One store → worker → scene on one animation clock; e2e golden path; request audit | **verified** (e2e golden path + request audit green, 32/32) |
| A5 | Technical Implementation (10%) | "Is the engineering clean, modular and reproducible?" | "Clear architecture, source code, model artifacts, dependency setup, public-resource attribution, modular extension path." | C-01, C-15, C-16, reproducibility contract (§38) | VC-01, VC-13, VC-14, VC-15, Level-0/Level-1 reproduction (§38) | CI, `make reproduce`, parity gate, README, `docs/`, model card, asset attribution | **in progress** (CI full chain green; G10 docs refresh under way; live URL pending GitHub Pages enablement) |

## B. Track A problem structure — `Project/Hackathon.md` §3

| # | Requirement (paraphrased unless quoted) | Source | Contracts | Verification | Status |
|---|---|---|---|---|---|
| B1 | Overall CAD classification plus stenosis status/probability for LAD, LCX, RCA from demographic, clinical, ECG, lab and echocardiographic features | Hackathon §3 (quoted) | C-02, C-03, C-08 | VC-05, VC-06 | not started |
| B2 | Leakage control: "Exclude LAD, LCX, RCA, and Cath from model inputs when predicting CAD or vessel-specific stenosis." | Hackathon §3 (quoted) | data contract (§39), C-02, §40.4 | VC-01, VC-02 | not started |
| B3 | Interactive 3D torso/heart; vessel nodes colour-coded from prediction probabilities; rotate, zoom, select regions | Hackathon §3 (quoted) | C-11, interaction contract (§25) | VC-09, VC-10, VC-12 | not started |
| B4 | Clinical dashboard: overall CAD status, vessel-specific probabilities, SHAP/LIME explanation, physiological-factor contribution | Hackathon §3 (quoted) | C-08, C-12, C-13 | VC-06, VC-07, VC-11 | not started |
| B5 | Safety: clear, visible decision-support/educational statement, not a substitute for formal diagnostic imaging (Hackathon §3 quoted in README §1) | Hackathon §3 | clinical-safety contract (§31) | VC-12 (disclaimer asserted on every route) | not started (wording recorded in README) |

## C. Submission package — `Project/Hackathon.md` §10

| # | Artefact | Official requirement (quoted verbatim) | Source | Proof / where handled | Status |
|---|---|---|---|---|---|
| C-a | Working software prototype | "Required by Track A brief; web application with ML backend + 3D viewer." | Hackathon §10 | app build + VC-12 | not started |
| C-b | Prediction pipeline | "Clean code + model weights for CAD and multi-vessel stenosis." | Hackathon §10 | `pipeline/`, `model.json` (C-03), `make reproduce` | not started |
| C-c | Clinical explanation dashboard | "Metrics, SHAP/LIME and physiological breakdown." | Hackathon §10 | Inspector + Trust panes (C-08, C-12) | not started |
| C-d | Documentation | "Maximum 6 pages in the Track A brief." | Hackathon §10 | six-page PDF (plan: `Implementation_Plan.md` P9, `Idea.md` §12) | planned |
| C-e | Demo video | "3-10 minutes in Track A brief; Devpost marks video as required." | Hackathon §10 | YouTube video, script in `docs/DEMO.md` | planned |
| C-f | Devpost submission | "Public GitHub link is required; live demo link is optional; no website or zip is required by current global Devpost form." and "README explains AI-assisted areas, setup, data source, model, assets and limitations." | Hackathon §10 | README + public repo + `docs/AI_USE.md` | in progress (README/AI_USE written; public repo not created) |

## D. Failure modes listed by the brief → guard tests — `Project/Hackathon.md` §7

| # | Failure mode (source §7) | Guard that must exist | Verification | Status |
|---|---|---|---|---|
| D1 | Target leakage (paraphrased from source §7): using LAD, LCX, RCA or Cath as inputs, or deriving a proxy for them from a post-work-up field | schema gate + leakage gate + input-audit evidence | VC-01, VC-02 | not started |
| D2 | Validation leakage: transformations fitted before cross-validation | validation protocol gate | VC-04 | not started |
| D3 | Single-split overclaiming | nested CV with reported fold variance; CIs in `results.json` | VC-04 | not started |
| D4 | Decorative 3D disconnected from the model | registry correspondence + e2e colour-from-live-inference | VC-09, VC-12 | not started |
| D5 | Explanation not connected to the selected output | golden fixtures + domain gate + e2e drill-down | VC-06, VC-07, VC-12 | not started |
| D6 | Anatomical overclaim beyond vessel-level labels | anatomy safety contract (§31.6), neutral anatomy (§80) | domain/UI tests, copy gate | not started |
| D7 | Hardcoded demo results | demo integrity contract (§44), "no clinical computation in UI" | VC-12, literal/import lint | not started |
| D8 | Missing safety boundary / undisclosed AI assistance | persistent banner assertion + AI disclosure review | VC-12, release checklist (`REL-SUBMISSION`) | in progress (disclosure drafted in `docs/AI_USE.md`; banner built and asserted on every route by the e2e suite) |

## E. Core technical requirements — `Project/Tech_Stack & Product Requirements.md` §3

All 24 rows, verbatim IDs. "Pri/Cx/Risk" columns preserved from source.

| ID | Requirement (verbatim) | Pri | Contracts | Verification | Status |
|---|---|---|---|---|---|
| F1 | Predict CAD, LAD, LCX, RCA from 54 features; exclude LAD, LCX, RCA, Cath | P0 | C-02, C-03, C-08 | VC-01, VC-02, VC-05, VC-06 | not started |
| F2 | 3D heart, three separately selectable vessels coloured by calibrated probability; rotate, zoom, select | P0 | C-02, C-11 | VC-09, VC-10, VC-12 | not started |
| F3 | Cards, modality and feature SHAP bars, measurements table with contribution | P0 | C-08, C-12 | VC-06, VC-07 | not started |
| F4 | Persistent safety disclaimer | P0 | clinical-safety contract (§31.1), INV-C27 | VC-12 | not started |
| F5 | Input form with preloaded patient and per-modality 'not provided' | P0 | C-09, evidence missingness (§41) | VC-07, VC-12 | not started |
| F6 | Range guard ('outside training range' chip) | P1 | range guard (§79), C-08 | VC-07 | not started |
| F7 | Evidence Ladder under the canvas | P1 | interaction contract (§25.9–25.11), C-04 §13.7 | VC-12 | not started |
| F8 | Validation page: CIs, calibration, thresholds, leakage toggle (P0 table, P1 toggle) | P0/P1 | trust view (§32), C-04 | VC-04, VC-12 | not started |
| N1 | Responsive on integrated graphics: render on demand, capped pixel ratio, quality drop | P0 | 3D render/quality (§23), C-16 | VC-14, budget/manual test | not started |
| N2 | Input edit to recolour under 100 ms (design target, not measured) | P0 | C-16 `B-01` | VC-14 (TARGET until measured) | not started |
| N3 | `make reproduce` regenerates every figure from fixed seeds into `results.json` | P0 | reproducibility (§38), C-04 | Level-1 reproduction run | not started |
| N4 | Extensibility: features, targets and vessels defined in config plus a registry | P0 | C-02 | VC-01, VC-09 | not started |
| N5 | Patient inputs never leave the browser | P0 | C-15, INV-C18, INV-C19 | VC-13 | not started |
| A1 | Nested CV, calibration, tuned thresholds, CIs, no SMOTE | P0 | validation parts of C-04 | VC-04 | not started |
| A2 | Exact SHAP in TypeScript matching Python to 1e-5 | P0 | C-06, C-07, C-08, INV-C06 | VC-06 | not started |
| A3 | Unprovided modalities marginalised, not zero-filled | P1 | C-08 §17.6, INV-C08 | VC-06, VC-07 | not started |
| I1 | Public URL on a free static host through Oct 21 | P0 | deployment (§59) | VC-15 | not started |
| I2 | CI: lint, pytest, vitest parity, build, deploy | P1 | `.github/workflows` (planned) | CI run on every push | not started |
| I3 | FastAPI reference endpoint | P2 | C-14 | API tests, route audit | not started (P2, optional) |
| H1 | 3-10 minute YouTube video | P0 | demo/submission contracts (§44, §61) | human review vs `docs/DEMO.md` checklist | planned |
| H2 | Document of at most 6 pages | P0 | submission contract (§61) | manual page count vs Hackathon §10 | planned |
| H3 | README AI-use note and Built With list | P0 | AI-assistance disclosure (§88) | manual review of README + `docs/AI_USE.md` | in progress (both files written; human section open) |
| H4 | Model weights in the repo | P0 | C-01, C-03 | release checklist (`REL-SUBMISSION`) | not started |
| D1 | Deterministic preloaded patient; demo runs from a local build with no network | P0 | C-05 (cases), C-15 | VC-12, VC-13 | not started |

## F. Contracts `C-01`…`C-16` — `Project/Contracts.md` §4 registry + section map

| ID | Contract (registry title) | Section | Primary owner (registry) | Scope in one line | Verification |
|---|---|---|---|---|---|
| C-01 | Manifest | §10 | Artifact pipeline | versioned manifest binding artefacts together; incompatible artefacts fail boot explicitly | VC-15, Level-0 hash chain (§38) |
| C-02 | Registry | §11 | Configuration / domain foundation | one authoritative identity registry: vessel id ↔ mesh node ↔ model target ↔ UI card | VC-01, VC-09 |
| C-03 | Model bundle | §12 | Model export pipeline | trees, LR, ensemble, base score, Platt/threshold/band, reliability refs, background rows, percentiles; immutable after export | VC-05 |
| C-04 | Results | §13 | Validation pipeline | metrics, calibration, decision/abstention sweeps, subgroups, evidence ladder, leakage laboratory; prohibited-data list | VC-04; numbers feed Trust (VC-12) |
| C-05 | Cases | §14 | Artifact pipeline | example cases with provenance/labelling (cohort vs hypothetical), blank case semantics | VC-07, VC-12 |
| C-06 | Golden fixtures | §15 | Oracle / verification pipeline | Python-generated fixtures covering probability, margin, attributions, modality sums, efficiency, missingness | VC-06 |
| C-07 | Compute protocol | §16 | Compute client + engine | typed request/response, protocolVersion, requestId, revision, lanes, error codes, supersession/timeout rules | VC-06, VC-08 |
| C-08 | Evaluation and Explanation payloads | §17 | Domain engine | target evaluation, decision state, reliability tier, coherence rule, missing-evidence value function, explanation schema and caveats | VC-06, VC-07 |
| C-09 | Store | §19 | Store | single state shape, canonical intents, derived selectors, revision + commit semantics; no private clinical state | VC-08 |
| C-10 | URL grammar | §21 | App / router / store | fragment routes, canonical query order, invalid-route handling, share-URL limits; no edited patient values in ordinary URLs | VC-12 (deep-link + navigation checks) |
| C-11 | SceneModel and StructureSource | §22 | Scene | scene inputs, structure sources, visual semantics, decision encoding, picking, camera, 2D fallback | VC-09, VC-10 |
| C-12 | Shared component props | §24 | Component layer | `ProbabilityReadout` is the only probability renderer; prohibited component behaviour | component lint, VC-10 |
| C-13 | Narrative templates and vocabulary | §27 | Domain/copy | template + approved vocabulary narrative; prohibited phrases; copy lint is blocking | VC-11 |
| C-14 | Reference API endpoints | §28 | Optional API | single `POST /predict`, never on the critical path, no invented endpoints | route audit, API tests |
| C-15 | CSP and request allowlist | §29 | Security/build | data classes, network rules, CSP minimum, storage/log/URL rules, dependency + licensing policy | VC-13 |
| C-16 | Quality tiers and budget measurement | §30 | Scene/CI | budget table `B-01`…`B-12`, all values labelled TARGET or MEASURED | VC-14 |

**Full text of C-13 (copy law) was read in full this session; its approved vocabulary and prohibited
phrase list govern every string written in `README.md` and `docs/**`.**

## G. Verification contracts `VC-01`…`VC-15` — `Project/Contracts.md` §37

Chain order: schema → leakage → encoding → pipeline → compile → oracle parity → TypeScript parity →
domain → store → registry → view-model → copy → E2E → request audit → budgets → deployment smoke.

| ID | Verification (source §37) | Must prove | Primary artefact/test | Status | Last run |
|---|---|---|---|---|---|
| VC-01 | Schema gate | required columns, row count, feature count, encodings, forbidden set, constant-column exclusion, modality coverage | `tests/test_schema.py` (planned) | not started | — |
| VC-02 | Leakage gate | fails if a forbidden column enters training features, a target proxy is created, or forbidden columns appear in exported model references | `tests/test_leakage.py` (planned) | not started | — |
| VC-03 | Encoding gate | every declared categorical/ordinal level; unknown value → blocking failure | `tests/test_encode.py` (planned) | not started | — |
| VC-04 | Validation protocol gate | nested CV, outer scoring isolation, inner-fit preprocessing, calibration/threshold/abstention inside fold, no SMOTE | pipeline tests (planned) | not started | — |
| VC-05 | Compile gate | runtime tree walker equals trained model, additivity, tree footprint, explicit base score, feature order | compile tests (planned) | not started | — |
| VC-06 | Parity gate | Python fixtures vs TypeScript for probability, margin, feature/display-group/modality attribution, efficiency; tolerance 1e-5 (efficiency 1e-6) | vitest parity suite (planned) | not started | — |
| VC-07 | Domain gate | encoding, value function, missingness, decision state, reliability, headline coherence, percentiles, deltas, narratives, range flags | vitest domain suite (planned) | not started | — |
| VC-08 | Store gate | revision increments, stale-result rejection, single-source selection, commit semantics, no private clinical state | vitest store suite (planned) | not started | — |
| VC-09 | Registry gate | vessel → target → model result → structure → mesh node → card → explanation → Trust correspondence | `tests/test_registry.py` + vitest (planned) | not started | — |
| VC-10 | View-model gate | probability/decision/hatch/selected/hover/quality-tier mapping without WebGL | vitest view-model suite (planned) | not started | — |
| VC-11 | Copy gate | lints all user-visible strings against the C-13 prohibited list | copy lint test (planned) | not started | — |
| VC-12 | E2E gate | boot → default case → real inference → vessel click → explanation → edit → updated inference → Evidence Rail → Trust → System; disclaimer asserted on every route; no console errors | Playwright e2e (planned) | not started | — |
| VC-13 | Request audit | fails on cross-origin requests, same-origin requests carrying case values, analytics/telemetry, third-party font/model fetches | e2e request audit (planned) | not started | — |
| VC-14 | Budget gate | reports JS size, model size, registry size, structures size, triangle count, draw calls against `C-16` targets | build report (planned) | not started | — |
| VC-15 | Deployment smoke | primary and mirror URLs pass boot, integrity, real inference, vessel click, no console errors, request audit | post-deploy smoke (planned) | not started | — |

## H. Official submission constraints (quoted with source)

| Constraint | Verbatim quote | Source |
|---|---|---|
| Page limit | "Maximum 6 pages in the Track A brief." | `Project/Hackathon.md` §10, Documentation row |
| Video duration | "3-10 minutes in Track A brief; Devpost marks video as required." | `Project/Hackathon.md` §10, Demo video row |
| Public repo | "Public GitHub link is required; live demo link is optional; no website or zip is required by current global Devpost form." | `Project/Hackathon.md` §10, Devpost submission row |
| README duty | "README explains AI-assisted areas, setup, data source, model, assets and limitations." | `Project/Hackathon.md` §10, Devpost submission row |
| AI disclosure | "Disclose all AI coding assistants used. The official rules allow tools such as Cursor, Claude Code, Copilot, ChatGPT, v0 and similar tools, but require disclosure in Built With and in the README, including which parts were AI-assisted." | `Project/Hackathon.md` §5.E |
| AI disclosure (engineering consequence) | "AI tools \| Allowed without restriction. List them in Built With and note in the README which parts were AI-assisted. Undisclosed use is treated as misrepresentation. You must be able to explain your code" | `Project/Tech_Stack & Product Requirements.md` §2 |
| Deadline | "Devpost submission deadline \| 15 Oct 2026 at 12:15 AM IST (14 Oct 2026, 18:45 UTC)." | `Project/Hackathon.md` §1 |
| Development window | "Development window \| 30 Sep 2026 to 14 Oct 2026 EOD." | `Project/Hackathon.md` §1 |
| Live link longevity | judging "15-20 Oct 2026; winner announcement on 21 Oct 2026." → "The live link must survive until Oct 21, so no trial-period services" | `Project/Hackathon.md` §1; `Project/Tech_Stack & Product Requirements.md` §2 |
| Full submission checklist | eight bullets: Devpost Track A submission (evening Oct 14 IST); public repo with pipeline, model weights (`model.json`), tests and README; live URL through Oct 21; YouTube video 3-10 minutes; document of at most 6 pages; AI tools in Built With + README AI-assisted areas; visible safety disclaimer in the UI; check Discord | `Project/Tech_Stack & Product Requirements.md` §22 |

## I. Internal requirement rows cross-checked from `Project/Idea.md` §10 and §54

| Requirement family | Source | Contract | Verification | Status |
|---|---|---|---|---|
| CAD + LAD/LCX/RCA prediction | Idea §10; Contracts §54 | C-02, C-03, C-08 | VC-02, VC-05, VC-06 | not started |
| Leakage exclusion | Idea §10; Contracts §54 | C-02, data contract | VC-02 | not started |
| Accuracy/Precision/Recall/F1/AUC | Idea §10; Contracts §54 | C-04 | VC-12 (Trust evidence) | not started |
| 3D vessel mapping | Idea §10; Contracts §54 | C-02, C-11 | VC-09, VC-10, VC-12 | not started |
| Rotate/zoom/select | Idea §10; Contracts §54 | C-11, interaction contract | VC-12 | not started |
| Dynamic prediction colours | Idea §10; Contracts §54 | C-08, C-11 | VC-12 + parity | not started |
| SHAP/explanation | Idea §10; Contracts §54 | C-06, C-08, C-13 | parity + domain + VC-12 | not started |
| Physiological/measurement contribution | Idea §10; Contracts §54 | C-08 | domain/UI tests | not started |
| Safety statement | Idea §10; Contracts §54 | clinical-safety contract | VC-12 | not started |
| Responsive browser operation | Idea §10; Contracts §54 | C-16 | VC-14 / manual test | not started |
| Reproducible pipeline | Idea §10; Contracts §54 | reproducibility contract (§38) | Level-1 reproduction | not started |
| Technical implementation visibility | Contracts §54 | System view contract (§33) | VC-12 | not started |
| AI-use disclosure | Contracts §54 | AI-assistance disclosure (§88) | manual review | in progress |
| Public repo/model artefacts | Contracts §54 | C-01, C-03, C-04 | release checklist | not started |
| Demo video / ≤6-page document | Contracts §54 | demo + submission contracts | human gate | planned |

Note (Contracts §54): "Strategic differentiators such as calibration, reliability tiers, evidence
progression and model-audit views MUST NOT be represented as official bonus-point requirements."
No bonus points are claimed anywhere in this documentation.

## J. Reconciliation with `Progress.md`

| Check | `Progress.md` | This document | Agreement |
|---|---|---|---|
| Rubric scoreboard §8 — five criteria | all `not started` | four `not started`, Technical Implementation `in progress` (documentation scaffold) | yes — `Progress.md` tracks judge-visible evidence; the scaffold is not evidence. If any doubt arises, `Progress.md` wins. |
| Verification board §7 — VC-01…VC-15 | all `not started`, no commands run | all `not started`, no commands run | yes |
| Live URL | none | none | yes |
| Model trained / metrics | none exist | none exist; no accuracy, AUC, frame-rate or latency figure is stated anywhere in `README.md` or `docs/**` | yes |
| Deadlines | next dated deadline 2026-10-04 (dataset + mesh gate) | same | yes |

## K. Row count

| Section | Rows |
|---|---|
| A rubric criteria | 5 |
| B problem structure | 5 |
| C submission package | 6 |
| D destructors → guards | 8 |
| E Tech_Stack §3 requirements | 24 |
| F contracts C-01…C-16 | 16 |
| G verifications VC-01…VC-15 | 15 |
| H official constraints | 10 |
| I internal/Idea/§54 cross-check | 15 |
| **Total** | **104** |

| M1 | docs/MODEL_CARD.md | Model card with measured metrics from web/public/results.json (CAD/LAD/LCX/RCA rocAuc/acc/f1/prec/rec/foldAuc*/rocAucCI), provenance, limitations, safety | done | |
