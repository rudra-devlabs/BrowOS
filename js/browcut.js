/**
 * BrowCut — Desktop Video Editor for BrowOS
 *
 * Model
 *   Project → Tracks (video layers + audio) → Clips.
 *   A clip references a source (imported file blob or the procedural demo) and
 *   carries its own trim, speed, transform, opacity, blend mode, volume and
 *   fades. Clips are positioned by an explicit timeline start, so they may
 *   overlap — that overlap is what makes cross-dissolves possible.
 *
 * Compositing
 *   Video tracks are drawn bottom-up. Each track gets its own <video> element
 *   pool and its own WebAudio gain node, so every layer can be seeked, mixed
 *   and monitored independently.
 *
 * Export
 *   Playback-driven: the timeline is played once in real time while
 *   canvas.captureStream() plus the master audio node feed a MediaRecorder.
 *   Picture and sound stay locked because both come from the same clock.
 */
(function () {
    'use strict';

    const ICONS = {
        play: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
        pause: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>',
        volume: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>',
        mute: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>',
        eye: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
        eyeOff: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',
        clapper: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>'
    };

    const FILTERS = {
        normal:    { label: 'Normal',    css: '' },
        cyberpunk: { label: 'Cyberpunk', css: 'saturate(1.35) contrast(1.18) hue-rotate(-10deg)' },
        vhs:       { label: 'VHS',       css: 'saturate(0.82) contrast(1.12) brightness(1.04)' },
        cinema:    { label: 'Cinema',    css: 'contrast(1.12) saturate(1.06) sepia(0.15)' },
        noir:      { label: 'Noir',      css: 'grayscale(1) contrast(1.2)' },
        matrix:    { label: 'Matrix',    css: 'saturate(0.65) hue-rotate(65deg) contrast(1.12)' }
    };

    const BLENDS = ['normal', 'screen', 'multiply', 'overlay', 'lighten', 'darken', 'difference', 'soft-light'];
    const ASPECTS = ['16:9', '9:16', '1:1', '4:3'];

    const MIME_CANDIDATES = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4;codecs=avc1,mp4a.40.2',
        'video/mp4'
    ];

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const even = (n) => Math.max(2, Math.round(n / 2) * 2);

    function formatTimecode(seconds) {
        const s = Math.max(0, seconds || 0);
        const mins = Math.floor(s / 60);
        const secs = Math.floor(s % 60);
        const cs = Math.floor((s % 1) * 100);
        return String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0') + '.' + String(cs).padStart(2, '0');
    }

    function pickMimeType() {
        if (typeof MediaRecorder === 'undefined') return '';
        for (const m of MIME_CANDIDATES) {
            try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) { /* ignore */ }
        }
        return '';
    }

    class BrowCutApp {
        constructor(windowElement) {
            this.win = windowElement;
            this.container = windowElement.querySelector('.browcut-app');
            if (!this.container) return;

            this.canvas = this.container.querySelector('#browcut-canvas');
            this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
            this.setSmoothing();

            // ── Timeline model ────────────────────────────────────────────
            this.tracks = [];
            this.trackSeq = 1;
            this.clipSeq = 1;
            this.selectedClipId = null;
            this.selectedTrackId = null;

            this.currentTime = 0;
            this.isPlaying = false;
            this.rafId = null;

            // ── Project ───────────────────────────────────────────────────
            this.aspectRatio = '16:9';
            this.fitMode = 'contain';
            this.project = { width: 1280, height: 720, fps: 30 };

            // ── Global look ───────────────────────────────────────────────
            this.filter = 'normal';
            this.adjust = { brightness: 1, contrast: 1, saturation: 1 };

            // ── Text overlay ──────────────────────────────────────────────
            this.textOverlay = '';
            this.textSize = 34;
            this.textColor = '#ffffff';
            this.textPos = 'bottom';

            // ── Global audio ──────────────────────────────────────────────
            this.masterVolume = 1;
            this.isMuted = false;

            // ── Timeline view ─────────────────────────────────────────────
            this.pps = 60;            // pixels per second
            this.snapping = true;
            this.autoFit = true;

            // ── Undo / redo ───────────────────────────────────────────────
            this.undoStack = [];
            this.redoStack = [];
            this.maxHistory = 60;
            this.isApplyingHistory = false;

            // ── Clipboard ─────────────────────────────────────────────────
            this.clipboard = null;

            // ── Runtime ───────────────────────────────────────────────────
            this.drag = null;
            this._export = null;
            this._audioFailed = false;

            this.initUI();
            this.initEvents();
            this.loadDemoFootage();
            this.updateUndoRedoUI();
        }

        setSmoothing() {
            if (!this.ctx) return;
            this.ctx.imageSmoothingEnabled = true;
            this.ctx.imageSmoothingQuality = 'high';
        }

        // ══ DOM ═══════════════════════════════════════════════════════════
        initUI() {
            const q = (s) => this.container.querySelector(s);
            const qa = (s) => this.container.querySelectorAll(s);

            this.timecodeEl = q('#bc-timecode');
            this.durationEl = q('#bc-duration');
            this.clipCountEl = q('#bc-clip-count');
            this.playIcon = q('#bc-play-icon');
            this.emptyHint = q('#bc-empty-hint');

            this.aspectBtns = qa('.browcut-aspect-btn');
            this.filterPills = qa('.browcut-filter-pill');
            this.tabBtns = qa('.browcut-tab');
            this.tabPanels = qa('.browcut-tab-panel');
            this.fitToggle = q('#bc-fit-btn');
            this.undoBtn = q('#bc-undo-btn');
            this.redoBtn = q('#bc-redo-btn');
            this.fileInput = q('#bc-file-input');

            // Colour tab
            this.brightRange = q('#bc-bright-range'); this.brightVal = q('#bc-bright-val');
            this.contrastRange = q('#bc-contrast-range'); this.contrastVal = q('#bc-contrast-val');
            this.satRange = q('#bc-sat-range'); this.satVal = q('#bc-sat-val');

            // Text tab
            this.textInput = q('#bc-text-input');
            this.textPosSelect = q('#bc-text-pos');
            this.textSizeRange = q('#bc-text-size');
            this.textSizeVal = q('#bc-text-size-val');
            this.textColorInput = q('#bc-text-color');

            // Clip tab
            this.inspectorEmpty = q('#bc-inspector-empty');
            this.inspectorBody = q('#bc-inspector-body');
            this.clipNameEl = q('#bc-clip-name');
            this.posXRange = q('#bc-pos-x'); this.posXVal = q('#bc-pos-x-val');
            this.posYRange = q('#bc-pos-y'); this.posYVal = q('#bc-pos-y-val');
            this.scaleRange = q('#bc-scale'); this.scaleVal = q('#bc-scale-val');
            this.rotRange = q('#bc-rotation'); this.rotVal = q('#bc-rotation-val');
            this.opacityRange = q('#bc-opacity'); this.opacityVal = q('#bc-opacity-val');
            this.blendSelect = q('#bc-blend');
            this.speedRange = q('#bc-speed-range'); this.speedVal = q('#bc-speed-val');
            this.volumeRange = q('#bc-volume'); this.volumeVal = q('#bc-volume-val');
            this.fadeInRange = q('#bc-fade-in'); this.fadeInVal = q('#bc-fade-in-val');
            this.fadeOutRange = q('#bc-fade-out'); this.fadeOutVal = q('#bc-fade-out-val');
            this.duplicateBtn = q('#bc-duplicate-btn');
            this.deleteBtn = q('#bc-delete-btn');
            this.addMediaBtn = q('#bc-add-media-btn');

            // Timeline
            this.headersEl = q('#bc-headers');
            this.scrollEl = q('#bc-scroll');
            this.innerEl = q('#bc-inner');
            this.rulerEl = q('#bc-ruler');
            this.tracksEl = q('#bc-tracks');
            this.playheadEl = q('#bc-playhead');
            this.zoomValEl = q('#bc-zoom-val');
            this.snapBtn = q('#bc-snap-btn');
            this.timelineTip = q('#bc-timeline-tip');
        }

        // ══ State / history ═══════════════════════════════════════════════
        captureState() {
            return {
                tracks: this.tracks.map(t => ({
                    ...t,
                    clips: t.clips.map(c => ({ ...c, transform: { ...c.transform } }))
                })),
                trackSeq: this.trackSeq,
                clipSeq: this.clipSeq,
                selectedClipId: this.selectedClipId,
                selectedTrackId: this.selectedTrackId,
                currentTime: this.currentTime,
                aspectRatio: this.aspectRatio,
                fitMode: this.fitMode,
                project: { ...this.project },
                filter: this.filter,
                adjust: { ...this.adjust },
                textOverlay: this.textOverlay,
                textSize: this.textSize,
                textColor: this.textColor,
                textPos: this.textPos,
                masterVolume: this.masterVolume,
                isMuted: this.isMuted
            };
        }

        pushHistory(action) {
            if (this.isApplyingHistory) return;
            this.undoStack.push({ action, state: this.captureState() });
            if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
            this.redoStack = [];
            this.updateUndoRedoUI();
        }

        commitSlider(range, action, apply) {
            if (!range) return;
            let before = null;
            range.addEventListener('pointerdown', () => { before = this.captureState(); });
            range.addEventListener('input', (e) => { apply(parseFloat(e.target.value)); this.renderFrame(); });
            range.addEventListener('change', () => {
                if (!before) return;
                this.undoStack.push({ action, state: before });
                if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
                this.redoStack = [];
                this.updateUndoRedoUI();
                before = null;
            });
        }

        undo() {
            if (!this.undoStack.length) return;
            const e = this.undoStack.pop();
            this.redoStack.push({ action: e.action, state: this.captureState() });
            this.applyState(e.state);
            this.toast('Undo: ' + e.action);
        }

        redo() {
            if (!this.redoStack.length) return;
            const e = this.redoStack.pop();
            this.undoStack.push({ action: e.action, state: this.captureState() });
            this.applyState(e.state);
            this.toast('Redo: ' + e.action);
        }

        applyState(state) {
            if (!state) return;
            this.isApplyingHistory = true;

            this.tracks = state.tracks.map(t => ({
                ...t, clips: t.clips.map(c => ({ ...c, transform: { ...c.transform } }))
            }));
            this.trackSeq = state.trackSeq;
            this.clipSeq = state.clipSeq;
            this.selectedClipId = state.selectedClipId;
            this.selectedTrackId = state.selectedTrackId;
            this.currentTime = state.currentTime;
            this.aspectRatio = state.aspectRatio;
            this.fitMode = state.fitMode;
            this.project = { ...state.project };
            this.filter = state.filter;
            this.adjust = { ...state.adjust };
            this.textOverlay = state.textOverlay;
            this.textSize = state.textSize;
            this.textColor = state.textColor;
            this.textPos = state.textPos;
            this.masterVolume = state.masterVolume;
            this.isMuted = state.isMuted;

            this.releaseIdleElements();
            this.applyProjectSize();
            this.syncControlsFromState();
            this.renderTimeline();
            this.syncElementsToPlayhead();
            this.renderFrame();
            this.updatePlayheadUI();

            this.isApplyingHistory = false;
            this.updateUndoRedoUI();
        }

        updateUndoRedoUI() {
            if (this.undoBtn) this.undoBtn.disabled = !this.undoStack.length;
            if (this.redoBtn) this.redoBtn.disabled = !this.redoStack.length;
            if (this.deleteBtn) this.deleteBtn.disabled = !this.selectedClipId;
            if (this.duplicateBtn) this.duplicateBtn.disabled = !this.selectedClipId;
        }

        toast(text) {
            let el = this.container.querySelector('.browcut-toast');
            if (!el) {
                el = document.createElement('div');
                el.className = 'browcut-toast';
                (this.container.querySelector('.browcut-stage') || this.container).appendChild(el);
            }
            el.textContent = text;
            el.classList.add('visible');
            clearTimeout(el._t);
            el._t = setTimeout(() => el.classList.remove('visible'), 1500);
        }

        // ══ Tracks ════════════════════════════════════════════════════════
        createTrack(kind, name) {
            return {
                id: 't' + (this.trackSeq++),
                kind,                       // 'video' | 'audio'
                name,
                hidden: false,
                muted: false,
                clips: []
            };
        }

        /** Video tracks render bottom-up, so index 0 is the topmost layer. */
        addTrack(kind, name, position) {
            const t = this.createTrack(kind, name || (kind === 'audio' ? 'Audio ' + (this.tracks.filter(x => x.kind === 'audio').length + 1)
                : 'Video ' + (this.tracks.filter(x => x.kind === 'video').length + 1)));
            if (typeof position === 'number') this.tracks.splice(position, 0, t);
            else if (kind === 'video') this.tracks.unshift(t);
            else this.tracks.push(t);

            this.ensureTrackRuntime(t);
            return t;
        }

        removeTrack(trackId) {
            const idx = this.tracks.findIndex(t => t.id === trackId);
            if (idx < 0) return;
            if (this.tracks.filter(t => t.kind === 'video').length <= 1 && this.tracks[idx].kind === 'video') {
                this.toast('At least one video track is required');
                return;
            }
            const [t] = this.tracks.splice(idx, 1);
            t.clips.forEach(c => { if (c.url) URL.revokeObjectURL(c.url); });
            this.disposeTrackRuntime(t);
            if (this.selectedTrackId === trackId) this.selectedTrackId = null;
        }

        videoTracks() { return this.tracks.filter(t => t.kind === 'video'); }

        orderedVideoTracksBottomUp() {
            // tracks[0] is the top layer, so composite in reverse.
            return this.tracks.filter(t => t.kind === 'video' && !t.hidden).slice().reverse();
        }

        findClip(clipId) {
            for (const t of this.tracks) {
                const c = t.clips.find(x => x.id === clipId);
                if (c) return { clip: c, track: t };
            }
            return null;
        }

        selectedClip() {
            if (!this.selectedClipId) return null;
            return this.findClip(this.selectedClipId);
        }

        totalDuration() {
            let max = 0;
            for (const t of this.tracks) {
                for (const c of t.clips) max = Math.max(max, c.tlStart + c.dur);
            }
            return max;
        }

        /** Timeline length of a clip after speed is applied. */
        computeDur(clip) {
            return Math.max(0.05, (clip.out - clip.in) / (clip.rate || 1));
        }

        activeClips(track, time) {
            return track.clips.filter(c => time >= c.tlStart - 1e-6 && time < c.tlStart + c.dur);
        }

        /** Fade envelope shared by opacity and audio gain. */
        fadeFactor(clip, time) {
            const local = time - clip.tlStart;
            let f = 1;
            if (clip.fadeIn > 0 && local < clip.fadeIn) f = Math.min(f, local / clip.fadeIn);
            if (clip.fadeOut > 0 && local > clip.dur - clip.fadeOut) {
                f = Math.min(f, (clip.dur - local) / clip.fadeOut);
            }
            return clamp(f, 0, 1);
        }

        sourceTimeFor(clip, time) {
            const local = clamp(time - clip.tlStart, 0, clip.dur);
            return clip.in + local * (clip.rate || 1);
        }

        makeClip(source, inPoint, outPoint, opts) {
            const o = opts || {};
            return {
                id: 'c' + (this.clipSeq++),
                kind: source.kind,
                name: source.name,
                url: source.url || null,
                sourceDuration: source.duration,
                in: inPoint,
                out: outPoint,
                rate: o.rate || 1,
                tlStart: o.tlStart || 0,
                dur: 0,
                volume: o.volume === undefined ? 1 : o.volume,
                fadeIn: 0,
                fadeOut: 0,
                opacity: 1,
                blend: 'normal',
                transform: { x: 0, y: 0, scale: 1, rotation: 0 },
                srcW: o.srcW || 1920,
                srcH: o.srcH || 1080
            };
        }

        // ══ Media elements & audio ════════════════════════════════════════
        ensureAudioContext() {
            if (this._audioFailed) return null;
            if (this._actx) {
                if (this._actx.state === 'suspended') this._actx.resume().catch(() => {});
                return this._actx;
            }
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) { this._audioFailed = true; return null; }
            try {
                this._actx = new AC();
                this._master = this._actx.createGain();
                this._streamDest = this._actx.createMediaStreamDestination();
                this._master.connect(this._actx.destination);
                this._master.connect(this._streamDest);
                return this._actx;
            } catch (e) {
                this._audioFailed = true;
                return null;
            }
        }

        ensureTrackRuntime(track) {
            if (!this._runtime) this._runtime = new Map();
            if (!this._runtime.has(track.id)) {
                this._runtime.set(track.id, { pools: [], gains: [], srcNodes: [] });
            }
            return this._runtime.get(track.id);
        }

        disposeTrackRuntime(track) {
            const rt = this._runtime && this._runtime.get(track.id);
            if (!rt) return;
            rt.pools.forEach(el => { try { el.pause(); el.removeAttribute('src'); el.load(); } catch (e) {} });
            this._runtime.delete(track.id);
        }

        /** An element from this track's pool, not currently bound to another clip. */
        acquireElement(track, clip) {
            const rt = this.ensureTrackRuntime(track);
            const busy = new Set();
            track.clips.forEach(c => { if (c._el && c.id !== clip.id) busy.add(c._el); });

            if (clip._el && rt.pools.includes(clip._el)) return clip._el;

            let el = rt.pools.find(p => !busy.has(p));
            if (!el && rt.pools.length < 3) {
                el = document.createElement(track.kind === 'audio' ? 'audio' : 'video');
                el.playsInline = true;
                el.preload = 'auto';
                rt.pools.push(el);

                const actx = this.ensureAudioContext();
                if (actx) {
                    try {
                        const src = actx.createMediaElementSource(el);
                        const gain = actx.createGain();
                        gain.gain.value = 1;
                        src.connect(gain);
                        gain.connect(this._master);
                        rt.srcNodes.push(src);
                        rt.gains.push(gain);
                        el._bcGain = gain;
                    } catch (e) {
                        el._bcGain = null;
                    }
                }
            }
            if (!el) el = rt.pools[0];
            if (el) {
                track.clips.forEach(c => { if (c._el === el && c.id !== clip.id) c._el = null; });
                clip._el = el;
            }
            return el;
        }

        releaseIdleElements() {
            if (!this._runtime) return;
            for (const t of this.tracks) {
                const active = new Set(this.activeClips(t, this.currentTime).map(c => c._el).filter(Boolean));
                const rt = this._runtime.get(t.id);
                if (!rt) continue;
                rt.pools.forEach(el => { if (!active.has(el) && !el.paused) el.pause(); });
            }
        }

        async loadClipSource(el, clip) {
            if (!el || clip.kind !== 'video') return false;
            if (el._bcUrl !== clip.url) {
                el._bcUrl = clip.url;
                el.src = clip.url;
                el.load();
                if (el.readyState < 1) await this.waitFor(el, 'loadedmetadata', 5000);
                if (el.readyState < 3) await this.waitFor(el, 'canplay', 5000);
            } else if (el.readyState < 2) {
                await this.waitFor(el, 'canplay', 3000);
            }
            return true;
        }

        waitFor(el, event, timeoutMs) {
            return new Promise((resolve) => {
                let done = false;
                const finish = () => {
                    if (done) return;
                    done = true;
                    el.removeEventListener(event, finish);
                    resolve();
                };
                el.addEventListener(event, finish, { once: true });
                setTimeout(finish, timeoutMs || 4000);
            });
        }

        async seekElement(el, time) {
            if (!el || !isFinite(time)) return;
            if (Math.abs(el.currentTime - time) < 0.04) return;
            const p = this.waitFor(el, 'seeked', 2000);
            try { el.currentTime = time; } catch (e) { return; }
            await p;
        }

        /** Puts every track's active clips in a consistent position/state. */
        async syncElementsToPlayhead(opts) {
            const o = opts || {};
            for (const track of this.tracks) {
                const active = this.activeClips(track, this.currentTime);
                const rt = this.ensureTrackRuntime(track);

                for (const clip of track.clips) {
                    if (!active.includes(clip) && clip._el) clip._el.pause();
                }

                for (const clip of active) {
                    if (clip.kind !== 'video') continue;
                    const el = this.acquireElement(track, clip);
                    await this.loadClipSource(el, clip);
                    el.playbackRate = clip.rate || 1;
                    await this.seekElement(el, this.sourceTimeFor(clip, this.currentTime));
                    if (o.play && !this.isMuted) {
                        this.ensureAudioContext();
                        el.play().catch(() => {});
                    } else {
                        el.pause();
                    }
                }

                // Drop pools that are no longer referenced by any clip.
                const referenced = new Set(track.clips.map(c => c._el).filter(Boolean));
                rt.pools = rt.pools.filter(el => referenced.has(el));
            }
            this.applyAudio();
        }

        applyAudio() {
            if (!this._master) return;
            this._master.gain.value = this.isMuted ? 0 : this.masterVolume;

            for (const track of this.tracks) {
                const active = this.activeClips(track, this.currentTime);
                for (const clip of track.clips) {
                    if (!clip._el || !clip._el._bcGain) continue;
                    const isActive = active.includes(clip);
                    const env = isActive ? this.fadeFactor(clip, this.currentTime) : 0;
                    const target = (track.muted || !isActive) ? 0 : (clip.volume === undefined ? 1 : clip.volume) * env;
                    try {
                        clip._el._bcGain.gain.value = target;
                    } catch (e) { /* ignore */ }
                }
                if (track.kind === 'video') {
                    for (const el of this.ensureTrackRuntime(track).pools) {
                        if (!el._bcGain) el.volume = 0;
                    }
                }
            }
        }

        // ══ Project size ══════════════════════════════════════════════════
        computeProjectSize(aspect, srcW, srcH) {
            const longest = Math.max(srcW || 1920, srcH || 1080);
            const L = clamp(longest, 640, 1920);
            const [a, b] = aspect.split(':').map(Number);
            if (a >= b) return { width: even(L), height: even(L * b / a) };
            return { width: even(L * a / b), height: even(L) };
        }

        applyProjectSize() {
            if (this.canvas) {
                this.canvas.width = this.project.width;
                this.canvas.height = this.project.height;
            }
            this.setSmoothing();
            this.updateMetaUI();
        }

        updateMetaUI() {
            const total = this.totalDuration();
            if (this.durationEl) this.durationEl.textContent = formatTimecode(total);
            if (this.clipCountEl) {
                const n = this.tracks.reduce((a, t) => a + t.clips.length, 0);
                this.clipCountEl.textContent = n + (n === 1 ? ' clip' : ' clips');
            }
        }

        setAspectRatio(aspect) {
            const first = this.tracks.flatMap(t => t.clips).find(c => c.kind === 'video');
            const dims = first ? { w: first.srcW, h: first.srcH } : { w: 1920, h: 1080 };
            this.aspectRatio = aspect;
            this.autoFit = true;
            this.project = { ...this.computeProjectSize(aspect, dims.w, dims.h), fps: this.project.fps };
            this.applyProjectSize();
            this.renderFrame();
        }

        // ══ Sources ═══════════════════════════════════════════════════════
        loadDemoFootage() {
            this.tracks = [];
            this.trackSeq = 1;
            this.clipSeq = 1;
            if (this._runtime) {
                this._runtime.forEach((rt, id) => {
                    rt.pools.forEach(el => { try { el.pause(); el.removeAttribute('src'); el.load(); } catch (e) {} });
                });
                this._runtime.clear();
            }

            const v1 = this.addTrack('video', 'Video 1');
            this.addTrack('audio', 'Audio 1');

            const clip = this.makeClip(
                { kind: 'demo', name: 'Demo Sequence', url: null, duration: 10 },
                0, 10, { tlStart: 0 }
            );
            clip.dur = this.computeDur(clip);
            clip.srcW = 1280; clip.srcH = 720;
            v1.clips.push(clip);

            this.selectedClipId = clip.id;
            this.selectedTrackId = v1.id;
            this.currentTime = 0;
            this._demoClipId = clip.id;

            this.project = { width: 1280, height: 720, fps: 30 };
            this.applyProjectSize();
            this.autoFit = true;
            this.renderTimeline();
            this.syncControlsFromState();
            this.renderFrame();
            this.updatePlayheadUI();
        }

        insertImportedClip(track, clip, tlStart) {
            clip.tlStart = tlStart;
            clip.dur = this.computeDur(clip);
            track.clips.push(clip);
            track.clips.sort((a, b) => a.tlStart - b.tlStart);
        }

        async importFiles(fileList) {
            const files = Array.from(fileList || []).filter(f =>
                f.type.startsWith('video/') || f.type.startsWith('audio/') ||
                /\.(mp4|webm|mov|m4v|ogv|mkv|mp3|wav|m4a|ogg|flac|aac)$/i.test(f.name));

            if (!files.length) { this.toast('No media files selected'); return; }
            this.pushHistory('Import');

            const videoFiles = files.filter(f => f.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|ogv|mkv)$/i.test(f.name));
            const audioOnly = files.filter(f => !videoFiles.includes(f));

            // Remove the untouched demo placeholder.
            const demo = this.tracks.flatMap(t => t.clips).find(c => c.kind === 'demo');
            if (demo) {
                for (const t of this.tracks) t.clips = t.clips.filter(c => c !== demo);
            }

            // Import / create the destination tracks.
            let vTrack = this.tracks.find(t => t.kind === 'video');
            if (!vTrack) vTrack = this.addTrack('video', 'Video 1');
            let aTrack = this.tracks.find(t => t.kind === 'audio');
            if (audioOnly.length && !aTrack) aTrack = this.addTrack('audio', 'Audio 1');

            let cursor = 0;
            let placed = 0;

            for (const file of videoFiles) {
                const url = URL.createObjectURL(file);
                const probe = document.createElement('video');
                probe.preload = 'metadata';
                probe.src = url;

                const meta = await new Promise((resolve) => {
                    const done = (ok) => resolve(ok
                        ? { w: probe.videoWidth || 1920, h: probe.videoHeight || 1080, d: probe.duration || 0 }
                        : null);
                    probe.onloadedmetadata = () => done(true);
                    probe.onerror = () => done(false);
                    setTimeout(() => done(probe.readyState >= 1), 4000);
                });

                if (!meta || !meta.d) { URL.revokeObjectURL(url); this.toast('Could not read ' + file.name); continue; }

                const clip = this.makeClip(
                    { kind: 'video', name: file.name, url, duration: meta.d },
                    0, meta.d, { tlStart: cursor, srcW: meta.w, srcH: meta.h }
                );
                this.insertImportedClip(vTrack, clip, cursor);
                cursor += clip.dur;
                placed++;

                // Size the project from the first real footage seen.
                if (placed === 1 && this.autoFit) {
                    this.project = { ...this.computeProjectSize(this.aspectRatio, meta.w, meta.h), fps: 30 };
                    this.applyProjectSize();
                }
            }

            for (const file of audioOnly) {
                const url = URL.createObjectURL(file);
                const probe = document.createElement('audio');
                probe.preload = 'metadata';
                probe.src = url;
                const dur = await new Promise((resolve) => {
                    probe.onloadedmetadata = () => resolve(probe.duration || 0);
                    probe.onerror = () => resolve(0);
                    setTimeout(() => resolve(probe.duration || 0), 4000);
                });
                if (!dur) { URL.revokeObjectURL(url); continue; }

                const clip = this.makeClip(
                    { kind: 'audio', name: file.name, url, duration: dur }, 0, dur, { tlStart: 0 }
                );
                if (!aTrack) aTrack = this.addTrack('audio', 'Audio 1');
                this.insertImportedClip(aTrack, clip, 0);
                placed++;
            }

            if (!placed) { this.loadDemoFootage(); return; }

            const firstClip = this.tracks.flatMap(t => t.clips)[0];
            if (firstClip) {
                this.selectedClipId = firstClip.id;
                this.selectedTrackId = this.tracks.find(t => t.clips.includes(firstClip)).id;
            }

            this.autoFit = true;
            this.renderTimeline();
            this.fitTimeline();
            this.syncControlsFromState();
            await this.syncElementsToPlayhead();
            this.renderFrame();
            this.updatePlayheadUI();
            this.toast('Imported ' + placed + ' item' + (placed > 1 ? 's' : ''));
        }

        // ══ Playback ══════════════════════════════════════════════════════
        togglePlay() {
            this.isPlaying = !this.isPlaying;
            if (this.playIcon) this.playIcon.innerHTML = this.isPlaying ? ICONS.pause : ICONS.play;

            if (!this.isPlaying) {
                cancelAnimationFrame(this.rafId);
                this.rafId = null;
                for (const t of this.tracks) {
                    this.ensureTrackRuntime(t).pools.forEach(el => el.pause());
                }
                return;
            }

            this.ensureAudioContext();
            if (this.currentTime >= this.totalDuration() - 0.01) this.currentTime = 0;
            this._lastTick = performance.now();
            this._syncPending = true;

            (async () => {
                await this.syncElementsToPlayhead({ play: true });
                this._syncPending = false;
                this.playLoop();
            })();
        }

        playLoop() {
            if (!this.isPlaying) return;
            const now = performance.now();
            const delta = (now - (this._lastTick || now)) / 1000;
            this._lastTick = now;
            const total = this.totalDuration();

            if (this.currentTime >= total - 0.01) {
                this.currentTime = total;
                this.isPlaying = false;
                if (this.playIcon) this.playIcon.innerHTML = ICONS.play;
                for (const t of this.tracks) this.ensureTrackRuntime(t).pools.forEach(el => el.pause());
                this.updatePlayheadUI();
                this.renderFrame();
                return;
            }

            const advanced = this.currentTime + delta;
            if (this._syncPending) { this.rafId = requestAnimationFrame(() => this.playLoop()); return; }

            const needsResync = this.tracks.some(track =>
                this.activeClips(track, this.currentTime).some(c => c.kind === 'video' && c._el && c._el.paused));

            if (needsResync) {
                this._syncPending = true;
                this.currentTime = advanced;
                this.updatePlayheadUI();
                this.renderFrame();
                (async () => {
                    await this.syncElementsToPlayhead({ play: true });
                    this._syncPending = false;
                })();
            } else {
                this.currentTime = advanced;
                if (this.tracks.some(t => t.kind === 'video')) this.applyAudio();
                this.updatePlayheadUI();
                this.renderFrame();
            }

            this.rafId = requestAnimationFrame(() => this.playLoop());
        }

        seek(time) {
            this.currentTime = clamp(time, 0, Math.max(0, this.totalDuration()));
            this.updatePlayheadUI();
            this.syncElementsToPlayhead();
            this.renderFrame();
        }

        // ══ Rendering ═════════════════════════════════════════════════════
        buildFilterString() {
            const parts = [];
            const preset = FILTERS[this.filter];
            if (preset && preset.css) parts.push(preset.css);
            if (this.adjust.brightness !== 1) parts.push('brightness(' + this.adjust.brightness + ')');
            if (this.adjust.contrast !== 1) parts.push('contrast(' + this.adjust.contrast + ')');
            if (this.adjust.saturation !== 1) parts.push('saturate(' + this.adjust.saturation + ')');
            return parts.length ? parts.join(' ') : 'none';
        }

        renderFrame() {
            if (!this.ctx || !this.canvas) return;
            const ctx = this.ctx;
            const w = this.canvas.width;
            const h = this.canvas.height;

            ctx.save();
            ctx.filter = 'none';
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, w, h);
            ctx.restore();

            const anyClip = this.tracks.some(t => t.clips.length);
            if (!anyClip) {
                ctx.save();
                ctx.fillStyle = 'rgba(255,255,255,0.35)';
                ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('No media — use Import to add a clip', w / 2, h / 2);
                ctx.restore();
                return;
            }

            // Bottom-up compositing across video layers.
            for (const track of this.orderedVideoTracksBottomUp()) {
                const clips = this.activeClips(track, this.currentTime).sort((a, b) => a.tlStart - b.tlStart);
                for (const clip of clips) {
                    const alpha = (clip.opacity === undefined ? 1 : clip.opacity) * this.fadeFactor(clip, this.currentTime);
                    if (alpha <= 0.002) continue;
                    this.drawClip(clip, alpha, w, h);
                }
            }

            if (this.filter === 'glitch') this.drawGlitch(w, h);
            if (this.textOverlay) this.drawTextOverlay(w, h);
        }

        drawClip(clip, alpha, w, h) {
            const ctx = this.ctx;
            const grade = this.buildFilterString();

            ctx.save();
            ctx.filter = grade;
            ctx.globalAlpha = clamp(alpha, 0, 1);
            ctx.globalCompositeOperation = (clip.blend && clip.blend !== 'normal') ? clip.blend : 'source-over';

            const t = clip.transform || { x: 0, y: 0, scale: 1, rotation: 0 };
            ctx.translate(w / 2 + (t.x || 0) * (w / 1920), h / 2 + (t.y || 0) * (h / 1080));
            if (t.rotation) ctx.rotate(t.rotation * Math.PI / 180);
            if (t.scale && t.scale !== 1) ctx.scale(t.scale, t.scale);

            if (clip.kind === 'demo') {
                ctx.translate(-w / 2, -h / 2);
                this.drawDemo(clip, w, h);
            } else if (clip._el && clip._el.readyState >= 2) {
                const vw = clip._el.videoWidth || clip.srcW || 1920;
                const vh = clip._el.videoHeight || clip.srcH || 1080;
                const { dw, dh } = this.fitSize(vw, vh, w, h);
                ctx.drawImage(clip._el, -dw / 2, -dh / 2, dw, dh);
            }

            ctx.restore();
        }

        fitSize(srcW, srcH, dstW, dstH) {
            const srcAR = srcW / srcH;
            const dstAR = dstW / dstH;
            if (this.fitMode === 'cover') {
                return srcAR > dstAR ? { dw: dstH * srcAR, dh: dstH } : { dw: dstW, dh: dstW / srcAR };
            }
            return srcAR > dstAR ? { dw: dstW, dh: dstW / srcAR } : { dw: dstH * srcAR, dh: dstH };
        }

        drawGlitch(w, h) {
            const ctx = this.ctx;
            const sliceH = Math.max(8, Math.round(h * 0.03));
            const phase = Math.sin(this.currentTime * 9) * 0.5 + 0.5;
            const sliceY = Math.round(phase * (h - sliceH));
            const shift = Math.round(w * 0.012);
            ctx.save();
            ctx.filter = 'none';
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
            ctx.drawImage(this.canvas, 0, sliceY, w, sliceH, shift, sliceY, w, sliceH);
            ctx.restore();
        }

        drawTextOverlay(w, h) {
            const ctx = this.ctx;
            ctx.save();
            ctx.filter = 'none';
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';

            const size = Math.round(this.textSize * (h / 720));
            ctx.font = '600 ' + size + 'px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            let y = h - Math.round(h * 0.1);
            if (this.textPos === 'top') y = Math.round(h * 0.1);
            else if (this.textPos === 'center') y = h / 2;

            const metrics = ctx.measureText(this.textOverlay);
            const padX = Math.round(size * 0.5);
            const padY = Math.round(size * 0.34);
            const boxW = metrics.width + padX * 2;
            const boxH = size + padY * 2;

            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            if (ctx.roundRect) {
                ctx.beginPath();
                ctx.roundRect(w / 2 - boxW / 2, y - boxH / 2, boxW, boxH, 6);
                ctx.fill();
            } else {
                ctx.fillRect(w / 2 - boxW / 2, y - boxH / 2, boxW, boxH);
            }

            ctx.fillStyle = this.textColor;
            ctx.fillText(this.textOverlay, w / 2, y);
            ctx.restore();
        }

        drawDemo(clip, w, h) {
            const ctx = this.ctx;
            const t = this.sourceTimeFor(clip, this.currentTime);
            const horizon = h * 0.6;

            const sky = ctx.createLinearGradient(0, 0, 0, horizon);
            sky.addColorStop(0, '#050510');
            sky.addColorStop(0.55, '#1b0a26');
            sky.addColorStop(1, '#4a1038');
            ctx.fillStyle = sky;
            ctx.fillRect(0, 0, w, horizon);

            const sunR = Math.min(w, h) * 0.2;
            const sunY = horizon - sunR * 0.25;
            const sun = ctx.createLinearGradient(0, sunY - sunR, 0, sunY + sunR);
            sun.addColorStop(0, '#ffd54a');
            sun.addColorStop(1, '#e0266b');
            ctx.fillStyle = sun;
            ctx.beginPath();
            ctx.arc(w / 2, sunY, sunR, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#1b0a26';
            for (let i = 0; i < 6; i++) ctx.fillRect(w / 2 - sunR, sunY + i * (sunR * 0.16) + 2, sunR * 2, 2 + i);

            ctx.fillStyle = '#07040f';
            ctx.fillRect(0, horizon, w, h - horizon);

            ctx.strokeStyle = '#3ad4e0';
            ctx.lineWidth = 1;
            for (let x = -w * 0.5; x <= w * 1.5; x += w / 10) {
                ctx.beginPath();
                ctx.moveTo(w / 2, horizon);
                ctx.lineTo(x, h);
                ctx.stroke();
            }

            const travel = (t * 90) % (h * 0.1);
            for (let y = 0; y < h - horizon; y += h * 0.05) {
                const ly = horizon + ((y + travel) % (h - horizon));
                ctx.beginPath();
                ctx.moveTo(0, ly);
                ctx.lineTo(w, ly);
                ctx.stroke();
            }

            const carW = w * 0.13;
            const carH = carW * 0.42;
            const carX = w / 2 - carW / 2 + Math.sin(t * 1.6) * (w * 0.035);
            const carY = h * 0.8;
            ctx.fillStyle = '#0b0b10';
            ctx.fillRect(carX, carY, carW, carH);
            ctx.strokeStyle = '#e0266b';
            ctx.lineWidth = 2;
            ctx.strokeRect(carX, carY, carW, carH);
            ctx.fillStyle = '#ffb020';
            ctx.fillRect(carX + carW * 0.08, carY + carH * 0.28, carW * 0.2, carH * 0.2);
            ctx.fillRect(carX + carW * 0.72, carY + carH * 0.28, carW * 0.2, carH * 0.2);
        }

        // ══ Timeline UI ═══════════════════════════════════════════════════
        fitTimeline() {
            const total = Math.max(this.totalDuration(), 1);
            const avail = this.scrollEl ? this.scrollEl.clientWidth - 24 : 800;
            this.pps = clamp(avail / total, 4, 400);
            this.renderTimeline();
        }

        timeToPx(t) { return t * this.pps; }

        renderTimeline() {
            if (!this.innerEl || !this.tracksEl || !this.headersEl) return;
            const total = Math.max(this.totalDuration(), 1);
            const width = Math.max(this.timeToPx(total) + 40, this.scrollEl ? this.scrollEl.clientWidth : 400);
            this.innerEl.style.width = width + 'px';

            // While dragging we reposition the existing nodes instead of rebuilding,
            // so the element under the pointer survives the move.
            if (this.drag && this.drag.mode === 'move') {
                this.renderPlayheadOnly();
                return;
            }

            this.headersEl.innerHTML = '';
            this.tracksEl.innerHTML = '';

            this.tracks.forEach((track, index) => {
                // ── header ──
                const head = document.createElement('div');
                head.className = 'browcut-track-head' + (track.id === this.selectedTrackId ? ' selected' : '');
                head.dataset.id = track.id;

                const nameEl = document.createElement('span');
                nameEl.className = 'browcut-track-name';
                nameEl.textContent = track.name;

                const mkBtn = (title, html, onClick, active) => {
                    const b = document.createElement('button');
                    b.className = 'browcut-track-btn' + (active ? ' active' : '');
                    b.title = title;
                    b.innerHTML = html;
                    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
                    return b;
                };

                const toggle = track.kind === 'video' ? 'hidden' : 'muted';
                const toggleIcon = track.kind === 'video'
                    ? (track.hidden ? ICONS.eyeOff : ICONS.eye)
                    : (track.muted ? ICONS.mute : ICONS.volume);

                head.append(
                    nameEl,
                    mkBtn(track.kind === 'video' ? 'Show / hide layer' : 'Mute / unmute track',
                        toggleIcon,
                        () => {
                            if (track.kind === 'video') track.hidden = !track.hidden;
                            else track.muted = !track.muted;
                            this.renderTimeline();
                            this.renderFrame();
                            this.applyAudio();
                        },
                        track.kind === 'video' ? track.hidden : track.muted),
                    mkBtn('Remove track', '&times;', () => {
                        this.pushHistory('Remove Track');
                        this.removeTrack(track.id);
                        this.renderTimeline();
                        this.renderFrame();
                    })
                );
                head.addEventListener('mousedown', () => {
                    this.selectedTrackId = track.id;
                    this.headersEl.querySelectorAll('.browcut-track-head')
                        .forEach(h => h.classList.toggle('selected', h.dataset.id === track.id));
                });

                // ── lane ──
                const lane = document.createElement('div');
                lane.className = 'browcut-lane' + (track.kind === 'audio' ? ' is-audio' : '');
                lane.dataset.id = track.id;
                lane.style.height = '34px';

                track.clips.forEach(clip => {
                    const el = document.createElement('div');
                    el.className = 'browcut-clip'
                        + (clip.id === this.selectedClipId ? ' selected' : '')
                        + (clip.kind === 'demo' ? ' is-demo' : '')
                        + (clip.kind === 'audio' ? ' is-audio' : '')
                        + (clip.blend && clip.blend !== 'normal' ? ' has-blend' : '');
                    el.dataset.id = clip.id;
                    el.style.left = this.timeToPx(clip.tlStart) + 'px';
                    el.style.width = Math.max(6, this.timeToPx(clip.dur)) + 'px';

                    const inH = document.createElement('div');
                    inH.className = 'browcut-clip-handle in';
                    inH.title = 'Trim start';

                    const label = document.createElement('span');
                    label.className = 'browcut-clip-label';
                    const bits = [clip.name];
                    if (clip.rate && clip.rate !== 1) bits.push(clip.rate.toFixed(2) + 'x');
                    if (clip.opacity !== undefined && clip.opacity !== 1) bits.push(Math.round(clip.opacity * 100) + '%');
                    label.textContent = bits.join('  ·  ');

                    const outH = document.createElement('div');
                    outH.className = 'browcut-clip-handle out';
                    outH.title = 'Trim end';

                    el.append(inH, label, outH);
                    el.addEventListener('mousedown', (e) => this.beginDrag(e, clip, track, el, 'move'));
                    inH.addEventListener('mousedown', (e) => this.beginDrag(e, clip, track, el, 'in'));
                    outH.addEventListener('mousedown', (e) => this.beginDrag(e, clip, track, el, 'out'));

                    lane.appendChild(el);
                });

                this.headersEl.appendChild(head);
                this.tracksEl.appendChild(lane);
            });

            this.renderRuler(width);
            this.renderPlayheadOnly();
            this.updateMetaUI();

            const hasDemoOnly = this.tracks.length === 1 &&
                this.tracks[0].clips.length === 1 && this.tracks[0].clips[0].kind === 'demo';
            if (this.emptyHint) this.emptyHint.style.display = hasDemoOnly ? 'block' : 'none';
            if (this.zoomValEl) this.zoomValEl.textContent = Math.round(this.pps) + 'px/s';
        }

        renderRuler(width) {
            if (!this.rulerEl) return;
            this.rulerEl.innerHTML = '';
            this.rulerEl.style.width = width + 'px';

            const total = Math.max(this.totalDuration(), 1);
            // Choose a tick interval that keeps labels ~70px apart.
            const targetPx = 70;
            const candidates = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
            let step = candidates[candidates.length - 1];
            for (const c of candidates) {
                if (this.timeToPx(c) >= targetPx) { step = c; break; }
            }

            for (let t = 0; t <= total + 1e-6; t += step) {
                const tick = document.createElement('div');
                tick.className = 'browcut-ruler-tick';
                tick.style.left = this.timeToPx(t) + 'px';
                tick.textContent = formatTimecode(t).replace(/\.\d+$/, '');
                this.rulerEl.appendChild(tick);
            }
        }

        renderPlayheadOnly() {
            if (!this.playheadEl) return;
            this.playheadEl.style.left = this.timeToPx(this.currentTime) + 'px';
        }

        updatePlayheadUI() {
            if (this.timecodeEl) this.timecodeEl.textContent = formatTimecode(this.currentTime);
            this.renderPlayheadOnly();
            this.syncInspectorTime();
        }

        syncInspectorTime() {
            // Presets are held on window, so panel contents refresh.
            this.applyAudio();
        }

        // ══ Dragging ══════════════════════════════════════════════════════
        beginDrag(e, clip, track, el, mode) {
            e.preventDefault();
            e.stopPropagation();
            if (clip.kind === 'demo') this._demoClipId = clip.id;

            this.selectedClipId = clip.id;
            this.selectedTrackId = track.id;
            this.syncInspector();
            this.tracksEl.querySelectorAll('.browcut-clip')
                .forEach(n => n.classList.toggle('selected', n.dataset.id === clip.id));
            this.headersEl.querySelectorAll('.browcut-track-head')
                .forEach(n => n.classList.toggle('selected', n.dataset.id === track.id));

            this.drag = {
                mode,
                clip,
                track,
                el,
                startX: e.clientX,
                startY: e.clientY,
                startTl: clip.tlStart,
                startIn: clip.in,
                startOut: clip.out,
                startDur: clip.dur,
                changed: false,
                before: this.captureState()
            };

            if (mode === 'move') {
                el.classList.add('dragging');
                const move = (ev) => this.onDragMove(ev);
                const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); this.endDrag(); };
                window.addEventListener('mousemove', move);
                window.addEventListener('mouseup', up);
            } else {
                const move = (ev) => this.onDragMove(ev);
                const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); this.endDrag(); };
                window.addEventListener('mousemove', move);
                window.addEventListener('mouseup', up);
            }
        }

        snapTime(t, ignoreClipId) {
            if (!this.snapping) return t;
            const threshold = 8 / this.pps;   // 8px in time units
            const marks = [0, this.currentTime];
            this.tracks.forEach(tr => tr.clips.forEach(c => {
                if (c.id === ignoreClipId) return;
                marks.push(c.tlStart, c.tlStart + c.dur);
            }));
            let best = t;
            let bestDist = threshold;
            for (const m of marks) {
                const d = Math.abs(m - t);
                if (d < bestDist) { bestDist = d; best = m; }
            }
            return best;
        }

        onDragMove(e) {
            const d = this.drag;
            if (!d) return;
            const dt = (e.clientX - d.startX) / this.pps;

            if (d.mode === 'move') {
                let next = Math.max(0, d.startTl + dt);
                next = Math.max(0, this.snapTime(next, d.clip.id));
                d.clip.tlStart = next;
                d.el.style.left = this.timeToPx(next) + 'px';
                d.changed = true;

                // Vertical drag moves the clip between tracks of the same kind.
                const laneEl = document.elementFromPoint(e.clientX, e.clientY);
                const lane = laneEl && laneEl.closest ? laneEl.closest('.browcut-lane') : null;
                if (lane && lane.dataset.id !== d.track.id) {
                    const target = this.tracks.find(t => t.id === lane.dataset.id);
                    if (target && target.kind === d.track.kind) {
                        d.track.clips = d.track.clips.filter(c => c !== d.clip);
                        target.clips.push(d.clip);
                        d.track = target;
                        this.selectedTrackId = target.id;
                    }
                }
            } else if (d.mode === 'in') {
                const srcDelta = d.startIn + dt * (d.clip.rate || 1);
                const nextIn = clamp(srcDelta, 0, d.clip.out - 0.1);
                d.clip.in = nextIn;
                // Trimming the head holds the visible start on the timeline.
                d.clip.tlStart = Math.max(0, this.snapTime(d.startTl + (nextIn - d.startIn) / (d.clip.rate || 1), d.clip.id));
                d.clip.dur = this.computeDur(d.clip);
                d.el.style.left = this.timeToPx(d.clip.tlStart) + 'px';
                d.el.style.width = Math.max(6, this.timeToPx(d.clip.dur)) + 'px';
                d.changed = true;
            } else {
                const srcDelta = d.startOut + dt * (d.clip.rate || 1);
                const nextOut = clamp(srcDelta, d.clip.in + 0.1, d.clip.sourceDuration);
                d.clip.out = nextOut;
                d.clip.dur = this.computeDur(d.clip);
                d.el.style.width = Math.max(6, this.timeToPx(d.clip.dur)) + 'px';
                d.changed = true;
            }

            this.renderRuler(this.innerEl.clientWidth);
            this.updateMetaUI();
            this.updatePlayheadUI();
            this.renderFrame();
            this.syncInspector();
        }

        endDrag() {
            const d = this.drag;
            this.drag = null;
            if (!d) return;
            d.el.classList.remove('dragging');
            if (!d.changed) { this.renderTimeline(); return; }

            this.undoStack.push({ action: d.mode === 'move' ? 'Move Clip' : 'Trim Clip', state: d.before });
            if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
            this.redoStack = [];
            this.updateUndoRedoUI();

            for (const t of this.tracks) t.clips.sort((a, b) => a.tlStart - b.tlStart);
            this.renderTimeline();
            this.syncElementsToPlayhead();
            this.renderFrame();
        }

        // ══ Clip operations ═══════════════════════════════════════════════
        splitAtPlayhead() {
            const found = this.selectedClip();
            const target = found && this.currentTime > found.clip.tlStart && this.currentTime < found.clip.tlStart + found.clip.dur
                ? found
                : (() => {
                    for (const t of this.tracks) {
                        const c = this.activeClips(t, this.currentTime)[0];
                        if (c) return { clip: c, track: t };
                    }
                    return null;
                })();

            if (!target) { this.toast('Move the playhead inside a clip to split'); return; }

            const { clip, track } = target;
            const srcTime = this.sourceTimeFor(clip, this.currentTime);
            if (srcTime <= clip.in + 0.06 || srcTime >= clip.out - 0.06) {
                this.toast('Playhead is too close to the clip edge');
                return;
            }

            this.pushHistory('Split Clip');
            const right = { ...clip, id: 'c' + (this.clipSeq++), in: srcTime, out: clip.out, _el: null };
            right.dur = this.computeDur(right);
            right.tlStart = this.currentTime;
            right.transform = { ...clip.transform };

            clip.out = srcTime;
            clip.dur = this.computeDur(clip);

            track.clips.push(right);
            track.clips.sort((a, b) => a.tlStart - b.tlStart);
            this.selectedClipId = right.id;

            this.renderTimeline();
            this.syncInspector();
            this.renderFrame();
            this.toast('Split at ' + formatTimecode(this.currentTime));
        }

        deleteSelected() {
            const found = this.selectedClip();
            if (!found) { this.toast('Select a clip first'); return; }
            this.pushHistory('Delete Clip');
            const { clip, track } = found;
            track.clips = track.clips.filter(c => c !== clip);
            if (clip._el) { try { clip._el.pause(); } catch (e) {} }
            const shared = this.tracks.some(t => t.clips.some(c => c.url === clip.url));
            if (clip.url && !shared) URL.revokeObjectURL(clip.url);

            const next = track.clips[0] || this.tracks.flatMap(t => t.clips)[0];
            this.selectedClipId = next ? next.id : null;
            this.renderTimeline();
            this.syncInspector();
            this.updateUndoRedoUI();
            this.syncElementsToPlayhead();
            this.renderFrame();
            this.toast('Deleted clip');
        }

        duplicateSelected() {
            const found = this.selectedClip();
            if (!found) { this.toast('Select a clip first'); return; }
            this.pushHistory('Duplicate Clip');
            const { clip, track } = found;
            const copy = { ...clip, id: 'c' + (this.clipSeq++), _el: null, transform: { ...clip.transform } };
            copy.tlStart = clip.tlStart + clip.dur;
            track.clips.push(copy);
            track.clips.sort((a, b) => a.tlStart - b.tlStart);
            this.selectedClipId = copy.id;
            this.renderTimeline();
            this.syncInspector();
            this.renderFrame();
            this.toast('Duplicated');
        }

        copySelected() {
            const found = this.selectedClip();
            if (!found) return;
            this.clipboard = { ...found.clip, transform: { ...found.clip.transform } };
            this.toast('Copied');
        }

        pasteClip() {
            if (!this.clipboard) { this.toast('Clipboard is empty'); return; }
            const track = this.tracks.find(t => t.id === this.selectedTrackId)
                || this.tracks.find(t => t.kind === this.clipboard.kind)
                || this.tracks[0];
            if (!track) return;
            this.pushHistory('Paste Clip');
            const copy = { ...this.clipboard, id: 'c' + (this.clipSeq++), _el: null, transform: { ...this.clipboard.transform } };
            copy.tlStart = this.currentTime;
            track.clips.push(copy);
            track.clips.sort((a, b) => a.tlStart - b.tlStart);
            this.selectedClipId = copy.id;
            this.selectedTrackId = track.id;
            this.renderTimeline();
            this.syncInspector();
            this.renderFrame();
            this.toast('Pasted');
        }

        // ══ Inspector ═════════════════════════════════════════════════════
        syncControlsFromState() {
            this.aspectBtns.forEach(b => b.classList.toggle('active', b.dataset.aspect === this.aspectRatio));
            this.filterPills.forEach(p => p.classList.toggle('active', p.dataset.filter === this.filter));
            if (this.fitToggle) this.fitToggle.textContent = this.fitMode === 'cover' ? 'Fill' : 'Fit';

            const set = (range, val, v, fmt) => {
                if (range) range.value = String(v);
                if (val) val.textContent = fmt(v);
            };
            set(this.brightRange, this.brightVal, this.adjust.brightness, v => Math.round(v * 100) + '%');
            set(this.contrastRange, this.contrastVal, this.adjust.contrast, v => Math.round(v * 100) + '%');
            set(this.satRange, this.satVal, this.adjust.saturation, v => Math.round(v * 100) + '%');
            set(this.textSizeRange, this.textSizeVal, this.textSize, v => v + 'px');
            if (this.textInput && this.textInput.value !== this.textOverlay) this.textInput.value = this.textOverlay;
            if (this.textPosSelect) this.textPosSelect.value = this.textPos;
            if (this.textColorInput) this.textColorInput.value = this.textColor;

            this.syncInspector();
        }

        syncInspector() {
            const found = this.selectedClip();
            if (!found) {
                if (this.inspectorEmpty) this.inspectorEmpty.style.display = 'block';
                if (this.inspectorBody) this.inspectorBody.style.display = 'none';
                return;
            }
            const clip = found.clip;
            if (this.inspectorEmpty) this.inspectorEmpty.style.display = 'none';
            if (this.inspectorBody) this.inspectorBody.style.display = 'block';

            if (this.clipNameEl) this.clipNameEl.textContent = clip.name;

            const isAudio = clip.kind === 'audio';
            const transformRows = this.container.querySelectorAll('[data-video-only]');
            transformRows.forEach(r => { r.style.display = isAudio ? 'none' : ''; });

            const t = clip.transform || { x: 0, y: 0, scale: 1, rotation: 0 };
            const set = (range, val, v, fmt) => {
                if (range) range.value = String(v);
                if (val) val.textContent = fmt(v);
            };
            set(this.posXRange, this.posXVal, t.x || 0, v => Math.round(v) + 'px');
            set(this.posYRange, this.posYVal, t.y || 0, v => Math.round(v) + 'px');
            set(this.scaleRange, this.scaleVal, t.scale || 1, v => Math.round(v * 100) + '%');
            set(this.rotRange, this.rotVal, t.rotation || 0, v => Math.round(v) + '°');
            set(this.opacityRange, this.opacityVal, clip.opacity === undefined ? 1 : clip.opacity, v => Math.round(v * 100) + '%');
            set(this.speedRange, this.speedVal, clip.rate || 1, v => v.toFixed(2) + 'x');
            set(this.volumeRange, this.volumeVal, clip.volume === undefined ? 1 : clip.volume, v => Math.round(v * 100) + '%');
            set(this.fadeInRange, this.fadeInVal, clip.fadeIn || 0, v => v.toFixed(1) + 's');
            set(this.fadeOutRange, this.fadeOutVal, clip.fadeOut || 0, v => v.toFixed(1) + 's');
            if (this.blendSelect) this.blendSelect.value = clip.blend || 'normal';

            // Fades cannot exceed half the clip.
            const half = Math.max(0.1, clip.dur / 2);
            if (this.fadeInRange) this.fadeInRange.max = String(Math.min(10, half).toFixed(1));
            if (this.fadeOutRange) this.fadeOutRange.max = String(Math.min(10, half).toFixed(1));
        }

        /** Applies a change to the selected clip and reflows timing. */
        updateSelectedClip(mutate, action, rebuildTimeline) {
            const found = this.selectedClip();
            if (!found) return;
            mutate(found.clip);
            found.clip.dur = this.computeDur(found.clip);
            if (rebuildTimeline) {
                found.track.clips.sort((a, b) => a.tlStart - b.tlStart);
                this.renderTimeline();
            }
            this.renderFrame();
            this.syncInspector();
        }

        // ══ Events ════════════════════════════════════════════════════════
        initEvents() {
            const on = (el, ev, fn) => { if (el) el.addEventListener(ev, fn); };

            on(this.container.querySelector('#bc-play-btn'), 'click', () => this.togglePlay());
            on(this.undoBtn, 'click', () => this.undo());
            on(this.redoBtn, 'click', () => this.redo());

            // Tabs
            this.tabBtns.forEach(btn => on(btn, 'click', () => {
                this.tabBtns.forEach(b => b.classList.toggle('active', b === btn));
                this.tabPanels.forEach(p => {
                    p.style.display = p.dataset.panel === btn.dataset.tab ? 'block' : 'none';
                });
            }));

            // Aspect
            this.aspectBtns.forEach(btn => on(btn, 'click', () => {
                if (this.aspectRatio === btn.dataset.aspect) return;
                this.pushHistory('Aspect ' + btn.dataset.aspect);
                this.aspectBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.setAspectRatio(btn.dataset.aspect);
            }));

            on(this.fitToggle, 'click', () => {
                this.pushHistory('Fit Mode');
                this.fitMode = this.fitMode === 'contain' ? 'cover' : 'contain';
                this.syncControlsFromState();
                this.renderFrame();
            });

            // Looks
            this.filterPills.forEach(pill => on(pill, 'click', () => {
                if (this.filter === pill.dataset.filter) return;
                this.pushHistory('Look ' + FILTERS[pill.dataset.filter].label);
                this.filterPills.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                this.filter = pill.dataset.filter;
                this.adjust = { brightness: 1, contrast: 1, saturation: 1 };
                this.syncControlsFromState();
                this.renderFrame();
            }));

            this.commitSlider(this.brightRange, 'Brightness', v => {
                this.adjust.brightness = v;
                if (this.brightVal) this.brightVal.textContent = Math.round(v * 100) + '%';
            });
            this.commitSlider(this.contrastRange, 'Contrast', v => {
                this.adjust.contrast = v;
                if (this.contrastVal) this.contrastVal.textContent = Math.round(v * 100) + '%';
            });
            this.commitSlider(this.satRange, 'Saturation', v => {
                this.adjust.saturation = v;
                if (this.satVal) this.satVal.textContent = Math.round(v * 100) + '%';
            });
            on(this.container.querySelector('#bc-grade-reset'), 'click', () => {
                this.pushHistory('Reset Colour');
                this.filter = 'normal';
                this.adjust = { brightness: 1, contrast: 1, saturation: 1 };
                this.filterPills.forEach(p => p.classList.toggle('active', p.dataset.filter === 'normal'));
                this.syncControlsFromState();
                this.renderFrame();
            });

            // Text
            on(this.textInput, 'input', (e) => { this.textOverlay = e.target.value; this.renderFrame(); });
            on(this.textInput, 'focus', () => { this._textBefore = this.textOverlay; });
            on(this.textInput, 'change', () => {
                if (this._textBefore === this.textOverlay) return;
                this.undoStack.push({ action: 'Text', state: Object.assign(this.captureState(), { textOverlay: this._textBefore }) });
                this.redoStack = [];
                this.updateUndoRedoUI();
            });
            on(this.textPosSelect, 'change', (e) => { this.pushHistory('Text Position'); this.textPos = e.target.value; this.renderFrame(); });
            on(this.textColorInput, 'input', (e) => { this.textColor = e.target.value; this.renderFrame(); });
            this.commitSlider(this.textSizeRange, 'Text Size', v => {
                this.textSize = v;
                if (this.textSizeVal) this.textSizeVal.textContent = v + 'px';
            });

            // Clip inspector
            this.commitSlider(this.posXRange, 'Position X', v => {
                this.updateSelectedClip(c => { c.transform.x = v; }, null);
                if (this.posXVal) this.posXVal.textContent = Math.round(v) + 'px';
            });
            this.commitSlider(this.posYRange, 'Position Y', v => {
                this.updateSelectedClip(c => { c.transform.y = v; }, null);
                if (this.posYVal) this.posYVal.textContent = Math.round(v) + 'px';
            });
            this.commitSlider(this.scaleRange, 'Scale', v => {
                this.updateSelectedClip(c => { c.transform.scale = v; }, null);
                if (this.scaleVal) this.scaleVal.textContent = Math.round(v * 100) + '%';
            });
            this.commitSlider(this.rotRange, 'Rotation', v => {
                this.updateSelectedClip(c => { c.transform.rotation = v; }, null);
                if (this.rotVal) this.rotVal.textContent = Math.round(v) + '°';
            });
            this.commitSlider(this.opacityRange, 'Opacity', v => {
                this.updateSelectedClip(c => { c.opacity = v; }, null, true);
                if (this.opacityVal) this.opacityVal.textContent = Math.round(v * 100) + '%';
            });
            this.commitSlider(this.speedRange, 'Speed', v => {
                this.updateSelectedClip(c => {
                    c.rate = v;
                    if (c._el) c._el.playbackRate = v;
                }, null, true);
                if (this.speedVal) this.speedVal.textContent = v.toFixed(2) + 'x';
                this.seek(this.currentTime);
            });
            this.commitSlider(this.volumeRange, 'Volume', v => {
                this.updateSelectedClip(c => { c.volume = v; }, null);
                this.applyAudio();
                if (this.volumeVal) this.volumeVal.textContent = Math.round(v * 100) + '%';
            });
            this.commitSlider(this.fadeInRange, 'Fade In', v => {
                this.updateSelectedClip(c => { c.fadeIn = v; }, null);
                if (this.fadeInVal) this.fadeInVal.textContent = v.toFixed(1) + 's';
            });
            this.commitSlider(this.fadeOutRange, 'Fade Out', v => {
                this.updateSelectedClip(c => { c.fadeOut = v; }, null);
                if (this.fadeOutVal) this.fadeOutVal.textContent = v.toFixed(1) + 's';
            });
            on(this.blendSelect, 'change', (e) => {
                this.pushHistory('Blend ' + e.target.value);
                this.updateSelectedClip(c => { c.blend = e.target.value; }, null, true);
            });

            on(this.duplicateBtn, 'click', () => this.duplicateSelected());
            on(this.deleteBtn, 'click', () => this.deleteSelected());
            on(this.container.querySelector('#bc-split-btn'), 'click', () => this.splitAtPlayhead());
            on(this.container.querySelector('#bc-tl-split'), 'click', () => this.splitAtPlayhead());
            on(this.addMediaBtn, 'click', () => this.fileInput && this.fileInput.click());

            // Master audio
            on(this.container.querySelector('#bc-mute-btn'), 'click', () => {
                this.pushHistory(this.isMuted ? 'Unmute' : 'Mute');
                this.isMuted = !this.isMuted;
                const btn = this.container.querySelector('#bc-mute-btn');
                if (btn) btn.innerHTML = (this.isMuted ? ICONS.mute : ICONS.volume) + '<span>' + (this.isMuted ? 'Unmute' : 'Mute') + '</span>';
                this.applyAudio();
            });
            this.commitSlider(this.container.querySelector('#bc-master-vol'), 'Master Volume', v => {
                this.masterVolume = v;
                const el = this.container.querySelector('#bc-master-vol-val');
                if (el) el.textContent = Math.round(v * 100) + '%';
                this.applyAudio();
            });

            // Track management
            on(this.container.querySelector('#bc-add-video-track'), 'click', () => {
                this.pushHistory('Add Video Track');
                const t = this.addTrack('video', null, 0);
                this.renderTimeline();
                this.toast('Added ' + t.name);
            });
            on(this.container.querySelector('#bc-add-audio-track'), 'click', () => {
                this.pushHistory('Add Audio Track');
                const t = this.addTrack('audio');
                this.renderTimeline();
                this.toast('Added ' + t.name);
            });

            // Timeline zoom / snapping
            const zoom = (factor) => {
                this.pps = clamp(this.pps * factor, 4, 400);
                this.renderTimeline();
            };
            on(this.container.querySelector('#bc-zoom-in'), 'click', () => zoom(1.3));
            on(this.container.querySelector('#bc-zoom-out'), 'click', () => zoom(1 / 1.3));
            on(this.container.querySelector('#bc-zoom-fit'), 'click', () => this.fitTimeline());
            on(this.snapBtn, 'click', () => {
                this.snapping = !this.snapping;
                if (this.snapBtn) this.snapBtn.classList.toggle('active', this.snapping);
                this.toast(this.snapping ? 'Snapping on' : 'Snapping off');
            });

            // Import
            const importBtn = this.container.querySelector('#bc-import-btn');
            on(importBtn, 'click', () => this.fileInput && this.fileInput.click());
            on(this.fileInput, 'change', (e) => {
                if (e.target.files && e.target.files.length) this.importFiles(e.target.files);
                e.target.value = '';
            });

            const stage = this.container.querySelector('.browcut-stage');
            if (stage) {
                stage.addEventListener('dragover', (e) => { e.preventDefault(); stage.classList.add('drag-over'); });
                stage.addEventListener('dragleave', () => stage.classList.remove('drag-over'));
                stage.addEventListener('drop', (e) => {
                    e.preventDefault();
                    stage.classList.remove('drag-over');
                    if (e.dataTransfer && e.dataTransfer.files.length) this.importFiles(e.dataTransfer.files);
                });
            }

            on(this.container.querySelector('#bc-export-btn'), 'click', () => this.startExport());
            on(this.container.querySelector('#bc-demo-btn'), 'click', () => {
                this.pushHistory('Load Demo');
                this.loadDemoFootage();
            });

            // Scrubbing on the timeline
            if (this.tracksEl) {
                this.tracksEl.addEventListener('mousedown', (e) => {
                    if (e.target.classList.contains('browcut-clip') ||
                        e.target.classList.contains('browcut-clip-label') ||
                        e.target.classList.contains('browcut-clip-handle')) return;
                    const rect = this.innerEl.getBoundingClientRect();
                    const scrubbing = true;
                    const scrubTo = (ev) => {
                        if (!scrubbing) return;
                        this.seek(clamp((ev.clientX - rect.left) / this.pps, 0, this.totalDuration()));
                    };
                    scrubTo(e);
                    const move = (ev) => scrubTo(ev);
                    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
                    window.addEventListener('mousemove', move);
                    window.addEventListener('mouseup', up);
                });
            }

            // Wheel: horizontal scroll, or zoom with Ctrl.
            if (this.scrollEl) {
                this.scrollEl.addEventListener('wheel', (e) => {
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        this.pps = clamp(this.pps * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 4, 400);
                        this.renderTimeline();
                    }
                }, { passive: false });
            }

            // Keyboard
            this.onKeyDown = (e) => {
                const isWithin = this.win.contains(document.activeElement);
                const isActiveWin = this.win.classList.contains('active-window');
                if (!isActiveWin && !isWithin) return;

                const mod = e.ctrlKey || e.metaKey;
                if (mod && (e.key === 'z' || e.key === 'Z')) {
                    e.preventDefault(); e.stopPropagation();
                    if (e.shiftKey) this.redo(); else this.undo();
                    return;
                }
                if (mod && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); e.stopPropagation(); this.redo(); return; }
                if (mod && (e.key === 'c' || e.key === 'C')) { e.preventDefault(); this.copySelected(); return; }
                if (mod && (e.key === 'v' || e.key === 'V')) { e.preventDefault(); this.pasteClip(); return; }
                if (mod && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); this.duplicateSelected(); return; }

                const tag = e.target.tagName;
                if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

                const frame = 1 / this.project.fps;
                if (e.code === 'Space') { e.preventDefault(); this.togglePlay(); }
                else if (e.code === 'KeyS') { e.preventDefault(); this.splitAtPlayhead(); }
                else if (e.code === 'Delete' || e.code === 'Backspace') { e.preventDefault(); this.deleteSelected(); }
                else if (e.code === 'ArrowLeft') { e.preventDefault(); this.seek(this.currentTime - (e.shiftKey ? 1 : frame)); }
                else if (e.code === 'ArrowRight') { e.preventDefault(); this.seek(this.currentTime + (e.shiftKey ? 1 : frame)); }
                else if (e.code === 'Home') { e.preventDefault(); this.seek(0); }
                else if (e.code === 'End') { e.preventDefault(); this.seek(this.totalDuration()); }
            };
            window.addEventListener('keydown', this.onKeyDown);
        }

        // ══ Export ════════════════════════════════════════════════════════
        async startExport() {
            if (this.isPlaying) this.togglePlay();
            if (!this.tracks.some(t => t.clips.length)) { this.toast('Nothing to export'); return; }
            if (this._export) return;
            if (typeof MediaRecorder === 'undefined' || !this.canvas.captureStream) {
                this.toast('Recording is not supported in this browser');
                return;
            }

            const total = this.totalDuration();
            if (total < 0.1) { this.toast('Timeline is too short'); return; }

            this.ensureAudioContext();

            const mimeType = pickMimeType();
            const fps = this.project.fps;
            const w = this.project.width;
            const h = this.project.height;
            const bitrate = clamp(Math.round(w * h * fps * 0.12), 4_000_000, 20_000_000);

            const canvasStream = this.canvas.captureStream(fps);
            const tracks = canvasStream.getVideoTracks().slice();
            if (this._streamDest) {
                this._streamDest.stream.getAudioTracks().forEach(t => tracks.push(t));
            }
            const stream = new MediaStream(tracks);

            const modal = this.buildExportModal(total, w, h, mimeType);
            const fill = modal.querySelector('.browcut-export-fill');
            const pctEl = modal.querySelector('.browcut-export-pct');
            const statusEl = modal.querySelector('.browcut-export-status');

            let recorder;
            try {
                recorder = new MediaRecorder(stream, Object.assign(
                    { videoBitsPerSecond: bitrate, audioBitsPerSecond: 128000 },
                    mimeType ? { mimeType } : {}
                ));
            } catch (e) {
                try { recorder = new MediaRecorder(stream); }
                catch (e2) { modal.remove(); this.toast('Could not start the recorder'); return; }
            }

            const chunks = [];
            const state = { cancelled: false };
            this._export = state;

            const cleanup = () => {
                this._export = null;
                modal.remove();
                for (const t of this.tracks) this.ensureTrackRuntime(t).pools.forEach(el => el.pause());
                this.applyAudio();
                this.syncElementsToPlayhead();
            };

            modal.querySelector('.browcut-export-cancel').addEventListener('click', () => {
                state.cancelled = true;
                if (recorder.state !== 'inactive') recorder.stop();
            });

            recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
            const finished = new Promise((resolve) => {
                recorder.onstop = () => {
                    const type = (recorder.mimeType || mimeType || 'video/webm').split(';')[0];
                    resolve(new Blob(chunks, { type }));
                };
            });

            recorder.start(1000);

            try {
                // Prime every element that participates, then play from zero.
                this.currentTime = 0;
                await this.syncElementsToPlayhead({ play: false });
                for (const t of this.tracks) {
                    this.ensureTrackRuntime(t).pools.forEach(el => { el.playbackRate = 1; });
                }
                await this.syncElementsToPlayhead({ play: true });

                await this.recordRealtime(total, (t) => {
                    const p = clamp(t / total, 0, 1);
                    fill.style.width = (p * 100).toFixed(1) + '%';
                    pctEl.textContent = Math.round(p * 100) + '%';
                    statusEl.textContent = 'Recording ' + formatTimecode(t) + ' of ' + formatTimecode(total);
                }, state);
            } catch (e) {
                state.cancelled = true;
            }

            if (recorder.state !== 'inactive') recorder.stop();
            const blob = await finished;

            fill.style.width = '100%';
            pctEl.textContent = '100%';

            if (state.cancelled && !blob.size) {
                statusEl.textContent = 'Export cancelled';
                setTimeout(cleanup, 600);
                return;
            }

            const ext = (recorder.mimeType || mimeType || '').includes('mp4') ? 'mp4' : 'webm';
            const filename = 'browcut_' + Date.now() + '.' + ext;
            statusEl.textContent = 'Saved ' + filename;

            setTimeout(() => {
                cleanup();
                this.downloadBlob(blob, filename);
                this.saveToVfs(blob, filename);
            }, 700);
        }

        /** Plays the composite timeline once, in real time, while recording. */
        recordRealtime(total, onProgress, state) {
            return new Promise((resolve) => {
                const t0 = performance.now();
                let lastSeek = 0;

                const step = () => {
                    if (state.cancelled) return resolve();

                    const elapsed = (performance.now() - t0) / 1000;
                    this.currentTime = Math.min(elapsed, total);

                    // Correct any element that has drifted from the wall clock.
                    if (elapsed - lastSeek > 0.5) {
                        lastSeek = elapsed;
                        for (const track of this.tracks) {
                            for (const clip of this.activeClips(track, this.currentTime)) {
                                if (clip.kind !== 'video' || !clip._el) continue;
                                const want = this.sourceTimeFor(clip, this.currentTime);
                                if (Math.abs(clip._el.currentTime - want) > 0.25) {
                                    try { clip._el.currentTime = want; } catch (e) { /* ignore */ }
                                }
                            }
                        }
                    }

                    this.applyAudio();
                    this.renderFrame();
                    this.renderPlayheadOnly();
                    if (this.timecodeEl) this.timecodeEl.textContent = formatTimecode(this.currentTime);
                    onProgress(this.currentTime);

                    if (elapsed >= total) return resolve();
                    requestAnimationFrame(step);
                };
                requestAnimationFrame(step);
            });
        }

        buildExportModal(total, w, h, mimeType) {
            const modal = document.createElement('div');
            modal.className = 'browcut-export-overlay';
            modal.innerHTML =
                '<div class="browcut-export-panel">' +
                    '<div class="browcut-export-head">' + ICONS.clapper + '<span>Export</span></div>' +
                    '<div class="browcut-export-meta">' + w + ' &times; ' + h + ' · ' + this.project.fps + ' fps · ' +
                        formatTimecode(total) + ' · ' + (mimeType ? mimeType.split(';')[0] : 'default') + '</div>' +
                    '<div class="browcut-export-bar"><div class="browcut-export-fill"></div></div>' +
                    '<div class="browcut-export-row">' +
                        '<span class="browcut-export-status">Preparing…</span>' +
                        '<span class="browcut-export-pct">0%</span>' +
                    '</div>' +
                    '<div class="browcut-export-actions"><button class="browcut-btn browcut-export-cancel">Cancel</button></div>' +
                    '<div class="browcut-export-note">Export runs in real time — the timeline plays through once while it records.</div>' +
                '</div>';
            this.container.appendChild(modal);
            return modal;
        }

        downloadBlob(blob, filename) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 30000);
        }

        async saveToVfs(blob, filename) {
            const fs = window.filesystem;
            if (!fs || typeof fs.isMounted !== 'function' || !fs.isMounted()) return;
            try {
                if (typeof fs.ensureDirectory === 'function') await fs.ensureDirectory('/User/Videos');
                if (typeof fs.createFileFromBlob === 'function') await fs.createFileFromBlob('/User/Videos/' + filename, blob);
                else if (typeof fs.createFile === 'function') await fs.createFile('/User/Videos/' + filename, blob);
                this.toast('Saved to /User/Videos');
            } catch (e) { /* the download still succeeded */ }
        }

        destroy() {
            this.isPlaying = false;
            cancelAnimationFrame(this.rafId);
            if (this._export) this._export.cancelled = true;
            window.removeEventListener('keydown', this.onKeyDown);

            this.tracks.forEach(t => {
                t.clips.forEach(c => { if (c.url) URL.revokeObjectURL(c.url); });
                this.disposeTrackRuntime(t);
            });

            if (this._actx && this._actx.state !== 'closed') this._actx.close().catch(() => {});
        }
    }

    window.initBrowCutApp = function (windowElement) {
        if (!windowElement || windowElement._browcut) return;
        windowElement._browcut = new BrowCutApp(windowElement);
    };

    window.BrowCutApp = BrowCutApp;
    window.BrowCutFilters = FILTERS;
    window.BrowCutBlends = BLENDS;
    window.BrowCutAspects = ASPECTS;
})();
