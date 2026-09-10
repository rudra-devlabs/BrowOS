    // ===========================================================================
    // GEO — GeoBatch: an accumulator that merges primitives into one BufferGeometry
    // ===========================================================================
    /**
     * GeoBatch collects transformed vertices directly into typed-array-ready
     * JS arrays (positions, normals, uvs, colors, indices) and can produce a
     * single BufferGeometry. All city statics funnel through here, so the whole
     * island costs a handful of merged meshes per chunk instead of thousands
     * of THREE.Mesh objects.
     */
    class GeoBatch {
        constructor() {
            this.pos = []; this.nor = []; this.uv = []; this.col = [];
            this.idx = []; this.v = 0;
        }
        get empty() { return this.v === 0; }

        /** Push one vertex. */
        _vert(x, y, z, nx, ny, nz, u, vv, c) {
            const vx = (typeof x === 'number' && !isNaN(x)) ? x : 0;
            const vy = (typeof y === 'number' && !isNaN(y)) ? y : 0;
            const vz = (typeof z === 'number' && !isNaN(z)) ? z : 0;
            this.pos.push(vx, vy, vz);
            this.nor.push(nx || 0, ny || 0, nz || 0);
            this.uv.push(u || 0, vv || 0);
            this.col.push(c ? (c[0] || 0) : 0, c ? (c[1] || 0) : 0, c ? (c[2] || 0) : 0);
            return this.v++;
        }

        /**
         * General quad. Vertices are ordered as SEEN FROM OUTSIDE the face:
         * A = bottom-left, B = top-left, C = top-right, D = bottom-right.
         * This winds counter-clockwise from outside, so front faces survive
         * backface culling. uv is either null or [u0,v0,u1,v1] mapped
         * A->(u0,v0), B->(u0,v1), C->(u1,v1), D->(u1,v0) — v grows upward.
         * All windings in this class were derived numerically — do not
         * reorder vertices casually.
         */
        quad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, nx, ny, nz, colr, uv) {
            const u0 = uv ? uv[0] : 0, v0 = uv ? uv[1] : 0;
            const u1 = uv ? uv[2] : 1, v1 = uv ? uv[3] : 1;
            const a = this._vert(ax, ay, az, nx, ny, nz, u0, v0, colr);
            const b = this._vert(bx, by, bz, nx, ny, nz, u0, v1, colr);
            const c = this._vert(cx, cy, cz, nx, ny, nz, u1, v1, colr);
            const d = this._vert(dx, dy, dz, nx, ny, nz, u1, v0, colr);
            this.idx.push(a, b, c, a, c, d);
        }

        tri(ax, ay, az, bx, by, bz, cx, cy, cz, nx, ny, nz, colr, uv) {
            const u0 = uv ? uv[0] : 0, v0 = uv ? uv[1] : 0;
            const u1 = uv ? uv[2] : 1, v1 = uv ? uv[3] : 1;
            const a = this._vert(ax, ay, az, nx, ny, nz, u0, v0, colr);
            const b = this._vert(bx, by, bz, nx, ny, nz, u0, v1, colr);
            const c = this._vert(cx, cy, cz, nx, ny, nz, u1, v1, colr);
            this.idx.push(a, b, c);
        }

        /**
         * Axis-aligned box centered at (cx,cy,cz) with full sizes sx,sy,sz.
         * color: [r,g,b] 0..1. opts.uvTile: meters per texture tile (facade
         * repeat baked per face); opts.noTop / opts.noBottom to drop faces.
         */
        box(cx, cy, cz, sx, sy, sz, colr, opts) {
            const o = opts || {};
            const hx = sx / 2, hy = sy / 2, hz = sz / 2;
            const t = o.uvTile || 1; // meters per tile
            const uvFace = (w, h) => [0, 0, w / t, h / t];
            const x0 = cx - hx, x1 = cx + hx, y0 = cy - hy, y1 = cy + hy, z0 = cz - hz, z1 = cz + hz;
            // +Z (south face)
            this.quad(x1, y0, z1, x1, y1, z1, x0, y1, z1, x0, y0, z1, 0, 0, 1, colr, uvFace(sx, sy));
            // -Z (north face)
            this.quad(x0, y0, z0, x0, y1, z0, x1, y1, z0, x1, y0, z0, 0, 0, -1, colr, uvFace(sx, sy));
            // +X (east face)
            this.quad(x1, y0, z0, x1, y1, z0, x1, y1, z1, x1, y0, z1, 1, 0, 0, colr, uvFace(sz, sy));
            // -X (west face)
            this.quad(x0, y0, z1, x0, y1, z1, x0, y1, z0, x0, y0, z0, -1, 0, 0, colr, uvFace(sz, sy));
            // +Y (roof)
            if (!o.noTop) {
                this.quad(x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0, 0, 1, 0, colr, uvFace(sx, sz));
            }
            // -Y (underside)
            if (!o.noBottom) {
                this.quad(x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, 0, -1, 0, colr, uvFace(sx, sz));
            }
        }

        /**
         * Vertical cylinder approximated with quads (no caps unless capped).
         * r may differ top/bottom (cones, water towers).
         */
        /**
         * Vertical cylinder approximated with quads (no caps unless capped).
         * r may differ top/bottom (cones, water towers).
         * (cx, cy, cz) is the center of the cylinder. Extends from cy - h/2 to cy + h/2.
         */
        cylinderY(cx, cy, cz, rBot, rTop, h, seg, colr, opts) {
            const o = opts || {};
            const top = o.capped === 'top' || o.capped === 'both';
            const bot = o.capped === 'bottom' || o.capped === 'both';
            const y0 = cy - h / 2;
            const y1 = cy + h / 2;
            for (let i = 0; i < seg; i++) {
                const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
                const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
                this.quad(
                    cx + c1 * rBot, y0, cz + s1 * rBot,
                    cx + c0 * rBot, y0, cz + s0 * rBot,
                    cx + c0 * rTop, y1, cz + s0 * rTop,
                    cx + c1 * rTop, y1, cz + s1 * rTop,
                    c0, 0, s0, colr, null
                );
            }
            if (top) this.disc(cx, y1, cz, rTop, seg, colr, true);
            if (bot) this.disc(cx, y0, cz, rBot, seg, colr, false);
        }

        /** Flat horizontal disc (manholes, fountains, round plazas). */
        disc(cx, cy, cz, r, seg, colr, up) {
            const ny = up ? 1 : -1;
            const center = this._vert(cx, cy, cz, 0, ny, 0, 0.5, 0.5, colr);
            for (let i = 0; i < seg; i++) {
                const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
                const p0 = this._vert(cx + Math.cos(a0) * r, cy, cz + Math.sin(a0) * r, 0, ny, 0, 0.5, 0.5, colr);
                const p1 = this._vert(cx + Math.cos(a1) * r, cy, cz + Math.sin(a1) * r, 0, ny, 0, 0.5, 0.5, colr);
                if (up) this.idx.push(center, p1, p0);
                else this.idx.push(center, p0, p1);
            }
        }

        /** Flat horizontal annular ring (fountain borders, reservoir rim paths). */
        ring(cx, cy, cz, rInner, rOuter, seg, colr, up) {
            const ny = up ? 1 : -1;
            for (let i = 0; i < seg; i++) {
                const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
                const c0 = Math.cos(a0), s0 = Math.sin(a0);
                const c1 = Math.cos(a1), s1 = Math.sin(a1);
                const i0 = this._vert(cx + c0 * rInner, cy, cz + s0 * rInner, 0, ny, 0, 0, 0, colr);
                const o0 = this._vert(cx + c0 * rOuter, cy, cz + s0 * rOuter, 0, ny, 0, 1, 0, colr);
                const o1 = this._vert(cx + c1 * rOuter, cy, cz + s1 * rOuter, 0, ny, 0, 1, 1, colr);
                const i1 = this._vert(cx + c1 * rInner, cy, cz + s1 * rInner, 0, ny, 0, 0, 1, colr);
                if (up) {
                    this.idx.push(i0, o1, o0);
                    this.idx.push(i0, i1, o1);
                } else {
                    this.idx.push(i0, o0, o1);
                    this.idx.push(i0, o1, i1);
                }
            }
        }

        /**
         * Triangular prism standing on the XZ plane, points given CCW viewed
         * from above — used for the Flatiron building and wedge lots.
         */
        prismY(p1, p2, p3, y0, y1, colr, uv) {
            const xOf = (p) => (p && typeof p.x === 'number' ? p.x : p[0]);
            const zOf = (p) => (p && typeof p.z === 'number' ? p.z : p[1]);
            const p1x = xOf(p1), p1z = zOf(p1);
            const p2x = xOf(p2), p2z = zOf(p2);
            const p3x = xOf(p3), p3z = zOf(p3);
            const t = (uv && (uv.tile || uv[0])) || 1;
            const h = y1 - y0;
            const edge = (ax, az, bx, bz) => {
                const dx = bx - ax, dz = bz - az;
                const len = Math.sqrt(dx * dx + dz * dz) || 1;
                const nx = -dz / len, nz = dx / len; // outward for +y-wound polygons
                this.quad(
                    ax, y0, az, ax, y1, az, bx, y1, bz, bx, y0, bz,
                    nx, 0, nz, colr, [0, 0, len / t, h / t]
                );
            };
            edge(p1x, p1z, p2x, p2z);
            edge(p2x, p2z, p3x, p3z);
            edge(p3x, p3z, p1x, p1z);
            // top
            const a = this._vert(p1x, y1, p1z, 0, 1, 0, 0, 0, colr);
            const b = this._vert(p2x, y1, p2z, 0, 1, 0, 1, 0, colr);
            const c = this._vert(p3x, y1, p3z, 0, 1, 0, 1, 1, colr);
            this.idx.push(a, b, c);
        }

        /** Horizontal road quad strip helper lives in CityBuilder. */

        /** Number of vertices pushed so far (0 = empty batch). */
        count() {
            return this.v;
        }

        /**
         * Build the merged BufferGeometry. Returns null if nothing was pushed.
         */
        buildGeometry() {
            if (this.v === 0) return null;
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
            g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
            g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
            g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
            g.setIndex(this.idx);
            g.computeBoundingSphere();
            g.computeBoundingBox();
            return g;
        }

        /** Build a THREE.Mesh for this batch. */
        buildMesh(material) {
            const g = this.buildGeometry();
            if (!g) return null;
            const m = new THREE.Mesh(g, material);
            m.castShadow = true;
            m.receiveShadow = true;
            return m;
        }
    }

    /** Color helpers — hex to [r,g,b] 0..1 with optional lightness scale. */
    function col3(hex, scale) {
        const s = scale === undefined ? 1 : scale;
        return [
            ((hex >> 16) & 0xff) / 255 * s,
            ((hex >> 8) & 0xff) / 255 * s,
            (hex & 0xff) / 255 * s,
        ];
    }
    /** Slight per-instance tint jitter for facade variety. */
    function tintJitter(base, rng, amt) {
        const a = 1 + (rng() - 0.5) * 2 * amt;
        return [base[0] * a, base[1] * a, base[2] * a];
    }

    // The deterministic city RNG — fixed seed so the island is identical
    // every session (saves stay valid, landmarks keep their surroundings).
    const cityRng = mulberry32(20260904);
