"""Build the v3 "stallion" racer chocobo with Blender 3.2+.

    blender --background --python tools/build_chocobo_v3.py
    blender --background --python tools/build_chocobo_v3.py -- --quick=<dir>              # shape check renders
    blender --background --python tools/build_chocobo_v3.py -- --anim=<dir> --clip=Idle   # motion contact sheet

Writes public/assets/chocobo-v3/ (GLB, .blend, previews, manifest). Everything is generated here;
the .blend is an output, not the source. Blender Z up, -Y forward, +X is the bird's left (.L);
glTF export is Y up, +Z forward. Legs are posed by an analytic two-bone IK so planted feet do not slide.
"""
import bpy
import bmesh
import math
import json
import struct
import sys
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion, Euler
from mathutils.bvhtree import BVHTree

ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
QUICK = next((a.split('=', 1)[1] for a in ARGV if a.startswith('--quick=')), None)
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets/chocobo-v3'
OUT.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
TAU = math.tau


# ---------------------------------------------------------------- materials
def lin(hexcode):
    h = hexcode.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in c)


def material(name, hexcode, rough=.6, spec=.35):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    color = (*lin(hexcode), 1)
    p.inputs['Base Color'].default_value = color
    p.inputs['Roughness'].default_value = rough
    p.inputs['Specular'].default_value = spec
    m.diffuse_color = color
    m.use_backface_culling = True  # closed, outward-facing parts: single-sided in glTF
    return m


# Default look: yellow plumage, yellow crest. Runtime recolors only these values.
MAT = {name: material(name, hexcode, rough) for name, hexcode, rough in [
    ('Plumage_Main', '#f3b92a', .74),
    ('Plumage_Light', '#fcd565', .78),
    ('Plumage_Dark', '#d7861a', .72),
    ('Crest_Plume', '#ffcf3c', .62),
    ('Beak', '#f68b21', .36),
    ('Mouth', '#6e1f1c', .6),
    ('Leg', '#c8472c', .5),
    ('Leg_Scale', '#a2361f', .45),
    ('Claw', '#f1e8d0', .32),
    ('Eye_White', '#fbf9f1', .22),
    ('Iris', '#1f8a6c', .18),
    ('Pupil', '#0a0e18', .2),
    ('Eye_Glint', '#ffffff', .08),
    ('Eyelid', '#3b2317', .5),
]}

# --------------------------------------------------------------- skeleton
# name, head, tail, parent. Left side (+X) only; .R is mirrored.
# Head features are authored at a base size and enlarged about the top of the neck.
HEAD_PIVOT = Vector((0, -.64, 2.12))
HEAD_K = 1.22
HEAD_SHIFT = Vector((0, .02, -.10))


def H(p):
    return HEAD_PIVOT + (Vector(p) - HEAD_PIVOT) * HEAD_K + HEAD_SHIFT


CORE_BONES = [
    ('Root', (0, 0, 0), (0, -.35, 0), None),
    ('Body', (0, .10, 1.30), (0, -.35, 1.42), 'Root'),
    ('Neck', (0, -.50, 1.70), H((0, -.64, 2.12)), 'Body'),
    ('Head', H((0, -.64, 2.12)), H((0, -.80, 2.62)), 'Neck'),
    ('Jaw', H((0, -.90, 2.31)), H((0, -1.40, 2.25)), 'Head'),
    ('Crest', H((0, -.94, 2.64)), H((0, -.84, 2.98)), 'Head'),
    ('Tail', (0, .60, 1.52), (0, .95, 1.80), 'Body'),
]
HIP = Vector((.30, .10, 1.12))
KNEE = Vector((.32, -.08, .84))
ANKLE = Vector((.32, .15, .44))
BALL = Vector((.32, -.02, .10))
TOE_END = Vector((.32, -.33, .055))

# Wing plane (rest pose is the spread wing): U outward, V backward, N up.
SHOULDER = Vector((.35, -.28, 1.70))
WU = Vector((1, .10, .08)).normalized()
WV = (Vector((0, 1, 0)) - Vector((0, 1, 0)).dot(WU) * WU).normalized()
WN = WU.cross(WV).normalized()


def wp(u, v, n=0.0):
    return SHOULDER + WU * u + WV * v + WN * n


def wd(alpha):
    """Direction in the wing plane, alpha degrees from backward toward outward."""
    a = math.radians(alpha)
    return WV * math.cos(a) + WU * math.sin(a)


ELBOW = wp(.25, .0)
WRIST = wp(.44, .04)
FAN_ALPHA = {'Fan1': 42, 'Fan2': 60, 'Fan3': 78}


def side_bones():
    bones = [
        ('Thigh', HIP, KNEE, 'Body'),
        ('Shin', KNEE, ANKLE, 'Thigh'),
        ('Tarsus', ANKLE, BALL, 'Shin'),
        ('Toes', BALL, TOE_END, 'Tarsus'),
        ('Shoulder', SHOULDER, ELBOW, 'Body'),
        ('Forearm', ELBOW, WRIST, 'Shoulder'),
    ]
    for fan, alpha in FAN_ALPHA.items():
        bones.append((fan, WRIST, WRIST + wd(alpha) * .32, 'Forearm'))
    return bones


def mirror_name(name):
    return name[:-2] + '.R' if name.endswith('.L') else name


def mx(v):
    return Vector((-v[0], v[1], v[2]))


BONES = [(n, Vector(h), Vector(t), p) for n, h, t, p in CORE_BONES]
for n, h, t, p in side_bones():
    par = p if p in ('Body',) else p + '.L'
    BONES.append((n + '.L', Vector(h), Vector(t), par))
    BONES.append((n + '.R', mx(h), mx(t), mirror_name(par)))
BONE = {n: (h, t) for n, h, t, _ in BONES}

# ---------------------------------------------------------------- mesh kit
PARTS = []


def emit(name, verts, faces, face_mats, weights, mirror=False, smooth=True, orient=None, uv=None):
    """Create one part. face_mats: material name per face (or one name).
    weights: bone name (rigid) or list of {bone: weight} per vertex.
    Closed parts get outward normals; open decals face along `orient`."""
    verts = [Vector(v) for v in verts]
    if mirror:
        verts = [mx(v) for v in verts]
        faces = [tuple(reversed(f)) for f in faces]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([tuple(v) for v in verts], [], faces)
    mesh.update()
    layer = mesh.uv_layers.new(name='UVMap')
    if uv:
        for loop in mesh.loops:
            layer.data[loop.index].uv = uv[loop.vertex_index]
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    if isinstance(face_mats, str):
        face_mats = [face_mats] * len(faces)
    slots = sorted(set(face_mats))
    for s in slots:
        mesh.materials.append(MAT[s])
    for poly, mname in zip(mesh.polygons, face_mats):
        poly.material_index = slots.index(mname)
        poly.use_smooth = smooth
    bm = bmesh.new()
    bm.from_mesh(mesh)
    if orient is None:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    else:
        hint = mx(orient) if mirror else Vector(orient)
        for f in bm.faces:
            if f.normal.dot(hint) < 0:
                f.normal_flip()
    bm.to_mesh(mesh)
    bm.free()
    set_weights(obj, weights, mirror)
    PARTS.append(obj)
    return obj


def set_weights(obj, weights, mirror=False):
    fix = mirror_name if mirror else (lambda n: n)
    if isinstance(weights, str):
        g = obj.vertex_groups.new(name=fix(weights))
        g.add(list(range(len(obj.data.vertices))), 1.0, 'REPLACE')
        return
    groups = {}
    for i, wmap in enumerate(weights):
        for bone, w in wmap.items():
            b = fix(bone)
            if b not in groups:
                groups[b] = obj.vertex_groups.get(b) or obj.vertex_groups.new(name=b)
            groups[b].add([i], w, 'REPLACE')


def frame_from(d, up):
    d = Vector(d).normalized()
    side = d.cross(Vector(up))
    if side.length < 1e-4:
        side = d.cross(Vector((1, 0, 0)))
    side.normalize()
    return d, side, side.cross(d).normalized()


