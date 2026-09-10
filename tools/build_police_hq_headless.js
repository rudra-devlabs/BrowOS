/*
 * Headless police HQ export.
 *
 * This is the CI/runtime companion to build_police_hq.py. It intentionally has
 * no npm dependencies: the generated GLB is y-up, vertex-coloured, and keeps
 * every stair tread as its own COL_* mesh so CityBuilder can turn the boxes
 * into exact AABB colliders. Blender remains the authoring path; this exporter
 * is used when a Blender binary is not installed on the build machine.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'models', 'gta', 'landmarks', 'police_hq.glb');

const C = {
    asphalt: [0.075, 0.09, 0.12], concrete: [0.42, 0.46, 0.50], concreteHi: [0.64, 0.67, 0.70],
    prison: [0.31, 0.35, 0.39], prisonHi: [0.48, 0.52, 0.56], blue: [0.08, 0.21, 0.38],
    glass: [0.10, 0.34, 0.52], glassHi: [0.24, 0.61, 0.78], steel: [0.07, 0.09, 0.12],
    black: [0.025, 0.035, 0.05], white: [0.84, 0.88, 0.90], gold: [0.90, 0.60, 0.12],
    red: [0.78, 0.10, 0.08], orange: [0.90, 0.36, 0.08], green: [0.16, 0.50, 0.25],
    wood: [0.27, 0.16, 0.10], bed: [0.26, 0.45, 0.58], magenta: [1.0, 0.05, 0.85],
};

class B {
    constructor() { this.pos = []; this.nor = []; this.col = []; this.idx = []; this.n = 0; }
    v(x, y, z, nx, ny, nz, c) {
        this.pos.push(x, y, z); this.nor.push(nx, ny, nz); this.col.push(c[0], c[1], c[2]); return this.n++;
    }
    tri(a, b, c) { this.idx.push(a, b, c); }
    quad(a, b, c, d, nx, ny, nz, col) {
        const i0 = this.v(...a, nx, ny, nz, col), i1 = this.v(...b, nx, ny, nz, col);
        const i2 = this.v(...c, nx, ny, nz, col), i3 = this.v(...d, nx, ny, nz, col);
        this.tri(i0, i1, i2); this.tri(i0, i2, i3);
    }
    box(x0, y0, z0, x1, y1, z1, col) {
        this.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], 0, 1, 0, col);
        this.quad([x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0], 0, -1, 0, col);
        this.quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], 1, 0, 0, col);
        this.quad([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], -1, 0, 0, col);
        this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0, 0, 1, col);
        this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 0, 0, -1, col);
    }
    cyl(cx, cz, y0, y1, r, col, seg = 10) {
        for (let i = 0; i < seg; i++) {
            const a0 = i * Math.PI * 2 / seg, a1 = (i + 1) * Math.PI * 2 / seg;
            const p0 = [cx + Math.cos(a0) * r, y0, cz + Math.sin(a0) * r];
            const p1 = [cx + Math.cos(a0) * r, y1, cz + Math.sin(a0) * r];
            const p2 = [cx + Math.cos(a1) * r, y1, cz + Math.sin(a1) * r];
            const p3 = [cx + Math.cos(a1) * r, y0, cz + Math.sin(a1) * r];
            this.quad(p0, p1, p2, p3, Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2), col);
            this.tri(this.v(cx, y1, cz, 0, 1, 0, col), this.v(...p1, 0, 1, 0, col), this.v(...p2, 0, 1, 0, col));
            this.tri(this.v(cx, y0, cz, 0, -1, 0, col), this.v(...p3, 0, -1, 0, col), this.v(...p0, 0, -1, 0, col));
        }
    }
    beam(p0, p1, w, h, col) {
        const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
        const len = Math.hypot(dx, dy, dz) || 1;
        const ux = dx / len, uy = dy / len, uz = dz / len;
        let sx = 1, sy = 0, sz = 0;
        if (Math.abs(uy) < 0.99) { const d = Math.hypot(ux, uz) || 1; sx = uz / d; sz = -ux / d; }
        const vx = sy * uz - sz * uy, vy = sz * ux - sx * uz, vz = sx * uy - sy * ux;
        const corners = [];
        for (const p of [p0, p1]) for (const a of [-1, 1]) for (const b of [-1, 1]) {
            corners.push([p[0] + sx * w * a / 2 + vx * h * b / 2, p[1] + sy * w * a / 2 + vy * h * b / 2, p[2] + sz * w * a / 2 + vz * h * b / 2]);
        }
        this.quad(corners[0], corners[1], corners[3], corners[2], 0, 1, 0, col);
        this.quad(corners[4], corners[6], corners[7], corners[5], 0, -1, 0, col);
        this.quad(corners[0], corners[2], corners[6], corners[4], 0, 0, -1, col);
        this.quad(corners[1], corners[5], corners[7], corners[3], 0, 0, 1, col);
        this.quad(corners[0], corners[4], corners[5], corners[1], -1, 0, 0, col);
        this.quad(corners[2], corners[3], corners[7], corners[6], 1, 0, 0, col);
    }
}

const visual = new B();
const colliders = [];
function box(x0, y0, z0, x1, y1, z1, c) { visual.box(x0, y0, z0, x1, y1, z1, c); }
function col(name, x0, y0, z0, x1, y1, z1) {
    const b = new B(); b.box(x0, y0, z0, x1, y1, z1, C.magenta); colliders.push({ name, b });
}

function windowBand(face, fixed, a0, a1, y0, y1, step, w, glass, frame) {
    for (let a = a0, i = 0; a + w <= a1 + 1e-6; a += step, i++) {
        const c = a + w / 2;
        if (face === 'n' || face === 's') {
            const z = fixed + (face === 'n' ? -0.08 : 0.08);
            box(c - w / 2, y0, z - 0.08, c + w / 2, y1, z + 0.08, glass);
            box(c - w / 2 - 0.08, y0 - 0.12, z - 0.12, c + w / 2 + 0.08, y0, z + 0.12, frame);
            for (let x = c - w / 2 + 0.2; x < c + w / 2 - 0.1; x += 0.34) box(x, y0, z - 0.11, x + 0.045, y1, z + 0.11, C.steel);
        } else {
            const x = fixed + (face === 'e' ? 0.08 : -0.08);
            box(x - 0.08, y0, c - w / 2, x + 0.08, y1, c + w / 2, glass);
            box(x - 0.12, y0 - 0.12, c - w / 2 - 0.08, x + 0.12, y0, c + w / 2 + 0.08, frame);
            for (let z = c - w / 2 + 0.2; z < c + w / 2 - 0.1; z += 0.34) box(x - 0.11, y0, z, x + 0.11, y1, z + 0.045, C.steel);
        }
    }
}

function floorSlab(x0, x1, z0, z1, y, c = C.concrete) { box(x0, y - 0.32, z0, x1, y, z1, c); }

function stairStack(x0, y0, y1, tag) {
    const width = 3.0, half = (y1 - y0) / 2, n = Math.max(8, Math.round(half / 0.27)), rise = half / n, run = 8 / n;
    for (let i = 0; i < n; i++) {
        const top = y0 + (i + 1) * rise, z0 = 13.5 + i * run, z1 = z0 + run;
        box(x0, top - rise, z0, x0 + 1.38, top, z1, C.concreteHi);
        col(`COL_${tag}_a${i}`, x0, top - rise, z0, x0 + 1.38, top, z1);
        box(x0 + 1.6, top - rise, 21.5 - (i + 1) * run, x0 + width, top, 21.5 - i * run, C.concreteHi);
        col(`COL_${tag}_b${i}`, x0 + 1.6, top - rise, 21.5 - (i + 1) * run, x0 + width, top, 21.5 - i * run);
    }
    box(x0, y0 + half - 0.18, 21.5, x0 + width, y0 + half, 23.5, C.concreteHi);
    col(`COL_${tag}_landS`, x0, y0 + half - 0.18, 21.5, x0 + width, y0 + half, 23.5);
    box(x0, y1 - 0.18, 11.5, x0 + width, y1, 13.5, C.concreteHi);
    col(`COL_${tag}_landN`, x0, y1 - 0.18, 11.5, x0 + width, y1, 13.5);
    // Side strings, handrail posts, and a warm safety stripe make the flights read
    // clearly from the floor below without turning the stairwell into a solid wall.
    for (const sx of [x0 - 0.08, x0 + width + 0.08]) {
        visual.beam([sx, y0 - 0.05, 13.4], [sx, y0 + half - 0.05, 21.5], 0.16, 0.26, C.steel);
        visual.beam([sx, y0 + half - 0.05, 21.5], [sx, y1 - 0.05, 13.4], 0.16, 0.26, C.steel);
        for (let i = 0; i <= n; i += 2) {
            const yy = y0 + i * rise, zz = 13.5 + i * run;
            box(sx - 0.04, yy, zz - 0.04, sx + 0.04, yy + 0.9, zz + 0.04, C.steel);
            visual.beam([sx, yy + 0.9, zz], [sx, yy + 0.9 + 0.14, zz + 0.42], 0.06, 0.06, C.gold);
        }
    }
}

function facade(x0, x1, z0, z1, floors, prison) {
    const wall = prison ? C.prison : C.concrete, hi = prison ? C.prisonHi : C.concreteHi;
    const top = floors[floors.length - 1] + (prison ? 0 : 5.6);
    for (let f = 0; f < floors.length; f++) {
        const y0 = floors[f], y1 = (f + 1 < floors.length ? floors[f + 1] - 0.36 : top - 0.36);
        // Perimeter shells. Front openings are framed by a heavier entrance bay.
        box(x0, y0, z0, x1, y1, z0 + 0.5, wall);
        box(x0, y0, z1 - 0.5, x1, y1, z1, wall);
        box(x0, y0, z0, x0 + 0.5, y1, z1, wall);
        box(x1 - 0.5, y0, z0, x1, y1, z1, wall);
        box(x0, y1 - 0.16, z0, x1, y1 + 0.08, z1, hi);
        windowBand('n', z0, x0 + 1.8, x1 - 1.8, y0 + 1.2, y0 + 3.2, 3.5, prison ? 1.35 : 1.7, prison ? C.glass : C.glassHi, C.steel);
        windowBand('s', z1, x0 + 1.8, x1 - 1.8, y0 + 1.2, y0 + 3.2, 3.5, prison ? 1.35 : 1.7, prison ? C.glass : C.glassHi, C.steel);
        windowBand('e', x1, z0 + 1.8, z1 - 1.8, y0 + 1.2, y0 + 3.2, 3.5, prison ? 1.35 : 1.7, prison ? C.glass : C.glassHi, C.steel);
        windowBand('w', x0, z0 + 1.8, z1 - 1.8, y0 + 1.2, y0 + 3.2, 3.5, prison ? 1.35 : 1.7, prison ? C.glass : C.glassHi, C.steel);
    }
    // Tall corner piers and a clean roofline replace the old featureless block.
    for (const [x, z] of [[x0, z0], [x1 - 0.7, z0], [x0, z1 - 0.7], [x1 - 0.7, z1 - 0.7]]) box(x, 0.18, z, x + 0.7, top, z + 0.7, hi);
    box(x0, top, z0, x1, top + 0.55, z0 + 0.55, hi);
    box(x0, top, z1 - 0.55, x1, top + 0.55, z1, hi);
    box(x0, top, z0, x0 + 0.55, top + 0.55, z1, hi);
    box(x1 - 0.55, top, z0, x1, top + 0.55, z1, hi);
}

function desk(x, z, y, c = C.wood) {
    box(x - 1.2, y, z - 0.7, x + 1.2, y + 1.0, z + 0.7, c);
    box(x - 1.28, y + 1.0, z - 0.78, x + 1.28, y + 1.12, z + 0.78, C.concreteHi);
    box(x - 0.3, y + 1.12, z - 0.2, x + 0.3, y + 1.55, z + 0.2, C.glassHi);
}

function cell(x0, z0, w, d, y, tag) {
    box(x0, y, z0, x0 + 0.24, y + 2.75, z0 + d, C.prisonHi);
    box(x0, y, z0, x0 + w, y + 2.75, z0 + 0.24, C.prisonHi);
    box(x0, y, z0 + d - 0.24, x0 + w, y + 2.75, z0 + d, C.prisonHi);
    box(x0 + w - 0.08, y, z0, x0 + w + 0.08, y + 2.75, z0 + d, C.steel);
    for (let z = z0 + 0.25; z < z0 + d - 0.15; z += 0.30) box(x0 + w - 0.055, y, z, x0 + w + 0.055, y + 2.75, z + 0.05, C.steel);
    box(x0 + 0.38, y, z0 + 0.55, x0 + 2.1, y + 0.42, z0 + 1.45, C.wood);
    box(x0 + 0.38, y + 0.42, z0 + 0.55, x0 + 2.1, y + 0.58, z0 + 1.45, C.bed);
    box(x0 + w - 1.05, y, z0 + d - 1.05, x0 + w - 0.42, y + 0.5, z0 + d - 0.42, C.white);
}

// Site / security perimeter.
box(-24, 0.02, -25.5, 24, 0.18, 25.5, C.asphalt);
for (let x = -24; x <= 24; x += 3) {
    if (x >= -3 && x <= 3) continue;
    box(x - 0.08, 0.18, -25.45, x + 0.08, 2.8, -25.20, C.steel);
}
box(-24, 2.45, -25.45, -3, 2.58, -25.20, C.steel);
box(3, 2.45, -25.45, 24, 2.58, -25.20, C.steel);
box(-24, 1.15, -25.44, -3, 1.28, -25.21, C.gold);
box(3, 1.15, -25.44, 24, 1.28, -25.21, C.gold);
for (const gx of [-3.1, 3.1]) {
    box(gx - 0.75, 0.18, -25.75, gx + 0.75, 4.8, -24.55, C.blue);
    box(gx - 0.92, 4.8, -25.90, gx + 0.92, 5.1, -24.40, C.concreteHi);
    box(gx - 0.33, 5.1, -25.60, gx + 0.33, 5.75, -24.85, C.gold);
    box(gx - 0.48, 2.55, -25.82, gx + 0.48, 3.45, -25.78, C.white);
}
// Open vehicle gate leaves parked to each side, with bollards and a visible track.
for (const [x0, x1] of [[-9.4, -3.9], [3.9, 9.4]]) {
    box(x0, 0.42, -25.7, x1, 0.58, -25.46, C.steel);
    box(x0, 2.3, -25.7, x1, 2.44, -25.46, C.steel);
    for (let x = x0 + 0.55; x < x1 - 0.35; x += 0.75) box(x, 0.42, -25.7, x + 0.11, 2.44, -25.46, C.steel);
}
box(-9.5, 0.18, -25.78, 9.5, 0.26, -25.42, C.gold);
for (const x of [-14, 0, 14]) { visual.cyl(x, -14.2, 0.18, 5.8, 0.09, C.steel, 10); box(x - 0.65, 5.75, -14.55, x + 0.65, 5.9, -13.9, C.gold); }

const offFloors = [0.18, 5.6, 11.2, 16.8, 22.4, 28.0];
const prisFloors = [0.18, 5.6, 11.2, 16.8, 22.4];
facade(-23, 1, -12.5, 23.5, offFloors, false);
facade(3, 23, -12.5, 23.5, prisFloors, true);
for (let f = 0; f < offFloors.length; f++) {
    const y = offFloors[f]; floorSlab(-23, -22.5, -12.5, 23.5, y); floorSlab(-19.5, 1, -12.5, 11.5, y); floorSlab(-19.5, 1, 11.5, 23.5, y);
}
for (let f = 1; f < prisFloors.length; f++) {
    const y = prisFloors[f]; floorSlab(3, 19.5, -12.5, 23.5, y); floorSlab(22.5, 23, -12.5, 23.5, y); floorSlab(19.5, 22.5, -12.5, 11.5, y);
}

// Entrances: deep canopies, steps, door frames, badge panels, and security cameras.
for (const [x0, x1, navy] of [[-16, -8, C.blue], [10.5, 15.5, C.prison]]) {
    box(x0, 0.18, -15.8, x1, 0.48, -12.5, C.concreteHi);
    for (let i = 0; i < 4; i++) box(x0 + i * (x1 - x0) / 4, 0.48 + i * 0.18, -14.0 + i * 0.35, x0 + (i + 1) * (x1 - x0) / 4, 0.66 + i * 0.18, -12.5, C.concrete);
    box(x0 + 0.4, 3.6, -13.0, x1 - 0.4, 3.82, -12.25, navy);
    box(x0 + 0.8, 3.82, -13.02, x1 - 0.8, 4.05, -12.2, C.gold);
    for (const x of [x0 + 0.55, x1 - 0.55]) { box(x - 0.16, 0.48, -12.95, x + 0.16, 3.4, -12.4, C.steel); box(x - 0.24, 3.4, -13.02, x + 0.24, 3.58, -12.32, C.concreteHi); }
    box(x0 + 1.2, 0.7, -12.65, x1 - 1.2, 3.0, -12.52, C.glassHi);
    box((x0 + x1) / 2 - 0.08, 0.8, -12.7, (x0 + x1) / 2 + 0.08, 2.9, -12.42, C.gold);
    box(x1 + 0.35, 3.15, -12.82, x1 + 0.55, 3.45, -12.64, C.red);
}

// Officers interior and circulation.
for (let f = 0; f < offFloors.length; f++) stairStack(-22.5, offFloors[f], f < 5 ? offFloors[f + 1] : 33.6, `HQ_oSt${f}`);
desk(-3.0, -8.5, 0.18); desk(-8.0, -6.5, 5.6); desk(-2.5, -6.5, 5.6); desk(-8.0, -0.5, 5.6); desk(-2.5, -0.5, 5.6);
desk(-9.0, -6.5, 16.8); desk(-2.0, 3.5, 16.8);
for (let i = 0; i < 6; i++) box(-22.35, 22.4, -8 + i * 1.3, -21.3, 24.4, -7.0 + i * 1.3, C.concreteHi);
for (let i = 0; i < 4; i++) { box(-14 + i * 2.2, 28.0, 16, -12.6 + i * 2.2, 30.0, 16.9, C.black); box(-13.9 + i * 2.2, 29.0, 15.95, -12.7 + i * 2.2, 29.14, 16.05, C.green); }
box(-13.5, 33.6, -1, -8.5, 34.0, 7, C.steel); box(-13.1, 34.0, 1.2, -8.9, 34.12, 4.8, C.white);

// Prison interior: real cell tiers, barred corridor, booking desk, sally port, yard.
for (let f = 0; f < prisFloors.length; f++) stairStack(19.5, prisFloors[f], f < 4 ? prisFloors[f + 1] : 28.0, `HQ_pSt${f}`);
box(13 - 0.1, 0.18, -10.5, 13 + 0.1, 4.98, 1.5, C.steel);
for (let z = -10.5; z < 1.5; z += 0.3) if (!(z > -3.3 && z < -1.5)) box(12.94, 0.18, z, 13.06, 4.98, z + 0.05, C.steel);
box(12.84, 4.98, -10.5, 13.16, 5.12, 1.5, C.steel); desk(6.0, -8.6, 0.18);
for (const [y, z0] of [[5.6, -10.0], [5.6, -2.0], [11.2, -10.0], [11.2, -2.0], [16.8, -10.0], [16.8, -2.0], [22.4, -2.0]]) cell(4.0, z0, 6.0, 6.0, y, `cell_${y}_${z0}`);
for (const z of [-8.8, -4.0, 0.8, 5.5]) box(12.9, 0.18, z, 13.1, 4.8, z + 0.07, C.steel);
box(13, 0.18, 22.6, 21, 4.6, 23.5, C.prisonHi); for (let i = 0; i < 7; i++) box(13.3 + i * 1.1, 0.55, 22.54, 13.38 + i * 1.1, 4.25, 22.68, C.steel);
// Exercise yard / watch post on the roof.
for (const x of [5, 21]) { box(x - 0.08, 28.0, 13, x + 0.08, 31.0, 23, C.steel); box(x - 0.08, 29.1, 13, x + 0.08, 29.25, 23, C.gold); }
for (const z of [13, 23]) { box(5, 30.7, z - 0.08, 21, 30.86, z + 0.08, C.steel); box(5, 29.1, z - 0.08, 21, 29.25, z + 0.08, C.gold); }
for (let x = 5; x <= 21; x += 2) for (const z of [13, 23]) box(x - 0.07, 28.0, z - 0.07, x + 0.07, 31.0, z + 0.07, C.steel);
box(16.2, 33.0, 20.2, 19.3, 33.25, 23.3, C.wood); box(16.2, 33.25, 20.2, 19.3, 34.7, 20.45, C.prisonHi); box(16.2, 33.25, 23.05, 19.3, 34.7, 23.3, C.prisonHi); box(16.2, 34.7, 20.2, 19.3, 35.0, 23.3, C.steel);

// Shared roofs, clear signage, and low-profile rooftop equipment. Keep the
// stair shafts open at the roof so the last landing arrives on the walkable
// deck instead of disappearing under a cap slab.
floorSlab(-23, -22.5, -12.5, 23.5, 33.6, C.blue);
floorSlab(-19.5, 1, -12.5, 11.5, 33.6, C.blue);
floorSlab(-19.5, 1, 11.5, 23.5, 33.6, C.blue);
floorSlab(3, 19.5, -12.5, 23.5, 28.0, C.prison);
floorSlab(22.5, 23, -12.5, 23.5, 28.0, C.prison);
floorSlab(19.5, 22.5, -12.5, 11.5, 28.0, C.prison);
box(-23, 33.6, -12.5, 1, 34.0, -12.0, C.concreteHi); box(-23, 33.6, 23.0, 1, 34.0, 23.5, C.concreteHi);
visual.cyl(-11, 5, 33.98, 34.16, 6.1, C.black, 24); box(-13.5, 34.16, 4.7, -8.5, 34.25, 5.3, C.white); box(-11.3, 34.16, 1.5, -10.7, 34.25, 8.5, C.white);
visual.cyl(-8, 0, 34.0, 44.0, 0.14, C.white, 10); box(-8.28, 37, -0.25, -7.72, 39.0, 0.25, C.glassHi);

function meshData(b) {
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < b.n; i++) { const x = b.pos[i * 3], y = b.pos[i * 3 + 1], z = b.pos[i * 3 + 2]; minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z); }
    return { pos: new Float32Array(b.pos), nor: new Float32Array(b.nor), col: new Float32Array(b.col), idx: new Uint32Array(b.idx), min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

function writeGlb(meshes, file) {
    const align = n => (n + 3) & ~3, bytes = [], views = [], accessors = [], meshDefs = [];
    let cursor = 0;
    const append = (u8) => { const off = align(cursor); while (bytes.length < off) bytes.push(0); for (const v of u8) bytes.push(v); cursor = off + u8.length; return { off, len: u8.length }; };
    const addAttr = (arr, type, count, target, min, max) => { const part = append(new Uint8Array(arr.buffer)); const view = views.push({ buffer: 0, byteOffset: part.off, byteLength: part.len, target }) - 1; const acc = { bufferView: view, componentType: type, count, type: (type === 5123 || type === 5125) ? 'SCALAR' : 'VEC3' }; if (min) acc.min = min; if (max) acc.max = max; return accessors.push(acc) - 1; };
    for (const m of meshes) {
        const d = meshData(m.b), p = addAttr(d.pos, 5126, d.pos.length / 3, 34962, d.min, d.max);
        const n = addAttr(d.nor, 5126, d.nor.length / 3, 34962), c = addAttr(d.col, 5126, d.col.length / 3, 34962);
        const ix = addAttr(d.idx, 5125, d.idx.length, 34963);
        meshDefs.push({ name: m.name, primitive: { attributes: { POSITION: p, NORMAL: n, COLOR_0: c }, indices: ix, material: 0, mode: 4 } });
    }
    const json = {
        asset: { version: '2.0', generator: 'BrowOS headless HQ exporter' }, scene: 0, scenes: [{ nodes: meshes.map((_, i) => i) }],
        nodes: meshes.map((m, i) => ({ name: m.name, mesh: i })), meshes: meshDefs.map(m => ({ name: m.name, primitives: [m.primitive] })),
        materials: [{ name: 'HQ_VertexColor', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0.05, roughnessFactor: 0.82 } }],
        buffers: [{ byteLength: align(bytes.length) }], bufferViews: views, accessors,
    };
    const j = Buffer.from(JSON.stringify(json), 'utf8'), jp = align(j.length), bin = Buffer.from(bytes), total = 12 + 8 + jp + 8 + align(bin.length);
    const out = Buffer.alloc(total); out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(total, 8);
    out.writeUInt32LE(jp, 12); out.writeUInt32LE(0x4e4f534a, 16); j.copy(out, 20); out.fill(0x20, 20 + j.length, 20 + jp);
    const binStart = 20 + jp; out.writeUInt32LE(align(bin.length), binStart); out.writeUInt32LE(0x004e4942, binStart + 4); bin.copy(out, binStart + 8);
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, out);
    return { bytes: out.length, tris: visual.idx.length / 3, colliderTris: colliders.length * 12, totalTris: visual.idx.length / 3 + colliders.length * 12, colliders: colliders.length, meshes: meshes.length };
}

const result = writeGlb([{ name: 'HQ_VISUAL', b: visual }, ...colliders.map(c => ({ name: c.name, b: c.b }))], OUT);
console.log(JSON.stringify({ out: OUT, world_off: [1028, 3076.5], officers: { x: [-23, 1], z: [-12.5, 23.5], roof: 33.6 }, prison: { x: [3, 23], z: [-12.5, 23.5], roof: 28.0 }, ...result }, null, 2));
