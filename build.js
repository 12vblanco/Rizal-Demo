// @ts-check
// Build script for the Rizal Digital Exhibition static site.
// Reads flat-file content from /content, renders pages from the JS templates
// in /src/templates, bundles + hashes CSS/JS, and writes everything to /dist.
// /dist is disposable output — never edit it by hand.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadContent } from "./src/content.js";
import { lintDistImages, lqipCss, processDeepZoom, processImages } from "./src/images.js";
import { setDeepZoomManifest, setImageManifest } from "./src/templates/media.js";
import { renderPage } from "./src/templates/layout.js";
import { renderHome } from "./src/templates/home.js";
import { renderUpcoming } from "./src/templates/upcoming.js";
import { objectDescription, objectTitle, renderObject } from "./src/templates/object.js";
import { personDescription, personTitle, renderPerson } from "./src/templates/person.js";
import { renderSection, sectionDescription, sectionTitle } from "./src/templates/section.js";
import { essayDescription, essayTitle, renderEssay } from "./src/templates/essay.js";
import { pageDescription, pageTitle, renderContentPage } from "./src/templates/page.js";
import { aboutDescription, aboutTitle, renderAbout } from "./src/templates/about.js";
import { render404 } from "./src/templates/notfound.js";
import { renderSearch, searchDescription, searchTitle } from "./src/templates/search.js";

/**
 * @typedef {import("./src/types.js").SiteContent} SiteContent
 * @typedef {import("./src/types.js").Section} Section
 * @typedef {import("./src/types.js").ContentObject} ContentObject
 * @typedef {import("./src/types.js").Person} Person
 * @typedef {import("./src/types.js").Essay} Essay
 */

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, "dist");
const isDev = process.env.DEV === "1";

// Ordered CSS bundle: tokens first, then base, layout, components.
const CSS_ORDER = ["css/tokens.css", "css/base.css", "css/layout.css"];

/** @param {string} content */
function hash(content) {
  return createHash("md5").update(content).digest("hex").slice(0, 8);
}

function bundleCss() {
  const parts = CSS_ORDER.map((f) => readFileSync(path.join(root, f), "utf8"));
  const componentsDir = path.join(root, "css/components");
  for (const f of readdirSync(componentsDir).filter((f) => f.endsWith(".css")).sort()) {
    parts.push(readFileSync(path.join(componentsDir, f), "utf8"));
  }
  return parts.join("\n");
}