def blade(root, tip, width, thick, up=(0, 0, 1), bend=0.0, curl=0.0, twist=0.0, steps=10, sides=8,
          base_w=.3, peak=.38, round_tip=False, lift=0.0):
    """Stylised feather / claw: lens section, pointed or round tip, arched and curled.
    Returns verts, faces, and per-face 'top' flags (True where the face looks along +up)."""
    root, tip = Vector(root), Vector(tip)
    L = (tip - root).length
    d, side, nrm = frame_from(tip - root, up)
    ts = [.5 - .5 * math.cos(math.pi * i / steps) for i in range(steps)]

    def center(t):
        return root + (tip - root) * t + nrm * (bend * L * math.sin(math.pi * t) + curl * L * t ** 3 + lift * L * t)

    def width_at(t):
        rise = base_w + (1 - base_w) * math.sin(min(t / peak, 1) * math.pi / 2)
        if t <= peak:
            fall = 1.0
        else:
            x = (t - peak) / (1 - peak)
            fall = math.sqrt(max(0, 1 - x * x)) if round_tip else math.cos(x * math.pi / 2) ** .85
        return width * rise * fall

    verts, faces, top, tvals = [], [], [], []
    for i, t in enumerate(ts):
        c = center(t)
        tan = (center(min(1, t + .01)) - center(max(0, t - .01))).normalized()
        s_axis = tan.cross(nrm).normalized() * (1 if side.dot(tan.cross(nrm)) > 0 else -1)
        n_axis = s_axis.cross(tan).normalized()
        a = twist * t
        s_rot = s_axis * math.cos(a) + n_axis * math.sin(a)
        n_rot = n_axis * math.cos(a) - s_axis * math.sin(a)
        w = width_at(t)
        th = thick * (1 - .55 * t) * (w / width) ** .35 if w > 0 else 0
        for j in range(sides):
            phi = TAU * j / sides
            verts.append(c + s_rot * w * math.cos(phi) + n_rot * th * math.sin(phi))
            tvals.append(t)
    tvals += [1.0, 0.0]
    tip_i = len(verts)
    verts.append(center(1.0))
    base_i = len(verts)
    verts.append(center(0.0) - d * thick * .4)
    for i in range(steps - 1):
        for j in range(sides):
            k0, k1 = i * sides + j, i * sides + (j + 1) % sides
            faces.append((k0, k1, k1 + sides, k0 + sides))
            top.append(math.sin(TAU * (j + .5) / sides) > 0)
    last = (steps - 1) * sides
    for j in range(sides):
        faces.append((last + j, last + (j + 1) % sides, tip_i))
        top.append(math.sin(TAU * (j + .5) / sides) > 0)
    for j in range(sides):
        faces.append(((j + 1) % sides, j, base_i))
        top.append(math.sin(TAU * (j + .5) / sides) > 0)
    return verts, faces, top, tvals


def feather(name, root, tip, width, thick, top_mat, bottom_mat=None, weights='Body', mirror=False, uv0=0.0, **kw):
    """uv0: fraction of the length hidden in the body; UV u runs 0..1 over the visible part."""
    v, f, top, tvals = blade(root, tip, width, thick, **kw)
    mats = [top_mat if t else (bottom_mat or top_mat) for t in top]
    if not isinstance(weights, str):
        weights = [weights] * len(v)
    return emit(name, v, f, mats, weights, mirror, uv=[(max(0.0, (t - uv0) / (1 - uv0)), .5) for t in tvals])


def ellipsoid_data(center, semi, seg=24, rings=14, rot=None):
    center = Vector(center)
    R = rot.to_matrix() if rot is not None else Matrix.Identity(3)
    verts = [center + R @ Vector((0, 0, -semi[2]))]
    for r in range(1, rings):
        th = math.pi * r / rings
        for j in range(seg):
            ph = TAU * j / seg
            p = Vector((semi[0] * math.sin(th) * math.cos(ph), semi[1] * math.sin(th) * math.sin(ph), -semi[2] * math.cos(th)))
            verts.append(center + R @ p)
    verts.append(center + R @ Vector((0, 0, semi[2])))
    top = len(verts) - 1
    faces = []
    for j in range(seg):
        faces.append((0, 1 + (j + 1) % seg, 1 + j))
    for r in range(rings - 2):
        for j in range(seg):
            a = 1 + r * seg + j
            b = 1 + r * seg + (j + 1) % seg
            faces.append((a, b, b + seg, a + seg))
    base = 1 + (rings - 2) * seg
    for j in range(seg):
        faces.append((base + j, base + (j + 1) % seg, top))
    return verts, faces


