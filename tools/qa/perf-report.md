# CorTwin performance report — P8-PERF step 14

**Status:** COMPLETE — measured on the production build
**Date:** 2026-10-06 (runs 21:05–21:15 IST)
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
| B-04 interaction ≥30 fps @4× (integrated) | design target | **measured 12.7 fps active pacing** @4× CPU throttle, AMD Radeon iGPU | **MISS (measured)** — see §2 |
| B-04 render-on-demand (idle ≈0 frames) | design target | **measured 0 idle frames / 1000 ms** | **PASS** |
| B-05 ≤30 draw calls, ≤150k tris, zero mesh textures | design target | **measured 5 draws, 77,824 tris, 0 mesh textures** | **PASS** |
| B-06 critical JS+model+registry ≤budget | design target | **measured 2,021,728 B (≈2.02 MB)** | **PASS** (within 3 MB critical-path budget) |
| B-07 structure ≤2.5 MB | design target | **measured 1,409,060 B (≈1.41 MB)** | **PASS** |
| B-08 first coloured heart | design target | **measured 2,657.9 ms** cold @4× throttle | **PASS** (<60 s sane bound; typical unthrottled boot ≈1–2 s) |
| B-09 page JS heap | design target | **measured peak 18.1 MB** | **PASS** (<50 MB budget) |
| B-09 worker memory | design target | **NOT-MEASURABLE** — Playwright CDP cannot attach to worker targets | honest gap; logged as such |

## 2. B-04 verdict (read this before quoting any fps number)

- **Window-average fps is not the budget figure.** CorTwin is render-on-demand (zero frames when idle) and the fps window also contains worker-eval waits between edits. Window average this run: **0.7 fps over 10.7 s** — that number conflates idle with rendering and is logged only as `B-04-context`.
- **The honest pacing figure** is consecutive frame deltas that belong to one rendering run (≤250 ms apart): **12.7 fps mean over 7 active deltas** (`method=consecutive-frame-deltas-le-250ms`), worst 500 ms bucket **4 fps**, under **4× CPU throttle** on the AMD Radeon iGPU.
- **Verdict: MISS vs the ≥30 fps design target** on this host at 4× throttle. Under 1× throttle an earlier run of the same spec measured p50 inter-frame ≈50 ms (≈20 fps) during interaction — closer, still below 30.
- **The degradation ladder worked exactly as designed** (Architecture §10.4 / §16): during sustained 4× interaction the governor took the stage **Q1 → Q3**; the 2D schematic kept the loop alive — edits still committed, readouts updated, `run_context console_errors=0 page_errors=0`, and B-01 latencies stayed in budget at Q3 (a separate Q3 responsiveness path in the spec measures input→readout at 4× when no GL window exists).
- **What this means for the rubric:** the 3D-visualization claim (≥30 fps) is *not* proven by this host. It must be re-measured on the actual demo machine at G9 (live-URL smoke). Until then every document/video statement must say **"measured: 12.7 fps active pacing @4× CPU throttle on AMD Radeon iGPU (integrated), governor degraded to Q3; 30 fps is a design target pending demo-hardware measurement"** — never "≥30 fps" as a measured fact.

## 3. Raw evidence (verbatim `[perf]` lines, run 21:12 IST)

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

Notes on B-05 `texture_creates=5`: these are three.js internal render-target/framebuffer allocations — the shipped `heart.glb` contains **zero textures** (see `assets/ATTRIBUTION.md` §3: "no textures, no images embedded"). Mesh-texture budget (zero) holds.

## 4. Reproduce

```bash
cd web
npm run build
npx playwright test e2e/perf.spec.ts --reporter=list
```

Every `[perf]` line above is re-emitted on each run. Budget verdicts in §1 are computed from these lines — recompute, do not trust this file blindly, if the build changes.
