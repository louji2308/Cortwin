# CorTwin

**A browser-based clinical probability instrument for pre-imaging cardiovascular assessment - Track A (official title: "Cardiovascular Risk Visualization & Prediction") of the Multimodal AI Hackathon 2026.**

You enter a patient's clinical profile across five evidence groups - history, examination and symptoms, ECG, labs, echo - as the 54 model features. CorTwin returns the overall CAD probability plus the whole-vessel probability of ≥50% stenosis under the cohort label for the LAD, LCX and RCA, colours the three vessels on an interactive 3D heart, and shows the exact SHAP attribution behind every number. It is leakage-safe by construction, fully explained, and runs entirely in the browser so patient inputs never leave the device.

The cohort is the 303-patient UCI Extension of Z-Alizadeh Sani dataset; every output means "among patients resembling the training cohort", and there is no external validation.

---

## Safety (read this first)

**App banner, verbatim (`Project/Final_demo.md` section 3 - the wording the banner shows on every screen):**

> Educational decision-support prototype. Not a substitute for diagnostic imaging.

**Official safety requirement, verbatim (`Project/Hackathon.md` section 3, Safety row):**

> Clear, visible statement that predictions are decision-support/educational and not a substitute for formal diagnostic imaging.

In the running application that banner is persistent, non-dismissible and present on every route (`Project/Contracts.md` section 9 Disclaimer and invariant INV-C27; `Project/Architecture.md` invariant INV-12); the e2e suite asserts it on every route.

---

## Links

- **Live demo:** https://louji2308.github.io/Cortwin/ - live (HTTP 200, verified 2026-10-13) but currently serving the 2026-10-08 build; the deploy workflow (`.github/workflows/deploy.yml`) is `workflow_dispatch`-only, so it must be re-triggered after each push to publish the current build.
- **Repository:** https://github.com/louji2308/Cortwin
- **Demo video (3-10 min):** <!-- HUMAN: YouTube link after recording -->
- **Six-page document:** [`docs/project_document_6page.pdf`](docs/project_document_6page.pdf)

---

## Status - last updated 2026-10-13

Honest current state of the repository. Nothing below is aspirational; every row has evidence.

| Item | State today |
|---|---|
| Phase | P9 (documentation, six-page document, video); gates G0-G8 PASS; feature freeze held 2026-10-12 (`Progress.md` section 1) |
| Application / UI | built - Explore / Trust / System panes, Web Worker inference, 3D stage, Evidence Rail; production build verified |
| Model | trained and exported; `web/public/results.json` regenerated 2026-10-12 (decision D-40) with confusion counts, component AUCs and global importance added; modelId `sha256:71406e355e66d6cd4b7a96848271deb5cc189000a121b9147770975657e2ddba` unchanged |
| Dataset | fetched and checksummed (`data/raw/`, `data/CHECKSUMS.txt`, `data/PROVENANCE.md` - CC BY 4.0) |
| 3D assets | mesh gate decided: `web/public/models/heart.glb` (BodyParts3D derivative, CONDITIONAL PASS - `assets/REPORT_mesh_gate.md`) plus procedural fallback `assets/fallback/heart_tubes.glb`; attribution in `assets/ATTRIBUTION.md` |
| Tests | local full verification 2026-10-13: pytest **205**, vitest **1263 passed (83 files)**, Playwright e2e **41/41**, `tsc` exit 0, dist verification **ALL CHECKS PASS** |
| Live URL | https://louji2308.github.io/Cortwin/ live (HTTP 200, verified 2026-10-13), currently serving the 2026-10-08 build - re-trigger `deploy.yml` after each push |
| Git / CI | full history on `github.com/louji2308/Cortwin`; CI runs the full chain on every push; most recent local full verification (2026-10-13) is green across pytest 205 / vitest 1263 / Playwright 41/41 / `tsc` / dist verify |
| Documentation | `README.md` + `docs/` (TRACEABILITY, AI_USE, DEMO, STATUS, MODEL_CARD) + six-page submission document (`docs/project_document_6page.md` / `.pdf`) |
| Licence | MIT for this repository's source code (`LICENSE` at root, decision D-48, 2026-10-13) |

---

## Why CorTwin

