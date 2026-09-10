# ============================================================================
# build_police_hq.py — NYPD HQ twin-tower complex, modeled in Blender.
#
# The script is deliberately background-safe: it creates no UI state, clears
# only its HQ_* collection, and exports directly with `blender -b --python`.
# The companion tools/build_police_hq_headless.js is the dependency-free CI
# fallback used when a Blender binary is unavailable on the build host.
#
# HOW TO RUN (in the Blender you have open right now):
#   1. Top bar: click "Scripting" workspace tab.
#   2. Text editor > Open > pick this file (tools/build_police_hq.py).
#   3. Press the ▶ "Run Script" button. Your current scene is NOT touched
#      (the HQ is added as new "HQ_*" objects at the world origin).
#   4. Copy the last ~15 console lines (SPEC + STATS) and send them back.
#
# WHAT IT BUILDS (meters, local coords, lot center = origin, ground y = 0,
# front/street = -z; add world offset +1028 / +3076.5 to get game coords):
#   Officers tower  (local x -23..+1, z -12.5..+23.5, 6 floors + roof)
#   Prison block    (local x +3..+23, z -12.5..+23.5, 5 floors + roof)
#   2m alley + 2 enclosed skybridges, switchback stairs (landings every
#   half-story, COL_ collider twins on all steps+landings) to both roofs,
#   helipad, watchtower, walled exercise yard, open 10-stall lot,
#   gatehouse portal + glass/steel entrance porticos.
# Floor walk levels: 0.18, 5.6, 11.2, 16.8, 22.4, 28.0 (roofs 33.6 / 28.0).
# ============================================================================
import sys
import math
import json
import os

import bpy

# Idempotent re-runs: clear objects/materials from a previous run first.
for _o in [o for o in bpy.data.objects if o.name.startswith('HQ_')]:
    bpy.data.objects.remove(_o, do_unlink=True)
for _m in [m for m in bpy.data.materials if m.name.startswith('HQ_')]:
    try:
        bpy.data.materials.remove(_m)
    except Exception:
        pass
for _m in [m for m in bpy.data.meshes if m.name.startswith('HQ_')]:
    try:
        if _m.users == 0:
            bpy.data.meshes.remove(_m)
    except Exception:
        pass

# ---- output paths ---------------------------------------------------------
ROOT = r'C:\Users\rudra\Desktop\BrowOS'
for i, a in enumerate(sys.argv):
    if a == '--' and i + 1 < len(sys.argv):
        ROOT = sys.argv[i + 1]
OUT_GLB = os.path.join(ROOT, 'assets', 'models', 'gta', 'landmarks', 'police_hq.glb')

WORLD_OFF = (1028.0, 3076.5)  # local -> game coords

# ---- palette ---------------------------------------------------------------
PAL = {
    'wall_off':   (0.42, 0.46, 0.50),
    'trim_off':   (0.20, 0.25, 0.32),
    'wall_pris':  (0.31, 0.35, 0.39),
    'trim_pris':  (0.16, 0.20, 0.25),
    'glass':      (0.10, 0.34, 0.52),
    'glass_dark': (0.05, 0.10, 0.16),
    'steel':      (0.07, 0.09, 0.12),
    'door_navy':  (0.08, 0.21, 0.38),
    'roof':       (0.06, 0.08, 0.12),
    'slab':       (0.36, 0.40, 0.44),
    'asphalt':    (0.075, 0.09, 0.12),
    'marking':    (0.85, 0.85, 0.82),
    'police':     (0.10, 0.22, 0.42),
    'white':      (0.92, 0.92, 0.90),
    'gold':       (0.72, 0.56, 0.20),
    'red':        (0.75, 0.10, 0.10),
    'blue':       (0.12, 0.30, 0.85),
    'green':      (0.25, 0.45, 0.22),
    'wood':       (0.35, 0.22, 0.13),
    'desk':       (0.30, 0.20, 0.14),
    'screen':     (0.20, 0.65, 0.95),
    'bed':        (0.45, 0.55, 0.60),
    'toilet':     (0.80, 0.80, 0.78),
    'rack':       (0.10, 0.10, 0.12),
    'fence':      (0.30, 0.32, 0.35),
    'lamp':       (1.00, 0.90, 0.70),
    'beacon':     (1.00, 0.15, 0.10),
    'heli':       (0.12, 0.14, 0.16),
}

_MATS = {}


def mat(name, rgb, emissive=None, ei=2.0):
    if name in _MATS:
        return _MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    if bsdf is not None:
        if 'Base Color' in bsdf.inputs:
            bsdf.inputs['Base Color'].default_value = (*rgb, 1.0)
        if emissive is not None and 'Emission Color' in bsdf.inputs:
            bsdf.inputs['Emission Color'].default_value = (*emissive, 1.0)
            try:
                bsdf.inputs['Emission Strength'].default_value = ei
            except Exception:
                pass
    _MATS[name] = m
    return m


_CREATED = []


def _link(mesh, name):
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    _CREATED.append(obj)
    return obj


def box(x0, y0, z0, x1, y1, z1, material, name='HQ_part'):
    mesh = bpy.data.meshes.new(name)
    # Outward CCW winding (right-hand rule), verified per face.
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
         (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
         (7, 6, 2, 3), (1, 2, 6, 5), (0, 4, 7, 3)]
    mesh.from_pydata(v, [], f)
    mesh.update()
    mesh.materials.append(material)
    return _link(mesh, name)


def cyl(cx, cz, y0, y1, r, material, seg=10, name='HQ_pole'):
    v = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        v.append((cx + r * math.cos(a), y0, cz + r * math.sin(a)))
    base = len(v)
    for i in range(seg):
        a = 2 * math.pi * i / seg
        v.append((cx + r * math.cos(a), y1, cz + r * math.sin(a)))
    v.append((cx, y0, cz))
    v.append((cx, y1, cz))
    cb, ct = base + seg, base + seg + 1
    f = []
    for i in range(seg):
        j = (i + 1) % seg
        f.append((i, base + i, base + j, j))
        f.append((cb, i, j))
        f.append((ct, base + j, base + i))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(v, [], f)
    mesh.update()
    mesh.materials.append(material)
    return _link(mesh, name)


