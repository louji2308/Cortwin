# CorTwin - a browser-based clinical probability instrument for pre-imaging cardiovascular assessment

Multimodal AI Hackathon 2026, Track A. Project document (six pages). All figures are read from the committed artifacts (`web/public/results.json`, `tools/qa/perf-report.md`, `config/*.json`, `web/public/manifest.json`); none are typed by hand.

## 1. Overview

CorTwin is an educational, browser-based decision-support prototype for pre-imaging cardiovascular assessment. A user enters a patient profile across five clinical evidence groups - history, exam and symptoms, ECG, labs and echo (54 features). Four leakage-safe per-target models return calibrated probabilities for overall CAD and for whole-vessel stenosis in the LAD, LCX and RCA; the three vessels are coloured on an interactive 3D heart by that single probability channel; every number is explained by exact patient-level Shapley attributions with a measurements table. All inference, explanation and rendering run locally (static site plus Web Worker); patient inputs never leave the device. Validation is nested cross-validation with everything fitted inside the folds; the full evidence is published in the in-app Trust view and summarised on page 4.

> **Educational decision-support prototype. Not a substitute for diagnostic imaging.**

The line above is the persistent in-app banner: non-dismissible, present on every route, asserted by the accessibility e2e suite.

## 2. Requirement coverage

| Track A requirement (brief rows: prediction, leakage, 3D, dashboard, safety, submission) | Where CorTwin satisfies it |
|---|---|
| Prediction pipeline with honest per-target metrics | `pipeline/` nested CV; Trust > Performance pane; page 4; `tests/test_pipeline*.py` |
| Three separately selectable vessels, coloured from live probabilities | `web/public/models/heart.glb` + identity registry; Explore stage; page 5 |
| Explanation dashboard (SHAP + physiological breakdown) | Exact-Shapley engine + Inspector (Why / Measurements); page 5 |
| Visible safety disclaimer | Persistent non-dismissible banner on every route; pages 1 and 6 |
| Live demo link | https://louji2308.github.io/Cortwin/ (GitHub Pages; verified HTTP 200, 2026-10-13) |
| Demo video, 3-10 minutes | Accompanies this submission; plan and golden path in `docs/DEMO.md` |
| Documentation at most 6 pages | This document (rendered PDF, page count asserted = 6) |
| Model weights in the public repository | `web/public/model.json` + `results.json` + fixtures, hashes in `manifest.json`; github.com/louji2308/Cortwin |
| AI-use disclosure | `docs/AI_USE.md` + Devpost Built With; page 6 |

Rubric weights (Track A brief) and where each is proved: Predictive Performance **30%** - page 4 (protocol: page 3); 3D Visualization **25%** - page 5; Clinical Interpretability **20%** - page 5 (global drivers: page 4); System Integration **15%** - the live loop (pages 1, 6); Technical Implementation **10%** - pages 3 and 6.

<!-- PAGEBREAK -->

## 3. Data and preprocessing

**Source.** UCI Machine Learning Repository, Extension of Z-Alizadeh Sani (dataset 411), DOI 10.24432/C5461K, licensed CC BY 4.0. Shape: 303 patients x 59 columns with zero missing cells (`data/PROVENANCE.md`). The CSV shipped in-repo hashes to `b60472ecebdd4ea11d09b8a793711b8da2051fdf79eeae5b88f33269e4a02d37` (sha256, verified by `make data`).

**Labels.** The overall CAD target comes from the angiography column `Cath`: 216 CAD / 87 Normal (71.3% positive). Vessel labels: LAD stenotic 177, LCX 119, RCA 114. Documented quirk: the CAD label equals "any of LAD/LCX/RCA stenotic" in 302 of 303 patients; the single mismatch is documented here, not hidden.

**Features.** 54 model features in five modalities (`config/features.json`): History 17, Exam and symptoms 13, ECG 7, Labs 14, Echo 3. All 8 joint LAD/LCX/RCA patterns occur in the cohort (smallest pattern: 10 patients), which is why cross-validation is stratified on that joint pattern.

**Leakage control.** Forbidden inputs {LAD, LCX, RCA, Cath} plus the constant column Exertional CP are excluded (`config/forbidden.json`). Enforcement is layered: a pipeline schema gate, a blocking leakage gate, a quarantined probe lab behind an import-boundary test, and a runtime request audit. The publisher's own warning ("only one of LAD, LCX, RCA or Cath must be in dataset") is treated as law.

