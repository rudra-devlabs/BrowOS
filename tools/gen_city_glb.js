// ============================================================================
// gen_city_glb.js — procedural generator for Brow City building & house GLBs.
//
// Produces many distinct, highly detailed vertex-colored models (offices,
// government buildings, banks, police/fire/hospital, multistorey car parks,
// library, cinema, hotel, school, factory, transit, data center, warehouses,
// plus extra suburban houses) and writes them as glTF 2.0 binary (.glb) into
// assets/models/gta/{buildings,houses}/.
//
// No dependencies: this ships its own minimal GLB writer (positions, normals,
// vertex colors, indexed triangles). The game's glbMergedGeometry() flattens
// each model to one vertex-colored buffer and auto-fixes winding, so everything
// below is authored in metres, y-up, grounded at y=0, footprint centred at the
// origin (the CityBuilder re-centers/grounds again on load anyway).
//
// Run:  node tools/gen_city_glb.js
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');

const OUT_BUILDINGS = path.join(__dirname, '..', 'assets', 'models', 'gta', 'buildings');
const OUT_HOUSES    = path.join(__dirname, '..', 'assets', 'models', 'gta', 'houses');

// ---- PRNG ----------------------------------------------------------------
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ---- Geometry builder ----------------------------------------------------
// Accumulates indexed triangles with per-vertex normal + RGB (0..1) colours.
// Winding is intentionally ignored: glbFixWinding() repairs it at load time.
class B {
    constructor() { this.pos = []; this.nor = []; this.col = []; this.idx = []; this.n = 0; }
    v(x, y, z, nx, ny, nz, r, g, b) {
        this.pos.push(x, y, z); this.nor.push(nx, ny, nz); this.col.push(r, g, b);
        return this.n++;
    }
    tri(a, b, c) { this.idx.push(a, b, c); }
    tri3(a, b, c, nx, ny, nz, r, g, cb) {
        this.tri(this.v(a[0], a[1], a[2], nx, ny, nz, r, g, cb),
                 this.v(b[0], b[1], b[2], nx, ny, nz, r, g, cb),
                 this.v(c[0], c[1], c[2], nx, ny, nz, r, g, cb));
    }
    quad(a, b, c, d, nx, ny, nz, r, g, cb) {
        const i0 = this.v(a[0], a[1], a[2], nx, ny, nz, r, g, cb);
        const i1 = this.v(b[0], b[1], b[2], nx, ny, nz, r, g, cb);
        const i2 = this.v(c[0], c[1], c[2], nx, ny, nz, r, g, cb);
        const i3 = this.v(d[0], d[1], d[2], nx, ny, nz, r, g, cb);
        this.tri(i0, i1, i2); this.tri(i0, i2, i3);
    }
    box(cx, cy, cz, sx, sy, sz, r, g, b) {
        const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
        this.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], 0, 1, 0, r, g, b);
        this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], 0, -1, 0, r, g, b);
        this.quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], 1, 0, 0, r, g, b);
        this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], -1, 0, 0, r, g, b);
        this.quad([x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], 0, 0, 1, r, g, b);
        this.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], 0, 0, -1, r, g, b);
    }
    gable(xc, y0, y1, hw, z0, z1, r, g, b) {
        const slope = Math.hypot(hw, y1 - y0);
        const nxL = -(y1 - y0) / slope, nyL = hw / slope;
        this.quad([xc - hw, y0, z0], [xc - hw, y0, z1], [xc, y1, z1], [xc, y1, z0], nxL, nyL, 0, r, g, b);
        this.quad([xc + hw, y0, z1], [xc + hw, y0, z0], [xc, y1, z0], [xc, y1, z1], -nxL, nyL, 0, r, g, b);
        this.tri3([xc - hw, y0, z0], [xc + hw, y0, z0], [xc, y1, z0], 0, 0, -1, r, g, b);
        this.tri3([xc + hw, y0, z1], [xc - hw, y0, z1], [xc, y1, z1], 0, 0, 1, r, g, b);
    }
    cyl(cx, cy, cz, r0, r1, h, seg, r, g, b) {
        for (let i = 0; i < seg; i++) {
            const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
            const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
            this.quad([cx + c0 * r0, cy, cz + s0 * r0], [cx + c0 * r0, cy + h, cz + s0 * r0],
                      [cx + c1 * r0, cy + h, cz + s1 * r0], [cx + c1 * r0, cy, cz + s1 * r0],
                      c0, 0, s0, r, g, b);
            this.tri3([cx, cy + h, cz], [cx + c0 * r0, cy + h, cz + s0 * r0], [cx + c1 * r0, cy + h, cz + s1 * r0], 0, 1, 0, r, g, b);
            if (r1 <= 0.0001) {
                this.tri3([cx, cy, cz], [cx + c1 * r0, cy, cz + s1 * r0], [cx + c0 * r0, cy, cz + s0 * r0], 0, -1, 0, r, g, b);
            }
        }
    }
}

// ---- Colour helpers ------------------------------------------------------
function jitter(c, rng, amt) {
    const d = (rng() - 0.5) * amt;
    return [Math.max(0, Math.min(1, c[0] + d)), Math.max(0, Math.min(1, c[1] + d)), Math.max(0, Math.min(1, c[2] + d))];
}

// ---- GLB writer ----------------------------------------------------------
// Serialize a B builder into a glTF 2.0 binary (.glb) file. Uint16 indices
// (models stay far under 65k verts). Material named "LowPolyVertexColor" so
// the game reads COLOR_0 rather than a flat material colour.
function writeGlb(b, filePath, name) {
    const pos = b.pos, nor = b.nor, col = b.col, idx = b.idx;
    const vCount = b.n;
    if (vCount > 65535) throw new Error(name + ': ' + vCount + ' verts exceeds Uint16 index limit');
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < vCount; i++) {
        const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const posBuf = new Float32Array(pos), norBuf = new Float32Array(nor), colBuf = new Float32Array(col), idxBuf = new Uint16Array(idx);
    const align = (n) => (n + 3) & ~3;
    const posOff = 0, posLen = posBuf.byteLength;
    const norOff = align(posLen), norLen = norBuf.byteLength;
    const colOff = align(norOff + norLen), colLen = colBuf.byteLength;
    const idxOff = align(colOff + colLen), idxLen = idxBuf.byteLength;
    const binLen = align(idxOff + idxLen);
    const bin = new Uint8Array(binLen);
    bin.set(new Uint8Array(posBuf.buffer), posOff);
    bin.set(new Uint8Array(norBuf.buffer), norOff);
    bin.set(new Uint8Array(colBuf.buffer), colOff);
    bin.set(new Uint8Array(idxBuf.buffer), idxOff);

    const json = {
        asset: { version: '2.0', generator: 'BrowOS gen_city_glb' },
        scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: name, mesh: 0 }],
        meshes: [{ name: name, primitives: [{
            attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 }, indices: 3, material: 0, mode: 4,
        }] }],
        materials: [{ name: 'LowPolyVertexColor', pbrMetallicRoughness: {
            baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1,
        } }],
        buffers: [{ byteLength: binLen }],
        bufferViews: [
            { buffer: 0, byteOffset: posOff, byteLength: posLen, target: 34962 },
            { buffer: 0, byteOffset: norOff, byteLength: norLen, target: 34962 },
            { buffer: 0, byteOffset: colOff, byteLength: colLen, target: 34962 },
            { buffer: 0, byteOffset: idxOff, byteLength: idxLen, target: 34963 },
        ],
        accessors: [
            { bufferView: 0, componentType: 5126, count: vCount, type: 'VEC3', min: [minX, minY, minZ], max: [maxX, maxY, maxZ] },
            { bufferView: 1, componentType: 5126, count: vCount, type: 'VEC3' },
            { bufferView: 2, componentType: 5126, count: vCount, type: 'VEC3' },
            { bufferView: 3, componentType: 5123, count: idx.length, type: 'SCALAR' },
        ],
    };
    const jsonStr = JSON.stringify(json);
    const jsonBuf = new Uint8Array(Buffer.from(jsonStr, 'utf8'));
    const jsonPad = align(jsonBuf.byteLength);
    const total = 12 + 8 + jsonPad + 8 + binLen;
    const out = new Uint8Array(total);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
    dv.setUint32(12, jsonPad, true); dv.setUint32(16, 0x4E4F534A, true);
    out.set(jsonBuf, 20);
    // glTF requires the JSON chunk to be 0x20 (space) padded to 4-byte alignment.
    out.fill(0x20, 20 + jsonBuf.byteLength, 20 + jsonPad);
    const binStart = 20 + jsonPad;
    dv.setUint32(binStart, binLen, true); dv.setUint32(binStart + 4, 0x004E4942, true);
    out.set(bin, binStart + 8);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, out);
    return { verts: vCount, tris: idx.length / 3, w: maxX - minX, d: maxZ - minZ, h: maxY - minY };
}

