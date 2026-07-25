// @ts-check
// Base page layout: <head> with per-page metadata, skip link, header nav,
// main content slot, and footer. Every generated page goes through this.

import { icons } from "../icons.js";
import {
  LOCALES,
  alternates,
  getLocale,
  hrefForLocale,
  localizeHref,
  pick,
  t,
} from "../i18n.js";

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

/**
 * Language switcher — flag-only, right of the search icon. Shows the *other*
 * locales (the active one is omitted): from English it offers Filipino + German,
 * and so on. Each is a real <a> to the same page in that locale — pure HTML/CSS,
 * so it works with JS disabled and is crawlable (spec rule 5). The flag SVG is
 * decorative (aria-hidden); the language name in a .visually-hidden span is the
 * link's accessible name, so a flag is never the only cue for assistive tech
 * (rule 10). hreflang/lang mark each link's target language.
 * @param {string} currentPath - locale-independent page path
 */
function renderLangSwitch(currentPath) {
  const active = getLocale();
  const items = LOCALES.filter((l) => l.id !== active)
    .map((l) => {
      const flag = `<span class="lang-switch__flag" aria-hidden="true">${icons[l.flag] ?? ""}</span>`;
      return `      <li class="lang-switch__item"><a class="lang-switch__link" href="${esc(hrefForLocale(currentPath, l.id))}" hreflang="${esc(l.hreflang)}" lang="${esc(l.hreflang)}">${flag}<span class="visually-hidden">${esc(l.label)}</span></a></li>`;
    })
    .join("\n");
  return `<nav class="lang-switch" aria-label="${esc(t("language"))}">
    <ul class="lang-switch__list">
${items}
    </ul>
  </nav>`;
}

