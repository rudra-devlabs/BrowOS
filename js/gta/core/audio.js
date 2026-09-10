    // ===========================================================================
    // AUDIO — WebAudio bus. Synthesizes everything by default; when an asset
    // pack is present, real samples take priority and the synth is fallback.
    // ===========================================================================
    class AudioBus {
        constructor(sampleUrls) {
            this.ctx = null;
            this.muted = false;
            this._engine = null;
            this._siren = null;
            this._engineS = null;   // sample-based engine loops
            this._sirenS = null;    // sample-based siren loop
            this._skid = null;      // tire-screech loop (sample or synth)
            // Per-bus volume multipliers (settings menu). 1 = designed loudness.
            this.vol = { master: 1, engine: 0.8, sfx: 1, music: 0.8 };
            this.sampleUrls = sampleUrls || null;
            this.samples = {};      // name -> AudioBuffer (null once failed)
            this.radioTracks = [];    // vehicle-radio playlist [{title, url}]
            this._radioEl = null;     // streaming <audio> (full songs, no big decode)
            this._radioGain = null;   // music bus gain into master
            this._radioIdx = -1;
            this._radioOn = true;     // autoplay preference (R-cycle can switch it off)
            this._radioPaused = false;// paused by the pause menu (auto-resume)
            this._radioBad = {};      // url -> true once it errors
            this._radioSrcUrl = null;   // url currently loaded in the element
            this._radioRepeatIdx = -1;  // per-song repeat (→ key), -1 = off
            this.listener = { x: 0, y: 0, z: 0, heading: 0 };
        }
        ensure() {
            if (this.ctx) {
                if (this.ctx.state === 'suspended') this.ctx.resume();
                return true;
            }
            try {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return false;
                this.ctx = new AC();
                this.master = this.ctx.createGain();
                this.master.gain.value = 0.4 * (this.muted ? 0 : this.vol.master);
                this.master.connect(this.ctx.destination);
                // SFX sub-bus: every one-shot/loop synth + sample routes through
                // it so the settings SFX slider scales them all in one place.
                this.ctx.sfxBus = this.ctx.createGain();
                this.ctx.sfxBus.gain.value = this.vol.sfx;
                this.ctx.sfxBus.connect(this.master);
                this._preloadSamples();
                return true;
            } catch (e) { return false; }
        }
        /** Update listener position and orientation for spatial audio calculations. */
        setListener(x, y, z, heading) {
            this.listener.x = x || 0;
            this.listener.y = y || 0;
            this.listener.z = z || 0;
            this.listener.heading = heading || 0;
        }
        /**
         * Smooth realistic distance gain falloff.
         * Within refDist: 1.0 (full volume).
         * Beyond maxDist: 0.0 (silent).
         * Between: smooth inverse falloff with linear windowing to 0 at maxDist.
         */
        getDistGain(x, z, maxDist = 55, refDist = 4, rolloff = 1.2) {
            if (x === undefined || z === undefined) return 1.0;
            const dx = x - this.listener.x, dz = z - this.listener.z;
            const d = Math.sqrt(dx * dx + dz * dz);
            if (d <= refDist) return 1.0;
            if (d >= maxDist) return 0.0;
            const fade = (1 - (d - refDist) / (maxDist - refDist));
            const att = refDist / (refDist + rolloff * (d - refDist));
            return Math.max(0, Math.min(1, att * fade));
        }
        /** Stereo panning -0.85 (left) .. 0.85 (right) based on relative position to listener */
        getPan(x, z) {
            if (x === undefined || z === undefined || !this.ctx) return 0;
            const dx = x - this.listener.x, dz = z - this.listener.z;
            const cos = Math.cos(-this.listener.heading), sin = Math.sin(-this.listener.heading);
            const relX = dx * cos - dz * sin;
            return clamp(relX / 24, -0.85, 0.85);
        }
        _connectOutput(node, gainNode, x, z) {
            node.connect(gainNode);
            const sfx = this.ctx && this.ctx.sfxBus;
            if (this.ctx && this.ctx.createStereoPanner && x !== undefined && z !== undefined) {
                try {
                    const pan = this.ctx.createStereoPanner();
                    pan.pan.value = this.getPan(x, z);
                    gainNode.connect(pan);
                    pan.connect(sfx || this.master);
                    return;
                } catch (e) {}
            }
            gainNode.connect(sfx || this.master);
        }
        /** Route a source into the SFX bus (per-bus gain → master). */
        _connectSfx(node) { node.connect(this.ctx.sfxBus); }
        /** Kick off async fetch+decode of every listed sample (once). Supports OGG with MP3 fallback. */
        _preloadSamples() {
            if (!this.sampleUrls || this._samplesQueued) return;
            this._samplesQueued = true;
            for (const name in this.sampleUrls) {
                const url = this.sampleUrls[name];
                const load = (src) => fetch(src)
                    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
                    .then((ab) => this.ctx.decodeAudioData(ab));
                load(url)
                    .catch(() => (/\.ogg$/i.test(url) ? load(url.replace(/\.ogg$/i, '.mp3')) : Promise.reject()))
                    .then((buf) => { this.samples[name] = buf; })
                    .catch(() => { this.samples[name] = null; });
            }
        }
        _sample(name) {
            const b = this.samples[name];
            return (b && typeof b.duration === 'number') ? b : null;
        }
        /** Fire a decoded one-shot sample with optional spatial attenuation; false -> caller falls back to synth. */
        play(name, vol, rate, x, z, maxDist, refDist) {
            if (this.muted || !this.ctx) return false;
            const buf = this._sample(name);
            if (!buf) return false;
            const distGain = this.getDistGain(x, z, maxDist || 55, refDist || 4);
            if (distGain <= 0.002) return true; // Handled as out of range
            const s = this.ctx.createBufferSource();
            s.buffer = buf;
            s.playbackRate.value = rate || 1;
            const g = this.ctx.createGain();
            g.gain.value = (vol === undefined ? 0.5 : vol) * distGain * this.vol.sfx;
            this._connectOutput(s, g, x, z);
            s.start();
            return true;
        }
        _env(gain, dur, peak) {
            const t = this.ctx.currentTime;
            gain.gain.setValueAtTime(0.0001, t);
            gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t + 0.008);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        }
        blip(freq, dur, type, peak, slideTo, x, z, maxDist, refDist) {
            if (!this.ctx || this.muted) return;
            const distGain = this.getDistGain(x, z, maxDist || 45, refDist || 3);
            if (distGain <= 0.002) return;
            const o = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            o.type = type || 'sine';
            o.frequency.setValueAtTime(freq, this.ctx.currentTime);
            if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, this.ctx.currentTime + dur);
            this._env(g, dur, (peak || 0.25) * distGain * this.vol.sfx);
            this._connectOutput(o, g, x, z);
            o.start();
            o.stop(this.ctx.currentTime + dur + 0.02);
        }
        healChime() {
            if (!this.ensure()) return;
            this.blip(523.25, 0.18, 'sine', 0.28);
            setTimeout(() => { if (this.ctx) this.blip(659.25, 0.2, 'sine', 0.26); }, 100);
            setTimeout(() => { if (this.ctx) this.blip(783.99, 0.3, 'triangle', 0.24); }, 200);
            setTimeout(() => { if (this.ctx) this.blip(1046.50, 0.45, 'sine', 0.2); }, 320);
        }
        policeBribe() {
            if (!this.ensure()) return;
            this.noise(0.08, 1600, 0.18, 'bandpass');
            setTimeout(() => { if (this.ctx) this.blip(440, 0.12, 'square', 0.16); }, 80);
            setTimeout(() => { if (this.ctx) this.blip(880, 0.18, 'square', 0.18); }, 170);
        }
        pedMumble(pitch = 1.0, x, z) {
            if (!this.ensure()) return;
            const base = 280 * pitch;
            this.blip(base, 0.08, 'sawtooth', 0.14, base * 1.3, x, z, 18, 2);
            setTimeout(() => { if (this.ctx) this.blip(base * 1.2, 0.09, 'sine', 0.15, base * 0.9, x, z, 18, 2); }, 75);
        }
        buyChime() {
            if (!this.ensure()) return;
            const t = this.ctx.currentTime;
            this.blip(987.77, 0.12, 'sine', 0.28);
            setTimeout(() => { if (this.ctx) this.blip(1318.51, 0.25, 'triangle', 0.24); }, 65);
            setTimeout(() => { if (this.ctx) this.noise(0.09, 2200, 0.15, 'bandpass'); }, 130);
        }
        eatChomp() {
            if (!this.ensure()) return;
            this.noise(0.08, 1400, 0.35, 'bandpass');
            setTimeout(() => {
                if (this.ctx) {
                    this.noise(0.06, 900, 0.25, 'lowpass');
                    this.blip(260, 0.1, 'sine', 0.18, 160);
                }
            }, 80);
        }
        drinkSip() {
            if (!this.ensure()) return;
            this.noise(0.14, 1800, 0.2, 'highpass');
            setTimeout(() => { if (this.ctx) this.blip(320, 0.09, 'sine', 0.15, 420); }, 100);
        }
        noise(dur, freq, peak, type, x, z, maxDist, refDist) {
            if (!this.ctx || this.muted) return;
            const distGain = this.getDistGain(x, z, maxDist || 55, refDist || 4);
            if (distGain <= 0.002) return;
            const n = Math.floor(this.ctx.sampleRate * dur);
            const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
            const src = this.ctx.createBufferSource();
            src.buffer = buf;
            const f = this.ctx.createBiquadFilter();
            f.type = type || 'lowpass';
            f.frequency.value = freq;
            const g = this.ctx.createGain();
            this._env(g, dur, (peak || 0.3) * distGain * this.vol.sfx);
            src.connect(f);
            this._connectOutput(f, g, x, z);
            src.start();
        }
        shot(x, z) {
            if (this.play('gunshot', 0.75, 0.95 + Math.random() * 0.1, x, z, 90, 6)) return;
            if (!this.ensure()) return;
            const distGain = this.getDistGain(x, z, 90, 6);
            if (distGain <= 0.002) return;
            const t = this.ctx.currentTime;
            // Heavy punch transient (808-style 130Hz -> 36Hz bass punch)
            const osc = this.ctx.createOscillator(), gOsc = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(140, t);
            osc.frequency.exponentialRampToValueAtTime(32, t + 0.14);
            gOsc.gain.setValueAtTime(0.55 * distGain, t);
            gOsc.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
            this._connectOutput(osc, gOsc, x, z);
            osc.start(t); osc.stop(t + 0.18);
            // Crisp explosive crack
            this.noise(0.18, 2200, 0.6 * distGain, 'bandpass', x, z, 90, 6);
            this.noise(0.08, 4800, 0.45 * distGain, 'highpass', x, z, 90, 6);
        }
        dry() { this.blip(900, 0.04, 'square', 0.08); }
        subwayChime() {
            if (!this.ensure()) return;
            const t = this.ctx.currentTime;
            const o1 = this.ctx.createOscillator(), g1 = this.ctx.createGain();
            o1.type = 'sine'; o1.frequency.setValueAtTime(698.46, t);
            g1.gain.setValueAtTime(0.3, t);
            g1.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
            o1.connect(g1); g1.connect(this.master);
            o1.start(t); o1.stop(t + 0.5);

            const o2 = this.ctx.createOscillator(), g2 = this.ctx.createGain();
            o2.type = 'sine'; o2.frequency.setValueAtTime(523.25, t + 0.22);
            g2.gain.setValueAtTime(0.35, t + 0.22);
            g2.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
            o2.connect(g2); g2.connect(this.master);
            o2.start(t + 0.22); o2.stop(t + 0.85);

            const o3 = this.ctx.createOscillator(), g3 = this.ctx.createGain();
            o3.type = 'triangle'; o3.frequency.setValueAtTime(58, t);
            o3.frequency.linearRampToValueAtTime(85, t + 1.2);
            g3.gain.setValueAtTime(0.18, t);
            g3.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
            o3.connect(g3); g3.connect(this.master);
            o3.start(t); o3.stop(t + 1.45);
        }
        punch(x, z) {
            if (this.play('punch', 0.5, 0.92 + Math.random() * 0.16, x, z, 22, 2)) return;
            this.blip(120, 0.09, 'sine', 0.4, 55, x, z, 22, 2);
            this.noise(0.05, 900, 0.14, 'lowpass', x, z, 22, 2);
        }
        impact(v, x, z) {
            const s = clamp(v / 14, 0.15, 1);
            if (this.play('crash', 0.25 + s * 0.45, 0.9 + Math.random() * 0.2, x, z, 65, 5)) return;
            this.noise(0.16 + s * 0.1, 700, 0.28 * s + 0.08, 'lowpass', x, z, 65, 5);
            this.blip(70, 0.16, 'sine', 0.4 * s, 38, x, z, 65, 5);
        }
        boom(x, z) {
            if (this.play('boom', 0.75, 1, x, z, 130, 10)) return;
            this.noise(0.7, 400, 0.8, 'lowpass', x, z, 130, 10);
            this.blip(90, 0.7, 'sine', 0.7, 30, x, z, 130, 10);
        }
        pickup(kind) {
            const name = kind === 'item' ? 'pickup_item' : 'pickup_cash';
            if (this.play(name, 0.4)) return;
            this.blip(660, 0.07, 'sine', 0.22); setTimeout(() => this.blip(990, 0.09, 'sine', 0.22), 70);
        }
        hurt() { this.blip(260, 0.14, 'sawtooth', 0.2, 130); }
        pedMumble(pitch = 1, x, z) {
            if (!this.ensure()) return;
            const distGain = this.getDistGain(x, z, 30, 3);
            if (distGain <= 0.002) return;
            const f = (180 + Math.random() * 80) * (pitch || 1);
            this.blip(f, 0.08, 'sawtooth', 0.14 * distGain, f * 0.8, x, z, 30, 3);
        }
        scream(x, z) { this.play('scream', 0.3, 0.9 + Math.random() * 0.25, x, z, 35, 3); }
        skid(x, z) { this.play('skid', 0.3, 0.95 + Math.random() * 0.1, x, z, 45, 4); }
        /**
         * Continuous tire-screech loop. Sample-based when a decoded 'skid'
         * asset exists (looped buffer with a slow rate wobble), else a
         * band-passed noise synth. `on` gates it, level 0..1 scales loudness,
         * x/z spatialize it against the listener. Engine/SFX-bus independent:
         * it hangs off master so it survives bus re-creations.
         */
        setSkid(on, x, z, level = 0.6) {
            if (!this.ctx) return;
            const t = this.ctx.currentTime;
            const target = (on && !this.muted)
                ? clamp(level, 0, 1) * this.getDistGain(x, z, 60, 4) * 0.42
                : 0;
            if (on && target > 0.004 && !this._skid) {
                const buf = this._sample('skid');
                const g = this.ctx.createGain();
                g.gain.value = 0.0001;
                if (buf) {
                    const s = this.ctx.createBufferSource();
                    s.buffer = buf;
                    s.loop = true;
                    s.playbackRate.value = 0.9 + Math.random() * 0.15;
                    this._connectOutput(s, g, x, z);
                    s.start();
                    this._skid = { s, g, sample: true };
                } else {
                    // Synth fallback: looping band-passed white noise.
                    const n = Math.floor(this.ctx.sampleRate * 2);
                    const b = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
                    const d = b.getChannelData(0);
                    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
                    const s = this.ctx.createBufferSource();
                    s.buffer = b;
                    s.loop = true;
                    const f = this.ctx.createBiquadFilter();
                    f.type = 'bandpass';
                    f.frequency.value = 900;
                    f.Q.value = 1.4;
                    s.connect(f);
                    this._connectOutput(f, g, x, z);
                    s.start();
                    this._skid = { s, g, f, sample: false };
                }
            }
            if (this._skid) {
                const k = this._skid;
                if (target <= 0.004) {
                    this._skid = null;
                    k.g.gain.setTargetAtTime(0.0001, t, 0.08);
                    setTimeout(() => { try { k.s.stop(); k.s.disconnect(); } catch (e) {} }, 340);
                } else {
                    k.g.gain.setTargetAtTime(target, t, 0.06);
                    if (!k.sample && k.f) {
                        // Slow screech pitch wander so the synth never sounds static.
                        k.f.frequency.setTargetAtTime(760 + 220 * clamp(level, 0, 1) + Math.sin(t * 7.3) * 55, t, 0.1);
                    }
                }
            }
        }
        /** Car door latch click and hinge swing open */
        doorOpen(x, z) {
            if (this.play('door_open', 0.45, 1, x, z, 35, 2)) return;
            if (!this.ensure()) return;
            const distGain = this.getDistGain(x, z, 35, 2);
            if (distGain <= 0.002) return;
            this.blip(680, 0.035, 'triangle', 0.28 * distGain, 120, x, z, 35, 2);
            this.noise(0.06, 1200, 0.16 * distGain, 'bandpass', x, z, 35, 2);
        }
        /** Heavy automotive door slam thud */
        doorSlam(x, z) {
            if (this.play('door_close', 0.55, 1, x, z, 45, 3)) return;
            if (!this.ensure()) return;
            const distGain = this.getDistGain(x, z, 45, 3);
            if (distGain <= 0.002) return;
            this.blip(85, 0.12, 'sine', 0.42 * distGain, 35, x, z, 45, 3);
            this.noise(0.09, 520, 0.32 * distGain, 'lowpass', x, z, 45, 3);
            this.blip(320, 0.04, 'square', 0.15 * distGain, 80, x, z, 45, 3);
        }
        /** Grapple and wrestling scuffle sound during carjacking struggle */
        grapple(x, z) {
            if (this.play('grapple', 0.4, 1, x, z, 25, 2)) return;
            if (!this.ensure()) return;
            const distGain = this.getDistGain(x, z, 25, 2);
            if (distGain <= 0.002) return;
            this.noise(0.14, 750, 0.26 * distGain, 'bandpass', x, z, 25, 2);
            this.blip(130, 0.09, 'sine', 0.32 * distGain, 65, x, z, 25, 2);
        }
        /**
         * Ambient vehicle horn beep from traffic or nearby cars with distance falloff & stereo pan.
         */
        horn(x, z) {
            if (this.play('horn', 0.45, 1, x, z, 52, 4)) return;
            if (!this.ensure()) return;
            const distGain = this.getDistGain(x, z, 52, 4, 1.3);
            if (distGain <= 0.002) return;
            const t = this.ctx.currentTime;
            const dur = 0.22;
            const o1 = this.ctx.createOscillator(), o2 = this.ctx.createOscillator();
            o1.type = 'sawtooth'; o2.type = 'sawtooth';
            const f1 = 415 + (Math.sin((x || 0) * 0.1) * 15);
            const f2 = 345 + (Math.cos((z || 0) * 0.1) * 12);
            o1.frequency.setValueAtTime(f1, t);
            o2.frequency.setValueAtTime(f2, t);
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(2200, t);
            filter.Q.setValueAtTime(2.0, t);
            const g = this.ctx.createGain();
            this._env(g, dur, 0.22 * distGain);
            o1.connect(filter);
            o2.connect(filter);
            filter.connect(g);
            this._connectOutput(filter, g, x, z);
            o1.start(t); o2.start(t);
            o1.stop(t + dur + 0.02); o2.stop(t + dur + 0.02);
        }
        /** Continuous authentic automotive dual-tone horn for the player vehicle */
        setHorn(on) {
            if (!this.ctx) return;
            const t = this.ctx.currentTime;
            if (on && !this.muted) {
                if (!this._horn) {
                    const o1 = this.ctx.createOscillator();
                    const o2 = this.ctx.createOscillator();
                    o1.type = 'sawtooth';
                    o2.type = 'sawtooth';
                    o1.frequency.setValueAtTime(420, t);
                    o1.frequency.value = 420;
                    o2.frequency.setValueAtTime(349, t);
                    o2.frequency.value = 349;
                    const filter = this.ctx.createBiquadFilter();
                    filter.type = 'lowpass';
                    filter.frequency.setValueAtTime(2400, t);
                    filter.frequency.value = 2400;
                    filter.Q.setValueAtTime(2.0, t);
                    filter.Q.value = 2.0;
                    const g = this.ctx.createGain();
                    g.gain.setValueAtTime(0.0001, t);
                    g.gain.exponentialRampToValueAtTime(0.35, t + 0.015);
                    o1.connect(filter);
                    o2.connect(filter);
                    filter.connect(g);
                    g.connect(this.master);
                    o1.start(t);
                    o2.start(t);
                    this._horn = { o1, o2, filter, g };
                }
            } else {
                if (this._horn) {
                    const h = this._horn;
                    this._horn = null;
                    h.g.gain.setValueAtTime(Math.max(0.0001, h.g.gain.value), t);
                    h.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
                    setTimeout(() => {
                        try {
                            h.o1.stop();
                            h.o2.stop();
                            h.o1.disconnect();
                            h.o2.disconnect();
                            h.filter.disconnect();
                            h.g.disconnect();
                        } catch (e) {}
                    }, 45);
                }
            }
        }
        spray() { this.play('spray', 0.5); }
        wantedUp() { this.blip(160, 0.16, 'square', 0.18, 240); setTimeout(() => this.blip(240, 0.2, 'square', 0.18, 320), 140); }
        wasted() { this.blip(220, 0.9, 'sawtooth', 0.3, 55); }
        busted() { if (this.play('bust', 0.75)) return; this.blip(120, 1.2, 'sawtooth', 0.4, 40); }
        step(x, z) { this.play('footstep', 0.22, 0.92 + Math.random() * 0.16, x, z, 18, 2); }
        setEngine(on, speed, rpm) {
            if (!this.ctx) return;
            const t = this.ctx.currentTime;
            if (on && !this.muted) {
                // Upgrade to sample loops as soon as engine_idle buffer is decoded.
                const idleBuf = this._sample('engine_idle');
                const loopBuf = this._sample('engine_loop') || idleBuf;
                if (!this._engineS && !this._engine && idleBuf) {
                    const mk = (buf, vol) => {
                        const s = this.ctx.createBufferSource();
                        s.buffer = buf;
                        s.loop = true;
                        const g = this.ctx.createGain();
                        g.gain.value = vol;
                        s.connect(g); g.connect(this.master);
                        s.start();
                        return { s, g };
                    };
                    this._engineS = { idle: mk(idleBuf, 0.16 * this.vol.engine), loop: mk(loopBuf, 0) };
                } else if (!this._engineS && !this._engine) {
                    const o = this.ctx.createOscillator();
                    const g = this.ctx.createGain();
                    const f = this.ctx.createBiquadFilter();
                    o.type = 'sawtooth';
                    f.type = 'lowpass';
                    f.frequency.value = 420;
                    g.gain.value = 0.06 * this.vol.engine;
                    o.connect(f); f.connect(g); g.connect(this.master);
                    o.start();
                    this._engine = { o, g };
                }
            }
            if (this._engineS) {
                this._lastEngineSpeed = speed; this._lastEngineRpm = rpm;
                if (!on || this.muted) {
                    this._engineS.idle.s.stop(); this._engineS.loop.s.stop();
                    this._engineS = null;
                } else {
                    const sAbs = Math.abs(speed);
                    const engineLoad = (rpm !== undefined && rpm !== null) ? clamp(rpm, 0.18, 1.1) : clamp(sAbs / 60, 0, 1);
                    this._engineS.idle.g.gain.setTargetAtTime(0.16 * this.vol.engine * (1 - Math.min(1, engineLoad * 0.85)), t, 0.1);
                    this._engineS.loop.g.gain.setTargetAtTime(0.32 * this.vol.engine * Math.min(1, engineLoad * 1.3), t, 0.1);
                    this._engineS.loop.s.playbackRate.setTargetAtTime(0.70 + engineLoad * 0.95, t, 0.08);
                }
                return;
            }
            if (!on && this._engine) {
                this._engine.o.stop();
                this._engine = null;
            }
            if (this._engine) {
                const pitchTarget = (rpm !== undefined && rpm !== null)
                    ? (42 + clamp(rpm, 0.18, 1.1) * 220)
                    : (46 + Math.min(100, Math.abs(speed)) * 2.8);
                this._engine.o.frequency.setTargetAtTime(pitchTarget, t, 0.06);
            }
        }
        /** Two-tone siren while cops are on your tail with distance-based falloff. */
        setSiren(on, dist = 10) {
            if (!this.ctx) return;
            const t = this.ctx.currentTime;
            // Compute distance gain for siren (inaudible past 90m, full at <= 12m)
            const maxDist = 90, refDist = 12;
            let sirenGain = 0;
            if (on && !this.muted) {
                if (dist <= refDist) sirenGain = 1.0;
                else if (dist >= maxDist) sirenGain = 0.0;
                else {
                    const fade = (1 - (dist - refDist) / (maxDist - refDist));
                    const att = refDist / (refDist + 0.9 * (dist - refDist));
                    sirenGain = Math.max(0, Math.min(1, att * fade));
                }
            }
            if (on && sirenGain > 0.005 && !this.muted) {
                const targetSampleGain = 0.12 * sirenGain;
                const targetSynthGain = 0.048 * sirenGain;
                if (!this._siren && !this._sirenS) {
                    if (this._sample('siren_loop')) {
                        const s = this.ctx.createBufferSource();
                        s.buffer = this.samples['siren_loop'];
                        s.loop = true;
                        const g = this.ctx.createGain();
                        g.gain.value = targetSampleGain;
                        s.connect(g); g.connect(this.master);
                        s.start();
                        this._sirenS = { s, g };
                    } else {
                        const o = this.ctx.createOscillator();
                        const g = this.ctx.createGain();
                        const lfo = this.ctx.createOscillator();
                        const lg = this.ctx.createGain();
                        o.type = 'triangle';
                        o.frequency.value = 740;
                        lfo.type = 'square';
                        lfo.frequency.value = 1.6;
                        lg.gain.value = 130;
                        lfo.connect(lg); lg.connect(o.frequency);
                        g.gain.value = targetSynthGain;
                        o.connect(g); g.connect(this.master);
                        o.start(); lfo.start();
                        this._siren = { o, lfo, g };
                    }
                } else {
                    // Smoothly update running siren volume based on distance
                    if (this._sirenS) {
                        this._sirenS.g.gain.setTargetAtTime(targetSampleGain, t, 0.15);
                    }
                    if (this._siren) {
                        this._siren.g.gain.setTargetAtTime(targetSynthGain, t, 0.15);
                    }
                }
            } else {
                if (this._siren) { this._siren.o.stop(); this._siren.lfo.stop(); this._siren = null; }
                if (this._sirenS) { this._sirenS.s.stop(); this._sirenS = null; }
            }
        }
        /**
         * Vehicle radio — changeable playlist of song files. Drop tracks in
         * assets/audio/gta/music and list them in manifest.json "radio".
         * Streams via one <audio> element (no full-file decode); routed into
         * the master gain so mute/pause affect it like everything else.
         */
        setRadioTracks(list) {
            this.radioTracks = (list || []).filter((t) => t && t.url)
                .map((t) => ({ title: t.title || 'Unknown track', url: t.url, thumb: t.thumb || null }));
            this._radioBad = {};
            this._radioSrcUrl = null;
            if (this._radioIdx >= this.radioTracks.length) this._radioIdx = -1;
            if (this._radioRepeatIdx >= this.radioTracks.length) this._radioRepeatIdx = -1;
            if (!this.radioTracks.length) this.radioStop();
        }
        radioStatus() {
            const t = this.radioTracks[this._radioIdx];
            return { on: this._radioOn, title: t ? t.title : null, idx: this._radioIdx, count: this.radioTracks.length, repeatIdx: this._radioRepeatIdx };
        }
        _radioEnsureEl() {
            if (this._radioEl) return true;
            try {
                if (typeof Audio === 'undefined') return false;
                const el = new Audio();
                el.preload = 'auto';
                el.addEventListener('ended', () => this._radioEnded());
                el.addEventListener('error', () => this._radioStep(1, true));
                if (this.ctx && this.ctx.createMediaElementSource) {
                    try {
                        const g = this.ctx.createGain();
                        g.gain.value = 0.5 * this.vol.music;
                        this.ctx.createMediaElementSource(el).connect(g);
                        g.connect(this.master);
                        this._radioGain = g;
                    } catch (e) { this._radioGain = null; }
                }
                this._radioEl = el;
                return true;
            } catch (e) { return false; }
        }
        _radioPlayable(i) {
            const t = this.radioTracks[i];
            return !!t && !this._radioBad[t.url];
        }
        _radioPlay(i) {
            if (!this.ensure() || !this._radioEnsureEl() || !this._radioPlayable(i)) return null;
            const t = this.radioTracks[i];
            try {
                // NOTE: compare against our own record, NOT getAttribute('src'):
                // the DOM resolves .src to an absolute URL, so comparing with
                // the relative track url would reload (and restart) every time.
                if (this._radioSrcUrl !== t.url) { this._radioEl.src = t.url; this._radioSrcUrl = t.url; }
                this._radioPaused = false;
                const pr = this._radioEl.play();
                if (pr && pr.catch) pr.catch(() => this._radioStep(1, true));
                this._radioIdx = i;
                this._radioOn = true;
                return t.title;
            } catch (e) { return null; }
        }
        /** Step forward through the playlist, skipping dead files. */
        _radioStep(dir, markBad) {
            if (!this.radioTracks.length) { this._radioOn = false; return null; }
            if (markBad && this._radioIdx >= 0 && this.radioTracks[this._radioIdx]) {
                this._radioBad[this.radioTracks[this._radioIdx].url] = true;
            }
            for (let k = 1; k <= this.radioTracks.length; k++) {
                const i = (this._radioIdx + dir * k + this.radioTracks.length * k) % this.radioTracks.length;
                if (this._radioPlayable(i)) return this._radioPlay(i);
            }
            this._radioOn = false;
            return null;
        }
        /** Play track i directly (radio browser). Returns the title or null. */
        radioPlayIndex(i) {
            if (!this.radioTracks.length) return null;
            const n = this.radioTracks.length;
            this._radioIdx = (((i % n) + n) % n) - 1;
            return this._radioStep(1);
        }
        /** Entering a car: resume/start playback. Returns the track title or null. */
        radioEnter() {
            if (!this.radioTracks.length || !this._radioOn) return null;
            const i = this._radioIdx >= 0 && this._radioPlayable(this._radioIdx) ? this._radioIdx : 0;
            if (!this._radioPlayable(i)) return this._radioStep(1);
            return this._radioPlay(i);
        }
        /**
         * [R] in a vehicle: next track; advancing past the last track turns
         * the radio off (press again to restart at track 1). Returns
         * {on, title} or null when there is nothing to play.
         */
        radioNext() {
            if (!this.radioTracks.length) return null;
            if (!this._radioOn) {
                this._radioOn = true;
                const start = this._radioIdx >= 0 && this._radioPlayable(this._radioIdx) ? this._radioIdx : -1;
                for (let k = start + 1; k < this.radioTracks.length; k++) {
                    if (this._radioPlayable(k)) {
                        const title = this._radioPlay(k);
                        return title ? { on: true, title } : null;
                    }
                }
                this._radioOn = false;
                return null;
            }
            for (let k = this._radioIdx + 1; k < this.radioTracks.length; k++) {
                if (this._radioPlayable(k)) {
                    const title = this._radioPlay(k);
                    return title ? { on: true, title } : null;
                }
            }
            // Past the last track: radio off until R is pressed again.
            if (this._radioEl) { try { this._radioEl.pause(); } catch (e) {} }
            this._radioOn = false;
            this._radioIdx = -1;
            this._radioPaused = false;
            return { on: false, title: null };
        }
        /**
         * [→] on a browser row: toggle per-song repeat. While armed, that
         * song loops on end instead of advancing. Returns {repeat, idx}.
         */
        radioToggleRepeat(i) {
            if (!this.radioTracks.length) return null;
            const n = this.radioTracks.length;
            i = ((i % n) + n) % n;
            this._radioRepeatIdx = (this._radioRepeatIdx === i) ? -1 : i;
            return { repeat: this._radioRepeatIdx !== -1, idx: this._radioRepeatIdx };
        }
        /** Natural track end: loop the armed song, else advance. */
        _radioEnded() {
            if (this._radioRepeatIdx >= 0 && this._radioRepeatIdx === this._radioIdx &&
                this._radioPlayable(this._radioRepeatIdx)) {
                this._radioPlay(this._radioRepeatIdx);
            } else {
                this._radioStep(1);
            }
        }
        /** Restore persisted radio preference (never autoplays — user presses R). */
        restoreRadioState(s) {
            if (!s) return;
            const n = this.radioTracks.length;
            this._radioOn = s.on !== false;
            this._radioIdx = (typeof s.idx === 'number' && s.idx >= 0 && s.idx < n) ? s.idx : -1;
            this._radioRepeatIdx = (typeof s.repeatIdx === 'number' && s.repeatIdx >= 0 && s.repeatIdx < n) ? s.repeatIdx : -1;
        }
        /** Leaving the car: seamless playback persists in player's earbuds / music player. */
        radioExit() {
            // Keep playing uninterrupted when stepping on-foot into music player / earbuds
        }
        /** Full stop (menu / wasted / busted): silence + restart at track 1 next car. */
        radioStop() {
            if (this._radioEl) { try { this._radioEl.pause(); } catch (e) {} }
            this._radioOn = true;
            this._radioIdx = -1;
            this._radioRepeatIdx = -1;
            this._radioSrcUrl = null;
            this._radioPaused = false;
        }
        /** Pause menu: park playback, remembering it was playing. */
        radioPause() {
            if (this._radioEl && !this._radioEl.paused) {
                try { this._radioEl.pause(); } catch (e) {}
                this._radioPaused = true;
            }
        }
        /** Resume after the pause menu (only if it was playing). */
        radioResume() {
            if (!this._radioPaused) return;
            this._radioPaused = false;
            if (this._radioOn && this._radioIdx >= 0) this._radioPlay(this._radioIdx);
        }
        /**
         * Push settings-menu volumes into the live audio graph. Safe to call
         * before ensure() — values are stored and applied on creation too.
         */
        setVolumes(s) {
            this.vol.master = clamp(s.master !== undefined ? s.master : 1, 0, 1);
            this.vol.engine = clamp(s.engine !== undefined ? s.engine : 0.8, 0, 1);
            this.vol.sfx = clamp(s.sfx !== undefined ? s.sfx : 1, 0, 1);
            this.vol.music = clamp(s.music !== undefined ? s.music : 0.8, 0, 1);
            if (this.master) this.master.gain.value = this.muted ? 0 : 0.4 * this.vol.master;
            if (this.ctx && this.ctx.sfxBus) this.ctx.sfxBus.gain.value = this.vol.sfx;
            if (this._radioGain) this._radioGain.gain.value = 0.5 * this.vol.music;
            // Rebuild the engine loop so its fixed creation gain picks up the new value.
            if (this._engineS) {
                const wasOn = true;
                this._engineS.idle.s.stop(); this._engineS.loop.s.stop();
                this._engineS = null;
                this.setEngine(wasOn, this._lastEngineSpeed || 0, this._lastEngineRpm);
            }
        }
        toggleMute() {
            this.muted = !this.muted;
            if (this.master) this.master.gain.value = this.muted ? 0 : 0.4 * this.vol.master;
            if (this.muted) { this.setEngine(false, 0); this.setSiren(false); this.setHorn(false); this.setSkid(false); }
            return this.muted;
        }
        stopLoops() { this.setEngine(false, 0); this.setSiren(false); this.setHorn(false); this.setSkid(false); }
    }
