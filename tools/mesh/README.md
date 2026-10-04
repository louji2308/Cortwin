# `tools/mesh` — 3D asset preparation and the Oct 4 mesh gate

Everything needed to (re)build, verify and benchmark the CorTwin cardiac scene.

| File | Purpose |
|---|---|
| `prepare_bp3d.py` | Blender script: BodyParts3D OBJ parts → grouped, welded, decimated, scaled, re-centred `heart.glb` + preview renders |
| `inspect.mjs` | Budget / named-node inspector for `.glb` and `.obj` (writes `*.inspect.json`) |
| `build_tubes.mjs` | Procedural Catmull-Rom tube fallback → `assets/fallback/heart_tubes.glb` |
| `gate_report.md` | The mesh gate report: every measured number and how it was obtained |
| `bench/index.html` | Minimal three.js frame-rate harness (CPU-throttled fps / p95 frame time) |
| `package.json` | `@gltf-transform/cli` 4.5.1 (MIT) — build-time only, never shipped to the browser |

Outputs live in the repository:

- `assets/ready/heart.glb` — primary scene asset (1,409,060 B, 77,824 triangles)
- `assets/ready/heart.build.json` — build report (per-node triangle counts, bounds, orientation check)
- `assets/ready/heart.inspect.json` — budget inspection report
- `assets/fallback/heart_tubes.glb` — procedural fallback (378,644 B, 20,786 triangles)
- `assets/preview/heart_*.png` — four renders of the asset
- `assets/ATTRIBUTION.md` — provenance, licence, sha256 of every artifact

`assets/raw/` and `data/raw/` are `.gitignore`d and are never redistributed.

---

## Prerequisites

- **Node** (repo pin: Node 22; local run used Node 24) for `inspect.mjs` / `build_tubes.mjs`
- `npm install` inside `tools/mesh/` (installs `@gltf-transform/cli` and its dependency
  `gltf-validator`)
- **Blender** for `prepare_bp3d.py` only. Local install:
  `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe` (not on `PATH`)
- Python 3 for the orchestrator's `ruff` / `pytest` checks

## 1. Inspect an asset (fastest check)

```
node tools\mesh\inspect.mjs assets\ready\heart.glb --out-dir assets\ready
node tools\mesh\inspect.mjs assets\fallback\heart_tubes.glb --out-dir assets\fallback
```

Prints bytes, triangles, vertices, materials, textures, draw-call estimate, the named-node
contract, every budget boolean and the world centre, and writes `<name>.inspect.json`.

Budgets enforced by the inspector (`REQUIRED_NODES` / `BUDGETS` at the top of `inspect.mjs`):

```
nodes = HEART, AORTA, LAD, LCX, RCA   (exactly)
triangles <= 150000      drawCalls <= 30      textures == 0      bytes <= 2621440
world centre within 0.02 m of the origin
```

## 2. Rebuild `heart.glb` from BodyParts3D

```
& "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --python tools\mesh\prepare_bp3d.py -- build
& "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --python tools\mesh\prepare_bp3d.py -- render
```

- `build` → `assets/ready/heart.glb` + `assets/ready/heart.build.json`
- `render` → `assets/preview/heart_{overview,anterior,vessels,superior}.png`

Parts are grouped into the five registry nodes by the `GROUPS` table at the top of the script
(part IDs come from `assets/raw/isa_parts_list_e.txt`). Scale is mm→m (`SCALE = 0.001`), the
aorta is bisected 2 mm below the heart's inferior border, and the heart is decimated at
`HEART_DECIMATE` (default `0.6`).

**Re-running changes the artifact.** If you rebuild, you must re-run step 1, re-run step 3,
and update the sha256 values in `assets/ATTRIBUTION.md`. Never hand-edit a `.glb`
(AGENTS.md: generated artifacts are immutable by hand).

## 3. Build and verify the procedural fallback

```
node tools\mesh\build_tubes.mjs
node tools\mesh\inspect.mjs assets\fallback\heart_tubes.glb --out-dir assets\fallback
```

`build_tubes.mjs` sweeps Catmull-Rom curves through centrelines hand-placed in that file and
writes `assets/fallback/heart_tubes.glb` via `@gltf-transform/core`. It contains **no**
third-party geometry and was produced by **no** AI 3D generator.

Validate structure independently:

```
node -e "const fs=require('fs');const v=require('./tools/mesh/node_modules/gltf-validator');(async()=>{for(const f of ['assets/ready/heart.glb','assets/fallback/heart_tubes.glb']){const r=await v.validateBytes(new Uint8Array(fs.readFileSync(f)));console.log(f,'errors='+r.issues.numErrors,'warnings='+r.issues.numWarnings,'infos='+r.issues.numInfos);}})();"
```

Expected: `errors=0 warnings=0 infos=0` for both files.

## 4. Frame-rate benchmark

Serve the repository root (no CDN, no network egress):

```
python -m http.server 8123 --bind 127.0.0.1
```

Open, with Chrome DevTools → Performance/Network → **CPU throttling 4×**:

```
http://127.0.0.1:8123/tools/mesh/bench/index.html?asset=/assets/ready/heart.glb&seconds=8&throttle=cpu4x
http://127.0.0.1:8123/tools/mesh/bench/index.html?asset=/assets/fallback/heart_tubes.glb&seconds=8&throttle=cpu4x
```

Query parameters: `asset`, `seconds` (sample window), `dpr` (pixel-ratio cap, default 1.5),
`throttle` (label only — the real throttle is applied by DevTools).

The harness reports `fps_avg`, `fps_min`, frame-time **p95**, `triangles`, `drawCalls`, the
WebGL renderer string and `RESULT_30FPS`. Read `gate_report.md` §3 for the caveats before
quoting any of it: the loop is vsync-bound at 60 Hz, so **p95 frame time** is the statistic
that matters, and this harness measures the *asset*, not the product.

## 5. Lint

```
python -m ruff check .
```

Must report `All checks passed!`.

---

## Never do this

- Never invoke an AI 3D generator (Hunyuan3D / Tripo / Rodin / anything similar) — AGENTS.md §8.
- Never author anatomy: no ribs, no lungs, no invented vessels, no decorative geometry.
- Never rename, merge or delete the five registry nodes; the registry owns their identity.
- Never hand-edit `assets/ready/*.glb` or `assets/fallback/*.glb`; regenerate instead.
- Never add textures or images to a structure that ships (budget: 0 textures, ≤ 2.5 MB).
- Never put geometry under `web/` that is not reached through the registry.
- Never edit `Progress.md`, `Project/**`, `pipeline/**`, `tests/**` or `config/**` from here.
- Never commit `assets/raw/` or `data/raw/`.
