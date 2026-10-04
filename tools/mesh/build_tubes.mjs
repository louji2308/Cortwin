import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { Document, NodeIO } from "@gltf-transform/core";

const REQUIRED_NODES = ["HEART", "AORTA", "LAD", "LCX", "RCA"];

const COLOURS = {
  HEART: [0.82, 0.8, 0.78, 1],
  AORTA: [0.7, 0.74, 0.8, 1],
  LAD: [0.85, 0.25, 0.25, 1],
  LCX: [0.25, 0.55, 0.85, 1],
  RCA: [0.25, 0.7, 0.4, 1],
};

function heartSpiral() {
  const rx = 0.04;
  const ry = 0.044;
  const rz = 0.05;
  const turns = 8;
  const steps = 480;
  const pts = [];
  for (let i = 0; i <= steps; i += 1) {
    const u = i / steps;
    const phi = Math.PI * u;
    const theta = 2 * Math.PI * turns * u;
    const s = Math.sin(phi);
    pts.push([rx * s * Math.cos(theta), ry * s * Math.sin(theta), rz * Math.cos(phi)]);
  }
  return pts;
}

const CENTERLINES = {
  HEART: { points: heartSpiral(), radius: 0.013, radial: 10, cap: true },
  AORTA: {
    points: [
      [0.0, -0.008, -0.036],
      [0.0, -0.012, -0.01],
      [0.002, -0.01, 0.022],
      [0.008, -0.002, 0.044],
      [0.022, 0.01, 0.05],
      [0.034, 0.02, 0.04],
      [0.036, 0.024, 0.018],
      [0.034, 0.026, -0.02],
      [0.032, 0.028, -0.05],
    ],
    radius: 0.011,
    radial: 12,
    taper: 0.72,
    cap: true,
  },
  LAD: {
    points: [
      [0.004, -0.038, -0.012],
      [0.008, -0.044, -0.028],
      [0.014, -0.042, -0.044],
      [0.021, -0.032, -0.056],
      [0.027, -0.018, -0.062],
    ],
    radius: 0.0046,
    radial: 9,
    taper: 0.6,
    cap: true,
  },
  LCX: {
    points: [
      [0.004, -0.034, -0.01],
      [0.024, -0.032, -0.016],
      [0.04, -0.018, -0.024],
      [0.045, 0.004, -0.032],
      [0.04, 0.024, -0.038],
      [0.028, 0.034, -0.042],
    ],
    radius: 0.0044,
    radial: 9,
    taper: 0.7,
    cap: true,
  },
  RCA: {
    points: [
      [-0.004, -0.034, -0.01],
      [-0.024, -0.032, -0.016],
      [-0.04, -0.016, -0.024],
      [-0.045, 0.006, -0.032],
      [-0.038, 0.026, -0.038],
      [-0.022, 0.036, -0.044],
      [-0.006, 0.038, -0.048],
    ],
    radius: 0.0044,
    radial: 9,
    taper: 0.7,
    cap: true,
  },
};

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

