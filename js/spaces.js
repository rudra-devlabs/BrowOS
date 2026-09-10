// ============================================================================
// BrowSpaces — virtual desktops (Spaces) + Mission Control for BrowOS.
//
// Model: every WindowManager window carries `spaceIndex`. Only windows on the
// active space are visible (via the `.space-hidden` class). New windows open
// on the active space. Count persists in localStorage; the active space is
// session-only and resets to Desktop 1 on boot.
//
// Switching is animated: outgoing windows slide/fade out in the direction of
// travel, incoming ones glide in. Rapid input lands any in-flight switch
// instantly first, so fast Ctrl+arrow spam always ends on the right desktop.
//
// Entry points used by the rest of the OS:
//   BrowSpaces.getCount() / getActive() / spaceName(i)
//   BrowSpaces.switchTo(i) / next() / prev()
//   BrowSpaces.addSpace() / removeSpace(i)
//   BrowSpaces.moveWindowTo(windowObj, i)
//   BrowSpaces.focusWindow(windowObj)   — jump to its space, restore, front
//   BrowSpaces.toggleOverview() / openOverview() / closeOverview()
// ============================================================================
(function () {
    'use strict';

    const MAX_SPACES = 6;
    const COUNT_KEY = 'browos_space_count';
    const LEAVE_MS = 150;
    const ENTER_MS = 280;

    class SpacesController {
        constructor() {
            this.active = 0;
            this.count = 2;
            try {
                const saved = parseInt(localStorage.getItem(COUNT_KEY), 10);
                if (saved >= 1 && saved <= MAX_SPACES) this.count = saved;
            } catch (e) { /* private mode — fall back to default */ }
            this.overviewOpen = false;
            this.indicatorEl = null;
            this.overlayEl = null;
            this._dragWinId = null;
            this._pending = null;      // in-flight animated switch { target, dir, timer }
            this._cleanupTimer = null; // strips enter/leave classes after animation
            this._freshSpace = -1;     // newly added space awaiting entrance animation
        }

        init() {
            this._tagExistingWindows();
            this._buildIndicator();
            this._bindShortcuts();
            this.applyVisibility();
            this._updateIndicator();
        }

        // ── State ────────────────────────────────────────────────────────────
        getCount() { return this.count; }
        getActive() { return this.active; }
        spaceName(i) { return 'Desktop ' + (i + 1); }

        _wm() { return window.windowManager || null; }

        _reduceMotion() {
            try {
                return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
            } catch (e) { return false; }
        }

        _tagExistingWindows() {
            const wm = this._wm();
            if (!wm) return;
            wm.windows.forEach((w) => {
                if (w.spaceIndex === undefined || w.spaceIndex === null) w.spaceIndex = 0;
            });
        }

        _persist() {
            try { localStorage.setItem(COUNT_KEY, String(this.count)); } catch (e) {}
        }

        windowsIn(i) {
            const wm = this._wm();
            if (!wm) return [];
            return wm.windows.filter((w) => (w.spaceIndex ?? 0) === i);
        }

        findWindow(id) {
            const wm = this._wm();
            if (!wm) return null;
            return wm.windows.find((w) => w.id === id) || null;
        }

        /** Visible (non-minimized, live) windows of a space — the ones we animate. */
        _visibleWindowsOf(spaceIdx) {
            const wm = this._wm();
            if (!wm) return [];
            return wm.windows.filter((w) => (w.spaceIndex ?? 0) === spaceIdx
                && !w.isMinimized && w.element
                && !w.element.classList.contains('window-closing'));
        }

        _clearSpaceAnimClasses() {
            const wm = this._wm();
            if (!wm) return;
            wm.windows.forEach((w) => {
                if (w.element) w.element.classList.remove(
                    'space-leaving-next', 'space-leaving-prev',
                    'space-entering-next', 'space-entering-prev');
            });
        }

        // ── Visibility ───────────────────────────────────────────────────────
        applyVisibility() {
            const wm = this._wm();
            if (!wm) return;
            wm.windows.forEach((w) => {
                if (w.spaceIndex === undefined || w.spaceIndex === null) w.spaceIndex = 0;
                if (w.element) w.element.classList.toggle('space-hidden', w.spaceIndex !== this.active);
            });
        }

        _afterSpaceChange() {
            this._updateIndicator();
            if (window.desktop && typeof window.desktop.updateTaskbar === 'function') {
                try { window.desktop.updateTaskbar(); } catch (e) {}
            }
            if (window.BrowMacOS && typeof window.BrowMacOS.refreshActiveApp === 'function') {
                try { window.BrowMacOS.refreshActiveApp(); } catch (e) {}
            }
        }

        switchTo(i, opts = {}) {
            let target = Number(i);
            if (!Number.isFinite(target)) return;
            if (opts.wrap) target = ((target % this.count) + this.count) % this.count;
            else target = Math.max(0, Math.min(this.count - 1, target));
            // Land any in-flight switch instantly so rapid input stays correct.
            this._finishPendingSwitch();
            if (target === this.active) {
                this._updateIndicator();
                if (this.overviewOpen) this.renderOverview();
                return;
            }
            const dir = target > this.active ? 'next' : 'prev';
            const outgoing = this._visibleWindowsOf(this.active);
            if (this._reduceMotion() || outgoing.length === 0) {
                this.active = target;
                this.applyVisibility();
                this._afterSpaceChange();
                if (this.overviewOpen) this.renderOverview();
                return;
            }
            const leaveCls = dir === 'next' ? 'space-leaving-next' : 'space-leaving-prev';
            outgoing.forEach((w) => w.element.classList.add(leaveCls));
            this._pending = { target, dir, timer: setTimeout(() => this._applySwitchTarget(), LEAVE_MS) };
        }

        _applySwitchTarget() {
            const p = this._pending;
            if (!p) return;
            this._pending = null;
            const enterCls = p.dir === 'next' ? 'space-entering-next' : 'space-entering-prev';
            this.active = p.target;
            this.applyVisibility();
            this._visibleWindowsOf(this.active).forEach((w) => w.element.classList.add(enterCls));
            this._afterSpaceChange();
            if (this.overviewOpen) this.renderOverview();
            if (this._cleanupTimer) clearTimeout(this._cleanupTimer);
            this._cleanupTimer = setTimeout(() => {
                this._cleanupTimer = null;
                this._clearSpaceAnimClasses();
            }, ENTER_MS);
        }

        _finishPendingSwitch() {
            if (this._cleanupTimer) {
                clearTimeout(this._cleanupTimer);
                this._cleanupTimer = null;
            }
            this._clearSpaceAnimClasses();
            if (!this._pending) return;
            clearTimeout(this._pending.timer);
            const target = this._pending.target;
            this._pending = null;
            this.active = target;
            this.applyVisibility();
        }

        next() { this.switchTo(this.active + 1, { wrap: true }); }
        prev() { this.switchTo(this.active - 1, { wrap: true }); }

        addSpace() {
            if (this.count >= MAX_SPACES) return false;
            this.count += 1;
            this._persist();
            this._freshSpace = this.count - 1;
            this.switchTo(this.count - 1);
            return true;
        }

        removeSpace(i) {
            if (this.count <= 1) return false;
            const idx = Math.max(0, Math.min(this.count - 1, Number(i) || 0));
            const newCount = this.count - 1;
            const landing = Math.min(idx, newCount - 1);
            const wm = this._wm();
            if (wm) {
                wm.windows.forEach((w) => {
                    const s = w.spaceIndex ?? 0;
                    if (s === idx) w.spaceIndex = landing;
                    else if (s > idx) w.spaceIndex = s - 1;
                });
            }
            if (this.active === idx) this.active = landing;
            else if (this.active > idx) this.active -= 1;
            this.count = newCount;
            this._persist();
            this.applyVisibility();
            this._afterSpaceChange();
            if (this.overviewOpen) this.renderOverview();
            return true;
        }

        /** Animated removal: collapse the tab/column first, then remove. */
        _animatedRemove(i) {
            if (this.count <= 1) return;
            if (this._reduceMotion() || !this.overlayEl) {
                this.removeSpace(i);
                return;
            }
            const tab = this.overlayEl.querySelector(`.mc-tab[data-space="${i}"]`);
            const col = this.overlayEl.querySelector(`.mc-column[data-space="${i}"]`);
            [tab, col].forEach((el) => el && el.classList.add('mc-leaving'));
            setTimeout(() => this.removeSpace(i), 180);
        }

        moveWindowTo(w, i) {
            if (!w) return false;
            const target = Math.max(0, Math.min(this.count - 1, Number(i) || 0));
            if ((w.spaceIndex ?? 0) === target) return true;
            w.spaceIndex = target;
            if (w.element) {
                if (target === this.active) {
                    w.element.classList.remove('space-hidden');
                    if (!w.isMinimized && !this._reduceMotion()) {
                        w.element.classList.add('space-entering-next');
                        setTimeout(() => {
                            if (w.element) w.element.classList.remove('space-entering-next');
                        }, ENTER_MS);
                    }
                } else if (!w.isMinimized && !this._reduceMotion()) {
                    // Graceful fade-slide out, then hide.
                    w.element.classList.add('space-leaving-next');
                    setTimeout(() => {
                        if (!w.element) return;
                        w.element.classList.remove('space-leaving-next');
                        if ((w.spaceIndex ?? 0) !== this.active) w.element.classList.add('space-hidden');
                    }, LEAVE_MS);
                } else {
                    w.element.classList.add('space-hidden');
                }
            }
            this._updateIndicator();
            if (window.desktop && typeof window.desktop.updateTaskbar === 'function') {
                try { window.desktop.updateTaskbar(); } catch (e) {}
            }
            if (this.overviewOpen) this.renderOverview();
            return true;
        }

        /** Jump to a window's space, restore it if minimized, bring to front. */
        focusWindow(w) {
            if (!w) return false;
            const wm = this._wm();
            if (!wm) return false;
            const si = w.spaceIndex ?? 0;
            if (si !== this.active) this.switchTo(si);
            if (w.isMinimized) {
                if (typeof wm.restoreWindow === 'function') wm.restoreWindow(w.element, w);
            } else {
                if (typeof wm.bringToFront === 'function') wm.bringToFront(w.element);
            }
            if (window.desktop && typeof window.desktop.updateTaskbar === 'function') {
                try { window.desktop.updateTaskbar(); } catch (e) {}
            }
            return true;
        }

        // ── Menu-bar indicator ───────────────────────────────────────────────
        _buildIndicator() {
            if (this.indicatorEl || !document.body) return;
            const statusBar = document.querySelector('#menu-bar .status-bar');
            if (!statusBar) return;
            const el = document.createElement('div');
            el.id = 'spaces-indicator';
            el.className = 'status-spaces-btn';
            el.title = 'Mission Control — switch desktops (F2)';
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleOverview();
            });
            const clock = document.getElementById('clock');
            if (clock) statusBar.insertBefore(el, clock);
            else statusBar.appendChild(el);
            this.indicatorEl = el;
        }

        _updateIndicator() {
            if (!this.indicatorEl) return;
            this.indicatorEl.innerHTML = '';
            const dot = document.createElement('span');
            dot.textContent = '❖';
            const num = document.createElement('span');
            num.textContent = String(this.active + 1);
            this.indicatorEl.appendChild(dot);
            this.indicatorEl.appendChild(num);
            this.indicatorEl.title = `${this.spaceName(this.active)} of ${this.count} — Mission Control (F2)`;
            this.indicatorEl.classList.toggle('mc-open', this.overviewOpen);
            // Gentle pop so the number change reads as a transition.
            this.indicatorEl.classList.remove('mc-pop-num');
            void this.indicatorEl.offsetWidth;
            this.indicatorEl.classList.add('mc-pop-num');
        }

        // ── Global shortcuts ─────────────────────────────────────────────
        // NOTE: legacy Ctrl+arrow / Ctrl+1..6 desktop-switch bindings were
        // removed — they collided with browser tab-switching (Ctrl+1..9),
        // macOS Spaces, and word-jump text editing. All Spaces shortcuts now
        // live in the universal layer (js/shortcuts.js):
        //   F2            Mission Control
        //   Ctrl+Alt+←/→  desktop prev/next
        //   Ctrl+Alt+1..6 jump to desktop N
        _isEditableTarget(t) {
            if (!t || !t.closest) return false;
            // NOTE: the terminal is intentionally NOT excluded. xterm's focus
            // element is a hidden helper textarea, but BrowShell ignores
            // Ctrl+Arrow sequences entirely — so the keys switch desktops even
            // when the terminal is focused, at zero cost. Real text editing
            // surfaces keep their native word-jump behavior.
            if (t.closest('.xterm, .terminal-shell-container')) return false;
            return !!t.closest('input, textarea, select, [contenteditable="true"], .monaco-editor');
        }

        _modalOpen() {
            // Dialogs and the Photos lightbox keep their arrow keys. Mission
            // Control itself is NOT blocked: Ctrl+←/→ switches desktops (and
            // re-renders the overview highlight) while it is open.
            return !!(document.querySelector('.brow-dialog-backdrop')
                || document.querySelector('.photos-lightbox'));
        }

        _bindShortcuts() {
            // Disabled: the universal shortcut layer (js/shortcuts.js) now
            // owns all global desktop-switching chords. Ctrl-only combos
            // were interceptable only inconsistently and collided with
            // browser/OS defaults (Ctrl+1..9 switches browser tabs on
            // Chrome/Firefox/Edge; Ctrl+←/→ is word-jump on Windows editors).
            return;
            /* eslint-disable no-unreachable */
            if (this._boundKeys) return;
            this._boundKeys = (e) => {
                if (e.defaultPrevented) return;
                // Ctrl-only (macOS-style ^arrows). Meta/Alt/Shift combos untouched.
                if (!e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
                if (this._isEditableTarget(e.target)) return;
                if (this._modalOpen()) return;
                const k = e.key;
                let handled = true;
                if (k === 'ArrowLeft') this.prev();
                else if (k === 'ArrowRight') this.next();
                else if (k === 'ArrowUp') this.openOverview();
                else if (k >= '1' && k <= String(MAX_SPACES)) {
                    const n = Number(k) - 1;
                    if (n < this.count) this.switchTo(n);
                    else handled = false;
                } else handled = false;
                if (handled) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            };
            document.addEventListener('keydown', this._boundKeys, true);
        }

        // ── Mission Control overview ─────────────────────────────────────────
        toggleOverview(force) {
            const want = typeof force === 'boolean' ? force : !this.overviewOpen;
            if (want) this.openOverview();
            else this.closeOverview();
        }

        openOverview() {
            if (this.overviewOpen) return;
            if (window.desktop && typeof window.desktop.hideContextMenu === 'function') {
                try { window.desktop.hideContextMenu(); } catch (e) {}
            }
            this.overviewOpen = true;
            this._freshSpace = -1;
            this.overlayEl = document.createElement('div');
            this.overlayEl.id = 'mission-control';
            this.overlayEl.innerHTML = `
                <div class="mc-backdrop"></div>
                <div class="mc-panel">
                    <div class="mc-topbar">
                        <span class="mc-title">Mission Control</span>
                        <span class="mc-tabs" style="display:contents;"></span>
                        <button class="mc-add" type="button" title="Add desktop">+ Add</button>
                        <button class="mc-close" type="button" title="Close (Esc)">✕</button>
                    </div>
                    <div class="mc-hint">Click a window to jump to it · Drag windows between desktops · Ctrl+Alt+←/→ switch · Esc close</div>
                    <div class="mc-columns"></div>
                </div>`;
            document.body.appendChild(this.overlayEl);
            this.overlayEl.querySelector('.mc-backdrop').addEventListener('click', () => this.closeOverview());
            this.overlayEl.querySelector('.mc-close').addEventListener('click', () => this.closeOverview());
            this.overlayEl.querySelector('.mc-add').addEventListener('click', () => this.addSpace());
            this._boundOverviewKeys = (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    this.closeOverview();
                }
            };
            document.addEventListener('keydown', this._boundOverviewKeys, true);
            this.renderOverview();
            // Staggered rise for tabs + cards on open only (not on re-renders).
            if (!this._reduceMotion()) {
                const items = this.overlayEl.querySelectorAll('.mc-tab, .mc-card');
                items.forEach((el, idx) => {
                    el.style.animationDelay = Math.min(idx * 18, 220) + 'ms';
                    el.classList.add('mc-rise');
                });
                setTimeout(() => {
                    if (!this.overlayEl) return;
                    this.overlayEl.querySelectorAll('.mc-rise').forEach((el) => {
                        el.classList.remove('mc-rise');
                        el.style.animationDelay = '';
                    });
                }, 650);
            }
            this._updateIndicator();
        }

        closeOverview() {
            if (!this.overviewOpen) return;
            this.overviewOpen = false;
            if (this._boundOverviewKeys) {
                document.removeEventListener('keydown', this._boundOverviewKeys, true);
                this._boundOverviewKeys = null;
            }
            const ov = this.overlayEl;
            this.overlayEl = null;
            if (ov) {
                if (this._reduceMotion()) ov.remove();
                else {
                    ov.classList.add('mc-closing');
                    setTimeout(() => ov.remove(), 170);
                }
            }
            this._updateIndicator();
        }

        _windowTitle(w) {
            const t = w.element && w.element.querySelector('.window-title span');
            if (t && t.textContent.trim()) return t.textContent.trim();
            const info = window.appsManager && window.appsManager.getAppInfo
                ? window.appsManager.getAppInfo(w.appName) : null;
            return (info && (info.windowTitle || info.name)) || w.appName || 'Window';
        }

        _appIcon(w) {
            const info = window.appsManager && window.appsManager.getAppInfo
                ? window.appsManager.getAppInfo(w.appName) : null;
            if (info && info.icon) return info.icon;
            if (window.BrowOSIcons && typeof window.BrowOSIcons.forApp === 'function') {
                try { return window.BrowOSIcons.forApp(w.appName); } catch (e) {}
            }
            return '';
        }

        renderOverview() {
            if (!this.overviewOpen || !this.overlayEl) return;
            const tabsEl = this.overlayEl.querySelector('.mc-tabs');
            const colsEl = this.overlayEl.querySelector('.mc-columns');
            const addBtn = this.overlayEl.querySelector('.mc-add');
            tabsEl.innerHTML = '';
            colsEl.innerHTML = '';
            if (addBtn) addBtn.disabled = this.count >= MAX_SPACES;
            const fresh = this._freshSpace;
            this._freshSpace = -1;

            for (let i = 0; i < this.count; i++) {
                const wins = this.windowsIn(i);

                const tab = document.createElement('button');
                tab.type = 'button';
                tab.className = 'mc-tab' + (i === this.active ? ' active' : '') + (i === fresh ? ' mc-enter' : '');
                tab.dataset.space = String(i);
                const label = document.createElement('span');
                label.textContent = this.spaceName(i);
                const badge = document.createElement('span');
                badge.className = 'mc-tab-count';
                badge.textContent = String(wins.length);
                const x = document.createElement('button');
                x.type = 'button';
                x.className = 'mc-tab-x';
                x.textContent = '✕';
                x.title = 'Remove desktop';
                x.disabled = this.count <= 1;
                x.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    this._animatedRemove(i);
                });
                tab.appendChild(label);
                tab.appendChild(badge);
                tab.appendChild(x);
                tab.addEventListener('click', () => this.switchTo(i));
                this._makeDropTarget(tab, i);
                tabsEl.appendChild(tab);

                const col = document.createElement('div');
                col.className = 'mc-column' + (i === this.active ? ' active-col' : '') + (i === fresh ? ' mc-enter' : '');
                col.dataset.space = String(i);
                const head = document.createElement('div');
                head.className = 'mc-col-header';
                const hName = document.createElement('span');
                hName.textContent = this.spaceName(i) + (i === this.active ? ' · current' : '');
                const hCount = document.createElement('span');
                hCount.textContent = wins.length ? `${wins.length} window${wins.length === 1 ? '' : 's'}` : '';
                head.appendChild(hName);
                head.appendChild(hCount);
                col.appendChild(head);

                if (wins.length === 0) {
                    const empty = document.createElement('div');
                    empty.className = 'mc-col-empty';
                    empty.textContent = 'No windows — drag one here';
                    col.appendChild(empty);
                }
                wins.forEach((w) => col.appendChild(this._buildCard(w)));
                col.addEventListener('click', (ev) => {
                    if (ev.target === col || ev.target.classList.contains('mc-col-empty')) this.switchTo(i);
                });
                this._makeDropTarget(col, i);
                colsEl.appendChild(col);
            }
        }

        _buildCard(w) {
            const card = document.createElement('div');
            card.className = 'mc-card';
            card.draggable = true;
            card.dataset.winId = w.id;
            const icon = document.createElement('img');
            icon.alt = '';
            icon.draggable = false;
            icon.src = this._appIcon(w) || '';
            const text = document.createElement('div');
            text.className = 'mc-card-text';
            const title = document.createElement('div');
            title.className = 'mc-card-title';
            title.textContent = this._windowTitle(w);
            const sub = document.createElement('div');
            sub.className = 'mc-card-sub';
            const info = window.appsManager && window.appsManager.getAppInfo
                ? window.appsManager.getAppInfo(w.appName) : null;
            sub.textContent = (info && info.name) || w.appName || '';
            text.appendChild(title);
            text.appendChild(sub);
            card.appendChild(icon);
            card.appendChild(text);
            if (w.isMinimized) {
                const m = document.createElement('span');
                m.className = 'mc-card-min';
                m.textContent = '● min';
                card.appendChild(m);
            }
            card.addEventListener('click', (ev) => {
                ev.stopPropagation();
                this.closeOverview();
                this.focusWindow(w);
            });
            card.addEventListener('dragstart', (ev) => {
                this._dragWinId = w.id;
                try { ev.dataTransfer.setData('text/plain', w.id); ev.dataTransfer.effectAllowed = 'move'; } catch (e) {}
                card.classList.add('dragging');
            });
            card.addEventListener('dragend', () => {
                this._dragWinId = null;
                card.classList.remove('dragging');
                this.overlayEl?.querySelectorAll('.dragover').forEach((el) => el.classList.remove('dragover'));
            });
            return card;
        }

        _makeDropTarget(el, spaceIndex) {
            el.addEventListener('dragover', (ev) => {
                if (!this._dragWinId) return;
                ev.preventDefault();
                try { ev.dataTransfer.dropEffect = 'move'; } catch (e) {}
                el.classList.add('dragover');
            });
            el.addEventListener('dragleave', () => el.classList.remove('dragover'));
            el.addEventListener('drop', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                el.classList.remove('dragover');
                let id = this._dragWinId;
                try { id = ev.dataTransfer.getData('text/plain') || id; } catch (e) {}
                const w = id && this.findWindow(id);
                if (w) this.moveWindowTo(w, spaceIndex);
            });
        }
    }

    window.BrowSpaces = new SpacesController();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => window.BrowSpaces.init(), { once: true });
    } else {
        window.BrowSpaces.init();
    }
})();
