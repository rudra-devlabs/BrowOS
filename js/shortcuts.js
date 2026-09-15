// ============================================================================
// BrowShortcuts — the universal keyboard-shortcut layer for BrowOS.
//
// WHY THIS SCHEME: every other modifier family is taken before the page sees
// the keydown:
//   Alt+Shift+<key> — Windows keyboard-LAYOUT hotkey; combos get eaten
//   Alt+Shift+Tab   — reverse OS window switcher
//   Ctrl+T/W/N/1..9/Tab/L/K — reserved by browsers, never reach the page
//   Alt+<letter>/<arrow> — browser menu mnemonics / history navigation
//   Ctrl+<arrow>    — word-jump text editing; Ctrl+Alt+<arrow> = Intel
//                     screen-rotation hotkeys (avoided here too)
//   Win/Cmd+<key>   — OS-level, swallowed
//
// TIER 1 — DESKTOP KEYS (single keypress, zero modifiers):
//   `  Spotlight (anywhere, layout-stable physical key)
//   ?  This cheat sheet (anywhere)
//   F2 Mission Control · F4 App Switcher · F8 Widgets · F9 Launchpad
//   F-keys fire only when focus is NOT inside an app window, so app/game
//   keys (e.g. GTA's F2) are never stolen.
//
// TIER 2 — SYSTEM COMBOS (Ctrl+Alt+key, work everywhere):
//   Ctrl+Alt+1…6  desktop N (numpad too)
//   Ctrl+Alt+W/M/Z close / minimize / zoom window
//   Ctrl+Alt+[ / ] snap window left / right
//   Ctrl+Alt+D    show desktop
//   No browser, Windows, or common GPU/driver hotkey claims Ctrl+Alt+<key>.
//   AltGr typing (Ctrl+Alt reported together on European layouts) is
//   filtered via getModifierState('AltGraph') so real typing never triggers.
//
// API: BrowShortcuts.register({ combo, handler, desc })
//   'F2', '`', '?'              → desktop-key tier
//   'Ctrl+Alt+W'                → system-combo tier
// ============================================================================
(function () {
    'use strict';

    const singles = [];      // desktop-key tier
    const combos = new Map(); // event.code -> system-combo tier
    const comboOrder = [];

    // friendly name -> event.code
    const CODE = {
        '`': 'Backquote', '[': 'BracketLeft', ']': 'BracketRight',
        '/': 'Slash', tab: 'Tab', enter: 'Enter',
        left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown',
    };
    function codeFor(name) {
        const n = String(name || '');
        if (CODE[n.toLowerCase()]) return CODE[n.toLowerCase()];
        if (/^F\d{1,2}$/.test(n)) return n;                       // F2…
        if (/^[0-9]$/.test(n)) return 'Digit' + n;                // 1…
        if (/^[A-Za-z]$/.test(n)) return 'Key' + n.toUpperCase(); // W…
        return null;
    }
    function numpadAlias(code) {
        const m = /^Numpad([0-9])$/.exec(code || '');
        return m ? 'Digit' + m[1] : code;
    }

    function register(binding) {
        if (!binding || typeof binding.handler !== 'function') return false;
        const raw = String(binding.combo || '').trim();
        const cm = /^(?:ctrl|control)[+](?:alt)[+](.+)$/i.exec(raw)
            || /^(?:alt)[+](?:ctrl|control)[+](.+)$/i.exec(raw);
        if (cm) {
            const code = codeFor(cm[1]);
            if (!code) return false;
            if (!combos.has(code)) comboOrder.push(code);
            combos.set(code, {
                id: binding.id || code,
                combo: 'Ctrl+Alt+' + cm[1].toUpperCase(),
                group: 'Ctrl+Alt combos',
                handler: binding.handler,
                desc: binding.desc || '',
            });
            return true;
        }
        // single-key tier: '`', '?', 'F2'… (optionally 'shift+/' style)
        const sm = /^(?:shift[+])?(.+)$/i.exec(raw);
        if (!sm) return false;
        if (raw === '?') {
            singles.push({
                id: binding.id || 'question',
                combo: '?',
                group: 'Desktop keys',
                matchKey: '?',
                shift: true,
                scope: 'global',
                handler: binding.handler,
                desc: binding.desc || '',
            });
            return true;
        }
        const code = codeFor(sm[1]);
        if (!code) return false;
        singles.push({
            id: binding.id || code,
            combo: sm[1].toUpperCase(),
            group: 'Desktop keys',
            matchCode: code,
            shift: /^shift[+]/i.test(raw),
            scope: binding.scope === 'global' ? 'global' : 'desktop',
            handler: binding.handler,
            desc: binding.desc || '',
        });
        return true;
    }

    function list() {
        const out = singles.slice();
        comboOrder.forEach((c) => out.push(combos.get(c)));
        return out;
    }

    // ── guards ────────────────────────────────────────────────────────────
    function isEditable(t) {
        if (!t) return false;
        if (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.tagName === 'SELECT') return true;
        if (!t.closest) return false;
        return !!t.closest('input, textarea, select, [contenteditable="true"], .monaco-editor');
    }
    function inWindow(t) {
        return !!(t && t.closest && t.closest('.window'));
    }
    function modalOpen() {
        return !!document.querySelector('.brow-dialog-backdrop');
    }

    function fire(e, b) {
        e.preventDefault();
        e.stopPropagation();
        try {
            b.handler(e);
            window.BrowSettings?.audio?.play?.('tick');
        } catch (err) {
            console.warn('[BrowShortcuts] handler failed for ' + b.combo, err);
        }
    }

    function onKeydown(e) {
        if (e.repeat) return;
        const altGraph = e.getModifierState ? e.getModifierState('AltGraph') : false;

        // Tier 2 — Ctrl+Alt+key (strict: no Shift, no Meta)
        if (e.ctrlKey && e.altKey && !e.metaKey && !e.shiftKey && !altGraph) {
            const b = combos.get(numpadAlias(e.code));
            if (!b || e.defaultPrevented) return;
            if (isEditable(e.target)) return;
            if (modalOpen()) return;
            fire(e, b);
            return;
        }

        // Tier 1 — single keys: no modifiers except optional Shift
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (modalOpen()) return;
        if (isEditable(e.target)) return;
        for (const b of singles) {
            if (e.defaultPrevented) return;
            if (b.matchCode && e.code !== b.matchCode) continue;
            if (b.matchKey && e.key !== b.matchKey) continue;
            if (b.shift !== e.shiftKey) continue;
            if (b.scope === 'desktop' && inWindow(e.target)) continue;
            fire(e, b);
            return;
        }
    }

    // ── window helpers ────────────────────────────────────────────────────
    function wm() { return window.windowManager || null; }

    function topWindow() {
        const w = wm();
        if (!w || !w.windows.length) return null;
        const activeSpace = window.BrowSpaces ? window.BrowSpaces.getActive() : 0;
        let best = null, bestZ = -1;
        w.windows.forEach((win) => {
            if (win.isMinimized || !win.element) return;
            if ((win.spaceIndex ?? 0) !== activeSpace) return;
            const z = parseInt(win.element.style.zIndex || '0', 10) || 0;
            if (z > bestZ) { bestZ = z; best = win; }
        });
        return best;
    }

    function snapActive(side) {
        const w = topWindow();
        const mgr = wm();
        if (!w || !mgr) return;
        const el = w.element;
        w.savedPosition = {
            top: el.offsetTop, left: el.offsetLeft,
            width: el.offsetWidth, height: el.offsetHeight,
        };
        el.classList.remove('window-snapped-left', 'window-snapped-right');
        el.classList.add('snapped', side === 'left' ? 'window-snapped-left' : 'window-snapped-right');
        el.style.setProperty('position', 'fixed', 'important');
        el.style.setProperty('top', '38px', 'important');
        el.style.setProperty('width', Math.floor(window.innerWidth / 2) + 'px', 'important');
        el.style.setProperty('height', Math.floor(window.innerHeight - 38) + 'px', 'important');
        el.style.setProperty('z-index', '19999', 'important');
        if (side === 'left') {
            el.style.setProperty('left', '0', 'important');
            el.style.setProperty('border-radius', '12px 0 0 12px', 'important');
        } else {
            el.style.setProperty('left', Math.floor(window.innerWidth / 2) + 'px', 'important');
            el.style.setProperty('border-radius', '0 12px 12px 0', 'important');
        }
        w.isMaximized = false;
        window.BrowSettings?.audio?.play?.('snap');
    }

    // ── cheat sheet ───────────────────────────────────────────────────────
    let sheetEl = null;

    function showCheatSheet() {
        if (sheetEl) { hideCheatSheet(); return; }
        const groups = {};
        list().forEach((b) => { (groups[b.group] = groups[b.group] || []).push(b); });
        sheetEl = document.createElement('div');
        sheetEl.id = 'brow-shortcut-sheet';
        sheetEl.innerHTML =
            '<div class="bss-card">' +
            '<div class="bss-head"><span>BrowOS shortcuts</span>' +
            '<span class="bss-note">Desktop keys work on the desktop · Ctrl+Alt combos work everywhere</span></div>' +
            '<div class="bss-body"></div></div>';
        const body = sheetEl.querySelector('.bss-body');
        Object.keys(groups).forEach((g) => {
            const h = document.createElement('div');
            h.className = 'bss-group';
            h.textContent = g;
            body.appendChild(h);
            groups[g].forEach((b) => {
                const row = document.createElement('div');
                row.className = 'bss-row';
                const k = document.createElement('kbd');
                k.textContent = b.combo;
                const t = document.createElement('span');
                t.textContent = b.desc;
                row.appendChild(k);
                row.appendChild(t);
                body.appendChild(row);
            });
        });
        document.body.appendChild(sheetEl);
        requestAnimationFrame(() => sheetEl?.classList.add('bss-open'));
        sheetEl.addEventListener('mousedown', (e) => {
            if (e.target === sheetEl) hideCheatSheet();
        });
        setTimeout(() => document.addEventListener('keydown', sheetCloser, true), 0);
    }

    function sheetCloser(e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            hideCheatSheet();
        }
    }

    function hideCheatSheet() {
        document.removeEventListener('keydown', sheetCloser, true);
        if (!sheetEl) return;
        const el = sheetEl;
        sheetEl = null;
        el.classList.remove('bss-open');
        setTimeout(() => el.remove(), 180);
    }

    // ── core bindings ─────────────────────────────────────────────────────
    function boot() {
        // Tier 1 — desktop keys
        register({ id: 'spotlight', combo: '`', scope: 'global', desc: 'Spotlight search', handler: () => {
            window.BrowOSSpotlight?.toggle();
        }});
        register({ id: 'cheatsheet', combo: '?', desc: 'This shortcut list', handler: () => {
            showCheatSheet();
        }});
        register({ id: 'mission-control', combo: 'F2', desc: 'Mission Control', handler: () => {
            window.BrowSpaces?.toggleOverview();
        }});
        register({ id: 'appswitcher', combo: 'F4', desc: 'App switcher', handler: () => {
            window.BrowMacOS?.module?.appswitch?.toggle();
        }});
        register({ id: 'launchpad', combo: 'F9', desc: 'Launchpad', handler: () => {
            window.desktop?.toggleLaunchpad?.();
        }});
        register({ id: 'widgets', combo: 'F8', desc: 'Widgets', handler: () => {
            window.BrowWidgets?.openGallery();
        }});

        // Tier 2 — Ctrl+Alt combos
        for (let i = 1; i <= 6; i++) {
            register({ id: 'space-' + i, combo: 'Ctrl+Alt+' + i, desc: 'Switch to Desktop ' + i, handler: () => {
                window.BrowSpaces?.switchTo(i - 1);
            }});
        }
        register({ id: 'space-prev', combo: 'Ctrl+Alt+Left', desc: 'Previous desktop', handler: () => {
            window.BrowSpaces?.prev();
        }});
        register({ id: 'space-next', combo: 'Ctrl+Alt+Right', desc: 'Next desktop', handler: () => {
            window.BrowSpaces?.next();
        }});
        register({ id: 'win-close', combo: 'Ctrl+Alt+W', desc: 'Close window', handler: () => {
            const w = topWindow();
            if (w) wm().closeWindow(w.element, w);
        }});
        register({ id: 'win-min', combo: 'Ctrl+Alt+M', desc: 'Minimize window', handler: () => {
            const w = topWindow();
            if (w) wm().minimizeWindow(w.element, w);
        }});
        register({ id: 'win-max', combo: 'Ctrl+Alt+Z', desc: 'Maximize / restore window', handler: () => {
            const w = topWindow();
            if (w) wm().maximizeWindow(w.element, w);
        }});
        register({ id: 'win-snap-left', combo: 'Ctrl+Alt+[', desc: 'Snap window left', handler: () => {
            snapActive('left');
        }});
        register({ id: 'win-snap-right', combo: 'Ctrl+Alt+]', desc: 'Snap window right', handler: () => {
            snapActive('right');
        }});
        register({ id: 'show-desktop', combo: 'Ctrl+Alt+D', desc: 'Show desktop (minimize all)', handler: () => {
            const w = wm();
            if (w) w.windows.filter((win) => !win.isMinimized)
                .forEach((win) => w.minimizeWindow(win.element, win));
        }});

        document.addEventListener('keydown', onKeydown, true);
    }

    window.BrowShortcuts = { register, list, showCheatSheet, _topWindow: topWindow };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
})();
