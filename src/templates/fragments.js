// @ts-check
// Shared detail-page fragments. Feature 04 extracted these out of object.js so
// the object and person templates render one copy of the breadcrumb, prev/next
// pager, related-cards, limited-Markdown, and cross-document View-Transition
// plumbing instead of duplicating it. The single image helper stays media.js.

import { esc } from "./layout.js";
import { renderImage } from "./media.js";
import { icons } from "../icons.js";

/**
 * @typedef {import("../types.js").Site} Site
 * @typedef {import("../types.js").Section} Section
 * @typedef {import("../types.js").ContentObject} ContentObject
 * @typedef {import("../types.js").Person} Person
 */

// --- Persona (section) cards -----------------------------------------------
// Shared by the landing page and the Jose Rizal overview page (feature 07),
// which both present the four sections as identical ready, linkable cards.
// Card chrome lives in css/components/home.css.

/** Order the persona sections by the client's canonical sequence — the Jose
 *  Rizal nav dropdown (Hero, Artist, Ethnographer, Scholar) — with any section
 *  not in the dropdown appended after.
 * @param {Site} site @param {Section[]} sections @returns {Section[]} */
export function orderedPersonas(site, sections) {
  const dropdown = site.nav.find((i) => i.children?.length)?.children ?? [];
  const order = dropdown.map((c) => c.href);
  const byRoute = new Map(sections.map((s) => [`/${s.id}/`, s]));
  const ordered = order.map((href) => byRoute.get(href)).filter(Boolean);
  for (const s of sections) if (!order.includes(`/${s.id}/`)) ordered.push(s);
  return ordered;
}

/** One persona section card: portrait media + title, intro, CTA → the section.
 * @param {Site} site @param {Section} section */
export function personaCard(site, section) {
  const media = renderImage({
    site,
    image: section.heroImage,
    className: "persona-card__img",
    sizes: "(min-width: 40rem) 33rem, 100vw",
  });
  return `<li class="persona-card">
  <a class="persona-card__link" href="/${esc(section.id)}/">
    <span class="persona-card__media">${media}</span>
    <div class="persona-card__body">
      <h3 class="persona-card__title">${esc(section.title)}</h3>
      <p class="persona-card__intro">${esc(section.intro)}</p>
      <span class="persona-card__cta">Go to page ${icons.arrow}</span>
    </div>
  </a>
</li>`;
}

// --- View Transitions ------------------------------------------------------

/** Stable per-record View-Transition group name, shared by a section-grid card
 *  and the detail page's hero/portrait so the two morph into each other.
 *  Cross-document VT is progressive enhancement only. Applied via a generated
 *  <style> rule keyed on data-vt (renderVtStyle) — never an inline style, which
 *  html-validate's no-inline-style rule forbids. `prefix` ("obj"/"person")
 *  keeps object and person names in their own space so they never collide.
 * @param {string} prefix @param {string} id */
export function vtName(prefix, id) {
  return `${prefix}-${String(id).replace(/[^a-z0-9-]/g, "-")}`;
}

/** One stylesheet binding each data-vt attribute on a page to its
 *  view-transition-name. Names are unique per record, so they never clash.
 * @param {string[]} names */
export function renderVtStyle(names) {
  const rules = names.map((n) => `[data-vt="${n}"]{view-transition-name:${n}}`).join("");
  return `<style>${rules}</style>`;
}

// --- limited Markdown ------------------------------------------------------
// Descriptions/bios support paragraphs (blank line), **bold**, *italic*, and
// [text](https://link). Everything is HTML-escaped first, so the markup we add
// is the only markup that reaches the page.

/** @param {string} escaped */
function inlineMd(escaped) {
  return escaped
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" rel="external">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*(?!\s)([^*]+?)\*/g, "$1<em>$2</em>");
}

/**
 * Paragraphs + `**bold**`/`*italic*`/links, plus `## Heading` blocks as real,
 * visible `<h2>`s — long essays (feature 11d) have genuine subsections, and
 * rule 10 requires a real heading over a bolded pseudo-heading.
 * @param {string} raw
 */
export function renderMarkdown(raw) {
  return raw
    .split(/\r?\n\r?\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const heading = block.match(/^##\s+(.+)$/);
      return heading
        ? `<h2>${inlineMd(esc(heading[1].trim()))}</h2>`
        : `<p>${inlineMd(esc(block.replace(/\s*\r?\n\s*/g, " ")))}</p>`;
    })
    .join("\n");
}

// --- Breadcrumb ------------------------------------------------------------

/**
 * Home / Jose Rizal / <section> / <leaf>.
 * @param {object} p
 * @param {Site} p.site
 * @param {Section} p.section
 * @param {string} p.leaf - current-page label (rendered aria-current)
 * @param {string} [p.leafLang] - lang attribute for the leaf when non-English
 */
