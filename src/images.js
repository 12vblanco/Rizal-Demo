// @ts-check
// Build-time responsive-image pipeline (feature 08). Every source under
// assets-src/images/ is turned into AVIF + WebP + a universal fallback
// (JPEG, or PNG when the source has alpha) at a ladder of widths, with
// content-hashed filenames written to dist/media/images/. The originals are
// NEVER copied to dist. A dominant-colour LQIP value is computed per image and
// delivered as a CSS background (see lqipCss) so boxes have colour before the
// bytes arrive — layout shift is already killed by explicit width/height.
//
// Encoding is incremental: encoded bytes are cached under .cache/images/ keyed
// by a content hash of the source, so an unchanged source is copied from cache
// instead of re-encoded. The returned manifest is consumed by
// src/templates/media.js (via setImageManifest) to emit <picture> markup.

import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import sharp from "sharp";

// Responsive width ladder. A source contributes every ladder width narrower
// than it, plus its own width capped at MAX_WIDTH — so we never upscale and
// never emit a needlessly huge variant (deep zoom is feature 09's job).
const LADDER = [400, 800, 1200, 1600];
const MAX_WIDTH = 2000;
// The <img> fallback (for the rare client with no <picture>/AVIF/WebP) targets
// a mid-size variant to balance quality against bytes.
const FALLBACK_TARGET = 1200;

const OUT_DIR = "media/images"; // relative to dist/
const DZ_DIR = "media/dz"; // deep-zoom tile pyramids, relative to dist/

// Deep Zoom (DZI) tiling parameters — the viewer (feature 09) consumes these
// through an inline OpenSeadragon tile descriptor, so no .dzi XML is fetched.
const DZ_TILE_SIZE = 254;
const DZ_OVERLAP = 1;

/** @typedef {{ w: number, h: number, file: string }} Variant */
/**
 * @typedef {object} ImageEntry
 * @property {string} src               source path, e.g. "salakot/front.webp"
 * @property {number} width             intrinsic width of the <img> variant
 * @property {number} height            intrinsic height of the <img> variant
 * @property {string} dominant          "#rrggbb"
 * @property {string} lqipClass         CSS class carrying the background colour
 * @property {string} fallbackType      "image/jpeg" | "image/png"
 * @property {Variant[]} avif
 * @property {Variant[]} webp
 * @property {Variant[]} fallback
 * @property {string} imgUrl            fallback URL for the <img src>
 * @property {string} fullUrl           largest webp URL (JS-off "view full image")
 */

/** @param {Buffer} buf */
function contentHash(buf) {
  return createHash("md5").update(buf).digest("hex").slice(0, 8);
}

/** All image sources under assets-src/images/, as paths relative to that dir. */
function listSources(imagesDir) {
  /** @param {string} dir @returns {string[]} */
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      return e.isDirectory() ? walk(full) : [full];
    });
  return walk(imagesDir)
    .filter((f) => /\.(avif|jpe?g|png|webp)$/i.test(f))
    .map((f) => path.relative(imagesDir, f).split(path.sep).join("/"))
    .sort();
}

/** Width set for a source, ascending, no upscaling. */
function widthsFor(srcWidth) {
  const ws = LADDER.filter((w) => w < srcWidth);
  ws.push(Math.min(srcWidth, MAX_WIDTH));
  return [...new Set(ws)].sort((a, b) => a - b);
}

/** kebab slug from a relative source path: "about/messages/x.webp" → "about-messages-x". */
function slugFor(src) {
  return src.replace(/\.[^.]+$/, "").split("/").join("-");
}

/**
 * Encode every variant of one source into cacheFilesDir, returning the entry
 * (minus the cache-key hash, which the caller stores).
 * @param {string} srcPath absolute path to the source
 * @param {string} src relative source path
 * @param {string} hash content hash of the source
 * @param {string} cacheFilesDir
 * @returns {Promise<ImageEntry>}
 */
