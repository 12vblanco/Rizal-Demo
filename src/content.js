// @ts-check
// Content model: loads and validates every flat file in /content.
// Bad content fails the build loudly — each error names the offending
// file and field. HTML is a build artifact; these files are the source
// of truth (spec: "Data").

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const IMAGE_FILE = /^[a-z0-9]+(?:-[a-z0-9]+)*\.(?:avif|jpe?g|png|webp)$/;
const MODEL_FILE = /^[a-z0-9]+(?:-[a-z0-9]+)*\.glb$/;
// Per-model download budget (feature 10): a GLB streams to every visitor who
// opens the 3D view, so the build fails on anything heavier.
const MODEL_MAX_MB = 8;
// `TODO`/`TBD` stay case-sensitive: "todo" is an everyday Spanish word and
// content is i18n-ready (title.es today, full ES/FIL rollout later).
const PLACEHOLDER_PATTERNS = [
  { re: /\blorem\b/i, label: "lorem" },
  { re: /\bTODO\b/, label: "TODO" },
  { re: /\bTBD\b/, label: "TBD" },
  { re: /\bFIXME\b/i, label: "FIXME" },
  { re: /\[open question/i, label: "[OPEN QUESTION]" },
  { re: /\bplaceholder\b/i, label: "placeholder" },
];

class ContentErrors {
  constructor() {
    /** @type {string[]} */
    this.list = [];
  }
  /** @param {string} file @param {string} field @param {string} message */
  add(file, field, message) {
    this.list.push(`${file} → ${field}: ${message}`);
  }
  throwIfAny() {
    if (!this.list.length) return;
    throw new Error(
      `Content validation failed (${this.list.length} error${this.list.length === 1 ? "" : "s"}):\n` +
        this.list.map((e) => `  - ${e}`).join("\n"),
    );
  }
}

// ---------------------------------------------------------------------------
// Field helpers. Each records an error and returns false when invalid.

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim() !== "";
}

function reqString(errors, file, obj, field) {
  if (!isNonEmptyString(obj[field])) {
    errors.add(file, field, "missing or empty (required non-empty string)");
    return false;
  }
  return true;
}

function optString(errors, file, obj, field) {
  if (obj[field] === undefined) return true;
  if (!isNonEmptyString(obj[field])) {
    errors.add(file, field, "present but empty — omit the field or fill it in");
    return false;
  }
  return true;
}

function reqNumber(errors, file, obj, field) {
  if (typeof obj[field] !== "number" || !Number.isFinite(obj[field])) {
    errors.add(file, field, "missing or not a number");
    return false;
  }
  return true;
}

function reqBool(errors, file, obj, field) {
  if (typeof obj[field] !== "boolean") {
    errors.add(file, field, "missing or not a boolean");
    return false;
  }
  return true;
}

function reqArray(errors, file, obj, field) {
  if (!Array.isArray(obj[field])) {
    errors.add(file, field, "missing or not an array");
    return false;
  }
  return true;
}

/** Flag keys the schema doesn't know — catches typo'd field names. */
function checkKeys(errors, file, obj, allowed, context = "") {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      errors.add(file, context ? `${context}.${key}` : key, "unknown field (typo?)");
    }
  }
}

function checkKebab(errors, file, field, value) {
  if (isNonEmptyString(value) && !KEBAB.test(value)) {
    errors.add(file, field, `"${value}" is not kebab-case`);
  }
}

/**
 * Validate an image path like "salakot/front.webp": kebab-case segments,
 * allowed extension, and the file must exist under assets-src/images/.
 */
function checkImagePath(errors, file, field, src, assetsDir) {
  const segments = src.split("/");
  const fileName = segments.pop() ?? "";
  const badDir = segments.some((s) => !KEBAB.test(s));
  if (badDir || !IMAGE_FILE.test(fileName)) {
    errors.add(file, field, `"${src}" is not a kebab-case image path (avif/jpg/png/webp)`);
    return;
  }
  if (!existsSync(path.join(assetsDir, "images", src))) {
    errors.add(file, field, `referenced image "${src}" not found in assets-src/images/`);
  }
}

