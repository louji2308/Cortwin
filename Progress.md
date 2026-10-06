# CorTwin — Progress

> Single coordination surface for all parallel sessions. Append; never rewrite history.
> Read `AGENTS.md` §10 before editing. Newest entries go at the TOP of each section.

## 0. Snapshot

- **Updated:** 2026-10-06 11:45 (session SES-ORCH-02 — **G7 PASS**; batch **P8 opened: PERF ∥ A11Y ∥ DEGRADE ∥ DEPLOY-PREP**)
- **Current phase:** **P7 COMPLETE (G7 PASS)** — gates G0–G7 PASS (G1b conditional HD-07)
- **Overall progress:** 80% — Evidence Rail mounted + real integrity display + Trust artifact-backing all proven; remaining: P8 hardening/perf/failure-path verification (G8) + deploy (G9, **live URL due Oct 7–9 — URGENT**), P9 docs+video (G10)
- **Build health (orchestrator-run 2026-10-06 11:2x, independent of agents):** `npx tsc` exit **0** · `npm test` → **1087 passed (74 files)** · `npm run build` ✓ + `node src/manifest/verify-dist-inline.mjs` → **ALL CHECKS PASS** · **`npm run test:e2e` → 11 passed (44.0s)** incl. golden journey + rail step 9b (banner stops=8, consoleErrors=0, evidenceRailMounted=2) · pytest/ruff unchanged since G4 (203)
- **Live URL:** none — P8-DEPLOY-PREP now; **deploy must land Oct 7–9**
- **Next dated deadline:** Oct 7–9 live URL — **next gate: G8 (release candidate)** · HD-07 open (non-blocking)
- **ACTIVE SESSIONS**

