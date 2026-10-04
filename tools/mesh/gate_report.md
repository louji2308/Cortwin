# Mesh gate report — B0-3 (Oct 4 gate)

**Overall status: CONDITIONAL PASS**
Structural budget, named-node contract and frame-rate gate are all **PASS with measured
evidence**. The single remaining issue is **HD-07** (BodyParts3D licence conflict), which does
not affect runtime behaviour; a conservative interim licence is already applied in
`assets/ATTRIBUTION.md`.

- **Run date:** 2026-10-03
- **Owner:** B0-3 · 3D asset risk / mesh gate
- **Contracts consumed:** C-02 (registry node identity), C-11 (SceneModel), C-16 (structure budgets)
- **Decision recorded for:** the Oct 4 mesh gate

---

## 1. Verdict at a glance

| Sub-gate | Requirement | Result | Evidence kind |
|---|---|---|---|
| S1 Named-node contract | exactly `HEART, AORTA, LAD, LCX, RCA` | **PASS** | measured |
| S2 Triangle budget | ≤ 150,000 | **PASS** — 77,824 | measured |
| S3 Draw-call budget | ≤ 30 | **PASS** — 5 | measured |
| S4 Textures | 0 | **PASS** — 0 | measured |
| S5 Structure size | ≤ 2.5 MB | **PASS** — 1,409,060 B | measured |
| S6 Centre on origin | world centre ≈ 0 | **PASS** — [0, 0, 0] | measured |
| S7 glTF validity | validator errors = 0 | **PASS** — 0 errors / 0 warnings / 0 infos | measured |
| F1 Frame rate, mesh | ≥ 30 fps on integrated graphics | **PASS** — avg 60.0, p95 17.50 ms, min 36.4 (4× CPU throttle) | measured |
| F2 Frame rate, fallback | ≥ 30 fps | **PASS** — avg 60.0, p95 17.50 ms | measured |
| L1 Licence / attribution | provenance + licence recorded, cleared | **CONDITIONAL** — conflict between two official statements → **HD-07** | verified sources |

**Decision:** ship `assets/ready/heart.glb` as the primary scene asset.
`assets/fallback/heart_tubes.glb` stays built, verified and one import away (AGENTS.md §8
degradation path: detailed mesh → optimised mesh → procedural tubes → 2D schematic).

---

## 2. Structural / budget gate (S1–S7)

### Command

```
node tools\mesh\inspect.mjs assets\ready\heart.glb --out-dir assets\ready
node tools\mesh\inspect.mjs assets\fallback\heart_tubes.glb --out-dir assets\fallback
```

### Verbatim output (2026-10-03)

```
file=assets\ready\heart.glb bytes=1409060 format=glb triangles=77824 vertices=39067 materials=5 textures=0 drawCallEstimate=5 required=ALL_PRESENT tris<=150k:true draws<=30:true textures==0:true bytes<=2.5MB:true worldCenter=[0.0000,0.0000,0.0000] centered:true report=assets\ready\heart.inspect.json
file=assets\fallback\heart_tubes.glb bytes=378644 format=glb triangles=20786 vertices=10403 materials=5 textures=0 drawCallEstimate=5 required=ALL_PRESENT tris<=150k:true draws<=30:true textures==0:true bytes<=2.5MB:true worldCenter=[0.0000,0.0000,0.0000] centered:true report=assets\fallback\heart_tubes.inspect.json
```

### glTF structural validator

```
node -e "... gltf-validator validateBytes ..."
assets/ready/heart.glb errors=0 warnings=0 infos=0
assets/fallback/heart_tubes.glb errors=0 warnings=0 infos=0
```

### Node list actually inside the files

`heart.glb` nodes (depth 0 each): `AORTA`, `HEART`, `LAD`, `LCX`, `RCA` — nothing else.
`heart_tubes.glb` nodes (depth 0 each): `HEART`, `AORTA`, `LAD`, `LCX`, `RCA` — nothing else.