export async function build() {
  const started = Date.now();
  const assetsDir = path.join(root, "assets-src");

  // Step 1: validate all flat-file content. Throws loudly (file + field) on
  // any bad content, before we touch dist/. Content is the source of truth.
  // loadContent validates untrusted JSON, so it hands back `any`; once validated
  // the data matches SiteContent, so we assert that shape here for the render
  // step (the typedefs mirror the validators — see src/types.js).
  const content = /** @type {SiteContent} */ (
    loadContent({ contentDir: path.join(root, "content"), assetsDir })
  );
  const site = content.site;

  rmSync(dist, { recursive: true, force: true });
  mkdirSync(path.join(dist, "assets"), { recursive: true });

  // Static files (fonts, favicon, partner logos, …) are copied verbatim.
  cpSync(path.join(root, "static"), dist, { recursive: true });

  // Content images. The pipeline (src/images.js) emits AVIF/WebP/fallback
  // variants into dist/media/images/ and returns a manifest the templates render
  // through; originals in assets-src/ are never copied. Incremental via .cache/.
  const imageManifest = await processImages({
    assetsDir,
    dist,
    cacheDir: path.join(root, ".cache/images"),
    log: (m) => console.log(m),
  });
  setImageManifest(imageManifest);

  // Deep-zoom tile pyramids for every image flagged `deepZoom` (feature 09).
  // Tiled into dist/media/dz/ and rendered through an inline OpenSeadragon
  // descriptor by the viewer; the originals are never shipped whole. Incremental
  // via .cache/dz/ (same discipline as the image pipeline).
  const deepZoomSources = [
    ...new Set(
      content.objects.flatMap((o) => o.images.filter((img) => img.deepZoom).map((img) => img.src)),
    ),
  ];
  const dzManifest = await processDeepZoom({
    assetsDir,
    dist,
    cacheDir: path.join(root, ".cache/dz"),
    sources: deepZoomSources,
    log: (m) => console.log(m),
  });
  setDeepZoomManifest(dzManifest);

  // 3D models (feature 10). Every object with a `model3d` streams a GLB to the
  // viewer on intent; copy each referenced model verbatim into dist/media/models/
  // (already size-budgeted by the content validator). model-viewer itself is
  // vendored under static/vendor/ and copied above.
  const modelSources = [
    ...new Set(content.objects.flatMap((o) => (o.model3d ? [o.model3d.src] : []))),
  ];
  if (modelSources.length) {
    const modelsOut = path.join(dist, "media/models");
    mkdirSync(modelsOut, { recursive: true });
    for (const src of modelSources) {
      cpSync(path.join(assetsDir, "models", src), path.join(modelsOut, src));
    }
  }

  // CSS bundle (+ per-image LQIP background colours) + client JS, content-hashed.
  const css = `${bundleCss()}\n${lqipCss(imageManifest)}\n`;
  const cssFile = `assets/site-${hash(css)}.css`;
  writeFileSync(path.join(dist, cssFile), css);

  const js = readFileSync(path.join(root, "js/main.js"), "utf8");
  const jsFile = `assets/main-${hash(js)}.js`;
  writeFileSync(path.join(dist, jsFile), js);

  // The zoom viewer (feature 09) is a separate module loaded on intent, so it
  // stays out of the base-page JS budget. main.js dynamic-imports it by the
  // literal path "./viewer.js" (resolved next to the hashed main bundle), so it
  // is emitted unhashed alongside it. OpenSeadragon is vendored under
  // static/vendor/ (copied verbatim above) and pulled in by the viewer on demand.
  const viewerJs = readFileSync(path.join(root, "js/viewer.js"), "utf8");
  writeFileSync(path.join(dist, "assets/viewer.js"), viewerJs);

  const assets = { css: site.basePath + cssFile, js: site.basePath + jsFile };

  // Pages. Every page goes through renderPage (head/meta, nav, footer).
  const pages = [
    {
      out: "index.html",
      html: renderPage({
        site,
        assets,
        isDev,
        path: "/",
        title: site.homeTitle,
        description: site.description,
        content: renderHome({ site, sections: content.sections }),
      }),
    },
  ];

  // Every nav route gets a page. Any route whose real template hasn't landed yet
  // renders the designed "upcoming" state. As of feature 07 every nav route has a
  // real page — the four sections (below), the two content pages, and About — so
  // this fallback now yields nothing; it stays as a safety net for future items.
  const sectionRoutes = new Set(content.sections.map((s) => `/${s.id}/`));
  const pageRoutes = new Set(content.pages.map((p) => `/${p.slug}/`));
  const realRoutes = new Set([...sectionRoutes, ...pageRoutes, "/about/"]);
  const navRoutes = site.nav
    .flatMap((item) => [item, ...(item.children ?? [])])
    .filter((item) => item.href !== "/" && !realRoutes.has(item.href));
  for (const route of navRoutes) {
    pages.push({
      out: path.join(route.href.replace(/^\//, ""), "index.html"),
      html: renderPage({
        site,
        assets,
        isDev,
        path: route.href,
        title: `${route.label} — ${site.siteTitle}`,
        description: site.description,
        content: renderUpcoming({ title: route.label, site }),
      }),
    });
  }

  // Object detail pages, one per object at /<section>/<object-id>/.
  const sectionById = new Map(content.sections.map((s) => /** @type {[string, Section]} */ ([s.id, s])));
  const objectById = new Map(content.objects.map((o) => /** @type {[string, ContentObject]} */ ([o.id, o])));

  // Reverse index: object id → people who reference it (via person.relatedObjects),
  // so an object page can cross-link back to those people. Content ids are
  // validated in content.js, so every reference here resolves.
  /** @type {Map<string, Person[]>} */
  const peopleByObject = new Map();
  for (const person of content.people) {
    for (const objId of person.relatedObjects ?? []) {
      const list = peopleByObject.get(objId) ?? [];
      list.push(person);
      peopleByObject.set(objId, list);
    }
  }

  /** @type {Map<string, ContentObject[]>} */
  const objectsBySection = new Map();
  for (const obj of content.objects) {
    const list = objectsBySection.get(obj.section) ?? [];
    list.push(obj);
    objectsBySection.set(obj.section, list);
  }
  for (const list of objectsBySection.values()) {
    list.sort((a, b) => a.order - b.order);
  }

  for (const object of content.objects) {
    const section = sectionById.get(object.section);
    const siblings = objectsBySection.get(object.section);
    const idx = siblings.findIndex((o) => o.id === object.id);
    // Prev/next wrap around the section's ordered objects.
    const prev = siblings.length > 1 ? siblings[(idx - 1 + siblings.length) % siblings.length] : null;
    const next = siblings.length > 1 ? siblings[(idx + 1) % siblings.length] : null;

    // Explore grid: curated related first (in listed order), then the rest of
    // the section in `order`, excluding the current object and any duplicates.
    const seen = new Set([object.id]);
    /** @type {ContentObject[]} */
    const explore = [];
    for (const id of object.related ?? []) {
      const rel = objectById.get(id);
      if (rel && !seen.has(id)) {
        explore.push(rel);
        seen.add(id);
      }
    }
    for (const sib of siblings) {
      if (!seen.has(sib.id)) {
        explore.push(sib);
        seen.add(sib.id);
      }
    }

    const routePath = `/${object.section}/${object.id}/`;
    pages.push({
      out: path.join(object.section, object.id, "index.html"),
      html: renderPage({
        site,
        assets,
        isDev,
        path: routePath,
        title: objectTitle(object, site),
        description: objectDescription(object),
        content: renderObject({
          site,
          object,
          section,
          prev,
          next,
          explore,
          relatedPeople: (peopleByObject.get(object.id) ?? []).sort((a, b) => a.order - b.order),
        }),
      }),
    });
  }

  // Person detail pages, one per person at /<section>/<person-id>/. Same
  // machinery as objects: prev/next wraps the section's people in `order`, and
  // related objects/people resolve to cross-linked cards (both validated in
  // content.js so every id resolves).
  const personById = new Map(content.people.map((p) => /** @type {[string, Person]} */ ([p.id, p])));
  /** @type {Map<string, Person[]>} */
  const peopleBySection = new Map();
  for (const person of content.people) {
    const list = peopleBySection.get(person.section) ?? [];
    list.push(person);
    peopleBySection.set(person.section, list);
  }
  for (const list of peopleBySection.values()) {
    list.sort((a, b) => a.order - b.order);
  }

  for (const person of content.people) {
    const section = sectionById.get(person.section);
    const siblings = peopleBySection.get(person.section);
    const idx = siblings.findIndex((p) => p.id === person.id);
    const prev = siblings.length > 1 ? siblings[(idx - 1 + siblings.length) % siblings.length] : null;
    const next = siblings.length > 1 ? siblings[(idx + 1) % siblings.length] : null;

    const relatedObjects = (person.relatedObjects ?? [])
      .map((id) => objectById.get(id))
      .filter(Boolean);
    const relatedPeople = (person.relatedPeople ?? [])
      .map((id) => personById.get(id))
      .filter(Boolean);

    const routePath = `/${person.section}/${person.id}/`;
    pages.push({
      out: path.join(person.section, person.id, "index.html"),
      html: renderPage({
        site,
        assets,
        isDev,
        path: routePath,
        title: personTitle(person, site),
        description: personDescription(person),
        content: renderPerson({ site, person, section, prev, next, relatedObjects, relatedPeople }),
      }),
    });
  }

  // Essays grouped by section, in `order`, for the section pages' teasers.
  /** @type {Map<string, Essay[]>} */
  const essaysBySection = new Map();
  for (const essay of content.essays) {
    const list = essaysBySection.get(essay.section) ?? [];
    list.push(essay);
    essaysBySection.set(essay.section, list);
  }
  for (const list of essaysBySection.values()) {
    list.sort((a, b) => a.order - b.order);
  }

  // Section (persona) pages, one per section at /<section-id>/. One template,
  // three data states (categories / grid / upcoming) keyed off the section JSON.
  for (const section of content.sections) {
    const routePath = `/${section.id}/`;
    pages.push({
      out: path.join(section.id, "index.html"),
      html: renderPage({
        site,
        assets,
        isDev,
        path: routePath,
        title: sectionTitle(section, site),
        description: sectionDescription(section),
        content: renderSection({
          site,
          section,
          objects: objectsBySection.get(section.id) ?? [],
          people: peopleBySection.get(section.id) ?? [],
          essays: essaysBySection.get(section.id) ?? [],
        }),
      }),
    });
  }

  // Essay pages, one per essay at /essays/<slug>/. Section-page teasers link
  // here (real URLs, never modals). Minimal reading page; feature 07 enriches.
  for (const essay of content.essays) {
    const section = sectionById.get(essay.section);
    // Prev/next wrap the section's essays in `order` (same machinery as objects);
    // renders nothing when the section has a single essay.
    const siblings = essaysBySection.get(essay.section) ?? [];
    const idx = siblings.findIndex((e) => e.slug === essay.slug);
    const prev = siblings.length > 1 ? siblings[(idx - 1 + siblings.length) % siblings.length] : null;
    const next = siblings.length > 1 ? siblings[(idx + 1) % siblings.length] : null;
    pages.push({
      out: path.join("essays", essay.slug, "index.html"),
      html: renderPage({
        site,
        assets,
        isDev,
        path: `/essays/${essay.slug}/`,
        title: essayTitle(essay, site),
        description: essayDescription(essay),
        content: renderEssay({ site, essay, section, prev, next }),
      }),
    });
  }

  // Standalone content pages, one per content/pages/*.md at /<slug>/ (the Jose
  // Rizal overview and Rizal in Germany). The overview appends the shared persona
  // cards, so it takes the section list.
  for (const contentPage of content.pages) {
    const routePath = `/${contentPage.slug}/`;
    pages.push({
      out: path.join(contentPage.slug, "index.html"),
      html: renderPage({
        site,
        assets,
        isDev,
        path: routePath,
        title: pageTitle(contentPage, site),
        description: pageDescription(contentPage),
        content: renderContentPage({ site, page: contentPage, sections: content.sections }),
      }),
    });
  }

  // About page (institution blurbs + the Messages video grid).
  pages.push({
    out: path.join("about", "index.html"),
    html: renderPage({
      site,
      assets,
      isDev,
      path: "/about/",
      title: aboutTitle(site),
      description: aboutDescription(content.about),
      content: renderAbout({ site, about: content.about }),
    }),
  });

  // Search page (feature 11) at /search/. Hosts the Pagefind UI; the index and UI
  // assets are emitted into dist/pagefind/ by the post-build step below and loaded
  // by js/main.js only where the #search mount exists.
  pages.push({
    out: path.join("search", "index.html"),
    html: renderPage({
      site,
      assets,
      isDev,
      path: "/search/",
      title: searchTitle(site),
      description: searchDescription(),
      content: renderSearch({ site }),
    }),
  });

  // Custom 404, emitted at the root as /404.html (serve.js + the CDN return it
  // for unknown paths). Not linked from anywhere, so linkinator never crawls it.
  pages.push({
    out: "404.html",
    html: renderPage({
      site,
      assets,
      isDev,
      path: "/404.html",
      title: `Page not found — ${site.siteTitle}`,
      description: "The page you were looking for could not be found on the José Rizal Digital Exhibition.",
      content: render404({ site }),
    }),
  });

  for (const page of pages) {
    const outPath = path.join(dist, page.out);
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, page.html);
  }

  // Fail the build if any output references a raw original scan or a missing
  // image (spec rule 4 / feature 08) — no <img>/<source> may point outside the
  // hashed pipeline variants.
  lintDistImages(dist);

  // Step 7 (spec build tooling): Pagefind indexes the built HTML into
  // dist/pagefind/ — a static full-text index plus the UI JS/CSS the search panel
  // and /search/ page load on demand (feature 11). Pagefind is a build-only dev
  // dependency (like sharp); nothing is shipped to the browser except the static
  // assets it emits here. Runs on every build (dev included) — indexing is a few
  // dozen ms, and skipping it in dev would leave the search panel with nothing to
  // load. `--quiet` keeps its banner out of the dev-rebuild log.
  const pagefindBin = path.join(root, "node_modules", ".bin", "pagefind");
  execFileSync(pagefindBin, ["--site", dist, "--quiet"], { stdio: "inherit" });

  console.log(`Built ${pages.length} page(s) in ${Date.now() - started} ms → dist/`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  build().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
