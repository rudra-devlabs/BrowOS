// ============================================================================
// BrowMacOS — core namespace for macOS-style desktop features.
//
// Holds: a tiny event bus, active-app tracking, and the global keyboard-
// shortcut registry.
//
// The feature modules live in sibling files and are wired on `BrowMacOS.init()`:
//   - menubar.js    -> BrowMacOS.MenuBar        (app-aware global menu bar)
//   - appswitch.js  -> BrowMacOS.AppSwitcher    (Cmd+Tab app switcher)
// ============================================================================
window.BrowMacOS = (function () {
    'use strict';

    // ── Tiny event bus ──────────────────────────────────────────────────────
    const listeners = {};
    function on(name, fn) {
        (listeners[name] = listeners[name] || []).push(fn);
        return () => off(name, fn);
    }
    function off(name, fn) {
        const list = listeners[name];
        if (!list) return;
        const i = list.indexOf(fn);
        if (i >= 0) list.splice(i, 1);
    }
    function emit(name, ...args) {
        (listeners[name] || []).slice().forEach((fn) => {
            try { fn(...args); } catch (err) { console.warn('[BrowMacOS] handler for "' + name + '" threw:', err); }
        });
    }

    // ── Active-app tracking ─────────────────────────────────────────────────
    // macOS menu bars are app-aware: the menus belong to whichever app is
    // focused. BrowOS's window manager doesn't keep an explicit
    // "activeApp" field, so we derive it from pointer/keyboard focus on the
    // `.window` elements (event delegation — no edits to window.js/desktop.js).
    let activeApp = 'browos'; // 'browos' = the Finder / desktop.
    function setActiveApp(appName) {
        appName = appName || 'browos';
        if (appName === activeApp) return;
        activeApp = appName;
        emit('activeapp', activeApp);
    }
    function getActiveApp() { return activeApp; }

    // Works out which `.window` holds `el`, returning its app key (or null).
    function appOwnerOf(el) {
        const win = el && el.closest ? el.closest('.window') : null;
        return win ? win.dataset.app || null : null;
    }
    function hookActiveAppTracking() {
        document.addEventListener('mousedown', (e) => {
            const app = appOwnerOf(e.target);
            if (app) setActiveApp(app);
            else if (!e.target.closest('#menu-bar, #dock, .launchpad-overlay, #app-switcher, .mac-context-menu, #spotlight-overlay')) {
                setActiveApp('browos'); // clicked the desktop.
            }
        }, true);
        // Keep menus honest when windows are closed/refocused programmatically.
        setInterval(() => {
            const top = topmostWindow();
            setActiveApp(top ? top.dataset.app : 'browos');
        }, 1200);
    }
    // Returns the highest (most recently brought-to-front) window element.
    function topmostWindow() {
        const container = document.getElementById('windows-container');
        if (!container) return null;
        const wins = Array.from(container.querySelectorAll('.window'))
            .filter((w) => !w.classList.contains('window-minimized') && !w.classList.contains('window-closing') && !w.classList.contains('space-hidden'));
        if (wins.length === 0) return null;
        wins.sort((a, b) => (parseInt(b.style.zIndex, 10) || 0) - (parseInt(a.style.zIndex, 10) || 0));
        return wins[0];
    }
    // Reifies the "active app" whenever a window is created / focused.
    function refreshActiveApp() {
        const top = topmostWindow();
        setActiveApp(top ? top.dataset.app : 'browos');
    }

    // ── App launching helper ────────────────────────────────────────────────
    function launchApp(appName) {
        const wm = window.windowManager;
        if (!wm) return null;
        return wm.launchApp(appName);
    }
    function getAppIcon(appName) {
        const info = window.appsManager && window.appsManager.getAppInfo(appName);
        if (info && info.icon) return info.icon;
        if (window.BrowOSIcons && window.BrowOSIcons.forApp) return window.BrowOSIcons.forApp(appName);
        return null;
    }
    function getAppTitle(appName) {
        const info = window.appsManager && window.appsManager.getAppInfo(appName);
        return (info && info.windowTitle) || appName;
    }

    // ── Global keyboard-shortcut registry ───────────────────────────────────
    // A shortcut is { mods: ['cmd'], key: 'tab', handler, desc }.
    // 'cmd' matches either Cmd (meta) or Ctrl, so the same shortcuts feel
    // native on macOS *and* Windows-like browsers.
    const shortcuts = [];
    function registerShortcut(sc) {
        if (!sc || !sc.key || typeof sc.handler !== 'function') return;
        sc.mods = normalizeMods(sc.mods);
        sc.key = String(sc.key).toLowerCase();
        shortcuts.push(sc);
    }
    function normalizeMods(mods) {
        const m = {};
        (mods || []).forEach((x) => (m[String(x).toLowerCase()] = true));
        return m;
    }
    function keyToString(e) {
        if (e.key === ' ') return 'space';
        if (e.key && e.key.length === 1) return e.key.toLowerCase();
        return (e.key || '').toLowerCase();
    }
    function setupShortcutListener() {
        document.addEventListener('keydown', (e) => {
            const current = keyToString(e);
            for (const sc of shortcuts) {
                const cmd = e.metaKey || e.ctrlKey;
                if ((cmd === !!sc.mods.cmd) &&
                    (!!e.altKey === !!sc.mods.alt) &&
                    (!!e.shiftKey === !!sc.mods.shift) &&
                    sc.key === current) {
                    if (e.defaultPrevented) continue;
                    e.preventDefault();
                    e.stopPropagation();
                    try { sc.handler(e); } catch (err) { console.warn('[BrowMacOS] shortcut:', err); }
                    return;
                }
            }
        });
    }

    // ── Boot ────────────────────────────────────────────────────────────────
    const modules = [];
    function register(ModuleClass) { modules.push(ModuleClass); }
    function init() {
        if (window.BrowMacOS._booted) return;
        window.BrowMacOS._booted = true;

        hookActiveAppTracking();
        setupShortcutListener();

        modules.forEach((M) => {
            try { new M(); } catch (err) { console.warn('[BrowMacOS] failed to init ' + (M.name || M), err); }
        });
        refreshActiveApp();
    }

    return {
        _booted: false,
        on, off, emit,
        setActiveApp, getActiveApp, appOwnerOf, topmostWindow, refreshActiveApp,
        launchApp, getAppIcon, getAppTitle,
        registerShortcut, setupShortcutListener,
        register, init,
    };
})();
