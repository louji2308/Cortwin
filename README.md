# CorTwin

**Multimodal AI Hackathon 2026 — Track A (official title: "Cardiovascular Risk Visualization & Prediction")**

CorTwin is a browser-based decision-support and educational prototype for Track A of the hackathon. A user enters a patient's clinical profile in five evidence groups (history, exam and symptoms, ECG, labs, echo — 54 model features); the app estimates overall CAD probability and whole-vessel probability of ≥50% stenosis under the cohort label for LAD, LCX and RCA, colours three coronary vessels on an interactive 3D heart, and shows the model attribution behind every number. Inference, explanation and rendering are designed to run entirely in the browser, so patient inputs never leave the device. The cohort is the 303-patient UCI Extension of Z-Alizadeh Sani dataset (`Project/Hackathon.md` §9), used with no external validation — every output means "among patients resembling the training cohort". **This is not a substitute for formal diagnostic imaging and makes no claim about any individual.**

**Required safety disclaimer, verbatim (`Project/Final_demo.md` §3, the wording the app banner must show):**

> Educational decision-support prototype. Not a substitute for diagnostic imaging.

**Official safety requirement, verbatim (`Project/Hackathon.md` §3, Safety row):**

> Clear, visible statement that predictions are decision-support/educational and not a substitute for formal diagnostic imaging.

In the running application that banner is persistent, non-dismissible and present on every route (`Project/Contracts.md` §31.1 and invariant INV-12); the e2e suite asserts it on every route.

---

## Status — last updated 2026-10-08

Honest current state of the repository. Nothing below is aspirational; every row has evidence.

| Item | State today |
|---|---|
| Phase | P0–P8 complete, gates **G0–G8 PASS**; P1 polish batch complete; P9 (docs, video, submission) in flight (`Progress.md` §1) |
| Application / UI | built — Explore / Trust / System panes, Web Worker inference, 3D stage, Evidence Rail; production build verified |
| Model | trained and exported: nested CV (5×3 outer / 4 inner), calibration, thresholds; `web/public/results.json`, `web/public/model.json`, `pipeline/artifacts/deployed_model.joblib`; modelId `sha256:71406e355e66d6cd4b7a96848271deb5cc189000a121b9147770975657e2ddba` |
| Dataset | fetched and checksummed (`data/raw/`, `data/CHECKSUMS.txt`, `data/PROVENANCE.md` — CC BY 4.0) |
| 3D assets | mesh gate decided: `web/public/models/heart.glb` (BodyParts3D derivative, CONDITIONAL PASS — `assets/REPORT_mesh_gate.md`) plus procedural fallback `assets/fallback/heart_tubes.glb`; attribution in `assets/ATTRIBUTION.md` |
| Tests | green on 2026-10-08: pytest **203 passed** · vitest **1177 passed (81 files)** · Playwright e2e **32/32** · `tsc` exit 0 · dist verification ALL CHECKS PASS; CI runs the full chain on every push |
| Live URL | none yet — the deploy workflow is ready and CI-green, **blocked on enabling GitHub Pages (Settings → Pages → Source: "GitHub Actions")** |
| Git | full history pushed to `github.com/louji2308/Cortwin`; CI green (verified run `37698481044`) |
| Documentation | `README.md` + `docs/` (TRACEABILITY, AI_USE, DEMO, STATUS, MODEL_CARD); G10 refresh in progress |

---

## Command surface

From `Project/Tech_Stack & Product Requirements.md` §18. **Verified** means run in this repository on the stated date, with the result recorded here or in `Progress.md` §7; everything else is marked planned.

| Command | Purpose (source: Tech_Stack §18) | State |
|---|---|---|
| `make data` (Windows: `./make.ps1 data`) | fetches and checksums the CSV | **verified (P0)** — dataset in `data/raw/` with `data/CHECKSUMS.txt` and `data/PROVENANCE.md`; `make` is unavailable on this Windows host, so `make.ps1` mirrors the `Makefile` (decision D-03) |
| `make reproduce` | re-runs nested CV and regenerates `results.json`, `model.json` and fixtures | **pipeline executed 2026-10-04** — content-hashed artifacts committed; their integrity is re-verified on every CI run (artifact immutability guard) |
| `make test` | runs pytest and vitest parity | **verified 2026-10-08** — pytest 203 passed; vitest 1177 passed (81 files) |
| `cd web; npm ci; npm run dev` | starts the app | **verified** — development app used throughout development |
| `npm run build` | production build (tsc + vite, relative base) | **verified 2026-10-08** — exit 0 |
| `npm run verify:dist` | artifact integrity (inline manifest deep-equal + CSP byte-exact) | **verified 2026-10-08** — ALL CHECKS PASS, modelId matches |
| `npm run test:e2e` | Playwright suite: golden path, offline, request/storage audit, CSP, a11y, degraded, perf | **verified 2026-10-08** — 32 passed |
| CI (`.github/workflows/ci.yml`) | full verification chain VC-01…VC-15 on every push | **green** — verified run `37698481044` |

