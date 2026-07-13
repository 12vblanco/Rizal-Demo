// Site enhancements (vanilla ES module). The site is fully usable without
// this file — JS only layers behaviour on top (spec: progressive enhancement).
// Nav toggle, scroll reveals, and the viewers arrive with their features
// (05, 06, 09, 10).

// Hero background video: play only when motion is welcome. The markup carries
// no `autoplay`, so reduced-motion users and JS-off users keep the poster still
// (spec: all motion behind prefers-reduced-motion). Muted + inline so browser
// autoplay policies allow programmatic play().
const heroVideo = document.querySelector(".hero__video");
if (heroVideo instanceof HTMLVideoElement &&
    window.matchMedia("(prefers-reduced-motion: no-preference)").matches) {
  heroVideo.play().catch(() => {
    /* Autoplay blocked (e.g. Low Power Mode) — the poster still remains. */
  });
}

// Navigation: mobile hamburger menu + accessible Jose-Rizal submenu disclosure
// (feature 06). This is functional (not decorative) enhancement, so it runs
// regardless of motion preference. Without JS the parent links and footer still
// reach every section, so the menu degrades gracefully.
const nav = document.querySelector(".site-nav");
if (nav) {
  const menuToggle = nav.querySelector(".site-nav__toggle");
  const dropdownToggles = [...nav.querySelectorAll(".nav-dropdown__toggle")];

  const closeDropdowns = () => {
    for (const t of dropdownToggles) t.setAttribute("aria-expanded", "false");
  };

  menuToggle?.addEventListener("click", () => {
    const open = menuToggle.getAttribute("aria-expanded") === "true";
    menuToggle.setAttribute("aria-expanded", String(!open));
    if (open) closeDropdowns(); // closing the panel collapses its submenus too
  });

  for (const toggle of dropdownToggles) {
    toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") === "true";
      closeDropdowns();
      toggle.setAttribute("aria-expanded", String(!open));
    });
  }

  // Escape collapses the open submenu and returns focus to its button.
  nav.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const open = dropdownToggles.find((t) => t.getAttribute("aria-expanded") === "true");
    if (open) {
      open.setAttribute("aria-expanded", "false");
      open.focus();
    }
  });

  // A click anywhere outside the nav closes any open submenu.
  document.addEventListener("click", (event) => {
    if (!nav.contains(/** @type {Node} */ (event.target))) closeDropdowns();
  });
}

// Section-page scroll reveals (feature 05). Cards fade/slide in as they enter
// the viewport — but only when motion is welcome, and only as an enhancement:
// the .reveal-ready gate is added by JS, so JS-off and reduced-motion users
// always see the cards. Scoped to .section-body so detail-page grids are left
// alone.
const revealTargets = document.querySelectorAll(
  ".section-body .collection-card, .section-body .essay-card",
);
if (
  revealTargets.length &&
  "IntersectionObserver" in window &&
  window.matchMedia("(prefers-reduced-motion: no-preference)").matches
) {
  document.documentElement.classList.add("reveal-ready");
  const observer = new IntersectionObserver(
    (entries, obs) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          obs.unobserve(entry.target);
        }
      }
    },
    { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
  );
  for (const el of revealTargets) observer.observe(el);
}

// About page — "Messages" video grid (feature 07): load the player only on
// click. The poster + caption stand without JS; clicking a play button swaps the
// poster for a <video> streaming from data-video (self-hosted MP4 — open question
// #10). Guarding on data-video means a button with no source yet does nothing.
for (const button of document.querySelectorAll(".message-card__play")) {
  button.addEventListener("click", () => {
    const src = button.getAttribute("data-video");
    const media = button.closest(".message-card__media");
    if (!src || !media) return;
    const video = document.createElement("video");
    video.className = "message-card__video";
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    const source = document.createElement("source");
    source.src = src;
    source.type = "video/mp4";
    video.append(source);
    media.replaceChildren(video);
    video.focus();
    video.play?.().catch(() => {
      /* Source not available yet (message videos pending, open question #10). */
    });
  });
}

