import { beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Material, Mesh, Object3D, Texture } from "three";
import {
  PRIMARY_STRUCTURE_CANDIDATE,
  REQUIRED_STRUCTURE_IDS,
  SCENE_BUDGET,
  aggregateSceneStats,
  buildStructureSource,
  type LoadedGltf,
  type StructureNodeStats
} from "../scene";
import { loadProjectRegistry } from "../scene/testFixtures";
import { buildStructureDescriptors } from "./materials";
import { buildRenderGroup, createStageMaterials } from "./threeParts";

/**
 * Structural budget evidence (Implementation_Plan P5 step 16, `C-16` B-05/B-07,
 * Contracts §8.2 "Scene targets: ≤150k triangles, ≤30 draw calls, 0 textures",
 * AGENTS §8 structures ≤2.5 MB).
 *
 * What is measured here (provenance: **read-from-struct**, never estimated):
 * - **Triangles / draw calls** — the real `heart.glb` parsed in Node and built
 *   through the exact render-group path `Stage3D` uses (only the five
 *   registry-named nodes are ever reparented). Triangles = index/position
 *   counts per rendered mesh; draw calls = the mesh's geometry groups, with
 *   invisible subtrees skipped exactly as three's renderer skips them (the
 *   invisible picking proxies therefore draw nothing).
 * - **Textures** — distinct `Texture` references on the materials actually
 *   assigned to the render group (the stage's own materials), plus the glTF
 *   payload's own images: a texture-free scene, not a texture-ignored scene.
 * - **Bytes** — per-node geometry buffer bytes (what that node uploads) fed
 *   through `aggregateSceneStats`, plus the whole structure file size against
 *   `SCENE_BUDGET.structureBytes` (the ≤2.5 MiB figure is a file budget).
 *
 * **D-08 discipline:** nothing here measures or claims a frame rate. Triangle,
 * draw-call, texture and byte budgets are structural `TARGET` limits compared
 * against measured struct values; product fps stays TARGET and is re-measured
 * in the real app by P6/P8 (in-app instrumentation / perf harness), never here.
 */

const HEART_GLB = fileURLToPath(new URL("../../../assets/ready/heart.glb", import.meta.url));

type ParsedGltf = {
  scene: Object3D & LoadedGltf;
  images: { uri?: string; name?: string }[];
};

async function parseGlb(): Promise<ParsedGltf> {
  const bytes = await readFile(HEART_GLB);
  return new Promise<ParsedGltf>((resolve, reject) => {
    new GLTFLoader().parse(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      "",
      (gltf) => {
        const json = (gltf as unknown as { parser?: { json?: { images?: { uri?: string; name?: string }[] } } }).parser?.json;
        resolve({ scene: gltf.scene as Object3D & LoadedGltf, images: json?.images ?? [] });
      },
      (error) => reject(error)
    );
  });
}

function textureRefsOf(material: Material): Texture[] {
  const refs: Texture[] = [];
  for (const value of Object.values(material as unknown as Record<string, unknown>)) {
    const candidate = value as { isTexture?: boolean } | null;
    if (candidate !== null && typeof candidate === "object" && candidate.isTexture === true) {
      refs.push(value as Texture);
    }
  }
  return refs;
}

type NodeMeasurement = {
  stats: StructureNodeStats;
  authoredTextures: number;
};

function measureNode(root: Object3D, meshNode: string, structureId: string): NodeMeasurement {
  const node = root.getObjectByName(meshNode);
  if (node === undefined || node === null) {
    throw new Error(`Measured structure node "${meshNode}" is absent from the render group`);
  }

  let triangles = 0;
  let drawCalls = 0;
  const authored = new Set<Texture>();

  const visit = (child: Object3D): void => {
    if (child.visible === false) return; // three's renderer skips the subtree (picking proxies)
    const mesh = child as Mesh;
    if (mesh.isMesh === true) {
      const geometry = mesh.geometry;
      const position = geometry.getAttribute("position");
      const index = geometry.getIndex();
      const count = index !== null ? index.count : position !== null ? position.count : 0;
      triangles += count / 3;
      drawCalls += geometry.groups.length > 0 ? geometry.groups.length : 1;

      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        // Authored glTF materials (pre-replacement) — the asset's own textures.
        for (const texture of textureRefsOf(material)) authored.add(texture);
      }
    }
    for (const childNode of child.children) visit(childNode);
  };
  visit(node);

  let bytes = 0;
  const accumulateBytes = (child: Object3D): void => {
    const mesh = child as Mesh;
    if (mesh.isMesh === true && mesh.visible !== false) {
      const geometry = mesh.geometry;
      // Underlying buffers, counted once each (interleaved attributes share one
      // buffer and expose it via `.data` instead of `.array`).
      const buffers = new Set<unknown>();
      for (const attribute of Object.values(geometry.attributes)) {
        const typed = attribute as unknown as {
          array?: unknown;
          data?: { array?: unknown };
        };
        buffers.add(typed.array ?? typed.data?.array);
      }
      buffers.delete(undefined);
      for (const buffer of buffers) {
        const view = buffer as { byteLength?: number };
        if (typeof view.byteLength === "number") bytes += view.byteLength;
      }
      if (geometry.index !== null) bytes += geometry.index.array.byteLength;
    }
    for (const childNode of child.children) accumulateBytes(childNode);
  };
  accumulateBytes(node);

  return {
    stats: { structureId, triangles, drawCalls, bytes, textures: 0 },
    authoredTextures: authored.size
  };
}