// ---- Shared detail parts ------------------------------------------------
function winGrid(b, face, w, y0, y1, cx, cz, y, cols, glass, frame, rows) {
    rows = rows || Math.max(1, Math.floor((y1 - y0) / 3.2));
    const rh = (y1 - y0) / rows, winW = Math.min(1.3, (w - 1.2) / cols), gap = (w - winW * cols) / (cols + 1);
    for (let r = 0; r < rows; r++) {
        const wy = y0 + rh * r + rh * 0.5, wh = rh * 0.62;
        for (let c = 0; c < cols; c++) {
            const off = (c + 1) * gap + winW * c - w / 2, wx = cx + off;
            if (face === 'n' || face === 's') {
                const zz = face === 'n' ? cz + y : cz - y;
                b.box(wx, wy, zz, winW, wh, 0.16, glass[0], glass[1], glass[2]);
                b.box(wx, wy - wh / 2 - 0.08, zz, winW + 0.14, 0.14, 0.2, frame[0], frame[1], frame[2]);
            } else {
                const xx = face === 'e' ? cx + y : cx - y;
                b.box(xx, wy, wx, 0.16, wh, winW, glass[0], glass[1], glass[2]);
                b.box(xx, wy - wh / 2 - 0.08, wx, 0.2, 0.14, winW + 0.14, frame[0], frame[1], frame[2]);
            }
        }
    }
}
function winAll(b, cx, cz, w, d, y0, y1, glass, frame) {
    const cW = Math.max(2, Math.floor(w / 3)), cD = Math.max(2, Math.floor(d / 3));
    winGrid(b, 'n', w, y0, y1, cx, cz, d / 2 + 0.02, cW, glass, frame);
    winGrid(b, 's', w, y0, y1, cx, cz, d / 2 + 0.02, cW, glass, frame);
    winGrid(b, 'e', d, y0, y1, cx, cz, w / 2 + 0.02, cD, glass, frame);
    winGrid(b, 'w', d, y0, y1, cx, cz, w / 2 + 0.02, cD, glass, frame);
}
function roofTrim(b, cx, cz, w, d, y, col) {
    b.box(cx, y + 0.45, cz, w + 0.3, 0.6, d + 0.3, col[0], col[1], col[2]);
    b.box(cx, y - 0.06, cz, w + 0.7, 0.22, d + 0.7, col[0], col[1], col[2]);
}
function column(b, cx, cz, r, h, col) {
    b.box(cx, 0.35, cz, r * 2.6, 0.7, r * 2.6, col[0], col[1], col[2]);
    b.cyl(cx, 0.7, cz, r, r * 0.92, h - 1.1, 8, col[0], col[1], col[2]);
    b.box(cx, h - 0.28, cz, r * 2.6, 0.56, r * 2.6, col[0], col[1], col[2]);
}
function steps(b, cx, cz, topY, w, d, col) {
    const stepD = d / 4;
    for (let i = 0; i < 4; i++) {
        const sy = topY * (i + 1) / 4;
        const zPos = cz + d / 2 - stepD * i - stepD / 2;
        b.box(cx, sy / 2, zPos, w - 0.04 * i, sy, stepD, col[0], col[1], col[2]);
    }
}
function towerBase(b, cx, cz, w, d, h, wall, glass, frame, roofCol, rng, opts) {
    opts = opts || {};
    const y0 = opts.floor0 || 0.2;
    b.box(cx, y0 + h / 2, cz, w, h, d, wall[0], wall[1], wall[2]);
    winAll(b, cx, cz, w, d, y0, y0 + h - 1.5, glass, frame);
    roofTrim(b, cx, cz, w, d, y0 + h - 0.4, roofCol);
    if (opts.bulkhead !== false) b.box(cx + w * 0.16, y0 + h + 1.1, cz - d * 0.12, w * 0.34, 2.2, d * 0.34, roofCol[0], roofCol[1], roofCol[2]);
    if (opts.waterTower && rng && rng() < 0.8) {
        const tx = cx - w * 0.22, tz = cz + d * 0.18;
        b.cyl(tx, y0 + h + 0.35, tz, 0.18, 0.18, 0.7, 6, roofCol[0], roofCol[1], roofCol[2]);
        b.cyl(tx, y0 + h + 2.4, tz, 1.4, 1.15, 2.5, 8, 0.21, 0.16, 0.13);
        b.cyl(tx, y0 + h + 3.85, tz, 1.15, 1.3, 0.5, 8, 0.15, 0.11, 0.09);
    }
    if (opts.antenna && rng && rng() < 0.7) b.cyl(cx - w * 0.2, y0 + h + 2.2, cz + d * 0.2, 0.08, 0.02, 4.5, 6, 0.5, 0.5, 0.52);
}


