/* =============================================================================
   VOID TACTICS 3D  ·  BrowOS
   -----------------------------------------------------------------------------
   A full 3D arcade space-combat sim rendered with Three.js.

   Everything is generated procedurally at runtime — ship models, textures,
   explosions and all audio. The game ships with zero binary assets.

   Controls
     Move ............ W A S D  /  Arrow keys
     Fire ............ Space (hold)  or  J
     Boost ........... Shift      Brake ......... Ctrl / K
     Barrel roll ..... Q / E  (brief invulnerability, deflects fire)
     Homing missile .. F  /  Right-click (needs a lock)
     Pause ........... P      Mute ... M
   ============================================================================= */
(function () {
    'use strict';

    /* --------------------------------------------------------------------- */
    /*  Small math helpers                                                    */
    /* --------------------------------------------------------------------- */
    const TAU = Math.PI * 2;
    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
    const lerp = (a, b, t) => a + (b - a) * t;
    const rand = (a, b) => a + Math.random() * (b - a);
    const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
    const pick = (arr) => arr[(Math.random() * arr.length) | 0];
    /** Frame-rate independent exponential smoothing. */
    const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

    /**
     * Squared distance from point C to the segment AB.
     * Projectiles travel up to ~11 units per frame, far more than a hitbox is
     * wide, so every projectile test is swept along its path — otherwise shots
     * tunnel straight through targets whenever the frame rate dips.
     */
    function segPointDistSq(ax, ay, az, bx, by, bz, cx, cy, cz) {
        const dx = bx - ax, dy = by - ay, dz = bz - az;
        const len2 = dx * dx + dy * dy + dz * dz;
        let t = 0;
        if (len2 > 1e-9) {
            t = ((cx - ax) * dx + (cy - ay) * dy + (cz - az) * dz) / len2;
            t = clamp(t, 0, 1);
        }
        const qx = ax + dx * t, qy = ay + dy * t, qz = az + dz * t;
        const ex = cx - qx, ey = cy - qy, ez = cz - qz;
        return ex * ex + ey * ey + ez * ez;
    }

    /** Swept segment-vs-axis-aligned-box test (used for the boss hull). */
    function segBoxHit(ax, ay, az, bx, by, bz, hx, hy, hz, sx, sy, sz) {
        const dx = bx - ax, dy = by - ay, dz = bz - az;
        const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy, dz) / 2));
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            if (Math.abs(ax + dx * t - hx) < sx &&
                Math.abs(ay + dy * t - hy) < sy &&
                Math.abs(az + dz * t - hz) < sz) return true;
        }
        return false;
    }

    /* --------------------------------------------------------------------- */
    /*  Persistence                                                           */
    /* --------------------------------------------------------------------- */
    const SAVE_KEY = 'browos.voidtactics3d.v1';

    const DEFAULT_SAVE = {
        credits: 0,
        best: 0,
        bestWave: 0,
        chassis: 'scout',
        owned: ['scout'],
        upgrades: { hull: 0, laser: 0, engine: 0, missiles: 0, shield: 0 },
        muted: false
    };

    function loadSave() {
        try {
            const raw = localStorage.getItem(SAVE_KEY);
            if (!raw) return JSON.parse(JSON.stringify(DEFAULT_SAVE));
            const s = JSON.parse(raw);
            const out = JSON.parse(JSON.stringify(DEFAULT_SAVE));
            if (typeof s.credits === 'number') out.credits = Math.max(0, s.credits | 0);
            if (typeof s.best === 'number') out.best = Math.max(0, s.best | 0);
            if (typeof s.bestWave === 'number') out.bestWave = Math.max(0, s.bestWave | 0);
            if (Array.isArray(s.owned) && s.owned.length) out.owned = s.owned.slice();
            if (!out.owned.includes('scout')) out.owned.push('scout');
            if (s.chassis && out.owned.includes(s.chassis)) out.chassis = s.chassis;
            if (s.upgrades) {
                for (const k of Object.keys(out.upgrades)) {
                    if (typeof s.upgrades[k] === 'number') out.upgrades[k] = clamp(s.upgrades[k] | 0, 0, 5);
                }
            }
            out.muted = !!s.muted;
            return out;
        } catch (e) {
            return JSON.parse(JSON.stringify(DEFAULT_SAVE));
        }
    }

    function writeSave(data) {
        try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* quota / private mode */ }
    }

    /* --------------------------------------------------------------------- */
    /*  Procedural audio — every sound is synthesised, no samples             */
    /* --------------------------------------------------------------------- */
    class Sfx {
        constructor() {
            this.ctx = null;
            this.ready = false;
            this.muted = false;
            this.musicTimer = null;
            this.step = 0;
            this.nextNote = 0;
        }

        init() {
            if (this.ctx) return;
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            try { this.ctx = new AC(); } catch (e) { return; }
            const c = this.ctx;
            this.master = c.createGain();
            this.master.gain.value = this.muted ? 0 : 0.5;
            this.master.connect(c.destination);
            this.sfx = c.createGain();
            this.sfx.gain.value = 0.95;
            this.sfx.connect(this.master);
            this.musicBus = c.createGain();
            this.musicBus.gain.value = 0.0001;
            this.musicBus.connect(this.master);

            // Shared white-noise buffer for explosions / drums / whooshes.
            const len = Math.floor(c.sampleRate * 2);
            const buf = c.createBuffer(1, len, c.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
            this.noiseBuffer = buf;
            this.ready = true;
        }

        resume() {
            this.init();
            if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
        }

        setMuted(m) {
            this.muted = m;
            if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05);
        }

        destroy() {
            this.stopMusic();
            if (this.ctx) { try { this.ctx.close(); } catch (e) { } }
            this.ctx = null;
            this.ready = false;
        }

        /* -- primitives ---------------------------------------------------- */
        tone(freq, dur, opts) {
            if (!this.ready) return;
            opts = opts || {};
            const c = this.ctx;
            const t = (opts.at || c.currentTime) + 0;
            const o = c.createOscillator();
            o.type = opts.type || 'square';
            o.frequency.setValueAtTime(freq, t);
            if (opts.to) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t + dur);
            const g = c.createGain();
            const peak = opts.gain == null ? 0.18 : opts.gain;
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(peak, t + Math.min(0.012, dur * 0.3));
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            o.connect(g);
            g.connect(opts.bus || this.sfx);
            o.start(t);
            o.stop(t + dur + 0.03);
        }

        noise(dur, opts) {
            if (!this.ready) return;
            opts = opts || {};
            const c = this.ctx;
            const t = opts.at || c.currentTime;
            const s = c.createBufferSource();
            s.buffer = this.noiseBuffer;
            s.playbackRate.value = opts.rate || 1;
            const f = c.createBiquadFilter();
            f.type = opts.filter || 'lowpass';
            f.frequency.setValueAtTime(opts.f0 || 1600, t);
            f.frequency.exponentialRampToValueAtTime(Math.max(40, opts.f1 || 80), t + dur);
            f.Q.value = opts.q || 1;
            const g = c.createGain();
            g.gain.setValueAtTime(opts.gain == null ? 0.25 : opts.gain, t);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            s.connect(f); f.connect(g); g.connect(opts.bus || this.sfx);
            s.start(t);
            s.stop(t + dur + 0.03);
        }

        /* -- game sounds --------------------------------------------------- */
        laser() { this.tone(1150, 0.07, { type: 'square', to: 260, gain: 0.055 }); }
        enemyLaser() { this.tone(340, 0.16, { type: 'sawtooth', to: 110, gain: 0.05 }); }
        missile() {
            const t = this.ready ? this.ctx.currentTime : 0;
            this.noise(0.5, { at: t, f0: 380, f1: 3400, filter: 'bandpass', q: 2.2, gain: 0.12 });
            this.tone(150, 0.45, { at: t, type: 'sawtooth', to: 780, gain: 0.07 });
        }
        explosion(scale) {
            const s = clamp(scale || 1, 0.4, 3);
            const t = this.ready ? this.ctx.currentTime : 0;
            this.noise(0.45 * s, { at: t, f0: 2200 * s, f1: 55, gain: 0.3 });
            this.tone(110 / s, 0.32 * s, { at: t, type: 'triangle', to: 28, gain: 0.2 });
        }
        playerHit() {
            const t = this.ready ? this.ctx.currentTime : 0;
            this.noise(0.34, { at: t, f0: 900, f1: 70, gain: 0.3 });
            this.tone(220, 0.3, { at: t, type: 'sawtooth', to: 60, gain: 0.16 });
        }
        shieldPing() {
            this.tone(1500, 0.16, { type: 'sine', to: 520, gain: 0.1 });
            this.tone(900, 0.2, { type: 'sine', to: 400, gain: 0.06 });
        }
        roll() { this.noise(0.3, { f0: 900, f1: 2600, filter: 'bandpass', q: 3, gain: 0.07 }); }
        pickup() {
            const t = this.ready ? this.ctx.currentTime : 0;
            [660, 880, 1320].forEach((f, i) => this.tone(f, 0.12, { at: t + i * 0.05, type: 'square', gain: 0.09 }));
        }
        lock() { this.tone(1760, 0.05, { type: 'sine', gain: 0.045 }); }
        bossWarn() {
            const t = this.ready ? this.ctx.currentTime : 0;
            for (let i = 0; i < 3; i++) {
                this.tone(660, 0.18, { at: t + i * 0.32, type: 'sawtooth', to: 440, gain: 0.12 });
            }
        }
        waveClear() {
            const t = this.ready ? this.ctx.currentTime : 0;
            [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, { at: t + i * 0.09, type: 'square', gain: 0.11 }));
        }
        gameOver() {
            const t = this.ready ? this.ctx.currentTime : 0;
            [440, 349, 261, 174].forEach((f, i) => this.tone(f, 0.42, { at: t + i * 0.16, type: 'sawtooth', gain: 0.14 }));
        }
        ui() { this.tone(880, 0.05, { type: 'square', gain: 0.05 }); }
        buy() {
            const t = this.ready ? this.ctx.currentTime : 0;
            [784, 1046, 1318].forEach((f, i) => this.tone(f, 0.14, { at: t + i * 0.06, type: 'triangle', gain: 0.1 }));
        }
        deny() { this.tone(160, 0.22, { type: 'square', to: 90, gain: 0.1 }); }

        /* -- procedural soundtrack ----------------------------------------- */
        startMusic() {
            this.init();
            if (!this.ready || this.musicTimer) return;
            this.musicBus.gain.cancelScheduledValues(this.ctx.currentTime);
            this.musicBus.gain.setTargetAtTime(0.22, this.ctx.currentTime, 0.6);
            this.step = 0;
            this.nextNote = this.ctx.currentTime + 0.08;
            this.musicTimer = setInterval(() => this._scheduleMusic(), 25);
        }

        stopMusic() {
            if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
            if (this.ready) this.musicBus.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.25);
        }

        _scheduleMusic() {
            if (!this.ready) return;
            const sixteenth = 60 / 138 / 4;
            while (this.nextNote < this.ctx.currentTime + 0.14) {
                this._musicStep(this.step, this.nextNote, sixteenth);
                this.nextNote += sixteenth;
                this.step++;
            }
        }

        _musicStep(s, t, spb) {
            const i = s % 16;
            const bar = Math.floor(s / 16) % 4;
            // i - VI - III - VII in A minor
            const roots = [110.00, 87.31, 130.81, 98.00];
            const chords = [
                [220.00, 261.63, 329.63],
                [174.61, 220.00, 261.63],
                [261.63, 329.63, 392.00],
                [196.00, 246.94, 293.66]
            ];
            const root = roots[bar];
            const chord = chords[bar];
            const bus = this.musicBus;

            // Bass
            const bassPat = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0];
            if (bassPat[i]) {
                this.tone(root, spb * 1.7, { at: t, type: 'sawtooth', gain: 0.16, to: root * 0.98, bus });
            }
            // Arpeggio
            const arpPat = [0, 1, 2, 1, 0, 1, 2, 1, 0, 1, 2, 1, 2, 1, 0, 2];
            this.tone(chord[arpPat[i]] * 2, spb * 0.9, { at: t, type: 'square', gain: 0.045, bus });
            // Drums
            if (i === 0 || i === 6 || i === 10) {
                this.tone(150, 0.13, { at: t, type: 'sine', to: 42, gain: 0.3, bus });
            }
            if (i === 4 || i === 12) {
                this.noise(0.14, { at: t, f0: 2600, f1: 700, gain: 0.13, bus });
            }
            if (i % 2 === 0) {
                this.noise(0.04, { at: t, f0: 9000, f1: 6000, gain: 0.035, bus });
            }
        }
    }

    /* --------------------------------------------------------------------- */
    /*  Canvas-generated textures                                             */
    /* --------------------------------------------------------------------- */
    function makeGlowTexture() {
        const c = document.createElement('canvas');
        c.width = c.height = 128;
        const g = c.getContext('2d');
        const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        grd.addColorStop(0.0, 'rgba(255,255,255,1)');
        grd.addColorStop(0.18, 'rgba(255,255,255,0.85)');
        grd.addColorStop(0.45, 'rgba(255,255,255,0.22)');
        grd.addColorStop(1.0, 'rgba(255,255,255,0)');
        g.fillStyle = grd;
        g.fillRect(0, 0, 128, 128);
        return new THREE.CanvasTexture(c);
    }

    function makeGridTexture() {
        const S = 256;
        const c = document.createElement('canvas');
        c.width = c.height = S;
        const g = c.getContext('2d');
        g.clearRect(0, 0, S, S);
        g.strokeStyle = 'rgba(90,170,255,0.85)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(0, 0); g.lineTo(S, 0);
        g.moveTo(0, 0); g.lineTo(0, S);
        g.stroke();
        g.strokeStyle = 'rgba(90,170,255,0.28)';
        g.lineWidth = 1;
        for (let i = 1; i < 4; i++) {
            const p = (S / 4) * i;
            g.beginPath(); g.moveTo(p, 0); g.lineTo(p, S); g.stroke();
            g.beginPath(); g.moveTo(0, p); g.lineTo(S, p); g.stroke();
        }
        const t = new THREE.CanvasTexture(c);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        return t;
    }

    function makeNebulaTexture() {
        const W = 512, H = 512;
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const g = c.getContext('2d');
        g.fillStyle = '#03040c';
        g.fillRect(0, 0, W, H);
        const palette = [
            [90, 40, 190], [30, 90, 200], [190, 40, 120],
            [40, 160, 190], [120, 50, 220]
        ];
        for (let i = 0; i < 70; i++) {
            const x = Math.random() * W, y = Math.random() * H;
            const r = rand(40, 190);
            const col = pick(palette);
            const grd = g.createRadialGradient(x, y, 0, x, y, r);
            const a = rand(0.05, 0.18).toFixed(3);
            grd.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${a})`);
            grd.addColorStop(1, 'rgba(0,0,0,0)');
            g.fillStyle = grd;
            g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
        }
        // sprinkle stars
        for (let i = 0; i < 400; i++) {
            const a = Math.random() * 0.7 + 0.1;
            g.fillStyle = `rgba(255,255,255,${a})`;
            const s = Math.random() < 0.9 ? 1 : 2;
            g.fillRect(Math.random() * W, Math.random() * H, s, s);
        }
        const t = new THREE.CanvasTexture(c);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        return t;
    }

    /* --------------------------------------------------------------------- */
    /*  Procedural models                                                     */
    /* --------------------------------------------------------------------- */
    function mat(color, emissive, ei) {
        return new THREE.MeshStandardMaterial({
            color: color,
            emissive: emissive === undefined ? 0x000000 : emissive,
            emissiveIntensity: ei === undefined ? 1 : ei,
            metalness: 0.75,
            roughness: 0.35,
            flatShading: true
        });
    }

    function buildPlayerShip(def) {
        const g = new THREE.Group();
        const hull = mat(0x28324e, 0x0a1020, 1);
        const accent = mat(def.color, def.color, 0.9);
        const glass = new THREE.MeshStandardMaterial({
            color: 0x0b2a4a, emissive: 0x39aaff, emissiveIntensity: 1.6,
            metalness: 0.3, roughness: 0.05, transparent: true, opacity: 0.9, flatShading: true
        });

        const fus = new THREE.Mesh(new THREE.ConeGeometry(0.62, 3.0, 6), hull);
        fus.rotation.x = -Math.PI / 2;
        g.add(fus);

        const nose = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.9, 6), accent);
        nose.rotation.x = -Math.PI / 2;
        nose.position.z = -1.9;
        g.add(nose);

        [-1, 1].forEach((s) => {
            const w = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.14, 1.1), hull);
            w.position.set(s * 1.28, -0.04, 0.44);
            w.rotation.z = s * 0.2;
            g.add(w);

            const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.16), accent);
            stripe.position.set(s * 1.3, 0.06, 0.05);
            stripe.rotation.z = s * 0.2;
            g.add(stripe);

            const fin = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.9, 0.8), accent);
            fin.position.set(s * 2.1, 0.36, 0.48);
            fin.rotation.z = s * 0.2;
            g.add(fin);
        });

        const cp = new THREE.Mesh(new THREE.SphereGeometry(0.44, 14, 10), glass);
        cp.scale.set(0.78, 0.6, 1.55);
        cp.position.set(0, 0.3, -0.32);
        g.add(cp);

        const glows = [];
        const glowMat = new THREE.MeshBasicMaterial({
            color: 0x66e0ff, transparent: true, opacity: 0.9,
            blending: THREE.AdditiveBlending, depthWrite: false
        });
        [-0.62, 0.62].forEach((x) => {
            const nz = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.7, 10), hull);
            nz.rotation.x = Math.PI / 2;
            nz.position.set(x, -0.04, 1.32);
            g.add(nz);

            const fl = new THREE.Mesh(new THREE.ConeGeometry(0.27, 1.0, 10), glowMat);
            fl.rotation.x = -Math.PI / 2;
            fl.position.set(x, -0.04, 1.95);
            g.add(fl);
            glows.push(fl);
        });

        return { group: g, glows: glows, hull: hull, accent: accent, glowMat: glowMat };
    }

    /** Shared enemy geometry cache, keyed by type. */
    const ENEMY_GEO = {};
    function enemyGeometry(type) {
        if (ENEMY_GEO[type]) return ENEMY_GEO[type];
        let g;
        switch (type) {
            case 'dart': {
                g = new THREE.OctahedronGeometry(0.95, 0);
                g.scale(1.0, 0.45, 1.35);
                break;
            }
            case 'weaver': {
                g = new THREE.IcosahedronGeometry(0.8, 0);
                g.scale(1.1, 0.6, 1.1);
                break;
            }
            case 'sentinel': {
                g = new THREE.TorusGeometry(1.05, 0.24, 8, 18);
                break;
            }
            case 'lancer': {
                g = new THREE.ConeGeometry(0.46, 2.6, 5);
                g.rotateX(-Math.PI / 2);
                break;
            }
            case 'mine': {
                g = new THREE.IcosahedronGeometry(0.85, 0);
                break;
            }
            default: {
                g = new THREE.BoxGeometry(1, 1, 1);
            }
        }
        // Marked shared so disposeGroup() never frees a geometry another enemy needs.
        g.userData.shared = true;
        ENEMY_GEO[type] = g;
        return g;
    }

    /**
     * Frees the per-instance geometries and materials of a thrown-away model.
     * Enemies and bosses build their own materials (for hit flashing), so they
     * must be released or a long run slowly leaks GPU resources.
     */
    function disposeGroup(root) {
        root.traverse((o) => {
            if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
            if (o.material) {
                const mats = Array.isArray(o.material) ? o.material : [o.material];
                mats.forEach((m) => m.dispose());
            }
        });
    }

    function buildEnemy(type) {
        const g = new THREE.Group();
        let color = 0xff4d6d;
        let accentColor = 0xffc14d;

        if (type === 'weaver') { color = 0xc86bff; accentColor = 0xff7ae0; }
        if (type === 'sentinel') { color = 0xff9f43; accentColor = 0xffdd66; }
        if (type === 'lancer') { color = 0xffe14d; accentColor = 0xff7a3d; }
        if (type === 'mine') { color = 0x4a5570; accentColor = 0xff3355; }

        const body = mat(color, color, 0.35);
        const accent = mat(accentColor, accentColor, 0.9);

        const core = new THREE.Mesh(enemyGeometry(type), body);
        g.add(core);

        if (type === 'dart' || type === 'weaver') {
            [-1, 1].forEach((s) => {
                const w = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.11, 0.62), body);
                w.position.set(s * 0.95, 0, 0.35);
                w.rotation.z = s * 0.25;
                g.add(w);
                const tip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.5), accent);
                tip.position.set(s * 1.4, 0.2, 0.35);
                g.add(tip);
            });
            const eye = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), accent);
            eye.position.set(0, 0.1, -0.75);
            g.add(eye);
            if (type === 'dart') g.rotation.y = Math.PI;
        } else if (type === 'sentinel') {
            const inner = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), accent);
            g.add(inner);
            g.userData.spin = inner;
        } else if (type === 'lancer') {
            [-1, 1].forEach((s) => {
                const f = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.62, 0.9), accent);
                f.position.set(s * 0.5, 0, 0.85);
                g.add(f);
            });
            g.rotation.y = Math.PI;
        } else if (type === 'mine') {
            for (let i = 0; i < 10; i++) {
                const sp = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.55, 5), accent);
                const a = Math.random() * TAU, b = Math.acos(rand(-1, 1));
                const dir = new THREE.Vector3(
                    Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a)
                );
                sp.position.copy(dir.clone().multiplyScalar(0.95));
                sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
                g.add(sp);
            }
            const eye = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8),
                new THREE.MeshBasicMaterial({ color: 0xff3355 }));
            g.add(eye);
            g.userData.eye = eye;
        }

        return { group: g, body: body, accent: accent };
    }

    function buildBoss(stage) {
        const g = new THREE.Group();
        const hullCol = stage % 2 === 1 ? 0x3a2440 : 0x1e2a44;
        const neon = stage % 2 === 1 ? 0xff4d6d : 0x9f7aea;
        const hull = mat(hullCol, hullCol, 0.4);
        const accent = mat(neon, neon, 1.0);

        const core = new THREE.Mesh(new THREE.BoxGeometry(10, 2.2, 5.4), hull);
        g.add(core);
        const spine = new THREE.Mesh(new THREE.BoxGeometry(6.5, 1.1, 7.2), hull);
        spine.position.z = -0.6;
        g.add(spine);

        [-1, 1].forEach((s) => {
            const pod = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.5, 3.4), hull);
            pod.position.set(s * 6.4, -0.3, 0.9);
            g.add(pod);
            const edge = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.18, 0.5), accent);
            edge.position.set(s * 6.4, 0.55, -0.75);
            g.add(edge);
            const wing = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.6, 3.0), hull);
            wing.position.set(s * 8.5, 0.9, 1.4);
            wing.rotation.z = s * 0.35;
            g.add(wing);
        });

        // Forward main cannon
        const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.15, 3.4, 10), hull);
        cannon.rotation.x = Math.PI / 2;
        cannon.position.set(0, -0.15, -3.4);
        g.add(cannon);
        const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.16, 8, 14),
            new THREE.MeshBasicMaterial({ color: neon }));
        muzzle.position.set(0, -0.15, -4.9);
        g.add(muzzle);

        // Destroyable turrets
        const turrets = [];
        const spots = [[-4.2, 1.35], [4.2, 1.35], [-7.4, -0.1], [7.4, -0.1]];
        spots.forEach((p) => {
            const tMat = mat(0x2c3448, 0x101820, 1);
            const tGrp = new THREE.Group();
            const base = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.78, 0.7, 10), tMat);
            tGrp.add(base);
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), tMat);
            dome.position.y = 0.42;
            tGrp.add(dome);
            const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.5, 8), accent);
            barrel.rotation.x = Math.PI / 2;
            barrel.position.set(0, 0.42, -0.8);
            tGrp.add(barrel);
            tGrp.position.set(p[0], p[1], -1.4);
            g.add(tGrp);
            turrets.push({ group: tGrp, mat: tMat, hp: 140, maxHp: 140, alive: true, offset: new THREE.Vector3(p[0], p[1], -1.4) });
        });

        return { group: g, hull: hull, accent: accent, turrets: turrets, muzzle: muzzle };
    }

    /* --------------------------------------------------------------------- */
    /*  GPU particle field (single draw call, additive)                       */
    /* --------------------------------------------------------------------- */
    class ParticleField {
        constructor(scene, max, texture) {
            this.max = max;
            this.count = 0;
            this.pos = new Float32Array(max * 3);
            this.col = new Float32Array(max * 3);
            this.psize = new Float32Array(max);
            this.palpha = new Float32Array(max);
            this.vel = new Float32Array(max * 3);
            this.life = new Float32Array(max);
            this.maxLife = new Float32Array(max);
            this.baseSize = new Float32Array(max);
            this.drag = new Float32Array(max);
            this.grav = new Float32Array(max);

            const geo = new THREE.BufferGeometry();
            this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
            this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
            this.aSize = new THREE.BufferAttribute(this.psize, 1).setUsage(THREE.DynamicDrawUsage);
            this.aAlpha = new THREE.BufferAttribute(this.palpha, 1).setUsage(THREE.DynamicDrawUsage);
            geo.setAttribute('position', this.aPos);
            geo.setAttribute('pcolor', this.aCol);
            geo.setAttribute('psize', this.aSize);
            geo.setAttribute('palpha', this.aAlpha);
            geo.setDrawRange(0, 0);
            geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

            const vsh = `
                attribute vec3 pcolor;
                attribute float psize;
                attribute float palpha;
                varying vec3 vCol;
                varying float vA;
                void main() {
                    vCol = pcolor;
                    vA = palpha;
                    vec4 mv = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = psize * (320.0 / max(1.0, -mv.z));
                    gl_Position = projectionMatrix * mv;
                }`;
            const fsh = `
                uniform sampler2D map;
                varying vec3 vCol;
                varying float vA;
                void main() {
                    vec4 t = texture2D(map, gl_PointCoord);
                    if (t.a < 0.01) discard;
                    gl_FragColor = vec4(vCol, 1.0) * t * vA;
                }`;

            this.material = new THREE.ShaderMaterial({
                uniforms: { map: { value: texture } },
                vertexShader: vsh,
                fragmentShader: fsh,
                blending: THREE.AdditiveBlending,
                depthTest: true,
                depthWrite: false,
                transparent: true
            });

            this.points = new THREE.Points(geo, this.material);
            this.points.frustumCulled = false;
            this.geometry = geo;
            scene.add(this.points);

            this._c = new THREE.Color();
        }

        spawn(x, y, z, vx, vy, vz, color, size, life, drag, grav) {
            let i;
            if (this.count < this.max) {
                i = this.count++;
            } else {
                // Recycle the oldest-looking slot rather than dropping the effect.
                i = (Math.random() * this.max) | 0;
            }
            const i3 = i * 3;
            this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
            this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
            this._c.set(color);
            this.col[i3] = this._c.r; this.col[i3 + 1] = this._c.g; this.col[i3 + 2] = this._c.b;
            this.baseSize[i] = size;
            this.psize[i] = size;
            this.palpha[i] = 1;
            this.life[i] = life;
            this.maxLife[i] = life;
            this.drag[i] = drag === undefined ? 1.6 : drag;
            this.grav[i] = grav || 0;
        }

        update(dt) {
            const { pos, vel, life, maxLife, psize, palpha, baseSize, drag, grav } = this;
            for (let i = this.count - 1; i >= 0; i--) {
                life[i] -= dt;
                if (life[i] <= 0) {
                    const last = --this.count;
                    if (i !== last) {
                        const a = i * 3, b = last * 3;
                        pos[a] = pos[b]; pos[a + 1] = pos[b + 1]; pos[a + 2] = pos[b + 2];
                        vel[a] = vel[b]; vel[a + 1] = vel[b + 1]; vel[a + 2] = vel[b + 2];
                        this.col[a] = this.col[b]; this.col[a + 1] = this.col[b + 1]; this.col[a + 2] = this.col[b + 2];
                        psize[i] = psize[last];
                        palpha[i] = palpha[last];
                        baseSize[i] = baseSize[last];
                        life[i] = life[last];
                        maxLife[i] = maxLife[last];
                        drag[i] = drag[last];
                        grav[i] = grav[last];
                    }
                    continue;
                }
                const i3 = i * 3;
                const d = Math.exp(-drag[i] * dt);
                vel[i3] *= d; vel[i3 + 1] *= d; vel[i3 + 2] *= d;
                vel[i3 + 1] += grav[i] * dt;
                pos[i3] += vel[i3] * dt;
                pos[i3 + 1] += vel[i3 + 1] * dt;
                pos[i3 + 2] += vel[i3 + 2] * dt;
                const t = life[i] / maxLife[i];
                palpha[i] = t * t;
                psize[i] = baseSize[i] * (0.35 + 0.65 * t);
            }
            this.aPos.needsUpdate = true;
            this.aCol.needsUpdate = true;
            this.aSize.needsUpdate = true;
            this.aAlpha.needsUpdate = true;
            this.geometry.setDrawRange(0, this.count);
        }

        dispose() {
            this.geometry.dispose();
            this.material.dispose();
        }
    }

    /* --------------------------------------------------------------------- */
    /*  Content definitions                                                   */
    /* --------------------------------------------------------------------- */
    const CHASSIS = [
        {
            id: 'scout', name: 'SCOUT CLASS', cost: 0, color: 0x63b3ed,
            hull: 100, speed: 26, fireRate: 0.135, damage: 11, shots: 1, spread: 0,
            missiles: 6, desc: 'Balanced starter interceptor. Single rapid laser.'
        },
        {
            id: 'twinfang', name: 'TWIN-FANG', cost: 1800, color: 0x48bb78,
            hull: 115, speed: 29, fireRate: 0.115, damage: 10, shots: 2, spread: 0.55,
            missiles: 8, desc: 'Twin parallel cannons. Agile, slightly tougher.'
        },
        {
            id: 'tristrike', name: 'TRI-STRIKE', cost: 4500, color: 0xf6e05e,
            hull: 130, speed: 27, fireRate: 0.125, damage: 12, shots: 3, spread: 0.16,
            missiles: 10, desc: 'Three-way spread. Excellent wave clear.'
        },
        {
            id: 'dreadnought', name: 'DREADNOUGHT', cost: 12000, color: 0x9f7aea,
            hull: 175, speed: 31, fireRate: 0.105, damage: 13, shots: 5, spread: 0.2,
            missiles: 14, desc: 'Five-way broadside on a heavy armoured frame.'
        }
    ];

    const UPGRADES = [
        { id: 'hull', name: 'HULL PLATING', max: 5, cost: (l) => 600 + l * 500, desc: (l) => `+25 max hull  (${100 + l * 25} → ${100 + (l + 1) * 25})` },
        { id: 'laser', name: 'LASER FOCUS', max: 5, cost: (l) => 700 + l * 550, desc: (l) => `+18% damage, +12% fire rate  (Lv ${l} → ${l + 1})` },
        { id: 'engine', name: 'THRUSTER COILS', max: 5, cost: (l) => 550 + l * 450, desc: (l) => `+8% speed, +20% boost regen  (Lv ${l} → ${l + 1})` },
        { id: 'missiles', name: 'MISSILE RACK', max: 4, cost: (l) => 500 + l * 400, desc: (l) => `+4 missile capacity  (Lv ${l} → ${l + 1})` },
        { id: 'shield', name: 'SHIELD MATRIX', max: 4, cost: (l) => 800 + l * 600, desc: (l) => `Faster shield recharge  (Lv ${l} → ${l + 1})` }
    ];

    const ENEMY_DEFS = {
        dart: { hp: 22, score: 100, radius: 1.5, speed: 30, fire: 1.9 },
        weaver: { hp: 18, score: 150, radius: 1.4, speed: 33, fire: 1.4 },
        sentinel: { hp: 40, score: 220, radius: 1.7, speed: 20, fire: 1.25 },
        lancer: { hp: 26, score: 260, radius: 1.5, speed: 46, fire: 2.6 },
        mine: { hp: 14, score: 90, radius: 1.4, speed: 15, fire: 0 }
    };

    /* --------------------------------------------------------------------- */
    /*  Main game                                                             */
    /* --------------------------------------------------------------------- */
    const SPAWN_Z = -175;
    const BOUNDS = { x: 21, yMin: -9, yMax: 11 };

    class VoidTactics3D {
        constructor(container) {
            this.container = container;
            this.canvas = container.querySelector('#vt-canvas');
            if (!this.canvas) return;

            this.save = loadSave();
            this.sfx = new Sfx();
            this.sfx.muted = this.save.muted;

            this.state = 'menu';           // menu | playing | paused | dead | station | howto
            this.focused = false;
            this.destroyed = false;
            this.keys = Object.create(null);

            this.time = 0;
            this.score = 0;
            this.wave = 0;
            this.combo = 0;
            this.comboTimer = 0;
            this.runCredits = 0;

            this.enemies = [];
            this.bullets = [];
            this.enemyBullets = [];
            this.missiles = [];
            this.powerups = [];
            this.rings = [];
            this.spawnQueue = [];
            this.waveTimer = 0;
            this.boss = null;
            this.shake = 0;
            this.hitFlash = 0;

            this.pointer = { x: 0, y: 0, pixelX: 0, pixelY: 0, inside: false };
            this.mouseShooting = false;

            if (!this.initRenderer()) return;
            this.buildScene();
            this.bindDom();
            this.bindInput();
            this.applyChassis();
            this.refreshMenu();

            this.clock = performance.now();
            this.rafId = requestAnimationFrame((t) => this.loop(t));
        }

        /* ----------------------------------------------------------------- */
        /*  Boot                                                              */
        /* ----------------------------------------------------------------- */
        initRenderer() {
            if (typeof THREE === 'undefined') {
                this.fatal('Three.js failed to load. Check assets/vendor/three.min.js.');
                return false;
            }
            try {
                this.renderer = new THREE.WebGLRenderer({
                    canvas: this.canvas,
                    antialias: true,
                    powerPreference: 'high-performance'
                });
            } catch (e) {
                this.fatal('WebGL is unavailable in this browser.');
                return false;
            }
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
            this.renderer.outputEncoding = THREE.sRGBEncoding;
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            this.renderer.toneMappingExposure = 1.05;
            this.renderer.setClearColor(0x02030a, 1);
            return true;
        }

        fatal(msg) {
            const el = this.container.querySelector('#vt-fatal');
            if (el) {
                el.style.display = 'flex';
                el.querySelector('.vt-fatal-msg').textContent = msg;
            }
        }

        buildScene() {
            const scene = new THREE.Scene();
            this.scene = scene;
            scene.fog = new THREE.Fog(0x05060f, 90, 340);

            this.camera = new THREE.PerspectiveCamera(68, 1, 0.1, 900);
            this.camera.position.set(0, 3, 14);

            // --- lighting -------------------------------------------------
            scene.add(new THREE.AmbientLight(0x334466, 1.1));
            const key = new THREE.DirectionalLight(0xbfd8ff, 1.5);
            key.position.set(-4, 8, 6);
            scene.add(key);
            const rim = new THREE.DirectionalLight(0xff6ec7, 0.9);
            rim.position.set(6, -3, -10);
            scene.add(rim);
            const fill = new THREE.HemisphereLight(0x4488ff, 0x110022, 0.6);
            scene.add(fill);

            // --- shared textures ------------------------------------------
            this.glowTex = makeGlowTexture();

            // --- starfield -------------------------------------------------
            const STAR_COUNT = 2600;
            const sp = new Float32Array(STAR_COUNT * 3);
            const sc = new Float32Array(STAR_COUNT * 3);
            const tint = [0xffffff, 0x9fd8ff, 0xffe6a3, 0xffb0d8];
            const tmp = new THREE.Color();
            for (let i = 0; i < STAR_COUNT; i++) {
                sp[i * 3] = rand(-180, 180);
                sp[i * 3 + 1] = rand(-110, 110);
                sp[i * 3 + 2] = rand(-620, 30);
                tmp.set(tint[(Math.random() * tint.length) | 0]);
                const b = rand(0.55, 1.0);
                sc[i * 3] = tmp.r * b; sc[i * 3 + 1] = tmp.g * b; sc[i * 3 + 2] = tmp.b * b;
            }
            const starGeo = new THREE.BufferGeometry();
            starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
            starGeo.setAttribute('color', new THREE.BufferAttribute(sc, 3));
            this.starGeo = starGeo;
            this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
                size: 1.35, sizeAttenuation: true, vertexColors: true,
                transparent: true, opacity: 0.95, depthWrite: false,
                blending: THREE.AdditiveBlending, map: this.glowTex
            }));
            this.stars.frustumCulled = false;
            scene.add(this.stars);

            // --- warp streaks (visible while boosting) ----------------------
            const LINES = 260;
            this.warpPos = new Float32Array(LINES * 6);
            this.warpSeed = new Float32Array(LINES * 3);
            for (let i = 0; i < LINES; i++) {
                this.warpSeed[i * 3] = rand(-90, 90);
                this.warpSeed[i * 3 + 1] = rand(-60, 60);
                this.warpSeed[i * 3 + 2] = rand(-400, 20);
            }
            const warpGeo = new THREE.BufferGeometry();
            this.warpAttr = new THREE.BufferAttribute(this.warpPos, 3).setUsage(THREE.DynamicDrawUsage);
            warpGeo.setAttribute('position', this.warpAttr);
            warpGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
            this.warpGeo = warpGeo;
            this.warp = new THREE.LineSegments(warpGeo, new THREE.LineBasicMaterial({
                color: 0x8fd6ff, transparent: true, opacity: 0,
                blending: THREE.AdditiveBlending, depthWrite: false
            }));
            this.warp.frustumCulled = false;
            scene.add(this.warp);

            // --- nebula backdrop -------------------------------------------
            const nebTex = makeNebulaTexture();
            nebTex.repeat.set(2, 2);
            this.nebula = new THREE.Mesh(
                new THREE.PlaneGeometry(900, 620),
                new THREE.MeshBasicMaterial({ map: nebTex, transparent: true, opacity: 0.85, depthWrite: false })
            );
            this.nebula.position.set(0, 0, -430);
            scene.add(this.nebula);

            // --- scrolling grid tunnel --------------------------------------
            const gridTex = makeGridTexture();
            this.gridTex = gridTex;
            gridTex.repeat.set(24, 60);
            const gridMat = new THREE.MeshBasicMaterial({
                map: gridTex, transparent: true, opacity: 0.42,
                blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
            });
            this.gridMat = gridMat;
            const floor = new THREE.Mesh(new THREE.PlaneGeometry(520, 900), gridMat);
            floor.rotation.x = -Math.PI / 2;
            floor.position.set(0, -17, -300);
            scene.add(floor);
            const ceil = new THREE.Mesh(new THREE.PlaneGeometry(520, 900), gridMat);
            ceil.rotation.x = Math.PI / 2;
            ceil.position.set(0, 21, -300);
            scene.add(ceil);

            // --- player ------------------------------------------------------
            this.playerModel = buildPlayerShip(
                CHASSIS.find((c) => c.id === this.save.chassis) || CHASSIS[0]
            );
            this.playerObj = this.playerModel.group;
            scene.add(this.playerObj);

            // Engine trail sprites
            this.trail = [];
            for (let i = 0; i < 26; i++) {
                const s = new THREE.Sprite(new THREE.SpriteMaterial({
                    map: this.glowTex, color: 0x59c8ff, transparent: true,
                    opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false
                }));
                s.scale.set(1.6, 1.6, 1);
                scene.add(s);
                this.trail.push({ sprite: s, life: 0, max: 1 });
            }
            this.trailIdx = 0;
            this.trailTimer = 0;

            // --- pools -------------------------------------------------------
            this.particles = new ParticleField(scene, 4000, this.glowTex);

            this.bulletGeo = new THREE.CylinderGeometry(0.13, 0.13, 3.2, 6);
            this.bulletGeo.rotateX(Math.PI / 2);
            this.bulletMat = new THREE.MeshBasicMaterial({ color: 0x7cf1ff });
            this.bulletPool = [];
            for (let i = 0; i < 160; i++) {
                const m = new THREE.Mesh(this.bulletGeo, this.bulletMat);
                m.visible = false;
                scene.add(m);
                this.bulletPool.push(m);
            }

            this.eBulletGeo = new THREE.SphereGeometry(0.3, 8, 6);
            this.eBulletMat = new THREE.MeshBasicMaterial({ color: 0xff5a7a });
            this.eBulletPool = [];
            for (let i = 0; i < 220; i++) {
                const m = new THREE.Mesh(this.eBulletGeo, this.eBulletMat);
                m.visible = false;
                scene.add(m);
                this.eBulletPool.push(m);
            }

            this.missileGeo = new THREE.ConeGeometry(0.18, 1.1, 6);
            // Tip toward +Z: Object3D.lookAt aims a mesh's +Z at the target,
            // so this way the nose actually leads instead of trailing.
            this.missileGeo.rotateX(Math.PI / 2);
            this.missileMat = new THREE.MeshBasicMaterial({ color: 0xffd166 });

            this.ringGeo = new THREE.RingGeometry(0.72, 1.0, 28);
            for (let i = 0; i < 26; i++) {
                const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({
                    color: 0xffaa55, transparent: true, opacity: 0,
                    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
                }));
                m.visible = false;
                scene.add(m);
                this.rings.push({ mesh: m, life: 0, max: 1 });
            }

            this.powerupGeo = new THREE.OctahedronGeometry(0.7, 0);
            this.powerupMats = {
                hull: new THREE.MeshStandardMaterial({ color: 0x2f9e44, emissive: 0x51cf66, emissiveIntensity: 1.2, flatShading: true }),
                missile: new THREE.MeshStandardMaterial({ color: 0xb08900, emissive: 0xffd43b, emissiveIntensity: 1.2, flatShading: true }),
                shield: new THREE.MeshStandardMaterial({ color: 0x1864ab, emissive: 0x4dabf7, emissiveIntensity: 1.2, flatShading: true }),
                credit: new THREE.MeshStandardMaterial({ color: 0x8d6b00, emissive: 0xffc078, emissiveIntensity: 1.2, flatShading: true })
            };

            // Boss beam telegraph / weapon
            this.beamGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
            this.beamGeo.rotateX(Math.PI / 2);
            this.beamGeo.translate(0, 0, 0.5);
            this.beam = new THREE.Mesh(this.beamGeo, new THREE.MeshBasicMaterial({
                color: 0xff3355, transparent: true, opacity: 0,
                blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
            }));
            this.beam.visible = false;
            scene.add(this.beam);

            // --- post-processing ---------------------------------------------
            this.composer = null;
            if (typeof THREE.UnrealBloomPass === 'function' &&
                typeof THREE.EffectComposer === 'function') {
                try {
                    const composer = new THREE.EffectComposer(this.renderer);
                    composer.addPass(new THREE.RenderPass(scene, this.camera));
                    const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(512, 512), 0.72, 0.62, 0.62);
                    composer.addPass(bloom);
                    this.bloom = bloom;
                    this.composer = composer;
                    this.useBloom = true;
                } catch (e) {
                    this.composer = null;
                    this.useBloom = false;
                }
            } else {
                this.useBloom = false;
            }
            this._fpsAccum = 0;
            this._fpsFrames = 0;

            this.resize();
            this.observer = new ResizeObserver(() => this.resize());
            this.observer.observe(this.container);

            // Idle camera framing for the menu
            this.player = {
                x: 0, y: 0, vx: 0, vy: 0,
                hull: 100, maxHull: 100, shield: 50, maxShield: 50,
                boost: 100, maxBoost: 100, missiles: 6, maxMissiles: 6,
                fireTimer: 0, roll: 0, rollDir: 1, rollTimer: 0,
                invuln: 0
            };
        }

        resize() {
            if (!this.renderer) return;
            const w = Math.max(1, this.container.clientWidth);
            const h = Math.max(1, this.container.clientHeight);
            this.width = w; this.height = h;
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(w, h, false);
            if (this.composer) this.composer.setSize(w, h);
        }

        /* ----------------------------------------------------------------- */
        /*  DOM wiring                                                        */
        /* ----------------------------------------------------------------- */
        bindDom() {
            const q = (id) => this.container.querySelector('#' + id);
            this.dom = {
                hud: q('vt-hud'),
                score: q('vt-score'),
                combo: q('vt-combo'),
                credits: q('vt-credits'),
                wave: q('vt-wave'),
                hullFill: q('vt-hull-fill'),
                hullText: q('vt-hull-text'),
                shieldFill: q('vt-shield-fill'),
                boostFill: q('vt-boost-fill'),
                missiles: q('vt-missiles'),
                boss: q('vt-boss'),
                bossFill: q('vt-boss-fill'),
                bossName: q('vt-boss-name'),
                banner: q('vt-banner'),
                bannerTitle: q('vt-banner-title'),
                bannerSub: q('vt-banner-sub'),
                menu: q('vt-menu'),
                menuBest: q('vt-menu-best'),
                menuCredits: q('vt-menu-credits'),
                menuLast: q('vt-menu-last'),
                menuShip: q('vt-menu-ship'),
                station: q('vt-station'),
                stationCredits: q('vt-station-credits'),
                stationBody: q('vt-station-body'),
                stationBack: q('vt-btn-station-back'),
                pause: q('vt-pause'),
                reticle: q('vt-reticle'),
                gameover: q('vt-gameover'),
                locks: q('vt-locks'),
                howto: q('vt-howto'),
                muteBtn: q('vt-btn-mute')
            };

            this.stage = this.container.querySelector('.vt-stage') || this.canvas || this.container;

            const click = (el, fn) => { if (el) el.addEventListener('click', (e) => { e.stopPropagation(); this.sfx.resume(); fn(); }); };

            click(q('vt-btn-launch'), () => this.startRun());
            click(q('vt-btn-station'), () => this.openStation());
            click(q('vt-btn-howto'), () => { this.dom.howto.style.display = 'flex'; });
            click(q('vt-btn-howto-back'), () => { this.dom.howto.style.display = 'none'; this.sfx.ui(); });
            click(this.dom.stationBack, () => this.closeStation());
            click(q('vt-btn-resume'), () => this.togglePause());
            click(q('vt-btn-abandon'), () => this.endRun(false));
            click(q('vt-btn-again'), () => this.startRun());
            click(q('vt-btn-menu'), () => this.toMenu());
            click(this.dom.muteBtn, () => {
                this.save.muted = !this.save.muted;
                this.sfx.setMuted(this.save.muted);
                writeSave(this.save);
                this.refreshMuteBtn();
            });
            this.refreshMuteBtn();
        }

        refreshMuteBtn() {
            if (this.dom.muteBtn) {
                this.dom.muteBtn.textContent = this.save.muted ? 'SOUND: OFF' : 'SOUND: ON';
                this.dom.muteBtn.classList.toggle('off', this.save.muted);
            }
        }

        bindInput() {
            const isTyping = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
            const stage = this.stage || this.canvas || this.container;

            this.onKeyDown = (e) => {
                if (isTyping(e.target)) return;
                const code = e.code;
                if (!this.focused) return;
                const game = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
                    'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyF',
                    'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'KeyJ', 'KeyK'];
                if (game.indexOf(code) !== -1) e.preventDefault();
                if (this.keys[code]) return;
                this.keys[code] = true;

                if (code === 'KeyP' || code === 'Escape') this.togglePause();
                if (code === 'KeyM') {
                    this.save.muted = !this.save.muted;
                    this.sfx.setMuted(this.save.muted);
                    writeSave(this.save);
                    this.refreshMuteBtn();
                }
                if (code === 'KeyF' && this.state === 'playing') this.fireMissiles();
                if ((code === 'KeyQ' || code === 'KeyE') && this.state === 'playing') {
                    this.startRoll(code === 'KeyQ' ? -1 : 1);
                }
            };
            this.onKeyUp = (e) => { this.keys[e.code] = false; };

            this.onMouseMove = (e) => {
                const rect = stage.getBoundingClientRect();
                if (rect.width <= 0 || rect.height <= 0) return;
                const px = e.clientX - rect.left;
                const py = e.clientY - rect.top;
                this.pointer.pixelX = px;
                this.pointer.pixelY = py;
                this.pointer.x = clamp((px / rect.width) * 2 - 1, -1, 1);
                this.pointer.y = clamp(-(py / rect.height) * 2 + 1, -1, 1);
                this.pointer.inside = (px >= 0 && px <= rect.width && py >= 0 && py <= rect.height);
            };

            this.onMouseDown = (e) => {
                this.focused = this.container.contains(e.target);
                if (!this.focused) return;
                if (stage.contains(e.target) && this.state === 'playing') {
                    if (e.button === 0) {
                        this.mouseShooting = true;
                        if (this.player.fireTimer <= 0) {
                            this.playerFire();
                            this.player.fireTimer = this.stats.fireRate;
                        }
                    } else if (e.button === 2) {
                        e.preventDefault();
                        this.fireMissiles();
                    }
                }
            };

            this.onMouseUp = (e) => {
                if (e.button === 0) {
                    this.mouseShooting = false;
                }
            };

            this.onMouseEnter = () => {
                this.pointer.inside = true;
            };

            this.onMouseLeave = () => {
                this.pointer.inside = false;
                this.mouseShooting = false;
            };

            this.onContext = (e) => { if (this.container.contains(e.target)) e.preventDefault(); };
            this.onBlur = () => {
                this.keys = Object.create(null);
                this.mouseShooting = false;
            };

            window.addEventListener('keydown', this.onKeyDown);
            window.addEventListener('keyup', this.onKeyUp);
            stage.addEventListener('mousemove', this.onMouseMove);
            stage.addEventListener('mouseenter', this.onMouseEnter);
            stage.addEventListener('mouseleave', this.onMouseLeave);
            document.addEventListener('mousedown', this.onMouseDown, true);
            window.addEventListener('mouseup', this.onMouseUp);
            this.container.addEventListener('contextmenu', this.onContext);
            window.addEventListener('blur', this.onBlur);
        }

        /* ----------------------------------------------------------------- */
        /*  Loadout                                                           */
        /* ----------------------------------------------------------------- */
        get chassisDef() {
            return CHASSIS.find((c) => c.id === this.save.chassis) || CHASSIS[0];
        }

        applyChassis() {
            const c = this.chassisDef;
            const u = this.save.upgrades;
            const maxHull = c.hull + u.hull * 25;
            const maxMissiles = c.missiles + u.missiles * 4;
            this.stats = {
                maxHull: maxHull,
                maxShield: 50 + u.shield * 12,
                speed: c.speed * (1 + u.engine * 0.08),
                fireRate: c.fireRate / (1 + u.laser * 0.12),
                damage: c.damage * (1 + u.laser * 0.18),
                shots: c.shots,
                spread: c.spread,
                maxMissiles: maxMissiles,
                boostRegen: 12 * (1 + u.engine * 0.2),
                shieldRegen: 3.2 * (1 + u.shield * 0.35)
            };

            const p = this.player;
            p.maxHull = this.stats.maxHull;
            p.maxShield = this.stats.maxShield;
            p.maxMissiles = this.stats.maxMissiles;
            p.hull = p.maxHull;
            p.shield = p.maxShield;
            p.missiles = p.maxMissiles;
            p.boost = 100;

            // Re-skin the hull to match the selected chassis.
            if (this.playerModel) {
                this.playerModel.accent.color.setHex(c.color);
                this.playerModel.accent.emissive.setHex(c.color);
                this.playerModel.glowMat.color.setHex(c.color);
            }
        }

        /* ----------------------------------------------------------------- */
        /*  Run lifecycle                                                     */
        /* ----------------------------------------------------------------- */
        startRun() {
            this.sfx.resume();
            this.focused = true;
            this.applyChassis();
            this.score = 0;
            this.wave = 0;
            this.combo = 0;
            this.comboTimer = 0;
            this.runCredits = 0;
            this._nextWaveAt = null;
            this.clearField();
            this.player.x = 0; this.player.y = 0;
            this.player.vx = 0; this.player.vy = 0;
            this.state = 'playing';
            if (this.stage) this.stage.classList.add('playing');
            this.pointer.pixelX = this.width * 0.5;
            this.pointer.pixelY = this.height * 0.52;
            this.pointer.x = 0;
            this.pointer.y = -0.04;
            this.pointer.inside = true;
            this.mouseShooting = false;

            this.dom.menu.style.display = 'none';
            this.dom.station.style.display = 'none';
            this.dom.pause.style.display = 'none';
            this.dom.hud.style.display = 'block';
            this.dom.boss.style.display = 'none';
            if (this.dom.gameover) this.dom.gameover.style.display = 'none';

            this.sfx.startMusic();
            this.nextWave();
        }

        endRun(victory) {
            if (this.state === 'dead') return;
            this.state = 'dead';
            if (this.stage) this.stage.classList.remove('playing');
            this.mouseShooting = false;
            this.sfx.stopMusic();
            this.sfx.gameOver();

            const earned = Math.floor(this.score / 12) + this.runCredits;
            this.save.credits += earned;
            const isBest = this.score > this.save.best;
            if (isBest) this.save.best = this.score;
            if (this.wave > this.save.bestWave) this.save.bestWave = this.wave;
            writeSave(this.save);

            const over = this.container.querySelector('#vt-gameover');
            if (over) {
                over.style.display = 'flex';
                over.querySelector('#vt-go-title').textContent = victory ? 'SECTOR CLEARED' : 'SHIP DESTROYED';
                over.querySelector('#vt-go-score').textContent = this.score.toLocaleString();
                over.querySelector('#vt-go-wave').textContent = this.wave;
                over.querySelector('#vt-go-earned').textContent = earned.toLocaleString();
                const best = over.querySelector('#vt-go-best');
                if (best) { best.textContent = isBest ? 'NEW PERSONAL BEST!' : `Best: ${this.save.best.toLocaleString()}`; }
            }
            this.dom.hud.style.display = 'none';
            this.dom.boss.style.display = 'none';
            this.refreshMenu();
        }

        toMenu() {
            this.state = 'menu';
            if (this.stage) this.stage.classList.remove('playing');
            this.mouseShooting = false;
            this.clearField();
            this.sfx.stopMusic();
            const over = this.container.querySelector('#vt-gameover');
            if (over) over.style.display = 'none';
            this.dom.hud.style.display = 'none';
            this.dom.pause.style.display = 'none';
            this.dom.boss.style.display = 'none';
            this.dom.menu.style.display = 'flex';
            this.refreshMenu();
        }

        togglePause() {
            if (this.state === 'playing') {
                this.state = 'paused';
                if (this.stage) this.stage.classList.remove('playing');
                this.mouseShooting = false;
                this.dom.pause.style.display = 'flex';
                this.sfx.stopMusic();
            } else if (this.state === 'paused') {
                this.state = 'playing';
                if (this.stage) this.stage.classList.add('playing');
                this.dom.pause.style.display = 'none';
                this.sfx.startMusic();
            }
        }

        clearField() {
            this._nextWaveAt = null;
            this.enemies.forEach((e) => this.disposeEnemy(e));
            this.enemies.length = 0;
            this.spawnQueue.length = 0;
            this.bullets.forEach((b) => { b.mesh.visible = false; this.bulletPool.push(b.mesh); });
            this.bullets.length = 0;
            this.enemyBullets.forEach((b) => { b.mesh.visible = false; this.eBulletPool.push(b.mesh); });
            this.enemyBullets.length = 0;
            this.missiles.forEach((m) => this.scene.remove(m.mesh));
            this.missiles.length = 0;
            this.powerups.forEach((p) => this.scene.remove(p.mesh));
            this.powerups.length = 0;
            if (this.boss) {
                this.scene.remove(this.boss.obj.group);
                disposeGroup(this.boss.obj.group);
                this.boss = null;
            }
            this.beam.visible = false;
            this.dom.boss.style.display = 'none';
        }

        refreshMenu() {
            if (!this.dom.menuBest) return;
            this.dom.menuBest.textContent = this.save.best.toLocaleString();
            this.dom.menuCredits.textContent = this.save.credits.toLocaleString();
            this.dom.menuLast.textContent = this.save.bestWave ? String(this.save.bestWave) : '—';
            this.dom.menuShip.textContent = this.chassisDef.name;
        }

        /* ----------------------------------------------------------------- */
        /*  Waves                                                             */
        /* ----------------------------------------------------------------- */
        nextWave() {
            this.wave++;
            this.waveTimer = 0;
            this.spawnQueue.length = 0;

            const isBoss = this.wave % 5 === 0;
            if (isBoss) {
                this.sfx.bossWarn();
                this.buildBossWave();
                this.showBanner(`WAVE ${this.wave}`, 'WARNING · CAPITAL SHIP DETECTED', '#ff5a7a');
            } else {
                this.buildWave();
                this.showBanner(`WAVE ${this.wave}`, `${this.spawnQueue.length} HOSTILES INBOUND`, '#7cf1ff');
            }
        }

        buildWave() {
            const n = this.wave;
            const pool = ['dart'];
            if (n >= 2) pool.push('weaver');
            if (n >= 3) pool.push('sentinel', 'mine');
            if (n >= 5) pool.push('lancer');

            let budget = Math.min(34, 6 + Math.floor(n * 1.7));
            let t = 0.7;

            while (budget > 0) {
                const pattern = pick(['line', 'vee', 'pair', 'column', 'scatter']);
                let size = budget;
                if (pattern === 'line') size = Math.min(budget, randInt(4, 7));
                else if (pattern === 'vee') size = Math.min(budget, 5);
                else if (pattern === 'pair') size = Math.min(budget, 2);
                else if (pattern === 'column') size = Math.min(budget, randInt(3, 5));
                else size = Math.min(budget, randInt(3, 6));
                size = Math.max(1, size);

                const type = pick(pool);
                const cx = rand(-13, 13);
                const cy = rand(-5, 8);

                for (let i = 0; i < size; i++) {
                    let x = cx, y = cy, dz = 0;
                    const frac = size === 1 ? 0 : i / (size - 1) - 0.5;
                    switch (pattern) {
                        case 'line':
                            x = cx + frac * 18; y = cy; break;
                        case 'vee':
                            x = cx + frac * 16; y = cy - Math.abs(frac) * 7; dz = Math.abs(frac) * 26; break;
                        case 'pair':
                            x = cx + (i === 0 ? -11 : 11); y = cy; break;
                        case 'column':
                            x = cx; y = cy + frac * 10; dz = i * 9; break;
                        default:
                            x = cx + rand(-9, 9); y = cy + rand(-4, 4); dz = rand(0, 28);
                    }
                    this.spawnQueue.push({
                        t: t + (pattern === 'column' || pattern === 'vee' ? 0 : rand(0, 0.35)),
                        type: type,
                        x: clamp(x, -20, 20),
                        y: clamp(y, -7, 10),
                        z: SPAWN_Z - dz
                    });
                }
                budget -= size;
                t += rand(1.5, 2.9) / (1 + n * 0.045);
            }
            this.spawnQueue.sort((a, b) => a.t - b.t);
        }

        buildBossWave() {
            const stage = Math.ceil(this.wave / 5);
            this.spawnQueue.push({ t: 1.4, boss: true, stage: stage });
            const escorts = 4 + stage * 2;
            for (let i = 0; i < escorts; i++) {
                this.spawnQueue.push({
                    t: 3.2 + i * 1.1,
                    type: i % 2 === 0 ? 'dart' : 'lancer',
                    x: rand(-14, 14),
                    y: rand(-5, 8),
                    z: SPAWN_Z
                });
            }
        }

        showBanner(title, sub, color) {
            const b = this.dom.banner;
            if (!b) return;
            this.dom.bannerTitle.textContent = title;
            this.dom.bannerTitle.style.color = color || '#7cf1ff';
            this.dom.bannerSub.textContent = sub || '';
            b.classList.remove('show');
            // Force reflow so the animation restarts.
            void b.offsetWidth;
            b.classList.add('show');
            clearTimeout(this._bannerTimer);
            this._bannerTimer = setTimeout(() => b.classList.remove('show'), 2300);
        }

        /* ----------------------------------------------------------------- */
        /*  Spawning                                                          */
        /* ----------------------------------------------------------------- */
        spawnEnemy(type, x, y, z) {
            const def = ENEMY_DEFS[type];
            const obj = buildEnemy(type);
            obj.group.position.set(x, y, z);
            this.scene.add(obj.group);
            const waveScale = 1 + (this.wave - 1) * 0.09;
            this.enemies.push({
                type: type,
                obj: obj,
                x: x, y: y, z: z,
                hp: Math.round(def.hp * waveScale),
                maxHp: Math.round(def.hp * waveScale),
                radius: def.radius,
                speed: def.speed + this.wave * 0.9,
                fireTimer: rand(0.6, 2.4),
                phase: Math.random() * TAU,
                baseX: x,
                baseY: y,
                hitFlash: 0,
                locked: false
            });
        }

        spawnBoss(stage) {
            const obj = buildBoss(stage);
            obj.group.position.set(0, 2.5, -95);
            this.scene.add(obj.group);
            const hp = Math.round(900 * (1 + (stage - 1) * 0.75));
            this.boss = {
                obj: obj,
                stage: stage,
                x: 0, y: 2.5, z: -95,
                hp: hp,
                maxHp: hp,
                radius: 7.5,
                t: 0,
                dir: pick([-1, 1]),
                fireTimer: 1.6,
                beamState: 'idle',
                beamTimer: rand(3.5, 5.5),
                hitFlash: 0
            };
            this.dom.boss.style.display = 'block';
            this.dom.bossName.textContent = `DREADNOUGHT MK.${'I'.repeat(Math.min(stage, 4))} · ${stage > 4 ? '+' + (stage - 4) : ''}`;
            this.dom.bossFill.style.width = '100%';
        }

        /* ----------------------------------------------------------------- */
        /*  Player actions                                                    */
        /* ----------------------------------------------------------------- */
        startRoll(dir) {
            const p = this.player;
            if (p.rollTimer > 0) return;
            p.rollDir = dir;
            p.rollTimer = 0.55;
            p.roll = 0;
            this.sfx.roll();
        }

        fireMissiles() {
            const p = this.player;
            if (p.missiles <= 0) { this.sfx.deny(); return; }
            const targets = this.enemies.filter((e) => e.locked);
            let pool = targets.slice(0, p.missiles);
            if (this.boss && pool.length < p.missiles && this.boss.hp > 0) {
                pool.push(this.boss);
            }
            if (!pool.length) { this.sfx.deny(); return; }

            pool.slice(0, p.missiles).forEach((tgt, i) => {
                const m = new THREE.Mesh(this.missileGeo, this.missileMat);
                m.position.set(this.player.x + (i % 2 === 0 ? -1.6 : 1.6), this.player.y - 0.3, 0.5);
                this.scene.add(m);
                this.missiles.push({
                    mesh: m,
                    x: m.position.x, y: m.position.y, z: m.position.z,
                    target: tgt,
                    life: 3.2,
                    speed: 90,
                    vx: 0, vy: 0, vz: -60
                });
                p.missiles--;
            });
            this.sfx.missile();
        }

        getAimPoint() {
            const mx = (this.pointer.inside && this.pointer.x !== undefined) ? this.pointer.x : 0;
            const my = (this.pointer.inside && this.pointer.y !== undefined) ? this.pointer.y : 0.05;

            const aimV = this._aimV || (this._aimV = new THREE.Vector3());
            aimV.set(mx, my, 0.5);
            aimV.unproject(this.camera);

            const rayDir = aimV.sub(this.camera.position).normalize();
            const targetZ = -85;
            const t = (targetZ - this.camera.position.z) / (rayDir.z || -0.0001);

            const pt = this._aimPt || (this._aimPt = new THREE.Vector3());
            pt.copy(this.camera.position).addScaledVector(rayDir, t);
            return pt;
        }

        playerFire() {
            const p = this.player;
            const s = this.stats;
            const count = s.shots;
            const aimPoint = this.getAimPoint();

            for (let i = 0; i < count; i++) {
                const mesh = this.bulletPool.pop();
                if (!mesh) break;
                const frac = count === 1 ? 0 : i / (count - 1) - 0.5;
                const ang = frac * s.spread;
                const ox = count === 1 ? 0 : frac * (count <= 2 ? 1.4 : 3.0);

                const originX = p.x + ox;
                const originY = p.y + 0.1;
                const originZ = -2.2;

                const dir = new THREE.Vector3(
                    aimPoint.x - originX,
                    aimPoint.y - originY,
                    aimPoint.z - originZ
                ).normalize();

                if (count > 1) {
                    dir.x += Math.sin(ang) * 0.12;
                    dir.normalize();
                }

                const bulletSpeed = 215;
                const b = {
                    mesh: mesh,
                    x: originX,
                    y: originY,
                    z: originZ,
                    vx: dir.x * bulletSpeed,
                    vy: dir.y * bulletSpeed,
                    vz: dir.z * bulletSpeed,
                    damage: s.damage,
                    life: 2.2
                };
                mesh.visible = true;
                mesh.position.set(b.x, b.y, b.z);
                mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
                this.bullets.push(b);
            }
            this.sfx.laser();
        }

        damagePlayer(amount) {
            const p = this.player;
            if (p.invuln > 0 || this.state !== 'playing') return;

            if (p.shield > 0) {
                p.shield = Math.max(0, p.shield - amount);
                this.sfx.shieldPing();
                this.shake = Math.max(this.shake, 0.35);
            } else {
                p.hull -= amount;
                this.sfx.playerHit();
                this.shake = Math.max(this.shake, 0.8);
                this.hitFlash = 1;
            }
            p.invuln = 0.55;
            this.combo = 0;
            this.comboTimer = 0;

            if (p.hull <= 0) {
                p.hull = 0;
                this.explode(p.x, p.y, 0, 2.4, 0x63b3ed);
                this.playerObj.visible = false;
                setTimeout(() => { if (!this.destroyed) this.endRun(false); }, 700);
            }
        }

        /* ----------------------------------------------------------------- */
        /*  Effects                                                           */
        /* ----------------------------------------------------------------- */
        explode(x, y, z, scale, color) {
            const n = Math.round(46 * scale);
            for (let i = 0; i < n; i++) {
                const a = Math.random() * TAU;
                const b = Math.acos(rand(-1, 1));
                const sp = rand(4, 26) * scale;
                this.particles.spawn(
                    x + rand(-0.6, 0.6), y + rand(-0.6, 0.6), z + rand(-0.6, 0.6),
                    Math.sin(b) * Math.cos(a) * sp,
                    Math.cos(b) * sp,
                    Math.sin(b) * Math.sin(a) * sp,
                    i % 4 === 0 ? 0xffffff : color,
                    rand(1.4, 3.6) * scale,
                    rand(0.35, 0.95) * scale,
                    2.2, 0
                );
            }
            // Debris sparks that linger a little longer.
            for (let i = 0; i < Math.round(14 * scale); i++) {
                const sp = rand(2, 14) * scale;
                this.particles.spawn(
                    x, y, z, rand(-sp, sp), rand(-sp, sp), rand(-sp, sp),
                    color, rand(0.8, 1.8), rand(0.8, 1.8), 0.7, -6
                );
            }
            this.shockwave(x, y, z, scale, color);
            this.sfx.explosion(scale);
        }

        shockwave(x, y, z, scale, color) {
            const r = this.rings.find((k) => k.life <= 0);
            if (!r) return;
            r.mesh.visible = true;
            r.mesh.position.set(x, y, z);
            r.mesh.scale.setScalar(0.6);
            r.mesh.material.color.setHex(color || 0xffaa55);
            r.mesh.material.opacity = 0.95;
            r.life = 0.55;
            r.max = 0.55;
            r.scale = 9 * scale;
        }

        dropPowerup(x, y, z) {
            const roll = Math.random();
            let type = 'credit';
            if (roll < 0.3) type = 'hull';
            else if (roll < 0.55) type = 'missile';
            else if (roll < 0.72) type = 'shield';
            const m = new THREE.Mesh(this.powerupGeo, this.powerupMats[type]);
            m.position.set(x, y, z);
            this.scene.add(m);
            this.powerups.push({ mesh: m, type: type, x: x, y: y, z: z, spin: rand(1, 3) });
        }

        /* ----------------------------------------------------------------- */
        /*  Update                                                            */
        /* ----------------------------------------------------------------- */
        update(dt) {
            this.time += dt;

            const p = this.player;
            const playing = this.state === 'playing';

            /* ---- background always animates ---- */
            this.updateBackground(dt, playing);

            if (!playing && this.state !== 'dead') {
                // Idle drift for the menu so the scene never looks frozen.
                p.x = damp(p.x, Math.sin(this.time * 0.5) * 2.5, 2, dt);
                p.y = damp(p.y, Math.cos(this.time * 0.37) * 1.2, 2, dt);
            }

            if (playing) {
                this.updatePlayer(dt);
                this.updateSpawner(dt);
                this.updateEnemies(dt);
                this.updateBullets(dt);
                this.updateEnemyBullets(dt);
                this.updateMissiles(dt);
                this.updatePowerups(dt);
                this.updateBoss(dt);

                if (this.comboTimer > 0) {
                    this.comboTimer -= dt;
                    if (this.comboTimer <= 0) this.combo = 0;
                }

                // Wave cleared? Award the bonus, breathe, then bring the next one.
                if (!this.boss && this.spawnQueue.length === 0 && this.enemies.length === 0) {
                    if (this._nextWaveAt == null) {
                        this.waveClear();
                    } else if (this.time >= this._nextWaveAt) {
                        this._nextWaveAt = null;
                        this.nextWave();
                    }
                }
            }

            this.updateParticles(dt);
            this.updateRings(dt);
            this.updateTrail(dt, playing);
            this.updateShipTransform(dt);
            this.updateCamera(dt);
            this.updateHud();
        }

        updateBackground(dt, playing) {
            const speed = playing
                ? (this.player.boosting ? 165 : 78)
                : 45;

            // Starfield
            const pos = this.starGeo.attributes.position.array;
            for (let i = 2; i < pos.length; i += 3) {
                pos[i] += speed * dt;
                if (pos[i] > 30) pos[i] -= 650;
            }
            this.starGeo.attributes.position.needsUpdate = true;

            // Warp streaks
            const boostAmt = playing && this.player.boosting ? 1 : 0;
            this.warpBoost = damp(this.warpBoost || 0, boostAmt, 6, dt);
            this.warp.material.opacity = this.warpBoost * 0.5;
            if (this.warpBoost > 0.01) {
                const wp = this.warpPos;
                const sd = this.warpSeed;
                const len = 4 + this.warpBoost * 46;
                for (let i = 0; i < sd.length / 3; i++) {
                    let z = sd[i * 3 + 2] + speed * 1.5 * dt;
                    if (z > 30) { z -= 430; sd[i * 3] = rand(-90, 90); sd[i * 3 + 1] = rand(-60, 60); }
                    sd[i * 3 + 2] = z;
                    const x = sd[i * 3], y = sd[i * 3 + 1];
                    const o = i * 6;
                    wp[o] = x; wp[o + 1] = y; wp[o + 2] = z;
                    wp[o + 3] = x; wp[o + 4] = y; wp[o + 5] = z - len;
                }
                this.warpAttr.needsUpdate = true;
            }

            // Scrolling grid tunnel
            this.gridTex.offset.y -= speed * 0.0055 * dt * 60;

            // Nebula parallax
            this.nebula.position.x = -this.player.x * 0.9;
            this.nebula.position.y = -this.player.y * 0.9;
            this.nebula.material.opacity = 0.55 + Math.sin(this.time * 0.2) * 0.08;
        }

        updatePlayer(dt) {
            const p = this.player;
            const k = this.keys;
            const s = this.stats;

            let ax = 0, ay = 0;
            if (k['ArrowLeft'] || k['KeyA']) ax -= 1;
            if (k['ArrowRight'] || k['KeyD']) ax += 1;
            if (k['ArrowDown'] || k['KeyS']) ay -= 1;
            if (k['ArrowUp'] || k['KeyW']) ay += 1;
            if (ax && ay) { ax *= 0.7071; ay *= 0.7071; }

            // Boost / brake
            const wantBoost = (k['ShiftLeft'] || k['ShiftRight']) && p.boost > 1 && ay >= 0;
            const wantBrake = k['ControlLeft'] || k['ControlRight'] || k['KeyK'];
            p.boosting = wantBoost;
            if (wantBoost) {
                p.boost = Math.max(0, p.boost - 26 * dt);
            } else {
                p.boost = Math.min(100, p.boost + s.boostRegen * dt);
            }
            const speedMul = wantBoost ? 1.55 : (wantBrake ? 0.55 : 1);

            const targetVx = ax * s.speed * speedMul;
            const targetVy = ay * s.speed * 0.85 * speedMul;
            p.vx = damp(p.vx, targetVx, 11, dt);
            p.vy = damp(p.vy, targetVy, 11, dt);
            p.x = clamp(p.x + p.vx * dt, -BOUNDS.x, BOUNDS.x);
            p.y = clamp(p.y + p.vy * dt, BOUNDS.yMin, BOUNDS.yMax);
            if (p.x === -BOUNDS.x || p.x === BOUNDS.x) p.vx *= 0.2;
            if (p.y === BOUNDS.yMin || p.y === BOUNDS.yMax) p.vy *= 0.2;

            // Weapons
            p.fireTimer -= dt;
            if ((k['Space'] || k['KeyJ'] || this.mouseShooting) && p.fireTimer <= 0) {
                this.playerFire();
                p.fireTimer = s.fireRate;
            }

            // Shields / invulnerability
            p.invuln = Math.max(0, p.invuln - dt);
            if (p.shield < p.maxShield) {
                p.shield = Math.min(p.maxShield, p.shield + s.shieldRegen * dt);
            }

            // Barrel roll
            if (p.rollTimer > 0) {
                p.rollTimer -= dt;
                p.roll = clamp(1 - p.rollTimer / 0.55, 0, 1);
                if (p.rollTimer <= 0) p.roll = 0;
            }
        }

        updateSpawner(dt) {
            if (!this.spawnQueue.length) return;
            this.waveTimer += dt;
            while (this.spawnQueue.length && this.spawnQueue[0].t <= this.waveTimer) {
                const s = this.spawnQueue.shift();
                if (s.boss) this.spawnBoss(s.stage);
                else this.spawnEnemy(s.type, s.x, s.y, s.z);
            }
        }

        updateEnemies(dt) {
            const p = this.player;
            for (let i = this.enemies.length - 1; i >= 0; i--) {
                const e = this.enemies[i];
                const g = e.obj.group;
                e.phase += dt;

                switch (e.type) {
                    case 'dart': {
                        e.z += e.speed * dt;
                        e.x = e.baseX + Math.sin(e.phase * 1.4) * 3.4;
                        break;
                    }
                    case 'weaver': {
                        e.z += e.speed * dt;
                        e.x = e.baseX + Math.sin(e.phase * 2.2) * 8.5;
                        e.y = e.baseY + Math.cos(e.phase * 1.5) * 2.6;
                        break;
                    }
                    case 'sentinel': {
                        // Holds station, closing slowly, tracking the player.
                        e.z += e.speed * dt * 0.35;
                        if (e.z > -60) e.z = -60;
                        e.x = damp(e.x, clamp(p.x * 0.75 + Math.sin(e.phase * 0.8) * 6, -18, 18), 1.2, dt);
                        e.y = damp(e.y, clamp(p.y * 0.6 + 1.5, -6, 9), 1.0, dt);
                        if (g.userData.spin) g.userData.spin.rotation.z += dt * 2.4;
                        break;
                    }
                    case 'lancer': {
                        // Lines up on the player then dives.
                        if (e.z < -55) {
                            e.x = damp(e.x, p.x, 2.2, dt);
                            e.y = damp(e.y, p.y, 2.2, dt);
                            e.z += e.speed * 0.55 * dt;
                        } else {
                            e.z += e.speed * 1.7 * dt;
                        }
                        break;
                    }
                    case 'mine': {
                        e.z += e.speed * dt;
                        e.x = e.baseX + Math.sin(e.phase * 0.7) * 1.6;
                        e.y = e.baseY + Math.cos(e.phase * 0.5) * 1.2;
                        if (g.userData.eye) {
                            const blink = 0.5 + 0.5 * Math.sin(this.time * 6 + e.phase);
                            g.userData.eye.material.color.setRGB(1, 0.15 * blink, 0.25 * blink);
                        }
                        break;
                    }
                }

                e.obj.group.position.set(e.x, e.y, e.z);
                e.obj.group.rotation.z = Math.sin(e.phase * 1.8) * 0.25;

                // Hit flash decay
                if (e.hitFlash > 0) {
                    e.hitFlash = Math.max(0, e.hitFlash - dt * 5);
                    e.obj.body.emissive.setRGB(e.hitFlash, e.hitFlash * 0.6, e.hitFlash * 0.6);
                }

                // Shooting
                const def = ENEMY_DEFS[e.type];
                if (def.fire > 0) {
                    e.fireTimer -= dt;
                    if (e.fireTimer <= 0 && e.z > -150 && e.z < 6) {
                        e.fireTimer = def.fire * rand(0.75, 1.5) / (1 + this.wave * 0.03);
                        this.enemyShoot(e);
                    }
                }

                // Ram / proximity damage
                const dx = e.x - p.x, dy = e.y - p.y, dz = e.z - 0;
                const distSq = dx * dx + dy * dy + dz * dz;
                const rr = (e.radius + 1.3);
                if (distSq < rr * rr) {
                    this.damagePlayer(e.type === 'mine' ? 26 : 18);
                    this.explode(e.x, e.y, e.z, e.type === 'mine' ? 1.6 : 1.1,
                        e.type === 'mine' ? 0xff3355 : 0xff8844);
                    this.disposeEnemy(e);
                    this.enemies.splice(i, 1);
                    continue;
                }

                // Escaped past the camera
                if (e.z > 26) {
                    this.disposeEnemy(e);
                    this.enemies.splice(i, 1);
                }
            }

            // Refresh lock-on targets
            this.updateLocks();
        }

        updateLocks() {
            const p = this.player;
            let n = 0;
            const maxLocks = Math.min(p.missiles, 4);
            const candidates = [];
            const aimPixelX = (this.pointer.inside && this.pointer.pixelX !== undefined) ? this.pointer.pixelX : (this.width * 0.5);
            const aimPixelY = (this.pointer.inside && this.pointer.pixelY !== undefined) ? this.pointer.pixelY : (this.height * 0.52);

            const v = this._projV || (this._projV = new THREE.Vector3());

            for (const e of this.enemies) {
                if (e.z < -10 && e.z > -150) {
                    v.set(e.x, e.y, e.z).project(this.camera);
                    if (v.z > 1) continue;
                    const sx = (v.x * 0.5 + 0.5) * this.width;
                    const sy = (-v.y * 0.5 + 0.5) * this.height;
                    const distToCrosshair = Math.hypot(sx - aimPixelX, sy - aimPixelY);
                    if (distToCrosshair < 190) {
                        candidates.push({ e: e, d: distToCrosshair });
                    }
                }
            }

            if (this.boss && this.boss.hp > 0 && this.boss.z < -10) {
                v.set(this.boss.x, this.boss.y, this.boss.z).project(this.camera);
                if (v.z <= 1) {
                    const sx = (v.x * 0.5 + 0.5) * this.width;
                    const sy = (-v.y * 0.5 + 0.5) * this.height;
                    const distToCrosshair = Math.hypot(sx - aimPixelX, sy - aimPixelY);
                    if (distToCrosshair < 230) {
                        candidates.push({ e: this.boss, d: distToCrosshair });
                    }
                }
            }

            candidates.sort((a, b) => a.d - b.d);
            for (const e of this.enemies) e.locked = false;
            for (const c of candidates) {
                if (n >= maxLocks) break;
                c.e.locked = true;
                n++;
            }
            this.lockedTargets = candidates.slice(0, n).map((c) => c.e);
        }

        enemyShoot(e) {
            const p = this.player;
            const mesh = this.eBulletPool.pop();
            if (!mesh) return;

            const shots = e.type === 'sentinel' ? 3 : 1;
            const spread = e.type === 'sentinel' ? 0.22 : 0.04;

            for (let i = 0; i < shots; i++) {
                let m = mesh;
                if (i > 0) { m = this.eBulletPool.pop(); if (!m) break; }
                const frac = shots === 1 ? 0 : i / (shots - 1) - 0.5;
                // Lead the player a little so shots are dodgeable but threatening.
                const dx = (p.x + p.vx * 0.28) - e.x;
                const dy = (p.y + p.vy * 0.28) - e.y;
                const dz = 0 - e.z;
                const len = Math.max(0.001, Math.hypot(dx, dy, dz));
                const sp = 62 + this.wave * 1.1;
                const ang = frac * spread;
                const nx = dx / len + Math.sin(ang);
                const ny = dy / len;
                const nz = dz / len + Math.cos(ang) * 0.15;
                const nl = Math.max(0.001, Math.hypot(nx, ny, nz));
                m.visible = true;
                m.position.set(e.x, e.y, e.z + 1);
                this.enemyBullets.push({
                    mesh: m,
                    x: e.x, y: e.y, z: e.z + 1,
                    vx: (nx / nl) * sp,
                    vy: (ny / nl) * sp,
                    vz: (nz / nl) * sp,
                    life: 5
                });
            }
            this.sfx.enemyLaser();
        }

        updateBullets(dt) {
            for (let i = this.bullets.length - 1; i >= 0; i--) {
                const b = this.bullets[i];
                const px = b.x, py = b.y, pz = b.z;
                b.x += b.vx * dt;
                b.y += b.vy * dt;
                b.z += b.vz * dt;
                b.life -= dt;
                b.mesh.position.set(b.x, b.y, b.z);

                let consumed = false;

                // Boss turrets first
                if (this.boss && this.boss.hp > 0) {
                    const hit = this.bossTurretHitAt(px, py, pz, b.x, b.y, b.z, 2.3);
                    if (hit) {
                        hit.hp -= b.damage;
                        hit.mat.emissive.setHex(0xffffff);
                        setTimeout(() => { if (hit) hit.mat.emissive.setHex(0x101820); }, 60);
                        this.particles.spawn(b.x, b.y, b.z, rand(-6, 6), rand(-6, 6), rand(-14, -4),
                            0xffd166, 1.6, 0.3, 3, 0);
                        if (hit.hp <= 0) {
                            hit.alive = false;
                            hit.group.visible = false;
                            const w = this.turretWorld(hit);
                            this.explode(w.x, w.y, w.z, 1.5, 0xff9f43);
                            this.addScore(300);
                        }
                        consumed = true;
                    } else if (segBoxHit(px, py, pz, b.x, b.y, b.z,
                        this.boss.x, this.boss.y, this.boss.z, 9.5, 2.2, 4.2)) {
                        this.boss.hp -= b.damage;
                        this.boss.hitFlash = 1;
                        this.particles.spawn(b.x, b.y, b.z, rand(-8, 8), rand(-8, 8), rand(-16, -4),
                            0xffd166, 1.8, 0.32, 3, 0);
                        consumed = true;
                    }
                }

                // Regular enemies
                if (!consumed) {
                    for (let j = this.enemies.length - 1; j >= 0; j--) {
                        const e = this.enemies[j];
                        const rr = e.radius + 0.7;
                        if (segPointDistSq(px, py, pz, b.x, b.y, b.z, e.x, e.y, e.z) < rr * rr) {
                            e.hp -= b.damage;
                            e.hitFlash = 1;
                            this.particles.spawn(b.x, b.y, b.z, rand(-7, 7), rand(-7, 7), rand(-18, -5),
                                0xfff2a8, 1.5, 0.28, 3, 0);
                            if (e.hp <= 0) this.killEnemy(j);
                            consumed = true;
                            break;
                        }
                    }
                }

                if (consumed || b.life <= 0 || b.z < -260) {
                    b.mesh.visible = false;
                    this.bulletPool.push(b.mesh);
                    this.bullets.splice(i, 1);
                }
            }
        }

        updateEnemyBullets(dt) {
            const p = this.player;
            for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
                const b = this.enemyBullets[i];
                const px = b.x, py = b.y, pz = b.z;
                b.x += b.vx * dt;
                b.y += b.vy * dt;
                b.z += b.vz * dt;
                b.life -= dt;
                b.mesh.position.set(b.x, b.y, b.z);

                let hit = false;
                if (this.state === 'playing') {
                    if (segPointDistSq(px, py, pz, b.x, b.y, b.z, p.x, p.y, 0) < 2.6 * 2.6) {
                        hit = true;
                        // Barrel roll deflects incoming fire.
                        if (p.rollTimer > 0) {
                            this.addScore(25);
                            this.particles.spawn(b.x, b.y, b.z, rand(-14, 14), rand(-14, 14), -30,
                                0x7cf1ff, 1.8, 0.4, 2, 0);
                            this.sfx.shieldPing();
                        } else {
                            this.damagePlayer(11);
                            this.particles.spawn(b.x, b.y, b.z, rand(-8, 8), rand(-8, 8), rand(-10, 10),
                                0xff6b8a, 1.8, 0.4, 2.5, 0);
                        }
                    }
                }

                if (hit || b.life <= 0 || b.z > 30) {
                    b.mesh.visible = false;
                    this.eBulletPool.push(b.mesh);
                    this.enemyBullets.splice(i, 1);
                }
            }
        }

        updateMissiles(dt) {
            for (let i = this.missiles.length - 1; i >= 0; i--) {
                const m = this.missiles[i];
                m.life -= dt;
                const mx0 = m.x, my0 = m.y, mz0 = m.z;
                const tgt = m.target;
                let tx, ty, tz, alive = false;

                if (tgt === this.boss) {
                    if (this.boss && this.boss.hp > 0) {
                        tx = this.boss.x; ty = this.boss.y; tz = this.boss.z; alive = true;
                    }
                } else if (tgt && this.enemies.indexOf(tgt) !== -1) {
                    tx = tgt.x; ty = tgt.y; tz = tgt.z; alive = true;
                }

                if (alive) {
                    const dx = tx - m.x, dy = ty - m.y, dz = tz - m.z;
                    const d = Math.max(0.001, Math.hypot(dx, dy, dz));
                    const desiredVx = (dx / d) * m.speed;
                    const desiredVy = (dy / d) * m.speed;
                    const desiredVz = (dz / d) * m.speed;
                    m.vx = damp(m.vx, desiredVx, 5.5, dt);
                    m.vy = damp(m.vy, desiredVy, 5.5, dt);
                    m.vz = damp(m.vz, desiredVz, 5.5, dt);
                } else {
                    m.vz = damp(m.vz, -m.speed, 3, dt);
                }

                m.x += m.vx * dt;
                m.y += m.vy * dt;
                m.z += m.vz * dt;
                m.mesh.position.set(m.x, m.y, m.z);
                m.mesh.lookAt(m.x + m.vx, m.y + m.vy, m.z + m.vz);

                // Smoke trail
                this.particles.spawn(m.x, m.y, m.z, rand(-1.5, 1.5), rand(-1.5, 1.5), rand(6, 16),
                    0xffb347, rand(1.0, 2.0), 0.32, 2.5, 0);

                let boom = false;
                if (alive) {
                    const r = (tgt === this.boss ? 6.5 : tgt.radius + 1.0);
                    if (segPointDistSq(mx0, my0, mz0, m.x, m.y, m.z, tx, ty, tz) < r * r) {
                        boom = true;
                        if (tgt === this.boss) {
                            this.boss.hp -= 130;
                            this.boss.hitFlash = 1;
                            this.explode(m.x, m.y, m.z, 1.5, 0xffd166);
                            this.addScore(120);
                        } else {
                            const idx = this.enemies.indexOf(tgt);
                            tgt.hp -= 90;
                            tgt.hitFlash = 1;
                            this.explode(m.x, m.y, m.z, 1.3, 0xffd166);
                            if (tgt.hp <= 0 && idx !== -1) this.killEnemy(idx);
                        }
                    }
                }

                if (boom || m.life <= 0 || m.z < -280) {
                    if (m.life <= 0) this.explode(m.x, m.y, m.z, 0.8, 0xffb347);
                    this.scene.remove(m.mesh);
                    this.missiles.splice(i, 1);
                }
            }
        }

        updatePowerups(dt) {
            const p = this.player;
            for (let i = this.powerups.length - 1; i >= 0; i--) {
                const u = this.powerups[i];
                const uz0 = u.z;
                u.z += 34 * dt;
                u.mesh.position.set(u.x, u.y, u.z);
                u.mesh.rotation.y += dt * u.spin;
                u.mesh.rotation.x += dt * u.spin * 0.5;

                if (segPointDistSq(u.x, u.y, uz0, u.x, u.y, u.z, p.x, p.y, 0) < 9) {
                    this.collect(u.type);
                    this.scene.remove(u.mesh);
                    this.powerups.splice(i, 1);
                    continue;
                }
                if (u.z > 26) {
                    this.scene.remove(u.mesh);
                    this.powerups.splice(i, 1);
                }
            }
        }

        collect(type) {
            const p = this.player;
            this.sfx.pickup();
            this.particles.spawn(p.x, p.y, 0, 0, 0, 8, 0x9dffb0, 2.4, 0.6, 2, 0);
            if (type === 'hull') {
                p.hull = Math.min(p.maxHull, p.hull + 30);
            } else if (type === 'missile') {
                p.missiles = Math.min(p.maxMissiles, p.missiles + 4);
            } else if (type === 'shield') {
                p.shield = Math.min(p.maxShield, p.shield + 30);
            } else {
                this.runCredits += 120;
                this.score += 120;
            }
        }

        updateBoss(dt) {
            const b = this.boss;
            if (!b) return;
            // Checked up front so the death sequence runs no matter what drained
            // the last of its hull.
            if (b.hp <= 0) { this.defeatBoss(b); return; }
            const p = this.player;
            b.t += dt;

            // Strafe
            b.x += b.dir * (5 + b.stage * 1.4) * dt;
            if (b.x > 13) { b.x = 13; b.dir = -1; }
            if (b.x < -13) { b.x = -13; b.dir = 1; }
            b.y = 2.5 + Math.sin(b.t * 0.7) * 2.2;
            b.obj.group.position.set(b.x, b.y, b.z);
            b.obj.group.rotation.z = -b.dir * 0.09;
            b.obj.group.rotation.y = Math.PI;

            if (b.hitFlash > 0) {
                b.hitFlash = Math.max(0, b.hitFlash - dt * 4);
                b.obj.hull.emissive.setRGB(b.hitFlash, b.hitFlash * 0.5, b.hitFlash * 0.5);
            }

            // Turret fire
            const aliveTurrets = b.obj.turrets.filter((t) => t.alive);
            b.fireTimer -= dt;
            if (b.fireTimer <= 0 && aliveTurrets.length) {
                b.fireTimer = Math.max(0.35, 1.15 - b.stage * 0.09) * rand(0.8, 1.25);
                const t = pick(aliveTurrets);
                const wx = b.x - t.offset.x, wy = b.y + t.offset.y, wz = b.z - t.offset.z;
                const mesh = this.eBulletPool.pop();
                if (mesh) {
                    const dx = p.x - wx, dy = p.y - wy, dz = 0 - wz;
                    const len = Math.max(0.001, Math.hypot(dx, dy, dz));
                    const sp = 70 + b.stage * 5;
                    mesh.visible = true;
                    mesh.position.set(wx, wy, wz);
                    this.enemyBullets.push({
                        mesh: mesh, x: wx, y: wy, z: wz,
                        vx: (dx / len) * sp, vy: (dy / len) * sp, vz: (dz / len) * sp,
                        life: 6
                    });
                    this.sfx.enemyLaser();
                }
            }

            // Main beam: telegraph, then fire.
            b.beamTimer -= dt;
            if (b.beamState === 'idle' && b.beamTimer <= 0) {
                b.beamState = 'charge';
                b.beamTimer = 1.35;
                this.sfx.bossWarn();
            } else if (b.beamState === 'charge') {
                const t = 1 - b.beamTimer / 1.35;
                this.beam.visible = true;
                this.beam.position.set(b.x, b.y - 0.15, b.z + 4.9);
                this.beam.scale.set(0.55 + t * 0.5, 0.55 + t * 0.5, 330);
                this.beam.material.color.setHex(0xff3355);
                this.beam.material.opacity = 0.18 + 0.35 * Math.abs(Math.sin(this.time * 22));
                if (b.beamTimer <= 0) {
                    b.beamState = 'fire';
                    b.beamTimer = 0.75;
                    this.sfx.explosion(1.6);
                    this.shake = Math.max(this.shake, 0.7);
                }
            } else if (b.beamState === 'fire') {
                const k = clamp(b.beamTimer / 0.75, 0, 1);
                this.beam.visible = true;
                this.beam.position.set(b.x, b.y - 0.15, b.z + 4.9);
                this.beam.scale.set(1.9, 1.9, 330);
                this.beam.material.color.setHex(0xffd0dd);
                this.beam.material.opacity = 0.5 + 0.45 * k;
                if (Math.abs(p.x - b.x) < 2.4 && Math.abs(p.y - (b.y - 0.15)) < 6) {
                    this.damagePlayer(30 * dt * 4);
                }
                if (b.beamTimer <= 0) {
                    b.beamState = 'idle';
                    b.beamTimer = rand(4.5, 7) / (1 + b.stage * 0.12);
                    this.beam.visible = false;
                }
            }

            this.dom.bossFill.style.width = (100 * b.hp / b.maxHp).toFixed(1) + '%';
        }

        defeatBoss(b) {
            this.explode(b.x, b.y, b.z, 6, 0xff9f43);
            for (let i = 0; i < 8; i++) {
                setTimeout(() => {
                    if (this.destroyed) return;
                    this.explode(b.x + rand(-7, 7), b.y + rand(-2, 4), b.z + rand(-3, 3), 2.2, 0xffd166);
                }, i * 130);
            }
            this.addScore(6000 + b.stage * 1500);
            this.shake = 1.4;
            this.scene.remove(b.obj.group);
            disposeGroup(b.obj.group);
            this.beam.visible = false;
            this.dom.boss.style.display = 'none';
            this.boss = null;
            this.showBanner('DREADNOUGHT DOWN', 'SECTOR SECURED', '#7dffb0');
        }

        /**
         * World-space position of a boss turret. The hull group is yawed 180°
         * to face the player, which mirrors local X and Z — offsets have to be
         * negated or shots land where the turrets visually aren't.
         */
        turretWorld(t) {
            const b = this.boss;
            this._tw = this._tw || { x: 0, y: 0, z: 0 };
            this._tw.x = b.x - t.offset.x;
            this._tw.y = b.y + t.offset.y;
            this._tw.z = b.z - t.offset.z;
            return this._tw;
        }

        /** Swept test against the nearest live turret along a bullet's path. */
        bossTurretHitAt(ax, ay, az, bx, by, bz, r) {
            const b = this.boss;
            if (!b) return null;
            let best = null, bestD = r * r;
            for (const t of b.obj.turrets) {
                if (!t.alive) continue;
                const d = segPointDistSq(ax, ay, az, bx, by, bz,
                    b.x - t.offset.x, b.y + t.offset.y, b.z - t.offset.z);
                if (d < bestD) { bestD = d; best = t; }
            }
            return best;
        }

        disposeEnemy(e) {
            if (!e || !e.obj) return;
            this.scene.remove(e.obj.group);
            disposeGroup(e.obj.group);
        }

        killEnemy(index) {
            const e = this.enemies[index];
            if (!e) return;
            const def = ENEMY_DEFS[e.type];
            this.explode(e.x, e.y, e.z, e.type === 'mine' ? 1.3 : 1.05,
                e.type === 'weaver' ? 0xc86bff : (e.type === 'lancer' ? 0xffe14d : 0xff4d6d));
            this.addScore(def.score);
            this.disposeEnemy(e);
            this.enemies.splice(index, 1);
            if (Math.random() < 0.11) this.dropPowerup(e.x, e.y, e.z);
        }

        addScore(points) {
            this.combo++;
            this.comboTimer = 3.0;
            const mult = clamp(1 + Math.floor(this.combo / 5), 1, 8);
            const gained = Math.round(points * mult);
            this.score += gained;
            this.runCredits += Math.floor(gained / 8);
        }

        waveClear() {
            const bonus = 500 + this.wave * 250;
            this.score += bonus;
            this.runCredits += Math.floor(bonus / 8);
            this.sfx.waveClear();
            this.showBanner('SECTOR CLEAR', `+${bonus.toLocaleString()} BONUS`, '#7dffb0');
            // Short breather before the next wave rolls in.
            this._nextWaveAt = this.time + 2.6;
        }

        /* ----------------------------------------------------------------- */
        /*  Presentation                                                      */
        /* ----------------------------------------------------------------- */
        updateParticles(dt) {
            this.particles.update(dt);
        }

        updateRings(dt) {
            for (const r of this.rings) {
                if (r.life <= 0) continue;
                r.life -= dt;
                const k = 1 - r.life / r.max;
                r.mesh.scale.setScalar(0.6 + k * (r.scale || 9));
                r.mesh.material.opacity = Math.max(0, 0.95 * (1 - k) * (1 - k));
                r.mesh.quaternion.copy(this.camera.quaternion);
                if (r.life <= 0) r.mesh.visible = false;
            }
        }

        updateTrail(dt, playing) {
            this.trailTimer -= dt;
            if (playing && this.trailTimer <= 0) {
                this.trailTimer = 0.022;
                const t = this.trail[this.trailIdx];
                this.trailIdx = (this.trailIdx + 1) % this.trail.length;
                t.life = 0.4; t.max = 0.4;
                t.sprite.position.set(
                    this.player.x + rand(-0.45, 0.45),
                    this.player.y + rand(-0.2, 0.2),
                    2.2 + rand(0, 0.6)
                );
                t.sprite.material.color.setHex(this.chassisDef.color);
                t.sprite.material.opacity = 0.55;
                t.sprite.scale.setScalar(1.5);
            }
            for (const t of this.trail) {
                if (t.life <= 0) { t.sprite.material.opacity = 0; continue; }
                t.life -= dt;
                const k = Math.max(0, t.life / t.max);
                t.sprite.material.opacity = 0.5 * k;
                t.sprite.scale.setScalar(1.5 + (1 - k) * 2.6);
                t.sprite.position.z += 40 * dt;
            }
        }

        updateShipTransform(dt) {
            const p = this.player;
            const o = this.playerObj;
            o.visible = p.hull > 0;
            o.position.set(p.x, p.y, 0);

            // Subtle ship pitch and yaw towards crosshair
            const aimYaw = (this.pointer.inside && this.pointer.x !== undefined) ? this.pointer.x * 0.22 : 0;
            const aimPitch = (this.pointer.inside && this.pointer.y !== undefined) ? this.pointer.y * 0.16 : 0;

            let rotZ = clamp(-p.vx * 0.045, -0.6, 0.6);
            let rotX = clamp(p.vy * 0.02 + aimPitch, -0.35, 0.35);
            if (p.rollTimer > 0) {
                rotZ = p.rollDir * TAU * p.roll;
            }
            o.rotation.z = damp(o.rotation.z, rotZ, 18, dt);
            o.rotation.x = damp(o.rotation.x, rotX + 0.04, 8, dt);
            o.rotation.y = damp(o.rotation.y, clamp(-p.vx * 0.02 + aimYaw, -0.38, 0.38), 10, dt);

            // Engine flame reacts to throttle.
            const flame = this.playerModel.glows;
            const throttle = this.player.boosting ? 1.9 : (this.state === 'playing' ? 1 : 0.7);
            flame.forEach((f, i) => {
                const flick = 0.9 + Math.sin(this.time * 30 + i * 2) * 0.12;
                f.scale.set(1, throttle * flick, 1);
            });

            // Damage flicker
            if (p.invuln > 0 && this.state === 'playing') {
                o.visible = Math.sin(this.time * 45) > -0.35;
            }
        }

        updateCamera(dt) {
            const p = this.player;
            const cam = this.camera;

            const targetFov = this.player.boosting ? 82 : 68;
            if (Math.abs(cam.fov - targetFov) > 0.05) {
                cam.fov = damp(cam.fov, targetFov, 6, dt);
                cam.updateProjectionMatrix();
            }

            const cx = p.x * 0.3;
            const cy = p.y * 0.45 + 3.1;
            const cz = 14.5 + (this.player.boosting ? -1.6 : 0);
            cam.position.x = damp(cam.position.x, cx, 7, dt);
            cam.position.y = damp(cam.position.y, cy, 7, dt);
            cam.position.z = damp(cam.position.z, cz, 5, dt);

            cam.rotation.z = damp(cam.rotation.z, -p.vx * 0.004 + (p.rollTimer > 0 ? -p.rollDir * 0.12 * Math.sin(p.roll * Math.PI) : 0), 8, dt);

            if (this.shake > 0) {
                this.shake = Math.max(0, this.shake - dt * 2.2);
                const s = this.shake * this.shake * 1.4;
                cam.position.x += rand(-s, s);
                cam.position.y += rand(-s, s);
                cam.rotation.z += rand(-s, s) * 0.02;
            }
            cam.lookAt(p.x * 0.5, p.y * 0.5 + 1.0, -40);

            // Boss health bar follows the boss, but is a DOM element so just keep it static.
        }

        updateHud() {
            if (this.state !== 'playing' && this.state !== 'paused') return;
            const p = this.player;
            const d = this.dom;
            const c = this._hudCache || (this._hudCache = {});

            // DOM writes are the expensive part of a HUD, so only touch a node
            // when the value it shows has actually changed.
            if (c.score !== this.score) {
                c.score = this.score;
                d.score.textContent = this.score.toLocaleString();
            }
            const credits = this.save.credits + this.runCredits;
            if (c.credits !== credits) {
                c.credits = credits;
                d.credits.textContent = credits.toLocaleString();
            }
            if (c.wave !== this.wave) { c.wave = this.wave; d.wave.textContent = this.wave; }

            const mult = clamp(1 + Math.floor(this.combo / 5), 1, 8);
            if (c.combo !== this.combo || c.mult !== mult) {
                c.combo = this.combo;
                c.mult = mult;
                d.combo.textContent = this.combo >= 5 ? `x${mult}  (${this.combo})` : '';
            }
            if (this.combo >= 5) d.combo.style.opacity = clamp(this.comboTimer / 1.2, 0.25, 1);

            const hullPct = Math.round(1000 * p.hull / p.maxHull) / 10;
            if (c.hull !== hullPct) { c.hull = hullPct; d.hullFill.style.width = hullPct + '%'; }
            const hullTxt = `${Math.ceil(p.hull)} / ${p.maxHull}`;
            if (c.hullTxt !== hullTxt) { c.hullTxt = hullTxt; d.hullText.textContent = hullTxt; }
            const shieldPct = Math.round(1000 * p.shield / p.maxShield) / 10;
            if (c.shield !== shieldPct) { c.shield = shieldPct; d.shieldFill.style.width = shieldPct + '%'; }
            const boostPct = Math.round(p.boost * 10) / 10;
            if (c.boost !== boostPct) { c.boost = boostPct; d.boostFill.style.width = boostPct + '%'; }
            if (c.ms !== p.missiles) { c.ms = p.missiles; d.missiles.textContent = String(p.missiles); }

            this.updateReticle();
        }

        /** Repositions crosshair to follow mouse and updates lock brackets. */
        updateReticle() {
            const d = this.dom;
            if (!d.locks) return;
            const targets = this.lockedTargets || [];
            const playing = this.state === 'playing';

            if (d.reticle) {
                if (playing) {
                    d.reticle.style.display = 'block';
                    const rx = (this.pointer.inside && this.pointer.pixelX !== undefined) ? this.pointer.pixelX : (this.width * 0.5);
                    const ry = (this.pointer.inside && this.pointer.pixelY !== undefined) ? this.pointer.pixelY : (this.height * 0.52);
                    d.reticle.style.left = rx.toFixed(1) + 'px';
                    d.reticle.style.top = ry.toFixed(1) + 'px';
                    d.reticle.classList.toggle('hovering', targets.length > 0);
                } else {
                    d.reticle.style.display = 'none';
                }
            }

            const v = this._projV || (this._projV = new THREE.Vector3());
            let n = 0;
            if (playing && targets.length > 0) {
                for (const e of targets) {
                    v.set(e.x, e.y, e.z);
                    v.project(this.camera);
                    if (v.z > 1) continue;
                    let el = d.locks.children[n];
                    if (!el) {
                        el = document.createElement('div');
                        el.className = 'vt-lock';
                        d.locks.appendChild(el);
                    }
                    const size = clamp(46 / Math.max(0.6, -e.z * 0.03), 22, 64);
                    el.style.display = 'block';
                    el.style.left = ((v.x * 0.5 + 0.5) * this.width).toFixed(1) + 'px';
                    el.style.top = ((-v.y * 0.5 + 0.5) * this.height).toFixed(1) + 'px';
                    el.style.width = size.toFixed(0) + 'px';
                    el.style.height = size.toFixed(0) + 'px';
                    n++;
                }
            }
            for (let i = n; i < d.locks.children.length; i++) {
                d.locks.children[i].style.display = 'none';
            }
        }

        /* ----------------------------------------------------------------- */
        /*  Space station (shop)                                              */
        /* ----------------------------------------------------------------- */
        openStation() {
            this.state = 'station';
            this.focused = true;
            this.dom.menu.style.display = 'none';
            this.dom.station.style.display = 'flex';
            this.renderStation();
        }

        closeStation() {
            this.state = 'menu';
            this.dom.station.style.display = 'none';
            this.dom.menu.style.display = 'flex';
            this.applyChassis();
            this.refreshMenu();
        }

        renderStation() {
            this.dom.stationCredits.textContent = this.save.credits.toLocaleString();
            const body = this.dom.stationBody;
            if (!body) return;

            let html = '';

            html += '<div class="vt-section-title">CHASSIS</div><div class="vt-cards">';
            CHASSIS.forEach((c) => {
                const owned = this.save.owned.includes(c.id);
                const equipped = this.save.chassis === c.id;
                html += `
                <div class="vt-card ${equipped ? 'equipped' : ''} ${owned ? '' : 'locked'}"
                     style="--accent:#${c.color.toString(16).padStart(6, '0')}">
                    <div class="vt-card-head">
                        <span class="vt-card-name">${c.name}</span>
                        <span class="vt-card-stat">HULL ${c.hull} · SPD ${c.speed} · ${c.shots}×LAS</span>
                    </div>
                    <div class="vt-card-desc">${c.desc}</div>
                    <button class="vt-buy" data-chassis="${c.id}">${
                    equipped ? 'EQUIPPED' : (owned ? 'EQUIP' : 'BUY · ' + c.cost.toLocaleString())
                    }</button>
                </div>`;
            });
            html += '</div>';

            html += '<div class="vt-section-title">SYSTEM UPGRADES</div><div class="vt-cards">';
            UPGRADES.forEach((u) => {
                const lvl = this.save.upgrades[u.id];
                const maxed = lvl >= u.max;
                const cost = maxed ? 0 : u.cost(lvl);
                const pips = Array.from({ length: u.max }, (_, i) =>
                    `<i class="vt-pip ${i < lvl ? 'on' : ''}"></i>`).join('');
                html += `
                <div class="vt-card ${maxed ? 'equipped' : ''}" style="--accent:#4ea1ff">
                    <div class="vt-card-head">
                        <span class="vt-card-name">${u.name}</span>
                        <span class="vt-card-stat">${pips}</span>
                    </div>
                    <div class="vt-card-desc">${maxed ? 'Fully upgraded' : u.desc(lvl)}</div>
                    <button class="vt-buy" data-upgrade="${u.id}">${
                    maxed ? 'MAX' : 'UPGRADE · ' + cost.toLocaleString()
                    }</button>
                </div>`;
            });
            html += '</div>';

            body.innerHTML = html;

            body.querySelectorAll('[data-chassis]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-chassis');
                    const c = CHASSIS.find((x) => x.id === id);
                    if (this.save.owned.includes(id)) {
                        this.save.chassis = id;
                        this.sfx.buy();
                    } else if (this.save.credits >= c.cost) {
                        this.save.credits -= c.cost;
                        this.save.owned.push(id);
                        this.save.chassis = id;
                        this.sfx.buy();
                    } else {
                        this.sfx.deny();
                    }
                    writeSave(this.save);
                    this.renderStation();
                });
            });

            body.querySelectorAll('[data-upgrade]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-upgrade');
                    const u = UPGRADES.find((x) => x.id === id);
                    const lvl = this.save.upgrades[id];
                    if (lvl >= u.max) { this.sfx.deny(); return; }
                    const cost = u.cost(lvl);
                    if (this.save.credits >= cost) {
                        this.save.credits -= cost;
                        this.save.upgrades[id] = lvl + 1;
                        this.sfx.buy();
                    } else {
                        this.sfx.deny();
                    }
                    writeSave(this.save);
                    this.renderStation();
                });
            });
        }

        /* ----------------------------------------------------------------- */
        /*  Main loop                                                         */
        /* ----------------------------------------------------------------- */
        loop(now) {
            if (this.destroyed) return;
            if (!document.body.contains(this.canvas)) {
                this.destroy();
                return;
            }
            let dt = (now - this.clock) / 1000;
            this.clock = now;
            if (!isFinite(dt)) dt = 0.016;
            dt = Math.min(dt, 0.05);

            if (this.state !== 'paused' && this.state !== 'station') {
                this.update(dt);
            } else {
                // Keep the scene alive behind the overlay, just slower.
                this.updateBackground(dt * 0.35, false);
                this.particles.update(dt);
                this.updateCamera(dt);
            }

            if (this.composer && this.useBloom) this.composer.render(dt);
            else this.renderer.render(this.scene, this.camera);

            // Adaptive quality — bloom is the single most expensive effect, so
            // drop it (permanently for this session) if we can't hold ~30fps.
            this._fpsAccum += dt;
            this._fpsFrames++;
            if (this._fpsAccum >= 2) {
                if (this._fpsFrames / this._fpsAccum < 30 && this.useBloom) {
                    this.useBloom = false;
                    if (this.composer.renderTarget1) this.composer.renderTarget1.dispose();
                    if (this.composer.renderTarget2) this.composer.renderTarget2.dispose();
                    this.composer = null;
                }
                this._fpsAccum = 0;
                this._fpsFrames = 0;
            }

            this.rafId = requestAnimationFrame((t) => this.loop(t));
        }

        /* ----------------------------------------------------------------- */
        destroy() {
            if (this.destroyed) return;
            this.destroyed = true;
            cancelAnimationFrame(this.rafId);
            clearTimeout(this._bannerTimer);

            window.removeEventListener('keydown', this.onKeyDown);
            window.removeEventListener('keyup', this.onKeyUp);
            if (this.stage) {
                this.stage.removeEventListener('mousemove', this.onMouseMove);
                this.stage.removeEventListener('mouseenter', this.onMouseEnter);
                this.stage.removeEventListener('mouseleave', this.onMouseLeave);
            }
            document.removeEventListener('mousedown', this.onMouseDown, true);
            window.removeEventListener('mouseup', this.onMouseUp);
            this.container.removeEventListener('contextmenu', this.onContext);
            window.removeEventListener('blur', this.onBlur);
            if (this.observer) this.observer.disconnect();

            this.sfx.destroy();

            if (this.scene) {
                this.scene.traverse((o) => {
                    if (o.geometry) o.geometry.dispose();
                    if (o.material) {
                        const mats = Array.isArray(o.material) ? o.material : [o.material];
                        mats.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
                    }
                });
            }
            if (this.glowTex) this.glowTex.dispose();
            if (this.composer) {
                if (this.composer.renderTarget1) this.composer.renderTarget1.dispose();
                if (this.composer.renderTarget2) this.composer.renderTarget2.dispose();
            }
            if (this.renderer) this.renderer.dispose();
        }
    }

    /* --------------------------------------------------------------------- */
    /*  BrowOS hook                                                           */
    /* --------------------------------------------------------------------- */
    window.initStarshipGame = function (windowEl) {
        if (!windowEl || !windowEl.querySelector('.starship-window')) return;
        // One live instance per window.
        if (windowEl._voidTactics) return;
        try {
            windowEl._voidTactics = new VoidTactics3D(windowEl);
        } catch (e) {
            console.error('[VoidTactics3D] init failed', e);
            const el = windowEl.querySelector('#vt-fatal');
            if (el) {
                el.style.display = 'flex';
                el.querySelector('.vt-fatal-msg').textContent = 'Init error: ' + e.message;
            }
        }
    };
})();
