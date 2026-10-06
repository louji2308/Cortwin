import { describe, expect, it, vi } from "vitest";
import { ShaderLib } from "three/src/renderers/shaders/ShaderLib.js";
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Raycaster,
  Vector3,
  type Object3D
} from "three";
import { probabilityToColour } from "../design/ramp";
import { SceneError, type RegistrySlice, type StructureSource } from "../scene";
import { loadProjectRegistry } from "../scene/testFixtures";
import { rampRgb } from "./colours";
import { NO_EMISSIVE, type StructureDescriptor } from "./materials";
import { PROXY_NAME_SUFFIX } from "./picking";
import {
  HATCH_LINES,
  STAGE_LIGHTS,
  STAGE_MATERIAL_PARAMS,
  attachPickProxy,
  attachPickProxies,
  buildRenderGroup,
  computeModelExtent,
  computeStructureCentres,
  createStageMaterials,
  disposeStageResources,
  hatchFrequency,
  patchHatchShader,
  setHatchFrequency,
  updateStageMaterial,
  type HatchUniforms
} from "./threeParts";

const registry: RegistrySlice = loadProjectRegistry();

function makeSource(
  overrides: Partial<StructureSource["nodes"]> = {}
): StructureSource {
  const node = (id: "HEART" | "AORTA" | "LAD" | "LCX" | "RCA") => ({
    structureId: id,
    meshNode: id,
    neutral: id === "HEART" || id === "AORTA"
  });
  return {
    kind: "gltf",
    nodes: {
      HEART: node("HEART"),
      AORTA: node("AORTA"),
      LAD: node("LAD"),
      LCX: node("LCX"),
      RCA: node("RCA"),
      ...overrides
    },
    schematic: {
      LAD: { structureId: "LAD", d: "M 0 0", labelAnchor: { x: 0, y: 0 }, strokeWidth: 11, origin: "authored" },
      LCX: { structureId: "LCX", d: "M 0 0", labelAnchor: { x: 0, y: 0 }, strokeWidth: 11, origin: "authored" },
      RCA: { structureId: "RCA", d: "M 0 0", labelAnchor: { x: 0, y: 0 }, strokeWidth: 11, origin: "authored" }
    }
  };
}

function namedMesh(name: string, position: [number, number, number] = [0, 0, 0]): Mesh {
  const mesh = new Mesh(new BoxGeometry(0.02, 0.02, 0.02));
  mesh.name = name;
  mesh.position.set(position[0], position[1], position[2]);
  return mesh;
}

function makeRoot(): Group {
  const root = new Group();
  for (const name of ["HEART", "AORTA", "LAD", "LCX", "RCA"]) {
    root.add(namedMesh(name));
  }
  return root;
}

const descriptor = (overrides: Partial<StructureDescriptor> = {}): StructureDescriptor => ({
  structureId: "LAD",
  meshNode: "LAD",
  neutral: false,
  colour: rampRgb(0.76),
  emissive: NO_EMISSIVE,
  hatch: false,
  selected: false,
  hovered: false,
  dimmed: false,
  ...overrides
});

describe("buildRenderGroup — renders only the five named nodes", () => {
  it("reparents exactly the contract nodes and records their meshes", () => {
    const root = makeRoot();
    const extra = namedMesh("DETAIL");
    root.add(extra);
    const { group, meshes } = buildRenderGroup(root, makeSource());

    expect(group.children.map((child) => child.name)).toEqual([
      "HEART",
      "AORTA",
      "LAD",
      "LCX",
      "RCA"
    ]);
    expect(group.children).not.toContain(extra);
    expect(Object.keys(meshes).sort()).toEqual(["AORTA", "HEART", "LAD", "LCX", "RCA"]);
    expect(meshes.LAD.isMesh).toBe(true);
  });

  it("preserves world transforms across reparenting (attach, not add)", () => {
    const root = new Group();
    root.position.set(1, 0, 0);
    for (const name of ["HEART", "AORTA", "LCX", "RCA"]) {
      root.add(namedMesh(name));
    }
    root.add(namedMesh("LAD", [0, 2, 0]));
    const { meshes } = buildRenderGroup(root, makeSource());
    const world = new Vector3();
    meshes.LAD.getWorldPosition(world);
    expect(world.x).toBeCloseTo(1, 10);
    expect(world.y).toBeCloseTo(2, 10);
    expect(world.z).toBeCloseTo(0, 10);
  });

  it("resolves a named group to the mesh underneath it", () => {
    const root = makeRoot();
    const lcxIndex = root.children.findIndex((child) => child.name === "LCX");
    const groupNode = new Group();
    groupNode.name = "LCX";
    const inner = namedMesh("LCX_geometry");
    groupNode.add(inner);
    root.remove(root.children[lcxIndex]);
    root.add(groupNode);

    const { meshes, group } = buildRenderGroup(root, makeSource());
    expect(meshes.LCX).toBe(inner);
    expect(group.getObjectByName("LCX")).toBe(groupNode);
  });

  it("throws MISSING_REQUIRED_NODE when a named node is absent", () => {
    const root = makeRoot();
    const source = makeSource({ LAD: { structureId: "LAD", meshNode: "LAD_renamed", neutral: false } });
    let caught: unknown;
    try {
      buildRenderGroup(root, source);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SceneError);
    expect((caught as SceneError).code).toBe("MISSING_REQUIRED_NODE");
  });

  it("throws MISSING_REQUIRED_NODE when a named node contains no mesh", () => {
    const root = makeRoot();
    const empty = new Group();
    empty.name = "RCA";
    root.remove(root.children[root.children.length - 1]);
    root.add(empty);
    expect(() => buildRenderGroup(root, makeSource())).toThrow(SceneError);
  });
});

