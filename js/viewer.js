// The zoom viewer (feature 09). Lazy-loaded on intent by js/main.js, so both
// this module and OpenSeadragon stay out of the base-page JS budget (≤ 60 KB).
//
// Presents an object's images in a native <dialog> (focus trap + Esc + backdrop
// click, all built in) with OpenSeadragon deep zoom over the build-time DZI
// tiles — passed as an INLINE descriptor, so no .dzi XML is fetched. A thumbnail
// strip and prev/next arrows cycle the object's IMAGES; the page beneath cycles
// OBJECTS, so the two are kept visually distinct. Opening pushes a #view=<n>
// history entry so the back button closes the overlay and states deep-link.
//
// Without JS none of this runs: the gallery already links each image to its
// full-resolution file, so the page is fully usable (progressive enhancement).

// OpenSeadragon is a UMD global (no ESM build); resolve it next to this module
// (dist/assets/viewer.js → ../vendor/openseadragon/…) regardless of basePath.
const OSD_SRC = new URL(
  "../vendor/openseadragon/openseadragon.min.js",
  import.meta.url,
).href;

// Minimal inline glyphs — this module builds its own chrome (no server icons).
const svg = (paths, extra = "") =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${paths}</svg>`;
const ICON = {
  close: svg('<path d="M6 6 18 18M18 6 6 18"/>'),
  zoomIn: svg('<circle cx="10" cy="10" r="7"/><path d="M21 21l-6-6M10 7v6M7 10h6"/>'),
  zoomOut: svg('<circle cx="10" cy="10" r="7"/><path d="M21 21l-6-6M7 10h6"/>'),
  prev: svg('<path d="m15 6-6 6 6 6"/>'),
  next: svg('<path d="m9 6 6 6-6 6"/>'),
};

// The vendored @google/model-viewer ESM (self-registers <model-viewer>);
// resolved next to this module (dist/assets/viewer.js → ../vendor/…). Loaded on
// intent, only when a 3D item is shown, so it never enters the base bundle.
let modelViewerPromise;
function loadModelViewer() {
  return (modelViewerPromise ??= import(
    new URL("../vendor/model-viewer/model-viewer.min.js", import.meta.url).href
  ).then((mod) => {
    mod.ModelViewerElement.meshoptDecoderLocation = new URL(
      "../vendor/model-viewer/meshopt_decoder.js",
      import.meta.url,
    ).href;
    return mod;
  }));
}

let osdPromise; // resolves to the OpenSeadragon factory once the script loads
function loadOpenSeadragon() {
  if (window.OpenSeadragon) return Promise.resolve(window.OpenSeadragon);
  osdPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = OSD_SRC;
    s.addEventListener("load", () => resolve(window.OpenSeadragon));
    s.addEventListener("error", () => reject(new Error("OpenSeadragon failed to load")));
    document.head.append(s);
  });
  return osdPromise;
}

/** Build an OpenSeadragon tile source for one image descriptor. */
function tileSource(img) {
  if (img.dz) {
    // Inline Deep Zoom descriptor — OSD requests tiles directly from
    // <Url><level>/<col>_<row>.<Format>, so the .dzi XML is never fetched.
    return {
      Image: {
        xmlns: "http://schemas.microsoft.com/deepzoom/2008",
        Url: img.dz.url,
        Format: img.dz.format,
        Overlap: String(img.dz.overlap),
        TileSize: String(img.dz.tileSize),
        Size: { Width: img.dz.width, Height: img.dz.height },
      },
    };
  }
  // Not tiled: OSD's simple-image source over the full-resolution file.
  return { type: "image", url: img.full };
}

// --- singleton state -------------------------------------------------------
let dialog;
let osd;
let osdEl;
let modelEl;
let modelViewer; // the <model-viewer> element, created on first 3D view
let zoombarEl;
let stripEl;
let creditEl;
let navPrev;
let navNext;
let images = [];
let index = 0;
let historyPushed = false;
let onChange = null; // called with the current index so the page gallery can follow

function buildDialog() {
  if (dialog) return;
  dialog = document.createElement("dialog");
  dialog.className = "viewer";
  dialog.setAttribute("aria-label", "Image viewer");
  dialog.innerHTML = `
    <div class="viewer__stage">
      <div class="viewer__osd"></div>
      <div class="viewer__model" hidden></div>
      <div class="viewer__zoombar">
        <button class="viewer__btn" type="button" data-act="zoom-in">${ICON.zoomIn}<span class="visually-hidden">Zoom in</span></button>
        <button class="viewer__btn" type="button" data-act="zoom-out">${ICON.zoomOut}<span class="visually-hidden">Zoom out</span></button>
      </div>
      <button class="viewer__btn viewer__close" type="button" data-act="close">${ICON.close}<span class="visually-hidden">Close viewer</span></button>
      <button class="viewer__btn viewer__nav viewer__nav--prev" type="button" data-act="prev">${ICON.prev}<span class="visually-hidden">Previous image</span></button>
      <button class="viewer__btn viewer__nav viewer__nav--next" type="button" data-act="next">${ICON.next}<span class="visually-hidden">Next image</span></button>
    </div>
    <div class="viewer__footer">
      <p class="viewer__credit"></p>
      <ul class="viewer__strip"></ul>
    </div>`;
  document.body.append(dialog);

  osdEl = dialog.querySelector(".viewer__osd");
  modelEl = dialog.querySelector(".viewer__model");
  zoombarEl = dialog.querySelector(".viewer__zoombar");
  stripEl = dialog.querySelector(".viewer__strip");
  creditEl = dialog.querySelector(".viewer__credit");
  navPrev = dialog.querySelector(".viewer__nav--prev");
  navNext = dialog.querySelector(".viewer__nav--next");

  // Delegated controls.
  dialog.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-act]");
    if (btn) {
      const act = btn.getAttribute("data-act");
      if (act === "close") closeViewer();
      else if (act === "prev") setImage(index - 1);
      else if (act === "next") setImage(index + 1);
      else if (act === "zoom-in") zoom(1.6);
      else if (act === "zoom-out") zoom(1 / 1.6);
      return;
    }
    const thumb = event.target.closest("[data-idx]");
    if (thumb) setImage(Number(thumb.getAttribute("data-idx")));
    // Backdrop click (on the dialog element itself) closes.
    else if (event.target === dialog) closeViewer();
  });

  // Esc: native <dialog> fires `cancel`; keep the dialog open and route through
  // closeViewer so the pushed history entry is unwound too.
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeViewer();
  });
}

function zoom(by) {
  if (!osd) return;
  osd.viewport.zoomBy(by);
  osd.viewport.applyConstraints();
}

async function ensureOSD() {
  if (osd) return;
  const OpenSeadragon = await loadOpenSeadragon();
  osd = OpenSeadragon({
    element: osdEl,
    prefixUrl: "", // custom buttons below — no nav-button sprite images needed
    showNavigationControl: false,
    showNavigator: true,
    // Minimap upper-right but inset below the close button so they don't collide.
    navigatorPosition: "ABSOLUTE",
    navigatorTop: "58px",
    navigatorRight: "12px",
    navigatorHeight: "104px",
    navigatorWidth: "148px",
    navigatorAutoFade: false,
    navigatorBackground: "#1a1a1a",
    tileSources: [],
    maxZoomPixelRatio: 2,
    visibilityRatio: 1,
    constrainDuringPan: true,
    animationTime: 0.4,
    gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: true },
  });
  osd.addHandler("open", () => dialog.classList.remove("is-loading"));
}

function renderStrip() {
  stripEl.innerHTML = images
    .map(
      (img, i) =>
        `<li><button class="viewer__thumb${img.model ? " viewer__thumb--model" : ""}" type="button" data-idx="${i}"${
          i === index ? ' aria-current="true"' : ""
        }>${img.model ? '<span class="viewer__thumb-badge" aria-hidden="true">3D</span>' : ""}<img src="${img.thumb}" alt="${escapeHtml(img.alt)}" loading="lazy"></button></li>`,
    )
    .join("");
  // A single-image object hides the strip and the prev/next arrows.
  const many = images.length > 1;
  stripEl.hidden = !many;
  navPrev.hidden = !many;
  navNext.hidden = !many;
}

function updateChrome() {
  const img = images[index];
  creditEl.textContent = img.credit || "";
  creditEl.hidden = !img.credit;
  for (const b of stripEl.querySelectorAll("[data-idx]")) {
    const on = Number(b.getAttribute("data-idx")) === index;
    if (on) b.setAttribute("aria-current", "true");
    else b.removeAttribute("aria-current");
  }
}

function syncHash({ push }) {
  const hash = `#view=${index + 1}`;
  const state = { viewer: true, i: index };
  if (push && !historyPushed) {
    history.pushState(state, "", hash);
    historyPushed = true;
  } else {
    history.replaceState(state, "", hash);
  }
}

