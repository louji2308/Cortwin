# CorTwin

**Multimodal AI Hackathon 2026 — Track A (official title: "Cardiovascular Risk Visualization & Prediction")**

CorTwin is a browser-based decision-support and educational prototype for Track A of the hackathon. A user enters a patient's clinical profile in five evidence groups (history, exam and symptoms, ECG, labs, echo — 54 model features); the app estimates overall CAD probability and whole-vessel probability of ≥50% stenosis under the cohort label for LAD, LCX and RCA, colours three coronary vessels on an interactive 3D heart, and shows the model attribution behind every number. Inference, explanation and rendering are designed to run entirely in the browser, so patient inputs never leave the device. The cohort is the 303-patient UCI Extension of Z-Alizadeh Sani dataset (`Project/Hackathon.md` §9), used with no external validation — every output means "among patients resembling the training cohort". **This is not a substitute for formal diagnostic imaging and makes no claim about any individual.**

**Required safety disclaimer, verbatim (`Project/Final_demo.md` §3, the wording the app banner must show):**

> Educational decision-support prototype. Not a substitute for diagnostic imaging.

**Official safety requirement, verbatim (`Project/Hackathon.md` §3, Safety row):**

> Clear, visible statement that predictions are decision-support/educational and not a substitute for formal diagnostic imaging.

In the running application that banner must be persistent, non-dismissible and present on every route (`Project/Contracts.md` §31.1 and invariant INV-12). **The application does not exist yet — see Status.**

---

## Status — last updated 2026-10-03

Honest current state of the repository. Nothing below is aspirational.

| Item | State today |
|---|---|
| Phase | P0 (Foundation) — foundation work in flight (`Progress.md`) |
| Application / UI | not built; `web/` is empty (no `package.json`) |
| Model | **not trained**; no `results.json`, no `model.json`, no metrics of any kind exist |
| Dataset | not yet fetched or checksummed locally (due 2026-10-04) |
| 3D assets | route undecided; mesh acceptance gate due 2026-10-04. `assets/raw/` holds a downloaded BodyParts3D parts list and mesh archive — downloaded only, not validated, not accepted, licence record pending |
| Tests | no test files exist yet (`tests/conftest.py` only) |
| Live URL | none; public repository not yet created (human-owned step) |
| Git | repository initialised, **no commits made** (decision D-06 in `Progress.md`) |
| Documentation | this README and `docs/` written 2026-10-03 — scaffold only |

Verified command result on this machine, 2026-10-03: `python -m pytest tests/ -q` → `no tests ran in 0.03s`, exit code **5** (pytest collects zero tests because no test files exist). Observed toolchain: Python 3.11.9 with pytest 8.4.2, versus the pinned plan of Python 3.12 / pytest 9.1 (`Project/Tech_Stack & Product Requirements.md` §27). That deviation is recorded as decision D-04 in `Progress.md` (evidence-first: pins are tested before any pin is loosened); it is not resolved.

---

## Command surface

Intended commands, from `Project/Tech_Stack & Product Requirements.md` §18. **Verified today** means it was run in this repository on 2026-10-03 and the result is stated. Everything else is **planned** and must not be presented to a judge as working.

| Command | Purpose (source: Tech_Stack §18) | State |
|---|---|---|
| `make data` | fetches and checksums the CSV | **not yet verified** — `Makefile` does not exist yet (owner: foundation agent, in flight); `make` is not installed on this Windows host, so a `make.ps1` shim is planned (decision D-03) |
| `make reproduce` | runs nested CV and writes `results.json`, `model.json` and fixtures | **not yet verified** — no pipeline code yet |
| `make test` | runs pytest and vitest parity | **not yet verified** — no tests yet |
| `cd web && npm ci && npm run dev` | starts the app | **not yet verified** — `web/` is empty; no lockfile |
| `npm run build` | production build | **not yet verified** |
| `npm run preview` | local production preview (what the demo runs from) | **not yet verified** |
| `python -m pytest tests/ -q` | Python test suite | **verified today, and not green**: runs, collects 0 tests, exit code 5 |

---

## Rubric coverage

Official weights, verbatim from `Project/Hackathon.md` §4: "Predictive Performance = 30%; 3D Visualization = 25%; Clinical Interpretability = 20%; System Integration = 15%; Technical Implementation = 10%."