def beam(p0, p1, w, h, material, name='HQ_beam'):
    # Rectangular beam from p0 to p1 (any direction).
    dx, dy, dz = p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]
    dl = math.sqrt(dx * dx + dy * dy + dz * dz) or 1e-6
    dx, dy, dz = dx / dl, dy / dl, dz / dl
    if abs(dy) > 0.99:
        sx, sy, sz = 1.0, 0.0, 0.0
    else:
        inv = 1.0 / math.sqrt(dx * dx + dz * dz)
        sx, sy, sz = dz * inv, 0.0, -dx * inv
    ux, uy, uz = sy * dz - sz * dy, sz * dx - sx * dz, sx * dy - sy * dx
    c = []
    for (px, py, pz) in (p0, p1):
        for a in (-1, 1):
            for b_ in (-1, 1):
                c.append((px + sx * w / 2 * a + ux * h / 2 * b_,
                          py + sy * w / 2 * a + uy * h / 2 * b_,
                          pz + sz * w / 2 * a + uz * h / 2 * b_))
    f = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 2, 6, 4),
         (1, 5, 7, 3), (0, 4, 5, 1), (2, 3, 7, 6)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(c, [], f)
    mesh.update()
    mesh.materials.append(material)
    return _link(mesh, name)


# ---- shared materials -------------------------------------------------------
M = {k: mat('HQ_' + k, v) for k, v in PAL.items() if k not in ('screen', 'lamp', 'beacon')}
M['screen'] = mat('HQ_screen', PAL['slab'], emissive=PAL['screen'], ei=2.5)
M['lamp'] = mat('HQ_lamp', PAL['white'], emissive=PAL['lamp'], ei=3.0)
M['beacon'] = mat('HQ_beacon', PAL['red'], emissive=PAL['beacon'], ei=4.0)
M['lightbar_r'] = mat('HQ_lightbar_r', PAL['red'], emissive=PAL['red'], ei=4.0)
M['lightbar_b'] = mat('HQ_lightbar_b', PAL['blue'], emissive=PAL['blue'], ei=4.0)
M['headlight'] = mat('HQ_headlight', PAL['white'], emissive=(0.9, 0.95, 1.0), ei=2.0)
M['taillight'] = mat('HQ_taillight', PAL['red'], emissive=PAL['red'], ei=1.5)
# Hot-pink collider boxes: exported in the GLB as COL_* nodes, stripped from
# visuals at load and converted 1:1 into physics AABBs by the game.
M['col'] = mat('HQ_col', (1.0, 0.1, 0.9), emissive=(1.0, 0.1, 0.9), ei=1.5)

FLOORS = [0.18, 5.6, 11.2, 16.8, 22.4, 28.0]   # walk levels
SLAB_T = 0.36
SPEC = {'floors': FLOORS, 'stairs': [], 'parking': [], 'footprints': {}}


# ---- helpers ----------------------------------------------------------------
def slab(x0, x1, z0, z1, walk, name):
    box(x0, walk - SLAB_T, z0, x1, walk, z1, M['slab'], name)


def facade_windows(face, fixed, outward, y0, y1, a0, a1, step, w, bars=False, tag=''):
    # Proud dark-glass boxes + sills along a wall plane; optional bar fronts.
    x = a0
    n = 0
    while x + w <= a1 + 1e-6:
        c = x + w / 2
        if face in ('n', 's'):
            box(c - w / 2, y0, fixed + (0 if outward > 0 else -0.10),
                c + w / 2, y1, fixed + (0.10 if outward > 0 else 0), M['glass'], tag + '_win%d' % n)
            box(c - w / 2 - 0.1, y0 - 0.12, fixed - 0.08, c + w / 2 + 0.1, y0, fixed + 0.08,
                M['trim_off'], tag + '_sill%d' % n)
            if bars:
                bx = c - w / 2 + 0.15
                while bx < c + w / 2 - 0.1:
                    box(bx, y0, fixed + outward * 0.16, bx + 0.05, y1, fixed + outward * 0.16 + 0.05,
                        M['steel'], tag + '_bar%d' % n)
                    bx += 0.32
        else:
            box(fixed + (0 if outward > 0 else -0.10), y0, c - w / 2,
                fixed + (0.10 if outward > 0 else 0), y1, c + w / 2, M['glass'], tag + '_win%d' % n)
            box(fixed - 0.08, y0 - 0.12, c - w / 2 - 0.1, fixed + 0.08, y0, c + w / 2 + 0.1,
                M['trim_off'], tag + '_sill%d' % n)
            if bars:
                bz = c - w / 2 + 0.15
                while bz < c + w / 2 - 0.1:
                    box(fixed + outward * 0.16, y0, bz, fixed + outward * 0.16 + 0.05, y1, bz + 0.05,
                        M['steel'], tag + '_bar%d' % n)
                    bz += 0.32
        x += step
        n += 1


def stairs_sb(x0, y0, y1, tag):
    # Switchback stair: run A climbs southward on the west half, landing S,
    # run B climbs back northward on the east half, landing N arrives flush at
    # the next floor walk level. No voids, no dead drops between flights.
    W = 3.0
    half = (y1 - y0) / 2
    n = max(2, int(round(half / 0.285)))
    rise = half / n
    run = 8.0 / n
    for i in range(n):
        sy = y0 + (i + 1) * rise
        sz = 13.5 + (i + 0.5) * run
        box(x0, sy - rise, sz - run / 2, x0 + 1.4, sy, sz + run / 2, M['slab'], tag + '_a%d' % i)
        box(x0 + 0.02, sy - 0.045, sz + run / 2 - 0.06, x0 + 1.38, sy + 0.02, sz + run / 2, M['gold'], tag + '_aN%d' % i)
        box(x0, sy - rise, sz - run / 2, x0 + 1.4, sy, sz + run / 2, M['col'], 'COL_' + tag + '_a%d' % i)
    box(x0, y0 + half - 0.18, 21.5, x0 + W, y0 + half, 23.5, M['slab'], tag + '_landS')
    box(x0, y0 + half - 0.18, 21.5, x0 + W, y0 + half, 23.5, M['col'], 'COL_' + tag + '_landS')
    for i in range(n):
        sy = y0 + half + (i + 1) * rise
        sz = 21.5 - (i + 0.5) * run
        box(x0 + 1.6, sy - rise, sz - run / 2, x0 + W, sy, sz + run / 2, M['slab'], tag + '_b%d' % i)
        box(x0 + 1.62, sy - 0.045, sz - run / 2, x0 + W - 0.02, sy + 0.02, sz - run / 2 + 0.06, M['gold'], tag + '_bN%d' % i)
        box(x0 + 1.6, sy - rise, sz - run / 2, x0 + W, sy, sz + run / 2, M['col'], 'COL_' + tag + '_b%d' % i)
    box(x0, y1 - 0.18, 11.5, x0 + W, y1, 13.5, M['slab'], tag + '_landN')
    box(x0, y1 - 0.18, 11.5, x0 + W, y1, 13.5, M['col'], 'COL_' + tag + '_landN')
    for sx in (x0, x0 + W):
        beam((sx, y0 - 0.2, 13.5), (sx, y0 + half - 0.2, 21.5), 0.14, 0.5, M['steel'], tag + '_strA')
        beam((sx, y0 + 1.0, 13.5), (sx, y0 + half + 1.0, 21.5), 0.07, 0.07, M['gold'], tag + '_rlA')
        beam((sx, y0 + half - 0.2, 21.5), (sx, y1 - 0.2, 13.5), 0.14, 0.5, M['steel'], tag + '_strB')
        beam((sx, y0 + half + 1.0, 21.5), (sx, y1 + 1.0, 13.5), 0.07, 0.07, M['gold'], tag + '_rlB')
    beam((x0 + 1.5, y0, 13.5), (x0 + 1.5, y0 + half, 21.5), 0.07, 1.0, M['gold'], tag + '_rlC')
    SPEC['stairs'].append({'x0': x0, 'y0': y0, 'y1': y1, 'switchback': True})