/** Shared image shape: { src, alt, credit?, deepZoom? }. */
function validateImage(errors, file, field, img, assetsDir) {
  if (typeof img !== "object" || img === null || Array.isArray(img)) {
    errors.add(file, field, "must be an object { src, alt, credit?, deepZoom? }");
    return;
  }
  checkKeys(errors, file, img, ["src", "alt", "credit", "deepZoom"], field);
  if (reqString(errors, file, img, "src") === false) {
    errors.add(file, `${field}.src`, "missing image source");
  } else {
    checkImagePath(errors, file, `${field}.src`, img.src, assetsDir);
  }
  if (!isNonEmptyString(img.alt)) {
    errors.add(file, `${field}.alt`, "missing or empty alt text — every image needs alt from data");
  }
  if (img.credit !== undefined && !isNonEmptyString(img.credit)) {
    errors.add(file, `${field}.credit`, "present but empty — omit the field or fill it in");
  }
  if (img.deepZoom !== undefined && typeof img.deepZoom !== "boolean") {
    errors.add(file, `${field}.deepZoom`, "must be a boolean");
  }
}

// ---------------------------------------------------------------------------
// Per-schema validators.

const OBJECT_KEYS = [
  "id", "section", "category", "order", "title", "objectType", "materials",
  "dimensions", "accession", "description", "condition", "images", "rights",
  "model3d", "related", "featured", "hotspots",
];

function validateObject(errors, file, obj, assetsDir) {
  checkKeys(errors, file, obj, OBJECT_KEYS);
  reqString(errors, file, obj, "id") && checkKebab(errors, file, "id", obj.id);
  reqString(errors, file, obj, "section");
  optString(errors, file, obj, "category") && obj.category !== undefined &&
    checkKebab(errors, file, "category", obj.category);
  reqNumber(errors, file, obj, "order");

  if (typeof obj.title === "object" && obj.title !== null) {
    checkKeys(errors, file, obj.title, ["en", "tl", "es"], "title");
    for (const locale of ["en", "tl", "es"]) reqString(errors, file, obj.title, locale);
  } else {
    errors.add(file, "title", "missing or not a locale-keyed object { en, tl, es }");
  }

  reqString(errors, file, obj, "objectType");
  optString(errors, file, obj, "materials");
  optString(errors, file, obj, "dimensions");
  optString(errors, file, obj, "accession");
  reqString(errors, file, obj, "description");
  optString(errors, file, obj, "condition");
  reqString(errors, file, obj, "rights");
  reqBool(errors, file, obj, "featured");

  if (reqArray(errors, file, obj, "images")) {
    if (obj.images.length === 0) errors.add(file, "images", "must contain at least one image");
    obj.images.forEach((img, i) => validateImage(errors, file, `images[${i}]`, img, assetsDir));
  }

  if (obj.model3d !== undefined) {
    const m = obj.model3d;
    if (typeof m !== "object" || m === null) {
      errors.add(file, "model3d", "must be an object { src, poster, altText }");
    } else {
      checkKeys(errors, file, m, ["src", "poster", "altText", "credit"], "model3d");
      if (reqString(errors, file, m, "src")) {
        const modelPath = path.join(assetsDir, "models", m.src);
        if (!MODEL_FILE.test(m.src)) {
          errors.add(file, "model3d.src", `"${m.src}" is not a kebab-case .glb filename`);
        } else if (!existsSync(modelPath)) {
          errors.add(file, "model3d.src", `referenced model "${m.src}" not found in assets-src/models/`);
        } else {
          // Budget: a GLB streams to every visitor who opens the 3D view, so cap
          // it (spec / feature 10). 8 MB is the documented ceiling.
          const mb = statSync(modelPath).size / (1024 * 1024);
          if (mb > MODEL_MAX_MB) {
            errors.add(
              file,
              "model3d.src",
              `"${m.src}" is ${mb.toFixed(1)} MB — over the ${MODEL_MAX_MB} MB budget; re-optimise it (see scripts/models/README.md)`,
            );
          }
        }
      }
      if (reqString(errors, file, m, "poster")) {
        checkImagePath(errors, file, "model3d.poster", m.poster, assetsDir);
      }
      reqString(errors, file, m, "altText");
      optString(errors, file, m, "credit");
    }
  }

  if (reqArray(errors, file, obj, "related")) {
    obj.related.forEach((id, i) => {
      if (!isNonEmptyString(id)) errors.add(file, `related[${i}]`, "must be an object id string");
    });
  }

  if (obj.hotspots !== undefined) {
    if (!Array.isArray(obj.hotspots)) {
      errors.add(file, "hotspots", "must be an array");
    } else {
      obj.hotspots.forEach((h, i) => {
        if (typeof h !== "object" || h === null || !isNonEmptyString(h.label)) {
          errors.add(file, `hotspots[${i}].label`, "each hotspot needs a non-empty label");
        }
      });
    }
  }
}

