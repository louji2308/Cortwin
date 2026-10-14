# CorTwin — Hackathon Demo Video Script (v2, 2026-10-14)

**Track:** Multimodal AI Hackathon 2026 · Track A — Cardiovascular Risk Visualization & Prediction
**Target runtime:** 6 minutes 30 seconds (within the required 3–10 minute window)
**Format:** Screen recording + clear voice-over; minimal intro card, no slide-only presentation
**Build:** record the live release at https://louji2308.github.io/Cortwin/ (verified 2026-10-14 serving the submitted commit: in-viewer legend, 44px camera toolbar, vessel tags, focus mode, deep interior zoom D-56 all present). Re-verify the URL once immediately before recording.

> **Before recording:** Do not narrate a result or feature unless the exact release candidate shows it. Marked **VERIFY LIVE** are recording checks.

---

## Part 1 — Demo strategy and plan

### The story in one sentence

**CorTwin turns structured clinical features into four transparent, cohort-specific probability estimates, links the three vessel-level estimates to an interactive 3D heart, and lets a reviewer inspect both the prediction's explanation and the evidence behind the model.**

### The problem

A risk percentage by itself is difficult to interpret. It does not help a viewer understand which coronary vessel a vessel-specific estimate refers to, which measured features influenced a particular model output, how reliable that target's evaluation is, or whether the result has been independently validated.

### The solution

CorTwin is a browser-based educational decision-support prototype. It uses 54 structured features across history, examination and symptoms, ECG, laboratory measurements, and echocardiography to produce four separate model outputs:

- Overall coronary artery disease (CAD).
- Whole-vessel probability of at least 50% stenosis under the cohort label for LAD.
- Whole-vessel probability of at least 50% stenosis under the cohort label for LCX.
- Whole-vessel probability of at least 50% stenosis under the cohort label for RCA.

The application connects these outputs to an interactive 3D heart, shows patient-level model attribution and measurements, and provides Trust and System views for validation and implementation evidence. Inference runs locally in the browser.

### What to emphasize, in order

1. **The live connected loop:** input change → inference → prediction values and vessel rendering update → explanation updates.
2. **The 3D mapping:** rotate, zoom (including into the interior), select LAD/LCX/RCA, match geometry ↔ named vessel ↔ probability. Never imply the model localizes a lesion within a vessel.
3. **Interpretability:** one concrete feature attribution and its measurement — not a tour.
4. **Honest evidence:** all four targets; LCX/RCA limited; calibration / leakage-control evidence; internal validation is not clinical readiness.
5. **Reproducible engineering:** local inference, artifact integrity, parity — proof briefly.
6. **Safety and transparency:** banner visible throughout; intended-use limitation aloud; AI assistance disclosed.

### Map each judging criterion to evidence in the video

| Track A criterion | Weight | Proof to show |
|---|---:|---|
| Predictive performance | 30% | Trust → Performance: all four targets, metrics, CIs, baselines; Calibration / Leakage Audit |
| 3D visualization | 25% | Live 3D scene, rotation, zoom (incl. interior), vessel selection, legend + tags, focus mode |
| Clinical interpretability | 20% | Why view, patient-level attribution, Measurements table, attribution caveat |
| System integration | 15% | Change one input → outputs + visualization/explanation update |
| Technical implementation | 10% | System → Architecture / Integrity, local pipeline, parity evidence |

### Recommended recording settings

- Aim for **6:30**; calm engineering demonstration, not an advertisement.
- Fresh browser profile, unrelated tabs closed, legible zoom, desktop notifications disabled.
- Hypothetical complete case selected and used consistently. Keep the safety banner visible; never crop it.
- Pre-test the one feature you will change live; know where its explanation appears.
- Keep document, commit, artifacts and video on the same release candidate.
- Record a clean take; keep the local MP4; upload to YouTube; verify playback signed-out.

### Critical claims to verify before saying them

- **CAD displayed value:** the Explore CAD readout applies the displayed coherence rule (max of the CAD model output and the vessel probabilities); the Trust table reports the CAD model's own evaluated metrics. Call the Explore value a *displayed coherence rule*, not the raw calibrated CAD output.
- **Reported metrics (verified against live results.json 2026-10-14):** ROC-AUC 0.936 (CAD), 0.847 (LAD), 0.712 (LCX), 0.754 (RCA) — narrate as ≈0.94 / 0.85 / 0.71 / 0.75 with "approximately".
- **Reliability tiers** are the project's internal evaluation categories, not clinical confidence.
- **AI disclosure:** OpenCode agents built code/tests/pipeline/UI; Claude assisted repository documentation; ChatGPT/Claude supported research (`docs/AI_USE.md`). Devpost Built With and README must match.

---

## Part 2 — Timed video script

## 0:00–0:30 — Hook: why CorTwin exists

**On screen**
- Start directly in Explore with the hypothetical complete profile loaded; hold two seconds so the interface, 3D heart, CAD output, vessel cards and persistent safety banner are visible. No title slide (or <3 s).

**Voice-over**

"Cardiovascular prediction systems can return a percentage, but a number alone does not show which coronary vessel a prediction refers to, what influenced the model, or how much confidence the evaluation supports.