def desk_set(x, z, y, tag, chairs=2):
    box(x - 1.2, y, z - 0.75, x + 1.2, y + 0.75, z + 0.75, M['desk'], tag + '_desk')
    box(x - 1.25, y + 0.78, z - 0.8, x + 1.25, y + 0.84, z + 0.8, M['wood'], tag + '_dtop')
    box(x - 0.3, y + 0.84, z - 0.2, x + 0.3, y + 1.25, z + 0.2, M['screen'], tag + '_mon')
    for i in range(chairs):
        cx = x - 0.8 + i * 1.6
        box(cx - 0.25, y, z + 1.1, cx + 0.25, y + 0.1, z + 1.6, M['steel'], tag + '_ch%d' % i)
        box(cx - 0.25, y + 0.1, z + 1.5, cx + 0.25, y + 0.65, z + 1.6, M['steel'], tag + '_chb%d' % i)


def cell_unit(x0, z0, w, d, y, tag, door_gap=None):
    # Open-front holding cell: back + side walls, iron-bar front at x0+w.
    box(x0, y, z0, x0 + 0.25, y + 2.6, z0 + d, M['wall_pris'], tag + '_back')
    box(x0, y, z0, x0 + w, y + 2.6, z0 + 0.25, M['wall_pris'], tag + '_sideA')
    box(x0, y, z0 + d - 0.25, x0 + w, y + 2.6, z0 + d, M['wall_pris'], tag + '_sideB')
    box(x0 + w - 0.1, y, z0, x0 + w + 0.1, y + 2.6, z0 + d, M['steel'], tag + '_frame')
    bz = z0 + 0.2
    while bz < z0 + d - 0.15:
        if door_gap and door_gap[0] < bz < door_gap[1]:
            bz += 0.3
            continue
        box(x0 + w - 0.06, y, bz, x0 + w + 0.06, y + 2.6, bz + 0.05, M['steel'], tag + '_bar')
        bz += 0.3
    box(x0 + w - 0.08, y + 2.6, z0, x0 + w + 0.08, y + 2.75, z0 + d, M['steel'], tag + '_rail')
    # cot + toilet
    box(x0 + 0.4, y, z0 + 0.5, x0 + 2.2, y + 0.45, z0 + 1.5, M['wood'], tag + '_cot')
    box(x0 + 0.4, y + 0.45, z0 + 0.5, x0 + 2.2, y + 0.6, z0 + 1.5, M['bed'], tag + '_pad')
    box(x0 + w - 1.0, y, z0 + d - 1.0, x0 + w - 0.4, y + 0.5, z0 + d - 0.4, M['toilet'], tag + '_wc')


# (lot cars removed; sally-port vans are inline boxes in the prison section)


# ---- site -------------------------------------------------------------------
OX0, OX1, OZ0, OZ1 = -23, 1, -12.5, 23.5      # officers tower
PX0, PX1, PZ0, PZ1 = 3, 23, -12.5, 23.5       # prison block
SPEC['footprints'] = {'officers': [OX0, OZ0, OX1, OZ1], 'prison': [PX0, PZ0, PX1, PZ1]}

# paved lot + stall markings
box(-24, 0.02, -25.5, 24, 0.17, 25.5, M['asphalt'], 'HQ_lot')
for i in range(11):
    x = -21 + i * 4.2
    box(x - 0.09, 0.18, -25.0, x + 0.09, 0.22, -14.0, M['marking'], 'HQ_stall%d' % i)

# ---- open parking lot (stall markings kept, cars removed) --------------------------
# (lot stays empty for player parking; fence + gate + lamps below)

# fence + gate + lamps
for x in range(-24, 25, 3):
    if -3 <= x <= 3:
        continue
    box(x - 0.09, 0.17, -25.4, x + 0.09, 2.4, -25.2, M['fence'], 'HQ_fpost')
box(-24, 2.2, -25.4, -3, 2.35, -25.2, M['fence'], 'HQ_frailL')
box(3, 2.2, -25.4, 24, 2.35, -25.2, M['fence'], 'HQ_frailR')
box(-24, 1.2, -25.4, -3, 1.3, -25.2, M['fence'], 'HQ_frai2L')
box(3, 1.2, -25.4, 24, 1.3, -25.2, M['fence'], 'HQ_frai2R')
# entry gatehouse portal: pylons with caps + globes + badges, leaves parked OPEN
for gx in (-3.1, 3.1):
    box(gx - 0.6, 0.17, -25.8, gx + 0.6, 4.3, -24.6, M['trim_off'], 'HQ_pylon%d' % int(gx * 10))
    box(gx - 0.75, 4.3, -25.95, gx + 0.75, 4.6, -24.45, M['slab'], 'HQ_pylonCap%d' % int(gx * 10))
    box(gx - 0.28, 4.6, -25.5, gx + 0.28, 5.25, -24.9, M['lamp'], 'HQ_pylonGlobe%d' % int(gx * 10))
    box(gx - 0.4, 2.6, -25.82, gx + 0.4, 3.4, -25.78, M['door_navy'], 'HQ_badge%d' % int(gx * 10))
    box(gx - 0.28, 2.72, -25.84, gx + 0.28, 3.28, -25.8, M['gold'], 'HQ_badgeTrim%d' % int(gx * 10))
# sliding leaves parked open against both fences + guide rail
for s in (-1, 1):
    lx0 = -9.3 if s < 0 else 3.9
    lx1 = -3.9 if s < 0 else 9.3
    box(lx0, 0.45, -25.68, lx1, 0.6, -25.48, M['steel'], 'HQ_leafB%d' % s)
    box(lx0, 2.2, -25.68, lx1, 2.35, -25.48, M['steel'], 'HQ_leafT%d' % s)
    box(lx0, 0.45, -25.68, lx0 + 0.15, 2.35, -25.48, M['steel'], 'HQ_leafE%d' % s)
    box(lx1 - 0.15, 0.45, -25.68, lx1, 2.35, -25.48, M['steel'], 'HQ_leafE2%d' % s)
    wx = lx0 + 0.6
    k = 0
    while wx < lx1 - 0.4:
        box(wx, 0.45, -25.68, wx + 0.12, 2.35, -25.48, M['steel'], 'HQ_leafV%d_%d' % (s, k))
        wx += 0.75
        k += 1