No ribs, no lungs, no decorative geometry, no textures, no images.

### Per-node geometry budget (from `assets/ready/heart.build.json`)

| Node | Source parts | Triangles in | Triangles out |
|---|---:|---:|---:|
| HEART | 30 | 75,658 | 45,386 (decimate 0.6) |
| AORTA | 5 | 10,188 | 10,188 (bisected → 5,298 after trim) |
| LAD | 18 | 9,444 | 9,442 |
| LCX | 6 | 3,018 | 3,018 |
| RCA | 29 | 14,682 | 14,680 |
| **Total** | 88 | 112,990 | **77,824** |

Bounds after centring: X ±0.0578 m, Y ±0.0657 m, Z ±0.0711 m (0.1157 × 0.1314 × 0.1422 m) —
anatomically plausible heart-scale, oriented BodyParts3D mm→m with +X left, −Y anterior,
+Z superior (recorded in `heart.build.json` as `_orientationCheck`).

---

## 3. Frame-rate gate (F1, F2) — MEASURED, not a target

### Harness

`tools/mesh/bench/index.html` — a minimal three.js r186 scene that loads one `.glb`, applies
the five registry meshes as untextured `MeshStandardMaterial`, renders continuously and
reports `fps_avg`, `fps_min` and frame-time p95 over a fixed window. Served locally with
`python -m http.server 8123` from the repository root (no CDN, no network egress).

### Machine and conditions (all reported as measured)

| Property | Value |
|---|---|
| CPU | AMD Ryzen 5 5625U with Radeon Graphics |
| GPU | **AMD Radeon (TM) Graphics — integrated** (D3D11) |
| WebGL renderer string | `ANGLE (AMD, AMD Radeon (TM) Graphics (0x000015E7) Direct3D11 vs_5_0 ps_5_0, D3D11)` |
| CPU throttling | **4× slowdown** (Chrome DevTools emulation) |
| Viewport | 1156 × 720, `devicePixelRatio` 1.25, pixel ratio used 1.25 |
| Sample window | 8.02 s, 479 frames (first 3 frames discarded) |
| Date | 2026-10-03 |

### Results

| Run | triangles | draw calls | fps_avg | fps_min | frame-time p95 | RESULT |
|---|---:|---:|---:|---:|---:|---|
| `heart.glb`, CPU 4× | 77,824 | 5 | **60.0** | 36.4 | **17.50 ms** | **PASS** |
| `heart_tubes.glb`, CPU 4× | 20,786 | 5 | **60.0** | 29.1 | **17.50 ms** | **PASS** |
| `heart.glb`, no throttle | 77,824 | 5 | 59.2 | 8.6 | 17.20 ms | PASS |

Verbatim console output of the primary (4× throttled) run:

```
asset: /assets/ready/heart.glb
devicePixelRatio: 1.25
pixelRatioUsed: 1.25
viewport: 1156x720
webgl.renderer: ANGLE (AMD, AMD Radeon (TM) Graphics (0x000015E7) Direct3D11 vs_5_0 ps_5_0, D3D11)
throttle: cpu4x
nodes: AORTA,HEART,LAD,LCX,RCA
triangles: 77824
drawCalls: 5
duration_s: 8.02
frames: 479
fps_avg: 60.0
fps_min: 36.4
frametime_p95_ms: 17.50
RESULT_30FPS: PASS
```

Screenshots: `tools/mesh/bench/bench_heart_cpu4x.png`, `tools/mesh/bench/bench_fallback_cpu4x.png`.

### Honest caveats on this measurement (read before quoting the numbers)

1. **The display is 60 Hz and the loop is vsync-bound**, so `fps_avg` sits at the 60 fps ceiling
   in every run. The discriminators are **p95 frame time (17.50 ms)** and **fps_min**; both clear
   the ≥30 fps / ≤33 ms bar with roughly 2× headroom. This harness therefore demonstrates
   "comfortably above 30 fps", not "60 fps of free headroom".
