// @ts-check
// Essay page — one generated page per essay at /essays/<slug>/, rendered from
// the Markdown body + frontmatter. Essays are always real URLs; teasers on the
// section pages (feature 05) link here, never modals (spec). This is the
// minimal reading page (breadcrumb, title, byline, hero, prose, back-link)
// needed so those links resolve; feature 07 owns the richer treatment
// (related content, prev/next essays) alongside the other content pages.

import { esc, seoTitle } from "./layout.js";
import { renderImage } from "./media.js";
import { renderBreadcrumb, renderMarkdown, renderPager } from "./fragments.js";
import { localizeHref, pick, t } from "../i18n.js";

/**
 * @typedef {import("../types.js").Site} Site
 * @typedef {import("../types.js").Section} Section
 * @typedef {import("../types.js").Essay} Essay
 */

// --- SEO slots (full package in feature 12) --------------------------------

/** @param {Essay} essay @param {Site} site */
export function essayTitle(essay, site) {
  return seoTitle(pick(essay.title), pick(site.siteTitle));
}

/** @param {Essay} essay */
export function essayDescription(essay) {
  const plain = pick(essay.summary).replace(/\s+/g, " ").trim();
  if (plain.length <= 155) return plain;
  return plain.slice(0, 152).replace(/\s+\S*$/, "") + "…";
}

/**
 * @param {object} p
 * @param {Site} p.site
 * @param {Essay} p.essay - { title, slug, section, summary, heroImage, heroCaption?, author, body }
 * @param {Section} p.section - the essay's section record (for the breadcrumb + back-link)
 * @param {Essay} [p.prev] - previous essay in the section (by order), for the pager
 * @param {Essay} [p.next] - next essay in the section (by order)
 */
export function renderEssay({ site, essay, section, prev, next }) {
  // The hero illustrates the (adjacent) title, so the image itself is
  // decorative (alt="") — but a figcaption, when authored, is a real caption.
  const hero = essay.heroImage
    ? `<figure class="essay__hero">${renderImage({
        site,
        image: { src: essay.heroImage, alt: "" },
        className: "essay__hero-img",
        loading: "eager",
        fetchpriority: "high",
        sizes: "(min-width: 60rem) 55rem, 100vw",
      })}${essay.heroCaption ? `\n      <figcaption class="essay__hero-caption">${esc(pick(essay.heroCaption))}</figcaption>` : ""}</figure>\n    `
    : "";
  // Prev/next cycles the section's other essays (real URLs), distinct from the
  // "Back to section" link. Renders nothing when the section has one essay.
  const pager = renderPager({
    prev,
    next,
    hrefFor: (e) => `/essays/${e.slug}/`,
    nameFor: (e) => pick(e.title),
    ariaLabel: t("moreEssays"),
  });
  return `<article class="essay band band--light">
  <div class="container container--narrow">
    ${renderBreadcrumb({ site, section, leaf: pick(essay.title) })}
    <header class="essay__header">
      <h1 class="essay__title" data-pagefind-weight="10">${esc(pick(essay.title))}</h1>
      <p class="essay__byline" data-pagefind-weight="4">${esc(t("by", { author: essay.author }))}</p>
    </header>
    ${hero}<div class="essay__body">
${renderMarkdown(pick(essay.body), { site })}
    </div>
    ${pager}
    <p class="essay__back"><a href="${esc(localizeHref(`/${section.id}/`))}">← ${esc(t("backToSection", { title: pick(section.title) }))}</a></p>
  </div>
</article>`;
}
