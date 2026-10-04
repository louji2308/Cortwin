## 1. The idea in one paragraph

**CorTwin maps calibrated, leakage-safe, vessel-level stenosis probabilities onto an interactive 3D coronary model and explains every number.** A user enters a patient's clinical profile in five modality groups: history, exam, ECG, labs and echo. The app predicts overall CAD and stenosis in LAD, LCX and RCA, colours the three vessels in 3D, and shows why each prediction came out as it did. It also shows how much to trust each number. All inference and explanation run in the browser, so patient inputs never leave the device.

The project has three layers:
- **Prediction layer:** small, additive models with proper nested validation. This is where the 30% prediction and 10% technical criteria are won.
- **Visual layer:** a 3D coronary map with certainty encoding and an Evidence Ladder. This covers the 25% 3D and 15% integration criteria.
- **Explanation layer:** exact SHAP, a measurements table and plain-language rationale, for the 20% interpretability criterion.

## 2. Intended use and honest scope

**What it is:** an educational and decision-support prototype showing how a pre-imaging clinical profile relates to vessel-level risk in a cohort like the training data.

**What it is not:**
- A diagnostic tool.
- A lesion locator. The 3D colour means "probability that this whole vessel has ≥50% stenosis", exactly as the dataset defines the label. It does not mean a lesion is at a particular spot.
- A general-population screener. The cohort is 303 angiography patients, about 71% CAD-positive, from one dataset with no external validation. Every probability means "among patients resembling the training cohort".
- Treatment guidance.

The brief's primer warns that "Region with RWMA" is a 0–4 extent code, not a 3D lesion map. We never use it spatially.

## 3. Data (verified by profiling the file)

- **Shape:** 303 rows × 59 columns, with no missing values.
- **Targets:** CAD (216 CAD, 87 Normal, so 71.3% positive), LAD (177 stenotic, 58.4%), LCX (119, 39.3%), RCA (114, 37.6%).
- **Majority-class accuracy baselines:** CAD 71.3%, LAD 58.4%, LCX 60.7%, RCA 62.4%.
- **Joint vessel patterns (LAD/LCX/RCA):** 000=86, 001=17, 010=13, 011=10, 100=57, 101=24, 110=33, 111=63. All 8 combinations occur, and the smallest class has 10 patients. Cross-validation is stratified on these 8 patterns so no fold loses a rare pattern.
- **CAD label:** it equals "any vessel stenotic" in 302 of 303 patients. One patient is a mismatch, and the documentation should mention it.
- **Vessel correlations:** LAD–LCX 0.36, LAD–RCA 0.28, LCX–RCA 0.39. The vessels are related but not redundant.
- **Excluded columns:** LAD, LCX, RCA and Cath are removed to prevent leakage, as the brief requires. I also drop "Exertional CP", which holds one value (all "N") for every patient. That leaves 54 model features.
- **Encoding:** Y/N becomes 1/0, and Sex is Male=1, Female=0 (the file spells it "Fmale"). BBB is ordinal N=0, LBBB=1, RBBB=2. VHD is ordinal N=0, mild=1, Moderate=2, Severe=3.
- **Collinearity:** Weight, Length and BMI overlap, so SHAP will split credit between them. I'll disclose this.
- **Units:** I won't claim units (for example whether BP is systolic mmHg) until I've checked the UCI data dictionary. Field min/max for the form come straight from the cohort. For example, Age runs 30–86, EF-TTE 15–60, and FBS 62–400.

**Modality grouping** is our own, documented choice. The dataset does not define it. It covers all 54 features exactly.
- **History (17):** Age, Weight, Length, Sex, BMI, DM, HTN, Current Smoker, EX-Smoker, FH, Obesity, CRF, CVA, Airway disease, Thyroid Disease, CHF, DLP.
- **Exam and symptoms (13):** BP, PR, Edema, Weak Peripheral Pulse, Lung rales, Systolic Murmur, Diastolic Murmur, Typical Chest Pain, Dyspnea, Function Class, Atypical, Nonanginal, LowTH Ang.
- **ECG (7):** Q Wave, St Elevation, St Depression, Tinversion, LVH, Poor R Progression, BBB.
- **Labs (14):** FBS, CR, TG, LDL, HDL, BUN, ESR, HB, K, Na, WBC, Lymph, Neut, PLT.
- **Echo (3):** EF-TTE, Region RWMA, VHD.

