# CorTwin — Model Card

**Model ID:** sha256:71406e355e66d6cd4b7a96848271deb5cc189000a121b9147770975657e2ddba  
**Artifact reference:** web/public/manifest.json (schemaVersion 1.0.0, appVersion 0.1.0)  
**Trained weights artifact:** pipeline/artifacts/deployed_model.joblib (exists)  
**Validation results:** web/public/results.json  
**Schema version:** 1.0.0  
**Date:** 2026-10-08 (§4 metrics refreshed 2026-10-13 — see the provenance note in §4)

---

## 1. Intended Use

CorTwin is a browser-based educational/decision-support prototype for Track A of the Multimodal AI Hackathon 2026. It predicts:
- Overall CAD (≥50% stenosis in any of LAD/LCX/RCA per cohort label)
- Whole-vessel probability of ≥50% stenosis for LAD, LCX, RCA

**Limitations on use (non-negotiable):**
- Not a medical device, not for clinical diagnosis, not a substitute for formal diagnostic imaging. <!-- c13-allow: limitation statement — intended-use limitation mandated by Contracts.md C-13 L409 -->
- Outputs are cohort-specific to the UCI Extension of Z-Alizadeh Sani dataset (303 patients); no external validation.
- Vessel color/probability is whole-vessel probability only; no lesion localization.
- Model attribution explains the model's prediction; it does not prove causation.
- Results must be interpreted with uncertainty and reliability tiers as presented.

Safety disclaimer (app banner, verbatim): "Educational decision-support prototype. Not a substitute for diagnostic imaging."

---

## 2. Dataset

- Source: UCI Machine Learning Repository — Extension of Z-Alizadeh Sani Dataset (dataset 411), DOI 10.24432/C5461K  
- Provenance: data/PROVENANCE.md (CC BY 4.0; publisher notes included)
- Shape: 303 rows × 59 columns (from PROVENANCE.md §6: "Shape: 303 rows × 59 columns, zero missing cells in any column")
- Labels: CAD derived from Cath (216 CAD, 87 Normal). Vessel labels: LAD Stenotic 177, LCX 119, RCA 114 (PROVENANCE.md §6)
- Forbidden inputs (leakage control): LAD, LCX, RCA, Cath — never used as features. Exertional CP is constant across all rows and excluded (PROVENANCE.md §6; config/forbidden.json)
- Modalities: History (17), Exam/Symptoms (13), ECG (7), Labs (14), Echo (3) — total 54 model features as specified in project requirements
- Notes: No missing values reported; BMI derived from Weight/Length (verified exact equality in PROVENANCE.md). Dataset units not re-stated beyond source; no external validation set.

---

## 3. Model

- Family: Tree-based ensemble (XGBClassifier) per pinned stack (xgboost 3.4.1; enable_categorical=False per Tech_Stack §27). Logistic calibration applied where specified by pipeline; exact model structure in web/public/model.json (artifact). 
- Targets: CAD, LAD, LCX, RCA (separately evaluated)
- Feature set: 54 features (after excluding forbidden/constant inputs)
- Leakage control: nested CV (5×3 outer/4 inner as documented in plan; metadata in results.json/protocol), everything fitted inside fold, no SMOTE, stratified on joint vessel pattern per design; VC-01/VC-02/VC-04 gates.
- Determinism: seeds from manifest.json provenance.seedSet (base 411; derived seeds for folds/xgb/deployed). Content-hashed artifacts (modelId sha256:71406e355e66d6cd4b7a96848271deb5cc189000a121b9147770975657e2ddba).

---

## 4. Validation & Performance

All headline metrics below are read directly from web/public/results.json (performance block), refreshed 2026-10-13 after the D-40 producer extension regenerated the artifact (2026-10-12). Values are as produced by the committed artifacts; the earlier 2026-10-08 transcription in this card was stale and has been replaced wholesale. Rounded to 4 decimal places for readability — full precision lives in the artifact.

- **CAD (overall):** rocAuc 0.9362, rocAucCI [0.9047, 0.9629], accuracy 0.8878, f1 0.9231, precision 0.9027, recall 0.9444, majorityBaseline 0.7129, foldAucMean 0.9379 ± 0.0268; confusion tn=65 fp=22 fn=12 tp=204; componentAuc lr 0.9327 / xgb 0.9225; Brier raw 0.0890 → Platt 0.0877; ECE raw 0.0623 → Platt 0.0465; reliability tier **strong** (RT-1: CI lower ≥ 0.90 and uplift ≥ 0.20)
- **LAD:** rocAuc 0.8472, rocAucCI [0.8025, 0.8902], accuracy 0.8020, f1 0.8446, precision 0.7799, recall 0.9209, majorityBaseline 0.5842, foldAucMean 0.8464 ± 0.0285; confusion tn=80 fp=46 fn=14 tp=163; componentAuc lr 0.8306 / xgb 0.8474; Brier raw 0.1529 → Platt 0.1536; ECE raw 0.0655 → Platt 0.0692; reliability tier **moderate** (RT-1: AUC ≥ 0.80 and uplift ≥ 0.15)
- **LCX:** rocAuc 0.7118, rocAucCI [0.6531, 0.7690], accuracy 0.6733, f1 0.6426, precision 0.5633, recall 0.7479, majorityBaseline 0.6073, foldAucMean 0.7151 ± 0.0597; confusion tn=115 fp=69 fn=30 tp=89; componentAuc lr 0.6667 / xgb 0.7464; Brier raw 0.2113 → Platt 0.2099; ECE raw 0.0581 → Platt 0.0625; reliability tier **limited** (below RT-1 moderate criteria) — honest ablation note: the xgb-only component (0.7464) exceeds the deployed ensemble (0.7118) on this target; the ensemble is not tuned per-target
- **RCA:** rocAuc 0.7541, rocAucCI [0.6970, 0.8074], accuracy 0.6337, f1 0.6476, precision 0.5075, recall 0.8947, majorityBaseline 0.6238, foldAucMean 0.7542 ± 0.0585; confusion tn=90 fp=99 fn=12 tp=102; componentAuc lr 0.7556 / xgb 0.7294; Brier raw 0.1910 → Platt 0.1940; ECE raw 0.0508 → Platt 0.0482; reliability tier **limited** (below RT-1 moderate criteria)