// ===========================================================================
// BUILDING MODELS
// ===========================================================================
// Glass office spire: curtain-wall tower with mullion bands + setback crown.
function officeGlassSpire(rng) {
    const b = new B();
    const cx = 0, cz = 0, w = 26, d = 22, h = 56;
    const glass = [0.34, 0.56, 0.74], frame = [0.16, 0.22, 0.30], wall = [0.20, 0.30, 0.42];
    b.box(cx, h / 2, cz, w, h, d, wall[0], wall[1], wall[2]);
    winAll(b, cx, cz, w, d, 0.2, h - 1.6, glass, frame);
    // Horizontal slab bands to read as storey lines.
    for (let y = 4; y < h - 2; y += 4) b.box(cx, y, cz, w + 0.16, 0.22, d + 0.16, frame[0], frame[1], frame[2]);
    roofTrim(b, cx, cz, w, d, h - 0.6, [0.24, 0.30, 0.38]);
    // Setback crown + glass cap.
    b.box(cx, h + 3.2, cz, w * 0.6, 6.4, d * 0.6, wall[0], wall[1], wall[2]);
    b.box(cx, h + 7.4, cz, w * 0.36, 2.0, d * 0.36, glass[0], glass[1], glass[2]);
    b.cyl(cx, h + 9.6, cz, 0.06, 0.02, 4.0, 6, 0.5, 0.5, 0.52);
    // Ground glass lobby.
    b.box(cx, 1.8, cz, w, 3.6, d, [0.30, 0.44, 0.56]);
    return b;
}
// Corporate mid-rise HQ: stone base, banded windows, rooftop sign frame.
function officeCorporateBlock(rng) {
    const b = new B();
    const cx = 0, cz = 0, w = 30, d = 24, h = 30;
    const wall = [0.62, 0.56, 0.48], glass = [0.32, 0.46, 0.58], frame = [0.40, 0.36, 0.32], stone = [0.52, 0.46, 0.40];
    b.box(cx, h / 2, cz, w, h, d, wall[0], wall[1], wall[2]);
    b.box(cx, 2.4, cz, w, 4.8, d, stone[0], stone[1], stone[2]);
    for (let y = 6; y < h - 1.5; y += 4.2) b.box(cx, y, cz, w + 0.14, 0.6, d + 0.14, frame[0], frame[1], frame[2]);
    winAll(b, cx, cz, w, d, 6, h - 1.5, glass, frame);
    roofTrim(b, cx, cz, w, d, h - 0.5, stone);
    // Rooftop sign frame (a big "brand band" panel on the near face).
    b.box(cx, h + 1.6, cz + d / 2 + 0.05, w * 0.5, 2.2, 0.3, [0.16, 0.20, 0.26]);
    // Ground entrance canopy.
    b.box(cx, 4.2, cz, w * 0.7, 0.5, 4, frame[0], frame[1], frame[2]);
    return b;
}
// Classical City Hall: stone base, grand columned portico, pediment, dome, flag.
function govCityHall(rng) {
    const b = new B();
    const cx = 0, cz = 0, w = 34, d = 26, h = 20;
    const stone = [0.78, 0.72, 0.62], stoneHi = [0.86, 0.80, 0.70], win = [0.20, 0.28, 0.40], dark = [0.30, 0.26, 0.22];
    b.box(cx, h / 2, cz, w, h, d, stone[0], stone[1], stone[2]);
    winGrid(b, 'n', w, 5, h - 2, cx, cz, d / 2 + 0.02, 8, win, dark);
    winGrid(b, 's', w, 5, h - 2, cx, cz, d / 2 + 0.02, 8, win, dark);
    // Portico with six columns + pediment on the front (-z).
    const pz = -(d / 2 + 2.6);
    for (let i = 0; i < 6; i++) column(b, cx - 11 + i * 4.4, pz, 0.5, 8.5, stoneHi);
    steps(b, cx, pz - 2.4, 1.4, 22, 4, stone);
    b.box(cx, 8.6, pz, 12, 1.0, 1.6, stoneHi[0], stoneHi[1], stoneHi[2]);
    b.quad([cx - 6.4, 9.0, pz], [cx + 6.4, 9.0, pz], [cx, 11.6, pz], [cx, 9.0, pz - 0.2], 0, 0.4, 0.9, stoneHi[0], stoneHi[1], stoneHi[2]);
    // Rooftop drum + dome + finial.
    b.cyl(cx, h, cz, 4.4, 4.4, 3.0, 10, stoneHi[0], stoneHi[1], stoneHi[2]);
    b.cyl(cx, h + 3.0, cz, 4.4, 0.8, 3.8, 10, stone[0], stone[1], stone[2]);
    b.cyl(cx, h + 6.8, cz, 0.16, 0.05, 3.2, 6, dark[0], dark[1], dark[2]);
    // Wings with cornices.
    roofTrim(b, cx - w * 0.36, cz, w * 0.26, d, h, stoneHi);
    roofTrim(b, cx + w * 0.36, cz, w * 0.26, d, h, stoneHi);
    return b;
}
// Courthouse: colonnade + pediment across the whole front + central clock tower.
function govCourthouse(rng) {
    const b = new B();
    const cx = 0, cz = 0, w = 40, d = 24, h = 18;
    const stone = [0.80, 0.75, 0.66], base = [0.58, 0.52, 0.44], win = [0.14, 0.20, 0.30], dark = [0.28, 0.24, 0.20];
    b.box(cx, h / 2, cz, w, h, d, stone[0], stone[1], stone[2]);
    b.box(cx, 2.0, cz, w, 4.0, d, base[0], base[1], base[2]);
    winGrid(b, 's', w, 5, h - 2, cx, cz, d / 2 + 0.02, 10, win, dark);
    // Full-front colonnade.
    const pz = -(d / 2 + 2.4);
    for (let i = 0; i < 9; i++) column(b, cx - 17 + i * 4.4, pz, 0.48, 7.5, stone);
    steps(b, cx, pz - 2.2, 1.3, 32, 4, base);
    b.box(cx, 7.6, pz, 16, 0.9, 1.8, stone[0], stone[1], stone[2]);
    b.quad([cx - 8.2, 8.0, pz], [cx + 8.2, 8.0, pz], [cx, 10.2, pz], [cx, 8.0, pz - 0.2], 0, 0.4, 0.9, stone[0], stone[1], stone[2]);
    // Clock tower with tiered top.
    const tx = cx, tz = cz + d * 0.3;
    b.box(tx, h + 6, tz, 6, 12, 6, stone[0], stone[1], stone[2]);
    b.box(tx, h + 12, tz, 6.4, 1.0, 6.4, stone[0], stone[1], stone[2]);
    for (let i = 0; i < 4; i++) {
        const ang = i * Math.PI / 2;
        b.box(tx + Math.cos(ang) * 3.2, h + 8, tz + Math.sin(ang) * 3.2, 0.3, 2.0, 0.1, [0.15, 0.18, 0.24]);
    }
    b.cyl(tx, h + 13, tz, 2.2, 0.5, 2.4, 4, stone[0], stone[1], stone[2]);
    return b;
}
// Capital bank: tall stone bank, columns, dentil cornice, clock + flag.
function bankCapital(rng) {
    const b = new B();
    const cx = 0, cz = 0, w = 26, d = 22, h = 28;
    const stone = [0.72, 0.66, 0.56], dark = [0.30, 0.26, 0.22], win = [0.16, 0.22, 0.34], gold = [0.72, 0.58, 0.24];
    b.box(cx, h / 2, cz, w, h, d, stone[0], stone[1], stone[2]);
    b.box(cx, 5, cz, w, 10, d, [0.60, 0.54, 0.44]);
    winAll(b, cx, cz, w, d, 10, h - 3, win, dark);
    // Tall banking-hall colonnade on front.
    const pz = -(d / 2 + 1.4);
    for (let i = 0; i < 5; i++) column(b, cx - 9 + i * 4.5, pz, 0.5, 10, stone);
    b.box(cx, 10, pz, 12, 0.8, 1.4, stone[0], stone[1], stone[2]);
    steps(b, cx, pz - 1.8, 1.2, 16, 3.4, stone);
    roofTrim(b, cx, cz, w, d, h - 0.6, stone);
    // Dentil cornice + rooftop clock.
    for (let i = 0; i < 18; i++) b.box(cx - w / 2 + 0.8 + i * (w - 1.6) / 17, h - 1.4, cz + d / 2 + 0.1, 1.0, 0.5, 0.3, gold[0], gold[1], gold[2]);
    b.cyl(cx, h + 1.4, cz, 3.0, 3.0, 1.4, 10, stone[0], stone[1], stone[2]);
    b.box(cx, h + 1.4, cz + 3.0, 3.4, 2.2, 0.3, [0.95, 0.92, 0.86]);
    b.cyl(cx, h + 4.2, cz, 0.12, 0.04, 4, 6, dark[0], dark[1], dark[2]);
    return b;
}

