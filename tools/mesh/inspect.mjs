import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { NodeIO } from "@gltf-transform/core";

const REQUIRED_NODES = ["HEART", "AORTA", "LAD", "LCX", "RCA"];
const BUDGETS = { triangles: 150000, drawCalls: 30, textures: 0, structureBytes: 2621440 };

function parseObj(text) {
  let vertices = 0;
  let triangles = 0;
  const groups = new Map();
  let current = "(default)";
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const materialLibs = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith("v ")) {
      vertices += 1;
      const parts = line.trim().split(/\s+/);
      const x = Number(parts[1]);
      const y = Number(parts[2]);
      const z = Number(parts[3]);
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
        min[0] = Math.min(min[0], x);
        min[1] = Math.min(min[1], y);
        min[2] = Math.min(min[2], z);
        max[0] = Math.max(max[0], x);
        max[1] = Math.max(max[1], y);
        max[2] = Math.max(max[2], z);
      }
    } else if (line.startsWith("f ")) {
      triangles += Math.max(0, line.trim().split(/\s+/).length - 3);
      const g = groups.get(current) || { faces: 0, vertices: 0 };
      g.faces += Math.max(0, line.trim().split(/\s+/).length - 3);
      groups.set(current, g);
    } else if (line.startsWith("o ") || line.startsWith("g ")) {
      current = line.trim().slice(2).trim() || "(unnamed)";
      if (!groups.has(current)) groups.set(current, { faces: 0, vertices: 0 });
    } else if (line.startsWith("mtllib ")) {
      materialLibs.push(line.trim().slice(7).trim());
    }
  }
  return { vertices, triangles, groups, min, max, materialLibs };
}

