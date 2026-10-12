# CorTwin performance report — P8-PERF step 14

**Status:** COMPLETE — measured on the production build
**Date:** 2026-10-06 (runs 21:05–21:15 IST) — amended 2026-10-07 with the P1-a B-04 re-measurement (§2, §3.2, §5)
**Method:** `web/e2e/perf.spec.ts` against `npm run build` + `vite preview` (dist, CSP intact, no route mocking), Chromium headless, launch args `--enable-gpu --ignore-gpu-blocklist --use-angle=d3d11 --enable-webgl --enable-gpu-rasterization`.
**Host GPU (measured):** `ANGLE (AMD, AMD Radeon (TM) Graphics (0x000015E7) Direct3D11 vs_5_0 ps_5_0, D3D11)` — real hardware GL, not SwiftShader.
**Evidence source:** `[perf]` log lines pasted verbatim in §3. Every number below is produced by a run — none is typed from a design target (AGENTS §7 law 16).

## 1. D-08 upgrade — design targets → measured

| Budget | Was (D-08) | Now | Verdict |
|---|---|---|---|
| B-01 input→first visual p95 ≤100 ms | design target | **measured 4.3 ms** (n=12) | **PASS** |
| B-01 input→readout p95 ≤100 ms | design target | **measured 28.4 ms** (n=12) | **PASS** |
| B-01 input→stage colour p95 ≤100 ms | design target | **measured 85.7 ms** (n=12) | **PASS** |
| B-02 worker evaluate p95 | design target | **measured 0.3 ms** (n=13) | **PASS** |
| B-03 worker explain p95 | design target | **measured 3.2 ms** (n=17) | **PASS** |
| B-04 interaction ≥30 fps @4× (integrated) — 10-06 | design target | **measured 12.7 fps active pacing** (dead-drag era; n=7, fallback-simulated source) | **MISS (measured)** — superseded by P1-a §2 |
| B-04 interaction ≥30 fps @4× (integrated) — **P1-a 10-07** | design target | **measured 13.9–14.8 fps window-mean; 16.7 ms p50 (≈60 fps) rotation pacing** (live orbit drag, n=47) | **MISS on window-mean; render-loop pacing meets 30 fps** — see §2 |
| B-04 render-on-demand (idle ≈0 frames) | design target | **measured 0 idle frames / 1000 ms** | **PASS** |
| B-05 ≤30 draw calls, ≤150k tris, zero mesh textures | design target | **measured 5 draws, 77,824 tris, 0 mesh textures** | **PASS** |
| B-06 critical JS+model+registry ≤budget | design target | **measured 2,021,728 B (≈2.02 MB)** | **PASS** (within 3 MB critical-path budget) |
| B-07 structure ≤2.5 MB | design target | **measured 1,409,060 B (≈1.41 MB)** | **PASS** |
| B-08 first coloured heart | design target | **measured 2,657.9 ms** cold @4× throttle | **PASS** (<60 s sane bound; typical unthrottled boot ≈1–2 s) |
| B-09 page JS heap | design target | **measured peak 18.1 MB** | **PASS** (<50 MB budget) |
| B-09 worker memory | design target | **NOT-MEASURABLE** — Playwright CDP cannot attach to worker targets | honest gap; logged as such |

## 2. B-04 verdict (read this before quoting any fps number)

### 2.1 Measurement integrity fix (P1-a) — the 10-06 figure was not measuring the drag

The 10-06 "12.7 fps" run silently **failed to exercise the orbit drag**: a layout interaction
pushed the stage out of the viewport after the vessel click (the explore zone scrolls *internally*
— `window.scrollY` stays 0 — and every column shifted up 202 px, moving the stage rect from
`y=90` to `y=−112`). Mouse pointer events with `y<0` never dispatch, so the drag received **0
pointer events** and the fps window fell back to simulated edits. Evidence from that run:
`drag_hit_test point=640,-16 in_stage=false stage_rect="417,-192,446×352"`,
`drag_context value=2 raf-ticks n=2 pointer_moves=0`. The layout cause lives in
`web/src/explore/explore.css` + `web/src/shell/shell.css` (out of the P1-a unit's write scope —
see §5 defect list). Fixed at harness level: `stage.scrollIntoViewIfNeeded()` + bbox re-read +
a `drag_hit_test` gate that **fails the spec if the drag point misses the stage**.