const PERSON_KEYS = [
  "id", "section", "order", "name", "role", "lifespan", "portrait", "bio",
  "relatedObjects", "relatedPeople",
];

function validatePerson(errors, file, person, assetsDir) {
  checkKeys(errors, file, person, PERSON_KEYS);
  reqString(errors, file, person, "id") && checkKebab(errors, file, "id", person.id);
  reqString(errors, file, person, "section");
  reqNumber(errors, file, person, "order");
  reqString(errors, file, person, "name");
  reqString(errors, file, person, "role");
  reqString(errors, file, person, "lifespan");
  reqString(errors, file, person, "bio");
  validateImage(errors, file, "portrait", person.portrait, assetsDir);
  for (const field of ["relatedObjects", "relatedPeople"]) {
    if (reqArray(errors, file, person, field)) {
      person[field].forEach((id, i) => {
        if (!isNonEmptyString(id)) errors.add(file, `${field}[${i}]`, "must be an id string");
      });
    }
  }
}

const SECTION_KEYS = ["id", "title", "intro", "heroImage", "categories", "status"];

function validateSection(errors, file, section, assetsDir) {
  checkKeys(errors, file, section, SECTION_KEYS);
  reqString(errors, file, section, "id") && checkKebab(errors, file, "id", section.id);
  reqString(errors, file, section, "title");
  reqString(errors, file, section, "intro");
  validateImage(errors, file, "heroImage", section.heroImage, assetsDir);
  if (section.status !== "live" && section.status !== "upcoming") {
    errors.add(file, "status", `must be "live" or "upcoming", got ${JSON.stringify(section.status)}`);
  }
  if (reqArray(errors, file, section, "categories")) {
    section.categories.forEach((c, i) => {
      if (typeof c !== "object" || c === null) {
        errors.add(file, `categories[${i}]`, "must be an object { id, label }");
        return;
      }
      checkKeys(errors, file, c, ["id", "label"], `categories[${i}]`);
      reqString(errors, file, c, "id") && checkKebab(errors, file, `categories[${i}].id`, c.id);
      reqString(errors, file, c, "label");
    });
  }
}

const SITE_KEYS = [
  "siteTitle", "siteSubtitle", "exhibitionTitle", "exhibitionSubtitle", "homeTitle",
  "baseUrl", "basePath", "language", "description", "heroCtas", "homeQuote",
  "homeTeasers", "nav", "footerNav", "footerCtas",
  "footer", "contact", "partners", "social", "analytics", "copyright",
];

