// @ts-check
// Custom 404, emitted as /404.html — serve.js (and the CDN in feature 15) return
// it for unknown paths. A short dark band with clear escape routes back into the
// IA: the Jose Rizal overview + its four sections + the top-level pages, all
// derived from site.nav so the list never drifts from the real navigation.

import { esc } from "./layout.js";
import { icons } from "../icons.js";

/** @typedef {import("../types.js").Site} Site */

/**
 * The nav flattened to real destinations worth offering after a wrong turn.
 * @param {Site} site
 */
function escapeRoutes(site) {
  const routes = [];
  for (const item of site.nav) {
    if (item.href !== "/") routes.push({ label: item.label, href: item.href });
    for (const child of item.children ?? []) {
      routes.push({ label: child.label, href: child.href });
    }
  }
  return routes;
}

/** @param {{ site: Site }} p */
export function render404({ site }) {
  const links = escapeRoutes(site)
    .map((r) => `      <li><a class="notfound__link" href="${esc(r.href)}">${esc(r.label)} ${icons.arrow}</a></li>`)
    .join("\n");
  return `<section class="notfound band band--dark" data-pagefind-ignore>
  <div class="container notfound__inner">
    <p class="notfound__code">404</p>
    <h1 class="notfound__title">This page could not be found</h1>
    <p class="notfound__text">The page you were looking for may have moved, or the link may be out of date. Try one of these instead:</p>
    <ul class="notfound__links">
${links}
    </ul>
    <p class="notfound__home"><a href="${esc(site.basePath)}">Return to the exhibition home</a></p>
  </div>
</section>`;
}
