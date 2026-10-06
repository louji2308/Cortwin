import { SceneError } from "./errors";

/**
 * Scene statistics aggregator (Implementation_Plan P5 step 16, `C-16` B-05/B-07).
 *
 * **Provenance law:** this module never measures anything itself — measurement
 * happens in the browser (renderer instrumentation reading its own geometries
 * and draw list), and this aggregator only sums a stats struct it is handed.
 * Every number it reports is therefore labelled `read-from-struct`; nothing here
 * estimates, guesses or hardcodes a triangle count, a frame rate or a file size.
 * Budget *limits* come from `C-16` contract text and are labelled `TARGET`; the
 * comparison is plain arithmetic over the supplied values.
 */

export const SCENE_BUDGET = {
  triangles: 150_000,
  drawCalls: 30,
  textures: 0,
  structureBytes: 2_621_440,
  kind: "TARGET"
} as const;

export type StructureNodeStats = {
  structureId: string;
  triangles: number;
  drawCalls: number;
  bytes: number;
  textures: number;
};

export type StructureStatsStruct = {
  nodes: readonly StructureNodeStats[];
};

export type SceneStats = {
  /** Where the numbers came from: a supplied struct, measured elsewhere. */
  origin: "read-from-struct";
  triangles: number;
  drawCalls: number;
  textures: number;
  bytes: number;
  nodeCount: number;
  budget: typeof SCENE_BUDGET;
  withinBudget: {
    triangles: boolean;
    drawCalls: boolean;
    textures: boolean;
    bytes: boolean;
  };
  allWithinBudget: boolean;
};

function assertStat(structureId: string, field: string, value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new SceneError(
      "INVALID_STRUCTURE_STATS",
      `Structure stats for "${structureId}" contain an invalid ${field}`,
      { detail: { structureId, field, value: String(value) }, recoverable: false }
    );
  }
  return value;
}

/**
 * Sum a per-node stats struct into scene totals and compare against `C-16`.
 *
 * @throws {SceneError} `INVALID_STRUCTURE_STATS` when the struct has no nodes
 * (an empty struct would otherwise report a vacuous "within budget") or a
 * non-finite/negative value.
 */
export function aggregateSceneStats(struct: StructureStatsStruct): SceneStats {
  if (struct === null || struct === undefined || !Array.isArray(struct.nodes)) {
    throw new SceneError(
      "INVALID_STRUCTURE_STATS",
      "Structure stats struct must carry a nodes array",
      { detail: {}, recoverable: false }
    );
  }
  if (struct.nodes.length === 0) {
    throw new SceneError(
      "INVALID_STRUCTURE_STATS",
      "Structure stats struct contains no node measurements",
      { detail: {}, recoverable: false }
    );
  }

  let triangles = 0;
  let drawCalls = 0;
  let textures = 0;
  let bytes = 0;

  for (const node of struct.nodes) {
    if (node === null || node === undefined || typeof node !== "object") {
      throw new SceneError(
        "INVALID_STRUCTURE_STATS",
        "Structure stats node entry must be an object",
        { detail: {}, recoverable: false }
      );
    }
    const structureId = String(node?.structureId ?? "");
    triangles += assertStat(structureId, "triangles", node.triangles);
    drawCalls += assertStat(structureId, "drawCalls", node.drawCalls);
    textures += assertStat(structureId, "textures", node.textures);
    bytes += assertStat(structureId, "bytes", node.bytes);
  }

  const withinBudget = {
    triangles: triangles <= SCENE_BUDGET.triangles,
    drawCalls: drawCalls <= SCENE_BUDGET.drawCalls,
    textures: textures <= SCENE_BUDGET.textures,
    bytes: bytes <= SCENE_BUDGET.structureBytes
  };

  return {
    origin: "read-from-struct",
    triangles,
    drawCalls,
    textures,
    bytes,
    nodeCount: struct.nodes.length,
    budget: SCENE_BUDGET,
    withinBudget,
    allWithinBudget:
      withinBudget.triangles &&
      withinBudget.drawCalls &&
      withinBudget.textures &&
      withinBudget.bytes
  };
}
