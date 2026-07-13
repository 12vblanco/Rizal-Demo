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

import { esc } from "./layout.js";
import { renderImage } from "./media.js";
import { icons } from "../icons.js";
import { orderedPersonas, personaCard } from "./fragments.js";

/**
 * @typedef {import("../types.js").Site} Site
 * @typedef {import("../types.js").Section} Section
 * @typedef {import("../types.js").HomeTeaser} HomeTeaser
 */

// --- Hero ------------------------------------------------------------------

/** @param {Site} site */
function renderHeroCtas(site) {
  if (!site.heroCtas?.length) return "";
  const buttons = site.heroCtas
    .map((cta, i) => {
      const variant = i === 0 ? "hero-btn--primary" : "hero-btn--ghost";
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
  const text = teaser.text ? `\n      <p class="teaser__text">${esc(teaser.text)}</p>` : "";
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
  // the attribution flourish — gold on the black-cow band, as in the mockup.
  // The SVG is aria-hidden, so a visually-hidden name gives AT the attribution.
  const signature = icons["rizal-signature"]
    ? `<span class="pullquote__signature">${icons["rizal-signature"]}</span>
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

/** @param {{site: Site, sections?: Section[]}} p */
export function renderHome({ site, sections = [] }) {
  return [
    renderHero(site),
    renderPersonas(site, sections),
    renderQuote(site),
    renderTeasers(site),
  ]
    .filter(Boolean)
    .join("\n");
}