## 4. Modeling pipeline

**Per-target model (CAD, LAD, LCX and RCA each get one):**
1. XGBoost with 200 trees, depth 2, learning rate 0.05, subsample 0.8, column sample 0.6 and L2 regularisation 5.
2. Logistic regression with standardisation and C=0.1.
3. The two logits are averaged.
4. Platt scaling (a slope and intercept on the logit) gives calibrated probabilities.
5. An operating threshold is chosen to maximise F1.
6. An uncertainty band is set from how far a case sits from the threshold.

**Why this architecture:** everything is additive in log-odds, so SHAP is exact and cheap. The models are small enough to run in the browser. Platt scaling preserves additivity, because it only rescales the logit. I chose it for explainability, not for top accuracy (see the comparison table in section 8).

**Validation protocol (nested, 5-fold × 3 repeats outer, 4-fold inner):**
- Everything is fitted inside the training fold: scaling, models, calibration, threshold and band.
- The outer test fold is touched only for scoring.
- No SMOTE is used anywhere.
- The deployed model is trained on all 303 rows. Its Platt, threshold and band parameters come from out-of-fold predictions over the full data.

**Coherence rule:** the displayed CAD probability is `max(P_CAD, max vessel P)`. Independent models contradict each other for a visible minority of patients (section 8), and this rule fixes that at no cost in AUC.

**Disclosures that must go in the model card:**
- Hyperparameters were fixed a priori, not tuned.
- I chose the architecture after looking at cross-validation results on the same 303 rows, so reported numbers may be slightly optimistic. The gaps between candidate models (≤0.02 AUC) are smaller than fold variation.
- No external validation was done.

## 5. Explanation engine

- **Method:** exact interventional SHAP in log-odds space.
  - XGBoost: enumerate feature subsets per tree. Depth-2 trees use at most 3 features, so at most 8 subsets per tree.
  - Logistic regression: closed form, `φᵢ = coefᵢ/scaleᵢ × (xᵢ − mean_bgᵢ)`.
  - Ensemble: `φ = ½(φ_xgb + φ_lr)`, multiplied by the Platt slope.
- **Background:** 60 training rows with a fixed seed, shipped in the model file. Attributions mean "relative to the average prediction over this reference set".
- **Modality contribution** = the sum of its member features' SHAP values. The bars and the feature drill-down therefore always reconcile.
- **Unprovided modalities (design, not yet unit-tested):** treat them as unobserved, with the model's prediction averaged over background rows. SHAP is then computed over observed features only. The prediction-level behaviour is verified (the ladder in section 8). The attribution restriction is a small code change that must get a unit test.
- **Plain-language rationale:** generated from templates over the top contributors. No LLM is involved, so it cannot invent anything.
- **Measurements table:** value, cohort percentile (computed from the data, with no outside clinical ranges), contribution, and direction.
- **Caveats shown in the UI and docs:** attributions describe the model, not causation. Correlated features share credit. Attributions depend on the background set.

## 6. 3D visualization

**Assets.** BodyParts3D's published part list (CC-BY-SA 2.1 Japan) includes the left coronary artery, anterior interventricular artery, circumflex artery of heart and right coronary artery as separate parts. I haven't yet seen how good those meshes look. Gate: by Oct 4, three separately selectable vessels must render at ≥30 fps on integrated graphics. Otherwise fall back to procedural CatmullRom tubes along hand-placed centrelines, which are fully controllable.

**Pipeline:** download parts, then Blender for alignment, decimation and naming meshes `LAD`, `LCX`, `RCA`, `HEART` and `AORTA`. Export glTF and compress with gltf-transform. The licence is share-alike, so keep the attribution and ship the derived meshes under the same licence.