**Encoding and missingness.** Strict encoders: Y/N maps to 1/0; Sex maps Male/Fmale (source spelling) to 1/0; BBB, VHD, Function Class and Region RWMA are ordinal maps. An unknown categorical level raises a typed error at the encoder boundary and is never coerced. Features marked "not provided" never receive fabricated measured values: they are masked out and marginalised over the background set in margin space, and they receive no attribution. BMI is derived as Weight / (Length/100)^2; exact equality with the source column was verified at conversion time (max absolute error approximately 0).

<!-- PAGEBREAK -->

## 4. Model and validation protocol

**Model.** Four separate binary targets (CAD, LAD, LCX, RCA), each an additive ensemble: margin = 0.5 x XGBoost raw margin + 0.5 x logistic decision function over the same 54 standardised features. XGBoost hyperparameters were fixed a priori and never tuned. Platt scaling (a logistic on the margin; slope asserted strictly positive) yields the calibrated probability. The operating threshold maximises F1 on out-of-fold calibrated probabilities; an abstention half-width is set from the distance to that threshold. Additivity is what makes exact Shapley cheap - the architecture was chosen for explainability, and that choice is disclosed (page 6).

**Validation.** Nested cross-validation: outer 5 folds x 3 repeats, inner 4 folds, base seed 411, stratified on the joint LAD/LCX/RCA 8-pattern. Preprocessing, model fitting, Platt calibration, threshold selection and the abstention band are all fitted inside the training folds; the outer test fold is touched only for scoring; no SMOTE is used anywhere in the deployed protocol. Confidence intervals are 95% percentile bootstrap over patients, 10,000 resamples, seeded per curve. The deployed model is trained on all 303 rows; its Platt, threshold and band come from pooled out-of-fold predictions. The displayed CAD probability follows the coherence rule max(P_CAD, P_LAD, P_LCX, P_RCA); the explanation follows its source target and the UI discloses that source.

**Determinism and runtime parity.** All seeds derive from base 411 (`manifest.json` provenance.seedSet); artifacts are content-hashed (identities on page 6). The deployed model also runs as a TypeScript tree walker plus logistic plus Platt in a Web Worker; Python and TypeScript agree within 1e-5 on 40 golden fixtures, and the SHAP efficiency residual is held to 1e-6. The in-app System > Integrity pane runs the same fixtures in the browser against the same engine the UI uses.

<!-- PAGEBREAK -->

## 5. Results, calibration, subgroups and leakage audit

Every number in this section is read from `web/public/results.json` (sha256 `801e9e1e...a11f`) under the protocol above.

| Target | Acc | ROC-AUC [95% CI] | F1 | Prec | Rec | Majority baseline | Fold AUC (mean ± SD) | Tier |
|---|---|---|---|---|---|---|---|---|
| CAD | 0.8878 | 0.9362 [0.9047, 0.9629] | 0.9231 | 0.9027 | 0.9444 | 0.7129 | 0.9379 ± 0.0268 | strong |
| LAD | 0.8020 | 0.8472 [0.8025, 0.8902] | 0.8446 | 0.7799 | 0.9209 | 0.5842 | 0.8464 ± 0.0285 | moderate |
| LCX | 0.6733 | 0.7118 [0.6531, 0.7690] | 0.6426 | 0.5633 | 0.7479 | 0.6073 | 0.7151 ± 0.0597 | limited |
| RCA | 0.6337 | 0.7541 [0.6970, 0.8074] | 0.6476 | 0.5075 | 0.8947 | 0.6238 | 0.7542 ± 0.0585 | limited |

| Target | Confusion tn/fp/fn/tp | Component AUC lr / xgb | Brier raw → Platt | ECE raw → Platt |
|---|---|---|---|---|
| CAD | 65 / 22 / 12 / 204 | 0.9327 / 0.9225 | 0.0890 → 0.0877 | 0.0623 → 0.0465 |
| LAD | 80 / 46 / 14 / 163 | 0.8306 / 0.8474 | 0.1529 → 0.1536 | 0.0655 → 0.0692 |
| LCX | 115 / 69 / 30 / 89 | 0.6667 / 0.7464 | 0.2113 → 0.2099 | 0.0581 → 0.0625 |
| RCA | 90 / 99 / 12 / 102 | 0.7556 / 0.7294 | 0.1910 → 0.1940 | 0.0508 → 0.0482 |