async function encode(srcPath, src, hash, cacheFilesDir) {
  const image = sharp(srcPath, { failOn: "none" });
  const meta = await image.metadata();
  const srcWidth = meta.width ?? MAX_WIDTH;
  const fallbackFmt = meta.hasAlpha ? "png" : "jpeg";
  const fallbackExt = meta.hasAlpha ? "png" : "jpg";
  const slug = slugFor(src);
  const widths = widthsFor(srcWidth);

  const stats = await image.stats();
  const { r, g, b } = stats.dominant;
  const hex = [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
  const dominant = `#${hex}`;
  const lqipClass = `lqip-${hex}`;

  /** @param {"avif"|"webp"|"png"|"jpeg"} fmt @param {number} w */
  const emit = async (fmt, w) => {
    const ext = fmt === "jpeg" ? "jpg" : fmt;
    const file = `${slug}-${w}-${hash}.${ext}`;
    const outAbs = path.join(cacheFilesDir, file);
    // A fresh clone per variant — sharp instances are single-use once consumed.
    let pipe = sharp(srcPath, { failOn: "none" }).resize(w, null, {
      withoutEnlargement: true,
    });
    if (fmt === "avif") pipe = pipe.avif({ quality: 50, effort: 4 });
    else if (fmt === "webp") pipe = pipe.webp({ quality: 74 });
    else if (fmt === "jpeg") pipe = pipe.jpeg({ quality: 80, mozjpeg: true });
    else pipe = pipe.png({ compressionLevel: 9 });
    const info = await pipe.toFile(outAbs);
    return { w: info.width, h: info.height, file: `${OUT_DIR}/${file}` };
  };

  /** @type {Variant[]} */ const avif = [];
  /** @type {Variant[]} */ const webp = [];
  /** @type {Variant[]} */ const fallback = [];
  for (const w of widths) {
    avif.push(await emit("avif", w));
    webp.push(await emit("webp", w));
    fallback.push(await emit(fallbackFmt, w));
  }

  // The <img> points at the fallback variant nearest FALLBACK_TARGET (largest
  // not exceeding it, else the smallest). width/height come from it.
  const imgVar =
    [...fallback].reverse().find((v) => v.w <= FALLBACK_TARGET) ?? fallback[0];
  const fullVar = webp[webp.length - 1];

  return {
    src,
    width: imgVar.w,
    height: imgVar.h,
    dominant,
    lqipClass,
    fallbackType: `image/${fallbackFmt}`,
    avif,
    webp,
    fallback,
    imgUrl: imgVar.file,
    fullUrl: fullVar.file,
  };
}

/**
 * Run the pipeline. Returns a manifest (src → entry). Incremental: unchanged
 * sources are served from the on-disk cache instead of re-encoded.
 * @param {object} p
 * @param {string} p.assetsDir  absolute path to assets-src/
 * @param {string} p.dist       absolute path to dist/
 * @param {string} p.cacheDir   absolute path to the persistent cache dir
 * @param {(msg: string) => void} [p.log]
 * @returns {Promise<Map<string, ImageEntry>>}
 */
export async function processImages({ assetsDir, dist, cacheDir, log = () => {} }) {
  const imagesDir = path.join(assetsDir, "images");
  const cacheFilesDir = path.join(cacheDir, "files");
  const manifestPath = path.join(cacheDir, "manifest.json");
  mkdirSync(cacheFilesDir, { recursive: true });

  /** @type {Record<string, ImageEntry & { hash: string }>} */
  let cache = {};
  if (existsSync(manifestPath)) {
    try {
      cache = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch {
      cache = {};
    }
  }

  const sources = listSources(imagesDir);
  /** @type {Map<string, ImageEntry>} */
  const manifest = new Map();
  /** @type {Record<string, ImageEntry & { hash: string }>} */
  const nextCache = {};
  let encoded = 0;
  let reused = 0;

  for (const src of sources) {
    const srcPath = path.join(imagesDir, src);
    const hash = contentHash(readFileSync(srcPath));
    const cached = cache[src];
    const filesPresent =
      cached &&
      cached.hash === hash &&
      [...cached.avif, ...cached.webp, ...cached.fallback].every((v) =>
        existsSync(path.join(cacheFilesDir, path.basename(v.file))),
      );

    /** @type {ImageEntry} */
    let entry;
    if (filesPresent) {
      const { hash: _h, ...rest } = cached;
      entry = rest;
      reused++;
    } else {
      entry = await encode(srcPath, src, hash, cacheFilesDir);
      encoded++;
    }
    manifest.set(src, entry);
    nextCache[src] = { ...entry, hash };
  }

  // Copy every current variant from cache into dist (dist is wiped each build,
  // so files are always re-copied even when encoding was skipped).
  const distOut = path.join(dist, OUT_DIR);
  mkdirSync(distOut, { recursive: true });
  const referenced = new Set();
  for (const entry of manifest.values()) {
    for (const v of [...entry.avif, ...entry.webp, ...entry.fallback]) {
      const name = path.basename(v.file);
      referenced.add(name);
      cpSync(path.join(cacheFilesDir, name), path.join(distOut, name));
    }
  }

  // Prune cache files no longer referenced by any source, so the cache can't
  // grow without bound as images change.
  for (const f of readdirSync(cacheFilesDir)) {
    if (!referenced.has(f)) rmSync(path.join(cacheFilesDir, f));
  }

  writeFileSync(manifestPath, JSON.stringify(nextCache, null, 2));
  log(`Images: ${encoded} encoded, ${reused} cached → ${referenced.size} files`);
  return manifest;
}

/**
 * CSS for the dominant-colour LQIP backgrounds, one rule per unique colour.
 * Appended to the site bundle (html-validate forbids inline style=).
 * @param {Map<string, ImageEntry>} manifest
 */
export function lqipCss(manifest) {
  /** @type {Map<string, string>} */
  const byClass = new Map();
  for (const e of manifest.values()) byClass.set(e.lqipClass, e.dominant);
  return [...byClass]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cls, color]) => `.${cls}{background-color:${color}}`)
    .join("\n");
}

