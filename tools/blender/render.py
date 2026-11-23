# Photoreal stills of a Planwalk house with Blender Cycles.
# usage: python render.py house.glb views.json outdir [samples] [width] [only-view-id]
# views.json: [{ id, name, pos: [x, y, z], target: [x, y, z], wide?, pano? }] in the viewer's world space (metres, y up)
import bpy, json, math, sys, time, os
from mathutils import Vector
glb, views_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
samples = int(sys.argv[4]) if len(sys.argv) > 4 else 64
width = int(sys.argv[5]) if len(sys.argv) > 5 else 960
only = sys.argv[6] if len(sys.argv) > 6 else None
os.makedirs(out, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
scene = bpy.context.scene
B = lambda p: Vector((p[0], -p[2], p[1]))          # glTF (x, y up, z) -> Blender (x, y, z up)

# glass lets daylight in: no shadows from panes
glass = 0
for o in scene.objects:
    if o.type != 'MESH': continue
    for slot in o.material_slots:
        m = slot.material
        if not m or not m.use_nodes: continue
        bsdf = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not bsdf: continue
        tr = bsdf.inputs.get('Transmission Weight') or bsdf.inputs.get('Transmission')
        alpha = bsdf.inputs['Alpha'].default_value
        if (tr and tr.default_value > .3) or alpha < .9 or 'glass' in m.name.lower():
            o.visible_shadow = False; glass += 1
            bsdf.inputs['Roughness'].default_value = 0.02
print('objects', len(scene.objects), 'glass objects', glass, 'materials', len(bpy.data.materials))

# the ground outside: lawn as far as the eye sees
gm = bpy.data.materials.new('lawn'); gm.use_nodes = True
gb = next(n for n in gm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); gb.inputs['Base Color'].default_value = (0.06, 0.11, 0.035, 1); gb.inputs['Roughness'].default_value = 1
lo = min((o.matrix_world @ Vector(c)).z for o in scene.objects if o.type == 'MESH' for c in o.bound_box)
bpy.ops.mesh.primitive_plane_add(size=600, location=(5, -8, min(lo, -3.05) - 0.01)); bpy.context.object.data.materials.append(gm)

# a hedge around the plot hides the horizon
hm = bpy.data.materials.new('hedge'); hm.use_nodes = True
hb = next(n for n in hm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'); hb.inputs['Base Color'].default_value = (0.035, 0.075, 0.03, 1); hb.inputs['Roughness'].default_value = 1
xs = [(o.matrix_world @ Vector(c)) for o in scene.objects if o.type == 'MESH' and o.name != 'Plane' for c in o.bound_box]
x1, x2, y1, y2 = min(v.x for v in xs) - 9, max(v.x for v in xs) + 9, min(v.y for v in xs) - 9, max(v.y for v in xs) + 9
base = min(lo, -3.05)
for cx, cy, sx, sy in (((x1 + x2) / 2, y1, x2 - x1, .8), ((x1 + x2) / 2, y2, x2 - x1, .8), (x1, (y1 + y2) / 2, .8, y2 - y1), (x2, (y1 + y2) / 2, .8, y2 - y1)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(cx, cy, base + 1.3)); h = bpy.context.object; h.scale = (sx, sy, 2.6); h.data.materials.append(hm)

# daylight: physical sky with a sun
world = bpy.data.worlds.new('sky'); scene.world = world; world.use_nodes = True
nt = world.node_tree; nt.nodes.clear()
sky = nt.nodes.new('ShaderNodeTexSky'); bg = nt.nodes.new('ShaderNodeBackground'); o = nt.nodes.new('ShaderNodeOutputWorld')
for t in ('MULTIPLE_SCATTERING', 'NISHITA'):
    try: sky.sky_type = t; break
    except Exception: pass
sky.sun_elevation = math.radians(38); sky.sun_rotation = math.radians(215)
try: sky.sun_intensity = 1.0
except Exception: pass
bg.inputs['Strength'].default_value = 0.35
nt.links.new(sky.outputs[0], bg.inputs['Color']); nt.links.new(bg.outputs[0], o.inputs['Surface'])

scene.render.engine = 'CYCLES'
c = scene.cycles
c.device = 'CPU'; c.samples = samples; c.use_adaptive_sampling = True; c.adaptive_threshold = 0.03
c.use_denoising = True
try: c.denoiser = 'OPENIMAGEDENOISE'
except Exception as e: print('denoiser', e)
c.max_bounces = 8; c.diffuse_bounces = 5; c.glossy_bounces = 4; c.transmission_bounces = 8; c.caustics_reflective = False; c.caustics_refractive = False
c.sample_clamp_indirect = 8
scene.render.threads_mode = 'AUTO'
scene.view_settings.view_transform = 'AgX'
try: scene.view_settings.look = 'AgX - Medium High Contrast'
except Exception: pass
scene.view_settings.exposure = 0.15
scene.render.image_settings.file_format = 'JPEG'; scene.render.image_settings.quality = 92

cam_data = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cam_data); scene.collection.objects.link(cam); scene.camera = cam
for v in json.load(open(views_path)):
    key = v.get('id', v['name'])
    if only and key != only: continue
    pos, tgt = B(v['pos']), B(v['target'])
    cam.location = pos
    cam.rotation_euler = (tgt - pos).to_track_quat('-Z', 'Y').to_euler()
    if v.get('pano') or v['name'] == 'pano':
        cam_data.type = 'PANO'; cam_data.panorama_type = 'EQUIRECTANGULAR'
        scene.render.resolution_x = int(width * 1.6); scene.render.resolution_y = int(width * .8)
    else:
        cam_data.type = 'PERSP'; cam_data.lens = 15 if v.get('wide') else 19; cam_data.sensor_width = 36
        scene.render.resolution_x = width; scene.render.resolution_y = int(width * 2 / 3)
    scene.render.filepath = os.path.join(out, 'render_' + key + '.jpg')
    t = time.time(); bpy.ops.render.render(write_still=True); print('rendered', key, round(time.time() - t), 's', flush=True)
