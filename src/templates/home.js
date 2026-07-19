// @ts-check
// Landing page. Hero is a looping, muted background video (the live site's
// banner, re-encoded ≤ 4 MB) with the exhibition intro + CTAs over a scrim; the
// video carries no `autoplay` attribute — js/main.js starts it only when motion
// is welcome, so reduced-motion and JS-off users keep the poster still. Below
// the hero: the gold Rizal signature motif, the four persona section cards
// (live personas link out; upcoming ones carry the data-driven badge), the
// Rizal-in-Germany / About teasers, and the Rizal pull-quote. Everything past
// the hero is data-driven off site.json + the sections — each block renders only
// when its data is present, so nothing here is invented copy.

import { icons } from "../icons.js";
import { orderedPersonas, personaCard } from "./fragments.js";
import { esc } from "./layout.js";
import { renderImage } from "./media.js";

/**
 * @typedef {import("../types.js").Site} Site
 * @typedef {import("../types.js").Section} Section
 * @typedef {import("../types.js").HomeTeaser} HomeTeaser
 * @typedef {import("../types.js").ContentObject} ContentObject
 */

// --- Hero ------------------------------------------------------------------

/** @param {Site} site */
function renderHeroCtas(site) {
  if (!site.heroCtas?.length) return "";
  const buttons = site.heroCtas
    .map((cta, i) => {
      const variant = i === 0 ? "hero-btn--primary" : "hero-btn--ghost";
      if (cta.video) {
        // Streamed from the museum's phase-1 origin (self-hosted MP4, not
        // re-hosted here — same pattern as the About "Messages" videos, built
        // from site.baseUrl so it plays in dev and prod, rule 7). The href is
        // a real link to that file — the browser plays it natively with JS
        // off — and doubles as data-video so js/main.js can intercept the
        // click and open it in the video dialog instead, without leaving the
        // page.
        const url = `${site.baseUrl}/${cta.video}`;
        return `<a class="hero-btn ${variant}" href="${esc(url)}" data-video="${esc(url)}">${esc(cta.label)}</a>`;
      }
      return `<a class="hero-btn ${variant}" href="${esc(cta.href)}">${esc(cta.label)}</a>`;
    })
    .join("\n      ");
  return `\n    <div class="hero__actions">
      ${buttons}
    </div>`;
}

/** @param {Site} site */
function renderHero(site) {
  return `<section class="hero band band--dark">
  <video class="hero__video" muted loop playsinline preload="metadata" poster="${site.basePath}img/hero-poster.webp" aria-hidden="true" tabindex="-1">
    <source src="${site.basePath}video/hero-banner.mp4" type="video/mp4">
  </video>
  <div class="hero__scrim"></div>
  <div class="container hero__inner">
    <h1 class="hero__title">${esc(site.exhibitionTitle)}:<br>
      <span class="hero__subtitle">${esc(site.exhibitionSubtitle)}</span></h1>
    <p class="hero__intro">${esc(site.description)}</p>${renderHeroCtas(site)}
  </div>
</section>`;
}

// --- 3D collection teaser ---------------------------------------------------
// A centered, wrapping row of cards under the hero, announcing the site's
// interactive 3D models and linking straight into each object's real page
// (feature 06b). Built from every object carrying a `model3d` block; renders
// nothing if none do. Its own card markup (not the shared `objectCard`) —
// that fragment carries the `obj-<id>` view-transition-name used for the
// section-grid→object-page morph, and this strip can show one object more
// than once (below), which would duplicate that name in the same document.

const MIN_3D_CARDS = 4;

/** @param {Site} site @param {ContentObject} obj */
function model3dCard(site, obj) {
  const model = /** @type {NonNullable<ContentObject["model3d"]>} */ (
    obj.model3d
  );
  const media = renderImage({
    site,
    image: { src: model.poster, alt: model.altText },
    className: "models3d__img",
    sizes: "(min-width: 60rem) 20rem, 60vw",
  });
  return `<li class="models3d__item">
  <a class="models3d__link" href="/${obj.section}/${obj.id}/">
    <span class="models3d__media">${media}
      <span class="models3d__badge" aria-hidden="true">${icons.cube}3D</span>
    </span>
    <span class="models3d__body">
      <span class="models3d__native" lang="tl">${esc(obj.title.tl)}</span>
      <span class="models3d__en">${esc(obj.title.en)}</span>
    </span>
  </a>
</li>`;
}

/** @param {Site} site @param {ContentObject[]} objects */
function render3dGallery(site, objects) {
  const models = objects.filter((o) => o.model3d);
  if (!models.length) return "";
  // Only one 3D object exists today (content-gaps.md); cycle it to fill a
  // fuller-looking row until 11c/11d–11g add more model3d objects, at which
  // point this naturally shows the real distinct set with no changes.
  const count = Math.max(models.length, MIN_3D_CARDS);
  const cards = Array.from(
    { length: count },
    (_, i) => models[i % models.length],
  );
  return `<div class="band home-3d">
  <div class="container">
    <section class="models3d" aria-labelledby="models3d-h">
      <h2 class="models3d__heading" id="models3d-h">Explore artifacts in 3D</h2>
      <p class="models3d__intro">Highlighted objects from the collection with interactive 3D view.</p>
      <ul class="models3d__scroller">
${cards.map((obj) => model3dCard(site, obj)).join("\n")}
      </ul>
    </section>
  </div>
</div>`;
}