| Criterion | Weight | Where the evidence will live | Status (2026-10-03) |
|---|---|---|---|
| Predictive Performance | 30% | Trust → Performance pane (accuracy, precision, recall, F1, ROC-AUC with CIs generated from `results.json`), Calibration pane, Leakage Audit pane; reproduced by `make reproduce`; gated by VC-02, VC-04 | not started |
| 3D Visualization | 25% | Explore Stage: three separately selectable vessels, colour = live calibrated probability, rotate/zoom/select; gated by VC-09, VC-10, VC-12; mesh gate decision due 2026-10-04 | not started |
| Clinical Interpretability | 20% | Inspector waterfall, measurements table (value, percentile, contribution, direction), modality → feature drill-down; gated by golden fixtures (C-06) and VC-06, VC-07 | not started |
| System Integration | 15% | One store → worker → 3D/dashboard synchronised on one animation clock; gated by VC-08, VC-12, VC-13 | not started |
| Technical Implementation | 10% | CI, `make reproduce`, parity gate VC-06, budget gate VC-14, deployment smoke VC-15, this README, `docs/`, model card | in progress — documentation scaffold only; no CI, code or tests yet |

The full requirement → source → contract → verification → proof map is `docs/TRACEABILITY.md`. Its statuses are reconciled against the rubric scoreboard and verification board in `Progress.md` §7–§8.

---

## AI use

AI assistance was used across this project (autonomous coding/documentation agents, plus AI-assisted research and drafting of the project documents). The hackathon rules permit AI tools but require disclosure: "Disclose all AI coding assistants used … require disclosure in Built With and in the README, including which parts were AI-assisted" (`Project/Hackathon.md` §5.E). Undisclosed use "is treated as misrepresentation" (`Project/Tech_Stack & Product Requirements.md` §2).

- Full disclosure: [`docs/AI_USE.md`](docs/AI_USE.md) — includes a section the human owner must complete (name, role, exact tool list, Built With entry).
- Every AI-assisted change in this repository must be disclosed there; AI work is never concealed (`Project/Contracts.md` §88).

---

## Built With (planned — finalise at feature freeze)

Pinned plan only (`Project/Tech_Stack & Product Requirements.md` §27). Not yet installed, not yet exercised in this repository:

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

Planned shape (`Project/Tech_Stack & Product Requirements.md` §17) with what exists today:

```text
README.md            this file (written 2026-10-03)
Progress.md          internal coordination surface (not a deliverable)
Project/             read-only source documents (requirements, contracts, plan)
Makefile, .github/   planned — not created yet
config/              planned — features.json, targets.json, registry.json
data/                planned — fetched by `make data`, checksums.txt
pipeline/            planned — encode/train/validate/export + results.json
web/                 planned — React app, worker, scene, store (empty today)
api/                 planned — optional FastAPI /predict reference endpoint
tests/               planned — pytest + vitest (conftest.py exists, no tests yet)
assets/              mesh work in progress (raw downloads only, unvalidated)
tools/               planned — mesh preparation tooling
docs/                TRACEABILITY.md, AI_USE.md, DEMO.md, STATUS.md (written);
                     MODEL_CARD.md and ARCHITECTURE.md still to be written (P9)
```

---

## Licence and attribution

| Resource | Licence (per source documents) | State |
|---|---|---|
| UCI Extension of Z-Alizadeh Sani dataset | CC BY 4.0 (`Project/Hackathon.md` §14, source [4]) | attribution required; local copy not yet fetched |
| BodyParts3D anatomy meshes | CC BY-SA 2.1 Japan — share-alike, attribution required (`Project/Tech_Stack & Product Requirements.md` §14, §25) | downloads present in `assets/raw/`; `assets/ATTRIBUTION.md` not yet written; licence ambiguity would trigger human gate HD-07 |
| This repository's source code | **no code licence chosen yet** | human decision required before the public repo is created |

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
| `docs/MODEL_CARD.md`, `docs/ARCHITECTURE.md` | planned for the documentation phase (`Implementation_Plan.md` P9) |

---

## Safety, scope and limitations

- **Intended use:** educational and decision-support prototype showing how a pre-imaging clinical profile relates to vessel-level probability in a cohort like the training data (`Project/Idea.md` §2).
- **Not intended as:** a diagnostic tool; a locator of physical disease position in the anatomy; a general-population screener; treatment guidance (`Project/Idea.md` §2).
- **Colour meaning:** a vessel colour represents whole-vessel probability only (`Project/Contracts.md` §31.6).
- **Attribution meaning:** model attribution explains the model's prediction; it does not establish causation, and correlated features share credit (`Project/Contracts.md` §31.5).
- **No external validation:** probabilities are cohort-specific (`Project/Contracts.md` §31.3).
- **Privacy:** no patient input is designed to leave the browser; no telemetry, no storage, no accounts (planned architecture — `Project/Tech_Stack & Product Requirements.md` §15). Not yet demonstrated, because the app does not exist yet.
