# CorTwin — Progress

> Single coordination surface for all parallel sessions. Append; never rewrite history.
> Read `AGENTS.md` §10 before editing. Newest entries go at the TOP of each section.

## 0. Snapshot

- **Updated:** 2026-10-03 22:05 (session SES-ORCH-01 — Batch 0 complete, G0 evaluated)
- **Current phase:** P0 → **Batch 0 COMPLETE, gate G0 PASS**; Batch 1 (data ∥ 3D) ready to open
- **Overall progress:** 12% — foundation + data/schema/leakage + docs/traceability + 3D mesh gate all landed with evidence; no model, no runtime, no UI yet
- **Build health:** `python -m ruff check .` → *All checks passed!* · `python -m pytest -q` → **58 passed** · `npx vitest run` → **3 passed** · `npm run build` → ✓ built in 628ms (all run 2026-10-03 21:52)
- **Live URL:** none
- **Next dated deadline:** **Oct 4** — ✅ dataset acquired + checksummed · ✅ **mesh gate DECIDED** (primary mesh passes; fallback built+verified) · remaining Oct 4 item: HD-07 licence confirmation
- **ACTIVE SESSIONS**

| Session | Area | Files | Status | Updated |
|---|---|---|---|---|
| SES-ORCH-01 | Lead orchestrator — batch/gate control | `Progress.md` (sole writer), batch gates, `pipeline/encode.py` lint fix | active | 2026-10-03 |
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
| P2 Validation & training | Nested CV, calibration, thresholds, leakage lab, `results.json` | G2 | not started | — | — |
| P3 Compile & artifacts | `model.json`, manifest, Python oracle, golden fixtures | G3 | not started | — | — |
| P4 TS engine + worker | Engine, worker, parity harness @ 1e-5 | G4 | not started | — | — |
| P5 Store/registry/scene | One store, registry correspondence, 3D/2D source | G5 | not started | — | — |
| P6 Explore core | Flagship end-to-end golden path | G6 | not started | — | — |
| P7 Trust/System + P1 | Evidence surfaces, copy lint, integrity | G7 | not started | — | — |
| P8 Verification & deploy | Full VC chain, perf, security, primary+mirror | G8/G9 | not started | — | — |
| P9 Freeze, docs, video, submit | Submission package | G10 | not started | — | — |

## 2. Active claims

| Session | Claimed files / area | Claimed at | Released at |
|---|---|---|---|
| SES-ORCH-01 | `Progress.md`, batch gate decisions, repo root init · **added 22:05** `pipeline/encode.py` (one lint fix), all of `assets/**` `tools/mesh/**` (B0-3 area reclaimed after its agent died) | 2026-10-03 | — |
| B0-1 | `.gitignore` `Makefile` `make.ps1` `pyproject.toml` `requirements*.txt` `web/` root configs `.github/**` `tests/conftest.py` `tests/test_repo_smoke.py` `web/src/smoke.test.ts` | 2026-10-03 | 2026-10-03 (released at Batch 0 close) |
| B0-2 | `data/**` `config/**` `pipeline/**` `tests/test_schema.py` `tests/test_leakage.py` `tests/test_encode.py` `tests/test_registry.py` | 2026-10-03 | 2026-10-03 (released at Batch 0 close) |
| B0-3 | `assets/**` `tools/mesh/**` — **agent died mid-task (API error); area reclaimed by SES-ORCH-01 and completed** | 2026-10-03 | 2026-10-03 (completed by orchestrator) |
| B0-4 | `README.md` `docs/**` | 2026-10-03 | 2026-10-03 (released at Batch 0 close) |

_Prohibited to every subagent: `Progress.md` (orchestrator-only), `Project/**` (read-only),
and any path not listed in its own claim._

_Rule: claim before you touch. A claim with no release after your session ends is stale and may be
reclaimed by another session after it is logged here._

