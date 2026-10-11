// Key a studio backdrop out of an object photograph, leaving the object on
// transparency in the frame it was shot in.
//
// card-poster.mjs also keys a backdrop, but it keys a *flat* one and then
// re-frames the subject for the home strip. A studio scan is lit with a
// vignette — the quill's backdrop runs from ~175 at the corners to ~230 in the
// middle — so one RGB distance from one median backdrop colour cannot separate
// the two: the threshold that keeps the dark corners also eats the object's
// own shadowed metal. So the backdrop is found by *growing* it inward from the
// frame edge instead: a pixel joins the backdrop when it is close to the
// backdrop pixel beside it, which follows a gradient however far it drifts but
// still stops dead at the object's edge.
//
// Usage:
//   node scripts/images/key-bg.mjs <in> <out.webp> [--width <px>] [--preview <bg.png>]
//
// Feed it the camera original, not a web export: keying a file that has already
// been through a lossy round trip cuts the matte out of compression artefacts
// and then compresses the result a second time. `--width` downscales *after*
// the key, so the alpha edge is resampled from the full-resolution matte rather
// than quantised at the output size (3600 is what the rest of the collection's
// deep-zoom sources run at).
//
// Both paths are relative to the repo root. The output belongs in
// assets-src/images/ and is committed — build.js encodes from there (and emits
// a PNG rather than a JPEG fallback once the source has alpha). `--preview`
// also writes the cut-out over the gallery's letterbox colour, which is the
// only honest way to see whether the matte holds.
//
// Check the result: an object whose own tone comes close to its backdrop (a
// pale textile, a white page) is not a candidate for this.

import sharp from "sharp";

// A pixel joins the backdrop when it is within STEP of the backdrop pixel it
// grew from — enough to walk the vignette, far short of the step onto metal.
const STEP = 12;
// ...and never below FLOOR, so no chain of dimming pixels can tunnel through a
// soft shadow into the object itself.
const FLOOR = 150;
// The backdrop is neutral; the quill's gold band is not. Saturated pixels are
// the object whatever their luminance.
const MAX_CHROMA = 24;
// Edge feather: the matte is blurred, then this window is stretched back to
// 0–255. Opening above 0 erodes the subject by about a pixel, which is where
// the backdrop's light bleeds into the object's outline.
const EDGE = { open: 70, close: 205, sigma: 1.1 };

const args = process.argv.slice(2);
const previewAt = args.indexOf("--preview");
const preview = previewAt === -1 ? null : args[previewAt + 1];
const widthAt = args.indexOf("--width");
const outWidth = widthAt === -1 ? null : Number(args[widthAt + 1]);
// Drop each flag and the values that follow it (--preview takes a path and an
// optional colour, --width a number), leaving the two positional paths.
const consumed = new Set();
if (previewAt !== -1) for (const i of [previewAt, previewAt + 1, previewAt + 2]) consumed.add(i);
if (widthAt !== -1) for (const i of [widthAt, widthAt + 1]) consumed.add(i);
const [input, output] = args.filter((a, i) => !a.startsWith("--") && !consumed.has(i));

if (!input || !output) {
  console.error(
    "usage: node scripts/images/key-bg.mjs <in> <out.webp> [--width <px>] [--preview <bg.png>]",
  );
  process.exit(1);
}
if (widthAt !== -1 && !(outWidth > 0)) {
  console.error("--width wants a pixel count");
  process.exit(1);
}

const { data, info } = await sharp(input)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;
const n = width * height;

const lum = new Uint8Array(n);
const neutral = new Uint8Array(n);
for (let i = 0; i < n; i++) {
  const o = i * channels;
  const [r, g, b] = [data[o], data[o + 1], data[o + 2]];
  lum[i] = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
  neutral[i] = Math.max(r, g, b) - Math.min(r, g, b) <= MAX_CHROMA ? 1 : 0;
}

// Grow the backdrop inward from every frame edge.
const bg = new Uint8Array(n);
const queue = new Int32Array(n);
let head = 0;
let tail = 0;
/** @param {number} i */
const seed = (i) => {
  if (!bg[i] && neutral[i] && lum[i] >= FLOOR) (bg[i] = 1), (queue[tail++] = i);
};
for (let x = 0; x < width; x++) (seed(x), seed((height - 1) * width + x));
for (let y = 0; y < height; y++) (seed(y * width), seed(y * width + width - 1));

