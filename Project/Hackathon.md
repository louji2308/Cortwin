**MULTIMODAL AI HACKATHON 2026**

Track A: Cardiovascular Risk Visualization & Prediction

Judge-focused research brief • Official facts separated from strategy inference • Web-verified 02 October 2026

| **Bottom line:** Track A is not a “pretty 3D heart” task. The brief allocates 55% of the score to predictive performance and 3D visualization, 35% to clinical interpretability and system integration, and 10% to technical implementation. A standout submission therefore needs one coherent, real pipeline in which the model output, explanation layer, and anatomy viewer agree with each other. |
|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|

# 1. Hackathon snapshot

| **Item**                    | **Verified detail**                                                                                                                       |
|-----------------------------|-------------------------------------------------------------------------------------------------------------------------------------------|
| Organizer                   | KamandPrompt, Programming Club of IIT Mandi, with Augli.ai, PurpleRain Tech, and LDV Labs.                                                |
| Theme                       | “Build beyond limits” - student projects at the intersection of Generative AI, Agentic AI, multimodal AI, and real-world problem solving. |
| Format                      | Fully online, nationwide; solo or teams of up to 4; inter-college teams permitted.                                                        |
| Registration                | Free.                                                                                                                                     |
| Tracks                      | Four tracks spanning Space, BioTech, and Education; each problem statement has its own rubric.                                            |
| Development window          | 30 Sep 2026 to 14 Oct 2026 EOD.                                                                                                           |
| Devpost submission deadline | 15 Oct 2026 at 12:15 AM IST (14 Oct 2026, 18:45 UTC).                                                                                     |
| Judging                     | 15-20 Oct 2026; winner announcement on 21 Oct 2026.                                                                                       |
| Prize pool                  | ₹1,00,000 total: ₹15,000 first prize + ₹10,000 second prize for each track.                                                               |
| Judges                      | Industry-expert judging panel; names are not yet published on the official Devpost page.                                                  |

| **Important scope rule:** The official rules state that one team can submit in only one track, and an individual may only belong to one submitting team. You cannot use a second team to enter another track. |
|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|

# 2. What the organizers are actually asking for

The hackathon-wide pitch is broad, but Track A is unusually concrete. Its core objective is to build an interactive 3D visualization system that predicts coronary artery disease and cardiac risk from patient physiological/clinical data and maps those predictions onto an interactive 3D human anatomical model. The supplied Track A brief is the controlling source for the detailed requirements and scoring. \[Track A brief, pp. 1-4\]

# 3. Track A - exact problem structure

| **Layer**          | **What Track A requires**                                                                                                                                | **What it must not become**                                                                                     |
|--------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------|
| Prediction         | Overall CAD classification plus stenosis status/probability for LAD, LCX, and RCA using demographic, clinical, ECG, lab, and echocardiographic features. | A model that reads the target vessel columns or Cath result.                                                    |
| Leakage control    | Exclude LAD, LCX, RCA, and Cath from model inputs when predicting CAD or vessel-specific stenosis.                                                       | Post-hoc leakage disguised as “feature engineering.”                                                            |
| 3D visualization   | Interactive 3D torso/heart; vessel nodes color-coded from prediction probabilities; rotate, zoom, and select regions.                                    | A static 3D render, decorative anatomy, or a vessel map that is disconnected from live predictions.             |
| Clinical dashboard | Overall CAD status, vessel-specific probabilities, SHAP/LIME explanation, and physiological-factor contribution.                                         | A single risk number with no patient-level reasoning.                                                           |
| Safety             | Clear, visible statement that predictions are decision-support/educational and not a substitute for formal diagnostic imaging.                           | Language that implies diagnosis, clinical certainty, or anatomical lesion localization not present in the data. |

# 4. The scoring system - where effort actually matters