box(-9.5, 0.18, -25.72, 9.5, 0.3, -25.44, M['steel'], 'HQ_gateTrack')
for lx in (-14, 0, 14):
    cyl(lx, -14.2, 0.17, 5.6, 0.09, M['steel'], name='HQ_lamp%d' % lx)
    box(lx - 0.7, 5.5, -14.5, lx + 0.7, 5.65, -13.9, M['lamp'], 'HQ_lampH%d' % lx)

# ---- officers tower shell ---------------------------------------------------
for f in range(6):
    y0 = FLOORS[f]
    y1 = (FLOORS[f + 1] - SLAB_T) if f < 5 else 33.24
    h = y1 - y0
    # walls (north has entrance gap on F1)
    if f == 0:
        box(OX0, y0, OZ0, -14, y1, OZ0 + 0.5, M['wall_off'], 'HQ_offN1')
        box(-10, y0, OZ0, OX1, y1, OZ0 + 0.5, M['wall_off'], 'HQ_offN2')
        box(-14, y0 + 3.2, OZ0, -10, y1, OZ0 + 0.5, M['wall_off'], 'HQ_offLintel')
    else:
        box(OX0, y0, OZ0, OX1, y1, OZ0 + 0.5, M['wall_off'], 'HQ_offN%d' % f)
    box(OX0, y0, OZ1 - 0.5, OX1, y1, OZ1, M['wall_off'], 'HQ_offS%d' % f)
    box(OX0, y0, OZ0, OX0 + 0.5, y1, OZ1, M['wall_off'], 'HQ_offW%d' % f)
    if f in (1, 3):
        # doorway to the skybridge (z 10.5..12.5, 2.6 high)
        box(OX1 - 0.5, y0, OZ0, OX1, y1, 10.5, M['wall_off'], 'HQ_offE%dA' % f)
        box(OX1 - 0.5, y0, 12.5, OX1, y1, OZ1, M['wall_off'], 'HQ_offE%dB' % f)
        box(OX1 - 0.5, y0 + 2.6, 10.5, OX1, y1, 12.5, M['wall_off'], 'HQ_offE%dL' % f)
    else:
        box(OX1 - 0.5, y0, OZ0, OX1, y1, OZ1, M['wall_off'], 'HQ_offE%d' % f)
    # window bands
    facade_windows('n', OZ0, -1, y0 + 1.1, y0 + 2.9, OX0 + 2, OX1 - 2, 3.4, 1.7, tag='HQ_offN%d' % f)
    facade_windows('s', OZ1, 1, y0 + 1.1, y0 + 2.9, OX0 + 2, OX1 - 2, 3.4, 1.7, tag='HQ_offS%d' % f)
    facade_windows('w', OX0, -1, y0 + 1.1, y0 + 2.9, OZ0 + 2, OZ1 - 2, 3.4, 1.7, tag='HQ_offW%d' % f)
    if f == 0:
        slab(OX0, OX1, OZ0, OZ1, 0.18 + 0.0, 'HQ_offSlab0')
    # upper slabs with stairwell cutout over shaft x[-22.5,-19.5], z[11.5,23.5]
for f in range(1, 6):
    w = FLOORS[f]
    slab(OX0, -22.5, OZ0, OZ1, w, 'HQ_offSl%dA' % f)
    slab(-19.5, OX1, OZ0, 11.5, w, 'HQ_offSl%dB' % f)
    slab(-19.5, OX1, 11.5, 23.5, w, 'HQ_offSl%dC' % f)
    # NOTE: shaft opening x[-22.5,-19.5] z[11.5,23.5] left open
# entrance canopy + steps + sign + pillars + glass portico doors
box(-15, 3.6, OZ0 - 2.6, -9, 4.0, OZ0, M['trim_off'], 'HQ_canopy')
# officers entrance portico: open glass double doors + lantern sconces
for dx in (-14, -10):
    box(dx - 0.25, 0.18, -12.5, dx + 0.25, 3.1, -12.0, M['trim_off'], 'HQ_doorPost')
box(-14, 3.1, -12.5, -10, 3.4, -12.0, M['trim_off'], 'HQ_doorHead')
beam((-13.8, 1.6, -12.3), (-13.8 + 1.8 * 0.906, 1.6, -12.3 + 1.8 * 0.423), 0.08, 2.7,
     M['glass'], 'HQ_doorLeafW')
beam((-13.8, 1.6, -12.3), (-13.8 + 1.8 * 0.906, 1.6, -12.3 + 1.8 * 0.423), 0.1, 0.14,
     M['trim_off'], 'HQ_doorRailW')
beam((-10.2, 1.6, -12.3), (-10.2 - 1.8 * 0.906, 1.6, -12.3 + 1.8 * 0.423), 0.08, 2.7,
     M['glass'], 'HQ_doorLeafE')
beam((-10.2, 1.6, -12.3), (-10.2 - 1.8 * 0.906, 1.6, -12.3 + 1.8 * 0.423), 0.1, 0.14,
     M['trim_off'], 'HQ_doorRailE')
box(-13.1, 1.3, -11.75, -13.0, 1.9, -11.65, M['gold'], 'HQ_doorHandleW')
box(-10.9, 1.3, -11.75, -10.8, 1.9, -11.65, M['gold'], 'HQ_doorHandleE')
box(-15.8, 2.6, -12.62, -15.3, 3.2, -12.42, M['lamp'], 'HQ_doorLampW')
box(-8.7, 2.6, -12.62, -8.2, 3.2, -12.42, M['lamp'], 'HQ_doorLampE')
cyl(-14.4, OZ0 - 2.2, 0.17, 3.6, 0.12, M['trim_off'], name='HQ_canP1')
cyl(-9.6, OZ0 - 2.2, 0.17, 3.6, 0.12, M['trim_off'], name='HQ_canP2')
box(-16, 0.17, OZ0 - 3.4, -8, 0.5, OZ0, M['slab'], 'HQ_estep')
box(-13.5, 4.6, OZ0 - 0.15, -8.5, 5.9, OZ0 + 0.15, M['door_navy'], 'HQ_sign')
box(-13.5, 4.45, OZ0 - 0.2, -8.5, 4.6, OZ0 + 0.2, M['gold'], 'HQ_signTrim')
cyl(-16.5, OZ0 - 1.0, 0.17, 3.4, 0.3, M['trim_off'], name='HQ_pil1')
cyl(-7.5, OZ0 - 1.0, 0.17, 3.4, 0.3, M['trim_off'], name='HQ_pil2')
box(-16.9, 3.5, OZ0 - 1.4, -16.1, 4.3, OZ0 - 0.6, M['lamp'], 'HQ_globe1')
box(-7.9, 3.5, OZ0 - 1.4, -7.1, 4.3, OZ0 - 0.6, M['lamp'], 'HQ_globe2')
# flag pole + flag + base
cyl(0, -13.8, 0.17, 12.5, 0.09, M['steel'], name='HQ_flagpole')
box(-0.4, 0.17, -14.2, 0.4, 0.55, -13.4, M['trim_off'], 'HQ_flagBase')
box(0.09, 10.8, -14.3, 0.14, 12.0, -12.6, M['door_navy'], 'HQ_flag')

