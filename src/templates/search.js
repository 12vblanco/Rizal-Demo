// @ts-check
// Search page (/search/): a dark hero band with a real, visible heading over a
// light band that hosts the Pagefind UI mount. The Pagefind assets (index +
// UI JS/CSS, emitted into dist/pagefind/ by the post-build step) are loaded by
// js/main.js only where the #search mount exists, so no other page carries them.
// The whole search UI is data-pagefind-ignore, so the search page never indexes
// itself; a <noscript> keeps the site navigable with JS disabled.

import { esc } from "./layout.js";

/** @typedef {import("../types.js").Site} Site */

// --- SEO slots (full package in feature 12) --------------------------------

/** @param {Site} site */
export function searchTitle(site) {
  const full = `Search | ${site.siteTitle}`;
  return full.length <= 70 ? full : "Search";
}

export function searchDescription() {
  return "Search the José Rizal Digital Exhibition: objects, people, essays, and pages across the collection.";
}

// --- Page ------------------------------------------------------------------

/**
 * The four persona sections, flattened from site.nav, offered as the no-JS
 * fallback so search-with-JS-off still leads somewhere useful.
 * @param {Site} site
 */
function sectionLinks(site) {
  const rizal = site.nav.find((i) => i.children?.length);
  const items = rizal?.children ?? [];
  return items
    .map((c) => `        <li><a href="${esc(c.href)}">${esc(c.label)}</a></li>`)
    .join("\n");
}

/** @param {{ site: Site }} p */
export function renderSearch({ site }) {
  // The whole page is data-pagefind-ignore (both bands), so the search page never
  // appears in its own results (main[data-pagefind-body] would otherwise index it).
  return `<section class="page-hero band band--dark search-hero" data-pagefind-ignore>
  <div class="container page-hero__inner">
    <h1 class="page-hero__title">Search the exhibition</h1>
    <p class="page-hero__intro">Find objects, people, essays, and pages across the José Rizal Digital Exhibition.</p>
  </div>
</section>
<div class="band band--light search-body" data-pagefind-ignore>
  <div class="container container--narrow">
    <div id="search" class="search-ui"></div>
    <noscript>
      <p class="search-noscript">Search needs JavaScript to run. It works entirely in your browser (no data leaves your device), but the script has to load first. You can still browse the exhibition by section:</p>
      <ul class="search-noscript__links">
${sectionLinks(site)}
      </ul>
    </noscript>
  </div>
</div>`;
}
