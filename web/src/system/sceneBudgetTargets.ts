/**
 * C-16 budget targets as the System view restates them (D-22).
 *
 * Architecture §9.1 forbids `system/` from importing `scene` internals, so
 * the TARGET figures of `B-05`/`B-07` are declared here as data and bound
 * back to the scene aggregator's own copy by `sceneBudgetTargets.test.ts`
 * (an equality check against `scene/sceneStats.SCENE_BUDGET`). Two
 * declarations, one contract (C-16), and a blocking test so neither can drift
 * silently; every figure stays labelled TARGET until a measurement exists.
 */

/** C-16 budget identifiers, spelled exactly as the contract spells them. */
export const BUDGET_ID = {
  /** `B-05` scene cost: triangles, draw calls, textures. */
  sceneCost: "B-05",
  /** `B-07` structures transfer. */
  structuresTransfer: "B-07"
} as const;

/** C-16 `B-05` — scene statistics targets. */
export const SCENE_COST_TARGETS = {
  triangles: 150_000,
  drawCalls: 30,
  textures: 0
} as const;

/** C-16 `B-07` — structure transfer target, in bytes (2.5 MiB). */
export const STRUCTURES_TRANSFER_TARGET_BYTES = 2_621_440;

/**
 * C-16 L455: every number a report shows carries `TARGET` or `MEASURED`.
 * This is the label for the figures above; measurements carry `MEASURED`.
 */
export const BUDGET_PROVENANCE = "TARGET";
export const MEASURED_PROVENANCE = "MEASURED";
