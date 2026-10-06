import { describe, expect, it } from "vitest";
import { SceneError } from "./errors";
import { vesselStructureIds } from "./registryView";
import {
  AUTHORED_SCHEMATIC_PATHS,
  SCHEMATIC_VIEW_BOX,
  resolveSchematic,
  validateSchematicPath
} from "./schematic";
import { loadProjectRegistry, makeRegistry } from "./testFixtures";

const VESSELS = ["LAD", "LCX", "RCA"] as const;

describe("2D schematic geometry (sanctioned fallback diagram, not 3D anatomy)", () => {
  it("authors an M/L path for each of the three registry vessels", () => {
    expect(Object.keys(AUTHORED_SCHEMATIC_PATHS).sort()).toEqual([...VESSELS].sort());
    for (const vessel of VESSELS) {
      const path = AUTHORED_SCHEMATIC_PATHS[vessel];
      expect(() => validateSchematicPath(path.d, vessel)).not.toThrow();
      expect(path.d.trim().startsWith("M")).toBe(true);
      expect(path.strokeWidth).toBeGreaterThan(0);
      expect(path.labelAnchor.x).toBeGreaterThanOrEqual(0);
      expect(path.labelAnchor.y).toBeGreaterThanOrEqual(0);
      expect(path.labelAnchor.x).toBeLessThanOrEqual(SCHEMATIC_VIEW_BOX.width);
      expect(path.labelAnchor.y).toBeLessThanOrEqual(SCHEMATIC_VIEW_BOX.height);
    }
  });

  it("keeps the three vessel paths distinct (identity is never colour)", () => {
    const distances = new Set(
      VESSELS.map((vessel) => AUTHORED_SCHEMATIC_PATHS[vessel].d)
    );
    expect(distances.size).toBe(3);
  });

  it("rejects malformed path data with a typed error", () => {
    const bad = ["", "L 10 10", "M 10 10 C 1 2 3 4 5 5", "M 10 10 L foo", "M NaN 10"];
    for (const d of bad) {
      let caught: unknown;
      try {
        validateSchematicPath(d, "LAD");
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(SceneError);
      expect((caught as SceneError).code).toBe("INVALID_SCHEMATIC_PATH");
    }
  });

  it("accepts M/L/H/V/Z commands and scientific notation", () => {
    expect(() => validateSchematicPath("M 0 0 H 10 V 20 L 1e-3 .5 Z", "RCA")).not.toThrow();
  });

  it("resolves the shipped registry: authored paths, registry ids, all three present", () => {
    const registry = loadProjectRegistry();
    const schematic = resolveSchematic(registry);
    expect(Object.keys(schematic).sort()).toEqual([...VESSELS].sort());
    for (const vessel of vesselStructureIds(registry)) {
      expect(schematic[vessel].structureId).toBe(vessel);
      expect(schematic[vessel].origin).toBe("authored");
      expect(schematic[vessel].d).toBe(AUTHORED_SCHEMATIC_PATHS[vessel].d);
    }
  });

  it("uses the registry's own schematicPath when it supplies one", () => {
    const registry = makeRegistry();
    registry.structures.find((structure) => structure.id === "LAD")!.schematicPath =
      "M 1 2 L 3 4";
    const schematic = resolveSchematic(registry);
    expect(schematic.LAD.origin).toBe("registry");
    expect(schematic.LAD.d).toBe("M 1 2 L 3 4");
    expect(schematic.LCX.origin).toBe("authored");
  });

  it("rejects an invalid registry schematicPath instead of rendering it", () => {
    const registry = makeRegistry();
    registry.structures.find((structure) => structure.id === "RCA")!.schematicPath =
      "path with no moveto";
    expect(() => resolveSchematic(registry)).toThrowError(SceneError);
  });

  it("keeps the same vessel ids as the registry chain (fallback correspondence)", () => {
    const registry = loadProjectRegistry();
    const schematic = resolveSchematic(registry);
    expect(Object.keys(schematic)).toEqual(vesselStructureIds(registry));
  });
});
