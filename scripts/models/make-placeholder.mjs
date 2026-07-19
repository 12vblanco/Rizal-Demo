// Author the reusable "3D placeholder" GLB — a low-poly tetrahedron carrying a
// baked "3D PLACEHOLDER" text label — so any object can wire a real `model3d`
// block ahead of its official scan (feature 11c). Reproducible; re-run any time
// instead of hand-editing the binary:
//
//   node scripts/models/make-placeholder.mjs
//
// Output: assets-src/models/placeholder-3d.glb (meshopt geometry + WebP texture,
// same optimisation the shipped salakot.glb uses — see scripts/models/README.md).
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { meshopt, textureCompress } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
import path from "node:path";

const repo = process.cwd();
const outPath = path.resolve(repo, "assets-src/models/placeholder-3d.glb");

// Body colour / label colour come from css/tokens.css (--black-cow, --squash) —
// the model stage the site renders 3D against is dark (--model-stage-*), so the
// squash-gold label follows the "gold on dark backgrounds only" rule.
const BODY_COLOR = "#4d4c4c";
const LABEL_COLOR = "#f2ac1d";
const TEX_SIZE = 1024;

async function makeFaceTexture() {
  // Each face's UV triangle (see toUv below) has its full-width base along
  // v=0 (the top of this texture, in glTF's top-left-origin convention) and
  // narrows to a point at the apex (v≈0.866) — so text needs to sit close to
  // the base, not the vertical middle, or the narrowing edges clip it.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TEX_SIZE}" height="${TEX_SIZE}">
    <rect width="${TEX_SIZE}" height="${TEX_SIZE}" fill="${BODY_COLOR}"/>
    <text x="${TEX_SIZE / 2}" y="150" font-family="Arial, Helvetica, sans-serif"
      font-size="56" font-weight="bold" letter-spacing="2" fill="${LABEL_COLOR}" text-anchor="middle">3D</text>
    <text x="${TEX_SIZE / 2}" y="222" font-family="Arial, Helvetica, sans-serif"
      font-size="56" font-weight="bold" letter-spacing="2" fill="${LABEL_COLOR}" text-anchor="middle">PLACEHOLDER</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// Regular tetrahedron, centred on the origin, ~0.5 units across a face —
// a comfortable size for model-viewer's default camera framing.
const V = [
  [1, 1, 1],
  [1, -1, -1],
  [-1, 1, -1],
  [-1, -1, 1],
].map((v) => v.map((n) => n * 0.3));
const FACES = [
  [0, 1, 2],
  [0, 3, 1],
  [0, 2, 3],
  [1, 3, 2],
];

function faceNormal(a, b, c) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [
    u[1] * w[2] - u[2] * w[1],
    u[2] * w[0] - u[0] * w[2],
    u[0] * w[1] - u[1] * w[0],
  ];
  const len = Math.hypot(...n) || 1;
  return n.map((x) => x / len);
}

async function build() {
  const textureBuf = await makeFaceTexture();

  const document = new Document();
  const buffer = document.createBuffer();

  const texture = document
    .createTexture("placeholder-label")
    .setImage(textureBuf)
    .setMimeType("image/png");

  const material = document
    .createMaterial("placeholder")
    .setBaseColorTexture(texture)
    .setRoughnessFactor(0.65)
    .setMetallicFactor(0);

  // Flat shading: each face gets its own 3 vertices so normals aren't averaged.
  // UV is derived from each face's own in-plane basis (e1 along a→b, e2 =
  // outward-normal × e1) rather than a fixed per-vertex-slot UV triangle —
  // deriving e2 from the same outward normal used for lighting guarantees the
  // label reads the same handedness on every face. (A fixed UV triangle keyed
  // only to vertex order mirrors the label on alternating faces: a regular
  // tetrahedron has no consistent way to keep "vertex 0 of each face" facing
  // the same rotational direction on screen.)
  const centroid = V.reduce((s, v) => s.map((x, i) => x + v[i] / V.length), [0, 0, 0]);
  const sub = (p, q) => p.map((x, i) => x - q[i]);
  const dot3 = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
  const norm = (p) => { const len = Math.hypot(...p) || 1; return p.map((x) => x / len); };

  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  FACES.forEach(([ia, ib, ic], f) => {
    let a = V[ia], b = V[ib], c = V[ic];
    let n = faceNormal(a, b, c);
    const toFace = sub([(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3], centroid);
    if (dot3(n, toFace) < 0) {
      [b, c] = [c, b];
      n = faceNormal(a, b, c);
    }
    const e1 = norm(sub(b, a));
    const e2 = norm(cross(e1, n));
    const edge = Math.hypot(...sub(b, a)); // regular tetrahedron: same length every edge
    // cross(e1, n) puts the triangle in the v<0 half-plane; rotate 180° (u,v)
    // -> (1-u, -v) to land in [0,1] — a rotation, so it keeps the chirality
    // (unlike a single-axis flip, which would mirror the label again).
    const toUv = (p) => {
      const [u, v] = [dot3(sub(p, a), e1) / edge, dot3(sub(p, a), e2) / edge];
      return [1 - u, -v];
    };
    const [ua, va] = toUv(a), [ub, vb] = toUv(b), [uc, vc] = toUv(c);

    positions.push(...a, ...b, ...c);
    normals.push(...n, ...n, ...n);
    uvs.push(ua, va, ub, vb, uc, vc);
    indices.push(f * 3, f * 3 + 1, f * 3 + 2);
  });

  const primitive = document
    .createPrimitive()
    .setMaterial(material)
    .setAttribute(
      "POSITION",
      document
        .createAccessor()
        .setType("VEC3")
        .setArray(new Float32Array(positions))
        .setBuffer(buffer),
    )
    .setAttribute(
      "NORMAL",
      document
        .createAccessor()
        .setType("VEC3")
        .setArray(new Float32Array(normals))
        .setBuffer(buffer),
    )
    .setAttribute(
      "TEXCOORD_0",
      document
        .createAccessor()
        .setType("VEC2")
        .setArray(new Float32Array(uvs))
        .setBuffer(buffer),
    )
    .setIndices(
      document
        .createAccessor()
        .setType("SCALAR")
        .setArray(new Uint16Array(indices))
        .setBuffer(buffer),
    );

  const mesh = document.createMesh("placeholder-3d").addPrimitive(primitive);
  const node = document.createNode("placeholder-3d").setMesh(mesh);
  document.createScene().addChild(node);

  await MeshoptEncoder.ready;
  await document.transform(
    textureCompress({ encoder: sharp, targetFormat: "webp" }),
    meshopt({ encoder: MeshoptEncoder }),
  );

  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.encoder": MeshoptEncoder });
  await io.write(outPath, document);

  const { statSync } = await import("node:fs");
  const mb = statSync(outPath).size / (1024 * 1024);
  console.log(`Wrote ${outPath} (${mb.toFixed(3)} MB)`);
}

await build();
