// @ts-check
// Designed "upcoming" state for routes whose real template hasn't landed yet
// (spec: missing content renders a designed coming-soon state, never
// placeholder text). Section/content page features (03–07) replace these.

import { esc } from "./layout.js";

/** @typedef {import("../types.js").Site} Site */

/** @param {{title: string, site: Site}} p */
export function renderUpcoming({ title, site }) {
  return `<section class="band band--dark hero">
  <div class="container">
    <p class="upcoming-badge">Upcoming</p>
    <h1>${esc(title)}</h1>
    <p class="hero__intro">This part of the exhibition is in preparation.</p>
    <p><a href="${esc(site.basePath)}">Return to the exhibition home</a></p>
  </div>
</section>`;
}