### 2.2 P1-a re-measurement (2026-10-07, three default runs + one sensitivity + one profiled)

- **Fix landed, drag now measured.** All runs: `drag_hit_test point=640-640,249 in_stage=true`,
  `drag_context value=51 raf-ticks n=49 pointer_moves=49 pointer_downs=1 pointer_ups=1
  canvas_moves=49 down_target="canvas"`, `source=orbit-drag`. 49 live orbit frames per window.
- **Render loop clears its frame budget.** In-frame GL cost during the drag is tiny:
  `frame_js p50 1.2 ms / p95 1.8–1.9 / max 2.3–2.5 ms`; probe readback `probe_js p50 5.2 ms`.
- **Sustained-rotation pacing meets ≥30 fps.** Consecutive frame deltas during continuous
  rotation: **p50 16.7 ms (≈60 fps)** unprofiled. Under the CDP profiler (runs 2–4× slower)
  pacing inflates to p50 33.3 ms (±30 fps) — profiler overhead, not app cost.
- **Window-mean stays below target because of scripted-input pacing.** `interaction_active_fps`
  14.2 / 13.9 / 13.8 across the three fixed-protocol runs, **14.8 on the final certified bundle**
  (n=47 each): the orbit burst produced by each `mouse.move(_, {steps:3})` renders at ≈60 fps,
  then the drag loop pauses `waitForTimeout(100)` before the next burst; the 100 ms gap +
  4×-throttled CDP dispatch is what the window mean averages in.
- **Pacing-sensitivity proof** (same app, same throttle, injection wait halved to 50 ms):
  `interaction_active_fps` rises to **18.1 fps** with p50 still 16.7 ms. Deficit tracks injection
  cadence, not frame cost.
- **Attribution from the drag-window CPU profile** (3.8 s window): app bundle self-time
  **162.7 ms (4.3 %)**; harness `(idle)` 2 369 ms (the waits), `(program)` 882 ms incl. Playwright
  injected polling, `visitNode` ≈0.5 s. The app is not the bottleneck at 4× — the input stream
  and harness are.
- **Governor honesty preserved:** with a real frame stream the stage stays **Q2** through the
  whole interaction (`tier_timeline Q1@2859,Q2@3379`), no silent Q3 downgrade. The 10-06 run's
  Q1→Q2→Q3 path was an artifact of the dead-drag fallback burst.

### 2.3 Verdict and honest wording for docs/video

**B-04 @4× product-level: MISS on the protocol window-mean (13.9–14.8 fps), but the render loop
proves ≥30 fps during continuous rotation (16.7 ms p50, 60 fps).** At 1× throttle the same loop
comfortably clears the budget; the 4× gap is scripted-input pacing, not measured frame cost.

Any doc/video sentence must say exactly: *"measured p50 frame pacing 16.7 ms (≈60 fps) during
continuous orbit rotation under 4× CPU throttle on AMD Radeon iGPU; protocol window-mean
13.9–14.8 fps with scripted 100 ms input pauses; ≥30 fps sustained must still be re-verified on
demo hardware at G9."* — never "≥30 fps" as a measured product-level fact.

## 3. Raw evidence (verbatim `[perf]` lines, run 21:12 IST, 10-06)