while (head < tail) {
  const p = queue[head++];
  const x = p % width;
  const y = (p / width) | 0;
  /** @param {number} q */
  const grow = (q) => {
    if (bg[q] || !neutral[q] || lum[q] < FLOOR) return;
    if (Math.abs(lum[q] - lum[p]) > STEP) return;
    bg[q] = 1;
    queue[tail++] = q;
  };
  if (x > 0) grow(p - 1);
  if (x < width - 1) grow(p + 1);
  if (y > 0) grow(p - width);
  if (y < height - 1) grow(p + width);
}

let kept = n - tail;
if (!kept) {
  console.error(`${input}: the whole frame grew as backdrop — nothing left to keep`);
  process.exit(1);
}

// The grow starts at the frame edge, so backdrop *enclosed* by the object —
// seen through the quill's ribbon loop, and through the gaps where feathers
// are missing — is never reached and survives as a white blot inside the
// cut-out. Those blots cannot be found as islands of their own: a hole touches
// the object all the way round, so it is part of the same connected region.
// Find them by colour instead: a run of backdrop-coloured pixels big enough
// not to be a specular glint on the metal is a hole, wherever it sits.
const MIN_HOLE = 150; // px; below this it is a highlight on the object
const seen = new Uint8Array(n);
const hole = new Int32Array(n);
let holes = 0;
/** @param {number} i */
const backdropLike = (i) => !bg[i] && neutral[i] && lum[i] >= FLOOR;
for (let start = 0; start < n; start++) {
  if (seen[start] || !backdropLike(start)) continue;
  let top = 0;
  let size = 0;
  seen[start] = 1;
  hole[size++] = start;
  while (top < size) {
    const p = hole[top++];
    const x = p % width;
    const y = (p / width) | 0;
    /** @param {number} q */
    const visit = (q) => {
      if (seen[q] || !backdropLike(q)) return;
      seen[q] = 1;
      hole[size++] = q;
    };
    if (x > 0) visit(p - 1);
    if (x < width - 1) visit(p + 1);
    if (y > 0) visit(p - width);
    if (y < height - 1) visit(p + width);
  }
  if (size >= MIN_HOLE) {
    for (let k = 0; k < size; k++) (bg[hole[k]] = 1), kept--;
    holes++;
  }
}
if (holes) console.log(`  punched ${holes} enclosed patch(es) of backdrop`);

// Feather the hard matte: blur, then stretch a window back to 0–255 so the
// subject loses the pixel of backdrop bleed around its outline and gains a
// soft edge instead of a staircase.
const matte = Buffer.alloc(n);
for (let i = 0; i < n; i++) matte[i] = bg[i] ? 0 : 255;
const soft = await sharp(matte, { raw: { width, height, channels: 1 } })
  .blur(EDGE.sigma)
  // Without this sharp hands back three interleaved channels for a grey image.
  .toColourspace("b-w")
  .raw()
  .toBuffer();

const span = EDGE.close - EDGE.open;
for (let i = 0; i < n; i++) {
  const a = Math.round(((soft[i] - EDGE.open) / span) * 255);
  data[i * channels + 3] = Math.max(0, Math.min(255, a));
}

// quality 92 with lossless alpha: this file is a master that build.js encodes
// again (to AVIF q50 / WebP q74), so it has to stay clear of a second helping
// of the same artefacts, and a soft matte is ruined by a lossy one.
let out = sharp(data, { raw: { width, height, channels } });
if (outWidth && outWidth < width) {
  out = out.resize(outWidth, null, { kernel: "lanczos3" });
}
const written = await out.webp({ quality: 92, alphaQuality: 100 }).toFile(output);

console.log(
  `${output} — ${written.width}×${written.height}` +
    (outWidth && outWidth < width ? ` (keyed at ${width}×${height})` : "") +
    `, object keeps ${((kept / n) * 100).toFixed(1)}% of the frame`,
);

if (preview) {
  // --exhibit-frame-dark, the colour .object-gallery__img letterboxes against.
  const flat = (args[previewAt + 2] ?? "#585848").replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(flat.slice(i, i + 2), 16));
  await sharp(output).flatten({ background: { r, g, b } }).png().toFile(preview);
  console.log(`${preview} — cut-out over #${flat}`);
}
