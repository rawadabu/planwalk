# Photoreal renders with Blender (proof of concept)

The viewer exports the house it shows as a `.glb` (`viewer.exportGLB()`), and Blender's Cycles renders that same model
with real light transport: bounced light, soft shadows, reflections.

```bash
npm run demo                                   # the viewer, on :5173
node tools/blender/export.js auto-twin out     # out/house.glb + out/views.json (camera views in world space)
pip install bpy                                # Blender as a Python module
python tools/blender/render.py out/house.glb out/views.json out/renders 80 1280
```

`render.py <glb> <views.json> <outdir> [samples] [width] [only-view]` — CPU works (about 3 minutes per 1280×720 image
on 4 cores at 80 samples); a GPU is far faster. A view named `pano` renders a 360° equirectangular image.