| Session | Area | Files | Status | Updated |
|---|---|---|---|---|
| P8-PERF | Performance measurement harness (batch P8) | NEW perf harness files + **additive-only** stats hook in `web/src/stage/**` if needed | **active — dispatched 2026-10-06 11:45** | 2026-10-06 |
| P8-A11Y | Accessibility + responsive sweep (batch P8) | NEW `web/e2e/a11y.spec.ts` + `web/playwright.config.ts` (browser matrix) + shell/explore CSS + additive aria/focus attrs only | **active — dispatched 2026-10-06 11:45** | 2026-10-06 |
| P8-DEGRADE | Failure-path verification (batch P8) | NEW `web/e2e/degraded.spec.ts` + targeted fixes in `web/src/{worker,boot,store,stage,scene}/**` if defects found (justify each) | **active — dispatched 2026-10-06 11:45** | 2026-10-06 |
| P8-DEPLOY | CI/deploy config + offline smoke (batch P8) | `.github/workflows/**`, `web/vite.config.ts` (base only), `web/package.json` (scripts), NEW `web/e2e/offline.spec.ts` — **NO git push, NO network deploy** | **active — dispatched 2026-10-06 11:45** | 2026-10-06 |
| P7-RAIL | Evidence Rail mount (batch P7) | `web/src/explore/**`, `web/e2e/golden.spec.ts` | **released 2026-10-06 10:50 — PASS** (resume: verification-only; 1087/1087, e2e 2/2 w/ 9b, 2 mutations; predecessor's code completed 00:35) | 2026-10-06 |
| P7-INTEGRITY | Real integrity + parity-run pane (batch P7) | `web/src/system/**`, `web/src/shell/{paneData.ts,paneData.test.tsx,ShellApp.tsx,shellIntegrity.test.tsx,bootLifecycle.ts}` | **released 2026-10-06 11:20 — PASS** (resume: tsc fix + build✓ + inline PASS + e2e 2/2 + 2 mutations; predecessor completed code 00:29) | 2026-10-06 |
| P7-TRUST-DATA | Trust artifact-backing + P1 interactions | `web/src/validation/**` | **released 2026-10-06 10:45 — PASS** (its one tsc leftover fixed by orchestrator; CONDITIONAL→PASS) | 2026-10-06 |
| P6-E2E | Golden-path e2e (batch G6) | `web/e2e/golden.spec.ts` | **released 2026-10-05 22:25 — PASS (G6)** (golden.spec 545 + helpers 253; orchestrator support.ts fix; full e2e 11/11) | 2026-10-05 |
| SES-ORCH-03 | **P6/P7/P8 preparation session** (batch P68) | as per its row below | **released 2026-10-04 — batch P68 PASS (§3 11:20)** | 2026-10-04 |
| SES-ORCH-02 | Lead orchestrator — batch/gate control | `Progress.md` (sole writer of §0/§1/§4–§11), batch/gate decisions, env/toolchain (`.venv`), `.gitignore`, `requirements.lock.txt` | active | 2026-10-06 |
| P6-SHELL | P6 shell/router/boot/banner (batch P6) | `web/src/App.tsx`, `web/src/shell/**` | **released 2026-10-05 22:00 — PASS** (44 tests, full 1016/1016; six attempts, R6 finished) | 2026-10-05 |
| P6-EXPLORE | P6 Explore workspace (batch P6) | `web/src/explore/**` | **released 2026-10-05 20:00 — PASS** (42 tests, 4 mutations; cancelled twice) | 2026-10-05 |
| P6-INSPECTOR | P6 Inspector/Why/Measurements (batch P6) | `web/src/panels/inspector/**` | **released 2026-10-05 21:45 — PASS** (23 tests, scoped 91/91; five attempts, R5 finished) | 2026-10-05 |
| P5B-1 | Boot loader + real compute wiring (batch B5) | `web/src/boot/**` | **released 2026-10-04 23:05 — PASS (G5)** (34 tests, 3 mutation checks, cancelled twice, resumed) | 2026-10-04 |
| P5B-2 | 3D runtime stage + 2D schematic (batch B5) | `web/src/stage/**` | **released 2026-10-04 23:05 — PASS (G5)** (144 tests incl. sceneBudget/stageSource, 3 mutation checks, resumed) | 2026-10-04 |
| P6-A1 | Registry-driven Profile form (batch B5) | `web/src/profile/**` | **released 2026-10-04 23:05 — PASS (G5)** (ProfileForm + model/view/handlers, cancelled twice, resumed) | 2026-10-04 |
| P4-1 | Domain engine + encoder + parity self-check | `web/src/domain/**` | **released 2026-10-04 16:45 — PASS (G4)** (42 domain tests, parity 40/40, report `8180ea40…`) | 2026-10-04 |
| P4-2 | Worker protocol + main-thread adapter + watchdog | `web/src/worker/**` | **released 2026-10-04 16:45 — PASS (G4)** (97 worker tests, real-engine equivalence landed, mutation-checked) | 2026-10-04 |
| P4-M | Manifest inlining at build (C-01) | `web/index.html` (untouched), `web/vite.config.ts`, `web/src/manifest/**` | **released 2026-10-04 16:45 — PASS (G4)** (10 tests, e2e 9/9 incl. CSP byte-exact) | 2026-10-04 |
| P3-1 | Compile/export (C-03/C-01) | `pipeline/{export_model,manifest}.py` + tests + generated artifacts | **released 2026-10-04 14:40 — PASS (G3)** | 2026-10-04 |
| P3-2 | Oracle + exact SHAP + golden fixtures (C-06) | `pipeline/{oracle,shap_exact,make_fixtures}.py`, `tests/fixtures/**`, `tests/test_{oracle,shap_exact,fixtures}.py` | **released 2026-10-04 14:40 — PASS (G3)** | 2026-10-04 |
| P3-3 | C-05 cases artifact | `web/public/cases.json`, `tests/test_cases.py` | **released 2026-10-04 14:40 — PASS (G3)** | 2026-10-04 |
| P5A-1 | Store (C-09) + registry + URL (C-10) + shared type projections | `web/src/{store,registry,navigation,contracts}/**` | **released 2026-10-04 14:40 — PASS** (71+47+95 tests, tsc 0, mutation-checked) | 2026-10-04 |
| P5A-2 | SceneModel/StructureSource (C-11) view-model + 2D schematic | `web/src/scene/**` | **released 2026-10-04 14:40 — PASS** (94 tests; C-CONF-03 resolved via D-15) | 2026-10-04 |
| P2-1 | Validation/training/results pipeline | `pipeline/{prepare,train,validate,reproduce,metrics,calibration,reliability}.py`, `tests/test_pipeline_{protocol,results_schema}.py`, generated `results.json`, generated `pipeline/artifacts/**`, `Makefile`/`make.ps1` reproduce lines | **released 2026-10-04 10:45 — G2 PASS** | 2026-10-04 |
| P2-2 | Leakage lab (quarantined probes) | `pipeline/leakage_lab.py`, `tests/test_leakage_{lab,boundary}.py` | **released 2026-10-04 10:45 — G2 PASS** | 2026-10-04 |
| SES-ORCH-01 | (previous orchestrator session — superseded) | `Progress.md`, batch gates, `assets/**` `tools/mesh/**` (B0-3 reclaim) | **released 2026-10-04 by SES-ORCH-02; claims inherited** | 2026-10-03 |
| B0-1 | Foundation / toolchain / CI | root configs, `.github/`, minimal `web/` scaffold, `tests/conftest.py` | **released — CONDITIONAL PASS** (9 ruff findings, now cleared) | 2026-10-03 |
| B0-2 | Data / schema / leakage | `data/`, `config/`, `pipeline/`, `tests/test_{schema,leakage,encode,registry}.py` | **released — PASS** | 2026-10-03 |
| B0-3 | 3D asset risk / mesh gate | `assets/`, `tools/mesh/` | **completed by SES-ORCH-01** after agent died on API error (see §3) | 2026-10-03 |
| B0-4 | Docs / traceability | `README.md`, `docs/` | **released — CONDITIONAL PASS** | 2026-10-03 |
| SES-00 | Bootstrap (AGENTS.md + Progress.md) | `AGENTS.md`, `Progress.md` | released | 2026-10-03 |

## 1. Phase status

| Phase | Objective | Gate | State | Evidence | Owner |
|---|---|---|---|---|---|
| P0 Foundation | Repo, clean install, CI skeleton, contract ownership map | G0 | **PASS** | ruff clean · pytest 58 · vitest 3 · `npm run build` ✓ · ownership map §2 live (2026-10-03 21:52) | SES-ORCH-01 |
| P1 Data + 3D gate | Verified schema/checksum/leakage gate + mesh decision | G1 | **data PASS · 3D PASS (conditional HD-07)** | 58 pytest incl. schema/leakage/encode/registry · `heart.glb` budgets + measured fps · `tools/mesh/gate_report.md` | SES-ORCH-01 + B0-2 + B0-3 |
| P2 Validation & training | Nested CV, calibration, thresholds, leakage lab, `results.json` | G2 | **PASS** (2026-10-04 10:45 — dual direct reproduce byte-identical `fc336660…`, in-suite regen identical, pytest 97, ruff clean) | `results.json` sha256 `fc336660…c5dcf502`; §3 entry 10:45 | SES-ORCH-02 + P2-1 + P2-2 |
| P3 Compile & artifacts | `model.json`, manifest, Python oracle, golden fixtures | G3 | **PASS** (2026-10-04 14:40 — orchestrator-run: manifest 6/6 written sha `a2f9b3db…`, pytest 203, oracle-vs-library margin 1.345e-06 ≤1e-5, SHAP reference 4.916e-09 ≤1e-6, fixtures 40 specs byte-deterministic, ruff clean) | §3 entry 14:40 | SES-ORCH-02 + P3-1 + P3-2 + P3-3 |
| P4 TS engine + worker | Engine, worker, parity harness @ 1e-5 | G4 | **PASS** (2026-10-04 16:45 — orchestrator-run: parity 40/40 report `8180ea40…`, vitest 653, tsc 0, pytest 203+106, ruff clean, build ✓, manifest-inline ALL CHECKS PASS, e2e 9/9) | §3 entry 16:45 | SES-ORCH-02 + P4-1 + P4-2 + P4-M |
| P5 Store/registry/scene | One store, registry correspondence, 3D/2D source | G5 | **PASS** (2026-10-04 23:00 — orchestrator-run: tsc 0, vitest 872/872, build ✓, inline ALL CHECKS PASS; boot golden chain + store/registry + scene 94 + stage 144 incl. structural budgets + correspondence tests (`scene/schematic.test.ts:82` same vessel ids as registry chain; picking identity/ramp/demand-mode mutation-checked red→restored)) | §3 entry 23:05 | SES-ORCH-02 + P5B-1 + P5B-2 + P6-A1 |
| P6 Explore core | Flagship end-to-end golden path | G6 | **PASS** (2026-10-05 22:25 — orchestrator-run full e2e 11/11: golden journey edit proof LCX 47→66, RCA 59→75, fill 99.7623→99.9142%, banner stops×7→8, consoleErrors=0, same-origin; §3 entry 22:25) | §3 entry 2026-10-05 22:25 | SES-ORCH-02 + P6-SHELL-R6 + P6-EXPLORE + P6-INSPECTOR-R5 + P6-E2E |
| P7 Trust/System + P1 | Evidence surfaces, copy lint, integrity | G7 | **PASS** (2026-10-06 11:45 — orchestrator-run: tsc 0 · 1087/1087 (74 files) · build ✓ + inline ALL CHECKS PASS · e2e 11/11 (44.0s) incl. rail step 9b; Trust panes artifact-backed w/ audit table; IntegrityPane live WebCrypto + live engine parity run (no fixtures in prod, mutation-proven); Evidence Rail mounted under stage; copy lint 19 green; §3 entry 11:45) | §3 entry 2026-10-06 11:45 | SES-ORCH-02 + P7-TRUST-DATA + P7-RAIL + P7-INTEGRITY |
| P8 Verification & deploy | Full VC chain, perf, security, primary+mirror | G8/G9 | **batch P8 dispatched 2026-10-06 11:45** (PERF ∥ A11Y ∥ DEGRADE ∥ DEPLOY-PREP) | — | SES-ORCH-02 |
| P9 Freeze, docs, video, submit | Submission package | G10 | not started | — | — |

## 2. Active claims

| Session | Claimed files / area | Claimed at | Released at |
|---|---|---|---|
| P8-PERF | NEW perf harness files (`web/src/perf/**`, `web/e2e/perf.spec.ts`) + **additive-only** stats instrumentation in `web/src/stage/**` if renderer.info access is needed (no behaviour change, guarded, tested) | 2026-10-06 11:45 | — |
| P8-A11Y | NEW `web/e2e/a11y.spec.ts` + `web/playwright.config.ts` (browser-matrix projects only) + `web/src/shell/shell.css` + `web/src/explore/explore.css` + **additive aria/focus attributes only** (no logic) in `web/src/shell/**` / `web/src/explore/**` source | 2026-10-06 11:45 | — |
| P8-DEGRADE | NEW `web/e2e/degraded.spec.ts` + targeted defect fixes in `web/src/{worker,boot,store,stage,scene}/**` (each justified) | 2026-10-06 11:45 | — |
| P8-DEPLOY | `.github/workflows/**`, `web/vite.config.ts` (base-path config only), `web/package.json` (scripts only), deploy/offline scripts, NEW `web/e2e/offline.spec.ts`, `tools/qa/perf-report.md` NOT claimed — its own report `tools/qa/release-checklist.md` — NO push, NO network deploy | 2026-10-06 11:45 | — |
| P7-RAIL | `web/src/explore/**` + `web/e2e/golden.spec.ts` | 2026-10-05 22:25 (batch P7) | **2026-10-06 10:50 (PASS — resume verification: scoped 74/74, e2e 2/2 w/ step 9b, full 1087/1087, tsc 0, 2 mutations red→restored; predecessor's build completed 00:35 then interrupted)** |
| P7-INTEGRITY | `web/src/system/**` + `web/src/shell/{paneData.ts,paneData.test.tsx,ShellApp.tsx,shellIntegrity.test.tsx,bootLifecycle.ts}` | 2026-10-05 22:25 (batch P7) | **2026-10-06 11:20 (PASS — resume: tsc-fix (negative-test cast, assertion intact) + scoped 189/189 + build ✓ + inline ALL CHECKS PASS + e2e 2/2 + full 1087/1087 + 2 mutations red→restored; predecessor's build completed 00:29 then interrupted)** |
| P7-TRUST-DATA | `web/src/validation/**` | 2026-10-05 22:25 (batch P7) | **2026-10-06 10:45 (PASS — 64 tests, production-path audit, 2 mutations; CONDITIONAL was sibling-blocked; its 1 tsc leftover `panes.test.tsx:598` fixed by orchestrator 10:25, tsc clean after)** |
| P6-E2E | `web/e2e/golden.spec.ts` + `golden-helpers.ts` (reclaim of released P68-A5 for these files) | 2026-10-05 22:05 (batch G6) | **2026-10-05 22:25 (PASS — G6; support.ts interact() off-viewport fix by orchestrator; full e2e 11/11)** |
| P6-SHELL | `web/src/App.tsx`, `web/src/shell/**` | 2026-10-04 23:05 | **2026-10-05 22:00 (PASS — ShellApp/chrome/ZoneBoundary/paneData/browserHost, 44 shell tests, scoped 98/98, full 1016/1016, mutation 10 red→restored; six dispatch attempts, R6 finished; deviation: `smoke.test.ts` scaffold assertion updated — stale scaffold heading, intent preserved)** |
| P5B-1 | `web/src/boot/**` | 2026-10-04 ~17:00 (batch B5) | **2026-10-04 23:05 (PASS — golden chain 34/34 boot tests, 3 mutation checks red→restored, cancelled twice mid-run, resumed R-final)** |
| P5B-2 | `web/src/stage/**` + additive-only `web/src/scene/**` (0 scene files modified) | 2026-10-04 ~17:00 (batch B5) | **2026-10-04 23:05 (PASS — stage 144 incl. sceneBudget/stageSource, mutation checks a/b/c red→restored, build ✓; resumed R-final after mid-run cancellation)** |
| P6-EXPLORE | `web/src/explore/**` | 2026-10-04 23:05 | **2026-10-05 20:00 (PASS — 42 tests, 4 mutations red→restored, 914/914 at its gate; cancelled twice, resumed R-final)** |
| P6-INSPECTOR | `web/src/panels/inspector/**` | 2026-10-05 11:18 | **2026-10-05 21:45 (PASS — 23 tests incl. INV-14 trio + reconciliation ≤1e-6, scoped 91/91, 4 mutations red→restored; five dispatch attempts, R5 finished)** |
| P6-A1 | `web/src/profile/**` | 2026-10-04 ~21:15 (dispatch 3) | **2026-10-04 23:05 (PASS — ProfileForm + model/view/handlers, profile tests ~41, tsc 0; cancelled twice, first with 3 broken wrong-depth-import files, resumed R-final)** |
| P3-1 | `pipeline/export_model.py` `pipeline/manifest.py` `tests/test_export_model.py` `tests/test_manifest.py`, generated `model.json` (root) + `web/public/{model,results,manifest,registry}.json` + `web/public/models/heart.glb` | 2026-10-04 10:45 | **2026-10-04 14:40 (G3 PASS — §3 entry 14:40)** |
| P3-2 | `pipeline/oracle.py` `pipeline/shap_exact.py` `pipeline/make_fixtures.py`, `tests/fixtures/**`, `tests/test_{oracle,shap_exact,fixtures}*.py` | 2026-10-04 10:45 | **2026-10-04 14:40 (G3 PASS; re-dispatched once — cancelled mid-run 12:53, resumed PASS)** |
| P3-3 | `web/public/cases.json`, `tests/test_cases.py` | 2026-10-04 10:45 | **2026-10-04 14:40 (G3 PASS)** |
| P5A-1 | `web/src/{store,registry,navigation,contracts}/**` + their `*.test.ts` files | 2026-10-04 10:45 | **2026-10-04 14:40 (PASS; cancelled twice mid-run, resumed R2 — 213 tests + tsc 0 + mutation-checked)** |
| P5A-2 | `web/src/scene/**` + its `*.test.ts` files | 2026-10-04 10:45 | **2026-10-04 14:40 (PASS — 94 tests; copy-lint finding `loadStructure.ts:23` verified fixed)** |
| P4-1 | `web/src/domain/**` + its test files (incl. the D-16 stub in `domain/index.ts`) | 2026-10-04 14:40 | **2026-10-04 16:45 (G4 PASS — §3 entry 16:45)** |
| P4-2 | `web/src/worker/**` + its test files | 2026-10-04 14:40 | **2026-10-04 16:45 (G4 PASS — 97 tests, real-engine equivalence landed)** |
| P4-M | `web/index.html` (untouched), `web/vite.config.ts`, `web/src/manifest/**` + its test files | 2026-10-04 14:40 | **2026-10-04 16:45 (G4 PASS — inline verified ALL CHECKS PASS, e2e 9/9)** |
| SES-ORCH-03 | as per ACTIVE SESSIONS row (batch P68 owner); coordinates units A1–A6 below | 2026-10-04 | **2026-10-04 11:20 (all six units released PASS)** |
| P68-A1 (copy lint) | `web/src/copy/**` (vocabulary, scanner, tests) — scans (read-only) `web/src/**`, `docs/**`, `README.md` | 2026-10-04 | **released 2026-10-04 11:20 — PASS** (19 tests; one cross-unit finding routed to P5A-2, see §3) |
| P68-A2 (C-12 components) | `web/src/design/**` (tokens + THE single probability→colour ramp), `web/src/components/**` (ProbabilityReadout + tests) | 2026-10-04 | **released 2026-10-04 11:20 — PASS** (29 tests, mutation-checked; ramp published as single colour truth, D-202) |
| P68-A3 (Trust panes) | `web/src/validation/**` (Performance/Calibration/Decisions/Subgroups/Leakage panes, local synthetic fixtures, tests) | 2026-10-04 | **released 2026-10-04 11:20 — PASS** (37 tests; resumed once after empty return) |
| P68-A4 (System panes) | `web/src/system/**` (Requirements/Architecture/Integrity/ModelCard panes, local fixtures, tests) | 2026-10-04 | **released 2026-10-04 11:20 — PASS** (60 tests; resumed once after empty return) |
| P68-A5 (QA harnesses) | `tools/qa/**`, `web/e2e/**`, `web/playwright.config.ts`, `web/index.html` (CSP meta only), `web/package.json` (e2e dep + scripts only) | 2026-10-04 | **released 2026-10-04 11:20 — PASS** (e2e 9/9 mutation-checked; CSP byte-exact) |
| P68-A6 (Evidence Rail) | `web/src/panels/evidence/**` (presentation-only rail + tests) | 2026-10-04 | **released 2026-10-04 11:20 — PASS** (49 tests; caveat pragma fixed by orchestrator) |
| SES-ORCH-02 | `Progress.md` (sole writer), batch/gate decisions, env/toolchain `.venv`, `.gitignore`, `requirements.lock.txt` | 2026-10-04 | — |
| P2-1 | `pipeline/prepare.py` `pipeline/train.py` `pipeline/validate.py` `pipeline/reproduce.py` `pipeline/{metrics,calibration,reliability}.py`, `tests/test_pipeline_protocol.py` `tests/test_results_schema.py`, generated `results.json`, generated `pipeline/artifacts/**`, `Makefile`/`make.ps1` reproduce invocation lines | 2026-10-04 | 2026-10-04 10:45 (G2 PASS — §3 entry 10:45) |
| P2-2 | `pipeline/leakage_lab.py`, `tests/test_leakage_lab.py` `tests/test_leakage_boundary.py` | 2026-10-04 | 2026-10-04 10:45 (G2 PASS — §3 entry 10:45) |
| B0-1 | `.gitignore` `Makefile` `make.ps1` `pyproject.toml` `requirements*.txt` `web/` root configs `.github/**` `tests/conftest.py` `tests/test_repo_smoke.py` `web/src/smoke.test.ts` | 2026-10-03 | 2026-10-03 (released at Batch 0 close) |
| B0-2 | `data/**` `config/**` `pipeline/**` `tests/test_schema.py` `tests/test_leakage.py` `tests/test_encode.py` `tests/test_registry.py` | 2026-10-03 | 2026-10-03 (released at Batch 0 close) |
| B0-3 | `assets/**` `tools/mesh/**` — **agent died mid-task (API error); area reclaimed by SES-ORCH-01 and completed** | 2026-10-03 | 2026-10-03 (completed by orchestrator) |
| B0-4 | `README.md` `docs/**` | 2026-10-03 | 2026-10-03 (released at Batch 0 close) |

_Prohibited to every subagent: `Progress.md` (orchestrator-only), `Project/**` (read-only),
and any path not listed in its own claim._

_Rule: claim before you touch. A claim with no release after your session ends is stale and may be
reclaimed by another session after it is logged here._

## 3. Work log (newest first)

### 2026-10-06 11:45 — SES-ORCH-02 — **G7 PASS** (batch P7 closed: 3/3 units); batch **P8 opened**

**Batch P7 outcome (all three units PASS):**
- **P7-TRUST-DATA** (released 10:45): production-path audit — all five Trust panes render from
  `results.json` via `toTrustResults` (real values asserted: ROC-AUC 0.936 [0.905,0.963],
  Brier 0.089, threshold 0.375, n=162/141/127/176, 5 probes); P1 interactions added (segment
  controls, bin inspector, threshold slider, BarList CIs, scope switch); G5 retry affordance in
  `PaneShell`; 64 tests; mutations (hardcoded metric → red; fixture import in pane → red);
  productionPath.test.tsx source-law. Deviations: `.ct-seg__btn` 36→44px (touch target),
  `productionPath.test.ts` → `.tsx`. Its tsc leftover fixed by orchestrator (see below).
- **P7-RAIL** (interrupted 00:35, resumed 10:20–10:50, released): EvidenceRailHost (87 lines)
  mounts `<EvidenceRail>` under the stage (Final_demo §4.5); `buildEvidenceRailData` projection
  table documented (registry/stage/selection/case only, no timers); golden.spec **step 9b**
  (mounted visible, chip mask flips rail ECG row live, banner stop×8). Evidence: scoped 74/74,
  e2e 2/2 (`step9b mounted=true chips=5 panelRows=3 warningStayed=true`), full 1087/1087, tsc 0;
  mutations: projection `provided:true` → 2 unit red; unmount → e2e red `toHaveCount(1) got 0`.
- **P7-INTEGRITY** (interrupted 00:29, resumed 10:37–11:20, released): IntegrityPane shows
  **live** per-artifact verification — declared sha256 from inlined manifest vs observed
  `sha256Hex(bytes)` computed by `createArtifactRecorder.fetch` at boot fetch (Option A, no 2nd
  request); `verified` derived at render; **parity report = live engine run** (`paritySettle`
  → `runFixtureVerification`), NOT static JSON (Contracts §9 L429); fixture-in-prod grep clean
  (only `*.test` files import fixtures). Fixed tsc error (negative-test cast, assertion intact);
  scoped 189/189, build ✓ + inline ALL CHECKS PASS, e2e 2/2, full 1087/1087;
  mutations: corrupted manifest digest → 2 red (observed digest stays real); removal of real
  verification → shellIntegrity red (`pane-pending`).
- **Orchestrator:** fixed `validation/panes.test.tsx:598` (spread of optional `leakageLab`
  left `excludedColumns` possibly-undefined — added explicit `?? []`; TRUST-DATA leftover).

**G7 evidence (orchestrator-run 11:25–11:40, independent):**
```text
npx tsc                      -> EXIT=0
npm test                     -> Test Files 74 passed (74), Tests 1087 passed (1087), EXIT=0
npm run build                -> BUILD_EXIT=0
node src/manifest/verify-dist-inline.mjs -> RESULT: ALL CHECKS PASS
npm run test:e2e             -> 11 passed (44.0s), EXIT=0
  [golden] audit: requests=10 crossOrigin=0 nonGet=0 failed=0 consoleErrors=0 pageErrors=0 evidenceRailMounted=2
  [golden] banner stops (8) incl. 'explore evidence rail'
```
**G7 verdict: PASS** — artifact-backed evidence ✓ (audit table), real integrity check ✓
(live digests + live engine parity), copy lint ✓ (VC-11 19 green), no typed metrics / fake
parity / unsafe wording (all mutation-proven).

**Findings dispositioned (not silently fixed):**
- FM-10 vs FM-01 source conflict → **§5 C-CONF-04** (boot G6-blocks on results failure).
- TrustView loading/error/retry props unreachable (resultsStatus never leaves ready on the
  ready path) → §9 open item; wiring requires an honest error source, not fabricating one.
- `flattenLeakageLab` "probe model" labels = artifact truth by design (C-04 §5.4) → closed.

**Next: batch P8 (G8 release candidate)** — 4 parallel safe agents per Implementation_Plan
§P8 "Parallel Work": P8-PERF (measure p95/fps/triangles/draws/memory — D-08 target→measured) ∥
P8-A11Y (keyboard/aria/reduced-motion/contrast + 3 breakpoints) ∥ P8-DEGRADE (stale races,
worker G3, artifact G6, WebGL/mesh/Q3 fallbacks, malformed input) ∥ P8-DEPLOY (CI workflow +
offline network-disabled demo path + deploy config — **orchestrator pushes**, units never
network).

### 2026-10-05 22:25 — SES-ORCH-02 — **G6 PASS**; P6-E2E delivered; batch P7 opened

**G6 evidence (orchestrator-run 2026-10-05 22:10–22:20, not agent-claimed):**
```text
cd web; npm run test:e2e -> 11 passed (15.5s)   [golden ×2, csp ×2, deploy-smoke ×1,
    request-audit ×2, storage-audit ×2, …]
golden journey (real artifacts, zero mocks):
  boot -> zero-click default truth (readout value+threshold+decision+strong)
  deep links #/trust/performance, #/system/requirements + garbage #/nowhere + back/forward
  vessel LAD select -> inspector depth target, whyRows=6, measurements rows=54
  EDIT PROOF: age 86 -> revision 2; LAD 93->97, LCX 47->66, RCA 59->75,
              fill 99.7623% -> 99.9142%   (REAL inference, values actually changed)
  stale "Updating…" affordance observed; ECG withheld -> hatched + dashed
  banner stops=7 (every route) · consoleErrors=0 · pageErrors=0
  same-origin: requests=10, crossOrigin=0, websockets=0, nonGet=0
  traffic includes workerEntry-BRkAR9UX.js (real worker inference)
```
**Orchestrator fix en route (reclaim logged):** released P68-A5's `web/e2e/support.ts`
`interact()` clicked the new shell's skip link (parked `left:-9999px`, keyboard-revealed) →
4 pre-existing specs failed. One-guard fix: off-viewport controls activated by focus+Enter
(step still required, never skipped) — reclaim of P68-A5 file for this edit noted here;
full suite then 11/11.

**P6-E2E released PASS** (golden.spec.ts 545 B-lines + golden-helpers 253; mutation
self-checks: identical-values→throws, bare-readout→throws, banner missing/dup→throws).

**Known carry:** `evidenceRailMounted=0` — EvidenceRail not mounted (P7). P6-E2E blocker (1)
resolved by the support.ts fix above.

**Next: batch P7 (G7 = artifact-backed evidence + real integrity + copy/safety):** P7-RAIL
(mount EvidenceRail under stage, explore reclaim) ∥ P7-INTEGRITY (runtime integrity display,
system + shell/paneData reclaim) ∥ P7-TRUST-DATA (Trust panes artifact-backed + interactions,
validation reclaim).

### 2026-10-05 22:05 — SES-ORCH-02 — Batch P6 COMPLETE (code), orchestrator-verified; golden-path e2e next

**Batch P6 closed after 10+ harness cancellations across 3 units — every unit eventually PASS.**
Recovery pattern that worked (Batch-0 lesson, reconfirmed): inventory disk → baseline (tsc +
scoped vitest) → re-dispatch resume units in parallel with exact disk state → "smart protocol"
prompts (plan-first, batch-edit, one-verify, root-cause-never-guess) finally produced clean
final passes.

**Orchestrator verification (2026-10-05 22:00–22:04 — not agent-claimed):**
```text
cd web; npx tsc -p tsconfig.json --noEmit -> exit 0
cd web; npx vitest run                     -> 1016 passed (70 files), 9.34s
cd web; npm run build                      -> ✓ 692ms; dist/assets:
    index-Dyvflxz5.js 1,431,483 B · index-Dl4Ic4Z9.css 44,392 B
    workerEntry-BRkAR9UX.js 45,608 B   <-- WORKER CHUNK NOW EMITTED (closes the G4
                                              carried item; matches P4-2 probe exactly)
node web/src/manifest/verify-dist-inline.mjs -> ALL CHECKS PASS
pytest/ruff                                -> unchanged since G4 (no Python touched)
```
**Unit highlights:** P6-SHELL-R6 (App.tsx scaffold → ShellApp + chrome + ZoneBoundary +
browserHost + paneData; banner-on-every-route + boot state machine tests; mutation = banner
dropped + error swallowed → 10 red → restored). P6-EXPLORE (42 tests; coherence/one-ramp/
bare-probability/source laws mutation-proven; display-channel choreography). P6-INSPECTOR-R5
(23 tests; INV-14 trio; Why-sum reconciliation ≤1e-6; colSpan diagnosis — test-vs-component
resolved with pinned-react probe, no assertion weakened; 4 mutations red→restored).

**Known deviations logged:** smoke.test.ts scaffold assertion updated by P6-SHELL (stale
heading — intent preserved); shell.css decorative layout % (aria-hidden, not clinical);
vite >500 kB advisory + three CJS deprecation warning pre-existing.

**Next:** golden-path e2e (`web/e2e/golden.spec.ts` — reclaiming the released P68-A5 e2e
claim for this file): boot → default case → first truth visible → vessel click → explanation →
edit → updated inference → Evidence Rail → Trust → System, disclaimer on EVERY route, zero
console errors, then G6 evaluation.

### 2026-10-04 23:05 — SES-ORCH-02 — Batch B5 recovery closed, **G5 evaluated PASS**, batch P6 opened

**B5 story (three harness cancellations, recovered each time).** Batch B5 (P5B-1 ∥ P5B-2 ∥
P6-A1) was cancelled at dispatch; disk inventory showed boot (7 files, last 17:33) and stage
(19 files, last 18:33) mid-flight and profile absent. Baseline measured (boot 162/164 + 1 tsc
error; stage tests green + 3 tsc errors), then re-dispatched all three in parallel. P5B-1-R and
P5B-2-R returned PASS; P6-A1 was cancelled a second time at 19:16 having written 3 files with
wrong-depth imports (`../../contracts` from `web/src/profile/` → 15 tsc errors, 0 tests
running). Diagnosed root cause, re-dispatched P6-A1-R with the exact fix — returned PASS with
the full ProfileForm surface (11 files).

**Gate evidence (orchestrator-run 2026-10-04 21:15–23:00 — not agent-claimed):**
```text
cd web; npx tsc -p tsconfig.json --noEmit -> exit 0  (22:40; profile depth fixes included)
cd web; npx vitest run                     -> 872 passed (60 files), 11.97s (22:40)
   incl. src/boot 34 (golden chain: 6-artifact verify → G3 fallback+notice → finite p ==
   engine.execute on same encoded case; corrupted sha → typed block, no partial engine;
   INV-13 stale-discard; URL resolve; notice hygiene vs real cases.json value corpus)
   + src/stage 144 (sceneBudget: real heart.glb ≤150k tris/≤30 draws/0 tex/≤2.5MB; demand-
   mode one-ramp picking source laws) + src/scene 94 intact + src/profile ~41 + copy 19
cd web; npm run build                      -> ✓ 701ms; single 219.73 kB chunk
   (worker chunk NOT yet emitted — App doesn't import boot; re-check at G6)
node web/src/manifest/verify-dist-inline.mjs -> ALL CHECKS PASS (dist sha 1d6f0f36…)
python -m pytest -q / ruff                 -> unchanged from G4 (no Python touched)
```
**Mutation checks across the batch (all watched red → restored):** sha-verify bypass → 6
corruption tests red + partial-engine hazard visible; store stale-guard off → INV-13 red
(stale p(CAD)=0.9976 became current); default-case picker → 5 red; hardcoded vessel↔node
mapping → picking identity red; ramp bypass → one-ramp red; `frameloop="always"` → demand
law red.

**Gate G5: PASS** (Implementation_Plan 3184-3186: store + registry · SceneModel + 3D/2D
correspondence). Correspondence evidence: `scene/schematic.test.ts:82` (schematic keeps the
registry chain's vessel ids), `structureSource.ts` identical correspondence either way,
picking identity from registry `meshNode` (mutation-checked), one store/one registry (no
second truth found in footprint audits).

**Decisions/flags this batch:** (a) **D-17** — absent key in `case.values` = *unprovided*
(P6-A1 question): consistent with Contracts §7.1 C-08 ("stored values of unprovided features
are ignored until observed"; mask is authoritative), zero impact on production `cases.json`
(agent-verified), no safety impact → recorded, NOT an HD gate. (b) P5B-1 default-target
policy = `registry.targets[0]` (CAD) at boot — matches demo flow; noted for P6 shell
consumers. (c) P5A store files were temporarily mutated inside P5B-1's bounded mutation
check and restored byte-exact (SHA256-verified `839051E2…D32`) — git diff empty.

**Next: batch P6** (parallel, interface-frozen): P6-SHELL (App/router/boot/banner/zones,
mounts `ExploreWorkspace` from `./explore`, Trust/System panes at their routes) ∥
P6-EXPLORE (`web/src/explore/**` — profile+stage+cards+selection, mounts `Inspector` from
`../panels/inspector`) ∥ P6-INSPECTOR (`web/src/panels/inspector/**` — Case/Vessel depths,
Why/Measurements, SHAP-row edit callbacks). Then orchestrator gate → golden-path e2e → G6.

### 2026-10-04 16:45 — SES-ORCH-02 — G4 evaluated PASS (parity window met a day early)

**B4 close.** All three units returned PASS in one parallel batch (P4-1 resumed once for its
final report — its work and tests were already on disk; no harness cancellations this time;
command-safety budgets kept every run bounded).

**Gate evidence (orchestrator-run 2026-10-04 16:28–16:42 — not agent-claimed):**
```text
cd web; npx tsc -p tsconfig.json --noEmit -> exit 0
cd web; npx vitest run                     -> 653 passed (48 files), 9.25s
   incl. src/domain/parity.test.ts 12 blocking tests (recompute every stored expectation
   at C-06 tolerances + write report; 3 mutation checks red-then-restored inside the suite)
   + src/worker 97 tests + copyLint 19
python -m pytest -q                        -> 203 passed in 382.10s (14:41, covers all final
   Python files — newest is 14:21) + scoped re-run of the six P3 suites -> 106 passed (98.9s)
python -m ruff check .                     -> All checks passed!
cd web; npm run build                      -> ✓ 357ms; dist/index.html 2.76 kB
node web/src/manifest/verify-dist-inline.mjs -> ALL CHECKS PASS (dist sha 1d6f0f36…;
   block id cortwin-manifest, deep-equals public/manifest.json, 6 keys, modelId matches,
   CSP meta byte-exact, no '<' in payload)
cd web; npm run test:e2e                   -> 9 passed (12.5s) — CSP verbatim, zero
   securitypolicyviolation, request/storage audits, deploy smoke consoleErrors=0
```
**Parity artifact (self-verified by orchestrator, not just asserted):**
`web/src/domain/parity-report.json` sha256 `8180ea40f79d940e38b648899c44044cb9bb33a6d3f7ef4f35a7a2f825a8293d`
— fixtureSetId `golden-1.0.0-1.0.0-seed606`, modelId `sha256:71406e35…2ddba`, **40/40 fixtures
passed**, tolerance `{probability:1e-5, margin:1e-5, attribution:1e-5, efficiency:1e-6}`.
Agent-reported corpus maxima (test-enforced): probability 7.5e-10 · margin 3.1e-9 ·
attribution 8.9e-16 · efficiency residual 3.1e-9. MEASURED latency (labelled, no threshold):
evaluate p95 3.5 ms · explain p95 7.2 ms. Key semantic fix en route: linear attributions
centred on the shipped background mean (not the scaler means) — residual 0.19 → 3e-9.
P4-2 evidence: C-07 rule→test table (framing, L0>L1>L2>L3, in-lane supersession + INV-13
discard-on-arrival, revision/requestId echo, closed error enum, message hygiene scans,
watchdog-cannot-alter-numbers, no normative timeout), 3 mutation checks red→restored,
real-engine equivalence byte-identical across worker-mode and main-thread paths, worker
chunk bundling proven by ephemeral probe (45,608 B).

**Gate G4: PASS** (Implementation_Plan P4 exit: full parity + compute protocol checks).

**Known integration items carried (not G4 blockers):** (a) app build does not yet emit the
worker chunk — no app code imports `createWorkerComputePort` until P5B wiring (P4-2 probe
proved the bundling path; re-check at G5); (b) P4-1's `index.ts` gained two ADDITIVE exports
(`attachFixtureSet`, `verifyFixtures`) — frozen D-16 signatures unchanged; (c) P4-M's
build-level inline proof is the durable script `web/src/manifest/verify-dist-inline.mjs`
(run at every gate) rather than a vitest test (dist absent on clean checkout — deviation
logged in its report).

**Next: P5B** (real compute client: store↔ComputePort↔worker wiring, manifest-driven boot
loader, encoder attachment, G3/G6 degradation surfacing) then P6 mounting of the P68
surfaces — dispatched from the P5 phase spec next.

### 2026-10-04 14:40 — SES-ORCH-02 — G3 evaluated PASS; Batch B4 (P4) opened in parallel

**B3/P5A close (dispatch-cancellation recovery, round 2).** Two of the five batch units were
cancelled mid-run by the harness (P3-2 at ~12:47 with only `shap_exact.py` on disk; P5A-1 at
~12:49 with store code written but **no store tests**). Orchestrator inventoried the disk first
(Batch-0 lesson), then re-dispatched **both in one parallel message** as resume agents with
precise disk state + command-safety budgets. Both returned PASS (unit reports in task logs).

**Gate evidence (orchestrator-run, 2026-10-04 12:55–14:34 — not agent-claimed):**
```text
python -m pipeline.manifest --require-all
  6/6 OK: registry ad287abf… · model df8ced59… · structures f6fd044f… · cases 9eb6d4ba…
          results fc336660… · fixtures 08a7c815… (3,504,052 B)
  manifest written web/public/manifest.json sha256 a2f9b3db0654eac2deefa183efeab283ffd9efe1430fd308f3dedfa1bf9af5cd
  bundleId sha256:18ce319b7017a4989c3f6703bec55d657ddcaa35fdab5dab62ab1f62ee7f3dad modelId sha256:71406e35…2ddba
  (fixtures published at the C-01 target web/public/fixtures/golden.json as a byte-identical
   copy of tests/fixtures/golden.json — both sha 08a7c815…; this is the G3 publication step)
python -m ruff check .        -> All checks passed!
python -m pytest -q           -> 203 passed in 382.10s   (Batch0 + P2 + P3 suites)
cd web; npx tsc --noEmit      -> exit 0
cd web; npx vitest run        -> 504 passed (35 files) in 6.39s  [store 71 · registry 47 ·
                                 navigation 95 · scene 94 · P68 surfaces + copy 19 all green]
```
Agent-reported numeric evidence (traced, spot-checked): oracle vs deployed library raw-margin
max|diff| **1.345e-06** (≤1e-5), probability 9.26e-08; `shap_exact` vs shap 0.52 interventional
max **4.916e-09** (≤1e-6), LinearExplainer 2.2e-16, path-dependent divergence 1.233e-01
documented as mode difference (not a failure); fixtures 40 specs / 15 coverage classes /
byte-deterministic / modelId `df8ced59…` pinned; efficiency residual 2.7e-15. P5A-1 mutation
check: stale-guard removal → 7 red, revision-law break → 5 red, restored green.

**Gate G3: PASS.** Also verified: VC-11 cross-area finding (`scene/loadStructure.ts:23`
"proves") now clean — grep returns no match; full copyLint green inside the 504.

**Batch B4 opened (critical path — parity window Oct 5–6) — three non-overlapping parallel
units, all consuming only frozen artifacts/contracts:**
- **P4-1 domain engine + encoder** (`web/src/domain/**`): pure semantic port of
  `pipeline/oracle.py`/`shap_exact.py` semantics — artifact load/validate, strict `CaseEncoder`
  (reference: `pipeline/encode.py`), f32 tree walk + linear + Platt + ensemble, decisions,
  reliability lookup, headline coherence §8.4, missing-evidence value function §8.2, exact SHAP
  + displayGroup/modality aggregation, range flags, measurements/`caveats`/`narrative` slots;
  **self-parity runner vs `web/public/fixtures/golden.json` at C-06 tolerances (1e-5/1e-5/1e-5/1e-6)
  + parity report + labelled-measured perf note** (Early Proof: ≥1 target green before all four).
- **P4-2 worker + main-thread adapter** (`web/src/worker/**`): C-07 framing exactly, lane
  priority L0>L1>L2>L3, supersession, revision echo, typed error vocabulary, messages never
  containing patient values, timing diagnostic/local only, startup watchdog → G3 degradation
  (never alters numbers), `ComputePort` adapters for both paths over the **same** engine entry.
  Protocol core is dependency-injected (testable before the engine lands); thin `workerEntry.ts`
  wiring is its LAST step.
- **P4-M manifest inlining** (`web/index.html` + `web/vite.config.ts` + `web/src/manifest/**`):
  C-01 L118 + Architecture §336 — build-time inline of `web/public/manifest.json` into
  `index.html` with an integrity test; **must not alter the byte-exact CSP meta** (P68-A5 e2e
  asserts it) and must re-run `npm run test:e2e` + full vitest.
- **D-16 frozen interface:** orchestrator pre-seeded `web/src/domain/index.ts` as the single
  engine entry signature (`loadEngine → { modelId, execute(request: ComputeRequest): ComputeResponse }`
  + `createCaseEncoder`); P4-2 and later consumers build against it; **P4-1 replaces the stub
  implementation keeping signatures identical**. No second engine entry point anywhere.

**Not in this batch:** P5B (entry: G4), store↔port wiring (integration, after G4), Trust/Explore
mounting (P68 interfaces ready, gated G4–G5).

### 2026-10-04 11:20 — SES-ORCH-03 — Batch P68 complete: P6/P7/P8 preparation landed, verification chain green

**What ran.** Six non-overlapping units dispatched in one batch (§5.2): A1 copy lint (C-13/VC-11) ·
A2 ProbabilityReadout + design tokens + THE single ramp (C-12) · A3 Trust panes (C-04-shaped) ·
A4 System panes (C-10 deep-link grammar) · A5 QA harnesses + CSP (C-15/VC-13/VC-15) · A6 Evidence
Rail presentation (C-12 §8.4). **Dispatch ≠ delivery applied:** A3 and A4 returned empty reports →
resumed by session id; both completed on resume. One cross-unit lint finding (A6 contract-mandated
caveat wording) fixed by orchestrator with a same-line `c13-allow` pragma citing Contracts L387.

**Orchestrator verification (all commands run by SES-ORCH-03, 2026-10-04 11:10–11:18):**
```
python -m ruff check .       -> All checks passed!
python -m pytest -q          -> 97 passed in 769.62s   (P2 units' tests; upstream, unaffected)
cd web; npm run typecheck    -> exit 0
cd web; npx vitest run       -> 197 passed (197) exit 0   [11:10 tree]
cd web; npm run build        -> ✓ built in 322ms, dist 220,326 B
cd web; npm run test:e2e     -> 9 passed (13.5s) exit 0
```
**Post-record drift check (11:18):** full vitest now 219/220 — the single failure is
`web/src/scene/loadStructure.ts:23 banned: "proves"` (**P5A-2's in-flight file**, doc comment;
strict-superset scanner working as designed). Not owned by P68; routed in §9. P68-owned tests: 197.

```text
PHASE:                     P6/P7/P8 PREPARATION (batch P68) — phases themselves stay NOT STARTED
                           until upstream G3–G5 and real integration
STATUS:                    PASS
CONTRACTS IMPLEMENTED:     C-12 (ProbabilityReadout + single ramp), C-13/VC-11 (lint harness),
                           C-04/C-09/C-10 consumed by Trust/System shells, C-15/VC-13/VC-15
                           (CSP, request/storage audit, deploy smoke), C-16 (measurement protocol)
FILES CHANGED:             web/src/{copy,design,components,validation,system,panels/evidence}/**,
                           web/e2e/**, web/playwright.config.ts, web/index.html (CSP meta only),
                           web/package.json (playwright devDep + test:e2e script), Progress.md
FILES NOT CHANGED:         App.tsx, main.tsx, web/src/{store,registry,scene,navigation,contracts,worker,domain}/**
                           (P5A/others), web/public/** (P3), pipeline/**, config/**, tests/**,
                           .github/**, docs/**, README.md, Project/**, root results.json/model.json
ARTIFACTS PRODUCED:        none generated (fixtures are labelled SYNTHETIC test doubles);
                           tools/qa/artifacts/playwright-results.json (e2e evidence)
INTERFACES CHANGED:        none frozen. Published new (for integration): ProbabilityReadoutProps
                           (C-12 verbatim), probabilityToColour + PROBABILITY_RAMP_ID (D-202),
                           EvidenceRailProps (verbatim in A6's report), ParityReport prop shape,
                           Trust panes' C-04-shaped props, `npm run test:e2e`
TESTS RUN:                 ruff, pytest, typecheck, vitest (full), npm run build, npm run test:e2e,
                           mutation checks inside every unit (watched fail, then restored)
TESTS PASSED:              ruff 0 · pytest 97 · typecheck 0 · vitest 197/197 (P68 scope; 16 files)
                           · build ✓ · e2e 9/9 (incl. mutation probes)
TESTS FAILED:              none in P68 scope; 1 cross-area finding at 11:18 in P5A-2's
                           web/src/scene/loadStructure.ts:23 (routed, not edited — ownership law)
EVIDENCE:                  this entry's command output; per-unit reports in session task logs;
                           tools/qa/artifacts/playwright-results.json; mutation logs per unit
RUBRIC IMPACT:             Interpretability (20%): framed readouts + Trust/System/Evidence shells
                           exist with blocking tests before integration. Integration (15%): one
                           ramp, one readout, prop-driven panes = no second truth. Technical (10%):
                           copy-lint + request-audit + CSP + deploy-smoke gates are executable NOW.
KNOWN DEVIATIONS:          A2 glyphs ▲/△/▨ per AGENTS §6.1 + Final_demo:91 over dispatch typo
                           (D-203); A1 scanner strict-superset (whole-file incl. comments);
                           A5 dev-CSP ordering caveat (prod clean, documented tools/qa/README §4);
                           A3 brierRaw/brierPlatt/eceRaw/ecePlatt key names match producer output
OPEN BLOCKERS:             none for P68. Cross-unit: P5A-2 scene comment lint (routed §9).
HUMAN DECISIONS REQUIRED:  none (no HD gate)
CONTRACT VERSION:          1.0.0
```

**§11 adversarial self-questions (batch level):**
1. *Strongest argument this is wrong* — that prop-driven shells with synthetic fixtures are a
   "fake UI" risk. Mitigation: nothing is mounted (`App.tsx` untouched), no mock crosses a
   boundary, every fixture is labelled NOT model output, and integration replaces props with
   real artifacts — proven by prop-variant tests that fail on hardcoding.
2. *Rubric proof* — judge sees these surfaces only after real integration; the proof now is that
   the blocking gates (VC-11/13/15) already execute and mutation-probe green.
3. *Number from literal/stale artifact?* — none rendered; fixtures synthetic + labelled; Trust
   numbers will come from frozen `results.json` at integration (D-12/G2 sha `fc336660…`).
4. *Clinical truth outside domain/worker?* — no; all six units are presentation/harness only.
5. *Failure paths designed?* — every pane/rail has empty/not-loaded/not-run states, tested.
6. *Slow HW / 1366×768 / reduced motion / keyboard?* — static-level asserted (44px, focus ring,
   reduced-motion tokens, roving tabindex); live-browser passes belong to P6/P8 (documented).
7. *Mutation checks?* — every unit watched ≥2 mutations fail then restored (reports above).
8. *Assumed not verified?* — that integration will import these modules without refactor;
   published interfaces above are the handoff contract, verified only by typecheck.
9. *Hostile reviewer's first click?* — `#/bogus` deep link, `results: null`, `report: null`,
   NaN props, cross-origin probe — all covered by unit/e2e mutation tests.
10. *Simplest thing that scores?* — yes; zero new product dependencies (playwright is dev-only,
    §27-locked), no router/state/store added, nothing mounted prematurely.

### 2026-10-04 10:45 — SES-ORCH-02 — G2 evaluated PASS; Batch B3 (P3) + P5A opened in parallel

**B2 close (dispatch-cancellation recovery).** First P2 dispatch pair was aborted by the harness;
orchestrator **inventoried the disk before re-dispatching** (Batch 0 lesson applied) and found P2-1
~80% complete (`prepare/train/validate/metrics/calibration/reliability/reproduce`, 29 tests, a
telemetry-free `results.json` without `leakageLab`) and P2-2 never started. Re-dispatched both in
parallel (P2-1 as a verify/finish resume, P2-2 fresh) with explicit command-safety budgets.
Both returned PASS; gate evidence below is **orchestrator-run, not agent-claimed**:

```text
python -m pipeline.reproduce  ×2 direct (leakageLab included):
  results.json          sha256 fc336660c852e7960dff90744250228f1030ae823b71ef334831cf67c5dcf502  (identical)
  deployed_model.joblib sha256 912d905c8f79ad06ba7736b527799f9fb4b26d9566e732dee30a63745fe53d94  (identical, = pre-lab hash)
  wall 438.6 s / 433.1 s
in-suite slow smoke (3rd generation) → same fc336660… hash
python -m pytest -q  → 97 passed in 727.69s  (58 Batch0 + 29 P2-1 + 10 P2-2)
python -m ruff check . → All checks passed!
```

Headline numbers (traced to `results.json`, directional anchors from Idea §8): CAD AUC 0.936
[0.905–0.963] · LAD 0.847 [0.802–0.890] · LCX 0.712 [0.653–0.769] · RCA 0.754 [0.697–0.807];
tiers strong/moderate/limited/limited (exact match to Idea); leakage probes honest CAD AUC 0.9213
< target-leakage 0.9915 (direction per Idea §8); lab wall 96.7 s. Known deviations (P2-1):
operating-point metrics use the pooled-OOF threshold (mild F1 optimism vs Idea's fold-averaged
display; per-fold thresholds kept + tested, disclosed in provenance); ECE binning unspecified in
Idea → fixed 10 equal-width bins documented in provenance.

**Gate G2: PASS.**

**Batch B3 opened (critical path) — three non-overlapping parallel units:**
- **P3-1 compile/export:** `pipeline/export_model.py` + `pipeline/manifest.py` → C-03 `model.json`
  from joblib+results+registry; byte-identical `web/public/{model,results,registry}.json` copies
  (D-12 pattern); stage `heart.glb` → `web/public/models/`; C-01 `web/public/manifest.json`.
- **P3-2 oracle/fixtures:** independent Python runtime-form walker (`pipeline/oracle.py`), exact
  SHAP (`pipeline/shap_exact.py`) validated against shap 0.52, golden-fixture generator
  (`pipeline/make_fixtures.py`) per C-06 tolerances (1e-5/1e-5/1e-5/1e-6).
- **P3-3 cases:** `web/public/cases.json` per C-05 (Final_demo §4 chips: hypo1/hypo2/cohort A+B/
  blank) — created inside B3 because C-01's manifest must list every required artifact before
  P4's loader can boot (**D-13**).
- **Frozen interfaces:** P3-1 owns export code; P3-2 may RUN `python -m pipeline.export_model`
  but never edits P3-1 files; final manifest (all six artifact keys incl. P3-2 fixtures + P3-3
  cases) is regenerated at the G3 gate by the orchestrator.

**P5A opened in parallel with B3** (P5 Parallel Work sanctions it — C-09/C-10/C-11
contract-frozen; zero file overlap with B3): **P5A-1** store slices/intents/selectors/revision
semantics + C-10 URL parser + registry correspondence + shared type projections
`web/src/contracts/**` (**D-14** — single projection of C-07/C-08/C-09/C-11 text, P4 consumes
read-only); compute truth arrives via a typed port + test double, real client wired at P4/P5B.
**P5A-2** C-11 SceneModel selectors (WebGL-free tests), StructureSource loader (gltf primary +
procedural fallback), 2D schematic from the same SceneModel; consumes P68-A2's
`web/src/design/**` ramp **read-only** (one-ramp law), never edits it.

**Not in this batch:** P4 (entry: G3), P5B (entry: P4), manifest inlining into `index.html`
(SES-ORCH-03 owns `web/index.html` — integration item, §9).

**Dispatch discipline (user-ordered this session):** always dispatch units **in parallel in one
batch**, never serially; every shell call in every prompt carries an explicit timeout budget;
no watch/loop/REPL/server/stdin commands; heavy invocations capped (reproduce ×2, full pytest
×2); ≤1 retry after failure; never poll for a sibling unit's files.

### 2026-10-04 09:50 — SES-ORCH-03 — ORIENT: batch P68 (P6/P7/P8 preparation) opened

**ORIENT (AGENTS §2, fresh context).** Re-read AGENTS.md; all seven `Project/*.md` sources
(Contracts C-01…C-16 with C-10 §319 / C-11 §333 / C-12 §368 / C-13 §404 / C-15 §445 / C-16 §454
verbatim; Implementation_Plan P6 §1346, P7 §1528, P8 §1689 full phase specs; Tech_Stack §27 lock);
full `Progress.md`; repo inventory (`web/` = scaffold only: `App.tsx`/`main.tsx`/`smoke.test.ts`;
`config/` + `tests/` Batch 0 + P2 units; `pipeline/` Batch 0 + P2 in flight).
**Truth-check 2026-10-04 09:44:** `python -m pytest -q` → **87 passed** · `ruff` → clean ·
`npx vitest run` → **3 passed** · `npm run build` ✓ (built 460 ms). Untracked root `results.json`
(C-04-keyed) exists from P2-1 but is **not released/frozen** — not consumed by any P68 unit.

**Mission.** Batch **P68 = preparation only** for my named phases P6/P7/P8 while SES-ORCH-02 runs
the upstream chain (P2→P3→P4→P5). Six non-overlapping units (claims §2), each consuming only
**frozen contract text** (C-04/C-08/C-10/C-12/C-13/C-15/C-16) via **local, clearly-labelled
synthetic fixtures** — no store/worker/scene/engine access, no artifact numbers typed into source,
nothing mounted into `App.tsx`. Integration into the real app is gated on G3–G5 (upstream).
**Preparation ≠ P6/P7/P8 completion** (AGENTS §11 anti-patterns); gate states for my phases stay
NOT STARTED until real integration.

**Units dispatched in one batch (§5.2):** A1 copy-lint harness (C-13/VC-11) · A2
ProbabilityReadout + design tokens + THE single probability→colour ramp (C-12) · A3 Trust panes
(C-04-shaped) · A4 System panes (Requirements/Architecture/Integrity/ModelCard, prop-driven) ·
A5 P8 QA harnesses (request/storage audit, deploy smoke, CSP meta, perf protocol) · A6 Evidence
Rail presentation (C-12 §8.4, no probabilities rendered).

**Consumes:** C-04 §159 · C-08 §238 · C-10 §319 · C-11 §333 · C-12 §368 · C-13 §404 · C-15 §445 ·
C-16 §454 · P6/P7/P8 DoD. **Produces:** VC-11 harness, C-12 component, Trust/System/Evidence
presentation shells, VC-13/VC-15 harness skeletons, CSP.

**Decisions reserved: D-20x range** (avoids collision with SES-ORCH-02's D-10…D-12).
**No HD gate triggered:** no dataset, model, validation, clinical-vocabulary or contract change;
Playwright is already in the Tech_Stack §27 lock (optional testing row).

**Explicit non-claims:** `web/src/App.tsx` `web/src/main.tsx` · `web/src/{store,registry,scene,worker,domain}/**`
· `web/public/**` · `pipeline/**` · `config/**` · `tests/**` (pytest) · `.github/**` · `docs/**` ·
`README.md` · `assets/**` · `Project/**` (read-only) · root `results.json`/`model.json` (P2/P3-owned).

### 2026-10-04 07:41 — SES-ORCH-02 — Preflight, pinned runtime restored, Batch 2 (P2) opened

**ORIENT (AGENTS.md §2, fresh context).** Re-read all seven `Project/*.md` sources in full
(Contracts 626 lines end-to-end; Implementation_Plan P2–P5 phase specs verbatim), re-read
`Progress.md`, re-inventoried the tree (`git log`: `70e0b19` + clean status; `pipeline/` = Batch 0
modules only). Consumes C-03/C-04/C-06/C-07/C-08/C-09/C-11 as specs; produces G2 evidence.

**Preflight finding (material): P2 has NOT been executed.**
- `pipeline/` holds only Batch 0 modules (`config/dataset/encode/schema/errors`) — no `train.py`,
  `validate.py`, `reproduce.py`, `export_model.py`. No `results.json`, `model.json` or fixtures
  exist anywhere in the tree.
- Commit `70e0b19` ("Completed phase 1, phase 2 and phase 3 completely") contradicts tree state →
  recorded as **C-CONF-02** (§5).
- Consequence: P3/P4/P5 entry conditions are unmet. P2 must run first — **D-10** below. This is
  execution of the already-derived B2 topology (D-05), not a redesign; P2's methodology is fully
  fixed by Idea.md §4 + C-03/C-04 + VC-04, so no HD gate is triggered.

**Environment finding + repair (evidence-first per D-04 → D-11):**
- Old `.venv` was Python 3.11.9; the Tech_Stack §27 stack cannot install on it:
  `pip install -r requirements.txt` → `ERROR: No matching distribution numpy==2.5.* … Requires-Python >=3.12`;
  `pip install xgboost==3.4.*` → `ERROR: xgboost 3.4.0/3.4.1 … Requires-Python >=3.12`.
  `requirements.lock.txt` was a py311 freeze that lacked xgboost/shap entirely — a clean install
  from lock could not train at all.
- Repair: installed Python **3.12.9** per-user (no winget on host; python.org installer,
  `InstallAllUsers=0 PrependPath=0`), rebuilt `.venv` on 3.12.9, `pip install -r requirements.txt`
  → **all pins exact**: numpy 2.5.3 · pandas 3.0.6 · scikit-learn 1.9.1 · xgboost 3.4.1 ·
  shap 0.52.0 · pytest 9.1.1 · ruff 0.16.10 — now matches CI (`.github/workflows/ci.yml`
  provisions 3.12). Regenerated `requirements.lock.txt`; deleted `.venv-bak-py311`;
  `.gitignore` += `pipeline/artifacts/`, `.venv-bak-*/`.
- Verification on restored stack (2026-10-04 07:40): `python -m pytest -q` → **58 passed in
  1.92s**; `python -m ruff check .` → *All checks passed!*

**Batch 2 (B2) opened — two non-overlapping parallel units (claims §2):**
- **P2-1** validation/training/results: encode→nested CV (5×3 outer / 4 inner, stratified on the
  joint 8-pattern vessel label, one shared fold structure across targets) → Platt inside fold →
  max-F1 inner thresholds → abstention bands → reliability RT-1 → subgroups → evidence ladder →
  CIs → `results.json` (C-04) + `pipeline/artifacts/deployed_model.joblib` + VC-04 tests.
- **P2-2** leakage lab (quarantined): probes (honest / SMOTE-before-CV / feature-selection-before-CV /
  target-leakage / seed-sensitivity) + import-boundary test.
- **Frozen cross-unit interface:** `pipeline.leakage_lab.run_leakage_lab(df, *, seed=411) -> dict`
  returning the C-04 `leakageLab` object; **only `reproduce.py` may import it (lazily, after model
  fitting); no other `pipeline/` module may touch it** (enforced by P2-2's boundary test).
- **Artifact layout (D-12):** canonical `results.json` at repo root (P2 writer); P3 export makes a
  byte-identical `web/public/results.json` + `web/public/model.json`, hashes in manifest (C-01).

**Deferred, not blocked:** P5A structure-side work (registry consumers, StructureSource, 2D
schematic) remains free to open in parallel once B2 is running — mesh decision + C-02/C-11 are
already stable.

### 2026-10-03 22:05 — SES-ORCH-01 — Batch 0 closed, B0-3 completed, G0 evaluated

**What happened.** B0-1/B0-2/B0-4 returned (CONDITIONAL / PASS / CONDITIONAL). **B0-3's agent
died twice on infrastructure errors** (`Cannot connect to API`, then `unknown certificate
verification error`), so its area was inventoried and finished by the orchestrator.

**B0-3 state found on inventory (it got further than its failure implies):**
`assets/raw/isa_BP3D_4.0_obj_99.zip` (142,903,898 B, 2,234 entries) + 88 extracted OBJs and
ISA sidecars; `tools/mesh/{prepare_bp3d.py,inspect.mjs,package.json}` (gltf-transform 4.5.1
installed); `assets/ready/heart.glb` already built with `heart.build.json` and four preview
renders. **Missing:** attribution/licence, gate reports, procedural fallback, tool README.

**Completed by SES-ORCH-01 (all numbers measured, commands pasted in the reports):**
- `tools/mesh/build_tubes.mjs` — new. Programmatic `@gltf-transform/core` Document (chosen over
  a hand-rolled glTF writer: library owns padding/chunk framing/accessor min-max; 3-line
  comparison in `gate_report.md` §5). Catmull-Rom tubes over hand-placed centrelines →
  `assets/fallback/heart_tubes.glb`, 378,644 B, 20,786 tris, all five named nodes, 0 textures.
- `assets/ATTRIBUTION.md` — BodyParts3D provenance + both licence statements verbatim + sha256
  of every artifact + the **HD-07** block (licence conflict, see §6).
- `tools/mesh/gate_report.md` — structural gate, **measured** frame-rate gate, licence status,
  fallback readiness, honest caveats, reproduce commands.
- `assets/REPORT_mesh_gate.md` — human-readable decision: **ship `heart.glb`, keep the fallback
  built.**
- `tools/mesh/README.md` — full reproduction (Blender 5.2 path found at
  `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`, not on PATH) + "never do this" list.
- Lint: fixed `pipeline/encode.py:177` `sorted(unknown)[0]` → `min(unknown)` (FURB192); the other
  7 findings auto-fixed with `ruff --fix`; `prepare_bp3d.py` BLE001 resolved to a re-raising
  `except RuntimeError ... from exc`.

**Frame-rate evidence (asset-level harness, integrated GPU, 4× CPU throttle) — MEASURED:**

```
webgl.renderer: ANGLE (AMD, AMD Radeon (TM) Graphics (0x000015E7) Direct3D11 vs_5_0 ps_5_0, D3D11)
CPU: AMD Ryzen 5 5625U with Radeon Graphics   viewport 1156x720, DPR 1.25, 479 frames / 8.02 s
heart.glb       cpu4x:  fps_avg 60.0  fps_min 36.4  p95 17.50 ms  RESULT_30FPS PASS
heart_tubes.glb cpu4x:  fps_avg 60.0  fps_min 29.1  p95 17.50 ms  RESULT_30FPS PASS
heart.glb       none:   fps_avg 59.2  fps_min  8.6  p95 17.20 ms  RESULT_30FPS PASS
```
Caveats recorded in `gate_report.md` §3: display is 60 Hz so avg sits on the vsync ceiling
(p95 frame time is the discriminator); throttle barely binds because the workload is
GPU/vsync-bound; single-frame outliers are compile/GC hitches; **this measures the asset, not
the product — the in-app claim stays TARGET until Batch 3/4.**

**Verification run at close (2026-10-03 21:52):**
```
python -m ruff check . --output-format=concise   -> All checks passed!
python -m pytest -q                              -> 58 passed in 3.27s
cd web; npx vitest run                           -> 3 passed
cd web; npm run build                            -> tsc + vite ✓ built in 628ms
node tools\mesh\inspect.mjs assets\ready\heart.glb --out-dir assets\ready
  bytes=1409060 triangles=77824 materials=5 textures=0 drawCallEstimate=5
  required=ALL_PRESENT tris<=150k:true draws<=30:true textures==0:true bytes<=2.5MB:true centered:true
node tools\mesh\inspect.mjs assets\fallback\heart_tubes.glb --out-dir assets\fallback
  bytes=378644 triangles=20786 materials=5 textures=0 drawCallEstimate=5  (all budgets true)
gltf-validator: assets/ready/heart.glb errors=0 warnings=0 infos=0
                assets/fallback/heart_tubes.glb errors=0 warnings=0 infos=0
```

```text
PHASE:                     P0 / P1 (3D branch)
STATUS:                    CONDITIONAL PASS  (HD-07 only)
CONTRACTS IMPLEMENTED:     C-02 (registry structures validated), C-16 (structure budgets measured)
FILES CHANGED:             assets/ATTRIBUTION.md, assets/REPORT_mesh_gate.md,
                           tools/mesh/{gate_report.md,README.md,build_tubes.mjs,bench/index.html},
                           assets/fallback/heart_tubes.glb (+ .inspect.json),
                           assets/ready/heart.inspect.json, pipeline/encode.py
FILES NOT CHANGED:         Project/**, Progress.md until this entry, web/**, config/**, data/**,
                           README.md, docs/**, assets/raw/**, assets/ready/heart.glb
ARTIFACTS PRODUCED:        heart.glb sha256 f6fd044f86cb6ac8360bba2b4891ce07d341a4a9e9d6acdaef82b32f5e5d26b5
                           heart_tubes.glb sha256 fdb6cb98267da16b9b4b57fee1d352a47403a8533857b6d18d2ffd3e4fde4388
INTERFACES CHANGED:        none (C-01/C-02 untouched; no frozen contract read by a consumer yet)
TESTS RUN:                 ruff, pytest, vitest, npm run build, inspect.mjs ×2, gltf-validator ×2
TESTS PASSED:              ruff 0 findings · pytest 58 · vitest 3 · build ✓ · validator 0/0/0 ×2
TESTS FAILED:              none
EVIDENCE:                  tools/mesh/bench/bench_heart_cpu4x.png, bench_fallback_cpu4x.png,
                           tools/mesh/gate_report.md §3, assets/ready/heart.inspect.json
RUBRIC IMPACT:             3D Visualization (25%) — Oct 4 mesh gate decided with measured, not
                           guessed, evidence; three vessels are separately named/selectable and
                           pass every budget on integrated hardware.
KNOWN DEVIATIONS:          asset fps measured on an isolated harness, not the product (labelled);
                           Node 24 / Python 3.11 locally vs Tech_Stack pins (D-04)
OPEN BLOCKERS:             none
HUMAN DECISIONS REQUIRED:  HD-07 (licence conflict)
CONTRACT VERSION:          1.0.0
```

**Gate G0: PASS.** Clean-install path, pytest + vitest executable, `npm run build` path,
ownership map live, no architecture drift, lint clean.
**Gate G1b (3D): PASS conditional on HD-07.** Gate G1a (data): PASS — schema/checksum/encoding/
leakage suites all green.

### 2026-10-03 — SES-ORCH-01 — Orchestration recon + Batch 0 spawn

**ORIENT:** phase P0; entering Batch 0 of the derived execution topology (§11). Consumes
`C-01…C-05` as specs, Tech_Stack §27 pins, Hackathon rubric. Produces: repo skeleton, lockfiles,
dataset+checksum, feature schema, 3D route decision, traceability table.

**Recon evidence (this machine):**
```
git 2.53.0.windows.2 · node v24.13.0 · npm 11.6.2 · python 3.11.9 · pip 26.1.1
make  = NOT INSTALLED        blender = NOT in PATH        disk free = 66.6 GB
workspace before init: Project/ AGENTS.md Progress.md only
```
- `git init` done; Tech_Stack §17 skeleton created: `api assets config data docs pipeline tests tools web`.
- Toolchain deviations vs Tech_Stack §27 pins (Node 22, Python 3.12) recorded as decisions D-03/D-04 —
  evidence-first: pins tested empirically before any deviation is accepted.
- Batch 0 spawned as four non-overlapping agents (B0-1 foundation, B0-2 data/schema, B0-3 3D risk,
  B0-4 docs). **No commits made** — commit/push policy is an open item (see §9).

### 2026-10-03 — SES-00 — Bootstrap
- Read all seven `Project/*.md` source documents in full (Hackathon, Idea, Tech_Stack,
  Architecture, Contracts, Implementation_Plan, Final_demo).
- Created `AGENTS.md`: autonomous operating system for all sessions (startup protocol, operating
  loop, autonomy ladder + HD gates, parallel/subagent dispatch, engineering quality bar, 3D asset
  policy, verification + completion format, Progress.md protocol, cut order, anti-patterns).
- Created this coordination file.
- **Nothing implemented yet. Next session must start P0 per `Implementation_Plan.md` §10.**

## 4. Decision log

| Date | Decision | Options | Why | Rubric impact | Reversible |
|---|---|---|---|---|---|
| 2026-10-04 | **D-201** (SES-ORCH-03) Decision IDs **D-20x** reserved for the P6/P7/P8 session; D-10…D-19 remain SES-ORCH-02's range | continue shared sequential numbering (collision risk with a concurrent writer) / reserve a per-session range | two sessions append to one log concurrently; a range reservation written here is self-enforcing and needs no chat coordination | Technical (10%) — decision log integrity | yes |
| 2026-10-04 | **D-202** (SES-ORCH-03) `web/src/design/ramp.ts` is **THE single probability→colour function** (C-11 L354); scene material, legend, vessel tags, charts and readouts all import `probabilityToColour`; a second ramp anywhere is a defect | leave it implicit (risk: P5 scene builds its own ramp → two truths) / claim one module now while nobody has consumed it | AGENTS law 6 (one truth per thing) + C-11 L354 "one probability-to-colour function"; claiming before fan-out is exactly when this is cheap | 3D Visualization (25%) + Integration (15%) — colour consistency a judge can see across 3D, legend and cards | no (should not be undone) |
| 2026-10-04 | **D-203** (SES-ORCH-03) Decision glyphs fixed as **▲ above / △ below / ▨ indeterminate** (A2 shipped this), following AGENTS §6.1 and Final_demo.md:91, over the dispatch prompt's ▲/▼/▨ typo | rework component to ▼ / keep ▲△▨ / escalate HD-02 | two source documents agree on △; C-11 L350 encodes below as "lower intensity" (outline), not an inverted arrow; flagged in A2's report, not silently resolved | Interpretability (20%) — glyph set a judge sees on every readout | yes (one line) |
| 2026-10-04 | **D-204** (SES-ORCH-03) Playwright `@playwright/test@1.63.0` + chromium **pre-installed by the orchestrator before dispatch** (single writer, no npm races between parallel units); `web/package.json`/lock changed under my claim | let each unit install (npm race on node_modules) / no Playwright until P8 (VC-13 unexecutable during prep) | Tech_Stack §27 already lists Playwright 1.63 as the testing pin — no lock deviation; single-writer install removed a real parallel-work hazard | Technical (10%) — VC-13/VC-15 harness runnable from today | yes (remove dep + scripts) |
| 2026-10-04 | **D-10** This session executes **P2 first as an enabling batch**, then P3 → P4 ∥ P5A → P5B per the B2/B3 topology | stop and escalate (my named phases P3–P5 all blocked) · substitute a pre-made model (forbidden) · build P2 from the already-specified protocol | P2's method is fully fixed by Idea.md §4 + C-03/C-04 + VC-04 (nested 5×3/4, no SMOTE, Platt, max-F1 inner thresholds) — implementing a specified phase is execution, not design, so no HD-03 gate; everything downstream (P3 export, P4 parity, P5 truth) is impossible without it; deadline Oct 5–6 parity window | Predictive Performance (30%) — the origin of every Trust number and the entire runtime chain | yes (code-only; no contract change) |
| 2026-10-04 | **D-11** Install **Python 3.12.9** per-user and rebuild `.venv` on it; regenerate `requirements.lock.txt`; delete py311 venv | keep 3.11 + downgrade xgboost→3.2/numpy→2.4 (breaks library pins) · adopt the host's Python 3.14 (breaks the runtime pin) · leave env broken | Evidence-first per D-04: pinned installs provably fail on 3.11 (`Requires-Python >=3.12` for numpy 2.5 and xgboost 3.4); 3.12.9 is the pinned minor; CI already provisions 3.12, so local = CI = pins | Technical (10%) reproducibility — `make reproduce` and parity now run on the pinned runtime | yes (venv rebuild is minutes) |
| 2026-10-04 | **D-15** C-11 `SceneNode`/`SchematicPath` are opaque in the contract → `web/src/contracts/scene.ts` (P5A-1) is the single projection of them; scene-local stand-ins are temporary and get merged there at integration (C-CONF-03) | let both shapes coexist · make scene own the types · single projection in contracts | Contracts leave both opaque; two structurally divergent readings already broke `tsc` — one projection prevents drift ("one truth per thing") and keeps §51 untouched | Integration (15%) — scene/store/typecheck agree by construction | yes (type-only) |
| 2026-10-04 | **D-14** Shared TypeScript projections of C-07/C-08/C-09/C-11 contract types live in `web/src/contracts/**`, claimed by P5A-1; later units (P4 engine, P5B) consume read-only | P4 defines types when its engine starts · store defines locally · one shared projection module | Two units need identical contract types concurrently; one projection prevents drift and keeps "one truth per thing"; projections are verbatim contract text, never invented fields | Integration (15%) — worker/store/engine agree by construction | yes (types only, no logic) |
| 2026-10-04 | **D-16** The engine's single public entry is `web/src/domain/index.ts`: `loadEngine({model, registry}) → { modelId, execute(request: ComputeRequest): ComputeResponse }` plus `createCaseEncoder` — orchestrator-seeded as a throwing stub so P4-2/P4-M can typecheck in parallel; P4-1 replaces the implementation keeping signatures identical; no second engine entry point, no domain import anywhere else | let each consumer define its own entry · seed after P4-1 finishes (serial) · freeze one interface now | P4 units dispatch in parallel by standing order; a compile-time-frozen interface removes the only dependency that would force serial work; signatures are projections of C-07 operations (evaluate/explain/ladder/integrity), never invented fields | Integration (15%) — worker/engine/parity agree by construction; parity window Oct 5–6 protected | yes (type+stub only) |
| 2026-10-04 | **D-13** Author the C-05 cases artifact (`web/public/cases.json`) inside B3 as unit P3-3 | defer cases to P5B/P6 · omit `cases` from the manifest · create it now in B3 | C-01 requires the manifest to list every required artifact and the loader rejects incomplete bundles — P4 boots from the manifest, so cases must exist before G3; content is already fixed by C-05 + Final_demo §4 (hypo1/hypo2/cohort A+B/blank) | Integration (15%) — otherwise boot-blocked state at P4 | yes (artifact only) |
| 2026-10-04 | **D-12** Artifact layout: P2 writes canonical root `results.json`; P3 export produces byte-identical `web/public/results.json` + `web/public/model.json` (sha256 in manifest); model candidate intermediate `pipeline/artifacts/deployed_model.joblib` (build-only, gitignored) | results.json only under `web/public/` · root only · per-target files | Implementation_Plan P2 lists `results.json` as its output and P3 lists `web/public/results.json` as touched; one writer + a byte-identical copy test preserves one truth while satisfying both | Integration (15%) / Technical (10%): manifest hashes stay verifiable, no drift possible | yes |
| 2026-10-03 | Coordination via root `Progress.md`; source docs read-only | separate docs / chat history / one append-only file | Fresh sessions have no chat history; repository must be authoritative (Contract §62) | Enables all criteria via parallel work | yes |
| 2026-10-03 | Workspace root = repository root; app layout per Tech_Stack §17 at root (`config/ data/ pipeline/ web/ tests/ assets/ docs/`) with `Project/` kept as read-only source docs | nested `cortwin/` repo inside workspace | Avoids nested repo / CI path confusion; must be confirmed in P0 and recorded here | Technical (10%) reproducibility | yes, until first commit |
| 2026-10-03 | **D-03** No `make` on this Windows host → author canonical `Makefile` (Linux/CI truth per Tech_Stack) **plus** `make.ps1` shim exposing the same targets locally | install make (choco/scoop/admin) / use npm scripts only / Makefile + ps1 shim | Additive, zero-dependency, CI still runs the documented `make` targets | Technical (10%) reproducibility — `make reproduce` still proven in CI | yes |
| 2026-10-03 | **D-04** Present toolchain is Node **24.13** / Python **3.11.9** vs pins Node 22 / Python 3.12 → **evidence first**: B0-1 must attempt a full pinned install and report resolution errors before any pin is loosened | accept local versions silently / pre-install 3.12+22 / test pins then decide | Unpinned versions must never be silent (Tech_Stack §27 is law; deviation is a recorded decision) | Technical (10%) — reproducibility claim depends on this | yes (installing pinned runtimes later is cheap) |
| 2026-10-03 | **D-05** Batch topology derived from `Implementation_Plan.md` dependency graph rather than its phase order — see §11. Batch 0 = foundation gate; Batch 1 = data ∥ 3D ∥ test-infra (independent risk); Batch 2 = model→compile→oracle/parity; Batch 3 = runtime (engine/worker/store/scene); Batch 4 = UI surfaces; Batch 5 = hardening/deploy/docs | execute strictly phase-by-phase / batch topology with branch-level gates | Parallelism only where contracts frozen + ownership isolated + integration deterministic; phase order still governs *dependency*, not *scheduling* | Integration (15%) — judge sees one system built through verified handoffs | yes (replanned per evidence) |
| 2026-10-03 | **D-06** No git commits yet: `git init` only. Commit/push + public repo creation is a human-owned step (account, licence, submission repo) | auto-commit each batch / orchestrator commits / hold until human confirms | Committing without instruction violates standing rules; public repo needs human account anyway (P0 DoD) | Technical (10%) public repo required for submission | yes |
| 2026-10-03 | **D-07** Mesh route selected: **`assets/ready/heart.glb` primary**, procedural tubes kept built+verified as the ready fallback; 2D schematic not built | detailed mesh / procedural tubes / 2D schematic | Both primary and fallback measured PASS on integrated GPU (budgets + fps), so the higher-fidelity route scores 3D points and the fallback is insurance rather than necessity. Decided by evidence, ahead of the Oct 4 gate, without HD-05 (no qualitative trade remained once both measured green) | 3D Visualization (25%) — real anatomy vs schematic | yes (fallback one import away) |
| 2026-10-03 | **D-08** Split the frame-rate claim into **ASSET = MEASURED** (harness, integrated GPU, 4× throttle, p95 17.50 ms) and **PRODUCT = TARGET** until re-measured in the real app (Batch 3/4) | claim 30 fps now for the whole app / claim only the asset / claim nothing until the app exists | AGENTS §15 forbids presenting a design target as a measurement; the harness genuinely measures the asset but says nothing about UI/store/explanation overhead | 3D Visualization (25%) — honest measurement is itself scored | yes |
| 2026-10-03 | **D-09** Procedural-fallback builder implemented with programmatic `@gltf-transform/core` (already installed, MIT) rather than a hand-rolled glTF 2.0 writer | library Document API / manual JSON + buffer packing | Library owns padding, GLB chunk framing and accessor min/max; `gltf-validator` then reports 0 errors. Fewer failure modes, no new dependency | 3D Visualization + Technical (10%) | yes |

## 5. Open conflicts

_Never silently correct a source document — append contradictions here._

### 2026-10-06 — C-CONF-04: FM-01 vs FM-10 — results fetch failure classified G6 (boot block) in code, G5 (pane retry) in Architecture

- **Source A:** `Project/Architecture.md` FM-01 (~L976): artifact hash/schema mismatch →
  boot block (G6); FM-10 (~L985): **results fetch fails → G5** (pane-level recovery, Trust
  retry).
- **Source B (behaviour):** `web/src/boot/index.ts:405` emits `G6` on SHA-256 mismatch of ANY
  artifact including `results.json`; `boot.test.ts:553` asserts it; `resultsStatus` never
  becomes `"error"` anywhere, so Trust retry (`PaneShell onRetry`) is unreachable in production.
- **Status:** OPEN, non-blocking — runtime behaviour is the *stricter* one (fail-safe: a
  corrupted results artifact blocks boot rather than showing pane retry).
- **Impact if unresolved:** a transient results.json fetch failure (404/network) also
  hard-blocks the whole app instead of degrading to G5; Trust G5 retry stays dead code.
- **Resolution path:** contract-adjacent (Architecture §16 FM-10 vs C-01/C-06 integrity) —
  either erratum (integrity failure → G6; availability failure → G5) or acceptance that boot
  retry-until-success covers availability. Recorded per AGENTS §0 conflict rule; keep safe
  behaviour; escalate to HD gate if P8 offline/deploy smoke shows real risk.

### 2026-10-04 — C-CONF-03: two readings of C-11 `SceneNode`/`SchematicPath` (contracts projection vs scene module)

- **Observed:** P5A-1's `web/src/contracts/scene.ts` projected `SceneNode` as a post-load renderable
  (Object3D) and `SchematicPath` as `string`; P5A-2's `web/src/scene/types.ts` defines a PRE-render
  descriptor `{structureId, meshNode, neutral}` + structured `SchematicPath {d, labelAnchor,
  strokeWidth, origin}` (both reported in P5A-2's completion report, scene side marked
  `TODO(integration)`).
- **Conflicts with:** nothing in the SOURCE text — Contracts §8.1 C-11 leaves `SceneNode`/
  `SchematicPath` opaque, so both readings are contract-legal (this is an internal projection
  mismatch, not a source-document conflict). Recorded here because it breaks repo-wide `tsc` at
  integration if left.
- **Resolution (D-15, decided by SES-ORCH-02, no contract-text change):** `web/src/contracts/scene.ts`
  is the SINGLE projection; at G3/G5 integration it will carry the minimal structural forms both
  consumers share (`SceneNode` with `structureId`+`meshNode`; `SchematicPath` structured object with
  a string-assignable form), and `web/src/scene/types.ts` stand-ins are then removed by the scene
  owner. Contracts §51 process NOT triggered (opacity of C-11 preserved — no contract text edited).
- **Related open defect (owned by P5A-1-R):** `web/src/contracts/store.ts` TS2305 — `./artifacts`
  missing export `ResultsStatus` (sibling-reported; forbidden area for P5A-2).
- **Impact if unresolved:** repo-wide `tsc -p tsconfig.json --noEmit` fails at P5B integration.

### 2026-10-04 — C-CONF-02: commit `70e0b19` claims phases 1–3 complete; tree contains none of P2/P3

- **Observed:** `git log --oneline` → `70e0b19 Completed phase 1, phase 2 and phase 3 completely`;
  the committed tree holds only P0/P1 (Batch 0) output — no `pipeline/train.py`, no `results.json`,
  no `model.json`, no fixtures (verified 2026-10-04 by file inventory + `git ls-files`).
- **Conflicts with:** this file §1 (P2–P3 "not started") and the actual repository state.
- **Not resolved here.** Commit messages are not rewritten (D-06, agents never amend history).
  Safe behaviour: **the tree is truth, the message is not.**
- **Impact if unresolved:** a human or judge reading git history may believe the numerical phases
  are finished. Corrected in §1 and §3; when the public repository is created (human-owned),
  consider squashing/rewording before publication.
- **Escalated:** human — decide keep/reword/squash at public-repo creation (joins C-CONF-01).

### 2026-10-03 — C-CONF-01: a git commit exists, contradicting D-06

- **Observed:** `git log --oneline` → `b75ba3e first commit`; `git status` shows almost the
  whole tree as untracked, so that commit predates Batch 0's output.
- **Conflicts with:** D-06 ("no commits yet; commit/push is human-owned") as recorded by this
  session, and with the standing rule that agents never commit.
- **Not resolved here.** Safe runtime behaviour is unchanged: **no further commits will be made
  by any session.** Whether `b75ba3e` was created by the human or by an earlier agent is unknown.
- **Impact if unresolved:** the public-repo step (P0 DoD, human-owned) will inherit a commit whose
  authorship and content are unverified.
- **Escalated:** human — confirm the origin of `b75ba3e`, and decide whether to keep, amend or
  discard it when the public repository is created.

_No other source-document contradictions found this session._

## 6. Blockers & HD gates

### HD-07 — BodyParts3D licence conflict (OPEN, human decision)

```text
BLOCKED / Decision ID:        HD-07
Contract(s):                  C-01 (manifest / attribution)
Problem:                      Two official, CURRENT licence statements for BodyParts3D disagree:
                              the archive we downloaded from says CC BY 4.0; the originating
                              project site says CC BY-SA 2.1 JP (share-alike). They differ
                              exactly on whether share-alike attaches to heart.glb + previews.
Evidence:                     https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html
                                (retrieved 2026-10-03, "Last updated : 2025/02/27", CC BY 4.0)
                              https://lifesciencedb.jp/bp3d/info_en/license/index.html
                                (retrieved 2026-10-03, 「クリエイティブ・コモンズ 表示-継承2.1 日本」)
                              Full verbatim quotes: assets/ATTRIBUTION.md §1
Impact if unresolved:         the licence label on heart.glb/previews and the exact README credit
                              line stay provisional. Runtime, budgets and demo are unaffected.
Option A -> consequence:      Ship derivatives under CC BY-SA 2.1 JP with BOTH credit strings
                              displayed — satisfies either reading. **Already the interim state.**
Option B -> consequence:      Rely on the archive's CC BY 4.0 (newer, no share-alike) — simpler
                              redistribution, but rests on one of two conflicting statements.
Safety / privacy impact:      none (no patient data in any mesh)
Cost impact:                  none
Release impact:              README/ATTRIBUTION credit wording is provisional until confirmed;
                              the mesh itself can ship either way.
Required human decision:      confirm which statement governs derivatives of isa_BP3D_4.0_obj_99.zip
                              and approve the credit line for README + demo.
```

_Not blocking: Batch 1 data branch and non-scene work continue. Scene integration does not
depend on this — only the credit wording does._

## 7. Verification board

| ID | Verification | Status | Last command | Last run |
|---|---|---|---|---|
| VC-01 | Schema gate | **PASS** | `python -m pytest tests/test_schema.py -q` (11 tests: 54 features, 17/13/7/14/3, real-dataset gate, reject missing/extra column) | 2026-10-03 21:52 |
| VC-02 | Leakage gate | **PASS** | `python -m pytest tests/test_leakage.py -q` (9 tests: forbidden set exact, casefold, no proxy names, targets disjoint, doctored-config rejected) | 2026-10-03 21:52 |
| VC-03 | Encoding gate | **PASS** | `python -m pytest tests/test_encode.py -q` (16 tests: full-dataset round trip, unknown/out-of-range/non-finite raise, forbidden key rejected first, missing → None) | 2026-10-03 21:52 |
| VC-04 | Validation protocol gate | **PASS** | `python -m pytest -q` → 97 passed (protocol + C-04 schema + leakage-boundary suites incl. spy/mutation tests) · `python -m pipeline.reproduce` ×2 byte-identical `fc336660…` (2026-10-04 10:33–10:40) | 2026-10-04 10:40 |
| VC-05 | Compile gate | **PASS** | `python -m pipeline.manifest --require-all` → 6/6 OK, manifest sha `a2f9b3db…` · `python -m pytest -q` → 203 passed · ruff clean (2026-10-04 14:34) | 2026-10-04 14:34 |
| VC-06 | Parity gate (1e-5) | **PASS** | `npx vitest run src/domain` (12 blocking tests: 40/40 fixtures @1e-5/1e-6, report `8180ea40…`) + full suite 653 green (2026-10-04 16:28); Python reference 106+203 green | 2026-10-04 16:28 |
| VC-07 | Domain gate | **PASS** | `npx vitest run src/domain` → 12 blocking tests: 40/40 fixtures @1e-5/1e-6, report `8180ea40…` (G4, 2026-10-04 16:28) | 2026-10-04 16:28 |
| VC-08 | Store gate | **PASS** | store tests green inside full suite (`npx vitest run src/store` part of 1087; C-09 mutation-checked at G5) | 2026-10-06 11:40 |
| VC-09 | Registry gate | **PASS** | `python -m pytest tests/test_registry.py -q` (16 tests) + scene↔registry correspondence (`scene/schematic.test.ts:82`, picking identity) at G5 | 2026-10-04 23:00 |
| VC-10 | View-model gate | **PASS** | `npx vitest run src/scene` (94 tests) + stage 144 (budgets/stageSource) at G5 | 2026-10-04 23:00 |
| VC-11 | Copy gate | **PASS (re-run at copy freeze)** | `npx vitest run src/copy` → 19 passed (green in every run since 2026-10-04; included in G7 1087) | 2026-10-06 11:40 |
| VC-12 | End-to-end golden path | **PASS** | `npm run test:e2e` → 11/11 (golden journey: edit proof LCX 47→66 / RCA 59→75, banner stops×8, consoleErrors=0, evidenceRailMounted=2, crossOrigin=0) | 2026-10-06 11:40 |
| VC-13 | Request audit | **PASS (app-level)** | `npx playwright test e2e/request-audit.spec.ts` in full e2e → same-origin only, 0 websocket/beacon/analytics, mutation probe green (2026-10-06 11:40 run: `crossOrigin=0 nonGet=0 websockets=0 failed=0`) | 2026-10-06 11:40 |
| VC-14 | Budget gate | **asset-level PASS · app-level pending P8-PERF** | `node tools\mesh\inspect.mjs assets\ready\heart.glb` → all budgets true (77,824 tris, 5 draws, 0 textures, 1.41 MB); mesh bench p95 17.50 ms / min 36.4 fps @4× throttle; **in-app fps/p95/draw-calls = P8-PERF (dispatched 2026-10-06)** | 2026-10-03 21:52 |
| VC-15 | Deployment smoke | **PASS (local production preview)** | build ✓ + inline ALL CHECKS PASS + e2e deploy-smoke green + CSP byte-exact; **primary/mirror pending P8-DEPLOY** | 2026-10-06 11:40 |

## 8. Rubric scoreboard

| Criterion | Weight | Judge-visible proof | Status | Weakest link right now |
|---|---|---|---|---|
| Predictive Performance | 30% | Trust → Performance table w/ CIs, baselines, leakage audit | **G2–G4 PASS + Trust panes artifact-backed (G7)** — `results.json` deterministic (sha `fc336660…`); real values rendered + drill-downs (ROC-AUC 0.936 [0.905,0.963], Brier 0.089, threshold 0.375); parity 40/40 @1e-5; leakage pane from artifact probes | nested-CV evidence presentation final check at copy freeze |
| 3D Visualization | 25% | Three selectable vessels, live colour, ≥30 fps | **asset gate MEASURED + in-app live (G5/G6/G7)** — 77,824 tris, 5 draws; vessels selectable, live probability colour proven in e2e (LAD select, edit→colour change); mesh fallback built | **in-app fps/p95 measurement = P8-PERF (D-08 target→measured)** |
| Clinical Interpretability | 20% | Waterfall, measurements table, drill-down | **engine + UI proven** — exact SHAP both sides (4.9e-09 / parity 40/40); Inspector Why ≤1e-6 reconciliation + measurements rows×54 in e2e; Evidence Rail mounted w/ missingness honesty; Trust drill-downs (bin inspector, threshold slider, subgroup CIs) | copy freeze + camera-caption HD-02 review |
| System Integration | 15% | Edit → 3D+number+bar+waterfall sync; live parity check | **one coherent loop proven in real browser (G6/G7)** — boot→worker→probability→3D colour→explanation→edit→NEW values (LCX 47→66); Evidence Rail follows case live; IntegrityPane live digests + live engine parity run; one store/registry; banner×8; 0 console errors | G8 failure-path + perf verification |
| Technical Implementation | 10% | `make reproduce`, tests, model card, README coverage | **strong** — CI, lockfiles, reproduce deterministic ×3, **203 pytest + 1087 vitest + 11 e2e**, manifest inline verified, copy lint, mutation-proven blocking tests, ruff+tsc clean | model card, README updates, public repo, AI disclosure (P9) |

## 9. Open items / risks

| Item | Owner | Target | Notes |
|---|---|---|---|
| ~~Copy-lint finding in P5A-2's file~~ | — | — | **RESOLVED** — `web/src/scene/loadStructure.ts` grep clean; full copyLint green inside vitest 504 (2026-10-04 14:34) |
| `.gitignore` entries for `tools/qa/artifacts/`, `web/test-results/`, `web/playwright-report/` | SES-ORCH-02 (owns `.gitignore`) | done 2026-10-04 14:40 | requested by P68-A5; added at G3 record time |
| ~~P68 prep → integration wiring~~ | — | — | **DONE through G7** — panes mounted in shell (real `results.json` via `toTrustResults`), Evidence Rail mounted (P7-RAIL), ProbabilityReadout live, a11y/responsive sweep = P8-A11Y |
| TrustView loading/error/retry props unwired (`resultsStatus` never leaves `ready`; retry = dead code on ready path) | SES-ORCH-02 + future hardening | P8 | consequence of **C-CONF-04** — needs honest error source (integrity-fail vs availability-fail), never fabricate one |
| ~~Manifest inlining into `index.html` (C-01 L118)~~ | P4-M | done G4/G7 re-verified | build-time inline + integrity test; CSP byte-exact (verified again 2026-10-06 11:40) |
| ~~G3 gate: regenerate final manifest~~ | SES-ORCH-02 | done 2026-10-04 14:40 | `--require-all` 6/6, manifest sha `a2f9b3db…` |
| **HD-07** BodyParts3D licence conflict (CC BY 4.0 vs CC BY-SA 2.1 JP) | human | **Oct 4** | interim: ship BY-SA 2.1 JP with both credits; full text in `assets/ATTRIBUTION.md` |
| README must link `assets/ATTRIBUTION.md` + use the confirmed credit line | docs owner (B0-4 area) | before submission | B0-4 released before the attribution file existed; README currently has no asset credit |
| Origin of git commit `b75ba3e` (conflicts with D-06) | human | before public repo created | see §5 C-CONF-01 |
| In-app frame-rate re-measurement (product claim, not asset claim) | **P8-PERF (dispatched 2026-10-06)** | G8 | D-08: asset = MEASURED, product = TARGET until P8-PERF report |
| ~~Worker chunk not emitted~~ | — | done G4, re-verified G7 | `dist/assets/workerEntry-BRkAR9UX.js` 45,608 B emitted; e2e shows worker fetch (`workerUrls` audited) |
| Discord-only submission requirements | human project owner | before Oct 12 | HD-08 |
| Exact dataset acquisition + checksum | P1 data owner | **done 2026-10-03** | ✅ UCI 411 zipped+xlsx+csv in `data/raw/`, sha256 in `data/CHECKSUMS.txt`, CC BY 4.0 in `data/PROVENANCE.md`; HD-01 not triggered |
| Mesh gate decision (glTF vs procedural tubes) | P1 scene owner + human | **done 2026-10-03** | ✅ D-07: primary `heart.glb` measured PASS; fallback built+verified; HD-05 not required |
| Dataset units + licence verification | data/clinical reviewer | before UI finalisation | do not invent units (`test_units_remain_unverified` guards this) |
| Camera-caption review (cranial/caudal/LAO) | human clinical reviewer | before copy freeze | HD-02 |
| Observed-features-only attribution unit test | domain owner | before explanation UI | R-10, blocks shipping explanations |
| JS parity proven in-repo; G5 wiring must keep it honest | P5B + SES-ORCH-02 gate | G5 | parity report `8180ea40…`; store must never recompute (INV: engine truth only) |

## 10. Retrospectives

- **Batch 2 (2026-10-04):** harness aborted the first dispatch pair mid-flight, but P2-1 had
  already written ~80% of its files — **inventory the disk before any re-dispatch** (saved a full
  rebuild; would have caused duplicate conflicting work if a fresh agent had started over).
  Second dispatch pair carried explicit command-safety budgets (every call timed out, no
  loops/servers/REPLs, capped heavy invocations) and both ran to completion without a hang —
  keep that block in every future prompt. Also: run the gate **yourself** after agents report;
  the orchestrator's dual-reproduce hash check is the evidence, not the agent's summary.
- **Batch 0 (2026-10-03):** all four dispatched agents hit *something* — one API disconnect, one
  cert failure, two conditional passes. **Lesson: dispatch is not delivery.** Every batch needs an
  orchestrator-side inventory step that assumes a return value never arrives, because B0-3 had in
  fact finished 70% of its work (asset downloaded, Blender build run, glb produced) before dying,
  and a second full dispatch would have duplicated 142 MB of downloads. The lint gate should have
  run *inside* each agent's definition of done — 9 ruff findings survived to gate time and cost a
  repair cycle. Fixed-cost fix for Batch 1: put `ruff` + `pytest` in the DoD verbatim, and always
  ask an agent to state what already exists before it starts.
- **SES-00 → SES-ORCH-01:** source docs are aligned and complete; the real risk is not planning
  but *environment drift* (no `make`, wrong interpreter minor versions). Probe the toolchain before
  promising any gate will be green.

## 11. Orchestration map & batch plan (SES-ORCH-01)

Derived from `Implementation_Plan.md` dependency order + `Contracts.md` freeze order + actual repo
state (empty). **Scheduling ≠ phase order**: batches are cut where contracts are frozen and
ownership is disjoint; every gate is verified by the orchestrator against *evidence*, never against
an agent's claim.

| Batch | Units (parallel inside a batch) | Freezes / consumes | Exit gate |
|---|---|---|---|
| **B0 Foundation** | B0-1 toolchain+CI · B0-2 data/config/encode · B0-3 3D risk · B0-4 docs/traceability | repo, lockfiles, `config/*` schemas, dataset provenance | **G0**: clean install, pytest+vitest executable, `npm run build` path, ownership map (§2) live, no architecture drift |
| **B1 Risk** | data branch ∥ 3D branch ∥ test-infra, gated *separately* | `C-01` manifest draft, `C-02` registry, leakage gate, mesh route | **G1a data**: schema+checksum+encodings+leakage pass · **G1b 3D**: 3 vessels selectable, fps measured, primary/fallback route chosen (Oct 4) |
| **B2 Numerical** | model validation → representation frozen → compile → oracle → fixtures (strict chain, no compile on unstable output) | `C-03` model bundle, `C-04` results, `C-06` fixtures | **G2**: `results.json` + `model.json` + manifest + Python oracle all valid, `make reproduce` deterministic |
| **B3 Runtime** | domain engine · worker · store · registry/scene (each consuming frozen contracts only) | `C-07` protocol, `C-08` payloads, `C-09` store, `C-11` SceneModel | **G3**: Python↔TS parity @1e-5 on probability/margin/SHAP/modality/efficiency/missing-modality; input→store→worker→revision loop with stale rejection proven |
| **B4 Experience** | explore · trust · system · a11y/copy (fixtures allowed as anchors, mock ≠ runtime) | `C-10` URL grammar, `C-12` props, `C-13` copy, `C-16` budgets | **G4**: real e2e golden path boot→case→predict→3D→explain→edit→re-predict→Trust→System, no mocks/hardcodes, zero console errors |
| **B5 Hardening** | perf · security/request-audit · a11y · deployment · docs/demo | `C-15` CSP/request rules | **G5 + final**: VC-01…VC-15 green, fresh-browser deployment smoke, release checklist vs `Hackathon.md` |

**Branch-level rule (B1):** data gate pass + 3D conditional → model work proceeds, scene integration
holds. 3D pass + data fail → non-data 3D work proceeds, all numerical work blocks (HD-01).

**Current state:** B0 **complete 2026-10-03 22:05.** Gate **G0 = PASS**, **G1a data = PASS**,
**G1b 3D = PASS conditional on HD-07**. Next: open **Batch 1** — test-infra branch plus any
remaining P1 data work (B0-2 already delivered schema/leakage/encoding, so B1's data branch is
largely consumed); the real remaining Batch 1 surface is **C-01 manifest draft + C-02 registry
consumers + numerical prep (B2 entry conditions)**. Do not start B2 until `config/*` and the
registry are frozen as contracts, and do not start scene work until C-11 is frozen.

**Update 2026-10-04 (SES-ORCH-02):** B1 is effectively **consumed** (config/registry frozen and
validated by VC-01/02/03/09-file-level; mesh decision D-07; C-01 manifest itself lands inside B2/P3
as planned). `config/*` + registry ARE frozen → **B2 opened 2026-10-04 07:41 as units P2-1 ∥ P2-2**
(see §3 and §2 claims; cross-unit interface frozen there). C-11 is contract-frozen already, so
**P5A structure-side units may open in parallel with B2** (no shared files: scene/store/registry
consumers vs `pipeline/`) — deferred until P2 units are confirmed running cleanly. Strict chain
unchanged: **B2 (P2) → B3 = P3 compile/oracle/fixtures → B4 = P4 engine ∥ P5A structure →
integration → P5B** (P4's semantic engine stays single-owner per Implementation_Plan §P4 parallel
rules).

**Update 2026-10-04 14:40 (SES-ORCH-02): B3 + P5A CLOSED — G3 PASS, P5A structure PASS.**
B3/P5A had two harness cancellations (P3-2, P5A-1) recovered by disk-inventory + parallel
resume dispatch — both completed PASS; gate evidence is orchestrator-run (manifest `--require-all`
6/6, pytest 203, ruff, tsc 0, vitest 504). **B4 opened same second: P4-1 (engine+encoder+parity
self-check) ∥ P4-2 (worker+adapter) ∥ P4-M (manifest inline)** — parallelism inside P4 is
sanctioned by Implementation_Plan P4 Parallel Work (harness/isolated work YES; the semantic
engine stays single-owner in P4-1) and enabled by the **D-16 frozen engine interface**
(`web/src/domain/index.ts` seeded by the orchestrator, P4-1 replaces the stub). Next gate:
**G4** (full fixture parity @1e-5 + compute-protocol checks; worker/main-thread equivalence
orchestrator-verified), then **P5B** (real compute client wiring) and P6 mounting.

**Update 2026-10-04 16:45 (SES-ORCH-02): B4 CLOSED — G4 PASS (parity window met Oct 4).**
Units P4-1 ∥ P4-2 ∥ P4-M all PASS with orchestrator-run gate evidence (§3 16:45). The
single-semantic-owner rule held (P4-1 only), protocol/harness work ran in parallel against
the D-16 frozen interface, and P4-2's real-engine equivalence landed because P4-1's engine
shipped mid-batch. **Next: P5B** — real compute wiring (store ↔ ComputePort ↔ worker ↔
engine, manifest-driven boot loader, encoder attachment, degradation surfacing) + whatever
P5's own Parallel Work sanctions alongside it; then **G5**, then P6 mounting of P68's
surfaces (G6 = golden path e2e). B5 hardening follows per §11 batch table.
