# Live-site content harvester (feature 11b)

Build-time only. **Never imported by `build.js` or shipped** — this is a
one-off (re-runnable) tool that pulls the client's own text and images off
the live phase-1 site (`rizal.nationalmuseum.gov.ph`) into a local staging
area, so features 11d–11g can curate real content into `content/` and
`assets-src/` without hitting the network themselves. Zero phase-1 markup,
CSS classes, or template assets are reused anywhere in the rebuild — only the
raw prose and images extracted here.

## Usage

```
node scripts/migrate/harvest.js [--force] [--only=ethnographer,scholar,sections,pages]
```

- No flags: harvest everything, skipping anything already staged.
- `--force`: re-download/re-fetch everything, ignoring the cache.
- `--only=...`: comma-separated subset of `ethnographer`, `scholar`,
  `sections`, `pages` (see Output below).

Every run prints a summary (`fetched=… cached=… failed=…`) and writes
`scripts/migrate/staging/manifest.json`, which records every source URL, its
local path, byte size, and fetch status. **Idempotent**: re-running the same
command does no network I/O for anything already on disk — delete
`scripts/migrate/staging/` (or pass `--force`) to start over.

`scripts/migrate/staging/` is gitignored. Nothing here is committed directly;
11d–11g copy the specific files they curate into `content/` and
`assets-src/` by hand.

## Source pages

Base URL comes from `content/site.json` `baseUrl` (rule 7 — never hardcoded
elsewhere). Pages fetched:

| Section | Listing | Detail pages |
|---|---|---|
| Ethnographer | `ethnographer.html` | `ethnographer/<slug>.html` × 21 (all objects, discovered from the listing — not hardcoded) |
| Scholar | `scholar.html` | `scholar_pages/friend<N>.html` × 12 (discovered from the listing) |
| Hero / Artist | `hero.html`, `artist.html` | — (editorial is inline) |
| Standalone | `overview.html`, `rizal_germany.html`, `aboutus.html` | — |

Object/person **image folders** follow
`assets/images/ethno/asethno/<order><slug>/` and
`assets/images/scholar/Friend <N>/` respectively — see
`ethnographer.html`'s listing markup for the pattern.

## Output layout

```
scripts/migrate/staging/
  manifest.json                    every fetched URL -> local path
  .cache/pages/                    raw HTML, so re-runs don't re-fetch
  text/
    ethnographer/objects.json      21 objects: order, folderSlug, titleEn,
                                    titleVernacular, category, description,
                                    condition, otherDetails, images[]
    scholar/people.json            12 people: name, author, pullQuote, bio, images[]
    sections/{hero,artist,ethnographer,scholar}.md   editorial as ordered
                                    heading/byline/paragraph/image Markdown
    essays/<section>-<slug>.md     "Read more" modal essays (frontmatter:
                                    title, section, author, sourceModalId)
    pages/{jose-rizal,rizal-in-germany,about}.md
  images/
    ethnographer/<order>-<folderSlug>/...
    scholar/friend<N>/...
    pages/<slug>/...
    essays/<slug>/...
```

Object/person **ids are not assigned here** — the live site's URL slugs
(`hat.html`, `friend6.html`, …) don't match the rebuild's kebab-case ids
(`salakot`, `ferdinand-blumentritt`). Staging keys off the live `order`
number / folder name; 11d–11g pick the final id when copying into
`content/` and `assets-src/`, same as `salakot`/`tangkulu`/
`ferdinand-blumentritt` already do.

## Known quirks handled

- The ethnographer listing repeats every card in a "featured" strip and the
  full grid — deduped by order number.
- The source has several HTML-commented-out `<p>`/`<h2>` blocks (copy-paste
  leftovers between page templates, e.g. every `scholar_pages/friendN.html`
  carries the *Hero* page's tagline in a comment) — comments are stripped
  before any extraction.
- "Read more" links don't go to separate pages; the full essay text lives in
  a same-page Bootstrap modal (`<div class="modal fade" id="...">`), while
  the inline paragraph is a truncated teaser. `extractModals` /
  `extractBalancedDiv` in `lib/extract.js` pull the modal body out (regex
  can't isolate it directly — the amount of nested markup varies per essay).
- Essay titles inside modals use `<h4>`, section page headings use `<h2>` —
  both are treated as "heading" nodes.

## Gaps found (not fixed here — logged for 11d–14)

- **No object image credit anywhere** on the ethnographer object pages —
  open question #4 remains unresolved; `rights` text must stay a flagged
  placeholder until the client confirms wording (same convention as the
  already-shipped `salakot`/`tangkulu`).
- Scholar people occasionally carry an inline **"Photo Credit: …"** line at
  the end of the bio prose (not a separate field) — worth pulling out into
  `portrait.credit` during curation.
- The live site has **12** scholar "friends", not the 9 `content-gaps.md`
  currently describes.
- Artist section objects (Prometheus Bound, La Venganza de la Madre, San
  Pablo el Ermitaño, …) are named only in the editorial prose — the live
  site has no per-object Artist pages/images to harvest; that catalog still
  needs to come from the client.
- `rizal_germany.html`'s full text includes one more paragraph than what's
  currently in `content/pages/rizal-in-germany.md` (the tail cut off at the
  `old/current-germany.png` screenshot fold) — recovered verbatim in
  `text/pages/rizal-in-germany.md`, ready to merge in 14.