/**
 * Show the 3D model item: hide the OSD stage + its zoom bar, reveal (and lazily
 * create) the <model-viewer>. model-viewer handles its own load/zoom/orbit.
 */
function showModel(img) {
  osdEl.hidden = true;
  zoombarEl.hidden = true;
  modelEl.hidden = false;
  dialog.classList.remove("is-loading");
  loadModelViewer()
    .then(() => {
      if (!modelViewer) {
        modelViewer = document.createElement("model-viewer");
        modelViewer.className = "viewer__model-viewer";
        modelViewer.setAttribute("camera-controls", "");
        modelViewer.setAttribute("touch-action", "pan-y");
        modelViewer.setAttribute("interaction-prompt", "none");
        // Same framing + lighting as the inline model / poster capture, so the
        // model looks consistent wherever it appears.
        modelViewer.setAttribute("camera-orbit", "20deg 70deg auto");
        modelViewer.setAttribute("shadow-intensity", "1");
        modelViewer.setAttribute("shadow-softness", "0.9");
        modelViewer.setAttribute("exposure", "1.05");
        modelViewer.setAttribute("ar", "");
        modelViewer.setAttribute("ar-modes", "webxr scene-viewer quick-look");
        modelEl.append(modelViewer);
      }
      modelViewer.setAttribute("src", img.model);
      modelViewer.setAttribute("alt", img.alt);
      if (img.full) modelViewer.setAttribute("poster", img.full);
    })
    .catch(() => {
      // Fall back to the poster image in the OSD stage if the library fails.
      modelEl.hidden = true;
      zoombarEl.hidden = false;
      osdEl.hidden = false;
      osd.open(tileSource(img));
    });
}