function validateSite(errors, file, site, assetsDir) {
  checkKeys(errors, file, site, SITE_KEYS);
  for (const field of [
    "siteTitle", "siteSubtitle", "exhibitionTitle", "exhibitionSubtitle",
    "homeTitle", "language", "description", "copyright",
  ]) {
    reqString(errors, file, site, field);
  }

  if (reqString(errors, file, site, "baseUrl")) {
    if (!/^https:\/\/[^/]+$/.test(site.baseUrl)) {
      errors.add(file, "baseUrl", `must be "https://<host>" without a trailing slash, got "${site.baseUrl}"`);
    }
  }
  if (reqString(errors, file, site, "basePath")) {
    if (!site.basePath.startsWith("/") || !site.basePath.endsWith("/")) {
      errors.add(file, "basePath", `must start and end with "/", got "${site.basePath}"`);
    }
  }

  // Landing-page slots (all optional — the home template renders each block
  // only when its data is present, so nothing here is invented copy).
  if (site.heroCtas !== undefined && reqArray(errors, file, site, "heroCtas")) {
    site.heroCtas.forEach((item, i) => {
      checkKeys(errors, file, item, ["label", "href", "video"], `heroCtas[${i}]`);
      reqString(errors, file, item, "label");
      optString(errors, file, item, "video");
      // `video` CTAs derive their href from baseUrl + video (see home.js), so
      // href is only required when there's no video to derive it from.
      if (item.video === undefined) reqString(errors, file, item, "href");
      else optString(errors, file, item, "href");
    });
  }
  if (site.homeQuote !== undefined) {
    const q = site.homeQuote;
    if (typeof q !== "object" || q === null || Array.isArray(q)) {
      errors.add(file, "homeQuote", "must be an object { text, attribution, lang? }");
    } else {
      checkKeys(errors, file, q, ["text", "attribution", "lang"], "homeQuote");
      reqString(errors, file, q, "text");
      reqString(errors, file, q, "attribution");
      optString(errors, file, q, "lang");
    }
  }
  if (site.homeTeasers !== undefined && reqArray(errors, file, site, "homeTeasers")) {
    site.homeTeasers.forEach((t, i) => {
      if (typeof t !== "object" || t === null || Array.isArray(t)) {
        errors.add(file, `homeTeasers[${i}]`, "must be an object { heading, href, text?, image? }");
        return;
      }
      checkKeys(errors, file, t, ["heading", "href", "text", "image", "accent"], `homeTeasers[${i}]`);
      reqString(errors, file, t, "heading");
      reqString(errors, file, t, "href");
      optString(errors, file, t, "text");
      optString(errors, file, t, "accent");
      if (t.image !== undefined) validateImage(errors, file, `homeTeasers[${i}].image`, t.image, assetsDir);
    });
  }

  if (reqArray(errors, file, site, "nav")) {
    site.nav.forEach((item, i) => {
      checkKeys(errors, file, item, ["label", "href", "children"], `nav[${i}]`);
      reqString(errors, file, item, "label");
      if (reqString(errors, file, item, "href") && !/^\/([a-z0-9-]+\/)*$/.test(item.href)) {
        errors.add(file, `nav[${i}].href`, `internal routes are kebab-case with trailing slash, got "${item.href}"`);
      }
      (item.children ?? []).forEach((c, j) => {
        checkKeys(errors, file, c, ["label", "href"], `nav[${i}].children[${j}]`);
        reqString(errors, file, c, "label");
        reqString(errors, file, c, "href");
      });
    });
  }

  if (reqArray(errors, file, site, "footerNav")) {
    site.footerNav.forEach((item, i) => {
      checkKeys(errors, file, item, ["label", "href"], `footerNav[${i}]`);
      reqString(errors, file, item, "label");
      if (reqString(errors, file, item, "href") && !/^\/([a-z0-9-]+\/)*$/.test(item.href)) {
        errors.add(file, `footerNav[${i}].href`, `internal routes are kebab-case with trailing slash, got "${item.href}"`);
      }
    });
  }

  // Footer CTA pills — href may be an internal route, mailto:, tel:, or external.
  if (reqArray(errors, file, site, "footerCtas")) {
    site.footerCtas.forEach((item, i) => {
      checkKeys(errors, file, item, ["label", "href"], `footerCtas[${i}]`);
      reqString(errors, file, item, "label");
      reqString(errors, file, item, "href");
    });
  }

  if (typeof site.footer === "object" && site.footer !== null) {
    checkKeys(errors, file, site.footer, ["aboutHeading", "aboutText", "contactHeading"], "footer");
    for (const f of ["aboutHeading", "aboutText", "contactHeading"]) reqString(errors, file, site.footer, f);
  } else {
    errors.add(file, "footer", "missing or not an object");
  }

  if (typeof site.contact === "object" && site.contact !== null) {
    checkKeys(errors, file, site.contact, ["address", "email", "phone"], "contact");
    for (const f of ["address", "email", "phone"]) reqString(errors, file, site.contact, f);
  } else {
    errors.add(file, "contact", "missing or not an object { address, email, phone }");
  }

  if (reqArray(errors, file, site, "partners")) {
    site.partners.forEach((p, i) => {
      checkKeys(errors, file, p, ["name", "logo", "chip", "caption"], `partners[${i}]`);
      reqString(errors, file, p, "name");
      reqString(errors, file, p, "logo");
      if ("chip" in p && typeof p.chip !== "boolean") {
        errors.add(file, `partners[${i}].chip`, "must be a boolean");
      }
      optString(errors, file, p, "caption");
    });
  }
  if (reqArray(errors, file, site, "social")) {
    site.social.forEach((s, i) => {
      checkKeys(errors, file, s, ["name", "href"], `social[${i}]`);
      reqString(errors, file, s, "name");
      reqString(errors, file, s, "href");
    });
  }
  // Analytics slot: keys must exist; empty strings are fine until a provider
  // is confirmed (single snippet max — spec "Monetization").
  if (typeof site.analytics !== "object" || site.analytics === null ||
      typeof site.analytics.provider !== "string" || typeof site.analytics.id !== "string") {
    errors.add(file, "analytics", 'missing slot — expected { "provider": string, "id": string }');
  }
}

