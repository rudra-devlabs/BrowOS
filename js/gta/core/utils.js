    // ===========================================================================
    // UTIL
    // ===========================================================================
    const TAU = Math.PI * 2;
    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
    const lerp = (a, b, t) => a + (b - a) * t;
    const sign = (v) => v < 0 ? -1 : v > 0 ? 1 : 0;
    const rand = (a, b) => a + Math.random() * (b - a);
    const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
    const pick = (arr, rng) => arr[((rng ? rng() : Math.random()) * arr.length) | 0];
    const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
    const dist2 = (ax, az, bx, bz) => (bx - ax) * (bx - ax) + (bz - az) * (bz - az);

    /**
     * Deterministic RNG (mulberry32). The city layout is generated with a fixed
     * seed so buildings land in the same place across sessions and save files.
     */
    function mulberry32(seed) {
        let a = seed >>> 0;
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    /** HSL to RGB triple [0..1] — for graffiti / ped clothing colors. */
    function hsl2rgb(h, s, l) {
        h = ((h % 360) + 360) % 360 / 360;
        if (s === 0) return [l, l, l];
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        const f = (t) => {
            t = ((t % 1) + 1) % 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
    }

    /** Format integer as $1,234,567. */
    const money = (n) => '$' + Math.max(0, n | 0).toLocaleString('en-US');

    /** Angle difference wrapped to [-PI, PI]. */
    function angleDelta(a, b) {
        let d = (b - a) % TAU;
        if (d > Math.PI) d -= TAU;
        if (d < -Math.PI) d += TAU;
        return d;
    }