// Police precinct: station, bay doors, roll-call wing, comms mast.
function policePrecinct(rng) {
    const b = new B();
    const cx = 0, cz = 0, w = 34, d = 22, h = 15;
    const wall = [0.52, 0.55, 0.60], trim = [0.30, 0.34, 0.40], win = [0.24, 0.32, 0.44], roofC = [0.36, 0.38, 0.42], badge = [0.16, 0.22, 0.30];
    b.box(cx, h / 2, cz, w, h, d, wall[0], wall[1], wall[2]);
    winAll(b, cx, cz, w, d, 4, h - 1.5, win, trim);
    // Two garage bay doors on the front (-z) for patrol cars.
    for (let i = 0; i < 2; i++) {
        const bz = -(d / 2 + 0.05), bx = cx - 6 + i * 12;
        b.box(bx, 2.2, bz, 4.2, 4.4, 0.3, [0.44, 0.48, 0.54]);
        b.box(bx, 4.4, bz, 4.4, 0.3, 0.4, badge[0], badge[1], badge[2]);
    }
    // Roll-call entrance wing + canopy.
    b.box(cx + w * 0.3, 2.5, -(d / 2 + 1.6), 6, 5, 3.2, wall[0], wall[1], wall[2]);
    // Rooftop sign band + comms antenna.
    b.box(cx, h + 1.4, cz, w * 0.55, 2.0, 0.3, badge[0], badge[1], badge[2]);
    b.cyl(cx - w * 0.28, h + 2.2, cz, 0.1, 0.03, 5.5, 6, 0.55, 0.55, 0.58);
    roofTrim(b, cx, cz, w, d, h - 0.4, roofC);
    // Yard barrier + lights along front.
    for (let i = 0; i < 5; i++) b.box(cx - 15 + i * 7.5, 0.5, -(d / 2 + 3.5), 0.4, 1.0, 0.4, trim[0], trim[1], trim[2]);
    return b;
}
// Fire station: wide apparatus floor, tall bay doors, training tower, pole.
function fireStation(rng) {
    const b = new B();
    const cx = 0, cz = 0, w = 28, d = 24, h = 13;
    const wall = [0.60, 0.30, 0.26], trim = [0.32, 0.22, 0.20], win = [0.26, 0.32, 0.42], roofC = [0.40, 0.32, 0.30], door = [0.72, 0.72, 0.74];
    b.box(cx, h / 2, cz, w, h, d, wall[0], wall[1], wall[2]);
    // Three tall apparatus doors on front (-z).
    const bz = -(d / 2 + 0.05);
    for (let i = 0; i < 3; i++) {
        const bx = cx - 8.5 + i * 8.5;
        b.box(bx, 2.9, bz, 5, 5.8, 0.3, door[0], door[1], door[2]);
        b.box(bx, 5.8, bz, 5.2, 0.3, 0.4, trim[0], trim[1], trim[2]);
    }
    winGrid(b, 's', w, 6, h - 1, cx, cz, d / 2 + 0.02, 6, win, trim);
    // Training tower at the side.
    const tx = cx + w / 2 + 4;
    b.box(tx, 10, cz, 6, 20, 6, wall[0], wall[1], wall[2]);
    for (let y = 3; y < 19; y += 4) b.box(tx, y, cz, 6.2, 0.3, 6.2, trim[0], trim[1], trim[2]);
    // Rooftop sign + siren pole.
    b.box(cx, h + 1.5, cz, w * 0.5, 2.2, 0.3, trim[0], trim[1], trim[2]);
    b.cyl(cx + w * 0.3, h + 3, cz, 0.12, 0.04, 5, 6, 0.5, 0.5, 0.52);
    roofTrim(b, cx, cz, w, d, h - 0.4, roofC);
    return b;
}
// Hospital tower: white slab, green cross, helipad, rows of windows.
function hospitalTower(rng) {
    const b = new B();
    const cx = 0, cz = 0, w = 32, d = 20, h = 45;
    const wall = [0.88, 0.90, 0.92], trim = [0.40, 0.62, 0.52], win = [0.34, 0.46, 0.58], roofC = [0.70, 0.74, 0.78];
    b.box(cx, h / 2, cz, w, h, d, wall[0], wall[1], wall[2]);
    winAll(b, cx, cz, w, d, 3, h - 2, win, [0.70, 0.72, 0.74]);
    // Helipad deck (offset toward east).
    b.box(cx + w * 0.15, h + 0.35, cz, w * 0.45, 0.5, d * 0.55, roofC[0], roofC[1], roofC[2]);
    b.box(cx + w * 0.15, h + 0.65, cz, w * 0.30, 0.15, 0.5, [0.90, 0.90, 0.94]);
    // Green cross sign on the roof (west side, zero conflict with helipad).
    b.box(cx - w * 0.25, h + 1.2, cz, 2.0, 2.0, 0.4, trim[0], trim[1], trim[2]);
    b.box(cx - w * 0.25, h + 1.2, cz + d / 2 + 0.3, 2.0, 2.0, 0.3, trim[0], trim[1], trim[2]);
    // Entrance canopy + ambulance lane.
    b.box(cx, 4.0, -(d / 2 + 2), 8, 0.5, 4, trim[0], trim[1], trim[2]);
    return b;
}
// Multistorey car park: open concrete deck with ramps, glazed stair core.
function carparkMultistory(rng) {
    const b = new B();
    const cx = 0, cz = 0, w = 30, d = 22, floors = 5, fh = 3.0, h = floors * fh;
    const conc = [0.66, 0.66, 0.62], slab = [0.60, 0.60, 0.58], dark = [0.30, 0.30, 0.30], edge = [0.72, 0.72, 0.70];
    // Butress columns at the corners.
    for (const dx of [-w / 2, w / 2]) for (const dz of [-d / 2, d / 2]) column(b, cx + dx, cz + dz, 0.42, h, conc);
    // Perimeter columns.
    for (const dx of [-w / 3, 0, w / 3]) for (const dz of [-d / 2, d / 2]) column(b, cx + dx, cz + dz, 0.4, h, conc);
    // Floor slabs with low parapet walls + openings.
    for (let f = 0; f < floors; f++) {
        const y = f * fh + fh / 2, ys = f * fh;
        b.box(cx, ys + 0.18, cz, w, 0.36, d, slab[0], slab[1], slab[2]);
        // Parapet (front/back).
        b.box(cx, ys + 0.6, cz + d / 2, w, 0.9, 0.2, edge[0], edge[1], edge[2]);
        b.box(cx, ys + 0.6, cz - d / 2, w, 0.9, 0.2, edge[0], edge[1], edge[2]);
        // Side railings (lower, to read as open).
        b.box(cx + w / 2, ys + 0.5, cz, 0.2, 0.8, d, edge[0], edge[1], edge[2]);
        b.box(cx - w / 2, ys + 0.5, cz, 0.2, 0.8, d, edge[0], edge[1], edge[2]);
    }
    // Glazed stair + elevator core at one corner.
    const sx = cx + w / 2 - 2.6, sz = cz - d / 2 + 2.6;
    b.box(sx, h / 2, sz, 5, h, 4.4, conc[0], conc[1], conc[2]);
    winGrid(b, 'e', 4.4, 0, h - 1.5, sx, sz, 2.62, 2, [0.32, 0.44, 0.54], dark, floors);
    winGrid(b, 's', 5, 0, h - 1.5, sx, sz, 2.32, 2, [0.32, 0.44, 0.54], dark, floors);
    // Ramp strip along one side.
    b.box(cx - w / 2 - 0.6, h / 2, cz, 1.4, h, d, conc[0], conc[1], conc[2]);
    return b;
}
// Single-storey parking garage: low slab roof, cols, open bays, entrance ramp.
function carparkGarage(rng) {
    const b = new B();
    const cx = 0, cz = 0, w = 30, d = 24, h = 7;
    const conc = [0.66, 0.66, 0.62], edge = [0.72, 0.72, 0.70], dark = [0.30, 0.30, 0.30];
    b.box(cx, h / 2, cz, w, h, d, conc[0], conc[1], conc[2]);
    // Big open bays: dark recesses along both long faces.
    for (const dz of [d / 2 + 0.02, -(d / 2 + 0.02)]) {
        for (let i = 0; i < 5; i++) {
            const bx = cx - 12 + i * 6;
            b.box(bx, h / 2 - 0.4, dz, 4.6, h - 1.4, 0.2, dark[0], dark[1], dark[2]);
        }
    }
    // Roof slab + edge.
    b.box(cx, h + 0.2, cz, w + 0.4, 0.4, d + 0.4, edge[0], edge[1], edge[2]);
    // Interior columns visible through bays.
    for (const dx of [-9, 0, 9]) for (const dz of [-6, 6]) column(b, cx + dx, cz + dz, 0.35, h - 0.5, conc);
    // Entrance/exit ramp on the short side.
    b.box(cx + w / 2 + 2.0, 1.0, cz, 5, 0.4, 6, edge[0], edge[1], edge[2]);
    b.box(cx + w / 2 + 2.0, 0.6, cz, 5, 0.4, 3.4, edge[0], edge[1], edge[2]);
    return b;
}

