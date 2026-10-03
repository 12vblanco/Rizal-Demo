// Turn an Agisoft Metashape model archive into a shippable, optimised GLB.
//
//   node scripts/models/from-metashape.mjs <id|all> [--texture 2048] [--rotate x,y,z] [--yaw deg]
//
// The client delivered the photogrammetry as Metashape projects (`.psx` plus a
// `.files/` tree), which looks like it needs Metashape to export. It does not:
// each `0/0/model*/model.zip` already holds a plain `mesh.ply` (binary
// little-endian, triangles, per-corner UVs) next to its `texture.tif`. This
// script reads those two directly, so no Metashape and no Blender are involved
// and the whole conversion is reproducible from the raw delivery.
//
// The delivered meshes are 43k–73k triangles, already inside the 50k–150k budget
// in README.md, so nothing is decimated — this is a format conversion plus a
// texture downscale, then the same meshopt + WebP optimisation every other model
// in the repo goes through (see make-placeholder.mjs).
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { meshopt, textureCompress } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

const repo = process.cwd();
// Raw client delivery. Git-ignored, and the folder name really does end in a space.
const DELIVERY = "NEW-ASSETS /rizal as an artist/Photogrammetry";

// Per-object source + orientation. Metashape leaves an un-georeferenced chunk in
// arbitrary camera-local coordinates, and none of the four chunks carries a
// region or transform, so "which way is up" cannot be read from the data — it is
// recorded here, verified against the reference photograph already in the repo at
// assets-src/images/<id>/front.webp, using scripts/models/orient-sheet.mjs.
//
// `rotate` levels the object: degrees applied X then Y then Z, chosen so the base
// sits flat and the object stands up. `yaw` then spins the levelled object about
// the vertical axis so its front faces +Z, which is where the gallery camera and
// the poster render look from. Both are baked into the vertex data before
// centring. Keeping the two separate matters: a yaw folded into `rotate` would be
// applied before levelling and would tip the object back over.
const MODELS = {
  "josephine-sleeping": {
    model: "Josephine Sleeping.files/0/0/model",
    rotate: [0, 0, 0],
    yaw: 0,
  },
  "oyang-dapitana": {
    // Two meshes were delivered; model.1 is the later one (69,522 vs 68,817
    // triangles, and a 62.6 MB vs 15.6 MB texture).
    model: "Oyang Dapitana.files/0/0/model.1",
    rotate: [-60, 0, 14],
    yaw: 270,
  },
  "sacred-heart-of-jesus": {
    model: "Sacred Heart of Jesus.files/0/0/model",
    rotate: [0, 14, 90],
    yaw: 180,
  },
  "san-antonio-de-padua": {
    model: "San Antonio de Padua.files/0/0/model",
    rotate: [-90, 0, 27.5],
    yaw: 90,
  },
};

// ---------------------------------------------------------------- PLY reading

const PLY_TYPES = {
  char: 1, uchar: 1, int8: 1, uint8: 1,
  short: 2, ushort: 2, int16: 2, uint16: 2,
  int: 4, uint: 4, int32: 4, uint32: 4, float: 4, float32: 4,
  double: 8, float64: 8,
};

/** Read one scalar of `type` at `off`. */
function readScalar(buf, off, type) {
  switch (type) {
    case "char": case "int8": return buf.readInt8(off);
    case "uchar": case "uint8": return buf.readUInt8(off);
    case "short": case "int16": return buf.readInt16LE(off);
    case "ushort": case "uint16": return buf.readUInt16LE(off);
    case "int": case "int32": return buf.readInt32LE(off);
    case "uint": case "uint32": return buf.readUInt32LE(off);
    case "float": case "float32": return buf.readFloatLE(off);
    case "double": case "float64": return buf.readDoubleLE(off);
    default: throw new Error(`unsupported PLY type "${type}"`);
  }
}

/**
 * Parse a binary-little-endian PLY into positions plus per-face corner UVs.
 * Property layout is read from the header rather than assumed, so a mesh from a
 * different Metashape version (the four here span 1.2 and 1.7) still parses.
 */