// Object gallery + zoom viewer (feature 09). Two behaviours, both enhancement:
//   - Thumbnails swap which image the main gallery box shows (inline), and mark
//     the active thumbnail. They stay <a href> links, so a no-JS user still
//     reaches every full-resolution image.
//   - The zoom button opens the deep-zoom <dialog> at whichever image is showing.
//     The viewer module (and OpenSeadragon) dynamic-imports only on that intent,
//     so the base bundle stays tiny and nothing loads until the user zooms.
const gallery = document.querySelector(".object-gallery[data-viewer]");
if (gallery) {
  const slides = [...gallery.querySelectorAll(".object-gallery__slide")];
  const thumbs = [...gallery.querySelectorAll(".object-gallery__thumb")];
  const caption = gallery.querySelector("[data-gallery-credit]");
  const zoomBtn = gallery.querySelector("[data-viewer-zoom]");
  let current = 0;

  // Show image i in the main box: reveal its slide, mark its thumbnail, and move
  // the credit line to match.
  const setActive = (i) => {
    current = Math.max(0, Math.min(slides.length - 1, i));
    slides.forEach((slide, n) => (slide.hidden = n !== current));
    thumbs.forEach((thumb, n) => {
      if (n === current) thumb.setAttribute("aria-current", "true");
      else thumb.removeAttribute("aria-current");
    });
    if (caption) {
      const credit = slides[current]?.getAttribute("data-credit");
      caption.textContent = credit || "";
      caption.hidden = !credit;
    }
  };

  for (const thumb of thumbs) {
    thumb.addEventListener("click", (event) => {
      event.preventDefault(); // take over the <a href> fallback with an inline swap
      setActive(Number(thumb.getAttribute("data-slide")) || 0);
    });
  }

  /** @type {Promise<typeof import("./viewer.js")> | undefined} */
  let viewerModule;
  const loadViewer = () => (viewerModule ??= import("./viewer.js"));

  /** @type {Promise<any> | undefined} */
  let modelViewerModule;
  // The vendored @google/model-viewer ESM (self-registers <model-viewer>);
  // resolved next to the hashed main bundle (dist/assets → ../vendor/…). Loaded
  // on intent (first "View in 3D" / hover), so it never enters the base bundle.
  const loadModelViewer = () =>
    (modelViewerModule ??= import(
      new URL("../vendor/model-viewer/model-viewer.min.js", import.meta.url).href
    ));

  // 3D model (feature 10) — inline. Slide 0 shows a poster render with a "View in
  // 3D" button; clicking it lazy-loads <model-viewer> and streams the GLB (with a
  // % indicator) into the gallery box, where the visitor orbits/zooms it in place.
  // The magnifying-glass zoom button (below) takes that same model fullscreen in
  // the dialog viewer. Without JS the poster stands in (progressive enhancement).
  const modelMount = gallery.querySelector(".object-gallery__model");
  if (modelMount) {
    const launch = modelMount.querySelector(".object-gallery__model-launch");
    const posterPic = modelMount.querySelector("picture");
    const progress = modelMount.querySelector("[data-model-progress]");
    const percent = modelMount.querySelector("[data-model-percent]");
    const bar = modelMount.querySelector("[data-model-bar]");
    const prompt = modelMount.querySelector("[data-model-prompt]");
    let started = false;

    // Once loaded, flash the interaction hints so the visitor knows the model is
    // interactive: "Drag to rotate" (1.5s) then "Scroll to zoom" (1.5s), then fade
    // — or dismiss the moment they start interacting.
    const promptItems = prompt ? [...prompt.querySelectorAll("[data-prompt]")] : [];
    let hinted = false;
    const showDragPrompt = (mv) => {
      if (!prompt || !promptItems.length || hinted) return; // once per activation
      hinted = true;
      const showItem = (i) => promptItems.forEach((el, n) => el.classList.toggle("is-active", n === i));
      const timers = [];
      let dismissed = false;
      const dismiss = () => {
        if (dismissed) return;
        dismissed = true;
        timers.forEach(clearTimeout);
        prompt.classList.remove("is-visible");
        setTimeout(() => (prompt.hidden = true), 300);
      };
      prompt.hidden = false;
      showItem(0); // "Drag to rotate"
      requestAnimationFrame(() => prompt.classList.add("is-visible"));
      timers.push(setTimeout(() => showItem(1), 1500)); // → "Scroll to zoom"
      timers.push(setTimeout(dismiss, 3000));
      mv.addEventListener("pointerdown", dismiss, { once: true });
    };

    const activateModel = () => {
      if (started) return;
      started = true;
      launch?.setAttribute("hidden", "");
      // Replace the poster with the model (model-viewer's own `poster` attribute
      // covers the load), so the live model fills the full gallery box rather
      // than appearing small beneath the still.
      posterPic?.setAttribute("hidden", "");
      if (progress) progress.hidden = false;
      loadModelViewer()
        .then((mod) => {
          // Point model-viewer at the vendored meshopt decoder (our GLBs are
          // meshopt-compressed; model-viewer ships no default location, so an
          // unset one would silently fail to decode).
          mod.ModelViewerElement.meshoptDecoderLocation = new URL(
            "../vendor/model-viewer/meshopt_decoder.js",
            import.meta.url,
          ).href;
          const mv = document.createElement("model-viewer");
          mv.className = "object-gallery__model-viewer";
          mv.setAttribute("src", modelMount.getAttribute("data-model") || "");
          mv.setAttribute("alt", modelMount.getAttribute("data-model-alt") || "");
          const poster = modelMount.getAttribute("data-model-poster");
          if (poster) mv.setAttribute("poster", poster);
          mv.setAttribute("camera-controls", ""); // orbit + zoom in place
          mv.setAttribute("touch-action", "pan-y");
          mv.setAttribute("interaction-prompt", "none");
          // Canonical framing + lighting. The poster (scripts/models/render-poster.mjs)
          // is captured with these exact values at 4/3, so the model reveals with no
          // jump from the still. Keep the two in sync.
          mv.setAttribute("camera-orbit", "20deg 70deg auto");
          mv.setAttribute("shadow-intensity", "1");
          mv.setAttribute("shadow-softness", "0.9");
          mv.setAttribute("exposure", "1.05");
          // AR on supporting devices only (the button self-hides elsewhere).
          mv.setAttribute("ar", "");
          mv.setAttribute("ar-modes", "webxr scene-viewer quick-look");
          mv.addEventListener("progress", (event) => {
            const total = /** @type {CustomEvent} */ (event).detail?.totalProgress ?? 0;
            const pct = Math.round(total * 100);
            if (percent) percent.textContent = `${pct}%`;
            if (bar) bar.style.width = `${pct}%`; // 0 → 100 fill
          });
          mv.addEventListener("load", () => {
            if (bar) bar.style.width = "100%";
            if (percent) percent.textContent = "100%";
            if (progress) progress.hidden = true;
            showDragPrompt(mv);
          });
          modelMount.append(mv);
          mv.focus?.();
        })
        .catch(() => {
          // Library or model failed to load — restore the poster affordance.
          started = false;
          launch?.removeAttribute("hidden");
          posterPic?.removeAttribute("hidden");
          if (progress) progress.hidden = true;
        });
    };

    launch?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation(); // load inline; don't also open the fullscreen dialog
      activateModel();
    });
    // Warm the library on first hover so the click feels instant.
    launch?.addEventListener("pointerenter", loadModelViewer, { once: true });
  }

  // Fullscreen zoom is desktop-only (Victor): on mobile the magnifier is hidden
  // (viewer.css) and tapping the image must not open the dialog. Checked at event
  // time so it tracks rotation / resize; below 52rem is the site's mobile view.
  const fullscreenAllowed = () => window.matchMedia("(min-width: 52rem)").matches;

  // onChange keeps the page gallery on whatever image the viewer last showed, so
  // navigating inside the dialog and closing it leaves the page on that image.
  const openViewer = () =>
    fullscreenAllowed()
      ? loadViewer().then((m) => m.open(gallery, current, { onChange: setActive }))
      : Promise.resolve();
  const warmViewer = () => {
    if (fullscreenAllowed()) loadViewer();
  };
  zoomBtn?.addEventListener("click", openViewer);
  // Clicking a photo in the main box also zooms it (the image shows a zoom-in
  // cursor). The 3D slide is exempt: you drag the model to orbit it, so a click
  // there must NOT open fullscreen — that is the magnifying-glass button's job.
  const stage = gallery.querySelector(".object-gallery__slides");
  stage?.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest(".object-gallery__slide--model")) {
      return;
    }
    openViewer();
  });
  // Warm the module (and OpenSeadragon) on first hover of the zoom surface, so
  // the click feels instant — but never on mobile, where the viewer is disabled.
  zoomBtn?.addEventListener("pointerenter", warmViewer, { once: true });
  stage?.addEventListener("pointerenter", warmViewer, { once: true });

  // Deep link: /<object>/#view=<n> selects that image and (on desktop) opens the
  // viewer. On mobile it still selects the image inline, but never opens fullscreen.
  const deep = location.hash.match(/^#view=(\d+)$/);
  if (deep) {
    const i = Math.max(0, Number(deep[1]) - 1);
    setActive(i);
    if (fullscreenAllowed()) {
      loadViewer().then((m) => m.open(gallery, i, { deepLink: true, onChange: setActive }));
    }
  }
}

