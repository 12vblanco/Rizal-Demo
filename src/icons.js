// @ts-check
// Inline SVG icon set. Every *.svg file in ./icons is read once at load and
// exposed by its basename (e.g. icons.instagram, icons["museum-mark"]), so
// templates interpolate the markup instead of pasting raw SVG. Icons paint
// with fill/stroke "currentColor" so CSS controls their colour and size.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "icons");

/** @type {Record<string, string>} */
export const icons = {};
for (const file of readdirSync(dir).filter((f) => f.endsWith(".svg"))) {
  icons[path.basename(file, ".svg")] = readFileSync(
    path.join(dir, file),
    "utf8",
  ).trim();
}
