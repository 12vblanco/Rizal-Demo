// @ts-check
// Base page layout: <head> with per-page metadata, skip link, header nav,
// main content slot, and footer. Every generated page goes through this.

import { icons } from "../icons.js";

/**
 * @typedef {import("../types.js").Site} Site
 * @typedef {import("../types.js").Social} Social
 */

/**
 * Escape text for safe interpolation into HTML.
 * @param {unknown} text
 */
export function esc(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** @param {Site} site @param {string} currentPath */
function renderNav(site, currentPath) {
  const items = site.nav
    .map((item) => {
      const current = item.href === currentPath ? ' aria-current="page"' : "";
      if (item.children?.length) {
        // A real disclosure button (not hover-only): keyboard-operable and
        // announced with aria-expanded. The parent stays a link to its overview
        // page; the button beside it opens the submenu. js/main.js drives it and
        // the mobile menu; on desktop CSS also reveals on hover/focus.
        const submenuId = `nav-submenu-${item.href.replace(/\//g, "") || "root"}`;
        const children = item.children
          .map((c) => {
            const cCurrent = c.href === currentPath ? ' aria-current="page"' : "";
            return `<li><a href="${esc(c.href)}"${cCurrent}>${esc(c.label)}</a></li>`;
          })
          .join("\n");
        return `<li class="nav-item nav-item--dropdown">
  <a href="${esc(item.href)}"${current}>${esc(item.label)}</a>
  <button class="nav-dropdown__toggle" type="button" aria-expanded="false" aria-controls="${submenuId}">
    <span class="visually-hidden">Show ${esc(item.label)} sections</span>
    <span class="nav-dropdown__chevron" aria-hidden="true">${icons["chevron-down"]}</span>
  </button>
  <ul class="nav-dropdown" id="${submenuId}">
${children}
  </ul>
</li>`;
      }
      return `<li class="nav-item"><a href="${esc(item.href)}"${current}>${esc(item.label)}</a></li>`;
    })
    .join("\n");

  // Search control: a real link to /search/, so it works with JS disabled (the
  // search page hosts the Pagefind UI). With JS, js/main.js intercepts the click
  // and drops the search panel below the icon instead (disclosure). The icon is
  // decorative; .visually-hidden supplies its accessible name — the one
  // sanctioned use (rule 10). The panel (a labelled region with a close button
  // and the Pagefind mount) sits in a relatively-positioned wrapper so it drops
  // straight down from the icon without touching the mobile menu's positioning.
  const searchHref = `${site.basePath}search/`;
  const searchCurrent = searchHref === currentPath ? ' aria-current="page"' : "";

  return `<nav class="site-nav" aria-label="Main">
  <button class="site-nav__toggle" type="button" aria-expanded="false" aria-controls="site-nav-list">
    <span class="visually-hidden">Menu</span>
    <span class="site-nav__toggle-icon" aria-hidden="true">${icons.menu}${icons.close}</span>
  </button>
  <ul class="site-nav__list" id="site-nav-list">
${items}
  </ul>
  <div class="site-search-wrap">
    <a class="site-nav__search" href="${esc(searchHref)}"${searchCurrent}>
      <span class="nav-icon-wrap" aria-hidden="true">${icons.search}</span>
      <span class="visually-hidden">Search</span>
    </a>
    <section class="site-search" id="site-search" aria-labelledby="site-search-title" hidden>
      <div class="site-search__head">
        <h2 class="site-search__title" id="site-search-title">Search</h2>
        <button class="site-search__close" type="button">
          <span class="nav-icon-wrap" aria-hidden="true">${icons.close}</span>
          <span class="visually-hidden">Close search</span>
        </button>
      </div>
      <div id="site-search-ui" class="search-ui"></div>
    </section>
  </div>
</nav>`;
}

/** @param {Social} s */
function socialLink(s) {
  const svg = icons[String(s.name).toLowerCase()];
  return `<li><a class="footer-social__link" href="${esc(s.href)}" rel="external" aria-label="${esc(s.name)}">${svg || esc(s.name)}</a></li>`;
}

/** @param {Site} site */
function renderFooter(site) {
  const {
    footer,
    contact,
    partners,
    footerNav,
    footerCtas,
    social,
    copyright,
    basePath,
  } = site;

  // partners[0] is the host (NMP) — the panel's brand lockup; the rest are the
  // collaborator seals in the grid below it (chip: white backing to read on dark).
  const [brand, ...seals] = partners ?? [];
  const brandImg = brand
    ? `<img class="footer-panel__logo" src="${esc(basePath + brand.logo)}" alt="${esc(brand.name)}" loading="lazy" decoding="async">`
    : "";
  const sealItems = seals
    .map(
      (p) =>
        `<li${p.chip ? ' class="footer-seal--chip"' : ""}><img src="${esc(basePath + p.logo)}" alt="${esc(p.name)}" loading="lazy" decoding="async"></li>`,
    )
    .join("\n");
  const navItems = (footerNav ?? [])
    .map((i) => `<li><a href="${esc(i.href)}">${esc(i.label)}</a></li>`)
    .join("\n");
  const ctaItems = (footerCtas ?? [])
    .map(
      (c) =>
        `<li><a class="footer-pill" href="${esc(c.href)}">${esc(c.label)} ${icons.arrow}</a></li>`,
    )
    .join("\n");
  const socialItems = (social ?? []).map(socialLink).join("\n");

  const telHref = contact.phone.replace(/[^\d+]/g, "");
  // Non-breaking space + hyphen so the number never wraps mid-digit
  // (html-validate's tel-non-breaking rule).
  const phoneDisplay = contact.phone.replace(/ /g, " ").replace(/-/g, "‑");

  return `<footer class="site-footer band band--dark" data-pagefind-ignore>
  <div class="footer-top">
    <aside class="footer-panel">
      ${brandImg}
      <ul class="footer-panel__seals">
${sealItems}
      </ul>
    </aside>
    <div class="footer-body">
      <nav class="footer-nav" aria-label="Exhibition sections">
        <ul class="footer-nav__list">
${navItems}
        </ul>
      </nav>
      <hr class="footer-rule">
      <div class="footer-grid">
        <section class="footer-about" aria-labelledby="footer-about">
          <h2 class="footer-heading" id="footer-about"><a href="/about/">${esc(footer.aboutHeading)} </a></h2>
          <p>${esc(footer.aboutText)}</p>
          <p class="footer-exhibition">
            <span class="footer-exhibition__title">${esc(site.exhibitionTitle)}</span>
            <span class="footer-exhibition__sub">${esc(site.exhibitionSubtitle)}</span>
            
          </p>
                <p class="footer-panel__address">${icons.pin}<span>${esc(contact.address)}</span></p>

        </section>
        <div class="footer-side">
          <ul class="footer-ctas">
${ctaItems}
          </ul>
          <ul class="footer-social">
${socialItems}
          </ul>
          <div class="footer-contact">
            <span class="footer-contact__label">${esc(footer.contactHeading)}</span>
            <a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a>
            <a href="tel:${esc(telHref)}">${esc(phoneDisplay)}</a>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div class="site-footer__bar">
    <p class="site-footer__copyright">${esc(copyright)}</p>
  </div>
</footer>`;
}

/**
 * Render a complete HTML page.
 * @param {object} p
 * @param {Site} p.site - parsed content/site.json
 * @param {{css: string, js: string}} p.assets - hashed asset URLs
 * @param {string} p.path - page path ("/", "/ethnographer/", …)
 * @param {string} p.title - unique per page
 * @param {string} p.description - unique per page
 * @param {string} p.content - rendered <main> content
 * @param {boolean} [p.isDev] - inject live-reload client when true
 */
export function renderPage({
  site,
  assets,
  path,
  title,
  description,
  content,
  isDev = false,
}) {
  const canonical = site.baseUrl.replace(/\/$/, "") + path;
  const reload = isDev
    ? `\n<script>new EventSource("/__reload").onmessage = () => location.reload();</script>`
    : "";

  return `<!DOCTYPE html>
<html lang="${esc(site.language)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${esc(canonical)}">
  <link rel="stylesheet" href="${esc(assets.css)}">
  <script type="module" src="${esc(assets.js)}" defer></script>
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header band band--dark" data-pagefind-ignore>
    <div class="container site-header__inner">
      <a class="site-header__brand" href="${esc(site.basePath)}">
        ${icons["museum-mark"]}
        <span class="site-header__brand-text">
          <span class="site-header__brand-title">${esc(site.exhibitionTitle)}</span>
          <span class="site-header__brand-subtitle">${esc(site.exhibitionSubtitle)}</span>
        </span>
      </a>
      ${renderNav(site, path)}
    </div>
  </header>
  <main id="main" data-pagefind-body>
${content}
  </main>
  ${renderFooter(site)}${reload}
</body>
</html>
`;
}