describe("attachPickProxy — invisible, inflated, centred on the vessel", () => {
  function vesselMesh(): Mesh {
    const mesh = namedMesh("LAD", [0, 0, 0]);
    mesh.geometry.translate(0.5, 0, 0);
    mesh.geometry.computeBoundingBox();
    return mesh;
  }

  it("is named with the proxy suffix, invisible, and parented under the vessel", () => {
    const mesh = vesselMesh();
    const proxy = attachPickProxy(mesh, {
      structureId: "LAD",
      meshNode: "LAD",
      inflate: 2,
      visible: false
    });
    expect(proxy.name).toBe(`LAD${PROXY_NAME_SUFFIX}`);
    expect(proxy.visible).toBe(false);
    expect(proxy.parent).toBe(mesh);
    expect(proxy.geometry.userData.ctProxy).toBe(true);
  });

  it("stays centred on the vessel's own geometry and doubles its size", () => {
    const mesh = vesselMesh();
    const proxy = attachPickProxy(mesh, {
      structureId: "LAD",
      meshNode: "LAD",
      inflate: 2,
      visible: false
    });
    const world = new Vector3();
    proxy.getWorldPosition(world);
    expect(world.x).toBeCloseTo(0.5, 10);
    expect(world.y).toBeCloseTo(0, 10);
    proxy.geometry.computeBoundingBox();
    const size = proxy.geometry.boundingBox!.getSize(new Vector3());
    expect(size.x).toBeCloseTo(0.04, 7);
  });

  it("is raycastable despite being invisible (empirical three.js behaviour)", () => {
    const mesh = vesselMesh();
    const proxy = attachPickProxy(mesh, {
      structureId: "LAD",
      meshNode: "LAD",
      inflate: 2,
      visible: false
    });
    // world matrices are frame-updated in the app; mirror that before raycasting
    mesh.updateWorldMatrix(true, true);

    const direct = new Raycaster(new Vector3(0.5, 0, 5), new Vector3(0, 0, -1));
    expect(direct.intersectObject(proxy, false).length).toBeGreaterThan(0);

    const nested = new Raycaster(new Vector3(0.5, 0, 5), new Vector3(0, 0, -1));
    const hits = nested.intersectObjects([mesh], true);
    expect(hits.some((hit) => hit.object.name === `LAD${PROXY_NAME_SUFFIX}`)).toBe(true);
  });

  it("attaches one proxy per registry vessel through the registry descriptors", () => {
    const root = makeRoot();
    const { meshes } = buildRenderGroup(root, makeSource());
    const attached = attachPickProxies(meshes, makeSource(), registry);
    expect(attached.map((proxy) => proxy.name).sort()).toEqual([
      `LAD${PROXY_NAME_SUFFIX}`,
      `LCX${PROXY_NAME_SUFFIX}`,
      `RCA${PROXY_NAME_SUFFIX}`
    ]);
  });
});