**Scene behaviour:**
- Rotate, zoom and select. Hover shows a tooltip, and a click flies the camera to the vessel and opens its card.
- Camera presets are labelled Overview, LAD, LCX and RCA. Small captions may say cranial, caudal or LAO as visualisation only (cardiologist to confirm). There is no "guidance" wording.
- Render on demand, with a capped pixel ratio, no shadows, and an automatic quality drop on slow GPUs.

**Visual grammar:**
- Colour is the continuous calibrated probability, on a colour-blind-safe sequential ramp (no red/green).
- The legend marks each target's operating threshold. This patches a real trap: LCX and RCA thresholds are about 0.30, so a diverging scale centred on 0.5 would colour patients "low" while the label says "above threshold".
- A hatch pattern plus a badge marks "indeterminate". The anatomy never turns translucent.
- Colour is never the only signal: every state also has a label.
- The aorta and left main stem stay neutral, since the model only predicts LAD, LCX and RCA.

**Consistency requirement:** one registry ties each vessel's id, mesh name, model target and UI card together, with a test asserting the mapping.

## 7. Product, architecture and repository

**Screens:**
1. **Patient and 3D view.** Five modality accordions on the left, each with a "not provided" toggle. The 3D canvas is in the centre. On the right are the CAD card, vessel cards and explanation panel. A persistent safety banner is always visible.
2. **Evidence Ladder.** Stage chips (History → Exam → ECG → Labs → Echo) recolour the vessels live. The ladder shows cumulative information, not a recommended work-up order, and says so.
3. **Validation page.** Model comparison, confidence intervals, calibration curves, threshold trade-off, subgroups, the leakage panel, the input audit and a model-card link.

**Example patients.** Some will be real cohort records, labelled as part of the training data, because their predictions are in-sample and look optimistic. Add two or three hypothetical profiles that are not from the data.

**Repository:**
```
pipeline/   train.py  validate.py  export_model.py  results.json
web/        src/{scene, panels, worker, registry, validation}
tests/      leakage guard, parity fixtures (python + vitest)
api/        FastAPI /predict (parity oracle and fallback)
docs/       MODEL_CARD.md, README coverage table
```
A Web Worker holds the tree walker and SHAP so 3D stays smooth. The model file carries trees, LR coefficients, the scaler, Platt parameters, thresholds, band cutoffs, background rows and percentile tables. Targets and features live in config files, so adding a feature or a structure needs no redesign. This is the brief's extensibility requirement, and the video can demo it.

**JavaScript port details:**
- Use `Math.fround` on inputs and thresholds to mimic XGBoost's float32 comparisons.
- Export `base_score` from the model config explicitly.
- Parity tolerance is 1e-5 (my earlier 1e-6 was too tight to promise).

## 8. Verification log

### Leakage inflation (RF, 10-fold × 3; accuracy / AUC)
| Pipeline | CAD | RCA |
|---|---|---|
| Honest (SMOTE inside folds) | 0.875 / 0.923 | 0.670 / 0.724 |
| SMOTE before CV | 0.920 / 0.978 | 0.763 / 0.857 |
| Plus feature selection before CV | 0.915 / 0.972 | 0.756 / 0.841 |

- Leaving LAD/LCX/RCA in the features for CAD gives 0.977 / 0.993.
- Across 30 random 80/20 splits, CAD accuracy ranged 0.80 to 0.95 (median 0.87). Picking a seed alone can produce "95%".

### Model comparison (nested CV, AUC mean over 15 outer folds)
| | LR | RF | XGB | LR+XGB (ours) | 3-model avg |
|---|---|---|---|---|---|
| CAD | 0.930 | 0.921 | 0.922 | 0.936 | 0.933 |
| LAD | 0.824 | 0.850 | 0.839 | 0.842 | 0.846 |
| LCX | 0.678 | 0.741 | 0.733 | 0.720 | 0.730 |
| RCA | 0.714 | 0.711 | 0.701 | 0.724 | 0.724 |