| **Criterion**             | **Weight** | **Judge-facing question**                                                 | **What strong evidence looks like**                                                                                                              |
|---------------------------|------------|---------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------|
| Predictive Performance    | 30%        | Does the model work, and is the validation credible?                      | Per-target accuracy, precision, recall, F1 and ROC-AUC; leakage-free preprocessing; reproducible cross-validation; honest reporting of variance. |
| 3D Visualization          | 25%        | Does the 3D layer communicate the model output clearly and interactively? | Correct LAD/LCX/RCA correspondence, useful interaction, clean probability encoding, responsive browser performance.                              |
| Clinical Interpretability | 20%        | Can a reviewer understand why this patient received this risk?            | Global + patient-level feature attribution, directional contribution, physiological context, clear limitations.                                  |
| System Integration        | 15%        | Is this one working system rather than separate demos?                    | Real input -\> preprocessing -\> model -\> explanation -\> synchronized 3D/dashboard update.                                                     |
| Technical Implementation  | 10%        | Is the engineering clean, modular and reproducible?                       | Clear architecture, source code, model artifacts, dependency setup, public-resource attribution, modular extension path.                         |

| **Official weighting:** Predictive Performance = 30%; 3D Visualization = 25%; Clinical Interpretability = 20%; System Integration = 15%; Technical Implementation = 10%. The Track A brief, not the generic Devpost “overall criteria” placeholder, contains these weights. |
|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|

# 5. What an exceptional Track A submission should feel like to a judge

The following is a strategy interpretation of the official rubric, not an unpublished scoring formula or a claim about what a future judge will personally prefer.

## A. Prediction should look like a small clinical ML study, not a Kaggle screenshot

- Use a leakage-safe pipeline. Fit preprocessing inside the validation loop rather than transforming the full dataset before cross-validation.

- Because the dataset has only 303 patient records, prefer robust validation over a single convenient train/test split. Stratified cross-validation is a sensible baseline; report fold-to-fold variation rather than one lucky score.

- Report the requested metrics for the overall CAD task and each vessel task. Include confusion matrices or class-specific summaries so a judge can see the error profile, not just a headline AUC.

- Treat probabilities as probabilities. A calibrated risk estimate, uncertainty indicator, or explicit “low confidence / review” state can strengthen risk communication when implemented carefully; these are differentiators, not official bonus points.

- Benchmark at least a simple baseline against the stronger model. A judge can trust a result more when the improvement is demonstrated rather than asserted.

## B. The 3D layer must carry meaning

- The viewer should not merely prove that Three.js works. It should make vessel-specific prediction differences immediately understandable.

- Use a single structured prediction object for the dashboard and anatomy renderer, so LAD/LCX/RCA values cannot drift out of sync.

- Let the user click a vessel and see its probability, model explanation, and relevant physiological drivers in the same state. This makes the 25% visualization criterion reinforce the 20% interpretability criterion.

- Preserve semantic honesty: the dataset provides vessel labels/probabilities, not a pixel-level or 3D lesion location. Visualize predicted vessel status on the labeled anatomy, but do not imply the model discovered the physical coordinates of a plaque.

## C. Explainability should answer “why this patient?”

- A generic SHAP bar chart is not enough. A stronger dashboard shows the current patient’s top positive and negative contributors for CAD and, when useful, for the selected vessel.

- Show the measured value beside the contribution so the judge can connect model reasoning with physiology.

- Use careful wording: feature attribution explains the model’s prediction; it does not prove causation. SHAP documentation itself warns against interpreting predictive explanations as causal evidence.

## D. Integration should be visibly real

- A judge should be able to enter or load a patient, trigger the real inference path, watch the probabilities update, click a vessel, and inspect the matching explanation without seeing hardcoded demo outputs.

- Keep the architecture modular so a new clinical feature, model, or anatomical structure can be added without rewriting the whole application.

- The browser experience should remain responsive without a dedicated GPU, exactly matching a stated technical consideration in the brief.

## E. Technical quality is small in weight but high in credibility

- Public GitHub should make it possible to reproduce the model and understand how the demo was assembled.