- **Leakage-safe by construction.** `LAD`, `LCX`, `RCA` and `Cath` are forbidden as model inputs; a schema gate and a leakage gate assert they are absent from the feature vector, and the quarantined probe lab (`pipeline/leakage_lab.py`) keeps inflated probe results out of the reported numbers.
- **Calibrated probabilities with honest reliability tiers.** Platt-scaled probabilities with Brier and ECE reported per target, and the tier rule stated openly rather than quietly: CAD **strong**, LAD **moderate**, LCX and RCA **limited**.
- **Exact Shapley attributions.** The Python oracle and the TypeScript engine agree at parity tolerance 1e-5, with the attribution efficiency invariant checked at 1e-6 against the golden fixtures.
- **One coherent loop.** Profile edit -> Web Worker -> probability -> 3D vessel colour, probability readout and attribution waterfall, all driven from one store and synchronised on one animation clock.
- **Privacy by architecture.** No backend, no database, no accounts, no telemetry, no third-party requests - inference and explanation run in the browser and inputs never leave the device.

---

## How it works

```text
config-driven 54-feature profile → strict encoder → TypeScript tree walker + logistic head + Platt scaling + exact SHAP in a Web Worker → one store → probability-to-cividis colour on LAD/LCX/RCA, ProbabilityReadout and attribution waterfall
```

The 54 features, the four targets and the vessel registry all come from committed JSON config, so adding a feature or a vessel is a config change. The strict encoder rejects unknown categories with a typed error; the Web Worker evaluates the shipped `model.json` with float32-faithful tree traversal, a logistic head and Platt scaling, then computes exact Shapley attributions for the selected target. One store holds the evaluation, and every visible consequence - colour, number, bar, waterfall - animates from that single truth on one clock. If the worker fails, the same engine runs on the main thread with a visible notice, and a quality governor (Q0-Q3) downgrades render quality under load.

---

## Model at a glance

| Target | Accuracy | ROC-AUC [95% CI] | F1 | Precision | Recall | Majority baseline | Reliability tier |
|---|---|---|---|---|---|---|---|
| CAD | 0.8878 | 0.9362 [0.9047, 0.9629] | 0.9231 | 0.9027 | 0.9444 | 0.7129 | strong |
| LAD | 0.8020 | 0.8472 [0.8025, 0.8902] | 0.8446 | 0.7799 | 0.9209 | 0.5842 | moderate |
| LCX | 0.6733 | 0.7118 [0.6531, 0.7690] | 0.6426 | 0.5633 | 0.7479 | 0.6073 | limited |
| RCA | 0.6337 | 0.7541 [0.6970, 0.8074] | 0.6476 | 0.5075 | 0.8947 | 0.6238 | limited |

Source: `web/public/results.json` (sha256 `801e9e1edb6668527ea288ad67bc512cdeed37de147fa77b7231005bd471a11f`), read directly from the artifact. Protocol: nested CV 5x3 outer / 4 inner, seed 411, everything fitted inside the folds, no SMOTE; CIs are 95% percentile bootstrap over patients (10,000 resamples).

LCX and RCA carry the **limited** reliability tier - the instrument says so rather than hiding it. On LCX the xgb-only component (0.7464) outperforms the deployed ensemble (0.7118); that is reported as an ablation, not tuned away.

---

## Quick start

From `Project/Tech_Stack & Product Requirements.md` section 18. **Verified** means run in this repository on the stated date, with the result recorded here or in `Progress.md` section 7.