describe("stage materials — colour enters three.js exactly once, in sRGB", () => {
  const hexOf = (colour: string): string =>
    (colour.match(/\d+/g) ?? [])
      .slice(0, 3)
      .map((value) => Number(value).toString(16).padStart(2, "0"))
      .join("");

  it("vessels get their own instance; the neutrals share one", () => {
    const materials = createStageMaterials([
      descriptor({ structureId: "HEART", neutral: true, colour: [0.6, 0.64, 0.68] }),
      descriptor({ structureId: "AORTA", neutral: true, colour: [0.6, 0.64, 0.68] }),
      descriptor({ structureId: "LAD" }),
      descriptor({ structureId: "LCX" }),
      descriptor({ structureId: "RCA" })
    ]);
    expect(materials.HEART).toBe(materials.AORTA);
    expect(new Set([materials.LAD, materials.LCX, materials.RCA]).size).toBe(3);
    for (const material of Object.values(materials)) {
      expect(material).toBeInstanceOf(MeshStandardMaterial);
      expect(material.userData.ctHatch).toBeDefined();
      expect(typeof material.onBeforeCompile).toBe("function");
    }
    expect(materials.LAD.roughness).toBe(STAGE_MATERIAL_PARAMS.roughness);
    expect(materials.LAD.metalness).toBe(STAGE_MATERIAL_PARAMS.metalness);
  });

  it("applies the exact ramp colour through setRGB(SRGBColorSpace)", () => {
    const material = createStageMaterials([descriptor()])[ "LAD" ];
    expect(material.color.getHexString("srgb")).toBe(
      hexOf(probabilityToColour(0.76))
    );
  });

  it("applies the emissive accent in the same colour space", () => {
    const material = createStageMaterials([
      descriptor({ emissive: [0.2, 0.4, 0.6] })
    ])["LAD"];
    expect(material.emissive.getHexString("srgb")).toBe(hexOf("rgb(51, 102, 153)"));
    const dark = createStageMaterials([descriptor()])["LAD"];
    expect(dark.emissive.getHexString("srgb")).toBe("000000");
  });

  it("toggles hatch strength per descriptor without recompiling", () => {
    const material = createStageMaterials([descriptor({ hatch: true })])["LAD"];
    const uniforms = material.userData.ctHatch as HatchUniforms;
    expect(uniforms.uCtHatchStrength.value).toBe(1);
    updateStageMaterial(material, descriptor({ hatch: false }));
    expect(uniforms.uCtHatchStrength.value).toBe(0);
  });

  it("setHatchFrequency writes the uniform and rejects materials without it", () => {
    const material = createStageMaterials([descriptor()])["LAD"];
    setHatchFrequency(material, 137.9);
    expect((material.userData.ctHatch as HatchUniforms).uCtHatchFreq.value).toBe(137.9);
    expect(() => setHatchFrequency(new MeshStandardMaterial(), 10)).toThrow();
  });

  it("replacing a colour updates the same material instance (no re-creation)", () => {
    const material = createStageMaterials([descriptor()])["LAD"];
    updateStageMaterial(material, descriptor({ colour: rampRgb(0.31) }));
    expect(material.color.getHexString("srgb")).toBe(hexOf(probabilityToColour(0.31)));
  });
});