function parsePly(buf) {
  const marker = buf.indexOf("end_header\n");
  if (marker < 0) throw new Error("not a PLY: no end_header");
  const header = buf.subarray(0, marker).toString("latin1");
  if (!/format\s+binary_little_endian/.test(header)) {
    throw new Error("only binary_little_endian PLY is supported");
  }

  // Walk the header into elements, each with its ordered property list.
  const elements = [];
  for (const line of header.split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] === "element") {
      elements.push({ name: parts[1], count: Number(parts[2]), props: [] });
    } else if (parts[0] === "property" && elements.length) {
      const el = elements[elements.length - 1];
      if (parts[1] === "list") {
        el.props.push({ list: true, countType: parts[2], valueType: parts[3], name: parts[4] });
      } else {
        el.props.push({ list: false, type: parts[1], name: parts[2] });
      }
    }
  }

  let off = marker + "end_header\n".length;
  let positions = null;
  let faces = null;

  for (const el of elements) {
    if (el.name === "vertex") {
      if (el.props.some((p) => p.list)) throw new Error("list properties on vertex are unsupported");
      // Fixed stride, so x/y/z can be read by offset without touching the rest
      // (the delivered meshes also carry rgb + confidence, both unused here).
      let stride = 0;
      const offsets = {};
      for (const p of el.props) {
        offsets[p.name] = { off: stride, type: p.type };
        stride += PLY_TYPES[p.type] ?? (() => { throw new Error(`unknown type ${p.type}`); })();
      }
      for (const axis of ["x", "y", "z"]) {
        if (!offsets[axis]) throw new Error(`vertex element has no "${axis}"`);
      }
      positions = new Float64Array(el.count * 3);
      for (let i = 0; i < el.count; i++) {
        const base = off + i * stride;
        positions[i * 3] = readScalar(buf, base + offsets.x.off, offsets.x.type);
        positions[i * 3 + 1] = readScalar(buf, base + offsets.y.off, offsets.y.type);
        positions[i * 3 + 2] = readScalar(buf, base + offsets.z.off, offsets.z.type);
      }
      off += el.count * stride;
    } else if (el.name === "face") {
      const indices = new Uint32Array(el.count * 3);
      const uvs = new Float32Array(el.count * 6);
      let sawUv = false;
      for (let f = 0; f < el.count; f++) {
        for (const p of el.props) {
          if (!p.list) { off += PLY_TYPES[p.type]; continue; }
          const n = readScalar(buf, off, p.countType);
          off += PLY_TYPES[p.countType];
          const size = PLY_TYPES[p.valueType];
          if (p.name === "vertex_indices" || p.name === "vertex_index") {
            if (n !== 3) throw new Error(`face ${f} has ${n} corners — triangles only`);
            for (let k = 0; k < 3; k++) indices[f * 3 + k] = readScalar(buf, off + k * size, p.valueType);
          } else if (p.name === "texcoord") {
            if (n !== 6) throw new Error(`face ${f} has ${n} texcoords — expected 6`);
            sawUv = true;
            for (let k = 0; k < 6; k++) uvs[f * 6 + k] = readScalar(buf, off + k * size, p.valueType);
          }
          off += n * size;
        }
      }
      if (!sawUv) throw new Error("face element carries no texcoord — mesh is untextured");
      faces = { count: el.count, indices, uvs };
    } else {
      throw new Error(`unexpected PLY element "${el.name}"`);
    }
  }

  if (!positions || !faces) throw new Error("PLY missing vertex or face element");
  // A clean parse consumes the file exactly; anything left means we misread it.
  if (off !== buf.length) throw new Error(`PLY parse left ${buf.length - off} trailing bytes`);
  return { positions, faces };
}

// ------------------------------------------------------------------- geometry

/** Multiply two row-major 3x3 matrices. */
function mul(a, b) {
  const out = new Array(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    }
  }
  return out;
}

/** Rotation matrix (row-major 3x3) for intrinsic X→Y→Z degrees. */
function rotationMatrix([rx, ry, rz]) {
  const d = Math.PI / 180;
  const [sx, cx] = [Math.sin(rx * d), Math.cos(rx * d)];
  const [sy, cy] = [Math.sin(ry * d), Math.cos(ry * d)];
  const [sz, cz] = [Math.sin(rz * d), Math.cos(rz * d)];
  // Rz * Ry * Rx
  return [
    cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx,
    sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx,
    -sy, cy * sx, cy * cx,
  ];
}

const applyMat = (m, x, y, z) => [
  m[0] * x + m[1] * y + m[2] * z,
  m[3] * x + m[4] * y + m[5] * z,
  m[6] * x + m[7] * y + m[8] * z,
];

