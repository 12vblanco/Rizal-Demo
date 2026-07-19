// Live-site content harvester (feature 11b). Build-time only, never shipped.
//
// Fetches every image and text still missing from the rebuild directly from
// the live phase-1 site and stages it locally for the section builds
// (11d-11g) to curate by hand. Idempotent: re-running skips anything already
// on disk unless --force is passed. See scripts/migrate/README.md.
//
// Usage: node scripts/migrate/harvest.js [--force] [--only=ethnographer,scholar,sections,pages]

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Harvester } from "./lib/fetcher.js";
import {
  decodeEntities,
  extractContentNodes,
  extractModals,
  getMain,
  htmlToText,
  nodesToMarkdown,
  stripProjectCards,
} from "./lib/extract.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const stagingDir = path.join(root, "scripts", "migrate", "staging");

const args = process.argv.slice(2);
const force = args.includes("--force");
const onlyArg = args.find((a) => a.startsWith("--only="));
const only = onlyArg ? new Set(onlyArg.slice("--only=".length).split(",")) : null;
const runs = (name) => !only || only.has(name);

function normalizeAssetPath(src) {
  return src.replace(/^(\.\.\/)+/g, "").replace(/^\.\//, "");
}

function slugify(text) {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s-]/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

function kebabFilename(name) {
  const ext = path.extname(name).toLowerCase();
  const base = path.basename(name, path.extname(name));
  const kebab = base
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
  return `${kebab || "image"}${ext}`;
}

/** Pull Description / Condition / "Other details" out of the object detail `<p>`. */
function extractLabeledFields(html) {
  const pMatch = html.match(/<p>\s*<strong>Description:<\/strong>[\s\S]*?<\/p>/i);
  const fields = {};
  if (pMatch) {
    for (const part of pMatch[0].split(/<strong>/i).slice(1)) {
      const labelMatch = part.match(/^([^<]*)<\/strong>/);
      if (!labelMatch) continue;
      const label = labelMatch[1].replace(/[:\s]+$/, "").trim().toLowerCase();
      const rest = part.slice(labelMatch[0].length).replace(/<\/p>\s*$/i, "");
      fields[label] = htmlToText(rest);
    }
  }
  return {
    description: fields["description"] ?? "",
    condition: fields["condition"] ?? "",
    otherDetails: fields["other details"] ?? "",
  };
}

async function harvestEthnographer(h) {
  console.log("\n== Ethnographer objects ==");
  const listingHtml = await h.fetchPage("ethnographer.html");
  const cardRe = /<div class="project-card">([\s\S]*?)<\/div>\s*<\/div>/g;
  const cards = [];
  let m;
  while ((m = cardRe.exec(listingHtml))) {
    const chunk = m[1];
    const imgMatch = chunk.match(/src="assets\/images\/ethno\/asethno\/(\d+)([a-z0-9]+)\/([^"]+)"/);
    const hrefMatch = chunk.match(/href="ethnographer\/([a-z_]+\.html)"/);
    const titleMatch = chunk.match(/<h4 class="project-title">([^<]*)<\/h4>/);
    const categoryMatch = chunk.match(/<div class="project-category"><i>([^<]*)<\/i><\/div>/);
    if (!imgMatch || !hrefMatch) continue;
    cards.push({
      order: Number(imgMatch[1]),
      folderSlug: imgMatch[2],
      detailPath: `ethnographer/${hrefMatch[1]}`,
      titleEn: titleMatch ? decodeEntities(titleMatch[1]).trim() : "",
      category: categoryMatch ? decodeEntities(categoryMatch[1]).trim() : "",
    });
  }
  // The listing page repeats each card in a "featured" strip and the full
  // grid — same order number appears twice with identical content.
  const dedupedCards = [...new Map(cards.map((c) => [c.order, c])).values()];
  dedupedCards.sort((a, b) => a.order - b.order);

  const objects = [];
  for (const card of dedupedCards) {
    console.log(`  #${card.order} ${card.folderSlug} <- ${card.detailPath}`);
    const html = await h.fetchPage(card.detailPath);
    const titleMatch = html.match(/<h2[^>]*id="itemTitle">([\s\S]*?)<\/h2>/);
    let titleMain = "";
    let titleVernacular = "";
    if (titleMatch) {
      const spanMatch = titleMatch[1].match(/<span[^>]*>\(([\s\S]*?)\)<\/span>/);
      titleVernacular = spanMatch ? htmlToText(spanMatch[1]) : "";
      titleMain = htmlToText(titleMatch[1].replace(/<span[\s\S]*<\/span>/, ""));
    }
    const { description, condition, otherDetails } = extractLabeledFields(html);

    const thumbsMatch = html.match(/<div class="thumbs">([\s\S]*?)<\/div>/);
    const carouselMatch = html.match(/<div class="carousel-inner">([\s\S]*?)<\/div>\s*<button/);
    const source = thumbsMatch?.[1] ?? carouselMatch?.[1] ?? "";
    const images = [...source.matchAll(/src="([^"]+)"/g)].map((im) => normalizeAssetPath(im[1]));

    const localDir = path.join(stagingDir, "images", "ethnographer", `${card.order}-${card.folderSlug}`);
    const localImages = [];
    for (const src of images) {
      const dest = path.join(localDir, kebabFilename(path.basename(src)));
      await h.downloadFile(src, dest);
      localImages.push(path.relative(stagingDir, dest));
    }

    objects.push({
      order: card.order,
      folderSlug: card.folderSlug,
      sourceUrl: `${h.baseUrl}/${card.detailPath}`,
      titleEn: titleMain || card.titleEn,
      titleVernacular,
      category: card.category,
      description,
      condition,
      otherDetails,
      images: localImages,
    });
  }
  return objects;
}

