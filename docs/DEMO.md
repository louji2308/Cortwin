# CorTwin — Demo Script and Video Plan

**Every element in this file is `planned`.** No scene has been recorded, no application build exists
yet (see `docs/STATUS.md`). Nothing here may be described to a judge as accomplished.

---

## 1. Official submission requirements (quoted, with source section)

| Deliverable | Exact requirement (verbatim) | Source |
|---|---|---|
| Project document | "Maximum 6 pages in the Track A brief." | `Project/Hackathon.md` §10, Documentation row |
| Demo video | "3-10 minutes in Track A brief; Devpost marks video as required." | `Project/Hackathon.md` §10, Demo video row |
| Public repository | "Public GitHub link is required; live demo link is optional; no website or zip is required by current global Devpost form." | `Project/Hackathon.md` §10, Devpost submission row |
| README duties | "README explains AI-assisted areas, setup, data source, model, assets and limitations." | `Project/Hackathon.md` §10, Devpost submission row |
| Video quality bar | "Show actual end-to-end usage and technical implementation, not a slideshow-only pitch." | `Project/Hackathon.md` §10, Demo video row |
| Working prototype | "Required by Track A brief; web application with ML backend + 3D viewer." | `Project/Hackathon.md` §10 |
| Pipeline + weights | "Clean code + model weights for CAD and multi-vessel stenosis." | `Project/Hackathon.md` §10 |
| Explanation dashboard | "Metrics, SHAP/LIME and physiological breakdown." | `Project/Hackathon.md` §10 |
| AI disclosure | "Disclose all AI coding assistants used … require disclosure in Built With and in the README, including which parts were AI-assisted." | `Project/Hackathon.md` §5.E |
| Safety statement | "Clear, visible statement that predictions are decision-support/educational and not a substitute for formal diagnostic imaging." | `Project/Hackathon.md` §3 |
| Deadline | "Devpost submission deadline \| 15 Oct 2026 at 12:15 AM IST (14 Oct 2026, 18:45 UTC)." Development window: "30 Sep 2026 to 14 Oct 2026 EOD." | `Project/Hackathon.md` §1 |
| Full checklist | Devpost Track A submission in the evening of Oct 14 IST; public repo with pipeline, model weights (`model.json`), tests and README; live URL through Oct 21; 3–10 minute YouTube video; document of at most 6 pages; AI tools in Built With + README AI-assisted areas; visible safety disclaimer in the UI; check Discord for submission-form details | `Project/Tech_Stack & Product Requirements.md` §22 |

Operational target: submit the **evening of 14 Oct 2026 IST**, not at the 00:15 deadline
(`Project/Implementation_Plan.md` P9 step 13; `Project/Idea.md` §12).

---

## 2. Golden path the demo must follow (source of truth)

The in-app judge path, from `Project/Final_demo.md` §9 ("The judge's 90-second path (also the
6-step tour)"):

1. **Reveal.** The vessels light up. "54 clinical features → four probabilities."
2. **Click LAD.** The camera flies in, and the Inspector, waterfall and Measurements all switch to LAD.
3. **Click the top contributor.** Its field highlights, and the edit popover opens. Change it and watch
   the 3D vessel, number, bar and waterfall move together.
4. **Scrub the Evidence Rail.** The vessels recolour per modality, and one real finding appears
   (ECG adds nothing for LCX here).
5. **RCA → "Why limited?"** This lands on Trust with the honest numbers.
6. **Leakage Audit.** "Why our numbers are lower than inflated ones."

The submission smoke repeats the same path end to end
(`Project/Implementation_Plan.md` P9, "End-to-End Test"): Reveal → select LAD → inspect
Why/Measurements → edit top contributor → synchronous model response → Evidence Rail → choose RCA →
"Why limited?" → Trust evidence → Leakage Audit → System Integrity.

Rubric mapping of that path (`Project/Final_demo.md` §9):

| Rubric item | Where a judge sees proof |
|---|---|
| Prediction, 30% | Trust → Performance table, Calibration, Leakage Audit |
| 3D, 25% | Stage: tags, camera flights, hatched indeterminate state, target-aware legend |
| Interpretability, 20% | Waterfall, Measurements table, three-depth drill-down |
| Integration, 15% | Edit → synchronous update; Evidence Rail; System → Run parity check |
| Technical, 10% | System → Architecture, Integrity, Requirements |

---

## 3. Video plan — scene-by-scene skeleton (`planned`)

Official duration window: **3–10 minutes** (Hackathon §10). Planned target length ≈ 6:30, following
the outline in `Project/Idea.md` §12; the official time bands in `Project/Hackathon.md` §11 are the
fallback structure. **Target length is a plan, not a measurement.**

