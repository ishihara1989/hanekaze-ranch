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
shade = material('Plumage_Shadow', (.92, .44, .012))
beak = material('Beak_Amber', (1.0, .255, .013))
mouth = material('Mouth_Seam', (.24, .045, .012))
leg = material('Legs_Russet', (.68, .078, .025))
scute = material('Leg_Scales', (.82, .14, .042))
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
    steps, sides = 14, 12
    for i in range(steps+1):
        # Extra samples at both ends keep the round feather tips smooth.
        t = .5-.5*math.cos(math.pi*i/steps)
        c = a.lerp(b,t) + bend*math.sin(math.pi*t)
        r = max(.008, math.sin(math.pi*(.12+.88*t))**.52)
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

# V2: a large rounded head, tucked neck, egg body and short, chunky feet.
# Avoid the separate breast sphere: the chest is one continuous surface.
body_mesh = oval('Body', (0,.08,1.10), (.615,.565,.585), gold, 'Body', 32, 20)
for v in body_mesh.data.vertices:
    t = v.co.z/.585
    v.co.x *= 1-.10*t
    v.co.y *= 1-.06*t
oval('Neck', (0,-.13,1.58), (.315,.31,.30), gold, 'Head',24,16)
head_mesh = oval('Head', (0,-.255,2.095), (.64,.555,.60), gold, 'Head',40,28)
for v in head_mesh.data.vertices:
    # Slightly fuller lower cheeks, without separate protruding cheek balls.
    t = v.co.z/.60
    v.co.x *= 1+.055*math.exp(-((t+.35)/.40)**2)

# A deep, rounded triangular beak instead of a duck-like horizontal bill.
def beak_shell(name, upper, mat, offset=0):
    verts, faces = [], []
    rows, sides = 16, 20
    for i in range(rows+1):
        t=i/rows
        y=-.735-.555*t
        seam=1.918-.112*t+.035*math.sin(math.pi*t)
        w=.322*max(.003,math.cos(t*math.pi/2))**.62
        h=(.303 if upper else .153)*max(.005,math.sin(math.pi*(.28+.72*t)))**.66
        for j in range(sides+1):
            a=math.pi*j/sides
            verts.append((w*math.cos(a),y,seam+offset+(1 if upper else -1)*h*math.sin(a)))
    for i in range(rows):
        for j in range(sides):
            k=i*(sides+1)+j
            face=(k,k+1,k+sides+2,k+sides+1)
            faces.append(face if upper else tuple(reversed(face)))
    # Close underside / back. Both parts meet at a narrow mouth seam.
    edge=[i*(sides+1) for i in range(rows+1)]+[i*(sides+1)+sides for i in reversed(range(rows+1))]
    faces.append(tuple(reversed(edge)) if upper else tuple(edge))
    faces.append(tuple(range(sides+1)))
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(verts,[],faces)
    mesh.update()
    obj=bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(obj)
    finish(obj,name,mat,'Head')
    # Keep the flat closure from bending the normals along the visible lip.
    for poly in obj.data.polygons[-2:]:
        poly.use_smooth=False
    return obj
beak_shell('Upper_Beak',True,beak,.006)
beak_shell('Lower_Beak',False,beak,-.007)
# The seam sits inside the two beak shells, not outside as thick lips.
beak_shell('Mouth_Seam',True,mouth,-.003)

