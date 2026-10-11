// Normalise an object's 3D poster into a home-page *card* poster.
//
// The model posters themselves cannot be re-framed: render-poster.mjs renders
// them through <model-viewer> at the canonical camera so the still and the live
// model line up pixel-for-pixel on the object page (scripts/models/README.md).
// But that same canonical camera frames every object differently — a reclining
// Josephine fills 39% of the frame's height, a standing Sacred Heart 91% — and
// a row of those posters on the landing page reads as four unrelated crops
// rather than one shelf of objects.
//
// So the home strip gets its own derived still: the subject is trimmed out of
// the poster and re-fitted into a fresh 4:3 frame at a common size, so every
// card in the row puts its object on the same stage. The object page keeps the
// untouched, camera-matched poster.
//
// Usage:
//   node scripts/images/card-poster.mjs <in.webp> <out.webp> [--key-bg]
//
// `--key-bg` first keys out a flat studio background, for an object whose card
// still comes from an opaque photograph rather than a transparent 3D render
// (the tangkulu, whose own 3D model is still a placeholder). Check the cut-out
// if the object's own colours come close to its backdrop.
//
// Both paths are relative to the repo root. The output belongs in
// assets-src/images/, and is committed — build.js encodes from there.

import sharp from "sharp";

const FRAME = { width: 1600, height: 1200 }; // 4/3, as .models3d__img expects
// The common stage: the subject is scaled to touch whichever of these bounds
// binds first, so tall objects share a height and wide ones share a width.
const STAGE = { width: 0.78, height: 0.8 };
const ALPHA_EDGE = 8; // alpha above this counts as subject, not stray fringe
const KEY_DISTANCE = 42; // RGB distance from the backdrop that reads as subject

const args = process.argv.slice(2);
const keyBg = args.includes("--key-bg");
const [input, output] = args.filter((a) => !a.startsWith("--"));

if (!input || !output) {
  console.error("usage: node scripts/images/card-poster.mjs <in.webp> <out.webp> [--key-bg]");
  process.exit(1);
}

const { data, info } = await sharp(input)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;

if (keyBg) {
  // The backdrop is the median of the frame's border pixels; everything far
  // enough from it in RGB is the object. A short distance ramp above the
  // threshold feathers the edge so the cut-out does not read as a sticker.
  /** @type {number[][]} */
  const border = [];
  const step = Math.max(1, Math.floor(Math.min(width, height) / 200));
  for (let x = 0; x < width; x += step) {
    for (const y of [0, 1, height - 2, height - 1]) border.push(px(x, y));
  }
  for (let y = 0; y < height; y += step) {
    for (const x of [0, 1, width - 2, width - 1]) border.push(px(x, y));
  }
  const bg = [0, 1, 2].map((c) => median(border.map((p) => p[c])));
  for (let i = 0; i < width * height; i++) {
    const o = i * channels;
    const d = Math.hypot(data[o] - bg[0], data[o + 1] - bg[1], data[o + 2] - bg[2]);
    const ramp = (d - KEY_DISTANCE) / 12;
    data[o + 3] = Math.round(Math.max(0, Math.min(1, ramp)) * 255);
  }
}

/** @param {number} x @param {number} y */
function px(x, y) {
  const o = (y * width + x) * channels;
  return [data[o], data[o + 1], data[o + 2]];
}

/** @param {number[]} xs */
function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

// Trim to the subject's own bounds, ignoring the empty stage around it. The
// bounds are read off a blurred-then-thresholded copy of the alpha, so a speck
// of sensor noise in a keyed photograph cannot quietly inflate the frame; the
// object itself keeps its original, feathered alpha.
const alpha = Buffer.alloc(width * height);
for (let i = 0; i < width * height; i++) alpha[i] = data[i * channels + 3];
const solid = await sharp(alpha, { raw: { width, height, channels: 1 } })
  .blur(3)
  .threshold(140)
  .toColourspace("b-w")
  .raw()
  .toBuffer();