- Document dataset provenance, preprocessing, feature exclusion, model architecture, validation protocol, 3D asset provenance/licensing, API contract, and run instructions.

- Disclose all AI coding assistants used. The official rules allow tools such as Cursor, Claude Code, Copilot, ChatGPT, v0 and similar tools, but require disclosure in Built With and in the README, including which parts were AI-assisted.

# 6. “Bonus” opportunities - what is official vs. what is strategic

| **Official bonus status:** No separate Track A bonus-point rubric, sponsor bonus category, or extra-credit score is published in the current official Devpost materials or the supplied Track A problem statement. The safest interpretation is that extra features only help insofar as they improve one of the five scored criteria. |
|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|

| **Strategic differentiator**          | **Primary rubric it strengthens**    | **How to use it without wasting build time**                                                                |
|---------------------------------------|--------------------------------------|-------------------------------------------------------------------------------------------------------------|
| Probability calibration / confidence  | Prediction + clinical interpretation | Show reliability of the probability display; avoid inventing “confidence” numbers without a defined method. |
| Patient-level + global explainability | Clinical Interpretability            | One explanation for the current patient plus a concise global feature view.                                 |
| Vessel drill-down interaction         | 3D Visualization + Interpretability  | Click LAD/LCX/RCA -\> update probability, explanation and physiology panel together.                        |
| Ablation / baseline comparison        | Prediction + Technical               | Prove which modeling decision actually improves performance.                                                |
| Model audit panel                     | Integration + Technical              | Show model version, feature schema, preprocessing version, and prediction timestamp.                        |
| Uncertainty / review state            | Clinical + System                    | Clearly label low-confidence outputs; never frame this as diagnostic certainty.                             |
| Performance discipline                | 3D + Integration                     | LOD/lightweight GLB, bounded textures, lazy loading and tested interaction on ordinary hardware.            |

# 7. What can quietly destroy an otherwise strong submission

- Target leakage: using LAD, LCX, RCA or Cath as inputs, or deriving a proxy for them from a post-diagnosis field.

- Validation leakage: scaling, imputation, feature selection, oversampling, or other transformations performed on the full dataset before cross-validation.

- Single-split overclaiming: presenting one train/test score as if it were robust evidence on a 303-record dataset.

- Decorative 3D: excellent anatomy graphics with weak or disconnected model functionality.

- Explanation theatre: SHAP/LIME is displayed but no patient-level explanation is connected to the selected risk output.

- Anatomical overclaim: showing a “plaque” or exact lesion position when the source data only support vessel-level classification.

- Hardcoded demo results: the UI changes but the underlying model is not actually being called.

- Missing safety boundary: no visible disclaimer, or language that reads like a medical diagnosis.

- Undisclosed AI assistance: explicitly prohibited by the hackathon rules when not disclosed.

# 8. A judge-proof technical architecture

| **Component**     | **Recommended responsibility**                                                | **Judge-visible proof**                                   |
|-------------------|-------------------------------------------------------------------------------|-----------------------------------------------------------|
| Data layer        | Load UCI Extension of Z-Alizadeh Sani; schema validation; target isolation.   | Dataset source, feature list, forbidden-feature check.    |
| ML pipeline       | Preprocess -\> train -\> validate -\> calibrated probability output.          | Reproducible training script/notebook + metric report.    |
| Explanation layer | Generate patient-level/global SHAP or LIME views from the same model output.  | Current-patient explanation panel.                        |
| API layer         | Single prediction endpoint returning CAD + LAD/LCX/RCA + explanation payload. | Network/API response corresponds to the visible UI state. |
| 3D client         | React + React Three Fiber / Three.js; GLB/GLTF anatomy; semantic vessel IDs.  | Interactive selection and real-time color updates.        |
| Dashboard         | Risk summary, vessel details, physiology, model explanation, disclaimer.      | One coherent clinical decision-support screen.            |
| Reproducibility   | Pinned dependencies, README, model artifact/versioning, asset licenses.       | Fresh setup path and public repository.                   |