# ---- officers stairs: 6 switchback stories to the roof ---------------------------
for f in range(6):
    stairs_sb(-22.5, FLOORS[f], (FLOORS[f + 1] if f < 5 else 33.6), 'HQ_oSt%d' % f)

# ---- officers interiors ------------------------------------------------------
# F1 lobby: desk counter (Callahan local x 0), benches, directory, back seal
box(-4.5, 0.18, -9.3, -0.5, 1.35, -7.7, M['desk'], 'HQ_lobbyDesk')
box(-4.6, 1.38, -9.4, -0.4, 1.48, -7.6, M['wood'], 'HQ_lobbyTop')
box(-3.0, 1.5, -8.6, -2.4, 1.9, -8.5, M['screen'], 'HQ_intakeMon')
for i in range(3):
    box(-19 + 0, 0.18, -6 + i * 2.4, -17.6, 0.65, -4.9 + i * 2.4, M['trim_off'], 'HQ_bench%d' % i)
box(0.32, 1.2, 2.0, 0.5, 3.2, 5.0, M['screen'], 'HQ_directory')
box(-20.5, 1.5, 5.5, -20.3, 3.0, 7.0, M['door_navy'], 'HQ_seal')
box(-20.55, 1.7, 5.9, -20.25, 2.8, 6.6, M['gold'], 'HQ_sealRing')
# F2 bullpen (detectives)
for dx, dz in [(-8, -6.5), (-2.5, -6.5), (-8, -0.5), (-2.5, -0.5)]:
    desk_set(dx, dz, 5.6, 'HQ_det%d' % int(dx * 10 + dz))
box(0.32, 5.6 + 1.6, 4.0, 0.5, 5.6 + 3.4, 10.0, M['wood'], 'HQ_cork')
box(0.51, 5.6 + 2.6, 6.2, 0.56, 5.6 + 2.75, 7.8, M['red'], 'HQ_yarn')
# F3 interrogation + records
box(-14, 11.2, -2, -10, 11.2 + 0.8, 2, M['desk'], 'HQ_interTable')
for sx, sz in [(-13, -3.4), (-11, -3.4), (-13, 3.4), (-11, 3.4)]:
    box(sx - 0.3, 11.2, sz - 0.3, sx + 0.3, 11.2 + 0.55, sz + 0.3, M['steel'], 'HQ_interCh')
box(-13.1, 11.2 + 1.6, -0.1, -10.9, 11.2 + 2.8, 0.1, M['glass_dark'], 'HQ_mirror')
for i in range(4):
    box(-22.5, 11.2, -10 + i * 2.2, -21.3, 11.2 + 2.4, -8.4 + i * 2.2, M['wood'], 'HQ_shelf%d' % i)
# F4 captain suite + briefing
box(-9.5, 16.8, -7.5, -6.5, 16.8 + 0.8, -5.5, M['desk'], 'HQ_capDesk')
box(-9.0, 16.8 + 0.8, -7.0, -8.4, 16.8 + 1.1, -6.4, M['green'], 'HQ_capLamp')
box(-4, 16.8, 2, 0, 16.8 + 0.75, 5, M['desk'], 'HQ_briefTable')
for ix in (-3.2, -1.6, 0):
    box(ix - 0.3, 16.8, 0.6, ix + 0.3, 16.8 + 0.55, 1.2, M['steel'], 'HQ_briefC1')
    box(ix - 0.3, 16.8, 5.8, ix + 0.3, 16.8 + 0.55, 6.4, M['steel'], 'HQ_briefC2')
box(-22.45, 16.8 + 1.8, 2, -22.3, 16.8 + 3.6, 8, M['screen'], 'HQ_briefMap')
# F5 armory + lockers
box(-2, 22.4, 14, 0.5, 22.4 + 2.6, 19, M['steel'], 'HQ_vault')
box(-2.06, 22.4 + 0.2, 15.6, -1.94, 22.4 + 2.4, 17.4, M['steel'], 'HQ_vaultDoor')
box(-2.07, 22.4 + 1.25, 16.35, -1.93, 22.4 + 1.5, 16.65, M['green'], 'HQ_vaultPad')
for i in range(6):
    box(-22.5, 22.4, -8 + i * 1.3, -21.4, 22.4 + 2.0, -7.0 + i * 1.3, M['trim_off'],
        'HQ_locker%d' % i)
# F6 comms + locker room
for i in range(4):
    box(-14 + i * 2.2, 28.0, 16, -12.6 + i * 2.2, 28.0 + 2.0, 16.9, M['rack'], 'HQ_server%d' % i)
    box(-14 + i * 2.2, 28.0 + 1.2, 15.95, -13.9 + i * 2.2, 28.0 + 1.35, 16.0, M['green'], 'HQ_led%d' % i)
box(-6, 28.0, -4, 0, 28.0 + 0.75, 0, M['desk'], 'HQ_kitch')
for i in range(3):
    box(-5 + i * 2.0, 28.0, 1.0, -4.4 + i * 2.0, 28.0 + 0.5, 1.6, M['steel'], 'HQ_stool%d' % i)

# ---- officers roof (slab split around the stair shaft opening) ------------------
slab(OX0, -22.5, OZ0, OZ1, 33.6, 'HQ_offRoofA')
slab(-19.5, OX1, OZ0, 11.5, 33.6, 'HQ_offRoofB')
slab(-19.5, OX1, 11.5, OZ1, 33.6, 'HQ_offRoofC')
for x0, x1, z0, z1 in [(OX0, OX1, OZ0, OZ0 + 0.4), (OX0, OX1, OZ1 - 0.4, OZ1),
                       (OX0, OX0 + 0.4, OZ0, OZ1), (OX1 - 0.4, OX1, OZ0, OZ1)]:
    box(x0, 33.6, z0, x1, 34.9, z1, M['trim_off'], 'HQ_offPar')
