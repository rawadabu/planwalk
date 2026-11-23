# Make a generated GLB light enough for the web viewer: one mesh, fewer triangles, smaller textures, feet on the ground.
#   python optimize.py in.glb out.b64.json [triangles=30000] [texture=1024]
# Writes the library format the viewer loads ({ "glb": base64 }).
import bpy, sys, os, json, base64, tempfile
from mathutils import Vector
src, dst = sys.argv[1], sys.argv[2]
tris = int(sys.argv[3]) if len(sys.argv) > 3 else 30000
tex = int(sys.argv[4]) if len(sys.argv) > 4 else 1024

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
for o in bpy.context.scene.objects: o.select_set(o.type == 'MESH')
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1: bpy.ops.object.join()
obj = bpy.context.view_layer.objects.active
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
before = len(obj.data.polygons)
# triangles count ≈ polygons after triangulation; decimate by ratio
obj.data.calc_loop_triangles(); n = len(obj.data.loop_triangles)
if n > tris:
    m = obj.modifiers.new('dec', 'DECIMATE'); m.ratio = tris / n; m.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=m.name)
# stand on z = 0, centred in x/y
pts = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))); hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
obj.location -= Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z)); bpy.ops.object.transform_apply(location=True)
for img in bpy.data.images:
    if img.size[0] > tex: img.scale(tex, int(img.size[1] * tex / img.size[0]))
tmp = os.path.join(tempfile.mkdtemp(), 'out.glb')
bpy.ops.export_scene.gltf(filepath=tmp, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=85, export_apply=True)
obj.data.calc_loop_triangles()
with open(dst, 'w') as f: json.dump({'glb': base64.b64encode(open(tmp, 'rb').read()).decode()}, f)
print('optimized', os.path.basename(src), 'tris', n, '->', len(obj.data.loop_triangles), 'size m', [round(v, 2) for v in (hi - lo)], 'file MB', round(os.path.getsize(dst) / 1e6, 2), 'glb', tmp)