for s in [-1,1]:
    # Conformal eye patches follow the actual head surface instead of sticking
    # out as stacked eyeballs. The small offsets only prevent depth fighting.
    def eye_patch(name,cx,cz,rx,rz,offset,mat):
        verts,faces=[],[]
        rings,sides=8,36
        def point(x,z):
            t=(z-2.095)/.60
            hx=.64*(1+.055*math.exp(-((t+.35)/.40)**2))
            y=-.255-.555*math.sqrt(max(.025,1-(x/hx)**2-t*t))-offset
            return (x,y,z)
        verts.append(point(cx,cz))
        for r in range(1,rings+1):
            for j in range(sides):
                a=j*2*math.pi/sides
                verts.append(point(cx+rx*r/rings*math.cos(a),cz+rz*r/rings*math.sin(a)))
        for j in range(sides):
            faces.append((0,1+j,1+(j+1)%sides))
        for r in range(rings-1):
            for j in range(sides):
                a=1+r*sides+j
                b=1+r*sides+(j+1)%sides
                faces.append((a,a+sides,b+sides,b))
        mesh=bpy.data.meshes.new(name)
        mesh.from_pydata(verts,[],faces)
        mesh.update()
        obj=bpy.data.objects.new(name,mesh)
        bpy.context.collection.objects.link(obj)
        return finish(obj,name,mat,'Head')
    eye_patch('Soft_Eyelid',s*.397,2.127,.181,.272,.006,gold)
    eye_patch('Eye_White',s*.397,2.127,.169,.258,.012,white)
    eye_patch('Iris',s*.382,2.116,.104,.201,.019,blue)
    eye_patch('Pupil',s*.380,2.130,.068,.152,.025,black)
    eye_patch('Catchlight',s*.380-.023,2.227,.026,.038,.031,glint)
    eye_patch('Catchlight_Small',s*.380+.019,2.034,.011,.016,.031,glint)
    for i in range(3):
        feather('Cheek_Feather',(s*.50,-.185,1.965-i*.125),
            (s*(.85-abs(i-1)*.025),-.10,2.00-i*.16),.107,.080,gold,'Head',(0,-.045,.05))
    oval('Haunch',(s*.315,.07,.66),(.17,.205,.19),gold,'Thigh.'+str(s),24,16)

# Three compact crown plumes and four soft tail plumes.
for x,end in [(-.12,(-.23,.105,2.975)),(.025,(.075,.15,3.075)),(.16,(.28,.18,2.915))]:
    feather('Crown_Plume',(x,-.16,2.575),end,.125,.081,light if x==.025 else gold,'Head',(0,-.11,.065))
for i in range(4):
    x=(i-1.5)*.17
    feather('Tail_Plume',(x*.45,.48,1.24),(x*1.1,.94-abs(i-1.5)*.08,1.68-abs(i-1.5)*.15),
        .153,.079,light if i%2==0 else shade,'Tail',(0,.08,.065))

for s in [-1,1]:
    wing,tip='Wing.'+str(s),'WingTip.'+str(s)
    capsule('Wing_Leading',(s*.52,.01,1.39),(s*.84,.02,1.34),.115,.165,gold,wing)
    oval('Wing_Shoulder',(s*.665,.13,1.425),(.235,.265,.095),gold,wing,24,16)
    for i in range(5):
        feather('Primary_Feather',(s*(.74-i*.020),.015+i*.064,1.36-i*.013),
            (s*(1.20-i*.070),.06+i*.125,1.30-i*.021),.107,.051,light if i%2==0 else gold,tip,(0,.026,.026))
    for i in range(3):
        feather('Wing_Covert',(s*.54,.025+i*.07,1.425),(s*(.92-i*.038),.06+i*.118,1.38-i*.019),.122,.070,gold,wing)
    thigh,shin,foot='Thigh.'+str(s),'Shin.'+str(s),'Foot.'+str(s)
    capsule('Thigh',(s*.31,.025,.70),(s*.31,-.035,.425),.104,.11,leg,thigh)
    capsule('Shin',(s*.31,-.035,.425),(s*.31,.055,.17),.067,.071,leg,shin)
    oval('Ankle',(s*.31,.035,.17),(.10,.105,.095),scute,foot,20,14)
    oval('Foot_Pad',(s*.31,-.10,.118),(.145,.205,.097),leg,foot,24,14)
    for j in [-1,0,1]:
        end=(s*.31+j*.135,-.315+abs(j)*.04,.098)
        capsule('Toe',(s*.31+j*.041,-.035,.127),end,.074,.063,leg,foot)
        feather('Claw',end,(end[0]+j*.049,end[1]-.174,.042),.081,.069,ivory,foot,(0,0,.049))
    feather('Back_Toe',(s*.31,.075,.115),(s*.31,.26,.073),.062,.042,leg,foot)
    feather('Back_Claw',(s*.31,.227,.075),(s*.31,.33,.038),.048,.036,ivory,foot)