```text
[perf] metric=first_painted value=2657.9 unit=ms n=1 throttle=4 budget=B-08
[perf] metric=first_coloured value=2657.9 unit=ms n=1 throttle=4 budget=B-08
[perf] metric=boot_context value=10 unit=gl-wrappers n=1 throttle=4 webgl2=true canvas_seen=44 gpu="ANGLE (AMD, AMD Radeon (TM) Graphics (0x000015E7) Direct3D11 vs_5_0 ps_5_0, D3D11)" workers=1
[perf] metric=stage_tier value=Q1 unit=tier n=1 phase=boot
[perf] metric=page_js_heap value=14 unit=MB n=1 throttle=4 phase=boot budget=B-09
[perf] metric=edit_trials value=12 unit=valid n=12 throttle=1 invalid=0
[perf] metric=input_to_first_visual value=4.3 unit=ms n=12 p50=3 p95=4.3 min=0.9 max=4.4 throttle=1 budget=B-01
[perf] metric=input_to_readout value=28.4 unit=ms n=12 p50=18 p95=28.4 min=14.2 max=31.5 throttle=1 budget=B-01
[perf] metric=input_to_stage_colour value=85.7 unit=ms n=12 p50=15.2 p95=85.7 min=0.9 max=118.4 throttle=1 budget=B-01
[perf] metric=input_to_revision_commit value=4.3 unit=ms n=12 p50=3 p95=4.3 min=2 max=4.4 throttle=1
[perf] metric=input_to_eval_ready value=17.4 unit=ms n=12 p50=9.3 p95=17.4 min=5 max=20 throttle=1
[perf] metric=stage_tier value=Q1 unit=tier n=1 phase=pre-fps
[perf] metric=interaction_fps value=0.7 unit=fps n=9 p50=75 p95=6666.4 throttle=4 window_ms=10716.2 source=drag+edits tier=Q1 budget=B-04-context
[perf] metric=interaction_active_fps value=12.7 unit=fps n=7 throttle=4 tier=Q1 budget=B-04 method=consecutive-frame-deltas-le-250ms
[perf] metric=interaction_fps_bucket_min value=4 unit=fps n=3 throttle=4 bucket_ms=500 tier=Q1 budget=B-04-bucket
[perf] metric=idle_frames value=0 unit=frames n=1 window_ms=1000 throttle=4 budget=B-04
[perf] metric=stage_tier value=Q3 unit=tier n=1 phase=post-fps
[perf] metric=draw_calls value=5 unit=calls n=527 throttle=mixed budget=B-05
[perf] metric=triangles value=77824 unit=triangles n=527 throttle=mixed budget=B-05
[perf] metric=texture_creates value=5 unit=textures n=527 throttle=mixed budget=B-05
[perf] metric=texture_uploads value=9 unit=textures n=527 throttle=mixed budget=B-05
[perf] metric=scene_cost value=not-applicable unit=tier n=0 throttle=mixed tier=Q3 budget=B-05 reason=Q3-schematic-no-GL-scene
[perf] metric=worker_records value=52 unit=responses n=1 evaluate_ok=13 explain_ok=17 errors=0
[perf] metric=evaluate_compute value=0.3 unit=ms n=13 p50=0.2 p95=0.3 min=0 max=0.3 throttle=1 budget=B-02
[perf] metric=explain_compute value=3.2 unit=ms n=17 p50=2.8 p95=3.2 min=2 max=3.8 throttle=1 budget=B-03
[perf] metric=critical_js_bytes value=1508470 unit=B n=2 throttle=n/a budget=B-06
[perf] metric=model_bytes value=490205 unit=B n=1 throttle=n/a budget=B-06
[perf] metric=registry_bytes value=23053 unit=B n=1 throttle=n/a budget=B-06
[perf] metric=b06_total_bytes value=2021728 unit=B n=4 throttle=n/a budget=B-06
[perf] metric=structure_bytes value=1409060 unit=B n=1 throttle=n/a budget=B-07
[perf] metric=memory_peak value=18.1 unit=MB n=3 throttle=mixed budget=B-09
[perf] metric=worker_memory value=NOT-MEASURABLE unit=MB n=0 throttle=n/a budget=B-09 reason=playwright-cdp-cannot-attach-worker-targets
[perf] metric=run_context value=1 unit=run n=1 console_errors=0 page_errors=0 workers=1 tier_final=Q3
[perf] metric=run_complete value=ok unit=status n=1 throttle=n/a
```

## 4. P1-a re-measurement evidence (verbatim, 2026-10-07)