// Civic library: stone block, tall reading-room windows, cornice, columned entry.
function libraryCivic(rng) {
    const b = new B();
    const cx = 0, cz = 0, w = 30, d = 22, h = 16, spine = 10;
    const stone = [0.74, 0.70, 0.62], trim = [0.56, 0.52, 0.46], win = [0.24, 0.34, 0.46], dark = [0.28, 0.24, 0.20];
    b.box(cx, h / 2, cz, w, h, d, stone[0], stone[1], stone[2]);
    b.box(cx, 2.2, cz, w, 4.4, d, trim[0], trim[1], trim[2]);
    // Tall arched reading-room windows (approximated with tall boxes + header).
    for (let i = 0; i < 6; i++) {
        const wx = cx - 10.5 + i * 4.2;
        for (const zz of [d / 2 + 0.02, -(d / 2 + 0.02)]) {
            b.box(wx, 7, zz, 1.8, 5.2, 0.2, win[0], win[1], win[2]);
            b.box(wx, 3.4, zz, 2.1, 0.8, 0.24, dark[0], dark[1], dark[2]);
            b.box(wx, 10, zz, 2.1, 1.0, 0.24, trim[0], trim[1], trim[2]);
        }
    }
    // Columned portico entry.
    const pz = -(d / 2 + 1.6);
    for (let i = 0; i < 4; i++) column(b, cx - 5 + i * 3.4, pz, 0.42, 6.5, stone);
    steps(b, cx, pz - 1.6, 1.2, 10, 3, trim);
    b.box(cx, 6.8, pz, 8, 1.0, 1.6, stone[0], stone[1], stone[2]);
    roofTrim(b, cx, cz, w, d, h - 0.4, trim);
    // Roof lantern.
    b.box(cx, h + 1.6, cz, 6, 2.4, 5, trim[0], trim[1], trim[2]);
    b.box(cx, h + 3.6, cz, 6.4, 0.4, 5.4, stone[0], stone[1], stone[2]);
    return b;
}
// Cinema/theatre: big marquee, red brick, stepped massing, rooftop sign.
function theaterCinema(rng) {
    const b = new B();
    const cx = 0, cz = 0, w = 26, d = 20, h = 18;
    const wall = [0.54, 0.28, 0.24], trim = [0.30, 0.20, 0.18], win = [0.24, 0.32, 0.44], gold = [0.80, 0.66, 0.28], roofC = [0.40, 0.32, 0.28];
    b.box(cx, h / 2, cz, w, h, d, wall[0], wall[1], wall[2]);
    // Recessed upper auditorium block.
    b.box(cx, h + 2.5, cz, w * 0.7, 5, d * 0.7, wall[0], wall[1], wall[2]);
    winGrid(b, 's', w, 6, h - 2, cx, cz, d / 2 + 0.02, 6, win, trim);
    // Grand marquee band across the front (-z).
    const mz = -(d / 2 + 0.4);
    b.box(cx, 4.5, mz, w * 0.85, 2.2, 1.2, gold[0], gold[1], gold[2]);
    b.box(cx, 4.5, mz - 0.6, w * 0.85, 2.2, 0.4, trim[0], trim[1], trim[2]);
    // Glowing entrance (doors + ticket).
    for (let i = 0; i < 3; i++) b.box(cx - 5 + i * 5, 1.6, mz - 0.7, 2.6, 3.2, 0.3, [0.92, 0.80, 0.40]);
    // Vertical rooftop blade sign (read as "THEATRE" band).
    b.box(cx, h + 4.0, cz - d * 0.4, 3.0, 7, 0.4, gold[0], gold[1], gold[2]);
    b.box(cx, h + 4.0, cz - d * 0.4, 2.2, 6.2, 0.6, trim[0], trim[1], trim[2]);
    roofTrim(b, cx, cz, w, d, h - 0.4, roofC);
    return b;
}
// Hotel tower: setback tiers, balcony ledges, rooftop crown sign.
function hotelTower(rng) {
    const b = new B();
    const cx = 0, cz = 0, w = 24, d = 22, h = 42;
    const wall = [0.66, 0.62, 0.56], trim = [0.50, 0.46, 0.42], win = [0.28, 0.38, 0.50], roofC = [0.56, 0.52, 0.48], sign = [0.82, 0.66, 0.24];
    b.box(cx, h / 2, cz, w, h, d, wall[0], wall[1], wall[2]);
    winAll(b, cx, cz, w, d, 0.2, h - 2, win, trim);
    // Balcony ledges (window sills) to break the slab.
    for (let y = 4; y < h - 2; y += 3.6) {
        b.box(cx, y, cz + d / 2 + 0.12, w, 0.2, 0.5, trim[0], trim[1], trim[2]);
        b.box(cx, y, cz - d / 2 - 0.12, w, 0.2, 0.5, trim[0], trim[1], trim[2]);
    }
    // Setback tiers.
    b.box(cx, h - 2, cz, w * 0.75, 4, d * 0.75, wall[0], wall[1], wall[2]);
    b.box(cx, h + 3, cz, w * 0.5, 6, d * 0.5, wall[0], wall[1], wall[2]);
    // Rooftop crown + sign.
    b.box(cx, h + 6.6, cz, w * 0.3, 1.8, d * 0.3, trim[0], trim[1], trim[2]);
    b.box(cx, h + 6.6, cz + d * 0.28 + 0.2, w * 0.3, 1.8, 0.4, sign[0], sign[1], sign[2]);
    roofTrim(b, cx, cz, w, d, h - 0.4, roofC);
    // Entrance canopy.
    b.box(cx, 3.8, -(d / 2 + 1.4), 8, 0.5, 3, sign[0], sign[1], sign[2]);
    return b;
}
// Department store: big display windows, flag/grid of awnings, rooftop parapet.
function departmentStore(rng) {
    const b = new B();
    const cx = 0, cz = 0, w = 32, d = 24, h = 16;
    const wall = [0.62, 0.56, 0.50], trim = [0.44, 0.40, 0.36], win = [0.30, 0.42, 0.54], roofC = [0.50, 0.46, 0.42], awn = [0.64, 0.30, 0.24];
    b.box(cx, h / 2, cz, w, h, d, wall[0], wall[1], wall[2]);
    // Rows of large display windows.
    for (let f = 0; f < 3; f++) {
        const y = 3 + f * 4.4;
        for (let i = 0; i < 5; i++) {
            const wx = cx - 12 + i * 6;
            for (const zz of [d / 2 + 0.02, -(d / 2 + 0.02)]) {
                b.box(wx, y, zz, 4.2, 3.0, 0.2, win[0], win[1], win[2]);
                // Angled awning.
                b.box(wx, y + 1.8, zz + (zz > 0 ? 0.4 : -0.4), 4.6, 0.2, 0.9, awn[0], awn[1], awn[2]);
            }
        }
    }
    // Ground display + entrance.
    b.box(cx, 2, cz + d / 2 + 0.02, w * 0.7, 3.6, 0.3, win[0], win[1], win[2]);
    for (let i = 0; i < 4; i++) b.box(cx - 6 + i * 4, 1.6, cz + d / 2 + 0.3, 1.6, 3.2, 0.3, [0.88, 0.86, 0.82]);
    roofTrim(b, cx, cz, w, d, h - 0.4, roofC);
    return b;
}
// Public school: brick block, clock tower, rows of classroom windows, yard.
function schoolPublic(rng) {
    const b = new B();
    const cx = 0, cz = 0, w = 36, d = 20, h = 14;
    const wall = [0.58, 0.40, 0.30], trim = [0.36, 0.26, 0.20], win = [0.30, 0.40, 0.52], roofC = [0.46, 0.38, 0.32];
    b.box(cx, h / 2, cz, w, h, d, wall[0], wall[1], wall[2]);
    // Two storeys of classroom windows.
    winGrid(b, 'n', w, 4, h - 1.5, cx, cz, d / 2 + 0.02, 10, win, trim);
    winGrid(b, 's', w, 4, h - 1.5, cx, cz, d / 2 + 0.02, 10, win, trim);
    // Central clock tower with tiered cap.
    b.box(cx, h + 4, cz + d * 0.2, 6, 8, 6, wall[0], wall[1], wall[2]);
    for (let i = 0; i < 4; i++) {
        const ang = i * Math.PI / 2;
        b.box(cx + Math.cos(ang) * 3.2, h + 5, cz + d * 0.2 + Math.sin(ang) * 3.2, 0.3, 2.2, 0.1, [0.15, 0.14, 0.14]);
    }
    b.cyl(cx, h + 9, cz + d * 0.2, 2.4, 0.5, 2.0, 4, trim[0], trim[1], trim[2]);
    // Entrance portico + flag pole.
    b.box(cx, 3, -(d / 2 + 1.8), 8, 3, 2.4, trim[0], trim[1], trim[2]);
    b.cyl(cx + w * 0.35, 4, -(d / 2 + 2), 0.1, 0.03, 8, 6, 0.5, 0.5, 0.52);
    roofTrim(b, cx, cz, w, d, h - 0.4, roofC);
    return b;
}
// University hall: grand stone building, twin wings, cupola, gables.
function universityHall(rng) {
    const b = new B();
    const cx = 0, cz = 0, w = 40, d = 24, h = 16;
    const stone = [0.76, 0.72, 0.64], trim = [0.58, 0.54, 0.48], win = [0.22, 0.32, 0.44], roofC = [0.50, 0.46, 0.42];
    b.box(cx, h / 2, cz, w, h, d, stone[0], stone[1], stone[2]);
    // Twin end wings (gabled).
    b.gable(cx - w * 0.34, h, h + 4.5, w * 0.22, -d / 2, d / 2, trim[0], trim[1], trim[2]);
    b.gable(cx + w * 0.34, h, h + 4.5, w * 0.22, -d / 2, d / 2, trim[0], trim[1], trim[2]);
    winGrid(b, 's', w, 5, h - 3, cx, cz, d / 2 + 0.02, 11, win, trim);
    winGrid(b, 'n', w, 5, h - 3, cx, cz, d / 2 + 0.02, 11, win, trim);
    // Entry colonnade + pediment.
    const pz = -(d / 2 + 2);
    for (let i = 0; i < 6; i++) column(b, cx - 9 + i * 3.6, pz, 0.4, 7, stone);
    steps(b, cx, pz - 1.8, 1.2, 14, 3.5, trim);
    b.box(cx, 7.2, pz, 10, 0.9, 1.6, stone[0], stone[1], stone[2]);
    b.quad([cx - 5.2, 7.6, pz], [cx + 5.2, 7.6, pz], [cx, 9.6, pz], [cx, 7.6, pz - 0.2], 0, 0.4, 0.9, stone[0], stone[1], stone[2]);
    // Central cupola.
    b.cyl(cx, h + 2, cz, 3.6, 3.6, 3, 10, trim[0], trim[1], trim[2]);
    b.cyl(cx, h + 5, cz, 3.6, 0.6, 3.4, 10, stone[0], stone[1], stone[2]);
    b.cyl(cx, h + 8.4, cz, 0.14, 0.05, 3, 6, roofC[0], roofC[1], roofC[2]);
    roofTrim(b, cx, cz, w, d, h - 0.4, roofC);
    return b;
}

