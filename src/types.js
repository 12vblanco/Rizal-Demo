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
 */

/**
 * A label + href pair — nav children, footer links, hero/footer CTAs.
 * @typedef {object} Link
 * @property {string} label
 * @property {string} href
 */

/**
 * A top-level nav entry; `children` makes it the Jose Rizal disclosure dropdown.
 * @typedef {object} NavItem
 * @property {string} label
 * @property {string} href
 * @property {Link[]} [children]
 */

/**
 * Landing-page pull-quote (optional site.json slot).
 * @typedef {object} HomeQuote
 * @property {string} text
 * @property {string} attribution
 * @property {string} [lang]
 */

/**
 * One landing-page teaser card (optional site.json slot).
 * @typedef {object} HomeTeaser
 * @property {string} heading
 * @property {string} href
 * @property {string} [text]
 * @property {Image} [image]
 * @property {string} [accent]
 */

/**
 * The footer's About/contact headings block (site.json `footer`).
 * @typedef {object} SiteFooter
 * @property {string} aboutHeading
 * @property {string} aboutText
 * @property {string} contactHeading
 */

/**
 * Museum contact details (site.json `contact`).
 * @typedef {object} Contact
 * @property {string} address
 * @property {string} email
 * @property {string} phone
 */

/**
 * A partner/collaborator logo lockup. `chip` gives a white backing on dark.
 * @typedef {object} Partner
 * @property {string} name
 * @property {string} logo
 * @property {boolean} [chip]
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
 * @property {string} siteTitle
 * @property {string} siteSubtitle
 * @property {string} exhibitionTitle
 * @property {string} exhibitionSubtitle
 * @property {string} homeTitle
 * @property {string} baseUrl
 * @property {string} basePath
 * @property {string} language
 * @property {string} description
 * @property {string} copyright
 * @property {Link[]} [heroCtas]
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
 * @property {string} objectType
 * @property {string} [materials]
 * @property {string} [dimensions]
 * @property {string} [accession]
 * @property {string} description
 * @property {string} [condition]
 * @property {Image[]} images
 * @property {string} rights
 * @property {Model3d} [model3d]
 * @property {string[]} related
 * @property {boolean} featured
 * @property {Hotspot[]} [hotspots]
 */

/**
 * A person record (content/people/*.json).
 * @typedef {object} Person
 * @property {string} id
 * @property {string} section
 * @property {number} order
 * @property {string} name
 * @property {string} role
 * @property {string} lifespan
 * @property {Image} portrait
 * @property {string} bio
 * @property {string[]} relatedObjects
 * @property {string[]} relatedPeople
 */

/**
 * A category tab within a section.
 * @typedef {object} SectionCategory
 * @property {string} id
 * @property {string} label
 */

/**
 * A persona section (content/sections/*.json). `status` alone flips the grid
 * area between the live and upcoming states.
 * @typedef {object} Section
 * @property {string} id
 * @property {string} title
 * @property {string} intro
 * @property {Image} heroImage
 * @property {SectionCategory[]} categories
 * @property {"live"|"upcoming"} status
 */

/**
 * An essay after loading: frontmatter flattened onto the Markdown body. Note
 * heroImage is a bare path string here (decorative hero), not an Image object.
 * @typedef {object} Essay
 * @property {string} title
 * @property {string} slug
 * @property {string} section
 * @property {string} summary
 * @property {string} heroImage
 * @property {string} [heroCaption]
 * @property {number} order
 * @property {string} author
 * @property {string} [category]
 * @property {string} body
 */

/**
 * A standalone content page after loading (content/pages/*.md). heroImage, when
 * present, is a bare path string.
 * @typedef {object} ContentPage
 * @property {string} title
 * @property {string} slug
 * @property {string} [intro]
 * @property {string} [heroImage]
 * @property {string} [bodyHeading]
 * @property {string} [author]
 * @property {boolean} [personaCards]
 * @property {string} body
 */

/**
 * One institution blurb on the About page.
 * @typedef {object} AboutBlurb
 * @property {string} heading
 * @property {string} body
 */

/**
 * One dignitary "message" card: real poster + caption; the player loads on click
 * from `video` (path under static/video/), so hosting can change without markup.
 * @typedef {object} AboutMessage
 * @property {string} name
 * @property {string} role
 * @property {Image} poster
 * @property {string} [video]
 */

/**
 * About-page content (content/about.json).
 * @typedef {object} About
 * @property {string} intro
 * @property {AboutBlurb[]} blurbs
 * @property {string} messagesHeading
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
 */

export {};