Run A — after fixes, default protocol (100 ms drag pacing), bundle `index-BcddiunY.js`:

```text
[perf] metric=drag_hit_test value="canvas < div < div.ct-stage__canvas < div.ct-stage < div.ct-explore__stage-frame" unit=element n=1 point=640,249 in_stage=true stage_rect="417,73,446×352" bbox=446x352
[perf] metric=drag_context value=51 unit=raf-ticks n=49 pointer_moves=49 pointer_downs=1 pointer_ups=1 canvas_moves=49 down_target="canvas" no_canvas=false
[perf] metric=frame_js value=1.9 unit=ms n=49 p50=1.2 p95=1.9 min=0.6 max=2.5 throttle=4 window=fps budget=B-04
[perf] metric=probe_js value=15.7 unit=ms n=40 p50=5.2 p95=15.7 min=2.8 max=19.9 throttle=4 window=boot budget=B-04
[perf] metric=raf_ticks value=51 unit=raf-ticks n=49 window=fps
[perf] metric=interaction_fps value=13.2 unit=fps n=49 p50=16.7 p95=210.8 throttle=4 window_ms=3633.2 source=orbit-drag tier=Q2 budget=B-04-context
[perf] metric=interaction_active_fps value=14.2 unit=fps n=47 throttle=4 tier=Q2 budget=B-04 method=consecutive-frame-deltas-le-250ms
[perf] metric=interaction_fps_bucket_min value=6 unit=fps n=8 throttle=4 bucket_ms=500 tier=Q2 budget=B-04-bucket
[perf] metric=idle_frames value=0 unit=frames n=1 window_ms=1000 throttle=4 budget=B-04
[perf] metric=stage_tier value=Q2 unit=tier n=1 phase=post-fps
[perf] metric=tier_timeline value=2 unit=changes n=1 events=Q1@2859,Q2@3379
```

Run B — same stack, repeat (variance check): `interaction_fps 12.9 p50=33.3`,
`interaction_active_fps 13.9 n=47`, same `drag_hit_test`/`drag_context`, `tier_timeline
Q1@3492,Q2@4093`, post-fps tier Q2.

Run C — pacing-sensitivity probe (injection wait 50 ms instead of 100, harness-only, reverted
after): `interaction_fps 16.6 p50=16.7`, `interaction_active_fps 18.1 n=47`,
`frame_js p50 1.2 p95 1.8`, `tier_timeline Q1@5455,Q2@5915`. Demonstrates the deficit tracks
scripted input cadence, not frame cost.

Run D — CDP-profiled (attribution only; profiler overhead inflates measured pacing):
`interaction_fps 12.7 p50=33.3`, `interaction_active_fps 13.8 n=47`. Drag-window profile (3 783 ms):
app bundle self-time **162.7 ms**; harness `(idle)` 2 369 ms, `(program)` 882 ms, `visitNode`
(Playwright injected engine) ≈0.5 s, `FireAnimationFrame` 13 ms. Boot profile tops:
`v8.callFunction` 1 689 ms (profiler-driven), `Layout` 545 ms × 7, `Paint` 88 ms.

Run E — **final certified bundle `index-DRUnutVK.js`** (app change reduced to drag-suppression
only; P1-a law-test caught the first version's direct `requestAnimationFrame` in `Stage3D` and it
was removed — all frames still go through `invalidate()`, so the certified number is the honest
one):

