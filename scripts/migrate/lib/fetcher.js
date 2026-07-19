// Idempotent, logged fetch/download helpers for the harvester. Every fetch
// (HTML page or image) is recorded in a manifest keyed by source URL, and
// re-runs skip anything already staged on disk unless `--force` is passed.

import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";

import { stripComments } from "./extract.js";

const USER_AGENT =
  "rizal-digital-exhibition-migrate/1.0 (+build-time content harvester, National Museum of the Philippines rebuild)";

export class Harvester {
  /**
   * @param {{baseUrl: string, stagingDir: string, force?: boolean, delayMs?: number}} opts
   */
  constructor({ baseUrl, stagingDir, force = false, delayMs = 150 }) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.stagingDir = stagingDir;
    this.force = force;
    this.delayMs = delayMs;
    this.cacheDir = path.join(stagingDir, ".cache", "pages");
    this.manifestPath = path.join(stagingDir, "manifest.json");
    /** @type {Array<{url: string, localPath: string, type: string, bytes: number, status: string, fetchedAt: string}>} */
    this.manifest = [];
    this.counts = { fetched: 0, skipped: 0, failed: 0 };
  }

  async loadManifest() {
    if (existsSync(this.manifestPath)) {
      try {
        const raw = await readFile(this.manifestPath, "utf8");
        this.manifest = JSON.parse(raw).entries ?? [];
      } catch {
        this.manifest = [];
      }
    }
  }

  async saveManifest() {
    await mkdir(this.stagingDir, { recursive: true });
    await writeFile(
      this.manifestPath,
      JSON.stringify(
        { generatedAt: new Date().toISOString(), baseUrl: this.baseUrl, entries: this.manifest },
        null,
        2
      ) + "\n"
    );
  }

  /** @param {string} url @param {string} localPath @param {string} type */
  recordManifest(url, localPath, type, bytes, status) {
    this.manifest = this.manifest.filter((e) => e.url !== url);
    this.manifest.push({
      url,
      localPath: path.relative(this.stagingDir, localPath),
      type,
      bytes,
      status,
      fetchedAt: new Date().toISOString(),
    });
  }

  async sleep() {
    if (this.delayMs > 0) await new Promise((r) => setTimeout(r, this.delayMs));
  }

  /**
   * Fetch an HTML page (relative to baseUrl), caching the raw response.
   * @param {string} urlPath e.g. "ethnographer/hat.html"
   * @returns {Promise<string>}
   */
  async fetchPage(urlPath) {
    const url = `${this.baseUrl}/${urlPath}`;
    const cachePath = path.join(this.cacheDir, urlPath.replace(/\//g, "__"));
    if (!this.force && existsSync(cachePath)) {
      this.counts.skipped++;
      this.recordManifest(url, cachePath, "page", statSync(cachePath).size, "cached");
      return stripComments(await readFile(cachePath, "utf8"));
    }
    const res = await fetch(encodeURI(url), { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) {
      this.counts.failed++;
      throw new Error(`GET ${url} -> ${res.status}`);
    }
    const html = await res.text();
    mkdirSync(path.dirname(cachePath), { recursive: true });
    await writeFile(cachePath, html, "utf8");
    this.counts.fetched++;
    this.recordManifest(url, cachePath, "page", Buffer.byteLength(html), "fetched");
    await this.sleep();
    return stripComments(html);
  }

  /**
   * Download a binary asset (relative to baseUrl) to an absolute local path.
   * @param {string} urlPath
   * @param {string} destPath
   */
  async downloadFile(urlPath, destPath) {
    const url = `${this.baseUrl}/${urlPath}`;
    if (!this.force && existsSync(destPath) && statSync(destPath).size > 0) {
      this.counts.skipped++;
      this.recordManifest(url, destPath, "image", statSync(destPath).size, "cached");
      return { status: "cached", destPath };
    }
    const res = await fetch(encodeURI(url), { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) {
      this.counts.failed++;
      console.warn(`  ! GET ${url} -> ${res.status}`);
      return { status: "failed", destPath: null };
    }
    await mkdir(path.dirname(destPath), { recursive: true });
    await finished(Readable.fromWeb(/** @type {any} */ (res.body)).pipe(createWriteStream(destPath)));
    const bytes = statSync(destPath).size;
    this.counts.fetched++;
    this.recordManifest(url, destPath, "image", bytes, "fetched");
    await this.sleep();
    return { status: "fetched", destPath };
  }
}
