// @ts-check
// Section (persona) page — one generated page per section at /<section-id>/
// (/ethnographer/, /scholar/, /artist/, /hero/). One template drives three
// data states, all keyed off sections/<id>.json:
//   • live + categories  → tab-styled category view (Ethnographer, Artist,
//                          Scholar — which tiles people where the other two
//                          tile objects)
//   • live, no categories → object or person grid (Hero)
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

/** The panel's <h2> is what `aria-labelledby` points at and what keeps the
 *  outline at h1 → h2 → h3 (the cards inside are h3s), so a heading that would
 *  only repeat its own tab label is hidden rather than dropped — the element
 *  stays for assistive tech, the words leave the page.
 * @param {string} id @param {string} heading @param {string} inner
 * @param {boolean} [hideHeading] */
function renderPanel(id, heading, inner, hideHeading = false) {
  const headingClass = `section-panel__heading${hideHeading ? " visually-hidden" : ""}`;
  return `    <section class="section-panel" id="${esc(id)}" aria-labelledby="${esc(id)}-h">
      <h2 class="${headingClass}" id="${esc(id)}-h">${esc(heading)}</h2>
      ${inner}
    </section>`;
}

/** The artifact column's contents for a category view. Ethnographer and Artist
 *  tile objects; Scholar tiles the people Rizal learned from. Only the cards,
 *  the column heading, and the grid's track list differ, so the cards are
 *  rendered up front and the panel template below stays collection-agnostic.
 * @typedef {object} Collection
 * @property {{ category?: string, card: string }[]} entries - one per record:
 *   the category tab it belongs to, and its rendered card
 * @property {string} heading
 * @property {string} empty - designed empty state when a tab has none
 */

/** @param {Site} site @param {ContentObject[]} objects @returns {Collection} */
function objectCollection(site, objects) {
  return {
    entries: objects3dFirst(objects).map((o) => ({ category: o.category, card: objectCard(site, o) })),
    heading: t("exploreObjects"),
    empty: t("objectsComingSoon"),
  };
}

/** @param {Site} site @param {Person[]} people @returns {Collection} */
function peopleCollection(site, people) {
  return {
    entries: people.map((p) => ({ category: p.category, card: personCard(site, p) })),
    heading: t("explorePeople"),
    empty: t("peopleComingSoon"),
  };
}

/** This collection narrowed to one tab.
 * @param {Collection} collection @param {string} categoryId @returns {Collection} */
function inCategory(collection, categoryId) {
  return { ...collection, entries: collection.entries.filter((e) => e.category === categoryId) };
}

/** One category tab's content: a narrow essay column beside a wide collection
 *  grid, both already filtered to that category (or, for the Introduction tab,
 *  the full unfiltered collection). Where the section has editorial at all,
 *  both columns always render — with their own heading — so the two content
 *  types (article vs. artifact) stay visually distinct regardless of how many
 *  of each a category has. A section with no essays anywhere (Scholar, whose
 *  prose lives on the person pages) drops the column instead of repeating a
 *  "being prepared" note under every tab, and the grid takes the full width.
 * @param {string} id @param {string} heading @param {Essay[]} essays
 * @param {Collection} collection @param {boolean} withEssays
 * @param {boolean} [hideHeading] */
function renderCategoryPanel(id, heading, essays, collection, withEssays, hideHeading = false) {
  const essaysCol = withEssays
    ? `<div class="category-panel__essays">
        <h3 class="section-panel__subheading">${esc(t("essays"))}</h3>
        ${essays.length ? renderEssayList(essays) : panelEmpty(t("essaysComingSoon"))}
      </div>
      `
    : "";
  const collectionCol = `<div class="category-panel__objects">
        <h3 class="section-panel__subheading">${esc(collection.heading)}</h3>
        ${
          collection.entries.length
            ? `<ul class="collection-grid">
${collection.entries.map((e) => e.card).join("\n")}
        </ul>`
            : panelEmpty(collection.empty)
        }
      </div>`;
  return renderPanel(
    id,
    heading,
    `<div class="category-panel__columns${withEssays ? "" : " category-panel__columns--single"}">
      ${essaysCol}${collectionCol}
    </div>`,
    hideHeading,
  );
}

/** @param {Section} section @param {Essay[]} essays @param {Collection} collection */
function renderCategoryView(section, essays, collection) {
  const uncategorised = essays.filter((e) => !e.category);
  const withEssays = essays.length > 0;

  const tabs = [
    { id: "section-intro", label: t("introduction") },
    ...section.categories.map((c) => ({ id: `category-${c.id}`, label: pick(c.label) })),
  ];
  const tabBar = `<nav class="section-tabs" aria-label="${esc(t("categoryNav"))}">
      <ul class="section-tabs__list">
${tabs.map((tab) => `        <li><a class="section-tabs__link" href="#${tab.id}">${esc(tab.label)}</a></li>`).join("\n")}
      </ul>
    </nav>`;

  // Introduction pairs the overview essay with the whole collection,
  // unfiltered — matching the live site's behavior — rather than an empty grid.
  // Its heading would sit directly beneath the identically-worded first tab, so
  // it renders for assistive tech only; the category panels keep theirs, which
  // name which slice of the collection you are looking at.
  const introPanel = renderCategoryPanel("section-intro", t("introduction"), uncategorised, collection, withEssays, true);

  const categoryPanels = section.categories
    .map((c) =>
      renderCategoryPanel(
        `category-${c.id}`,
        pick(c.label),
        essays.filter((e) => e.category === c.id),
        inCategory(collection, c.id),
        withEssays,
      )
    )
    .join("\n");

  return `<div class="band band--light section-body">
  <div class="container">
    ${tabBar}
${introPanel}
${categoryPanels}
  </div>
</div>`;
}

// --- Plain grid view (Hero / any live section without categories) ----------

/** @param {Site} site @param {Section} section @param {Essay[]} essays
 *  @param {string[]} cards */
function renderGridView(site, section, essays, cards) {
  const essayBlock = essays.length
    ? `<div class="section-body__editorial"><h2 class="section-grid__heading">${esc(t("essays"))}</h2>\n    ${renderEssayList(essays)}</div>\n    `
    : "";
  // A section can be live with editorial but no artifacts of its own yet
  // (e.g. Hero — the live site names no per-object collection for it). Omit
  // the "Explore the collection" heading + grid rather than render it empty.
  const collectionBlock = cards.length
    ? `<h2 class="section-grid__heading">${esc(t("exploreCollection"))}</h2>
    <ul class="collection-grid">
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
    // A section's collection is one or the other, never both: Scholar is the
    // people Rizal learned from, Ethnographer and Artist their objects.
    const usePeople = people.length > 0;
    body = renderCategoryView(
      section,
      essays,
      usePeople ? peopleCollection(site, people) : objectCollection(site, objects),
    );
    vtNames = usePeople
      ? people.map((p) => vtName("person", p.id))
      : objects.map((o) => vtName("obj", o.id));
  } else if (people.length) {
    body = renderGridView(site, section, essays, people.map((p) => personCard(site, p)));
    vtNames = people.map((p) => vtName("person", p.id));
  } else {
    body = renderGridView(site, section, essays, objects3dFirst(objects).map((o) => objectCard(site, o)));
    vtNames = objects.map((o) => vtName("obj", o.id));
  }
  const vtStyle = vtNames.length ? renderVtStyle(vtNames) + "\n" : "";
  return `${vtStyle}${renderHero(site, section)}
${body}`;
}