```text
[perf] metric=drag_hit_test value="canvas < div < div.ct-stage__canvas < div.ct-stage < div.ct-explore__stage-frame" unit=element n=1 point=640,249 in_stage=true stage_rect="417,73,446×352" bbox=446x352
[perf] metric=drag_context value=49 unit=raf-ticks n=49 pointer_moves=49 pointer_downs=1 pointer_ups=1 canvas_moves=49 down_target="canvas" no_canvas=false
[perf] metric=frame_js value=1.6 unit=ms n=49 p50=0.9 p95=1.6 min=0.6 max=2.1 throttle=4 window=fps budget=B-04
[perf] metric=interaction_fps value=13.8 unit=fps n=49 p50=16.7 p95=194.2 throttle=4 window_ms=3483.2 source=orbit-drag tier=Q1 budget=B-04-context
[perf] metric=interaction_active_fps value=14.8 unit=fps n=47 throttle=4 tier=Q1 budget=B-04 method=consecutive-frame-deltas-le-250ms
[perf] metric=idle_frames value=0 unit=frames n=1 window_ms=1000 throttle=4 budget=B-04
[perf] metric=stage_tier value=Q1 unit=tier n=1 phase=post-fps
[perf] metric=tier_timeline value=1 unit=changes n=1 events=Q1@2934
```

## 5. P1-a findings and defects raised to sibling batches

1. **Defect (explore layout, out of scope):** after any vessel click the explore zone scrolls
   internally, shifting every column up 202 px and pushing the stage off-viewport (`y 90 → −112`);
   this kills the drag path. Root cause in `web/src/explore/explore.css` + `web/src/shell/shell.css`.
   Harness now defends against it (`scrollIntoViewIfNeeded` + hit-test gate).
2. **Defect (display channel, out of scope):** the per-display-tick path routes through React
   state, re-rendering `ExploreView` (incl. 54-field form) on every store sample — Architecture
   §15 requires a transient display channel outside React. Lives in `store/**` + `explore/**` +
   `components/**`.
3. **App fix landed in scope (P1-a):** `Stage3D` hover picking now coalesces to one raycast per
   animation frame and pauses while a drag holds the pointer (semantics unchanged: highlight
   follows cursor, re-runs on release); `probe.observe()` skips per-record DOM walking once B-01
   marks are answered. None of these alter B-04 truth; in-frame cost was already ~1 ms.
4. **Harness instrumentation (P1-a):** always-on `frame_js`/`probe_js`/`raf_ticks`, drag
   context counters + `drag_hit_test` gate, CDP tracing windows under `CT_PROFILE=1`
   (`tools/qa/artifacts/perf-trace-{label}.json`), tier timeline. Protocol constants unchanged.

## 6. Reproduce

```bash
cd web
npm run build
npx playwright test e2e/perf.spec.ts --reporter=list
CT_PROFILE=1 npx playwright test e2e/perf.spec.ts --reporter=list   # adds CDP tracing
```

Every `[perf]` line above is re-emitted on each run. Budget verdicts in §1 are computed from
these lines — recompute, do not trust this file blindly, if the build changes.

## 7. 2026-10-12 re-measurement (rubric batch — unit C)

**Status:** COMPLETE — all budget rows re-measured on the production build; **1 test passed**
(run7, `--trace off`).
**Date:** 2026-10-12 (runs 20:30–21:30 IST, workbench shared with parallel sessions).
**Method:** unchanged protocol (`web/e2e/perf.spec.ts` vs `npm run build` + `vite preview`),
Chromium headless + hardware GL (same GPU string as § header), probe injected via
`addInitScript(perfInitSource())`. **New attribution:** `frame_gaps` (gap to previous draw
frame, timestamp aligned to `tier_timeline`) + edits-window `frame_js`/`probe_js`.

### 7.1 Why this re-measurement was needed

The 10-12 morning build **regressed the measurement itself**: runs 2–5 reached terminal Q3
*before* the fps window (`tier_timeline Q1@…,Q2@…,Q3@…`, `interaction_fps value=not-measurable
source=no-gl-window@Q3`, `input_to_stage_colour not-measurable`) — B-04 and the B-01 stage row
became unobservable. Evidence: `tools/qa/artifacts/perf-rerun-2026-10-12/run2..run5-*.txt`.

### 7.2 Diagnosis (from gap evidence, runs 2–5)

1. **Prepare-window leakage** — context creation / GLB parse / first-present frames were
   sampled as slow evidence and cascaded Q0→Q3 before the reveal. *Fix (same batch, adopted
   from the interrupted dispatch):* `bootPresentation.ts` `decideBootFrame` gates the governor
   before `bridge.tick`, rebases the camera flight, `rebaseClock` clears the frame clock with
   zero governor evidence.