const ESSAY_KEYS = ["title", "slug", "section", "summary", "heroImage", "heroCaption", "order", "author", "category"];

function validateEssay(errors, file, essay, assetsDir) {
  const fm = essay.frontmatter;
  checkKeys(errors, file, fm, ESSAY_KEYS);
  reqString(errors, file, fm, "title");
  reqString(errors, file, fm, "slug") && checkKebab(errors, file, "slug", fm.slug);
  reqString(errors, file, fm, "section");
  reqString(errors, file, fm, "summary");
  reqString(errors, file, fm, "author");
  reqNumber(errors, file, fm, "order");
  optString(errors, file, fm, "category");
  optString(errors, file, fm, "heroCaption");
  if (reqString(errors, file, fm, "heroImage")) {
    checkImagePath(errors, file, "heroImage", fm.heroImage, assetsDir);
  }
  if (!isNonEmptyString(essay.body)) {
    errors.add(file, "body", "essay has no body text");
  }
}

// Standalone content pages (content/pages/*.md): the Jose Rizal overview and
// Rizal in Germany. Markdown body + a small frontmatter; `personaCards` opts the
// page into the shared landing persona-card grid (the overview uses it).
const PAGE_KEYS = ["title", "slug", "intro", "heroImage", "bodyHeading", "author", "personaCards"];

function validatePage(errors, file, page, assetsDir) {
  const fm = page.frontmatter;
  checkKeys(errors, file, fm, PAGE_KEYS);
  reqString(errors, file, fm, "title");
  reqString(errors, file, fm, "slug") && checkKebab(errors, file, "slug", fm.slug);
  optString(errors, file, fm, "intro");
  optString(errors, file, fm, "bodyHeading");
  optString(errors, file, fm, "author");
  if (fm.heroImage !== undefined && reqString(errors, file, fm, "heroImage")) {
    checkImagePath(errors, file, "heroImage", fm.heroImage, assetsDir);
  }
  if (fm.personaCards !== undefined && typeof fm.personaCards !== "boolean") {
    errors.add(file, "personaCards", "must be a boolean");
  }
  if (!isNonEmptyString(page.body)) {
    errors.add(file, "body", "page has no body text");
  }
}

// About page (content/about.json): two institution blurbs + the "Messages" video
// grid. Each message is a poster (real image) + name/role; the player is loaded
// on click from `video` — an origin-relative path to the dignitary MP4 already
// hosted at the museum origin (about.js builds the URL from site.baseUrl), so the
// ~155 MB of video is streamed from there rather than re-hosted in the repo.
const ABOUT_KEYS = ["intro", "blurbs", "messagesHeading", "messages"];

