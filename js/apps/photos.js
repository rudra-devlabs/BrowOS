/**
 * BrowOS Photos App Module
 * Extracted from window.js
 */
(function(root) {
    'use strict';

    const PhotosApp = {
        getContent() {
                return `
                    <div class="photos-window">
                        <div class="photos-layout">
                            <div class="photos-sidebar">
                                <div class="photos-sidebar-header">Library</div>
                                <div class="photos-sidebar-item active" data-view="all">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                                    <span>All Photos</span>
                                    <span class="photos-sidebar-count" id="photos-count-all">0</span>
                                </div>
                                <div class="photos-sidebar-item" data-view="images">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                                    <span>Images</span>
                                    <span class="photos-sidebar-count" id="photos-count-images">0</span>
                                </div>
                                <div class="photos-sidebar-item" data-view="videos">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                                    <span>Videos</span>
                                    <span class="photos-sidebar-count" id="photos-count-videos">0</span>
                                </div>
                                <div class="photos-sidebar-divider"></div>
                                <div class="photos-sidebar-header">Folders</div>
                                <div class="photos-sidebar-item" data-view="pictures">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                                    <span>Pictures</span>
                                </div>
                                <div class="photos-sidebar-item" data-view="desktop">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                                    <span>Desktop</span>
                                </div>
                            </div>
                            <div class="photos-main">
                                <div class="photos-toolbar">
                                    <div class="photos-toolbar-title" id="photos-toolbar-title">All Photos</div>
                                    <div class="photos-toolbar-actions">
                                        <button class="photos-import-btn" id="photos-import-btn" title="Import photos">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                            <span>Import</span>
                                        </button>
                                        <button class="photos-refresh-btn" id="photos-refresh-btn" title="Refresh">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                                        </button>
                                    </div>
                                </div>
                                <div class="photos-grid" id="photos-grid">
                                    <div class="photos-empty-state" id="photos-empty-state">
                                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                                            <circle cx="8.5" cy="8.5" r="1.5"/>
                                            <polyline points="21 15 16 10 5 21"/>
                                        </svg>
                                        <p>No photos or videos found</p>
                                        <span>Place files in the Pictures folder or import locally</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <input type="file" id="photos-file-input" accept="image/*,video/*" multiple style="display:none;">
                    </div>
                `;
        },

        initEvents(windowElement) {
        const grid = windowElement.querySelector('#photos-grid');
        const emptyState = windowElement.querySelector('#photos-empty-state');
        const importBtn = windowElement.querySelector('#photos-import-btn');
        const refreshBtn = windowElement.querySelector('#photos-refresh-btn');
        const fileInput = windowElement.querySelector('#photos-file-input');
        const sidebarItems = windowElement.querySelectorAll('.photos-sidebar-item');
        const toolbarTitle = windowElement.querySelector('#photos-toolbar-title');
        const countAll = windowElement.querySelector('#photos-count-all');
        const countImages = windowElement.querySelector('#photos-count-images');
        const countVideos = windowElement.querySelector('#photos-count-videos');

        let library = [];
        let imported = [];
        let currentView = 'all';
        let lightbox = null;
        let lightboxIndex = -1;
        let zoomLevel = 1;
        let isPanning = false;
        let panStart = { x: 0, y: 0 };
        let panOffset = { x: 0, y: 0 };

        const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico', '.tiff', '.tif'];
        const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogg', '.ogv', '.mov', '.avi', '.mkv'];

        const isImageFile = (name) => {
            const ext = '.' + name.split('.').pop().toLowerCase();
            return IMAGE_EXTENSIONS.includes(ext);
        };

        const isVideoFile = (name) => {
            const ext = '.' + name.split('.').pop().toLowerCase();
            return VIDEO_EXTENSIONS.includes(ext);
        };

        const getFilteredItems = () => {
            const all = [...library];
            if (currentView === 'images') return all.filter(i => i.type === 'image');
            if (currentView === 'videos') return all.filter(i => i.type === 'video');
            return all;
        };

        const updateCounts = () => {
            const images = library.filter(i => i.type === 'image').length;
            const videos = library.filter(i => i.type === 'video').length;
            if (countAll) countAll.textContent = library.length;
            if (countImages) countImages.textContent = images;
            if (countVideos) countVideos.textContent = videos;
        };

        const showPhotosToast = (msg, iconSvg = '') => {
            const container = lightbox || windowElement;
            let toast = container.querySelector('.photos-toast');
            if (!toast) {
                toast = document.createElement('div');
                toast.className = 'photos-toast';
                toast.style.cssText = `
                    position: absolute;
                    bottom: 28px;
                    left: 50%;
                    transform: translateX(-50%) translateY(20px);
                    background: rgba(15, 23, 42, 0.95);
                    backdrop-filter: blur(16px);
                    -webkit-backdrop-filter: blur(16px);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.7);
                    color: #f8fafc;
                    padding: 8px 18px;
                    border-radius: 20px;
                    font-size: 12px;
                    font-weight: 500;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    z-index: 10000;
                    opacity: 0;
                    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
                    pointer-events: none;
                `;
                container.appendChild(toast);
            }
            toast.innerHTML = (iconSvg || '') + `<span>${msg}</span>`;
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(-50%) translateY(0)';
            clearTimeout(toast._timer);
            toast._timer = setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(-50%) translateY(20px)';
            }, 2800);
        };

        const wandSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2"><path d="m15 4 5 5-11 11H4v-5L15 4z"/><line x1="12" y1="7" x2="17" y2="12"/></svg>';
        const starSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';

        const processRemoveBackground = async (item) => {
            showPhotosToast('Removing background...', wandSvg);
            try {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                    img.src = item.url;
                });

                const canvas = document.createElement('canvas');
                const w = img.naturalWidth || img.width;
                const h = img.naturalHeight || img.height;
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);

                const imgData = ctx.getImageData(0, 0, w, h);
                const d = imgData.data;

                const samplePts = [
                    [2, 2], [Math.floor(w / 2), 2], [Math.max(0, w - 3), 2],
                    [2, Math.floor(h / 2)], [Math.max(0, w - 3), Math.floor(h / 2)],
                    [2, Math.max(0, h - 3)], [Math.floor(w / 2), Math.max(0, h - 3)], [Math.max(0, w - 3), Math.max(0, h - 3)]
                ];
                const seeds = samplePts.map(([sx, sy]) => {
                    const idx = (sy * w + sx) * 4;
                    return [d[idx], d[idx + 1], d[idx + 2]];
                });

                const tolerance = 44;
                const feather = 18;

                for (let i = 0; i < d.length; i += 4) {
                    const r = d[i], g = d[i + 1], b = d[i + 2];
                    let minDiff = 999999;
                    for (const [sr, sg, sb] of seeds) {
                        const dr = r - sr;
                        const dg = g - sg;
                        const db = b - sb;
                        const dist = Math.sqrt(0.299 * dr * dr + 0.587 * dg * dg + 0.114 * db * db);
                        if (dist < minDiff) minDiff = dist;
                    }
                    if (minDiff < tolerance) {
                        d[i + 3] = 0;
                    } else if (minDiff < tolerance + feather) {
                        const factor = (minDiff - tolerance) / feather;
                        d[i + 3] = Math.round(d[i + 3] * factor);
                    }
                }

                ctx.putImageData(imgData, 0, 0);

                canvas.toBlob(async (blob) => {
                    if (!blob) return;
                    const baseName = item.name.replace(/\.[^/.]+$/, '');
                    const newName = `${baseName}_nobg.png`;
                    const newPath = `/User/Pictures/${newName}`;
                    const newUrl = URL.createObjectURL(blob);

                    if (window.filesystem && window.filesystem.isMounted()) {
                        try {
                            await window.filesystem.writeFile(newPath, blob);
                        } catch (e) {
                            console.warn('Failed to save to VFS', e);
                        }
                    }

                    const newItem = {
                        name: newName,
                        path: newPath,
                        url: newUrl,
                        type: 'image',
                        source: 'processed'
                    };
                    library.unshift(newItem);
                    updateCounts();
                    renderGrid();
                    if (lightbox) {
                        lightboxIndex = 0;
                        showLightboxItem();
                    }
                    showPhotosToast(`Saved transparent: ${newName}`, wandSvg);
                }, 'image/png');
            } catch (err) {
                console.error('BG removal failed:', err);
                showPhotosToast('Failed to process image', wandSvg);
            }
        };

        const processEnhanceImage = async (item) => {
            showPhotosToast('Enhancing image clarity & color...', starSvg);
            try {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                    img.src = item.url;
                });

                const canvas = document.createElement('canvas');
                const w = img.naturalWidth || img.width;
                const h = img.naturalHeight || img.height;
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);

                const srcData = ctx.getImageData(0, 0, w, h);
                const src = srcData.data;
                const outData = ctx.createImageData(w, h);
                const out = outData.data;

                let minLum = 255;
                let maxLum = 0;
                for (let i = 0; i < src.length; i += 16) {
                    const lum = 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2];
                    if (lum < minLum) minLum = lum;
                    if (lum > maxLum) maxLum = lum;
                }
                const lumRange = Math.max(30, maxLum - minLum);

                for (let y = 0; y < h; y++) {
                    for (let x = 0; x < w; x++) {
                        const idx = (y * w + x) * 4;
                        const r = src[idx];
                        const g = src[idx + 1];
                        const b = src[idx + 2];
                        const a = src[idx + 3];

                        if (a === 0) {
                            out[idx + 3] = 0;
                            continue;
                        }

                        let cr = Math.min(255, Math.max(0, ((r - minLum) / lumRange) * 255));
                        let cg = Math.min(255, Math.max(0, ((g - minLum) / lumRange) * 255));
                        let cb = Math.min(255, Math.max(0, ((b - minLum) / lumRange) * 255));

                        const avg = (cr + cg + cb) / 3;
                        cr = Math.min(255, Math.max(0, avg + (cr - avg) * 1.15));
                        cg = Math.min(255, Math.max(0, avg + (cg - avg) * 1.15));
                        cb = Math.min(255, Math.max(0, avg + (cb - avg) * 1.15));

                        if (x > 0 && x < w - 1 && y > 0 && y < h - 1) {
                            const up = idx - w * 4;
                            const down = idx + w * 4;
                            const left = idx - 4;
                            const right = idx + 4;

                            const lapR = cr * 5 - (src[up] + src[down] + src[left] + src[right]);
                            const lapG = cg * 5 - (src[up + 1] + src[down + 1] + src[left + 1] + src[right + 1]);
                            const lapB = cb * 5 - (src[up + 2] + src[down + 2] + src[left + 2] + src[right + 2]);

                            out[idx] = Math.min(255, Math.max(0, cr * 0.7 + lapR * 0.3));
                            out[idx + 1] = Math.min(255, Math.max(0, cg * 0.7 + lapG * 0.3));
                            out[idx + 2] = Math.min(255, Math.max(0, cb * 0.7 + lapB * 0.3));
                        } else {
                            out[idx] = cr;
                            out[idx + 1] = cg;
                            out[idx + 2] = cb;
                        }
                        out[idx + 3] = a;
                    }
                }

                ctx.putImageData(outData, 0, 0);

                canvas.toBlob(async (blob) => {
                    if (!blob) return;
                    const baseName = item.name.replace(/\.[^/.]+$/, '');
                    const newName = `${baseName}_enhanced.png`;
                    const newPath = `/User/Pictures/${newName}`;
                    const newUrl = URL.createObjectURL(blob);

                    if (window.filesystem && window.filesystem.isMounted()) {
                        try {
                            await window.filesystem.writeFile(newPath, blob);
                        } catch (e) {
                            console.warn('Failed to save to VFS', e);
                        }
                    }

                    const newItem = {
                        name: newName,
                        path: newPath,
                        url: newUrl,
                        type: 'image',
                        source: 'processed'
                    };
                    library.unshift(newItem);
                    updateCounts();
                    renderGrid();
                    if (lightbox) {
                        lightboxIndex = 0;
                        showLightboxItem();
                    }
                    showPhotosToast(`Saved enhanced: ${newName}`, starSvg);
                }, 'image/png');
            } catch (err) {
                console.error('Enhancer failed:', err);
                showPhotosToast('Failed to enhance image', starSvg);
            }
        };

        const showImageContextMenu = (e, item) => {
            if (!item) return;
            e.preventDefault();
            e.stopPropagation();

            document.querySelectorAll('.mac-context-menu[data-source="photos"]').forEach(m => m.remove());

            const menu = document.createElement('div');
            menu.className = 'mac-context-menu visible';
            menu.dataset.source = 'photos';

            const createItem = (label, iconSvg, onClick) => {
                const menuItem = document.createElement('div');
                menuItem.className = 'mac-context-menu-item';
                menuItem.style.display = 'flex';
                menuItem.style.alignItems = 'center';
                menuItem.style.gap = '8px';
                menuItem.innerHTML = `${iconSvg}<span>${label}</span>`;
                menuItem.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    menu.remove();
                    onClick();
                });
                return menuItem;
            };
            const createDivider = () => {
                const d = document.createElement('div');
                d.className = 'mac-context-menu-divider';
                return d;
            };

            const downloadItem = async () => {
                try {
                    const a = document.createElement('a');
                    a.href = item.url;
                    a.download = item.name || 'photo';
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    showPhotosToast(`Downloading ${item.name || 'file'}`);
                } catch (err) {
                    showPhotosToast('Download failed');
                }
            };

            const infoItem = async () => {
                let detail = `Name: ${item.name || 'untitled'}\nType: ${item.type || 'unknown'}`;
                try {
                    if (item.path && window.filesystem && window.filesystem.getMetadata) {
                        const meta = await window.filesystem.getMetadata(item.path);
                        if (meta) {
                            const size = window.filesystem.formatBytes ? window.filesystem.formatBytes(meta.size || item.size || 0) : `${meta.size || item.size || 0} bytes`;
                            const mod = meta.modified ? new Date(meta.modified).toLocaleString() : 'unknown';
                            detail += `\nPath: ${item.path}\nSize: ${size}\nModified: ${mod}`;
                        } else if (item.path) {
                            detail += `\nPath: ${item.path}`;
                        }
                    } else if (item.size) {
                        detail += `\nSize: ${item.size} bytes`;
                    }
                } catch {}
                if (window.BrowDialog) await window.BrowDialog.alert('Photo Info', detail);
                else showPhotosToast(item.name || 'photo');
            };

            const setWallpaper = async () => {
                try {
                    const wallpaperEl = document.querySelector('#desktop .wallpaper');
                    if (wallpaperEl && item.url) {
                        wallpaperEl.style.background = `url('${item.url}') center/cover no-repeat`;
                        wallpaperEl.querySelectorAll('.wallpaper-blob, .wallpaper-noise').forEach(b => b.style.display = 'none');
                        try { localStorage.setItem('browos_custom_wallpaper', item.url); } catch {}
                        showPhotosToast('Desktop wallpaper updated');
                    }
                } catch (err) {
                    showPhotosToast('Failed to set wallpaper');
                }
            };

            const openViewer = () => {
                const idx = library.indexOf(item);
                if (idx >= 0) openLightbox(idx);
            };

            menu.appendChild(createItem(item.type === 'video' ? 'Play' : 'Open', '', openViewer));
            menu.appendChild(createDivider());
            if (item.type === 'image') {
                menu.appendChild(createItem('Instant Remove Background', wandSvg, () => processRemoveBackground(item)));
                menu.appendChild(createItem('Enhance Image', starSvg, () => processEnhanceImage(item)));
                menu.appendChild(createDivider());
                menu.appendChild(createItem('Set as Wallpaper', '', setWallpaper));
            }
            menu.appendChild(createItem('Download', '', downloadItem));
            menu.appendChild(createItem('Get Info', '', infoItem));

            document.body.appendChild(menu);

            let left = e.clientX;
            let top = e.clientY;
            const estW = 230, estH = menu.children.length * 28 + 12;
            if (left + estW > window.innerWidth) left -= estW;
            if (top + estH > window.innerHeight) top -= estH;
            menu.style.left = left + 'px';
            menu.style.top = top + 'px';

            const onDocClick = (ev) => {
                if (!menu.contains(ev.target)) {
                    menu.remove();
                    document.removeEventListener('mousedown', onDocClick);
                }
            };
            setTimeout(() => document.addEventListener('mousedown', onDocClick), 50);
        };

        const renderGrid = () => {
            const items = getFilteredItems();
            grid.querySelectorAll('.photos-grid-item').forEach(el => el.remove());

            if (items.length === 0) {
                emptyState.style.display = 'flex';
                return;
            }
            emptyState.style.display = 'none';

            items.forEach((item, idx) => {
                const globalIdx = library.indexOf(item);
                const el = document.createElement('div');
                el.className = 'photos-grid-item';
                if (item.type === 'image') {
                    el.innerHTML = `<img src="${item.url}" alt="${item.name}" loading="lazy">`;
                } else {
                    el.innerHTML = `
                        <video src="${item.url}" muted preload="metadata"></video>
                        <div class="photos-video-badge">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        </div>
                    `;
                }
                el.addEventListener('click', () => openLightbox(globalIdx));
                el.addEventListener('contextmenu', (e) => showImageContextMenu(e, item));
                grid.appendChild(el);
            });
        };

        const openLightbox = (idx) => {
            if (idx < 0 || idx >= library.length) return;
            lightboxIndex = idx;
            zoomLevel = 1;
            panOffset = { x: 0, y: 0 };
            const item = library[idx];

            if (lightbox) lightbox.remove();

            lightbox = document.createElement('div');
            lightbox.className = 'photos-lightbox';
            lightbox.innerHTML = `
                <div class="photos-lightback"></div>
                <div class="photos-lightbox-content">
                    <button class="photos-lightbox-close" id="photos-lb-close">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                    <button class="photos-lightbox-nav photos-lightbox-prev" id="photos-lb-prev">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
                    </button>
                    <div class="photos-lightbox-viewer" id="photos-lb-viewer">
                        <div class="photos-lightbox-zoom-container" id="photos-lb-zoom-container"></div>
                    </div>
                    <button class="photos-lightbox-nav photos-lightbox-next" id="photos-lb-next">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                    <div class="photos-lightbox-toolbar">
                        <button class="photos-zoom-btn" id="photos-zoom-out" title="Zoom Out">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                        </button>
                        <span class="photos-zoom-level" id="photos-zoom-level">100%</span>
                        <button class="photos-zoom-btn" id="photos-zoom-in" title="Zoom In">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                        </button>
                        <button class="photos-zoom-btn" id="photos-zoom-fit" title="Fit to Screen">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
                        </button>
                    </div>
                    <div class="photos-lightbox-info">
                        <span class="photos-lightbox-name" id="photos-lb-name">${item.name}</span>
                        <span class="photos-lightbox-counter">${lightboxIndex + 1} / ${library.length}</span>
                    </div>
                </div>
            `;
            document.body.appendChild(lightbox);

            showLightboxItem();

            lightbox.querySelector('#photos-lb-close').addEventListener('click', closeLightbox);
            lightbox.querySelector('#photos-lb-prev').addEventListener('click', () => navigateLightbox(-1));
            lightbox.querySelector('#photos-lb-next').addEventListener('click', () => navigateLightbox(1));
            lightbox.querySelector('.photos-lightback').addEventListener('click', closeLightbox);

            const zoomInBtn = lightbox.querySelector('#photos-zoom-in');
            const zoomOutBtn = lightbox.querySelector('#photos-zoom-out');
            const zoomFitBtn = lightbox.querySelector('#photos-zoom-fit');
            const zoomContainer = lightbox.querySelector('#photos-lb-zoom-container');
            const viewer = lightbox.querySelector('#photos-lb-viewer');

            zoomInBtn.addEventListener('click', () => applyZoom(zoomLevel + 0.25));
            zoomOutBtn.addEventListener('click', () => applyZoom(zoomLevel - 0.25));
            zoomFitBtn.addEventListener('click', () => { zoomLevel = 1; panOffset = { x: 0, y: 0 }; updateZoom(); });

            viewer.addEventListener('wheel', (e) => {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -0.15 : 0.15;
                applyZoom(zoomLevel + delta);
            }, { passive: false });

            viewer.addEventListener('contextmenu', (e) => {
                const cur = library[lightboxIndex];
                if (cur) {
                    showImageContextMenu(e, cur);
                }
            });

            zoomContainer.addEventListener('mousedown', (e) => {
                if (zoomLevel <= 1) return;
                isPanning = true;
                panStart = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
                zoomContainer.style.cursor = 'grabbing';
                e.preventDefault();
            });

            document.addEventListener('mousemove', (e) => {
                if (!isPanning) return;
                panOffset.x = e.clientX - panStart.x;
                panOffset.y = e.clientY - panStart.y;
                updateZoom();
            });

            document.addEventListener('mouseup', () => {
                if (isPanning) {
                    isPanning = false;
                    zoomContainer.style.cursor = zoomLevel > 1 ? 'grab' : 'default';
                }
            });

            document.addEventListener('keydown', lightboxKeyHandler);
        };

        const applyZoom = (level) => {
            zoomLevel = Math.max(0.25, Math.min(10, level));
            if (zoomLevel <= 1) panOffset = { x: 0, y: 0 };
            updateZoom();
        };

        const updateZoom = () => {
            const zoomContainer = lightbox.querySelector('#photos-lb-zoom-container');
            const zoomLevelEl = lightbox.querySelector('#photos-zoom-level');
            if (!zoomContainer || !zoomLevelEl) return;
            zoomContainer.style.transform = `scale(${zoomLevel}) translate(${panOffset.x}px, ${panOffset.y}px)`;
            zoomLevelEl.textContent = Math.round(zoomLevel * 100) + '%';
            zoomContainer.style.cursor = zoomLevel > 1 ? 'grab' : 'default';
        };

        const showLightboxItem = () => {
            const item = library[lightboxIndex];
            const zoomContainer = lightbox.querySelector('#photos-lb-zoom-container');
            const nameEl = lightbox.querySelector('#photos-lb-name');
            const counterEl = lightbox.querySelector('.photos-lightbox-counter');
            const zoomLevelEl = lightbox.querySelector('#photos-zoom-level');

            zoomLevel = 1;
            panOffset = { x: 0, y: 0 };

            if (item.type === 'image') {
                zoomContainer.innerHTML = `<img src="${item.url}" alt="${item.name}">`;
            } else {
                zoomContainer.innerHTML = `<video src="${item.url}" controls autoplay style="max-width:100%;max-height:100%;"></video>`;
            }
            nameEl.textContent = item.name;
            counterEl.textContent = `${lightboxIndex + 1} / ${library.length}`;
            if (zoomLevelEl) zoomLevelEl.textContent = '100%';
            zoomContainer.style.transform = 'scale(1) translate(0px, 0px)';
            zoomContainer.style.cursor = 'default';
        };

        const navigateLightbox = (dir) => {
            lightboxIndex = (lightboxIndex + dir + library.length) % library.length;
            zoomLevel = 1;
            panOffset = { x: 0, y: 0 };
            showLightboxItem();
        };

        const closeLightbox = () => {
            document.querySelectorAll('.mac-context-menu[data-source="photos"]').forEach(m => m.remove());
            if (lightbox) {
                lightbox.remove();
                lightbox = null;
            }
            document.removeEventListener('keydown', lightboxKeyHandler);
        };

        const lightboxKeyHandler = (e) => {
            if (!lightbox) return;
            if (e.key === 'Escape') closeLightbox();
            if (e.key === 'ArrowLeft') navigateLightbox(-1);
            if (e.key === 'ArrowRight') navigateLightbox(1);
            if (e.key === '+' || e.key === '=') applyZoom(zoomLevel + 0.25);
            if (e.key === '-') applyZoom(zoomLevel - 0.25);
            if (e.key === '0') { zoomLevel = 1; panOffset = { x: 0, y: 0 }; updateZoom(); }
        };

        const loadFromMounted = async () => {
            if (!window.filesystem || !window.filesystem.isMounted()) return;

            const scanFolder = async (folderPath) => {
                const entries = await window.filesystem.list(folderPath);
                if (!entries) return;
                for (const entry of entries) {
                    const fullPath = folderPath + (folderPath.endsWith('/') ? '' : '/') + entry.name;
                    if (entry.type === 'file') {
                        if (isImageFile(entry.name)) {
                            if (library.some(i => i.path === fullPath)) continue;
                            const blob = await window.filesystem.readFileAsBlob(fullPath);
                            if (!blob) continue;
                            library.push({ name: entry.name, path: fullPath, url: URL.createObjectURL(blob), type: 'image', source: 'mounted' });
                        } else if (isVideoFile(entry.name)) {
                            if (library.some(i => i.path === fullPath)) continue;
                            const blob = await window.filesystem.readFileAsBlob(fullPath);
                            if (!blob) continue;
                            library.push({ name: entry.name, path: fullPath, url: URL.createObjectURL(blob), type: 'video', source: 'mounted' });
                        }
                    }
                }
            };

            await scanFolder('Pictures');
            await scanFolder('Desktop');
            updateCounts();
            renderGrid();
        };

        const loadImported = (files) => {
            for (const file of files) {
                if (isImageFile(file.name)) {
                    if (imported.some(i => i.name === file.name && i.size === file.size)) continue;
                    const url = URL.createObjectURL(file);
                    const item = { name: file.name, url, type: 'image', source: 'imported', size: file.size };
                    imported.push(item);
                    library.push(item);
                } else if (isVideoFile(file.name)) {
                    if (imported.some(i => i.name === file.name && i.size === file.size)) continue;
                    const url = URL.createObjectURL(file);
                    const item = { name: file.name, url, type: 'video', source: 'imported', size: file.size };
                    imported.push(item);
                    library.push(item);
                }
            }
            updateCounts();
            renderGrid();
        };

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
                const titles = { all: 'All Photos', images: 'Images', videos: 'Videos', pictures: 'Pictures Folder', desktop: 'Desktop' };
                toolbarTitle.textContent = titles[currentView] || 'All Photos';

                if (currentView === 'pictures' || currentView === 'desktop') {
                    if (!window.filesystem || !window.filesystem.isMounted()) {
                        renderGrid();
                        return;
                    }
                    const folderPath = currentView === 'pictures' ? 'Pictures' : 'Desktop';
                    window.filesystem.list(folderPath).then(async (entries) => {
                        if (!entries) { renderGrid(); return; }
                        const folderItems = [];
                        for (const entry of entries) {
                            const fullPath = folderPath + '/' + entry.name;
                            if (entry.type === 'file' && (isImageFile(entry.name) || isVideoFile(entry.name))) {
                                if (library.some(i => i.path === fullPath)) {
                                    folderItems.push(library.find(i => i.path === fullPath));
                                } else {
                                    const blob = await window.filesystem.readFileAsBlob(fullPath);
                                    if (!blob) continue;
                                    const item = { name: entry.name, path: fullPath, url: URL.createObjectURL(blob), type: isImageFile(entry.name) ? 'image' : 'video', source: 'mounted' };
                                    library.push(item);
                                    folderItems.push(item);
                                }
                            }
                        }
                        grid.querySelectorAll('.photos-grid-item').forEach(el => el.remove());
                        if (folderItems.length === 0) {
                            emptyState.style.display = 'flex';
                            return;
                        }
                        emptyState.style.display = 'none';
                        folderItems.forEach((item) => {
                            const el = document.createElement('div');
                            el.className = 'photos-grid-item';
                            const globalIdx = library.indexOf(item);
                            if (item.type === 'image') {
                                el.innerHTML = `<img src="${item.url}" alt="${item.name}" loading="lazy">`;
                            } else {
                                el.innerHTML = `
                                    <video src="${item.url}" muted preload="metadata"></video>
                                    <div class="photos-video-badge">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                                    </div>
                                `;
                            }
                            el.addEventListener('click', () => openLightbox(globalIdx));
                            el.addEventListener('contextmenu', (e) => showImageContextMenu(e, item));
                            grid.appendChild(el);
                        });
                    });
                } else {
                    renderGrid();
                }
            });
        });

        loadFromMounted();

        windowElement.openFileInPhotos = (item) => {
            if (library.some(i => i.path === item.path)) {
                const idx = library.findIndex(i => i.path === item.path);
                openLightbox(idx);
            } else {
                library.push(item);
                updateCounts();
                renderGrid();
                openLightbox(library.length - 1);
            }
        };

        const cleanup = () => {
            closeLightbox();
            library.forEach(item => { if (item.url) URL.revokeObjectURL(item.url); });
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

    root.BrowAppPhotos = PhotosApp;
    if (root.AppRegistry) {
        root.AppRegistry.register('photos', PhotosApp);
    }
})(typeof window !== 'undefined' ? window : this);