React Three Fiber is a React renderer for three.js, and its Canvas provides the scene/camera foundation used for interactive 3D web experiences. The official Three.js documentation also provides WebGL capability checks. These are appropriate implementation foundations, but the rubric rewards the resulting system rather than the framework name. \[R3F/Three.js sources\]

# 9. Dataset and medical-data facts worth showing in the report

The UCI Extension of Z-Alizadeh Sani dataset contains 303 patients and 59 features grouped into demographic, symptom/examination, ECG, and laboratory/echo categories. UCI states that a patient is categorized as CAD when diameter narrowing is at least 50%, and that CAD in the extension occurs when at least one of LAD, LCX, or RCA is stenotic. UCI also explicitly warns that target leakage must be avoided when using these vessel/cath columns. \[UCI source\]

| **Data fact**                                  | **Design implication**                                                                                     |
|------------------------------------------------|------------------------------------------------------------------------------------------------------------|
| 303 patients                                   | Small-N regime: validation discipline and uncertainty matter more than a complex model for its own sake.   |
| 59 features                                    | Feature grouping and preprocessing should be documented; do not silently drop variables without rationale. |
| No missing values reported by UCI              | Still validate schema/encoding in code and document categorical handling.                                  |
| LAD / LCX / RCA added as target-related fields | Explicitly assert in code that these and Cath are excluded from inputs.                                    |
| CAD derived from stenosis status               | Treat overall CAD and vessel tasks as related but separately evaluated outputs.                            |

# 10. Submission package - the exact finish line

| **Artifact**                   | **Official requirement / expectation**                                                                                    | **Quality bar for a strong submission**                                                                  |
|--------------------------------|---------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------|
| Working software prototype     | Required by Track A brief; web application with ML backend + 3D viewer.                                                   | Judge can use the core flow without manual setup gymnastics.                                             |
| Prediction pipeline            | Clean code + model weights for CAD and multi-vessel stenosis.                                                             | Reproducible training/evaluation path and stored artifacts.                                              |
| Clinical explanation dashboard | Metrics, SHAP/LIME and physiological breakdown.                                                                           | Patient-specific explanation, not just generic charts.                                                   |
| Documentation                  | Maximum 6 pages in the Track A brief.                                                                                     | Architecture, preprocessing, validation, 3D pipeline, usage and evaluation are concise and reproducible. |
| Demo video                     | 3-10 minutes in Track A brief; Devpost marks video as required.                                                           | Show actual end-to-end usage and technical implementation, not a slideshow-only pitch.                   |
| Devpost submission             | Public GitHub link is required; live demo link is optional; no website or zip is required by current global Devpost form. | README explains AI-assisted areas, setup, data source, model, assets and limitations.                    |

# 11. High-impact demo sequence for a 3-10 minute video

| **Time**  | **What the judge should see**                                                                | **Why it matters**                                                 |
|-----------|----------------------------------------------------------------------------------------------|--------------------------------------------------------------------|
| 0:00-0:35 | Problem in one sentence + what the system adds beyond a risk percentage.                     | Frames the value proposition and establishes Track A alignment.    |
| 0:35-1:30 | Enter/load a patient and show key physiological values.                                      | Proves the system starts from the supplied clinical feature space. |
| 1:30-2:30 | Run the real model; show overall CAD + LAD/LCX/RCA probabilities.                            | Direct evidence for predictive modeling.                           |
| 2:30-4:15 | 3D viewer animates/updates; rotate, zoom, click a vessel.                                    | Direct evidence for the 25% visualization criterion.               |
| 4:15-5:45 | Selected vessel opens patient-level SHAP/LIME and physiological contribution view.           | Direct evidence for clinical interpretability.                     |
| 5:45-6:40 | Show validation results, baseline comparison and leakage-control check.                      | Builds trust in predictive performance.                            |
| 6:40-7:25 | Architecture and reproducibility: repo structure, API flow, model artifact, 3D asset source. | Supports integration and technical implementation.                 |
| 7:25-8:00 | Safety disclaimer + limitations + what comes next.                                           | Shows responsible framing rather than diagnostic overclaiming.     |

