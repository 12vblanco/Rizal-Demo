// Minimal, purpose-built HTML text extraction for the phase-1 live site.
// No HTML-parser dependency (allowed-deps rule) — the source markup is fixed
// and hand-inspected, so targeted regexes are reliable and avoid a new dep.

const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** @param {string} text */
export function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, code) => {
    if (code[0] === "#") {
      const codePoint =
        code[1] === "x" || code[1] === "X"
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return NAMED_ENTITIES[code] ?? match;
  });
}

/**
 * Convert an HTML fragment to plain text: `<br>` runs of 2+ become a
 * paragraph break, everything else becomes a single space, entities are
 * decoded, and whitespace is collapsed.
 * @param {string} html
 */
export function htmlToText(html) {
  return decodeEntities(
    html
      .replace(/\r\n?/g, "\n")
      .replace(/(\s*<br\s*\/?>\s*){2,}/gi, "\n\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Remove `project-card` grid blocks (object/person listing cards) so a
 * generic editorial-block extractor doesn't also pick up card titles/images.
 * @param {string} html
 */
export function stripProjectCards(html) {
  return html.replace(
    /<div class="col-lg-4 col-md-6"[\s\S]*?<\/div><!-- End Project Item -->/g,
    ""
  );
}

/**
 * Strip HTML comments. The source has several commented-out `<p>`/`<h2>`
 * blocks (leftover boilerplate from copy-pasting page templates) that would
 * otherwise be picked up by the tag-based extractors below.
 * @param {string} html
 */
export function stripComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, "");
}

/**
 * Pull the `<main class="main">...</main>` region out of a full page.
 * Comments are stripped first (see `stripComments`).
 * @param {string} html
 */
export function getMain(html) {
  const match = stripComments(html).match(/<main[^>]*>([\s\S]*?)<\/main>/);
  return match ? match[1] : stripComments(html);
}

/**
 * Return the substring between a `<div ...>` start tag (whose `<` is at
 * `startIndex`) and its matching `</div>`, tracking nested div depth. Used
 * for Bootstrap modal bodies, which can't be isolated with a non-greedy
 * regex because the amount of nested markup varies per modal.
 * @param {string} html
 * @param {number} startIndex
 */
export function extractBalancedDiv(html, startIndex) {
  const openEnd = html.indexOf(">", startIndex) + 1;
  const tagPattern = /<div\b[^>]*>|<\/div>/g;
  tagPattern.lastIndex = openEnd;
  let depth = 1;
  let match;
  while ((match = tagPattern.exec(html))) {
    depth += match[0][1] === "/" ? -1 : 1;
    if (depth === 0) return html.slice(openEnd, match.index);
  }
  return html.slice(openEnd);
}

/**
 * Find every `<div class="modal fade" id="...">` ("Read more" essay
 * popups) and return its id plus full inner content.
 * @param {string} html
 * @returns {Array<{id: string, content: string}>}
 */
export function extractModals(html) {
  const modals = [];
  const startPattern = /<div class="modal fade" id="([^"]+)"/g;
  let match;
  while ((match = startPattern.exec(html))) {
    modals.push({ id: match[1], content: extractBalancedDiv(html, match.index) });
  }
  return modals;
}

/**
 * Walk an HTML fragment in document order and emit heading / byline /
 * paragraph / image nodes — a flat, reviewable representation of editorial
 * content without needing to solve the (inconsistent) block nesting.
 * @param {string} html
 * @returns {Array<{type: string, text?: string, src?: string, alt?: string, caption?: string}>}
 */
export function extractContentNodes(html) {
  const nodes = [];
  // h2/h4 are both used as editorial headings across pages (h4 for essay
  // titles inside "Read more" modals); h8 is the (non-standard) author byline.
  const tagPattern =
    /<h[24][^>]*>(?<heading>[\s\S]*?)<\/h[24]>|<h8[^>]*>(?<byline>[\s\S]*?)<\/h8>|<p(?:\s[^>]*)?>(?<paragraph>[\s\S]*?)<\/p>|<img\s+[^>]*src="(?<imgSrc>[^"]+)"[^>]*>|<figcaption[^>]*>(?<figcaption>[\s\S]*?)<\/figcaption>/gi;
  let match;
  let pendingImage = null;
  while ((match = tagPattern.exec(html))) {
    const { heading, byline, paragraph, imgSrc, figcaption } = match.groups;
    if (heading !== undefined) {
      const text = htmlToText(heading);
      if (text) nodes.push({ type: "heading", text });
    } else if (byline !== undefined) {
      const text = htmlToText(byline);
      if (text) nodes.push({ type: "byline", text });
    } else if (paragraph !== undefined) {
      const text = htmlToText(paragraph);
      if (text) nodes.push({ type: "paragraph", text });
    } else if (imgSrc !== undefined) {
      if (pendingImage) nodes.push(pendingImage);
      const altMatch = match[0].match(/alt="([^"]*)"/);
      pendingImage = {
        type: "image",
        src: imgSrc,
        alt: altMatch ? decodeEntities(altMatch[1]) : "",
      };
    } else if (figcaption !== undefined) {
      const text = htmlToText(figcaption);
      if (pendingImage) {
        pendingImage.caption = text;
        nodes.push(pendingImage);
        pendingImage = null;
      } else if (text) {
        nodes.push({ type: "caption", text });
      }
    }
  }
  if (pendingImage) nodes.push(pendingImage);
  return nodes.filter(
    (n) => !(n.type === "image" && /template\/assets|nmp_logo|favicon/.test(n.src))
  );
}

/**
 * Render extracted content nodes as reviewable Markdown, rewriting image
 * `src` to the given local staged path via `resolveImage`.
 * @param {ReturnType<typeof extractContentNodes>} nodes
 * @param {(src: string) => string | null} resolveImage
 */
export function nodesToMarkdown(nodes, resolveImage) {
  const lines = [];
  for (const node of nodes) {
    if (node.type === "heading") lines.push(`## ${node.text}`, "");
    else if (node.type === "byline") lines.push(`*${node.text}*`, "");
    else if (node.type === "paragraph") lines.push(node.text, "");
    else if (node.type === "caption") lines.push(`> ${node.text}`, "");
    else if (node.type === "image") {
      const local = resolveImage(node.src);
      lines.push(`![${node.alt}](${local ?? node.src})`);
      if (node.caption) lines.push(`<!-- caption: ${node.caption} -->`);
      lines.push("");
    }
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
