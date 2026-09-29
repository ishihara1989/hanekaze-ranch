"""Rebuild the original, reference-inspired racer with Blender 3.2+.
blender --background --python tools/build_chocobo.py
Coordinates: X = right, -Y = forward, Z = up. Export uses glTF Y-up.
"""
import bpy
import math
import json
import struct
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets/chocobo'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for action in list(bpy.data.actions):
    bpy.data.actions.remove(action)

def material(name, color, roughness=.48):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = roughness
    return m

gold = material('Plumage_Gold', (1.0, .57, .018))
light = material('Plumage_Light', (1.0, .73, .065))
shade = material('Plumage_Shadow', (.84, .32, .006))
beak = material('Beak_Amber', (1.0, .255, .013))
mouth = material('Mouth_Seam', (.24, .045, .012))
leg = material('Legs_Russet', (.49, .045, .025))
scute = material('Leg_Scales', (.68, .095, .037))
ivory = material('Claws_Ivory', (.99, .93, .70))
white = material('Eye_White', (1, .99, .93), .26)
blue = material('Iris_Blue', (.025, .21, .55), .22)
black = material('Pupil_Navy', (.004, .009, .032), .2)
glint = material('Eye_Glint', (1, 1, 1), .13)
meshes = []

def finish(obj, name, mat, bone):
    obj.name = name
    obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    if bone:
        group = obj.vertex_groups.new(name=bone)
        group.add(list(range(len(obj.data.vertices))), 1.0, 'REPLACE')
        meshes.append(obj)
    return obj

def oval(name, loc, scale, mat, bone, seg=20, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, location=loc)
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, mat, bone)

def capsule(name, a, b, width, depth, mat, bone):
    a, b = Vector(a), Vector(b)
    obj = oval(name, (a+b)/2, (width, depth, (b-a).length/2+width*.25), mat, bone, 16, 10)
    obj.rotation_euler = (b-a).to_track_quat('Z', 'Y').to_euler()
    return obj

def feather(name, a, b, width, depth, mat, bone, bend=(0,0,.06)):
    """Rounded, curved lanceolate feather; closed mesh with pointed tip."""
    a, b, bend = Vector(a), Vector(b), Vector(bend)
    axis = (b-a).normalized()
    side = axis.cross(Vector((0,0,1)))
    if side.length < .1:
        side = axis.cross(Vector((0,1,0)))
    side.normalize()
    normal = axis.cross(side).normalized()
    verts, faces = [], []
    steps, sides = 10, 10
    for i in range(steps+1):
        t = i/steps
        c = a.lerp(b,t) + bend*math.sin(math.pi*t)
        r = max(.008, math.sin(math.pi*(.12+.88*t))**.8)
        for j in range(sides):
            phi = j*2*math.pi/sides
            verts.append(tuple(c + side*math.cos(phi)*width*r + normal*math.sin(phi)*depth*r))
    for i in range(steps):
        for j in range(sides):
            k = i*sides+j
            faces.append((k, i*sides+(j+1)%sides, (i+1)*sides+(j+1)%sides, k+sides))
    faces.append(tuple(reversed(range(sides))))
    faces.append(tuple(steps*sides+j for j in range(sides)))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return finish(obj, name, mat, bone)

# A plump chest and high head keep the silhouette readable at racing distance.
oval('Body', (0,.06,1.35), (.53,.63,.64), gold, 'Body', 28, 18)
oval('Breast', (0,-.32,1.42), (.43,.34,.48), light, 'Body')
oval('Neck', (0,-.21,1.91), (.29,.30,.44), gold, 'Head')
oval('Head', (0,-.31,2.30), (.435,.435,.455), gold, 'Head', 28, 18)
oval('Muzzle', (0,-.635,2.20), (.265,.21,.23), shade, 'Head')
oval('Lower_Beak', (0,-.89,2.12), (.252,.335,.108), beak, 'Head')
oval('Beak_Seam', (0,-.904,2.175), (.266,.338,.023), mouth, 'Head')
feather('Upper_Beak', (0,-.64,2.26), (0,-1.255,2.16), .30,.18,beak,'Head', (0,0,.07))
for s in [-1, 1]:
    # Eyes face outward and forward; layered curved surfaces are visible in profile.
    eye = oval('Eye_Socket', (s*.332,-.54,2.395), (.173,.10,.226), shade,'Head')
    eye.rotation_euler.z = s*-.38
    eye = oval('Eye_White', (s*.349,-.582,2.40), (.148,.080,.197), white,'Head')
    eye.rotation_euler.z = s*-.38
    eye = oval('Iris', (s*.368,-.638,2.405), (.100,.052,.149), blue,'Head')
    eye.rotation_euler.z = s*-.38
    eye = oval('Pupil', (s*.374,-.671,2.414), (.061,.030,.113), black,'Head')
    eye.rotation_euler.z = s*-.38
    oval('Catchlight', (s*.361,-.694,2.473), (.028,.016,.038), glint,'Head',12,8)
    oval('Catchlight_Small', (s*.397,-.695,2.372), (.012,.008,.017), glint,'Head',10,6)
    for i in range(3):
        feather('Cheek_Feather', (s*.29,-.06,2.23-i*.095), (s*(.48+.035*i),.29+i*.055,2.31-i*.16), .11,.075,gold,'Head')
    # Hip feathers cover the upper-leg joint.
    oval('Haunch', (s*.30,.09,.99), (.225,.29,.27), gold, 'Thigh.'+str(s))
    for i in range(2):
        feather('Haunch_Plume', (s*.39,.11,1.07-i*.1), (s*.43,.39,.91-i*.09),.12,.07,light,'Body')

