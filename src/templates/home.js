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
import { localizeHref, pick, t } from "../i18n.js";

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
    .map((cta) => {
      // The accent fill marks a video, not position: both video CTAs wear it so
      // the pair reads as one kind of thing, and the plain link beside them
      // (Read more) stays a ghost button. Order no longer decides the styling.
      const variant = cta.video ? "hero-btn--primary" : "hero-btn--ghost";
      if (cta.video) {
        // Shipped from this repo's static/video/ (same pattern as the About
        // "Messages" videos), addressed off site.basePath so dev and prod agree
        // — rule 7, no hardcoded domain. The href is a real link to that file
        // — the browser plays it natively with JS off — and doubles as
        // data-video so js/main.js can intercept the click and open it in the
        // video dialog instead, without leaving the page.
        //
        // `videoSmall` rides along as data-video-small where a second, lighter
        // encode exists. It is deliberately not a second <source>: both rungs
        // are H.264/MP4, so a browser offered both would always take the first
        // it can decode (the 1080p) — picking by screen is js/main.js's job.
        // The href stays on the full-size rung, which is the right no-JS
        // default: one canonical file at full quality.
        const url = `${site.basePath}${cta.video}`;
        const small = cta.videoSmall
          ? ` data-video-small="${esc(`${site.basePath}${cta.videoSmall}`)}"`
          : "";
        // The play mark leads the label, so the button says "video" before it
        // is read. Same icon the About page's message cards use — one
        // vocabulary for "this opens a player" across the site. It is
        // decorative (the label already names the video), so the SVG carries
        // aria-hidden and nothing is added for screen readers.
        return `<a class="hero-btn ${variant}" href="${esc(url)}" data-video="${esc(url)}"${small}>${icons.play}${esc(pick(cta.label))}</a>`;
      }
      return `<a class="hero-btn ${variant}" href="${esc(localizeHref(cta.href))}">${esc(pick(cta.label))}</a>`;
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
    <h1 class="hero__title">${esc(pick(site.exhibitionTitle).replace(/\band\b/, "&"))}:<br>
      <span class="hero__subtitle">${esc(pick(site.exhibitionSubtitle))}</span></h1>
    <p class="hero__intro">${esc(pick(site.description))}</p>${renderHeroCtas(site)}
  </div>
</section>`;
}

// --- 3D collection teaser ---------------------------------------------------
// A centered, wrapping row of cards under the hero, announcing the site's
// interactive 3D models and linking straight into each object's real page
// (feature 06b). Its own card markup (not the shared `objectCard`) — that
// fragment carries the `obj-<id>` view-transition-name used for the
// section-grid→object-page morph, and a card here would duplicate that name in
// the same document.
//
// Which objects appear, and in what order, is curated in `site.home3dObjects`
// — today the four sculptures, which are the objects with a finished scan.
// Without that list the strip falls back to the first few objects carrying a
// `model3d` block, which would include the ones still on a placeholder model.

const HOME_3D_CARDS = 4;

/** @param {Site} site @param {ContentObject} obj */
function model3dCard(site, obj) {
  const model = /** @type {NonNullable<ContentObject["model3d"]>} */ (
    obj.model3d
  );
  const media = renderImage({
    site,
    // `cardPoster` is the object re-framed for this row — every card puts its
    // object on the same stage at the same size, which the camera-matched
    // `poster` cannot do (scripts/images/card-poster.mjs). Falls back to the
    // poster for an object that has not been given one.
    image: { src: model.cardPoster ?? model.poster, alt: model.altText },
    className: "models3d__img",
    sizes: "min(18rem, 78vw)",
  });
  // Object names stay in their original form on every locale (curatorial
  // metadata), and which name leads follows the collection cards: for an
  // ethnographic object `tl` is the thing's own name and English is the gloss,
  // so the vernacular leads; an artist's `tl` is a translation of the work's
  // English title, so English leads there.
  const vernacular = obj.title.tl;
  const vernacularLeads = Boolean(vernacular) && obj.section !== "artist";
  const title = vernacularLeads
    ? `<span class="models3d__native" lang="tl">${esc(/** @type {string} */ (vernacular))}</span>`
    : `<span class="models3d__native">${esc(obj.title.en)}</span>`;
  return `<li class="models3d__item">
  <a class="models3d__link" href="${esc(localizeHref(`/${obj.section}/${obj.id}/`))}">
    <span class="models3d__media">${media}
      <span class="models3d__badge" aria-hidden="true">${icons.cube}3D</span>
    </span>
    <span class="models3d__body">
      ${title}
    </span>
  </a>
</li>`;
}

/** @param {Site} site @param {ContentObject[]} objects */
function render3dGallery(site, objects) {
  const models = objects.filter((o) => o.model3d);
  if (!models.length) return "";
  // The teaser is a single row of four: enough to advertise the 3D collection
  // without turning the landing page into the collection itself. The curated
  // list wins where it exists (content.js has already checked every id resolves
  // to an object with a model); otherwise the row is filled from the collection
  // and cycled, so it still reads as a row below four 3D objects.
  const byId = new Map(models.map((o) => [o.id, o]));
  const curated = (site.home3dObjects ?? [])
    .map((id) => byId.get(id))
    .filter(/** @returns {o is ContentObject} */ (o) => Boolean(o));
  const cards = curated.length
    ? curated.slice(0, HOME_3D_CARDS)
    : Array.from({ length: HOME_3D_CARDS }, (_, i) => models[i % models.length]);
  return `<div class="band home-3d">
  <div class="container">
    <section class="models3d" aria-labelledby="models3d-h">
      <h2 class="models3d__heading" id="models3d-h">${esc(t("home3dHeading"))}</h2>
      <p class="models3d__intro">${esc(t("home3dIntro"))}</p>
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
      <h2 class="persona-section__heading" id="personas-h">${esc(t("exploreExhibition"))}</h2>
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
    ? `\n      <p class="teaser__text">${esc(pick(teaser.text))}</p>`
    : "";
  const media = teaser.image
    ? `\n    <span class="teaser__media">${renderImage({ site, image: teaser.image, className: "teaser__img", sizes: "(min-width: 90rem) 42.75rem, (min-width: 48rem) calc((100vw - 4.5rem) / 2), calc(100vw - 3rem)" })}</span>`
    : "";
  return `<article class="teaser${accent}">
    <div class="teaser__content">
      <h2 class="teaser__heading">${esc(pick(teaser.heading))}</h2>${text}
      <a class="teaser__more" href="${esc(localizeHref(teaser.href))}">${esc(t("readMore"))} ${icons.arrow}</a>
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

// --- Signature band --------------------------------------------------------
// A black-cow (grey) band between the persona cards and the teasers carrying
// Rizal's autograph, large, as the band's whole highlight — no pull-quote text.

/** @param {Site} site */
function renderQuote(site) {
  const q = site.homeQuote;
  if (!q) return "";
  // Rizal's real autograph (vector-traced from the live site, currentColor) is
  // the band's highlight — gold on the dark band, as in the mockup. The SVG
  // is the permanent version (JS-off / reduced-motion). js/main.js progressively
  // swaps in rizal-signature.webp — the live site's own hand-drawn autograph
  // animation, re-authored with real alpha so it sits on the band like the SVG —
  // once the band scrolls into view and motion is welcome; the file is trimmed
  // + authored to loop once, so it simply holds on the finished signature
  // afterwards (spec: all motion behind prefers-reduced-motion). Both are
  // aria-hidden; the visually-hidden name gives AT the attribution either way.
  // The <img> needs a valid src to be well-formed markup even though js/main.js
  // doesn't assign the real file until it should start (a 1x1 *transparent* GIF
  // — one with the transparency extension, since an <img> keeps painting its
  // old image while a new src loads; not "" as a placeholder, which some
  // browsers resolve to the document's own URL); data-anim-src carries the
  // real path.
  const signature = icons["rizal-signature"]
    ? `<span class="pullquote__signature">${icons["rizal-signature"]}<img class="pullquote__signature-anim" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" data-anim-src="${esc(site.basePath)}img/rizal-signature.webp" alt="" aria-hidden="true" width="480" height="208" hidden></span>
      <span class="visually-hidden">${esc(q.attribution)}</span>`
    : esc(q.attribution);
  return `<div class="band home-quote">
  <div class="container">
    <p class="pullquote">${signature}</p>
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
