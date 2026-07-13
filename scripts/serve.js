// @ts-check
// Minimal static server for the built /dist — no watch, no reload. Used by the
// Playwright suite (playwright.config.js webServer) and handy for previewing a
// production build. Clean URLs (/foo/ → /foo/index.html) mirror the CDN rewrite.

import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const PORT = Number(process.env.PORT) || 4173;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".mp4": "video/mp4",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
};

createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  let filePath = path.join(dist, decodeURIComponent(url.pathname));
  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }
  if (!existsSync(filePath)) {
    const notFound = path.join(dist, "404.html");
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    res.end(existsSync(notFound) ? readFileSync(notFound) : "404 Not Found");
    return;
  }
  res.writeHead(200, {
    "content-type": MIME[path.extname(filePath)] ?? "application/octet-stream",
    "cache-control": "no-store",
  });
  res.end(readFileSync(filePath));
}).listen(PORT, () => {
  console.log(`[serve] dist/ at http://localhost:${PORT}`);
});