async function harvestScholar(h) {
  console.log("\n== Scholar people ==");
  const listingHtml = await h.fetchPage("scholar.html");
  const cardRe = /<div class="project-card">([\s\S]*?)<\/div>\s*<\/div>/g;
  const cards = [];
  let m;
  while ((m = cardRe.exec(listingHtml))) {
    const chunk = m[1];
    const imgMatch = chunk.match(/src="assets\/images\/scholar\/Friend (\d+)\/([^"]+)"/);
    const hrefMatch = chunk.match(/href="scholar_pages\/(friend\d+\.html)"/);
    const titleMatch = chunk.match(/<h4 class="project-title">([^<]*)<\/h4>/);
    if (!imgMatch || !hrefMatch) continue;
    cards.push({
      friendNumber: Number(imgMatch[1]),
      listingImage: `assets/images/scholar/Friend ${imgMatch[1]}/${imgMatch[2]}`,
      detailPath: `scholar_pages/${hrefMatch[1]}`,
      titleEn: titleMatch ? decodeEntities(titleMatch[1]).trim() : "",
    });
  }
  const dedupedCards = [...new Map(cards.map((c) => [c.friendNumber, c])).values()];
  dedupedCards.sort((a, b) => a.friendNumber - b.friendNumber);

  const people = [];
  for (const card of dedupedCards) {
    console.log(`  friend #${card.friendNumber} <- ${card.detailPath}`);
    const html = await h.fetchPage(card.detailPath);
    const ownBlock = getMain(html).split(/Explore more scholars/)[0];
    const nameMatch = ownBlock.match(/<h2 class="section-heading mb-2">([^<]*)<\/h2>/);
    const bylineMatch = ownBlock.match(/<h8[^>]*><i>([\s\S]*?)<\/i><\/h8>/);
    const paragraphs = [...ownBlock.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((pm) => htmlToText(pm[1]));

    const localDir = path.join(stagingDir, "images", "scholar", `friend${card.friendNumber}`);
    const localImages = [];
    const seen = new Set();
    const imgRe = new RegExp(`assets/images/scholar/Friend ${card.friendNumber}/([^"]+)`, "g");
    let im;
    while ((im = imgRe.exec(ownBlock))) {
      const src = `assets/images/scholar/Friend ${card.friendNumber}/${im[1]}`;
      if (seen.has(src)) continue;
      seen.add(src);
      const dest = path.join(localDir, kebabFilename(im[1]));
      await h.downloadFile(src, dest);
      localImages.push(path.relative(stagingDir, dest));
    }
    if (localImages.length === 0) {
      const dest = path.join(localDir, kebabFilename(path.basename(card.listingImage)));
      await h.downloadFile(card.listingImage, dest);
      localImages.push(path.relative(stagingDir, dest));
    }

    people.push({
      friendNumber: card.friendNumber,
      sourceUrl: `${h.baseUrl}/${card.detailPath}`,
      name: nameMatch ? decodeEntities(nameMatch[1]).trim() : card.titleEn,
      author: bylineMatch ? htmlToText(bylineMatch[1]).replace(/^Author:\s*/i, "") : "",
      pullQuote: paragraphs[0] ?? "",
      bio: paragraphs[1] ?? "",
      images: localImages,
    });
  }
  return people;
}

/** Download every image referenced by a node list, returning a resolver for nodesToMarkdown. */
async function downloadNodeImages(h, nodes, localDir) {
  const resolved = new Map();
  for (const node of nodes) {
    if (node.type !== "image") continue;
    const src = normalizeAssetPath(node.src);
    if (resolved.has(src)) continue;
    const dest = path.join(localDir, kebabFilename(path.basename(src)));
    await h.downloadFile(src, dest);
    resolved.set(src, path.relative(stagingDir, dest));
  }
  return (src) => resolved.get(normalizeAssetPath(src)) ?? null;
}