CorTwin addresses that interpretation problem by connecting clinical-feature-based predictions to an interactive 3D heart, patient-level explanations, and a transparent validation dashboard."

**Transition** — pointer to the patient profile.

## 0:30–1:10 — Inputs and the four prediction tasks

**On screen**
- Show the five evidence groups: History, Exam & Symptoms, ECG, Labs, Echo.
- Point to the provided-count indicator (`N / 54 provided` — read the actual number on screen).
- Leave the input audit for the Trust/System section unless it is quick.

**Voice-over**

"The model takes 54 structured features across five evidence groups: history, examination and symptoms, ECG, laboratory measurements, and echocardiography.

It predicts four separate targets: overall CAD, and whole-vessel stenosis probabilities for the left anterior descending artery, the left circumflex artery, and the right coronary artery.

The vessel labels and the angiography-derived Cath field are excluded from the predictor inputs to prevent target leakage. These are model estimates from a small clinical cohort, not direct readings from an imaging scan."

## 1:10–2:45 — The 3D scene: the core visual proof

**On screen**
1. Heart centred and large. Rotate slowly — genuinely interactive.
2. Zoom with the scroll wheel **into the heart** — pass through the outer surface and briefly show the interior anatomy — then zoom back out. (New in this release: the orbit floor allows interior exploration; materials are double-sided so nothing disappears.)
3. Use the stage **toolbar**: click **Fit heart**, then **Back**, **Side**, **Top** — each flies the camera; end on the anterior view via **Reset view**.
4. Select **LAD**. Pause: card, Inspector, vessel tag and legend marker all change together.
5. Select **LCX**, then **RCA**. Pause on each so the vessel and matching probability can be read.
6. Point to the **in-viewer legend** bottom-left: the bar is the same probability ramp; the marker is anchored to the selected target's *decision threshold* — not to a patient value.
7. Point to the vessel **tags** over the heart: registry name + glyph + colour dot — colour never carries identity alone.
8. Click **Focus**: the workspace collapses to the stage alone; the heart fills the view. Click Focus again to exit.

**Voice-over**

"This is the anatomical view. LAD, LCX and RCA are separately selectable vessel structures, coloured by that vessel's prediction probability. I can orbit freely — including zooming inside the heart to inspect the interior — and the toolbar flies the camera to named views.

Selecting a vessel connects the 3D structure to its numerical output, its tag, the Inspector, and the legend's threshold marker — one selection, every representation updates together.

An important limitation: the dataset has vessel-level labels, not lesion coordinates. This colour is a whole-vessel probability of at least 50% stenosis under the cohort label. It does not identify where along the artery a blockage sits, and the mesh is not a patient-specific reconstruction."

**Emphasis** — one direct relationship: geometry ↔ name ↔ probability. Never point at a branch as a detected lesion.

## 2:45–3:30 — A live input change: prove system integration

**On screen**
1. Pre-tested reversible feature in the left panel; change it once.
2. Pause for the browser inference.
3. Show the updated output, vessel colour and explanation.
4. Restore only if the update stays clearly visible.

**Voice-over**

"CorTwin is not a static illustration with example numbers. When I change an input, the browser runs the deployed inference engine and the output updates through the shared application state.

The visualization and explanation consume the same prediction state, so the changed number is reflected consistently in the vessel display and the inspection panel. This is the end-to-end path: clinical inputs, model inference, interpretation, visualization."

**Emphasis** — one clean change, not several. No causal or treatment claims.

## 3:30–4:20 — Explain one prediction

**On screen**
1. Select LAD (or another legible target); open **Why**.
2. Show the attribution breakdown.
3. Open **Measurements**: observed value, cohort percentile, signed contribution, direction.
4. Mention the attribution caveat shown in the UI.

**Voice-over**

"CorTwin explains individual model outputs. This panel shows how the observed features contribute to the selected target relative to the model's cohort reference. Measurements connects those contributions back to the actual input values and their cohort context.

These are model attributions, not causal effects. Correlated features share attribution, and an explanation does not prove that changing a feature would change a clinical outcome."

## 4:20–5:25 — Evaluation: strengths and weaknesses, honestly

**On screen**
1. **Trust → Performance**: four-target table with accuracy, precision, recall, F1, ROC-AUC, CIs, majority baseline.
2. **Calibration** for one target.
3. **Leakage Audit**: probe results clearly separated from deployed-model results.

**Voice-over**

"Performance is evaluated separately for each target using nested cross-validation, with preprocessing, calibration and threshold selection fitted inside the training folds.

In this release the reported ROC-AUC is approximately 0.94 for CAD, 0.85 for LAD, 0.71 for LCX and 0.75 for RCA, with uncertainty intervals and class baselines shown alongside.

The results are not equally strong across vessels — LCX and RCA are explicitly marked limited by the project's evaluation rule. Calibration is assessed per target and does not improve on every measure for every vessel.

The Leakage Audit separates the deployed pipeline from deliberately flawed audit-only probes. Inflated probe results are never merged into reported model performance."

**Emphasis** — internal validation on 303 records; no external-validation or clinical-readiness claim.