---

## Rubric coverage

Official weights, verbatim from `Project/Hackathon.md` §4: "Predictive Performance = 30%; 3D Visualization = 25%; Clinical Interpretability = 20%; System Integration = 15%; Technical Implementation = 10%."

| Criterion | Weight | Where the evidence lives | Status (2026-10-08) |
|---|---|---|---|
| Predictive Performance | 30% | Trust → Performance pane (accuracy, precision, recall, F1, ROC-AUC with CIs rendered from `results.json`), Calibration pane, Leakage Audit pane; reproduced by the pipeline; gated by VC-02, VC-04, VC-05, VC-06 | **implemented** — model trained (nested CV), metrics in `results.json`, panes live, gates CI-green |
| 3D Visualization | 25% | Explore Stage (three vessels, colour=probability, rotate/zoom/select); `web/public/models/heart.glb`; `registry.json`; gated VC-09/VC-10/VC-12/VC-14 | **implemented** — three selectable vessels, budgets measured (`tools/qa/perf-report.md`); B-04 window-mean re-measure on demo hardware still open |
| Clinical Interpretability | 20% | Inspector waterfall, measurements table (value, percentile, contribution, direction), modality → feature drill-down, colour-meaning explainer; gated by golden fixtures (C-06) and VC-06, VC-07, VC-11 | **implemented** — exact SHAP + measurements live; copy lint (C-13) green |
| System Integration | 15% | One store → worker → 3D/dashboard synchronised on one animation clock; e2e golden path; request audit; gated VC-08, VC-12, VC-13 | **implemented** — e2e golden path + request audit green (32/32) |
| Technical Implementation | 10% | CI, `make reproduce`, parity gate VC-06, budget gate VC-14, deployment smoke VC-15, this README, `docs/`, model card | **in progress** — CI full chain green, parity/integrity gates green; G10 docs refresh in flight; live URL pending GitHub Pages enablement |

The full requirement → source → contract → verification → proof map is `docs/TRACEABILITY.md`. Its statuses are reconciled against the rubric scoreboard and verification board in `Progress.md` §7–§8.

---

## AI use

AI assistance was used across this project (autonomous coding/documentation agents, plus AI-assisted research and drafting of the project documents). The hackathon rules permit AI tools but require disclosure: "Disclose all AI coding assistants used … require disclosure in Built With and in the README, including which parts were AI-assisted" (`Project/Hackathon.md` §5.E). Undisclosed use "is treated as misrepresentation" (`Project/Tech_Stack & Product Requirements.md` §2).

- Full disclosure: [`docs/AI_USE.md`](docs/AI_USE.md) — includes a section the human owner must complete (name, role, exact tool list, Built With entry).
- Every AI-assisted change in this repository must be disclosed there; AI work is never concealed (`Project/Contracts.md` §88).

---

## Built With (finalise the AI-tool list at feature freeze)

Pinned stack (`Project/Tech_Stack & Product Requirements.md` §27), installed and exercised from the committed lockfile; versions match `web/package.json` / `requirements.lock.txt`:

- **Pipeline:** Python 3.12, pandas 3.0, numpy 2.5, scikit-learn 1.9, xgboost 3.4 (`enable_categorical=False`), shap 0.52 (parity oracle only), pytest 9.1
- **Frontend:** React 19.3, TypeScript 6.0.3, Vite 8.3, plain CSS
- **3D:** three 0.186, @react-three/fiber 9.8, @react-three/drei 10.7
- **State / charts:** zustand 5.0, d3-scale + d3-scale-chromatic 3.1 (cividis), hand-built SVG
- **Inference:** TypeScript Web Worker (own tree walker, logistic regression, Platt scaling, exact SHAP)
- **Meshes:** BodyParts3D → Blender → @gltf-transform/cli 4.5 (fallback: procedural tubes)
- **Hosting / CI:** GitHub Pages via GitHub Actions (primary), Cloudflare Pages (mirror)
- **Backend, database, auth, storage, monitoring, hosted AI API:** none

The final Built With list (including every AI tool) goes on the Devpost submission and must match `docs/AI_USE.md`.

---

## Repository layout

As it exists today (`Project/Tech_Stack & Product Requirements.md` §17):

