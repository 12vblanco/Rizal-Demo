// @ts-check
// Object detail page — the core template of the site. One generated page per
// object at /<section>/<object-id>/ (e.g. /ethnographer/salakot/). Objects and
// people are always real pages with their own URL, never modals (spec).
//
// Layout: gallery (left) + metadata (right) on desktop, stacked on mobile.
// The only pop-up is the zoom viewer, which feature 09 wires onto the gallery
// thumbnails; until then a thumbnail is a plain link to the full image so the
// page works with JS disabled.

import {
  objectCard,
  personCard,
  renderBreadcrumb,
  renderMarkdown,
  renderPager,
  renderVtStyle,
  vtName,
} from "./fragments.js";
import { esc } from "./layout.js";
import { imageUrl, modelUrl, renderImage, viewerImage, viewerModel } from "./media.js";
import { icons } from "../icons.js";
import { pick, t } from "../i18n.js";

/**
 * @typedef {import("../types.js").Site} Site
 * @typedef {import("../types.js").Section} Section
 * @typedef {import("../types.js").ContentObject} ContentObject
 * @typedef {import("../types.js").Person} Person
 */

// --- SEO slots (full package in feature 12) --------------------------------

/** @param {ContentObject} object @param {Site} site */
export function objectTitle(object, site) {
  const siteTitle = pick(site.siteTitle);
  const rich = `${object.title.tl} · ${object.title.en} | ${siteTitle}`;
  const base = `${object.title.tl} | ${siteTitle}`;
  return rich.length <= 70 ? rich : base;
}

/** @param {ContentObject} object */
export function objectDescription(object) {
  const plain = pick(object.description).replace(/\s+/g, " ").trim();
  if (plain.length <= 155) return plain;
  return plain.slice(0, 152).replace(/\s+\S*$/, "") + "…";
}

// --- page fragments --------------------------------------------------------

/**
 * Serialise data as a JSON <script>, escaping `<` so it can't break out of the
 * element (still valid JSON). The zoom viewer (js/viewer.js) reads it on intent.
 * @param {string} className @param {unknown} data
 */
function jsonScript(className, data) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return `<script type="application/json" class="${className}">${json}</script>`;
}

