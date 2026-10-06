import { describe, expect, it } from "vitest";
import { SceneError } from "./errors";
import {
  SCENE_BUDGET,
  aggregateSceneStats,
  type StructureNodeStats,
  type StructureStatsStruct
} from "./sceneStats";

const node = (overrides: Partial<StructureNodeStats>): StructureNodeStats => ({
  structureId: "LAD",
  triangles: 1000,
  drawCalls: 1,
  bytes: 1024,
  textures: 0,
  ...overrides
});

describe("scene statistics (Implementation_Plan P5 step 16, C-16 budgets)", () => {
  it("declares the contract budgets as TARGET, labelled with provenance", () => {
    expect(SCENE_BUDGET).toEqual({
      triangles: 150_000,
      drawCalls: 30,
      textures: 0,
      structureBytes: 2_621_440,
      kind: "TARGET"
    });
    expect(SCENE_BUDGET.structureBytes).toBe(2.5 * 1024 * 1024);
    expect(SCENE_BUDGET.kind).toBe("TARGET");
  });

  it("sums per-node measurements and labels every number read-from-struct", () => {
    const stats = aggregateSceneStats({
      nodes: [
        node({ structureId: "HEART", triangles: 60_000, drawCalls: 4, bytes: 1_000_000 }),
        node({ structureId: "AORTA", triangles: 10_000, drawCalls: 2, bytes: 500_000 }),
        node({ structureId: "LAD", triangles: 2_500, drawCalls: 1, bytes: 40_000, textures: 1 }),
        node({ structureId: "LCX", triangles: 2_500, drawCalls: 1, bytes: 40_000 }),
        node({ structureId: "RCA", triangles: 2_500, drawCalls: 1, bytes: 40_000 })
      ]
    });
    expect(stats.origin).toBe("read-from-struct");
    expect(stats.triangles).toBe(77_500);
    expect(stats.drawCalls).toBe(9);
    expect(stats.bytes).toBe(1_620_000);
    expect(stats.textures).toBe(1);
    expect(stats.nodeCount).toBe(5);
    expect(stats.budget).toBe(SCENE_BUDGET);
    expect(stats.withinBudget).toEqual({
      triangles: true,
      drawCalls: true,
      textures: false,
      bytes: true
    });
    expect(stats.allWithinBudget).toBe(false);
  });

  it("reports allWithinBudget only when every dimension is inside its limit", () => {
    const inside = aggregateSceneStats({ nodes: [node({})] });
    expect(inside.allWithinBudget).toBe(true);

    const overTriangles = aggregateSceneStats({
      nodes: [node({ triangles: SCENE_BUDGET.triangles + 1 })]
    });
    expect(overTriangles.withinBudget.triangles).toBe(false);
    expect(overTriangles.allWithinBudget).toBe(false);

    const overDraws = aggregateSceneStats({
      nodes: [node({ drawCalls: SCENE_BUDGET.drawCalls + 1 })]
    });
    expect(overDraws.withinBudget.drawCalls).toBe(false);

    const overBytes = aggregateSceneStats({
      nodes: [node({ bytes: SCENE_BUDGET.structureBytes + 1 })]
    });
    expect(overBytes.withinBudget.bytes).toBe(false);

    const atTheEdge = aggregateSceneStats({
      nodes: [
        node({ triangles: 75_000, drawCalls: 15 }),
        node({ triangles: 75_000, drawCalls: 15 })
      ]
    });
    expect(atTheEdge.withinBudget.triangles).toBe(true);
    expect(atTheEdge.withinBudget.drawCalls).toBe(true);
  });

  it("rejects an empty struct instead of reporting a vacuous pass", () => {
    let caught: unknown;
    try {
      aggregateSceneStats({ nodes: [] });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SceneError);
    expect((caught as SceneError).code).toBe("INVALID_STRUCTURE_STATS");
  });

  it("rejects non-array or missing nodes", () => {
    for (const hostile of [
      null,
      undefined,
      {},
      { nodes: "HEART" },
      { nodes: { 0: node({}) } }
    ] as unknown as StructureStatsStruct[]) {
      expect(() => aggregateSceneStats(hostile)).toThrowError(SceneError);
    }
  });

  it("rejects non-finite or negative measurements (a NaN budget is not a budget)", () => {
    for (const field of ["triangles", "drawCalls", "bytes", "textures"] as const) {
      for (const badValue of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
        let caught: unknown;
        try {
          aggregateSceneStats({
            nodes: [node({ [field]: badValue } as Partial<StructureNodeStats>)]
          });
        } catch (error) {
          caught = error;
        }
        expect(caught).toBeInstanceOf(SceneError);
        expect((caught as SceneError).code).toBe("INVALID_STRUCTURE_STATS");
        expect((caught as SceneError).detail.field).toBe(field);
      }
    }
  });

  it("rejects a node entry that is not an object", () => {
    expect(() =>
      aggregateSceneStats({ nodes: [null as unknown as StructureNodeStats] })
    ).toThrowError(SceneError);
  });
});
