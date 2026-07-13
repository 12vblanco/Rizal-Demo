// @ts-check
// About page (content/about.json). Dark hero (title + intro standfirst) over two
// institution blurbs and the "Messages" video grid. Each message is a real
// poster + name/role caption; the player loads only on a click — js/main.js
// reads data-video and swaps in a <video> — so the page is complete without JS
// (posters + captions), and the not-yet-hosted MP4 paths never reach the link
// checker (they live in a data-* attribute, injected on intent). Video hosting is
// open question #10 (self-hosted MP4 is the default the click-to-load assumes).

import { esc } from "./layout.js";
import { renderImage } from "./media.js";
import { renderMarkdown } from "./fragments.js";
import { icons } from "../icons.js";

/**
 * @typedef {import("../types.js").Site} Site
 * @typedef {import("../types.js").About} About
 * @typedef {import("../types.js").AboutBlurb} AboutBlurb
 * @typedef {import("../types.js").AboutMessage} AboutMessage
 */

const ABOUT_TITLE = "About the Project";

// --- SEO slots (full package in feature 12) --------------------------------

/** @param {Site} site */
export function aboutTitle(site) {
  const full = `${ABOUT_TITLE} | ${site.siteTitle}`;
  return full.length <= 70 ? full : ABOUT_TITLE;
}

/** @param {About} about */
export function aboutDescription(about) {
  const plain = about.intro.replace(/\s+/g, " ").trim();
  if (plain.length <= 155) return plain;
  return plain.slice(0, 152).replace(/\s+\S*$/, "") + "…";
}

// --- Institution blurbs ----------------------------------------------------

/** @param {AboutBlurb} blurb */
function renderBlurb(blurb) {
  return `<section class="about-blurb">
      <h2 class="about-blurb__heading">${esc(blurb.heading)}</h2>
      <div class="about-blurb__body">
${renderMarkdown(blurb.body)}
      </div>
    </section>`;
}

// --- Messages video grid ---------------------------------------------------

/** One message card: poster + a play button that loads the player on click
 *  (progressive enhancement). Without JS the poster + caption still stand.
 * @param {Site} site @param {AboutMessage} message @param {number} index */
function renderMessage(site, message, index) {
  const poster = renderImage({
    site,
    image: message.poster,
    className: "message-card__poster",
    loading: index < 3 ? "eager" : "lazy",
    sizes: "(min-width: 60rem) 28rem, (min-width: 40rem) 45vw, 100vw",
  });
  // The dignitary videos are already hosted at the museum origin under
  // /assets/video/ (the phase-1 asset tree); the rebuild ships to that same
  // origin, so the player streams them from there instead of the repo re-hosting
  // ~155 MB. `message.video` is the origin-relative path; the URL is built from
  // site.baseUrl (rule 7 — no hardcoded domain) so it also plays in local dev.
  const dataVideo = message.video
    ? ` data-video="${esc(site.baseUrl)}/${esc(message.video)}"`
    : "";
  return `<li class="message-card">
  <div class="message-card__media">
    ${poster}
    <button class="message-card__play" type="button"${dataVideo} aria-label="Play the video message from ${esc(message.name)}">
      <span class="message-card__play-icon" aria-hidden="true">${icons.play}</span>
    </button>
  </div>
  <div class="message-card__caption">
    <h3 class="message-card__name">${esc(message.name)}</h3>
    <p class="message-card__role">${esc(message.role)}</p>
  </div>
</li>`;
}

// --- Page ------------------------------------------------------------------

/**
 * @param {object} p
 * @param {Site} p.site
 * @param {About} p.about - parsed content/about.json
 */
export function renderAbout({ site, about }) {
  const blurbs = about.blurbs.map(renderBlurb).join("\n    ");
  const messages = about.messages.map((m, i) => renderMessage(site, m, i)).join("\n");
  // Decorative hero background (the title is adjacent, so alt=""), same
  // foot-set, scrimmed treatment as the section and Rizal-in-Germany heroes.
  const heroBg = renderImage({
    site,
    image: { src: "home/about-the-project.webp", alt: "" },
    className: "page-hero__bg",
    loading: "eager",
    fetchpriority: "high",
  });
  return `<section class="page-hero band band--dark page-hero--image">
  ${heroBg}
  <div class="page-hero__scrim"></div>
  <div class="container page-hero__inner">
    <h1 class="page-hero__title">${esc(ABOUT_TITLE)}</h1>
    <p class="page-hero__intro">${esc(about.intro)}</p>
  </div>
</section>
<div class="band band--light about-blurbs">
  <div class="container container--narrow">
    ${blurbs}
  </div>
</div>
<section class="band band--light about-messages" aria-labelledby="messages-h">
  <div class="container">
    <h2 class="about-messages__heading" id="messages-h">${esc(about.messagesHeading)}</h2>
    <ul class="message-grid">
${messages}
    </ul>
  </div>
</section>`;
}
