/**
 * Three.js part builders — imperative, React-free construction of everything
 * the stage renders (Architecture §10.2, `C-11`, `C-16` budgets).
 *
 * Laws encoded here:
 * - **Render only registry-named nodes.** {@link buildRenderGroup} reparents
 *   exactly the five `source.nodes[*].meshNode` objects into a fresh group via
 *   `Object3D.attach` (world transforms preserved); anything else in the loaded
 *   file is simply never rendered. Never the whole glTF root, blindly.
 * - **Proxies are invisible and raycastable.** {@link attachPickProxy} clones a
 *   vessel's geometry, scales it about the vessel's *own* geometry centre (the
 *   model is centred at the origin, so scaling about the node origin would
 *   displace the proxy), attaches it under the vessel mesh, and marks it
 *   `visible = false` — the renderer skips it, the raycaster does not.
 * - **One hatch shader patch.** {@link patchHatchShader} injects world-space
 *   stripes after the stock `#include` anchors and *throws* if an anchor is
 *   missing — a three.js upgrade that dropped an anchor must fail loudly, not
 *   silently ship an unhatched stage. Frequency is a uniform derived from the
 *   measured model extent (the model is ±0.07 units, so stripes must be
 *   uniform-driven, never hard-coded per material).
 * - **Colour enters three.js through `setRGB(…, SRGBColorSpace)`** so ramp
 *   channels (sRGB) are converted exactly once — no `rgb()` string parsing, no
 *   double conversion, no rounding of tweened channels.
 *
 * Lights mirror the validated bench (`tools/mesh/bench/index.html`): ambient
 * 0.55, key 2.1 at `(0.5, -0.7, 0.8)`, fill 0.7 at `(-0.6, 0.4, -0.3)`,
 * roughness 0.75, metalness 0 — the measured ≥30 fps configuration.
 *
 * Testable in Node: three's Object3D/Mesh/Box3/Raycaster/materials need no
 * WebGL context. Only actual GL rendering happens in the browser.
 */
import {
  Box3,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SRGBColorSpace,
  Vector3,
  type BufferGeometry
} from "three";
import {
  REQUIRED_STRUCTURE_IDS,
  SceneError,
  buildPickingProxies,
  type PickingProxy,
  type RegistrySlice,
  type StructureId,
  type StructureSource
} from "../scene";
import type { Vec3 } from "./cameraPoses";
import type { StructureDescriptor } from "./materials";
import { PROXY_NAME_SUFFIX } from "./picking";

/** Bench lighting — the exact rig that measured ≥30 fps on integrated graphics. */
export const STAGE_LIGHTS = {
  ambientIntensity: 0.55,
  key: { intensity: 2.1, position: [0.5, -0.7, 0.8] as Vec3 },
  fill: { intensity: 0.7, position: [-0.6, 0.4, -0.3] as Vec3 }
} as const;

/** Bench material parameters (roughness 0.75, metalness 0). */
export const STAGE_MATERIAL_PARAMS = { roughness: 0.75, metalness: 0 } as const;

/** World-space hatch stripe count across the model's largest extent. */
export const HATCH_LINES = 16;

/* ------------------------------------------------------------------ *
 * Render group: only the five named nodes.
 * ------------------------------------------------------------------ */

export type StageRenderGroup = {
  group: Group;
  /** The renderable mesh for each `C-11` structure id, contract order. */
  meshes: Record<StructureId, Mesh>;
};

function firstMeshUnder(node: Object3D): Mesh | null {
  let found: Mesh | null = null;
  node.traverse((child) => {
    if (found === null && (child as Mesh).isMesh === true) {
      found = child as Mesh;
    }
  });
  return found;
}

/**
 * Reparent exactly the five named nodes into a fresh group and record their
 * meshes. `attach` preserves world transforms, so a node whose glTF parent had
 * a transform still lands where it was authored.
 *
 * @throws {SceneError} `MISSING_REQUIRED_NODE` when a named node has no mesh
 * anywhere under it — an unrenderable structure is never silently skipped.
 */