Fold standard deviation is 0.02 (CAD) up to 0.06 (LCX). RF and XGBoost edge ours on LCX by 0.01–0.02. That is the price of exact additive explanations. Engineered features (LDL/HDL ratio, risk-factor counts and similar) added nothing.

### Final performance (ours, calibrated)
| Target | AUC [95% CI] | Acc / Prec / Rec / F1 at tuned threshold | Reliability tier |
|---|---|---|---|
| CAD | 0.94 [0.91–0.96] | 0.87 / 0.90 / 0.92 / 0.91 | Strong |
| LAD | 0.85 [0.80–0.89] | 0.78 / 0.76 / 0.90 / 0.82 | Moderate |
| LCX | 0.71 [0.65–0.77] | 0.60 / 0.50 / 0.81 / 0.61 | Limited |
| RCA | 0.73 [0.67–0.79] | 0.64 / 0.51 / 0.82 / 0.63 | Limited |

- **At a fixed 0.5 threshold (acc / prec / rec / F1):** CAD 0.88/0.91/0.92/0.92, LAD 0.78/0.79/0.85/0.82, LCX 0.67/0.63/0.42/0.50, RCA 0.66/0.58/0.37/0.45.
- **Tuned thresholds** (chosen on inner folds, average over outer folds) are about 0.49 for CAD, 0.40 for LAD, 0.31 for LCX and 0.30 for RCA. Tuning lifts LCX F1 from 0.50 to 0.61 and RCA F1 from 0.45 to 0.63, trading precision for recall.
- **Majority-class accuracy is 60.7% for LCX and 62.4% for RCA.** Their accuracy barely exceeds it, so lead with AUC, F1 and Brier for those vessels.
- **Calibration, Brier raw → Platt (base-rate Brier):** CAD 0.093→0.092 (0.205), LAD 0.157→0.158 (0.243), LCX 0.212→0.210 (0.238), RCA 0.206→0.203 (0.235). LCX and RCA barely beat the base rate.
- **Calibration error (ECE), raw → Platt:** CAD 0.037→0.016, LAD 0.042→0.037, LCX 0.067→0.053, RCA 0.074→0.065.

### Subgroups (pooled out-of-fold AUC, small groups, wide uncertainty)
| | Age <60 (n=162) | Age ≥60 (n=141) | Female (n=127) | Male (n=176) |
|---|---|---|---|---|
| CAD | 0.94 | 0.87 | 0.97 | 0.91 |
| LAD | 0.87 | 0.76 | 0.82 | 0.86 |
| LCX | 0.71 | 0.58 | 0.69 | 0.72 |
| RCA | 0.78 | 0.63 | 0.77 | 0.70 |

The model is clearly weaker for patients aged 60 and over.

### Uncertainty band (accuracy among decided cases / coverage)
| Abstain on the closest… | 0% | 20% | 40% | 60% |
|---|---|---|---|---|
| CAD | 0.88/1.00 | 0.92/0.83 | 0.96/0.63 | 0.98/0.43 |
| LAD | 0.78/1.00 | 0.81/0.80 | 0.83/0.62 | 0.89/0.41 |
| LCX | 0.60/1.00 | 0.62/0.79 | 0.65/0.60 | 0.67/0.40 |
| RCA | 0.64/0.99 | 0.64/0.79 | 0.67/0.60 | 0.68/0.40 |

Abstaining helps CAD and LAD. It barely helps LCX or RCA, because the underlying signal is weak. The default is 40%, and the reliability tiers carry that message.

### Tree walker and SHAP
- A plain tree walker (what the JavaScript will do) reproduced XGBoost's probabilities to 3×10⁻⁷. The 8-class model's JSON was 564 KB for 1,200 trees, so the four 200-tree models should land around 400 KB before compression. This is an estimate from that measurement.
- My per-tree SHAP matched the `shap` library's interventional mode to 5.8×10⁻⁹. The efficiency property holds exactly, for both the XGBoost part and the logistic regression part. It takes about 30 ms per patient in numpy.
- Modality totals from summed feature SHAP matched a 32-coalition grouped calculation to under 0.001 log-odds on the 4 patients I tested.
- Practical note: `shap` rejects XGBoost 3.x models unless `enable_categorical=False`.

