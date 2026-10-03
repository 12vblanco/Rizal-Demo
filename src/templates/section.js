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

import { esc, seoTitle } from "./layout.js";
import { renderImage } from "./media.js";
import { icons } from "../icons.js";
import { objectCard, personCard, renderVtStyle, vtName } from "./fragments.js";
import { localizeHref, pick, t } from "../i18n.js";

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
  return seoTitle(pick(section.title), pick(site.siteTitle));
}

/** @param {Section} section */
export function sectionDescription(section) {
  const plain = pick(section.intro).replace(/\s+/g, " ").trim();
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
    ? `<p class="upcoming-badge">${esc(t("upcoming"))}</p>\n    `
    : "";
  return `<section class="section-hero band band--dark">
  ${bg}
  <div class="section-hero__scrim"></div>
  <div class="container section-hero__inner">
    ${badge}<a class="section-hero__eyebrow" href="${esc(localizeHref("/jose-rizal/"))}">${esc(t("joseRizal"))}</a>
    <h1 class="section-hero__title">${esc(pick(section.title))}</h1>
    <p class="section-hero__intro">${esc(pick(section.intro))}</p>
  </div>
</section>`;
}

// --- Essay teasers ---------------------------------------------------------

/** One essay teaser: title, byline, summary, "Read more" → the real essay
 *  page (never a modal). Text-only by design — no thumbnail — so it reads as
 *  an excerpt, distinct from the object grid beside it.
 * @param {Essay} essay */
function renderEssayTeaser(essay) {
  return `<li class="essay-card">
  <h3 class="essay-card__title">${esc(pick(essay.title))}</h3>
  <p class="essay-card__byline">${esc(t("by", { author: essay.author }))}</p>
  <p class="essay-card__summary">${esc(pick(essay.summary))}</p>
  <a class="essay-card__more" href="${esc(localizeHref(`/essays/${essay.slug}/`))}" aria-label="${esc(t("readMoreAria", { title: pick(essay.title) }))}">${esc(t("readMore"))} ${icons.arrow}</a>
</li>`;
}

/** @param {Essay[]} essays */
function renderEssayList(essays) {
  return `<ul class="essay-list">
${essays.map((e) => renderEssayTeaser(e)).join("\n")}
    </ul>`;
}

// --- Object grid ordering ---------------------------------------------------

/** Objects with a `model3d` block lead the grid (stable sort, so curatorial
 *  `order` still governs everything else) — the 3D badge on their card is
 *  otherwise easy to miss below the fold.
 * @param {ContentObject[]} objects */