/** @param {Site} site @param {ContentObject} object */
function renderGallery(site, object) {
  // The gallery's media = an optional 3D model (always first) followed by the
  // photos. One stacked slide per medium; only the first (slide 0) is shown.
  // Clicking a thumbnail swaps which slide is active (js/main.js); the zoom
  // button opens the <dialog> viewer at whichever medium is showing. Slide 0 is
  // the eager LCP element and carries the grid→hero view-transition name — the
  // 3D poster when a model exists, else the first photo.
  const model = object.model3d;
  const hasModel = Boolean(model);

  /** @type {string[]} */
  const slides = [];
  /** @type {string[]} */
  const thumbItems = [];

  if (model) {
    // Slide 0: the 3D view. The poster shows until the visitor launches it, at
    // which point js/main.js lazy-loads <model-viewer> + the GLB over it. Without
    // JS the poster stands in and the photo thumbnails still reach every image.
    const posterImage = { src: model.poster, alt: model.altText };
    const posterPic = renderImage({
      site,
      image: posterImage,
      className: "object-gallery__img",
      loading: "eager",
      fetchpriority: "high",
      sizes: "(min-width: 60rem) 46rem, 100vw",
      dataVt: vtName("obj", object.id),
    });
    const modelCredit = model.credit ? ` data-credit="${esc(model.credit)}"` : "";
    // Slide 0 is a render (poster) of the 3D model. Clicking "View in 3D" loads
    // the interactive <model-viewer> in place — the visitor orbits/zooms it right
    // here in the gallery (js/main.js loads the library + GLB on that intent, so
    // neither is in the base bundle). The magnifying-glass zoom button then takes
    // that same model fullscreen in the dialog viewer. Without JS the poster
    // render stands in and the photo thumbnails still reach every full image.
    slides.push(`<div class="object-gallery__slide object-gallery__slide--model" data-slide="0"${modelCredit}>
        <div class="object-gallery__model" data-model="${esc(modelUrl(site, model.src))}" data-model-poster="${esc(imageUrl(site, model.poster))}" data-model-alt="${esc(model.altText)}">
          ${posterPic}
          <button class="object-gallery__model-launch" type="button">
            <span class="object-gallery__badge" aria-hidden="true">${icons.cube}3D</span>
            <span class="object-gallery__model-cta">${esc(t("viewIn3d"))}</span>
          </button>
          <div class="object-gallery__model-loader" data-model-progress hidden role="status" aria-live="polite">
            <span class="object-gallery__model-loader-label">${esc(t("loading3d"))} <span data-model-percent>0%</span></span>
            <span class="object-gallery__model-loader-track"><span class="object-gallery__model-loader-bar" data-model-bar></span></span>
          </div>
          <div class="object-gallery__model-prompt" data-model-prompt hidden aria-hidden="true">
            <span class="object-gallery__model-prompt-item" data-prompt="rotate">${icons.drag}<span>${esc(t("dragToRotate"))}</span></span>
            <span class="object-gallery__model-prompt-item" data-prompt="zoom">${icons.scroll}<span>${esc(t("scrollToZoom"))}</span></span>
          </div>
        </div>
      </div>`);
    const posterThumb = renderImage({
      site,
      image: posterImage,
      className: "object-gallery__thumb-img",
      sizes: "5rem",
    });
    // No-JS fallback links to the model's poster render (viewable), not the raw
    // GLB; with JS the click selects slide 0 and the viewer shows the live model.
    thumbItems.push(
      `<li><a class="object-gallery__thumb object-gallery__thumb--model" href="${esc(imageUrl(site, model.poster))}" aria-current="true" data-slide="0"><span class="object-gallery__thumb-badge" aria-hidden="true">3D</span>${posterThumb}<span class="visually-hidden">${esc(t("model3dLabel"))}</span></a></li>`,
    );
  }

  const offset = hasModel ? 1 : 0;
  object.images.forEach((img, i) => {
    const idx = offset + i;
    const isHero = idx === 0; // only when there is no model
    const pic = renderImage({
      site,
      image: img,
      className: "object-gallery__img",
      loading: isHero ? "eager" : "lazy",
      fetchpriority: isHero ? "high" : undefined,
      sizes: "(min-width: 60rem) 46rem, 100vw",
      dataVt: isHero ? vtName("obj", object.id) : undefined,
    });
    const hidden = idx === 0 ? "" : " hidden";
    const credit = img.credit ? ` data-credit="${esc(img.credit)}"` : "";
    slides.push(`<div class="object-gallery__slide" data-slide="${idx}"${hidden}${credit}>${pic}</div>`);
    const current = idx === 0 ? ' aria-current="true"' : "";
    const thumb = renderImage({
      site,
      image: img,
      className: "object-gallery__thumb-img",
      sizes: "5rem",
    });
    // Stays an <a href> so a no-JS user still reaches each full image; with JS
    // the click swaps the main slide instead (data-slide).
    thumbItems.push(
      `<li><a class="object-gallery__thumb" href="${esc(imageUrl(site, img.src))}"${current} data-slide="${idx}">${thumb}</a></li>`,
    );
  });

  // Credit follows the active medium. Rendered when any medium has one; hidden
  // when the shown medium has none (js/main.js keeps it in sync on swap).
  const firstCredit = hasModel ? model.credit ?? null : object.images[0].credit ?? null;
  const anyCredit = (hasModel && Boolean(model.credit)) || object.images.some((img) => img.credit);
  const caption = anyCredit
    ? `\n    <figcaption class="object-gallery__credit" data-gallery-credit${firstCredit ? "" : " hidden"}>${esc(firstCredit ?? "")}</figcaption>`
    : "";

  // Zoom affordance: opens the <dialog> viewer at the current medium. A real
  // button (keyboard-operable); without JS it does nothing and the thumbnails
  // below still link each image to its full-resolution file.
  const zoomBtn = `<button class="object-gallery__zoom" type="button" data-viewer-zoom>
      ${icons.zoom}<span class="visually-hidden">${esc(t("zoomInto", { name: object.title.en }))}</span>
    </button>`;

  // Thumbnail strip shows whenever there is more than one medium (a lone photo
  // with a model still gets a strip: the 3D entry + that photo).
  const thumbs =
    thumbItems.length > 1
      ? `
  <ul class="object-gallery__thumbs">
${thumbItems.join("\n")}
  </ul>`
      : "";

  // Viewer descriptor: the 3D entry first (when present), then every image
  // (full URL + inline deep-zoom source when tiled). data-viewer marks the
  // region js/main.js binds its handlers to.
  const viewerData = jsonScript("object-gallery__data", [
    ...(model ? [viewerModel(site, model)] : []),
    ...object.images.map((img) => viewerImage(site, img)),
  ]);

  return `<div class="object-gallery" data-viewer>
  <figure class="object-gallery__main">
    <div class="object-gallery__slides">
      ${slides.join("\n      ")}
    </div>
    ${zoomBtn}${caption}
  </figure>${thumbs}
  ${viewerData}
</div>`;
}