function validateAbout(errors, file, about, assetsDir) {
  if (typeof about !== "object" || about === null || Array.isArray(about)) {
    errors.add(file, "(root)", "must be an object { intro, blurbs, messagesHeading, messages }");
    return;
  }
  checkKeys(errors, file, about, ABOUT_KEYS);
  reqString(errors, file, about, "intro");
  reqString(errors, file, about, "messagesHeading");
  if (reqArray(errors, file, about, "blurbs")) {
    about.blurbs.forEach((b, i) => {
      if (typeof b !== "object" || b === null || Array.isArray(b)) {
        errors.add(file, `blurbs[${i}]`, "must be an object { heading, body }");
        return;
      }
      checkKeys(errors, file, b, ["heading", "body"], `blurbs[${i}]`);
      reqString(errors, file, b, "heading");
      reqString(errors, file, b, "body");
    });
  }
  if (reqArray(errors, file, about, "messages")) {
    about.messages.forEach((m, i) => {
      if (typeof m !== "object" || m === null || Array.isArray(m)) {
        errors.add(file, `messages[${i}]`, "must be an object { name, role, poster, video? }");
        return;
      }
      checkKeys(errors, file, m, ["name", "role", "poster", "video"], `messages[${i}]`);
      reqString(errors, file, m, "name");
      reqString(errors, file, m, "role");
      validateImage(errors, file, `messages[${i}].poster`, m.poster, assetsDir);
      if (m.video !== undefined && !isNonEmptyString(m.video)) {
        errors.add(file, `messages[${i}].video`, "present but empty — omit the field or give the origin-relative path to the hosted MP4 (e.g. assets/video/sll.mp4)");
      }
    });
  }
}

function validateRedirects(errors, file, redirects) {
  if (!Array.isArray(redirects)) {
    errors.add(file, "(root)", "must be an array of { from, to }");
    return;
  }
  const seen = new Set();
  redirects.forEach((r, i) => {
    checkKeys(errors, file, r, ["from", "to"], `[${i}]`);
    if (reqString(errors, file, r, "from")) {
      if (r.from.startsWith("/")) {
        errors.add(file, `[${i}].from`, `legacy paths are relative (no leading "/"), got "${r.from}"`);
      }
      if (seen.has(r.from)) {
        errors.add(file, `[${i}].from`, `duplicate redirect source "${r.from}"`);
      }
      seen.add(r.from);
    }
    if (reqString(errors, file, r, "to") && !/^\/([a-z0-9-]+\/)*$/.test(r.to)) {
      errors.add(file, `[${i}].to`, `new URLs are clean kebab-case paths with trailing slash, got "${r.to}"`);
    }
  });
}

// ---------------------------------------------------------------------------
// Placeholder scan: no lorem/TODO/[OPEN QUESTION]/… anywhere in content.

function scanPlaceholders(errors, file, value, fieldPath) {
  if (typeof value === "string") {
    for (const { re, label } of PLACEHOLDER_PATTERNS) {
      if (re.test(value)) {
        errors.add(file, fieldPath || "(root)", `contains placeholder text ("${label}") — committed content must be real`);
      }
    }
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => scanPlaceholders(errors, file, v, `${fieldPath}[${i}]`));
  } else if (typeof value === "object" && value !== null) {
    for (const [k, v] of Object.entries(value)) {
      scanPlaceholders(errors, file, v, fieldPath ? `${fieldPath}.${k}` : k);
    }
  }
}

// ---------------------------------------------------------------------------
// Loading.

/** Minimal YAML frontmatter: `key: value` lines between --- fences. */
function parseFrontmatter(errors, file, raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    errors.add(file, "frontmatter", "missing --- YAML frontmatter block");
    return { frontmatter: {}, body: raw };
  }
  /** @type {Record<string, string | number | boolean>} */
  const frontmatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon === -1) {
      errors.add(file, "frontmatter", `cannot parse line "${line}" — expected "key: value"`);
      continue;
    }
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    if (/^-?\d+(\.\d+)?$/.test(value)) {
      frontmatter[key] = Number(value);
    } else if (value === "true" || value === "false") {
      frontmatter[key] = value === "true";
    } else {
      frontmatter[key] = value;
    }
  }
  return { frontmatter, body: match[2].trim() };
}