describe("patchHatchShader — anchored to the installed three's own GLSL", () => {
  const anchors = {
    vertexCommon: ShaderLib.standard.vertexShader.includes("#include <common>"),
    vertexBegin: ShaderLib.standard.vertexShader.includes("#include <begin_vertex>"),
    fragmentCommon: ShaderLib.standard.fragmentShader.includes("#include <common>"),
    fragmentColour: ShaderLib.standard.fragmentShader.includes("#include <color_fragment>")
  };

  it("MeshStandardMaterial's stock shader carries every anchor we patch", () => {
    expect(anchors).toEqual({
      vertexCommon: true,
      vertexBegin: true,
      fragmentCommon: true,
      fragmentColour: true
    });
  });

  it("injects varying, uniforms and the stripe maths into both stages", () => {
    const uniforms: HatchUniforms = {
      uCtHatchFreq: { value: 42 },
      uCtHatchStrength: { value: 1 }
    };
    const shader = {
      vertexShader: ShaderLib.standard.vertexShader,
      fragmentShader: ShaderLib.standard.fragmentShader,
      uniforms: {} as Record<string, unknown>
    };
    patchHatchShader(shader, uniforms);

    expect(shader.uniforms.uCtHatchFreq).toBe(uniforms.uCtHatchFreq);
    expect(shader.uniforms.uCtHatchStrength).toBe(uniforms.uCtHatchStrength);
    expect(shader.vertexShader).toContain("varying vec3 vCtHatchPos;");
    expect(shader.vertexShader).toContain("vCtHatchPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    expect(shader.fragmentShader).toContain("uniform float uCtHatchFreq;");
    expect(shader.fragmentShader).toContain("uniform float uCtHatchStrength;");
    expect(shader.fragmentShader).toContain("diffuseColor.rgb = mix(");
    // the stock lighting/fog structure survives around the injection
    expect(shader.fragmentShader).toContain("#include <lights_fragment_begin>");
  });

  it("throws loudly when an anchor is missing (three.js upgrade guard)", () => {
    const uniforms = { uCtHatchFreq: { value: 1 }, uCtHatchStrength: { value: 0 } };
    expect(() =>
      patchHatchShader(
        { vertexShader: "void main() {}", fragmentShader: "void main() {}", uniforms: {} },
        uniforms
      )
    ).toThrow(/anchor missing/);
  });
});

describe("measurements — geometry only, proxies excluded", () => {
  function meshesFixture(): ReturnType<typeof buildRenderGroup>["meshes"] {
    const root = new Group();
    const heart = namedMesh("HEART");
    heart.geometry = new BoxGeometry(0.1, 0.1, 0.1);
    const lad = namedMesh("LAD", [0.05, 0.05, 0]);
    lad.geometry = new BoxGeometry(0.02, 0.02, 0.02);
    root.add(heart, lad, namedMesh("AORTA"), namedMesh("LCX"), namedMesh("RCA"));
    return buildRenderGroup(root, makeSource()).meshes;
  }

  it("computes world centres per structure", () => {
    const centres = computeStructureCentres(meshesFixture());
    expect(centres.LAD).toBeDefined();
    expect(centres.LAD![0]).toBeCloseTo(0.05, 10);
    expect(centres.LAD![1]).toBeCloseTo(0.05, 10);
    expect(centres.HEART![0]).toBeCloseTo(0, 10);
  });

  it("computes the model extent and ignores the inflated proxies", () => {
    const meshes = meshesFixture();
    const before = computeModelExtent(meshes);
    // heart spans ±0.05, the offset LAD box reaches +0.06 on x/y → 0.11
    expect(before).toBeCloseTo(0.11, 8);
    attachPickProxy(meshes.LAD, {
      structureId: "LAD",
      meshNode: "LAD",
      inflate: 2,
      visible: false
    });
    const after = computeModelExtent(meshes);
    expect(after).toBeCloseTo(before, 10);
  });

  it("hatchFrequency spreads HATCH_LINES across the extent", () => {
    expect(hatchFrequency(0.116)).toBeCloseTo(HATCH_LINES / 0.116, 10);
    expect(() => hatchFrequency(0)).toThrow(RangeError);
    expect(() => hatchFrequency(Number.NaN)).toThrow(RangeError);
    expect(() => hatchFrequency(-1)).toThrow(RangeError);
  });

  it("extent 0 (unloaded scene) rather than NaN", () => {
    expect(computeModelExtent({})).toBe(0);
    expect(computeStructureCentres({})).toEqual({});
  });
});

describe("bench lighting provenance (tools/mesh/bench/index.html)", () => {
  it("mirrors the measured rig exactly", () => {
    expect(STAGE_LIGHTS.ambientIntensity).toBe(0.55);
    expect(STAGE_LIGHTS.key.intensity).toBe(2.1);
    expect(STAGE_LIGHTS.key.position).toEqual([0.5, -0.7, 0.8]);
    expect(STAGE_LIGHTS.fill.intensity).toBe(0.7);
    expect(STAGE_LIGHTS.fill.position).toEqual([-0.6, 0.4, -0.3]);
  });
});

describe("disposeStageResources", () => {
  it("disposes every geometry and every unique material in the group", () => {
    const root = makeRoot();
    const renderGroup = buildRenderGroup(root, makeSource());
    const materials = createStageMaterials([
      descriptor({ structureId: "HEART", neutral: true }),
      descriptor({ structureId: "AORTA", neutral: true }),
      descriptor({ structureId: "LAD" })
    ]);
    attachPickProxies(renderGroup.meshes, makeSource(), registry);

    const geometries: { dispose: () => void }[] = [];
    renderGroup.group.traverse((child: Object3D) => {
      const mesh = child as Mesh;
      if (mesh.isMesh === true) geometries.push(mesh.geometry);
    });
    const geometrySpies = geometries.map((geometry) => vi.spyOn(geometry, "dispose"));
    const materialSpies = [
      vi.spyOn(materials.HEART, "dispose"),
      vi.spyOn(materials.LAD, "dispose")
    ];

    disposeStageResources(renderGroup, materials);

    for (const spy of geometrySpies) expect(spy).toHaveBeenCalledTimes(1);
    expect(materialSpies[0]).toHaveBeenCalledTimes(1);
    expect(materialSpies[1]).toHaveBeenCalledTimes(1);
  });
});
