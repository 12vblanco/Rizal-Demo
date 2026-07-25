// @ts-check
// Internationalisation core (build-time). The site renders one static tree per
// locale — English at the root, Filipino under /fil/, German under /de/ — so
// every page has its own crawlable URL and works with JS disabled (spec rule 5,
// and the spec's "i18n-ready: a future /fil/ prefix must slot in without
// changing these paths"). The build renders one locale at a time in a
// synchronous loop, so an *ambient* current locale (set once per pass) lets
// templates call t()/pick()/localizeHref() without threading a locale argument
// through every render function. There is no concurrency here — it's a single
// synchronous build — so ambient state is safe and keeps the template layer
// almost untouched.

/**
 * @typedef {import("./types.js").LocalizedString} LocalizedString
 * @typedef {import("./types.js").Locale} Locale
 */

/** Ordered locale registry. `en` is the default and lives at the root with no
 *  path prefix. `flag` names an inline SVG in the icon set (src/icons/flag-*.svg)
 *  — SVG, never emoji flags, which don't render on Windows. `hreflang` is the
 *  BCP-47 tag used for <html lang>, <link hreflang>, and the switcher links. */
export const LOCALES = [
  { id: "en", label: "English", short: "EN", hreflang: "en", flag: "flag-en" },
  { id: "fil", label: "Filipino", short: "FIL", hreflang: "fil", flag: "flag-fil" },
  { id: "de", label: "Deutsch", short: "DE", hreflang: "de", flag: "flag-de" },
];

export const DEFAULT_LOCALE = "en";
const LOCALE_IDS = new Set(LOCALES.map((l) => l.id));

// --- ambient render state (set by build.js, one locale at a time) -----------

let _locale = DEFAULT_LOCALE;
let _basePath = "/";
/** @type {Record<string, Record<string, string>>} */
let _catalogs = { en: {} };

/** Store the site's basePath so href localisation is anchored correctly.
 * @param {{ basePath?: string }} site */
export function setSiteConfig(site) {
  _basePath = site.basePath || "/";
}

/** Install the loaded UI message catalogs (keyed by locale id).
 * @param {Record<string, Record<string, string>>} catalogs */
export function setCatalogs(catalogs) {
  _catalogs = catalogs;
}

/** Switch the ambient locale for the pass about to render.
 * @param {string} locale */
export function setLocale(locale) {
  _locale = LOCALE_IDS.has(locale) ? locale : DEFAULT_LOCALE;
}

export function getLocale() {
  return _locale;
}

/** Path segment for a locale, relative to basePath: "" (en) | "fil/" | "de/". */
export function localePrefix(locale) {
  return locale === DEFAULT_LOCALE ? "" : `${locale}/`;
}

/** The basePath for a locale, e.g. "/" (en) | "/fil/" | "/de/". */
export function localeBasePath(locale) {
  return _basePath + localePrefix(locale);
}

/**
 * Prefix an internal page route with a *specific* locale — used by the switcher
 * and hreflang, which enumerate every locale. External (`http…`), `mailto:`,
 * `tel:`, and `#anchor` links pass through untouched. Asset URLs are never
 * passed here: media.js builds those straight off basePath, so they stay shared
 * at the root across all locales.
 * @param {string} href @param {string} locale
 */
export function hrefForLocale(href, locale) {
  if (!href || !href.startsWith("/")) return href;
  const rest = href.startsWith(_basePath)
    ? href.slice(_basePath.length)
    : href.replace(/^\//, "");
  return _basePath + localePrefix(locale) + rest;
}

/** Localise an internal page route to the *current* ambient locale.
 * @param {string} href */
export function localizeHref(href) {
  return hrefForLocale(href, _locale);
}

/**
 * Read a possibly locale-keyed value for the current locale, falling back to
 * English. Plain strings pass straight through, so un-migrated content still
 * renders during the progressive-translation rollout (spec: fallback, never a
 * broken build).
 * @param {LocalizedString | undefined | null} value
 * @returns {string}
 */
export function pick(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return value[_locale] ?? value.en ?? "";
}

/**
 * Translate a UI micro-copy key for the current locale, falling back to English.
 * `{token}` placeholders are replaced from `params`. Throws if the key is absent
 * from en.json — that's a typo/missing-string bug we want the build to catch.
 * @param {string} key @param {Record<string, string | number>} [params]
 */
export function t(key, params) {
  const table = _catalogs[_locale] ?? {};
  const en = _catalogs.en ?? {};
  let str = table[key] ?? en[key];
  if (str === undefined) {
    throw new Error(`i18n: missing catalog key "${key}" (not defined in en.json)`);
  }
  if (params) {
    str = str.replace(/\{(\w+)\}/g, (m, name) =>
      name in params ? String(params[name]) : m,
    );
  }
  return str;
}

/**
 * hreflang alternates for a locale-independent page path: one entry per locale
 * plus `x-default` → English. Absolute URLs off baseUrl (rule 7, no hardcoded
 * domain).
 * @param {string} baseUrl @param {string} path
 * @returns {{ hreflang: string, href: string }[]}
 */
export function alternates(baseUrl, path) {
  const origin = baseUrl.replace(/\/$/, "");
  const list = LOCALES.map((l) => ({
    hreflang: l.hreflang,
    href: origin + hrefForLocale(path, l.id),
  }));
  list.push({ hreflang: "x-default", href: origin + hrefForLocale(path, DEFAULT_LOCALE) });
  return list;
}
