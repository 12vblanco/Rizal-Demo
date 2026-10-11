// @ts-check
// Shared content-shape typedefs. Pure JSDoc — no runtime code, never imported at
// build time; the templates reference these with `@typedef {import("../types.js").X} X`
// so their render functions type-check instead of taking `any`. These mirror the
// runtime validators in content.js (the source of truth): if a shape changes,
// change the validator there and the typedef here together. Post-load shapes
// (Essay, ContentPage) are the flattened `{ ...frontmatter, body }` records the
// build consumes, so heroImage is a bare path string, not an Image object.

/**
 * A resolved content image: a kebab-case path under assets-src/images plus alt
 * from data (build fails on missing alt). credit/deepZoom are optional.
 * @typedef {object} Image
 * @property {string} src
 * @property {string} alt
 * @property {string} [credit]
 * @property {boolean} [deepZoom]
 * @property {"top"|"upper"|"bottom"} [position] - which part of the source to
 *   hold on to when a layout box crops it (object-fit: cover). Omitted means
 *   centred, which suits a subject sitting mid-frame; "top" is for a portrait
 *   whose head sits near the top edge and would otherwise be cropped away;
 *   "upper" is the step between the two, for a wide scene whose figure sits
 *   high but not flush, where "top" would show the empty wall above them.
 */

/**
 * A UI locale id. English is the default (root, no path prefix); Filipino and
 * German render under /fil/ and /de/. See src/i18n.js LOCALES.
 * @typedef {"en"|"fil"|"de"} Locale
 */

/**
 * A translatable string. Either a plain string (English, or content not yet
 * translated — it falls back at render via pick()) or a locale-keyed map with
 * `en` required and `fil`/`de` optional. Read through i18n.pick() so a missing
 * translation degrades to English rather than breaking the build.
 * @typedef {string | { en: string, fil?: string, de?: string }} LocalizedString
 */

/**
 * A label + href pair — nav children, footer links, hero/footer CTAs.
 * @typedef {object} Link
 * @property {LocalizedString} label
 * @property {string} href
 * @property {string} [video] - basePath-relative video file, shipped from this
 *   repo's static/video/ (as are the About "Messages" videos); when present the
 *   CTA's href is derived from it and it opens in the video dialog on click
 *   (JS), the derived href being its no-JS fallback link (plays natively).
 * @property {string} [videoSmall] - the 720p rung of the same video, for a
 *   screen that cannot show the 1080p `video` anyway (js/main.js picks). Only
 *   meaningful alongside `video`; omit it where only one encode exists.
 */

/**
 * A top-level nav entry; `children` makes it the Jose Rizal disclosure dropdown.
 * @typedef {object} NavItem
 * @property {LocalizedString} label
 * @property {string} href
 * @property {Link[]} [children]
 */

/**
 * Landing-page signature band (optional site.json slot). The band renders
 * Rizal's autograph; `attribution` is its accessible name.
 * @typedef {object} HomeQuote
 * @property {string} attribution
 * @property {string} [text]
 * @property {string} [lang]
 */

/**
 * One landing-page teaser card (optional site.json slot).
 * @typedef {object} HomeTeaser
 * @property {LocalizedString} heading
 * @property {string} href
 * @property {LocalizedString} [text]
 * @property {Image} [image]
 * @property {string} [accent]
 */

/**
 * The footer's About/contact headings block (site.json `footer`).
 * @typedef {object} SiteFooter
 * @property {LocalizedString} aboutHeading
 * @property {LocalizedString} aboutText
 * @property {LocalizedString} contactHeading
 */

/**
 * Museum contact details (site.json `contact`).
 * @typedef {object} Contact
 * @property {string} address
 * @property {string} email
 * @property {string} phone
 */

/**
 * A partner/collaborator logo lockup. `chip` gives a white backing on dark;
 * `caption` sets a short line of text under the logo (e.g. an office name that
 * isn't legible from the seal art alone).
 * @typedef {object} Partner
 * @property {string} name
 * @property {string} logo
 * @property {boolean} [chip]
 * @property {LocalizedString} [caption]
 */

