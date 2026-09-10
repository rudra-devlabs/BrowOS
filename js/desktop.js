// Desktop functionality for BrowOS
class Desktop {
    constructor() {
        this.eventsBound = false;
        this.initializeDesktop();
        this.initializeClock();
        this.initializeDock();
        this.loadDesktopIcons();
        this.initializeWidgets();
        window.desktop = this;
    }

    initializeDesktop() {
        const customUrl = localStorage.getItem('browos_custom_wallpaper');
        const localWallpaper = localStorage.getItem('browos_local_wallpaper');
        const savedWallpaper = localStorage.getItem('browos_wallpaper') || 'sonoma';
        const wallpaperEl = document.querySelector('#desktop .wallpaper');
        const blobs = wallpaperEl.querySelectorAll('.wallpaper-blob, .wallpaper-noise');

        const applyWallpaper = (url) => {
            wallpaperEl.style.background = `url('${url}') center/cover no-repeat`;
            blobs.forEach(b => b.style.display = 'none');
        };

        if (localWallpaper) {
            applyWallpaper(localWallpaper);
        } else if (customUrl) {
            const proxyUrl = (customUrl.startsWith('http') && !customUrl.includes('__proxy__/'))
                ? ('/__proxy__/' + encodeURIComponent(customUrl))
                : customUrl;
            applyWallpaper(proxyUrl);
            fetch(proxyUrl).then(r => r.blob()).then(blob => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    localStorage.setItem('browos_local_wallpaper', e.target.result);
                    localStorage.setItem('browos_custom_wallpaper_url', customUrl);
                    localStorage.removeItem('browos_custom_wallpaper');
                };
                reader.readAsDataURL(blob);
            }).catch(() => {});
        } else {
            applyWallpaper(`assets/wallpapers/${savedWallpaper}.svg`);
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupEventListeners(), { once: true });
        } else {
            this.setupEventListeners();
        }
    }

    setupEventListeners() {
        if (this.eventsBound) return;
        this.eventsBound = true;

        document.querySelector('.apple-menu')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showSystemMenu();
        });

        document.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                this.handleMenuClick(e.target.textContent);
            });
        });

        document.querySelectorAll('.dock-app').forEach(app => {
            app.addEventListener('click', (e) => {
                const appName = e.currentTarget.getAttribute('data-app');
                this.launchApp(appName);
            });
        });

        document.getElementById('desktop').addEventListener('click', (e) => {
            if (e.target.id === 'desktop') {
                this.hideContextMenu();
            }
        });

        document.getElementById('desktop').addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (e.target.closest('#dock') || e.target.closest('.launchpad-overlay') || e.target.closest('.window') || e.target.closest('.desktop-icon')) return;
            this.showDesktopContextMenu(e.clientX, e.clientY);
        });

        document.addEventListener('click', () => this.hideContextMenu());
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.hideContextMenu();
        });

        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                this.updateDesktopSafeArea();
                if (window.filesystem && window.filesystem.isMounted()) {
                    this.refreshDesktopIcons();
                }
            }, 250);
        });
    }

    // ─── Desktop preferences (persisted) ────────────────────────────────────
    _desktopPrefs() {
        return {
            stacks: localStorage.getItem('browos_desktop_stacks') === 'true',
            sortBy: localStorage.getItem('browos_desktop_sort') || 'none',
            iconSize: Number(localStorage.getItem('browos_desktop_icon_size')) || 48,
        };
    }

    _fsReady() {
        return !!(window.filesystem && typeof window.filesystem.isMounted === 'function' && window.filesystem.isMounted());
    }

    _alert(title, message) {
        if (window.BrowDialog && typeof window.BrowDialog.alert === 'function') {
            return window.BrowDialog.alert(title, message);
        }
        alert(`${title}\n\n${message}`);
        return Promise.resolve();
    }

    showDesktopContextMenu(x, y) {
        this.hideContextMenu();

        const prefs = this._desktopPrefs();
        const menu = document.createElement('div');
        menu.id = 'desktop-context-menu';
        menu.className = 'mac-context-menu visible';
        menu.dataset.source = 'desktop';

        const addDivider = () => {
            const div = document.createElement('div');
            div.className = 'mac-context-menu-divider';
            menu.appendChild(div);
        };

        const addItem = (label, action, opts = {}) => {
            const el = document.createElement('div');
            el.className = 'mac-context-menu-item';
            const check = opts.checked ? '✓ ' : opts.uncheckedPad ? '　 ' : '';
            el.innerHTML = `<span>${check}${label}</span>${opts.arrow ? '<span class="submenu-arrow">▸</span>' : ''}`;
            if (opts.disabled) {
                el.style.opacity = '0.5';
                el.style.pointerEvents = 'none';
            }
            if (!opts.submenu) {
                el.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    this.hideContextMenu();
                    this.handleDesktopContextAction(action);
                });
            }
            if (opts.submenu) {
                const sub = document.createElement('div');
                sub.className = 'mac-context-submenu';
                opts.submenu.forEach(subItem => {
                    const s = document.createElement('div');
                    s.className = 'mac-context-menu-item';
                    s.innerHTML = `<span>${subItem.checked ? '✓ ' : ''}${subItem.label}</span>`;
                    s.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        this.hideContextMenu();
                        this.handleDesktopContextAction(subItem.action);
                    });
                    sub.appendChild(s);
                });
                el.appendChild(sub);
            }
            menu.appendChild(el);
            return el;
        };

        addItem('New Folder', 'new-folder');
        addItem('Get Info', 'get-info');
        addDivider();
        addItem('Change Desktop Background…', 'change-wallpaper');
        addItem('Use Stacks', 'stacks', { checked: prefs.stacks });
        addItem('Sort By', 'sort-by', {
            arrow: true,
            submenu: [
                { label: 'None', action: 'sort-none', checked: prefs.sortBy === 'none' },
                { label: 'Name', action: 'sort-name', checked: prefs.sortBy === 'name' },
                { label: 'Kind', action: 'sort-kind', checked: prefs.sortBy === 'kind' },
            ],
        });
        addItem('Clean Up', 'clean-up');
        addItem('Clean Up By', 'clean-up-by', {
            arrow: true,
            submenu: [
                { label: 'Name', action: 'cleanup-name' },
                { label: 'Kind', action: 'cleanup-kind' },
            ],
        });
        addDivider();
        addItem('Edit Widgets', 'edit-widgets');
        addItem('Show View Options', 'view-options');

        document.body.appendChild(menu);

        let left = x;
        let top = y;
        requestAnimationFrame(() => {
            const rect = menu.getBoundingClientRect();
            if (left + rect.width > window.innerWidth) left -= rect.width;
            if (top + rect.height > window.innerHeight) top -= rect.height;
            menu.style.left = left + 'px';
            menu.style.top = top + 'px';
        });
    }

    hideContextMenu() {
        document.querySelector('#desktop-context-menu')?.remove();
        document.querySelector('#system-context-menu')?.remove();
        document.querySelectorAll('.mac-context-menu[data-source="dock"], .mac-context-menu[data-source="launchpad"], .mac-context-menu[data-source="desktop-icon"], .mac-context-menu[data-source="window"]').forEach(m => m.remove());
    }

    async handleDesktopContextAction(action) {
        switch (action) {
            case 'new-folder': {
                if (!this._fsReady()) {
                    await this._alert('New Folder', 'Mount a folder in FileBrow first, then create folders on the Desktop.');
                    if (window.windowManager) window.windowManager.launchApp('filebrow');
                    break;
                }
                const name = window.BrowDialog
                    ? await window.BrowDialog.prompt('New Folder', 'Enter folder name:', 'Untitled Folder')
                    : prompt('Enter folder name:', 'Untitled Folder');
                if (!name || !name.trim()) break;
                const clean = name.trim();
                if (/[\/\\:*?"<>|]/.test(clean)) {
                    await this._alert('Invalid Name', 'Folder names cannot contain / \\ : * ? " < > |');
                    break;
                }
                try {
                    let finalName = clean;
                    let n = 2;
                    while (await window.filesystem.exists(`Desktop/${finalName}`)) {
                        finalName = `${clean} ${n++}`;
                    }
                    const ok = await window.filesystem.createDirectory(`Desktop/${finalName}`);
                    if (ok) this.refreshDesktopIcons();
                    else await this._alert('Error', 'Failed to create folder.');
                } catch (e) {
                    await this._alert('Error', `Failed to create folder: ${e.message || e}`);
                }
                break;
            }
            case 'get-info': {
                let count = 0;
                let used = '';
                try {
                    if (this._fsReady()) {
                        const entries = await window.filesystem.list('Desktop');
                        count = (entries || []).length;
                        if (typeof window.filesystem.getStorageUsed === 'function') {
                            const bytes = await window.filesystem.getStorageUsed();
                            used = window.filesystem.formatBytes
                                ? window.filesystem.formatBytes(bytes)
                                : `${Math.round(bytes / 1024)} KB`;
                        }
                    }
                } catch {}
                const prefs = this._desktopPrefs();
                const wallpaper = localStorage.getItem('browos_wallpaper') || 'sonoma';
                await this._alert(
                    'Desktop Info',
                    `Desktop — ${count} item${count === 1 ? '' : 's'}\nStorage used: ${used || 'unknown'}\nWallpaper: ${wallpaper}\nSort by: ${prefs.sortBy}\nStacks: ${prefs.stacks ? 'On' : 'Off'}`
                );
                break;
            }
            case 'change-wallpaper': {
                if (!window.windowManager) break;
                const win = window.windowManager.launchApp('settings');
                setTimeout(() => {
                    const scope = (win && win.element) || document;
                    const section = scope.querySelector('[data-section="appearance"]');
                    if (section) section.click();
                    else document.querySelector('.window[data-app="settings"] [data-section="appearance"]')?.click();
                }, 350);
                break;
            }
            case 'stacks': {
                const on = localStorage.getItem('browos_desktop_stacks') === 'true';
                localStorage.setItem('browos_desktop_stacks', on ? 'false' : 'true');
                this.refreshDesktopIcons();
                break;
            }
            case 'sort-none':
            case 'sort-name':
            case 'sort-kind': {
                localStorage.setItem('browos_desktop_sort', action.replace('sort-', ''));
                this.refreshDesktopIcons();
                break;
            }
            case 'clean-up':
                this.refreshDesktopIcons();
                break;
            case 'edit-widgets':
                if (window.BrowWidgets) window.BrowWidgets.openGallery(true);
                break;
            case 'cleanup-name':
                localStorage.setItem('browos_desktop_sort', 'name');
                this.refreshDesktopIcons();
                break;
            case 'cleanup-kind':
                localStorage.setItem('browos_desktop_sort', 'kind');
                this.refreshDesktopIcons();
                break;
            case 'view-options':
                this.showDesktopViewOptions();
                break;
        }
    }

    showDesktopViewOptions() {
        document.querySelector('.desktop-view-options')?.remove();
        const prefs = this._desktopPrefs();
        const panel = document.createElement('div');
        panel.className = 'desktop-view-options';
        panel.innerHTML = `
            <div class="desktop-view-title">Desktop View Options</div>
            <label><b>Icon size: <span id="desktop-icon-size-val">${prefs.iconSize}px</span></b>
                <input type="range" id="desktop-icon-size" min="32" max="72" step="2" value="${prefs.iconSize}">
            </label>
            <label class="desktop-view-check"><input type="checkbox" id="desktop-stacks-check" ${prefs.stacks ? 'checked' : ''}> Use Stacks</label>
            <label><b>Sort by</b>
                <select id="desktop-sort-select" style="background:#1c1c1e;color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:6px;">
                    <option value="none"${prefs.sortBy === 'none' ? ' selected' : ''}>None</option>
                    <option value="name"${prefs.sortBy === 'name' ? ' selected' : ''}>Name</option>
                    <option value="kind"${prefs.sortBy === 'kind' ? ' selected' : ''}>Kind</option>
                </select>
            </label>
            <button class="desktop-view-close">Close</button>
        `;
        document.body.appendChild(panel);
        const sizeInput = panel.querySelector('#desktop-icon-size');
        const sizeVal = panel.querySelector('#desktop-icon-size-val');
        sizeInput.addEventListener('input', () => {
            sizeVal.textContent = `${sizeInput.value}px`;
            localStorage.setItem('browos_desktop_icon_size', sizeInput.value);
            this._applyDesktopIconSize(Number(sizeInput.value));
        });
        panel.querySelector('#desktop-stacks-check').addEventListener('change', (e) => {
            localStorage.setItem('browos_desktop_stacks', e.target.checked ? 'true' : 'false');
            this.refreshDesktopIcons();
        });
        panel.querySelector('#desktop-sort-select').addEventListener('change', (e) => {
            localStorage.setItem('browos_desktop_sort', e.target.value);
            this.refreshDesktopIcons();
        });
        panel.querySelector('.desktop-view-close').addEventListener('click', () => panel.remove());
        setTimeout(() => {
            const dismiss = (e) => {
                if (!panel.contains(e.target)) { panel.remove(); document.removeEventListener('mousedown', dismiss); }
            };
            document.addEventListener('mousedown', dismiss);
        }, 50);
    }

    _applyDesktopIconSize(px) {
        document.querySelectorAll('.desktop-icon img').forEach(img => {
            img.style.width = `${px}px`;
            img.style.height = `${px}px`;
        });
    }

    _sortDesktopEntries(entries) {
        const mode = localStorage.getItem('browos_desktop_sort') || 'none';
        const arr = [...(entries || [])];
        const isDir = (e) => e.kind === 'directory' || e.type === 'directory';
        const extOf = (n) => (n.includes('.') ? n.split('.').pop().toLowerCase() : '');
        if (mode === 'name') arr.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
        else if (mode === 'kind') arr.sort((a, b) => {
            const ad = isDir(a) ? 0 : 1, bd = isDir(b) ? 0 : 1;
            if (ad !== bd) return ad - bd;
            const ae = extOf(a.name), be = extOf(b.name);
            if (ae !== be) return ae.localeCompare(be);
            return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        });
        return arr;
    }

    _stackGroupFor(entry) {
        const isDir = entry.kind === 'directory' || entry.type === 'directory';
        if (isDir) return 'Folders';
        const ext = entry.name.split('.').pop().toLowerCase();
        if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'mp4', 'webm'].includes(ext)) return 'Images';
        if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return 'Music';
        if (['txt', 'md', 'pdf', 'doc', 'docx'].includes(ext)) return 'Documents';
        return 'Other';
    }

    initializeClock() {
        if (window.BrowClock) {
            window.BrowClock.init();
            return;
        }
        this.updateClock();
        setInterval(() => this.updateClock(), 1000);
    }

    updateClock() {
        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const el = document.getElementById('clock');
        if (el) el.textContent = `${hours}:${minutes}`;
    }

    initializeDock() {
        this.syncDockFromStorage();
        const dock = document.getElementById('dock');
        const dockApps = dock?.querySelector('.dock-apps');
        if (dock && dockApps) {
            this.setDockPosition(localStorage.getItem('browos_dock_position') || 'bottom', false);
            this.setupDockMagnification(dock, dockApps);
        }
        this.setupDockAutoHide(dock);
        this.setupDockPositionDrag(dock);
        const dockItems = document.querySelectorAll('.dock-app');
        // Ensure taskbar labels exist on all permanent dock items
        dockItems.forEach(el => this._ensureTaskbarLabel(el));
        this.setupDockDrag();
        this.setupDockContextMenu();
        this.setupLaunchpadListeners();
        this.updateDesktopSafeArea();
    }

    getDockPosition() {
        const position = localStorage.getItem('browos_dock_position');
        return ['bottom', 'left', 'right'].includes(position) ? position : 'bottom';
    }

    setDockPosition(position = 'bottom', persist = true) {
        const dock = document.getElementById('dock');
        if (!dock) return;
        const next = ['bottom', 'left', 'right'].includes(position) ? position : 'bottom';
        dock.classList.remove('dock-bottom', 'dock-left', 'dock-right');
        dock.classList.add(`dock-${next}`);
        dock.dataset.position = next;
        if (persist) localStorage.setItem('browos_dock_position', next);
        this.dockFit?.();
        this.updateDesktopSafeArea();
    }

    // ─── Desktop safe area (keeps icons/widgets clear of side docks) ──────────

    /** True when the dock is slid off-screen (auto-hide / fullscreen hide). */
    _dockIsHidden(dock) {
        return dock.classList.contains('dock-auto-hidden')
            || dock.classList.contains('hidden-maximized');
    }

    /**
     * Horizontal space (px) the dock currently occupies on each side.
     * Zero when docked at the bottom or when hidden off-screen (a peeking
     * auto-hide dock briefly overlays content, like native macOS).
     */
    getDockReserves() {
        const dock = document.getElementById('dock');
        if (!dock) return { left: 0, right: 0 };
        const pos = dock.dataset.position || this.getDockPosition() || 'bottom';
        if (pos !== 'left' && pos !== 'right') return { left: 0, right: 0 };
        if (this._dockIsHidden(dock)) return { left: 0, right: 0 };
        // 16px screen-edge offset + 8px breathing room next to the dock pill.
        const reserve = Math.ceil((dock.offsetWidth || 76) + 24);
        return pos === 'left' ? { left: reserve, right: 0 } : { left: 0, right: reserve };
    }

    /**
     * Publish reserves as CSS vars on #desktop (drives the widgets column)
     * and re-layout icons when the occupied space actually changed.
     */
    updateDesktopSafeArea() {
        const desktopEl = document.getElementById('desktop');
        const dock = document.getElementById('dock');
        if (!desktopEl || !dock) return;
        const { left, right } = this.getDockReserves();
        desktopEl.style.setProperty('--dock-reserve-left', `${left}px`);
        desktopEl.style.setProperty('--dock-reserve-right', `${right}px`);
        const key = `${dock.dataset.position || 'bottom'}:${left}:${right}`;
        if (this._lastDockSafeKey !== key) {
            this._lastDockSafeKey = key;
            // Icons read the reserves when they lay out; skip the extra pass
            // before the filesystem is mounted (initial load covers it).
            if (this._fsReady()) this.refreshDesktopIcons();
        }
    }

    setupDockPositionDrag(dock) {
        if (!dock || dock.dataset.positionDragBound === 'true') return;
        dock.dataset.positionDragBound = 'true';

        let pointerId = null;
        let startX = 0;
        let startY = 0;
        let dragging = false;
        let mouseActive = false;
        let mouseDragging = false;

        const snapToEdge = (clientX) => {
            const edge = clientX < window.innerWidth * 0.25
                ? 'left'
                : clientX > window.innerWidth * 0.75
                    ? 'right'
                    : 'bottom';
            this.setDockPosition(edge);
        };

        dock.addEventListener('pointerdown', (event) => {
            if (event.pointerType === 'touch' || event.button !== 0 || event.target.closest('.dock-app')) return;
            pointerId = event.pointerId;
            startX = event.clientX;
            startY = event.clientY;
            dragging = false;
            dock.setPointerCapture?.(pointerId);
        });

        dock.addEventListener('pointermove', (event) => {
            if (event.pointerId !== pointerId) return;
            const distance = Math.hypot(event.clientX - startX, event.clientY - startY);
            if (!dragging && distance < 8) return;
            dragging = true;
            dock.classList.add('dock-position-dragging');
            event.preventDefault();
        });

        const finish = (event) => {
            if (event.pointerId !== pointerId) return;
            if (dragging) {
                snapToEdge(event.clientX);
            }
            dock.classList.remove('dock-position-dragging');
            dock.releasePointerCapture?.(pointerId);
            pointerId = null;
            dragging = false;
        };

        dock.addEventListener('pointerup', finish);
        dock.addEventListener('pointercancel', finish);

        // Mouse fallback keeps dock repositioning reliable in browsers that do
        // not expose pointer events for a captured glass surface.
        dock.addEventListener('mousedown', (event) => {
            if (event.button !== 0 || event.target.closest('.dock-app')) return;
            mouseActive = true;
            mouseDragging = false;
            startX = event.clientX;
            startY = event.clientY;
        });
        window.addEventListener('mousemove', (event) => {
            if (!mouseActive) return;
            const distance = Math.hypot(event.clientX - startX, event.clientY - startY);
            if (!mouseDragging && distance < 8) return;
            mouseDragging = true;
            dock.classList.add('dock-position-dragging');
            event.preventDefault();
        });
        window.addEventListener('mouseup', (event) => {
            if (!mouseActive) return;
            if (mouseDragging) snapToEdge(event.clientX);
            mouseActive = false;
            mouseDragging = false;
            dock.classList.remove('dock-position-dragging');
        });
    }

    setupDockAutoHide(dock) {
        if (!dock || dock.dataset.autoHideBound === 'true') return;
        dock.dataset.autoHideBound = 'true';

        let hideTimer = null;
        let peekTimer = null;
        let pointerInsideDock = false;

        const isEnabled = () => localStorage.getItem('browos_dock_autohide') === 'true';
        const hasMaximizedWindow = () => Boolean(
            window.windowManager?.windows?.some(w => w.isMaximized && !w.isMinimized && !(w.element && w.element.classList.contains('space-hidden')))
        );
        const canAutoHide = () => isEnabled() && hasMaximizedWindow();
        const clearTimers = () => {
            if (hideTimer) clearTimeout(hideTimer);
            if (peekTimer) clearTimeout(peekTimer);
            hideTimer = null;
            peekTimer = null;
        };
        const hide = () => {
            clearTimers();
            if (!canAutoHide() || pointerInsideDock) return;
            dock.classList.remove('dock-peek');
            dock.classList.add('dock-auto-hidden');
            this.updateDesktopSafeArea();
        };
        const scheduleHide = (delay = 420) => {
            clearTimers();
            if (!canAutoHide() || pointerInsideDock) return;
            hideTimer = setTimeout(hide, delay);
        };
        const show = () => {
            clearTimers();
            dock.classList.remove('dock-auto-hidden');
            dock.classList.add('dock-peek');
            // Transient peek overlays content (native macOS behavior) — no relayout.
            peekTimer = setTimeout(() => dock.classList.remove('dock-peek'), 320);
        };
        const sync = () => {
            clearTimers();
            if (canAutoHide()) scheduleHide(180);
            else dock.classList.remove('dock-auto-hidden', 'dock-peek');
            this.updateDesktopSafeArea();
        };

        dock.addEventListener('pointerenter', () => {
            pointerInsideDock = true;
            if (canAutoHide()) show();
        });
        dock.addEventListener('pointerleave', () => {
            pointerInsideDock = false;
            scheduleHide();
        });
        document.addEventListener('pointermove', (event) => {
            if (!canAutoHide() || event.pointerType === 'touch') return;
            const edgeThreshold = Math.max(8, Math.min(24, window.innerHeight * 0.025));
            const position = dock.dataset.position || 'bottom';
            const atRevealEdge = position === 'left'
                ? event.clientX <= edgeThreshold
                : position === 'right'
                    ? event.clientX >= window.innerWidth - edgeThreshold
                    : event.clientY >= window.innerHeight - edgeThreshold;
            if (atRevealEdge) show();
            else if (!pointerInsideDock && !dock.matches(':hover')) scheduleHide(520);
        }, { passive: true });
        window.addEventListener('resize', sync, { passive: true });
        this.dockAutoHideSync = sync;
        sync();
    }

    setupDockMagnification(dock, dockApps) {
        if (dock.dataset.magnificationBound === 'true') return;
        dock.dataset.magnificationBound = 'true';

        const states = new Map();
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        let pointerX = null;
        let pointerY = null;
        let frame = null;

        const getState = (item) => {
            if (!states.has(item)) states.set(item, { scale: 1, x: 0, y: 0, scaleVelocity: 0, xVelocity: 0, yVelocity: 0 });
            return states.get(item);
        };

        const fitDock = () => {
            const count = dockApps.querySelectorAll('.dock-app:not(.dock-placeholder)').length || 1;
            const position = dock.dataset.position || 'bottom';
            const vertical = position !== 'bottom';
            const compact = (vertical ? window.innerHeight : window.innerWidth) <= 600;
            const gap = compact ? 3 : 6;
            const padding = compact ? 16 : 24;
            const available = Math.max(220, (vertical ? window.innerHeight : window.innerWidth) - 24);
            const preferredSize = Number(localStorage.getItem('browos_dock_size')) || 50;
            const maxIcon = Math.max(30, Math.min(80, preferredSize));
            const minIcon = 30;
            const fitted = Math.floor((available - padding - gap * (count - 1)) / count);
            const iconSize = Math.max(minIcon, Math.min(maxIcon, fitted));
            const overflow = count * iconSize + gap * Math.max(0, count - 1) + padding > available;
            dock.style.setProperty('--dock-icon-size', `${iconSize}px`);
            dock.style.setProperty('--dock-gap', `${gap}px`);
            if (vertical) {
                dockApps.style.maxHeight = `${Math.max(180, available)}px`;
                dockApps.style.maxWidth = '';
                dockApps.style.overflowY = overflow ? 'auto' : 'visible';
                dockApps.style.overflowX = 'visible';
            } else {
                dockApps.style.maxWidth = `${Math.max(220, available)}px`;
                dockApps.style.maxHeight = '';
                dockApps.style.overflowX = overflow ? 'auto' : 'visible';
                dockApps.style.overflowY = 'visible';
            }
            this.updateDesktopSafeArea();
        };
        this.dockFit = fitDock;

        const targets = () => {
            if (window.BrowSettings && !window.BrowSettings.get('dockMagnification')) {
                return [...dockApps.querySelectorAll('.dock-app:not(.dock-placeholder)')]
                    .map(item => ({ item, scale: 1, x: 0, y: 0 }));
            }
            const items = [...dockApps.querySelectorAll('.dock-app:not(.dock-placeholder)')];
            const containerRect = dockApps.getBoundingClientRect();
            const iconSize = parseFloat(getComputedStyle(dock).getPropertyValue('--dock-icon-size')) || 50;
            const influence = iconSize * 2.35;
            const vertical = (dock.dataset.position || 'bottom') !== 'bottom';
            const pointerCoord = vertical ? pointerY : pointerX;
            return items.map(item => {
                if (pointerCoord === null || this.isDraggingDockItem) {
                    return { item, scale: 1, x: 0, y: 0 };
                }
                const center = vertical
                    ? containerRect.top + item.offsetTop + item.offsetHeight / 2
                    : containerRect.left + item.offsetLeft + item.offsetWidth / 2;
                const signedDistance = center - pointerCoord;
                const distance = Math.abs(signedDistance);
                const wave = distance >= influence ? 0 : (1 + Math.cos(Math.PI * distance / influence)) / 2;
                const scale = 1 + 0.52 * wave;
                const direction = signedDistance === 0 ? 0 : Math.sign(signedDistance);
                const offset = direction * iconSize * 0.22 * wave;
                return { item, scale, x: vertical ? 0 : offset, y: vertical ? offset : 0 };
            });
        };

        const animate = () => {
            frame = null;
            let moving = false;
            targets().forEach(({ item, scale: targetScale, x: targetX, y: targetY }) => {
                const state = getState(item);
                if (reducedMotion.matches) {
                    state.scale = targetScale;
                    state.x = targetX;
                    state.y = targetY;
                    state.scaleVelocity = 0;
                    state.xVelocity = 0;
                    state.yVelocity = 0;
                } else {
                    state.scaleVelocity = (state.scaleVelocity + (targetScale - state.scale) * 0.2) * 0.7;
                    state.xVelocity = (state.xVelocity + (targetX - state.x) * 0.2) * 0.7;
                    state.yVelocity = (state.yVelocity + (targetY - state.y) * 0.2) * 0.7;
                    state.scale += state.scaleVelocity;
                    state.x += state.xVelocity;
                    state.y += state.yVelocity;
                }
                if (Math.abs(targetScale - state.scale) < 0.001 && Math.abs(state.scaleVelocity) < 0.001) {
                    state.scale = targetScale;
                    state.scaleVelocity = 0;
                } else moving = true;
                if (Math.abs(targetX - state.x) < 0.05 && Math.abs(state.xVelocity) < 0.05) {
                    state.x = targetX;
                    state.xVelocity = 0;
                } else moving = true;
                if (Math.abs(targetY - state.y) < 0.05 && Math.abs(state.yVelocity) < 0.05) {
                    state.y = targetY;
                    state.yVelocity = 0;
                } else moving = true;
                item.style.transform = `translate3d(${state.x.toFixed(2)}px, ${state.y.toFixed(2)}px, 0) scale(${state.scale.toFixed(4)})`;
            });
            if (moving) frame = requestAnimationFrame(animate);
        };

        const tick = () => { if (frame === null) frame = requestAnimationFrame(animate); };
        const tickIfEnabled = () => {
            if (window.BrowSettings && !window.BrowSettings.get('dockMagnification')) return;
            tick();
        };

        dock.addEventListener('pointermove', event => {
            if (event.pointerType === 'touch') return;
            pointerX = event.clientX;
            pointerY = event.clientY;
            tickIfEnabled();
        });
        dock.addEventListener('pointerleave', () => {
            pointerX = null;
            pointerY = null;
            tick();
        });
        window.addEventListener('resize', fitDock, { passive: true });
        new MutationObserver(() => {
            states.forEach((_, item) => { if (!item.isConnected) states.delete(item); });
            fitDock();
            tick();
        }).observe(dockApps, { childList: true });
        fitDock();
    }

    // ─── Dock helpers ──────────────────────────────────────────────────────────

    /** Inject a hidden <span class="taskbar-label"> into a dock-app element if absent. */
    _ensureTaskbarLabel(el) {
        if (!el.querySelector('.taskbar-label')) {
            const label = document.createElement('span');
            label.className = 'taskbar-label';
            label.textContent = el.dataset.title || el.querySelector('img')?.alt || '';
            el.appendChild(label);
        }
    }

    /**
     * Called by WindowManager whenever the maximized / minimized / close state changes.
     * Keeps the floating dock stable while updating running indicators and menu-bar state.
     */
    updateTaskbar() {
        const dock = document.getElementById('dock');
        const dockAppsContainer = dock?.querySelector('.dock-apps');
        if (!dock || !dockAppsContainer) return;

        const wm = window.windowManager;
        if (!wm) return;

        // Update is-open class for all dock apps based on whether they have any windows open
        dockAppsContainer.querySelectorAll('.dock-app').forEach(el => {
            const appKey = el.dataset.app;
            if (appKey === 'launchpad') return;
            const isOpen = wm.windows.some(w => w.appName === appKey);
            el.classList.toggle('is-open', !!isOpen);
        });

        const maximizedWindows = wm.windows.filter(w => w.isMaximized && !w.isMinimized && !(w.element && w.element.classList.contains('space-hidden')));
        const hasMaximized = maximizedWindows.length > 0;

        // Smoothly hide/show upper status menu-bar
        const menuBar = document.getElementById('menu-bar');
        if (menuBar) {
            menuBar.classList.toggle('hidden-maximized', hasMaximized);
        }

        // Maximizing a window no longer morphs the dock into a taskbar. Keep the
        // pinned floating dock intact and only update its open-state indicators.
        dockAppsContainer.querySelectorAll('.dock-app').forEach(el => {
            el.classList.remove('taskbar-active');
        });
        dock.classList.remove('taskbar-mode');
        dockAppsContainer.querySelectorAll('.dock-app[data-taskbar-ephemeral]').forEach(el => el.remove());
        if (this.dockAutoHideSync) this.dockAutoHideSync();
    }

    /**
     * Click on a taskbar button:
     * – If window is open → bring to front.
     * – If minimised → restore.
     * – If pinned with no window → launch.
     */
    _taskbarAppClick(appKey, _buttonEl) {
        if (appKey === 'launchpad') {
            const overlay = document.getElementById('launchpad-overlay');
            this.toggleLaunchpad(!overlay.classList.contains('visible'));
            return;
        }

        const wm = window.windowManager;
        if (!wm) return;

        // Find an open (non-minimised) window for this app
        const openWin = wm.windows.find(w => w.appName === appKey && !w.isMinimized);
        if (openWin) {
            // focusWindow jumps to the window's desktop when needed.
            if (window.BrowSpaces) window.BrowSpaces.focusWindow(openWin);
            else wm.bringToFront(openWin.element);
            this.updateTaskbar();
            return;
        }

        // Find a minimised window and restore it
        const minWin = wm.windows.find(w => w.appName === appKey && w.isMinimized);
        if (minWin) {
            if (window.BrowSpaces) window.BrowSpaces.focusWindow(minWin);
            else wm.restoreWindow(minWin.element, minWin);
            return;
        }

        // No window open — launch (pinned apps only; ephemeral buttons disappear when closed)
        this.launchApp(appKey);
    }

    // ─── Dock drag & drop ──────────────────────────────────────────────────────

    setupDockDrag() {
        const dockContainer = document.querySelector('.dock-apps');
        if (!dockContainer) return;
        this.setupPointerReorder(dockContainer, '.dock-app', () => this.saveDockOrder(), true);
    }

    /**
     * Reorders items with pointer events so the dragged item stays attached to
     * the pointer and never hands control to the browser's native drag ghost.
     * The same interaction is used by the dock and Launchpad grid.
     */
    setupPointerReorder(container, selector, onDrop, isDock = false) {
        if (!container || container.dataset.pointerReorderBound === 'true') return;
        container.dataset.pointerReorderBound = 'true';

        let session = null;
        let frame = null;
        let suppressClickUntil = 0;

        const getItem = (target) => target?.closest(selector);
        const getItems = () => [...container.querySelectorAll(selector)]
            .filter(item => item !== session?.item && !item.classList.contains('hidden'));

        const scheduleMove = () => {
            if (frame !== null) return;
            frame = requestAnimationFrame(() => {
                frame = null;
                if (!session?.dragging) return;

                const { item, placeholder, pointerX, pointerY } = session;
                item.style.setProperty('transform', `translate3d(${pointerX - session.startX}px, ${pointerY - session.startY}px, 0)`, 'important');

                const items = getItems();
                let target = null;
                let insertBefore = true;
                const verticalDock = isDock && (document.getElementById('dock')?.dataset.position || 'bottom') !== 'bottom';

                for (const candidate of items) {
                    const rect = candidate.getBoundingClientRect();
                    if (isDock) {
                        const center = verticalDock
                            ? rect.top + rect.height / 2
                            : rect.left + rect.width / 2;
                        const coordinate = verticalDock ? pointerY : pointerX;
                        if (coordinate < center) {
                            target = candidate;
                            insertBefore = true;
                            break;
                        }
                    } else {
                        const rowCenter = rect.top + rect.height / 2;
                        if (pointerY < rowCenter || (pointerY <= rect.bottom && pointerX < rect.left + rect.width / 2)) {
                            target = candidate;
                            insertBefore = true;
                            break;
                        }
                    }
                }

                if (!target && items.length) {
                    target = items[items.length - 1];
                    insertBefore = false;
                }

                if (target) {
                    const nextSibling = insertBefore ? target : target.nextSibling;
                    if (placeholder !== nextSibling && placeholder !== target) {
                        if (insertBefore) target.before(placeholder);
                        else target.after(placeholder);
                    }
                } else if (placeholder !== container.lastElementChild) {
                    container.appendChild(placeholder);
                }
            });
        };

        const finish = (event, cancelled = false) => {
            if (!session || event.pointerId !== session.pointerId) return;
            if (frame !== null) {
                cancelAnimationFrame(frame);
                frame = null;
            }

            const { item, placeholder, originalClassName, originalStyle } = session;
            if (session.dragging) {
                if (!cancelled && placeholder.parentNode === container) {
                    placeholder.before(item);
                } else if (placeholder.parentNode === container) {
                    placeholder.replaceWith(item);
                }
                placeholder.remove();
                item.className = originalClassName;
                item.style.cssText = originalStyle;
                suppressClickUntil = performance.now() + 280;
                onDrop?.();
            }

            item.releasePointerCapture?.(session.pointerId);
            session = null;
            if (isDock) {
                this.isDraggingDockItem = false;
                this.dockFit?.();
            }
        };

        container.addEventListener('pointerdown', (event) => {
            if (event.button !== 0 || !event.isPrimary) return;
            const item = getItem(event.target);
            if (!item || !container.contains(item) || item.classList.contains('hidden')) return;

            const rect = item.getBoundingClientRect();
            session = {
                item,
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                pointerX: event.clientX,
                pointerY: event.clientY,
                offsetX: event.clientX - rect.left,
                offsetY: event.clientY - rect.top,
                rect,
                dragging: false,
            };
            item.setPointerCapture?.(event.pointerId);
        });

        const handleMove = (event) => {
            if (!session || event.pointerId !== session.pointerId) return;
            session.pointerX = event.clientX;
            session.pointerY = event.clientY;
            const distance = Math.hypot(event.clientX - session.startX, event.clientY - session.startY);

            if (!session.dragging && distance < 7) return;
            if (!session.dragging) {
                session.dragging = true;
                session.originalClassName = session.item.className;
                session.originalStyle = session.item.style.cssText;
                session.placeholder = session.item.cloneNode(true);
                session.placeholder.classList.add('pointer-drag-placeholder');
                session.placeholder.setAttribute('aria-hidden', 'true');
                session.placeholder.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
                session.placeholder.style.cssText = '';
                session.item.classList.add('is-pointer-dragging');
                session.item.style.width = `${session.rect.width}px`;
                session.item.style.height = `${session.rect.height}px`;
                session.item.style.left = `${session.rect.left}px`;
                session.item.style.top = `${session.rect.top}px`;
                session.item.style.setProperty('transform', 'translate3d(0, 0, 0)', 'important');
                session.item.style.setProperty('position', 'fixed', 'important');
                session.item.style.setProperty('z-index', '100001', 'important');
                session.item.style.setProperty('pointer-events', 'none', 'important');
                session.item.style.setProperty('transition', 'none', 'important');
                session.item.style.setProperty('opacity', '0.96', 'important');
                session.item.before(session.placeholder);
                document.body.appendChild(session.item);
                if (isDock) this.isDraggingDockItem = true;
            }
            event.preventDefault();
            scheduleMove();
        };

        container.addEventListener('pointermove', handleMove, { passive: false });
        window.addEventListener('pointermove', handleMove, { passive: false });

        container.addEventListener('pointerup', event => finish(event));
        container.addEventListener('pointercancel', event => finish(event, true));
        container.addEventListener('click', event => {
            if (suppressClickUntil > performance.now() && getItem(event.target)) {
                event.preventDefault();
                event.stopImmediatePropagation();
            }
        }, true);

        window.addEventListener('pointerup', event => finish(event));
        window.addEventListener('pointercancel', event => finish(event, true));
    }

    saveDockOrder() {
        const dockContainer = document.querySelector('.dock-apps');
        if (!dockContainer) return;
        const order = [...dockContainer.querySelectorAll('.dock-app:not([data-taskbar-ephemeral])')].map(el => el.dataset.app);
        this.saveDockApps(order);
    }

    getDockApps() {
        try {
            const saved = localStorage.getItem('browos_dock_apps');
            if (saved) {
                return JSON.parse(saved).map((key) => (key === 'finder' ? 'filebrow' : key));
            }
        } catch (e) {}
        return ['filebrow', 'messages', 'launchpad', 'settings', 'terminal', 'brownote'];
    }

    saveDockApps(apps) {
        localStorage.setItem('browos_dock_apps', JSON.stringify(apps));
    }

    syncDockFromStorage() {
        const dockContainer = document.querySelector('.dock-apps');
        if (!dockContainer) return;
        const savedApps = this.getDockApps();
        const allApps = window.appsManager ? window.appsManager.getAllApps() : {};
        const existingKeys = new Set();

        savedApps.forEach(key => {
            if (key !== 'launchpad' && !allApps[key]) return;
            existingKeys.add(key);

            let el = dockContainer.querySelector(`.dock-app[data-app="${key}"]`);
            if (!el) {
                if (key === 'launchpad') return;
                const app = allApps[key];
                el = document.createElement('div');
                el.className = 'dock-app';
                el.dataset.app = key;
                el.dataset.title = app.name;
                el.innerHTML = `<img src="${app.icon}" alt="${app.name}"><div class="minimized-dot"></div>`;
                el.addEventListener('click', () => this.launchApp(key));
            }
            dockContainer.appendChild(el);
        });

        dockContainer.querySelectorAll('.dock-app').forEach(el => {
            const key = el.dataset.app;
            if (key !== 'launchpad' && !existingKeys.has(key)) {
                el.remove();
            }
        });
    }

    // ─── Dock context menu ─────────────────────────────────────────────────────

    setupDockContextMenu() {
        // Delegated: works for pinned + dynamically added icons without duplicates.
        const container = document.querySelector('.dock-apps') || document.getElementById('dock');
        if (!container || container.dataset.ctxBound === 'true') return;
        container.dataset.ctxBound = 'true';
        container.addEventListener('contextmenu', (e) => {
            const app = e.target.closest('.dock-app');
            if (!app || !container.contains(app)) return;
            e.preventDefault();
            e.stopPropagation();
            const appName = app.dataset.app;
            if (!appName || appName === 'launchpad') return;
            this.hideContextMenu();
            this.showDockContextMenu(e.clientX, e.clientY, appName, app);
        });
    }

    showDockContextMenu(x, y, appName, appEl) {
        const menu = document.createElement('div');
        menu.className = 'mac-context-menu visible';
        menu.dataset.source = 'dock';

        const isOpen = !!(window.windowManager && window.windowManager.windows.some(w => w.appName === appName));
        const mk = (label, fn, disabled = false) => {
            const el = document.createElement('div');
            el.className = 'mac-context-menu-item';
            el.textContent = label;
            if (disabled) { el.style.opacity = '0.5'; el.style.pointerEvents = 'none'; }
            else el.addEventListener('click', () => { this.hideContextMenu(); fn(); });
            menu.appendChild(el);
        };
        const div = () => {
            const d = document.createElement('div');
            d.className = 'mac-context-menu-divider';
            menu.appendChild(d);
        };

        mk('Open', () => this._taskbarAppClick(appName, appEl));
        mk('Quit', () => {
            if (!window.windowManager) return;
            // closeWindow() removes the window + updates the taskbar itself (async).
            window.windowManager.windows
                .filter(w => w.appName === appName)
                .forEach(w => {
                    try {
                        if (typeof window.windowManager.closeWindow === 'function') window.windowManager.closeWindow(w.element, w);
                        else w.element.remove();
                    } catch {}
                });
            this.updateTaskbar();
        }, !isOpen);
        div();
        mk('Show in Launchpad', () => this.toggleLaunchpad(true));
        mk('Remove from Dock', () => this.removeFromDock(appName, appEl));

        document.body.appendChild(menu);

        let left = x;
        let top = y;
        requestAnimationFrame(() => {
            const rect = menu.getBoundingClientRect();
            if (left + rect.width > window.innerWidth) left -= rect.width;
            if (top + rect.height > window.innerHeight) top -= rect.height;
            menu.style.left = left + 'px';
            menu.style.top = top + 'px';
        });
    }

    removeFromDock(appName, appEl) {
        if (appEl) {
            appEl.style.transition = 'all 0.2s ease';
            appEl.style.transform = 'scale(0)';
            appEl.style.opacity = '0';
            setTimeout(() => { appEl.remove(); this.updateDesktopSafeArea(); }, 200);
        }
        const apps = this.getDockApps().filter(a => a !== appName);
        this.saveDockApps(apps);
        this.updateDesktopSafeArea();
    }

    addToDock(appName) {
        const apps = this.getDockApps();
        if (apps.includes(appName)) return;
        apps.push(appName);
        this.saveDockApps(apps);
        this.syncDockFromStorage();
        this.setupDockDrag();
        this.setupDockContextMenu();
        this.updateDesktopSafeArea();
    }

    // ─── Launchpad ─────────────────────────────────────────────────────────────

    setupLaunchpadListeners() {
        const overlay = document.getElementById('launchpad-overlay');
        const searchInput = document.getElementById('launchpad-search-input');
        if (!overlay) return;

        this.setupPointerReorder(document.getElementById('launchpad-grid'), '.launchpad-item', () => {
            this.saveLaunchpadOrder();
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.toggleLaunchpad(false);
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && overlay.classList.contains('visible')) {
                this.toggleLaunchpad(false);
            }
        });

        if (searchInput) {
            searchInput.addEventListener('input', () => {
                const grid = document.getElementById('launchpad-grid');
                if (!grid) return;
                const query = searchInput.value.toLowerCase().trim();
                grid.querySelectorAll('.launchpad-item').forEach(item => {
                    const name = item.dataset.name;
                    item.classList.toggle('hidden', query && !name.includes(query));
                });
            });
        }
    }

    populateLaunchpadGrid() {
        const grid = document.getElementById('launchpad-grid');
        if (!grid || !window.appsManager) return;
        // Rebuild so newly installed apps + dock changes are always reflected.
        grid.innerHTML = '';

        const apps = window.appsManager.getAllApps();
        const orderedKeys = this.getLaunchpadApps(apps);

        for (const key of orderedKeys) {
            const app = apps[key];
            if (!app) continue;
            if (key === 'launchpad') continue;
            const item = document.createElement('div');
            item.className = 'launchpad-item';
            item.dataset.name = app.name.toLowerCase();
            item.dataset.appKey = key;
            item.innerHTML = `
                <img src="${app.icon}" alt="${app.name}" draggable="false">
                <span>${app.name}</span>
            `;
            item.addEventListener('click', () => {
                this.toggleLaunchpad(false);
                window.windowManager.launchApp(key);
            });
            item.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.hideContextMenu();
                this.showLaunchpadContextMenu(e.clientX, e.clientY, key, this.getDockApps().includes(key));
            });
            grid.appendChild(item);
        }
    }

    getLaunchpadApps(apps = (window.appsManager ? window.appsManager.getAllApps() : {})) {
        const available = Object.keys(apps).filter(key => key !== 'launchpad');
        try {
            const saved = JSON.parse(localStorage.getItem('browos_launchpad_apps') || 'null');
            if (Array.isArray(saved)) {
                const savedSet = new Set(saved);
                return [...saved.filter(key => available.includes(key)), ...available.filter(key => !savedSet.has(key))];
            }
        } catch (e) {}
        return available;
    }

    saveLaunchpadOrder() {
        const grid = document.getElementById('launchpad-grid');
        if (!grid) return;
        localStorage.setItem('browos_launchpad_apps', JSON.stringify(
            [...grid.querySelectorAll('.launchpad-item')].map(item => item.dataset.appKey)
        ));
    }

    showLaunchpadContextMenu(x, y, appKey, isInDock) {
        const menu = document.createElement('div');
        menu.className = 'mac-context-menu visible';
        menu.dataset.source = 'launchpad';

        const mk = (label, fn, disabled = false) => {
            const el = document.createElement('div');
            el.className = 'mac-context-menu-item';
            el.textContent = label;
            if (disabled) { el.style.opacity = '0.5'; el.style.pointerEvents = 'none'; }
            else el.addEventListener('click', () => { this.hideContextMenu(); fn(); });
            menu.appendChild(el);
        };
        const appName = (window.appsManager && window.appsManager.getAllApps()[appKey]?.name) || appKey;
        mk(`Open ${appName}`, () => {
            this.toggleLaunchpad(false);
            setTimeout(() => window.windowManager.launchApp(appKey), 60);
        });
        if (!isInDock) {
            mk('Add to Dock', () => this.addToDock(appKey));
        } else {
            mk('Remove from Dock', () => {
                const el = document.querySelector(`.dock-app[data-app="${appKey}"]`);
                this.removeFromDock(appKey, el);
            });
        }

        document.body.appendChild(menu);

        let left = x;
        let top = y;
        requestAnimationFrame(() => {
            const rect = menu.getBoundingClientRect();
            if (left + rect.width > window.innerWidth) left -= rect.width;
            if (top + rect.height > window.innerHeight) top -= rect.height;
            menu.style.left = left + 'px';
            menu.style.top = top + 'px';
        });
    }

    toggleLaunchpad(show) {
        const overlay = document.getElementById('launchpad-overlay');
        const dock = document.getElementById('dock');
        if (!overlay) return;
        if (show) {
            this.populateLaunchpadGrid();
            overlay.style.display = 'flex';
            requestAnimationFrame(() => overlay.classList.add('visible'));
            if (dock) dock.classList.add('launchpad-hidden');
            const searchInput = document.getElementById('launchpad-search-input');
            if (searchInput) { searchInput.value = ''; searchInput.focus(); }
            const grid = document.getElementById('launchpad-grid');
            if (grid) grid.querySelectorAll('.launchpad-item').forEach(i => i.classList.remove('hidden'));
        } else {
            overlay.classList.remove('visible');
            if (dock) dock.classList.remove('launchpad-hidden');
            setTimeout(() => { overlay.style.display = 'none'; }, 250);
        }
    }

    // ─── Dock icon hover animations ────────────────────────────────────────────

    enlargeDockIcon(e) {
        const dock = document.getElementById('dock');
        if (dock && dock.classList.contains('taskbar-mode')) return; // no bounce in taskbar mode
        e.currentTarget.style.transform = 'scale(1.2)';
    }

    shrinkDockIcon(e) {
        const dock = document.getElementById('dock');
        if (dock && dock.classList.contains('taskbar-mode')) return;
        e.currentTarget.style.transform = 'scale(1)';
    }

    // ─── Desktop icons ─────────────────────────────────────────────────────────

    async loadDesktopIcons() {
        this.clearDesktopIcons();

        if (!window.filesystem || !window.filesystem.isMounted()) {
            setTimeout(() => this.loadDesktopIcons(), 1000);
            return;
        }

        try {
            const raw = await window.filesystem.list('Desktop');
            if (!raw || raw.length === 0) return;
            const entries = this._sortDesktopEntries(raw);
            const prefs = this._desktopPrefs();

            // Keep icons clear of the widgets column AND a left/right dock.
            const reserves = this.getDockReserves();
            const startX = 50 + (reserves.left || 0);
            const startY = 50;
            const gapX = 100;
            const gapY = 100;
            // Reserve 340px on the right for the widgets column to prevent overlap
            const rightEdge = window.innerWidth - 340 - (reserves.right || 0);
            const maxCols = Math.max(1, Math.floor((rightEdge - startX) / gapX));
            const posFor = (i) => ({
                x: startX + (i % maxCols) * gapX,
                y: startY + Math.floor(i / maxCols) * gapY,
            });

            if (prefs.stacks) {
                const groups = new Map();
                for (const entry of entries) {
                    const g = this._stackGroupFor(entry);
                    if (!groups.has(g)) groups.set(g, []);
                    groups.get(g).push(entry);
                }
                let i = 0;
                for (const [groupName, members] of groups) {
                    const { x, y } = posFor(i++);
                    if (members.length === 1) {
                        const entry = members[0];
                        const isDir = entry.kind === 'directory' || entry.type === 'directory';
                        const iconPath = isDir ? BrowOSIcons.folder : this.getIconForFile(entry.name);
                        this.createDesktopIcon(entry.name, iconPath, x, y, isDir ? null : entry.name);
                    } else {
                        this.createDesktopStack(groupName, members, x, y);
                    }
                }
            } else {
                let col = 0;
                for (const entry of entries) {
                    const isDir = entry.kind === 'directory' || entry.type === 'directory';
                    const iconPath = isDir ? BrowOSIcons.folder : this.getIconForFile(entry.name);
                    const { x, y } = posFor(col++);

                    this.createDesktopIcon(entry.name, iconPath, x, y, isDir ? null : entry.name);
                }
            }
            this._applyDesktopIconSize(prefs.iconSize);
        } catch (e) {
            console.error('Failed to load desktop icons:', e);
        }
    }

    createDesktopStack(groupName, members, x, y) {
        const icon = document.createElement('div');
        icon.className = 'desktop-icon stack';
        icon.style.left = `${x}px`;
        icon.style.top = `${y}px`;
        const isDir = members[0] && (members[0].kind === 'directory' || members[0].type === 'directory');
        const frontIcon = isDir ? BrowOSIcons.folder : this.getIconForFile(members[0].name);
        icon.innerHTML = `
            <div class="stack-imgs" style="width:48px;height:48px;">
                <img class="stack-back" src="${BrowOSIcons.folder}" alt="">
                <img class="stack-front" src="${frontIcon}" alt="${groupName}">
            </div>
            <span>${groupName}</span>
            <span class="stack-badge">${members.length}</span>
        `;
        const openStack = () => {
            const lines = members.map(m => `• ${m.name}`).join('\n');
            this._alert(`${groupName} Stack (${members.length})`, `${lines}\n\nTurn off "Use Stacks" to show every icon.`);
        };
        icon.addEventListener('dblclick', openStack);
        icon.addEventListener('click', () => {
            icon.classList.add('selected');
            setTimeout(() => icon.classList.remove('selected'), 600);
        });
        icon.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.hideContextMenu();
            const menu = document.createElement('div');
            menu.className = 'mac-context-menu visible';
            menu.dataset.source = 'desktop-icon';
            const mk = (label, fn) => {
                const el = document.createElement('div');
                el.className = 'mac-context-menu-item';
                el.textContent = label;
                el.addEventListener('click', () => { document.querySelectorAll('.mac-context-menu[data-source="desktop-icon"]').forEach(m => m.remove()); fn(); });
                menu.appendChild(el);
            };
            mk(`Open Stack (${members.length} items)`, openStack);
            mk('Unstack (Turn Stacks Off)', () => {
                localStorage.setItem('browos_desktop_stacks', 'false');
                this.refreshDesktopIcons();
            });
            document.body.appendChild(menu);
            let left = e.clientX, top = e.clientY;
            requestAnimationFrame(() => {
                const rect = menu.getBoundingClientRect();
                if (left + rect.width > window.innerWidth) left -= rect.width;
                if (top + rect.height > window.innerHeight) top -= rect.height;
                menu.style.left = left + 'px';
                menu.style.top = top + 'px';
            });
        });
        document.getElementById('desktop').appendChild(icon);
    }

    refreshDesktopIcons() {
        this.loadDesktopIcons();
    }

    clearDesktopIcons() {
        document.querySelectorAll('.desktop-icon').forEach(el => el.remove());
    }

    getIconForFile(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const iconMap = {
            'txt': BrowOSIcons.file,
            'md': BrowOSIcons.file,
            'js': BrowOSIcons.file,
            'html': BrowOSIcons.file,
            'css': BrowOSIcons.file,
            'json': BrowOSIcons.file,
            'png': BrowOSIcons.apps.photos,
            'jpg': BrowOSIcons.apps.photos,
            'jpeg': BrowOSIcons.apps.photos,
            'gif': BrowOSIcons.apps.photos,
            'webp': BrowOSIcons.apps.photos,
            'svg': BrowOSIcons.apps.photos,
            'mp3': BrowOSIcons.apps.music,
            'wav': BrowOSIcons.apps.music,
            'mp4': BrowOSIcons.apps.photos,
            'webm': BrowOSIcons.apps.photos,
        };
        return iconMap[ext] || BrowOSIcons.file;
    }

    createDesktopIcon(name, iconPath, x, y, filename = null) {
        const icon = document.createElement('div');
        icon.className = 'desktop-icon';
        icon.style.left = `${x}px`;
        icon.style.top = `${y}px`;
        icon.innerHTML = `
            <img src="${iconPath}" alt="${name}">
            <span>${name}</span>
        `;

        icon.addEventListener('dblclick', () => {
            if (filename) {
                this.openDesktopFile(filename);
            } else {
                window.windowManager.launchApp('filebrow');
            }
        });

        icon.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.showDesktopIconContextMenu(e.clientX, e.clientY, name, filename);
        });

        document.getElementById('desktop').appendChild(icon);
    }

    async openDesktopFile(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const path = 'Desktop/' + filename;
        const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'];
        const textExts = ['txt', 'md'];
        const codeExts = ['js', 'html', 'css', 'py', 'json', 'ts', 'jsx', 'tsx', 'xml', 'yaml', 'yml', 'sh', 'bash', 'c', 'cpp', 'h', 'hpp', 'java', 'rb', 'go', 'rs', 'php', 'sql'];

        if (imageExts.includes(ext)) {
            window.windowManager.openFileInPhotos(path, filename);
        } else if (codeExts.includes(ext)) {
            window.windowManager.openFileInCodeBrow(path);
        } else if (textExts.includes(ext)) {
            window.windowManager.openFileInBrowNote(path);
        } else {
            window.windowManager.launchApp('filebrow');
        }
    }

    showDesktopIconContextMenu(x, y, name, filename) {
        this.hideContextMenu();

        const menu = document.createElement('div');
        menu.className = 'mac-context-menu visible';
        menu.dataset.source = 'desktop-icon';

        const items = [
            { label: 'Open', action: 'open' },
            { divider: true },
            { label: 'Get Info', action: 'info' },
            { label: 'Open in FileBrow', action: 'filebrow' },
        ];

        if (filename) {
            items.push({ label: 'Rename', action: 'rename' });
            items.push({ divider: true });
            items.push({ label: 'Delete', action: 'delete', danger: true });
        }

        items.forEach(item => {
            if (item.divider) {
                const div = document.createElement('div');
                div.className = 'mac-context-menu-divider';
                menu.appendChild(div);
                return;
            }
            const el = document.createElement('div');
            el.className = 'mac-context-menu-item' + (item.danger ? ' danger' : '');
            el.textContent = item.label;
            el.addEventListener('click', () => {
                this.hideContextMenu();
                this.handleDesktopIconAction(item.action, name, filename);
            });
            menu.appendChild(el);
        });

        document.body.appendChild(menu);

        let left = x;
        let top = y;
        requestAnimationFrame(() => {
            const rect = menu.getBoundingClientRect();
            if (left + rect.width > window.innerWidth) left -= rect.width;
            if (top + rect.height > window.innerHeight) top -= rect.height;
            menu.style.left = left + 'px';
            menu.style.top = top + 'px';
        });
    }

    _revealInFileBrow(path) {
        if (!window.windowManager) return;
        window.windowManager.launchApp('filebrow');
        // FileBrow exposes the latest instance globally; navigate it to the folder.
        const dir = path.includes('/') ? path.split('/').slice(0, -1).join('/') || '/' : '/Desktop';
        setTimeout(() => {
            try {
                if (window.filebrowApp && typeof window.filebrowApp.navigateTo === 'function') {
                    const target = dir.startsWith('/') ? dir : `/${dir}`;
                    window.filebrowApp.navigateTo(target);
                }
            } catch {}
        }, 400);
    }

    async handleDesktopIconAction(action, name, filename) {
        const fullPath = 'Desktop/' + (filename || name);
        switch (action) {
            case 'open':
                if (filename) this.openDesktopFile(filename);
                else this._revealInFileBrow('Desktop/' + name);
                break;
            case 'info': {
                try {
                    const meta = (this._fsReady() && window.filesystem.getMetadata)
                        ? await window.filesystem.getMetadata(fullPath) : null;
                    const fmtSize = (b) => (window.filesystem.formatBytes
                        ? window.filesystem.formatBytes(b)
                        : `${Math.round(b / 1024)} KB`);
                    if (!meta) {
                        await this._alert('Get Info', `Name: ${name}\nPath: ${fullPath}\n\nFilesystem not mounted — mount a folder in FileBrow to see details.`);
                    } else if (meta.type === 'directory' || meta.kind === 'directory') {
                        let kids = 0;
                        try {
                            const list = await window.filesystem.list(fullPath);
                            kids = (list || []).length;
                        } catch {}
                        await this._alert('Get Info', `Name: ${name}\nKind: Folder\nPath: ${fullPath}\nContains: ${kids} item${kids === 1 ? '' : 's'}`);
                    } else {
                        const mod = meta.modified ? new Date(meta.modified).toLocaleString() : 'unknown';
                        await this._alert('Get Info', `Name: ${name}\nKind: File\nPath: ${fullPath}\nSize: ${fmtSize(meta.size || 0)}\nModified: ${mod}`);
                    }
                } catch (e) {
                    await this._alert('Get Info', `Name: ${name}\nPath: ${fullPath}`);
                }
                break;
            }
            case 'filebrow':
                this._revealInFileBrow(fullPath);
                break;
            case 'rename': {
                if (!this._fsReady()) {
                    await this._alert('Rename', 'Mount a folder in FileBrow first.');
                    break;
                }
                const newName = window.BrowDialog
                    ? await window.BrowDialog.prompt('Rename', 'Enter a new name:', name)
                    : prompt('Enter a new name:', name);
                if (newName && newName.trim() && newName.trim() !== name) {
                    const ok = await window.filesystem.rename(fullPath, newName.trim());
                    if (ok) this.loadDesktopIcons();
                    else await this._alert('Error', 'Rename failed. The name may be invalid.');
                }
                break;
            }
            case 'delete':
                if (filename && this._fsReady()) {
                    const ok = window.BrowDialog
                        ? await window.BrowDialog.confirm('Delete', `Are you sure you want to delete "${name}"?`, true)
                        : confirm(`Delete "${name}"?`);
                    if (ok) {
                        const path = 'Desktop/' + filename;
                        await window.filesystem.delete(path);
                        try { window.BrowSettings?.audio?.play('trash'); } catch (e) {}
                        this.loadDesktopIcons();
                    }
                } else if (filename) {
                    await this._alert('Delete', 'Mount a folder in FileBrow first.');
                }
                break;
        }
    }

    // ─── Menu bar ──────────────────────────────────────────────────────────────

    handleMenuClick(menuItem) {
        switch(menuItem) {
            case 'BrowOS':
                this.showSystemMenu();
                break;
            case 'File':
                break;
            case 'Edit':
                break;
        }
    }

    showSystemMenu() {
        this.hideContextMenu();

        const menu = document.createElement('div');
        menu.id = 'system-context-menu';
        menu.className = 'mac-context-menu visible';
        menu.dataset.source = 'system';

        const items = [
            { label: 'About BrowOS', action: 'about' },
            { divider: true },
            { label: 'System Preferences…', action: 'preferences' },
            { divider: true },
            { label: 'Shut Down…', action: 'shutdown' },
            { label: 'Restart…', action: 'restart' },
        ];

        items.forEach(item => {
            if (item.divider) {
                const div = document.createElement('div');
                div.className = 'mac-context-menu-divider';
                menu.appendChild(div);
                return;
            }
            const el = document.createElement('div');
            el.className = 'mac-context-menu-item';
            el.textContent = item.label;
            el.addEventListener('click', () => {
                this.hideContextMenu();
                this.handleSystemMenuAction(item.action);
            });
            menu.appendChild(el);
        });

        document.body.appendChild(menu);

        const appleMenu = document.querySelector('.apple-menu');
        if (appleMenu) {
            const rect = appleMenu.getBoundingClientRect();
            menu.style.left = rect.left + 'px';
            menu.style.top = (rect.bottom + 4) + 'px';
        }
    }

    handleSystemMenuAction(action) {
        switch (action) {
            case 'about':
                if (window.BrowDialog) {
                    window.BrowDialog.alert('About BrowOS', 'BrowOS v1.0\nA browser-based operating system simulation.');
                }
                break;
            case 'preferences':
                window.windowManager.launchApp('settings');
                break;
            case 'shutdown':
                if (window.BrowOS) window.BrowOS.shutdown();
                break;
            case 'restart':
                if (window.BrowOS) window.BrowOS.restart();
                break;
        }
    }

    launchApp(appName) {
        if (appName === 'launchpad') {
            const overlay = document.getElementById('launchpad-overlay');
            this.toggleLaunchpad(!overlay.classList.contains('visible'));
            return;
        }
        if (window.windowManager && window.windowManager.launchApp) {
            window.windowManager.launchApp(appName);
        } else {
            WindowManager.createWindow(appName);
        }
    }

    initializeWidgets() {
        // Widget layer is owned by the BrowWidgets engine (js/widgets.js):
        // free-position cards, gallery add/remove/edit, per-widget settings.
        if (window.BrowWidgets) window.BrowWidgets.init();
    }

}

// Initialize the desktop when the page loads
const desktop = new Desktop();
