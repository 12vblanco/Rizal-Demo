// @ts-check
// Section (persona) page — one generated page per section at /<section-id>/
// (/ethnographer/, /scholar/, /artist/, /hero/). One template drives three
// data states, all keyed off sections/<id>.json:
//   • live + categories  → tab-styled category view (Ethnographer)
//   • live, no categories → object or person grid (Scholar)
//   • status "upcoming"   → editorial teasers + the designed "upcoming" state
// The `status` flag alone flips a section's grid area upcoming ↔ live — no
// markup edits (spec acceptance). Grids reuse the shared object/person cards so
// their view-transition-name matches the detail-page hero (cross-doc morph).

import { esc } from "./layout.js";
import { renderImage } from "./media.js";
import { icons } from "../icons.js";
import { objectCard, personCard, renderVtStyle, vtName } from "./fragments.js";

/**
 * @typedef {import("../types.js").Site} Site
 * @typedef {import("../types.js").Section} Section
 * @typedef {import("../types.js").ContentObject} ContentObject
 * @typedef {import("../types.js").Person} Person
 * @typedef {import("../types.js").Essay} Essay
 */

// --- SEO slots (full package in feature 12) --------------------------------

/** @param {Section} section @param {Site} site */
export function sectionTitle(section, site) {
  const full = `${section.title} | ${site.siteTitle}`;
  return full.length <= 70 ? full : section.title;
}

/** @param {Section} section */
export function sectionDescription(section) {
  const plain = section.intro.replace(/\s+/g, " ").trim();
  if (plain.length <= 155) return plain;
  return plain.slice(0, 152).replace(/\s+\S*$/, "") + "…";
}

// --- Hero band -------------------------------------------------------------

/** @param {Site} site @param {Section} section */
function renderHero(site, section) {
  // Persona portrait as a background <img> (goes through the pipeline helper,
  // so alt comes from data) under a left-weighted scrim that keeps the title
  // AA-legible over any image. Same technique as the home video hero.
  const bg = renderImage({
    site,
    image: section.heroImage,
    className: "section-hero__bg",
    loading: "eager",
    fetchpriority: "high",
  });
  const badge = section.status === "upcoming"
    ? `<p class="upcoming-badge">Upcoming</p>\n    `
    : "";
  return `<section class="section-hero band band--dark">
  ${bg}
  <div class="section-hero__scrim"></div>
  <div class="container section-hero__inner">
    ${badge}<a class="section-hero__eyebrow" href="/jose-rizal/">Jose Rizal</a>
    <h1 class="section-hero__title">${esc(section.title)}</h1>
    <p class="section-hero__intro">${esc(section.intro)}</p>
  </div>
</section>`;
}

// --- Essay teasers ---------------------------------------------------------

/** One essay teaser card: hero thumb, title, byline, summary, "Read more" →
 *  the real essay page (never a modal). The image is decorative here (the
 *  title is adjacent), so alt is empty.
 * @param {Site} site @param {Essay} essay */
function renderEssayTeaser(site, essay) {
  const media = essay.heroImage
    ? `<span class="essay-card__media">${renderImage({
        site,
        image: { src: essay.heroImage, alt: "" },
        className: "essay-card__img",
        sizes: "(min-width: 48rem) 22rem, 100vw",
      })}</span>\n  `
    : "";
  return `<li class="essay-card">
  ${media}<div class="essay-card__body">
    <h3 class="essay-card__title">${esc(essay.title)}</h3>
    <p class="essay-card__byline">By ${esc(essay.author)}</p>
    <p class="essay-card__summary">${esc(essay.summary)}</p>
    <a class="essay-card__more" href="/essays/${esc(essay.slug)}/" aria-label="Read more: ${esc(essay.title)}">Read more ${icons.arrow}</a>
  </div>
</li>`;
}

/** @param {Site} site @param {Essay[]} essays */
function renderEssayList(site, essays) {
  return `<ul class="essay-list">
${essays.map((e) => renderEssayTeaser(site, e)).join("\n")}
    </ul>`;
}

// --- Category view (Ethnographer) ------------------------------------------

/** A designed empty state for a panel with no content yet (template UI copy,
 *  not invented editorial content).
 * @param {string} message */
function panelEmpty(message) {
  return `<p class="section-panel__empty">${esc(message)}</p>`;
}

/** @param {string} id @param {string} heading @param {string} inner */
function renderPanel(id, heading, inner) {
  return `    <section class="section-panel" id="${esc(id)}" aria-labelledby="${esc(id)}-h">
      <h2 class="section-panel__heading" id="${esc(id)}-h">${esc(heading)}</h2>
      ${inner}
    </section>`;
}