function catmullRom(ctrl, samples) {
  const pts = [];
  const n = ctrl.length;
  for (let i = 0; i < n - 1; i += 1) {
    const p0 = ctrl[Math.max(0, i - 1)];
    const p1 = ctrl[i];
    const p2 = ctrl[i + 1];
    const p3 = ctrl[Math.min(n - 1, i + 2)];
    const steps = i === n - 2 ? samples + 1 : samples;
    for (let s = 0; s < steps; s += 1) {
      const t = s / samples;
      const t2 = t * t;
      const t3 = t2 * t;
      const out = [0, 0, 0];
      for (let k = 0; k < 3; k += 1) {
        out[k] =
          0.5 *
          (2 * p1[k] +
            (-p0[k] + p2[k]) * t +
            (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
            (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      }
      pts.push(out);
    }
  }
  return pts;
}

function frames(curve) {
  const n = curve.length;
  const T = [];
  for (let i = 0; i < n; i += 1) {
    const a = curve[Math.max(0, i - 1)];
    const b = curve[Math.min(n - 1, i + 1)];
    T.push(norm(sub(b, a)));
  }
  const seed = [0, 0, 1];
  const seedAlt = [1, 0, 0];
  let N0 = cross(T[0], Math.abs(dot(T[0], seed)) > 0.9 ? seedAlt : seed);
  if (len(N0) < 1e-9) N0 = cross(T[0], seedAlt);
  N0 = norm(N0);
  const N = [N0];
  for (let i = 1; i < n; i += 1) {
    const prev = N[i - 1];
    const projected = sub(prev, mul(T[i], dot(prev, T[i])));
    N.push(len(projected) < 1e-9 ? cross(T[i], [0, 1, 0]) : norm(projected));
  }
  const B = T.map((t, i) => norm(cross(t, N[i])));
  return { T, N, B };
}

function tubeGeometry(spec) {
  const raw = spec.points;
  const curve = spec.spiral ? raw : catmullRom(raw, spec.samplesPerSegment ?? 24);
  const { T, N, B } = frames(curve);
  const n = curve.length;
  const radial = spec.radial;
  const radius = spec.radius;
  const taper = spec.taper ?? 1;

  const positions = [];
  const normals = [];
  const indices = [];

  for (let i = 0; i < n; i += 1) {
    const u = i / (n - 1);
    const r = radius * (1 - (1 - taper) * u);
    for (let j = 0; j < radial; j += 1) {
      const a = (2 * Math.PI * j) / radial;
      const dir = add(mul(N[i], Math.cos(a)), mul(B[i], Math.sin(a)));
      positions.push(...add(curve[i], mul(dir, r)));
      normals.push(...dir);
    }
  }
  for (let i = 0; i < n - 1; i += 1) {
    for (let j = 0; j < radial; j += 1) {
      const jn = (j + 1) % radial;
      const a = i * radial + j;
      const b = i * radial + jn;
      const c = (i + 1) * radial + j;
      const d = (i + 1) * radial + jn;
      indices.push(a, c, b, b, c, d);
    }
  }

  if (spec.cap) {
    for (const end of [0, 1]) {
      const i = end === 0 ? 0 : n - 1;
      const centreIdx = positions.length / 3;
      positions.push(...curve[i]);
      normals.push(...(end === 0 ? mul(T[i], -1) : T[i]));
      const ringOffset = i * radial;
      for (let j = 0; j < radial; j += 1) {
        const jn = (j + 1) % radial;
        if (end === 0) indices.push(centreIdx, ringOffset + j, ringOffset + jn);
        else indices.push(centreIdx, ringOffset + jn, ringOffset + j);
      }
    }
  }
  return { positions, normals, indices };
}

function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  const outPath =
    outIdx >= 0 ? args[outIdx + 1] : path.join("assets", "fallback", "heart_tubes.glb");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const doc = new Document();
  const buffer = doc.createBuffer("buffers/0");
  const scene = doc.createScene("Scene");

  const geos = {};
  let allPositions = [];
  for (const name of REQUIRED_NODES) {
    const spec = { ...CENTERLINES[name], spiral: name === "HEART" };
    const geo = tubeGeometry(spec);
    geos[name] = geo;
    allPositions = allPositions.concat(geo.positions);
  }

  const centre = [0, 1, 2].map((k) => {
    const vals = allPositions.filter((_, i) => i % 3 === k);
    return (Math.min(...vals) + Math.max(...vals)) / 2;
  });

  for (const name of REQUIRED_NODES) {
    const geo = geos[name];
    const shifted = new Float32Array(geo.positions.length);
    for (let i = 0; i < geo.positions.length; i += 3) {
      shifted[i] = geo.positions[i] - centre[0];
      shifted[i + 1] = geo.positions[i + 1] - centre[1];
      shifted[i + 2] = geo.positions[i + 2] - centre[2];
    }
    const use32 = shifted.length / 3 > 65535;
    const idxArray = use32
      ? new Uint32Array(geo.indices)
      : new Uint16Array(geo.indices);

    const position = doc
      .createAccessor(`${name}/POSITION`)
      .setType("VEC3")
      .setArray(shifted)
      .setBuffer(buffer);
    const normal = doc
      .createAccessor(`${name}/NORMAL`)
      .setType("VEC3")
      .setArray(new Float32Array(geo.normals))
      .setBuffer(buffer);
    const indices = doc
      .createAccessor(`${name}/INDICES`)
      .setType("SCALAR")
      .setArray(idxArray)
      .setBuffer(buffer);
    const material = doc
      .createMaterial(name)
      .setBaseColorFactor(COLOURS[name])
      .setMetallicFactor(0)
      .setRoughnessFactor(0.85)
      .setDoubleSided(false);
    const primitive = doc
      .createPrimitive()
      .setAttribute("POSITION", position)
      .setAttribute("NORMAL", normal)
      .setIndices(indices)
      .setMaterial(material);
    const mesh = doc.createMesh(name).addPrimitive(primitive);
    const node = doc.createNode(name).setMesh(mesh);
    scene.addChild(node);
  }

  return new NodeIO().write(outPath, doc).then(() => {
    const bytes = fs.statSync(outPath).size;
    let triangles = 0;
    let vertices = 0;
    for (const name of REQUIRED_NODES) {
      const geo = geos[name];
      triangles += geo.indices.length / 3;
      vertices += geo.positions.length / 3;
    }
    console.log(
      [
        `wrote=${outPath}`,
        `bytes=${bytes}`,
        `nodes=${REQUIRED_NODES.join(",")}`,
        `triangles=${triangles}`,
        `vertices=${vertices}`,
        `centreSubtracted=[${centre.map((v) => v.toFixed(5)).join(",")}]`,
        `bytes<=2621440:${bytes <= 2621440}`,
        `tris<=150000:${triangles <= 150000}`,
      ].join(" "),
    );
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