**Reliability tiers.** RT-1 (`results.json` reliability.rule): strong = CI lower bound at least 0.90 and uplift over the majority baseline at least 0.20; moderate = AUC at least 0.80 and uplift at least 0.15; otherwise limited. Shipped tiers: CAD strong, LAD moderate, LCX limited, RCA limited. The instrument reports limited reliability openly, next to every number. Honest ablation: on LCX the xgb-only component outperforms the deployed ensemble (0.7464 vs 0.7118); this is reported, not tuned away - components and weights were frozen a priori.

**Calibration.** Platt is applied to every target and all four beat their base-rate Brier (CAD 0.2047, LAD 0.2429, LCX 0.2385, RCA 0.2347). CAD improves on both scores (ECE 0.0623 → 0.0465) and RCA ECE improves (0.0508 → 0.0482); LAD ECE (0.0655 → 0.0692) and LCX ECE (0.0581 → 0.0625) worsen slightly under Platt, and that is reported rather than hidden.

**Abstention.** Deployed half-width = 40th percentile of |margin - thresholdMargin| over pooled out-of-fold margins (1.845 margin units for CAD); cases inside the band display as indeterminate. CAD sweep (`results.json` decisions.CAD.abstention):

| Abstain closest | Coverage | Accuracy among decided |
|---|---|---|
| 0% | 1.000 | 0.8878 |
| 20% | 0.802 | 0.9259 |
| 40% | 0.601 | 0.9725 |
| 60% | 0.403 | 0.9836 |

**Subgroups.** 16 rows exist in `results.json`; the full set renders in Trust > Subgroups. Quoted here: CAD age < 60, n = 162, AUC 0.949 [0.915, 0.977]; age ≥ 60, n = 141, AUC 0.862 [0.766, 0.940] - the model is clearly weaker for older patients, and the app says so.

