// ============================================================================
// BrowMacOS.MenuBar — app-aware global menu bar.
//
// Renders the menus that belong to whichever app currently has focus, and
// swaps them out as the user switches apps (like macOS). It builds on the
// static `#menu-bar` already in index.html — keeping the  logo (Apple menu)
// and the status bar — and injects a dynamic `#menu-bar-menus` slot between
// them for the active app's File/Edit/View/Window/Help menus.
//
// Menus are data-driven: `buildMenus(app)` returns a pure definition tree that
// the renderer turns into DOM. To add/remove a menu or item, edit that tree —
// no DOM surgery needed. Actions are resolved through `runAction` so items stay
// declarative and easy to read.
// ============================================================================
(function () {
    'use strict';

    class MenuBar {
        constructor() {
            this.bar = document.getElementById('menu-bar');
            this.menusEl = null;
            this.popup = null;
            this.openMenu = null;

            this._ensureSlots();
            this._bindGlobal();

            // Re-render whenever the active app changes …
            BrowMacOS.on('activeapp', (app) => this.render(app));
            this.render(BrowMacOS.getActiveApp());

            BrowMacOS.module = BrowMacOS.module || {};
            BrowMacOS.module.menubar = this;
        }

        // Insert the dynamic container if it isn't there already.
        _ensureSlots() {
            if (!this.bar) return;
            if (!document.getElementById('menu-bar-menus')) {
                const menusEl = document.createElement('div');
                menusEl.id = 'menu-bar-menus';
                menusEl.className = 'menu-bar-menus';
                // Place after the apple-menu / static app item, before the status bar.
                const status = this.bar.querySelector('.status-bar');
                if (status) this.bar.insertBefore(menusEl, status);
                else this.bar.appendChild(menusEl);
            }
            this.menusEl = document.getElementById('menu-bar-menus');
        }

        _bindGlobal() {
            // Close the open dropdown on any outside interaction.
            document.addEventListener('click', (e) => {
                if (this.openMenu && !e.target.closest('#menu-bar-menus') && !e.target.closest('#macos-menu-popup')) {
                    this._close();
                }
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') this._close();
            });
            window.addEventListener('resize', () => this._close());
        }

        // ── Rendering ───────────────────────────────────────────────────────
        render(appName) {
            if (!this.menusEl) return;
            this._close();
            const defs = buildMenus(appName);
            this.menusEl.innerHTML = '';

            defs.forEach((menu) => {
                const btn = document.createElement('div');
                btn.className = 'menu-item macos-menu-item';
                btn.textContent = menu.label;
                btn.dataset.menu = menu.label;
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._toggleMenu(btn, menu);
                });
                this.menusEl.appendChild(btn);
            });
            if (defs.length === 0) this.menusEl.style.display = 'none';
            else this.menusEl.style.display = '';
        }

        _toggleMenu(trigger, menu) {
            if (this.openMenu === menu) { this._close(); return; }
            this._close();
            this.openMenu = menu;
            this._open(trigger, menu);
            trigger.classList.add('menu-open');
        }

        _close() {
            if (this.popup) { this.popup.remove(); this.popup = null; }
            this.openMenu = null;
            const current = this.menusEl && this.menusEl.querySelector('.menu-open');
            if (current) current.classList.remove('menu-open');
        }

        _open(trigger, menu) {
            if (!menu.items) return;
            const popup = document.createElement('div');
            popup.id = 'macos-menu-popup';
            popup.className = 'macos-menu-popup';

            menu.items.forEach((item) => {
                if (item.divider) {
                    const div = document.createElement('div');
                    div.className = 'mac-context-menu-divider';
                    popup.appendChild(div);
                    return;
                }
                const el = document.createElement('div');
                el.className = 'mac-context-menu-item macos-menu-item-entry';
                if (item.disabled) el.classList.add('disabled');

                const label = document.createElement('span');
                label.className = 'macos-menu-entry-label';
                label.textContent = item.label || '';
                el.appendChild(label);

                if (item.checked !== undefined) {
                    el.classList.toggle('has-checkmark', !!item.checked);
                }
                if (item.shortcut) {
                    const k = document.createElement('span');
                    k.className = 'macos-menu-entry-shortcut';
                    k.textContent = item.shortcut;
                    el.appendChild(k);
                }

                if (!item.disabled) {
                    el.addEventListener('click', () => {
                        this._close();
                        if (typeof item.action === 'function') item.action();
                        else runAction(item.action, menu);
                    });
                }
                popup.appendChild(el);
            });

            document.body.appendChild(popup);
            this.popup = popup;

            // Position under the menu item.
            const r = trigger.getBoundingClientRect();
            const popW = popup.offsetWidth || 220;
            const left = Math.min(r.left, window.innerWidth - popW - 8);
            popup.style.left = left + 'px';
            popup.style.top = (r.bottom + 2) + 'px';
        }
    }

    // ── Menu definitions (the data-driven part) ────────────────────────────
    // Return an array of { label, items: [...] }. Item shapes:
    //   { divider: true }
    //   { label, shortcut?, checked?, disabled?, action }  — action is a
    //     string key handled in runAction() or a function.
    function isCheckbox(item) { return item !== undefined && item.checked !== undefined; }

    function buildMenus(appName) {
        const app = appName && appName !== 'browos' ? appName : null;
        const appLabel = BrowMacOS.getAppTitle(appName);
        const menus = [];

        if (app) {
            // App menu (first, bold) — macOS shows the app name in bold.
            menus.push({
                label: appLabel,
                items: [
                    { label: 'About ' + appLabel, action: 'about' },
                    { divider: true },
                    { label: 'Settings…', shortcut: '⌘,', action: 'preferences' },
                    { divider: true },
                    { label: 'Hide ' + appLabel, shortcut: '⌘H', action: 'hide-app' },
                    { label: 'Quit ' + appLabel, shortcut: '⌘Q', action: 'quit-app' },
                ],
            });
        }

        menus.push({
            label: 'File',
            items: [
                app ? { label: 'New ' + (app === 'filebrow' ? 'Window' : 'Window'), shortcut: '⌘N', action: 'new-window' }
                    : { label: 'New Window', shortcut: '⌘N', action: 'new-finder' },
                { divider: true },
                { label: 'Open FileBrow…', shortcut: '⌘O', action: 'open-filebrow' },
                { divider: true },
                { label: 'Close Window', shortcut: '⌘W', action: 'close-window' },
            ],
        });

        menus.push({
            label: 'Edit',
            items: [
                { label: 'Undo', shortcut: '⌘Z', disabled: true },
                { label: 'Redo', shortcut: '⇧⌘Z', disabled: true },
                { divider: true },
                { label: 'Cut', shortcut: '⌘X', action: 'cut' },
                { label: 'Copy', shortcut: '⌘C', action: 'copy' },
                { label: 'Paste', shortcut: '⌘V', action: 'paste' },
                { label: 'Select All', shortcut: '⌘A', action: 'select-all' },
            ],
        });

        menus.push({
            label: 'View',
            items: [
                { label: 'App Switcher', shortcut: 'F4', action: 'app-switcher' },
                { label: 'Mission Control', shortcut: 'F2', action: 'mission-control' },
                { divider: true },
                { label: 'Next Desktop', shortcut: 'Ctrl+Alt+→', action: 'next-desktop' },
                { label: 'Previous Desktop', shortcut: 'Ctrl+Alt+←', action: 'prev-desktop' },
                { divider: true },
                { label: 'Show Desktop', shortcut: 'Ctrl+Alt+D', action: 'show-desktop' },
            ],
        });

        const winItems = [
            { label: 'Minimize', shortcut: '⌘M', action: 'minimize' },
            { label: 'Zoom', shortcut: '⌥⌘= ', action: 'zoom' },
            { divider: true },
            { label: 'Bring All to Front', action: 'bring-all-to-front' },
        ];
        menus.push({ label: 'Window', items: winItems });

        menus.push({
            label: 'Help',
            items: [
                { label: 'About BrowOS', action: 'about-browos' },
                { label: 'Keyboard Shortcuts…', action: 'shortcuts' },
            ],
        });

        return menus;
    }

    // ── Action dispatcher ───────────────────────────────────────────────────
    function runAction(action) {
        const wm = window.windowManager;
        const app = BrowMacOS.getActiveApp();
        const top = BrowMacOS.topmostWindow();
        const topObj = top && wm ? wm.windows.find((w) => w.element === top) : null;

        switch (action) {
            case 'about': {
                const label = BrowMacOS.getAppTitle(app);
                if (window.BrowDialog) window.BrowDialog.alert('About ' + label, label + '\nBrowOS · a browser-based operating system');
                break;
            }
            case 'about-browos':
                if (window.BrowDialog) window.BrowDialog.alert('About BrowOS', 'BrowOS · a browser-based operating system.\nmacOS features powered by the BrowMacOS module package.');
                break;
            case 'preferences':
                BrowMacOS.launchApp('settings');
                break;
            case 'hide-app':
                hideApp(app);
                break;
            case 'quit-app':
                quitApp(app);
                break;
            case 'new-window':
            case 'new-finder':
                BrowMacOS.launchApp(app === 'browos' ? 'filebrow' : app);
                break;
            case 'open-filebrow':
                BrowMacOS.launchApp('filebrow');
                break;
            case 'close-window':
                if (topObj) wm.closeWindow(topObj.element, topObj);
                break;
            case 'cut': case 'copy': case 'paste': case 'select-all':
                execCommand(action === 'select-all' ? 'selectAll' : action);
                break;
            case 'app-switcher': {
                const sw = BrowMacOS.module && BrowMacOS.module.appswitch;
                if (sw) sw.toggle();
                break;
            }
            case 'mission-control':
                if (window.BrowSpaces) window.BrowSpaces.toggleOverview();
                break;
            case 'next-desktop':
                if (window.BrowSpaces) window.BrowSpaces.next();
                break;
            case 'prev-desktop':
                if (window.BrowSpaces) window.BrowSpaces.prev();
                break;
            case 'show-desktop':
                showDesktop();
                break;
            case 'minimize':
                if (topObj) wm.minimizeWindow(topObj.element, topObj);
                break;
            case 'zoom':
                if (topObj) wm.maximizeWindow(topObj.element, topObj);
                break;
            case 'bring-all-to-front':
                BrowMacOS.refreshActiveApp();
                break;
            case 'shortcuts':
                showShortcuts();
                break;
            default:
                break;
        }
    }

    function hideApp(appName) {
        const wm = window.windowManager;
        if (!wm) return;
        wm.windows.filter((w) => w.appName === appName && !w.isMinimized)
            .forEach((w) => wm.minimizeWindow(w.element, w));
    }
    function quitApp(appName) {
        const wm = window.windowManager;
        if (!wm) return;
        wm.windows.filter((w) => w.appName === appName)
            .forEach((w) => wm.closeWindow(w.element, w));
    }
    function showDesktop() {
        const wm = window.windowManager;
        if (!wm) return;
        wm.windows.filter((w) => !w.isMinimized)
            .forEach((w) => wm.minimizeWindow(w.element, w));
    }
    function execCommand(cmd, arg) {
        const el = document.activeElement;
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
            try { document.execCommand(cmd, false, arg); } catch (err) { /* no-op */ }
        }
    }
    function showShortcuts() {
        const list = [
            ['`', 'Spotlight Search (anywhere)'],
            ['?', 'This shortcut list'],
            ['F2 / F4', 'Mission Control / App Switcher'],
            ['F8 / F9', 'Widget Gallery / Launchpad'],
            ['Ctrl+Alt+← / →', 'Previous / Next Desktop'],
            ['Ctrl+Alt+1…6', 'Jump to Desktop N'],
            ['Ctrl+Alt+W / M / Z', 'Close / Minimize / Zoom Window'],
            ['Ctrl+Alt+[ / ]', 'Snap Window Left / Right'],
            ['Ctrl+Alt+D', 'Show Desktop'],
        ];
        const body = list.map(([k, d]) => '  ' + k + '  —  ' + d).join('\n');
        if (window.BrowDialog) window.BrowDialog.alert('Keyboard Shortcuts', body);
    }

    BrowMacOS.register(MenuBar);
})();
