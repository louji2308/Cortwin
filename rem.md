# Plan: Documentation completion batch (README · 6-page document · AI_USE · MIT LICENSE)

## 0. Context verified this session (read-only)

- **Repo state:** all local gates green today (pytest **205** · vitest **1263/1263** · Playwright **41/41** · `tsc` 0 · ruff clean · dist verify PASS). 3 commits **unpushed**; origin CI last run red at `69663bf` (2 e2e reds, fixed locally). Live URL `https://louji2308.github.io/Cortwin/` returns HTTP 200 but serves the stale 2026-10-08 build (Pages enabled; `deploy.yml` is `workflow_dispatch`-only).
- **Live numbers extracted from `web/public/results.json`** (sha `801e9e1e…`, modelId `71406e35…` — root `results.json` is byte-identical): full per-target metrics, CIs, confusion, component AUCs, calibration (Brier/ECE raw+Platt), abstention sweeps, reliability tiers (CAD strong · LAD moderate · LCX/RCA limited), 16 subgroups, leakage probes, global SHAP meta (N=101, seed 411, margin scale). Full table in §4 below.
- **Critical defect found:** `docs/MODEL_CARD.md` §4 metrics are **stale** — dated 2026-10-08, but `results.json` was regenerated 2026-10-12 (D-40). Accuracy/F1/precision/recall/fold-SD/CI-bounds all differ (e.g. CAD accuracy 0.8911 printed vs 0.8878 live; RCA accuracy 0.7294 vs 0.6337). ROC-AUCs happen to match; everything else drifted. **This batch fixes it.**
- **User directives locked in:** MIT licence for the repo's own source (human decision, recorded as **D-48**); deliverables = README + 6-page document + AI_USE.md (+ LICENSE, + MODEL_CARD refresh); deep structured report on completion.
- **Constraints every unit inherits:** C-13 copy law (blocking `copyLint` scans `README.md` + `docs/**` — banned words only allowed with a `c13-allow:` pragma on the same line, MODEL_CARD §1 already shows the pattern); INV-04/P-5 (no typed metrics — numbers only from `results.json`/`perf-report.md`/live commands); AG-12 (generated artifacts never hand-edited — `results.json` has a benign em-dash that console-codepage ate in my probe, not a real mojibake, no action); UTF-8 only, no cp1252 smart quotes (the G10 mojibake class); C-CONF-06 (do not claim Evidence Rail Δ/sparkline); perf wording must quote the honest `perf-report §2.3` sentence, never "≥30 fps" as measured fact. The uncommitted D-44/D-46 stage delta (`web/src/stage`, `web/src/scene`) is **untouched** by this batch.

## 1. Batch topology — 3 parallel subagents + orchestrator side-work

Non-overlapping files, all interfaces already frozen (docs have no producer contracts):

| Unit | Owns (writes) | Does NOT touch |
|---|---|---|
| **D1 — README** | `README.md` (full rewrite) | everything else |
| **D2 — AI_USE** | `docs/AI_USE.md` (restructure + refresh) | everything else |
| **D3 — 6-page doc** | NEW `docs/project_document_6page.md`, NEW `tools/docs/render_6page.mjs`, NEW generated `docs/project_document_6page.pdf` | everything else |
| **Orchestrator (me)** | `LICENSE` (MIT), `docs/MODEL_CARD.md` §4 refresh, `docs/DEMO.md` §4 one-line status flip after D3 lands, `Progress.md` (claims, D-48/D-49, completion reports) | the three unit files above |

Rationale for orchestrator-side LICENSE/MODEL_CARD: trivial/mechanical, avoids a fourth dispatch, and MODEL_CARD's stale numbers are a **blocking documentation-integrity issue** (a judge comparing the card to Trust → Performance would see drift) that should not wait on subagent turnaround.

## 2. Unit specs (elite prompts — condensed here, full text at dispatch)

Every prompt: AGENTS.md §5.3 template, grandmaster framing ("you are the docs team's senior technical writer + research lead; the judge reads your prose as the project's face"), explicit read-list (`AGENTS.md` §7 copy law, `Project/Hackathon.md` §3–§10, `Project/Final_demo.md` §8, `Project/Contracts.md` §31 + C-13, `Progress.md` §0/§4, plus source files), self-question ritual (§11), and the mandated completion report.