/**
 * Fail the build if any rendered <img>/<source> in dist references an image
 * that is not an emitted pipeline variant (a raw original scan, or a missing
 * file). Enforces spec rule 4 / feature 08 over the real output.
 * @param {string} dist
 */
export function lintDistImages(dist) {
  /** @param {string} dir @returns {string[]} */
  const html = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return html(full);
      return e.name.endsWith(".html") ? [full] : [];
    });

  /** @type {string[]} */
  const problems = [];
  const distMedia = OUT_DIR + "/";
  for (const file of html(dist)) {
    const src = readFileSync(file, "utf8");
    const rel = path.relative(dist, file);
    // Every src=/srcset= URL under media/images/ must resolve to a real file.
    const urls = new Set();
    for (const m of src.matchAll(/(?:src|srcset)="([^"]*)"/g)) {
      for (const part of m[1].split(",")) {
        const url = part.trim().split(/\s+/)[0];
        if (url) urls.add(url);
      }
    }
    for (const url of urls) {
      const idx = url.indexOf(distMedia);
      if (idx === -1) continue; // static logos etc. are not pipeline images
      const relPath = url.slice(idx);
      if (!existsSync(path.join(dist, relPath))) {
        problems.push(`${rel}: unpiped/missing image reference "${url}"`);
      }
    }
    // No output may point back at the source tree.
    if (/(?:src|srcset)="[^"]*assets-src\//.test(src)) {
      problems.push(`${rel}: references assets-src/ directly`);
    }
  }
  if (problems.length) {
    throw new Error(
      `Image lint failed (${problems.length}):\n  ${problems.join("\n  ")}`,
    );
  }
}

/**
 * A build-time Deep Zoom pyramid for one source image. The viewer builds an
 * inline OpenSeadragon tile descriptor from this — no `.dzi` XML is fetched.
 * @typedef {object} DeepZoomEntry
 * @property {string} src        source path, e.g. "salakot/front.webp"
 * @property {string} tilesUrl   "media/dz/<slug>-<hash>_files/" (basePath-relative)
 * @property {string} format     tile extension, "jpeg"
 * @property {number} tileSize
 * @property {number} overlap
 * @property {number} width      full source width
 * @property {number} height     full source height
 */