| # | Scene | Planned duration | Content — what the judge must see | Rubric served | Source | State |
|---|---|---|---|---|---|---|
| S1 | Hook and positioning | 0:00–0:35 (≈0:30) | One-sentence problem statement and what the system adds beyond a bare percentage; safety framing appears immediately | framing | Hackathon §11 row 1; Idea §12 item 1 | `planned` |
| S2 | Input workflow | 0:35–1:30 (≈1:00) | Enter/load a patient, show key physiological values across the five evidence groups; per-modality "not provided" behaviour | Integration | Hackathon §11 row 2; Final_demo §4.3, §4.5 | `planned` |
| S3 | Real model run | 1:30–2:30 (≈1:00) | Run the real inference; overall CAD + LAD/LCX/RCA probabilities with threshold, decision state and reliability tier | Predictive Performance | Hackathon §11 row 3 | `planned` |
| S4 | 3D interactions | 2:30–4:15 (≈1:00) | Vessels colour from live probability; rotate, zoom, click a vessel; camera presets; legend with threshold tick; chip "colour = whole-vessel probability" | 3D Visualization | Hackathon §11 row 4; Final_demo §4.4 | `planned` |
| S5 | Explanations | 4:15–5:45 (≈1:00) | Selected vessel opens patient-level SHAP waterfall and the measurements table (value, percentile, contribution, direction); caveats visible | Clinical Interpretability | Hackathon §11 row 5; Final_demo §4.6 | `planned` |
| S6 | Validation and leakage control | 5:45–6:40 (≈1:15) | Trust → Performance table with CIs, calibration, baselines, then Leakage Audit; labels every number as read from `results.json` | Predictive Performance | Hackathon §11 row 6; Final_demo §5 | `planned` |
| S7 | Architecture and reproducibility | 6:40–7:25 (≈1:00) | Repo structure, `make reproduce`, parity check (System → Run parity check), model artefact, 3D asset source + licence, empty Network tab (no third-party requests) | Technical + Integration | Hackathon §11 row 7; Final_demo §6 | `planned` |
| S8 | Limitations, disclaimer, AI-use disclosure | 7:25–8:00 (≈0:45) | Safety banner verbatim, cohort/no-external-validation limits, attribution ≠ causation, AI-use disclosure pointer | Safety + compliance | Hackathon §11 row 8; Idea §12 item 7 | `planned` |

**Rules for recording (`planned`):**

- Record from `npm run preview` (the local production build), on the weakest available laptop, with
  Wi-Fi off at least once — `Project/Tech_Stack & Product Requirements.md` §21.
- Everything in the risk path must be real: "predictions, SHAP, calibration and leakage numbers …
  are never faked" (Tech_Stack §21).
- Any accelerated configuration change shown on camera must be explicitly labelled a presentation cut
  (`Project/Implementation_Plan.md` P9 step 7).
- Upload early (YouTube processing delay), keep a local MP4, verify playback while logged out
  (Tech_Stack §16).
- Duration must land inside 3–10 minutes; the document inside 6 pages — both checked against
  `Project/Hackathon.md` §10 before submission.

---

## 4. Six-page document outline (`planned`)

Content plan from `Project/Idea.md` §12, verified against the P9 checklist
(`Project/Implementation_Plan.md` P9 step 3):

| Page | Content |
|---|---|
| 1 | Overview and requirement coverage |
| 2 | Data and preprocessing |
| 3 | Model and validation protocol |
| 4 | Results, calibration, subgroups and leakage audit |
| 5 | Explanations and the 3D pipeline |
| 6 | Architecture, usage, limitations and disclosures |

Constraint: "Maximum 6 pages in the Track A brief" (Hackathon §10). Every figure must be regenerated
from `results.json` at documentation time — "never manually 'fix' a number in prose"
(Implementation_Plan P9 risk). **No page can be written until the model and validation exist.**

---

## 5. Recording checklist (`planned`)

Pre-recording:

- [ ] `npm run build && npm run preview` succeeds offline (Tech_Stack §18)
- [ ] Default case auto-loads; vessels colour without clicks (Final_demo §4.1)
- [ ] Safety banner visible on every route, non-dismissible (Contracts §31.1)
- [ ] Vessel click → camera flight → Inspector, waterfall and Measurements all switch (Final_demo §9)
- [ ] Edit a top contributor → 3D colour, number, bar and waterfall update together (Final_demo §4.7)
- [ ] Evidence Rail scrub recolours vessels (Final_demo §4.5)
- [ ] Trust → Performance/Calibration/Leakage Audit render from `results.json` (Final_demo §5)
- [ ] System → Run parity check executes and shows the difference against the 1e-5 tolerance (Final_demo §6.3)
- [ ] DevTools Network tab shows no third-party requests (Tech_Stack §12)
- [ ] Numbers on screen traced to `results.json` or live inference — no literal in source (INV-04/INV-C17)
- [ ] Copy lint clean (VC-11) before recording, so no prohibited wording appears on camera
- [ ] Throttled-CPU pass (4×) still usable; 1366×768 usable (Final_demo §10)

During recording:

- [ ] Follow the golden path of §2 in order
- [ ] Say "probability" and "model attribution"; never the prohibited vocabulary of C-13 §27.5
- [ ] State the disclaimer aloud in S8, matching the banner text verbatim
- [ ] State AI-use disclosure in S8 and point to `docs/AI_USE.md`

Post-recording:

- [ ] Duration within 3–10 minutes
- [ ] Playback verified while logged out, from a fresh browser
- [ ] Local MP4 retained
- [ ] Video shows the same release candidate as the documentation (Implementation_Plan P9)
- [ ] Live URL and mirror smoke-tested from a fresh browser (VC-15)
- [ ] Submission made in the evening of 14 Oct 2026 IST; confirmation recorded

---

## 6. Demo integrity rules (must not be broken)

From `Project/Contracts.md` §44 (Demo Integrity Contract) and Tech_Stack §21:

- No hardcoded demo results; the UI change must come from the real inference path.
- No generative model in the risk path; narrative text is template-based (INV-C25).
- Failure paths must be designed, not hidden: WebGL failure → 2D schematic; worker failure →
  main-thread fallback with a visible notice (Contracts §36).
- Nothing on camera may present an architectural target as a measured value (INV-C28, C-16 §30.2).
