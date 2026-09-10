import traceback, sys
# BrowOS custom fleet generator — builds two low-poly cars with colliders.
# Run headless:  blender --background --factory-startup --python build_blender_cars.py
#
# Runtime contract (js/gta/entities/vehicles.js + js/gta/systems/assets.js):
#   - Y-up, front = -Z, origin at ground center
#   - Hub-centered wheels named Wheel_FL / Wheel_FR / Wheel_RL / Wheel_RR (axle along X)
#   - COLOR_0 vertex colors; pure-white body paint -> tinted by instanceColor in game
#   - Glass vertex color (r<0.05, b>g*1.4) -> stylized tinted glass in game
#   - Headlight vc (r>0.92,g>0.92,0.70<b<0.88) at z<0 / taillight vc (r>0.82,g<0.25,b<0.25)
#     at z>0 -> emissive lights in game
#   - Any node whose name contains "wheel"/"tire" is excluded from the body bake,
#     so collider boxes are named WheelCollider_* : skipped in-game, visible in showroom
import bpy, bmesh, math
from math import radians, cos, sin, pi
from mathutils import Matrix, Vector

OUT_DIR = r"C:\Users\rudra\Desktop\BrowOS\assets\models\custom"

# ---------------------------------------------------------------- materials
MAT = {}