// --- Persona section cards -------------------------------------------------
// orderedPersonas + personaCard are shared with the overview page (fragments.js).
// All four sections are presented equally here as ready, navigable cards — the
// section page itself still shows its "collection coming soon" state until its
// objects are authored (the section `status` flag drives that, not the home).

/** @param {Site} site @param {Section[]} sections */
function renderPersonas(site, sections) {
  const personas = orderedPersonas(site, sections);
  if (!personas.length) return "";
  return `<div class="band home-personas">
  <div class="container">
    <section class="persona-section" aria-labelledby="personas-h">
      <h2 class="persona-section__heading" id="personas-h">Explore the exhibition</h2>
      <ul class="persona-list">
${personas.map((s) => personaCard(site, s)).join("\n")}
      </ul>
    </section>
  </div>
</div>`;
}

// --- Rizal-in-Germany / About teasers --------------------------------------

/** @param {Site} site @param {HomeTeaser} teaser */
function renderTeaser(site, teaser) {
  // Colored card: padded text (heading, standfirst, gold "Read more") over a solid
  // accent surface, with the photo flush across the rounded bottom. `accent` is a
  // data-driven modifier (cove / falu); text + image render when present.
  const accent = teaser.accent ? ` teaser--${esc(teaser.accent)}` : "";
  const text = teaser.text
    ? `\n      <p class="teaser__text">${esc(teaser.text)}</p>`
    : "";
  const media = teaser.image
    ? `\n    <span class="teaser__media">${renderImage({ site, image: teaser.image, className: "teaser__img", sizes: "(min-width: 48rem) 34rem, 100vw" })}</span>`
    : "";
  return `<article class="teaser${accent}">
    <div class="teaser__content">
      <h2 class="teaser__heading">${esc(teaser.heading)}</h2>${text}
      <a class="teaser__more" href="${esc(teaser.href)}">Read more ${icons.arrow}</a>
    </div>${media}
  </article>`;
}

/** @param {Site} site */
function renderTeasers(site) {
  if (!site.homeTeasers?.length) return "";
  return `<div class="band band--light home-teasers">
  <div class="container">
    <div class="teaser-grid">
    ${site.homeTeasers.map((t) => renderTeaser(site, t)).join("\n    ")}
    </div>
  </div>
</div>`;
}

// --- Pull-quote ------------------------------------------------------------
// A black-cow (grey) band between the persona cards and the teasers, with the
// quote in gold — squash is legal here because the band is dark. The large
// quote text clears AA on black cow (~4.4:1 ≥ 3:1 for large text).

/** @param {Site} site */
function renderQuote(site) {
  const q = site.homeQuote;
  if (!q) return "";
  const langAttr = q.lang ? ` lang="${esc(q.lang)}"` : "";
  // Rizal's real autograph (vector-traced from the live site, currentColor) is
  // the attribution flourish — gold on the dark band, as in the mockup. The SVG
  // is the permanent version (JS-off / reduced-motion). js/main.js progressively
  // swaps in rizal-signature.webp — the live site's own hand-drawn autograph
  // animation, re-authored with real alpha so it sits on the band like the SVG —
  // once the quote scrolls into view and motion is welcome; the file is trimmed
  // + authored to loop once, so it simply holds on the finished signature
  // afterwards (spec: all motion behind prefers-reduced-motion). Both are
  // aria-hidden; the visually-hidden name gives AT the attribution either way.
  // The <img> needs a valid src to be well-formed markup even though js/main.js
  // doesn't assign the real file until it should start (a 1x1 transparent GIF —
  // not "" as a placeholder, which some browsers resolve to the document's own
  // URL); data-anim-src carries the real path.
  const signature = icons["rizal-signature"]
    ? `<span class="pullquote__signature">${icons["rizal-signature"]}<img class="pullquote__signature-anim" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" data-anim-src="${esc(site.basePath)}img/rizal-signature.webp" alt="" aria-hidden="true" width="480" height="208" hidden></span>
      <span class="visually-hidden">${esc(q.attribution)}</span>`
    : esc(q.attribution);
  return `<div class="band home-quote">
  <div class="container">
    <figure class="pullquote">
      <blockquote class="pullquote__text"${langAttr}>&ldquo;${esc(q.text)}&rdquo;</blockquote>
      <figcaption class="pullquote__cite">${signature}</figcaption>
    </figure>
  </div>
</div>`;
}

// --- Page ------------------------------------------------------------------

/** @param {{site: Site, sections?: Section[], objects?: ContentObject[]}} p */
export function renderHome({ site, sections = [], objects = [] }) {
  return [
    renderHero(site),
    render3dGallery(site, objects),
    renderPersonas(site, sections),
    renderQuote(site),
    renderTeasers(site),
  ]
    .filter(Boolean)
    .join("\n");
}