/** Generic editorial-page harvest: heading/byline/paragraph/image nodes -> reviewable Markdown. */
async function harvestEditorialPage(h, urlPath, slug, { excludeCards = false } = {}) {
  console.log(`  ${slug} <- ${urlPath}`);
  const html = await h.fetchPage(urlPath);
  let main = getMain(html);
  if (excludeCards) main = stripProjectCards(main);
  const nodes = extractContentNodes(main);
  const resolveImage = await downloadNodeImages(h, nodes, path.join(stagingDir, "images", "pages", slug));
  return nodesToMarkdown(nodes, resolveImage);
}

/**
 * "Read more" essay popups (Bootstrap modals) embedded in a page — the
 * teaser paragraphs shown inline are truncated; the full essay text only
 * exists inside these hidden modals.
 */
async function harvestEssayModals(h, urlPath, sectionSlug) {
  const html = await h.fetchPage(urlPath);
  const modals = extractModals(html);
  const essays = [];
  for (const modal of modals) {
    const nodes = extractContentNodes(modal.content);
    if (!nodes.some((n) => n.type === "paragraph")) continue; // viewer chrome, not an essay
    const heading = nodes.find((n) => n.type === "heading")?.text ?? modal.id;
    const byline = nodes.find((n) => n.type === "byline")?.text ?? "";
    const slug = `${sectionSlug}-${slugify(heading) || slugify(modal.id)}`;
    const resolveImage = await downloadNodeImages(h, nodes, path.join(stagingDir, "images", "essays", slug));
    essays.push({
      modalId: modal.id,
      slug,
      heading,
      byline,
      markdown: nodesToMarkdown(nodes, resolveImage),
    });
    console.log(`    essay: ${heading} (${byline || "no byline"})`);
  }
  return essays;
}

async function main() {
  const siteJson = JSON.parse(await readFile(path.join(root, "content", "site.json"), "utf8"));
  const h = new Harvester({ baseUrl: siteJson.baseUrl, stagingDir, force });
  await h.loadManifest();
  await mkdir(stagingDir, { recursive: true });

  const textDir = path.join(stagingDir, "text");
  await mkdir(textDir, { recursive: true });

  if (runs("ethnographer")) {
    const objects = await harvestEthnographer(h);
    await mkdir(path.join(textDir, "ethnographer"), { recursive: true });
    await writeFile(
      path.join(textDir, "ethnographer", "objects.json"),
      JSON.stringify(objects, null, 2) + "\n"
    );
  }

  if (runs("scholar")) {
    const people = await harvestScholar(h);
    await mkdir(path.join(textDir, "scholar"), { recursive: true });
    await writeFile(path.join(textDir, "scholar", "people.json"), JSON.stringify(people, null, 2) + "\n");
  }

  if (runs("sections")) {
    console.log("\n== Section editorial ==");
    await mkdir(path.join(textDir, "sections"), { recursive: true });
    await mkdir(path.join(textDir, "essays"), { recursive: true });
    const sectionPages = [
      ["hero.html", "hero", false],
      ["artist.html", "artist", false],
      ["ethnographer.html", "ethnographer", true],
      ["scholar.html", "scholar", true],
    ];
    for (const [urlPath, slug, excludeCards] of sectionPages) {
      const md = await harvestEditorialPage(h, urlPath, slug, { excludeCards });
      await writeFile(path.join(textDir, "sections", `${slug}.md`), md);

      const essays = await harvestEssayModals(h, urlPath, slug);
      for (const essay of essays) {
        const frontmatter = [
          "---",
          `title: ${essay.heading}`,
          `section: ${slug}`,
          `author: ${essay.byline.replace(/^(?:Author|Authors):\s*/i, "")}`,
          `sourceModalId: ${essay.modalId}`,
          "---",
          "",
        ].join("\n");
        await writeFile(path.join(textDir, "essays", `${essay.slug}.md`), frontmatter + essay.markdown);
      }
    }
  }

  if (runs("pages")) {
    console.log("\n== Standalone pages ==");
    await mkdir(path.join(textDir, "pages"), { recursive: true });
    const pages = [
      ["overview.html", "jose-rizal"],
      ["rizal_germany.html", "rizal-in-germany"],
      ["aboutus.html", "about"],
    ];
    for (const [urlPath, slug] of pages) {
      const md = await harvestEditorialPage(h, urlPath, slug);
      await writeFile(path.join(textDir, "pages", `${slug}.md`), md);
    }
  }

  await h.saveManifest();

  console.log(
    `\nDone. fetched=${h.counts.fetched} cached=${h.counts.skipped} failed=${h.counts.failed}`
  );
  console.log(`Staged under ${path.relative(root, stagingDir)}/ (gitignored).`);
  console.log(`Manifest: ${path.relative(root, h.manifestPath)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