/** @param {ContentObject} object */
function renderMeta(object) {
  // Labels are translated (t); values are localised content (pick), except the
  // accession number which is a plain identifier. Object type is a strong search
  // signal — boost it above the other rows for Pagefind (feature 11).
  const rows = [
    { key: "metaObjectType", value: pick(object.objectType), boost: true },
    { key: "metaMaterials", value: pick(object.materials) },
    { key: "metaDimensions", value: pick(object.dimensions) },
    { key: "metaAccession", value: object.accession },
    { key: "metaCondition", value: pick(object.condition) },
  ].filter((r) => r.value);
  if (!rows.length) return "";
  const items = rows
    .map(
      (r) =>
        `    <div><dt>${esc(t(r.key))}</dt><dd${r.boost ? ' data-pagefind-weight="4"' : ""}>${esc(r.value)}</dd></div>`,
    )
    .join("\n");
  return `<dl class="object-meta">
${items}
  </dl>`;
}

/** @param {Site} site @param {ContentObject[]} explore */
function renderExplore(site, explore) {
  if (!explore.length) return "";
  const cards = explore.map((obj) => objectCard(site, obj)).join("\n");
  return `<section class="collection band band--light" aria-labelledby="explore-heading">
  <div class="container">
    <h2 class="collection__heading" id="explore-heading">${esc(t("exploreTheCollection"))}</h2>
    <ul class="collection-grid">
${cards}
    </ul>
  </div>
</section>`;
}

/**
 * @param {object} p
 * @param {Site} p.site
 * @param {ContentObject} p.object
 * @param {Section} p.section
 * @param {ContentObject} [p.prev]
 * @param {ContentObject} [p.next]
 * @param {ContentObject[]} p.explore - objects for the "Explore Other Collection" grid
 * @param {Person[]} [p.relatedPeople] - people who reference this object (reverse
 *   cross-link, so the person↔object link is navigable both ways)
 */
export function renderObject({
  site,
  object,
  section,
  prev,
  next,
  explore,
  relatedPeople = [],
}) {
  const peopleCards = relatedPeople.map((p) => personCard(site, p));
  const vtNames = [
    vtName("obj", object.id),
    ...explore.map((o) => vtName("obj", o.id)),
    ...relatedPeople.map((p) => vtName("person", p.id)),
  ];
  return `${renderVtStyle(vtNames)}
<article class="object band band--light">
  <div class="container">
    ${renderBreadcrumb({ site, section, leaf: object.title.tl, leafLang: "tl" })}
    <div class="object__layout">
      <div class="object__gallery-col">
        ${renderGallery(site, object)}
      </div>
      <div class="object__info-col">
        <h1 class="object__title" data-pagefind-weight="10">
          <span class="object__title-native" lang="tl">${esc(object.title.tl)}</span>
          <span class="object__title-en">${esc(object.title.en)}</span>
        </h1>
        <p class="object__title-es" lang="es">${esc(object.title.es)}</p>
        ${renderMeta(object)}
        <div class="object__description">
${renderMarkdown(pick(object.description))}
        </div>
        <p class="object__rights">${esc(object.rights)}</p>
      </div>
    </div>

    ${renderPager({
      prev,
      next,
      hrefFor: (o) => `/${o.section}/${o.id}/`,
      nameFor: (o) => o.title.tl,
      nameLang: "tl",
      ariaLabel: t("browseObjects"),
    })}
  </div>
</article>
${renderExplore(site, explore)}`;
}
