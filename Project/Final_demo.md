## 1. Psychology rules behind the design

| Principle | What it means for CorTwin |
|---|---|
| First 10 seconds set the impression | Zero clicks to first value. The app opens already populated, and the vessels animate from neutral to their colours. |
| Common fate (things that move together look connected) | Any input change animates the 3D colour, the number, the bar and the SHAP rows together, in the same 400 ms. This is how integration is felt, not just claimed. |
| Hick's law (fewer choices, faster decisions) | The right panel shows one depth at a time, not six stacked sections. |
| Progressive disclosure | Three depths everywhere: glance, then explain, then audit. |
| Direct manipulation | Edit a value where you see it. Click a SHAP row and an edit popover opens right there. |
| Pratfall effect (admitting weakness raises trust) | A reliability tier sits next to every number, including the weak ones. |
| Identity consistency | Each vessel, modality and feature has one name, one position and one glyph everywhere. Colour is reserved for probability only. |
| Calm medical tone | No alarm red, and no words like "diagnose" or "detect". |

---

## 2. Structure: 3 views, 1 shared case

```text
CorTwin
├── EXPLORE   (about 80% of any demo; the flagship workspace)
│   ├── Profile panel (left)
│   ├── 3D Stage (centre) + Evidence Rail docked beneath it
│   └── Inspector (right): Case → Vessel → Feature
│        └── inner sub-nav: Why | Measurements | Evidence
├── TRUST     (proof the numbers deserve belief)
│   └── sub-nav: Performance | Calibration | Decisions | Subgroups | Leakage Audit
└── SYSTEM    (proof it is engineered, and a map for judges)
    └── sub-nav: Requirements | Architecture | Integrity | Model card

Drawers (never tabs): Input Audit · Model Card · Feature popover
```

The key change from the earlier plan is that **the Evidence Ladder is no longer a separate tab.** A separate tab would need a second copy of the 3D scene and would break the one-workspace idea. It also meant the same five modalities had two controls, the form's "not provided" switches and the ladder. They are now one control, the Evidence Rail under the stage.

---

## 3. Global frame (on every screen)

```text
┌────────────────────────────────────────────────────────────────────────────────┐
│ ◉ CorTwin  [Explore] Trust System   Case: Hypothetical·Complete ▾  Tour Export ⓘ Model v0.1 ● local │ 56px
│                                 (view content)                                 │
├────────────────────────────────────────────────────────────────────────────────┤
│ ⚠ Educational decision-support prototype. Not a substitute for diagnostic imaging.   Why? │ 32px
└────────────────────────────────────────────────────────────────────────────────┘
```

- **Case chip** is a dropdown with a badge that is always visible:
  - *Hypothetical · Complete*
  - *Hypothetical · No labs/echo*
  - *Cohort record A, B (in-sample, optimistic)*
  - *Blank profile (shows the cohort average)*
- **Tour** launches the 6-step spotlight tour (section 9).
- **Export** produces a print-styled one-page analysis, which the browser saves as PDF.
- **Model v0.1 ● local** opens the Model Card drawer. The dot confirms that inference runs on-device.
- The **safety banner** is fixed and never dismissible.
- All state lives in the URL (`/explore?case=hypo1&target=LAD&feature=typical_cp&stage=3`). Every screen is therefore a shareable deep link, and tour and "Show me" buttons are trivial to build.

---

## 4. EXPLORE: the flagship screen

### 4.1 First 3 seconds (the reveal)

1. At 0 s a dark scene appears, a neutral heart fades in, and skeleton cards show "Loading model (~400 KB)…".
2. At about 1 s the model is ready and the hypothetical case is already loaded.
3. The three vessels tween from neutral to their probability colours, staggered LAD, LCX, RCA over 600 ms. The numbers count up.
4. A small coach card appears: *"Click a vessel to see why."*
5. **Attract mode:** if the judge does nothing for 8 seconds, the heart rotates slowly and the highest-probability vessel pulses. This stops at the first interaction. A passive judge still sees something alive.

### 4.2 Layout at 1440×900 (numbers are illustrative)