| Command | Purpose (source: Tech_Stack section 18) | State |
|---|---|---|
| `make data` (Windows: `./make.ps1 data`) | fetches and checksums the CSV | **verified (P0)** - dataset in `data/raw/` with `data/CHECKSUMS.txt` and `data/PROVENANCE.md`; `make` is unavailable on this Windows host, so `make.ps1` mirrors the `Makefile` (decision D-03) |
| `make reproduce` | re-runs nested CV and regenerates `results.json`, `model.json` and fixtures | **pipeline executed 2026-10-04; artifacts regenerated 2026-10-12 (D-40)** - content-hashed artifacts committed; their integrity is re-verified on every CI run (artifact immutability guard) |
| `make test` | runs pytest and vitest parity | **verified 2026-10-13** - pytest 205 passed (`.venv`, Python 3.12.9); vitest 1263 passed (83 files) |
| `cd web; npm ci; npm run dev` | starts the app | **verified** - development app used throughout development |
| `npm run build` | production build (tsc + vite, relative base) | **verified 2026-10-13** - exit 0 |
| `npm run verify:dist` | artifact integrity (inline manifest deep-equal + CSP byte-exact) | **verified 2026-10-13** - ALL CHECKS PASS, modelId matches |
| `npm run test:e2e` | Playwright suite: golden path, navigation/deep links, controls (reset, build-up, hover, evidence), offline, request/storage audit, CSP, a11y, degraded, perf, deploy-smoke | **verified 2026-10-13** - 41 passed |
| CI (`.github/workflows/ci.yml`) | full verification chain VC-01...VC-15 on every push | runs on every push; most recent local full verification (2026-10-13) green across pytest 205 / vitest 1263 / Playwright 41/41 / `tsc` 0 / dist verify |

---

## What's inside

As it exists today (`Project/Tech_Stack & Product Requirements.md` section 17):

```text
README.md            this file
LICENSE              MIT licence for this repository's source code (decision D-48)
Progress.md          internal coordination surface (not a deliverable)
Project/             read-only source documents (requirements, contracts, plan)
Makefile, make.ps1   data/test/reproduce targets (make.ps1 mirrors Makefile on Windows)
.github/workflows/   CI (full VC chain) + deploy.yml (GitHub Pages)
config/              features.json, targets.json, registry.json, forbidden.json
data/                raw CSV, CHECKSUMS.txt, PROVENANCE.md
pipeline/            prepare/train/validate/export + oracle/SHAP + artifacts/
web/                 React app (src, e2e, public artifacts, worker, scene, store)
api/                 planned - optional FastAPI /predict reference endpoint (P2, not built)
tests/               pytest suite (205 tests) + golden fixtures
assets/              ATTRIBUTION.md, REPORT_mesh_gate.md, fallback/heart_tubes.glb
tools/               mesh preparation, QA scripts (perf report, release checklist)
docs/                TRACEABILITY.md, AI_USE.md, DEMO.md, STATUS.md, MODEL_CARD.md,
                     project_document_6page.md / project_document_6page.pdf
```

---

## Verification and reproducibility

- Local full verification **2026-10-13**: pytest **205**, vitest **1263** (83 files), Playwright e2e **41/41**, `npx tsc --noEmit` exit **0**, `npm run verify:dist` **ALL CHECKS PASS**.
- Python/TypeScript parity tolerance **1e-5**, attribution efficiency residual **1e-6**, **40 of 40** golden fixtures pass (`web/public/fixtures/golden.json`).
- `make reproduce` regenerates every artifact - `results.json`, `model.json`, fixtures - from fixed seeds (base seed 411), with everything fitted inside the folds.
- Content hashes: modelId `71406e355e66d6cd4b7a96848271deb5cc189000a121b9147770975657e2ddba`; `results.json` sha256 `801e9e1edb6668527ea288ad67bc512cdeed37de147fa77b7231005bd471a11f`; dataset CSV sha256 `b60472ecebdd4ea11d09b8a793711b8da2051fdf79eeae5b88f33269e4a02d37`.
- CI (`.github/workflows/ci.yml`) runs the full VC-01...VC-15 verification chain on every push.

---

## Performance (measured)

All figures measured on the production build under Chromium with hardware GL (`tools/qa/perf-report.md` sections 1-2; runs 2026-10-06 and 2026-10-07 on an AMD Radeon iGPU). None of these is a design target typed into this file.

- input to first visual change: p95 **4.3 ms**
- input to readout update: p95 **28.4 ms**
- input to stage colour change: p95 **85.7 ms**
- worker evaluate: p95 **0.3 ms**
- worker explain: p95 **3.2 ms**
- idle rendering: **0 frames / 1000 ms** (render on demand)
- scene budget: **5 draw calls, 77,824 triangles, 0 mesh textures**
- critical path (JS + model + registry): **2,021,728 B (2.02 MB)**
- structure: **1,409,060 B (1.41 MB)**
- first coloured heart: **2,657.9 ms** cold under 4x CPU throttle
- page JS heap peak: **18.1 MB**