/** Show item i (wrapping): a 3D model, or an image reloaded into OSD. */
function setImage(i, opts = { push: false }) {
  index = ((i % images.length) + images.length) % images.length;
  const img = images[index];
  if (img.model) {
    showModel(img);
  } else {
    // Return to the OSD stage (may have been hidden by a prior 3D view).
    modelEl.hidden = true;
    zoombarEl.hidden = false;
    osdEl.hidden = false;
    dialog.classList.add("is-loading");
    osd.open(tileSource(img));
  }
  updateChrome();
  syncHash(opts);
  onChange?.(index); // keep the page gallery on the last item viewed here
}

/**
 * Open the viewer for a gallery at image `i`.
 * @param {Element} gallery the .object-gallery[data-viewer] element
 * @param {number} i        image index
 * @param {{deepLink?: boolean, onChange?: (i: number) => void}} [opts]
 *   deepLink = restoring from a #view=N URL; onChange = called with the current
 *   index whenever the viewed image changes, so the page gallery can follow.
 */
export async function open(gallery, i, opts = {}) {
  const data = gallery.querySelector(".object-gallery__data");
  if (!data) return;
  images = JSON.parse(data.textContent);
  if (!images.length) return;
  onChange = opts.onChange ?? null;

  buildDialog();
  if (!dialog.open) dialog.showModal();
  renderStrip();
  await ensureOSD();

  if (opts.deepLink) {
    // The URL already carries #view=N (this is the current history entry);
    // don't push another. Closing strips the hash in place.
    historyPushed = false;
    setImage(i, { push: false });
  } else {
    setImage(i, { push: true });
  }
}

function closeViewer() {
  if (dialog?.open) dialog.close();
  if (historyPushed) {
    historyPushed = false;
    history.back(); // pop the #view entry → URL returns to the object page
  } else if (location.hash.startsWith("#view")) {
    history.replaceState(null, "", location.pathname + location.search);
  }
}

// Back button (or any navigation off the #view entry) closes the overlay.
window.addEventListener("popstate", () => {
  if (dialog?.open) {
    historyPushed = false;
    dialog.close();
  }
});

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