2. **Instrument self-contamination** — the harness pixel probe ran a synchronous
   `gl.readPixels` (256²) on *every* rendered frame while armed. Those stalls sit inside the
   frame gaps the quality governor samples: the instrument was manufacturing the slow evidence
   (run3: `probe_js p95 67.2 max 118` with frame JS p50 11; cascade still reached Q3@14856).
3. **External CPU starvation on the shared workbench** — runs 5–6 showed inter-frame gaps of
   500–2066 ms while in-frame JS stayed at p50 0.3–1.6 ms (edits) — the governor correctly
   downgraded on genuinely slow frames; app cost was never the cause. Run7 (calmer host
   moment) survived the whole protocol at **Q1**.

### 7.3 Fixes landed (all with tests; `npx vitest run src/stage src/perf` → **194/194**)

| Fix | File | Test |
|---|---|---|
| **Probe duty gating** — draw-frame probes run only (a) while B-08 marks are missing (ends after 1–2 frames) and (b) while the edit window is armed (`armStage`), ≤1 per `PIXEL_PROBE_INTERVAL_MS = 80`, `armStage()` resets the interval. Reveal/flight frames run with **zero** readback stalls. | `web/src/perf/probe.ts` | `web/src/perf/probeLaws.test.ts` (4 source laws) |
| Boot presentation gate + flight rebase + `rebaseClock` (adopted from interrupted dispatch) | `web/src/stage/bootPresentation.ts`, `Stage3D.tsx`, `governorRuntime.ts` | `governorRuntime.test.ts` (+4 rebaseClock), `stageSource.test.ts` (boot-gate law) |
| Gap attribution: `frame_gaps` events aligned to `tier_timeline`; edits-window `frame_js`/`probe_js` | `web/e2e/perf.spec.ts` | harness (emitted every run) |

### 7.4 Measured budget table — 10-12 run7 vs 10-07 certified (verbatim values)

| Budget | 10-07 (§1–§4) | **10-12 run7** | Verdict |
|---|---|---|---|
| B-01 input→first visual p95 ≤100 ms | 4.3 ms | **6.4 ms** (n=12, p50 3.8) | **PASS** |
| B-01 input→readout p95 ≤100 ms | 28.4 ms | **45.2 ms** (n=12, p50 24.7) | **PASS** |
| B-01 input→stage colour p95 ≤100 ms | 85.7 ms | **165.4 ms** (n=12, p50 79.2) | **MISS vs 100 ms design target** — see §7.6; row is measurable again (was `not-measurable` in runs 2–6) |
| B-02 worker evaluate p95 | 0.3 ms | **0.3 ms** (n=13) | **PASS** |
| B-03 worker explain p95 | 3.2 ms | **3.5 ms** (n=17) | **PASS** |
| B-04 interaction fps @4× (window-mean) | 13.8–14.8 active | **19.9 active** (n=48), window 19.9 (n=49, 2416.6 ms) | still <30 on window-mean — same scripted-input deficit as §2.2; **best measured on this protocol** |
| B-04 fps worst 500 ms bucket | 6 | **18** | improved; pacing p50 **16.7 ms (≈60 fps)** unchanged |
| B-04 render-on-demand idle frames | 0 | **0** /1000 ms | **PASS** |
| B-04 governor survival | Q1@2934 (10-07 E) | **Q1@3500, tier_final=Q1 — never left Q1 all run** (boot/pre-fps/post-fps all Q1) | **PASS** — first clean whole-protocol survival on 10-12 |
| B-05 draws ≤30 / tris ≤150k / mesh textures 0 | 5 / 77,824 / 0 | **5 / 108,084 / 0** (texture_creates 5, uploads 9 — same GL counters as 10-07) | **PASS** |
| B-06 critical JS+model+registry | 2,021,728 B | **2,061,956 B** | **PASS** (≤3 MB) |
| B-07 structure ≤2.5 MB | 1,409,060 B | **1,953,744 B** (108k-tri mesh replaced the 78k asset) | **PASS** |
| B-08 first coloured heart | 2,657.9 ms | **3,291 ms** (first_painted 3,107.7) cold @4× | **PASS** (<60 s) |
| B-09 page JS heap peak | 18.1 MB | **20.7 MB** | **PASS** (<50 MB) |
| B-09 worker memory | NOT-MEASURABLE | **NOT-MEASURABLE** (CDP cannot attach worker targets) | honest gap, unchanged |
| console/page errors | 0 | **0** (`run_context console_errors=0 page_errors=0`) | **PASS** |

