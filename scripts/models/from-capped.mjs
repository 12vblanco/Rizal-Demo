// Turn the "capped" GLB re-delivery into shippable, optimised GLBs.
//
//   node scripts/models/from-capped.mjs <id|all> [--texture 2048] [--rotate x,y,z] [--yaw deg]
//
// The second delivery (NEW-ASSETS /3d_capped/) closes the open undersides of the
// four photogrammetry scans with a "cap" primitive carrying its own small
// texture. It arrives as plain GLB — 4096² JPEG atlas, no compression, and (for
// three of the four) still in Metashape's camera-local coordinates. This script
// bakes the same orientation as from-metashape.mjs, centres and scales the model
// so its longest axis is 1, downsizes textures, and finishes with the house
// meshopt + WebP optimisation, so the result matches the other models on the site.
import { statSync } from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, textureCompress } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

const repo = process.cwd();
// Raw client delivery. Git-ignored, and the folder name really does end in a space.
const DELIVERY = "NEW-ASSETS /3d_capped";

// `rotate` (degrees, X then Y then Z) levels the object; `yaw` then turns its
// front to +Z — same meaning as MODELS in from-metashape.mjs. The values are not
// the same, though: the capped files do not all share the original scan frame
// (San Antonio arrives already Y-up). `level: true` instead levels the object off
// its cap: the cap is the flat base, so its area-weighted normal is turned to
// point straight down, which is exact where a by-eye `rotate` can only guess.
// Verify each with scripts/models/orient-sheet.mjs.
const MODELS = {
  "josephine-sleeping": { file: "josephine_sleeping.glb", rotate: [0, 0, 0], yaw: 0 },
  "oyang-dapitana": { file: "oyang_dapitana.glb", rotate: [0, 0, 0], level: true, yaw: 180 },
  "sacred-heart-of-jesus": { file: "sacred_heart_of_jesus.glb", rotate: [0, 0, 0], level: true, yaw: 0 },
  "san-antonio-de-padua": { file: "san_antonio_de_padua.glb", rotate: [0, 0, 0], yaw: 0 },
};

/** Multiply two row-major 3x3 matrices. */
function mul(a, b) {
  const out = new Array(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) out[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  }
  return out;
}

/** Rotation turning unit vector `n` onto -Y (Rodrigues). */
function levelTo(n) {
  const [x, y, z] = n;
  const c = -y; // n · (0,-1,0)
  if (c < -0.999999) return [1, 0, 0, 0, -1, 0, 0, 0, -1]; // pointing up: flip about X
  // axis k = n × (0,-1,0) = (z, 0, -x), unnormalised; R = I + K + K²/(1+c)
  const [kx, ky, kz] = [z, 0, -x];
  const K = [0, -kz, ky, kz, 0, -kx, -ky, kx, 0];
  const K2 = mul(K, K);
  return [1, 0, 0, 0, 1, 0, 0, 0, 1].map((v, i) => v + K[i] + K2[i] / (1 + c));
}

/** Area-weighted normal of a primitive, oriented away from `away`'s centroid. */
function baseNormal(cap, away) {
  const pos = cap.getAttribute("POSITION").getArray();
  const idx = cap.getIndices().getArray();
  const n = [0, 0, 0];
  for (let f = 0; f < idx.length; f += 3) {
    const [a, b, c] = [idx[f] * 3, idx[f + 1] * 3, idx[f + 2] * 3];
    const e1 = [0, 1, 2].map((k) => pos[b + k] - pos[a + k]);
    const e2 = [0, 1, 2].map((k) => pos[c + k] - pos[a + k]);
    n[0] += e1[1] * e2[2] - e1[2] * e2[1];
    n[1] += e1[2] * e2[0] - e1[0] * e2[2];
    n[2] += e1[0] * e2[1] - e1[1] * e2[0];
  }
  const centroid = (acc) => {
    const a = acc.getArray(), out = [0, 0, 0];
    for (let i = 0; i < a.length; i += 3) for (let k = 0; k < 3; k++) out[k] += a[i + k];
    return out.map((v) => v / (a.length / 3));
  };
  const d = centroid(cap.getAttribute("POSITION")).map((v, k) => v - centroid(away.getAttribute("POSITION"))[k]);
  const len = Math.hypot(...n);
  const sign = n[0] * d[0] + n[1] * d[1] + n[2] * d[2] < 0 ? -1 : 1;
  return n.map((v) => (sign * v) / len);
}

/** Apply a row-major 3x3 to every VEC3 of `sem` on the primitives. */
function transform(prims, m) {
  for (const p of prims) {
    for (const sem of ["POSITION", "NORMAL"]) {
      const acc = p.getAttribute(sem);
      if (!acc) continue;
      const a = acc.getArray();
      for (let i = 0; i < a.length; i += 3) {
        const [x, y, z] = [a[i], a[i + 1], a[i + 2]];
        a[i] = m[0] * x + m[1] * y + m[2] * z;
        a[i + 1] = m[3] * x + m[4] * y + m[5] * z;
        a[i + 2] = m[6] * x + m[7] * y + m[8] * z;
      }
    }
  }
}

