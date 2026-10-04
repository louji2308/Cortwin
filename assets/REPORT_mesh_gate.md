# Mesh gate — decision report

**Decision date:** 2026-10-03 (ahead of the Oct 4 gate) · **Status:** CONDITIONAL PASS
**Full technical evidence:** [`tools/mesh/gate_report.md`](../tools/mesh/gate_report.md)
**Licence record:** [`ATTRIBUTION.md`](ATTRIBUTION.md)

---

## Decision

**Ship the prepared mesh `ready/heart.glb`. Keep the procedural-tube fallback built and verified.**

The Oct 4 gate asked: *three separately selectable vessels at ≥30 fps on integrated graphics,
within budget — or fall back to procedural tubes.* Both routes now pass, so the primary route is
the mesh and the fallback is insurance, not a necessity.

## Why the mesh passes

| Check | Limit | Measured | |
|---|---|---|---|
| Named nodes | exactly `HEART, AORTA, LAD, LCX, RCA` | all 5, nothing else | PASS |
| Triangles | ≤ 150,000 | 77,824 | PASS |
| Draw calls | ≤ 30 | 5 | PASS |
| Textures | 0 | 0 | PASS |
| File size | ≤ 2.5 MB | 1.41 MB | PASS |
| Centre | world origin | [0, 0, 0] | PASS |
| glTF validity | 0 errors | 0 errors / 0 warnings / 0 infos | PASS |
| **Frame rate** | **≥ 30 fps, integrated GPU, 4× CPU throttle** | **avg 60.0, p95 17.50 ms, min 36.4** | **PASS** |

Hardware actually used: **AMD Ryzen 5 5625U with integrated AMD Radeon Graphics**, Chrome at
4× CPU slowdown, 1156 × 720 viewport, DPR 1.25, 8-second sample over 479 frames.
Renderer string reported by WebGL: `ANGLE (AMD, AMD Radeon (TM) Graphics (0x000015E7) Direct3D11 vs_5_0 ps_5_0, D3D11)`.
Screenshots: `tools/mesh/bench/bench_heart_cpu4x.png`, `tools/mesh/bench/bench_fallback_cpu4x.png`.

**Read the caveats before quoting this.** The display is 60 Hz so the average sits on the
vsync ceiling; the meaningful numbers are p95 frame time (17.50 ms against a 33 ms budget) and
the sustained minimum (36.4 fps). And this is an **asset-level harness** — the product-level
claim ("CorTwin runs ≥30 fps") is still **TARGET** until it is re-measured inside the real app
in Batch 3/4 under the same conditions.

## Where the asset came from

BodyParts3D / ISA BP3D 4.0, 99 % polygon reduction, IS-A tree (`isa_BP3D_4.0_obj_99.zip`,
142,903,898 bytes, retrieved 2026-10-03 from the LSDB Archive download page). 88 of 2,234
parts were selected, grouped into the five registry nodes, scaled mm→m, welded, decimated
(HEART ×0.6) and re-centred. **No geometry was invented**, no AI 3D generator was used, and
nothing anatomical beyond the five registry nodes was added. Build details are in
`ready/heart.build.json`.

## Open issue

**HD-07 — licence conflict.** Two official, current statements disagree: the archive we
downloaded from says **CC BY 4.0**; the originating project site says **CC BY-SA 2.1 JP**.
Interim handling ships derivatives under the stricter CC BY-SA 2.1 JP with **both** required
credit strings displayed, which satisfies either reading. A human must confirm which governs.
Until then the README credit line is provisional. Details and the gate format are in
`ATTRIBUTION.md`.

## Degradation ladder (AGENTS §8)

1. **Detailed mesh — selected.** All budgets and fps PASS.
2. Optimised mesh — already applied inside (1): heart decimated, aorta trimmed, vertices welded.
3. **Procedural tubes — built, verified, ready.** `fallback/heart_tubes.glb`, 378,644 B,
   20,786 triangles, all five named nodes, validator-clean, fps PASS. Centrelines are
   hand-placed in `tools/mesh/build_tubes.mjs`; the geometry contains no third-party content.
4. 2D schematic — not built, not needed.

## What a judge will see if this holds

Three separately selectable vessels coloured by live calibrated probability on a real
anatomical heart, rotating at ≥30 fps on integrated hardware, with the node identity coming
from the registry rather than from a hardcoded map in the scene.
