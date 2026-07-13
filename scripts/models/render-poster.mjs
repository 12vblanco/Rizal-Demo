// Render an object's 3D poster from its GLB using the vendored model-viewer, so
// the still matches the FIRST frame the live viewer shows (same camera + lighting
// + 4/3 framing) — the model then reveals with no jump. Run from the repo root:
//
//   node scripts/models/render-poster.mjs [model.glb] [out.webp]
//
// Defaults render salakot.glb → assets-src/images/salakot/model-poster.webp.
// Keep MODEL_VIEW in sync with the <model-viewer> attributes in js/main.js and
// js/viewer.js (that is what makes the poster→model transition seamless).
import http from "node:http";
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import sharp from "sharp";

// The canonical framing + lighting. Mirror in js/main.js and js/viewer.js.
const MODEL_VIEW = {
  cameraOrbit: "20deg 70deg auto",
  shadowIntensity: "1",
  shadowSoftness: "0.9",
  exposure: "1.05",
};
const ASPECT = [4, 3]; // must match .object-gallery__img / .object-gallery__model-viewer
const OUT_WIDTH = 1600; // pipeline caps here anyway

const repo = process.cwd();
const modelFile = process.argv[2] || "salakot.glb";
const outPath = path.resolve(
  repo,
  process.argv[3] || "assets-src/images/salakot/model-poster.webp",
);
const vendor = path.join(repo, "static/vendor/model-viewer");
const tmp = path.join(process.env.SCRATCH || "/tmp", "mv-render");
mkdirSync(tmp, { recursive: true });

// Stage the assets same-origin so the module + GLB load without CORS issues.
copyFileSync(path.join(vendor, "model-viewer.min.js"), path.join(tmp, "model-viewer.min.js"));
copyFileSync(path.join(vendor, "meshopt_decoder.js"), path.join(tmp, "meshopt_decoder.js"));
copyFileSync(path.join(repo, "assets-src/models", modelFile), path.join(tmp, "model.glb"));

const w = 1600;
const h = Math.round((w * ASPECT[1]) / ASPECT[0]);
const html = `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;background:transparent}#mv{width:${w}px;height:${h}px;background:transparent}</style>
</head><body>
<script type="module">
import { ModelViewerElement } from "./model-viewer.min.js";
ModelViewerElement.meshoptDecoderLocation = "./meshopt_decoder.js";
const mv = document.createElement("model-viewer");
mv.id = "mv";
mv.setAttribute("src", "model.glb");
mv.setAttribute("camera-controls", "");
mv.setAttribute("camera-orbit", ${JSON.stringify(MODEL_VIEW.cameraOrbit)});
mv.setAttribute("shadow-intensity", ${JSON.stringify(MODEL_VIEW.shadowIntensity)});
mv.setAttribute("shadow-softness", ${JSON.stringify(MODEL_VIEW.shadowSoftness)});
mv.setAttribute("exposure", ${JSON.stringify(MODEL_VIEW.exposure)});
mv.setAttribute("interaction-prompt", "none");
window.__ready = new Promise((res) => mv.addEventListener("load", res, { once: true }));
document.body.appendChild(mv);
window.__mv = mv;
</script>
</body></html>`;
writeFileSync(path.join(tmp, "index.html"), html);

const MIME = { ".html": "text/html", ".js": "text/javascript", ".glb": "model/gltf-binary" };
const server = http.createServer((req, res) => {
  const rel = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  try {
    const body = readFileSync(path.join(tmp, rel));
    res.writeHead(200, { "content-type": MIME[path.extname(rel)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: w + 100, height: h + 100 },
  deviceScaleFactor: 2,
});
await page.goto(`http://localhost:${port}/`);
await page.evaluate(() => window.__ready); // model loaded
await page.waitForTimeout(700); // let IBL + shadow settle
const dataUrl = await page.evaluate(() => window.__mv.toDataURL("image/png"));
await browser.close();
server.close();

// No trim: keep the exact 4/3 frame model-viewer produced, so the poster and the
// live model line up pixel-for-pixel. Alpha preserved for the light gallery band.
const png = Buffer.from(dataUrl.split(",")[1], "base64");
await sharp(png)
  .resize({ width: OUT_WIDTH, withoutEnlargement: true })
  .webp({ quality: 90 })
  .toFile(outPath);
const meta = await sharp(readFileSync(outPath)).metadata();
console.log(`Wrote ${outPath} (${meta.width}x${meta.height}, ${(readFileSync(outPath).length / 1024).toFixed(1)} KB)`);