// Search (feature 11): the Pagefind UI. Two entry points share one lazy loader:
//   - the header search panel (primary UX) — a disclosure the nav search icon
//     drops below itself, with a close button; Pagefind boots on first open
//     ("on search intent"), never before.
//   - the /search/ page — the no-JS fallback destination; with JS on, it mounts
//     the same UI inline.
// Pagefind runs entirely in the browser over a static index under /pagefind/:
// the query never reaches a server (no injection surface), and the UI renders
// queries/excerpts as text, so a typed payload can't execute. Assets resolve
// next to the hashed main bundle (dist/assets → ../pagefind/…), staying
// basePath-relative (rule 7). No other page loads Pagefind.
/** @type {Promise<void> | undefined} */
let pagefindReady;
function ensurePagefind() {
  if (pagefindReady) return pagefindReady;
  const base = new URL("../pagefind/", import.meta.url);
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = new URL("pagefind-ui.css", base).href;
  document.head.append(css);
  pagefindReady = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = new URL("pagefind-ui.js", base).href;
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", reject);
    document.head.append(script);
  });
  return pagefindReady;
}

/** Boot a Pagefind UI into `selector` (once the library has loaded). */
function mountPagefind(selector) {
  return ensurePagefind().then(() => {
    // PagefindUI is a global registered by the loaded UI bundle.
    new /** @type {any} */ (window).PagefindUI({
      element: selector,
      showImages: false,
      showSubResults: true,
      translations: { placeholder: "Search the exhibition" },
    });
    // The UI input carries a placeholder but no programmatic label; give it an
    // accessible name so the empty field still passes axe.
    document
      .querySelector(`${selector} .pagefind-ui__search-input`)
      ?.setAttribute("aria-label", "Search the exhibition");
  });
}