```text
┌ PROFILE 320 ──────────┬ STAGE (flex) ──────────────────────────┬ INSPECTOR 400 ───────────┐
│ Hypothetical case     │ [Overview][LAD][LCX][RCA]   Labels Reset│ CAD probability          │
│ 54 / 54 provided  ⌕   │                                        │ 84%  ABOVE THRESHOLD     │
│                       │        aorta (neutral)                 │ ━━━━━━━━━━━━┃━━━━ 49%    │
│ ▸ History     17/17 ◉ │   LAD 76% ▲                            │ Reliability ●●● Strong   │
│ ▾ Exam & symp 13/13 ◉ │          [ heart ]                     │ ────────────────────     │
│    Typical chest pain │   LCX 31% ▨                            │ Vessels                  │
│    Dyspnea …          │                 RCA 18% △              │ LAD 76% ▲ ●●○        ›   │
│ ▸ ECG          7/7  ◉ │                                        │ LCX 31% ▨ ●○○        ›   │
│ ▸ Labs        14/14 ◉ │ ░▒▓█  ┃ threshold    Whole-vessel      │ RCA 18% △ ●○○        ›   │
│ ▸ Echo         3/3  ◉ │                     probability,       │ ────────────────────     │
│                       │                     not lesion location│ Top reasons (CAD)        │
│ ⊘ LAD LCX RCA Cath    │ ─ EVIDENCE RAIL ───────────────────────│ Exam & symptoms  ▮▮▮ +   │
│   never used as inputs│ ●────●────●────●────●        ▶ Build up ⌃│ Echo             ▮▮  +   │
└───────────────────────┴────────────────────────────────────────┴──────────────────────────┘
```

Symbols are redundant with colour on purpose: ▲ above threshold (solid), △ below (outline), ▨ indeterminate (hatched). Reliability uses dots: ●●● Strong, ●●○ Moderate, ●○○ Limited.

### 4.3 Profile panel (left, 320 px, collapsible)

- **Header:** case name with its badge, a completeness ring ("54 / 54 provided"), a field search box, and a Reset button. Search is the cheapest fix for a 54-field form.
- **Five accordions** (only one open at a time): History 17, Exam & symptoms 13, ECG 7, Labs 14, Echo 3.
  - Each header shows the icon, name, count, a status dot and a mini-switch, **Provided / Not provided**.
  - Switching to Not provided greys the section and runs the model with that modality marginalised.
- **Each field row:**
  - Label, unit and control. The control comes from config: toggle, segmented control, or number with a slider.
  - On sliders, a faint **cohort histogram** sits behind the track with the patient's marker on it. Percentile is visible without reading a number.
  - A small **contribution chip** (+0.31) for the currently selected target. The form doubles as an attribution readout.
  - A sort switch: *Form order | By impact*.
- **Footer:** the lock line "LAD, LCX, RCA, Cath are never inputs", which opens the Input Audit drawer.
- No Run button. The model updates live on every edit.

### 4.4 Stage (centre)

- **Scene:** a neutral pearl-grey heart and aorta, and three data-reactive vessels. Nothing else (no ribs, no lungs). The aorta and left main stay neutral because the model doesn't predict them.
- **Top-left:** a segmented camera control, *Overview | LAD | LCX | RCA*. **Top-right:** *Labels* and *Reset view*.
- **Anchored vessel tags** with leader lines (e.g. "LAD 76% ▲"). The tag outline follows the decision state.
- **Interactions:**
  - Hover shows a tooltip: probability, threshold, "click to explain".
  - Click flies the camera to the vessel (700 ms) and selects it everywhere.
  - Tab and arrow keys cycle LAD, LCX, RCA.
- **Legend (bottom-left):** a gradient with the *selected target's* threshold tick, e.g. "LCX threshold 31%". It updates when selection changes.
- **Permanent chip (bottom-right):** "Colour = whole-vessel probability, not lesion location" (ⓘ).
- **Works with either mesh source.** Only five named objects matter (HEART, AORTA, LAD, LCX, RCA), so BodyParts3D meshes and the procedural-tube fallback behave identically.

### 4.5 Evidence Rail (docked under the stage)

Collapsed (88 px):

```text
EVIDENCE  cumulative information · not a recommended work-up order     ▶ Build up   ⌃
 ●─────────●─────────●─────────●─────────●
 History   + Exam    + ECG     + Labs    + Echo
 LAD 61%     73%       76%       75%       76%     ← this patient, selected target
```

