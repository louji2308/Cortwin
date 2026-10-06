import { describe, expect, it } from "vitest";
import { SceneError } from "./errors";
import {
  loadStructure,
  resolveStructureSource,
  type GltfLoader,
  type LoadedGltf
} from "./loadStructure";
import { buildSceneNodes, structureCandidates, PRIMARY_STRUCTURE_CANDIDATE, PROCEDURAL_STRUCTURE_CANDIDATE } from "./structureSource";
import { loadProjectRegistry, makeFakeGltf, makeRegistry } from "./testFixtures";

const ALL_NODES = ["HEART", "AORTA", "LAD", "LCX", "RCA"] as const;

const loaderFor = (present: readonly string[]): GltfLoader =>
  async () => makeFakeGltf(present) as unknown as LoadedGltf;

const failingLoader: GltfLoader = async () => {
  throw new Error("network down");
};

const expectSceneError = (fn: () => unknown, code: string): SceneError => {
  let caught: unknown;
  let threw = false;
  try {
    fn();
  } catch (error) {
    threw = true;
    caught = error;
  }
  expect(threw).toBe(true);
  expect(caught).toBeInstanceOf(SceneError);
  expect((caught as SceneError).code).toBe(code);
  return caught as SceneError;
};

describe("structure source descriptors (C-11 node contract)", () => {
  const registry = loadProjectRegistry();

  it("declares the primary and procedural candidates with staged URLs and document paths", () => {
    const candidates = structureCandidates();
    expect(candidates).toEqual([PRIMARY_STRUCTURE_CANDIDATE, PROCEDURAL_STRUCTURE_CANDIDATE]);
    expect(candidates[0]).toMatchObject({
      id: "primary",
      kind: "gltf",
      url: "/models/heart.glb",
      documentPath: "assets/ready/heart.glb"
    });
    expect(candidates[1]).toMatchObject({
      id: "procedural",
      kind: "procedural",
      url: "/models/heart_tubes.glb",
      documentPath: "assets/fallback/heart_tubes.glb"
    });
  });

  it("builds exactly the five required nodes with registry identity and derived neutrality", () => {
    const nodes = buildSceneNodes((name) => ({ name }), registry);
    expect(Object.keys(nodes).sort()).toEqual([...ALL_NODES].sort());
    expect(nodes.HEART).toEqual({ structureId: "HEART", meshNode: "HEART", neutral: true });
    expect(nodes.AORTA).toEqual({ structureId: "AORTA", meshNode: "AORTA", neutral: true });
    expect(nodes.LAD).toEqual({ structureId: "LAD", meshNode: "LAD", neutral: false });
    expect(nodes.LCX.neutral).toBe(false);
    expect(nodes.RCA.neutral).toBe(false);
  });

  it("throws MISSING_REQUIRED_NODE when a required node is absent — no silent substitution", () => {
    const nodesWithoutRca = (name: string): unknown => (name === "RCA" ? null : { name });
    const error = expectSceneError(
      () => buildSceneNodes(nodesWithoutRca, registry),
      "MISSING_REQUIRED_NODE"
    );
    expect(error.detail.missing).toEqual(["RCA"]);
    expect(error.recoverable).toBe(true);
  });

  it("throws MISSING_REQUIRED_NODE for a node that exists under a different name only", () => {
    // A similarly named node must never be substituted for a required one.
    const lookalike = (name: string): unknown =>
      name === "LAD" ? null : name === "LCX" ? { name: "LCX_GLFX" } : { name };
    const error = expectSceneError(() => buildSceneNodes(lookalike, registry), "MISSING_REQUIRED_NODE");
    expect(error.detail.missing).toEqual(["LAD"]);
  });

  it("rejects a registry that is not exactly the five required structures", () => {
    const broken = makeRegistry();
    broken.structures = broken.structures.filter((structure) => structure.id !== "LCX");
    expectSceneError(() => buildSceneNodes((name) => ({ name }), broken), "INVALID_REGISTRY_STRUCTURES");
  });
});