**D1 — README (the project's front door).**
Structure (agreed arrangement):
1. Title + one-line tagline → 2. Hero paragraph (3 sentences: what / for whom / why it's different) → 3. **Safety disclaimer verbatim, visually prominent** → 4. Live demo + video + repo links → 5. Why CorTwin — 5 differentiator bullets (leakage-safe by construction · calibrated with honest tiers · exact SHAP at 1e-5 parity · one coherent loop profile→worker→3D→explanation · zero data leaves the browser) → 6. How it works (one compact flow line) → 7. **Model at a glance** (6-row live-numbers table from §4, with tier column) → 8. Quick start → 9. What's inside (compact tree) → 10. Verification & reproducibility (test counts dated 2026-10-13, `make reproduce`, parity) → 11. Performance (one honest line per budget, sourced from `perf-report.md`) → 12. AI use (short + link) → 13. Licence & attribution (MIT + CC BY 4.0 + both BodyParts3D credit strings verbatim) → 14. Documentation map → 15. Limitations (brief, honest). Wording bar: calm medical-instrument register (Final_demo §8), active voice, strong verbs, concrete nouns; no hype adjectives, no banned vocabulary without pragma. Truth-pass on stale rows: Live URL row becomes real (URL + "deployed by GitHub Actions from `main`; re-trigger the workflow after each push"); Git/CI row states local-chain-green evidence, drops the false green-run-ID claim; Licence table flips repo code to MIT.
**Verify:** `npx vitest run src/copy` green; grep for U+FFFD; cross-check every number against §4 table.

**D2 — AI_USE.md (the required disclosure, properly structured).**
Renumber into clean sections: §1 Why this exists (keep official quotes) → §2 **AI tools used** (evidence-backed list from `Progress.md`/`AGENTS.md`: OpenCode CLI autonomous agent sessions, model `opencode/mimo-v2.6-flash-free`, role taxonomy B0-4/orchestrator/etc.; personal assistants like ChatGPT/Cursor stay as explicit HUMAN confirmations — **never invented**) → §3 AI-assisted areas (refresh: 205/1263/41 counts, dates 2026-10-13, add the P9 docs batch itself) → §4 Human-authored inputs (keep) → §5 Verification applied (refresh, add copy-law + number-sourcing checks) → §6 **HUMAN TO COMPLETE** (keep all 8 checkboxes, tighten wording, add copyright-holder name for the MIT LICENSE line) → §7 What must never happen (keep). Fix the current numbering gap (unnumbered human block between §4 and §6).
**Verify:** same copy/UTF-8 checks; every claim in §3/§5 traceable to a `Progress.md` work-log entry.

**D3 — Six-page document (the judged artifact).**
- **Format decision (D-49):** single source of truth = `docs/project_document_6page.md` (repo-readable, diffable); PDF generated by `tools/docs/render_6page.mjs` using the already-installed Playwright Chromium (`page.pdf`, print CSS with `@page { size: A4; margin: 14mm }` + explicit page-break divs) → `docs/project_document_6page.pdf`. No pandoc/typst dependency; regeneration is `node tools/docs/render_6page.mjs`. **6 pages exactly**, verified by parsing the PDF page tree.
- **Content map** (from DEMO §4 + Idea §12): P1 Overview + requirement-coverage table (rubric → where proven) · P2 Data & preprocessing (303×59, 54 features, forbidden set, modality groups, checksums, CAD-label quirk 302/303) · P3 Model & protocol (ensemble, nested CV 5×3/4, seeds, Platt, thresholds, abstention rule) · P4 Results/calibration/subgroups/leakage (full live tables, honest limited tiers for LCX/RCA, component ablation incl. the LCX xgb-only > ensemble finding, abstention sweep, RF probe) · P5 Explanations & 3D (exact SHAP, parity 1e-5, efficiency 1e-6, mesh provenance + budgets + honest perf sentence) · P6 Architecture, usage, limitations, disclosures (privacy, no-backend, AI disclosure, MIT + asset licences, safety disclaimer, "attribution ≠ causation").
- **Number discipline:** subagent extracts every figure with the §5 python/jq commands itself and treats my §4 table as a cross-check mismatch detector — divergence = stop and report, never average.
**Verify:** copy lint green · UTF-8 clean · PDF exists, page count = 6 · spot-audit 10 numbers against `results.json`.

## 3. Orchestrator side-work (while subagents run)

1. Write root `LICENSE` — standard MIT text, `Copyright (c) 2026 CorTwin contributors` (placeholder flagged in AI_USE §6 for the human's legal name).
2. Refresh `docs/MODEL_CARD.md` §4 from the live `results.json` numbers (same source keys already cited in the card; add confusion + componentAuc + reliability tiers while there; bump the card's Date to 2026-10-13; add a "numbers regenerated from `results.json` sha `801e9e1e…`" provenance line).
3. After D3 lands: flip `docs/DEMO.md` §4 heading from `planned` to `delivered` with a pointer to the new file.
4. `Progress.md`: pre-dispatch claims for all five areas; log **D-48** (MIT, human-directed) and **D-49** (6-page format: markdown master + Chromium PDF); completion reports per §9.2; §0 snapshot refresh.

## 4. Live-number appendix (verified this session — embedded in all three prompts)

```
protocol: 303 patients · 54 features · outer 5×3 · inner 4 · seed 411 ·
  stratification joint LAD/LCX/RCA 8-pattern · no SMOTE ·
  calibration/threshold/abstention/preprocessing inside fold ·
  CI = 95% percentile bootstrap, 10000 resamples
CAD: acc .8878 · AUC .9362 [.905,.963] · F1 .9231 · P .9027 · R .9444 ·
  baseline .7129 · fold .9379±.0268 · conf tp204/fp22/fn12/tn65 ·
  compAuc lr .9327 / xgb .9225 · calib brier .0890→.0877, ece .0623→.0465 ·
  abstain 0/20/40/60% → acc .8878/.9259/.9725/.9836 @ cov 1.0/.802/.601/.403 · TIER strong
LAD: acc .8020 · AUC .8472 [.802,.890] · F1 .8446 · P .7799 · R .9209 ·
  baseline .5842 · fold .8464±.0285 · conf 163/46/14/80 · lr .8306/xgb .8474 ·
  brier .1529→.1536, ece .0655→.0692 · TIER moderate
LCX: acc .6733 · AUC .7118 [.653,.769] · F1 .6426 · P .5633 · R .7479 ·
  baseline .6073 · fold .7151±.0597 · conf 89/69/30/115 · lr .6667/xgb .7464 ·
  brier .2113→.2099, ece .0581→.0625 · TIER limited (ensemble < xgb-only: honest ablation)
RCA: acc .6337 · AUC .7541 [.697,.807] · F1 .6476 · P .5075 · R .8947 ·
  baseline .6238 · fold .7542±.0585 · conf 102/99/12/90 · lr .7556/xgb .7294 ·
  brier .1910→.1940, ece .0508→.0482 · TIER limited
subgroups (16): CAD age<60 n162 AUC .949 [.915,.977] · age≥60 n141 AUC .862 [.766,.940]
leakage: excluded {LAD,LCX,RCA,Cath,Exertional CP}; honest RF inside-fold probe CAD AUC .9213 (quarantined)
global SHAP: mean|SHAP|, N=101/303 sampled seed 411, margin scale, background 60 rows seed 7411;
  CAD top-3: Typical Chest Pain .8763 · Age .4389 · Region RWMA .3549
ids: modelId 71406e35… · results sha 801e9e1e… · model.json sha 6c305a6c… · data sha b60472ec…
tests 2026-10-13: pytest 205 · vitest 1263 (83 files) · e2e 41/41 · tsc 0 · dist PASS
perf (measured, perf-report §2/§3): rotation p50 16.7 ms ≈60 fps @4× AMD iGPU ·
  scripted window-mean 13.9–14.8 fps · B-01 p95 4.3/28.4/85.7 ms · evaluate p95 0.3 ms ·
  explain p95 3.2 ms · idle 0 frames · 5 draws / 77,824 tris / 0 textures ·
  critical path 2.02 MB · structure 1.41 MB · first colour 2,657.9 ms @4× · heap 18.1 MB
```

## 5. Final verification chain (after all units integrate)

1. `npx vitest run src/copy` (C-13 over README + all docs — blocking).
2. `npx vitest run` full (1263+ must stay green; docs tests pin TRACEABILITY which we don't touch).
3. UTF-8/mojibake grep (U+FFFD + smart-quote sweep across README + docs).
4. **Cross-document number audit** — one python script diffing every numeric claim in README/MODEL_CARD/6-page against `results.json`/`perf-report.md` (the drift class that just bit MODEL_CARD must not survive this batch).
5. `node tools/docs/render_6page.mjs` → assert PDF page count = 6.
6. `Progress.md` §9.2 completion report + §0 snapshot.

## 6. Explicitly out of scope (unchanged)

Video recording (human) · push/deploy re-trigger (human-owned per D-06) · HD-07 mesh-licence ruling (MIT covers **source code only**; both BodyParts3D credit strings stay verbatim) · HD-08 Discord check · AI_USE §6 human checklist (cannot be auto-filled) · the uncommitted stage/scene D-44/D-46 delta · any `Project/**` edit.

---

Two tiny placeholders the human will fill later (both will be flagged in AI_USE §6 and my final report): MIT copyright-holder legal name (defaults to "CorTwin contributors"), and the personal AI-assistant list if any were used outside these agent sessions.
