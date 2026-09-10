// ============================================================================
// BrowMacOS.AppSwitcher — command-tab style app switcher.
//
// A floating strip of the system's apps. Hold Cmd (or Ctrl) and tap Tab to
// cycle; release to activate. Also navigable with the arrow keys, Enter to
// activate, Esc to cancel, or a plain click.
//
// Note: real browsers usually intercept ⌘Tab / Ctrl+Tab at the OS level, so
// the shortcut is registered as a best-effort. The switcher is always reachable
// via the View ▸ App Switcher menu item (and the "⌘⇥" affordance shown there).
// ============================================================================
(function () {
    'use strict';

    class AppSwitcher {
        constructor() {
            this.overlay = null;
            this.apps = [];
            this.index = 0;
            this._open = false;
            this._iconCache = {};

            BrowMacOS.module = BrowMacOS.module || {};
            BrowMacOS.module.appswitch = this;

            BrowMacOS.on('activeapp', () => { if (!this._open) this.index = this._indexOf(BrowMacOS.getActiveApp()); });

            // NOTE: the legacy ⌘⇥ / Ctrl+Tab registration was removed —
            // browsers and OSes swallow it before the page sees it. The
            // switcher is bound to the F4 desktop key in
            // js/shortcuts.js and stays reachable from View ▸ App Switcher.
        }

        _indexOf(appName) {
            return Math.max(0, this.apps.indexOf(appName));
        }

        _collectApps() {
            const seen = [];
            // Permanent dock apps first (they define the system's app set).
            document.querySelectorAll('#dock .dock-app').forEach((el) => {
                const a = el.dataset.app;
                if (a && a !== 'launchpad' && !seen.includes(a)) seen.push(a);
            });
            // Then any open windows not already listed.
            const wm = window.windowManager;
            (wm ? wm.windows : []).forEach((w) => {
                if (w.appName && !seen.includes(w.appName)) seen.push(w.appName);
            });
            return seen;
        }

        toggle() { this._open ? this.close() : this.open(); }

        open() {
            if (this._open) return;
            this._open = true;
            this.apps = this._collectApps();
            if (this.apps.length === 0) { this._open = false; return; }

            this.index = Math.max(0, this.apps.indexOf(BrowMacOS.getActiveApp()));

            const overlay = document.createElement('div');
            overlay.id = 'app-switcher';
            overlay.className = 'app-switcher';
            overlay.innerHTML = '<div class="app-switcher-strip" id="app-switcher-strip"></div>';
            document.body.appendChild(overlay);
            this.overlay = overlay;
            this._render();

            // Clicking a stripped area closes (selects nothing).
            overlay.addEventListener('mousedown', (e) => {
                if (e.target === overlay) this.close(true);
            });
            document.addEventListener('keydown', this._onKey = (e) => {
                if (e.key === 'Tab') { e.preventDefault(); this.next(); }
                else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); this.next(); }
                else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); this.prev(); }
                else if (e.key === 'Enter') { e.preventDefault(); this.activate(); }
                else if (e.key === 'Escape') { e.preventDefault(); this.close(true); }
            });
        }

        close(select = false) {
            if (!this._open) return;
            this._open = false;
            if (select) this.activate();
            if (this.overlay) { this.overlay.remove(); this.overlay = null; }
            if (this._onKey) document.removeEventListener('keydown', this._onKey);
        }

        next() {
            this.index = (this.index + 1) % this.apps.length;
            this._render();
        }
        prev() {
            this.index = (this.index - 1 + this.apps.length) % this.apps.length;
            this._render();
        }

        activate() {
            const app = this.apps[this.index];
            if (!app) return;
            this.close();
            BrowMacOS.launchApp(app);
            BrowMacOS.setActiveApp(app);
        }

        _render() {
            const strip = this.overlay.querySelector('#app-switcher-strip');
            if (!strip) return;
            strip.innerHTML = '';
            this.apps.forEach((app, i) => {
                const el = document.createElement('div');
                el.className = 'app-switcher-item' + (i === this.index ? ' selected' : '');
                const icon = this._iconOf(app);
                el.innerHTML = `
                    <span class="app-switcher-icon">${icon || ''}</span>
                    ${i === this.index ? `<span class="app-switcher-name">${BrowMacOS.getAppTitle(app)}</span>` : ''}
                `;
                el.addEventListener('click', () => { this.index = i; this.activate(); });
                strip.appendChild(el);
            });
        }

        _iconOf(app) {
            if (this._iconCache[app] !== undefined) return this._iconCache[app];
            return (this._iconCache[app] = BrowMacOS.getAppIcon(app));
        }
    }

    BrowMacOS.register(AppSwitcher);
})();