# stair bulkhead hut (hollow, open east side onto the roof)
box(-22.7, 33.6, 11.3, -22.5, 36.2, 23.7, M['wall_off'], 'HQ_offBulkW')
box(-22.7, 33.6, 23.5, -19.3, 36.2, 23.7, M['wall_off'], 'HQ_offBulkN')
box(-22.7, 33.6, 11.3, -19.3, 36.2, 11.5, M['wall_off'], 'HQ_offBulkS')
box(-22.7, 36.2, 11.3, -19.3, 36.6, 23.7, M['roof'], 'HQ_offBulkRoof')
box(-21.6, 36.6, 16.4, -21.3, 37.4, 16.7, M['beacon'], 'HQ_beacon')
# Central Communications Antenna Mast
cyl(-8, 0, 33.6, 44.0, 0.16, M['white'], name='HQ_mast')
beam((-8, 40.5, 0), (-4.5, 40.5, 0), 0.1, 0.1, M['white'], 'HQ_mastArm')
box(-8.3, 37.0, -0.3, -7.7, 39.0, 0.3, M['slab'], 'HQ_mastPanel')
box(-2, 33.7, 4, 1, 34.3, 7, M['slab'], 'HQ_ac2')
# helipad (west half of officers roof)
cyl(-11, 5, 33.62, 33.78, 6.5, M['heli'], seg=24, name='HQ_pad')
box(-11.3, 33.79, 1.5, -10.7, 33.84, 8.5, M['marking'], 'HQ_h1')
box(-13.5, 33.79, 4.7, -8.5, 33.84, 5.3, M['marking'], 'HQ_h2')
for a in range(8):
    box(-11 + 6.5 * math.cos(a * math.pi / 4) - 0.12, 33.79, 5 + 6.5 * math.sin(a * math.pi / 4) - 0.12,
        -11 + 6.5 * math.cos(a * math.pi / 4) + 0.12, 33.95, 5 + 6.5 * math.sin(a * math.pi / 4) + 0.12,
        M['lamp'], 'HQ_padL%d' % a)
# (AC units placed above near the helipad)

# ---- prison shell ---------------------------------------------------------------
for f in range(5):
    y0 = FLOORS[f]
    y1 = (FLOORS[f + 1] - SLAB_T) if f < 4 else 27.64
    if f == 0:
        box(PX0, y0, PZ0, 11, y1, PZ0 + 0.5, M['wall_pris'], 'HQ_prN1')
        box(15, y0, PZ0, PX1, y1, PZ0 + 0.5, M['wall_pris'], 'HQ_prN2')
        box(11, y0 + 3.2, PZ0, 15, y1, PZ0 + 0.5, M['wall_pris'], 'HQ_prLintel')
    else:
        box(PX0, y0, PZ0, PX1, y1, PZ0 + 0.5, M['wall_pris'], 'HQ_prN%d' % f)
    box(PX0, y0, PZ1 - 0.5, PX1, y1, PZ1, M['wall_pris'], 'HQ_prS%d' % f)
    if f in (1, 3):
        # doorway to the skybridge (z 10.5..12.5, 2.6 high)
        box(PX0, y0, PZ0, PX0 + 0.5, y1, 10.5, M['wall_pris'], 'HQ_prW%dA' % f)
        box(PX0, y0, 12.5, PX0 + 0.5, y1, PZ1, M['wall_pris'], 'HQ_prW%dB' % f)
        box(PX0, y0 + 2.6, 10.5, PX0 + 0.5, y1, 12.5, M['wall_pris'], 'HQ_prW%dL' % f)
    else:
        box(PX0, y0, PZ0, PX0 + 0.5, y1, PZ1, M['wall_pris'], 'HQ_prW%d' % f)
    box(PX1 - 0.5, y0, PZ0, PX1, y1, PZ1, M['wall_pris'], 'HQ_prE%d' % f)
    # (barred windows placed per-face below for clarity)
    facade_windows('n', PZ0, -1, y0 + 1.2, y0 + 2.6, PX0 + 2, PX1 - 2, 3.2, 1.4, bars=True, tag='HQ_prNb%d' % f)
    facade_windows('s', PZ1, 1, y0 + 1.2, y0 + 2.6, PX0 + 2, PX1 - 2, 3.2, 1.4, bars=True, tag='HQ_prSb%d' % f)
    facade_windows('e', PX1, 1, y0 + 1.2, y0 + 2.6, PZ0 + 2, PZ1 - 2, 3.2, 1.4, bars=True, tag='HQ_prEb%d' % f)
    facade_windows('w', PX0, -1, y0 + 1.2, y0 + 2.6, PZ0 + 2, PZ1 - 2, 3.6, 1.2, bars=False, tag='HQ_prWb%d' % f)
for f in range(1, 5):
    w = FLOORS[f]
    slab(PX0, 19.5, PZ0, PZ1, w, 'HQ_prSl%dA' % f)
    slab(22.5, PX1, PZ0, PZ1, w, 'HQ_prSl%dB' % f)
    slab(19.5, 22.5, PZ0, 11.5, w, 'HQ_prSl%dC' % f)
    # NOTE: shaft opening x[19.5,22.5] z[11.5,23.5=PZ1] left open
# prison entrance steps + sign + steel portico doors + camera
box(11.5, 0.17, PZ0 - 3.0, 14.5, 0.5, PZ0, M['slab'], 'HQ_prStep')
box(10.5, 4.4, PZ0 - 0.15, 15.5, 5.6, PZ0 + 0.15, M['trim_pris'], 'HQ_prSign')
box(10.5, 4.25, PZ0 - 0.2, 15.5, 4.4, PZ0 + 0.2, M['gold'], 'HQ_prSignT')
for dx in (11, 15):
    box(dx - 0.25, 0.18, -12.5, dx + 0.25, 3.1, -12.0, M['trim_pris'], 'HQ_pDoorPost')
box(11, 3.1, -12.5, 15, 3.4, -12.0, M['trim_pris'], 'HQ_pDoorHead')
beam((11.2, 1.6, -12.3), (11.2 + 1.8 * 0.906, 1.6, -12.3 + 1.8 * 0.423), 0.09, 2.8,
     M['steel'], 'HQ_pLeafW')
beam((14.8, 1.6, -12.3), (14.8 - 1.8 * 0.906, 1.6, -12.3 + 1.8 * 0.423), 0.09, 2.8,
     M['steel'], 'HQ_pLeafE')
bz = 11.3
while bz < 14.7:
    box(bz, 2.6, -12.45, bz + 0.06, 3.35, -12.35, M['steel'], 'HQ_pTransom')
    bz += 0.35
box(12.7, 3.6, -12.62, 13.3, 4.1, -12.42, M['lamp'], 'HQ_pLamp')
box(15.6, 3.8, -12.62, 15.9, 4.1, -12.42, M['steel'], 'HQ_pCam')
box(15.65, 3.85, -12.64, 15.75, 3.95, -12.56, M['beacon'], 'HQ_pCamDot')