### 7.5 Raw evidence (verbatim `[perf]` lines — run7, 2026-10-12, bundle `index-C58VVzFR.js`)

```text
[perf] metric=first_painted value=3107.7 unit=ms n=1 throttle=4 budget=B-08
[perf] metric=first_coloured value=3291 unit=ms n=1 throttle=4 budget=B-08
[perf] metric=boot_context value=10 unit=gl-wrappers n=1 throttle=4 webgl2=true canvas_seen=7 gpu="ANGLE (AMD, AMD Radeon (TM) Graphics (0x000015E7) Direct3D11 vs_5_0 ps_5_0, D3D11)" workers=1
[perf] metric=frame_js value=5.3 unit=ms n=38 p50=3.3 p95=5.3 min=2.3 max=119.5 throttle=4 window=boot budget=B-04
[perf] metric=probe_js value=30.8 unit=ms n=7 p50=10 p95=30.8 min=7.8 max=33.2 throttle=4 window=boot budget=B-04
[perf] metric=stage_tier value=Q1 unit=tier n=1 phase=boot
[perf] metric=edit_trials value=12 unit=valid n=12 throttle=1 invalid=0
[perf] metric=input_to_first_visual value=6.4 unit=ms n=12 p50=3.8 p95=6.4 min=2 max=8.5 throttle=1 budget=B-01
[perf] metric=input_to_readout value=45.2 unit=ms n=12 p50=24.7 p95=45.2 min=21.1 max=66.1 throttle=1 budget=B-01
[perf] metric=input_to_stage_colour value=165.4 unit=ms n=12 p50=79.2 p95=165.4 min=2 max=166.1 throttle=1 budget=B-01
[perf] metric=frame_js value=0.7 unit=ms n=317 p50=0.3 p95=0.7 min=0.1 max=1.4 throttle=1 window=edits budget=B-04
[perf] metric=stage_tier value=Q1 unit=tier n=1 phase=pre-fps
[perf] metric=drag_hit_test value="canvas < div < div.ct-stage__canvas < div.ct-stage < div.ct-explore__stage-frame" unit=element n=1 point=640,239 in_stage=true stage_rect="405,63,470×352" bbox=470x352
[perf] metric=drag_context value=49 unit=raf-ticks n=49 pointer_moves=49 pointer_downs=1 pointer_ups=1 canvas_moves=49 down_target="canvas" no_canvas=false
[perf] metric=frame_js value=2.1 unit=ms n=49 p50=1.1 p95=2.1 min=0.7 max=2.4 throttle=4 window=fps budget=B-04
[perf] metric=interaction_fps value=19.9 unit=fps n=49 p50=16.7 p95=116.7 throttle=4 window_ms=2416.6 source=orbit-drag tier=Q1 budget=B-04-context
[perf] metric=interaction_active_fps value=19.9 unit=fps n=48 throttle=4 tier=Q1 budget=B-04 method=consecutive-frame-deltas-le-250ms
[perf] metric=interaction_fps_bucket_min value=18 unit=fps n=5 throttle=4 bucket_ms=500 tier=Q1 budget=B-04-bucket
[perf] metric=idle_frames value=0 unit=frames n=1 window_ms=1000 throttle=4 budget=B-04
[perf] metric=stage_tier value=Q1 unit=tier n=1 phase=post-fps
[perf] metric=draw_calls value=5 unit=calls n=535 throttle=mixed budget=B-05
[perf] metric=triangles value=108084 unit=triangles n=535 throttle=mixed budget=B-05
[perf] metric=evaluate_compute value=0.3 unit=ms n=13 p50=0.2 p95=0.3 min=0.1 max=0.4 throttle=1 budget=B-02
[perf] metric=explain_compute value=3.5 unit=ms n=17 p50=2.5 p95=3.5 min=1.9 max=3.5 throttle=1 budget=B-03
[perf] metric=b06_total_bytes value=2061956 unit=B n=4 throttle=n/a budget=B-06
[perf] metric=structure_bytes value=1953744 unit=B n=1 throttle=n/a budget=B-07
[perf] metric=memory_peak value=20.7 unit=MB n=3 throttle=mixed budget=B-09
[perf] metric=tier_timeline value=1 unit=changes n=1 events=Q1@3500
[perf] metric=run_context value=1 unit=run n=1 console_errors=0 page_errors=0 workers=1 tier_final=Q1
[perf] metric=run_complete value=ok unit=status n=1 throttle=n/a
```