## 5:25–5:55 — Technical implementation and integrity

**On screen**
1. **System → Architecture**: model artifact → browser inference → visualization.
2. **Integrity**: run the parity check only if it executes live.
3. Artifact hashes / same-origin evidence only if quick.

**Voice-over**

"Training is Python; the exported model runs in the browser through a TypeScript inference engine in a Web Worker. One state path serves the outputs, the visualization and the explanation.

The System view exposes architecture and artifact-integrity evidence. The parity fixtures check that the browser engine agrees with the Python reference within the stated tolerance. Patient inputs are never sent to a remote inference service."

## 5:55–6:25 — Limitations, safety, and AI disclosure

**On screen**
- Back to Explore: heart + persistent safety banner visible. Repository address in description or end card. No long outro.

**Voice-over**

"CorTwin uses a 303-patient cohort with no external validation. Outputs are cohort-specific, LCX and RCA performance is limited, and the 3D vessel colour does not localize a lesion. It is an educational decision-support prototype — not a medical device, and not a substitute for diagnostic imaging.

AI coding and documentation assistance was used during development; the tools and their roles are disclosed in the repository's AI-use documentation and the submission's Built With section.

CorTwin's goal is to make model outputs easier to inspect — not to replace clinical judgment or diagnostic evidence. Thank you."

**End card (3–4 s)**
- CorTwin · Track A — Cardiovascular Risk Visualization & Prediction
- Repository: https://github.com/louji2308/Cortwin
- Live demo: https://louji2308.github.io/Cortwin/
- "Educational decision-support prototype. Not a substitute for diagnostic imaging."

---

## Part 3 — Recording checklist

### Before pressing Record
- [ ] Hosted demo and repository are the same release candidate (URL re-verified).
- [ ] Six-page document (`docs/project_document_6page.pdf`) uses the same release's metrics/artifact hashes.
- [ ] Default hypothetical case loads; safety banner always visible.
- [ ] Vessel selection, tags, legend marker and toolbar (Fit/Reset/Back/Side/Top/Focus) all work on camera.
- [ ] Interior zoom demonstrated once without anything disappearing.
- [ ] Feature edit changes the real model output.
- [ ] Why and Measurements agree with the same target and case.
- [ ] Trust metrics/CIs/baselines match `results.json` (0.936 / 0.847 / 0.712 / 0.754).
- [ ] Leakage Audit labels probe results distinctly.
- [ ] System parity check exercised, or omitted from narration.
- [ ] AI-use disclosure in Devpost Built With and README is accurate.
- [ ] No real clinical information; hypothetical case only.
- [ ] Notifications off; window and text legible at video resolution.

### During recording
- [ ] Say "probability" and "model attribution"; never diagnose or detect.
- [ ] Vessel-selection interaction shown clearly; viewer has time to read.
- [ ] Never imply the 3D colour shows a lesion's exact location.
- [ ] Disclaimer never hidden.
- [ ] No unsupported latency or frame-rate numbers.
- [ ] No spliced features from another release without disclosure.
- [ ] Outputs are the visible results; nothing hand-edited.

### After recording
- [ ] Duration 3–10 minutes.
- [ ] Watch the full export once (narration, legibility, cursor, cuts).
- [ ] Upload to YouTube; test playback signed-out; keep local MP4.
- [ ] Video and PDF show the same model/results release.

---

## Part 4 — Short answers if judges ask follow-up questions

**"Is this a medical diagnostic system?"**
"No. It is an educational decision-support prototype trained on a small cohort. It is not externally validated and is not a substitute for diagnostic imaging."

**"Does the red/yellow vessel show where a blockage is?"**
"No. The vessel colour shows a whole-vessel model probability. The dataset does not provide lesion coordinates for this visualization."

**"Why is LCX weaker?"**
"The cohort is small, and the held-out evaluation shows weaker discrimination for LCX. We disclose that result rather than presenting all four targets as equally reliable."

**"How did you avoid target leakage?"**
"LAD, LCX, RCA and Cath are excluded from model inputs. Preprocessing, calibration and threshold selection are fitted within the validation folds, and the project has a separate leakage-audit view."

**"Why run the model in the browser?"**
"It keeps the prototype self-contained and avoids transmitting patient inputs to a remote inference service. It also lets the visualization and explanation respond through the same local state path."

**"What does SHAP tell you?"**
"It explains how features contribute to a model output relative to a chosen background reference. It does not establish causal relationships."

**"What is the biggest limitation?"**
"The 303-record dataset and lack of external validation. The vessel-specific outputs, especially LCX and RCA, should be interpreted cautiously."

**"Which parts used AI?"**
"Coding agents assisted implementation and testing; Claude assisted repository documentation; ChatGPT and Claude assisted project research. The repository's AI-use disclosure records the tools and roles."

---

## Final directing note

**Problem → four outputs → select a vessel in 3D (zoom inside) → change one input → explain one prediction → disclose actual validation → one engineering integrity check → limitations and safety.**

Judges should leave with one idea: **CorTwin connects a model's probability to a named coronary vessel, a readable explanation, and evidence about how much the result deserves to be trusted.**