/**
 * A social account link (icon resolved from `name`).
 * @typedef {object} Social
 * @property {string} name
 * @property {string} href
 */

/**
 * Analytics slot — keys always present, empty until a provider is confirmed.
 * @typedef {object} Analytics
 * @property {string} provider
 * @property {string} id
 */

/**
 * Global site config (content/site.json). URLs/canonicals derive from
 * baseUrl/basePath; every optional slot is gated so nothing is invented.
 * @typedef {object} Site
 * @property {LocalizedString} siteTitle
 * @property {LocalizedString} siteSubtitle
 * @property {LocalizedString} exhibitionTitle
 * @property {LocalizedString} exhibitionSubtitle
 * @property {LocalizedString} homeTitle
 * @property {string} baseUrl
 * @property {string} basePath
 * @property {string} language
 * @property {LocalizedString} description
 * @property {LocalizedString} copyright
 * @property {Link[]} [heroCtas]
 * @property {string[]} [home3dObjects] - object ids, in order, for the landing page's 3D strip
 * @property {HomeQuote} [homeQuote]
 * @property {HomeTeaser[]} [homeTeasers]
 * @property {NavItem[]} nav
 * @property {Link[]} footerNav
 * @property {Link[]} footerCtas
 * @property {SiteFooter} footer
 * @property {Contact} contact
 * @property {Partner[]} partners
 * @property {Social[]} social
 * @property {Analytics} analytics
 */

/**
 * An object title in its three locales.
 * @typedef {object} LocalizedTitle
 * @property {string} en
 * @property {string} tl
 * @property {string} es
 */

/**
 * A 3D model reference (feature 10 consumes it).
 * @typedef {object} Model3d
 * @property {string} src
 * @property {string} poster
 * @property {string} [cardPoster] - re-framed still for the home 3D strip, so a row of cards shares one scale; see scripts/images/card-poster.mjs
 * @property {string} altText
 * @property {string} [credit] - source/licence attribution shown by the 3D view
 */

/**
 * A hotspot annotation on an object image (feature 09).
 * @typedef {object} Hotspot
 * @property {string} label
 */

/**
 * A collection object (content/objects/*.json).
 * @typedef {object} ContentObject
 * @property {string} id
 * @property {string} section
 * @property {string} [category]
 * @property {number} order
 * @property {LocalizedTitle} title
 * @property {LocalizedString} objectType
 * @property {LocalizedString} [materials]
 * @property {LocalizedString} [dimensions]
 * @property {string} [accession]
 * @property {LocalizedString} description
 * @property {LocalizedString} [condition]
 * @property {Image[]} images
 * @property {string} rights
 * @property {Model3d} [model3d]
 * @property {string[]} related
 * @property {string} [author] - who wrote the catalogue entry, when credited
 * @property {boolean} [draft] - assets delivered, text pending; see checkDraft in content.js
 * @property {boolean} featured
 * @property {Hotspot[]} [hotspots]
 */

/**
 * A person record (content/people/*.json).
 * @typedef {object} Person
 * @property {string} id
 * @property {string} section
 * @property {string} [category] - the section category tab this person sits under; required when their section declares categories
 * @property {number} order
 * @property {string} name
 * @property {LocalizedString} role
 * @property {LocalizedString} [lifespan]
 * @property {LocalizedString} [birthplace]
 * @property {Image} portrait
 * @property {string} [author] - byline for the biography, when credited
 * @property {LocalizedString} [quote] - pull-quote tying Rizal to this person
 * @property {LocalizedString} [quoteSource] - the quote's attribution (required with `quote`)
 * @property {LocalizedString} bio
 * @property {string[]} relatedObjects
 * @property {string[]} relatedPeople
 * @property {boolean} [draft] - portrait delivered, biography pending; see checkDraft in content.js
 */