export function buildRenderGroup(root: Object3D, source: StructureSource): StageRenderGroup {
  root.updateWorldMatrix(true, true);
  const group = new Group();
  group.name = "CorTwinStageRenderGroup";
  const meshes = {} as Record<StructureId, Mesh>;
  const missing: string[] = [];

  for (const structureId of REQUIRED_STRUCTURE_IDS) {
    const meshNode = source.nodes[structureId].meshNode;
    const node = root.getObjectByName(meshNode);
    const mesh = node === undefined || node === null ? null : firstMeshUnder(node);
    if (node === undefined || node === null || mesh === null) {
      missing.push(structureId);
      continue;
    }
    group.attach(node);
    meshes[structureId] = mesh;
  }

  if (missing.length > 0) {
    throw new SceneError(
      "MISSING_REQUIRED_NODE",
      `Structure is missing renderable node(s): ${missing.join(", ")}`,
      { detail: { missing }, recoverable: false }
    );
  }
  return { group, meshes };
}

/* ------------------------------------------------------------------ *
 * Materials: one per vessel, one shared by the neutrals, hatch-patched.
 * ------------------------------------------------------------------ */

export type HatchUniforms = {
  uCtHatchFreq: { value: number };
  uCtHatchStrength: { value: number };
};

export function createHatchUniforms(frequency: number): HatchUniforms {
  return { uCtHatchFreq: { value: frequency }, uCtHatchStrength: { value: 0 } };
}

function replaceAnchor(source: string, anchor: string, injected: string): string {
  if (!source.includes(anchor)) {
    throw new Error(`Stage hatch shader anchor missing: ${anchor}`);
  }
  return source.replace(anchor, injected);
}

/**
 * Inject world-space hatch stripes into a stock three.js shader.
 *
 * Runs inside `onBeforeCompile` (before three resolves `#include`s), so the
 * anchors are the literal include lines of `meshphysical` — asserted against
 * the installed three's own GLSL in `threeParts.test.ts`. Stripes darken the
 * albedo (never transparency: anatomy must stay opaque).
 */
export function patchHatchShader(
  shader: { vertexShader: string; fragmentShader: string; uniforms: Record<string, unknown> },
  uniforms: HatchUniforms
): void {
  shader.uniforms.uCtHatchFreq = uniforms.uCtHatchFreq;
  shader.uniforms.uCtHatchStrength = uniforms.uCtHatchStrength;

  shader.vertexShader = replaceAnchor(
    shader.vertexShader,
    "#include <common>",
    "#include <common>\nvarying vec3 vCtHatchPos;"
  );
  shader.vertexShader = replaceAnchor(
    shader.vertexShader,
    "#include <begin_vertex>",
    "#include <begin_vertex>\nvCtHatchPos = (modelMatrix * vec4(transformed, 1.0)).xyz;"
  );

  shader.fragmentShader = replaceAnchor(
    shader.fragmentShader,
    "#include <common>",
    "#include <common>\nvarying vec3 vCtHatchPos;\nuniform float uCtHatchFreq;\nuniform float uCtHatchStrength;"
  );
  shader.fragmentShader = replaceAnchor(
    shader.fragmentShader,
    "#include <color_fragment>",
    "#include <color_fragment>\nfloat ctStripe = step(0.5, fract(dot(vCtHatchPos, vec3(1.0, 1.0, 0.4)) * uCtHatchFreq));\ndiffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.45, ctStripe * uCtHatchStrength);"
  );
}

function createHatchableMaterial(): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    roughness: STAGE_MATERIAL_PARAMS.roughness,
    metalness: STAGE_MATERIAL_PARAMS.metalness
  });
  const uniforms = createHatchUniforms(1);
  material.userData.ctHatch = uniforms;
  material.onBeforeCompile = (shader) => {
    patchHatchShader(shader, uniforms);
  };
  return material;
}