export function renderBreadcrumb({ site, section, leaf, leafLang }) {
  const langAttr = leafLang ? ` lang="${esc(leafLang)}"` : "";
  const crumbs = [
    `<li><a href="${esc(site.basePath)}">Home</a></li>`,
    `<li><a href="/jose-rizal/">Jose Rizal</a></li>`,
    `<li><a href="/${esc(section.id)}/">${esc(section.title)}</a></li>`,
    `<li><span aria-current="page"${langAttr}>${esc(leaf)}</span></li>`,
  ].join("\n");
  return `<nav class="breadcrumb" aria-label="Breadcrumb">
  <ol class="breadcrumb__list">
${crumbs}
  </ol>
</nav>`;
}

// --- Prev/next pager (record-to-record; distinct from in-viewer image nav) --

/**
 * Record-to-record prev/next. Generic over the record type (object / person /
 * essay), so each caller's hrefFor/nameFor see their own concrete record.
 * @template T
 * @param {object} p
 * @param {T} [p.prev]
 * @param {T} [p.next]
 * @param {(item: T) => string} p.hrefFor
 * @param {(item: T) => string} p.nameFor
 * @param {string} [p.nameLang] - lang attribute for the record name
 * @param {string} p.ariaLabel
 */
export function renderPager({ prev, next, hrefFor, nameFor, nameLang, ariaLabel }) {
  if (!prev && !next) return "";
  const langAttr = nameLang ? ` lang="${esc(nameLang)}"` : "";
  /** @param {T | undefined} item @param {string} dir @param {string} label */
  const link = (item, dir, label) =>
    item
      ? `<a class="object-pager__link object-pager__link--${dir}" href="${esc(hrefFor(item))}" rel="${dir}">
    <span class="object-pager__dir">${label}</span>
    <span class="object-pager__name"${langAttr}>${esc(nameFor(item))}</span>
  </a>`
      : "";
  return `<nav class="object-pager" aria-label="${esc(ariaLabel)}">
  ${link(prev, "prev", "Previous")}
  ${link(next, "next", "Next")}
</nav>`;
}

// --- Related / collection cards --------------------------------------------

/**
 * One card in a collection/related grid.
 * @param {object} p
 * @param {string} p.href
 * @param {string} p.media - rendered <img>
 * @param {string} p.title
 * @param {string} [p.titleLang]
 * @param {string} [p.subtitle]
 * @param {boolean} [p.has3d] - shows a "3D" pill beside the title
 */
export function renderCollectionCard({ href, media, title, titleLang, subtitle, has3d }) {
  const langAttr = titleLang ? ` lang="${esc(titleLang)}"` : "";
  const subtitleEl = subtitle ? `\n      <span class="collection-card__en">${esc(subtitle)}</span>` : "";
  const badge = has3d ? `\n      <span class="collection-card__badge">3D</span>` : "";
  return `<li class="collection-card">
  <a class="collection-card__link" href="${esc(href)}">
    <span class="collection-card__media">${media}</span>
    <span class="collection-card__body">
      <span class="collection-card__title-row">
        <span class="collection-card__native"${langAttr}>${esc(title)}</span>${badge}
      </span>${subtitleEl}
    </span>
  </a>
</li>`;
}

/** A "Related objects" / "Related people" row: a labelled heading over the
 *  collection-card grid. Renders nothing when there is nothing to show. Used by
 *  both detail pages so cross-links look identical from either side.
 * @param {object} p
 * @param {string} p.heading
 * @param {string} p.headingId
 * @param {string[]} p.cards - rendered <li> cards
 */
export function renderRelatedRow({ heading, headingId, cards }) {
  if (!cards.length) return "";
  return `<section class="related-row" aria-labelledby="${headingId}">
  <h2 class="related-row__heading" id="${headingId}">${esc(heading)}</h2>
  <ul class="collection-grid">
${cards.join("\n")}
  </ul>
</section>`;
}

/** An object card — used by the object page's "Explore Other Collection" grid
 *  and by the person page's "Related objects" row. Identical markup + morph on
 *  both so the section grid (feature 05) can transition into either.
 * @param {Site} site @param {ContentObject} obj */
export function objectCard(site, obj) {
  const media = renderImage({
    site,
    image: obj.images[0],
    className: "collection-card__img",
    sizes: "(min-width: 48rem) 22rem, 100vw",
    dataVt: vtName("obj", obj.id),
  });
  return renderCollectionCard({
    href: `/${obj.section}/${obj.id}/`,
    media,
    title: obj.title.tl,
    titleLang: "tl",
    subtitle: obj.title.en,
    has3d: Boolean(obj.model3d),
  });
}

/** A person card — used by the person page's "Related people" row (and the
 *  Scholar section grid in feature 05).
 * @param {Site} site @param {Person} person */
export function personCard(site, person) {
  const media = renderImage({
    site,
    image: person.portrait,
    className: "collection-card__img",
    sizes: "(min-width: 48rem) 22rem, 100vw",
    dataVt: vtName("person", person.id),
  });
  return renderCollectionCard({
    href: `/${person.section}/${person.id}/`,
    media,
    title: person.name,
    subtitle: person.role,
  });
}