async function inspectGltf(file) {
  const io = new NodeIO();
  const doc = await io.read(file);
  const root = doc.getRoot();
  const nodeNames = [];
  const meshNames = [];
  const walk = (node, depth, trail) => {
    const name = node.getName() || "(unnamed)";
    nodeNames.push({ name, depth, path: [...trail, name].join("/") });
    if (node.getMesh()) meshNames.push(node.getMesh().getName() || name);
    for (const child of node.listChildren()) walk(child, depth + 1, [...trail, name]);
  };
  for (const scene of root.listScenes()) {
    for (const child of scene.listChildren()) walk(child, 0, []);
  }
  let triangles = 0;
  let vertices = 0;
  let primitives = 0;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      primitives += 1;
      const position = prim.getAttribute("POSITION");
      if (!position) continue;
      const count = position.getCount();
      vertices += count;
      const indices = prim.getIndices();
      triangles += indices ? Math.floor(indices.getCount() / 3) : Math.floor(count / 3);
      const arr = position.getArray();
      const stride = arr.length / count;
      for (let i = 0; i < count; i += 1) {
        for (let k = 0; k < 3; k += 1) {
          const v = arr[i * stride + k];
          if (Number.isFinite(v)) {
            min[k] = Math.min(min[k], v);
            max[k] = Math.max(max[k], v);
          }
        }
      }
    }
  }
  const materials = root.listMaterials();
  const textures = root.listTextures();
  const imageKeys = new Set();
  for (const tex of textures) {
    const src = tex.getSource();
    if (src) imageKeys.add(src);
  }
  const images = imageKeys.size;

  const wmin = [Infinity, Infinity, Infinity];
  const wmax = [-Infinity, -Infinity, -Infinity];
  const mulMat = (a, b) => {
    const out = new Array(16).fill(0);
    for (let r = 0; r < 4; r += 1) {
      for (let c = 0; c < 4; c += 1) {
        let s = 0;
        for (let k = 0; k < 4; k += 1) s += a[k * 4 + r] * b[c * 4 + k];
        out[c * 4 + r] = s;
      }
    }
    return out;
  };
  const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const trs = (node) => {
    const t = node.getTranslation();
    const r = node.getRotation();
    const s = node.getScale();
    const [qx, qy, qz, qw] = r;
    const xx = qx * qx, yy = qy * qy, zz = qz * qz;
    const xy = qx * qy, xz = qx * qz, yz = qy * qz;
    const wx = qw * qx, wy = qw * qy, wz = qw * qz;
    return [
      (1 - 2 * (yy + zz)) * s[0], (2 * (xy + wz)) * s[0], (2 * (xz - wy)) * s[0], 0,
      (2 * (xy - wz)) * s[1], (1 - 2 * (xx + zz)) * s[1], (2 * (yz + wx)) * s[1], 0,
      (2 * (xz + wy)) * s[2], (2 * (yz - wx)) * s[2], (1 - 2 * (xx + yy)) * s[2], 0,
      t[0], t[1], t[2], 1,
    ];
  };
  const xform = (m, v) => [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
  ];
  const walkWorld = (node, parent) => {
    const world = mulMat(parent, trs(node));
    const mesh = node.getMesh();
    if (mesh) {
      for (const prim of mesh.listPrimitives()) {
        const position = prim.getAttribute("POSITION");
        if (!position) continue;
        const count = position.getCount();
        const arr = position.getArray();
        const stride = arr.length / count;
        const pmn = [Infinity, Infinity, Infinity];
        const pmx = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < count; i += 1) {
          for (let k = 0; k < 3; k += 1) {
            const v = arr[i * stride + k];
            if (Number.isFinite(v)) {
              pmn[k] = Math.min(pmn[k], v);
              pmx[k] = Math.max(pmx[k], v);
            }
          }
        }
        for (const cx of [pmn[0], pmx[0]]) {
          for (const cy of [pmn[1], pmx[1]]) {
            for (const cz of [pmn[2], pmx[2]]) {
              const w = xform(world, [cx, cy, cz]);
              for (let k = 0; k < 3; k += 1) {
                wmin[k] = Math.min(wmin[k], w[k]);
                wmax[k] = Math.max(wmax[k], w[k]);
              }
            }
          }
        }
      }
    }
    for (const child of node.listChildren()) walkWorld(child, world);
  };
  for (const scene of root.listScenes()) {
    for (const child of scene.listChildren()) walkWorld(child, identity());
  }
  const worldMin = wmin.every(Number.isFinite) ? wmin : null;
  const worldMax = wmax.every(Number.isFinite) ? wmax : null;
  const worldCenter = worldMin
    ? worldMin.map((v, i) => (v + worldMax[i]) / 2)
    : null;

  return {
    format: file.toLowerCase().endsWith(".glb") ? "glb" : "gltf",
    triangles,
    vertices,
    meshes: root.listMeshes().length,
    primitives,
    materials: materials.length,
    textures: textures.length,
    images,
    drawCallEstimate: primitives,
    nodeNames,
    meshNames,
    min,
    max,
    worldMin,
    worldMax,
    worldCenter,
  };
}