/**
 * Create the render materials for one frame's descriptors: vessels get their
 * own instance (their colours differ), the neutrals share one (same colour,
 * never emissive, never hatched — `C-11`).
 */
export function createStageMaterials(
  descriptors: readonly StructureDescriptor[]
): Record<StructureId, MeshStandardMaterial> {
  const materials = {} as Record<StructureId, MeshStandardMaterial>;
  let neutral: MeshStandardMaterial | null = null;

  for (const descriptor of descriptors) {
    if (descriptor.neutral) {
      if (neutral === null) {
        neutral = createHatchableMaterial();
        updateStageMaterial(neutral, descriptor);
      }
      materials[descriptor.structureId] = neutral;
    } else {
      const material = createHatchableMaterial();
      updateStageMaterial(material, descriptor);
      materials[descriptor.structureId] = material;
    }
  }
  return materials;
}

/** Apply a descriptor: albedo, emissive accent, hatch strength. sRGB in, one conversion. */
export function updateStageMaterial(
  material: MeshStandardMaterial,
  descriptor: StructureDescriptor
): void {
  material.color.setRGB(
    descriptor.colour[0],
    descriptor.colour[1],
    descriptor.colour[2],
    SRGBColorSpace
  );
  material.emissive.setRGB(
    descriptor.emissive[0],
    descriptor.emissive[1],
    descriptor.emissive[2],
    SRGBColorSpace
  );
  const uniforms = material.userData.ctHatch as HatchUniforms | undefined;
  if (uniforms !== undefined) {
    uniforms.uCtHatchStrength.value = descriptor.hatch ? 1 : 0;
  }
}

/** Point a material's hatch stripes at the measured model extent. */
export function setHatchFrequency(material: MeshStandardMaterial, frequency: number): void {
  const uniforms = material.userData.ctHatch as HatchUniforms | undefined;
  if (uniforms === undefined) {
    throw new Error("Stage material has no hatch uniforms");
  }
  uniforms.uCtHatchFreq.value = frequency;
}

/* ------------------------------------------------------------------ *
 * Picking proxies: invisible, inflated, centred on the vessel.
 * ------------------------------------------------------------------ */

let PROXY_MATERIAL: MeshBasicMaterial | null = null;

function pickProxyMaterial(): MeshBasicMaterial {
  if (PROXY_MATERIAL === null) {
    // DoubleSide so a ray that grazes the inside of a tube still hits: picking
    // forgiveness, never rendered (object.visible = false).
    PROXY_MATERIAL = new MeshBasicMaterial({ side: DoubleSide });
  }
  return PROXY_MATERIAL;
}

/**
 * Build and attach one invisible picking proxy under its vessel mesh: geometry
 * cloned, re-centred on the vessel's own bounding-box centre, inflated by
 * `PICK_PROXY_INFLATE` (scaling about the geometry centre keeps the proxy on
 * the vessel — the model is centred at the origin, a naive `mesh.scale`
 * multiplier would displace it outward).
 */
export function attachPickProxy(mesh: Mesh, proxy: PickingProxy): Mesh {
  const geometry: BufferGeometry = mesh.geometry.clone();
  geometry.computeBoundingBox();
  const centre =
    geometry.boundingBox === null ? new Vector3() : geometry.boundingBox.getCenter(new Vector3());
  geometry.translate(-centre.x, -centre.y, -centre.z);
  geometry.scale(proxy.inflate, proxy.inflate, proxy.inflate);
  geometry.userData.ctProxy = true;

  const proxyMesh = new Mesh(geometry, pickProxyMaterial());
  proxyMesh.name = `${proxy.meshNode}${PROXY_NAME_SUFFIX}`;
  proxyMesh.visible = proxy.visible;
  proxyMesh.frustumCulled = false;
  proxyMesh.position.copy(centre);
  mesh.add(proxyMesh);
  return proxyMesh;
}