for i in range(3):
    x = (i-1)*.16
    feather('Crown_Plume', (x,-.24,2.62), (x*1.65,.29+abs(i-1)*.11,3.13-abs(i-1)*.16), .12,.079,light if i==1 else gold,'Head', (0,-.13,.13))
for i in range(5):
    x = (i-2)*.17
    feather('Tail_Plume', (x*.48,.49,1.46), (x*1.2,1.05-abs(i-2)*.065,2.04-abs(i-2)*.14), .16,.075,light if i%2==0 else gold,'Tail', (0,.12,.08))

for s in [-1,1]:
    wing = 'Wing.'+str(s)
    tip = 'WingTip.'+str(s)
    capsule('Wing_Leading', (s*.44,.03,1.66),(s*.97,.06,1.60), .16,.215,gold,wing)
    for i in range(6):
        feather('Primary_Feather', (s*(.74-i*.022),.015+i*.079,1.61-i*.021),
                (s*(1.39-i*.080),.025+i*.158,1.55-i*.041), .102,.045,light if i%2==0 else gold,tip, (0,.045,.035))
    for i in range(4):
        feather('Wing_Covert', (s*.47,.045+i*.065,1.70), (s*(.96-i*.045),.09+i*.116,1.64-i*.017), .108,.064,gold,wing)
    thigh, shin, foot = 'Thigh.'+str(s), 'Shin.'+str(s), 'Foot.'+str(s)
    capsule('Thigh', (s*.285,.055,.96),(s*.285,-.045,.60),.115,.12,leg,thigh)
    capsule('Shin', (s*.285,-.045,.60),(s*.285,.075,.20),.068,.073,leg,shin)
    oval('Ankle', (s*.285,.075,.205), (.08,.095,.095), scute,foot)
    for i in range(3):
        capsule('Shin_Scale', (s*.285,-.012+i*.026,.46-i*.085),(s*.285,-.031+i*.026,.44-i*.085),.071,.021,scute,shin)
    for j in [-1,0,1]:
        end = (s*.285+j*.118,-.36+(abs(j)*.055),.105)
        capsule('Toe', (s*.285+j*.035,.055,.145),end,.048,.043,leg,foot)
        feather('Claw',end,(end[0]+j*.032,end[1]-.135,.055),.054,.048,ivory,foot,(0,0,.045))
    feather('Back_Toe', (s*.285,.09,.13),(s*.285,.31,.075),.056,.04,leg,foot)
    feather('Back_Claw', (s*.285,.265,.085),(s*.285,.38,.055),.040,.032,ivory,foot)

# One skinned mesh / one skeleton, suitable for SkeletonUtils.clone per racer.
bpy.ops.object.select_all(action='DESELECT')
for obj in meshes:
    obj.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.join()
skin = bpy.context.object
skin.name = 'Chocobo_Skin'
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
arm = bpy.data.armatures.new('Chocobo_Skeleton')
rig = bpy.data.objects.new('Chocobo_Rig', arm)
bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
skin.select_set(False)
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')

def bone(name, head, parent=None):
    b = arm.edit_bones.new(name)
    b.head = head
    b.tail = Vector(head)+Vector((0,0,.20))
    if parent:
        b.parent = arm.edit_bones[parent]

