// Desktop functionality for BrowOS
class Desktop {
    constructor() {
        this.initializeDesktop();
        this.initializeClock();
        this.initializeDock();
        this.initializeDesktopIcons();
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

        document.addEventListener('DOMContentLoaded', () => {
            this.setupEventListeners();
        });
    }

    setupEventListeners() {
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
            if (e.target.closest('.dock') || e.target.closest('.launchpad-overlay') || e.target.closest('.window')) return;
            this.showDesktopContextMenu(e.clientX, e.clientY);
        });

        document.addEventListener('click', () => this.hideContextMenu());
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.hideContextMenu();
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
        document.querySelectorAll('.mac-context-menu[data-source="dock"], .mac-context-menu[data-source="launchpad"]').forEach(m => m.remove());
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
        const clockElement = document.getElementById('clock');
        this.updateClock();
        setInterval(() => this.updateClock(), 1000);
    }

    updateClock() {
        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        document.getElementById('clock').textContent = `${hours}:${minutes}`;
    }

    initializeDock() {
        this.syncDockFromStorage();
        const dockApps = document.querySelectorAll('.dock-app');
        dockApps.forEach(app => {
            app.addEventListener('mouseenter', this.enlargeDockIcon);
            app.addEventListener('mouseleave', this.shrinkDockIcon);
        });
        this.setupDockDrag();
        this.setupDockContextMenu();
        this.setupLaunchpadListeners();
    }

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
        const order = [...dockContainer.querySelectorAll('.dock-app')].map(el => el.dataset.app);
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
            if (key === 'launchpad' || !allApps[key]) return;
            existingKeys.add(key);
            if (!dockContainer.querySelector(`.dock-app[data-app="${key}"]`)) {
                const app = allApps[key];
                const el = document.createElement('div');
                el.className = 'dock-app';
                el.dataset.app = key;
                el.dataset.title = app.name;
                el.innerHTML = `<img src="${app.icon}" alt="${app.name}"><div class="minimized-dot"></div>`;
                dockContainer.appendChild(el);
                el.addEventListener('click', () => this.launchApp(key));
                el.addEventListener('mouseenter', this.enlargeDockIcon);
                el.addEventListener('mouseleave', this.shrinkDockIcon);
            }
        });

        dockContainer.querySelectorAll('.dock-app').forEach(el => {
            const key = el.dataset.app;
            if (key !== 'launchpad' && !existingKeys.has(key)) {
                el.remove();
            }
        });
    }

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

    enlargeDockIcon(e) {
        e.currentTarget.style.transform = 'scale(1.2)';
    }

    shrinkDockIcon(e) {
        e.currentTarget.style.transform = 'scale(1)';
    }

    initializeDesktopIcons() {
        // Create some sample desktop icons
        this.createDesktopIcon('FileBrow', BrowOSIcons.filebrow, 50, 50, 'filebrow');
        this.createDesktopIcon('Safari', BrowOSIcons.safari, 150, 50);
        this.createDesktopIcon('Documents', BrowOSIcons.documents, 250, 50);
    }

    createDesktopIcon(name, iconPath, x, y, appId = null) {
        const icon = document.createElement('div');
        icon.className = 'desktop-icon';
        icon.style.left = `${x}px`;
        icon.style.top = `${y}px`;
        icon.innerHTML = `
            <img src="${iconPath}" alt="${name}">
            <span>${name}</span>
        `;
        const launchId = appId || name.toLowerCase();
        icon.addEventListener('dblclick', () => {
            this.launchApp(launchId);
        });
        document.getElementById('desktop').appendChild(icon);
    }

    handleMenuClick(menuItem) {
        console.log(`Menu item clicked: ${menuItem}`);
        // Handle menu bar interactions
        switch(menuItem) {
            case 'BrowOS':
                this.showSystemMenu();
                break;
            case 'File':
                // Show file menu
                break;
            case 'Edit':
                // Show edit menu
                break;
            // Add other menu cases
        }
    }

    showSystemMenu() {
        // Show system menu with options like About, Settings, Shutdown, etc.
        alert('System menu would appear here');
    }

    launchApp(appName) {
        if (appName === 'launchpad') {
            const overlay = document.getElementById('launchpad-overlay');
            this.toggleLaunchpad(!overlay.classList.contains('visible'));
            return;
        }
        console.log(`Launching app: ${appName}`);
        if (window.windowManager && window.windowManager.launchApp) {
            window.windowManager.launchApp(appName);
        } else {
            WindowManager.createWindow(appName);
        }
    }
}

// Initialize the desktop when the page loads
const desktop = new Desktop();