**Leakage audit.** Excluded columns: LAD, LCX, RCA, Cath, Exertional CP. A quarantined random-forest probe with everything fitted inside the fold (10 x 3 CV; the probe's SMOTE, where used, stays inside training folds) reaches CAD AUC 0.9213, accuracy 0.8745 - below the deployed model's 0.9362, so an honest protocol does not inflate. Probe models are quarantined evidence, never merged with deployed results.

**Global importance.** Mean |exact SHAP| over a seeded 101-of-303 patient sample (seed 411), margin scale, 60-row background (seed 7411). CAD top-3: Typical Chest Pain 0.8763, Age 0.4389, Region RWMA 0.3549. Full ranking: Trust > Global Drivers.

<!-- PAGEBREAK -->

## 6. Explanations and the 3D pipeline

**Exact Shapley.** CorTwin computes exact interventional Shapley values in margin (log-odds) space. XGBoost contributions are enumerated per tree (depth-2 trees touch at most 3 features, so at most 8 subsets per tree); the logistic component uses the closed form coef x (x - mean_background); the ensemble attribution is the mean of the two components, scaled by the Platt slope. Unobserved evidence is marginalised in margin space over the background rows - never zero-filled - and attributions are produced only for observed features. Feature attributions reconcile to the output margin within the 1e-6 efficiency residual, and each modality bar is the exact sum of its member features, so the waterfall, the modality-to-feature drill-down and the measurements table (value, cohort percentile, signed contribution, direction) always agree. Attributions describe the model relative to its 60-row background set; they are not evidence of causation, and correlated features (Weight, Length, BMI) share credit - both caveats ship in the UI.

**3D stage.** The anatomy is a prepared derivative of BodyParts3D (ISA BP3D 4.0, 99% polygon reduction), taken through Blender and gltf-transform: import, align, merge, rename, export - no geometry was authored and no AI 3D generator was used. The asset exposes exactly five named nodes (HEART, AORTA, LAD, LCX, RCA); HEART and AORTA stay neutral because the model does not predict them. LAD, LCX and RCA are coloured by one continuous probability-to-cividis ramp: colour is the whole-vessel probability of ≥50% stenosis under the cohort label, never a spatial claim about where disease sits. A threshold tick, glyph and text label accompany every colour, and a WebGL failure degrades to a 2D schematic from the same registry; worker failure falls back to the main-thread engine with a visible notice; the quality governor downgrades Q0-Q3 only.

**Measured performance** (`tools/qa/perf-report.md` sections 1-2, production build). Certified 2026-10-07 bundle: 5 draw calls, 77,824 triangles, 0 mesh textures, structure 1.41 MB, critical path 2.02 MB (the 2026-10-10 full-detail mesh rebuild re-measured 108,084 triangles and a 1.86 MB structure inside the same budgets, section 7). Under 4x CPU throttle on AMD Radeon integrated graphics: edit to first visual change p95 4.3 ms, worker evaluate p95 0.3 ms, explain p95 3.2 ms, idle 0 frames, and continuous orbit rotation frame pacing p50 16.7 ms (≈60 fps); the scripted protocol window-mean is 13.9-14.8 fps because its 100 ms input pauses are averaged in. Sustained 30 fps or better must still be re-verified on demo hardware; we never state "at least 30 fps" as a measured product fact.

**Asset credits (verbatim, both shown permanently per final licence ruling D-50).** The mesh derivative ships under the stricter CC BY-SA 2.1 Japan licence (human ruling 2026-10-13, valid under either of the two conflicting official BodyParts3D statements); both credits are kept:

```text
BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International
BodyParts3D, Copyrightc 2008 ライフサイエンス統合データベースセンター licensed by CC表示－継承2.1 日本
```

<!-- PAGEBREAK -->

## 7. Architecture, usage, limitations and disclosures

**Architecture.** A static single-page app (React + Three.js) plus one Web Worker; no backend, no database, no auth, no storage, no telemetry. One zustand store, one identity registry, one active case: the 3D stage, cards, Inspector, Evidence Rail and Trust/System panes are projections of the same state, and Trust/System read `results.json` read-only. CSP is self-only (`default-src 'self'`); the request-audit e2e verifies zero third-party requests, so patient inputs never leave the browser. Features, targets and the vessel registry live in `config/*.json` plus `web/public/registry.json`: adding a feature or an anatomical structure is a JSON edit, not a redesign.

**Usage.** `make data` (fetch + checksum), `make reproduce` (nested CV regenerates `results.json`, `model.json`, fixtures from fixed seeds), `make test` (pytest + vitest parity); in `web/`: `npm ci`, `npm run dev`, `npm run build && npm run preview` (the demo build), `npm run verify:dist`, `npm run test:e2e`. Live: https://louji2308.github.io/Cortwin/ - Repository: https://github.com/louji2308/Cortwin. Verification 2026-10-13: pytest 205, vitest 1,263 (83 files), Playwright e2e 41/41, tsc 0 errors, dist verify ALL CHECKS PASS.

| Artifact identity | sha256 |
|---|---|
| modelId | 71406e355e66d6cd4b7a96848271deb5cc189000a121b9147770975657e2ddba |
| results.json | 801e9e1edb6668527ea288ad67bc512cdeed37de147fa77b7231005bd471a11f |
| model.json | 6c305a6c76baa54b44b938eef1dd37f435ddc1b918cc4e029de1d16ee0e6f8a9 |
| dataset CSV | b60472ecebdd4ea11d09b8a793711b8da2051fdf79eeae5b88f33269e4a02d37 |

**Limitations (honest, numbered).** (1) Small-N single-centre cohort (303 patients); fold-to-fold variation is reported, not hidden. (2) No external validation - every probability is cohort-specific to this angiography cohort. (3) Vessel-level labels only; the 3D colour is a whole-vessel probability, not a spatial claim about disease location. (4) LCX and RCA reliability is limited under RT-1, and the app states this beside every number. (5) Abstention trades coverage for accuracy (page 4). (6) Exact Shapley shares credit among correlated features and depends on the background set. (7) The mesh is a prepared derivative of a 99%-reduced public atlas, not a clinical-grade reconstruction. (8) Educational prototype, not a medical device.

**Disclosures.** AI coding assistants (autonomous coding and documentation agents) were used across the project, as the hackathon rules permit with disclosure; the full record is `docs/AI_USE.md`, and the Devpost Built With field matches it. Licences: this repository's source is MIT (`LICENSE`); the dataset is CC BY 4.0; the mesh derivative is CC BY-SA 2.1 Japan (final ruling D-50) with both credit strings reproduced verbatim on page 5.

> **Educational decision-support prototype. Not a substitute for diagnostic imaging.**