### Evidence Ladder (out-of-fold AUC; hiding modalities in one model vs separately trained stage models)
| Stage | CAD | LAD | LCX | RCA |
|---|---|---|---|---|
| History | 0.77 / 0.79 | 0.65 / 0.68 | 0.68 / 0.70 | 0.68 / 0.69 |
| + Exam | 0.90 / 0.90 | 0.78 / 0.78 | 0.69 / 0.69 | 0.73 / 0.73 |
| + ECG | 0.91 / 0.91 | 0.80 / 0.81 | 0.67 / 0.67 | 0.73 / 0.73 |
| + Labs | 0.91 / 0.91 | 0.80 / 0.80 | 0.72 / 0.72 | 0.75 / 0.75 |
| + Echo | 0.93 / 0.93 | 0.84 / 0.84 | 0.72 / 0.72 | 0.75 / 0.75 |

In each cell, the first value is hiding modalities in the single model and the second is separately trained stage models. They agree within about 0.02, so one model supports every ladder stage. In this dataset, ECG adds nothing for LCX (0.69→0.67). That is a statement about this data, not about cardiology.

### Coherence
A vessel probability exceeds the CAD probability by more than 0.10 for 14.2% of patients, and by more than 0.20 for 4.6%. Direct CAD AUC is 0.937 and the max-rule gives 0.937. A noisy-OR from the vessels alone gives 0.924.

### Retractions and changes from earlier turns
- **Retracted:** "RCA accuracy rises to 81% at 40% coverage". It does not survive nested validation (0.67).
- **Retired:** the joint 8-pattern model, conformal prediction, and the 32-coalition grouped Shapley (all superseded above).
- **Dropped:** treatment "what-if" sliders. Correcting LDL, BP, glucose and TG together moved predicted risk only about 3 points, versus 8–12 for chest-pain type, and the model is observational, so the sliders would imply causation.
- **BodyParts3D claim:** earlier I said the vessel meshes exist. That is now sourced (part list), while mesh quality remains unverified.

## 9. Gaps found and patched
1. In-sample example patients → labelled, plus hypothetical profiles.
2. Colour versus threshold mismatch → sequential ramp, threshold tick, text labels.
3. Referral-cohort prevalence → applicability statement and baseline markers.
4. A 54-field form → accordions, defaults, examples, per-modality "not provided" toggles.
5. Missing inputs → marginalisation (prediction-level behaviour verified).
6. CAD/vessel contradictions → coherence rule.
7. LCX/RCA accuracy near baseline → baselines shown, tiers, metrics led by AUC, F1 and Brier.
8. Architecture-selection optimism → disclosed.
9. JS/XGBoost float differences → `Math.fround`, exported base score, 1e-5 tolerance, golden fixtures.
10. "ML backend" wording → FastAPI reference endpoint.
11. Mesh uncertainty → Oct 4 gate and a procedural fallback.
12. Share-alike licence → attribution and same-licence derivatives.
13. Dataset provenance → re-download from UCI/Kaggle and check 303×59. Don't reuse CardioVision-3D code.
14. SHAP over-interpretation → caveats in the UI and docs.
15. Vessel/mesh/model/card consistency → one registry plus a test.
16. Ladder read as a work-up order → explicit disclaimer.
17. Number drift between docs and app → every figure generated from `results.json`.
18. Colour-blind users → safe ramp, labels and hatching.
19. Weak hardware → render on demand, capped pixel ratio, automatic quality drop.

