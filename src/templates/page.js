// @ts-check
// Standalone content pages (content/pages/*.md): the Jose Rizal overview and
// Rizal in Germany. A dark hero band (title + optional standfirst, optional
// decorative background image under a scrim) over a light prose band at a narrow
// measure. The overview opts in via frontmatter `personaCards` to the shared
// landing persona-card grid (fragments.js). Missing-content states never appear
// here — these pages carry migrated live-site copy.

import { esc } from "./layout.js";
import { renderImage } from "./media.js";
import { orderedPersonas, personaCard, renderMarkdown } from "./fragments.js";

/**
 * @typedef {import("../types.js").Site} Site
 * @typedef {import("../types.js").Section} Section
 * @typedef {import("../types.js").ContentPage} ContentPage
 */

// --- SEO slots (full package in feature 12) --------------------------------

/** @param {ContentPage} page @param {Site} site */
export function pageTitle(page, site) {
  const full = `${page.title} | ${site.siteTitle}`;
  return full.length <= 70 ? full : page.title;
}

/** @param {ContentPage} page */
export function pageDescription(page) {
  const plain = String(page.intro || page.body).replace(/\s+/g, " ").trim();
  if (plain.length <= 155) return plain;
  return plain.slice(0, 152).replace(/\s+\S*$/, "") + "…";
}

// --- Hero band -------------------------------------------------------------

/** @param {Site} site @param {ContentPage} page */
function renderHero(site, page) {
  // Optional decorative background (the title is adjacent, so alt is empty),
  // same technique as the section hero: an <img> under a scrim, not a CSS
  // background, so it goes through the pipeline helper.
  const bg = page.heroImage
    ? renderImage({
        site,
        image: { src: page.heroImage, alt: "" },
        className: "page-hero__bg",
        loading: "eager",
        fetchpriority: "high",
      }) + `\n  <div class="page-hero__scrim"></div>`
    : "";
  const intro = page.intro ? `\n    <p class="page-hero__intro">${esc(page.intro)}</p>` : "";
  const modifier = page.heroImage ? " page-hero--image" : "";
  return `<section class="page-hero band band--dark${modifier}">
  ${bg}
  <div class="container page-hero__inner">
    <h1 class="page-hero__title">${esc(page.title)}</h1>${intro}
  </div>
</section>`;
}

// --- Persona cards (overview only) -----------------------------------------

/** @param {Site} site @param {Section[]} sections */
function renderPersonaSection(site, sections) {
  const personas = orderedPersonas(site, sections);
  if (!personas.length) return "";
  return `
<div class="band home-personas">
  <div class="container">
    <section class="persona-section" aria-labelledby="overview-personas-h">
      <h2 class="persona-section__heading" id="overview-personas-h">Explore the exhibition</h2>
      <ul class="persona-list">
${personas.map((s) => personaCard(site, s)).join("\n")}
      </ul>
    </section>
  </div>
</div>`;
}

// --- Page ------------------------------------------------------------------

/**
 * @param {object} p
 * @param {Site} p.site
 * @param {ContentPage} p.page - { title, slug, intro?, heroImage?, bodyHeading?, author?, personaCards?, body }
 * @param {Section[]} [p.sections] - persona sections, ordered (for the overview cards)
 */
export function renderContentPage({ site, page, sections = [] }) {
  const heading = page.bodyHeading
    ? `<h2 class="page-body__heading">${esc(page.bodyHeading)}</h2>\n    `
    : "";
  const byline = page.author
    ? `<p class="page-body__byline">By ${esc(page.author)}</p>\n    `
    : "";
  const personas = page.personaCards ? renderPersonaSection(site, sections) : "";
  return `${renderHero(site, page)}
<div class="band band--light page-body">
  <div class="container container--narrow">
    ${heading}${byline}<div class="page-body__prose">
${renderMarkdown(page.body)}
    </div>
  </div>
</div>${personas}`;
}