/** @param {Site} site @param {string} currentPath */
function renderNav(site, currentPath) {
  const items = site.nav
    .map((item) => {
      const current = item.href === currentPath ? ' aria-current="page"' : "";
      const label = pick(item.label);
      if (item.children?.length) {
        // A real disclosure button (not hover-only): keyboard-operable and
        // announced with aria-expanded. The parent stays a link to its overview
        // page; the button beside it opens the submenu. js/main.js drives it and
        // the mobile menu; on desktop CSS also reveals on hover/focus.
        const submenuId = `nav-submenu-${item.href.replace(/\//g, "") || "root"}`;
        const children = item.children
          .map((c) => {
            const cCurrent = c.href === currentPath ? ' aria-current="page"' : "";
            return `<li><a href="${esc(localizeHref(c.href))}"${cCurrent}>${esc(pick(c.label))}</a></li>`;
          })
          .join("\n");
        return `<li class="nav-item nav-item--dropdown">
  <a href="${esc(localizeHref(item.href))}"${current}>${esc(label)}</a>
  <button class="nav-dropdown__toggle" type="button" aria-expanded="false" aria-controls="${submenuId}">
    <span class="visually-hidden">${esc(t("navShowSections", { label }))}</span>
    <span class="nav-dropdown__chevron" aria-hidden="true">${icons["chevron-down"]}</span>
  </button>
  <ul class="nav-dropdown" id="${submenuId}">
${children}
  </ul>
</li>`;
      }
      return `<li class="nav-item"><a href="${esc(localizeHref(item.href))}"${current}>${esc(label)}</a></li>`;
    })
    .join("\n");

  // Search control: a real link to /search/, so it works with JS disabled (the
  // search page hosts the Pagefind UI). With JS, js/main.js intercepts the click
  // and drops the search panel below the icon instead (disclosure). The icon is
  // decorative; .visually-hidden supplies its accessible name — the one
  // sanctioned use (rule 10). The panel (a labelled region with a close button
  // and the Pagefind mount) sits in a relatively-positioned wrapper so it drops
  // straight down from the icon without touching the mobile menu's positioning.
  const searchRoute = `${site.basePath}search/`;
  const searchHref = localizeHref(searchRoute);
  const searchCurrent = searchRoute === currentPath ? ' aria-current="page"' : "";

  return `<nav class="site-nav" aria-label="${esc(t("mainNav"))}">
  <button class="site-nav__toggle" type="button" aria-expanded="false" aria-controls="site-nav-list">
    <span class="visually-hidden">${esc(t("menu"))}</span>
    <span class="site-nav__toggle-icon" aria-hidden="true">${icons.menu}${icons.close}</span>
  </button>
  <ul class="site-nav__list" id="site-nav-list">
${items}
  </ul>
  <div class="site-search-wrap">
    <a class="site-nav__search" href="${esc(searchHref)}"${searchCurrent}>
      <span class="nav-icon-wrap" aria-hidden="true">${icons.search}</span>
      <span class="visually-hidden">${esc(t("search"))}</span>
    </a>
    <section class="site-search" id="site-search" aria-labelledby="site-search-title" hidden>
      <div class="site-search__head">
        <h2 class="site-search__title" id="site-search-title">${esc(t("search"))}</h2>
        <button class="site-search__close" type="button">
          <span class="nav-icon-wrap" aria-hidden="true">${icons.close}</span>
          <span class="visually-hidden">${esc(t("closeSearch"))}</span>
        </button>
      </div>
      <div id="site-search-ui" class="search-ui"></div>
    </section>
  </div>
  ${renderLangSwitch(currentPath)}
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
  // collaborator seals in the grid below it (chip: white backing to read on
  // dark; caption: a visible name line under seals whose art alone doesn't
  // spell out who they are — the image alt is then emptied so the name isn't
  // announced twice).
  const [brand, ...seals] = partners ?? [];
  const brandImg = brand
    ? `<img class="footer-panel__logo" src="${esc(basePath + brand.logo)}" alt="${esc(brand.name)}" loading="lazy" decoding="async">`
    : "";
  const sealItems = seals
    .map((p) => {
      const alt = p.caption ? "" : esc(p.name);
      const img = `<img src="${esc(basePath + p.logo)}" alt="${alt}" loading="lazy" decoding="async">`;
      if (p.caption) {
        return `<li class="footer-seal--captioned">${img}<span class="footer-seal__caption">${esc(p.caption)}</span></li>`;
      }
      return `<li${p.chip ? ' class="footer-seal--chip"' : ""}>${img}</li>`;
    })
    .join("\n");
  const navItems = (footerNav ?? [])
    .map((i) => `<li><a href="${esc(localizeHref(i.href))}">${esc(pick(i.label))}</a></li>`)
    .join("\n");
  const ctaItems = (footerCtas ?? [])
    .map(
      (c) =>
        `<li><a class="footer-pill" href="${esc(localizeHref(c.href))}">${esc(pick(c.label))} ${icons.arrow}</a></li>`,
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
      <nav class="footer-nav" aria-label="${esc(t("exhibitionSections"))}">
        <ul class="footer-nav__list">
${navItems}
        </ul>
      </nav>
      <hr class="footer-rule">
      <div class="footer-grid">
        <section class="footer-about" aria-labelledby="footer-about">
          <h2 class="footer-heading" id="footer-about"><a href="${esc(localizeHref("/about/"))}">${esc(pick(footer.aboutHeading))} </a></h2>
          <p>${esc(pick(footer.aboutText))}</p>
          <p class="footer-exhibition">
            <span class="footer-exhibition__title">${esc(pick(site.exhibitionTitle))}</span>
            <span class="footer-exhibition__sub">${esc(pick(site.exhibitionSubtitle))}</span>
            
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
            <span class="footer-contact__label">${esc(pick(footer.contactHeading))}</span>
            <a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a>
            <a href="tel:${esc(telHref)}">${esc(phoneDisplay)}</a>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div class="site-footer__bar">
    <p class="site-footer__copyright">${esc(pick(copyright))}</p>
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
  const locale = getLocale();
  const origin = site.baseUrl.replace(/\/$/, "");
  // Canonical is this page in *this* locale; the alternates advertise the same
  // page in every locale (plus x-default → English) so search engines pair them
  // (spec SEO package). `path` is locale-independent — the prefix is applied here.
  const canonical = origin + hrefForLocale(path, locale);
  const altLinks = alternates(site.baseUrl, path)
    .map((a) => `  <link rel="alternate" hreflang="${esc(a.hreflang)}" href="${esc(a.href)}">`)
    .join("\n");
  const reload = isDev
    ? `\n<script>new EventSource("/__reload").onmessage = () => location.reload();</script>`
    : "";

  return `<!DOCTYPE html>
<html lang="${esc(locale)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${esc(canonical)}">
${altLinks}
  <link rel="stylesheet" href="${esc(assets.css)}">
  <script type="module" src="${esc(assets.js)}" defer></script>
</head>
<body>
  <a class="skip-link" href="#main">${esc(t("skipToContent"))}</a>
  <header class="site-header band band--dark" data-pagefind-ignore>
    <div class="container site-header__inner">
      <a class="site-header__brand" href="${esc(localizeHref(site.basePath))}">
        ${icons["museum-mark"]}
        <span class="site-header__brand-text">
          <span class="site-header__brand-title">${esc(pick(site.exhibitionTitle))}</span>
          <span class="site-header__brand-subtitle">${esc(pick(site.exhibitionSubtitle))}</span>
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