## 10. Requirement and rubric coverage
| Track A requirement | How it is met |
|---|---|
| CAD and LAD/LCX/RCA prediction | Four calibrated models |
| No leakage | Excluded columns, a guard test, an input-audit panel |
| Accuracy, precision, recall, F1, ROC-AUC | Nested CV, with confidence intervals |
| Interactive 3D, rotate/zoom/select, dynamic colour | R3F scene, vessel-level colouring |
| Dashboard with probabilities and SHAP | CAD card, vessel cards, modality and feature bars |
| Measurements with contribution | Measurements table |
| No dedicated GPU | Render on demand, quality fallback |
| Extensible architecture | Registry and config files |
| Consistent vessel correspondence | Single registry plus a test |
| Safety disclaimer | Persistent banner |
| Documentation (≤6 pages) and video (3–10 min) | Section 12 |

Judging criteria and the proof a judge can see:
- **Prediction (30%):** validation page with protocol, confidence intervals, calibration, thresholds and the leakage panel.
- **3D (25%):** vessel-level map with certainty encoding and the Evidence Ladder.
- **Interpretability (20%):** exact SHAP, modality-to-feature drill-down and the measurements table.
- **Integration (15%):** instant in-browser updates, with parity tests against Python.
- **Technical (10%):** `make reproduce`, model card, tests and a requirement-coverage table.

## 11. Tools
- **Pipeline:** Python, pandas, scikit-learn, xgboost, shap (parity oracle only), matplotlib, pytest, Makefile with fixed seeds.
- **Frontend:** Vite, React, TypeScript, three.js with @react-three/fiber and drei, zustand, SVG charts, vitest, Web Worker.
- **Assets:** BodyParts3D, Blender, gltf-transform.
- **API (optional):** FastAPI.
- **Hosting:** any static host.
- **Delivery:** OBS, YouTube, and Pandoc or Typst for the PDF.

## 12. Plan, video and documentation

**Today is Oct 2. The deadline is Oct 15, 12:15am IST (from Devpost, not the PDF). Plan to submit by the evening of Oct 14.**
- **Oct 3–4:** repo, data check, nested CV reproducing the verified table (±0.01), plus the mesh gate.
- **Oct 5–6:** model export, JS inference and SHAP worker, golden fixtures, parity tests.
- **Oct 7–9:** input panels, 3D colouring, cards, explanation panel, deployed P0.
- **Oct 10–11:** Evidence Ladder, band and tiers, validation page, view presets, API.
- **Oct 12:** polish, test on weak hardware, README and model card, then feature freeze.
- **Oct 13:** 6-page document and video.
- **Oct 14:** buffer, fresh-browser deployment check, submission.

**Priorities:**
- **P0:** pipeline with metrics and calibration, 3D with three vessels, input form, cards, SHAP, measurements, disclaimer, live link.
- **P1:** ladder, band, validation page, input audit, presets, API.
- **P2:** similar-patient lookup, report upload, territory overlay.

**Video (about 6:30):**
1. Hook and positioning sentence, 0:30.
2. Input workflow and ladder, 1:00.
3. 3D interactions, 1:00.
4. Explanations, 1:00.
5. Validation page and leakage panel, 1:15.
6. Architecture, parity tests and a live feature-add via config, 1:00.
7. Limitations, disclaimer and AI-use disclosure, 0:45.

**6-page document:**
1. Overview and requirement coverage.
2. Data and preprocessing.
3. Model and validation protocol.
4. Results, calibration, subgroups and leakage audit.
5. Explanations and the 3D pipeline.
6. Architecture, usage, limitations and disclosures.

## 13. Risks
- **Mesh quality:** the Oct 4 gate and a procedural fallback.
- **Time:** P0 first, with a feature freeze on Oct 12.
- **JS parity bugs:** golden fixtures from day one.
- **Judges anchoring on inflated competitor numbers:** the leakage panel and tiers show why ours are lower.
- **Rules:** build in the allowed window, disclose AI tools, and be able to explain every module.

## 14. Still unverified
- The JavaScript port itself. Only the algorithm is verified, in Python.
- BodyParts3D mesh quality.
- Attribution restricted to observed features. It needs its unit test.
- Camera-preset captions (cranial, caudal, LAO). A cardiologist should check them.
- Dataset units and licence. Check the UCI/Kaggle pages.

**This is the direct copy pasted from the AI I Worked On and generated the idea**