```text
README.md            this file
Progress.md          internal coordination surface (not a deliverable)
Project/             read-only source documents (requirements, contracts, plan)
Makefile, make.ps1   data/test/reproduce targets (make.ps1 mirrors Makefile on Windows)
.github/workflows/   CI (full VC chain) + deploy.yml (GitHub Pages)
config/              features.json, targets.json, registry.json, forbidden.json
data/                raw CSV, CHECKSUMS.txt, PROVENANCE.md
pipeline/            prepare/train/validate/export + oracle/SHAP + artifacts/
web/                 React app (src, e2e, public artifacts, worker, scene, store)
api/                 planned — optional FastAPI /predict reference endpoint (P2, not built)
tests/               pytest suite (203 tests) + golden fixtures
assets/              ATTRIBUTION.md, REPORT_mesh_gate.md, fallback/heart_tubes.glb
tools/               mesh preparation, QA scripts (perf report, release checklist)
docs/                TRACEABILITY.md, AI_USE.md, DEMO.md, STATUS.md, MODEL_CARD.md
```

---

## Licence and attribution

| Resource | Licence (per source documents) | State |
|---|---|---|
| UCI Extension of Z-Alizadeh Sani dataset | CC BY 4.0 (`Project/Hackathon.md` §14, source [4]) | fetched to `data/raw/`; attribution and provenance recorded in `data/PROVENANCE.md` |
| BodyParts3D anatomy meshes | CC BY-SA 2.1 Japan — share-alike, attribution required (`Project/Tech_Stack & Product Requirements.md` §14, §25) | prepared mesh in use (`web/public/models/heart.glb`); both credit strings recorded verbatim in `assets/ATTRIBUTION.md`; interim licence ruling recorded as D-23, final human ruling at docs freeze (HD-07) |
| This repository's source code | **no code licence chosen yet** | human decision required before submission |

Verbatim asset credits (both shown until HD-07 is resolved — `assets/ATTRIBUTION.md` §2):

> BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International
>
> BodyParts3D, Copyrightc 2008 ライフサイエンス統合データベースセンター licensed by CC表示－継承2.1 日本

No citation, URL or licence beyond the above is asserted anywhere in this documentation; URLs used here appear in `Project/Hackathon.md` §14 or `Project/Tech_Stack & Product Requirements.md`.

---

## Deadlines (official, `Project/Hackathon.md` §1)

- Development window: "30 Sep 2026 to 14 Oct 2026 EOD."
- Devpost submission deadline: "15 Oct 2026 at 12:15 AM IST (14 Oct 2026, 18:45 UTC)."
- Operational target: submit the evening of 14 Oct 2026 IST (internal plan, `Project/Idea.md` §12).
- The live link must still work on 21 Oct 2026 (judging/showcase dates, `Project/Tech_Stack & Product Requirements.md` §2) — no trial-period hosting.

---

## Documentation

| File | Purpose |
|---|---|
| [`docs/TRACEABILITY.md`](docs/TRACEABILITY.md) | requirement → source → contract → verification → proof map (rubric, Tech_Stack requirements, C-01…C-16, VC-01…VC-15) |
| [`docs/AI_USE.md`](docs/AI_USE.md) | AI-assistance disclosure; human-completion section |
| [`docs/DEMO.md`](docs/DEMO.md) | demo script, video plan, submission requirements (all elements `planned`) |
| [`docs/STATUS.md`](docs/STATUS.md) | public-safe engineering status |
| [`docs/MODEL_CARD.md`](docs/MODEL_CARD.md) | model card with measured metrics from web/public/results.json (CAD/LAD/LCX/RCA rocAuc, etc.), reproducibility, explainability, limitations, safety |

---


## Live URL & Demo Video

- Live URL: <!-- HUMAN: replace with deployed URL (GitHub Pages/Cloudflare Pages); must survive Oct 21 --> — the deploy workflow (`.github/workflows/deploy.yml`) is ready and CI-green; blocked on enabling GitHub Pages (**Settings → Pages → Source: "GitHub Actions"**).
- Demo video (3–10 min): <!-- HUMAN: replace with YouTube link -->

---

## Safety, scope and limitations

- **Intended use:** educational and decision-support prototype showing how a pre-imaging clinical profile relates to vessel-level probability in a cohort like the training data (`Project/Idea.md` §2).
- **Not intended as:** a diagnostic tool; a locator of physical disease position in the anatomy; a general-population screener; treatment guidance (`Project/Idea.md` §2).
- **Colour meaning:** a vessel colour represents whole-vessel probability only (`Project/Contracts.md` §31.6).
- **Attribution meaning:** model attribution explains the model's prediction; it does not establish causation, and correlated features share credit (`Project/Contracts.md` §31.5).
- **No external validation:** probabilities are cohort-specific (`Project/Contracts.md` §31.3).
- **Privacy:** no patient input leaves the browser; no telemetry, no storage, no accounts (`Project/Tech_Stack & Product Requirements.md` §15). Enforced and demonstrated: the e2e request audit, storage audit, CSP byte-exact check and offline suite run on every CI run.
