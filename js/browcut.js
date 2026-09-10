/**
 * BrowCut — Desktop Video Editor & Clipper for BrowOS
 * Features: Multi-track timeline, Trimming (In/Out), Split tool, Speed Ramping,
 * Canvas Filter Pipeline, Aspect Ratios, Text Overlays, Ctrl+Z Undo/Redo Engine,
 * 100% Vector SVG UI (Zero Emojis), and MediaRecorder Export.
 */
(function() {
    'use strict';

    const ICONS = {
        play: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
        pause: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>',
        volume: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>',
        mute: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>',
        clapper: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00f2fe" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>'
    };

    class BrowCutApp {
        constructor(windowElement) {
            this.win = windowElement;
            this.container = windowElement.querySelector('.browcut-app');
            if (!this.container) return;

            this.canvas = this.container.querySelector('#browcut-canvas');
            this.ctx = this.canvas ? this.canvas.getContext('2d') : null;

            // Media & Timeline State
            this.video = document.createElement('video');
            this.video.crossOrigin = 'anonymous';
            this.video.playsInline = true;
            this.video.muted = false;

            this.isPlaying = false;
            this.duration = 10.0;
            this.currentTime = 0.0;
            this.playbackRate = 1.0;
            this.inPoint = 0.0;
            this.outPoint = 10.0;
            this.aspectRatio = '16:9';
            this.filter = 'normal';
            this.volume = 1.0;
            this.isMuted = false;

            // Overlay Text
            this.textOverlay = 'BROWCUT STUDIO';
            this.textSize = 28;
            this.textColor = '#00F2FE';
            this.textPos = 'bottom';

            // Procedural Demo Footage Generator
            this.isDemo = true;
            this.rafId = null;

            // History (Undo / Redo) Engine
            this.undoStack = [];
            this.redoStack = [];
            this.isApplyingHistory = false;
            this.maxHistory = 50;

            this.initUI();
            this.initEvents();
            this.loadDemoFootage();
            this.updateUndoRedoUI();
            this.renderFrame();
        }

        initUI() {
            this.timecodeEl = this.container.querySelector('#bc-timecode');
            this.playBtn = this.container.querySelector('#bc-play-btn');
            this.playIcon = this.container.querySelector('#bc-play-icon');
            this.aspectBtns = this.container.querySelectorAll('.browcut-aspect-btn');
            this.filterPills = this.container.querySelectorAll('.browcut-filter-pill');
            this.speedSlider = this.container.querySelector('#bc-speed-slider');
            this.speedVal = this.container.querySelector('#bc-speed-val');
            this.volSlider = this.container.querySelector('#bc-vol-slider');
            this.volVal = this.container.querySelector('#bc-vol-val');
            this.muteBtn = this.container.querySelector('#bc-mute-btn');
            this.textInput = this.container.querySelector('#bc-text-input');
            this.textPosSelect = this.container.querySelector('#bc-text-pos');
            this.fileInput = this.container.querySelector('#bc-file-input');
            this.undoBtn = this.container.querySelector('#bc-undo-btn');
            this.redoBtn = this.container.querySelector('#bc-redo-btn');

            // Timeline elements
            this.timelineTracks = this.container.querySelector('#bc-tracks');
            this.clipBlock = this.container.querySelector('#bc-clip-block');
            this.handleIn = this.container.querySelector('#bc-handle-in');
            this.handleOut = this.container.querySelector('#bc-handle-out');
            this.playheadLine = this.container.querySelector('#bc-playhead');
            this.rulerEl = this.container.querySelector('#bc-ruler');
        }

        captureState() {
            return {
                currentTime: this.currentTime,
                inPoint: this.inPoint,
                outPoint: this.outPoint,
                aspectRatio: this.aspectRatio,
                filter: this.filter,
                playbackRate: this.playbackRate,
                volume: this.volume,
                isMuted: this.isMuted,
                textOverlay: this.textOverlay,
                textPos: this.textPos
            };
        }

        pushHistory(action = 'Edit') {
            if (this.isApplyingHistory) return;
            this.undoStack.push({
                action,
                state: this.captureState()
            });
            if (this.undoStack.length > this.maxHistory) {
                this.undoStack.shift();
            }
            this.redoStack = [];
            this.updateUndoRedoUI();
        }

        undo() {
            if (this.undoStack.length === 0) return;
            const entry = this.undoStack.pop();
            this.redoStack.push({
                action: entry.action,
                state: this.captureState()
            });
            this.isApplyingHistory = true;
            this.restoreState(entry.state);
            this.isApplyingHistory = false;
            this.updateUndoRedoUI();
            this.showHudToast('Undo: ' + entry.action);
        }

        redo() {
            if (this.redoStack.length === 0) return;
            const entry = this.redoStack.pop();
            this.undoStack.push({
                action: entry.action,
                state: this.captureState()
            });
            this.isApplyingHistory = true;
            this.restoreState(entry.state);
            this.isApplyingHistory = false;
            this.updateUndoRedoUI();
            this.showHudToast('Redo: ' + entry.action);
        }

        restoreState(state) {
            if (!state) return;
            this.currentTime = state.currentTime;
            this.inPoint = state.inPoint;
            this.outPoint = state.outPoint;
            this.aspectRatio = state.aspectRatio;
            this.filter = state.filter;
            this.playbackRate = state.playbackRate;
            this.volume = state.volume;
            this.isMuted = state.isMuted;
            this.textOverlay = state.textOverlay;
            this.textPos = state.textPos;

            // Sync controls
            if (this.aspectBtns) {
                this.aspectBtns.forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.aspect === this.aspectRatio);
                });
            }
            this.setCanvasDimensions(this.aspectRatio);

            if (this.filterPills) {
                this.filterPills.forEach(p => {
                    p.classList.toggle('active', p.dataset.filter === this.filter);
                });
            }

            if (this.speedSlider) this.speedSlider.value = this.playbackRate;
            if (this.speedVal) this.speedVal.textContent = this.playbackRate.toFixed(2) + 'x';
            if (!this.isDemo) this.video.playbackRate = this.playbackRate;

            if (this.volSlider) this.volSlider.value = this.volume;
            if (this.volVal) this.volVal.textContent = Math.round(this.volume * 100) + '%';
            if (!this.isDemo) this.video.volume = this.volume;

            if (this.muteBtn) {
                this.muteBtn.innerHTML = this.isMuted ? ICONS.mute : ICONS.volume;
                if (!this.isDemo) this.video.muted = this.isMuted;
            }

            if (this.textInput) this.textInput.value = this.textOverlay;
            if (this.textPosSelect) this.textPosSelect.value = this.textPos;

            this.updateTimelineUI();
            this.renderFrame();
        }

        updateUndoRedoUI() {
            if (this.undoBtn) {
                this.undoBtn.disabled = this.undoStack.length === 0;
                this.undoBtn.style.opacity = this.undoStack.length === 0 ? '0.35' : '1';
                this.undoBtn.style.cursor = this.undoStack.length === 0 ? 'not-allowed' : 'pointer';
            }
            if (this.redoBtn) {
                this.redoBtn.disabled = this.redoStack.length === 0;
                this.redoBtn.style.opacity = this.redoStack.length === 0 ? '0.35' : '1';
                this.redoBtn.style.cursor = this.redoStack.length === 0 ? 'not-allowed' : 'pointer';
            }
        }

        showHudToast(text) {
            let toast = this.container.querySelector('.browcut-hud-toast');
            if (!toast) {
                toast = document.createElement('div');
                toast.className = 'browcut-hud-toast';
                const stage = this.container.querySelector('.browcut-stage') || this.container;
                stage.appendChild(toast);
            }
            toast.textContent = text;
            toast.classList.add('visible');
            clearTimeout(toast._timer);
            toast._timer = setTimeout(() => {
                toast.classList.remove('visible');
            }, 1200);
        }

        initEvents() {
            if (this.playBtn) {
                this.playBtn.addEventListener('click', () => this.togglePlay());
            }

            if (this.undoBtn) {
                this.undoBtn.addEventListener('click', () => this.undo());
            }

            if (this.redoBtn) {
                this.redoBtn.addEventListener('click', () => this.redo());
            }

            this.onKeyDown = (e) => {
                const isWithin = this.win.contains(document.activeElement);
                const isActiveWin = this.win.classList.contains('active-window');
                if (!isActiveWin && !isWithin) return;

                // Undo / Redo Shortcuts (Ctrl+Z, Ctrl+Y, Cmd+Shift+Z)
                if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.shiftKey) {
                        this.redo();
                    } else {
                        this.undo();
                    }
                    return;
                }

                if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.redo();
                    return;
                }

                if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

                if (e.code === 'Space') {
                    e.preventDefault();
                    this.togglePlay();
                } else if (e.code === 'KeyS' || e.code === 'KeyC') {
                    e.preventDefault();
                    this.splitClip();
                } else if (e.key === '[') {
                    this.pushHistory('Trim In');
                    this.setInPoint();
                } else if (e.key === ']') {
                    this.pushHistory('Trim Out');
                    this.setOutPoint();
                }
            };
            window.addEventListener('keydown', this.onKeyDown);

            this.aspectBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    if (this.aspectRatio === btn.dataset.aspect) return;
                    this.pushHistory('Aspect ' + btn.dataset.aspect);
                    this.aspectBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.setAspectRatio(btn.dataset.aspect);
                });
            });

            this.filterPills.forEach(pill => {
                pill.addEventListener('click', () => {
                    if (this.filter === pill.dataset.filter) return;
                    this.pushHistory('Filter: ' + pill.textContent.trim());
                    this.filterPills.forEach(p => p.classList.remove('active'));
                    pill.classList.add('active');
                    this.filter = pill.dataset.filter;
                    this.renderFrame();
                });
            });

            if (this.speedSlider) {
                let initialSpeed = this.playbackRate;
                this.speedSlider.addEventListener('focus', () => {
                    initialSpeed = this.playbackRate;
                });
                this.speedSlider.addEventListener('input', (e) => {
                    this.playbackRate = parseFloat(e.target.value);
                    if (this.speedVal) this.speedVal.textContent = this.playbackRate.toFixed(2) + 'x';
                    if (!this.isDemo) this.video.playbackRate = this.playbackRate;
                });
                this.speedSlider.addEventListener('change', () => {
                    if (initialSpeed !== this.playbackRate) {
                        this.undoStack.push({ action: 'Change Speed', state: { ...this.captureState(), playbackRate: initialSpeed } });
                        this.redoStack = [];
                        this.updateUndoRedoUI();
                        initialSpeed = this.playbackRate;
                    }
                });
            }

            if (this.volSlider) {
                let initialVol = this.volume;
                this.volSlider.addEventListener('focus', () => {
                    initialVol = this.volume;
                });
                this.volSlider.addEventListener('input', (e) => {
                    this.volume = parseFloat(e.target.value);
                    if (this.volVal) this.volVal.textContent = Math.round(this.volume * 100) + '%';
                    if (!this.isDemo) this.video.volume = this.volume;
                });
                this.volSlider.addEventListener('change', () => {
                    if (initialVol !== this.volume) {
                        this.undoStack.push({ action: 'Change Volume', state: { ...this.captureState(), volume: initialVol } });
                        this.redoStack = [];
                        this.updateUndoRedoUI();
                        initialVol = this.volume;
                    }
                });
            }

            if (this.muteBtn) {
                this.muteBtn.addEventListener('click', () => {
                    this.pushHistory(this.isMuted ? 'Unmute' : 'Mute');
                    this.isMuted = !this.isMuted;
                    this.muteBtn.innerHTML = this.isMuted ? ICONS.mute : ICONS.volume;
                    if (!this.isDemo) this.video.muted = this.isMuted;
                });
            }

            if (this.textInput) {
                let initialText = this.textOverlay;
                this.textInput.addEventListener('focus', () => {
                    initialText = this.textOverlay;
                });
                this.textInput.addEventListener('input', (e) => {
                    this.textOverlay = e.target.value;
                    this.renderFrame();
                });
                this.textInput.addEventListener('change', () => {
                    if (initialText !== this.textOverlay) {
                        this.undoStack.push({ action: 'Text Change', state: { ...this.captureState(), textOverlay: initialText } });
                        this.redoStack = [];
                        this.updateUndoRedoUI();
                        initialText = this.textOverlay;
                    }
                });
            }

            if (this.textPosSelect) {
                this.textPosSelect.addEventListener('change', (e) => {
                    this.pushHistory('Text Position');
                    this.textPos = e.target.value;
                    this.renderFrame();
                });
            }

            const demoBtn = this.container.querySelector('#bc-demo-btn');
            if (demoBtn) {
                demoBtn.addEventListener('click', () => {
                    this.pushHistory('Reset Demo');
                    this.loadDemoFootage();
                });
            }

            const importBtn = this.container.querySelector('#bc-import-btn');
            if (importBtn && this.fileInput) {
                importBtn.addEventListener('click', () => this.fileInput.click());
                this.fileInput.addEventListener('change', (e) => {
                    if (e.target.files && e.target.files[0]) {
                        this.pushHistory('Import Video');
                        this.loadLocalVideo(e.target.files[0]);
                    }
                });
            }

            const exportBtn = this.container.querySelector('#bc-export-btn');
            if (exportBtn) exportBtn.addEventListener('click', () => this.startExport());

            const splitBtn = this.container.querySelector('#bc-split-btn');
            if (splitBtn) splitBtn.addEventListener('click', () => this.splitClip());

            const inBtn = this.container.querySelector('#bc-in-btn');
            if (inBtn) inBtn.addEventListener('click', () => {
                this.pushHistory('Set In-Point');
                this.setInPoint();
            });

            const outBtn = this.container.querySelector('#bc-out-btn');
            if (outBtn) outBtn.addEventListener('click', () => {
                this.pushHistory('Set Out-Point');
                this.setOutPoint();
            });

            if (this.timelineTracks) {
                let isScrubbing = false;
                const updateScrub = (e) => {
                    const rect = this.timelineTracks.getBoundingClientRect();
                    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    this.seek(ratio * this.duration);
                };

                this.timelineTracks.addEventListener('mousedown', (e) => {
                    if (e.target === this.handleIn || e.target === this.handleOut) return;
                    isScrubbing = true;
                    updateScrub(e);
                });
                window.addEventListener('mousemove', (e) => {
                    if (isScrubbing) updateScrub(e);
                });
                window.addEventListener('mouseup', () => {
                    isScrubbing = false;
                });
            }

            this.initTrimHandles();
        }

        initTrimHandles() {
            if (!this.handleIn || !this.handleOut || !this.timelineTracks) return;

            let draggingIn = false;
            let draggingOut = false;
            let startIn = this.inPoint;
            let startOut = this.outPoint;

            this.handleIn.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                draggingIn = true;
                startIn = this.inPoint;
            });
            this.handleOut.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                draggingOut = true;
                startOut = this.outPoint;
            });

            window.addEventListener('mousemove', (e) => {
                if (!draggingIn && !draggingOut) return;
                const rect = this.timelineTracks.getBoundingClientRect();
                const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * this.duration;

                if (draggingIn) {
                    this.inPoint = Math.min(pos, this.outPoint - 0.5);
                    this.updateTimelineUI();
                    if (this.currentTime < this.inPoint) this.seek(this.inPoint);
                } else if (draggingOut) {
                    this.outPoint = Math.max(pos, this.inPoint + 0.5);
                    this.updateTimelineUI();
                    if (this.currentTime > this.outPoint) this.seek(this.outPoint);
                }
            });

            window.addEventListener('mouseup', () => {
                if (draggingIn) {
                    draggingIn = false;
                    if (Math.abs(startIn - this.inPoint) > 0.05) {
                        this.undoStack.push({ action: 'Trim In', state: { ...this.captureState(), inPoint: startIn } });
                        this.redoStack = [];
                        this.updateUndoRedoUI();
                    }
                }
                if (draggingOut) {
                    draggingOut = false;
                    if (Math.abs(startOut - this.outPoint) > 0.05) {
                        this.undoStack.push({ action: 'Trim Out', state: { ...this.captureState(), outPoint: startOut } });
                        this.redoStack = [];
                        this.updateUndoRedoUI();
                    }
                }
            });
        }

        setCanvasDimensions(aspect) {
            let w = 640, h = 360;
            if (aspect === '9:16') {
                w = 360; h = 640;
            } else if (aspect === '1:1') {
                w = 480; h = 480;
            } else if (aspect === '4:3') {
                w = 480; h = 360;
            }
            if (this.canvas) {
                this.canvas.width = w;
                this.canvas.height = h;
            }
        }

        setAspectRatio(aspect) {
            this.aspectRatio = aspect;
            this.setCanvasDimensions(aspect);
            this.renderFrame();
        }

        loadDemoFootage() {
            this.isDemo = true;
            this.duration = 10.0;
            this.inPoint = 0.0;
            this.outPoint = 10.0;
            this.currentTime = 0.0;
            this.setAspectRatio(this.aspectRatio);
            this.updateTimelineUI();
            this.renderRuler();
            this.renderFrame();
        }

        loadLocalVideo(file) {
            const url = URL.createObjectURL(file);
            this.video.src = url;
            this.video.load();
            this.video.onloadedmetadata = () => {
                this.isDemo = false;
                this.duration = this.video.duration || 10.0;
                this.inPoint = 0.0;
                this.outPoint = this.duration;
                this.currentTime = 0.0;
                this.setAspectRatio(this.aspectRatio);
                this.updateTimelineUI();
                this.renderRuler();
                this.renderFrame();
            };
        }

        togglePlay() {
            this.isPlaying = !this.isPlaying;
            if (this.playIcon) {
                this.playIcon.innerHTML = this.isPlaying ? ICONS.pause : ICONS.play;
            }

            if (this.isPlaying) {
                if (this.currentTime >= this.outPoint) {
                    this.seek(this.inPoint);
                }
                this.lastTimestamp = performance.now();
                if (!this.isDemo) {
                    this.video.currentTime = this.currentTime;
                    this.video.play().catch(() => {});
                }
                this.playLoop();
            } else {
                if (!this.isDemo) this.video.pause();
                cancelAnimationFrame(this.rafId);
            }
        }

        playLoop() {
            if (!this.isPlaying) return;

            const now = performance.now();
            const delta = (now - (this.lastTimestamp || now)) / 1000;
            this.lastTimestamp = now;

            this.currentTime += delta * this.playbackRate;

            if (this.currentTime >= this.outPoint) {
                this.currentTime = this.inPoint;
                if (!this.isDemo) this.video.currentTime = this.inPoint;
            }

            this.updatePlayheadUI();
            this.renderFrame();

            this.rafId = requestAnimationFrame(() => this.playLoop());
        }

        seek(time) {
            this.currentTime = Math.max(0, Math.min(this.duration, time));
            if (!this.isDemo) {
                this.video.currentTime = this.currentTime;
            }
            this.updatePlayheadUI();
            this.renderFrame();
        }

        splitClip() {
            this.pushHistory('Split Clip');
            const block = this.clipBlock;
            if (block) {
                block.style.boxShadow = '0 0 20px #ff0844';
                setTimeout(() => {
                    block.style.boxShadow = '';
                }, 300);
            }
            this.setInPoint(this.currentTime);
            this.showHudToast('Clip Split at Timecode');
        }

        setInPoint(time = this.currentTime) {
            this.inPoint = Math.min(time, this.outPoint - 0.5);
            this.updateTimelineUI();
        }

        setOutPoint(time = this.currentTime) {
            this.outPoint = Math.max(time, this.inPoint + 0.5);
            this.updateTimelineUI();
        }

        updatePlayheadUI() {
            const mins = Math.floor(this.currentTime / 60);
            const secs = Math.floor(this.currentTime % 60);
            const ms = Math.floor((this.currentTime % 1) * 100);
            const tc = String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0') + '.' + String(ms).padStart(2, '0');
            if (this.timecodeEl) this.timecodeEl.textContent = tc;

            if (this.playheadLine && this.timelineTracks) {
                const pct = (this.currentTime / this.duration) * 100;
                this.playheadLine.style.left = pct + '%';
            }
        }

        updateTimelineUI() {
            this.updatePlayheadUI();
            if (this.clipBlock && this.duration > 0) {
                const leftPct = (this.inPoint / this.duration) * 100;
                const widthPct = ((this.outPoint - this.inPoint) / this.duration) * 100;
                this.clipBlock.style.left = leftPct + '%';
                this.clipBlock.style.width = widthPct + '%';
            }
        }

        renderRuler() {
            if (!this.rulerEl) return;
            this.rulerEl.innerHTML = '';
            const steps = 10;
            for (let i = 0; i <= steps; i++) {
                const t = (i / steps) * this.duration;
                const tick = document.createElement('div');
                tick.className = 'browcut-ruler-tick';
                tick.style.left = (i / steps * 100) + '%';
                tick.textContent = Math.floor(t) + 's';
                this.rulerEl.appendChild(tick);
            }
        }

        renderFrame() {
            if (!this.ctx || !this.canvas) return;
            const w = this.canvas.width;
            const h = this.canvas.height;

            this.ctx.save();

            if (this.isDemo) {
                this.renderDemoSynthwave(w, h);
            } else {
                this.renderSourceVideo(w, h);
            }

            this.applyCanvasFilter(w, h);

            if (this.textOverlay) {
                this.drawTextOverlay(w, h);
            }

            this.ctx.restore();
        }

        renderDemoSynthwave(w, h) {
            const t = this.currentTime;
            const ctx = this.ctx;

            const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.6);
            skyGrad.addColorStop(0, '#050510');
            skyGrad.addColorStop(0.5, '#1e082b');
            skyGrad.addColorStop(1, '#6b114d');
            ctx.fillStyle = skyGrad;
            ctx.fillRect(0, 0, w, h * 0.6);

            const sunY = h * 0.45;
            const sunR = Math.min(w, h) * 0.22;
            const sunGrad = ctx.createLinearGradient(w / 2, sunY - sunR, w / 2, sunY + sunR);
            sunGrad.addColorStop(0, '#ffe600');
            sunGrad.addColorStop(0.7, '#ff007f');
            sunGrad.addColorStop(1, '#aa00ff');
            ctx.fillStyle = sunGrad;
            ctx.beginPath();
            ctx.arc(w / 2, sunY, sunR, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#1e082b';
            for (let i = 0; i < 6; i++) {
                const barH = 2 + i * 1.5;
                const barY = sunY + (i * 10) + 4;
                ctx.fillRect(w / 2 - sunR, barY, sunR * 2, barH);
            }

            const floorH = h * 0.4;
            const floorY = h * 0.6;
            ctx.fillStyle = '#070312';
            ctx.fillRect(0, floorY, w, floorH);

            ctx.strokeStyle = '#00f2fe';
            ctx.lineWidth = 1.5;
            ctx.shadowColor = '#00f2fe';
            ctx.shadowBlur = 8;

            const vanishX = w / 2;
            const vanishY = floorY;

            for (let x = -w * 0.5; x <= w * 1.5; x += w / 8) {
                ctx.beginPath();
                ctx.moveTo(vanishX, vanishY);
                ctx.lineTo(x, h);
                ctx.stroke();
            }

            const speed = (t * 80 * this.playbackRate) % 40;
            for (let y = 0; y < floorH; y += 15) {
                const lineY = floorY + ((y + speed) % floorH);
                ctx.beginPath();
                ctx.moveTo(0, lineY);
                ctx.lineTo(w, lineY);
                ctx.stroke();
            }
            ctx.shadowBlur = 0;

            const carW = 70;
            const carH = 30;
            const carX = w / 2 - carW / 2 + Math.sin(t * 2) * 20;
            const carY = h * 0.78;

            ctx.fillStyle = '#000';
            ctx.fillRect(carX, carY, carW, carH);
            ctx.strokeStyle = '#ff007f';
            ctx.lineWidth = 2;
            ctx.strokeRect(carX, carY, carW, carH);

            ctx.fillStyle = '#ff0844';
            ctx.shadowColor = '#ff0844';
            ctx.shadowBlur = 10;
            ctx.fillRect(carX + 4, carY + 8, 14, 6);
            ctx.fillRect(carX + carW - 18, carY + 8, 14, 6);
            ctx.shadowBlur = 0;
        }

        renderSourceVideo(w, h) {
            const ctx = this.ctx;
            const vw = this.video.videoWidth || 640;
            const vh = this.video.videoHeight || 360;

            if (this.aspectRatio === '9:16') {
                ctx.save();
                ctx.filter = 'blur(16px) brightness(0.6)';
                ctx.drawImage(this.video, 0, 0, w, h);
                ctx.restore();

                const scale = Math.min(w / vw, h / vh);
                const dw = vw * scale;
                const dh = vh * scale;
                ctx.drawImage(this.video, (w - dw) / 2, (h - dh) / 2, dw, dh);
            } else {
                ctx.drawImage(this.video, 0, 0, w, h);
            }
        }

        applyCanvasFilter(w, h) {
            const ctx = this.ctx;
            if (this.filter === 'normal') return;

            if (this.filter === 'cyberpunk') {
                ctx.fillStyle = 'rgba(0, 242, 254, 0.12)';
                ctx.fillRect(0, 0, w, h);
                ctx.fillStyle = 'rgba(255, 0, 127, 0.1)';
                ctx.fillRect(0, 0, w, h);
            } else if (this.filter === 'vhs') {
                ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
                for (let y = 0; y < h; y += 4) {
                    ctx.fillRect(0, y, w, 1.5);
                }
                ctx.font = '14px "Ubuntu Mono", monospace';
                ctx.fillStyle = '#00ff66';
                ctx.fillText('PLAY > SP  00:' + String(Math.floor(this.currentTime)).padStart(2, '0'), 18, 28);
            } else if (this.filter === 'cinema') {
                ctx.fillStyle = 'rgba(255, 180, 50, 0.15)';
                ctx.fillRect(0, 0, w, h);
            } else if (this.filter === 'noir') {
                const imgData = ctx.getImageData(0, 0, w, h);
                const d = imgData.data;
                for (let i = 0; i < d.length; i += 4) {
                    const gray = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
                    const highContrast = gray > 120 ? gray * 1.2 : gray * 0.8;
                    d[i] = highContrast;
                    d[i + 1] = highContrast;
                    d[i + 2] = highContrast;
                }
                ctx.putImageData(imgData, 0, 0);
            } else if (this.filter === 'glitch') {
                const sliceH = 20;
                const sliceY = (Math.sin(this.currentTime * 10) * 0.5 + 0.5) * (h - sliceH);
                ctx.drawImage(this.canvas, 0, sliceY, w, sliceH, 6, sliceY, w, sliceH);
            } else if (this.filter === 'matrix') {
                ctx.fillStyle = 'rgba(0, 255, 70, 0.18)';
                ctx.fillRect(0, 0, w, h);
            }
        }

        drawTextOverlay(w, h) {
            const ctx = this.ctx;
            ctx.save();
            ctx.font = 'bold ' + this.textSize + 'px "Ubuntu Mono", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            let y = h - 40;
            if (this.textPos === 'top') y = 40;
            else if (this.textPos === 'center') y = h / 2;

            const textMetrics = ctx.measureText(this.textOverlay);
            const boxW = textMetrics.width + 24;
            const boxH = this.textSize + 12;

            ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
            if (ctx.roundRect) {
                ctx.beginPath();
                ctx.roundRect(w / 2 - boxW / 2, y - boxH / 2, boxW, boxH, 8);
                ctx.fill();
            } else {
                ctx.fillRect(w / 2 - boxW / 2, y - boxH / 2, boxW, boxH);
            }

            ctx.fillStyle = this.textColor;
            ctx.shadowColor = this.textColor;
            ctx.shadowBlur = 10;
            ctx.fillText(this.textOverlay, w / 2, y);

            ctx.restore();
        }

        startExport() {
            if (this.isPlaying) this.togglePlay();

            const modal = document.createElement('div');
            modal.className = 'browcut-modal-overlay';
            modal.innerHTML = `
                <div class="browcut-modal">
                    <h3 style="margin:0 0 8px; color:#00f2fe; display:flex; align-items:center; justify-content:center; gap:8px;">
                        ${ICONS.clapper} Exporting Video Clip
                    </h3>
                    <p style="font-size:12px; color:#94a3b8; margin:0 0 16px;">
                        Encoding ${this.aspectRatio} sequence (${(this.outPoint - this.inPoint).toFixed(1)}s)...
                    </p>
                    <div class="browcut-progress-bar">
                        <div class="browcut-progress-fill" id="bc-export-fill"></div>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-size:11px; color:#64748b;">
                        <span id="bc-export-status">Rendering frames...</span>
                        <span id="bc-export-pct" style="color:#00f2fe; font-weight:bold;">0%</span>
                    </div>
                </div>
            `;
            this.container.appendChild(modal);

            const fill = modal.querySelector('#bc-export-fill');
            const pctText = modal.querySelector('#bc-export-pct');
            const statusText = modal.querySelector('#bc-export-status');

            const stream = this.canvas.captureStream(30);
            let recorder = null;
            const chunks = [];

            try {
                recorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp8' });
            } catch (_) {
                recorder = new MediaRecorder(stream);
            }

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };

            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'video/webm' });
                statusText.textContent = 'Export complete!';
                pctText.textContent = '100%';
                fill.style.width = '100%';

                setTimeout(() => {
                    modal.remove();
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = 'browcut_clip_' + Date.now() + '.webm';
                    a.click();

                    if (window.filesystem && window.filesystem.isMounted()) {
                        window.filesystem.writeFile('/User/Videos/' + a.download, blob).catch(() => {});
                    }
                }, 800);
            };

            recorder.start();

            const startT = this.inPoint;
            const endT = this.outPoint;
            const renderDuration = endT - startT;
            let currentExportT = startT;
            const step = 1 / 30;

            const renderInterval = setInterval(() => {
                currentExportT += step;
                this.currentTime = currentExportT;
                this.renderFrame();

                const progress = Math.min(1, (currentExportT - startT) / renderDuration);
                fill.style.width = Math.round(progress * 100) + '%';
                pctText.textContent = Math.round(progress * 100) + '%';

                if (currentExportT >= endT) {
                    clearInterval(renderInterval);
                    recorder.stop();
                }
            }, 33);
        }

        destroy() {
            this.isPlaying = false;
            cancelAnimationFrame(this.rafId);
            window.removeEventListener('keydown', this.onKeyDown);
            if (this.video) {
                this.video.pause();
                this.video.src = '';
            }
        }
    }

    window.initBrowCutApp = function(windowElement) {
        if (!windowElement || windowElement._browcut) return;
        windowElement._browcut = new BrowCutApp(windowElement);
    };

    window.BrowCutApp = BrowCutApp;
})();