Frame pacing: measured p50 frame pacing 16.7 ms (≈60 fps) during continuous orbit rotation under 4x CPU throttle on AMD Radeon iGPU; protocol window-mean 13.9-14.8 fps with scripted 100 ms input pauses; sustained ≥30 fps must still be re-verified on demo hardware.

A later re-measurement (2026-10-12, `tools/qa/perf-report.md` section 7) is recorded there with its own raw evidence; the rows above are the section 1-2 certified numbers.

---

## AI use

AI assistance was used across this project: autonomous coding and documentation agents, plus AI-assisted research and drafting of the project documents. The hackathon rules permit AI tools but require disclosure in Built With and in the README, including which parts were AI-assisted, and undisclosed use is treated as misrepresentation. The full disclosure, including the checklist the human owner must complete before submission, lives in [`docs/AI_USE.md`](docs/AI_USE.md). Every claim in this README, the six-page document and the demo video remains human-owned.

---

## Built With

Pinned stack (`Project/Tech_Stack & Product Requirements.md` section 27), installed and exercised from the committed lockfile; versions match `web/package.json` / `requirements.lock.txt`:

- **Pipeline:** Python 3.12, pandas 3.0, numpy 2.5, scikit-learn 1.9, xgboost 3.4 (`enable_categorical=False`), shap 0.52 (parity oracle only), pytest 9.1
- **Frontend:** React 19.3, TypeScript 6.0.3, Vite 8.3, plain CSS
- **3D:** three 0.186, @react-three/fiber 9.8, @react-three/drei 10.7
- **State / charts:** zustand 5.0, d3-scale + d3-scale-chromatic 3.1 (cividis), hand-built SVG
- **Inference:** TypeScript Web Worker (own tree walker, logistic regression, Platt scaling, exact SHAP)
- **Meshes:** BodyParts3D -> Blender -> @gltf-transform/cli 4.5 (fallback: procedural tubes)
- **Hosting / CI:** GitHub Pages via GitHub Actions (primary), Cloudflare Pages (mirror)
- **Backend, database, auth, storage, monitoring, hosted AI API:** none

The final Built With list (including every AI tool) goes on the Devpost submission and must match `docs/AI_USE.md`.

---

## Licence and attribution

| Resource | Licence (per source documents) | State |
|---|---|---|
| This repository's source code | **MIT** (`LICENSE` at root; decision D-48, 2026-10-13; `Copyright (c) 2026 Loujan B`) | covers source code only - the dataset and the mesh keep their own terms below |
| UCI Extension of Z-Alizadeh Sani dataset | CC BY 4.0 (`Project/Hackathon.md` section 14, source [4]) | fetched to `data/raw/`; attribution and provenance recorded in `data/PROVENANCE.md` |
| BodyParts3D anatomy meshes | CC BY-SA 2.1 Japan - share-alike, attribution required (`Project/Tech_Stack & Product Requirements.md` section 14, section 25) | prepared mesh in use (`web/public/models/heart.glb`); both credit strings recorded verbatim in `assets/ATTRIBUTION.md`; final human ruling 2026-10-13 (D-50: stricter statement + both credits kept) |

Verbatim asset credits (both shown per final licence ruling D-50 - `assets/ATTRIBUTION.md` section 2):

> BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International
>
> BodyParts3D, Copyrightc 2008 ライフサイエンス統合データベースセンター licensed by CC表示－継承2.1 日本

No citation, URL or licence beyond the above is asserted anywhere in this documentation; URLs used here appear in `Project/Hackathon.md` section 14 or `Project/Tech_Stack & Product Requirements.md`.

---

## Documentation

| File | Purpose |
|---|---|
| [`docs/project_document_6page.md`](docs/project_document_6page.md) / [`.pdf`](docs/project_document_6page.pdf) | the six-page submission document (canonical markdown + generated PDF) |
| [`docs/TRACEABILITY.md`](docs/TRACEABILITY.md) | requirement -> source -> contract -> verification -> proof map (rubric, Tech_Stack requirements, C-01...C-16, VC-01...VC-15) |
| [`docs/AI_USE.md`](docs/AI_USE.md) | AI-assistance disclosure; human-completion checklist |
| [`docs/DEMO.md`](docs/DEMO.md) | demo script, video plan, shot-list verification against e2e evidence, submission requirements |
| [`docs/STATUS.md`](docs/STATUS.md) | public-safe engineering status |
| [`docs/MODEL_CARD.md`](docs/MODEL_CARD.md) | model card: measured metrics from `results.json`, reproducibility, explainability, limitations, safety |