/**
 * Keep only the largest connected component.
 *
 * A photogrammetry reconstruction almost always carries stray islands — bits of
 * the turntable, floating noise behind the subject. They are easy to miss when
 * looking at the model, but they inflate the bounding box, and both the
 * normalise step here and model-viewer's own framing work off that box: one
 * stray speck leaves the sculpture rendered small in the middle of an empty
 * frame. (The delivered Oyang Dapitana scan was 6.8 units across a 3-unit
 * figure for exactly this reason.) This is the "remove stray geometry" step the
 * README asks Blender for.
 */
function largestComponent({ positions, faces }) {
  const parent = new Int32Array(positions.length / 3);
  for (let i = 0; i < parent.length; i++) parent[i] = i;
  const find = (i) => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
  for (let f = 0; f < faces.count; f++) {
    const [a, b, c] = [faces.indices[f * 3], faces.indices[f * 3 + 1], faces.indices[f * 3 + 2]];
    union(a, b); union(b, c);
  }

  // Rank components by surface area rather than face count: the real subject is
  // the one that covers the most surface.
  const area = new Map();
  const faceArea = new Float64Array(faces.count);
  for (let f = 0; f < faces.count; f++) {
    const [a, b, c] = [faces.indices[f * 3], faces.indices[f * 3 + 1], faces.indices[f * 3 + 2]];
    const e1 = [positions[b * 3] - positions[a * 3], positions[b * 3 + 1] - positions[a * 3 + 1], positions[b * 3 + 2] - positions[a * 3 + 2]];
    const e2 = [positions[c * 3] - positions[a * 3], positions[c * 3 + 1] - positions[a * 3 + 1], positions[c * 3 + 2] - positions[a * 3 + 2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    faceArea[f] = Math.hypot(...n) / 2;
    const r = find(a);
    area.set(r, (area.get(r) || 0) + faceArea[f]);
  }
  if (area.size === 1) return { faces, dropped: 0, components: 1 };

  let best = -1, bestArea = -1;
  for (const [root, a] of area) if (a > bestArea) { bestArea = a; best = root; }

  const keep = [];
  for (let f = 0; f < faces.count; f++) {
    if (find(faces.indices[f * 3]) === best) keep.push(f);
  }
  const indices = new Uint32Array(keep.length * 3);
  const uvs = new Float32Array(keep.length * 6);
  keep.forEach((f, i) => {
    indices.set(faces.indices.subarray(f * 3, f * 3 + 3), i * 3);
    uvs.set(faces.uvs.subarray(f * 6, f * 6 + 6), i * 6);
  });
  return {
    faces: { count: keep.length, indices, uvs },
    dropped: faces.count - keep.length,
    components: area.size,
  };
}

/**
 * De-index the wedge-UV mesh into a GPU-ready vertex buffer.
 *
 * The PLY stores UVs per face corner, so a vertex sitting on an atlas seam needs
 * to become several GPU vertices. Splitting every corner blindly would turn 36k
 * vertices into 219k, so corners are keyed on (source vertex, u, v) and reused —
 * that welds every corner that agrees, and splits only at real seams.
 *
 * Normals are accumulated per *source* vertex, not per output vertex, and
 * area-weighted by the un-normalised cross product. Accumulating per output
 * vertex would reset the average at every UV seam and draw a visible shading
 * seam across the sculpture.
 */
function buildVertices({ positions, faces }) {
  const srcCount = positions.length / 3;
  const normalAcc = new Float64Array(srcCount * 3);

  for (let f = 0; f < faces.count; f++) {
    const [a, b, c] = [faces.indices[f * 3], faces.indices[f * 3 + 1], faces.indices[f * 3 + 2]];
    const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
    const e1x = positions[b * 3] - ax, e1y = positions[b * 3 + 1] - ay, e1z = positions[b * 3 + 2] - az;
    const e2x = positions[c * 3] - ax, e2y = positions[c * 3 + 1] - ay, e2z = positions[c * 3 + 2] - az;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    for (const v of [a, b, c]) {
      normalAcc[v * 3] += nx;
      normalAcc[v * 3 + 1] += ny;
      normalAcc[v * 3 + 2] += nz;
    }
  }

  const seen = new Map();
  const outPos = [];
  const outNrm = [];
  const outUv = [];
  const outIdx = new Uint32Array(faces.count * 3);

  for (let f = 0; f < faces.count; f++) {
    for (let k = 0; k < 3; k++) {
      const v = faces.indices[f * 3 + k];
      const u = faces.uvs[f * 6 + k * 2];
      const t = faces.uvs[f * 6 + k * 2 + 1];
      const key = `${v}|${u}|${t}`;
      let idx = seen.get(key);
      if (idx === undefined) {
        idx = outPos.length / 3;
        seen.set(key, idx);
        outPos.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]);
        let [nx, ny, nz] = [normalAcc[v * 3], normalAcc[v * 3 + 1], normalAcc[v * 3 + 2]];
        const len = Math.hypot(nx, ny, nz) || 1;
        outNrm.push(nx / len, ny / len, nz / len);
        // PLY/OBJ put the texture origin bottom-left, glTF puts it top-left.
        outUv.push(u, 1 - t);
      }
      outIdx[f * 3 + k] = idx;
    }
  }

  return {
    position: new Float32Array(outPos),
    normal: new Float32Array(outNrm),
    uv: new Float32Array(outUv),
    indices: outIdx,
    count: outPos.length / 3,
  };
}