## 3. Work log (newest first)

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
| VC-04 | Validation protocol gate | not started | — | — |
| VC-05 | Compile gate | not started | — | — |
| VC-06 | Parity gate (1e-5) | not started | — | — |
| VC-07 | Domain gate | not started | — | — |
| VC-08 | Store gate | not started | — | — |
| VC-09 | Registry gate | **file-level PASS · correspondence pending** | `python -m pytest tests/test_registry.py -q` (16 tests incl. `test_structures_are_exactly_the_five_named_nodes`, `test_vessel_identity_chain_complete`); scene↔registry correspondence needs P5 | 2026-10-03 21:52 |
| VC-10 | View-model gate | not started | — | — |
| VC-11 | Copy gate | not started (banned-vocab scan of `docs/` was clean at 0 hits) | — | 2026-10-03 |
| VC-12 | End-to-end golden path | not started | — | — |
| VC-13 | Request audit | not started | — | — |
| VC-14 | Budget gate | **asset-level PASS · app-level pending** | `node tools\mesh\inspect.mjs assets\ready\heart.glb --out-dir assets\ready` → all budgets true (77,824 tris, 5 draws, 0 textures, 1.41 MB, centred); `gltf-validator` → `errors=0 warnings=0 infos=0` on both GLBs; frame-rate sub-check **measured PASS** (harness `tools/mesh/bench/index.html`, 4× CPU throttle, integrated AMD Radeon: heart.glb p95 17.50 ms, min 36.4 fps). App-level budgets need P5–P6 | 2026-10-03 21:52 |
| VC-15 | Deployment smoke | not started | — | — |

## 8. Rubric scoreboard

| Criterion | Weight | Judge-visible proof | Status | Weakest link right now |
|---|---|---|---|---|
| Predictive Performance | 30% | Trust → Performance table w/ CIs, baselines, leakage audit | **foundation ready** — schema/leakage/encoding gates green (58 tests); no model, no `results.json` yet | Batch 2 has not started: nested CV, calibration, thresholds |
| 3D Visualization | 25% | Three selectable vessels, live colour, ≥30 fps | **asset gate PASS + MEASURED** (77,824 tris, 5 draws, p95 17.50 ms on integrated GPU); fallback built & verified; **no scene in the app yet** | Batch 3/4: store↔registry↔three.js scene, live colour, in-app fps re-measurement |
| Clinical Interpretability | 20% | Waterfall, measurements table, drill-down | not started | no engine / no SHAP |
| System Integration | 15% | Edit → 3D+number+bar+waterfall sync; live parity check | not started | no store, no worker |
| Technical Implementation | 10% | `make reproduce`, tests, model card, README coverage | **partial** — CI workflow, lockfiles, Makefile+ps1, 58 pytest + 3 vitest, build path, 104-row traceability table exist; lint clean | no `make reproduce`, no public repo, no model card; `make` absent locally (D-03) |

## 9. Open items / risks

| Item | Owner | Target | Notes |
|---|---|---|---|
| **HD-07** BodyParts3D licence conflict (CC BY 4.0 vs CC BY-SA 2.1 JP) | human | **Oct 4** | interim: ship BY-SA 2.1 JP with both credits; full text in `assets/ATTRIBUTION.md` |
| README must link `assets/ATTRIBUTION.md` + use the confirmed credit line | docs owner (B0-4 area) | before submission | B0-4 released before the attribution file existed; README currently has no asset credit |
| Origin of git commit `b75ba3e` (conflicts with D-06) | human | before public repo created | see §5 C-CONF-01 |
| In-app frame-rate re-measurement (product claim, not asset claim) | P5 scene owner | Batch 3/4 | D-08: asset = MEASURED, product = TARGET until then |
| Discord-only submission requirements | human project owner | before Oct 12 | HD-08 |
| Exact dataset acquisition + checksum | P1 data owner | **done 2026-10-03** | ✅ UCI 411 zipped+xlsx+csv in `data/raw/`, sha256 in `data/CHECKSUMS.txt`, CC BY 4.0 in `data/PROVENANCE.md`; HD-01 not triggered |
| Mesh gate decision (glTF vs procedural tubes) | P1 scene owner + human | **done 2026-10-03** | ✅ D-07: primary `heart.glb` measured PASS; fallback built+verified; HD-05 not required |
| Dataset units + licence verification | data/clinical reviewer | before UI finalisation | do not invent units (`test_units_remain_unverified` guards this) |
| Camera-caption review (cranial/caudal/LAO) | human clinical reviewer | before copy freeze | HD-02 |
| Observed-features-only attribution unit test | domain owner | before explanation UI | R-10, blocks shipping explanations |
| JS parity unproven | engine owner | Oct 5–6 | golden fixtures from day one |

## 10. Retrospectives

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