# 12. Research-backed implementation notes

UCI is the primary dataset reference named by the Track A brief. Scikit-learn documentation supports using stratified cross-validation when preserving class proportions is useful, while noting that stratification does not eliminate statistical uncertainty. Its ROC-AUC and precision-recall documentation provides the metric foundations relevant to the required evaluation. SHAP documentation describes SHAP as a game-theoretic approach to explaining model outputs and specifically provides TreeExplainer for tree-based models. \[UCI; scikit-learn; SHAP\]

For anatomy, the Track A brief permits open-source mesh files such as .obj/.gltf. NIH 3D currently hosts downloadable human-heart models, including GLB/STL entries. Verify each asset’s license/attribution terms before shipping it in the repository. \[NIH 3D\]

# 13. Final judge-facing thesis

| **The strongest story:** “We took a small but clinically meaningful tabular dataset, prevented target leakage, built separately evaluated CAD/vessel predictors, exposed the reasoning behind each prediction, and turned those exact outputs into an interactive anatomical experience - without pretending the model knows lesion coordinates it was never trained to see.” |
|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|

That thesis is tightly aligned with the published rubric: performance, visualization, interpretability, integration, and technical implementation each have a visible place in the product. The project should therefore feel like one system rather than five disconnected checkboxes.

# 14. Source register and verification notes

**\[1\] Official Devpost hackathon page -** [<u>multimodal-ai-hackathon-2026-7.devpost.com/</u>](https://multimodal-ai-hackathon-2026-7.devpost.com/)  
Overview, format, tracks, prize pool, judges status, community and official problem-statement link.

**\[2\] Official Devpost rules / live Devpost rules data -** [<u>multimodal-ai-hackathon-2026-7.devpost.com/</u>](https://multimodal-ai-hackathon-2026-7.devpost.com/)  
Eligibility, one-track/one-team rule, dates, AI coding-tool disclosure requirement.

**\[3\] Track A problem statement supplied in this conversation -**  
Exact Track A requirements, deliverables, technical considerations and 30/25/20/15/10 evaluation weighting.

**\[4\] UCI Machine Learning Repository - Extension of Z-Alizadeh Sani Dataset -** [<u>archive.ics.uci.edu/dataset/411/extention%2Bof%2Bz%2B</u>](https://archive.ics.uci.edu/dataset/411/extention%2Bof%2Bz%2B)  
303 patients; 59 features; CAD definition; LAD/LCX/RCA/Cath leakage warning; CC BY 4.0.

**\[5\] SHAP documentation -** [<u>shap.readthedocs.io/en/latest/</u>](https://shap.readthedocs.io/en/latest/)  
Explainability framework and TreeExplainer documentation.

**\[6\] scikit-learn documentation -** [<u>scikit-learn.org/stable/modules/cross_validation.html</u>](https://scikit-learn.org/stable/modules/cross_validation.html)  
Stratified cross-validation guidance; metric documentation used for evaluation recommendations.

**\[7\] React Three Fiber documentation -** [<u>r3f.docs.pmnd.rs/</u>](https://r3f.docs.pmnd.rs/)  
React renderer for three.js and interactive Canvas foundations.

**\[8\] Three.js WebGL documentation -** [<u>threejs.org/docs/pages/WebGL.html</u>](https://threejs.org/docs/pages/WebGL.html)  
Browser WebGL capability checks.

**\[9\] NIH 3D - Human Heart 3D Model -** [<u>3d.nih.gov/entries/22787</u>](https://3d.nih.gov/entries/22787)  
Example open 3D heart resource; verify licensing/attribution before use.
