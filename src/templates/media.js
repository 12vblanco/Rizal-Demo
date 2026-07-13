// @ts-check
// The single image helper every template renders through. It emits a
// responsive <picture> (AVIF + WebP <source>s over a JPEG/PNG <img> fallback)
// with explicit width/height, a `sizes` hint, and a dominant-colour LQIP class
// — all backed by the build-time pipeline in src/images.js. build.js runs the
// pipeline, then calls setImageManifest() before rendering, so this helper only
// looks variants up; no template signature changed when the pipeline landed
// (spec: "every image through the pipeline helper"). Alt + credit come from data.

import { esc } from "./layout.js";

/**
 * @typedef {import("../types.js").Site} Site
 * @typedef {import("../types.js").Image} Image
 * @typedef {import("../images.js").ImageEntry} ImageEntry
 * @typedef {import("../images.js").Variant} Variant
 * @typedef {import("../images.js").DeepZoomEntry} DeepZoomEntry
 */

/** @type {Map<string, ImageEntry> | null} */
let manifest = null;

/** Called once by build.js after the image pipeline runs. @param {Map<string, ImageEntry>} m */
export function setImageManifest(m) {
  manifest = m;
}

/** @type {Map<string, DeepZoomEntry> | null} */
let dzManifest = null;

/** Called once by build.js after the deep-zoom pipeline runs. @param {Map<string, DeepZoomEntry>} m */
export function setDeepZoomManifest(m) {
  dzManifest = m;
}

/**
 * The client viewer descriptor for one gallery image: the full-resolution URL
 * (shown for non-tiled images) plus, when the source was tiled (`deepZoom`), an
 * OpenSeadragon Deep Zoom tile source built inline — no `.dzi` XML is fetched.
 * Serialised into a JSON <script> the viewer reads (see object.js).
 * @param {Site} site @param {Image} image
 */
export function viewerImage(site, image) {
  const dz = dzManifest?.get(image.src) ?? null;
  const entry = entryFor(image.src);
  return {
    full: site.basePath + entry.fullUrl,
    thumb: site.basePath + entry.webp[0].file, // smallest webp — the strip thumbnail
    alt: image.alt,
    credit: image.credit ?? null,
    dz: dz
      ? {
          url: site.basePath + dz.tilesUrl,
          format: dz.format,
          tileSize: dz.tileSize,
          overlap: dz.overlap,
          width: dz.width,
          height: dz.height,
        }
      : null,
  };
}

/**
 * Public URL of a GLB model (build.js copies each referenced model verbatim into
 * dist/media/models/). @param {Site} site @param {string} src
 */
export function modelUrl(site, src) {
  return site.basePath + "media/models/" + src;
}

/**
 * The viewer descriptor for an object's 3D model: a normal image item built from
 * the poster (so it slots into the gallery/strip like any photo) plus a `model`
 * URL. The viewer renders `<model-viewer>` for any item carrying `model`, and a
 * deep-zoom/plain image for the rest.
 * @param {Site} site @param {import("../types.js").Model3d} model
 */
export function viewerModel(site, model) {
  const item = viewerImage(site, {
    src: model.poster,
    alt: model.altText,
    credit: model.credit,
  });
  return { ...item, model: modelUrl(site, model.src) };
}

/** @param {string} src @returns {ImageEntry} */
function entryFor(src) {
  const entry = manifest?.get(src);
  if (!entry) {
    throw new Error(
      `media: no pipeline output for "${src}" — did the image pipeline run before rendering?`,
    );
  }
  return entry;
}

/**
 * Full-resolution URL for a content image path (largest WebP variant). Used for
 * the object gallery's JS-off "view full image" links.
 * @param {Site} site @param {string} src
 */
export function imageUrl(site, src) {
  return site.basePath + entryFor(src).fullUrl;
}

/** @param {Site} site @param {Variant[]} variants */
function srcset(site, variants) {
  return variants.map((v) => `${site.basePath}${v.file} ${v.w}w`).join(", ");
}

/**
 * @param {object} p
 * @param {Site} p.site
 * @param {Image} p.image
 * @param {string} [p.className]
 * @param {"lazy"|"eager"} [p.loading]
 * @param {"high"|"low"|"auto"} [p.fetchpriority]
 * @param {string} [p.sizes] - the `sizes` hint for this image's layout box
 *   (default "100vw"); pass the real rendered width so the browser picks the
 *   smallest sufficient variant.
 * @param {string} [p.dataVt] - view-transition group name (paired with a
 *   generated stylesheet rule; see object.js)
 */
export function renderImage({
  site,
  image,
  className,
  loading = "lazy",
  fetchpriority,
  sizes = "100vw",
  dataVt,
}) {
  const entry = entryFor(image.src);
  const cls = [className, entry.lqipClass].filter(Boolean).join(" ");
  const imgAttrs = [
    `class="${esc(cls)}"`,
    `src="${esc(site.basePath + entry.imgUrl)}"`,
    `alt="${esc(image.alt)}"`,
    `width="${entry.width}"`,
    `height="${entry.height}"`,
    `loading="${loading}"`,
    `decoding="async"`,
    fetchpriority ? `fetchpriority="${fetchpriority}"` : "",
    dataVt ? `data-vt="${esc(dataVt)}"` : "",
  ].filter(Boolean);
  const sizesAttr = `sizes="${esc(sizes)}"`;
  return `<picture>\
<source type="image/avif" srcset="${esc(srcset(site, entry.avif))}" ${sizesAttr}>\
<source type="image/webp" srcset="${esc(srcset(site, entry.webp))}" ${sizesAttr}>\
<img ${imgAttrs.join(" ")}></picture>`;
}
