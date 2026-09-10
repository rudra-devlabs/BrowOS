/**
 * Brow City 3D Procedural Vehicle Generator Engine & Model Blueprints
 * Shared core for build pipelines (Node.js) and real-time live showcase viewer.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    const exports = factory();
    root.VehicleGenerator = exports;
    Object.assign(root, exports);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

const C = {
  paint:    [1, 1, 1],              // tinted by the game per instance
  glass:    [0.08, 0.14, 0.20],     // tinted dark glass
  glassLit: [0.15, 0.25, 0.32],     // lit windshield
  rubber:   [0.03, 0.032, 0.038],   // tire tread & sidewall
  black:    [0.04, 0.045, 0.05],    // contrast black roof, diffuser, grill backing
  shadow:   [0.035, 0.038, 0.045],  // seam crevices, panel cutouts, door split lines
  charcoal: [0.14, 0.15, 0.17],     // lower rocker cladding, bumpers
  trim:     [0.22, 0.23, 0.25],     // door frames, rub rails
  metal:    [0.45, 0.48, 0.52],     // mechanical steel, chassis
  chrome:   [0.78, 0.80, 0.83],     // chrome rims, bumpers, exhaust tips
  steel:    [0.35, 0.38, 0.42],     // truck compactor / freight
  plate:    [0.86, 0.87, 0.88],     // license plate white
  head:     [1.0, 0.98, 0.80],      // headlight lens (glow detected)
  tail:     [0.95, 0.03, 0.03],     // taillight lens (glow detected)
  amber:    [1.0, 0.46, 0.02],      // turn indicators & route display
  yellow:   [1.0, 0.76, 0.02],      // school bus, towtruck, taxi sign
  taxi:     [1.0, 0.78, 0.03],      // NYC taxi body yellow
  red:      [0.76, 0.08, 0.06],     // ambulance stripe, sport grille, engine heads
  fireRed:  [0.82, 0.08, 0.06],     // firetruck red
  blue:     [0.06, 0.20, 0.68],     // transit bus blue, police strobe
  navy:     [0.04, 0.07, 0.18],     // police navy blue
  green:    [0.08, 0.36, 0.16],     // garbage truck green
  cream:    [0.90, 0.86, 0.74],     // beige / off-white
  white2:   [0.88, 0.88, 0.89],     // baked crisp white (two-tone roof, stripes, police doors)
  cargo:    [0.90, 0.89, 0.86],     // commercial box white
  wood:     [0.46, 0.30, 0.16],     // teak boat deck
};

// ---------------------------------------------------------------------------
// Geometry core
// ---------------------------------------------------------------------------
function geom() { return { p: [], n: [], c: [], i: [] }; }

function tri(g, a, b, c, color) {
  const cArr = color || C.black;
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len; ny /= len; nz /= len;
  const first = g.p.length / 3;
  for (const v of [a, b, c]) { g.p.push(...v); g.n.push(nx, ny, nz); g.c.push(...cArr); }
  g.i.push(first, first + 1, first + 2);
}

function quad(g, a, b, c, d, color) { tri(g, a, b, c, color); tri(g, a, c, d, color); }

function box(g, x, y, z, sx, sy, sz, color, rx = 0, ry = 0, rz = 0) {
  const raw = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
  const pts = raw.map(([X, Y, Z]) => {
    let px = X * sx / 2, py = Y * sy / 2, pz = Z * sz / 2;
    if (rx) { const ny = py * Math.cos(rx) - pz * Math.sin(rx); pz = py * Math.sin(rx) + pz * Math.cos(rx); py = ny; }
    if (ry) { const nx = px * Math.cos(ry) + pz * Math.sin(ry); pz = -px * Math.sin(ry) + pz * Math.cos(ry); px = nx; }
    if (rz) { const nx = px * Math.cos(rz) - py * Math.sin(rz); py = px * Math.sin(rz) + py * Math.cos(rz); px = nx; }
    return [px + x, py + y, pz + z];
  });
  const faces = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 4, 7, 3], [1, 2, 6, 5], [0, 1, 5, 4], [3, 7, 6, 2]];
  for (const f of faces) quad(g, pts[f[0]], pts[f[1]], pts[f[2]], pts[f[3]], color);
}

function panel(g, pts, color) {
  for (let i = 1; i + 1 < pts.length; i++) tri(g, pts[0], pts[i], pts[i + 1], color);
}

function symRing(z, pts) {
  const ring = [];
  for (const [y, w] of pts) ring.push([w, y, z]);
  for (let i = pts.length - 1; i >= 0; i--) ring.push([-pts[i][1], pts[i][0], z]);
  return ring;
}

function loft(g, rings, color) {
  for (let s = 0; s < rings.length - 1; s++) {
    const a = rings[s], b = rings[s + 1];
    for (let i = 0; i < a.length; i++) {
      const j = (i + 1) % a.length;
      quad(g, a[i], a[j], b[j], b[i], color);
    }
  }
  const cap = (ring, flip) => {
    const c = ring.reduce((acc, p) => [acc[0] + p[0] / ring.length, acc[1] + p[1] / ring.length, acc[2] + p[2] / ring.length], [0, 0, 0]);
    for (let i = 0; i < ring.length; i++) {
      const j = (i + 1) % ring.length;
      if (flip) tri(g, c, ring[j], ring[i], color); else tri(g, c, ring[i], ring[j], color);
    }
  };
  cap(rings[0], true);
  cap(rings[rings.length - 1], false);
}

function cylinderX(g, x, y, z, r, len, color, seg = 8) {
  const x0 = x - len / 2, x1 = x + len / 2, rings = [];
  for (const xx of [x0, x1]) {
    const ring = [];
    for (let s = 0; s < seg; s++) {
      const a = s * Math.PI * 2 / seg;
      ring.push([xx, y + Math.cos(a) * r, z + Math.sin(a) * r]);
    }
    rings.push(ring);
  }
  for (let s = 0; s < seg; s++) {
    const n = (s + 1) % seg;
    quad(g, rings[0][s], rings[0][n], rings[1][n], rings[1][s], color);
    tri(g, [x0, y, z], rings[0][n], rings[0][s], color);
    tri(g, [x1, y, z], rings[1][s], rings[1][n], color);
  }
}

function cylinderY(g, x, y, z, r, len, color, seg = 8, rTop = null) {
  const y0 = y - len / 2, y1 = y + len / 2, rt = rTop === null ? r : rTop;
  const ring0 = [], ring1 = [];
  for (let i = 0; i < seg; i++) {
    const a = i * Math.PI * 2 / seg;
    ring0.push([x + Math.cos(a) * r, y0, z + Math.sin(a) * r]);
    ring1.push([x + Math.cos(a) * rt, y1, z + Math.sin(a) * rt]);
  }
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg;
    quad(g, ring0[i], ring0[j], ring1[j], ring1[i], color);
  }
  panel(g, ring0.slice().reverse(), color);
  panel(g, ring1, color);
}

function cylinderZ(g, x, y, z, r, len, color, seg = 8, rTop = null) {
  const z0 = z - len / 2, z1 = z + len / 2, rings = [];
  for (const [zz, rr] of [[z0, r], [z1, rTop === null ? r : rTop]]) {
    const ring = [];
    for (let s = 0; s < seg; s++) {
      const a = s * Math.PI * 2 / seg;
      ring.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr, zz]);
    }
    rings.push(ring);
  }
  for (let s = 0; s < seg; s++) {
    const n = (s + 1) % seg;
    quad(g, rings[0][s], rings[0][n], rings[1][n], rings[1][s], color);
    tri(g, [x, y, z0], rings[0][n], rings[0][s], color);
    if (rTop === null) tri(g, [x, y, z1], rings[1][s], rings[1][n], color);
  }
}

function sideQuad(g, side, x, pts, color) {
  const v = pts.map(([y, z]) => [side * Math.abs(x), y, z]);
  if (side > 0) quad(g, v[0], v[3], v[2], v[1], color);
  else quad(g, v[0], v[1], v[2], v[3], color);
}

function slopedSideQuad(g, side, pts, color) {
  const v = pts.map(([x, y, z]) => [side * Math.abs(x), y, z]);
  if (side > 0) quad(g, v[0], v[3], v[2], v[1], color);
  else quad(g, v[0], v[1], v[2], v[3], color);
}

function endQuad(g, z, pts, color) {
  panel(g, pts.map(([x, y]) => [x, y, z]), color);
}

// ---------------------------------------------------------------------------
// Shared detail builders
// ---------------------------------------------------------------------------

// Streamlined wheel: tire (32 tris) + 6-seg rim (24 tris) + hub box (12 tris) = 68 tris
function wheelGeometry(radius, width) {
  const g = geom();
  // 8-segment rubber tire (tread + sidewalls) = 32 tris
  cylinderX(g, 0, 0, 0, radius, width * 0.88, C.rubber, 8);
  // Chrome / metallic rim barrel on both sides = 24 tris
  cylinderX(g, 0, 0, 0, radius * 0.60, width * 0.94, C.chrome, 6);
  // Dark center hub cap = 12 tris
  box(g, 0, 0, 0, width * 1.02, radius * 0.28, radius * 0.28, C.charcoal);
  return g;
}

function headlights(g, s, y, opts = {}) {
  const z = -s.L / 2 - 0.024;
  for (const side of [-1, 1]) {
    const x = side * s.W * (opts.x || 0.30);
    if (opts.round) {
      cylinderZ(g, x, y, z, s.W * 0.07, 0.05, C.head, 6);
    } else {
      box(g, x, y, z, s.W * (opts.w || 0.22), opts.h || 0.14, 0.05, C.head);
    }
    if (opts.indicator !== false) {
      box(g, x + side * s.W * (opts.w || 0.22) * 0.60, y, z + 0.01, 0.05, (opts.h || 0.14) * 0.75, 0.04, C.amber);
    }
  }
}

function taillights(g, s, y, opts = {}) {
  const z = s.L / 2 + 0.024;
  for (const side of [-1, 1]) {
    const x = side * s.W * (opts.x || 0.30);
    if (opts.round) {
      cylinderZ(g, x, y, z, s.W * 0.07, 0.05, C.tail, 6);
    } else {
      box(g, x, y, z, s.W * (opts.w || 0.22), opts.h || 0.14, 0.05, C.tail);
    }
  }
  if (opts.plate !== false) plate(g, 0, y - 0.14, z + 0.015);
}

function plate(g, x, y, z, w = 0.42) {
  box(g, x, y, z, w, 0.12, 0.02, C.plate);
  box(g, x, y, z + (z > 0 ? 0.012 : -0.012), w * 0.7, 0.06, 0.008, C.charcoal);
}

function grille(g, s, y, opts = {}) {
  const z = -s.L / 2 - 0.038;
  const w = s.W * (opts.w || 0.46), h = opts.h || 0.18;
  box(g, 0, y, z, w, h, 0.05, C.black);
  if (opts.chromeBars) {
    box(g, 0, y, z - 0.015, w * 0.88, h * 0.45, 0.018, C.chrome);
  }
  if (opts.redAccent) {
    box(g, 0, y, z - 0.015, w * 0.94, h * 0.15, 0.02, C.red);
  }
  if (opts.badge) box(g, 0, y, z - 0.025, 0.07, 0.07, 0.02, C.chrome);
}

function bumpers(g, s, y, opts = {}) {
  const fz = -s.L / 2 - 0.02, rz = s.L / 2 + 0.02;
  const w = s.W * (opts.w || 0.88);
  const col = opts.chrome ? C.chrome : C.charcoal;
  box(g, 0, y, fz, w, 0.15, 0.16, col);
  box(g, 0, y + 0.01, rz, w * 1.02, 0.15, 0.16, col);
  if (opts.frontSplitter) {
    box(g, 0, y - 0.09, fz + 0.03, w * 0.92, 0.05, 0.18, C.black);
  }
}

function mirrors(g, s, z, y, color, doorWidth) {
  const bw = (doorWidth !== undefined) ? doorWidth : s.W * 0.435;
  for (const side of [-1, 1]) {
    box(g, side * (bw + 0.02), y - 0.005, z, 0.06, 0.035, 0.045, C.charcoal);
    const mx = side * (bw + 0.07);
    box(g, mx, y + 0.005, z, 0.065, 0.085, 0.09, color || C.paint);
    box(g, mx, y + 0.005, z + 0.046, 0.052, 0.072, 0.01, C.glassLit);
  }
}

function truckMirrors(g, s, x, y, z, color) {
  for (const side of [-1, 1]) {
    box(g, side * (x + 0.04), y + 0.12, z, 0.09, 0.025, 0.035, C.charcoal);
    box(g, side * (x + 0.04), y - 0.12, z, 0.09, 0.025, 0.035, C.charcoal);
    const mx = side * (x + 0.10);
    box(g, mx, y, z, 0.05, 0.28, 0.08, color || C.charcoal);
    box(g, mx, y, z + 0.041, 0.038, 0.25, 0.01, C.glassLit);
  }
}

function exhaustTips(g, tips) {
  for (const t of tips) {
    cylinderZ(g, t.x, t.y, t.z, t.r || 0.042, t.len || 0.10, C.chrome, 6);
  }
}

function roofRails(g, s, z0, z1, col = C.charcoal) {
  for (const side of [-1, 1]) {
    const x = side * s.W * 0.32;
    box(g, x, s.H + 0.03, (z0 + z1) / 2, 0.04, 0.04, z1 - z0, col);
  }
}

function lightbar(g, y, z, w, opts = {}) {
  box(g, 0, y, z, w, 0.06, 0.14, C.black);
  box(g, -w * 0.25, y + 0.05, z, w * 0.42, 0.07, 0.12, C.red);
  box(g,  w * 0.25, y + 0.05, z, w * 0.42, 0.07, 0.12, C.blue);
}

function pushBar(g, s, y) {
  const z = -s.L / 2 - 0.10;
  box(g, 0, y + 0.15, z, s.W * 0.68, 0.04, 0.04, C.black);
  box(g, 0, y + 0.02, z, s.W * 0.68, 0.04, 0.04, C.black);
  for (const side of [-1, 1]) box(g, side * s.W * 0.28, y + 0.08, z, 0.04, 0.18, 0.04, C.black);
}

function sideStripe(g, s, y, h, z0, z1, color) {
  for (const side of [-1, 1]) {
    box(g, side * (s.W / 2 + 0.01), y, (z0 + z1) / 2, 0.018, h, z1 - z0, color);
  }
}

// ---------------------------------------------------------------------------
// Generic road-car construction kit
// ---------------------------------------------------------------------------

function bodyLoft(g, sections, paint) {
  loft(g, sections.map(([z, pts]) => symRing(z, pts)), paint || C.paint);
}

function greenhouse(g, s, o) {
  const pillarPaint = o.paint || C.paint;
  const roofPaint = o.roofPaint || pillarPaint;
  const belt = o.belt, roof = o.roof;
  const w = o.width, rw = o.roofWidth;
  const fz = o.frontZ, rz = o.rearZ, sF = o.slopeF, sR = o.slopeR;

  loft(g, [
    symRing(fz, [[belt, w * 0.95], [roof - 0.10, rw * 0.94], [roof - 0.02, rw * 0.86]]),
    symRing(fz + sF, [[belt, w], [roof - 0.02, rw], [roof, rw * 0.92]]),
    symRing(rz - sR, [[belt, w], [roof - 0.02, rw], [roof, rw * 0.92]]),
    symRing(rz, [[belt, w * 0.95], [roof - 0.10, rw * 0.94], [roof - 0.02, rw * 0.86]]),
  ], pillarPaint);

  if (roofPaint !== pillarPaint) {
    box(g, 0, roof + 0.012, (fz + sF + rz - sR) / 2, rw * 1.84, 0.028, (rz - sR) - (fz + sF) + 0.06, roofPaint);
  }

  // Exact cabin outer X conforming to inward cabin slope
  const cabX = (y) => {
    const t = Math.max(0, Math.min(1, (y - belt) / (roof - belt)));
    return (1 - t) * w + t * rw + 0.004;
  };

  const gB = belt + 0.10, gT = roof - 0.07;
  const xB = cabX(gB), xT = cabX(gT);
  const mid = (fz + rz) / 2;

  // Sloping longitudinal points following A-pillar and C-pillar
  const zFA_B = fz + 0.10, zFA_T = fz + sF + 0.03;
  const zRC_B = rz - 0.08, zRC_T = rz - sR - 0.03;

  for (const side of [-1, 1]) {
    if (o.windows === 'coupe') {
      slopedSideQuad(g, side, [
        [xB, gB, zFA_B],
        [xB, gB, zRC_B],
        [xT, gT, zRC_T],
        [xT, gT, zFA_T]
      ], C.glass);
    } else {
      // Front side window
      slopedSideQuad(g, side, [
        [xB, gB, zFA_B],
        [xB, gB, mid - 0.04],
        [xT, gT, mid - 0.04],
        [xT, gT, zFA_T]
      ], C.glass);
      // Rear side window
      slopedSideQuad(g, side, [
        [xB, gB, mid + 0.04],
        [xB, gB, zRC_B],
        [xT, gT, zRC_T],
        [xT, gT, mid + 0.04]
      ], C.glass);
      // B-pillar flush on sloped surface
      slopedSideQuad(g, side, [
        [xB + 0.002, gB - 0.01, mid - 0.04],
        [xB + 0.002, gB - 0.01, mid + 0.04],
        [xT + 0.002, gT + 0.01, mid + 0.04],
        [xT + 0.002, gT + 0.01, mid - 0.04]
      ], C.black);
    }
    if (o.beltTrim) {
      box(g, side * (w + 0.01), belt + 0.06, mid, 0.014, 0.025, rz - fz - 0.15, C.chrome);
    }
  }

  // Front Windshield sloping along A-pillar
  const fwB = w * 0.88, fwT = rw * 0.84;
  const fzB = fz + 0.03, fzT = fz + sF - 0.02;
  quad(g,
    [ fwB, gB, fzB],
    [-fwB, gB, fzB],
    [-fwT, gT, fzT],
    [ fwT, gT, fzT],
    C.glassLit
  );

  // Rear Window sloping along C-pillar
  const rwB = w * 0.86, rwT = rw * 0.82;
  const rzB = rz - 0.03, rzT = rz - sR + 0.02;
  quad(g,
    [-rwB, gB, rzB],
    [ rwB, gB, rzB],
    [ rwT, gT, rzT],
    [-rwT, gT, rzT],
    C.glass
  );

  return { belt, roof, fz, rz, gB, gT, cabX };
}

function roadCar(g, s, o) {
  o = o || {};
  const paint = o.paint || C.paint;
  const bodyTop = o.bodyTop;
  s.beltHint = o.belt;
  const front = -s.L / 2, rear = s.L / 2;
  const belt = o.belt;
  const nose = o.nose, tailL = o.tailLen;
  const archF = -s.wb / 2, archR = s.wb / 2;
  const midF = archF + s.wheel * 1.5, midR = archR - s.wheel * 1.5;

  const sec = o.sections || [
    [front,            [[0.28, s.W * 0.35], [belt - 0.26, s.W * 0.42], [belt, s.W * 0.38]]],
    [front + nose,     [[0.24, s.W * 0.46], [belt - 0.24, s.W * 0.49], [bodyTop, s.W * 0.45]]],
    [midF,             [[0.22, s.W * 0.48], [belt - 0.24, s.W * 0.50], [bodyTop + 0.02, s.W * 0.47]]],
    [midR,             [[0.22, s.W * 0.48], [belt - 0.24, s.W * 0.50], [bodyTop + 0.02, s.W * 0.47]]],
    [rear - tailL,     [[0.24, s.W * 0.46], [belt - 0.24, s.W * 0.49], [bodyTop, s.W * 0.45]]],
    [rear,             [[0.28, s.W * 0.36], [belt - 0.24, s.W * 0.43], [belt, s.W * 0.39]]],
  ];
  bodyLoft(g, sec, paint);

  bumpers(g, s, o.bumperY || 0.34, o.bumper);
  headlights(g, s, o.lightY, o.lights || {});
  grille(g, s, o.grilleY, o.grilleOpt || {});
  taillights(g, s, o.tailY || o.lightY + 0.02, o.tails || {});

  const cab = greenhouse(g, s, Object.assign({ belt }, o.cabin, {
    paint: o.cabinPaint || paint,
    roofPaint: o.roofPaint || o.cabinPaint || paint
  }));

  const mZ = o.cabin.frontZ + o.cabin.slopeF * 0.35;
  const mY = cab.gB + 0.04;
  const mX = cab.cabX(mY);
  mirrors(g, s, mZ, mY, o.mirrorColor || paint, mX);

  return cab;
}

// ---------------------------------------------------------------------------
// Per-type builders (Multi-Color & Low-Poly)
// ---------------------------------------------------------------------------

// 1. SEDAN (Sentinel) — Executive sports sedan with two-tone Gloss Black roof
function buildSedan(g, s) {
  roadCar(g, s, {
    belt: 0.88, bodyTop: 0.94, nose: 0.86, tailLen: 0.52, lightY: 0.66,
    bumperY: 0.34, grilleY: 0.52,
    roofPaint: C.black,  // Two-tone Gloss Black roof!
    lights: { x: 0.30 },
    tails: { x: 0.31 },
    grilleOpt: { w: 0.46, h: 0.18, chromeBars: true, badge: true },
    cabin: { frontZ: -1.02, rearZ: 1.22, roof: s.H, width: s.W * 0.43, roofWidth: s.W * 0.35, slopeF: 0.48, slopeR: 0.42, beltTrim: true },
    bumper: { w: 0.88, frontSplitter: true },
  });
  exhaustTips(g, [
    { x: -s.W * 0.30, y: 0.28, z: s.L / 2 + 0.06 },
    { x:  s.W * 0.30, y: 0.28, z: s.L / 2 + 0.06 }
  ]);
}

// 2. COUPE (Banshee) — Sports coupe with White center racing stripe & Black aero canopy
function buildCoupe(g, s) {
  roadCar(g, s, {
    belt: 0.78, bodyTop: 0.84, nose: 1.05, tailLen: 0.44, lightY: 0.58,
    bumperY: 0.30, grilleY: 0.44,
    roofPaint: C.black,  // Satin Black canopy!
    lights: { x: 0.32, w: 0.24, h: 0.12 },
    tails: { x: 0.33, h: 0.12, w: 0.24 },
    grilleOpt: { w: 0.42, h: 0.14, chromeBars: true, badge: true },
    cabin: { frontZ: -0.74, rearZ: 1.02, roof: s.H, width: s.W * 0.42, roofWidth: s.W * 0.31, slopeF: 0.52, slopeR: 0.52, windows: 'coupe' },
    bumper: { w: 0.90, frontSplitter: true },
  });
  // Center White Racing Stripe down hood & rear deck
  box(g, 0, 0.86, -s.L * 0.28, 0.24, 0.02, s.L * 0.36, C.white2);
  box(g, 0, 0.84,  s.L * 0.32, 0.24, 0.02, s.L * 0.24, C.white2);
  box(g, 0, 0.92, s.L / 2 - 0.16, s.W * 0.66, 0.04, 0.16, C.black);
  exhaustTips(g, [
    { x: -s.W * 0.28, y: 0.27, z: s.L / 2 + 0.06 },
    { x:  s.W * 0.28, y: 0.27, z: s.L / 2 + 0.06 },
  ]);
}

// 3. MUSCLE (Sabre) — Classic muscle car with dual white racing stripes & chrome bumpers
function buildMuscle(g, s) {
  roadCar(g, s, {
    belt: 0.84, bodyTop: 0.92, nose: 1.06, tailLen: 0.42, lightY: 0.62,
    bumperY: 0.32, grilleY: 0.48,
    lights: { x: 0.36, round: true, indicator: false },
    tails: { x: 0.36, round: true, plate: false },
    grilleOpt: { w: 0.50, h: 0.16, chromeBars: true, badge: true },
    cabin: { frontZ: -0.66, rearZ: 1.14, roof: s.H, width: s.W * 0.42, roofWidth: s.W * 0.33, slopeF: 0.50, slopeR: 0.46, windows: 'coupe' },
    bumper: { w: 0.92, chrome: true },
  });
  for (const side of [-1, 1]) {
    const sx = side * 0.16;
    box(g, sx, 0.94, -s.L * 0.26, 0.12, 0.02, s.L * 0.42, C.white2);
    box(g, sx, s.H + 0.012, 0.24, 0.12, 0.02, 1.40, C.white2);
    box(g, sx, 0.90, s.L * 0.36, 0.12, 0.02, s.L * 0.22, C.white2);
  }
  box(g, 0, 0.97, -s.L * 0.28, 0.30, 0.06, 0.38, C.black);
  box(g, 0, 0.96, s.L / 2 - 0.20, s.W * 0.70, 0.04, 0.16, C.paint);
  exhaustTips(g, [
    { x: -s.W * 0.32, y: 0.27, z: s.L / 2 + 0.06, r: 0.05 },
    { x:  s.W * 0.32, y: 0.27, z: s.L / 2 + 0.06, r: 0.05 }
  ]);
}

// 4. HATCHBACK (Blista) — Hot-hatch with Gloss Black roof, roof spoiler & Red sport grille
function buildHatchback(g, s) {
  roadCar(g, s, {
    belt: 0.86, bodyTop: 0.90, nose: 0.72, tailLen: 0.30, lightY: 0.64,
    bumperY: 0.34, grilleY: 0.50,
    roofPaint: C.black,  // Gloss Black contrast roof!
    lights: { x: 0.30 },
    tails: { x: 0.32, h: 0.22, w: 0.22, plate: false },
    grilleOpt: { w: 0.44, h: 0.16, redAccent: true }, // Red sport grille surround!
    cabin: { frontZ: -0.92, rearZ: 1.62, roof: s.H, width: s.W * 0.44, roofWidth: s.W * 0.40, slopeF: 0.42, slopeR: 0.30 },
    bumper: { w: 0.88, frontSplitter: true },
  });
  box(g, 0, s.H + 0.04, 1.70, s.W * 0.74, 0.04, 0.22, C.black);
  plate(g, 0, 0.68, s.L / 2 + 0.04);
  exhaustTips(g, [
    { x: -0.08, y: 0.28, z: s.L / 2 + 0.06 },
    { x:  0.08, y: 0.28, z: s.L / 2 + 0.06 }
  ]);
}

// 5. COMPACT (Dilettante) — Commuter with two-tone Alpine White contrast roof
function buildCompact(g, s) {
  roadCar(g, s, {
    belt: 0.88, bodyTop: 0.92, nose: 0.62, tailLen: 0.40, lightY: 0.66,
    bumperY: 0.36, grilleY: 0.52,
    roofPaint: C.white2, // Crisp Alpine White contrast roof!
    lights: { x: 0.34, round: true, indicator: true },
    tails: { x: 0.34, h: 0.18, w: 0.18 },
    grilleOpt: { w: 0.40, h: 0.14 },
    cabin: { frontZ: -0.78, rearZ: 0.86, roof: s.H, width: s.W * 0.44, roofWidth: s.W * 0.38, slopeF: 0.34, slopeR: 0.30, windows: 'coupe' },
    bumper: { w: 0.90 },
  });
  for (const side of [-1, 1]) box(g, side * s.W * 0.38, 1.05, s.L / 2 - 0.10, 0.04, 0.32, 0.05, C.tail);
  box(g, 0, s.H + 0.03, 0.92, s.W * 0.64, 0.035, 0.18, C.white2);
  exhaustTips(g, [{ x: -s.W * 0.28, y: 0.30, z: s.L / 2 + 0.05 }]);
}

// 6. WAGON (Regina) — Estate wagon with chrome roof rails, side cladding, chrome bumper
function buildWagon(g, s) {
  roadCar(g, s, {
    belt: 0.90, bodyTop: 0.96, nose: 0.86, tailLen: 0.24, lightY: 0.68,
    bumperY: 0.34, grilleY: 0.54,
    rockerColor: C.charcoal,
    lights: { x: 0.30 },
    tails: { x: 0.32, h: 0.18 },
    grilleOpt: { w: 0.46, h: 0.18, chromeBars: true },
    cabin: { frontZ: -1.02, rearZ: 2.15, roof: s.H, width: s.W * 0.44, roofWidth: s.W * 0.38, slopeF: 0.48, slopeR: 0.30 },
    bumper: { w: 0.88, chrome: true },
  });
  roofRails(g, s, -0.9, 2.05, C.chrome);
  box(g, 0, 0.46, s.L / 2 + 0.06, s.W * 0.55, 0.03, 0.08, C.chrome);
  exhaustTips(g, [
    { x: -s.W * 0.30, y: 0.28, z: s.L / 2 + 0.06 },
    { x:  s.W * 0.30, y: 0.28, z: s.L / 2 + 0.06 }
  ]);
}

// 7. MINIVAN (Moonbeam) — Family MPV with two-tone charcoal cladding & silver roof rails
function buildMinivan(g, s) {
  roadCar(g, s, {
    belt: 1.04, bodyTop: 1.12, nose: 0.62, tailLen: 0.24, lightY: 0.88,
    bumperY: 0.40, grilleY: 0.70,
    rockerColor: C.charcoal,
    lights: { x: 0.32, w: 0.24, h: 0.15 },
    tails: { x: 0.34, h: 0.16, plate: false },
    grilleOpt: { w: 0.44, h: 0.20, chromeBars: true },
    cabin: { frontZ: -1.00, rearZ: 2.38, roof: s.H, width: s.W * 0.46, roofWidth: s.W * 0.42, slopeF: 0.30, slopeR: 0.14 },
    bumper: { w: 0.90 },
  });
  roofRails(g, s, -0.6, 2.25, C.chrome);
  plate(g, 0, 0.76, s.L / 2 + 0.04);
  exhaustTips(g, [{ x: -s.W * 0.30, y: 0.32, z: s.L / 2 + 0.05 }]);
}

// 8. SUV (Patriot) — Rugged SUV with two-tone Gloss Black roof & exterior spare tire
function buildSuv(g, s) {
  roadCar(g, s, {
    belt: 1.06, bodyTop: 1.14, nose: 0.84, tailLen: 0.30, lightY: 0.90,
    bumperY: 0.42, grilleY: 0.72,
    roofPaint: C.black,  // Contrast black roof!
    rockerColor: C.charcoal,
    lights: { x: 0.32, w: 0.26, h: 0.16 },
    tails: { x: 0.33, h: 0.18, plate: false },
    grilleOpt: { w: 0.54, h: 0.26, chromeBars: true, badge: true },
    cabin: { frontZ: -0.94, rearZ: 1.90, roof: s.H, width: s.W * 0.45, roofWidth: s.W * 0.40, slopeF: 0.30, slopeR: 0.26 },
    bumper: { w: 0.92 },
  });
  roofRails(g, s, -0.8, 1.80, C.chrome);
  cylinderZ(g, 0, s.wheel * 1.9, s.L / 2 + 0.08, s.wheel * 0.76, 0.18, C.rubber, 8);
  cylinderZ(g, 0, s.wheel * 1.9, s.L / 2 + 0.18, s.wheel * 0.32, 0.04, C.chrome, 6);
  plate(g, 0, 0.55, s.L / 2 + 0.04);
  exhaustTips(g, [
    { x: -s.W * 0.32, y: 0.33, z: s.L / 2 + 0.06 },
    { x:  s.W * 0.32, y: 0.33, z: s.L / 2 + 0.06 }
  ]);
}

// 9. PICKUP (Bobcat) — Work truck with black bedliner & chrome tubular rollbar with lights
function buildPickup(g, s) {
  roadCar(g, s, {
    belt: 1.00, bodyTop: 1.08, nose: 0.98, tailLen: 0.30, lightY: 0.86,
    bumperY: 0.40, grilleY: 0.68,
    rockerColor: C.charcoal,
    lights: { x: 0.32, w: 0.26, h: 0.16 },
    tails: { x: 0.34, h: 0.16 },
    grilleOpt: { w: 0.54, h: 0.26, chromeBars: true, badge: true },
    cabin: { frontZ: -1.16, rearZ: 0.28, roof: 1.80, width: s.W * 0.44, roofWidth: s.W * 0.37, slopeF: 0.26, slopeR: 0.22, windows: 'coupe' },
    bumper: { w: 0.92 },
  });
  const bedZ0 = 0.40, bedZ1 = s.L / 2 - 0.02, bedC = (bedZ0 + bedZ1) / 2;
  box(g, 0, 0.78, bedC, s.W * 0.86, 0.08, bedZ1 - bedZ0, C.black);
  for (const side of [-1, 1]) {
    box(g, side * s.W * 0.45, 1.06, bedC, 0.08, 0.50, bedZ1 - bedZ0, C.paint);
  }
  box(g, 0, 1.06, bedZ1 - 0.02, s.W * 0.86, 0.50, 0.08, C.paint);
  box(g, 0, 1.80, 0.46, s.W * 0.74, 0.06, 0.06, C.chrome);
  for (const side of [-1, 1]) box(g, side * s.W * 0.34, 1.45, 0.46, 0.06, 0.65, 0.06, C.chrome);
  cylinderZ(g, -0.18, 1.88, 0.46, 0.05, 0.06, C.head, 6);
  cylinderZ(g,  0.18, 1.88, 0.46, 0.05, 0.06, C.head, 6);
  exhaustTips(g, [
    { x: -s.W * 0.32, y: 0.33, z: s.L / 2 + 0.06 },
    { x:  s.W * 0.32, y: 0.33, z: s.L / 2 + 0.06 }
  ]);
}

// 10. OFFROAD (Rancher) — Safari 4x4 with Alpine White hardtop, black snorkel & yellow fogs
function buildOffroad(g, s) {
  const front = -s.L / 2, rear = s.L / 2;
  loft(g, [
    symRing(front, [[0.50, s.W * 0.40], [0.95, s.W * 0.45], [1.16, s.W * 0.40]]),
    symRing(front + 0.7, [[0.46, s.W * 0.47], [1.02, s.W * 0.49], [1.22, s.W * 0.45]]),
    symRing(rear - 0.6, [[0.46, s.W * 0.47], [1.02, s.W * 0.49], [1.22, s.W * 0.45]]),
    symRing(rear, [[0.50, s.W * 0.42], [0.98, s.W * 0.45], [1.18, s.W * 0.42]]),
  ], C.paint);
  loft(g, [
    symRing(-0.55, [[1.16, s.W * 0.38], [1.66, s.W * 0.35]]),
    symRing(rear - 0.2, [[1.16, s.W * 0.38], [1.66, s.W * 0.35]]),
  ], C.white2);
  endQuad(g, -0.56, [[-s.W * 0.34, 1.18], [s.W * 0.34, 1.18], [s.W * 0.31, 1.62], [-s.W * 0.31, 1.62]], C.glassLit);
  for (const side of [-1, 1]) {
    slopedSideQuad(g, side, [
      [s.W * 0.382, 1.22, -0.40],
      [s.W * 0.382, 1.22, rear - 0.30],
      [s.W * 0.352, 1.62, rear - 0.30],
      [s.W * 0.352, 1.62, -0.40]
    ], C.glass);
  }
  pushBar(g, s, 0.52);
  cylinderZ(g, -0.25, 0.65, front - 0.12, 0.07, 0.05, C.yellow, 6);
  cylinderZ(g,  0.25, 0.65, front - 0.12, 0.07, 0.05, C.yellow, 6);
  cylinderY(g, s.W / 2 + 0.06, 1.25, -s.L * 0.18, 0.038, 0.95, C.black, 6);
  box(g, s.W / 2 + 0.06, 1.76, -s.L * 0.18, 0.07, 0.06, 0.11, C.black);
  cylinderZ(g, 0, 1.05, rear + 0.08, s.wheel * 0.72, 0.18, C.rubber, 8);
  cylinderZ(g, 0, 1.05, rear + 0.18, s.wheel * 0.30, 0.04, C.metal, 6);
  headlights(g, s, 0.98, { x: 0.34, round: true, indicator: false });
  taillights(g, s, 0.98, { x: 0.34, round: true, plate: false });
  mirrors(g, s, -0.45, 1.22, C.black, s.W * 0.42);
  exhaustTips(g, [{ x: -s.W * 0.30, y: 0.40, z: rear + 0.06, r: 0.05 }]);
}

// 11. LIMO (Stretch) — Executive limousine with two-tone Black vinyl roof & full chrome belt
function buildLimo(g, s) {
  roadCar(g, s, {
    belt: 0.90, bodyTop: 0.96, nose: 0.86, tailLen: 0.56, lightY: 0.68,
    bumperY: 0.34, grilleY: 0.52,
    roofPaint: C.black,  // Black vinyl luxury roof!
    lights: { x: 0.30 },
    tails: { x: 0.31 },
    grilleOpt: { w: 0.46, h: 0.18, chromeBars: true, badge: true },
    cabin: { frontZ: -1.05, rearZ: s.L / 2 - 1.05, roof: s.H, width: s.W * 0.43, roofWidth: s.W * 0.37, slopeF: 0.50, slopeR: 0.42, beltTrim: true },
    bumper: { w: 0.88, chrome: true },
  });
  exhaustTips(g, [{ x: -s.W * 0.30, y: 0.28, z: s.L / 2 + 0.06 }]);
}

// 12. SUPERCAR (Infernus) — Exotic hypercar with Jet Black canopy & Red visible engine block
function buildSupercar(g, s) {
  const front = -s.L / 2, rear = s.L / 2;
  loft(g, [
    symRing(front, [[0.22, s.W * 0.32], [0.42, s.W * 0.38], [0.48, s.W * 0.28]]),
    symRing(front + 0.75, [[0.18, s.W * 0.45], [0.52, s.W * 0.49], [0.58, s.W * 0.40]]),
    symRing(-0.35, [[0.18, s.W * 0.48], [0.68, s.W * 0.49], [0.76, s.W * 0.42]]),
    symRing(0.55, [[0.18, s.W * 0.48], [0.72, s.W * 0.49], [0.80, s.W * 0.42]]),
    symRing(rear - 0.5, [[0.20, s.W * 0.46], [0.68, s.W * 0.48], [0.76, s.W * 0.41]]),
    symRing(rear, [[0.26, s.W * 0.38], [0.60, s.W * 0.42], [0.68, s.W * 0.36]]),
  ], C.paint);
  loft(g, [
    symRing(-0.85, [[0.60, s.W * 0.36], [0.88, s.W * 0.30]]),
    symRing(-0.15, [[0.64, s.W * 0.38], [1.02, s.W * 0.26]]),
    symRing(0.85, [[0.68, s.W * 0.36], [0.98, s.W * 0.24]]),
  ], C.black);
  endQuad(g, -0.87, [[-s.W * 0.31, 0.68], [s.W * 0.31, 0.68], [s.W * 0.26, 0.94], [-s.W * 0.26, 0.94]], C.glassLit);
  for (const side of [-1, 1]) {
    slopedSideQuad(g, side, [
      [s.W * 0.38, 0.74, -0.55],
      [s.W * 0.38, 0.74, 0.70],
      [s.W * 0.28, 0.96, 0.55],
      [s.W * 0.28, 0.96, -0.35]
    ], C.glass);
  }
  endQuad(g, 0.88, [[-s.W * 0.28, 0.74], [s.W * 0.28, 0.74], [s.W * 0.24, 0.96], [-s.W * 0.24, 0.96]], C.glass);
  box(g, 0, 0.68, 0.50, 0.42, 0.16, 0.48, C.metal);
  box(g, -0.14, 0.78, 0.50, 0.10, 0.05, 0.44, C.red);
  box(g,  0.14, 0.78, 0.50, 0.10, 0.05, 0.44, C.red);
  box(g, 0, 0.20, front - 0.03, s.W * 0.92, 0.04, 0.26, C.black);
  box(g, 0, 0.24, rear + 0.03, s.W * 0.86, 0.12, 0.18, C.black);
  box(g, 0, 0.98, rear - 0.32, s.W * 0.84, 0.04, 0.26, C.black);
  for (const side of [-1, 1]) box(g, side * s.W * 0.28, 0.86, rear - 0.32, 0.04, 0.20, 0.06, C.black);
  mirrors(g, s, -0.30, 0.72, C.black, s.W * 0.40);
  headlights(g, s, 0.48, { x: 0.30, w: 0.24, h: 0.09, indicator: false });
  taillights(g, s, 0.58, { x: 0.30, w: 0.26, h: 0.09, plate: false });
  plate(g, 0, 0.42, rear + 0.05);
  exhaustTips(g, [
    { x: -0.10, y: 0.38, z: rear + 0.06, r: 0.04 },
    { x:  0.10, y: 0.38, z: rear + 0.06, r: 0.04 },
  ]);
}

// 13. TAXI (Cabbie) — NYC Yellow Cab with White roof & checkered waistline stripe
function buildTaxi(g, s) {
  roadCar(g, s, {
    paint: C.taxi,
    belt: 0.88, bodyTop: 0.94, nose: 0.86, tailLen: 0.50, lightY: 0.66,
    bumperY: 0.34, grilleY: 0.52,
    roofPaint: C.white2, // White roof!
    lights: { x: 0.30 },
    tails: { x: 0.31 },
    grilleOpt: { w: 0.46, h: 0.18, chromeBars: true },
    cabin: { frontZ: -1.04, rearZ: 1.24, roof: s.H, width: s.W * 0.43, roofWidth: s.W * 0.35, slopeF: 0.48, slopeR: 0.42, beltTrim: true },
    bumper: { w: 0.88 },
  });
  box(g, 0, s.H + 0.09, -0.05, 0.62, 0.15, 0.26, C.yellow);
  box(g, 0, s.H + 0.09, -0.05 - 0.138, 0.42, 0.08, 0.015, C.black);
  // Checkered black-and-white lateral stripe along waistline (4 bold segments per side)
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      box(g, side * (s.W / 2 + 0.014), 0.72, -0.60 + i * 0.40, 0.02, 0.10, 0.20, i % 2 ? C.black : C.white2);
    }
  }
  exhaustTips(g, [{ x: -s.W * 0.30, y: 0.28, z: s.L / 2 + 0.05 }]);
}

// 14. POLICE (Cruiser) — Classic NYPD Black & White livery with roof lightbar
function buildPolice(g, s) {
  roadCar(g, s, {
    paint: C.white2,
    belt: 0.88, bodyTop: 0.94, nose: 0.88, tailLen: 0.52, lightY: 0.66,
    bumperY: 0.34, grilleY: 0.52,
    roofPaint: C.white2,
    lights: { x: 0.30 },
    tails: { x: 0.31 },
    grilleOpt: { w: 0.46, h: 0.18, chromeBars: true },
    cabin: { frontZ: -1.04, rearZ: 1.24, roof: s.H, width: s.W * 0.43, roofWidth: s.W * 0.35, slopeF: 0.48, slopeR: 0.42, paint: C.white2 },
    bumper: { w: 0.88 },
  });
  box(g, 0, 0.945, -s.L * 0.30, s.W * 0.82, 0.02, s.L * 0.36, C.black);
  box(g, 0, 0.925,  s.L * 0.34, s.W * 0.80, 0.02, s.L * 0.26, C.black);
  sideStripe(g, s, 0.62, 0.12, -s.L * 0.45, s.L * 0.45, C.navy);
  lightbar(g, s.H + 0.06, 0.05, 1.05);
  pushBar(g, s, 0.36);
  exhaustTips(g, [{ x: -s.W * 0.30, y: 0.28, z: s.L / 2 + 0.05 }]);
}

// 15. POLICE SUV (Interceptor) — Navy body with White doors/roof & tactical pushbar
function buildPoliceSuv(g, s) {
  roadCar(g, s, {
    paint: C.navy,
    belt: 1.04, bodyTop: 1.14, nose: 0.86, tailLen: 0.30, lightY: 0.90,
    bumperY: 0.42, grilleY: 0.72,
    roofPaint: C.white2,
    lights: { x: 0.32, w: 0.26, h: 0.15 },
    tails: { x: 0.33, h: 0.17 },
    grilleOpt: { w: 0.52, h: 0.24, chromeBars: true },
    cabin: { frontZ: -0.96, rearZ: 1.88, roof: s.H, width: s.W * 0.45, roofWidth: s.W * 0.40, slopeF: 0.30, slopeR: 0.26, paint: C.white2 },
    bumper: { w: 0.92 },
  });
  for (const side of [-1, 1]) {
    box(g, side * (s.W / 2 + 0.012), 0.78, 0.35, 0.02, 0.44, 1.35, C.white2);
  }
  lightbar(g, s.H + 0.06, 0.10, 1.15);
  pushBar(g, s, 0.44);
  exhaustTips(g, [{ x: -s.W * 0.32, y: 0.33, z: s.L / 2 + 0.05 }]);
}

// 16. POLICE ENFORCER (Enforcer) — Armored tactical SWAT riot truck
function buildEnforcer(g, s) {
  const front = -s.L / 2, rear = s.L / 2;
  loft(g, [
    symRing(front, [[0.34, s.W * 0.38], [0.9, s.W * 0.44], [1.7, s.W * 0.42], [2.0, s.W * 0.38]]),
    symRing(front + 0.5, [[0.30, s.W * 0.46], [1.2, s.W * 0.49], [2.1, s.W * 0.47], [2.2, s.W * 0.44]]),
    symRing(rear - 0.2, [[0.30, s.W * 0.46], [1.2, s.W * 0.49], [2.1, s.W * 0.47], [s.H - 0.05, s.W * 0.44]]),
    symRing(rear, [[0.34, s.W * 0.42], [1.0, s.W * 0.45], [2.0, s.W * 0.43], [s.H - 0.10, s.W * 0.40]]),
  ], C.navy);
  box(g, 0, s.H + 0.012, 0.2, s.W * 0.48, 0.03, s.L * 0.70, C.white2);
  endQuad(g, front - 0.012, [[-s.W * 0.34, 1.35], [s.W * 0.34, 1.35], [s.W * 0.30, 1.95], [-s.W * 0.30, 1.95]], C.glassLit);
  for (const side of [-1, 1]) {
    slopedSideQuad(g, side, [
      [s.W * 0.485, 1.35, front + 0.65],
      [s.W * 0.485, 1.35, front + 1.35],
      [s.W * 0.455, 1.85, front + 1.30],
      [s.W * 0.455, 1.85, front + 0.70]
    ], C.glass);
    slopedSideQuad(g, side, [
      [s.W * 0.485, 1.35, 0.20],
      [s.W * 0.485, 1.35, 1.10],
      [s.W * 0.455, 1.80, 1.10],
      [s.W * 0.455, 1.80, 0.20]
    ], C.glass);
  }
  truckMirrors(g, s, s.W * 0.45, 1.60, front + 0.65, C.charcoal);
  bumpers(g, s, 0.44, { w: 0.96 });
  headlights(g, s, 0.92, { x: 0.30, w: 0.24, h: 0.15 });
  grille(g, s, 0.80, { w: 0.44, h: 0.24, bars: 2 });
  taillights(g, s, 1.05, { x: 0.30, h: 0.15 });
  lightbar(g, s.H + 0.06, 0.30, 1.25);
  pushBar(g, s, 0.46);
}

// 17. AMBULANCE (Ambulance) — Pure White with Red paramedic stripe & Red cross
function buildAmbulance(g, s) {
  const front = -s.L / 2, rear = s.L / 2;
  loft(g, [
    symRing(front, [[0.32, s.W * 0.35], [0.8, s.W * 0.42], [1.4, s.W * 0.39], [1.6, s.W * 0.35]]),
    symRing(front + 0.72, [[0.28, s.W * 0.45], [1.1, s.W * 0.48], [1.8, s.W * 0.46], [1.95, s.W * 0.43]]),
    symRing(front + 1.35, [[0.28, s.W * 0.45], [1.2, s.W * 0.47], [1.9, s.W * 0.46], [2.05, s.W * 0.43]]),
  ], C.white2);
  box(g, 0, 1.45, (front + 1.35 + rear) / 2, s.W * 0.94, 1.85, rear - (front + 1.35) - 0.06, C.white2);
  box(g, 0, 1.05, 0.20, s.W * 0.96, 0.20, s.L * 0.72, C.red);
  for (const side of [-1, 1]) {
    const cx = side * s.W * 0.474, cz = (front + 1.35 + rear) / 2 + 0.3;
    box(g, cx, 1.70, cz, 0.016, 0.36, 0.12, C.red);
    box(g, cx, 1.70, cz, 0.016, 0.12, 0.36, C.red);
  }
  endQuad(g, front + 0.71, [[-s.W * 0.34, 1.30], [s.W * 0.34, 1.30], [s.W * 0.30, 1.85], [-s.W * 0.30, 1.85]], C.glassLit);
  for (const side of [-1, 1]) {
    slopedSideQuad(g, side, [
      [s.W * 0.475, 1.30, front + 0.34],
      [s.W * 0.475, 1.30, front + 0.98],
      [s.W * 0.445, 1.80, front + 0.94],
      [s.W * 0.445, 1.80, front + 0.40]
    ], C.glass);
  }
  endQuad(g, rear + 0.03, [[-s.W * 0.36, 0.85], [s.W * 0.36, 0.85], [s.W * 0.34, 2.05], [-s.W * 0.34, 2.05]], C.cargo);
  endQuad(g, rear + 0.035, [[-s.W * 0.30, 1.30], [-s.W * 0.06, 1.30], [-s.W * 0.06, 1.80], [-s.W * 0.30, 1.80]], C.glass);
  endQuad(g, rear + 0.035, [[ s.W * 0.06, 1.30], [ s.W * 0.30, 1.30], [ s.W * 0.30, 1.80], [ s.W * 0.06, 1.80]], C.glass);
  bumpers(g, s, 0.40, { w: 0.92 });
  headlights(g, s, 0.86, { x: 0.30 });
  grille(g, s, 0.66, { w: 0.44, h: 0.20, chromeBars: true });
  taillights(g, s, 1.00, { x: 0.34, plate: false });
  lightbar(g, 2.10, front + 0.90, 1.20);
  mirrors(g, s, front + 0.80, 1.35, C.white2, s.W * 0.46);
}

// 18. FIRETRUCK (Fire Truck) — Cherry red with silver pump plates & yellow roof ladder
function buildFiretruck(g, s) {
  const front = -s.L / 2, rear = s.L / 2;
  loft(g, [
    symRing(front, [[0.36, s.W * 0.36], [1.0, s.W * 0.42], [1.6, s.W * 0.40], [1.9, s.W * 0.36]]),
    symRing(front + 0.9, [[0.32, s.W * 0.46], [1.3, s.W * 0.49], [2.1, s.W * 0.47], [2.35, s.W * 0.44]]),
    symRing(front + 2.1, [[0.32, s.W * 0.46], [1.3, s.W * 0.49], [2.2, s.W * 0.47], [2.45, s.W * 0.44]]),
  ], C.fireRed);
  box(g, 0, 1.35, (front + 2.1 + rear) / 2, s.W * 0.96, 1.70, rear - (front + 2.1) - 0.05, C.fireRed);
  for (const side of [-1, 1]) {
    box(g, side * s.W * 0.485, 1.25, 1.0, 0.02, 0.90, 1.40, C.chrome);
  }
  const lz0 = front + 2.4, lz1 = rear - 0.4;
  for (const side of [-1, 1]) box(g, side * 0.26, 2.32, (lz0 + lz1) / 2, 0.06, 0.06, lz1 - lz0, C.yellow);
  for (let i = 0; i < 6; i++) box(g, 0, 2.32, lz0 + i * (lz1 - lz0) / 5, 0.50, 0.04, 0.04, C.yellow);
  endQuad(g, front - 0.012, [[-s.W * 0.32, 1.50], [s.W * 0.32, 1.50], [s.W * 0.28, 2.10], [-s.W * 0.28, 2.10]], C.glassLit);
  for (const side of [-1, 1]) {
    slopedSideQuad(g, side, [
      [s.W * 0.485, 1.50, front + 0.75],
      [s.W * 0.485, 1.50, front + 1.50],
      [s.W * 0.455, 2.15, front + 1.50],
      [s.W * 0.455, 2.15, front + 0.85]
    ], C.glass);
  }
  truckMirrors(g, s, s.W * 0.45, 1.65, front + 0.80, C.chrome);
  bumpers(g, s, 0.46, { w: 0.94, chrome: true });
  headlights(g, s, 1.00, { x: 0.30, w: 0.24, h: 0.16 });
  grille(g, s, 0.86, { w: 0.46, h: 0.28, chromeBars: true });
  taillights(g, s, 1.05, { x: 0.32, plate: false });
  lightbar(g, 2.48, front + 1.40, 1.30);
  pushBar(g, s, 0.48);
}

// 19. GARBAGE (Trashmaster) — Forest green with heavy steel compactor hopper & side cab windows
function buildGarbage(g, s) {
  const front = -s.L / 2, rear = s.L / 2;
  loft(g, [
    symRing(front, [[0.34, s.W * 0.38], [0.9, s.W * 0.42], [1.5, s.W * 0.40], [1.8, s.W * 0.36]]),
    symRing(front + 0.8, [[0.30, s.W * 0.46], [1.2, s.W * 0.49], [1.9, s.W * 0.47], [2.15, s.W * 0.44]]),
    symRing(front + 1.6, [[0.30, s.W * 0.46], [1.2, s.W * 0.48], [2.0, s.W * 0.46], [2.20, s.W * 0.44]]),
  ], C.green);
  box(g, 0, 1.70, (front + 1.6 + rear) / 2, s.W * 0.95, 2.10, rear - (front + 1.6) - 0.05, C.green);
  box(g, 0, 1.40, rear - 0.20, s.W * 0.88, 1.60, 0.60, C.steel);
  endQuad(g, front - 0.012, [[-s.W * 0.32, 1.40], [s.W * 0.32, 1.40], [s.W * 0.28, 1.95], [-s.W * 0.28, 1.95]], C.glassLit);
  for (const side of [-1, 1]) {
    slopedSideQuad(g, side, [
      [s.W * 0.48, 1.35, front + 0.45],
      [s.W * 0.48, 1.35, front + 1.45],
      [s.W * 0.44, 1.95, front + 1.45],
      [s.W * 0.44, 1.95, front + 0.60]
    ], C.glass);
  }
  truckMirrors(g, s, s.W * 0.45, 1.55, front + 0.55, C.charcoal);
  bumpers(g, s, 0.44, { w: 0.94 });
  headlights(g, s, 0.94, { x: 0.30 });
  grille(g, s, 0.80, { w: 0.44, h: 0.26 });
  taillights(g, s, 1.05, { x: 0.32, plate: false });
}

// 20. TOWTRUCK (Tow Truck) — Primary cab with Safety Yellow boom & chevron warning stripes
function buildTowtruck(g, s) {
  roadCar(g, s, {
    belt: 1.00, bodyTop: 1.10, nose: 0.95, tailLen: 0.30, lightY: 0.84,
    bumperY: 0.40, grilleY: 0.66,
    lights: { x: 0.32, w: 0.24, h: 0.15 },
    tails: { x: 0.33, h: 0.15, plate: false },
    grilleOpt: { w: 0.50, h: 0.24, chromeBars: true },
    cabin: { frontZ: -1.10, rearZ: 0.24, roof: 1.86, width: s.W * 0.44, roofWidth: s.W * 0.37, slopeF: 0.26, slopeR: 0.20, windows: 'coupe' },
    bumper: { w: 0.92 },
  });
  const bedZ0 = 0.30, bedZ1 = s.L / 2 - 0.05;
  box(g, 0, 0.95, (bedZ0 + bedZ1) / 2, s.W * 0.88, 0.08, bedZ1 - bedZ0, C.steel);
  box(g, 0, 1.55, bedZ0 + 0.55, 0.12, 0.15, 1.80, C.yellow, -0.5, 0, 0);
  box(g, 0, 1.10, bedZ1 - 0.02, s.W * 0.86, 0.22, 0.04, C.red);
  cylinderZ(g, 0, 1.94, bedZ0 + 0.05, 0.08, 0.14, C.amber, 8);
  exhaustTips(g, [{ x: -s.W * 0.32, y: 0.33, z: s.L / 2 + 0.05 }]);
}

// 21. BUS (Coach) — Two-tone MTA transit livery with conforming panoramic windows & transit mirrors
function buildBus(g, s) {
  const front = -s.L / 2, rear = s.L / 2;
  loft(g, [
    symRing(front, [[0.40, s.W * 0.42], [1.65, s.W * 0.47]]),
    symRing(front + 0.55, [[0.38, s.W * 0.48], [1.70, s.W * 0.50]]),
    symRing(rear - 0.35, [[0.38, s.W * 0.48], [1.70, s.W * 0.50]]),
    symRing(rear, [[0.40, s.W * 0.44], [1.65, s.W * 0.47]]),
  ], C.blue);
  loft(g, [
    symRing(front, [[1.65, s.W * 0.47], [2.85, s.W * 0.40]]),
    symRing(front + 0.55, [[1.70, s.W * 0.50], [s.H - 0.05, s.W * 0.45]]),
    symRing(rear - 0.35, [[1.70, s.W * 0.50], [s.H - 0.05, s.W * 0.45]]),
    symRing(rear, [[1.65, s.W * 0.47], [2.95, s.W * 0.41]]),
  ], C.white2);
  const wY0 = 1.72, wY1 = 2.55;
  endQuad(g, front - 0.016, [[-s.W * 0.37, wY0], [s.W * 0.37, wY0], [s.W * 0.33, wY1], [-s.W * 0.33, wY1]], C.glassLit);
  const busX = (y) => {
    const t = Math.max(0, Math.min(1, (y - 1.70) / (3.05 - 1.70)));
    return s.W * ((1 - t) * 0.50 + t * 0.45) + 0.008;
  };
  const busX0 = busX(wY0), busX1 = busX(wY1);
  for (const side of [-1, 1]) {
    // Driver / entrance front window bay
    slopedSideQuad(g, side, [
      [busX0, wY0, front + 0.25],
      [busX0, wY0, front + 1.15],
      [busX1, wY1, front + 1.15],
      [busX1, wY1, front + 0.25]
    ], C.glass);
    // 5 passenger window bays
    for (let i = 0; i < 5; i++) {
      const z0 = front + 1.30 + i * 1.65;
      if (z0 + 1.45 > rear - 0.25) break;
      slopedSideQuad(g, side, [
        [busX0, wY0, z0],
        [busX0, wY0, z0 + 1.45],
        [busX1, wY1, z0 + 1.45],
        [busX1, wY1, z0]
      ], C.glass);
    }
  }
  endQuad(g, rear + 0.015, [[-s.W * 0.38, 1.85], [s.W * 0.38, 1.85], [s.W * 0.34, 2.52], [-s.W * 0.34, 2.52]], C.glass);
  truckMirrors(g, s, busX(1.95), 1.95, front + 0.30, C.charcoal);
  box(g, 0, 2.70, front - 0.04, s.W * 0.52, 0.16, 0.03, C.black);
  box(g, 0, 2.70, front - 0.06, s.W * 0.40, 0.08, 0.02, C.amber);
  bumpers(g, s, 0.46, { w: 0.92 });
  headlights(g, s, 0.85, { x: 0.32, w: 0.26, h: 0.17 });
  grille(g, s, 0.72, { w: 0.50, h: 0.22 });
  taillights(g, s, 0.90, { x: 0.32, plate: false });
}

// 22. SCHOOLBUS (School Bus) — Golden yellow with sloped windshield, side passenger windows & bus mirrors
function buildSchoolbus(g, s) {
  const front = -s.L / 2, rear = s.L / 2;
  loft(g, [
    symRing(front, [[0.40, s.W * 0.38], [0.95, s.W * 0.42], [1.45, s.W * 0.36]]),
    symRing(front + 1.3, [[0.36, s.W * 0.45], [1.2, s.W * 0.47], [2.15, s.W * 0.42]]),
    symRing(front + 2.0, [[0.36, s.W * 0.45], [1.3, s.W * 0.47], [2.62, s.W * 0.42]]),
    symRing(rear - 0.3, [[0.36, s.W * 0.45], [1.3, s.W * 0.47], [2.65, s.W * 0.43]]),
    symRing(rear, [[0.40, s.W * 0.40], [1.25, s.W * 0.43], [2.60, s.W * 0.40]]),
  ], C.yellow);
  // Sloped Windshield
  quad(g,
    [ s.W * 0.35, 1.45, front + 1.30],
    [-s.W * 0.35, 1.45, front + 1.30],
    [-s.W * 0.31, 2.12, front + 1.55],
    [ s.W * 0.31, 2.12, front + 1.55],
    C.glassLit
  );
  // Side Windows (driver + entrance door + 5 passenger bays)
  const sbX0 = s.W * 0.468, sbX1 = s.W * 0.432;
  for (const side of [-1, 1]) {
    slopedSideQuad(g, side, [
      [sbX0, 1.55, front + 1.52],
      [sbX0, 1.55, front + 2.15],
      [sbX1, 2.20, front + 2.15],
      [sbX1, 2.20, front + 1.58]
    ], C.glass);
    const bayW = (rear - 0.35 - (front + 2.30)) / 5;
    for (let i = 0; i < 5; i++) {
      const z0 = front + 2.30 + i * bayW + 0.08;
      const z1 = z0 + bayW - 0.16;
      slopedSideQuad(g, side, [
        [sbX0, 1.55, z0],
        [sbX0, 1.55, z1],
        [sbX1, 2.20, z1],
        [sbX1, 2.20, z0]
      ], C.glass);
    }
  }
  endQuad(g, rear + 0.015, [[-0.28, 1.55], [0.28, 1.55], [0.25, 2.25], [-0.25, 2.25]], C.glass);
  truckMirrors(g, s, s.W * 0.44, 1.65, front + 1.40, C.black);
  for (const yy of [1.16, 1.34]) sideStripe(g, s, yy, 0.08, front + 1.4, rear - 0.2, C.black);
  box(g, 0, 0.95, front - 0.05, s.W * 0.42, 0.38, 0.05, C.charcoal);
  cylinderZ(g, -s.W * 0.32, 1.05, front - 0.04, 0.08, 0.05, C.head, 6);
  cylinderZ(g,  s.W * 0.32, 1.05, front - 0.04, 0.08, 0.05, C.head, 6);
  box(g, -0.45, 2.68, front + 1.6, 0.12, 0.08, 0.10, C.amber);
  box(g,  0.45, 2.68, front + 1.6, 0.12, 0.08, 0.10, C.amber);
  box(g,  0.00, 2.68, front + 1.6, 0.12, 0.08, 0.10, C.red);
  bumpers(g, s, 0.44, { w: 0.92 });
  taillights(g, s, 1.05, { x: 0.32, round: true, plate: false });
}

// 23. VAN (Burrito) — Delivery van with conforming cab windows, rear cargo windows & van mirrors
function buildVan(g, s) {
  const W = s.W, H = s.H;
  const front = -s.L / 2, rear = s.L / 2;
  const shoulder = front + 0.60;
  const cowl     = front + 1.30;
  const hips     = rear  - 0.70;
  const midZ     = (cowl + hips) / 2;

  // ---- shell: 6-ring loft
  loft(g, [
    symRing(front,       [[0.34, W * 0.340], [0.92, W * 0.390], [H - 0.16, W * 0.350]]),
    symRing(shoulder,    [[0.40, W * 0.470], [1.06, W * 0.495], [H - 0.06, W * 0.450]]),
    symRing(cowl,        [[0.44, W * 0.478], [1.20, W * 0.498], [H,        W * 0.455]]),
    symRing(midZ,        [[0.48, W * 0.482], [1.30, W * 0.498], [H,        W * 0.458]]),
    symRing(hips,        [[0.46, W * 0.477], [1.26, W * 0.492], [H - 0.02, W * 0.450]]),
    symRing(rear - 0.03, [[0.38, W * 0.400], [1.15, W * 0.440], [H - 0.12, W * 0.380]]),
  ], C.paint);

  // ---- local helpers ----
  const both = (pts, m) => { for (const k of [-1, 1]) slopedSideQuad(g, k, pts, m); };

  const sideWindow = (z0, z1, y0, y1) => {
    both([[W * 0.493, y0 - 0.04, z0 - 0.04], [W * 0.493, y0 - 0.04, z1 + 0.04],
          [W * 0.474, y1 + 0.04, z1 + 0.04], [W * 0.474, y1 + 0.04, z0 - 0.04]], C.charcoal);
    both([[W * 0.497, y0, z0], [W * 0.497, y0, z1],
          [W * 0.478, y1, z1], [W * 0.478, y1, z0]], C.glass);
  };

  const seam = (z) => both([
    [W * 0.499, 0.40, z], [W * 0.499, 0.40, z + 0.02],
    [W * 0.474, H - 0.25, z + 0.02], [W * 0.474, H - 0.25, z]
  ], C.charcoal);

  const handle = (z) => both([
    [W * 0.502, 1.18, z], [W * 0.502, 1.18, z + 0.14],
    [W * 0.502, 1.24, z + 0.14], [W * 0.502, 1.24, z]
  ], C.charcoal);

  // ---- windshield
  endQuad(g, front - 0.010, [
    [-W * 0.350, 1.24], [W * 0.350, 1.24], 
    [W * 0.310, H - 0.20], [-W * 0.310, H - 0.20]
  ], C.charcoal);
  endQuad(g, front - 0.018, [
    [-W * 0.320, 1.28], [W * 0.320, 1.28], 
    [W * 0.280, H - 0.24], [-W * 0.280, H - 0.24]
  ], C.glassLit);

  // ---- side glazing
  sideWindow(front + 0.50, front + 1.25, 1.44, H - 0.26);   // front doors
  sideWindow(front + 1.42, front + 2.55, 1.48, H - 0.22);   // sliding door + cargo

  // ---- panel seams and handles
  seam(front + 0.40);
  seam(front + 1.35);
  seam(front + 2.65);
  handle(front + 1.00);
  handle(front + 1.58);

  // ---- slider track
  both([
    [W * 0.502, 1.28, front + 1.40], [W * 0.502, 1.28, front + 2.70],
    [W * 0.502, 1.34, front + 2.70], [W * 0.502, 1.34, front + 1.40]
  ], C.charcoal);

  // ---- rocker panels
  both([
    [W * 0.490, 0.38, front + 0.75], [W * 0.490, 0.38, rear - 0.40],
    [W * 0.490, 0.55, rear - 0.40], [W * 0.490, 0.55, front + 0.75]
  ], C.charcoal);

  // ---- roof rack
  for (const z of [front + 2.00, front + 2.80]) {
    if (z < rear - 0.25) {
      endQuad(g, z, [
        [-W * 0.400, H + 0.02], [W * 0.400, H + 0.02],
        [W * 0.380, H + 0.10], [-W * 0.380, H + 0.10]
      ], C.charcoal);
    }
  }

  // ---- rear windows
  for (const k of [-1, 1]) {
    const trim = [[k * W * 0.340, 1.32], [k * W * 0.060, 1.32], 
                  [k * W * 0.060, H - 0.26], [k * W * 0.290, H - 0.26]];
    const pane = [[k * W * 0.310, 1.38], [k * W * 0.090, 1.38], 
                  [k * W * 0.090, H - 0.30], [k * W * 0.260, H - 0.30]];
    if (k > 0) { trim.reverse(); pane.reverse(); }
    endQuad(g, rear - 0.012, trim, C.charcoal);
    endQuad(g, rear - 0.020, pane, C.glass);
  }

  // ---- lights and bumpers
  mirrors(g, s, front + 1.15, 1.40, C.charcoal, W * 0.50);
  bumpers(g, s, 0.40, { w: 0.94 });
  headlights(g, s, 0.88, { x: 0.28 });
  grille(g, s, 0.72, { w: 0.44, h: 0.18 });
  grille(g, s, 0.50, { w: 0.54, h: 0.10 });   // lower intake
  taillights(g, s, 1.18, { x: 0.35, h: 0.40, w: 0.11, plate: false });
  plate(g, 0, 0.80, rear - 0.008);
}

// 24. TRUCK (Mule) — Commercial box truck with cab front windshield, side door windows & mirrors
function buildTruck(g, s) {
  const front = -s.L / 2, rear = s.L / 2;
  for (const side of [-1, 1]) box(g, side * s.W * 0.28, 0.50, 0.20, 0.10, 0.16, s.L * 0.88, C.black);
  loft(g, [
    symRing(front, [[0.40, s.W * 0.38], [1.1, s.W * 0.43], [2.15, s.W * 0.36]]),
    symRing(front + 0.9, [[0.36, s.W * 0.46], [1.4, s.W * 0.48], [2.60, s.W * 0.44]]),
    symRing(front + 2.0, [[0.36, s.W * 0.46], [1.4, s.W * 0.48], [2.70, s.W * 0.44]]),
  ], C.paint);
  const bx0 = front + 2.15;
  box(g, 0, 1.75, (bx0 + rear) / 2, s.W * 0.98, 2.55, rear - bx0 - 0.04, C.cargo);
  endQuad(g, rear + 0.02, [[-s.W * 0.42, 0.6], [s.W * 0.42, 0.6], [s.W * 0.42, 2.95], [-s.W * 0.42, 2.95]], C.metal);
  // Cab Windshield on front face
  quad(g,
    [ s.W * 0.34, 1.65, front - 0.012],
    [-s.W * 0.34, 1.65, front - 0.012],
    [-s.W * 0.30, 2.45, front + 0.12],
    [ s.W * 0.30, 2.45, front + 0.12],
    C.glassLit
  );
  // Cab side door windows right by driver
  const truckX = (y) => {
    const t = Math.max(0, Math.min(1, (y - 1.40) / (2.65 - 1.40)));
    return (1 - t) * (s.W * 0.48) + t * (s.W * 0.44) + 0.006;
  };
  for (const side of [-1, 1]) {
    slopedSideQuad(g, side, [
      [truckX(1.65), 1.65, front + 0.25],
      [truckX(1.65), 1.65, front + 1.25],
      [truckX(2.40), 2.40, front + 1.25],
      [truckX(2.40), 2.40, front + 0.35]
    ], C.glass);
    cylinderX(g, side * s.W * 0.33, 0.60, -0.20, 0.20, 0.75, C.chrome, 6);
  }
  truckMirrors(g, s, truckX(1.85), 1.85, front + 0.30, C.charcoal);
  bumpers(g, s, 0.48, { w: 0.94 });
  headlights(g, s, 0.95, { x: 0.30, w: 0.24, h: 0.16 });
  grille(g, s, 0.90, { w: 0.46, h: 0.30, chromeBars: true, badge: true });
  taillights(g, s, 0.90, { x: 0.34, plate: false });
}

// 25. SEMI (Roadtrain) — Tractor-trailer with cab front windshield, side door windows, sleeper windows & chrome mirrors
function buildSemi(g, s) {
  const front = -s.L / 2, rear = s.L / 2;
  loft(g, [
    symRing(front, [[0.44, s.W * 0.38], [1.3, s.W * 0.43], [2.48, s.W * 0.36]]),
    symRing(front + 1.8, [[0.40, s.W * 0.46], [1.5, s.W * 0.48], [2.90, s.W * 0.43]]),
    symRing(front + 4.4, [[0.40, s.W * 0.46], [1.5, s.W * 0.48], [3.55, s.W * 0.44]]),
  ], C.paint);
  for (const side of [-1, 1]) {
    cylinderY(g, side * (s.W / 2 + 0.05), 2.50, front + 3.8, 0.055, 1.90, C.chrome, 6);
    box(g, side * s.W * 0.34, 0.60, front + 2.4, 0.18, 0.36, 1.0, C.chrome);
  }
  const tz0 = front + 4.60;
  box(g, 0, 2.05, (tz0 + rear - 0.5) / 2, s.W * 0.98, 2.65, rear - 0.5 - tz0, C.cargo);
  box(g, 0, 0.95, (tz0 + rear) / 2, s.W * 0.58, 0.18, rear - tz0, C.black);
  endQuad(g, rear + 0.02, [[-s.W * 0.43, 0.75], [s.W * 0.43, 0.75], [s.W * 0.43, 3.25], [-s.W * 0.43, 3.25]], C.metal);

  // Cab Windshield on the cab front face
  quad(g,
    [ s.W * 0.34, 1.95, front - 0.012],
    [-s.W * 0.34, 1.95, front - 0.012],
    [-s.W * 0.30, 2.85, front + 0.12],
    [ s.W * 0.30, 2.85, front + 0.12],
    C.glassLit
  );

  // Cab side windows + sleeper windows
  const semiX = (y) => {
    const t = Math.max(0, Math.min(1, (y - 1.50) / (3.55 - 1.50)));
    return (1 - t) * (s.W * 0.48) + t * (s.W * 0.44) + 0.008;
  };
  for (const side of [-1, 1]) {
    // Driver / passenger door window
    slopedSideQuad(g, side, [
      [semiX(1.95), 1.95, front + 0.28],
      [semiX(1.95), 1.95, front + 1.45],
      [semiX(2.80), 2.80, front + 1.45],
      [semiX(2.80), 2.80, front + 0.38]
    ], C.glass);
    // Sleeper cab side window
    slopedSideQuad(g, side, [
      [semiX(2.10), 2.10, front + 2.05],
      [semiX(2.10), 2.10, front + 3.20],
      [semiX(2.70), 2.70, front + 3.20],
      [semiX(2.70), 2.70, front + 2.05]
    ], C.glass);
  }
  truckMirrors(g, s, semiX(2.15), 2.15, front + 0.32, C.chrome);

  bumpers(g, s, 0.52, { w: 0.94, chrome: true });
  headlights(g, s, 1.05, { x: 0.32, w: 0.24, h: 0.16 });
  grille(g, s, 1.00, { w: 0.48, h: 0.38, chromeBars: true, badge: true });
  taillights(g, s, 1.00, { x: 0.36, plate: false });
}

// 26. MOTORCYCLE (Faggio) — Two-tone sport bike with chrome exhaust pipe & tinted screen
function buildMotorcycle(g, s) {
  box(g, 0, 0.60, 0.05, 0.12, 0.10, 1.10, C.charcoal);
  box(g, 0, 0.42, 0.48, 0.10, 0.30, 0.55, C.charcoal);
  loft(g, [
    symRing(-0.45, [[0.70, 0.12], [0.90, 0.13]]),
    symRing(0.05,  [[0.76, 0.14], [0.96, 0.14]]),
    symRing(0.35,  [[0.78, 0.13], [0.96, 0.13]]),
  ], C.paint);
  box(g, 0, 0.90, 0.52, 0.24, 0.08, 0.48, C.black);
  box(g, 0, 0.92, -0.80, 0.15, 0.13, 0.05, C.head);
  box(g, 0, 1.08, -0.60, 0.18, 0.15, 0.02, C.glass, -0.5);
  for (const side of [-1, 1]) {
    box(g, side * 0.07, 0.62, -0.62, 0.04, 0.58, 0.04, C.metal, 0.40);
    box(g, side * 0.22, 1.06, -0.44, 0.15, 0.03, 0.03, C.charcoal);
  }
  cylinderX(g, 0.14, 0.42, 0.60, 0.05, 0.80, C.chrome, 6);
  box(g, 0, 0.96, 1.02, 0.10, 0.06, 0.03, C.tail);
}

// 27. SCOOTER (Zippo) — Urban moped with Crisp White legshield & chrome rear rack
function buildScooter(g, s) {
  box(g, 0, 0.30, 0.02, 0.28, 0.06, 0.70, C.charcoal);
  loft(g, [
    symRing(-0.60, [[0.42, 0.11], [0.95, 0.10]]),
    symRing(-0.18, [[0.36, 0.13], [0.84, 0.12]]),
  ], C.white2);
  loft(g, [
    symRing(0.05, [[0.42, 0.14], [0.68, 0.13]]),
    symRing(0.45, [[0.48, 0.15], [0.72, 0.14]]),
    symRing(0.78, [[0.52, 0.12], [0.74, 0.11]]),
  ], C.paint);
  box(g, 0, 0.84, 0.50, 0.22, 0.08, 0.42, C.black);
  box(g, 0, 0.96, -0.60, 0.12, 0.10, 0.04, C.head);
  box(g, 0, 0.84,  0.72, 0.18, 0.03, 0.18, C.chrome);
  box(g, 0, 0.76,  0.82, 0.09, 0.05, 0.03, C.tail);
}

// 28. SPEEDBOAT (Speedboat) — Deep-V hull with Navy/Red speed stripes & Teak wood deck
function buildSpeedboat(g, s) {
  const front = -s.L / 2, rear = s.L / 2;
  loft(g, [
    symRing(front, [[0.30, 0.02], [0.55, 0.03], [0.75, 0.02]]),
    symRing(front + 1.1, [[0.18, s.W * 0.22], [0.5, s.W * 0.30], [0.85, s.W * 0.26]]),
    symRing(-0.4, [[0.14, s.W * 0.40], [0.55, s.W * 0.44], [1.05, s.W * 0.38]]),
    symRing(rear - 0.8, [[0.14, s.W * 0.44], [0.6, s.W * 0.47], [1.25, s.W * 0.42]]),
    symRing(rear, [[0.16, s.W * 0.44], [0.65, s.W * 0.47], [1.3, s.W * 0.44]]),
  ], C.white2);
  box(g, 0, 1.26, 0.30, s.W * 0.78, 0.05, s.L * 0.35, C.wood);
  endQuad(g, -0.50, [[-s.W * 0.30, 1.30], [s.W * 0.30, 1.30], [s.W * 0.24, 1.68], [-s.W * 0.24, 1.68]], C.glassLit);
  for (const side of [-1, 1]) {
    box(g, side * (s.W * 0.25), 0.76, -0.20, 0.018, 0.08, s.L * 0.65, C.blue);
    box(g, side * (s.W * 0.25), 0.85, -0.20, 0.018, 0.06, s.L * 0.65, C.red);
    box(g, side * 0.32, 0.60, rear + 0.12, 0.14, 0.25, 0.24, C.chrome, 0.20);
  }
}

// 29. CUSTOM VEHICLE — Sculpted from scratch with bilateral lofts, raked glass & aero diffusers
function buildCustom(g, s) {
  const front = -s.L / 2, rear = s.L / 2;
  const W = s.W, H = s.H;

  // 1. Lower chassis & main sculpted body (aerodynamic loft with bilateral symmetry)
  loft(g, [
    symRing(front, [
      [0.20, W * 0.36],
      [0.55, W * 0.44],
      [0.72, W * 0.40]
    ]),
    symRing(front + 0.85, [
      [0.18, W * 0.48],
      [0.70, W * 0.50],
      [0.82, W * 0.46]
    ]),
    symRing(0, [
      [0.16, W * 0.50],
      [0.72, W * 0.50],
      [0.86, W * 0.47]
    ]),
    symRing(rear - 0.70, [
      [0.18, W * 0.49],
      [0.72, W * 0.50],
      [0.86, W * 0.47]
    ]),
    symRing(rear, [
      [0.22, W * 0.38],
      [0.62, W * 0.44],
      [0.78, W * 0.40]
    ])
  ], C.paint);

  // 2. Aerodynamic Cockpit & Greenhouse
  loft(g, [
    symRing(-0.75, [
      [0.72, W * 0.38],
      [H - 0.04, W * 0.28]
    ]),
    symRing(0.70, [
      [0.72, W * 0.38],
      [H - 0.04, W * 0.28]
    ])
  ], C.black);

  // 3. Raked Windshield (angled smoothly back into roofline)
  quad(g,
    [ W * 0.36, 0.73, -0.74],
    [-W * 0.36, 0.73, -0.74],
    [-W * 0.26, H - 0.05, -0.22],
    [ W * 0.26, H - 0.05, -0.22],
    C.glassLit
  );

  // 4. Sloping Side Glass (mirrored for driver & passenger sides)
  for (const side of [-1, 1]) {
    slopedSideQuad(g, side, [
      [W * 0.38, 0.73, -0.55],
      [W * 0.38, 0.73, 0.60],
      [W * 0.27, H - 0.05, 0.50],
      [W * 0.27, H - 0.05, -0.15]
    ], C.glass);
  }

  // 5. Rear Glass / Hatch
  endQuad(g, 0.71, [
    [-W * 0.26, 0.73],
    [ W * 0.26, 0.73],
    [ W * 0.22, H - 0.05],
    [-W * 0.22, H - 0.05]
  ], C.glass);

  // 6. Front Splitter & Rear Diffuser
  box(g, 0, 0.16, front - 0.02, W * 0.90, 0.04, 0.22, C.black);
  box(g, 0, 0.20, rear + 0.02, W * 0.86, 0.08, 0.18, C.black);

  // 7. Lighting, Mirrors & Dual Chrome Exhausts
  headlights(g, s, 0.52, { x: 0.30, w: 0.24, h: 0.10, indicator: false });
  taillights(g, s, 0.62, { x: 0.30, w: 0.26, h: 0.10, plate: false });
  mirrors(g, s, -0.25, 0.74, C.black, W * 0.40);
  plate(g, 0, 0.42, rear + 0.04);
  exhaustTips(g, [
    { x: -W * 0.28, y: 0.28, z: rear + 0.06 },
    { x:  W * 0.28, y: 0.28, z: rear + 0.06 }
  ]);
}

// ---------------------------------------------------------------------------
// Vehicle Blueprints & Dimensions
// ---------------------------------------------------------------------------
const SPECS = {
  custom_vehicle: { L: 4.60, W: 2.15, H: 1.25, wb: 2.70, wheel: 0.35, kind: 'custom', feature: 'Custom Design' },
  compact:  { L: 3.60, W: 1.66, H: 1.52, wb: 2.30, wheel: 0.32, kind: 'compact', feature: 'Dilettante' },
  hatchback:{ L: 4.10, W: 1.76, H: 1.48, wb: 2.56, wheel: 0.34, kind: 'hatchback', feature: 'Blista' },
  sedan:    { L: 4.62, W: 1.82, H: 1.46, wb: 2.74, wheel: 0.35, kind: 'sedan', feature: 'Sentinel' },
  wagon:    { L: 4.90, W: 1.82, H: 1.54, wb: 2.84, wheel: 0.35, kind: 'wagon', feature: 'Regina' },
  coupe:    { L: 4.42, W: 1.86, H: 1.28, wb: 2.62, wheel: 0.35, kind: 'coupe', feature: 'Banshee' },
  muscle:   { L: 4.94, W: 1.92, H: 1.36, wb: 2.90, wheel: 0.37, kind: 'muscle', feature: 'Sabre' },
  suv:      { L: 4.78, W: 1.96, H: 1.84, wb: 2.86, wheel: 0.42, kind: 'suv', feature: 'Patriot' },
  minivan:  { L: 5.08, W: 1.98, H: 1.90, wb: 3.04, wheel: 0.38, kind: 'minivan', feature: 'Moonbeam' },
  taxi:     { L: 4.70, W: 1.84, H: 1.52, wb: 2.78, wheel: 0.36, kind: 'taxi', feature: 'Cabbie' },
  van:      { L: 5.30, W: 1.98, H: 2.18, wb: 3.20, wheel: 0.38, kind: 'van', feature: 'Burrito' },
  pickup:   { L: 5.30, W: 1.94, H: 1.82, wb: 3.22, wheel: 0.42, kind: 'pickup', feature: 'Bobcat' },
  offroad:  { L: 4.58, W: 1.94, H: 1.72, wb: 2.62, wheel: 0.46, kind: 'offroad', feature: 'Rancher' },
  limo:     { L: 8.40, W: 1.86, H: 1.50, wb: 5.60, wheel: 0.36, kind: 'limo', feature: 'Stretch' },
  supercar: { L: 4.40, W: 1.96, H: 1.14, wb: 2.66, wheel: 0.34, kind: 'supercar', feature: 'Infernus' },
  scooter:  { L: 1.86, W: 0.66, H: 1.34, wb: 1.20, wheel: 0.24, kind: 'scooter', feature: 'Zippo' },
  motorcycle:{ L: 2.16, W: 0.72, H: 1.34, wb: 1.42, wheel: 0.30, kind: 'motorcycle', feature: 'Faggio' },
  police:   { L: 4.82, W: 1.88, H: 1.54, wb: 2.84, wheel: 0.36, kind: 'police', feature: 'Cruiser' },
  police_suv: { L: 5.06, W: 2.00, H: 1.94, wb: 2.94, wheel: 0.42, kind: 'police_suv', feature: 'Interceptor' },
  police_enforcer: { L: 5.30, W: 2.10, H: 2.40, wb: 3.20, wheel: 0.42, kind: 'police_enforcer', feature: 'Enforcer' },
  ambulance:{ L: 5.60, W: 2.10, H: 2.55, wb: 3.30, wheel: 0.40, kind: 'ambulance', feature: 'Ambulance' },
  firetruck:{ L: 7.20, W: 2.36, H: 2.60, wb: 4.30, wheel: 0.48, kind: 'firetruck', feature: 'Fire Truck' },
  garbage:  { L: 7.20, W: 2.40, H: 3.00, wb: 4.20, wheel: 0.50, kind: 'garbage', feature: 'Trashmaster' },
  towtruck: { L: 5.60, W: 2.00, H: 2.05, wb: 3.30, wheel: 0.42, kind: 'towtruck', feature: 'Tow Truck' },
  bus:      { L: 11.20, W: 2.50, H: 3.05, wb: 6.60, wheel: 0.50, kind: 'bus', feature: 'Coach' },
  schoolbus:{ L: 9.80, W: 2.40, H: 2.70, wb: 5.60, wheel: 0.48, kind: 'schoolbus', feature: 'School Bus' },
  truck:    { L: 7.60, W: 2.40, H: 3.15, wb: 4.60, wheel: 0.50, kind: 'truck', feature: 'Mule' },
  semi:     { L: 15.60, W: 2.50, H: 3.70, wb: 5.90, wheel: 0.52, kind: 'semi', feature: 'Roadtrain' },
  speedboat:{ L: 6.20, W: 2.30, H: 2.20, wb: 0, wheel: 0, kind: 'speedboat', feature: 'Speedboat' },
};

const AXLES = {
  semi: [-4.8, 4.8],
  firetruck: [-2.6, 1.7],
  garbage: [-2.5, 1.7],
  truck: [-2.6, 1.6],
  bus: [-3.6, 2.6],
  schoolbus: [-3.0, 2.6],
  limo: [-2.4, 2.4],
};

// ---------------------------------------------------------------------------
// GLB writer (binary glTF 2.0, single vertex-color material)
// ---------------------------------------------------------------------------
function minMax(values, stride) {
  const min = Array(stride).fill(Infinity);
  const max = Array(stride).fill(-Infinity);
  for (let i = 0; i < values.length; i++) {
    const c = i % stride;
    min[c] = Math.min(min[c], values[i]);
    max[c] = Math.max(max[c], values[i]);
  }
  return [min, max];
}

function makeGLB(id, spec) {
  const body = geom();
  BUILDERS[spec.kind](body, spec);
  const wheel = wheelGeometry(spec.wheel, Math.max(0.18, spec.W * 0.12));

  const chunks = [], views = [], accessors = [];
  let offset = 0;
  const pad4 = () => { while (offset % 4) { chunks.push(Buffer.alloc(1)); offset++; } };
  const push = (values, componentType, type, stride, target) => {
    pad4();
    const typed = componentType === 5126 ? new Float32Array(values) : new Uint32Array(values);
    const buf = Buffer.from(typed.buffer);
    views.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, target });
    chunks.push(buf);
    offset += buf.length;
    const [min, max] = minMax(values, stride);
    const accessor = accessors.length;
    accessors.push({ bufferView: views.length - 1, componentType, count: values.length / stride, type, min, max });
    return accessor;
  };

  const meshFor = (geometry, name) => {
    const position = push(geometry.p, 5126, 'VEC3', 3, 34962);
    const normal = push(geometry.n, 5126, 'VEC3', 3, 34962);
    const color = push(geometry.c, 5126, 'VEC3', 3, 34962);
    const indices = push(geometry.i, 5125, 'SCALAR', 1, 34963);
    return { name, primitives: [{ attributes: { POSITION: position, NORMAL: normal, COLOR_0: color }, indices, material: 0 }] };
  };

  const meshes = [meshFor(body, 'BodyMesh')];
  const nodes = [{ name: id, children: [1] }, { name: 'Body', mesh: 0 }];
  const isTwoWheeler = spec.kind === 'motorcycle' || spec.kind === 'scooter';

  if (spec.wheel > 0) {
    meshes.push(meshFor(wheel, 'WheelMesh'));
    const wheelMesh = meshes.length - 1;
    if (isTwoWheeler) {
      nodes[0].children = [1, 2, 3];
      nodes.push({ name: 'Wheel_Front', translation: [0, spec.wheel, -s_frontZ(spec)], mesh: wheelMesh });
      nodes.push({ name: 'Wheel_Rear', translation: [0, spec.wheel, s_rearZ(spec)], mesh: wheelMesh });
    } else {
      const axles = AXLES[id] || [-spec.wb / 2, spec.wb / 2];
      const wx = spec.W / 2 - Math.max(0.18, spec.W * 0.12) * 0.40;
      for (const [name, x, z] of [
        ['Wheel_FL', -wx, axles[0]], ['Wheel_FR', wx, axles[0]],
        ['Wheel_RL', -wx, axles[1]], ['Wheel_RR', wx, axles[1]],
      ]) {
        nodes[0].children.push(nodes.length);
        nodes.push({ name, translation: [x, spec.wheel, z], mesh: wheelMesh });
      }
    }
  }

  const json = {
    asset: { version: '2.0', generator: GENERATOR },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes, meshes,
    materials: [{
      name: 'LowPolyVertexColor',
      pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.86 },
      doubleSided: true,
    }],
    buffers: [{ byteLength: offset }],
    bufferViews: views, accessors,
  };

  const jsonBuf = Buffer.from(JSON.stringify(json));
  const jsonPad = Buffer.alloc((4 - jsonBuf.length % 4) % 4, 0x20);
  const bin = Buffer.concat(chunks);
  const binPad = Buffer.alloc((4 - bin.length % 4) % 4);
  const total = 12 + 8 + jsonBuf.length + jsonPad.length + 8 + bin.length + binPad.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8);
  jh.writeUInt32LE(jsonBuf.length + jsonPad.length, 0);
  jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8);
  bh.writeUInt32LE(bin.length + binPad.length, 0);
  bh.writeUInt32LE(0x004e4942, 4);
  return {
    buffer: Buffer.concat([header, jh, jsonBuf, jsonPad, bh, bin, binPad]),
    tris: (body.i.length + (spec.wheel > 0 ? wheel.i.length * (isTwoWheeler ? 2 : 4) : 0)) / 3,
    bodyTris: body.i.length / 3,
    wheelTris: spec.wheel > 0 ? wheel.i.length / 3 : 0,
  };
}

function s_frontZ(spec) { return spec.kind === 'motorcycle' ? -0.77 : -0.62; }
function s_rearZ(spec) { return spec.kind === 'motorcycle' ? 0.77 : 0.62; }

const BUILDERS = {
  custom: buildCustom, custom_vehicle: buildCustom,
  compact: buildCompact, hatchback: buildHatchback, sedan: buildSedan,
  wagon: buildWagon, coupe: buildCoupe, muscle: buildMuscle, suv: buildSuv,
  minivan: buildMinivan, taxi: buildTaxi, van: buildVan, pickup: buildPickup,
  offroad: buildOffroad, limo: buildLimo, supercar: buildSupercar,
  motorcycle: buildMotorcycle, scooter: buildScooter, police: buildPolice,
  police_suv: buildPoliceSuv, police_enforcer: buildEnforcer,
  ambulance: buildAmbulance, firetruck: buildFiretruck, garbage: buildGarbage,
  towtruck: buildTowtruck, bus: buildBus, schoolbus: buildSchoolbus,
  truck: buildTruck, semi: buildSemi, speedboat: buildSpeedboat,
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

  return {
    C, geom, tri, quad, box, panel, symRing, loft, cylinderX, cylinderY, cylinderZ,
    sideQuad, slopedSideQuad, endQuad, wheelGeometry, headlights, taillights, plate,
    grille, bumpers, mirrors, truckMirrors, exhaustTips, roofRails, lightbar, pushBar,
    sideStripe, bodyLoft, greenhouse, roadCar,
    SPECS, AXLES, s_frontZ, s_rearZ, BUILDERS,
    buildCustom,
    buildCompact, buildHatchback, buildSedan, buildWagon, buildCoupe, buildMuscle,
    buildSuv, buildMinivan, buildTaxi, buildVan, buildPickup, buildOffroad,
    buildLimo, buildSupercar, buildMotorcycle, buildScooter, buildPolice,
    buildPoliceSuv, buildEnforcer, buildAmbulance, buildFiretruck, buildGarbage,
    buildTowtruck, buildBus, buildSchoolbus, buildTruck, buildSemi, buildSpeedboat,
  };
});