/** Attach the registry's three vessel proxies ({@link buildPickingProxies}). */
export function attachPickProxies(
  meshes: Record<StructureId, Mesh>,
  source: StructureSource,
  registry: RegistrySlice
): Mesh[] {
  return buildPickingProxies(source, registry).map((proxy) =>
    attachPickProxy(meshes[proxy.structureId], proxy)
  );
}

/* ------------------------------------------------------------------ *
 * Measurements (renderer-independent, proxies excluded).
 * ------------------------------------------------------------------ */

function meshWorldBox(mesh: Mesh): Box3 | null {
  mesh.updateWorldMatrix(true, false);
  mesh.geometry.computeBoundingBox();
  const local = mesh.geometry.boundingBox;
  if (local === null || local.isEmpty()) return null;
  return local.clone().applyMatrix4(mesh.matrixWorld);
}

/**
 * World-space centre of each structure's own geometry — the camera framing
 * input for {@link cameraPoseFor}. Proxy children are excluded by measuring
 * geometry directly instead of `Box3.setFromObject` (which traverses into the
 * invisible proxies).
 */
export function computeStructureCentres(
  meshes: Partial<Record<StructureId, Mesh>>
): Partial<Record<StructureId, Vec3>> {
  const centres: Partial<Record<StructureId, Vec3>> = {};
  for (const structureId of Object.keys(meshes) as StructureId[]) {
    const mesh = meshes[structureId];
    if (mesh === undefined) continue;
    const box = meshWorldBox(mesh);
    if (box === null) continue;
    const centre = box.getCenter(new Vector3());
    centres[structureId] = [centre.x, centre.y, centre.z];
  }
  return centres;
}

/** Largest world-space dimension across all structures (proxy children excluded). */
export function computeModelExtent(meshes: Partial<Record<StructureId, Mesh>>): number {
  const union = new Box3();
  let any = false;
  for (const structureId of Object.keys(meshes) as StructureId[]) {
    const mesh = meshes[structureId];
    if (mesh === undefined) continue;
    const box = meshWorldBox(mesh);
    if (box === null) continue;
    union.union(box);
    any = true;
  }
  if (!any || union.isEmpty()) return 0;
  const size = union.getSize(new Vector3());
  return Math.max(size.x, size.y, size.z);
}

/**
 * Hatch stripe frequency for a model of `extent` world units: {@link HATCH_LINES}
 * stripes across the largest dimension. Uniform-driven because the model is
 * ±0.07 units — a fixed frequency would render solid colour at any other scale.
 *
 * @throws {RangeError} for non-finite/non-positive extents (an unloaded scene
 * must not silently produce NaN stripes).
 */
export function hatchFrequency(extent: number): number {
  if (!Number.isFinite(extent) || extent <= 0) {
    throw new RangeError(`hatchFrequency requires a positive finite extent, got ${extent}`);
  }
  return HATCH_LINES / extent;
}

/* ------------------------------------------------------------------ *
 * Disposal (Architecture §10: explicit disposal on unmount).
 * ------------------------------------------------------------------ */

/**
 * Dispose every geometry and material the render group owns. Proxy geometries
 * are clones, original geometries came from our own load — both are ours to
 * release. The shared proxy material is module-level and stays (it never
 * compiles a program: it is never rendered).
 */
export function disposeStageResources(
  renderGroup: StageRenderGroup,
  materials: Record<StructureId, MeshStandardMaterial>
): void {
  const geometries = new Set<BufferGeometry>();
  renderGroup.group.traverse((child) => {
    const mesh = child as Mesh;
    if (mesh.isMesh === true) geometries.add(mesh.geometry);
  });
  for (const geometry of geometries) geometry.dispose();

  const unique = new Set(Object.values(materials));
  for (const material of unique) material.dispose();
}