---

## Safety, scope and limitations

- **Intended use:** educational and decision-support prototype showing how a pre-imaging clinical profile relates to vessel-level probability in a cohort like the training data (`Project/Idea.md` section 2).
- **Not intended as:** a diagnostic tool; a locator of physical disease position in the anatomy; a general-population screener; treatment guidance (`Project/Idea.md` section 2).
- **Colour meaning:** a vessel colour represents whole-vessel probability only (`Project/Contracts.md` invariant INV-C16).
- **Attribution meaning:** model attribution explains the model's prediction; it does not establish causation, and correlated features share credit (`Project/Contracts.md` section 9 Anatomy/attribution; `Project/Idea.md` section 5).
- **No external validation:** probabilities are cohort-specific (`Project/Contracts.md` section 9 Probability framing; `Project/Idea.md` section 4).
- **Privacy:** no patient input leaves the browser; no telemetry, no storage, no accounts (`Project/Tech_Stack & Product Requirements.md` section 15). Enforced and demonstrated: the e2e request audit, storage audit, CSP byte-exact check and offline suite run on every CI run.

This is an educational prototype, not a medical device, and it makes no claim about any individual.

---

## Rubric coverage

Official weights, verbatim from `Project/Hackathon.md` section 4: "Predictive Performance = 30%; 3D Visualization = 25%; Clinical Interpretability = 20%; System Integration = 15%; Technical Implementation = 10%."

| Criterion | Weight | Where the evidence lives | Status (2026-10-13) |
|---|---|---|---|
| Predictive Performance | 30% | Trust -> Performance pane (accuracy, precision, recall, F1, ROC-AUC with CIs rendered from `results.json`), Calibration pane, Leakage Audit pane; reproduced by the pipeline; gated by VC-02, VC-04, VC-05, VC-06 | **implemented** - model trained with nested CV, metrics in `results.json`, panes live, gates green in the local full verification |
| 3D Visualization | 25% | Explore Stage (three vessels, colour = probability, rotate/zoom/select); `web/public/models/heart.glb`; `registry.json`; gated VC-09/VC-10/VC-12/VC-14 | **implemented** - three selectable vessels, budgets measured (`tools/qa/perf-report.md`); B-04 window-mean re-measure on demo hardware still open |
| Clinical Interpretability | 20% | Inspector waterfall, measurements table (value, percentile, contribution, direction), modality -> feature drill-down, colour-meaning explainer; gated by golden fixtures (C-06) and VC-06, VC-07, VC-11 | **implemented** - exact SHAP + measurements live; copy lint (C-13) green |
| System Integration | 15% | One store -> worker -> 3D/dashboard synchronised on one animation clock; e2e golden path; request audit; gated VC-08, VC-12, VC-13 | **implemented** - e2e golden path + request audit green (41/41) |
| Technical Implementation | 10% | CI, `make reproduce`, parity gate VC-06, budget gate VC-14, deployment smoke VC-15, this README, `docs/`, model card, six-page document | **implemented** - verification chain green in the local full run (2026-10-13), parity/integrity gates green, documentation present; the live site is published by re-triggering `deploy.yml` after each push |

The full requirement -> source -> contract -> verification -> proof map is `docs/TRACEABILITY.md`. Its statuses are reconciled against the rubric scoreboard and verification board in `Progress.md` sections 7-8.

---

## Deadlines (official, `Project/Hackathon.md` section 1)

- Development window: "30 Sep 2026 to 14 Oct 2026 EOD."
- Devpost submission deadline: "15 Oct 2026 at 12:15 AM IST (14 Oct 2026, 18:45 UTC)."
- Operational target: submit the evening of 14 Oct 2026 IST (internal plan, `Project/Idea.md` section 12).
- The live link must still work on 21 Oct 2026 (judging/showcase dates, `Project/Tech_Stack & Product Requirements.md` section 2) - no trial-period hosting.