// Factory / industrial plant: sawtooth roof, brick walls, hopper, stacks, yard.
function factoryPlant(rng) {
    const b = new B();
    const cx = 0, cz = 0, w = 40, d = 24, h = 12;
    const wall = [0.56, 0.40, 0.32], trim = [0.38, 0.30, 0.26], roofC = [0.44, 0.40, 0.36], win = [0.30, 0.36, 0.44];
    b.box(cx, h / 2, cz, w, h, d, wall[0], wall[1], wall[2]);
    // Sawtooth roof: a row of angled roof planes.
    for (let i = 0; i < 4; i++) {
        const sx = cx - w / 2 + 5 + i * (w - 10) / 3.0;
        b.gable(sx, h, h + 2.6, (w - 10) / 6.0, -d / 2, d / 2, roofC[0], roofC[1], roofC[2]);
    }
    winGrid(b, 'n', w, 6, h - 2, cx, cz, d / 2 + 0.02, 11, win, trim);
    winGrid(b, 's', w, 6, h - 2, cx, cz, d / 2 + 0.02, 11, win, trim);
    // Big loading doors.
    for (let i = 0; i < 3; i++) b.box(cx - 11 + i * 11, 2.6, -(d / 2 + 0.05), 5, 5.2, 0.3, trim[0], trim[1], trim[2]);
    // Hopper + two chimney stacks.
    b.box(cx + w * 0.3, h + 1.5, cz, 6, 3, 6, trim[0], trim[1], trim[2]);
    b.cyl(cx - w * 0.32, 0, cz + d * 0.2, 1.1, 1.0, h + 10, 8, [0.34, 0.30, 0.26]);
    b.cyl(cx - w * 0.2, 0, cz - d * 0.2, 0.7, 0.65, h + 6, 8, [0.40, 0.36, 0.32]);
    return b;
}
// Transit station / rail terminal: long canopy, clock, grand facade, platforms.
function transitStation(rng) {
    const b = new B();
    const cx = 0, cz = 0, w = 34, d = 20, h = 17;
    const stone = [0.72, 0.70, 0.66], trim = [0.50, 0.48, 0.44], win = [0.30, 0.40, 0.52], roofC = [0.46, 0.46, 0.44], sign = [0.82, 0.64, 0.20];
    b.box(cx, h / 2, cz, w, h, d, stone[0], stone[1], stone[2]);
    b.box(cx, 2.4, cz, w, 4.8, d, trim[0], trim[1], trim[2]);
    // Grand arched windows band.
    for (let i = 0; i < 7; i++) {
        const wx = cx - 13 + i * 4.4;
        for (const zz of [d / 2 + 0.02, -(d / 2 + 0.02)]) {
            b.box(wx, 7, zz, 1.8, 5, 0.2, win[0], win[1], win[2]);
            b.box(wx, 3.6, zz, 2.1, 0.8, 0.24, trim[0], trim[1], trim[2]);
        }
    }
    // Long entrance canopy along the front + columns.
    const czp = -(d / 2 + 3.4);
    for (let i = 0; i < 8; i++) column(b, cx - 14 + i * 4, czp, 0.38, 6, trim);
    b.box(cx, 6.2, czp, w + 1.5, 0.6, 2.4, roofC[0], roofC[1], roofC[2]);
    // Central clock tower.
    b.box(cx, h + 4, cz + d * 0.25, 5, 8, 5, stone[0], stone[1], stone[2]);
    for (let i = 0; i < 4; i++) {
        const ang = i * Math.PI / 2;
        b.box(cx + Math.cos(ang) * 2.7, h + 4.5, cz + d * 0.25 + Math.sin(ang) * 2.7, 0.3, 2, 0.1, [0.16, 0.15, 0.14]);
    }
    b.cyl(cx, h + 8.4, cz + d * 0.25, 1.9, 0.4, 1.8, 4, trim[0], trim[1], trim[2]);
    // Rooftop sign band.
    b.box(cx, h + 1.4, cz, w * 0.5, 2, 0.3, sign[0], sign[1], sign[2]);
    return b;
}
// Data center: low slab, security perimeter, cooling units, warning bands.
function dataCenter(rng) {
    const b = new B();
    const cx = 0, cz = 0, w = 36, d = 20, h = 9;
    const wall = [0.42, 0.44, 0.50], trim = [0.30, 0.32, 0.38], win = [0.22, 0.30, 0.42], roofC = [0.48, 0.50, 0.54];
    b.box(cx, h / 2, cz, w, h, d, wall[0], wall[1], wall[2]);
    // Rows of louvers / chillers on the facade.
    for (let i = 0; i < 6; i++) {
        const wx = cx - 14 + i * 5.6;
        for (const zz of [d / 2 + 0.02, -(d / 2 + 0.02)]) {
            b.box(wx, 5, zz, 4, 3.4, 0.2, win[0], win[1], win[2]);
            b.box(wx, 3.4, zz, 4.3, 0.4, 0.24, trim[0], trim[1], trim[2]);
        }
    }
    // Rooftop cooling units.
    for (let i = 0; i < 4; i++) b.box(cx - 12 + i * 8, h + 0.7, cz, 4, 1.4, 4, roofC[0], roofC[1], roofC[2]);
    // Security band + entrance.
    b.box(cx, 4, cz + d / 2 + 0.05, w * 0.8, 0.6, 0.3, [0.20, 0.24, 0.30]);
    b.box(cx, 2.6, -(d / 2 + 0.05), 4, 4, 0.3, trim[0], trim[1], trim[2]);
    roofTrim(b, cx, cz, w, d, h - 0.4, roofC);
    return b;
}
// Modern logistics warehouse: clean slab, ribbon glazing, loading docks.
function warehouseModern(rng) {
    const b = new B();
    const cx = 0, cz = 0, w = 38, d = 22, h = 13;
    const wall = [0.64, 0.66, 0.68], trim = [0.48, 0.50, 0.52], win = [0.32, 0.42, 0.52], roofC = [0.56, 0.58, 0.60], door = [0.52, 0.54, 0.58];
    b.box(cx, h / 2, cz, w, h, d, wall[0], wall[1], wall[2]);
    // Ribbon glazing strip along the top.
    winGrid(b, 'n', w, 6, h - 1.5, cx, cz, d / 2 + 0.02, 11, win, trim);
    winGrid(b, 's', w, 6, h - 1.5, cx, cz, d / 2 + 0.02, 11, win, trim);
    // Loading docks at the front with a canopy.
    const bz = -(d / 2 + 0.05);
    for (let i = 0; i < 4; i++) b.box(cx - 13 + i * 9, 2.6, bz, 5.5, 5.2, 0.3, door[0], door[1], door[2]);
    b.box(cx, 4.6, -(d / 2 + 1.6), w * 0.82, 0.5, 3.2, roofC[0], roofC[1], roofC[2]);
    roofTrim(b, cx, cz, w, d, h - 0.4, roofC);
    return b;
}

