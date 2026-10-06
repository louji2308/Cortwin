# CorTwin — P8 Performance Measurement Protocol (C-16 budgets B-01 … B-12)

**Source of truth:** `Project/Contracts.md` §10.3 `C-16` (lines 454–470), consumed per
`Implementation_Plan.md` P8 step 14 (measure p95 input→visual change, four-target
evaluation, explanation, interaction frame rate, triangle count, draw calls, JS/model/
registry/structure sizes, first coloured heart, page/worker memory).
**Owner:** unit P68-A5. **Status of this document:** protocol — measurements are executed
when the consuming subsystem lands (see "Blocked on" per budget).

## 0. Labelling rule (non-negotiable — AGENTS §7 rule 16)

> Every number in any report MUST carry `TARGET` or `MEASURED`. A design target is never
> presented as a measurement. `MEASURED` requires: the command/tool that produced it, the
> date, the machine context, and the artifact the raw numbers live in.

Current labels in this table:

| Label | Meaning |
|---|---|
| **TARGET** | contract goal; method below is agreed but **not yet executed** (or executed only on a subset that does not cover the budget's scope) |
| **MEASURED** | executed on the stated scope, date and artifact |

**Reference machine (all future measurements must record theirs):** AMD Ryzen 5 5625U with
Radeon integrated graphics (Windows, 60 Hz display) — the same class of hardware as the
2026-10-03 asset-level gate (`tools/mesh/gate_report.md`).

## 1. Budget table

| ID | Target | Method | Tool | Status |
| -- | ------ | ------ | ---- | ------ |
| `B-01` | p95 input → first display update ≤100 ms | instrument the store commit → render path with `performance.mark` (`corTwin:edit` → `corTwin:firstPaint`); run ≥30 scripted edits through the golden path; compute p95 over trials | performance marks + `PerformanceObserver` read back via Playwright `page.evaluate`, p95 computed in Node | **TARGET** (no store/edit path exists yet) |
| `B-02` | four-target evaluation ≤15 ms | benchmark the pure engine over the golden fixture corpus (all 4 targets, warm + cold); report median/p95/max per case | benchmark fixtures (vitest bench or Node `performance.now()` harness over `tests/fixtures`) | **TARGET** (engine lands in P4) |
| `B-03` | selected-target explanation ≤60 ms off-thread | same fixture corpus, explanation path, measured **inside the worker** (timing reported over the C-07 response, not the main thread) | benchmark fixtures + worker `performance.now()` | **TARGET** (worker lands in P4) |
| `B-04` | ≥30 fps during interaction (integrated graphics) | scripted interaction (rotate/zoom/select + field edits) for ≥10 s under **Chrome CPU throttle 4×**; rAF frame sampler → fps avg/min and p95 frame time; render-on-demand must show ~0 frames while idle | Playwright CDP `Emulation.setCPUThrottlingRate(4)` + in-page rAF sampler (same harness style as `tools/mesh/bench`) | **TARGET** at product level; asset-level only, measured 2026-10-03 → see §2 |
| `B-05` | ≤150k triangles, ≤30 draw calls, 0 textures | read `renderer.info.render.triangles`, `renderer.info.render.calls`, `renderer.info.memory.textures` after scene settle, for primary + fallback structure sources | three.js scene statistics via Playwright `page.evaluate` debug hook | **TARGET** at product level; asset-level measured 2026-10-03 → see §2 |
| `B-06` | critical JS + registry + model ≤1.5 MB | sum raw bytes of the critical chunk(s) in `web/dist/assets/*.js` + `registry` payload + `model.json` from a clean `npm run build`; also report gzip | build report (filesystem sizes from `dist/`, gzip via build output) | **component MEASURED 2026-10-04 (scaffold JS, §2); budget TARGET overall** — registry + model do not exist yet |
| `B-07` | structures ≤2.5 MB | sum bytes of structure assets actually shipped in `dist/` (heart/primary + fallback when bundled) | build report (filesystem sizes) | **TARGET** (no structure asset is in `dist/` yet); asset files themselves measured 2026-10-03 → see §2 |
| `B-08` | first coloured heart ≤3 s | mark from `performance.timeOrigin` to the first frame in which the heart renders with probability colouring; cold load, no cache, throttled CPU 4× | performance marks emitted by the scene + Playwright trace | **TARGET** (no scene yet) |
| `B-09` | page ≤300 MB, worker ≤100 MB | sample `Performance.getMetrics` (JSHeapUsedSize + process working set) on the page target and on the worker target during the full golden path; report peak | Chrome DevTools Performance/Memory profiler + CDP `Performance.getMetrics` (Playwright session) | **TARGET** (no worker/page workload yet) |
| `B-10` | accessibility requirements met | automated audit (Lighthouse/axe-class a11y run) **plus** manual pass: full keyboard golden path, `aria-live` probability announcements, reduced-motion, AA contrast, 1366×768 | browser accessibility audit + manual checklist (AGENTS §6.1) | **TARGET** (scope is the frozen app) |
| `B-11` | evergreen browsers, WebGL2 preferred, 2D fallback | browser matrix run: chromium (installed) + firefox/webkit at P8; WebGL2 probe; forced `WebGL unavailable` run must land in Q3 2D with a visible notice | Playwright projects / browser matrix, forced-context-loss probe | **TARGET** (chromium-only today; matrix completes at P8) |
| `B-12` | clean reproduction in a reasonable laptop session | `make reproduce` (Windows: `make.ps1`) from a clean clone, wall-clock timed, stdout captured verbatim, content-hashed artifacts compared | Level-1 run log artifact | **TARGET** (depends on P2/P3 `make reproduce`) |

## 2. Numbers MEASURED by this unit (2026-10-04)

Scope is explicit — these do **not** claim the budgets, they anchor them honestly:

| Item | Value | Source artifact |
|---|---|---|
| `B-06` component — critical JS (scaffold build) | **219,734 bytes raw** (`dist/assets/index-HaYF-Pay.js`), **68.65 kB gzip** | `npm run build` output, 2026-10-04 |
| `B-06` component — `dist/index.html` | **592 bytes** | filesystem, 2026-10-04 |
| `B-06` component — total `web/dist` | **220,326 bytes** (JS + HTML; no registry/model/structures present) | filesystem, 2026-10-04 |
| `B-07` structure asset (asset-level, **other unit**) | `heart.glb` 1,409,060 bytes; fallback `heart_tubes.glb` 378,644 bytes | `tools/mesh/gate_report.md` + `Progress.md` §3 (SES-ORCH-01, 2026-10-03) — cited, **not re-measured here** |
| `B-04`/`B-05` asset-level (other unit) | heart.glb p95 frame time 17.50 ms, 77,824 tris, 5 draw calls, 0 textures, 4× CPU throttle, integrated GPU | `tools/mesh/gate_report.md` §3 (2026-10-03) — cited, **not re-measured here**; product-level stays **TARGET** (D-08) |

Everything else in §1 is **TARGET**.

## 3. When to execute (and re-execute)

| Budget | First execution gate | Re-measure trigger |
|---|---|---|
| B-01, B-08 | P6 golden path live in the real store | any change to the render-on-demand / display-channel path |
| B-02, B-03 | P4 parity gate green (fixtures exist) | engine or encoder change |
| B-04, B-05 | P5 scene integrated (three vessels coloured) | mesh, material, quality-governor or camera change |
| B-06, B-07 | every `npm run build` once registry/model ship | any dependency or artifact change |
| B-09 | worker + scene integrated | memory-affecting change |
| B-10 | P7 copy/a11y freeze | any DOM/copy/colour change |
| B-11 | P8 browser matrix | release candidate change |
| B-12 | P3 `make reproduce` exists | pipeline change |

**Rule:** budgets are measured on the **production build** (`npm run build` + preview or
the deployed static site), never on `npm run dev`, and never on a machine with different
characteristics without recording the difference.

## 4. Evidence conventions

- Raw samples (frame times, mark durations, heap samples) are written as JSON under
  `tools/qa/artifacts/` with the budget ID in the filename; this protocol file only ever
  carries the summarised label + value.
- Reports paste the exact command and its output (AGENTS §3.4/§9.2).
- A breach is reported as a gate result `BLOCKED`/`CONDITIONAL PASS` with the delta —
  never rounded into compliance, never relabelled.
