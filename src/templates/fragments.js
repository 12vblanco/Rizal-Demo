// @ts-check
// Shared detail-page fragments. Feature 04 extracted these out of object.js so
// the object and person templates render one copy of the breadcrumb, prev/next
// pager, related-cards, limited-Markdown, and cross-document View-Transition
// plumbing instead of duplicating it. The single image helper stays media.js.

import { esc } from "./layout.js";
import { renderImage } from "./media.js";
import { icons } from "../icons.js";
import { localizeHref, pick, t } from "../i18n.js";

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
  <a class="persona-card__link" href="${esc(localizeHref(`/${section.id}/`))}">
    <span class="persona-card__media">${media}</span>
    <div class="persona-card__body">
      <h3 class="persona-card__title">${esc(pick(section.title))}</h3>
      <p class="persona-card__intro">${esc(pick(section.intro))}</p>
      <span class="persona-card__cta">${esc(t("personaCta"))} ${icons.arrow}</span>
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

/** One in-body figure: a pipeline `<picture>` plus, when authored, a real
 *  caption. Lazy-loaded by design — these sit below the fold, under the hero.
 * @param {Site} site @param {string} alt @param {string} src @param {string} [caption] */
function renderProseFigure(site, alt, src, caption) {
  const img = renderImage({
    site,
    image: { src, alt },
    className: "prose-figure__img",
    sizes: "(min-width: 60rem) 55rem, 100vw",
  });
  const cap = caption
    ? `\n  <figcaption class="prose-figure__caption">${inlineMd(esc(caption))}</figcaption>`
    : "";
  return `<figure class="prose-figure">${img}${cap}\n</figure>`;
}

/**
 * Paragraphs + `**bold**`/`*italic*`/links, plus `## Heading` blocks as real,
 * visible `<h2>`s — long essays (feature 11d) have genuine subsections, and
 * rule 10 requires a real heading over a bolded pseudo-heading.
 *
 * A block that is nothing but a Markdown image — `![alt](src "caption")` —
 * becomes a real `<figure>` through the pipeline helper, so editorial whose
 * argument depends on pictures (the Artist essay's two plates, the Hero essay's
 * shrines) keeps them inline instead of losing them to the single hero slot.
 * That needs `site` for basePath, so callers rendering figure-bearing prose
 * pass it; without it the image syntax stays inert text rather than silently
 * half-rendering.
 * @param {string} raw @param {{ site?: Site }} [opts]
 */
export function renderMarkdown(raw, { site } = {}) {
  return raw
    .split(/\r?\n\r?\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const heading = block.match(/^##\s+(.+)$/);
      if (heading) return `<h2>${inlineMd(esc(heading[1].trim()))}</h2>`;
      const figure = site && block.match(/^!\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)$/);
      if (figure) return renderProseFigure(site, figure[1], figure[2], figure[3]);
      return `<p>${inlineMd(esc(block.replace(/\s*\r?\n\s*/g, " ")))}</p>`;
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
    `<li><a href="${esc(localizeHref(site.basePath))}">${esc(t("home"))}</a></li>`,
    `<li><a href="${esc(localizeHref("/jose-rizal/"))}">${esc(t("joseRizal"))}</a></li>`,
    `<li><a href="${esc(localizeHref(`/${section.id}/`))}">${esc(pick(section.title))}</a></li>`,
    `<li><span aria-current="page"${langAttr}>${esc(leaf)}</span></li>`,
  ].join("\n");
  return `<nav class="breadcrumb" aria-label="${esc(t("breadcrumb"))}">
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
      ? `<a class="object-pager__link object-pager__link--${dir}" href="${esc(localizeHref(hrefFor(item)))}" rel="${dir}">
    <span class="object-pager__dir">${esc(label)}</span>
    <span class="object-pager__name"${langAttr}>${esc(nameFor(item))}</span>
  </a>`
      : "";
  return `<nav class="object-pager" aria-label="${esc(ariaLabel)}">
  ${link(prev, "prev", t("previous"))}
  ${link(next, "next", t("next"))}
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
 * @param {string} [p.subtitleLang]
 * @param {boolean} [p.has3d] - shows a "3D" pill beside the title
 */
export function renderCollectionCard({ href, media, title, titleLang, subtitle, subtitleLang, has3d }) {
  const langAttr = titleLang ? ` lang="${esc(titleLang)}"` : "";
  const subLangAttr = subtitleLang ? ` lang="${esc(subtitleLang)}"` : "";
  // Always emitted, even with nothing to say: the empty span reserves one line
  // (see .collection-card__en:empty in object.css) so a grid of cards that
  // carry a second name and a grid of cards that do not come out the same
  // height. Without it the artist grid sits ~30px shorter than the
  // ethnographer one.
  const subtitleEl = `\n      <span class="collection-card__en"${subLangAttr}>${subtitle ? esc(subtitle) : ""}</span>`;
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
  // Object names stay in their original form on every locale (curatorial
  // metadata) — never routed through pick().
  //
  // Which name leads depends on what `tl` means for the record. For an
  // ethnographer object it is the thing's own name (salakot, tangkulu) and the
  // English is a gloss, so the vernacular leads. For an artist work it is a
  // translation of the work's English title, so English leads there — matching
  // how the artist detail pages read.
  const vernacular = obj.title.tl;
  const vernacularLeads = Boolean(vernacular) && obj.section !== "artist";
  return renderCollectionCard({
    href: localizeHref(`/${obj.section}/${obj.id}/`),
    media,
    title: vernacularLeads ? vernacular : obj.title.en,
    titleLang: vernacularLeads ? "tl" : undefined,
    // An ethnographer card's second line is a short English gloss of the
    // vernacular name and earns its place. An artist card's would be the
    // work's full vernacular title, which runs three or four lines at this
    // width and cannot be cut to one without stranding a word ("Ang…"), so the
    // card shows the English title alone and the detail page carries the rest.
    subtitle: vernacularLeads ? obj.title.en : "",
    subtitleLang: undefined,
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
    href: localizeHref(`/${person.section}/${person.id}/`),
    media,
    title: person.name,
    subtitle: pick(person.role),
  });
}
