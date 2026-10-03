// Render a GLB from the six axis directions into one contact sheet, so the
// correct up/front rotation can be read off by eye and recorded in the `MODELS`
// table in from-metashape.mjs. Run from the repo root:
//
//   node scripts/models/orient-sheet.mjs <model.glb> <out.png>
//
// A raw photogrammetry scan arrives in arbitrary camera-local coordinates and
// Metashape records no up-axis, so orientation cannot be derived from the data —
// it has to be looked at. Compare the sheet against the object's reference
// photograph in assets-src/images/<id>/ to decide which way is up and which way
// is front, then re-run from-metashape.mjs with that rotation.
import http from "node:http";
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const repo = process.cwd();
const modelFile = process.argv[2];
const outPath = process.argv[3];
const VIEWS = [
  ["+Y top",    "0deg 1deg auto"],
  ["+Z front",  "0deg 90deg auto"],
  ["+X right",  "90deg 90deg auto"],
  ["-Y bottom", "0deg 179deg auto"],
  ["-Z back",   "180deg 90deg auto"],
  ["-X left",   "-90deg 90deg auto"],
];
const W = 420, H = 315;

const vendor = path.join(repo, "static/vendor/model-viewer");
const tmp = path.join(process.env.SCRATCH || "/tmp", "mv-sheet");
mkdirSync(tmp, { recursive: true });
copyFileSync(path.join(vendor, "model-viewer.min.js"), path.join(tmp, "model-viewer.min.js"));
copyFileSync(path.join(vendor, "meshopt_decoder.js"), path.join(tmp, "meshopt_decoder.js"));
copyFileSync(path.join(repo, "assets-src/models", modelFile), path.join(tmp, "model.glb"));

writeFileSync(path.join(tmp, "index.html"), `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;background:#2b2b2b}#mv{width:${W}px;height:${H}px;background:#2b2b2b}</style>
</head><body><script type="module">
import { ModelViewerElement } from "./model-viewer.min.js";
ModelViewerElement.meshoptDecoderLocation = "./meshopt_decoder.js";
const mv = document.createElement("model-viewer");
mv.id = "mv";
mv.setAttribute("src", "model.glb");
mv.setAttribute("shadow-intensity", "1");
mv.setAttribute("exposure", "1.05");
mv.setAttribute("interaction-prompt", "none");
window.__ready = new Promise((r) => mv.addEventListener("load", r, { once: true }));
document.body.appendChild(mv);
window.__mv = mv;
</script></body></html>`);

const MIME = { ".html": "text/html", ".js": "text/javascript", ".glb": "model/gltf-binary" };
const server = http.createServer((req, res) => {
  const rel = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  try {
    const body = readFileSync(path.join(tmp, rel));
    res.writeHead(200, { "content-type": MIME[path.extname(rel)] || "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, r));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W + 40, height: H + 40 } });
await page.goto(`http://localhost:${server.address().port}/`);
await page.evaluate(() => window.__ready);
// Frame once, here: updateFraming() also resets the orbit to the default, so
// calling it inside the loop would render the same default view six times.
await page.evaluate(async () => {
  await window.__mv.updateFraming();
  await window.__mv.updateComplete;
});
await page.waitForTimeout(600);

const tiles = [];
for (const [label, orbit] of VIEWS) {
  await page.evaluate(async (o) => {
    window.__mv.setAttribute("camera-orbit", o);
    await window.__mv.updateComplete;
    window.__mv.jumpCameraToGoal();
  }, orbit);
  await page.waitForTimeout(600);
  const url = await page.evaluate(() => window.__mv.toDataURL("image/png"));
  const png = Buffer.from(url.split(",")[1], "base64");
  tiles.push(await sharp(png).resize(W, H, { fit: "fill" }).composite([{
    input: Buffer.from(`<svg width="${W}" height="${H}"><text x="10" y="26" font-family="sans-serif" font-size="20" fill="#ffe08a" stroke="#000" stroke-width="3" paint-order="stroke">${label}</text></svg>`),
    top: 0, left: 0,
  }]).png().toBuffer());
}
await browser.close();
server.close();

await sharp({ create: { width: W * 3, height: H * 2, channels: 3, background: "#111" } })
  .composite(tiles.map((input, i) => ({ input, left: (i % 3) * W, top: Math.floor(i / 3) * H })))
  .png().toFile(outPath);
console.log("wrote", outPath);
