// @ts-check
// Dev workflow: build, watch, serve /dist with live reload (SSE).

import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import chokidar from "chokidar";

process.env.DEV = "1";
const { build } = await import("../build.js");

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
  ".mp4": "video/mp4",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
};

/** @type {Set<import("node:http").ServerResponse>} */
const sseClients = new Set();

async function rebuild() {
  try {
    await build();
    for (const res of sseClients) res.write("data: reload\n\n");
  } catch (err) {
    console.error("[dev] build failed:", err instanceof Error ? err.message : err);
  }
}

await rebuild();

chokidar
  .watch(["content", "css", "js", "src", "static", "build.js"], { cwd: root, ignoreInitial: true })
  .on("all", (event, file) => {
    console.log(`[dev] ${event}: ${file}`);
    rebuild();
  });

createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  if (url.pathname === "/__reload") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    sseClients.add(res);
    req.on("close", () => sseClients.delete(res));
    return;
  }

  // Clean URLs: /foo/ → /foo/index.html (mirrors the CDN rewrite in production).
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
  console.log(`[dev] serving dist/ at http://localhost:${PORT} (live reload on)`);
});