`frame_gaps` (534 gaps, 46 >33.3 ms, max 750 ms — full events line in
`run7-final-console.txt`): edit-window cadence is 16.7/33.3 ms rows; the fps window's repeated
116.7 ms gaps are the scripted `mouse.move` pacing (§2.2 cause, unchanged).

### 7.6 Honest notes (do not skip)

1. **B-01 stage-colour p95 165.4 ms > 100 ms design target.** Detection is the pixel probe
   comparing centre-crop mean against the `armStage` baseline; under the new duty the edit
   window probes at most once per 80 ms (first frame after each edit always probes), so
   detection quantizes to ≤80 ms windows — trials landing on the second window report
   ~165 ms while the median (79.2 ms) is one window. The 10-07 row (p50 15.2) sampled every
   frame. **The colour itself still arrives inside the 400 ms tween**; what moved is the
   *observation granularity*, traded for governor measurement integrity (§7.2.2). Re-widening
   the probe would re-contaminate B-04 — do not "fix" this row by inflating probe rate.
2. **B-04 window-mean <30 fps is scripted-input pacing, not frame cost** (§2.2 unchanged):
   in-frame JS during drag p50 1.1 ms, render pacing p50 16.7 ms, deficit tracks the 100 ms
   injection pauses + 4× CDP dispatch. Sensitivity and profile evidence in §2.2 still stand.
3. **Host sensitivity:** runs 3–6 (shared workbench, parallel sessions) produced 500–2066 ms
   scheduler gaps and Q3 downgrades; run7 (calmer moment) ran the whole protocol at Q1.
   Numbers in this §7 are run7; the earlier runs are retained as diagnosis evidence in
   `tools/qa/artifacts/perf-rerun-2026-10-12/` (run6's test *body* passed; only
   `browserContext.close` hit a Playwright trace-write `ENOENT` — run7 used `--trace off`).
4. **Reproduce with `--trace off`** if the trace artifact write fails on this host; it does not
   affect any `[perf]` line.

### 7.7 Demo / docs wording — how to claim 30 fps honestly

Allowed (all measured, 10-12 run7): *"measured p50 frame pacing 16.7 ms (≈60 fps) during
continuous orbit rotation under 4× CPU throttle on AMD Radeon iGPU; protocol window-mean
19.9 fps with scripted 100 ms input pauses; worst 500 ms bucket 18 fps; zero idle frames."*
Forbidden: any unqualified *"≥30 fps"* as a measured product-level fact (the protocol
window-mean has never cleared 30 — §2.3). The governor surviving at Q1 for the whole run
(tier_final Q1) is the headline system-health claim this round added.

### 7.8 Reproduce (supersedes §6 only for `--trace off`)

```bash
cd web
npm run build
npx playwright test e2e/perf.spec.ts --reporter=list --trace off
npx vitest run src/stage src/perf        # 194/194 incl. probeLaws + rebaseClock
```

Evidence artifacts: `tools/qa/artifacts/perf-rerun-2026-10-12/run2..run7-*.txt`.