/** Row-major 3x3 for intrinsic X→Y→Z degrees. */
function rotation([rx, ry, rz]) {
  const d = Math.PI / 180;
  const [sx, cx] = [Math.sin(rx * d), Math.cos(rx * d)];
  const [sy, cy] = [Math.sin(ry * d), Math.cos(ry * d)];
  const [sz, cz] = [Math.sin(rz * d), Math.cos(rz * d)];
  return [
    cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx,
    sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx,
    -sy, cy * sx, cy * cx,
  ];
}

/** Row-major 3x3 for `deg` about Y. */
function yawMatrix(deg) {
  const d = (deg * Math.PI) / 180;
  return [Math.cos(d), 0, Math.sin(d), 0, 1, 0, -Math.sin(d), 0, Math.cos(d)];
}

async function convert(id, { textureSize, rotate, yaw }) {
  const spec = MODELS[id];
  if (!spec) throw new Error(`unknown model "${id}" — known: ${Object.keys(MODELS).join(", ")}`);
  const src = path.join(repo, DELIVERY, spec.file);
  const outPath = path.join(repo, "assets-src/models", `${id}.glb`);

  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.encoder": MeshoptEncoder });
  const doc = await io.read(src);
  const root = doc.getRoot();
  const prims = root.listMeshes().flatMap((mesh) => mesh.listPrimitives());

  // Every delivered node carries an identity transform, so vertex data is
  // already in model space and can be rewritten in place.
  for (const node of root.listNodes()) {
    const ident = node.getMatrix().every((v, i) => v === (i % 5 === 0 ? 1 : 0));
    if (!ident) throw new Error(`${spec.file}: node "${node.getName()}" has a transform — not handled`);
  }

  // Orient (rotate, then level off the cap, then yaw), then centre on the
  // origin and scale the longest axis to 1 across all primitives together, so
  // the cap stays attached to the scan. Primitive 0 is the scan, 1 the cap.
  transform(prims, rotation(rotate ?? spec.rotate));
  if (spec.level) transform(prims, levelTo(baseNormal(prims[1], prims[0])));
  transform(prims, yawMatrix(yaw ?? spec.yaw));
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of prims) {
    const a = p.getAttribute("POSITION").getArray();
    for (let i = 0; i < a.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], a[i + k]);
        max[k] = Math.max(max[k], a[i + k]);
      }
    }
  }
  const centre = min.map((v, k) => (v + max[k]) / 2);
  const scale = 1 / Math.max(...max.map((v, k) => v - min[k]));
  for (const p of prims) {
    const a = p.getAttribute("POSITION").getArray();
    for (let i = 0; i < a.length; i += 3) {
      for (let k = 0; k < 3; k++) a[i + k] = (a[i + k] - centre[k]) * scale;
    }
  }

  // Same material treatment as from-metashape.mjs: a baked diffuse capture.
  root.listMaterials().forEach((mat, i) => {
    mat.setName(i === 0 ? `${id}-material` : `${id}-cap`)
      .setMetallicFactor(0)
      .setRoughnessFactor(0.85)
      .setDoubleSided(true);
  });
  root.listMeshes().forEach((mesh) => mesh.setName(id));
  root.listNodes().forEach((node) => node.setName(id));
  root.getAsset().extras = {
    title: id,
    source: "Agisoft Metashape photogrammetry (capped), National Museum of the Philippines",
    pipeline: "scripts/models/from-capped.mjs",
  };

  await MeshoptEncoder.ready;
  await doc.transform(
    dedup(),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: "webp", quality: 85, resize: [textureSize, textureSize] }),
    meshopt({ encoder: MeshoptEncoder }),
  );
  await io.write(outPath, doc);

  const tris = prims.reduce((n, p) => n + p.getIndices().getCount() / 3, 0);
  const mb = statSync(outPath).size / (1024 * 1024);
  console.log(`${id}: ${tris.toLocaleString()} tris → assets-src/models/${id}.glb (${mb.toFixed(2)} MB${mb > 8 ? " — OVER THE 8 MB BUDGET" : ""})`);
  return mb;
}

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const target = args[0];
if (!target || target.startsWith("--")) {
  console.error("usage: node scripts/models/from-capped.mjs <id|all> [--texture 2048] [--rotate x,y,z] [--yaw deg]");
  process.exit(1);
}
const textureSize = Number(flag("texture", 2048));
const rotateArg = flag("rotate", null);
const rotate = rotateArg ? rotateArg.split(",").map(Number) : null;
const yawArg = flag("yaw", null);
const yaw = yawArg === null ? null : Number(yawArg);
const ids = target === "all" ? Object.keys(MODELS) : [target];

let over = false;
for (const id of ids) if ((await convert(id, { textureSize, rotate, yaw })) > 8) over = true;
if (over) process.exit(1);
