// Pad a photo so it sits smaller inside a section hero band.
//
// A section hero renders its image as `object-fit: cover` over a band that is
// much wider than it is tall (≈2.67:1 at desktop; see .section-hero in
// css/components/section.css). Cover scales the image to the *larger* of the
// two fit ratios, so for a landscape photo the width drives the scale and the
// subject ends up filling the frame with its top and bottom cropped away.
//
// There is no CSS way to zoom out from that: cover is already the minimum
// scale that fills the band, and shrinking the <img> box just leaves gaps.
// Resizing the file does nothing either — cover rescales to fit regardless of
// the source's pixel dimensions. What *does* work is giving the subject more
// room inside its own canvas: extending the canvas by 1/factor leaves the
// subject the same number of pixels across a proportionally wider frame, so
// cover renders it that much smaller.
//
// The new canvas is filled by replicating the edge pixels outward
// (`extendWith: "copy"`), which is seamless for the plain studio backgrounds
// these object photos use — a flat fill would band against their vignette.
// Check the result if the subject runs close to an edge.
//
// Usage:
//   node scripts/images/pad-hero.mjs <in.webp> <out.webp> [factor]
//
// `factor` is how large the subject should end up relative to now, so 0.85
// renders it 15% smaller. Defaults to 0.85.
//
// Both paths are relative to the repo root. The output belongs in
// assets-src/images/, and is committed — build.js encodes from there.

import sharp from "sharp";
import path from "node:path";

const [, , input, output, rawFactor = "0.85"] = process.argv;

if (!input || !output) {
  console.error("usage: node scripts/images/pad-hero.mjs <in.webp> <out.webp> [factor]");
  process.exit(1);
}

const factor = Number(rawFactor);
if (!Number.isFinite(factor) || factor <= 0 || factor > 1) {
  console.error(`factor must be a number in (0, 1] — got "${rawFactor}"`);
  process.exit(1);
}

const { width, height } = await sharp(input).metadata();
if (!width || !height) {
  console.error(`could not read dimensions from ${input}`);
  process.exit(1);
}

// Grow both axes by the same amount, so the padding is a pure zoom-out and the
// subject keeps its framing rather than drifting within the band.
const padX = Math.round((width / factor - width) / 2);
const padY = Math.round((height / factor - height) / 2);

await sharp(input)
  .extend({ top: padY, bottom: padY, left: padX, right: padX, extendWith: "copy" })
  .webp({ quality: 90 })
  .toFile(output);

const out = await sharp(output).metadata();
console.log(
  `${path.relative(".", input)} ${width}×${height}` +
    ` → ${path.relative(".", output)} ${out.width}×${out.height}` +
    ` (+${padX}px each side, +${padY}px top/bottom — subject renders at ${Math.round(factor * 100)}%)`,
);