// ===========================================================================
// HOUSE MODELS
// ===========================================================================
// Common: a house is body + gable/hip roof + door + windows + porch/foundation.
function houseBody(b, w, d, h, wall, trim) {
    b.box(0, h / 2, 0, w, h, d, wall[0], wall[1], wall[2]);
    b.box(0, h, 0, w + 0.34, 0.5, d + 0.34, trim[0], trim[1], trim[2]);
    b.box(0, 0.18, 0, w + 0.2, 0.36, d + 0.2, trim[0], trim[1], trim[2]);
}
function houseGable(b, w, d, h, peak, trim) {
    b.gable(0, h, h + peak, w / 2, -d / 2, d / 2, trim[0], trim[1], trim[2]);
}
function frontDoor(b, w, d, trim) {
    b.box(0, 1.15, -(d / 2 + 0.03), 1.1, 2.3, 0.2, trim[0], trim[1], trim[2]);
    b.box(0, 2.5, -(d / 2 + 0.03), 1.5, 0.28, 0.3, [0.88, 0.86, 0.82]);
}
function houseWin(b, w, d, y, cols, glass, frame) {
    for (let i = 0; i < cols; i++) {
        const wx = (i - (cols - 1) / 2) * (w / cols * 0.8);
        for (const s of [1, -1]) {
            b.box(wx, y, (d / 2 + 0.02) * s, 1.0, 1.4, 0.16, glass[0], glass[1], glass[2]);
            b.box(wx, y - 0.9, (d / 2 + 0.02) * s, 1.2, 0.16, 0.2, frame[0], frame[1], frame[2]);
        }
    }
}
function chimney(b, x, z, h, col) {
    b.box(x, h + 1.2, z, 1.0, 3.2, 1.0, col[0], col[1], col[2]);
    b.box(x, h + 2.9, z, 1.3, 0.3, 1.3, col[0], col[1], col[2]);
}
// Modern bungalow: low gable, wide porch, oversized windows, dark roof.
function bungalowModern(rng) {
    const b = new B();
    const w = 14, d = 10, h = 3.4;
    const wall = [0.70, 0.74, 0.76], trim = [0.30, 0.32, 0.34], glass = [0.36, 0.46, 0.56], frame = [0.22, 0.24, 0.26];
    houseBody(b, w, d, h, wall, trim);
    houseGable(b, w, d, h, 2.6, trim);
    houseWin(b, w, d, 2.0, 4, glass, frame);
    frontDoor(b, w, d, frame);
    chimney(b, -w * 0.3, d * 0.25, h, frame);
    // Wide low porch with posts.
    for (const x of [-w * 0.3, 0, w * 0.3]) b.box(x, 1.2, -(d / 2 + 1.0), 0.4, 2.4, 0.4, trim[0], trim[1], trim[2]);
    b.box(0, 2.4, -(d / 2 + 1.0), w * 0.8, 0.4, 2.2, [0.28, 0.30, 0.32]);
    return b;
}
// Split-level ranch: long low block, stepped roof planes, garage wing.
function splitLevelRanch(rng) {
    const b = new B();
    const w = 18, d = 11, h = 3.2, h2 = 4.4;
    const wall = [0.64, 0.56, 0.48], trim = [0.46, 0.40, 0.34], glass = [0.30, 0.40, 0.52], frame = [0.40, 0.36, 0.32];
    // Main low block + taller upper block (split level).
    b.box(0, h / 2, 0, w, h, d, wall[0], wall[1], wall[2]);
    b.box(w * 0.18, h2 / 2 + h / 2, 0, w * 0.6, h2, d * 0.85, wall[0], wall[1], wall[2]);
    houseGable(b, w, d, h, 2.0, trim);
    b.gable(w * 0.18, h + h2 / 2, h + h2 / 2 + 2.2, w * 0.3, -d * 0.42, d * 0.42, trim[0], trim[1], trim[2]);
    houseWin(b, w * 0.75, d * 0.85, h + 2.0, 3, glass, frame);
    houseWin(b, w, d, 1.8, 4, glass, frame);
    frontDoor(b, w, d, frame);
    // Garage wing.
    b.box(-w * 0.42, 1.6, 0, 5, 3.2, d * 0.9, wall[0], wall[1], wall[2]);
    b.box(-w * 0.42, 1.4, -(d * 0.45 + 0.03), 3.4, 2.8, 0.2, frame[0], frame[1], frame[2]);
    return b;
}