bone('Root',(0,0,0))
bone('Body',(0,0,1.35),'Root')
bone('Head',(0,-.20,1.89),'Body')
bone('Tail',(0,.49,1.46),'Body')
for s in [-1,1]:
    bone('Wing.'+str(s),(s*.44,.03,1.66),'Body')
    bone('WingTip.'+str(s),(s*.78,.08,1.62),'Wing.'+str(s))
    bone('Thigh.'+str(s),(s*.285,.055,.96),'Body')
    bone('Shin.'+str(s),(s*.285,-.045,.60),'Thigh.'+str(s))
    bone('Foot.'+str(s),(s*.285,.075,.20),'Shin.'+str(s))
bpy.ops.object.mode_set(mode='OBJECT')
mod = skin.modifiers.new('Racer_Skeleton','ARMATURE')
mod.object = rig
skin.parent = rig
rig.show_in_front = True
for b in rig.pose.bones:
    b.rotation_mode = 'XYZ'

FPS = 30
bpy.context.scene.render.fps = FPS
CLIPS = {
    'Idle': dict(frames=60, fold=1.22, stride=0, lean=0, bank=0),
    'Run_Cruise': dict(frames=24, fold=1.22, stride=.72, lean=.08, bank=0),
    'Run_Corner': dict(frames=24, fold=.18, stride=.69, lean=.10, bank=-.12),
    'Run_Downhill': dict(frames=22, fold=.10, stride=.74, lean=.20, bank=0),
    'Run_StartDash': dict(frames=18, fold=.28, stride=.98, lean=.26, bank=0),
    'Run_LastSpurt': dict(frames=18, fold=.06, stride=1.02, lean=.22, bank=0),
}
actions = {}
for name, spec in CLIPS.items():
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    rig.animation_data_create()
    rig.animation_data.action = action
    n = spec['frames']
    for f in range(n+1):
        p = f/n*2*math.pi
        moving = spec['stride'] > 0
        for b in rig.pose.bones:
            b.location = (0,0,0)
            b.rotation_euler = (0,0,0)
        body = rig.pose.bones['Body']
        # Bones point along world Z: local Y is up, local Z is world -Y.
        body.location.y = (.050*(1-math.cos(2*p)) if moving else .013*math.sin(p))
        body.rotation_euler = (spec['lean']+.018*math.sin(2*p),.024*math.sin(p) if moving else 0,-spec['bank'])
        rig.pose.bones['Head'].rotation_euler.x = -spec['lean']*.7-.025*math.sin(2*p)
        rig.pose.bones['Tail'].rotation_euler.x = .065*math.sin(p+.5)
        for s in [-1,1]:
            q = p + (math.pi if s<0 else 0)
            swing = math.sin(q)
            thigh = rig.pose.bones['Thigh.'+str(s)]
            shin = rig.pose.bones['Shin.'+str(s)]
            foot = rig.pose.bones['Foot.'+str(s)]
            thigh.rotation_euler.x = spec['stride']*swing
            # The hock folds behind on recovery; the foot levels at contact.
            shin.rotation_euler.x = -max(0,-swing)*.95 if moving else 0
            foot.rotation_euler.x = -thigh.rotation_euler.x-shin.rotation_euler.x-spec['lean']+(max(0,-swing)*.5 if moving else 0)
            w = rig.pose.bones['Wing.'+str(s)]
            w.rotation_euler.z = -s*(spec['fold']+(.045 if moving else .018)*math.sin(2*p+.5))
            w.rotation_euler.y = s*(.06+.045*math.sin(p))
            rig.pose.bones['WingTip.'+str(s)].rotation_euler.z = -s*(.11+.035*math.sin(2*p-.6))
        bpy.context.view_layer.update()
        evaluated = skin.evaluated_get(bpy.context.evaluated_depsgraph_get())
        lowest = min((evaluated.matrix_world @ v.co).z for v in evaluated.data.vertices)
        body.location.y += .012 + (.035*max(0,-math.cos(2*p)) if moving else 0) - lowest
        for b in rig.pose.bones:
            b.keyframe_insert('rotation_euler',frame=f+1,group=b.name)
            b.keyframe_insert('location',frame=f+1,group=b.name)
    for fc in action.fcurves:
        for key in fc.keyframe_points:
            key.interpolation = 'LINEAR'
    actions[name] = action
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name,1,action)
    track.mute = True
rig.animation_data.action = actions['Run_Cruise']
scene = bpy.context.scene
scene.frame_start, scene.frame_end = 1,25
scene.frame_set(4)

# Export only the character. No camera, stage, or lighting in the runtime asset.
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
skin.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(filepath=str(OUT/'chocobo-racer.glb'), export_format='GLB', use_selection=True,
    export_animations=True, export_nla_strips=True, export_force_sampling=True,
    export_skins=True, export_yup=True, export_materials='EXPORT')