Source file+keys: web/public/results.json → performance.{CAD,LAD,LCX,RCA}.{rocAuc, rocAucCI, accuracy, f1, precision, recall, foldAucMean, foldAucSd, majorityBaseline, confusion, componentAuc} and calibration.{…}.{brierRaw, brierPlatt, eceRaw, ecePlatt}; tiers from reliability.targets.{…}.tier. Artifact sha256 801e9e1edb6668527ea288ad67bc512cdeed37de147fa77b7231005bd471a11f (root results.json byte-identical).

Validation protocol (results.json → protocol): nested CV, outer 5×3 / inner 4, seed 411, stratified on the joint LAD/LCX/RCA 8-pattern; preprocessing, calibration, threshold selection and abstention all fitted inside folds; no SMOTE; 95% percentile-bootstrap CIs over patients (10,000 resamples). Decisions (threshold sweeps, abstention coverage/accuracy trade-offs), evidence ladder, leakage lab (excluded columns LAD/LCX/RCA/Cath + constant Exertional CP; quarantined probe models), subgroups (16 rows) and globalImportance (mean |exact SHAP| over a seeded 101-of-303 sample, margin scale, 60-row background seed 7411) are present in results.json and rendered live by the Trust panes.

---

## 5. Explainability

- Patient-level SHAP-style attributions computed by the engine (TypeScript) with Python oracle parity (golden fixtures in web/public/fixtures/golden.json). Parity tolerance 1e-5, efficiency residual 1e-6.
- Attributions are shown per target (CAD/LAD/LCX/RCA) with modality grouping, feature contributions (signed), and measurements table (value, percentile, contribution, direction).
- Unobserved modalities are marginalized (not zero-filled) per design; attributions only for observed features where applicable.
- Caveat: model attribution ≠ causation; correlated features share credit.

---

## 6. Fairness/Limitations & Known Issues

- Cohort size 303 (small-N); fold-to-fold variance reported (foldAucSd). Uncertainty presented via reliability tiers/decision states.
- Single-center diagnostic dataset (Z-Alizadeh Sani extension); no external validation — cohort-specific probabilities only.
- Vessel-level labels only (no pixel/lesion coordinates). Color represents whole-vessel probability only.
- Class imbalance varies by vessel (LCX/RCA lower prevalence effects reflected in precision/recall).
- Performance on demo hardware: B-04 measured p50 frame pacing 16.7 ms (~60 fps) during continuous orbit rotation under 4× CPU throttle on AMD Radeon iGPU; protocol window-mean 13.9–14.8 fps with scripted 100ms input pauses (perf-report §2). Window-mean below 30 fps is a measurement artifact of scripted input pacing; sustained render loop pacing meets ~60 fps. Must re-verify on demo hardware at G9.

---

## 7. Safety & Compliance

- Persistent safety disclaimer on every route (non-dismissible).
- No patient data leaves browser; no telemetry, no storage, no hosted AI API (C-15). Request audit enforces same-origin and blocks third-party requests.
- Leakage protection enforced (schema gate + leakage gate). Prohibited inputs never enter features.
- No generative model in risk path; narrative templates based (C-13).
- Anatomy policy: uses BodyParts3D-derived heart.glb (CC BY-SA 2.1 JP final per D-50 2026-10-13; both credit strings in ATTRIBUTION/manifest) or procedural tubes fallback; never AI-generated anatomy.

---

## 8. Reproducibility

- make reproduce regenerates results.json, model.json, fixtures from fixed seeds (Tech_Stack §18)
- Manifest (web/public/manifest.json): modelId sha256:71406e355e66d6cd4b7a96848271deb5cc189000a121b9147770975657e2ddba, bundleId, artifact hashes (registry/model/structures/cases/results/fixtures), provenance with toolVersions (numpy 2.5.3, pandas 3.0.6, python 3.12.9, scikit-learn 1.9.1, xgboost 3.4.1), dataSha256 matches data/CHECKSUMS.txt (b60472ecebdd4ea11d09b8a793711b8da2051fdf79eeae5b88f33269e4a02d37)
- Golden fixtures in web/public/fixtures/golden.json; parity tested (VC-06). Python/TS parity tolerance 1e-5.
- Dataset provenance: data/PROVENANCE.md (CC BY 4.0), checksums in data/CHECKSUMS.txt.

---

## 9. References
- UCI Extension of Z-Alizadeh Sani: https://archive.ics.uci.edu/dataset/411/extention+of+z+alizadeh+sani+dataset (CC BY 4.0, DOI 10.24432/C5461K)
- BodyParts3D: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/ (licence CC BY-SA 2.1 JP final per D-50, assets/ATTRIBUTION.md)
- Tools: scikit-learn 1.9, xgboost 3.4 (enable_categorical=False), shap 0.52 (oracle only), numpy 2.5, pandas 3.0, TypeScript 6.0.3, React 19.3, three 0.186, @react-three/fiber 9.8, @react-three/drei 10.7, vitest 5.0, pytest 9.1
- AI disclosure: docs/AI_USE.md (required; human section incomplete)
- Safety/ethics: no patient data egress; educational use only; no diagnostic claims.