# Fuse the shoulder and its short coverts so feather roots do not leave
# intersecting primitive seams on the visible outside of the folded wing.
for s in [-1,1]:
    group_name='Wing.'+str(s)
    parts=[obj for obj in meshes if group_name in obj.vertex_groups]
    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts:
        obj.select_set(True)
        meshes.remove(obj)
    bpy.context.view_layer.objects.active=parts[0]
    bpy.ops.object.join()
    fused=bpy.context.object
    fused.name='Wing_Soft_Coverts.'+str(s)
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    remesh=fused.modifiers.new('Blend_Feather_Roots','REMESH')
    remesh.mode='VOXEL'
    remesh.voxel_size=.019
    remesh.use_smooth_shade=True
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    smooth=fused.modifiers.new('Soften','SMOOTH')
    smooth.factor=1.0
    smooth.iterations=3
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    decimate=fused.modifiers.new('Game_Mesh','DECIMATE')
    decimate.ratio=.45
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    fused.vertex_groups.clear()
    group=fused.vertex_groups.new(name=group_name)
    group.add(list(range(len(fused.data.vertices))),1.0,'REPLACE')
    meshes.append(fused)

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
bone('Body',(0,0,1.10),'Root')
bone('Head',(0,-.13,1.58),'Body')
bone('Tail',(0,.48,1.24),'Body')
for s in [-1,1]:
    bone('Wing.'+str(s),(s*.52,.01,1.39),'Body')
    bone('WingTip.'+str(s),(s*.78,.06,1.36),'Wing.'+str(s))
    bone('Thigh.'+str(s),(s*.31,.025,.70),'Body')
    bone('Shin.'+str(s),(s*.31,-.035,.425),'Thigh.'+str(s))
    bone('Foot.'+str(s),(s*.31,.055,.17),'Shin.'+str(s))
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
    'Idle': dict(frames=60, fold=1.10, stride=0, lean=0, bank=0),
    'Run_Cruise': dict(frames=24, fold=1.10, stride=.72, lean=.08, bank=0),
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

floor = material('Studio_Warm_Ivory', (.72,.70,.64), .85)
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
area('Key_Softbox', (2,-4,6),500,4,(1,.93,.82))
area('Fill_Softbox', (-4,-2,3.5),400,4,(.83,.90,1))
area('Rim_Softbox', (1,3,5),450,3,(1,.87,.60))
scene.world.color = (.35,.35,.35)
scene.render.engine = 'BLENDER_EEVEE'
scene.eevee.use_gtao = True
scene.eevee.gtao_distance = 1.5
scene.eevee.gtao_factor = 1.05
scene.eevee.use_soft_shadows = True
scene.eevee.taa_render_samples = 96
scene.view_settings.view_transform = 'Filmic'
scene.view_settings.look = 'Medium High Contrast'
scene.view_settings.exposure = .3
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
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'chocobo-racer.blend'))
for clip, filename in [('Idle','preview-idle.png'),('Run_Cruise','preview-cruise.png'),('Run_LastSpurt','preview-spread.png')]:
    rig.animation_data.action = actions[clip]
    scene.frame_set(4)
    scene.render.filepath = str(OUT/filename)
    bpy.ops.render.render(write_still=True)
rig.animation_data.action = actions['Idle']
scene.frame_set(1)
cam.location = (0,-7,2.5)
cam.rotation_euler = (Vector((0,0,1.5))-cam.location).to_track_quat('-Z','Y').to_euler()
scene.render.filepath = str(OUT/'preview-front.png')
bpy.ops.render.render(write_still=True)
for label,location in [('side',(7,0,2.25)),('back',(0,7,2.5))]:
    cam.location = location
    cam.rotation_euler = (Vector((0,0,1.5))-cam.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath = str(OUT/('preview-'+label+'.png'))
    bpy.ops.render.render(write_still=True)
skin.data.calc_loop_triangles()
manifest = {
    'revision':2, 'asset':'chocobo-racer.glb', 'blender':'3.2+', 'forward':'glTF +Z / Blender -Y',
    'up':'glTF +Y / Blender +Z', 'units':'meters', 'rootMotion':False,
    'vertices':len(skin.data.vertices), 'triangles':len(skin.data.loop_triangles),
    'bones':len(arm.bones), 'materials':[m.name for m in skin.data.materials],
    'clips':{name:{'seconds':v['frames']/FPS,'loop':True,'wings':'closed' if v['fold']>1 else 'spread'} for name,v in CLIPS.items()}
}
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print('CHOCOBO_BUILD_OK',json.dumps(manifest))