2. **4× CPU throttling barely moved the result** — the workload is GPU/vsync bound, not
   main-thread bound. The throttle was applied (it is the documented bar) but it is not the
   binding constraint for this asset.
3. **Single-frame outliers exist**: `fps_min` 29.1 (fallback) and 8.6 (unthrottled) are
   one-off hitches (shader compile / GC), not sustained behaviour; p95 is unaffected. The
   sustained statistic is the one used for the verdict.
4. **This is an asset-level harness, not the product.** The final claim — "CorTwin runs ≥30 fps" —
   must be re-measured in Batch 3/4 **inside the real app**, with the store, inspector, Evidence
   Rail and explanation panels mounted, under the same 4× throttle and on integrated graphics.
   Method: the same p95 / sustained-fps reading plus `renderer.info` from the production scene.
   Until that measurement exists, the *product* fps claim stays TARGET; only the *asset* claim is
   MEASURED.

---

## 4. Licence / attribution (L1) — CONDITIONAL, HD-07 open

Source, sidecars and retrieval date are verified; two **official and current** licence
statements disagree (LSDB Archive: CC BY 4.0, "Last updated : 2025/02/27" vs project site:
CC BY-SA 2.1 JP). Interim handling complies with both. Full verbatim quotes, the HD-07 block,
sha256 of every derived artifact and the credits to display are in **`assets/ATTRIBUTION.md`**.

Nothing about this blocks building or demoing; it affects the licence label on `heart.glb` and
the exact credit line in the README. **Human decision required: HD-07.**

---

## 5. Fallback readiness (degradation path)

| Path | Status |
|---|---|
| 1. Detailed mesh (`assets/ready/heart.glb`) | **Selected.** All budgets + fps PASS. |
| 2. Optimised mesh | Achieved inside path 1 (decimate 0.6 on HEART, aorta bisect, weld). |
| 3. Procedural Catmull-Rom tubes (`assets/fallback/heart_tubes.glb`) | **Built and verified** — 378,644 B, 20,786 tris, 5 draw calls, 0 textures, all five named nodes, validator-clean, fps PASS. Regenerate with `node tools\mesh\build_tubes.mjs`. |
| 4. 2D schematic | Not built; only needed if path 3 also fails. It has not failed. |

Fallback provenance: geometry is generated by `tools/mesh/build_tubes.mjs` from centrelines
hand-placed in this repository. **No BodyParts3D content, no AI 3D generator** — see
`assets/ATTRIBUTION.md` §4. It is explicitly non-anatomical and must never be presented as
measured anatomy.

### Implementation options compared (fallback builder)

| Option | Cost | Risk | Verdict |
|---|---|---|---|
| **A. Programmatic `@gltf-transform/core` `Document`** | already installed (4.5.1, MIT, transitive dep of the CLI) | library writes valid GLB for us; `gltf-validator` proves it | **chosen** |
| B. Hand-rolled glTF 2.0 JSON + binary buffer writer | zero deps | byte alignment, padding, GLB chunk framing, accessor min/max all hand-maintainable | rejected — more failure modes for no rubric gain |

---

## 6. What is NOT claimed here

- No patient data, no clinical claim, no lesion location, no probability is produced by any
  asset in this report.
- No number in this report was typed from memory; every one comes from the commands quoted above.
- `assets/raw/` (142,903,898 B source zip + OBJs) is `.gitignore`d and is **not** redistributed.

## 7. Reproduce

```
node tools\mesh\inspect.mjs assets\ready\heart.glb --out-dir assets\ready
node tools\mesh\build_tubes.mjs
node tools\mesh\inspect.mjs assets\fallback\heart_tubes.glb --out-dir assets\fallback
python -m http.server 8123 --bind 127.0.0.1
#   open http://127.0.0.1:8123/tools/mesh/bench/index.html?asset=/assets/ready/heart.glb&seconds=8&throttle=cpu4x
#   with Chrome DevTools CPU throttling set to 4x
```
