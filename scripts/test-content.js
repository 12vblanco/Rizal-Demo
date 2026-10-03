// @ts-check
// Content-validation tests. Confirms the real sample content passes, then
// mutates a throwaway copy one rule at a time and asserts the validator
// fails loudly with a message that names the broken rule. No test framework
// (allowed-deps rule) — plain assertions with a non-zero exit on failure.

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadContent } from "../src/content.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const realContent = path.join(root, "content");
const realAssets = path.join(root, "assets-src");

let passed = 0;
let failed = 0;
const ok = (name) => (passed++, console.log(`  ✓ ${name}`));
const bad = (name, detail) => (failed++, console.error(`  ✗ ${name}\n      ${detail}`));

// The real, committed content must always validate.
try {
  loadContent({ contentDir: realContent, assetsDir: realAssets });
  ok("valid sample content passes");
} catch (err) {
  bad("valid sample content passes", err instanceof Error ? err.message : String(err));
}

/**
 * Clone the real content into a temp dir, apply one bad mutation, and assert
 * that loading it throws an error mentioning `expect`.
 * @param {string} name
 * @param {(dir: string) => void} mutate
 * @param {string} expect - substring the error message must contain
 */
function expectFailure(name, mutate, expect) {
  const dir = mkdtempSync(path.join(tmpdir(), "rizal-content-"));
  try {
    cpSync(realContent, dir, { recursive: true });
    mutate(dir);
    let error = null;
    try {
      loadContent({ contentDir: dir, assetsDir: realAssets });
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err));
    }
    if (!error) {
      bad(name, "expected validation to fail, but it passed");
    } else if (!error.message.includes(expect)) {
      bad(name, `error did not mention "${expect}":\n${error.message}`);
    } else {
      ok(name);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Edit a JSON file inside the temp content dir. */
function editJson(dir, rel, fn) {
  const file = path.join(dir, rel);
  const data = JSON.parse(readFileSync(file, "utf8"));
  fn(data);
  writeFileSync(file, JSON.stringify(data, null, 2));
}

expectFailure(
  "missing alt fails",
  (dir) => editJson(dir, "objects/salakot.json", (o) => delete o.images[0].alt),
  "alt",
);

expectFailure(
  "empty alt fails",
  (dir) => editJson(dir, "objects/salakot.json", (o) => (o.images[0].alt = "  ")),
  "alt",
);

expectFailure(
  "unresolvable object related id fails",
  (dir) => editJson(dir, "objects/salakot.json", (o) => (o.related = ["ghost-object"])),
  "does not resolve to an object",
);

expectFailure(
  "unresolvable relatedObjects id fails",
  (dir) => editJson(dir, "people/ferdinand-blumentritt.json", (p) => (p.relatedObjects = ["ghost-object"])),
  "does not resolve to an object",
);

expectFailure(
  "unresolvable relatedPeople id fails",
  (dir) => editJson(dir, "people/ferdinand-blumentritt.json", (p) => (p.relatedPeople = ["ghost-person"])),
  "does not resolve to a person",
);

expectFailure(
  "category not declared in section fails",
  (dir) => editJson(dir, "objects/salakot.json", (o) => (o.category = "weaponry")),
  "not declared",
);

expectFailure(
  "missing referenced image file fails",
  (dir) => editJson(dir, "objects/salakot.json", (o) => (o.images[0].src = "salakot/does-not-exist.webp")),
  "not found in assets-src/images",
);

expectFailure(
  "missing referenced model file fails",
  (dir) =>
    editJson(dir, "objects/salakot.json", (o) => {
      o.model3d = { src: "does-not-exist.glb", poster: "salakot/front.webp", altText: "3D model of the salakot" };
    }),
  "not found in assets-src/models",
);

expectFailure(
  "duplicate id fails",
  (dir) => editJson(dir, "objects/tangkulu.json", (o) => (o.id = "salakot")),
  "duplicate",
);

expectFailure(
  "non-kebab-case id fails",
  (dir) => editJson(dir, "objects/salakot.json", (o) => (o.id = "Salakot_16")),
  "kebab-case",
);

expectFailure(
  "non-kebab-case filename fails",
  (dir) => writeFileSync(path.join(dir, "objects", "Bad_Name.json"), "{}\n"),
  "(filename)",
);

expectFailure(
  "placeholder text in content fails",
  (dir) => editJson(dir, "objects/salakot.json", (o) => (o.condition += " TODO finish this")),
  "placeholder",
);

expectFailure(
  "id not matching filename fails",
  (dir) => editJson(dir, "objects/salakot.json", (o) => (o.id = "salako")),
  "must match its filename",
);

expectFailure(
  "bad site baseUrl fails",
  (dir) => editJson(dir, "site.json", (s) => (s.baseUrl = "https://rizal.nationalmuseum.gov.ph/")),
  "trailing slash",
);

expectFailure(
  "malformed redirect target fails",
  (dir) => editJson(dir, "redirects.json", (r) => r.push({ from: "legacy.html", to: "no-leading-slash" })),
  "clean kebab-case",
);

expectFailure(
  "duplicate redirect source fails",
  (dir) => editJson(dir, "redirects.json", (r) => r.push({ from: "rizal.html", to: "/" })),
  "duplicate redirect source",
);

/**
 * Clone the real content, apply a mutation, and assert it still validates.
 * The mirror of expectFailure — used where a flag is meant to *permit* something.
 * @param {string} name
 * @param {(dir: string) => void} mutate
 */
function expectSuccess(name, mutate) {
  const dir = mkdtempSync(path.join(tmpdir(), "rizal-content-"));
  try {
    cpSync(realContent, dir, { recursive: true });
    mutate(dir);
    try {
      loadContent({ contentDir: dir, assetsDir: realAssets });
      ok(name);
    } catch (err) {
      bad(name, err instanceof Error ? err.message : String(err));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// --- the `draft` flag ------------------------------------------------------
// It must open exactly one door (filler text on a knowingly-unfinished record)
// and no others: the guard has to stay live everywhere it is not set.

expectSuccess(
  "draft record may carry stand-in text",
  (dir) => editJson(dir, "objects/salakot.json", (o) => {
    o.draft = true;
    o.description = "Lorem ipsum — catalogue text pending.";
  }),
);

expectFailure(
  "non-draft record still rejects filler",
  (dir) => editJson(dir, "objects/salakot.json", (o) => {
    o.description = "Lorem ipsum — catalogue text pending.";
  }),
  "placeholder",
);

expectFailure(
  "draft must be a boolean",
  (dir) => editJson(dir, "objects/salakot.json", (o) => (o.draft = "yes")),
  "must be a boolean",
);

expectSuccess(
  "draft object may omit its description",
  (dir) => editJson(dir, "objects/salakot.json", (o) => {
    o.draft = true;
    delete o.description;
  }),
);

expectFailure(
  "non-draft object still requires a description",
  (dir) => editJson(dir, "objects/salakot.json", (o) => delete o.description),
  "description",
);

expectSuccess(
  "draft person may omit role and biography",
  (dir) => editJson(dir, "people/ferdinand-blumentritt.json", (p) => {
    p.draft = true;
    delete p.role;
    delete p.bio;
  }),
);

expectFailure(
  "non-draft person still requires a biography",
  (dir) => editJson(dir, "people/ferdinand-blumentritt.json", (p) => delete p.bio),
  "bio",
);

// --- object titles ---------------------------------------------------------
// `en` is the guaranteed slot; `tl`/`es` are curatorial extras an artwork may lack.

expectSuccess(
  "object title may carry en alone",
  (dir) => editJson(dir, "objects/salakot.json", (o) => (o.title = { en: "Hat" })),
);

expectFailure(
  "object title still requires en",
  (dir) => editJson(dir, "objects/salakot.json", (o) => (o.title = { tl: "Salakot" })),
  "title.en",
);

console.log(`\ncontent tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