def catmull(points, per=8):
    pts = [Vector(p) for p in points]
    pts = [pts[0] * 2 - pts[1]] + pts + [pts[-1] * 2 - pts[-2]]
    out = []
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = pts[i - 1:i + 3]
        for k in range(per):
            t = k / per
            out.append(.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(pts[-2])
    return out


def tube_data(pts, radii, sides=14, squash=1.0, cap=True):
    """Generalised cylinder with rounded caps. radii: one per point."""
    n = len(pts)
    tans = [(pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized() for i in range(n)]
    ref = Vector((1, 0, 0)) if abs(tans[0].x) < .9 else Vector((0, 0, 1))
    normal = (ref - ref.dot(tans[0]) * tans[0]).normalized()
    verts, faces, rings = [], [], []
    for i in range(n):
        if i:
            normal = (normal - normal.dot(tans[i]) * tans[i]).normalized()
        binorm = tans[i].cross(normal)
        ring = []
        for j in range(sides):
            ph = TAU * j / sides
            ring.append(len(verts))
            verts.append(pts[i] + (normal * math.cos(ph) + binorm * math.sin(ph) * squash) * radii[i])
        rings.append(ring)
    for i in range(n - 1):
        for j in range(sides):
            a, b = rings[i][j], rings[i][(j + 1) % sides]
            c, d = rings[i + 1][(j + 1) % sides], rings[i + 1][j]
            faces.append((a, b, c, d))
    if cap:
        s = len(verts)
        verts.append(pts[0] - tans[0] * radii[0] * .7)
        e = len(verts)
        verts.append(pts[-1] + tans[-1] * radii[-1] * .7)
        for j in range(sides):
            faces.append((rings[0][(j + 1) % sides], rings[0][j], s))
            faces.append((rings[-1][j], rings[-1][(j + 1) % sides], e))
    return verts, faces


def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (a + ab * t - p).length


def soft_weights(p, segs, sigma=.06, keep=3):
    ds = [(name, seg_dist(p, Vector(a), Vector(b)) - r) for name, a, b, r in segs]
    m = min(d for _, d in ds)
    ws = sorted(((n, math.exp(-(d - m) / sigma)) for n, d in ds), key=lambda x: -x[1])[:keep]
    tot = sum(w for _, w in ws)
    return {n: w / tot for n, w in ws if w / tot > .015}


BODY_SEGS = [
    ('Body', (0, .56, 1.44), (0, -.30, 1.42), .44),
    ('Neck', (0, -.50, 1.74), (0, -.60, 1.98), .24),
    ('Head', H((0, -.70, 2.32)), H((0, -.80, 2.52)), .33 * HEAD_K),
    ('Thigh.L', (.33, .10, 1.10), (.34, .04, .86), .19),
    ('Thigh.R', (-.33, .10, 1.10), (-.34, .04, .86), .19),
]


# ------------------------------------------------------------- body surface
def build_body():
    mb = bpy.data.metaballs.new('Chocobo_Body_MB')
    mb.resolution = mb.render_resolution = .02
    mb.threshold = .6
    obj = bpy.data.objects.new('Chocobo_Body_MB', mb)
    bpy.context.collection.objects.link(obj)

    def blob(co, semi, rot=(0, 0, 0), stiff=4.0):
        e = mb.elements.new()
        e.type = 'ELLIPSOID'
        e.co = co
        k = math.sqrt(1 - (mb.threshold / stiff) ** (1 / 3))
        e.radius = 1.0
        e.size_x, e.size_y, e.size_z = [s / k for s in semi]
        e.stiffness = stiff
        e.rotation = Euler(rot).to_quaternion()

    K = HEAD_K
    blob((0, .10, 1.37), (.47, .62, .47), (-.16, 0, 0), 5)      # barrel
    blob((0, -.36, 1.48), (.38, .32, .39), (0, 0, 0), 5)        # breast
    blob((0, .56, 1.50), (.29, .28, .26), (.3, 0, 0), 5)        # rump
    blob((0, -.52, 1.84), (.25, .25, .28), (-.45, 0, 0), 4)     # lower neck
    blob((0, -.62, 2.02), (.23, .23, .22), (-.2, 0, 0), 4)      # upper neck
    blob(H((0, -.77, 2.44)), (.33 * K, .40 * K, .33 * K), (.10, 0, 0), 6)      # cranium
    blob(H((0, -.58, 2.50)), (.24 * K, .22 * K, .25 * K), (0, 0, 0), 5)        # back of skull
    for s in (-1, 1):
        blob(H((s * .15, -.86, 2.30)), (.16 * K, .20 * K, .15 * K), (0, 0, 0), 5)  # cheeks
        blob((s * .31, .12, 1.0), (.21, .26, .29), (.28, 0, 0), 5)  # feathered thighs
    dg = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
    bpy.data.objects.remove(obj)
    body = bpy.data.objects.new('Body_Surface', mesh)
    bpy.context.collection.objects.link(body)
    bpy.context.view_layer.objects.active = body
    body.select_set(True)
    for kind, opts in [('REMESH', dict(mode='VOXEL', voxel_size=.018)), ('SMOOTH', dict(factor=.6, iterations=4)),
                       ('DECIMATE', dict(ratio=.2))]:
        mod = body.modifiers.new(kind, kind)
        for k, v in opts.items():
            setattr(mod, k, v)
        bpy.ops.object.modifier_apply(modifier=mod.name)
    body.select_set(False)
    mesh.materials.append(MAT['Plumage_Main'])
    mesh.uv_layers.new(name='UVMap')
    for p in mesh.polygons:
        p.use_smooth = True
    set_weights(body, [soft_weights(v.co, BODY_SEGS) for v in mesh.vertices])
    PARTS.append(body)
    return body


body = build_body()
_dg = bpy.context.evaluated_depsgraph_get()
BVH = BVHTree.FromObject(body, _dg)


def surface(origin, direction):
    hit, normal, _, _ = BVH.ray_cast(Vector(origin), Vector(direction).normalized())
    return hit, normal


# ------------------------------------------------------------------ beak
def beak_shell(upper):
    """Big rounded beak with a small hook. The flat mouth face is the dark interior."""
    rows, sides = 20, 20
    y0, y1 = -.86, (-1.47 if upper else -1.37)
    verts, faces, mats = [], [], []
    for i in range(rows + 1):
        t = i / rows
        y = y0 + (y1 - y0) * t
        seam = 2.31 - .085 * t - .04 * t ** 3 + .02 * math.sin(math.pi * t)
        if upper:
            w = .228 * (1 - t ** 2.4) ** .5 + .012
            h = .205 * (1 - .6 * t) * (1 - t ** 3) ** .35 + .03 * math.sin(math.pi * t) + .006
            seam -= .085 * max(0, (t - .72) / .28) ** 2
        else:
            w = .2 * (1 - t ** 2.2) ** .5 + .01
            h = .1 * (1 - t) ** .6 + .006
        for j in range(sides + 1):
            a = math.pi * j / sides
            dz = h * math.sin(a) ** .75
            verts.append(H((w * math.cos(a), y, seam + (dz if upper else -dz))))
    for i in range(rows):
        for j in range(sides):
            k = i * (sides + 1) + j
            faces.append((k, k + 1, k + sides + 2, k + sides + 1))
            mats.append('Beak')
    edge = [i * (sides + 1) for i in range(rows + 1)] + [i * (sides + 1) + sides for i in reversed(range(rows + 1))]
    faces.append(tuple(edge))
    mats.append('Mouth')
    faces.append(tuple(range(sides + 1)))
    mats.append('Mouth')
    faces.append(tuple(rows * (sides + 1) + j for j in range(sides + 1)))
    mats.append('Beak')
    obj = emit('Upper_Beak' if upper else 'Lower_Beak', verts, faces, mats, 'Head' if upper else 'Jaw')
    for poly in obj.data.polygons[-3:-1]:
        poly.use_smooth = False
    return obj


beak_shell(True)
beak_shell(False)
tv, tf = ellipsoid_data((0, -1.0, 2.285), (.1, .17, .028), 14, 8)
emit('Tongue', [H(v) for v in tv], tf, 'Mouth', 'Jaw')


# ------------------------------------------------------------------- eyes
def eye_decals(s):
    """Layered eye pieces projected onto the head, with a slight lens bulge."""
    E = HEAD_K * 1.05
    center_guess = H((s * .245, -1.00, 2.50))
    axis = (center_guess - H((0, -.74, 2.42))).normalized()
    hit, _ = surface(center_guess + axis * .6, -axis)
    fwd = Vector((0, -1, 0))
    fwd = (fwd - fwd.dot(axis) * axis).normalized()
    up = axis.cross(fwd).normalized()
    if up.z < 0:
        up = -up
    EW, EH = .102 * E, .132 * E

    def place(x, y, offset):
        e = (x / EW) ** 2 + (y / EH) ** 2
        o = hit + axis * .5 + fwd * x + up * y
        p, n = surface(o, -axis)
        if p is None:
            p, n = hit + fwd * x + up * y, axis
        return p + n * (offset + .026 * max(0.0, 1 - e) ** .7)

    def disc(name, cx, cy, rx, ry, offset, mat, rings=6, sides=28, tilt=0.0):
        cx, cy, rx, ry = cx * E, cy * E, rx * E, ry * E
        verts, faces = [place(cx, cy, offset)], []
        for r in range(1, rings + 1):
            for j in range(sides):
                a = TAU * j / sides
                x, y = rx * r / rings * math.cos(a), ry * r / rings * math.sin(a)
                x, y = x * math.cos(tilt) - y * math.sin(tilt), x * math.sin(tilt) + y * math.cos(tilt)
                verts.append(place(cx + x, cy + y, offset))
        for j in range(sides):
            faces.append((0, 1 + j, 1 + (j + 1) % sides))
        for r in range(rings - 1):
            for j in range(sides):
                a, b = 1 + r * sides + j, 1 + r * sides + (j + 1) % sides
                faces.append((a, a + sides, b + sides, b))
        emit(name, verts, faces, mat, 'Head', orient=axis)

    disc('Eye_White', 0, 0, .102, .132, .004, 'Eye_White', 8, 36, .12)
    disc('Iris', .018, -.008, .074, .098, .009, 'Iris', 6, 32, .12)
    disc('Pupil', .024, -.004, .038, .062, .013, 'Pupil', 4, 24)
    disc('Glint', .045, .05, .022, .026, .017, 'Eye_Glint', 2, 14)
    disc('Glint_Small', -.012, -.052, .011, .012, .017, 'Eye_Glint', 2, 10)
    # Upper lid line with a small flick at the outer (rear) corner.
    verts, faces, n = [], [], 26
    for i in range(n + 1):
        t = i / n
        a = math.radians(-8 + 196 * t)
        k = 1.02 + .03 * math.sin(math.pi * t)
        w = (.012 + .014 * math.sin(math.pi * min(1, t * 1.2)) + (.022 * max(0, (t - .82) / .18) ** 1.5)) * E
        x, y = EW * k * math.cos(a), EH * k * math.sin(a)
        c, sn = math.cos(.12), math.sin(.12)
        x, y = x * c - y * sn, x * sn + y * c
        rx, ry = x / (EW * k), y / (EH * k)
        if t > .82:
            y += .02 * E * (t - .82) / .18
            x -= .012 * E * (t - .82) / .18
        verts.append(place(x - rx * w * .3, y - ry * w * .3, .012))
        verts.append(place(x + rx * w, y + ry * w, .012))
    for i in range(n):
        faces.append((2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1))
    emit('Eyelid', verts, faces, 'Eyelid', 'Head', orient=axis)


for s in (1, -1):
    eye_decals(s)


# ------------------------------------------------------------ plumes
def grow(name, origin, ray, direction, length, width, top, bottom=None, weights='soft', lift=.25, thick=.032,
         sink=.04, **kw):
    """Root a feather on the body surface hit by a ray, pointing along the surface plus `lift`."""
    p, n = surface(origin, ray)
    if p is None:
        print('MISS', name, tuple(origin), flush=True)
        return
    d = Vector(direction)
    d = (d - d.dot(n) * n).normalized()
    d = (d + n * lift).normalized()
    root = p - n * sink - d * .02
    w = soft_weights(p, BODY_SEGS) if weights == 'soft' else weights
    kw.setdefault('up', n)
    return feather(name, root, root + d * length, width, thick, top, bottom, w, **kw)


# Crest (forehead plumes): own material and bone so colour and wind are independent.
for r, t, w in [
    ((0, -.96, 2.64), (0, -.73, 3.07), .15),
    ((.075, -.94, 2.63), (.165, -.68, 2.98), .13), ((-.075, -.94, 2.63), (-.165, -.68, 2.98), .13),
    ((.13, -.91, 2.60), (.28, -.64, 2.83), .11), ((-.13, -.91, 2.60), (-.28, -.64, 2.83), .11),
    ((0, -.88, 2.68), (0, -.55, 2.95), .13),
]:
    feather('Crest_Plume', H(r), H(t), w * HEAD_K, .038 * HEAD_K, 'Crest_Plume', weights='Crest', up=(0, -1, .5),
            bend=.1, curl=-.2, twist=-4 * r[0], steps=12, sides=10, peak=.36, base_w=.45, uv0=.32)

for s in (1, -1):
    # Swept-back plumes behind the eyes and cheeks.
    for y, z, L, w in [(-.64, 2.54, .36, .12), (-.66, 2.40, .38, .12), (-.70, 2.26, .32, .105)]:
        grow('Head_Plume', H((s * .8, y, z)), (-s, 0, 0), (0, 1, .12), L * HEAD_K, w * HEAD_K, 'Plumage_Main',
             'Plumage_Dark', 'Head', lift=.32, bend=.06, curl=.22, steps=10, sides=8, peak=.34, base_w=.5)
    grow('Crown_Plume', H((s * .13, -.56, 3.2)), (0, 0, -1), (s * .35, 1, 0), .36 * HEAD_K, .12 * HEAD_K,
         'Plumage_Main', 'Plumage_Dark', 'Head', lift=.3, bend=.06, curl=.2, peak=.34, base_w=.5)
grow('Crown_Plume', H((0, -.50, 3.2)), (0, 0, -1), (0, 1, 0), .4 * HEAD_K, .13 * HEAD_K, 'Plumage_Main',
     'Plumage_Dark', 'Head', lift=.3, bend=.06, curl=.2, peak=.34, base_w=.5)

# Fluffy bib: overlapping rows of round-tipped feathers down the breast.
BIB = [(1.80, (-.10, .10), .22), (1.68, (-.19, 0, .19), .25), (1.55, (-.27, -.09, .09, .27), .27),
       (1.42, (-.30, -.15, 0, .15, .30), .27), (1.29, (-.24, -.08, .08, .24), .25)]
for z, xs, L in BIB:
    for x in xs:
        grow('Chest_Tuft', (x, -3, z), (0, 1, 0), (x * .8, -.1, -1), L, .135, 'Plumage_Light', 'Plumage_Main',
             lift=.12, bend=.1, curl=.3, steps=8, sides=8, peak=.45, base_w=.5, round_tip=True)

# Nape mane and mantle: overlapping feathers down the back of the neck and between the wings.
for x, z, L in [(0, 2.12, .3), (.11, 2.0, .28), (-.11, 2.0, .28), (0, 1.9, .3)]:
    grow('Nape', (x, 1.5, z), (0, -1, 0), (x, .5, -1), L, .15, 'Plumage_Main', 'Plumage_Dark', lift=.16, bend=.08,
         curl=.22, steps=8, sides=8, peak=.42, base_w=.5, round_tip=True)
for x, y, L in [(.14, -.1, .3), (-.14, -.1, .3), (0, -.05, .32), (.16, .15, .3), (-.16, .15, .3), (0, .2, .32)]:
    grow('Mantle', (x, y, 3.2), (0, 0, -1), (x * 1.2, 1, 0), L, .15, 'Plumage_Main', 'Plumage_Dark', lift=.14,
         bend=.08, curl=.22, steps=8, sides=8, peak=.42, base_w=.5, round_tip=True)

for s in (1, -1):
    # Neck ruff where the neck meets the shoulders.
    for y, z in [(-.52, 1.96), (-.42, 1.84), (-.60, 1.82)]:
        grow('Neck_Ruff', (s * 2, y, z), (-s, 0, 0), (0, .6, -.8), .26, .13, 'Plumage_Light', 'Plumage_Main',
             lift=.2, bend=.08, curl=.22, steps=8, sides=8, peak=.42, base_w=.5, round_tip=True)
    # Feathered "trousers": a fringe hanging over the red drumsticks.
    thigh = Vector((s * .31, .12, .80))
    for i in range(8):
        a = math.radians(-110 + i * 220 / 7)
        radial = Vector((s * math.cos(a), math.sin(a), 0))
        grow('Thigh_Fringe', thigh + radial + Vector((0, 0, .06 * max(0, -math.sin(a)))), -radial, (0, .15, -1), .22, .12, 'Plumage_Main', 'Plumage_Dark',
             lift=.14, bend=.08, curl=.2, steps=8, sides=8, peak=.42, base_w=.5, round_tip=True)

# ------------------------------------------------------------------- tail
TAIL_ROOT = Vector((0, .62, 1.52))
for i in range(9):
    k = (i - 4) / 4
    yaw = math.radians(40 * k)
    pitch = math.radians(40 - 12 * abs(k))
    d = Vector((math.sin(yaw) * math.cos(pitch), math.cos(yaw) * math.cos(pitch), math.sin(pitch)))
    L = .66 - .14 * abs(k) ** 1.4
    root = TAIL_ROOT + Vector((.07 * k, -.06, -.03 * abs(k)))
    feather('Tail_Plume', root, root + d * L, .15, .034, 'Plumage_Light' if i % 2 else 'Plumage_Main', 'Plumage_Dark',
            'Tail', up=(0, -.5, 1), bend=.07, curl=.22, steps=11, sides=8, peak=.36, base_w=.4)
for i in range(5):
    k = (i - 2) / 2
    root = TAIL_ROOT + Vector((.1 * k, -.14, .06))
    d = Vector((.4 * k, 1, .85)).normalized()
    feather('Tail_Covert', root, root + d * .34, .14, .034, 'Plumage_Main', 'Plumage_Dark', 'Tail', up=(0, -.6, 1),
            bend=.08, curl=.22, steps=8, sides=8, peak=.4, base_w=.5, round_tip=True)


# ------------------------------------------------------------------- wings
def wing(mirror):
    def bone(u):
        return 'Shoulder.L' if u < .25 else 'Forearm.L'
    # Plump coverts along the leading edge hide the roots of everything else.
    for i in range(5):
        u = .02 + i * .10
        root = wp(u, -.07, .035)
        feather('Wing_Covert', root, root + wd(8 + i * 7) * (.3 - .012 * i), .15, .045, 'Plumage_Main', 'Plumage_Dark',
                bone(u), mirror, up=WN, bend=.12, curl=-.1, steps=9, sides=8, peak=.42, base_w=.5, round_tip=True)
    for i in range(5):
        u = .06 + i * .085
        root = wp(u, .07, .008)
        feather('Wing_Covert_Low', root, root + wd(10 + i * 7) * .36, .14, .036, 'Plumage_Light', 'Plumage_Dark',
                bone(u), mirror, up=WN, bend=.1, curl=-.12, steps=9, sides=8, peak=.4, base_w=.45)
    for i in range(5):
        u = .05 + i * .085
        root = wp(u, .02, -.02)
        feather('Secondary', root, root + wd(4 + i * 6) * (.54 + .012 * i), .13, .03, 'Plumage_Main', 'Plumage_Dark',
                bone(u), mirror, up=WN, bend=.07, curl=-.14, steps=11, sides=8, peak=.36, base_w=.4)
    # Primaries on three fan bones, stacked so a closed fan never z-fights.
    k = 0
    for fan, alpha in FAN_ALPHA.items():
        for da in (-7, 5):
            a = alpha + da
            root = WRIST + wd(a) * .02 + WN * (-.03 - .009 * k)
            L = .7 - .022 * abs(k - 2.5) ** 1.6
            feather('Primary', root, root + wd(a) * L, .125, .028, 'Plumage_Main' if k % 2 else 'Plumage_Light',
                    'Plumage_Dark', fan + '.L', mirror, up=WN, bend=.06, curl=-.18, steps=12, sides=8, peak=.34,
                    base_w=.4)
            k += 1
    frame = Matrix((WU, WV, WN)).transposed().to_quaternion()
    v, f = ellipsoid_data(WRIST + WN * .015, (.12, .15, .08), 16, 10, frame)
    emit('Wrist_Puff', v, f, 'Plumage_Main', 'Forearm.L', mirror)
    v, f = ellipsoid_data(wp(.12, 0, .0), (.19, .15, .1), 18, 10, frame)
    emit('Shoulder_Puff', v, f, 'Plumage_Main', 'Shoulder.L', mirror)


wing(False)
wing(True)

# -------------------------------------------------------------------- legs
LEG_SEGS = [('Shin.L', KNEE, ANKLE, .0), ('Tarsus.L', ANKLE, BALL, .0)]


def leg(mirror):
    pts = catmull([KNEE + Vector((0, -.01, .1)), KNEE, (KNEE + ANKLE) / 2 + Vector((0, -.02, 0)), ANKLE,
                   (ANKLE + BALL) / 2 + Vector((0, -.012, 0)), BALL], 7)
    total = len(pts) - 1
    radii = []
    for i in range(len(pts)):
        t = i / total
        # drumstick bulge, slim ankle, sturdy tarsus
        r = .125 - .062 * t + .038 * math.exp(-((t - .17) / .14) ** 2) + .013 * math.exp(-((t - .6) / .05) ** 2)
        radii.append(max(.062, r))
    v, f = tube_data(pts, radii, 18)
    emit('Leg', v, f, 'Leg', [soft_weights(p, LEG_SEGS, .035, 2) for p in v], mirror)
    v, f = ellipsoid_data(ANKLE + Vector((0, .014, 0)), (.082, .084, .088), 16, 10)
    emit('Ankle', v, f, 'Leg', [soft_weights(p, LEG_SEGS, .035, 2) for p in v], mirror)
    # Front scutes on the tarsus.
    d = (BALL - ANKLE).normalized()
    fwd = Vector((0, -1, 0))
    fwd = (fwd - fwd.dot(d) * d).normalized()
    side = d.cross(fwd).normalized()
    for i in range(6):
        t = .15 + i * .125
        c = ANKLE + (BALL - ANKLE) * t
        r = .066 - .004 * t
        verts, faces, arc = [], [], 11
        for j in range(arc + 1):
            a = math.radians(-80 + 160 * j / arc)
            n = fwd * math.cos(a) + side * math.sin(a)
            for h, rr in [(-.026, r + .004), (.0, r + .014), (.026, r + .004), (.0, r - .012)]:
                verts.append(c + d * h + n * rr)
        for j in range(arc):
            for q in range(4):
                a0, a1 = j * 4 + q, j * 4 + (q + 1) % 4
                faces.append((a0, a1, a1 + 4, a0 + 4))
        emit('Scute', verts, faces, 'Leg_Scale', 'Tarsus.L', mirror)
    # Foot: pad, three forward toes, one back toe, ivory claws.
    v, f = ellipsoid_data(BALL + Vector((0, -.02, -.01)), (.1, .11, .066), 18, 10)
    emit('Foot_Pad', v, f, 'Leg', 'Toes.L', mirror)
    for k in (-1, 0, 1):
        ang = math.radians(26 * k)
        L = .31 if k == 0 else .26
        dirv = Vector((math.sin(ang), -math.cos(ang), 0))
        a = BALL + Vector((0, -.02, -.03))
        b = a + dirv * L * .5 + Vector((0, 0, -.012))
        c = a + dirv * L + Vector((0, 0, -.02))
        pts = catmull([a, b, c], 6)
        radii = [.056 - .016 * i / (len(pts) - 1) + .007 * math.sin(math.pi * 2 * i / (len(pts) - 1)) ** 2
                 for i in range(len(pts))]
        v, f = tube_data(pts, radii, 12, .85)
        emit('Toe', v, f, 'Leg', 'Toes.L', mirror)
        feather('Claw', c - dirv * .02 + Vector((0, 0, .004)), c + dirv * .12 + Vector((0, 0, -.03)), .04, .034,
                'Claw', weights='Toes.L', mirror=mirror, up=(0, 0, 1), bend=.12, curl=-.1, steps=7, sides=10,
                base_w=.95, peak=.12)
    a = BALL + Vector((0, .04, -.03))
    c = a + Vector((0, .15, -.03))
    v, f = tube_data(catmull([a, c], 6), [.046 - .01 * i / 6 for i in range(7)], 12, .85)
    emit('Back_Toe', v, f, 'Leg', 'Toes.L', mirror)
    feather('Claw', c - Vector((0, .02, 0)), c + Vector((0, .085, -.028)), .033, .028, 'Claw', weights='Toes.L',
            mirror=mirror, up=(0, 0, 1), bend=.12, steps=7, sides=10, base_w=.95, peak=.12)


leg(False)
leg(True)

# ----------------------------------------------------------- join and rig
bpy.ops.object.select_all(action='DESELECT')
for obj in PARTS:
    obj.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
skin = bpy.context.object
skin.name = 'Chocobo_Skin'
skin.data.name = 'Chocobo_Skin'
bpy.ops.object.select_all(action='DESELECT')

arm = bpy.data.armatures.new('Chocobo_Skeleton')
rig = bpy.data.objects.new('Chocobo_Rig', arm)
bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for name, head, tail, parent in BONES:
    eb = arm.edit_bones.new(name)
    eb.head, eb.tail = head, tail
    eb.roll = 0
    if parent:
        eb.parent = arm.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
rig.select_set(False)
skin.parent = rig
mod = skin.modifiers.new('Skeleton', 'ARMATURE')
mod.object = rig
for pb in rig.pose.bones:
    pb.rotation_mode = 'QUATERNION'
unknown = {g.name for g in skin.vertex_groups} - {b.name for b in arm.bones}
assert not unknown, unknown

# --------------------------------------------------------------- posing
REST = {b.name: b.matrix_local.copy() for b in arm.bones}
PARENT = {b.name: (b.parent.name if b.parent else None) for b in arm.bones}
ORDER = [b.name for b in arm.bones]  # parents precede children


def mirror_q(q):
    return Quaternion((q.w, q.x, -q.y, -q.z))


def axis_q(axis, deg):
    return Quaternion(Vector(axis).normalized(), math.radians(deg))


class Pose:
    """Armature-space FK with rotations given about rest-frame axes, plus 2-bone leg IK."""

    def __init__(self):
        self.q = {}
        self.t = {}
        self.world = {}
        self.basis = {}

    def rot(self, name, q):
        self.q[name] = q @ self.q.get(name, Quaternion())

    def side(self, name, q, s):
        self.rot(name + ('.L' if s > 0 else '.R'), q if s > 0 else mirror_q(q))

    def solve(self, feet=None):
        feet = feet or {}
        for name in ORDER:
            B = REST[name]
            par = PARENT[name]
            P = self.world[par] @ REST[par].inverted() @ B if par else B.copy()
            leg_bone = name.split('.')[0] in ('Shin', 'Tarsus', 'Toes') and name[-1] in feet and name[-2] == '.'
            if leg_bone:
                W = self.leg_world(name, P, feet[name[-1]])
                basis = P.inverted() @ W
            else:
                RB = B.to_quaternion()
                q = RB.inverted() @ self.q.get(name, Quaternion()) @ RB
                t = RB.inverted() @ self.t.get(name, Vector())
                basis = Matrix.Translation(t) @ q.to_matrix().to_4x4()
            self.basis[name] = basis
            self.world[name] = P @ basis
        return self

    def leg_world(self, name, P, foot):
        kind, sfx = name.split('.')
        target, pitch = foot
        if kind == 'Shin':
            K = P.to_translation()
            thigh = self.world['Thigh.' + sfx]
            hint = (thigh.to_3x3() @ REST['Thigh.' + sfx].to_3x3().inverted() @ Vector((0, 1, 0))).normalized()
            a = (ANKLE - KNEE).length
            b = (BALL - ANKLE).length
            D = target - K
            dist = min(D.length, a + b - 1e-4)
            self.reach = max(getattr(self, 'reach', 0), D.length / (a + b))
            d = D.normalized()
            cos_a = max(-1, min(1, (a * a + dist * dist - b * b) / (2 * a * dist)))
            perp = (hint - hint.dot(d) * d).normalized()
            A = K + (d * cos_a + perp * math.sqrt(1 - cos_a * cos_a)) * a
            self._ball, self._lateral = K + d * dist, d.cross(perp).normalized()
            return self.aim(name, K, A - K, self._lateral)
        if kind == 'Tarsus':
            A = P.to_translation()
            return self.aim(name, A, self._ball - A, self._lateral)
        # Toes: keep the rest orientation in the world (flat foot), curl by pitch about X.
        rot = Quaternion(Vector((1, 0, 0)), pitch).to_matrix().to_4x4()
        W = rot @ Matrix.Translation(-P.to_translation()) @ REST[name]
        W.translation = P.to_translation()
        return W

    def aim(self, name, head, direction, lateral):
        """Bone along `direction`, bending about `lateral` (the leg plane normal; +X at rest)."""
        B = REST[name]
        y0 = (B.to_3x3() @ Vector((0, 1, 0))).normalized()
        x0 = Vector((1, 0, 0))
        y1 = direction.normalized()
        x1 = (lateral - lateral.dot(y1) * y1).normalized()
        M0 = Matrix((x0, y0, x0.cross(y0))).transposed()
        M1 = Matrix((x1, y1, x1.cross(y1))).transposed()
        W = (M1 @ M0.inverted() @ B.to_3x3()).to_4x4()
        W.translation = head
        return W

    def apply(self):
        for name, basis in self.basis.items():
            pb = rig.pose.bones[name]
            pb.location = basis.to_translation()
            pb.rotation_quaternion = basis.to_quaternion()


def folded_wing(p, s, fold=1.0, flap=0.0, sweep=0.0, fan=None):
    """fold=1 closed against the flank, 0 fully spread. flap raises the spread wing (deg)."""
    down = 68 * fold - flap
    p.side('Shoulder', axis_q((0, 1, 0), down) @ axis_q(WN, 16 * fold + sweep), s)
    p.side('Forearm', axis_q(WN, 12 * fold), s)
    for (fan_name, _), amount in zip(FAN_ALPHA.items(), fan or (8, 22, 38)):
        p.side(fan_name, axis_q(WN, amount * fold), s)


# ------------------------------------------------------------- animation
FPS = 30
scene.render.fps = FPS
X, Y, Z = (1, 0, 0), (0, 1, 0), (0, 0, 1)
skin.data.update()
REST_LOW = min(v.co.z for v in skin.data.vertices)
FOOT_Z = BALL.z - REST_LOW + .004  # stance ball height that puts the claws on the ground

# Wings: 'closed' folded to the flank, 'spread' open for balance, 'half' part-open.
# stride/lift in metres, lean/bank in degrees, seconds per two-step cycle.
CLIPS = {
    'Idle': dict(kind='idle', seconds=3.0, wings='closed'),
    'Run_StartDash': dict(seconds=.62, stride=.86, duty=.40, lift=.34, crouch=.12, bob=.045, lean=19, neck=10,
                          pitch_osc=3, wings='closed', wind=10, tail=-8),
    'Run_Cruise': dict(seconds=.72, stride=.72, duty=.42, lift=.30, crouch=.07, bob=.04, lean=8, neck=4,
                       pitch_osc=2.5, wings='closed', wind=5, tail=0),
    'Run_Corner': dict(seconds=.72, stride=.70, duty=.42, lift=.30, crouch=.115, bob=.04, lean=9, neck=4,
                       pitch_osc=2.5, wings='spread', fold=.1, flap=8, flap_osc=9, seesaw=True, sweep=6, turn=1,
                       bank=13, look=14, wind=6, tail=0),
    'Run_Downhill': dict(seconds=.72, stride=.76, duty=.40, lift=.28, crouch=.08, bob=.05, lean=3, neck=-2,
                         pitch_osc=3, wings='half', fold=.5, flap=4, flap_osc=5, sweep=4, wind=7, tail=6),
    'Run_LastSpurt': dict(seconds=.56, stride=.94, duty=.36, lift=.38, crouch=.13, bob=.05, lean=17, neck=14,
                          pitch_osc=3.5, wings='spread', fold=0, flap=10, flap_osc=20, sweep=14, jaw=13, wind=16,
                          tail=-10),
}
CLIPS['Run_Corner_R'] = dict(CLIPS['Run_Corner'], turn=-1)


def bump(p, center, width):
    d = (p - center + .5) % 1 - .5
    return math.exp(-(d / width) ** 2)


def smooth01(u):
    return u - math.sin(TAU * u) / TAU


def foot(phase, c, s):
    """Foot target (ball of the foot, world space) and toe curl for one leg."""
    duty, stride = c['duty'], c['stride']
    yc = -.06
    xs = s * .26 - c.get('turn', 0) * .09  # support goes to the outside of a banked turn
    if phase < duty:
        u = phase / duty
        return Vector((xs, yc - stride / 2 + stride * u, FOOT_Z)), 0.0
    u = (phase - duty) / (1 - duty)
    y = yc + stride / 2 - stride * smooth01(u) + .07 * math.sin(math.pi * u) * (1 - u) ** 2
    z = FOOT_Z + c['lift'] * math.sin(math.pi * u ** .8) ** 1.2
    x = xs - s * .035 * math.sin(math.pi * u)
    return Vector((x, y, z)), math.radians(62) * math.sin(math.pi * u ** .9) ** .8


def pose_at(c, p):
    P = Pose()
    if c.get('kind') == 'idle':
        breath = math.sin(2 * TAU * p)
        sway = math.sin(TAU * p)
        P.t['Body'] = Vector((.014 * sway, 0, -.03 + .012 * breath))
        P.rot('Body', axis_q(Z, 2 * sway) @ axis_q(Y, 1.6 * sway) @ axis_q(X, 1.2 * breath))
        P.rot('Neck', axis_q(X, -2 - 2 * breath))
        P.rot('Head', axis_q(Z, 17 * sway) @ axis_q(Y, 7 * math.sin(TAU * p + .6))
              @ axis_q(X, -2 + 4 * math.sin(2 * TAU * p + .4)))
        P.rot('Crest', axis_q(Y, -6 * math.sin(TAU * p + .1)) @ axis_q(X, 4 * math.sin(2 * TAU * p - .6)))
        P.rot('Tail', axis_q(Z, 8 * math.sin(2 * TAU * p)) @ axis_q(X, 3 * breath))
        P.rot('Jaw', axis_q(X, 17 * bump(p, .72, .045)))
        for s in (1, -1):
            folded_wing(P, s, 1.0, flap=1.5 + 6 * bump(p, .36, .035) + 1.2 * breath)
            P.side('Thigh', axis_q(X, 0), s)
        feet = {'L': (Vector((.30, BALL.y, FOOT_Z)), 0.0), 'R': (Vector((-.30, BALL.y, FOOT_Z)), 0.0)}
        return P.solve(feet)

    turn = c.get('turn', 0)
    pm = p - c['duty'] / 2            # 0 at the left foot's mid-stance
    bob2 = math.cos(2 * TAU * pm)      # +1 at each mid-stance
    side1 = math.cos(TAU * pm)         # +1 over the left foot, -1 over the right
    pitch = c['lean'] + c['pitch_osc'] * math.sin(2 * TAU * pm - .4)
    roll = 2.2 * side1 + turn * c.get('bank', 0)
    yaw = 3 * math.sin(TAU * pm) + turn * 4
    P.t['Body'] = Vector((.025 * side1 + turn * .03, 0, -c['crouch'] - c['bob'] * bob2))
    P.rot('Body', axis_q(Z, yaw) @ axis_q(Y, roll) @ axis_q(X, pitch))
    neck = c['neck'] + 1.5 * math.sin(2 * TAU * pm - 1.0)
    P.rot('Neck', axis_q(X, neck))
    # The head stays level and steady while the body bounces under it.
    P.rot('Head', axis_q(Z, turn * c.get('look', 0) - .6 * yaw) @ axis_q(Y, -.75 * roll)
          @ axis_q(X, -.85 * (pitch + neck) + 1.5 * math.sin(2 * TAU * pm - 1.4)))
    P.rot('Crest', axis_q(Y, -turn * 7) @ axis_q(X, -c['wind'] + 6 * math.sin(2 * TAU * pm - 1.7)))
    P.rot('Tail', axis_q(Z, 6 * math.sin(TAU * pm - .8) + turn * 10)
          @ axis_q(X, c['tail'] + 7 * math.sin(2 * TAU * pm - 1.1)))
    if c.get('jaw'):
        P.rot('Jaw', axis_q(X, c['jaw'] * (.8 + .2 * math.sin(2 * TAU * pm - .6))))
    for s in (1, -1):
        if c['wings'] == 'closed':
            folded_wing(P, s, 1.0, flap=2 + 2.5 * math.sin(2 * TAU * pm - .9))
        else:
            outer = turn != 0 and s == -turn
            base = c['flap'] + (12 if outer else -5 if turn else 0)
            wave = math.sin(TAU * pm) * s if c.get('seesaw') else math.sin(2 * TAU * pm - .5)
            folded_wing(P, s, c['fold'], flap=base + c['flap_osc'] * wave, sweep=c.get('sweep', 0))
    feet = {}
    for sfx, s, off in (('L', 1, 0.0), ('R', -1, .5)):
        phase = (p - off) % 1
        target, curl = foot(phase, c, s)
        feet[sfx] = (target, curl)
        forward = (-.06 - target.y) / (c['stride'] / 2)
        P.side('Thigh', axis_q(X, -14 * max(-1.0, min(1.0, forward))), s)
    return P.solve(feet)


def clear_pose():
    for pb in rig.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.scale = (1, 1, 1)


rig.animation_data_create()
ACTIONS = {}
REACH = {}
for name, c in CLIPS.items():
    frames = round(c['seconds'] * FPS)
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    rig.animation_data.action = action
    prev = {}
    first = {}
    reach = 0.0
    for f in range(frames + 1):
        pose = pose_at(c, (f % frames) / frames)
        reach = max(reach, getattr(pose, 'reach', 0))
        for bname, basis in pose.basis.items():
            pb = rig.pose.bones[bname]
            q = basis.to_quaternion()
            if bname in prev:
                q.make_compatible(prev[bname])
            if f == frames:
                assert q.dot(first[bname]) > 0, (name, bname)
                q = first[bname]
            prev[bname] = q
            first.setdefault(bname, q.copy())
            pb.rotation_quaternion = q
            pb.location = basis.to_translation()
            pb.keyframe_insert('rotation_quaternion', frame=f + 1, group=bname)
            pb.keyframe_insert('location', frame=f + 1, group=bname)
    for fc in action.fcurves:
        for key in fc.keyframe_points:
            key.interpolation = 'LINEAR'
    REACH[name] = round(reach, 3)
    ACTIONS[name] = action
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 1, action)
    track.mute = True
print('REACH', REACH, flush=True)


def use_clip(name, frame=1):
    rig.animation_data.action = ACTIONS[name]
    scene.frame_set(frame)
    bpy.context.view_layer.update()


# ------------------------------------------------------------ colour sets
# body: main, light, dark, iris; the genetics module's ten plumage colours.
PALETTE = {
    'yellow': ('#f3b92a', '#fcd565', '#d7861a', '#1f8a6c'),
    'red': ('#d9432f', '#f07b5c', '#9c2720', '#2c6cb4'),
    'blue': ('#3d7ed2', '#7fb3ee', '#28508f', '#e39a1d'),
    'green': ('#4c9a59', '#8ccb88', '#2d6440', '#7a3b1c'),
    'rose': ('#ec8ea6', '#f9bfcd', '#c05b7a', '#3a6db0'),
    'white': ('#eceae3', '#ffffff', '#b4bdc3', '#3a7bd5'),
    'black': ('#2b2d39', '#4a4e5f', '#16171e', '#d8282e'),
    'purple': ('#8a5db8', '#b893de', '#593784', '#e0b030'),
    'gray': ('#9ba1a7', '#c7ccd0', '#6a7075', '#2f7f6a'),
    'golden': ('#e0a526', '#f8d56a', '#ad7210', '#b8322a'),
}
CREST_COLORS = {'yellow': '#ffcf3c', 'red': '#e0352b', 'blue': '#3b7ee0', 'white': '#f6f4ee', 'black': '#24252d',
                'rainbow': None}
RAINBOW = ['#e0474f', '#f09a3a', '#f2d24a', '#6cc26a', '#4d9ee0', '#9b6fd6']


def recolored(color, crest, tag):
    """Material copies for one look. Rainbow uses the crest UV (root u=0 -> tip u=1)."""
    main, light, dark, iris = PALETTE[color]
    out = {}
    for mat in skin.data.materials:
        m = mat.copy()
        m.name = mat.name + '.' + tag
        p = m.node_tree.nodes['Principled BSDF']
        hexcode = {'Plumage_Main': main, 'Plumage_Light': light, 'Plumage_Dark': dark, 'Iris': iris}.get(mat.name)
        if mat.name == 'Crest_Plume':
            hexcode = CREST_COLORS[crest]
            if hexcode is None:
                nt = m.node_tree
                uv = nt.nodes.new('ShaderNodeUVMap')
                uv.uv_map = 'UVMap'
                sep = nt.nodes.new('ShaderNodeSeparateXYZ')
                ramp = nt.nodes.new('ShaderNodeValToRGB')
                ramp.color_ramp.elements.remove(ramp.color_ramp.elements[1])
                for i, h in enumerate(RAINBOW):
                    el = ramp.color_ramp.elements[0] if i == 0 else ramp.color_ramp.elements.new(i / (len(RAINBOW) - 1))
                    el.position = i / (len(RAINBOW) - 1)
                    el.color = (*lin(h), 1)
                nt.links.new(uv.outputs['UV'], sep.inputs[0])
                nt.links.new(sep.outputs['X'], ramp.inputs['Fac'])
                nt.links.new(ramp.outputs['Color'], p.inputs['Base Color'])
        if hexcode:
            p.inputs['Base Color'].default_value = (*lin(hexcode), 1)
        if color == 'golden' and mat.name.startswith('Plumage'):
            p.inputs['Metallic'].default_value = .45
            p.inputs['Roughness'].default_value = .36
        out[mat.name] = m
    return out


# -------------------------------------------------------------- previews
def render_setup(res=1100, samples=96):
    world = scene.world or bpy.data.worlds.new('Studio_World')
    scene.world = world
    world.color = (.35, .35, .35)
    scene.render.engine = 'BLENDER_EEVEE'
    scene.eevee.use_gtao = True
    scene.eevee.gtao_distance = 1.5
    scene.eevee.gtao_factor = 1.0
    scene.eevee.use_soft_shadows = True
    scene.eevee.taa_render_samples = samples
    scene.view_settings.view_transform = 'Filmic'
    scene.view_settings.look = 'Medium High Contrast'
    scene.view_settings.exposure = .25
    scene.render.resolution_x = scene.render.resolution_y = res
    scene.render.image_settings.file_format = 'PNG'


STUDIO = bpy.data.collections.new('STUDIO_preview_only')
scene.collection.children.link(STUDIO)


def stage(obj):
    for coll in list(obj.users_collection):
        coll.objects.unlink(obj)
    STUDIO.objects.link(obj)
    return obj


def build_studio():
    floor_mat = material('Studio_Floor', '#c9c3b3', .88)
    mesh = bpy.data.meshes.new('Studio_Ground')
    mesh.from_pydata([(-60, -60, 0), (60, -60, 0), (60, 60, 0), (-60, 60, 0)], [], [(0, 1, 2, 3)])
    mesh.materials.append(floor_mat)
    stage(bpy.data.objects.new('Studio_Ground', mesh))
    cam = stage(bpy.data.objects.new('Studio_Camera', bpy.data.cameras.new('Studio_Camera')))
    cam.data.type = 'ORTHO'
    scene.camera = cam
    for nm, loc, power, size, col in [('Key_Softbox', (3, -4.5, 6), 900, 4, (1, .94, .84)),
                                      ('Fill_Softbox', (-5, -2, 3.5), 420, 5, (.84, .9, 1)),
                                      ('Rim_Softbox', (1.5, 4.5, 5), 650, 3, (1, .88, .66))]:
        light = stage(bpy.data.objects.new(nm, bpy.data.lights.new(nm, 'AREA')))
        light.data.energy, light.data.size, light.data.color = power, size, col
        light.location = loc
        light.rotation_euler = (Vector((0, 0, 1.4)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    return cam


def aim(cam, loc, target=(0, 0, 1.5), scale=4.6):
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    cam.data.ortho_scale = scale


def render(path):
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def contact_sheet(paths, out, cols):
    imgs = [bpy.data.images.load(str(p)) for p in paths]
    w, h = imgs[0].size
    rows = math.ceil(len(imgs) / cols)
    sheet = bpy.data.images.new('sheet', w * cols, h * rows)
    import numpy as np
    buf = np.ones((h * rows, w * cols, 4), dtype=np.float32)
    for i, img in enumerate(imgs):
        px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
        r, cidx = rows - 1 - i // cols, i % cols
        buf[r * h:(r + 1) * h, cidx * w:(cidx + 1) * w] = px
    sheet.pixels = buf.ravel()
    sheet.filepath_raw = str(out)
    sheet.file_format = 'PNG'
    sheet.save()


ANIM = next((a.split('=', 1)[1] for a in ARGV if a.startswith('--anim=')), None)
if QUICK or ANIM:
    qdir = Path(QUICK or ANIM)
    qdir.mkdir(parents=True, exist_ok=True)
    skin.data.calc_loop_triangles()
    print('QUICK tris', len(skin.data.loop_triangles), 'verts', len(skin.data.vertices), flush=True)
    cam = build_studio()
    render_setup(560 if ANIM else 760, 24)
    if QUICK:
        rig.animation_data.action = None
        clear_pose()
        views = {'front': (0, -8, 1.6), 'side': (8, 0, 1.6), 'three': (5.2, -6, 3.2), 'back': (-3.5, 7, 3.2),
                 'top': (0, -.01, 9)}
        for label in ('rest', 'folded'):
            clear_pose()
            if label == 'folded':
                use_clip('Idle', 1)
            bpy.context.view_layer.update()
            for v, loc in views.items():
                aim(cam, loc, scale=4.4)
                render(qdir / f'{label}-{v}.png')
    else:
        for clip in [a for a in ARGV if a.startswith('--clip=')] or ['--clip=Run_Cruise']:
            clip = clip.split('=', 1)[1]
            frames = round(CLIPS[clip]['seconds'] * FPS)
            paths = []
            for view, loc in [('side', (8, 0, 1.5)), ('three', (5, -6, 3)), ('front', (-1.5, -8, 2.4))]:
                aim(cam, loc, scale=4.6)
                for k in range(4):
                    use_clip(clip, 1 + k * frames // 4)
                    path = qdir / f'{clip}-{view}-{k}.png'
                    render(path)
                    paths.append(path)
            contact_sheet(paths, qdir / f'{clip}-sheet.png', 4)
    raise SystemExit(0)

# ------------------------------------------------------------------ export
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
skin.select_set(True)
bpy.context.view_layer.objects.active = rig
use_clip('Run_Cruise', 1)
GLB = OUT / 'chocobo-v3.glb'
bpy.ops.export_scene.gltf(filepath=str(GLB), export_format='GLB', use_selection=True, export_animations=True,
                          export_nla_strips=True, export_force_sampling=True, export_skins=True, export_yup=True,
                          export_materials='EXPORT', export_texcoords=True, export_normals=True,
                          export_colors=False)
# Blender 3.2 also emits a static object-transform clip for the skin; keep only the authored clips.
blob = GLB.read_bytes()
json_size = struct.unpack_from('<I', blob, 12)[0]
gltf = json.loads(blob[20:20 + json_size])
gltf['animations'] = [a for a in gltf.get('animations', []) if a['name'] in CLIPS]
assert {a['name'] for a in gltf['animations']} == set(CLIPS), [a['name'] for a in gltf['animations']]
payload = json.dumps(gltf, separators=(',', ':'), ensure_ascii=True).encode('utf-8')
payload += b' ' * (-len(payload) % 4)
rest = blob[20 + json_size:]
GLB.write_bytes(struct.pack('<III', 0x46546c67, 2, 20 + len(payload) + len(rest))
                + struct.pack('<II', len(payload), 0x4e4f534a) + payload + rest)

# ----------------------------------------------------------------- studio
cam = build_studio()
render_setup()
use_clip('Run_Cruise', 1)
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.region_3d.view_distance = 6.5
            area.spaces.active.region_3d.view_location = (0, 0, 1.5)
            area.spaces.active.shading.type = 'MATERIAL'
scene.frame_start, scene.frame_end = 1, round(CLIPS['Run_Cruise']['seconds'] * FPS) + 1
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'chocobo-v3.blend'))

for clip, frame, filename, loc in [
    ('Idle', 1, 'preview-idle.png', (4.6, -6.8, 3.2)),
    ('Run_Cruise', 4, 'preview-cruise.png', (4.6, -6.8, 3.2)),
    ('Run_Corner', 4, 'preview-corner.png', (-2.2, -7.6, 2.6)),
    ('Run_LastSpurt', 3, 'preview-spurt.png', (4.6, -6.8, 3.2)),
]:
    use_clip(clip, frame)
    aim(cam, loc)
    render(OUT / filename)
use_clip('Idle', 1)
for label, loc in [('front', (0, -8, 2.0)), ('side', (8, 0, 1.9)), ('back', (0, 8, 2.2))]:
    aim(cam, loc, scale=4.4)
    render(OUT / f'preview-{label}.png')

# Colour line-up (render only; saved .blend is untouched): posed copies with their own material copies.
LOOKS = [('yellow', 'rainbow', 'Idle', 1), ('black', 'red', 'Run_Cruise', 4), ('white', 'blue', 'Idle', 50),
         ('red', 'yellow', 'Run_Corner', 6), ('blue', 'white', 'Run_LastSpurt', 3), ('golden', 'black', 'Idle', 30)]
skin.hide_render = True
for i, (color, crest, clip, frame) in enumerate(LOOKS):
    r = stage(rig.copy())
    r.animation_data_clear()
    r.location = ((i - (len(LOOKS) - 1) / 2) * 2.25, 0, 0)
    r.rotation_euler.z = math.radians(-28)
    for fc in ACTIONS[clip].fcurves:
        bone, prop = fc.data_path.split('"')[1], fc.data_path.rsplit('.', 1)[1]
        getattr(r.pose.bones[bone], prop)[fc.array_index] = fc.evaluate(frame)
    sk = stage(skin.copy())
    sk.hide_render = False
    sk.data = skin.data.copy()
    sk.parent = r
    sk.modifiers['Skeleton'].object = r
    mats = recolored(color, crest, f'{color}_{crest}')
    for slot, mat in enumerate(sk.data.materials):
        sk.data.materials[slot] = mats[mat.name]
scene.render.resolution_x, scene.render.resolution_y = 2400, 900
aim(cam, (0, -18, 3.4), (0, 0, 1.45), 14.2)
bpy.context.view_layer.update()
render(OUT / 'preview-colors.png')

# --------------------------------------------------------------- manifest
skin.data.calc_loop_triangles()
manifest = {
    'revision': 3,
    'asset': 'chocobo-v3.glb',
    'blender': '3.2+',
    'forward': 'glTF +Z / Blender -Y',
    'up': 'glTF +Y / Blender +Z',
    'units': 'meters',
    'height': round(max(v.co.z for v in skin.data.vertices), 3),
    'rootMotion': False,
    'vertices': len(skin.data.vertices),
    'triangles': len(skin.data.loop_triangles),
    'bones': len(arm.bones),
    'materials': [m.name for m in skin.data.materials],
    'recolor': {
        'plumage': ['Plumage_Main', 'Plumage_Light', 'Plumage_Dark'],
        'crest': 'Crest_Plume',
        'iris': 'Iris',
        'rainbowCrestUv': 'TEXCOORD_0.x: 0 where the plume leaves the head, 1 at the tip',
    },
    'palette': {k: dict(zip(('main', 'light', 'dark', 'iris'), v)) for k, v in PALETTE.items()},
    'crests': {k: v for k, v in CREST_COLORS.items() if v} | {'rainbow': RAINBOW},
    'clips': {name: {
        'seconds': round(round(c['seconds'] * FPS) / FPS, 4),
        'loop': True,
        'wings': c['wings'],
        **({} if c.get('kind') == 'idle' else {
            'groundSpeed': round(c['stride'] / (c['duty'] * round(c['seconds'] * FPS) / FPS), 3),
            'turn': {1: 'left', -1: 'right'}.get(c.get('turn', 0), 'straight'),
        }),
    } for name, c in CLIPS.items()},
}
(OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('CHOCOBO_V3_OK', json.dumps({k: manifest[k] for k in ('vertices', 'triangles', 'bones')}), flush=True)
