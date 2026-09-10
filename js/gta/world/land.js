    // ===========================================================================
    // LAND — island land mask + shore queries
    // ===========================================================================
    const BROOKLYN_POLY = [
        [BROOKLYN.x1, BROOKLYN.z1], [BROOKLYN.x2, BROOKLYN.z1],
        [BROOKLYN.x2, BROOKLYN.z2], [BROOKLYN.x1, BROOKLYN.z2],
    ];
    const STATUE_POLY = (function () {
        // Organic harbor islet instead of a survey rectangle: radial swells
        // around the statue base. No roads or blocks derive from it, so any
        // small blob is safe — LandMask follows this poly directly.
        const pts = [], N = 18;
        for (let k = 0; k < N; k++) {
            const a = (k / N) * Math.PI * 2;
            const w = 1 + 0.22 * Math.sin(a * 3 + 1.2) + 0.12 * Math.sin(a * 5 + 0.5);
            const rx = 58 * w, rz = 42 * (1 + 0.18 * Math.sin(a * 2 + 2.0) + 0.10 * Math.sin(a * 4 + 1.0));
            pts.push([
                Math.round((STATUE.x + Math.cos(a) * rx) * 10) / 10,
                Math.round((STATUE.z + Math.sin(a) * rz) * 10) / 10,
            ]);
        }
        return pts;
    })();

    function pointInPoly(px, pz, poly) {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
            if (((zi > pz) !== (zj > pz)) &&
                (px < (xj - xi) * (pz - zi) / (zj - zi) + xi)) inside = !inside;
        }
        return inside;
    }

    const LandMask = {
        /** Inside Manhattan, Brooklyn, the statue island, or Paradise Valley? */
        inside(x, z) {
            if (x >= BROOKLYN.x1 && x <= BROOKLYN.x2 && z >= BROOKLYN.z1 && z <= BROOKLYN.z2) return true;
            if (typeof QUEENS !== 'undefined' && x >= QUEENS.x1 && x <= QUEENS.x2 && z >= QUEENS.z1 && z <= QUEENS.z2) return true;
            if (typeof QUEENS_POLY !== 'undefined' && pointInPoly(x, z, QUEENS_POLY)) return true;
            if (typeof VICE_SHORES_POLY !== 'undefined' && pointInPoly(x, z, VICE_SHORES_POLY)) return true;
            if (typeof GOVERNORS !== 'undefined' && x >= GOVERNORS.x1 && x <= GOVERNORS.x2 + 2 && z >= GOVERNORS.z1 && z <= GOVERNORS.z2) return true;
            if (typeof GOVERNORS_POLY !== 'undefined' && pointInPoly(x, z, GOVERNORS_POLY)) return true;
            if (pointInPoly(x, z, STATUE_POLY)) return true;
            if (x >= 155 && x <= 220 && z >= 3575 && z <= 3625) return true; // Liberty Island arrival court & plaza
            if (typeof PARADISE !== 'undefined') {
                if (x >= PARADISE.x1 && x <= PARADISE.x2 + 2 && z >= PARADISE.zSouth1 && z <= PARADISE.zSouth2) return true;
                if (x >= PARADISE.x1 && x <= PARADISE.x2 + 2 && z >= PARADISE.zNorth1 && z <= PARADISE.zNorth2) return true;
            }
            if (typeof PARADISE_SOUTH_POLY !== 'undefined' && pointInPoly(x, z, PARADISE_SOUTH_POLY)) return true;
            if (typeof PARADISE_NORTH_POLY !== 'undefined' && pointInPoly(x, z, PARADISE_NORTH_POLY)) return true;
            return pointInPoly(x, z, ISLAND);
        },
        /** For a horizontal line at z, the [minX, maxX] span of Manhattan land. */
        xRangeAtZ(z) {
            const xs = [];
            for (let i = 0, j = ISLAND.length - 1; i < ISLAND.length; j = i++) {
                const [xi, zi] = ISLAND[i], [xj, zj] = ISLAND[j];
                if ((zi > z) !== (zj > z)) xs.push(xi + (xj - xi) * (z - zi) / (zj - zi));
            }
            if (!xs.length) return null;
            return [Math.min.apply(null, xs), Math.max.apply(null, xs)];
        },
        /** For a vertical line at x, the [minZ, maxZ] span of Manhattan land. */
        zRangeAtX(x) {
            const zs = [];
            for (let i = 0, j = ISLAND.length - 1; i < ISLAND.length; j = i++) {
                const [xi, zi] = ISLAND[i], [xj, zj] = ISLAND[j];
                if ((xi > x) !== (xj > x)) zs.push(zi + (zj - zi) * (x - xi) / (xj - xi));
            }
            if (!zs.length) return null;
            return [Math.min.apply(null, zs), Math.max.apply(null, zs)];
        },
    };

    // ===========================================================================
    // WAVES — single source of truth for water motion.
    // The GPU vertex shader is GENERATED from these tables (see textures.js),
    // so visuals and physics can never drift apart. Each wave:
    //   { dx, dz } unit travel direction, freq (spatial), amp (height),
    //   speed (temporal), gerst (Gerstner horizontal sharpness, visual only).
    // Gerstner xz-displacement is shader-only; surface HEIGHT is identical in
    // JS and GLSL, which is all the physics queries need.
    // ===========================================================================
    const SEA_BASE = -0.4;
    const SEA_WAVES = [
        { dx: 0.958, dz: 0.287, freq: 0.045, amp: 0.075, speed: 1.4, gerst: 0.55 },
        { dx: -0.371, dz: 0.928, freq: 0.060, amp: 0.050, speed: 1.1, gerst: 0.45 },
        { dx: 0.707, dz: -0.707, freq: 0.110, amp: 0.028, speed: 1.9, gerst: 0.0 },
        { dx: -0.196, dz: -0.981, freq: 0.210, amp: 0.014, speed: 2.6, gerst: 0.0 },
    ];
    const PONDS = [
        { cx: 592, cz: 930, r: 86, base: 0.11 },   // Central Park Reservoir
        { cx: 580, cz: 1365, r: 44, base: 0.11 },  // Central Park Lake
    ];
    const POND_WAVES = [
        { dx: 1.0, dz: 0.0, freq: 0.080, amp: 0.030, speed: 1.5, gerst: 0.0 },
        { dx: 0.0, dz: 1.0, freq: 0.080, amp: 0.025, speed: 1.2, gerst: 0.0 },
    ];

    /**
     * Evaluate a wave table: returns { h, dx, dz } — height and analytic
     * surface slopes. Shared by getWaterSurface and getWaterNormal.
     */
    function evalWaves(waves, base, x, z, t) {
        let h = base, dx = 0, dz = 0;
        for (let i = 0; i < waves.length; i++) {
            const w = waves[i];
            const ph = (w.dx * x + w.dz * z) * w.freq + t * w.speed;
            const s = Math.sin(ph), c = Math.cos(ph);
            const k = w.amp * w.freq;
            h += w.amp * s;
            dx += k * c * w.dx;
            dz += k * c * w.dz;
        }
        return { h, dx, dz };
    }

    /**
     * Water surface elevation at (x, z) at time t.
     * Returns dynamic surface Y if in water, or -999 if on dry land.
     */
    function getWaterSurface(x, z, t) {
        const time = t || 0;
        for (let i = 0; i < PONDS.length; i++) {
            const p = PONDS[i];
            const dxR = x - p.cx, dzR = z - p.cz;
            if (dxR * dxR + dzR * dzR <= p.r * p.r) {
                return evalWaves(POND_WAVES, p.base, x, z, time).h;
            }
        }
        // Rivers / ocean outside land boundaries
        if (typeof LandMask !== 'undefined' && LandMask.inside(x, z)) return -999;
        return evalWaves(SEA_WAVES, SEA_BASE, x, z, time).h;
    }

    /**
     * Water surface slopes { x: dh/dx, z: dh/dz } at (x, z, t), or null on
     * dry land. Drives buoyancy pitch/roll — one call replaces separate
     * bow/stern/beam height samples.
     */
    function getWaterNormal(x, z, t) {
        const time = t || 0;
        for (let i = 0; i < PONDS.length; i++) {
            const p = PONDS[i];
            const dxR = x - p.cx, dzR = z - p.cz;
            if (dxR * dxR + dzR * dzR <= p.r * p.r) {
                const e = evalWaves(POND_WAVES, p.base, x, z, time);
                return { x: e.dx, z: e.dz };
            }
        }
        if (typeof LandMask !== 'undefined' && LandMask.inside(x, z)) return null;
        const e = evalWaves(SEA_WAVES, SEA_BASE, x, z, time);
        return { x: e.dx, z: e.dz };
    }

    // ===========================================================================
    // SHORE SDF — distance-to-shoreline field baked once at load.
    // A tiny 160x160 luminance texture over the sea plane rect lets the water
    // shader paint animated lapping foam + shallow tint along every seawall
    // with a single texture fetch. Build cost is one-off (~0.5M segment ops).
    // ===========================================================================
    const SHORE_SDF_N = 160;
    const SHORE_MAX_D = 60;
    let _shoreTex = null;

    function _ptSegDist(px, pz, ax, az, bx, bz) {
        const dx = bx - ax, dz = bz - az;
        const len2 = dx * dx + dz * dz;
        let t = len2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / len2 : 0;
        t = t < 0 ? 0 : (t > 1 ? 1 : t);
        const qx = ax + dx * t - px, qz = az + dz * t - pz;
        return Math.sqrt(qx * qx + qz * qz);
    }

    function buildShoreSDF() {
        // Rect matches the sea water plane built in city_builder._buildGround.
        const x0 = WORLD.MIN_X - 300, x1 = WORLD.MAX_X + 300;
        const z0 = WORLD.MIN_Z - 300, z1 = WORLD.MAX_Z + 300;
        const N = SHORE_SDF_N;
        const data = new Uint8Array(N * N);
        const segs = [];
        const pushPoly = (poly) => {
            for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                segs.push([poly[j][0], poly[j][1], poly[i][0], poly[i][1]]);
            }
        };
        pushPoly(ISLAND);
        pushPoly(BROOKLYN_POLY);
        pushPoly(STATUE_POLY);
        if (typeof PARADISE_SOUTH_POLY !== 'undefined') pushPoly(PARADISE_SOUTH_POLY);
        if (typeof PARADISE_NORTH_POLY !== 'undefined') pushPoly(PARADISE_NORTH_POLY);
        if (typeof QUEENS_POLY !== 'undefined') pushPoly(QUEENS_POLY);
        if (typeof VICE_SHORES_POLY !== 'undefined') pushPoly(VICE_SHORES_POLY);
        if (typeof GOVERNORS_POLY !== 'undefined') pushPoly(GOVERNORS_POLY);
        for (let j = 0; j < N; j++) {
            const z = z0 + ((j + 0.5) / N) * (z1 - z0);
            for (let i = 0; i < N; i++) {
                const x = x0 + ((i + 0.5) / N) * (x1 - x0);
                let d;
                if (LandMask.inside(x, z)) {
                    d = 0;
                } else {
                    d = Infinity;
                    for (let s = 0; s < segs.length; s++) {
                        const sg = segs[s];
                        const dd = _ptSegDist(x, z, sg[0], sg[1], sg[2], sg[3]);
                        if (dd < d) d = dd;
                    }
                    if (d > SHORE_MAX_D) d = SHORE_MAX_D;
                }
                data[j * N + i] = Math.round((d / SHORE_MAX_D) * 255);
            }
        }
        const tex = new THREE.DataTexture(data, N, N, THREE.LuminanceFormat);
        tex.magFilter = THREE.LinearFilter;
        tex.minFilter = THREE.LinearFilter;
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.needsUpdate = true;
        return { tex, x0, z0, sx: x1 - x0, sz: z1 - z0, maxD: SHORE_MAX_D };
    }

    /** Lazy singleton — safe to call from material setup at game boot. */
    function getShoreTexture() {
        if (!_shoreTex) _shoreTex = buildShoreSDF();
        return _shoreTex;
    }

    /** Minimum distance from a point to the Broadway centerline polyline. */
    function distToBroadway(x, z) {
        let best = Infinity;
        for (let i = 0; i < BROADWAY.length - 1; i++) {
            const [ax, az] = BROADWAY[i], [bx, bz] = BROADWAY[i + 1];
            const dx = bx - ax, dz = bz - az;
            const len2 = dx * dx + dz * dz;
            const t = clamp(((x - ax) * dx + (z - az) * dz) / len2, 0, 1);
            const px = ax + dx * t, pz = az + dz * t;
            const d = dist2(x, z, px, pz);
            if (d < best) best = d;
        }
        return Math.sqrt(best);
    }

    /** Point on the Broadway centerline at a given z (null if out of range). */
    function broadwayXAt(z) {
        for (let i = 0; i < BROADWAY.length - 1; i++) {
            const [ax, az] = BROADWAY[i], [bx, bz] = BROADWAY[i + 1];
            if ((z >= az && z <= bz) || (z <= az && z >= bz)) {
                const t = (z - az) / (bz - az);
                return ax + (bx - ax) * t;
            }
        }
        return null;
    }