/** Read every file with `ext` in contentDir/sub, enforcing kebab filenames. */
function readDir(errors, contentDir, sub, ext) {
  const dir = path.join(contentDir, sub);
  if (!existsSync(dir)) {
    errors.add(`content/${sub}/`, "(directory)", "missing content directory");
    return [];
  }
  const entries = [];
  for (const fileName of readdirSync(dir).sort()) {
    if (!fileName.endsWith(ext)) continue;
    const file = `content/${sub}/${fileName}`;
    const base = fileName.slice(0, -ext.length);
    if (!KEBAB.test(base)) {
      errors.add(file, "(filename)", `"${fileName}" is not kebab-case`);
    }
    entries.push({ file, base, raw: readFileSync(path.join(dir, fileName), "utf8") });
  }
  return entries;
}

function parseJson(errors, file, raw) {
  try {
    return JSON.parse(raw);
  } catch (err) {
    errors.add(file, "(root)", `invalid JSON — ${/** @type {Error} */ (err).message}`);
    return null;
  }
}

/** id/slug must be unique within its collection and match its filename. */
function checkIdentity(errors, entries, idField) {
  const seen = new Map();
  for (const { file, base, data } of entries) {
    const id = data?.[idField];
    if (!isNonEmptyString(id)) continue; // already reported by the schema validator
    if (seen.has(id)) {
      errors.add(file, idField, `duplicate ${idField} "${id}" (also in ${seen.get(id)})`);
    } else {
      seen.set(id, file);
    }
    if (id !== base) {
      errors.add(file, idField, `"${id}" must match its filename "${base}"`);
    }
  }
}

/**
 * Load and validate all content. Throws with the full error list if any
 * rule is broken; returns the parsed content when everything is valid.
 *
 * @param {{ contentDir: string, assetsDir: string }} dirs
 */