/** @param {Site} site @param {Section} section @param {ContentObject[]} objects @param {Essay[]} essays */
function renderCategoryView(site, section, objects, essays) {
  const uncategorised = essays.filter((e) => !e.category);

  const tabs = [
    { id: "section-intro", label: "Introduction" },
    ...section.categories.map((c) => ({ id: `category-${c.id}`, label: c.label })),
  ];
  const tabBar = `<nav class="section-tabs" aria-label="Category navigation">
      <ul class="section-tabs__list">
${tabs.map((t) => `        <li><a class="section-tabs__link" href="#${t.id}">${esc(t.label)}</a></li>`).join("\n")}
      </ul>
    </nav>`;

  const introPanel = renderPanel(
    "section-intro",
    "Introduction",
    uncategorised.length
      ? renderEssayList(site, uncategorised)
      : panelEmpty("The introduction to this section is being prepared."),
  );

  const categoryPanels = section.categories
    .map((c) => {
      const catEssays = essays.filter((e) => e.category === c.id);
      const catObjects = objects.filter((o) => o.category === c.id);
      const parts = [];
      if (catEssays.length) parts.push(renderEssayList(site, catEssays));
      if (catObjects.length) {
        parts.push(`<ul class="collection-grid">
${catObjects.map((o) => objectCard(site, o)).join("\n")}
      </ul>`);
      }
      if (!parts.length) parts.push(panelEmpty("Objects in this category are being added."));
      return renderPanel(`category-${c.id}`, c.label, parts.join("\n      "));
    })
    .join("\n");

  return `<div class="band band--light section-body">
  <div class="container">
    ${tabBar}
${introPanel}
${categoryPanels}
  </div>
</div>`;
}

// --- Plain grid view (Scholar / any live section without categories) -------

/** @param {Site} site @param {Section} section @param {Essay[]} essays @param {string[]} cards */
function renderGridView(site, section, essays, cards) {
  const essayBlock = essays.length
    ? `<div class="section-body__editorial">${renderEssayList(site, essays)}</div>\n    `
    : "";
  return `<div class="band band--light section-body">
  <div class="container">
    ${essayBlock}<h2 class="section-grid__heading">Explore the collection</h2>
    <ul class="collection-grid">
${cards.join("\n")}
    </ul>
  </div>
</div>`;
}

// --- Upcoming view (Artist / Hero) -----------------------------------------

/** @param {Site} site @param {Section} section @param {Essay[]} essays */
function renderUpcomingView(site, section, essays) {
  const editorial = essays.length
    ? `<div class="band band--light section-body">
  <div class="container">
    ${renderEssayList(site, essays)}
  </div>
</div>
`
    : "";
  return `${editorial}<div class="band band--light section-upcoming">
  <div class="container">
    <p class="upcoming-badge upcoming-badge--on-light">Upcoming</p>
    <h2 class="section-upcoming__heading">The collection is being prepared</h2>
    <p class="section-upcoming__text">This part of the exhibition is coming soon. Explore the other sections in the meantime.</p>
    <p><a href="${esc(site.basePath)}">Return to the exhibition home</a></p>
  </div>
</div>`;
}

// --- Page ------------------------------------------------------------------

/**
 * @param {object} p
 * @param {Site} p.site
 * @param {Section} p.section
 * @param {ContentObject[]} p.objects - this section's objects, sorted by order
 * @param {Person[]} p.people - this section's people, sorted by order
 * @param {Essay[]} p.essays - this section's essays, sorted by order
 */
export function renderSection({ site, section, objects, people, essays }) {
  let body;
  /** @type {string[]} */
  let vtNames = [];
  if (section.status === "upcoming") {
    body = renderUpcomingView(site, section, essays);
  } else if (section.categories.length) {
    body = renderCategoryView(site, section, objects, essays);
    vtNames = objects.map((o) => vtName("obj", o.id));
  } else if (people.length) {
    body = renderGridView(site, section, essays, people.map((p) => personCard(site, p)));
    vtNames = people.map((p) => vtName("person", p.id));
  } else {
    body = renderGridView(site, section, essays, objects.map((o) => objectCard(site, o)));
    vtNames = objects.map((o) => vtName("obj", o.id));
  }
  const vtStyle = vtNames.length ? renderVtStyle(vtNames) + "\n" : "";
  return `${vtStyle}${renderHero(site, section)}
${body}`;
}