describe("C-16 structural budgets: the real heart.glb through the stage render path", () => {
  let glbBytes = 0;
  let renderRoot: Object3D;
  let measurements: NodeMeasurement[];
  let nodes: StructureNodeStats[];

  beforeAll(async () => {
    const registry = loadProjectRegistry();
    const file = await readFile(HEART_GLB);
    glbBytes = file.byteLength;

    const parsed = await parseGlb();
    const source = buildStructureSource(
      PRIMARY_STRUCTURE_CANDIDATE,
      (name) => parsed.scene.getObjectByName(name),
      registry
    );
    const renderGroup = buildRenderGroup(parsed.scene, source);

    // The exact material creation Stage3D performs at load: descriptors for a
    // null (boot) SceneModel, stage materials assigned onto the render group.
    const materials = createStageMaterials(
      buildStructureDescriptors({ source, registry, model: null, displayed: {} })
    );
    for (const structureId of REQUIRED_STRUCTURE_IDS) {
      renderGroup.meshes[structureId].material = materials[structureId];
    }

    renderRoot = renderGroup.group;
    measurements = REQUIRED_STRUCTURE_IDS.map((structureId) =>
      measureNode(renderRoot, source.nodes[structureId].meshNode, structureId)
    );
    nodes = measurements.map((measurement) => measurement.stats);

    expect(parsed.images).toEqual([]); // the shipped asset embeds no images
  });

  it("measures the five registry-named nodes and no decorative anatomy", () => {
    expect(nodes.map((node) => node.structureId)).toEqual([
      "HEART",
      "AORTA",
      "LAD",
      "LCX",
      "RCA"
    ]);
    // Reparented render group contains only registry-named subtrees.
    const topNames = renderRoot.children.map((child) => child.name).sort();
    expect(topNames).toEqual(["AORTA", "HEART", "LAD", "LCX", "RCA"].sort());
  });

  it("every measured node carries finite, non-negative struct values", () => {
    for (const node of nodes) {
      expect(Number.isFinite(node.triangles)).toBe(true);
      expect(node.triangles).toBeGreaterThan(0);
      expect(node.drawCalls).toBeGreaterThan(0);
      expect(node.bytes).toBeGreaterThan(0);
      expect(node.textures).toBe(0);
    }
  });

  it("aggregateSceneStats reports every budget flag true for the default structure", () => {
    const stats = aggregateSceneStats({ nodes });
    expect(stats.origin).toBe("read-from-struct");
    expect(stats.nodeCount).toBe(5);
    expect(stats.withinBudget.triangles).toBe(true);
    expect(stats.withinBudget.drawCalls).toBe(true);
    expect(stats.withinBudget.textures).toBe(true);
    expect(stats.withinBudget.bytes).toBe(true);
    expect(stats.allWithinBudget).toBe(true);
    expect(stats.budget).toBe(SCENE_BUDGET);
  });

  it("measured totals sit inside the C-16 scene targets", () => {
    const stats = aggregateSceneStats({ nodes });
    expect(stats.triangles).toBeLessThanOrEqual(SCENE_BUDGET.triangles);
    expect(stats.drawCalls).toBeLessThanOrEqual(SCENE_BUDGET.drawCalls);
    expect(stats.textures).toBe(0);
    expect(SCENE_BUDGET.textures).toBe(0);
    expect(SCENE_BUDGET.kind).toBe("TARGET"); // D-08: budgets are targets, not measurements
  });

  it("the structure file itself is within the 2.5 MiB structure budget", () => {
    expect(glbBytes).toBeGreaterThan(0);
    expect(glbBytes).toBeLessThanOrEqual(SCENE_BUDGET.structureBytes);
  });

  it("the stage's own rendered materials carry zero textures (texture-free scene)", () => {
    const registry = loadProjectRegistry();
    const materials = createStageMaterials(
      buildStructureDescriptors({
        source: buildStructureSource(PRIMARY_STRUCTURE_CANDIDATE, () => ({ isObject3D: true }), registry),
        registry,
        model: null,
        displayed: {}
      })
    );
    for (const material of new Set(Object.values(materials))) {
      expect(textureRefsOf(material)).toEqual([]);
    }
    for (const measurement of measurements) {
      expect(measurement.authoredTextures).toBe(0);
    }
  });
});