// The /search/ page mounts its own inline UI (the no-JS fallback destination).
if (document.getElementById("search")) mountPagefind("#search");

// Header search panel — the primary search UX (feature 11 revision). Without JS
// the icon stays a plain link to /search/; here we upgrade it into a disclosure
// that drops the panel below the icon.
const searchToggle = document.querySelector(".site-nav__search");
const searchPanel = document.getElementById("site-search");
if (searchToggle instanceof HTMLElement && searchPanel) {
  const closeBtn = searchPanel.querySelector(".site-search__close");
  const focusInput = () =>
    /** @type {HTMLElement | null} */ (
      searchPanel.querySelector(".pagefind-ui__search-input")
    )?.focus();
  let mounted = false;

  // Disclosure semantics, added only now that JS runs (a no-JS link must not
  // claim aria-expanded).
  searchToggle.setAttribute("aria-controls", "site-search");
  searchToggle.setAttribute("aria-expanded", "false");

  const open = () => {
    searchPanel.hidden = false;
    searchToggle.setAttribute("aria-expanded", "true");
    if (mounted) focusInput();
    else {
      mounted = true;
      mountPagefind("#site-search-ui").then(focusInput);
    }
  };
  const close = ({ returnFocus = true } = {}) => {
    searchPanel.hidden = true;
    searchToggle.setAttribute("aria-expanded", "false");
    if (returnFocus) searchToggle.focus();
  };

  searchToggle.addEventListener("click", (event) => {
    event.preventDefault(); // don't navigate to /search/ — drop the panel instead
    if (searchPanel.hidden) open();
    else close();
  });
  closeBtn?.addEventListener("click", () => close());
  // Escape closes and returns focus to the icon.
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !searchPanel.hidden) close();
  });
  // A click outside the panel (and not on the toggle) closes it.
  document.addEventListener("click", (event) => {
    if (searchPanel.hidden) return;
    const target = /** @type {Node} */ (event.target);
    if (!searchPanel.contains(target) && !searchToggle.contains(target)) {
      close({ returnFocus: false });
    }
  });
}

export {};