describe("loadStructure — injected loader, no WebGL, no network", () => {
  const registry = loadProjectRegistry();

  it("validates a loaded glTF into a complete StructureSource", async () => {
    const source = await loadStructure({
      candidate: PRIMARY_STRUCTURE_CANDIDATE,
      registry,
      loadGltf: loaderFor(ALL_NODES)
    });
    expect(source.kind).toBe("gltf");
    expect(Object.keys(source.nodes).sort()).toEqual([...ALL_NODES].sort());
    expect(Object.keys(source.schematic).sort()).toEqual(["LAD", "LCX", "RCA"]);
    expect(source.schematic.LAD.origin).toBe("authored");
    expect(source.schematic.LAD.d.startsWith("M")).toBe(true);
  });

  it("wraps a loader rejection in a typed STRUCTURE_LOAD_FAILED", async () => {
    await expect(
      loadStructure({
        candidate: PRIMARY_STRUCTURE_CANDIDATE,
        registry,
        loadGltf: failingLoader
      })
    ).rejects.toMatchObject({ code: "STRUCTURE_LOAD_FAILED", recoverable: true });
  });

  it("rejects a loader that yields no named-node scene", async () => {
    const noScene: GltfLoader = async () => null as unknown as LoadedGltf;
    await expect(
      loadStructure({ candidate: PRIMARY_STRUCTURE_CANDIDATE, registry, loadGltf: noScene })
    ).rejects.toMatchObject({ code: "STRUCTURE_LOAD_FAILED" });
  });
});

describe("fallback chain (C-11): primary → procedural → 2D schematic", () => {
  const registry = loadProjectRegistry();

  it("uses the primary source when it loads, undegraded", async () => {
    const resolution = await resolveStructureSource(registry, loaderFor(ALL_NODES));
    expect(resolution.mode).toBe("source");
    if (resolution.mode !== "source") return;
    expect(resolution.candidate.id).toBe("primary");
    expect(resolution.degraded).toBe(false);
    expect(resolution.attempts).toHaveLength(1);
    expect(resolution.attempts[0].ok).toBe(true);
    expect(resolution.source.nodes.LAD.structureId).toBe("LAD");
  });

  it("falls back to the procedural source when the primary fails, keeping the same IDs", async () => {
    const loader: GltfLoader = async (url) =>
      url === PRIMARY_STRUCTURE_CANDIDATE.url
        ? (() => { throw new Error("404"); })()
        : makeFakeGltf(ALL_NODES);
    const resolution = await resolveStructureSource(registry, loader);
    expect(resolution.mode).toBe("source");
    if (resolution.mode !== "source") return;
    expect(resolution.candidate.id).toBe("procedural");
    expect(resolution.degraded).toBe(true);
    expect(resolution.source.kind).toBe("procedural");
    expect(Object.keys(resolution.source.nodes).sort()).toEqual([...ALL_NODES].sort());
    expect(resolution.attempts).toHaveLength(2);
    expect(resolution.attempts[0]).toMatchObject({ ok: false });
    expect(resolution.attempts[0].error?.code).toBe("STRUCTURE_LOAD_FAILED");
    expect(resolution.attempts[1]).toMatchObject({ ok: true });
  });

  it("treats a primary that is missing a required node as a chain failure (FM-07)", async () => {
    const loader: GltfLoader = async (url) =>
      url === PRIMARY_STRUCTURE_CANDIDATE.url
        ? makeFakeGltf(["HEART", "AORTA", "LAD", "LCX"])
        : makeFakeGltf(ALL_NODES);
    const resolution = await resolveStructureSource(registry, loader);
    expect(resolution.mode).toBe("source");
    if (resolution.mode !== "source") return;
    expect(resolution.candidate.id).toBe("procedural");
    expect(resolution.attempts[0].error?.code).toBe("MISSING_REQUIRED_NODE");
  });

  it("degrades to the 2D schematic with a typed error when every candidate fails", async () => {
    const resolution = await resolveStructureSource(registry, failingLoader);
    expect(resolution.mode).toBe("schematic");
    if (resolution.mode !== "schematic") return;
    expect(resolution.error.code).toBe("FALLBACK_EXHAUSTED");
    expect(resolution.attempts).toHaveLength(2);
    expect(resolution.attempts.every((attempt) => !attempt.ok)).toBe(true);
    expect(resolution.error.detail.attempts).toEqual([
      { candidateId: "primary", code: "STRUCTURE_LOAD_FAILED" },
      { candidateId: "procedural", code: "STRUCTURE_LOAD_FAILED" }
    ]);
  });

  it("handles an empty candidate list without hanging or claiming a source", async () => {
    const resolution = await resolveStructureSource(registry, loaderFor(ALL_NODES), []);
    expect(resolution.mode).toBe("schematic");
    if (resolution.mode !== "schematic") return;
    expect(resolution.error.code).toBe("FALLBACK_EXHAUSTED");
    expect(resolution.attempts).toHaveLength(0);
  });
});
