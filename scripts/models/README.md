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

## Metashape delivery → shippable GLB

The museum's photogrammetry arrives as **Agisoft Metashape projects** (a `.psx`
next to a `.files/` tree). That looks like it needs Metashape to export, but it
does not: each `<name>.files/0/0/model*/model.zip` already contains a plain
**`mesh.ply`** (binary little-endian, triangles, per-corner UVs) and its
**`texture.tif`**. `scripts/models/from-metashape.mjs` reads those two directly,
so the conversion needs no Metashape and no Blender and is reproducible from the
raw delivery:

```sh
node scripts/models/from-metashape.mjs all              # every known scan
node scripts/models/from-metashape.mjs josephine-sleeping
```

Each source is registered in the `MODELS` table at the top of that script. The
script de-indexes the wedge UVs and re-welds them (splitting vertices only at
real atlas seams), computes smooth vertex normals — the PLY carries none, and
glTF without `NORMAL` renders faceted — drops the PLY's vertex colours so they
cannot multiply against the baked texture, discards all but the largest
connected component, resizes the texture, centres and scales the model, and
finishes with the same **meshopt + WebP** optimisation as everything else here.

Textures are downscaled to **2048 px** (from the delivered 8192²). The four
delivered scans are 43k–73k triangles, already inside the 50k–150k budget, so
nothing is decimated; the resulting GLBs are 0.5–0.6 MB each.

### Orientation is manual, and has to be

Metashape leaves an un-georeferenced chunk in arbitrary camera-local
coordinates, and none of the delivered chunks carries a region or transform — so
which way is up cannot be derived from the data. Fitting the base plane
numerically does not rescue it either: these scans mostly lack a captured
underside, so the fit latches onto whatever lower surface happens to be largest.

Each entry therefore records two numbers, verified by eye:

- `rotate` — degrees applied X then Y then Z, levelling the object so its base
  sits flat.
- `yaw` — degrees about the vertical axis *after* levelling, turning the
  object's front towards +Z, which is where the gallery camera and the poster
  render look from.

They are deliberately separate: a yaw folded into `rotate` would be applied
before levelling and would tip the object back over.

To work out the pair for a new scan, render a six-view contact sheet and compare
it with the object's reference photograph already in `assets-src/images/<id>/`:

```sh
node scripts/models/orient-sheet.mjs josephine-sleeping.glb /tmp/sheet.png
```

Then re-run `from-metashape.mjs` with `--rotate x,y,z --yaw deg` until the
object stands up and faces front, and record the values in `MODELS`.

### Poster

Once the GLB is right, the poster is a single command — it renders through the
vendored `<model-viewer>` at the canonical camera, so the still and the live
model line up pixel-for-pixel:

```sh
node scripts/models/render-poster.mjs josephine-sleeping.glb \
  assets-src/images/josephine-sleeping/model-poster.webp
```

### Any other source

For a scan that does *not* arrive as a Metashape project, the old route still
applies: clean up and decimate to ~50k–150k triangles in Blender, bake detail to
a normal map, keep textures at 1–2k, export `.glb`, and optimise with
**meshopt + WebP** —

```sh
npx @gltf-transform/cli optimize in.glb out.glb \
  --compress meshopt --texture-compress webp
```

> **Decoder note.** model-viewer ships **no** default meshopt decoder, so we
> vendor one (`static/vendor/model-viewer/meshopt_decoder.js`, UMD) and set
> `ModelViewerElement.meshoptDecoderLocation` to it in `js/main.js` and
> `js/viewer.js`. **Prefer meshopt + WebP.** If you instead use **Draco** or
> **KTX2/Basis** textures, model-viewer will try to fetch those decoders from
> `gstatic.com` at runtime — which breaks the self-contained/offline guarantee.
> Vendor those decoders and set their locations too before using them.

Whatever the source: **verify size** (`ls -lh assets-src/models/`) — the content
validator fails the build over 8 MB — then point the object's `model3d.src` and
`model3d.poster` at the new files.

## Turntable videos

The photogrammetry delivery also includes a 30-second turntable MP4 per scan
(108–168 MB each). Nothing on the site references them — the interactive GLB
supersedes a turntable, and objects have no video component — but web-ready
1280 px encodes are kept, git-ignored, in `prepared/video/` in case they are
wanted elsewhere:

```sh
ffmpeg -i "<src>.mp4" -vf "scale=1280:-2,fps=30" -c:v libx264 -crf 24 \
  -preset slow -pix_fmt yuv420p -movflags +faststart -an \
  "prepared/video/<id>-turntable.mp4"
```

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
