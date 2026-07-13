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

## Attribution

Respect the source licence. The shipped salakot GLB is **CC BY 4.0** by *Mapping
Philippine Material Culture* (Sketchfab); that attribution rides in
`model3d.credit` and shows under the 3D view. Keep the licence line on any model
that requires attribution.
