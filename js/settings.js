/**
 * BrowOS Settings Store
 * One schema, one persistence layer, one apply path for every user preference.
 * Settings apply live to the running OS (CSS variables + body classes) and
 * write through to the legacy browos_* localStorage keys that older
 * consumers (desktop dock, window minimize) still read.
 */
(function (root) {
    'use strict';

    const STORAGE_KEY = 'browos_settings_v2';

    const DEFAULTS = {
        theme: 'dark',              // 'light' | 'dark' | 'system' (legacy 'auto' accepted)
        accent: '#0a84ff',
        reduceTransparency: false,
        glassBlur: 24,              // px, backdrop blur radius for chrome surfaces
        reduceMotion: false,
        uiSounds: true,
        mute: false,
        volume: 70,                 // system output volume 0-100
        alertVolume: 60,            // UI alert sounds 0-100
        dockSize: 52,
        dockMagnification: true,
        dockAutohide: false,
        dockPosition: 'bottom',
        minimizeEffect: 'scale',
        animateWallpaper: true,
        showWidgets: true,
        wasmAcceleration: true,
        username: 'BrowOS User'
    };

    // Legacy single-value keys that existing consumers read directly.
    const LEGACY_WRITE = {
        dockSize: 'browos_dock_size',
        dockMagnification: 'browos_dock_magnification',
        dockAutohide: 'browos_dock_autohide',
        dockPosition: 'browos_dock_position',
        minimizeEffect: 'browos_minimize_effect',
        username: 'browos_username'
    };
    const LEGACY_READ = {
        browos_dock_size: 'dockSize',
        browos_dock_autohide: 'dockAutohide',
        browos_dock_position: 'dockPosition',
        browos_minimize_effect: 'minimizeEffect',
        browos_username: 'username'
    };

    const state = Object.assign({}, DEFAULTS);
    const listeners = {};
    let persistTimer = null;
    let systemThemeQuery = null;
    let systemWatcherBound = false;

    // 'system' is the canonical "follow the OS" value. 'auto' is the legacy
    // spelling persisted by earlier builds and is still accepted everywhere.
    const SYSTEM_THEME_VALUES = ['system', 'auto'];
    const isSystemTheme = v => SYSTEM_THEME_VALUES.indexOf(v) !== -1;
    const VALID_THEMES = ['light', 'dark', 'system', 'auto'];

    function load() {
        // Migrate pre-store legacy keys on first run.
        let migrated = false;
        for (const [lk, sk] of Object.entries(LEGACY_READ)) {
            const raw = localStorage.getItem(lk);
            if (raw !== null) {
                const num = Number(raw);
                state[sk] = Number.isFinite(num) && String(num) === raw ? num : (raw === 'true' ? true : raw === 'false' ? false : raw);
                migrated = true;
            }
        }
        try {
            const blob = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
            if (blob && typeof blob === 'object') {
                for (const k of Object.keys(DEFAULTS)) {
                    if (blob[k] !== undefined) state[k] = blob[k];
                }
                migrated = true;
            }
        } catch (e) { /* corrupt blob falls back to defaults/legacy */ }

        // Migrate the legacy 'auto' spelling to the canonical 'system'.
        // Same meaning (follow the OS), so this preserves the user's intent;
        // it is written back to storage on the next persist().
        if (state.theme === 'auto') state.theme = 'system';
        // Defensive: an unknown/garbage theme value falls back to the default
        // rather than being passed through to the data-theme attribute.
        if (VALID_THEMES.indexOf(state.theme) === -1) state.theme = DEFAULTS.theme;

        return migrated;
    }

    function persist() {
        clearTimeout(persistTimer);
        persistTimer = setTimeout(() => {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            } catch (e) { /* quota — settings simply stay session-only */ }
        }, 120);
    }

    // ─── Application to the live OS ─────────────────────────────────────────

    const rootEl = () => document.documentElement;

    function hexToRgb(hex) {
        const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [10, 132, 255];
    }

    function applyAccent(hex) {
        const [r, g, b] = hexToRgb(hex);
        const s = rootEl().style;
        s.setProperty('--accent', hex);
        s.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
        // Keep the control system's accent variables in sync.
        s.setProperty('--brow-accent', hex);
        s.setProperty('--brow-accent-strong', hex);
    }

    function systemQuery() {
        if (!systemThemeQuery) {
            systemThemeQuery = root.matchMedia('(prefers-color-scheme: dark)');
        }
        return systemThemeQuery;
    }

    /**
     * Resolve the theme that should actually be painted.
     * 'light' / 'dark' are used verbatim; 'system' (and legacy 'auto') defer
     * to the OS preference.
     */
    function effectiveTheme() {
        if (!isSystemTheme(state.theme)) return state.theme;
        const mq = systemQuery();
        return (mq && mq.matches) ? 'dark' : 'light';
    }

    function applyTheme() {
        rootEl().dataset.theme = effectiveTheme();
    }

    /**
     * Bind the OS-preference listener exactly once. The handler re-checks the
     * current setting on every fire, so switching into/out of 'system' needs
     * no add/remove bookkeeping and cannot accumulate duplicate listeners.
     */
    function bindSystemWatcher() {
        if (systemWatcherBound) return;
        const mq = systemQuery();
        if (!mq) return;
        const onOsChange = () => { if (isSystemTheme(state.theme)) applyTheme(); };
        if (mq.addEventListener) mq.addEventListener('change', onOsChange);
        else if (mq.addListener) mq.addListener(onOsChange); // Safari < 14
        systemWatcherBound = true;
    }

    function applyFlags() {
        const cl = rootEl().classList;
        cl.toggle('theme-reduce-transparency', !!state.reduceTransparency);
        cl.toggle('theme-reduce-motion', !!state.reduceMotion);
        cl.toggle('theme-static-wallpaper', !state.animateWallpaper);
        cl.toggle('theme-hide-widgets', state.showWidgets === false);
    }

    function applyBlur() {
        rootEl().style.setProperty('--glass-blur', `${Math.round(state.glassBlur)}px`);
    }

    // ─── System audio bus (Web Audio, lazily created) ───────────────────────

    const BrowAudio = {
        ctx: null,
        master: null,
        noiseBuf: null,
        ensure() {
            if (this.ctx) return this.ctx;
            const AC = root.AudioContext || root.webkitAudioContext;
            if (!AC) return null;
            this.ctx = new AC();
            this.master = this.ctx.createGain();
            this.master.connect(this.ctx.destination);
            this.applyVolumes();
            return this.ctx;
        },
        applyVolumes() {
            if (!this.master) return;
            const out = state.mute ? 0 : state.volume / 100;
            this.master.gain.setTargetAtTime(out, this.ctx.currentTime, 0.02);
        },
        _noiseBuffer() {
            if (this.noiseBuf) return this.noiseBuf;
            const len = Math.floor(this.ctx.sampleRate * 0.5);
            const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
            this.noiseBuf = buf;
            return buf;
        },
        /** System sound vocabulary — fully synthesized, zero audio assets.
         *  tick · success · fail · alert · notification · open · close ·
         *  minimize · restore · maximize · snap · trash · boot · shutdown
         */
        play(name) {
            if (!state.uiSounds || state.mute) return;
            const ctx = this.ensure();
            if (!ctx) return;
            if (ctx.state === 'suspended') ctx.resume().catch(() => {});
            const t = ctx.currentTime;
            const bus = ctx.createGain();
            bus.connect(this.master);
            const v = 0.25 * (state.alertVolume / 100); // alert-level
            const u = v * 0.8;                           // quieter gesture level
            const tone = (freq, start, dur, type, peak, glideTo) => {
                const osc = ctx.createOscillator();
                osc.type = type || 'sine';
                const t0 = t + start;
                osc.frequency.setValueAtTime(freq, t0);
                if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
                const g = ctx.createGain();
                g.gain.setValueAtTime(0, t0);
                g.gain.linearRampToValueAtTime(peak, t0 + 0.008);
                g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
                osc.connect(g).connect(bus);
                osc.start(t0);
                osc.stop(t0 + dur + 0.02);
            };
            const noise = (start, dur, peak, freq, ftype) => {
                const t0 = t + start;
                const src = ctx.createBufferSource();
                src.buffer = this._noiseBuffer();
                src.loop = true;
                const f = ctx.createBiquadFilter();
                f.type = ftype || 'bandpass';
                f.frequency.value = freq || 1200;
                f.Q.value = 1.1;
                const g = ctx.createGain();
                g.gain.setValueAtTime(0, t0);
                g.gain.linearRampToValueAtTime(peak, t0 + 0.012);
                g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
                src.connect(f).connect(g).connect(bus);
                src.start(t0);
                src.stop(t0 + dur + 0.05);
            };
            const arp = (freqs, step, dur, peak) =>
                freqs.forEach((f, i) => tone(f, i * step, dur, 'sine', peak));
            switch (name) {
                case 'success':
                    tone(660, 0, 0.12, 'sine', v);
                    tone(990, 0.09, 0.16, 'sine', v);
                    break;
                case 'fail':
                    tone(220, 0, 0.18, 'triangle', v);
                    tone(180, 0.12, 0.22, 'triangle', v);
                    break;
                case 'alert':
                    tone(880, 0, 0.09, 'sine', v);
                    tone(880, 0.14, 0.09, 'sine', v);
                    break;
                case 'notification':
                    tone(880, 0, 0.12, 'sine', v * 0.9);
                    tone(1174, 0.1, 0.2, 'sine', v * 0.8);
                    break;
                case 'open':
                    noise(0, 0.16, u * 0.45, 900, 'highpass');
                    tone(1200, 0, 0.03, 'sine', u * 0.3);
                    tone(380, 0, 0.14, 'sine', u * 0.35, 640);
                    break;
                case 'close':
                    tone(640, 0, 0.16, 'sine', u * 0.35, 380);
                    noise(0, 0.12, u * 0.4, 700, 'highpass');
                    break;
                case 'minimize':
                    tone(620, 0, 0.28, 'sine', u * 0.4, 240);
                    noise(0, 0.22, u * 0.18, 500, 'lowpass');
                    break;
                case 'restore':
                    tone(240, 0, 0.28, 'sine', u * 0.4, 620);
                    break;
                case 'maximize':
                    tone(130, 0, 0.16, 'sine', v * 0.5);
                    noise(0, 0.06, u * 0.3, 2500, 'highpass');
                    break;
                case 'snap':
                    tone(1700, 0, 0.03, 'sine', u * 0.5);
                    tone(90, 0.01, 0.09, 'sine', v * 0.5);
                    break;
                case 'trash':
                    noise(0, 0.22, v * 0.5, 900);
                    noise(0.06, 0.16, v * 0.35, 1600);
                    tone(190, 0.02, 0.12, 'triangle', v * 0.3);
                    break;
                case 'boot':
                    arp([174.61, 220, 261.63, 329.63, 349.23], 0.09, 0.85, v * 0.5);
                    break;
                case 'shutdown':
                    arp([659.25, 523.25, 392, 261.63], 0.1, 0.5, v * 0.4);
                    break;
                default: // tick
                    tone(1320, 0, 0.045, 'sine', v * 0.6);
            }
        }
    };

    // ─── Public API ──────────────────────────────────────────────────────────

    const store = {
        defaults: DEFAULTS,
        get(key) { return key ? state[key] : Object.assign({}, state); },
        all() { return Object.assign({}, state); },

        set(key, value) {
            if (!(key in DEFAULTS) || state[key] === value) return value;
            state[key] = value;
            persist();
            if (LEGACY_WRITE[key]) {
                try { localStorage.setItem(LEGACY_WRITE[key], String(value)); } catch (e) {}
            }
            switch (key) {
                case 'theme': applyTheme(); break;
                case 'accent': applyAccent(value); break;
                case 'glassBlur': applyBlur(); break;
                case 'reduceTransparency': case 'reduceMotion': case 'animateWallpaper':
                    applyFlags(); break;
                case 'volume': case 'mute': case 'alertVolume':
                    BrowAudio.applyVolumes(); break;
            }
            (listeners[key] || []).forEach(fn => { try { fn(value); } catch (e) {} });
            (listeners['*'] || []).forEach(fn => { try { fn(key, value); } catch (e) {} });
            return value;
        },

        reset(key) {
            if (key) { this.set(key, DEFAULTS[key]); return; }
            for (const k of Object.keys(DEFAULTS)) this.set(k, DEFAULTS[k]);
        },

        resetAll() {
            try {
                localStorage.removeItem(STORAGE_KEY);
                Object.values(LEGACY_WRITE).forEach(k => localStorage.removeItem(k));
            } catch (e) {}
            for (const k of Object.keys(DEFAULTS)) state[k] = DEFAULTS[k];
            applyAll();
        },

        onChange(key, fn) {
            (listeners[key] = listeners[key] || []).push(fn);
        },

        audio: BrowAudio,

        /** Re-apply every preference to the live DOM. */
        applyAll() {
            applyTheme();
            applyAccent(state.accent);
            applyBlur();
            applyFlags();
            BrowAudio.applyVolumes();
        }
    };

    // Expose synchronously so consumers can read settings before first apply.
    root.BrowSettings = store;

    function applyAllAndWatch() {
        load();
        // Always bound (once), regardless of the current mode: the handler
        // itself only reacts while the setting is 'system'. This is what makes
        // system mode live-update when the OS preference flips.
        bindSystemWatcher();
        store.applyAll();
        root.dispatchEvent(new CustomEvent('browos-settings-ready'));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyAllAndWatch, { once: true });
    } else {
        applyAllAndWatch();
    }
})(window);