- Clicking a node sets the stage: modalities up to that node are provided and later ones are not provided. The vessels recolour live, and the left accordions switch with them. This is the same marginalisation as the "Not provided" switches.
- **▶ Build up** replays History → Echo over about 8 seconds. It is the only play button in the app.
- Under each node is a **Δ chip** for the selected target ("ECG: LAD +3").
- **Custom subset** is an advanced toggle that frees the individual chips. It shows the warning *"Cohort AUC not validated for custom subsets"*, because validation only exists for the cumulative stages.

Expanded (about 240 px, slides up over the stage's lower part):
- **Left:** this patient's probabilities across the stages for CAD, LAD, LCX and RCA, as four sparklines.
- **Right:** cohort AUC by stage for the selected target, with confidence-interval whiskers.
- **Bottom:** one auto-generated sentence about the node you selected, from templates. For example: *"Adding ECG: LAD +3 points for this patient; cohort AUC LAD +0.02, LCX −0.02. Observed in this dataset; not a cardiology conclusion."*
- Patient-level probabilities and cohort-level AUC are visually separated, with different headings, so they are never confused.

### 4.6 Inspector (right, 400 px)

It is a master-detail panel with a breadcrumb at the top (`Case › LAD › Typical chest pain`) and three depths.

**Depth 0, Case** (nothing selected), as in the wireframe above:
- A CAD headline card with the big number, a decision chip (above, below or indeterminate), and a reliability tier. A tiny note says "CAD shown ≥ strongest vessel", which reflects your coherence rule.
- Three vessel rows. Clicking one goes to Depth 1.
- "Top reasons" for CAD, as five modality bars.

**Depth 1, Vessel** (e.g. LAD):

```text
‹ Case › LAD                                          
LAD  Left anterior descending
76%   ABOVE THRESHOLD        Reliability ●●○ Moderate  [Why this tier →]
━━━━━━━━━━━━━━━━━━━━━┃━━━━━━━   ┃ operating threshold 40%
was 63%  ▲ +13   (ghost tick after an edit)
[ Why ]  [ Measurements ]  [ Evidence ]
──────────────────────────────────────────
"Typical chest pain and EF-TTE push this LAD estimate up; age adds a smaller push."
Cohort average ········································· 58%
Exam & symptoms  ▮▮▮▮▮▮▮  +0.52  ▸
Echo             ▮▮▮▮     +0.30  ▸
History          ▮▮       +0.18  ▸
ECG              ▮        +0.09  ▸
Labs             ▯        −0.04  ▸
Not provided: none
This patient ··········································· 76%
```

- **Why:** a waterfall that starts at the cohort average, adds the five modality contributions, and ends at the patient's probability. Click a modality row and it expands into its features, which reconcile exactly because modality = the sum of its features. Click a feature and you go to Depth 2.
- **Measurements:** the analytical table of value, cohort percentile, contribution, and direction (↑ / ↓). It is sortable, and a row click goes to Depth 2.
- **Evidence:** a miniature Trust page for this target. It shows AUC with its CI, majority baseline vs model accuracy, and the reliability tier with a one-line reason. A link opens the full page: "Open LAD validation →". This is the "Why limited?" path for LCX and RCA.
- **Probability bar:** one tick only, the threshold. The cohort average appears only as the waterfall's starting line. Because thresholds are F1-tuned and sit below the base rate, putting both ticks on the bar would make the average patient read as flagged. A tooltip explains: "Threshold is set to favour catching stenosis over precision."
- When modalities are not provided, they appear as a hatched row, "Not provided: handled by cohort averaging, no attribution".

**Depth 2, Feature** (e.g. Typical chest pain):
- **Value editor** inline, with a cohort distribution and the patient's marker.
- **Contribution to all four targets** as four mini bars. One feature's effect on CAD, LAD, LCX and RCA is visible at once.
- A templated sentence, followed by two fixed caveats: "Model attribution, not causation" and, where relevant, "Weight, Length and BMI share credit".
- **Edit loop:** changing the value fires the sync choreography (4.7). A change line appears: "LAD 76 → 63 · Typical chest pain Yes → No · model response to this input, not a treatment effect".

### 4.7 Sync choreography and linked highlighting

Every change runs one choreography within 100 ms of the edit: 3D colour tween, number count, waterfall reflow (all 400 ms), then a Δ chip for 2.5 s that then settles as the ghost tick.

Hovering any representation of an object highlights all its other representations:

| Object | Appears in |
|---|---|
| **Vessel** | 3D mesh and tag, vessel card, Inspector header, Rail Δ chips, Trust target selector |
| **Modality** | Left accordion, Rail node, waterfall bar, Measurements group |
| **Feature** | Left field row, expanded waterfall row, Measurements row, Feature card |

---

## 5. TRUST view

**Header (persistent):** a target selector (*CAD · LAD · LCX · RCA*, shared with Explore's selected vessel) and a protocol strip: *303 patients · 54 features · nested CV 5×3 outer / 4 inner · no SMOTE · calibration, threshold and abstention fitted inside folds.* Each pane opens with a one-sentence takeaway so a judge can read the page without understanding the chart.

**Sub-nav and panes:**

1. **Performance (default).**
   - One table with the five required metrics (Accuracy, Precision, Recall, F1, ROC-AUC with CI) for all four targets.
   - Next to it, the majority-class baseline and the reliability tier.
   - Below that are ROC curves, and a small-multiples comparison of LR, RF, XGB and ours, captioned *"additive models cost ≤0.02 AUC and buy exact SHAP."*
   - A collapsed "Disclosures" box holds the a-priori hyperparameters, architecture chosen after looking at CV, and no external validation.
2. **Calibration.** Reliability diagram, raw vs Platt, with Brier next to base-rate Brier and ECE. Takeaway: *"LCX and RCA barely beat the base rate."*
3. **Decisions.**
   - A threshold control showing the precision/recall trade-off and the F1-tuned point.
   - An abstention curve of coverage vs accuracy.
   - A marker showing where the *current case* sits relative to the threshold and the abstention band, linking back to Explore.
4. **Subgroups.** Grouped bars for age <60 / ≥60 and for sex, with n shown and a "wide uncertainty" note. Headline: *weaker for ≥60.*
5. **Leakage Audit** (the memorable one).
   - Horizontal bars per pipeline: honest, SMOTE before CV, plus feature selection before CV, and vessel labels left in the features.
   - Next to them, a histogram of the 30 random 80/20 splits, accuracy 0.80–0.95, captioned *"pick your seed, get 95%."*
   - A list of excluded columns: LAD, LCX, RCA, Cath, and the constant Exertional CP.
   - These bars come from a **random-forest probe model**, so label them "probe model, not the deployed model", with the deployed model's own number on a separate row. Otherwise 0.923 here vs 0.94 on Performance looks like a contradiction.

---

## 6. SYSTEM view

1. **Requirements (default).** A table with the Track A requirement, where it is satisfied, and a **Show me** button that deep-links into the right app state (e.g. "dynamic vessel colour" opens Explore with LAD selected). It doubles as the judge's checklist.
2. **Architecture.** A clickable pipeline: Python train → `model.json` → Web Worker → state store → Three.js. Each node shows its file, its test and its size. A short note shows that adding a feature or vessel is a config edit (`features.json`, `targets.json`, registry).
3. **Integrity.** A **"Run parity check" button** that executes the golden fixtures in the browser and shows Python vs JS maximum difference against the 1e-5 tolerance. It also lists the leakage guard, registry test and fixed seeds. Live self-tests are persuasive, but only if they genuinely run the JS port.
4. **Model card.** Dataset provenance, the BodyParts3D CC-BY-SA attribution, AI-use disclosure and limitations. The same content opens as the header drawer.

---

## 7. Drawers, states and responsive behaviour

- **Input Audit drawer:** counts per modality, the "never used" list and the cohort ranges.
- **Empty or blank case:** shows the cohort-average prediction, since nothing is provided. The banner says "No patient information, showing the cohort average."
- **Out-of-range values:** a soft warning ("outside cohort range 30–86"), never a block.
- **WebGL unavailable:** a 2D SVG schematic of the three vessels from the same registry, so correspondence still holds.
- **Worker failure:** falls back to the `/predict` API with a visible notice.
- **Model load failure:** a retry banner.
- **Responsive:**
  - At ≥1280 px, three zones.
  - At 768–1279 px, the Profile becomes a drawer and the Inspector a bottom sheet under the stage.
  - Below 768 px, the stage is on top (about 40vh), the Inspector is a bottom sheet with three snap heights, and the view tabs move to a bottom bar.
- **Accessibility:**
  - Probability changes are announced via aria-live.
  - Reduced-motion disables tweens and rotation.
  - Nothing relies on colour alone.

---

## 8. Visual and copy system

- **Chrome:** graphite background, off-white text, one teal accent used only for selection and interactivity, and tabular numerals for every number.
- **Data ramp:** a cividis-style sequential ramp where **luminance rises with probability**. On a dark scene, a blue-to-indigo ramp turns the highest-risk vessel into the darkest, least visible one. Chrome and data colours never mix.
- **Motion:** 400 ms ease-out for data, 700 ms for camera flights.
- **Words to use:** probability (not "risk"), "≥50% stenosis under the cohort label", "model attribution" (not "cause"), "not provided" (not "missing"), "indeterminate".
- **Words never used:** diagnose, detect, recommend, treatment impact.

---

## 9. The judge's 90-second path (also the 6-step tour)

1. **Reveal.** The vessels light up. *"54 clinical features → four probabilities."*
2. **Click LAD.** The camera flies in, and the Inspector, waterfall and Measurements all switch to LAD.
3. **Click the top contributor.** Its field highlights, and the edit popover opens. Change it and watch the 3D vessel, number, bar and waterfall move together.
4. **Scrub the Evidence Rail.** The vessels recolour per modality, and one real finding appears (ECG adds nothing for LCX here).
5. **RCA → "Why limited?"** This lands on Trust with the honest numbers (AUC 0.73, accuracy barely above baseline).
6. **Leakage Audit.** *"Why our numbers are lower than inflated ones."*

| Rubric item | Where a judge sees proof |
|---|---|
| Prediction, 30% | Trust → Performance table, Calibration, Leakage Audit |
| 3D, 25% | Stage: tags, camera flights, hatch for indeterminate, target-aware legend |
| Interpretability, 20% | Waterfall, Measurements table, three-depth drill-down |
| Integration, 15% | Edit → synchronous update; Rail; System → Run parity check |
| Technical, 10% | System → Architecture, Integrity, Requirements |

---

## 10. Stress-test loop (what broke and what I changed)

| Test | What broke | Fix |
|---|---|---|
| Duplication | A separate Evidence tab duplicated the scene and gave modalities two controls | Docked Rail, one control for toggles and ladder |
| Panel overload | The right panel stacked 5+ sections | Depth-based Inspector with Why / Measurements / Evidence |
| Dark-scene visibility | Blue-to-indigo ramp hides the highest-risk vessel | Luminance-rising cividis-style ramp |
| Number consistency | Leakage panel 0.923 (RF) vs headline 0.94 | Probe model labelled; deployed-model row added |
| Cold start | A "Load case" button means an empty first impression | Auto-load plus reveal animation |
| Passive judge | Judge never clicks | Attract mode |
| Threshold semantics | Threshold below base rate makes the average patient "flagged" | One tick on the bar, tooltip, cohort average only in the waterfall |
| Identity vs value | Colour needed for both | Identity by label and position; colour for probability only |
| What-if confusion | Edit field vs your retracted what-if sliders | Edit = correcting the record; wording "model response", never "treatment effect" |
| Ladder validity | Free subsets have no validated AUC | Cumulative by default; custom subsets flagged |
| 1366×768 | Three zones plus rail plus banner | Profile collapses; stage stays about 600 px |
| Failure paths | WebGL or worker failure | 2D schematic and API fallbacks |

I stopped after three passes, once the remaining issues were only polish.

---

## 11. Build order and open items

- **P0:** Explore core (Profile, Stage, Inspector depths 0 and 1, auto-load, sync choreography), Trust → Performance table (required metrics), and the safety banner.
- **P1:** Evidence Rail, Depth 2 with the edit popover, Leakage Audit, Calibration, deep-link state, indeterminate hatching, Input Audit.
- **P2:** Decisions, Subgroups, System → live parity button, the tour, Export, responsive polish.
- **Carried open items:**
  - The unit test for attribution over observed features only.
  - The Oct 4 mesh gate.
  - Dataset units.
  - Camera-caption review by a cardiologist.
  - Every on-screen number must come from `results.json` or live inference. The numbers in my wireframes are illustrative.