# ---- prison stairs: 5 switchback stories to the roof -----------------------------
for f in range(5):
    stairs_sb(19.5, FLOORS[f], (FLOORS[f + 1] if f < 4 else 28.0), 'HQ_pSt%d' % f)

# ---- prison interiors -------------------------------------------------------------
# F1: gameplay jail cell (bar wall plane local x=13 == world 1041)
box(13 - 0.1, 0.18, -10.5, 13 + 0.1, 0.18 + 4.8, 1.5, M['steel'], 'HQ_jailWall')
bz = -10.5
while bz < 1.5 - 0.1:
    if -3.3 < bz < -1.5:
        bz += 0.3
        continue
    box(13 - 0.06, 0.18, bz, 13 + 0.06, 0.18 + 4.8, bz + 0.05, M['steel'], 'HQ_jailBar')
    bz += 0.3
box(13 - 0.08, 0.18 + 4.8, -10.5, 13 + 0.08, 0.18 + 4.95, 1.5, M['steel'], 'HQ_jailRail')
box(13 - 0.15, 0.18, -3.5, 13 + 0.15, 0.18 + 3.0, -3.2, M['steel'], 'HQ_jailDoorL')
box(13 - 0.15, 0.18, -1.6, 13 + 0.15, 0.18 + 3.0, -1.3, M['steel'], 'HQ_jailDoorR')
box(13 - 0.15, 0.18 + 3.0, -3.5, 13 + 0.15, 0.18 + 3.3, -1.3, M['steel'], 'HQ_jailLintel')
# cell interior (west of wall): cot + toilet
box(10.0, 0.18, -6.0, 11.8, 0.63, -5.0, M['wood'], 'HQ_jailCot')
box(10.0, 0.63, -6.0, 11.8, 0.78, -5.0, M['bed'], 'HQ_jailPad')
box(9.4, 0.18, -2.6, 10.0, 0.68, -2.0, M['toilet'], 'HQ_jailWc')
# intake / booking counter (Davis local x 6)
box(4.0, 0.18, -9.3, 8.0, 1.1, -7.9, M['desk'], 'HQ_bookDesk')
box(5.6, 1.1, -8.8, 6.4, 1.5, -8.0, M['screen'], 'HQ_bookMon')
# sally port (south): rolling door + 2 vans
box(13, 0.18, 22.6, 21, 4.6, 23.5, M['trim_pris'], 'HQ_sallyDoor')
for i in range(6):
    box(13.4 + i * 1.25, 0.6, 22.55, 14.4 + i * 1.25, 4.2, 22.65, M['steel'], 'HQ_sallySlat%d' % i)
for vi, vx in enumerate((15.2, 18.8)):
    box(vx - 1.05, 0.12, 17.6, vx + 1.05, 2.2, 22.2, M['white'], 'HQ_van%d' % vi)
    box(vx - 1.05, 2.2, 19.4, vx + 1.05, 2.65, 22.2, M['white'], 'HQ_vanTop%d' % vi)
    box(vx - 0.8, 0.9, 17.5, vx + 0.8, 1.6, 18.3, M['glass_dark'], 'HQ_vanCab%d' % vi)
    box(vx - 0.7, 1.6, 17.55, vx - 0.1, 1.8, 18.25, M['door_navy'], 'HQ_vanStr%d' % vi)
    for wi, (sx, sz) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        box(vx + sx * 0.85 - 0.18, 0.12, (19.9 if sz < 0 else 21.3) - 0.18,
            vx + sx * 0.85 + 0.18, 0.55, (19.9 if sz < 0 else 21.3) + 0.18,
            M['steel'], 'HQ_vanW%d_%d' % (vi, wi))
# F2-F4 cell tiers: 4 cells each (2 west, 2 east of hallway x[13,19]... use x[11,13]? keep simple)
for f, y in ((1, 5.6), (2, 11.2), (3, 16.8)):
    for cx0, cz0 in ((4.0, -10.0), (4.0, -2.0), (15.0, -10.0), (15.0, -2.0)):
        cell_unit(cx0, cz0, 6.0, 6.0, y, 'HQ_c%d%d' % (f, int(cx0 + cz0)))
# F2 interrogation (Cole/Kowalski local x 10)
box(9.0, 5.6, 0.5, 11.2, 5.6 + 0.8, 2.5, M['desk'], 'HQ_prInter')
for sx, sz in ((9.4, 3.2), (10.6, 3.2), (9.4, -0.2), (10.6, -0.2)):
    box(sx - 0.3, 5.6, sz - 0.3, sx + 0.3, 5.6 + 0.55, sz + 0.3, M['steel'], 'HQ_prIntCh')
box(8.9, 5.6 + 1.6, 2.6, 11.3, 5.6 + 2.8, 2.75, M['glass_dark'], 'HQ_prMirror')
# F3 guard office (Lt.Vance local x 10)
desk_set(9.0, -7.0, 11.2, 'HQ_guardOff', chairs=1)
# F5 guard HQ + solitary cells (open fronts, like the tiers) + medical
desk_set(6.0, -6.0, 22.4, 'HQ_phq', chairs=2)
for i, sz in enumerate((-2.0, 1.5)):
    cell_unit(15.0, sz, 6.0, 2.6, 22.4, 'HQ_sol%d' % i)
box(4.5, 22.4, 8.0, 6.5, 22.4 + 0.6, 10.0, M['bed'], 'HQ_medCot')
box(4.5, 22.4 + 0.6, 8.0, 5.1, 22.4 + 1.4, 8.6, M['white'], 'HQ_medCab')

# ---- prison roof: yard + watchtower (slab split around stair shaft) --------------
slab(PX0, 19.5, PZ0, PZ1, 28.0, 'HQ_prRoofA')
slab(22.5, PX1, PZ0, PZ1, 28.0, 'HQ_prRoofB')
slab(19.5, 22.5, PZ0, 11.5, 28.0, 'HQ_prRoofC')
for x0, x1, z0, z1 in [(PX0, PX1, PZ0, PZ0 + 0.4), (PX0, PX1, PZ1 - 0.4, PZ1),
                       (PX0, PX0 + 0.4, PZ0, PZ1), (PX1 - 0.4, PX1, PZ0, PZ1)]:
    box(x0, 28.0, z0, x1, 29.3, z1, M['trim_pris'], 'HQ_prPar')