// Colonial white: symmetrical two-storey, pedimented front, columns.
function colonialWhite(rng) {
    const b = new B();
    const w = 14, d = 11, h = 6;
    const wall = [0.90, 0.90, 0.88], trim = [0.82, 0.82, 0.80], glass = [0.26, 0.36, 0.48], frame = [0.36, 0.34, 0.32], accent = [0.30, 0.30, 0.32];
    houseBody(b, w, d, h, wall, trim);
    houseGable(b, w, d, h, 3.0, accent);
    houseWin(b, w, d, 4.4, 4, glass, frame);
    houseWin(b, w, d, 1.8, 4, glass, frame);
    frontDoor(b, w, d, accent);
    chimney(b, w * 0.36, d * 0.2, h, accent);
    // Pedimented entry portico + columns.
    for (const x of [-1.6, 1.6]) b.box(x, 2.0, -(d / 2 + 0.8), 0.35, 4.0, 0.35, wall[0], wall[1], wall[2]);
    b.box(0, 4.0, -(d / 2 + 0.8), 4.4, 0.5, 1.6, trim[0], trim[1], trim[2]);
    b.gable(0, 4.0, 5.2, 2.2, -(d / 2 + 1.6), -(d / 2 + 0.0), accent[0], accent[1], accent[2]);
    return b;
}
// Tudor cottage: steep asymmetric gable, half-timber trim, brick accents.
function tudorCottage(rng) {
    const b = new B();
    const w = 13, d = 10, h = 3.6;
    const wall = [0.78, 0.72, 0.62], trim = [0.24, 0.20, 0.18], glass = [0.30, 0.40, 0.50], frame = [0.20, 0.17, 0.15], brick = [0.52, 0.34, 0.26];
    houseBody(b, w, d, h, wall, trim);
    houseGable(b, w * 0.8, d, h, 3.0, trim);
    // Steep main gable + cross gable.
    b.gable(w * 0.22, h, h + 3.4, w * 0.42, -d / 2, d / 2, trim[0], trim[1], trim[2]);
    // Half-timber bands on the front.
    for (let i = 0; i < 5; i++) b.box(-4 + i * 2.2, 2.4, -(d / 2 + 0.03), 0.22, 2.2, 0.16, frame[0], frame[1], frame[2]);
    b.box(0, 3.2, -(d / 2 + 0.03), w * 0.85, 0.22, 0.16, frame[0], frame[1], frame[2]);
    houseWin(b, w, d, 2.0, 3, glass, frame);
    frontDoor(b, w, d, frame);
    // Brick chimney stack.
    chimney(b, -w * 0.34, 0, h, brick);
    return b;
}
// Brick townhouse (2-storey brownstone variant): flat front, cornice, stoop.
function brickTownhouse2(rng) {
    const b = new B();
    const w = 10, d = 13, h = 7;
    const wall = [0.48, 0.34, 0.30], trim = [0.34, 0.24, 0.20], glass = [0.30, 0.40, 0.52], frame = [0.24, 0.22, 0.20];
    houseBody(b, w, d, h, wall, trim);
    // Flat parapet + cornice.
    b.box(0, h + 0.4, 0, w + 0.5, 0.8, d + 0.5, trim[0], trim[1], trim[2]);
    // Basement + two upper storey windows.
    houseWin(b, w, d, 5.2, 2, glass, frame);
    houseWin(b, w, d, 2.4, 2, glass, frame);
    // Stoops + tall door.
    steps(b, 0, -(d / 2 + 1.0), 1.1, 3.5, 2.2, trim);
    b.box(0, 2.6, -(d / 2 + 0.03), 1.3, 3.0, 0.2, frame[0], frame[1], frame[2]);
    return b;
}
// Cape Cod: compact one-and-a-half storey, steep roof, dormer windows.
function capeCod(rng) {
    const b = new B();
    const w = 12, d = 10, h = 3.0;
    const wall = [0.86, 0.86, 0.84], trim = [0.76, 0.76, 0.74], glass = [0.28, 0.38, 0.50], frame = [0.36, 0.34, 0.32];
    houseBody(b, w, d, h, wall, trim);
    houseGable(b, w, d, h, 3.6, trim);
    // Two dormers on the roof.
    for (const x of [-2.4, 2.4]) {
        b.box(x, h + 1.6, -(d / 2 * 0.5), 2.2, 1.8, 2.0, wall[0], wall[1], wall[2]);
        b.gable(x, h + 1.6, h + 2.4, 1.1, -(d / 2 * 0.5) - 1.0, -(d / 2 * 0.5) + 1.0, trim[0], trim[1], trim[2]);
        b.box(x, h + 1.6, -(d / 2 * 0.5) - 1.02, 0.9, 0.8, 0.16, glass[0], glass[1], glass[2]);
    }
    houseWin(b, w, d, 1.9, 3, glass, frame);
    frontDoor(b, w, d, frame);
    chimney(b, w * 0.3, 0, h, frame);
    return b;
}

// Beach cottage: raised on posts, wrap porch, slatted entry stair.
function cottageBeach(rng) {
    const b = new B();
    const w = 13, d = 11, h = 3.2;
    const wall = [0.74, 0.78, 0.80], trim = [0.34, 0.38, 0.42], glass = [0.32, 0.44, 0.54], frame = [0.40, 0.42, 0.44];
    // Posts + raised floor.
    for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) b.box(x, 0.6, z, 0.4, 1.2, 0.4, trim[0], trim[1], trim[2]);
    b.box(0, 1.2, 0, w, 0.4, d, trim[0], trim[1], trim[2]);
    b.box(0, 1.4 + h / 2, 0, w, h, d, wall[0], wall[1], wall[2]);
    houseGable(b, w, d, 1.4 + h, 2.4, trim);
    houseWin(b, w, d, 1.4 + 2.0, 3, glass, frame);
    frontDoor(b, w, d, frame);
    // Wrap porch.
    b.box(0, 1.5, -(d / 2 + 0.9), w + 1, 0.3, 1.8, trim[0], trim[1], trim[2]);
    for (const x of [-w / 2, 0, w / 2]) b.box(x, 2.2, -(d / 2 + 0.9), 0.3, 1.6, 0.3, frame[0], frame[1], frame[2]);
    // Slatted entry stair.
    for (let i = 0; i < 3; i++) b.box(0, 0.25 + i * 0.35, -(d / 2 + 1.8 - i * 0.3), 2.6, 0.3, 0.5, frame[0], frame[1], frame[2]);
    return b;
}
// Modern glass box: flat roof, full glazing, steel frame, minimal detail.
function modernBox(rng) {
    const b = new B();
    const w = 15, d = 11, h = 4.6;
    const wall = [0.32, 0.34, 0.38], glass = [0.34, 0.46, 0.58], frame = [0.22, 0.24, 0.26], roofC = [0.30, 0.32, 0.36];
    b.box(0, h / 2, 0, w, h, d, wall[0], wall[1], wall[2]);
    // Full-height glazing on the front.
    for (let i = 0; i < 5; i++) b.box(-5.5 + i * 2.75, h / 2, -(d / 2 + 0.03), 2.4, h - 1.2, 0.2, glass[0], glass[1], glass[2]);
    for (let i = 0; i < 4; i++) b.box(-4 + i * 2.7, h / 2, d / 2 + 0.03, 2.3, h - 1.4, 0.16, glass[0], glass[1], glass[2]);
    // Flat roof slab + parapet + thin mullions.
    b.box(0, h + 0.2, 0, w + 0.4, 0.4, d + 0.4, roofC[0], roofC[1], roofC[2]);
    for (let i = 0; i < 6; i++) b.box(-6 + i * 2.4, h / 2, -(d / 2 + 0.05), 0.18, h - 0.8, 0.26, frame[0], frame[1], frame[2]);
    // Recessed entrance + base slab.
    b.box(0, 1.2, -(d / 2 + 0.03), 2.6, 2.4, 0.2, frame[0], frame[1], frame[2]);
    b.box(0, 0.15, 0, w + 0.3, 0.3, d + 0.3, roofC[0], roofC[1], roofC[2]);
    return b;
}

// ===========================================================================
// REGISTRY + MAIN
// ===========================================================================
const BUILDING_MODELS = {
    office_glass_spire: officeGlassSpire,
    office_corporate_block: officeCorporateBlock,
    gov_cityhall: govCityHall,
    gov_courthouse: govCourthouse,
    bank_capital: bankCapital,
    police_precinct: policePrecinct,
    fire_station: fireStation,
    hospital_tower: hospitalTower,
    carpark_multistory: carparkMultistory,
    carpark_garage: carparkGarage,
    library_civic: libraryCivic,
    theater_cinema: theaterCinema,
    hotel_tower: hotelTower,
    department_store: departmentStore,
    school_public: schoolPublic,
    university_hall: universityHall,
    factory_plant: factoryPlant,
    transit_station: transitStation,
    data_center: dataCenter,
    warehouse_modern: warehouseModern,
};
const HOUSE_MODELS = {
    bungalow_modern: bungalowModern,
    split_level_ranch: splitLevelRanch,
    colonial_white: colonialWhite,
    tudor_cottage: tudorCottage,
    brick_townhouse_2: brickTownhouse2,
    cape_cod: capeCod,
    cottage_beach: cottageBeach,
    modern_box: modernBox,
};

function run(name, fn, dir) {
    const rng = mulberry32(name.length * 9301 + 49297);
    const b = fn(rng);
    const file = path.join(dir, name + '.glb');
    const info = writeGlb(b, file, name);
    return { name, file, ...info };
}

function main() {
    const rows = [];
    for (const [name, fn] of Object.entries(BUILDING_MODELS)) rows.push(run(name, fn, OUT_BUILDINGS));
    for (const [name, fn] of Object.entries(HOUSE_MODELS)) rows.push(run(name, fn, OUT_HOUSES));
    let tris = 0, verts = 0;
    for (const r of rows) { tris += r.tris; verts += r.verts; }
    console.log(`gen_city_glb: wrote ${rows.length} models (${verts} verts, ${tris} tris)`);
    for (const r of rows) {
        console.log(`  ${r.name.padEnd(26)} ${String(r.tris).padStart(6)} tris  ${r.w.toFixed(1)}x${r.d.toFixed(1)}x${r.h.toFixed(1)}m  ${path.basename(r.file)}`);
    }
    return rows;
}

main();