# Blender 3.2 also emits a static object-transform clip for the skin. Keep only
# the six authored actions; all accessors and the binary payload remain intact.
glb_path = OUT/'chocobo-racer.glb'
blob = glb_path.read_bytes()
json_size = struct.unpack_from('<I',blob,12)[0]
gltf = json.loads(blob[20:20+json_size])
gltf['animations'] = [a for a in gltf.get('animations',[]) if a['name'] in CLIPS]
assert {a['name'] for a in gltf['animations']} == set(CLIPS)
payload = json.dumps(gltf,separators=(',',':'),ensure_ascii=True).encode('utf-8')
payload += b' ' * (-len(payload)%4)
binary_chunks = blob[20+json_size:]
glb_path.write_bytes(struct.pack('<III',0x46546c67,2,20+len(payload)+len(binary_chunks))
    +struct.pack('<II',len(payload),0x4e4f534a)+payload+binary_chunks)

# Studio collection belongs only to the editable .blend and preview renders.
studio = bpy.data.collections.new('STUDIO_preview_only')
scene.collection.children.link(studio)
def stage_object(obj):
    for coll in list(obj.users_collection):
        coll.objects.unlink(obj)
    studio.objects.link(obj)

floor = material('Studio_Moss', (.055,.090,.072), .85)
bpy.ops.mesh.primitive_plane_add(size=200)
ground = bpy.context.object
ground.name = 'Studio_Ground'
ground.data.materials.append(floor)
stage_object(ground)
bpy.ops.object.camera_add(location=(4.4,-6.7,3.35))
cam = bpy.context.object
cam.rotation_euler = (Vector((0,0,1.5))-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.type = 'ORTHO'
cam.data.ortho_scale = 4.5
scene.camera = cam
stage_object(cam)
def area(name, loc, power, size, color):
    bpy.ops.object.light_add(type='AREA',location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.data.energy, obj.data.size, obj.data.color = power, size, color
    obj.rotation_euler = (Vector((0,0,1.3))-obj.location).to_track_quat('-Z','Y').to_euler()
    stage_object(obj)
area('Key_Softbox', (2,-4,6),650,4,(1,.90,.73))
area('Fill_Softbox', (-4,-2,3.5),450,4,(.71,.85,1))
area('Rim_Softbox', (1,3,5),850,3,(1,.75,.33))
scene.world.color = (.18,.18,.18)
scene.render.engine = 'BLENDER_EEVEE'
scene.eevee.use_gtao = True
scene.eevee.gtao_distance = 3
scene.eevee.gtao_factor = 1.15
scene.eevee.use_soft_shadows = True
scene.eevee.taa_render_samples = 96
scene.view_settings.view_transform = 'Filmic'
scene.view_settings.look = 'Medium High Contrast'
scene.view_settings.exposure = .5
scene.view_settings.gamma = 1
scene.render.resolution_x = 1100
scene.render.resolution_y = 1100
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = False
rig.animation_data.action = actions['Run_Cruise']
scene.frame_set(4)
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
# Save a useful viewport and action selection for editing in Blender.
for screen in bpy.data.screens:
    for space_area in screen.areas:
        if space_area.type == 'VIEW_3D':
            space_area.spaces.active.region_3d.view_distance = 5.8
            space_area.spaces.active.region_3d.view_location = (0,0,1.45)
            space_area.spaces.active.shading.type = 'MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'chocobo-racer.blend'))
for clip, filename in [('Run_Cruise','preview-cruise.png'),('Run_LastSpurt','preview-spread.png')]:
    rig.animation_data.action = actions[clip]
    scene.frame_set(4)
    scene.render.filepath = str(OUT/filename)
    bpy.ops.render.render(write_still=True)
skin.data.calc_loop_triangles()
manifest = {
    'asset':'chocobo-racer.glb', 'blender':'3.2+', 'forward':'glTF +Z / Blender -Y',
    'up':'glTF +Y / Blender +Z', 'units':'meters', 'rootMotion':False,
    'vertices':len(skin.data.vertices), 'triangles':len(skin.data.loop_triangles),
    'bones':len(arm.bones), 'materials':[m.name for m in skin.data.materials],
    'clips':{name:{'seconds':v['frames']/FPS,'loop':True,'wings':'closed' if v['fold']>1 else 'spread'} for name,v in CLIPS.items()}
}
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print('CHOCOBO_BUILD_OK',json.dumps(manifest))