/**
 * A category tab within a section.
 * @typedef {object} SectionCategory
 * @property {string} id
 * @property {LocalizedString} label
 */

/**
 * A persona section (content/sections/*.json). `status` alone flips the grid
 * area between the live and upcoming states.
 * @typedef {object} Section
 * @property {string} id
 * @property {LocalizedString} title
 * @property {LocalizedString} [heroTitle] - what the hero band's <h1> says,
 *   when the short `title` that labels the section everywhere else (nav, cards,
 *   browser title) would be too terse as a page headline. Falls back to title.
 * @property {LocalizedString} intro
 * @property {Image} heroImage
 * @property {Image} [cardImage] - what the persona card shows, when the hero
 *   image cannot serve both. The hero is a very wide band and the card is
 *   nearly landscape, so one file only covers both when the subject sits
 *   mid-frame. Falls back to heroImage.
 * @property {"full"|"light"} [heroScrim] - how hard the hero band's scrim has
 *   to work. Default "full" suits a bright or busy image; "light" is for a
 *   hero image that already carries its own dark ground, where the full scrim
 *   would bury it.
 * @property {SectionCategory[]} categories
 * @property {"live"|"upcoming"} status
 */

/**
 * An essay after loading: frontmatter flattened onto the Markdown body. Note
 * heroImage is a bare path string here (decorative hero), not an Image object.
 * Long-form fields (title/summary/heroCaption/body) are LocalizedString: the
 * loader folds any `<slug>.fil.md` / `<slug>.de.md` sibling into them, and they
 * stay plain strings while no translation exists.
 * @typedef {object} Essay
 * @property {LocalizedString} title
 * @property {string} slug
 * @property {string} section
 * @property {LocalizedString} summary
 * @property {string} heroImage
 * @property {LocalizedString} [heroCaption]
 * @property {number} order
 * @property {string} author
 * @property {string} [category]
 * @property {LocalizedString} body
 */

/**
 * A standalone content page after loading (content/pages/*.md). heroImage, when
 * present, is a bare path string.
 * Long-form fields (title/intro/bodyHeading/body) are LocalizedString — see Essay.
 * @typedef {object} ContentPage
 * @property {LocalizedString} title
 * @property {string} slug
 * @property {LocalizedString} [intro]
 * @property {string} [heroImage]
 * @property {LocalizedString} [bodyHeading]
 * @property {string} [author]
 * @property {boolean} [personaCards]
 * @property {LocalizedString} body
 */

/**
 * One institution blurb on the About page.
 * @typedef {object} AboutBlurb
 * @property {LocalizedString} heading
 * @property {LocalizedString} body
 */

/**
 * One dignitary "message" card: real poster + caption; the player loads on click
 * from `video` (path under static/video/), so hosting can change without markup.
 * @typedef {object} AboutMessage
 * @property {string} name
 * @property {LocalizedString} role
 * @property {Image} poster
 * @property {string} [video] - basePath-relative, shipped from static/video/
 */

/**
 * About-page content (content/about.json).
 * @typedef {object} About
 * @property {LocalizedString} intro
 * @property {AboutBlurb[]} blurbs
 * @property {LocalizedString} messagesHeading
 * @property {AboutMessage[]} messages
 */

/**
 * A legacy → new URL redirect (content/redirects.json).
 * @typedef {object} Redirect
 * @property {string} from
 * @property {string} to
 */

/**
 * The full return of loadContent(): every validated collection, ready to render.
 * @typedef {object} SiteContent
 * @property {Site} site
 * @property {Section[]} sections
 * @property {ContentObject[]} objects
 * @property {Person[]} people
 * @property {Essay[]} essays
 * @property {ContentPage[]} pages
 * @property {About} about
 * @property {Redirect[]} redirects
 * @property {Record<string, Record<string, string>>} i18n - UI message catalogs keyed by locale id
 */

export {};