function evaluate(report) {
  const names = new Set([
    ...report.nodeNames.map((n) => n.name),
    ...report.meshNames,
    ...(report.groups ? Object.keys(report.groups) : []),
  ]);
  const missing = REQUIRED_NODES.filter((n) => !names.has(n));
  const separable = REQUIRED_NODES.filter((n) => names.has(n));
  const centered =
    !report.worldCenter || report.worldCenter.every((v) => Math.abs(v) <= 0.02);
  return {
    requiredNodesPresent: missing.length === 0,
    missingRequired: missing,
    requiredNodesFound: separable,
    withinTriangleBudget: report.triangles <= BUDGETS.triangles,
    withinDrawCallBudget: report.drawCallEstimate <= BUDGETS.drawCalls,
    zeroTextures: report.textures === 0,
    withinStructureBytes: report.bytes <= BUDGETS.structureBytes,
    worldBoundsCentered: centered,
    budget: BUDGETS,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out-dir");
  const outDir = outIdx >= 0 ? args[outIdx + 1] : "assets/raw";
  const paths = args.filter((a, i) => a !== "--out-dir" && i !== outIdx + 1);
  if (paths.length === 0) {
    console.error("usage: node inspect.mjs <file.glb|file.obj|dir> [--out-dir DIR]");
    process.exit(2);
  }
  fs.mkdirSync(outDir, { recursive: true });
  const results = [];
  for (const target of paths) {
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      const files = fs
        .readdirSync(target)
        .filter((f) => f.toLowerCase().endsWith(".obj"))
        .sort()
        .map((f) => path.join(target, f));
      const perFile = [];
      const groups = {};
      let triangles = 0;
      let vertices = 0;
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      const materialLibs = new Set();
      for (const f of files) {
        const parsed = parseObj(fs.readFileSync(f, "utf8"));
        triangles += parsed.triangles;
        vertices += parsed.vertices;
        for (const m of parsed.materialLibs) materialLibs.add(m);
        for (const k of  [0, 1, 2]) {
          min[k] = Math.min(min[k], parsed.min[k]);
          max[k] = Math.max(max[k], parsed.max[k]);
        }
        perFile.push({ file: path.basename(f), triangles: parsed.triangles, vertices: parsed.vertices });
        groups[path.basename(f, ".obj")] = { faces: parsed.triangles, vertices: parsed.vertices };
      }
      const report = {
        target,
        kind: "obj-directory",
        files: files.length,
        bytes: files.reduce((s, f) => s + fs.statSync(f).size, 0),
        format: "obj",
        triangles,
        vertices,
        meshes: files.length,
        primitives: files.length,
        materials: materialLibs.size,
        textures: 0,
        images: 0,
        drawCallEstimate: files.length,
        nodeNames: Object.keys(groups).map((name) => ({ name, depth: 0, path: name })),
        meshNames: Object.keys(groups),
        groups,
        min,
        max,
        perFile,
        materialLibs: [...materialLibs],
      };
      report.evaluation = evaluate(report);
      const out = path.join(outDir, path.basename(target) + ".inspect.json");
      fs.writeFileSync(out, JSON.stringify(report, null, 2));
      results.push({ out, report });
    } else if (target.toLowerCase().endsWith(".obj")) {
      const bytes = fs.statSync(target).size;
      const parsed = parseObj(fs.readFileSync(target, "utf8"));
      const report = {
        target,
        kind: "obj-file",
        bytes,
        format: "obj",
        triangles: parsed.triangles,
        vertices: parsed.vertices,
        meshes: parsed.groups.size,
        primitives: parsed.groups.size,
        materials: parsed.materialLibs.length,
        textures: 0,
        images: 0,
        drawCallEstimate: parsed.groups.size,
        nodeNames: [...parsed.groups.keys()].map((name) => ({ name, depth: 0, path: name })),
        meshNames: [...parsed.groups.keys()],
        groups: Object.fromEntries(parsed.groups),
        min: parsed.min,
        max: parsed.max,
        materialLibs: parsed.materialLibs,
      };
      report.evaluation = evaluate(report);
      const out = path.join(outDir, path.basename(target, path.extname(target)) + ".inspect.json");
      fs.writeFileSync(out, JSON.stringify(report, null, 2));
      results.push({ out, report });
    } else {
      const bytes = fs.statSync(target).size;
      const report = { target, kind: "gltf", bytes, ...(await inspectGltf(target)) };
      report.evaluation = evaluate(report);
      const out = path.join(outDir, path.basename(target, path.extname(target)) + ".inspect.json");
      fs.writeFileSync(out, JSON.stringify(report, null, 2));
      results.push({ out, report });
    }
  }
  for (const { out, report } of results) {
    const e = report.evaluation;
    console.log(
      [
        `file=${report.target}`,
        `bytes=${report.bytes}`,
        `format=${report.format}`,
        `triangles=${report.triangles}`,
        `vertices=${report.vertices}`,
        `materials=${report.materials}`,
        `textures=${report.textures}`,
        `drawCallEstimate=${report.drawCallEstimate}`,
        `required=${e.requiredNodesPresent ? "ALL_PRESENT" : "MISSING:" + e.missingRequired.join(",")}`,
        `tris<=150k:${e.withinTriangleBudget}`,
        `draws<=30:${e.withinDrawCallBudget}`,
        `textures==0:${e.zeroTextures}`,
        `bytes<=2.5MB:${e.withinStructureBytes}`,
        report.worldCenter
          ? `worldCenter=[${report.worldCenter.map((v) => v.toFixed(4)).join(",")}]`
          : "",
        report.worldCenter ? `centered:${e.worldBoundsCentered}` : "",
        `report=${out}`,
      ].join(" "),
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