function objects3dFirst(objects) {
  return [...objects].sort((a, b) => Number(Boolean(b.model3d)) - Number(Boolean(a.model3d)));
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

/** One category tab's content: a narrow essay column beside a wide object
 *  grid, both filtered to that category (or, for the Introduction tab, the
 *  full unfiltered object collection). Both columns always render — with
 *  their own heading — so the two content types (article vs. artifact) stay
 *  visually distinct regardless of how many of each a category has.
 * @param {Site} site @param {string} id @param {string} heading
 * @param {Essay[]} essays @param {ContentObject[]} objects */
function renderCategoryPanel(site, id, heading, essays, objects) {
  const essaysCol = `<div class="category-panel__essays">
        <h3 class="section-panel__subheading">${esc(t("essays"))}</h3>
        ${essays.length ? renderEssayList(essays) : panelEmpty(t("essaysComingSoon"))}
      </div>`;
  const objectsCol = `<div class="category-panel__objects">
        <h3 class="section-panel__subheading">${esc(t("exploreObjects"))}</h3>
        ${
          objects.length
            ? `<ul class="collection-grid">
${objects3dFirst(objects).map((o) => objectCard(site, o)).join("\n")}
        </ul>`
            : panelEmpty(t("objectsComingSoon"))
        }
      </div>`;
  return renderPanel(
    id,
    heading,
    `<div class="category-panel__columns">
      ${essaysCol}
      ${objectsCol}
    </div>`,
  );
}

/** @param {Site} site @param {Section} section @param {ContentObject[]} objects @param {Essay[]} essays */
function renderCategoryView(site, section, objects, essays) {
  const uncategorised = essays.filter((e) => !e.category);

  const tabs = [
    { id: "section-intro", label: t("introduction") },
    ...section.categories.map((c) => ({ id: `category-${c.id}`, label: pick(c.label) })),
  ];
  const tabBar = `<nav class="section-tabs" aria-label="${esc(t("categoryNav"))}">
      <ul class="section-tabs__list">
${tabs.map((tab) => `        <li><a class="section-tabs__link" href="#${tab.id}">${esc(tab.label)}</a></li>`).join("\n")}
      </ul>
    </nav>`;

  // Introduction pairs the overview essay with every object, unfiltered —
  // matching the live site's behavior — rather than an empty grid.
  const introPanel = renderCategoryPanel(site, "section-intro", t("introduction"), uncategorised, objects);

  const categoryPanels = section.categories
    .map((c) => {
      const catEssays = essays.filter((e) => e.category === c.id);
      const catObjects = objects.filter((o) => o.category === c.id);
      return renderCategoryPanel(site, `category-${c.id}`, pick(c.label), catEssays, catObjects);
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

/** @param {Site} site @param {Section} section @param {Essay[]} essays
 *  @param {string[]} cards @param {string} [gridClass] - extra class on the
 *  grid, so a card set with its own column rhythm (the Scholar portraits) can
 *  override the shared auto-fill track list. */
function renderGridView(site, section, essays, cards, gridClass = "") {
  const essayBlock = essays.length
    ? `<div class="section-body__editorial"><h2 class="section-grid__heading">${esc(t("essays"))}</h2>\n    ${renderEssayList(essays)}</div>\n    `
    : "";
  // A section can be live with editorial but no artifacts of its own yet
  // (e.g. Hero — the live site names no per-object collection for it). Omit
  // the "Explore the collection" heading + grid rather than render it empty.
  const collectionBlock = cards.length
    ? `<h2 class="section-grid__heading">${esc(t("exploreCollection"))}</h2>
    <ul class="collection-grid${gridClass ? " " + gridClass : ""}">
${cards.join("\n")}
    </ul>`
    : "";
  return `<div class="band band--light section-body">
  <div class="container">
    ${essayBlock}${collectionBlock}
  </div>
</div>`;
}

// --- Upcoming view (Artist / Hero) -----------------------------------------

/** @param {Site} site @param {Section} section @param {Essay[]} essays */
function renderUpcomingView(site, section, essays) {
  // Same "Essays" heading the live grid view uses — the teasers are <h3>s, so
  // without it an upcoming section with editorial jumps h1 → h3.
  const editorial = essays.length
    ? `<div class="band band--light section-body">
  <div class="container">
    <h2 class="section-grid__heading">${esc(t("essays"))}</h2>
    ${renderEssayList(essays)}
  </div>
</div>
`
    : "";
  return `${editorial}<div class="band band--light section-upcoming">
  <div class="container">
    <p class="upcoming-badge upcoming-badge--on-light">${esc(t("upcoming"))}</p>
    <h2 class="section-upcoming__heading">${esc(t("collectionBeingPrepared"))}</h2>
    <p class="section-upcoming__text">${esc(t("collectionComingSoonText"))}</p>
    <p><a href="${esc(localizeHref(site.basePath))}">${esc(t("returnHome"))}</a></p>
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
    body = renderGridView(site, section, essays, people.map((p) => personCard(site, p)), "collection-grid--people");
    vtNames = people.map((p) => vtName("person", p.id));
  } else {
    body = renderGridView(site, section, essays, objects3dFirst(objects).map((o) => objectCard(site, o)));
    vtNames = objects.map((o) => vtName("obj", o.id));
  }
  const vtStyle = vtNames.length ? renderVtStyle(vtNames) + "\n" : "";
  return `${vtStyle}${renderHero(site, section)}
${body}`;
}