export function loadContent({ contentDir, assetsDir }) {
  const errors = new ContentErrors();

  // site.json
  const siteFile = "content/site.json";
  const siteRaw = existsSync(path.join(contentDir, "site.json"))
    ? readFileSync(path.join(contentDir, "site.json"), "utf8")
    : null;
  const site = siteRaw === null ? null : parseJson(errors, siteFile, siteRaw);
  if (site === null) {
    if (siteRaw === null) errors.add(siteFile, "(file)", "missing — the site cannot build without it");
  } else {
    validateSite(errors, siteFile, site, assetsDir);
    scanPlaceholders(errors, siteFile, site, "");
  }

  // Collections.
  const load = (sub, validate) =>
    readDir(errors, contentDir, sub, ".json").map(({ file, base, raw }) => {
      const data = parseJson(errors, file, raw);
      if (data !== null) {
        validate(errors, file, data, assetsDir);
        scanPlaceholders(errors, file, data, "");
      }
      return { file, base, data };
    }).filter((e) => e.data !== null);

  const sections = load("sections", validateSection);
  const objects = load("objects", validateObject);
  const people = load("people", validatePerson);

  const essays = readDir(errors, contentDir, "essays", ".md").map(({ file, base, raw }) => {
    const { frontmatter, body } = parseFrontmatter(errors, file, raw);
    const essay = { file, base, frontmatter, body };
    validateEssay(errors, file, essay, assetsDir);
    scanPlaceholders(errors, file, frontmatter, "");
    scanPlaceholders(errors, file, body, "body");
    return essay;
  });

  // Standalone content pages (Markdown). Route is /<slug>/, slug === filename.
  const pages = readDir(errors, contentDir, "pages", ".md").map(({ file, base, raw }) => {
    const { frontmatter, body } = parseFrontmatter(errors, file, raw);
    const page = { file, base, frontmatter, body };
    validatePage(errors, file, page, assetsDir);
    scanPlaceholders(errors, file, frontmatter, "");
    scanPlaceholders(errors, file, body, "body");
    return page;
  });

  // About page content (single JSON file).
  const aboutFile = "content/about.json";
  let about = null;
  if (!existsSync(path.join(contentDir, "about.json"))) {
    errors.add(aboutFile, "(file)", "missing — the About page needs its content");
  } else {
    const parsed = parseJson(errors, aboutFile, readFileSync(path.join(contentDir, "about.json"), "utf8"));
    if (parsed !== null) {
      validateAbout(errors, aboutFile, parsed, assetsDir);
      scanPlaceholders(errors, aboutFile, parsed, "");
      about = parsed;
    }
  }

  checkIdentity(errors, sections, "id");
  checkIdentity(errors, objects, "id");
  checkIdentity(errors, people, "id");
  checkIdentity(errors, essays.map((e) => ({ file: e.file, base: e.base, data: e.frontmatter })), "slug");
  checkIdentity(errors, pages.map((p) => ({ file: p.file, base: p.base, data: p.frontmatter })), "slug");

  // redirects.json
  const redirectsFile = "content/redirects.json";
  let redirects = [];
  if (!existsSync(path.join(contentDir, "redirects.json"))) {
    errors.add(redirectsFile, "(file)", "missing — legacy URLs need their redirect map");
  } else {
    const parsed = parseJson(errors, redirectsFile, readFileSync(path.join(contentDir, "redirects.json"), "utf8"));
    if (parsed !== null) {
      validateRedirects(errors, redirectsFile, parsed);
      redirects = Array.isArray(parsed) ? parsed : [];
    }
  }

  // Cross-references. Ids are curated by humans and must resolve.
  const sectionsById = new Map(sections.map((s) => [s.data.id, s.data]));
  const objectIds = new Set(objects.map((o) => o.data.id));
  const personIds = new Set(people.map((p) => p.data.id));

  const checkSectionRef = (file, data) => {
    const section = sectionsById.get(data.section);
    if (data.section !== undefined && !section) {
      errors.add(file, "section", `"${data.section}" is not a section in content/sections/`);
    }
    return section;
  };

  for (const { file, data } of objects) {
    const section = checkSectionRef(file, data);
    if (section) {
      const categoryIds = section.categories?.map((c) => c.id) ?? [];
      if (categoryIds.length > 0) {
        if (!data.category) {
          errors.add(file, "category", `required — section "${section.id}" declares categories (${categoryIds.join(", ")})`);
        } else if (!categoryIds.includes(data.category)) {
          errors.add(file, "category", `"${data.category}" is not declared in content/sections/${section.id}.json (${categoryIds.join(", ")})`);
        }
      } else if (data.category) {
        errors.add(file, "category", `section "${section.id}" declares no categories — remove the field`);
      }
    }
    (Array.isArray(data.related) ? data.related : []).forEach((id, i) => {
      if (id === data.id) errors.add(file, `related[${i}]`, "an object cannot relate to itself");
      else if (!objectIds.has(id)) errors.add(file, `related[${i}]`, `"${id}" does not resolve to an object in content/objects/`);
    });
  }

  for (const { file, data } of people) {
    checkSectionRef(file, data);
    (Array.isArray(data.relatedObjects) ? data.relatedObjects : []).forEach((id, i) => {
      if (!objectIds.has(id)) errors.add(file, `relatedObjects[${i}]`, `"${id}" does not resolve to an object in content/objects/`);
    });
    (Array.isArray(data.relatedPeople) ? data.relatedPeople : []).forEach((id, i) => {
      if (id === data.id) errors.add(file, `relatedPeople[${i}]`, "a person cannot relate to themselves");
      else if (!personIds.has(id)) errors.add(file, `relatedPeople[${i}]`, `"${id}" does not resolve to a person in content/people/`);
    });
  }

  for (const { file, frontmatter } of essays) {
    const section = checkSectionRef(file, frontmatter);
    if (section && frontmatter.category !== undefined) {
      const categoryIds = section.categories?.map((c) => c.id) ?? [];
      if (!categoryIds.includes(frontmatter.category)) {
        errors.add(file, "category", `"${frontmatter.category}" is not declared in content/sections/${section.id}.json`);
      }
    }
  }

  errors.throwIfAny();

  return {
    site,
    sections: sections.map((s) => s.data),
    objects: objects.map((o) => o.data),
    people: people.map((p) => p.data),
    essays: essays.map(({ frontmatter, body }) => ({ ...frontmatter, body })),
    pages: pages.map(({ frontmatter, body }) => ({ ...frontmatter, body })),
    about,
    redirects,
  };
}