# prison stair bulkhead (hollow, open west side onto the roof)
box(22.5, 28.0, 11.3, 22.7, 30.6, 23.7, M['wall_pris'], 'HQ_prBulkE')
box(19.3, 28.0, 23.5, 22.7, 30.6, 23.7, M['wall_pris'], 'HQ_prBulkN')
box(19.3, 28.0, 11.3, 22.7, 30.6, 11.5, M['wall_pris'], 'HQ_prBulkS')
box(19.3, 30.6, 11.3, 22.7, 31.0, 23.7, M['roof'], 'HQ_prBulkRoof')
# yard fence x[5,21] z[13,23]
for fx in range(5, 22, 2):
    for fz in (13, 23):
        box(fx - 0.06, 28.0, fz - 0.06, fx + 0.06, 30.5, fz + 0.06, M['fence'], 'HQ_yf')
for fz in (13, 23):
    box(5, 30.3, fz - 0.07, 21, 30.45, fz + 0.07, M['fence'], 'HQ_yrail')
    box(5, 29.2, fz - 0.07, 21, 29.32, fz + 0.07, M['fence'], 'HQ_yrai2')
for fx in (5, 21):
    box(fx - 0.07, 28.0, 13, fx + 0.07, 30.5, 23, M['fence'], 'HQ_yfside')
    box(fx - 0.07, 29.1, 13, fx + 0.07, 29.25, 23, M['fence'], 'HQ_yfmid')
box(8, 28.0, 17, 10, 28.5, 19, M['wood'], 'HQ_ybench')
beam((14, 28.0, 17), (14, 30.3, 17), 0.09, 0.09, M['steel'], 'HQ_pull1')
beam((16, 28.0, 17), (16, 30.3, 17), 0.09, 0.09, M['steel'], 'HQ_pull2')
beam((14, 30.3, 17), (16, 30.3, 17), 0.07, 0.07, M['steel'], 'HQ_pullbar')
beam((12, 28.0, 21), (12, 32.0, 21), 0.12, 0.12, M['steel'], 'HQ_hoopP')
box(11.7, 31.4, 20.85, 12.3, 32.4, 21.15, M['white'], 'HQ_hoopB')
# watchtower over solid slab (west of the stair shaft)
for lx, lz in ((16.5, 20.5), (19.0, 20.5), (16.5, 23.0), (19.0, 23.0)):
    box(lx - 0.14, 28.0, lz - 0.14, lx + 0.14, 33.0, lz + 0.14, M['wood'], 'HQ_wtLeg')
box(16.2, 33.0, 20.2, 19.3, 33.25, 23.3, M['wood'], 'HQ_wtFloor')
box(16.2, 33.25, 20.2, 19.3, 34.9, 20.45, M['wall_pris'], 'HQ_wtN')
box(16.2, 33.25, 23.05, 19.3, 34.9, 23.3, M['wall_pris'], 'HQ_wtS')
box(16.2, 33.25, 20.2, 16.45, 34.9, 23.3, M['wall_pris'], 'HQ_wtW')
box(19.05, 33.25, 20.2, 19.3, 34.9, 23.3, M['wall_pris'], 'HQ_wtE')
box(16.5, 33.9, 20.5, 19.0, 34.7, 23.0, M['glass'], 'HQ_wtGlass')
box(16.0, 34.9, 20.0, 19.5, 35.25, 23.5, M['roof'], 'HQ_wtRoof')
box(17.6, 33.3, 21.6, 18.0, 33.7, 22.0, M['lamp'], 'HQ_search')
box(17.85, 35.25, 21.65, 18.0, 35.7, 21.8, M['beacon'], 'HQ_wtBeacon')

# ---- skybridges (F2 + F4) across the alley ------------------------------------------
for by, tag in ((5.6, 'HQ_br2'), (16.8, 'HQ_br4')):
    box(0.5, by - 0.18, 9.5, 3.5, by, 13.5, M['slab'], tag + '_floor')
    box(0.5, by + 2.6, 9.5, 3.5, by + 2.85, 13.5, M['slab'], tag + '_roof')
    box(0.5, by, 9.5, 0.7, by + 2.6, 13.5, M['glass'], tag + '_sideW')
    box(3.3, by, 9.5, 3.5, by + 2.6, 13.5, M['glass'], tag + '_sideE')

# ---- alley gates ---------------------------------------------------------------------
box(1.0, 0.17, -12.5, 3.0, 2.6, -12.3, M['fence'], 'HQ_alleyGateN')
box(1.0, 0.17, 23.3, 3.0, 2.6, 23.5, M['fence'], 'HQ_alleyGateS')

# ---- export ----------------------------------------------------------------------------
# NOTE (orientation): this script authors in GAME space (Y-up, front = -z),
# but Blender is Z-up. Rotating every part +90° about X maps authoring axes
# exactly onto Blender axes (verified: local +Y -> world +Z, local +Z -> -Y),
# so after the exporter's Y-up conversion the game sees authoring coords
# 1:1 (x->x, y->y, z->z). Verified against exported bounds, not assumed.
for o in bpy.data.objects:
    o.select_set(False)
for o in _CREATED:
    o.rotation_euler = (math.pi / 2, 0, 0)
    o.select_set(True)
os.makedirs(os.path.dirname(OUT_GLB), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', use_selection=True,
                           export_yup=True, export_materials='EXPORT',
                           export_cameras=False, export_lights=False)

# ---- spec for the game-side colliders -----------------------------------------------------
print('HQ_SPEC_BEGIN')
print(json.dumps({
    'out': OUT_GLB,
    'parts': len(_CREATED),
    'floors': FLOORS,
    'officers': {'x': [OX0, OX1], 'z': [OZ0, OZ1], 'top_floor': 5, 'roof_walk': 33.6},
    'prison': {'x': [PX0, PX1], 'z': [PZ0, PZ1], 'top_floor': 4, 'roof_walk': 28.0},
    'off_shaft': {'x': [-22.5, -19.5], 'z0': 11.5, 'len': 12.0, 'w': 3.0, 'switchback': True,
                  'stories': [[FLOORS[f], (FLOORS[f + 1] if f < 5 else 33.6)] for f in range(6)]},
    'pris_shaft': {'x': [19.5, 22.5], 'z0': 11.5, 'len': 12.0, 'w': 3.0, 'switchback': True,
                   'stories': [[FLOORS[f], (FLOORS[f + 1] if f < 4 else 28.0)] for f in range(5)]},
    'bridges': [{'y': 5.6}, {'y': 16.8}],
    'jail_local': {'wall_x': 13, 'z0': -10.5, 'z1': 1.5, 'door': [-3.3, -1.5]},
    'world_off': WORLD_OFF,
}, indent=0))
print('HQ_SPEC_END')
import math as _m2
tris = sum(len(mm.polygons) * (len(mm.polygons[0].vertices) - 2) if len(mm.polygons) else 0 for mm in [o.data for o in _CREATED] for mm in [mm])
print('HQ_STATS parts=%d approx_tris=%d' % (len(_CREATED), tris))