/**
 * Bake orientation, then centre on the origin and scale the longest axis to 1.
 * The raw coordinates are arbitrary (one of these sits around z = -8), which
 * would leave model-viewer framing empty space.
 */
function orientAndNormalise(geo, rotate, yaw) {
  // Level first, then spin about the (now vertical) Y axis to face the camera.
  const d = (yaw * Math.PI) / 180;
  const spin = [Math.cos(d), 0, Math.sin(d), 0, 1, 0, -Math.sin(d), 0, Math.cos(d)];
  const m = mul(spin, rotationMatrix(rotate));
  const identity = rotate.every((r) => r === 0) && yaw === 0;
  const { position, normal } = geo;

  if (!identity) {
    for (let i = 0; i < position.length; i += 3) {
      const [x, y, z] = applyMat(m, position[i], position[i + 1], position[i + 2]);
      position[i] = x; position[i + 1] = y; position[i + 2] = z;
      const [nx, ny, nz] = applyMat(m, normal[i], normal[i + 1], normal[i + 2]);
      normal[i] = nx; normal[i + 1] = ny; normal[i + 2] = nz;
    }
  }

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < position.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      if (position[i + k] < min[k]) min[k] = position[i + k];
      if (position[i + k] > max[k]) max[k] = position[i + k];
    }
  }
  const centre = min.map((v, k) => (v + max[k]) / 2);
  const extent = max.map((v, k) => v - min[k]);
  const scale = 1 / Math.max(...extent);
  for (let i = 0; i < position.length; i += 3) {
    for (let k = 0; k < 3; k++) position[i + k] = (position[i + k] - centre[k]) * scale;
  }
  return { extent, scale };
}

// ------------------------------------------------------------------ pipeline

