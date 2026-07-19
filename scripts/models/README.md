# 3D model preparation (feature 10)

The site renders object 3D via a **vendored `@google/model-viewer`** (see
`static/vendor/model-viewer/`), loaded on intent only. Each object that has a 3D
view carries a `model3d` block in its `content/objects/<id>.json`:

```json
"model3d": {
  "src": "salakot.glb",                       // kebab-case .glb in assets-src/models/
  "poster": "salakot/model-poster.webp",      // still shown until the visitor opens 3D
  "altText": "Interactive 3D model of …",     // required; the accessible name
  "credit": "3D model: … , CC BY 4.0"         // optional source/licence line
}
```

The **content validator fails the build** if the GLB is missing or **larger than
8 MB** (`MODEL_MAX_MB` in `src/content.js`) — a GLB streams to every visitor who
opens the 3D view, so it must stay lean. `build.js` copies each referenced GLB
verbatim into `dist/media/models/`.

## Offline pipeline (source scan → shippable GLB)

Do this once per object, offline; commit only the finished GLB.

1. **Blender** — import the raw scan. Clean up: remove stray geometry, close
   holes, and **decimate to ~50k–150k triangles**. Bake fine detail into a
   **normal map** so the low-poly mesh still reads as detailed.
2. **Textures** — bake/resize to sane sizes (albedo/normal/roughness at
   1–2k). Export **glTF Binary (.glb)**.
3. **`gltf-transform`** — optimise. Our target output uses **meshopt** geometry
   compression + **WebP** textures + vertex **quantization** (this is exactly what
   the shipped `salakot.glb` uses):

   ```sh
   npx @gltf-transform/cli optimize in.glb salakot.glb \
     --compress meshopt --texture-compress webp
   ```

   > **Decoder note.** model-viewer ships **no** default meshopt decoder, so we
   > vendor one (`static/vendor/model-viewer/meshopt_decoder.js`, UMD) and set
   > `ModelViewerElement.meshoptDecoderLocation` to it in `js/main.js` and
   > `js/viewer.js`. **Prefer meshopt + WebP.** If you instead use **Draco** or
   > **KTX2/Basis** textures, model-viewer will try to fetch those decoders from
   > `gstatic.com` at runtime — which breaks the self-contained/offline guarantee.
   > Vendor those decoders and set their locations too before using them.

4. **Verify size** — `ls -lh salakot.glb`; must be ≤ 8 MB. Re-decimate or shrink
   textures if not.
5. **Drop in** — put the `.glb` in `assets-src/models/` and reference it from the
   object's `model3d.src`. Add a real **poster** render of the model under
   `assets-src/images/<id>/` and point `model3d.poster` at it.

## Stand-in 3D: `placeholder-3d.glb` (feature 11c)

Any object that should eventually have a 3D view can wire a **real `model3d`
block now**, before the museum's scan arrives, by pointing it at the shared
placeholder:

```json
"model3d": {
  "src": "placeholder-3d.glb",
  "poster": "placeholder-3d/model-poster.webp",
  "altText": "3D model coming soon — placeholder pyramid"
}
```

This keeps the 3D-first gallery slide, inline "View in 3D" load, and
fullscreen dialog viewer all wired end-to-end with **zero template changes** —
same plumbing as `salakot.glb`. When the object's official scan is ready,
swap `src`/`poster`/`altText` (and add a `credit` if the source requires
attribution) for the real files; nothing else about the object's content or
the templates needs to change.

`placeholder-3d.glb` (a tetrahedron carrying a baked "3D placeholder" label,
~9 KB) and its poster are generated, not hand-dropped — re-run either any
time with:

```sh
node scripts/models/make-placeholder.mjs
node scripts/models/render-poster.mjs placeholder-3d.glb assets-src/images/placeholder-3d/model-poster.webp
```

`make-placeholder.mjs` builds the tetrahedron with `@gltf-transform/core`,
bakes the label texture with `sharp` (SVG text), and applies the same
meshopt + WebP optimisation as the offline pipeline above (via
`@gltf-transform/functions`' `meshopt`/`textureCompress` and the
`meshoptimizer` WASM encoder). Each face gets its own UV basis derived from
its outward normal (not a fixed per-vertex-slot UV triangle) — a tetrahedron
has no consistent way to keep "vertex 0 of every face" facing the same
rotational direction on screen, so a fixed UV mapping mirrors the label on
alternating faces; deriving it from the normal keeps it non-mirrored (if
rotated) on every face.

## Attribution

Respect the source licence. The shipped salakot GLB is **CC BY 4.0** by *Mapping
Philippine Material Culture* (Sketchfab); that attribution rides in
`model3d.credit` and shows under the 3D view. Keep the licence line on any model
that requires attribution.
