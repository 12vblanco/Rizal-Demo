// @ts-check
// Person detail page — scholar-section people at /scholar/<person-id>/. Same
// generation machinery as objects (feature 03), a different template + schema.
// Objects and people are always real pages with their own URL, never modals
// (spec). Shares the breadcrumb, prev/next pager, related-cards, Markdown, and
// View-Transition helpers with the object page via fragments.js.

import { esc } from "./layout.js";
import { renderImage } from "./media.js";
import {
  objectCard,
  personCard,
  renderBreadcrumb,
  renderMarkdown,
  renderPager,
  renderRelatedRow,
  renderVtStyle,
  vtName,
} from "./fragments.js";

/**
 * @typedef {import("../types.js").Site} Site
 * @typedef {import("../types.js").Section} Section
 * @typedef {import("../types.js").ContentObject} ContentObject
 * @typedef {import("../types.js").Person} Person
 */

// --- SEO slots (full package in feature 12) --------------------------------

/** @param {Person} person @param {Site} site */
export function personTitle(person, site) {
  const rich = `${person.name} · ${person.role} | ${site.siteTitle}`;
  const base = `${person.name} | ${site.siteTitle}`;
  return rich.length <= 70 ? rich : base;
}

/** @param {Person} person */
export function personDescription(person) {
  const plain = person.bio.replace(/\s+/g, " ").trim();
  if (plain.length <= 155) return plain;
  return plain.slice(0, 152).replace(/\s+\S*$/, "") + "…";
}

// --- page fragments --------------------------------------------------------

/** @param {Site} site @param {Person} person */
function renderPortrait(site, person) {
  const img = renderImage({
    site,
    image: person.portrait,
    className: "person-portrait__img",
    loading: "eager",
    fetchpriority: "high",
    sizes: "(min-width: 60rem) 32rem, 100vw",
    dataVt: vtName("person", person.id),
  });
  const credit = person.portrait.credit
    ? `\n    <figcaption class="person-portrait__credit">${esc(person.portrait.credit)}</figcaption>`
    : "";
  return `<figure class="person-portrait">
    ${img}${credit}
  </figure>`;
}

/**
 * @param {object} p
 * @param {Site} p.site
 * @param {Person} p.person
 * @param {Section} p.section
 * @param {Person} [p.prev]
 * @param {Person} [p.next]
 * @param {ContentObject[]} p.relatedObjects - resolved object records
 * @param {Person[]} p.relatedPeople - resolved person records
 */
export function renderPerson({ site, person, section, prev, next, relatedObjects, relatedPeople }) {
  const objectCards = relatedObjects.map((o) => objectCard(site, o));
  const peopleCards = relatedPeople.map((p) => personCard(site, p));
  const vtNames = [
    vtName("person", person.id),
    ...relatedObjects.map((o) => vtName("obj", o.id)),
    ...relatedPeople.map((p) => vtName("person", p.id)),
  ];
  return `${renderVtStyle(vtNames)}
<article class="person band band--light">
  <div class="container">
    ${renderBreadcrumb({ site, section, leaf: person.name })}
    <div class="person__layout">
      <div class="person__portrait-col">
        ${renderPortrait(site, person)}
      </div>
      <div class="person__info-col">
        <h1 class="person__name" data-pagefind-weight="10">${esc(person.name)}</h1>
        <p class="person__role" data-pagefind-weight="4">${esc(person.role)}</p>
        <p class="person__lifespan">${esc(person.lifespan)}</p>
        <div class="person__bio">
${renderMarkdown(person.bio)}
        </div>
      </div>
    </div>
    ${renderRelatedRow({ heading: "Related objects", headingId: "related-objects", cards: objectCards })}
    ${renderRelatedRow({ heading: "Related people", headingId: "related-people", cards: peopleCards })}
    ${renderPager({
      prev,
      next,
      hrefFor: (person) => `/${person.section}/${person.id}/`,
      nameFor: (person) => person.name,
      ariaLabel: "Browse people in this section",
    })}
  </div>
</article>`;
}