async function convert(id, { textureSize, rotate, yaw }) {
  const spec = MODELS[id];
  if (!spec) throw new Error(`unknown model "${id}" — known: ${Object.keys(MODELS).join(", ")}`);
  const zip = path.join(repo, DELIVERY, spec.model, "model.zip");
  if (!existsSync(zip)) throw new Error(`source archive not found: ${zip}`);
  const outPath = path.join(repo, "assets-src/models", `${id}.glb`);
  const turn = rotate ?? spec.rotate;
  const spin = yaw ?? spec.yaw ?? 0;

  console.log(`\n=== ${id}`);
  console.log(`  source  ${spec.model}/model.zip`);

  // The archive holds mesh.ply + texture.tif + doc.xml; read the two we need
  // straight out of it rather than unpacking 60 MB to disk.
  const read = (entry) =>
    execFileSync("unzip", ["-p", zip, entry], { maxBuffer: 512 * 1024 * 1024 });

  const { positions, faces: allFaces } = parsePly(read("mesh.ply"));
  console.log(`  mesh    ${(positions.length / 3).toLocaleString()} verts, ${allFaces.count.toLocaleString()} tris`);

  const { faces, dropped, components } = largestComponent({ positions, faces: allFaces });
  if (dropped) {
    console.log(`  clean   dropped ${dropped.toLocaleString()} stray tris in ${components - 1} island(s)`);
  }

  const geo = buildVertices({ positions, faces });
  const { extent } = orientAndNormalise(geo, turn, spin);
  console.log(`  welded  ${geo.count.toLocaleString()} verts  (rotate ${turn.join(",")}° yaw ${spin}°, extent ${extent.map((v) => v.toFixed(2)).join(" x ")})`);

  // Metashape writes an RGBA atlas whose alpha only marks unused chart space; no
  // UV samples it, and carrying it would cost bytes and make the material
  // needlessly transparent. Flatten to RGB, then downscale. PNG here, because
  // textureCompress does the lossy WebP encode below.
  const tifMeta = await sharp(read("texture.tif"), { limitInputPixels: false }).metadata();
  const texture = await sharp(read("texture.tif"), { limitInputPixels: false })
    .flatten({ background: { r: 0, g: 0, b: 0 } })
    .resize({ width: textureSize, height: textureSize, fit: "fill", kernel: "lanczos3" })
    .png({ compressionLevel: 9 })
    .toBuffer();
  console.log(`  texture ${tifMeta.width}x${tifMeta.height} → ${textureSize}x${textureSize}`);

  const doc = new Document();
  doc.createBuffer();
  const buffer = doc.getRoot().listBuffers()[0];

  const tex = doc
    .createTexture(`${id}-albedo`)
    .setImage(texture)
    .setMimeType("image/png");

  // A photogrammetry scan is a baked diffuse capture: no metal, no gloss map.
  // doubleSided keeps open mesh boundaries (these scans are not watertight)
  // from showing through as holes when the camera passes a rim.
  const material = doc
    .createMaterial(`${id}-material`)
    .setBaseColorTexture(tex)
    .setMetallicFactor(0)
    .setRoughnessFactor(0.85)
    .setDoubleSided(true);

  const prim = doc
    .createPrimitive()
    .setAttribute("POSITION", doc.createAccessor("POSITION").setType("VEC3").setArray(geo.position).setBuffer(buffer))
    .setAttribute("NORMAL", doc.createAccessor("NORMAL").setType("VEC3").setArray(geo.normal).setBuffer(buffer))
    .setAttribute("TEXCOORD_0", doc.createAccessor("TEXCOORD_0").setType("VEC2").setArray(geo.uv).setBuffer(buffer))
    .setIndices(doc.createAccessor("indices").setType("SCALAR").setArray(geo.indices).setBuffer(buffer))
    .setMaterial(material);

  const mesh = doc.createMesh(id).addPrimitive(prim);
  const node = doc.createNode(id).setMesh(mesh);
  doc.createScene(id).addChild(node);
  doc.getRoot().getAsset().extras = {
    title: id,
    source: "Agisoft Metashape photogrammetry, National Museum of the Philippines",
    pipeline: "scripts/models/from-metashape.mjs",
  };

  // The house optimisation, identical to make-placeholder.mjs: WebP textures and
  // meshopt geometry + quantization. Draco or KTX2 would make model-viewer fetch
  // decoders from gstatic.com at runtime, which breaks the no-CDN guarantee.
  await MeshoptEncoder.ready;
  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: "webp", quality: 85 }),
    meshopt({ encoder: MeshoptEncoder }),
  );

  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.encoder": MeshoptEncoder });
  await io.write(outPath, doc);

  const mb = statSync(outPath).size / (1024 * 1024);
  console.log(`  wrote   assets-src/models/${id}.glb (${mb.toFixed(2)} MB${mb > 8 ? " — OVER THE 8 MB BUDGET" : ""})`);
  return mb;
}

// ----------------------------------------------------------------------- main

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const target = args[0];
if (!target || target.startsWith("--")) {
  console.error("usage: node scripts/models/from-metashape.mjs <id|all> [--texture 2048] [--rotate x,y,z] [--yaw deg]");
  process.exit(1);
}
const textureSize = Number(flag("texture", 2048));
const rotateArg = flag("rotate", null);
const rotate = rotateArg ? rotateArg.split(",").map(Number) : null;
const yawArg = flag("yaw", null);
const yaw = yawArg === null ? null : Number(yawArg);
const ids = target === "all" ? Object.keys(MODELS) : [target];
if ((rotate || yaw !== null) && ids.length > 1) {
  console.error("--rotate/--yaw apply to a single model; pass one id");
  process.exit(1);
}

let over = false;
for (const id of ids) {
  const mb = await convert(id, { textureSize, rotate, yaw });
  if (mb > 8) over = true;
}
if (over) {
  console.error("\nAt least one GLB is over the 8 MB budget — the content validator will fail the build.");
  process.exit(1);
}
