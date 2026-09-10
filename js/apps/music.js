/**
 * BrowOS Music App Module
 * Extracted from window.js
 */
(function(root) {
    'use strict';

    const MusicApp = {
        getContent() {
                return `
                    <div class="music-window">
                        <div class="music-layout">
                            <div class="music-sidebar">
                                <div class="music-sidebar-header">
                                    <span>Library</span>
                                </div>
                                <div class="music-sidebar-item active" data-view="all">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                                    <span>All Songs</span>
                                    <span class="music-sidebar-count" id="music-count-all">0</span>
                                </div>
                                <div class="music-sidebar-item" data-view="recent">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                    <span>Recently Added</span>
                                    <span class="music-sidebar-count" id="music-count-recent">0</span>
                                </div>
                                <div class="music-sidebar-divider"></div>
                                <div class="music-sidebar-header">
                                    <span>Imported</span>
                                </div>
                                <div class="music-sidebar-item" data-view="imported">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                    <span>Local Files</span>
                                    <span class="music-sidebar-count" id="music-count-imported">0</span>
                                </div>
                            </div>
                            <div class="music-main">
                                <div class="music-toolbar">
                                    <div class="music-toolbar-title">All Songs</div>
                                    <div class="music-toolbar-actions">
                                        <button class="music-import-btn" id="music-import-btn" title="Import music files">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                            <span>Import</span>
                                        </button>
                                        <button class="music-refresh-btn" id="music-refresh-btn" title="Refresh library">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                                        </button>
                                    </div>
                                </div>
                                <div class="music-track-list" id="music-track-list">
                                    <div class="music-empty-state" id="music-empty-state">
                                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                                            <path d="M9 18V5l12-2v13"/>
                                            <circle cx="6" cy="18" r="3"/>
                                            <circle cx="18" cy="16" r="3"/>
                                        </svg>
                                        <p>No music found</p>
                                        <span>Place audio files in the Music folder or import locally</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="music-player-bar">
                            <div class="music-player-track">
                                <div class="music-player-artwork" id="music-player-artwork">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                                </div>
                                <div class="music-player-info">
                                    <span class="music-player-title" id="music-player-title">Not Playing</span>
                                    <span class="music-player-artist" id="music-player-artist">—</span>
                                </div>
                            </div>
                            <div class="music-player-controls">
                                <div class="music-player-buttons">
                                    <button class="music-ctrl-btn" id="music-shuffle-btn" title="Shuffle">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
                                    </button>
                                    <button class="music-ctrl-btn" id="music-prev-btn" title="Previous">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
                                    </button>
                                    <button class="music-ctrl-btn music-play-btn" id="music-play-btn" title="Play">
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" id="music-play-icon"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                                    </button>
                                    <button class="music-ctrl-btn" id="music-next-btn" title="Next">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M16 18h2V6h-2zM5.5 12l8.5 6V6z"/></svg>
                                    </button>
                                    <button class="music-ctrl-btn" id="music-repeat-btn" title="Repeat">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                                    </button>
                                </div>
                                <div class="music-player-progress">
                                    <span class="music-time" id="music-time-current">0:00</span>
                                    <div class="music-progress-bar" id="music-progress-bar">
                                        <div class="music-progress-fill" id="music-progress-fill"></div>
                                        <div class="music-progress-handle" id="music-progress-handle"></div>
                                    </div>
                                    <span class="music-time" id="music-time-total">0:00</span>
                                </div>
                            </div>
                            <div class="music-player-volume">
                                <button class="music-ctrl-btn" id="music-volume-btn" title="Volume">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" id="music-volume-icon"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                                </button>
                                <div class="music-volume-slider" id="music-volume-slider">
                                    <div class="music-volume-fill" id="music-volume-fill" style="width: 80%"></div>
                                    <div class="music-volume-handle" id="music-volume-handle" style="left: 80%"></div>
                                </div>
                            </div>
                        </div>
                        <input type="file" id="music-file-input" accept="audio/*" multiple style="display:none;">
                    </div>
                `;
        },

        initEvents(windowElement) {
        const audio = new Audio();
        audio.volume = 0.8;

        const trackList = windowElement.querySelector('#music-track-list');
        const emptyState = windowElement.querySelector('#music-empty-state');
        const playBtn = windowElement.querySelector('#music-play-btn');
        const playIcon = windowElement.querySelector('#music-play-icon');
        const prevBtn = windowElement.querySelector('#music-prev-btn');
        const nextBtn = windowElement.querySelector('#music-next-btn');
        const shuffleBtn = windowElement.querySelector('#music-shuffle-btn');
        const repeatBtn = windowElement.querySelector('#music-repeat-btn');
        const progressBar = windowElement.querySelector('#music-progress-bar');
        const progressFill = windowElement.querySelector('#music-progress-fill');
        const progressHandle = windowElement.querySelector('#music-progress-handle');
        const timeCurrent = windowElement.querySelector('#music-time-current');
        const timeTotal = windowElement.querySelector('#music-time-total');
        const playerTitle = windowElement.querySelector('#music-player-title');
        const playerArtist = windowElement.querySelector('#music-player-artist');
        const volumeSlider = windowElement.querySelector('#music-volume-slider');
        const volumeFill = windowElement.querySelector('#music-volume-fill');
        const volumeHandle = windowElement.querySelector('#music-volume-handle');
        const importBtn = windowElement.querySelector('#music-import-btn');
        const refreshBtn = windowElement.querySelector('#music-refresh-btn');
        const fileInput = windowElement.querySelector('#music-file-input');
        const sidebarItems = windowElement.querySelectorAll('.music-sidebar-item');
        const toolbarTitle = windowElement.querySelector('.music-toolbar-title');
        const countAll = windowElement.querySelector('#music-count-all');
        const countRecent = windowElement.querySelector('#music-count-recent');
        const countImported = windowElement.querySelector('#music-count-imported');

        let library = [];
        let imported = [];
        let currentIndex = -1;
        let isPlaying = false;
        let isShuffle = false;
        let repeatMode = 0;
        let currentView = 'all';
        let isDraggingProgress = false;
        let isDraggingVolume = false;

        const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.wma', '.opus'];

        const isAudioFile = (name) => {
            const ext = '.' + name.split('.').pop().toLowerCase();
            return AUDIO_EXTENSIONS.includes(ext);
        };

        const formatTime = (seconds) => {
            if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
            const m = Math.floor(seconds / 60);
            const s = Math.floor(seconds % 60);
            return `${m}:${s.toString().padStart(2, '0')}`;
        };

        const parseTitle = (filename) => {
            const name = filename.replace(/\.[^/.]+$/, '');
            const cleaned = name.replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
            return cleaned || filename;
        };

        const getFilteredTracks = () => {
            if (currentView === 'imported') return [...imported];
            if (currentView === 'recent') return [...library].reverse().slice(0, 20);
            return [...library];
        };

        const updateCounts = () => {
            if (countAll) countAll.textContent = library.length;
            if (countRecent) countRecent.textContent = Math.min(library.length, 20);
            if (countImported) countImported.textContent = imported.length;
        };

        const renderTrackList = () => {
            const tracks = getFilteredTracks();
            if (tracks.length === 0) {
                emptyState.style.display = 'flex';
                trackList.querySelectorAll('.music-track-item').forEach(el => el.remove());
                return;
            }
            emptyState.style.display = 'none';
            trackList.querySelectorAll('.music-track-item').forEach(el => el.remove());

            tracks.forEach((track, idx) => {
                const globalIdx = library.indexOf(track);
                const item = document.createElement('div');
                item.className = 'music-track-item' + (globalIdx === currentIndex ? ' playing' : '');
                item.innerHTML = `
                    <span class="music-track-num">${globalIdx === currentIndex && isPlaying ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>' : (idx + 1)}</span>
                    <div class="music-track-info">
                        <span class="music-track-title">${track.title}</span>
                        <span class="music-track-filename">${track.filename}</span>
                    </div>
                    <span class="music-track-duration">${track.duration || '--:--'}</span>
                `;
                item.addEventListener('click', () => {
                    playTrack(globalIdx);
                });
                trackList.appendChild(item);
            });
        };

        const playTrack = (idx) => {
            if (idx < 0 || idx >= library.length) return;
            currentIndex = idx;
            const track = library[idx];
            audio.src = track.url;
            audio.play();
            isPlaying = true;
            updatePlayButton();
            playerTitle.textContent = track.title;
            playerArtist.textContent = track.filename;
            renderTrackList();
        };

        const updatePlayButton = () => {
            if (isPlaying) {
                playIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
            } else {
                playIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
            }
        };

        const togglePlay = () => {
            if (currentIndex === -1 && library.length > 0) {
                playTrack(0);
                return;
            }
            if (isPlaying) {
                audio.pause();
                isPlaying = false;
            } else {
                audio.play();
                isPlaying = true;
            }
            updatePlayButton();
            renderTrackList();
        };

        const playNext = () => {
            if (library.length === 0) return;
            let next;
            if (isShuffle) {
                next = Math.floor(Math.random() * library.length);
            } else {
                next = (currentIndex + 1) % library.length;
            }
            playTrack(next);
        };

        const playPrev = () => {
            if (library.length === 0) return;
            if (audio.currentTime > 3) {
                audio.currentTime = 0;
                return;
            }
            let prev = (currentIndex - 1 + library.length) % library.length;
            playTrack(prev);
        };

        const loadFromMounted = async () => {
            if (!window.filesystem || !window.filesystem.isMounted()) return;
            const entries = await window.filesystem.list('Music');
            if (!entries) return;
            for (const entry of entries) {
                if (entry.type === 'file' && isAudioFile(entry.name)) {
                    if (library.some(t => t.filename === entry.name)) continue;
                    const blob = await window.filesystem.readFileAsBlob('Music/' + entry.name);
                    if (!blob) continue;
                    const url = URL.createObjectURL(blob);
                    const meta = await window.filesystem.getMetadata('Music/' + entry.name);
                    library.push({
                        filename: entry.name,
                        title: parseTitle(entry.name),
                        url: url,
                        source: 'mounted',
                        addedAt: meta ? meta.modified : Date.now(),
                        duration: '--:--'
                    });
                }
            }
            updateCounts();
            renderTrackList();
        };

        const loadImported = (files) => {
            for (const file of files) {
                if (!isAudioFile(file.name)) continue;
                if (imported.some(t => t.filename === file.name && t.size === file.size)) continue;
                const url = URL.createObjectURL(file);
                imported.push({
                    filename: file.name,
                    title: parseTitle(file.name),
                    url: url,
                    source: 'imported',
                    addedAt: Date.now(),
                    size: file.size,
                    duration: '--:--'
                });
                library.push(imported[imported.length - 1]);
            }
            updateCounts();
            renderTrackList();
        };

        audio.addEventListener('loadedmetadata', () => {
            timeTotal.textContent = formatTime(audio.duration);
            if (currentIndex >= 0 && library[currentIndex]) {
                library[currentIndex].duration = formatTime(audio.duration);
                renderTrackList();
            }
        });

        audio.addEventListener('timeupdate', () => {
            if (isDraggingProgress) return;
            const pct = (audio.currentTime / audio.duration) * 100;
            progressFill.style.width = pct + '%';
            progressHandle.style.left = pct + '%';
            timeCurrent.textContent = formatTime(audio.currentTime);
        });

        audio.addEventListener('ended', () => {
            if (repeatMode === 2) {
                audio.currentTime = 0;
                audio.play();
            } else if (repeatMode === 1) {
                playNext();
            } else {
                if (currentIndex < library.length - 1) {
                    playNext();
                } else {
                    isPlaying = false;
                    updatePlayButton();
                    renderTrackList();
                }
            }
        });

        playBtn.addEventListener('click', togglePlay);
        nextBtn.addEventListener('click', playNext);
        prevBtn.addEventListener('click', playPrev);

        shuffleBtn.addEventListener('click', () => {
            isShuffle = !isShuffle;
            shuffleBtn.classList.toggle('active', isShuffle);
        });

        repeatBtn.addEventListener('click', () => {
            repeatMode = (repeatMode + 1) % 3;
            repeatBtn.classList.toggle('active', repeatMode > 0);
            if (repeatMode === 2) {
                repeatBtn.querySelector('svg').style.color = '#ff2d55';
            } else {
                repeatBtn.querySelector('svg').style.color = '';
            }
        });

        const seekTo = (e) => {
            const rect = progressBar.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            audio.currentTime = pct * audio.duration;
            progressFill.style.width = (pct * 100) + '%';
            progressHandle.style.left = (pct * 100) + '%';
        };

        progressBar.addEventListener('mousedown', (e) => {
            isDraggingProgress = true;
            seekTo(e);
        });

        document.addEventListener('mousemove', (e) => {
            if (isDraggingProgress) seekTo(e);
            if (isDraggingVolume) {
                const rect = volumeSlider.getBoundingClientRect();
                const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                audio.volume = pct;
                volumeFill.style.width = (pct * 100) + '%';
                volumeHandle.style.left = (pct * 100) + '%';
            }
        });

        document.addEventListener('mouseup', () => {
            isDraggingProgress = false;
            isDraggingVolume = false;
        });

        volumeSlider.addEventListener('mousedown', (e) => {
            isDraggingVolume = true;
            const rect = volumeSlider.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            audio.volume = pct;
            volumeFill.style.width = (pct * 100) + '%';
            volumeHandle.style.left = (pct * 100) + '%';
        });

        importBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                loadImported(e.target.files);
                fileInput.value = '';
            }
        });

        refreshBtn.addEventListener('click', () => {
            loadFromMounted();
        });

        sidebarItems.forEach(item => {
            item.addEventListener('click', () => {
                sidebarItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                currentView = item.dataset.view;
                const titles = { all: 'All Songs', recent: 'Recently Added', imported: 'Local Files' };
                toolbarTitle.textContent = titles[currentView] || 'All Songs';
                renderTrackList();
            });
        });

        loadFromMounted();

        const cleanup = () => {
            audio.pause();
            audio.src = '';
            library.forEach(track => URL.revokeObjectURL(track.url));
            library = [];
            imported = [];
        };

        const closeObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    if (windowElement.classList.contains('window-closing') || !document.body.contains(windowElement)) {
                        cleanup();
                        closeObserver.disconnect();
                    }
                }
            }
        });
        closeObserver.observe(windowElement, { attributes: true });
        }
    };

    root.BrowAppMusic = MusicApp;
    if (root.AppRegistry) {
        root.AppRegistry.register('music', MusicApp);
    }
})(typeof window !== 'undefined' ? window : this);