if (keyBg) {
  // Blurring alone does not see off a speck of dust the size of a bead, and a
  // keyed photograph keeps it both in the bounds and in the picture. The
  // object is the one big thing in frame, so keep the largest connected blob
  // and erase the rest. Flood-filled over a coarse grid: 4-5 px of slack round
  // the edge costs nothing here and keeps the fill cheap on a 12 Mpx scan.
  const BLOCK = Math.max(1, Math.round(Math.min(width, height) / 600));
  const bw = Math.ceil(width / BLOCK);
  const bh = Math.ceil(height / BLOCK);
  const block = new Uint8Array(bw * bh);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (solid[y * width + x] > ALPHA_EDGE) {
        block[((y / BLOCK) | 0) * bw + ((x / BLOCK) | 0)] = 1;
      }
    }
  }
  const label = new Int32Array(bw * bh);
  const stack = new Int32Array(bw * bh);
  let blobs = 0;
  let biggest = 0;
  let biggestSize = 0;
  for (let seed = 0; seed < block.length; seed++) {
    if (!block[seed] || label[seed]) continue;
    const blob = ++blobs;
    let top = 0;
    let size = 0;
    label[seed] = blob;
    stack[top++] = seed;
    while (top) {
      const p = stack[--top];
      size++;
      const px = p % bw;
      const py = (p / bw) | 0;
      if (px > 0 && block[p - 1] && !label[p - 1]) (label[p - 1] = blob), (stack[top++] = p - 1);
      if (px < bw - 1 && block[p + 1] && !label[p + 1]) (label[p + 1] = blob), (stack[top++] = p + 1);
      if (py > 0 && block[p - bw] && !label[p - bw]) (label[p - bw] = blob), (stack[top++] = p - bw);
      if (py < bh - 1 && block[p + bw] && !label[p + bw]) (label[p + bw] = blob), (stack[top++] = p + bw);
    }
    if (size > biggestSize) (biggestSize = size), (biggest = blob);
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inBlob = label[((y / BLOCK) | 0) * bw + ((x / BLOCK) | 0)] === biggest;
      if (!inBlob) {
        solid[y * width + x] = 0;
        data[(y * width + x) * channels + 3] = 0;
      }
    }
  }
  if (blobs > 1) console.log(`  keyed out ${blobs - 1} stray mark(s) around the object`);
}

let [left, top, right, bottom] = [width, height, -1, -1];
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    if (solid[y * width + x] <= ALPHA_EDGE) continue;
    if (x < left) left = x;
    if (x > right) right = x;
    if (y < top) top = y;
    if (y > bottom) bottom = y;
  }
}
if (right < left || bottom < top) {
  console.error(`${input} is fully transparent — nothing to frame`);
  process.exit(1);
}

const subject = { width: right - left + 1, height: bottom - top + 1 };
const scale = Math.min(
  (FRAME.width * STAGE.width) / subject.width,
  (FRAME.height * STAGE.height) / subject.height,
);
const placed = {
  width: Math.max(1, Math.round(subject.width * scale)),
  height: Math.max(1, Math.round(subject.height * scale)),
};

const trimmed = await sharp(data, { raw: { width, height, channels } })
  .extract({ left, top, width: subject.width, height: subject.height })
  .resize(placed.width, placed.height, { fit: "fill", kernel: "lanczos3" })
  .png()
  .toBuffer();

await sharp({
  create: {
    width: FRAME.width,
    height: FRAME.height,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([{ input: trimmed, gravity: "centre" }])
  .webp({ quality: 92, alphaQuality: 100 })
  .toFile(output);

const pct = (n, d) => `${Math.round((n / d) * 100)}%`;
console.log(
  `${output} — subject ${placed.width}×${placed.height} ` +
    `(${pct(placed.width, FRAME.width)} × ${pct(placed.height, FRAME.height)} of frame)`,
);
