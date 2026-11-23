# Photoreal renders with Blender (proof of concept)

The viewer exports the house it shows as a `.glb` (`viewer.exportGLB()`), and Blender's Cycles renders that same model
with real light transport: bounced light, soft shadows, reflections.

```bash
npm run demo                                      # the viewer, on :5173
pip install bpy                                   # Blender as a Python module
npm i -D playwright && npx playwright install chromium
node tools/blender/gallery.mjs auto-twin          # one image per room → storage/houses/auto-twin/render_*.jpg + renders.json
```

`gallery.mjs <houseId> [samples] [width]` exports the model from the running viewer, reads the camera views the
pipeline chose (`views.json`: one per room, standing back with a clear line of sight), and runs `render.py`.
The viewer shows the result under **תמונות**. CPU works (2–3 minutes per image on 4 cores); a GPU is far faster.

`render.py <glb> <views.json> <outdir> [samples] [width] [only-view-id]` can be run on its own; a view with
`"pano": true` renders a 360° equirectangular image.