def make_mat(name, alpha=1.0, metallic=0.0, rough=0.8, emit=None, emit_s=0.0, no_depth=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Metallic"].default_value = metallic
    b.inputs["Roughness"].default_value = rough
    b.inputs["Alpha"].default_value = alpha
    if emit is not None:
        b.inputs["Emission Color"].default_value = (*emit, 1.0)
        b.inputs["Emission Strength"].default_value = emit_s
    if alpha < 1.0:
        try: m.blend_method = 'BLEND'
        except Exception: pass
        try: m.surface_render_method = 'BLENDED'
        except Exception: pass
    if no_depth:
        try: m.show_transparent_back = False
        except Exception: pass
    return m

def build_materials():
    MAT.clear()
    MAT['paint']    = make_mat('CarPaint',    metallic=0.25, rough=0.34)
    MAT['glass']    = make_mat('Glass',       metallic=0.10, rough=0.06)
    MAT['dark']     = make_mat('TrimDark',    rough=0.90)
    MAT['chrome']   = make_mat('Chrome',      metallic=1.0,  rough=0.25)
    MAT['head']     = make_mat('Headlight',   rough=0.30, emit=(1.0, 0.95, 0.80), emit_s=1.5)
    MAT['tail']     = make_mat('Taillight',   rough=0.30, emit=(1.0, 0.05, 0.05), emit_s=1.5)
    MAT['trim']     = make_mat('Trim',        rough=0.50)
    MAT['interior'] = make_mat('Interior',    rough=0.95)
    MAT['collider'] = make_mat('ColliderGlass', alpha=0.05, rough=0.40, no_depth=True)
    MAT['tire']     = make_mat('Tire',        rough=0.95)
    MAT['rim']      = make_mat('WheelRim',    metallic=0.85, rough=0.35)

# Vertex colors (linear). White body paint is what makes the car paintable in-game.
VC = {
    'paint':    (1.0, 1.0, 1.0),
    'glass':    (0.05, 0.25, 0.45),
    'dark':     (0.10, 0.10, 0.105),
    'chrome':   (0.78, 0.78, 0.80),
    'head':     (1.0, 0.96, 0.80),
    'tail':     (0.90, 0.04, 0.04),
    'trim':     (0.85, 0.85, 0.85),
    'interior': (0.08, 0.08, 0.085),
    'collider': (0.20, 0.90, 0.40),
    'tire':     (0.045, 0.045, 0.047),
    'rim':      (0.78, 0.78, 0.80),
}

# ---------------------------------------------------------------- geometry helpers
def _sgn(v):
    return -1.0 if v < 0 else 1.0

def ring_pts(hw, bot, top, p, n=12):
    """Superellipse cross-section ring in the XZ plane (x lateral, z vertical)."""
    mid = (bot + top) / 2.0
    hh = (top - bot) / 2.0
    pts = []
    for i in range(n):
        t = 2 * pi * i / n
        c, s = cos(t), sin(t)
        pts.append((hw * _sgn(c) * abs(c) ** p, mid + hh * _sgn(s) * abs(s) ** p))
    return pts

def add_loft(bm, stations, p, n=12):
    """Bridge cross-section stations [(y, halfW, bot, top), ...] rear->front (front = +Y)."""
    rings = []
    for (y, hw, bot, top) in stations:
        rings.append([bm.verts.new((x, y, z)) for (x, z) in ring_pts(hw, bot, top, p, n)])
    faces = []
    for a, b in zip(rings, rings[1:]):
        for i in range(n):
            j = (i + 1) % n
            faces.append(bm.faces.new((a[i], a[j], b[j], b[i])))
    faces.append(bm.faces.new(rings[0]))
    faces.append(bm.faces.new(tuple(reversed(rings[-1]))))
    return faces

CUBE_QUADS = [
    (0, 2, 3, 1),  # bottom -Z
    (4, 5, 7, 6),  # top    +Z
    (2, 6, 7, 3),  # front  +Y
    (0, 1, 5, 4),  # back   -Y
    (0, 4, 6, 2),  # left   -X
    (1, 3, 7, 5),  # right  +X
]

def add_box(bm, center, size, rot=None):
    """Axis-aligned box at center; optional pre-rotation applied around the origin
    before translation (so radial offsets rotate with the box)."""
    sx, sy, sz = size[0] / 2.0, size[1] / 2.0, size[2] / 2.0
    corners = [(sx if i & 1 else -sx, sy if i & 2 else -sy, sz if i & 4 else -sz) for i in range(8)]
    M = rot if rot else Matrix.Identity(4)
    verts = [bm.verts.new(M @ Vector(c) + Vector(center)) for c in corners]
    return [bm.faces.new(tuple(verts[i] for i in q)) for q in CUBE_QUADS]

def add_cyl(bm, center, r, depth, seg, rot=None):
    """Capped cylinder along Z at center; rot reorients the axis."""
    M = rot if rot else Matrix.Identity(4)
    rings = []
    for s in (-1, 1):
        ring = []
        for i in range(seg):
            t = 2 * pi * i / seg
            ring.append(bm.verts.new(M @ Vector((r * cos(t), r * sin(t), s * depth / 2.0)) + Vector(center)))
        rings.append(ring)
    faces = []
    lo, hi = rings
    for i in range(seg):
        j = (i + 1) % seg
        faces.append(bm.faces.new((lo[i], lo[j], hi[j], hi[i])))
    faces.append(bm.faces.new(lo))
    faces.append(bm.faces.new(tuple(reversed(hi))))
    return faces

def add_flares(bm, hubs, R, x_in, x_out, a0, a1, seg):
    """Wheel-arch flare shells (open bands) over each hub. Normals forced outward."""
    faces = []
    for (hx, hy, hz) in hubs:
        side = 1.0 if hx >= 0 else -1.0
        vi, vo = [], []
        for k in range(seg + 1):
            phi = radians(a0 + (a1 - a0) * k / seg)
            vi.append(bm.verts.new((side * x_in, hy + R * cos(phi), hz + R * sin(phi))))
            vo.append(bm.verts.new((side * x_out, hy + R * cos(phi), hz + R * sin(phi))))
        for k in range(seg):
            for quad in ((vi[k], vi[k + 1], vo[k + 1], vo[k]), (vo[k], vo[k + 1], vi[k + 1], vi[k])):
                p0, p1, p2, p3 = (Vector(v.co) for v in quad)
                nrm = (p1 - p0).cross(p2 - p0)
                mid = (p0 + p1 + p2 + p3) / 4.0
                if nrm.dot(mid - Vector((0.0, hy, hz))) < 0:
                    continue
                faces.append(bm.faces.new(quad))
    return faces

def finish_obj(name, bm, mat_keys, loc=(0, 0, 0), recalc=True, parent=None):
    """Bake bmesh into an object: materials, per-face material index, COLOR_0 vertex colors."""
    if recalc:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for k in mat_keys:
        mesh.materials.append(MAT[k])
    for poly, mk in zip(mesh.polygons, mat_keys_per_face):
        poly.material_index = mat_keys.index(mk)
    layer = mesh.color_attributes.new(name="Col", type='BYTE_COLOR', domain='CORNER')
    flat = []
    for poly in mesh.polygons:
        c = VC[color_keys_per_face[poly.index]]
        for li in poly.loop_indices:
            flat.extend((*c, 1.0))
    layer.data.foreach_set("color", flat)
    mesh.update()
    mesh.color_attributes.active_color = layer
    obj = bpy.data.objects.new(name, mesh)
    obj.location = loc
    bpy.context.scene.collection.objects.link(obj)
    if parent:
        obj.parent = parent
    return obj

mat_keys_per_face = []
color_keys_per_face = []

def tag(faces, mat_key, vc_key=None):
    mat_keys_per_face.extend([mat_key] * len(faces))
    color_keys_per_face.extend([vc_key or mat_key] * len(faces))
    return faces

def reset_tags():
    mat_keys_per_face.clear()
    color_keys_per_face.clear()

# ---------------------------------------------------------------- shared pieces
def build_wheel(name, R, width, hub, rim_r, parent):
    """Hub-centered wheel, axle along local X, pivot exactly at the hub."""
    reset_tags()
    bm = bmesh.new()
    tag(add_cyl(bm, (0, 0, 0), R, width, 18), 'tire')                          # tire
    tag(add_cyl(bm, (0, 0, 0), rim_r, width + 0.012, 12), 'rim')               # rim barrel
    for k in range(5):                                                          # spokes
        ang = radians(72 * k + 15)
        rot = Matrix.Rotation(ang, 4, 'X')
        d = rim_r * 0.55
        tag(add_box(bm, (0, d, 0), (width * 0.80, rim_r * 0.92, 0.055), rot=rot), 'rim')
    tag(add_cyl(bm, (0, 0, 0), 0.055, width + 0.03, 10), 'rim')                # hub cap
    return finish_obj(name, bm, ['tire', 'rim'], loc=hub, parent=parent)

def build_wheels(parent, wb, track, R, width, rim_r, hub_z):
    for nm, (hx, hy) in (('Wheel_FL', (-track, +wb / 2)), ('Wheel_FR', (+track, +wb / 2)),
                         ('Wheel_RL', (-track, -wb / 2)), ('Wheel_RR', (+track, -wb / 2))):
        build_wheel(nm, R, width, (hx, hy, hub_z), rim_r, parent)

def build_colliders(parent, boxes):
    reset_tags()
    bm = bmesh.new()
    for (center, size) in boxes:
        tag(add_box(bm, center, size), 'collider')
    finish_obj('WheelCollider_Body', bm, ['collider'], parent=parent)

# ---------------------------------------------------------------- car 1: Vortex GT (supercar)
def build_vortex_gt():
    bpy.ops.object.select_all(action='DESELECT')
    root = bpy.data.objects.new("VortexGT", None)
    bpy.context.scene.collection.objects.link(root)

    L, WB, TRACK, R, HUBZ = 4.32, 2.68, 0.88, 0.34, 0.34

    reset_tags()
    bm = bmesh.new()
    tag(add_loft(bm, [
        (-2.16, 0.78, 0.30, 0.66),
        (-1.95, 0.95, 0.16, 0.74),
        (-1.62, 1.02, 0.13, 0.76),
        (-1.34, 0.80, 0.13, 0.76),   # rear wheel pinch
        (-1.06, 1.02, 0.13, 0.74),
        (-0.60, 1.00, 0.13, 0.72),
        (+0.30, 0.97, 0.13, 0.66),
        (+1.06, 1.02, 0.13, 0.58),
        (+1.34, 0.80, 0.13, 0.56),   # front wheel pinch
        (+1.62, 0.98, 0.15, 0.50),
        (+2.00, 0.82, 0.18, 0.44),
        (+2.16, 0.70, 0.24, 0.40),
    ], p=0.42), 'paint')
    finish_obj('Body', bm, ['paint'], parent=root)

    reset_tags()
    bm = bmesh.new()
    tag(add_loft(bm, [
        (-1.05, 0.62, 0.70, 0.78),
        (-0.45, 0.72, 0.70, 0.99),
        (+0.15, 0.74, 0.68, 1.08),
        (+0.75, 0.70, 0.62, 0.95),
        (+1.05, 0.60, 0.55, 0.68),
    ], p=0.42), 'glass')
    finish_obj('Glass_Canopy', bm, ['glass'], parent=root)

    reset_tags()
    bm = bmesh.new()
    tag(add_flares(bm, [(sx * TRACK, sy, HUBZ) for sx in (1, -1) for sy in (WB / 2, -WB / 2)],
                   R=0.45, x_in=0.74, x_out=1.06, a0=15, a1=165, seg=9), 'paint')
    finish_obj('FenderFlares', bm, ['paint'], recalc=False, parent=root)

    reset_tags()
    bm = bmesh.new()
    tag(add_box(bm, (0, 2.02, 0.115), (1.60, 0.30, 0.05)), 'dark')             # splitter
    tag(add_box(bm, (0, -2.02, 0.16), (1.50, 0.28, 0.10)), 'dark')             # diffuser
    tag(add_box(bm, (1.00, 0, 0.135), (0.07, 1.90, 0.09)), 'dark')             # skirts
    tag(add_box(bm, (-1.00, 0, 0.135), (0.07, 1.90, 0.09)), 'dark')
    tag(add_box(bm, (0, 2.12, 0.30), (0.95, 0.12, 0.15)), 'dark')              # grille
    finish_obj('AeroTrim', bm, ['dark'], parent=root)

    reset_tags()
    bm = bmesh.new()
    tag(add_box(bm, (0, -1.86, 1.02), (1.70, 0.30, 0.035)), 'paint')           # wing plank
    tag(add_box(bm, (0.86, -1.86, 1.00), (0.03, 0.34, 0.15)), 'paint')         # endplates
    tag(add_box(bm, (-0.86, -1.86, 1.00), (0.03, 0.34, 0.15)), 'paint')
    finish_obj('Wing', bm, ['paint'], parent=root)

    reset_tags()
    bm = bmesh.new()
    tag(add_box(bm, (0.45, -1.88, 0.87), (0.04, 0.08, 0.26)), 'dark')          # struts
    tag(add_box(bm, (-0.45, -1.88, 0.87), (0.04, 0.08, 0.26)), 'dark')
    finish_obj('WingStruts', bm, ['dark'], parent=root)

    reset_tags()
    bm = bmesh.new()
    tag(add_box(bm, (0.55, 2.14, 0.385), (0.34, 0.09, 0.055)), 'head')         # headlights
    tag(add_box(bm, (-0.55, 2.14, 0.385), (0.34, 0.09, 0.055)), 'head')
    finish_obj('Headlights', bm, ['head'], parent=root)

    reset_tags()
    bm = bmesh.new()
    tag(add_box(bm, (0, -2.15, 0.60), (1.30, 0.06, 0.075)), 'tail')            # light bar
    finish_obj('TaillightStrip', bm, ['tail'], parent=root)

    reset_tags()
    bm = bmesh.new()
    for sx in (1, -1):
        tag(add_box(bm, (sx * 0.94, 0.95, 0.76), (0.16, 0.05, 0.03)), 'paint')  # mirror stalks
        tag(add_box(bm, (sx * 1.03, 0.95, 0.80), (0.07, 0.16, 0.09)), 'paint')  # mirror heads
    finish_obj('Mirrors', bm, ['paint'], parent=root)

    reset_tags()
    bm = bmesh.new()
    rotY = Matrix.Rotation(radians(90), 4, 'X')                                 # cylinder axis -> Y
    for ex in (0.28, 0.40):
        for sx in (1, -1):
            tag(add_cyl(bm, (sx * ex, -2.14, 0.28), 0.045, 0.14, 10, rot=rotY), 'chrome')
    finish_obj('Exhausts', bm, ['chrome'], parent=root)

    reset_tags()
    bm = bmesh.new()
    tag(add_box(bm, (0, -2.168, 0.44), (0.40, 0.015, 0.13)), 'trim')           # rear plate
    finish_obj('PlateRear', bm, ['trim'], parent=root)

    reset_tags()
    bm = bmesh.new()
    tag(add_box(bm, (0, 0.82, 0.60), (1.30, 0.35, 0.14)), 'interior')          # dash
    tag(add_box(bm, (0, 0.25, 0.52), (0.18, 0.60, 0.16)), 'interior')          # console
    for sx in (1, -1):
        tag(add_box(bm, (sx * 0.34, -0.02, 0.50), (0.40, 0.48, 0.12)), 'interior')  # seat base
        tag(add_box(bm, (sx * 0.34, -0.30, 0.76), (0.40, 0.12, 0.50)), 'interior')  # seat back
    finish_obj('Interior', bm, ['interior'], parent=root)

    build_colliders(root, [
        ((0, 0, 0.435), (2.04, 4.30, 0.61)),   # full body
        ((0, 0, 0.83), (1.44, 2.10, 0.50)),    # cabin
    ])
    build_wheels(root, WB, TRACK, R, 0.26, 0.215, HUBZ)
    return root

# ---------------------------------------------------------------- car 2: Rhino XT (SUV)
def build_rhino_xt():
    root = bpy.data.objects.new("RhinoXT", None)
    bpy.context.scene.collection.objects.link(root)

    L, WB, TRACK, R, HUBZ = 4.94, 2.92, 0.99, 0.40, 0.40

    reset_tags()
    bm = bmesh.new()
    tag(add_loft(bm, [
        (-2.47, 0.92, 0.36, 0.88),
        (-2.30, 1.10, 0.26, 1.14),
        (-1.80, 1.14, 0.26, 1.16),
        (-1.46, 0.86, 0.26, 1.16),   # rear wheel pinch
        (-1.12, 1.14, 0.26, 1.16),
        (-0.40, 1.14, 0.26, 1.16),
        (+0.60, 1.14, 0.26, 1.14),
        (+1.12, 1.14, 0.26, 1.10),
        (+1.46, 0.86, 0.26, 1.08),   # front wheel pinch
        (+1.80, 1.12, 0.26, 1.04),
        (+2.10, 1.08, 0.28, 1.00),
        (+2.40, 1.00, 0.32, 0.92),
        (+2.47, 0.92, 0.36, 0.88),
    ], p=0.30), 'paint')
    finish_obj('Body', bm, ['paint'], parent=root)

    reset_tags()
    bm = bmesh.new()
    tag(add_loft(bm, [
        (-2.30, 0.80, 1.10, 1.22),
        (-1.60, 0.88, 1.12, 1.72),
        (-0.60, 0.90, 1.12, 1.80),
        (+0.55, 0.90, 1.12, 1.80),
        (+1.10, 0.86, 1.10, 1.72),
        (+1.85, 0.74, 1.05, 1.30),
        (+2.05, 0.70, 1.00, 1.14),
    ], p=0.30), 'glass')
    finish_obj('Glass_Canopy', bm, ['glass'], parent=root)

    reset_tags()
    bm = bmesh.new()
    tag(add_box(bm, (0, -0.25, 1.825), (1.72, 2.10, 0.05)), 'paint')           # roof panel
    finish_obj('RoofPanel', bm, ['paint'], parent=root)

    reset_tags()
    bm = bmesh.new()
    tag(add_flares(bm, [(sx * TRACK, sy, HUBZ) for sx in (1, -1) for sy in (WB / 2, -WB / 2)],
                   R=0.52, x_in=0.80, x_out=1.18, a0=12, a1=168, seg=10), 'dark')
    finish_obj('FenderFlares', bm, ['dark'], recalc=False, parent=root)

    reset_tags()
    bm = bmesh.new()
    tag(add_box(bm, (0, 2.42, 0.70), (1.05, 0.12, 0.30)), 'dark')              # grille
    tag(add_box(bm, (0, 2.45, 0.86), (1.12, 0.05, 0.06)), 'chrome')            # grille bar
    tag(add_box(bm, (0, 2.36, 0.42), (1.92, 0.24, 0.24)), 'dark')              # front bumper
    tag(add_box(bm, (0, -2.38, 0.44), (1.92, 0.22, 0.26)), 'dark')             # rear bumper
    tag(add_box(bm, (1.14, 0, 0.26), (0.12, 2.30, 0.08)), 'dark')              # running boards
    tag(add_box(bm, (-1.14, 0, 0.26), (0.12, 2.30, 0.08)), 'dark')
    finish_obj('TrimCladding', bm, ['dark', 'chrome'], parent=root)

    reset_tags()
    bm = bmesh.new()
    tag(add_box(bm, (0.62, 2.46, 0.80), (0.30, 0.10, 0.11)), 'head')           # headlights
    tag(add_box(bm, (-0.62, 2.46, 0.80), (0.30, 0.10, 0.11)), 'head')
    finish_obj('Headlights', bm, ['head'], parent=root)

    reset_tags()
    bm = bmesh.new()
    tag(add_box(bm, (0.86, -2.48, 0.88), (0.10, 0.06, 0.30)), 'tail')          # taillights
    tag(add_box(bm, (-0.86, -2.48, 0.88), (0.10, 0.06, 0.30)), 'tail')
    finish_obj('Taillights', bm, ['tail'], parent=root)

    reset_tags()
    bm = bmesh.new()
    for sy in (-1.30, -0.45, 0.40, 1.00):                                      # rail feet
        for sx in (1, -1):
            tag(add_box(bm, (sx * 0.72, sy, 1.845), (0.05, 0.09, 0.05)), 'dark')
    tag(add_box(bm, (0.72, -0.30, 1.90), (0.055, 2.40, 0.08)), 'dark')         # roof rails
    tag(add_box(bm, (-0.72, -0.30, 1.90), (0.055, 2.40, 0.08)), 'dark')
    finish_obj('RoofRails', bm, ['dark'], parent=root)

    reset_tags()
    bm = bmesh.new()
    for sx in (1, -1):
        tag(add_box(bm, (sx * 1.02, 1.18, 1.26), (0.16, 0.06, 0.04)), 'paint') # mirror stalks
        tag(add_box(bm, (sx * 1.11, 1.18, 1.30), (0.08, 0.18, 0.11)), 'paint') # mirror heads
    finish_obj('Mirrors', bm, ['paint'], parent=root)

    reset_tags()
    bm = bmesh.new()
    rotY = Matrix.Rotation(radians(90), 4, 'X')
    tag(add_cyl(bm, (0.45, -2.44, 0.36), 0.05, 0.16, 10, rot=rotY), 'chrome')  # exhaust
    finish_obj('Exhaust', bm, ['chrome'], parent=root)

    reset_tags()
    bm = bmesh.new()
    tag(add_box(bm, (0, -2.492, 0.68), (0.42, 0.015, 0.14)), 'trim')           # rear plate
    finish_obj('PlateRear', bm, ['trim'], parent=root)

    reset_tags()
    bm = bmesh.new()
    tag(add_box(bm, (0, 1.60, 1.30), (1.60, 0.40, 0.16)), 'interior')          # dash
    for sy, syb in ((0.35, 0.08), (-0.90, -1.17)):                             # two seat rows
        for sx in (1, -1):
            tag(add_box(bm, (sx * 0.42, sy, 1.28), (0.46, 0.50, 0.14)), 'interior')
            tag(add_box(bm, (sx * 0.42, syb, 1.55), (0.46, 0.12, 0.55)), 'interior')
    finish_obj('Interior', bm, ['interior'], parent=root)

    build_colliders(root, [
        ((0, 0, 0.71), (2.28, 4.90, 0.90)),    # full body
        ((0, -0.50, 1.47), (1.80, 3.60, 0.76)),  # cabin
    ])
    build_wheels(root, WB, TRACK, R, 0.30, 0.25, HUBZ)
    return root

# ---------------------------------------------------------------- driver
def clear_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for m in list(bpy.data.meshes):
        bpy.data.meshes.remove(m)

def export_glb(path):
    try:
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_yup=True)
    except TypeError:
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB')

def stats():
    tris = verts = meshes = 0
    for o in bpy.data.objects:
        if o.type == 'MESH':
            meshes += 1
            verts += len(o.data.vertices)
            tris += sum(len(p.vertices) - 2 for p in o.data.polygons)
    return meshes, verts, tris

def report():
    m, v, t = stats()
    print(f"[browos] meshes={m} verts={v} tris={t}")

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    build_materials()

    clear_scene(); build_vortex_gt(); report()
    export_glb(OUT_DIR + r"\vortex_gt.glb")

    clear_scene(); build_rhino_xt(); report()
    export_glb(OUT_DIR + r"\rhino_xt.glb")

    # Combined .blend for future manual tweaking
    clear_scene()
    a = build_vortex_gt(); a.location = (3.2, 0, 0)
    b = build_rhino_xt(); b.location = (-3.2, 0, 0)
    bpy.ops.wm.save_as_mainfile(filepath=OUT_DIR + r"\blender_cars.blend")
    print("[browos] done")

try:
    main()
except Exception:
    import traceback; traceback.print_exc()