/**
 * Generate a Deep Zoom tile pyramid (Sharp `.tile()`) for each `deepZoom` source.
 * Same incremental discipline as processImages: tiles are cached under
 * cacheDir keyed by the source content hash and copied into dist each build, so
 * an unchanged source is never re-tiled. Only the `_files/` tree is shipped (the
 * viewer uses an inline descriptor, so the `.dzi` XML is not needed).
 * @param {object} p
 * @param {string} p.assetsDir  absolute path to assets-src/
 * @param {string} p.dist       absolute path to dist/
 * @param {string} p.cacheDir   absolute path to the persistent deep-zoom cache dir
 * @param {string[]} p.sources  relative source paths flagged deepZoom
 * @param {(msg: string) => void} [p.log]
 * @returns {Promise<Map<string, DeepZoomEntry>>}
 */
export async function processDeepZoom({ assetsDir, dist, cacheDir, sources, log = () => {} }) {
  const imagesDir = path.join(assetsDir, "images");
  const cacheTilesDir = path.join(cacheDir, "tiles");
  const manifestPath = path.join(cacheDir, "manifest.json");
  mkdirSync(cacheTilesDir, { recursive: true });

  /** @type {Record<string, DeepZoomEntry & { hash: string, dir: string }>} */
  let cache = {};
  if (existsSync(manifestPath)) {
    try {
      cache = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch {
      cache = {};
    }
  }

  /** @type {Map<string, DeepZoomEntry>} */
  const manifest = new Map();
  /** @type {Record<string, DeepZoomEntry & { hash: string, dir: string }>} */
  const nextCache = {};
  const referencedDirs = new Set();
  let tiled = 0;
  let reused = 0;

  for (const src of [...sources].sort()) {
    const srcPath = path.join(imagesDir, src);
    const hash = contentHash(readFileSync(srcPath));
    const dir = `${slugFor(src)}-${hash}`; // "salakot-front-<hash>"
    const cacheEntryDir = path.join(cacheTilesDir, dir);
    const filesDir = path.join(cacheEntryDir, "tiles_files");
    referencedDirs.add(dir);

    const cached = cache[src];
    /** @type {DeepZoomEntry} */
    let entry;
    if (cached && cached.hash === hash && cached.dir === dir && existsSync(filesDir)) {
      const { hash: _h, dir: _d, ...rest } = cached;
      entry = rest;
      reused++;
    } else {
      // (Re)tile into the cache. Write to a temp base then keep only tiles_files/.
      rmSync(cacheEntryDir, { recursive: true, force: true });
      mkdirSync(cacheEntryDir, { recursive: true });
      const meta = await sharp(srcPath).metadata();
      await sharp(srcPath, { failOn: "none" })
        .jpeg({ quality: 80, mozjpeg: true })
        .tile({ size: DZ_TILE_SIZE, overlap: DZ_OVERLAP, layout: "dz" })
        .toFile(path.join(cacheEntryDir, "tiles.dz"));
      // Sharp emits tiles.dzi (descriptor, unused) + tiles_files/ (the pyramid).
      entry = {
        src,
        tilesUrl: `${DZ_DIR}/${dir}_files/`,
        format: "jpeg",
        tileSize: DZ_TILE_SIZE,
        overlap: DZ_OVERLAP,
        width: meta.width ?? 0,
        height: meta.height ?? 0,
      };
      tiled++;
    }
    manifest.set(src, entry);
    nextCache[src] = { ...entry, hash, dir };
  }

  // Copy each pyramid's tiles into dist (dist is wiped every build).
  const distOut = path.join(dist, DZ_DIR);
  rmSync(distOut, { recursive: true, force: true });
  if (manifest.size) mkdirSync(distOut, { recursive: true });
  for (const [, entry] of manifest) {
    const dir = entry.tilesUrl.slice(DZ_DIR.length + 1).replace(/\/$/, ""); // "<slug>-<hash>_files"
    const base = dir.replace(/_files$/, "");
    cpSync(path.join(cacheTilesDir, base, "tiles_files"), path.join(distOut, dir), {
      recursive: true,
    });
  }

  // Prune cache dirs no longer referenced by any deepZoom source.
  for (const d of readdirSync(cacheTilesDir)) {
    if (!referencedDirs.has(d)) rmSync(path.join(cacheTilesDir, d), { recursive: true, force: true });
  }

  writeFileSync(manifestPath, JSON.stringify(nextCache, null, 2));
  log(`Deep zoom: ${tiled} tiled, ${reused} cached → ${manifest.size} pyramid(s)`);
  return manifest;
}

export { OUT_DIR, DZ_DIR };
