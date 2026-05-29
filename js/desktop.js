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
            const img = new Image();
            img.onload = () => applyWallpaper(customUrl);
            img.onerror = () => applyWallpaper(`assets/wallpapers/${savedWallpaper}.svg`);
            img.src = customUrl;
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
                if (window.filesystem && window.filesystem.isMounted()) {
                    this.refreshDesktopIcons();
                }
            }, 250);
        });
    }

    showDesktopContextMenu(x, y) {
        this.hideContextMenu();

        const menu = document.createElement('div');
        menu.id = 'desktop-context-menu';
        menu.className = 'mac-context-menu visible';
        menu.dataset.source = 'desktop';

        const items = [
            { label: 'New Folder', action: 'new-folder' },
            { label: 'Get Info', action: 'get-info' },
            { divider: true },
            { label: 'Change Desktop Background…', action: 'change-wallpaper' },
            { label: 'Use Stacks', action: 'stacks' },
            { label: 'Sort By', action: 'sort-by' },
            { label: 'Clean Up', action: 'clean-up' },
            { label: 'Clean Up By', action: 'clean-up-by' },
            { divider: true },
            { label: 'Show View Options', action: 'view-options' },
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
                this.handleDesktopContextAction(item.action);
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

    hideContextMenu() {
        document.querySelector('#desktop-context-menu')?.remove();
        document.querySelector('#system-context-menu')?.remove();
        document.querySelectorAll('.mac-context-menu[data-source="dock"], .mac-context-menu[data-source="launchpad"], .mac-context-menu[data-source="desktop-icon"]').forEach(m => m.remove());
    }

    handleDesktopContextAction(action) {
        switch (action) {
            case 'new-folder':
                window.windowManager.launchApp('filebrow');
                break;
            case 'get-info':
                break;
            case 'change-wallpaper':
                window.windowManager.launchApp('settings');
                setTimeout(() => {
                    const settingsSection = document.querySelector('[data-section="appearance"]');
                    if (settingsSection) settingsSection.click();
                }, 300);
                break;
            case 'stacks':
            case 'sort-by':
            case 'clean-up':
            case 'clean-up-by':
            case 'view-options':
                break;
        }
    }

    initializeClock() {
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
        const dockApps = document.querySelectorAll('.dock-app');
        dockApps.forEach(app => {
            app.addEventListener('mouseenter', this.enlargeDockIcon);
            app.addEventListener('mouseleave', this.shrinkDockIcon);
        });
        // Ensure taskbar labels exist on all permanent dock items
        dockApps.forEach(el => this._ensureTaskbarLabel(el));
        this.setupDockDrag();
        this.setupDockContextMenu();
        this.setupLaunchpadListeners();
    }

    // ─── Taskbar helpers ───────────────────────────────────────────────────────

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
     * Morphs the dock between pill (no maximised windows) and flat taskbar (≥1 maximised window).
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

        const maximizedWindows = wm.windows.filter(w => w.isMaximized && !w.isMinimized);
        const hasMaximized = maximizedWindows.length > 0;

        // Smoothly hide/show upper status menu-bar
        const menuBar = document.getElementById('menu-bar');
        if (menuBar) {
            menuBar.classList.toggle('hidden-maximized', hasMaximized);
        }

        if (!hasMaximized) {
            // ── Pill mode ──────────────────────────────────────────────────────
            dock.classList.remove('taskbar-mode');

            // Remove any ephemeral (non-pinned open-window) taskbar buttons
            dockAppsContainer.querySelectorAll('.dock-app[data-taskbar-ephemeral]').forEach(el => el.remove());

            // Clear active markers
            dockAppsContainer.querySelectorAll('.dock-app').forEach(el => {
                el.classList.remove('taskbar-active');
            });
            return;
        }

        // ── Taskbar mode ───────────────────────────────────────────────────────
        dock.classList.add('taskbar-mode');

        const pinnedApps = new Set(this.getDockApps());

        // Determine the top-most maximized window by z-index
        let topWindow = null;
        let topZ = -1;
        maximizedWindows.forEach(w => {
            const z = parseInt(w.element.style.zIndex || 0, 10);
            if (z > topZ) { topZ = z; topWindow = w; }
        });

        // Remove ephemeral buttons whose window is now closed
        dockAppsContainer.querySelectorAll('.dock-app[data-taskbar-ephemeral]').forEach(el => {
            const appKey = el.dataset.app;
            const hasOpenWindow = wm.windows.some(w => w.appName === appKey && !w.isMinimized);
            if (!hasOpenWindow) el.remove();
        });

        // Add ephemeral buttons for non-pinned open windows
        wm.windows.forEach(w => {
            if (pinnedApps.has(w.appName)) return;   // already has a permanent button
            if (w.isMinimized) return;                  // don't show minimised windows

            if (!dockAppsContainer.querySelector(`.dock-app[data-app="${w.appName}"]`)) {
                const appInfo = window.appsManager?.getAppInfo(w.appName);
                if (!appInfo) return;

                const el = document.createElement('div');
                el.className = 'dock-app';
                el.dataset.app = w.appName;
                el.dataset.title = appInfo.name;
                el.dataset.taskbarEphemeral = '1';
                el.innerHTML = `<img src="${appInfo.icon}" alt="${appInfo.name}"><div class="minimized-dot"></div>`;
                this._ensureTaskbarLabel(el);
                el.addEventListener('click', () => this._taskbarAppClick(w.appName, el));
                el.addEventListener('mouseenter', this.enlargeDockIcon);
                el.addEventListener('mouseleave', this.shrinkDockIcon);
                dockAppsContainer.appendChild(el);
            }
        });

        // Update label text and active state for every button
        dockAppsContainer.querySelectorAll('.dock-app').forEach(el => {
            const appKey = el.dataset.app;
            if (appKey === 'launchpad') return;

            this._ensureTaskbarLabel(el);
            const label = el.querySelector('.taskbar-label');
            if (label) label.textContent = el.dataset.title || el.querySelector('img')?.alt || appKey;

            // Wire click once (guard with flag)
            if (!el.dataset.taskbarClickBound) {
                el.dataset.taskbarClickBound = '1';
                el.addEventListener('click', () => this._taskbarAppClick(appKey, el));
            }

            // Mark the currently-foreground window button as active
            const isActive = topWindow && topWindow.appName === appKey;
            el.classList.toggle('taskbar-active', !!isActive);
        });
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
            wm.bringToFront(openWin.element);
            this.updateTaskbar();
            return;
        }

        // Find a minimised window and restore it
        const minWin = wm.windows.find(w => w.appName === appKey && w.isMinimized);
        if (minWin) {
            wm.restoreWindow(minWin.element, minWin);
            return;
        }

        // No window open — launch (pinned apps only; ephemeral buttons disappear when closed)
        this.launchApp(appKey);
    }

    // ─── Dock drag & drop ──────────────────────────────────────────────────────

    setupDockDrag() {
        const dockContainer = document.querySelector('.dock-apps');
        if (!dockContainer) return;

        let draggedEl = null;

        dockContainer.querySelectorAll('.dock-app').forEach(app => {
            if (app.dataset.dragBound === 'true') return;
            app.dataset.dragBound = 'true';
            app.setAttribute('draggable', 'true');

            app.addEventListener('dragstart', (e) => {
                draggedEl = app;
                app.style.opacity = '0.4';
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', app.dataset.app);
            });

            app.addEventListener('dragend', () => {
                app.style.opacity = '1';
                draggedEl = null;
                dockContainer.querySelectorAll('.dock-app').forEach(a => a.classList.remove('drag-over'));
                this.saveDockOrder();
            });

            app.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (draggedEl && draggedEl !== app) {
                    dockContainer.querySelectorAll('.dock-app').forEach(a => a.classList.remove('drag-over'));
                    app.classList.add('drag-over');
                }
            });

            app.addEventListener('dragleave', () => {
                app.classList.remove('drag-over');
            });

            app.addEventListener('drop', (e) => {
                e.preventDefault();
                app.classList.remove('drag-over');
                if (draggedEl && draggedEl !== app) {
                    const allApps = [...dockContainer.querySelectorAll('.dock-app')];
                    const draggedIdx = allApps.indexOf(draggedEl);
                    const targetIdx = allApps.indexOf(app);

                    if (draggedIdx < targetIdx) {
                        app.after(draggedEl);
                    } else {
                        app.before(draggedEl);
                    }
                }
            });
        });
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
        return ['filebrow', 'safari', 'messages', 'launchpad', 'settings', 'terminal', 'brownote'];
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
                el.addEventListener('mouseenter', this.enlargeDockIcon);
                el.addEventListener('mouseleave', this.shrinkDockIcon);
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
        document.querySelectorAll('.dock-app').forEach(app => {
            app.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const appName = app.dataset.app;
                if (appName === 'launchpad') return;
                this.hideContextMenu();
                this.showDockContextMenu(e.clientX, e.clientY, appName, app);
            });
        });
    }

    showDockContextMenu(x, y, appName, appEl) {
        const menu = document.createElement('div');
        menu.className = 'mac-context-menu visible';
        menu.dataset.source = 'dock';

        const removeItem = document.createElement('div');
        removeItem.className = 'mac-context-menu-item';
        removeItem.textContent = 'Remove from Dock';
        removeItem.addEventListener('click', () => {
            this.hideContextMenu();
            this.removeFromDock(appName, appEl);
        });
        menu.appendChild(removeItem);

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
            setTimeout(() => appEl.remove(), 200);
        }
        const apps = this.getDockApps().filter(a => a !== appName);
        this.saveDockApps(apps);
    }

    addToDock(appName) {
        const apps = this.getDockApps();
        if (apps.includes(appName)) return;
        apps.push(appName);
        this.saveDockApps(apps);
        this.syncDockFromStorage();
        this.setupDockDrag();
        this.setupDockContextMenu();
    }

    // ─── Launchpad ─────────────────────────────────────────────────────────────

    setupLaunchpadListeners() {
        const overlay = document.getElementById('launchpad-overlay');
        const searchInput = document.getElementById('launchpad-search-input');
        if (!overlay) return;

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
        if (!grid || !window.appsManager || grid.children.length > 0) return;

        const apps = window.appsManager.getAllApps();
        const dockApps = this.getDockApps();

        for (const [key, app] of Object.entries(apps)) {
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
                this.showLaunchpadContextMenu(e.clientX, e.clientY, key, dockApps.includes(key));
            });
            grid.appendChild(item);
        }
    }

    showLaunchpadContextMenu(x, y, appKey, isInDock) {
        const menu = document.createElement('div');
        menu.className = 'mac-context-menu visible';
        menu.dataset.source = 'launchpad';

        if (!isInDock) {
            const addItem = document.createElement('div');
            addItem.className = 'mac-context-menu-item';
            addItem.textContent = 'Add to Dock';
            addItem.addEventListener('click', () => {
                this.hideContextMenu();
                this.addToDock(appKey);
            });
            menu.appendChild(addItem);
        } else {
            const infoItem = document.createElement('div');
            infoItem.className = 'mac-context-menu-item';
            infoItem.textContent = 'Already in Dock';
            infoItem.style.opacity = '0.5';
            infoItem.style.pointerEvents = 'none';
            menu.appendChild(infoItem);
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
            const entries = await window.filesystem.list('Desktop');
            if (!entries || entries.length === 0) return;

            let col = 0;
            const startX = 50;
            const startY = 50;
            const gapX = 100;
            const gapY = 100;
            // Reserve 340px on the right for the widgets column to prevent overlap
            const availableWidth = window.innerWidth - 340;
            const maxCols = Math.max(1, Math.floor((availableWidth - startX) / gapX));

            for (const entry of entries) {
                const isDir = entry.kind === 'directory' || entry.type === 'directory';
                const iconPath = isDir ? BrowOSIcons.folder : this.getIconForFile(entry.name);
                const x = startX + (col % maxCols) * gapX;
                const y = startY + Math.floor(col / maxCols) * gapY;

                this.createDesktopIcon(entry.name, iconPath, x, y, isDir ? null : entry.name);
                col++;
            }
        } catch (e) {
            console.error('Failed to load desktop icons:', e);
        }
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
            { label: filename ? 'Open in FileBrow' : 'Open in FileBrow', action: 'filebrow' },
        ];

        if (filename) {
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

    async handleDesktopIconAction(action, name, filename) {
        switch (action) {
            case 'open':
                if (filename) this.openDesktopFile(filename);
                else window.windowManager.launchApp('filebrow');
                break;
            case 'filebrow':
                window.windowManager.launchApp('filebrow');
                break;
            case 'delete':
                if (filename && window.filesystem && window.filesystem.isMounted()) {
                    const ok = await window.BrowDialog.confirm('Delete', `Are you sure you want to delete "${name}"?`, true);
                    if (ok) {
                        const path = 'Desktop/' + filename;
                        await window.filesystem.delete(path);
                        this.loadDesktopIcons();
                    }
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
        const desktopEl = document.getElementById('desktop');
        if (!desktopEl) return;

        // Create container
        const widgetsContainer = document.createElement('div');
        widgetsContainer.className = 'desktop-widgets-container';
        desktopEl.appendChild(widgetsContainer);

        // Render widget slots (Battery is completely removed to fit cleanly on screen!)
        widgetsContainer.innerHTML = `
            <!-- 1. Large Clock Widget -->
            <div class="desktop-widget widget-clock-card">
                <div class="widget-clock-large" id="widget-time">12:00<span class="widget-clock-colon">:</span>00</div>
                <div class="widget-date-label" id="widget-date">MONDAY, MAY 24</div>
            </div>

            <!-- 2. OS Health & Diagnostics -->
            <div class="desktop-widget widget-health-card">
                <div class="widget-title">
                    <span>🛡️</span> OS Health & Diagnostics
                </div>
                <div class="health-status-header">
                    <div class="health-status-title">
                        <span class="health-status-pulse"></span>
                        <span id="health-status-text">System Optimal</span>
                    </div>
                </div>
                <div class="health-detail-item">
                    <span>Active Tasks</span>
                    <span id="health-tasks-count">7 background</span>
                </div>
                <div class="health-detail-item">
                    <span>OS Uptime</span>
                    <span id="health-uptime">00:00:00</span>
                </div>
                <button class="diag-btn" id="run-diag-btn">Deep Diagnostics Scan</button>
                <div class="diag-scan-container" id="diag-scan-wrap">
                    <div class="diag-scan-text" id="diag-scan-label">Scanning system registry...</div>
                    <div class="diag-scan-track">
                        <div class="diag-scan-fill" id="diag-scan-progress"></div>
                    </div>
                </div>
            </div>

            <!-- 3. Storage Usage (Synced dynamically out of 10 GB with Settings / Filesystem) -->
            <div class="desktop-widget widget-storage-card" style="cursor: pointer;" title="Click to run disk cleanup">
                <div class="widget-title">
                    <span>💽</span> Disk Storage
                </div>
                <div class="storage-stats-numbers">
                    <span class="storage-stats-used" id="widget-storage-used">Calculating...</span>
                    <span class="storage-stats-total">of 10 GB</span>
                </div>
                <div class="storage-bar-track">
                    <div class="storage-bar-segment storage-segment-system" id="widget-storage-system-bar" style="width: 24%;"></div>
                    <div class="storage-bar-segment storage-segment-apps" id="widget-storage-apps-bar" style="width: 8%;"></div>
                    <div class="storage-bar-segment storage-segment-media" id="widget-storage-media-bar" style="width: 0%;"></div>
                </div>
                <div class="storage-legend-grid">
                    <div class="storage-legend-item">
                        <span class="legend-color-dot" style="background-color: #60a5fa;"></span>
                        <span>System</span>
                    </div>
                    <div class="storage-legend-item">
                        <span class="legend-color-dot" style="background-color: #c084fc;"></span>
                        <span>Apps</span>
                    </div>
                    <div class="storage-legend-item">
                        <span class="legend-color-dot" style="background-color: #34d399;"></span>
                        <span>Files</span>
                    </div>
                </div>
            </div>
        `;

        // Initialize Widget Functionalities
        this._initWidgetClock();
        this._initWidgetHealth();
        this._initWidgetStorage();
    }

    _initWidgetClock() {
        const timeEl = document.getElementById('widget-time');
        const dateEl = document.getElementById('widget-date');
        if (!timeEl || !dateEl) return;

        const update = () => {
            const now = new Date();
            let hours = now.getHours();
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12;
            hours = hours ? hours : 12; // 0 should be 12
            
            timeEl.innerHTML = `${hours}<span class="widget-clock-colon">:</span>${minutes}<span style="font-size: 20px; font-weight: 500; margin-left: 4px;">${ampm}</span>`;

            const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
            dateEl.textContent = `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`;
        };
        update();
        setInterval(update, 1000);
    }

    _initWidgetHealth() {
        const uptimeEl = document.getElementById('health-uptime');
        const tasksEl = document.getElementById('health-tasks-count');
        const runDiagBtn = document.getElementById('run-diag-btn');
        const diagScanWrap = document.getElementById('diag-scan-wrap');
        const diagScanLabel = document.getElementById('diag-scan-label');
        const diagScanProgress = document.getElementById('diag-scan-progress');

        if (!uptimeEl || !runDiagBtn) return;

        // Uptime counter
        const startTime = Date.now();
        const updateUptime = () => {
            const diff = Date.now() - startTime;
            const secs = Math.floor((diff / 1000) % 60);
            const mins = Math.floor((diff / (1000 * 60)) % 60);
            const hrs = Math.floor((diff / (1000 * 60 * 60)) % 24);
            uptimeEl.textContent = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

            // Also update tasks count
            const windowCount = window.windowManager ? window.windowManager.windows.length : 0;
            tasksEl.textContent = `${windowCount} active / ${8 + Math.floor(Math.sin(Date.now() / 10000) * 3)} system`;
        };
        updateUptime();
        setInterval(updateUptime, 1000);

        // Diagnostic Scan Click
        let scanning = false;
        runDiagBtn.addEventListener('click', () => {
            if (scanning) return;
            scanning = true;
            runDiagBtn.disabled = true;
            runDiagBtn.textContent = 'Diagnostic Running...';
            diagScanWrap.style.display = 'flex';
            diagScanProgress.style.width = '0%';
            
            const steps = [
                'Verifying system core files...',
                'Auditing filesystem registry...',
                'Scanning active thread pool...',
                'Cleaning application caches...',
                'Audit Complete! Health: 100%'
            ];
            
            let progress = 0;

            const interval = setInterval(() => {
                progress += 5;
                diagScanProgress.style.width = `${progress}%`;
                
                // Change text labels periodically
                const stepIdx = Math.min(steps.length - 1, Math.floor((progress / 100) * steps.length));
                diagScanLabel.textContent = steps[stepIdx];

                if (progress >= 100) {
                    clearInterval(interval);
                    setTimeout(() => {
                        scanning = false;
                        runDiagBtn.disabled = false;
                        runDiagBtn.textContent = 'Run Diagnostic Again';
                        diagScanWrap.style.display = 'none';
                        
                        // Show premium system dialog
                        if (window.BrowDialog) {
                            window.BrowDialog.alert(
                                'System Diagnostics Report',
                                'Diagnostics Complete!\n\nStatus: OPTIMAL\nHealth Score: 100%\nCaches Cleared: 142 MB\nSystem Files: 0 Corrupt\nAll services running healthy.'
                            );
                        } else {
                            alert('Diagnostics Complete! Status: OPTIMAL (100% Healthy).');
                        }
                    }, 500);
                }
            }, 100);
        });
    }

    _initWidgetStorage() {
        const usedEl = document.getElementById('widget-storage-used');
        const systemBar = document.getElementById('widget-storage-system-bar');
        const appsBar = document.getElementById('widget-storage-apps-bar');
        const mediaBar = document.getElementById('widget-storage-media-bar');
        const cardEl = document.querySelector('.widget-storage-card');

        if (!usedEl || !cardEl) return;

        const systemGB = 2.4;
        const appsGB = 0.8;
        const totalGB = 10.0;

        const updateStorageUI = async () => {
            let mediaBytes = 0;
            if (window.filesystem && typeof window.filesystem.getStorageUsed === 'function') {
                try {
                    mediaBytes = await window.filesystem.getStorageUsed();
                } catch (e) {
                    console.error('Failed to query storage used:', e);
                }
            }
            
            const mediaGB = mediaBytes / (1024 * 1024 * 1024);
            const totalUsedGB = systemGB + appsGB + mediaGB;
            
            usedEl.textContent = `${totalUsedGB.toFixed(2)} GB Used`;

            const systemPct = (systemGB / totalGB) * 100;
            const appsPct = (appsGB / totalGB) * 100;
            const mediaPct = (mediaGB / totalGB) * 100;

            systemBar.style.width = `${systemPct}%`;
            appsBar.style.width = `${appsPct}%`;
            mediaBar.style.width = `${mediaPct}%`;
        };

        // Real-time synchronization interval
        updateStorageUI();
        setInterval(updateStorageUI, 5000);

        // Click to run disk cleanup
        cardEl.addEventListener('click', async () => {
            if (window.BrowDialog) {
                const proceed = await window.BrowDialog.confirm('Disk Analyzer & Cleanup', 'Would you like to run a Deep Disk Audit and clean temporary log files, browser cache, and memory dumps?');
                if (!proceed) return;

                // Simulate cleaning
                const cleanupScreen = document.createElement('div');
                cleanupScreen.className = 'brow-dialog-backdrop';
                cleanupScreen.innerHTML = `
                    <div class="brow-dialog">
                        <div class="brow-dialog-title">Disk Cleanup Running</div>
                        <div class="brow-dialog-message">Purging cache files and logs...</div>
                        <div class="diag-scan-track" style="width: 100%; margin-top: 10px;">
                            <div class="diag-scan-fill" id="cleanup-progress" style="width: 0%; height: 100%;"></div>
                        </div>
                    </div>
                `;
                document.body.appendChild(cleanupScreen);

                const progressEl = cleanupScreen.querySelector('#cleanup-progress');
                let progress = 0;
                const interval = setInterval(() => {
                    progress += 10;
                    progressEl.style.width = `${progress}%`;
                    if (progress >= 100) {
                        clearInterval(interval);
                        document.body.removeChild(cleanupScreen);

                        window.BrowDialog.alert('Cleanup Successful', 'Deep Disk Audit Completed!\n\nAll temporary system logs, memory dumps, and duplicate browser caches have been successfully purged.');
                        updateStorageUI();
                    }
                }, 150);
            }
        });
    }
}

// Initialize the desktop when the page loads
const desktop = new Desktop();
