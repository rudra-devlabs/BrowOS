/* BrowWidgets — desktop widget engine, gallery, and built-in widget set.
 *
 * One system owns every desktop widget: a live layer of free-position cards,
 * a registry of widget definitions, drag + jiggle edit mode, per-widget
 * settings, and localStorage persistence. The Widgets app window (gallery)
 * is the add/remove/edit surface, reachable from the menu-bar button,
 * the desktop context menu, or F8.
 */
(function () {
    'use strict';

    var LAYOUT_KEY = 'browos_widgets_v1';
    var LAYER_ID = 'brow-widget-layer';
    var SIZES = {
        s: { w: 170, h: 170, label: 'Small' },
        m: { w: 290, h: 170, label: 'Medium' },
        l: { w: 290, h: 290, label: 'Large' }
    };
    var GRID = 4;

    var defs = {};
    var defOrder = [];
    var instances = []; // {uid,id,size,x,y,settings,el,body}
    var uidSeq = 1;
    var editMode = false;
    var layer = null;
    var popover = null;
    var tickTimer = null;
    var fpsState = { frames: 0, last: 0, fps: 0 };
    var sessionStart = Date.now();

    // ─── tiny helpers ────────────────────────────────────────────────────
    function $(sel, root) { return (root || document).querySelector(sel); }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function storeGet(key, fallback) {
        try {
            var raw = localStorage.getItem(key);
            if (raw === null || raw === undefined) return fallback;
            return JSON.parse(raw);
        } catch (e) { return fallback; }
    }
    function storeSet(key, val) {
        try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
    }
    function pad2(n) { return String(n).padStart(2, '0'); }
    function tickSound(ok) {
        try {
            if (window.BrowSettings && window.BrowSettings.audio) {
                window.BrowSettings.audio.play(ok === false ? 'fail' : 'tick');
            }
        } catch (e) {}
    }
    function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

    // Shared 1s-fps meter (single rAF loop for the whole engine).
    function fpsLoop(ts) {
        if (!fpsState.last) fpsState.last = ts;
        fpsState.frames++;
        if (ts - fpsState.last >= 600) {
            fpsState.fps = Math.round((fpsState.frames * 1000) / (ts - fpsState.last));
            fpsState.frames = 0;
            fpsState.last = ts;
        }
        requestAnimationFrame(fpsLoop);
    }

    // ─── persistence ─────────────────────────────────────────────────────
    function defaultLayout() {
        var vw = Math.max(900, window.innerWidth);
        var vh = Math.max(600, window.innerHeight);
        return [
            { uid: 'w-cal', id: 'calendar', size: 'm', x: vw - 310, y: 44, settings: {} },
            { uid: 'w-tasks', id: 'todo', size: 'm', x: vw - 310, y: 228, settings: {} },
            { uid: 'w-stocks', id: 'crypto', size: 'm', x: Math.max(40, vw - 790), y: vh - 220, settings: {} },
            { uid: 'w-weather', id: 'weather', size: 'm', x: Math.max(340, vw - 490), y: vh - 220, settings: {} },
            { uid: 'w-clock', id: 'clock', size: 's', x: vw - 190, y: vh - 220, settings: {} }
        ];
    }
    function loadLayout() {
        var saved = storeGet(LAYOUT_KEY, null);
        if (!Array.isArray(saved)) return defaultLayout();
        // Drop entries for unknown widgets (forward-compatible).
        return saved.filter(function (e) { return e && defs[e.id]; });
    }
    function saveLayout() {
        storeSet(LAYOUT_KEY, instances.map(function (inst) {
            return { uid: inst.uid, id: inst.id, size: inst.size, x: Math.round(inst.x), y: Math.round(inst.y), settings: inst.settings || {} };
        }));
    }

    // ─── engine core ─────────────────────────────────────────────────────
    function define(def) {
        if (!def || !def.id || typeof def.render !== 'function') return;
        def.sizes = def.sizes || ['m'];
        if (!def.sizes.includes(def.defSize)) def.defSize = def.sizes[0];
        if (!defs[def.id]) defOrder.push(def.id);
        defs[def.id] = def;
    }

    function apiFor(inst) {
        return {
            inst: inst,
            settings: inst.settings,
            el: inst.body,
            refresh: function () { renderInstance(inst); },
            set: function (key, val) { inst.settings[key] = val; saveLayout(); renderInstance(inst); },
            openApp: function (app) {
                try {
                    if (window.appsManager) window.appsManager.launchApp(app);
                    else if (window.desktop) window.desktop.launchApp(app);
                } catch (e) {}
            }
        };
    }

    function renderInstance(inst) {
        var def = defs[inst.id];
        if (!def || !inst.body) return;
        try {
            if (inst._cleanup) { try { inst._cleanup(); } catch (e) {} inst._cleanup = null; }
            inst.body.innerHTML = '';
            var api = apiFor(inst);
            var cleanup = def.render(inst.body, api);
            if (typeof cleanup === 'function') inst._cleanup = cleanup;
        } catch (e) { console.warn('[widgets] render failed for ' + inst.id, e); }
    }

        function getDim(d, sz) {
        return SIZES[sz] || SIZES.m;
    }

    function applyGeometry(inst) {
        var s = SIZES[inst.size] || SIZES.m;
        inst.el.style.width = s.w + 'px';
        inst.el.style.height = s.h + 'px';
        inst.el.style.transform = 'translate(' + inst.x + 'px,' + inst.y + 'px)';
        inst.el.dataset.size = inst.size;
    }

    function makeBadges(inst) {
        var remove = document.createElement('button');
        remove.className = 'bw-badge bw-remove';
        remove.textContent = '×';
        remove.title = 'Remove widget';
        remove.addEventListener('click', function (e) { e.stopPropagation(); removeInstance(inst.uid); });
        var gear = document.createElement('button');
        gear.className = 'bw-badge bw-gear';
        gear.textContent = '⚙';
        gear.title = 'Widget settings';
        gear.addEventListener('click', function (e) { e.stopPropagation(); openPopover(inst, gear); });
        inst.el.appendChild(remove);
        inst.el.appendChild(gear);
    }

    function spawnInstance(entry) {
        var def = defs[entry.id];
        if (!def) return null;
        var inst = {
            uid: entry.uid || ('w' + Date.now().toString(36) + (uidSeq++)),
            id: entry.id,
            size: def.sizes.includes(entry.size) ? entry.size : def.defSize,
            x: typeof entry.x === 'number' ? entry.x : 120,
            y: typeof entry.y === 'number' ? entry.y : 80,
            settings: Object.assign(defaultSettings(def), entry.settings || {})
        };
        var el = document.createElement('div');
        el.className = 'desktop-widget brow-widget';
        if (def.shape) el.classList.add('bw-shape-' + def.shape);
        el.dataset.shape = def.shape || 'rounded';
        el.dataset.uid = inst.uid;
        el.dataset.wid = inst.id;
        el.style.setProperty('--w-tint', def.tint || 'linear-gradient(135deg,#0a84ff,#5e5ce6)');
        var body = document.createElement('div');
        body.className = 'bw-body';
        el.appendChild(body);
        inst.el = el;
        inst.body = body;
        makeBadges(inst);
        bindDrag(inst);
        layer.appendChild(el);
        applyGeometry(inst);
        renderInstance(inst);
        instances.push(inst);
        return inst;
    }

    function defaultSettings(def) {
        var out = {};
        (def.settings || []).forEach(function (f) { out[f.key] = f.def; });
        return out;
    }

    function removeInstance(uid) {
        var i = instances.findIndex(function (x) { return x.uid === uid; });
        if (i < 0) return;
        var inst = instances[i];
        try { if (inst._cleanup) inst._cleanup(); } catch (e) {}
        if (inst.el && inst.el.parentNode) inst.el.parentNode.removeChild(inst.el);
        instances.splice(i, 1);
        saveLayout();
        tickSound(true);
        refreshGalleryLists();
    }

    function addWidget(id, size) {
        var def = defs[id];
        if (!def) return null;
        var s = def.sizes.includes(size) ? size : def.defSize;
        // Cascade new cards down the right side, clear of the menu bar.
        var n = instances.length;
        var x = Math.max(16, window.innerWidth - SIZES[s].w - 48 - (n % 3) * 24);
        var y = 56 + (n % 5) * 32;
        var inst = spawnInstance({ id: id, size: s, x: x, y: y, settings: {} });
        if (inst) { saveLayout(); tickSound(true); refreshGalleryLists(); }
        return inst;
    }

    function setEditMode(on) {
        editMode = !!on;
        document.body.classList.toggle('brow-widgets-edit', editMode);
        var btn = $('.bw-edit-toggle');
        if (btn) {
            btn.textContent = editMode ? 'Done' : 'Edit Widgets';
            btn.classList.toggle('is-active', editMode);
        }
        if (!editMode) closePopover();
    }

    // ─── drag ────────────────────────────────────────────────────────────
    var INTERACTIVE = 'input,textarea,button,select,a,[contenteditable],[data-nodrag],.bw-badge,.bw-pop';
    function bindDrag(inst) {
        inst.el.addEventListener('pointerdown', function (e) {
            if (e.button !== 0 && e.pointerType === 'mouse') return;
            if (e.target.closest(INTERACTIVE)) return;
            e.preventDefault();
            var sx = e.clientX - inst.x, sy = e.clientY - inst.y;
            var moved = false;
            var el = inst.el;
            el.classList.add('is-dragging');
            try { el.setPointerCapture(e.pointerId); } catch (err) {}
            var onMove = function (ev) {
                var layerRect = layer.getBoundingClientRect();
                var nx = clamp(ev.clientX - layerRect.left - sx, -SIZES[inst.size].w + 60, layerRect.width - 60);
                var ny = clamp(ev.clientY - layerRect.top - sy, 40, layerRect.height - 60);
                nx = Math.round(nx / GRID) * GRID;
                ny = Math.round(ny / GRID) * GRID;
                if (nx !== inst.x || ny !== inst.y) moved = true;
                inst.x = nx; inst.y = ny;
                applyGeometry(inst);
            };
            var onUp = function () {
                el.classList.remove('is-dragging');
                el.removeEventListener('pointermove', onMove);
                el.removeEventListener('pointerup', onUp);
                el.removeEventListener('pointercancel', onUp);
                if (moved) saveLayout();
            };
            el.addEventListener('pointermove', onMove);
            el.addEventListener('pointerup', onUp);
            el.addEventListener('pointercancel', onUp);
        });
    }

    // ─── settings popover ────────────────────────────────────────────────
    function closePopover() {
        if (popover && popover.parentNode) popover.parentNode.removeChild(popover);
        popover = null;
    }

    function openPopover(inst, anchor) {
        closePopover();
        var def = defs[inst.id];
        popover = document.createElement('div');
        popover.className = 'bw-pop';
        var html = '<div class="bw-pop-title">' + esc(def.name) + ' settings</div>';
        html += '<div class="bw-pop-row"><span>Size</span><div class="bw-sizepills">' +
            def.sizes.map(function (s) {
                return '<button data-size="' + s + '" class="' + (inst.size === s ? 'is-active' : '') + '">' + SIZES[s].label + '</button>';
            }).join('') + '</div></div>';
        (def.settings || []).forEach(function (f) {
            html += '<div class="bw-pop-row"><span>' + esc(f.label) + '</span>' + fieldHtml(inst, f) + '</div>';
        });
        html += '<button class="bw-pop-remove">Remove widget</button>';
        popover.innerHTML = html;
        layer.appendChild(popover);
        // Position near the widget, clamped on screen.
        var lr = layer.getBoundingClientRect();
        var r = inst.el.getBoundingClientRect();
        var pw = 264, ph = Math.min(380, 130 + (def.settings || []).length * 44);
        var px = clamp(r.right - lr.left + 10, 8, Math.max(8, lr.width - pw - 8));
        var py = clamp(r.top - lr.top, 48, Math.max(48, lr.height - ph - 8));
        popover.style.left = px + 'px';
        popover.style.top = py + 'px';
        popover.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
        popover.querySelectorAll('[data-size]').forEach(function (b) {
            b.addEventListener('click', function () {
                inst.size = b.dataset.size;
                applyGeometry(inst);
                saveLayout();
                renderInstance(inst);
                openPopover(inst, anchor);
                refreshGalleryLists();
            });
        });
        (def.settings || []).forEach(function (f) {
            var input = popover.querySelector('[data-field="' + f.key + '"]');
            if (!input) return;
            var commit = function () {
                var v = fieldValue(input, f);
                inst.settings[f.key] = v;
                saveLayout();
                renderInstance(inst);
            };
            input.addEventListener('change', commit);
            if (f.type === 'text' || f.type === 'datetime' || f.type === 'number') {
                input.addEventListener('keydown', function (e) { e.stopPropagation(); });
            }
        });
        var rm = popover.querySelector('.bw-pop-remove');
        if (rm) rm.addEventListener('click', function () { closePopover(); removeInstance(inst.uid); });
        setTimeout(function () {
            document.addEventListener('pointerdown', outsideCloser);
        }, 0);
    }

    function outsideCloser(e) {
        if (popover && !popover.contains(e.target) && !e.target.closest('.bw-gear')) {
            closePopover();
            document.removeEventListener('pointerdown', outsideCloser);
        }
    }

    function fieldHtml(inst, f) {
        var v = inst.settings[f.key] !== undefined ? inst.settings[f.key] : f.def;
        if (f.type === 'select') {
            return '<select data-field="' + f.key + '">' + (f.options || []).map(function (o) {
                var val = Array.isArray(o) ? o[0] : o, label = Array.isArray(o) ? o[1] : o;
                return '<option value="' + esc(val) + '"' + (String(val) === String(v) ? ' selected' : '') + '>' + esc(label) + '</option>';
            }).join('') + '</select>';
        }
        if (f.type === 'toggle') {
            return '<input type="checkbox" data-field="' + f.key + '"' + (v ? ' checked' : '') + '>';
        }
        if (f.type === 'color') {
            return '<div class="bw-swatches" data-fieldwrap="' + f.key + '">' + (f.options || []).map(function (c) {
                return '<button data-field="' + f.key + '" data-val="' + esc(c) + '" class="bw-swatch' +
                    (String(c).toLowerCase() === String(v).toLowerCase() ? ' is-active' : '') +
                    '" style="background:' + esc(c) + '"></button>';
            }).join('') + '</div>';
        }
        if (f.type === 'datetime') {
            return '<input type="datetime-local" data-field="' + f.key + '" value="' + esc(v || '') + '">';
        }
        if (f.type === 'number') {
            return '<input type="number" data-field="' + f.key + '" value="' + esc(v) + '"' +
                (f.min !== undefined ? ' min="' + f.min + '"' : '') +
                (f.max !== undefined ? ' max="' + f.max + '"' : '') + '>';
        }
        if (f.type === 'textarea') {
            return '<textarea data-field="' + f.key + '" rows="3" placeholder="' + esc(f.placeholder || '') + '">' + esc(v || '') + '</textarea>';
        }
        return '<input type="text" data-field="' + f.key + '" value="' + esc(v || '') + '" placeholder="' + esc(f.placeholder || '') + '">';
    }

    function fieldValue(input, f) {
        if (input.classList && input.classList.contains('bw-swatch')) {
            var wrap = input.parentNode;
            wrap.querySelectorAll('.bw-swatch').forEach(function (s) { s.classList.remove('is-active'); });
            input.classList.add('is-active');
            return input.dataset.val;
        }
        if (f.type === 'toggle') return !!input.checked;
        if (f.type === 'number') return Number(input.value);
        return input.value;
    }

    // swatch clicks behave like change events
    document.addEventListener('click', function (e) {
        var sw = e.target.closest && e.target.closest('.bw-swatch[data-field]');
        if (!sw || !popover || !popover.contains(sw)) return;
        var key = sw.dataset.field;
        var wrap = sw.parentNode;
        wrap.querySelectorAll('.bw-swatch').forEach(function (s) { s.classList.remove('is-active'); });
        sw.classList.add('is-active');
        // find owning instance via open popover context
        if (popover._inst) {
            popover._inst.settings[key] = sw.dataset.val;
            saveLayout();
            renderInstance(popover._inst);
        }
    });

    // ─── gallery (Widgets app window) ────────────────────────────────────
    var galleryState = {
        cat: 'all',
        query: ''
    };

    var CAT_LABELS = {
        all: 'All Widgets',
        essentials: 'Essentials',
        productivity: 'Productivity',
        media: 'Media & Audio',
        system: 'System & Utility'
    };

    function openGallery(edit) {
        try {
            if (window.appsManager) window.appsManager.launchApp('widgets');
            else if (window.desktop) window.desktop.launchApp('widgets');
        } catch (e) {}
        setTimeout(function () {
            var host = document.querySelector('.bw-gallery-host');
            if (host) mountGallery(host);
            if (edit) setEditMode(true);
        }, 250);
    }

    function mountGallery(host) {
        host.innerHTML = '';
        var root = document.createElement('div');
        root.className = 'bw-gallery';

        var catCounts = { all: defOrder.length, essentials: 0, productivity: 0, media: 0, system: 0 };
        defOrder.forEach(function (id) {
            var d = defs[id];
            var c = (d && d.category) || 'essentials';
            if (catCounts[c] !== undefined) catCounts[c]++;
        });

        root.innerHTML =
            '<div class="bw-g-head">' +
                '<div class="bw-g-head-text">' +
                    '<div class="bw-g-title-badge">' +
                        '<div class="bw-g-icon-bubble">' +
                            '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="3.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="3.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/></svg>' +
                        '</div>' +
                        '<h2>Widget Studio</h2>' +
                        '<span class="bw-g-badge-count">' + defOrder.length + ' Available</span>' +
                    '</div>' +
                    '<p>Luminous glass surfaces for your desktop — choose a size, preview live, and place with a single click.</p>' +
                '</div>' +
                '<div class="bw-g-head-actions">' +
                    '<div class="bw-g-search-wrap">' +
                        '<svg class="bw-g-search-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg>' +
                        '<input class="bw-g-search" type="search" placeholder="Search ' + defOrder.length + ' widgets…">' +
                    '</div>' +
                    '<button class="bw-edit-toggle' + (editMode ? ' is-active' : '') + '">' +
                        '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> ' +
                        (editMode ? 'Done' : 'Arrange') +
                    '</button>' +
                '</div>' +
            '</div>' +
            '<div class="bw-g-filters">' +
                '<button class="bw-filter-pill is-active" data-cat="all">' +
                    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>' +
                    '<span>All</span><span class="bw-pill-count">' + catCounts.all + '</span>' +
                '</button>' +
                '<button class="bw-filter-pill" data-cat="essentials">' +
                    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' +
                    '<span>Essentials</span><span class="bw-pill-count">' + (catCounts.essentials || 0) + '</span>' +
                '</button>' +
                '<button class="bw-filter-pill" data-cat="productivity">' +
                    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' +
                    '<span>Productivity</span><span class="bw-pill-count">' + (catCounts.productivity || 0) + '</span>' +
                '</button>' +
                '<button class="bw-filter-pill" data-cat="media">' +
                    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>' +
                    '<span>Media &amp; Audio</span><span class="bw-pill-count">' + (catCounts.media || 0) + '</span>' +
                '</button>' +
                '<button class="bw-filter-pill" data-cat="system">' +
                    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>' +
                    '<span>System &amp; Telemetry</span><span class="bw-pill-count">' + (catCounts.system || 0) + '</span>' +
                '</button>' +
            '</div>' +
            '<div class="bw-g-placed-strip"></div>' +
            '<div class="bw-g-sec">' +
                '<div class="bw-g-sec-head">' +
                    '<div class="bw-sec-title-wrap">' +
                        '<h3>Widget Showcase</h3>' +
                        '<span class="bw-sec-rule">1 widget per row · full preview · interactive controls</span>' +
                    '</div>' +
                    '<span class="bw-g-match-count"></span>' +
                '</div>' +
                '<div class="bw-g-grid"></div>' +
            '</div>' +
            '<div class="bw-g-foot">Press <kbd>F8</kbd> anytime to open this gallery. Drag widgets across your wallpaper by their glass surface.</div>';
        
        host.appendChild(root);

        root.querySelector('.bw-edit-toggle').addEventListener('click', function () {
            setEditMode(!editMode);
            this.innerHTML = (editMode
                ? '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Done'
                : '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Arrange');
            this.classList.toggle('is-active', editMode);
        });

        var search = root.querySelector('.bw-g-search');
        search.addEventListener('input', function () {
            galleryState.query = search.value;
            renderGalleryGrid(root);
        });
        search.addEventListener('keydown', function (e) { e.stopPropagation(); });

        root.querySelectorAll('.bw-filter-pill').forEach(function (btn) {
            btn.addEventListener('click', function () {
                galleryState.cat = btn.dataset.cat;
                root.querySelectorAll('.bw-filter-pill').forEach(function (b) {
                    b.classList.toggle('is-active', b === btn);
                });
                renderGalleryGrid(root);
            });
        });

        renderGalleryGrid(root);
        renderGalleryList(root);
        root._isGallery = true;
        host._galleryRoot = root;
    }

    function monogram(name) {
        var words = String(name || '?').split(/\s+/);
        return ((words[0] || '?')[0] + (words[1] ? words[1][0] : '')).toUpperCase();
    }

    function previewFor(def, size) {
        try {
            if (def && typeof def.preview === 'function') return def.preview(size || def.defSize || 'm');
            if (def && typeof def.preview === 'string') return def.preview;
        } catch (e) {}
        return '<div class="bw-prev-mono">' + esc(monogram(def && def.name)) + '</div>';
    }

    function renderGalleryGrid(root) {
        var grid = root.querySelector('.bw-g-grid');
        if (!grid) return;
        var q = (galleryState.query || '').toLowerCase().trim();
        var cat = galleryState.cat || 'all';
        grid.innerHTML = '';

        var matches = 0;
        defOrder.forEach(function (id) {
            var def = defs[id];
            if (!def) return;
            var widgetCat = def.category || 'essentials';
            if (cat !== 'all' && widgetCat !== cat) return;
            if (q) {
                var searchStr = (def.name + ' ' + (def.desc || '') + ' ' + (def.tags || []).join(' ')).toLowerCase();
                if (searchStr.indexOf(q) < 0) return;
            }
            matches++;

            var placedInsts = instances.filter(function (x) { return x.id === id; });
            var chosen = def.defSize || def.sizes[0] || 'm';

            var card = document.createElement('div');
            card.className = 'bw-g-card';
            card.style.setProperty('--w-tint', def.tint || 'linear-gradient(135deg,#0a84ff,#5e5ce6)');
            card.style.setProperty('--w-glow', def.glow || 'rgba(10, 132, 255, 0.3)');

            var categoryBadge = CAT_LABELS[widgetCat] || 'Widget';

            function makePreviewHtml(sz) {
                var shape = def.shape || 'rounded';
                return '<div class="bw-prev-card bw-prev-card-' + sz + ' bw-shape-' + shape + '" data-wid="' + def.id + '" data-shape="' + shape + '" data-size="' + sz + '">' +
                    previewFor(def, sz) +
                '</div>';
            }

            var tagsHtml = (def.tags || []).map(function (t) {
                return '<span class="bw-tag">' + esc(t) + '</span>';
            }).join('');

            var sizesHtml = def.sizes.map(function (s) {
                var activeCls = s === chosen ? ' is-active' : '';
                return '<button type="button" class="bw-size-btn' + activeCls + '" data-size="' + s + '">' + s.toUpperCase() + '</button>';
            }).join('');

            var placedBadgeHtml = placedInsts.length
                ? '<span class="bw-g-placed-pill"><i class="bw-pulse-dot"></i> ' + placedInsts.length + ' on desktop</span>'
                : '';

            var locateBtnHtml = placedInsts.length
                ? '<button type="button" class="bw-g-locate-btn" title="Locate on desktop"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/></svg> Locate</button>'
                : '';

            card.innerHTML =
                makePreviewHtml(chosen) +
                '<div class="bw-g-info">' +
                    '<div class="bw-g-meta-line">' +
                        '<span class="bw-g-cat-tag">' + esc(categoryBadge) + '</span>' +
                        placedBadgeHtml +
                    '</div>' +
                    '<h3 class="bw-g-title">' + esc(def.name) + '</h3>' +
                    '<p class="bw-g-desc">' + esc(def.desc || '') + '</p>' +
                    (tagsHtml ? '<div class="bw-g-tags-row">' + tagsHtml + '</div>' : '') +
                '</div>' +
                '<div class="bw-g-actions">' +
                    '<div class="bw-g-size-block">' +
                        '<span class="bw-size-hdr">CHOOSE SIZE</span>' +
                        '<div class="bw-g-sizes">' + sizesHtml + '</div>' +
                        '<span class="bw-size-hint">' + SIZES[chosen].label + ' · ' + getDim(def, chosen).w + ' × ' + getDim(def, chosen).h + ' px</span>' +
                    '</div>' +
                    '<div class="bw-g-btn-group">' +
                        '<button type="button" class="bw-g-add">' +
                            '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> ' +
                            (placedInsts.length ? 'Add Another' : 'Add to Desktop') +
                        '</button>' +
                        locateBtnHtml +
                    '</div>' +
                '</div>';

            // Wire size buttons
            var sizeHint = card.querySelector('.bw-size-hint');
            card.querySelectorAll('.bw-size-btn').forEach(function (b) {
                b.addEventListener('click', function () {
                    chosen = b.dataset.size;
                    card.querySelectorAll('.bw-size-btn').forEach(function (x) {
                        x.classList.toggle('is-active', x === b);
                    });
                    if (sizeHint) {
                        var dim = getDim(def, chosen); sizeHint.textContent = SIZES[chosen].label + ' · ' + dim.w + ' × ' + dim.h + ' px';
                    }
                    var prevEl = card.querySelector('.bw-prev-card');
                    if (prevEl) {
                        var shape = def.shape || 'rounded';
                        prevEl.className = 'bw-prev-card bw-prev-card-' + chosen + ' bw-shape-' + shape;
                        prevEl.dataset.size = chosen;
                        prevEl.dataset.shape = shape;
                        prevEl.innerHTML = previewFor(def, chosen);
                    }
                });
            });

            // Wire Add button
            var addBtn = card.querySelector('.bw-g-add');
            if (addBtn) {
                addBtn.addEventListener('click', function () {
                    addWidget(id, chosen);
                    addBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg> Added!';
                    addBtn.classList.add('is-success');
                    setTimeout(function () {
                        if (addBtn.isConnected) {
                            addBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add Another';
                            addBtn.classList.remove('is-success');
                        }
                    }, 1400);
                });
            }

            // Wire Locate button
            var locateBtn = card.querySelector('.bw-g-locate-btn');
            if (locateBtn && placedInsts.length) {
                locateBtn.addEventListener('click', function () {
                    placedInsts.forEach(function (inst) {
                        if (inst.el) {
                            inst.el.classList.remove('bw-flash');
                            void inst.el.offsetWidth;
                            inst.el.classList.add('bw-flash');
                            setTimeout(function () { inst.el.classList.remove('bw-flash'); }, 1400);
                        }
                    });
                });
            }

            grid.appendChild(card);
        });

        var matchEl = root.querySelector('.bw-g-match-count');
        if (matchEl) {
            matchEl.textContent = matches + (matches === 1 ? ' widget' : ' widgets');
        }

        if (!matches) {
            grid.innerHTML =
                '<div class="bw-g-empty-card">' +
                    '<div class="bw-empty-icon">🔍</div>' +
                    '<h4>No widgets found</h4>' +
                    '<p>No widgets matched "' + esc(q || cat) + '". Try searching for something else or pick "All".</p>' +
                '</div>';
        }
    }

    function renderGalleryList(root) {
        var strip = root.querySelector('.bw-g-placed-strip');
        if (!strip) return;

        if (!instances.length) {
            strip.innerHTML =
                '<div class="bw-strip-empty">' +
                    '<span class="bw-strip-dot"></span> No widgets currently placed on your desktop. Browse below to add your first one!' +
                '</div>';
            return;
        }

        var chips = instances.map(function (inst) {
            var def = defs[inst.id];
            var name = def ? def.name : inst.id;
            return '<div class="bw-placed-chip" data-uid="' + inst.uid + '">' +
                '<span class="bw-chip-name">' + esc(name) + '</span>' +
                '<span class="bw-chip-size">' + SIZES[inst.size].label + '</span>' +
                '<button type="button" class="bw-chip-flash" title="Locate"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/></svg></button>' +
                '<button type="button" class="bw-chip-del" title="Remove">×</button>' +
            '</div>';
        }).join('');

        strip.innerHTML =
            '<div class="bw-strip-header">' +
                '<span>ON DESKTOP (' + instances.length + ')</span>' +
                '<button type="button" class="bw-strip-clear">Clear All</button>' +
            '</div>' +
            '<div class="bw-strip-chips">' + chips + '</div>';

        strip.querySelectorAll('.bw-placed-chip').forEach(function (chip) {
            var uid = chip.dataset.uid;
            var inst = instances.find(function (x) { return x.uid === uid; });
            if (!inst) return;
            var flashBtn = chip.querySelector('.bw-chip-flash');
            if (flashBtn) {
                flashBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    if (inst.el) {
                        inst.el.classList.remove('bw-flash');
                        void inst.el.offsetWidth;
                        inst.el.classList.add('bw-flash');
                        setTimeout(function () { inst.el.classList.remove('bw-flash'); }, 1400);
                    }
                });
            }
            var delBtn = chip.querySelector('.bw-chip-del');
            if (delBtn) {
                delBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    removeInstance(uid);
                });
            }
        });

        var clearBtn = strip.querySelector('.bw-strip-clear');
        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                while (instances.length) {
                    removeInstance(instances[0].uid);
                }
            });
        }
    }

    function refreshGalleryLists() {
        document.querySelectorAll('.bw-gallery').forEach(function (root) {
            renderGalleryGrid(root);
            renderGalleryList(root);
        });
    }

    // ─── shortcut (registered with the universal BrowShortcuts layer) ────
    // Gallery opens on the F8 desktop key — see js/shortcuts.js.
    function ensureLayer() {
        layer = document.getElementById(LAYER_ID);
        if (layer) return layer;
        var desktop = document.getElementById('desktop');
        if (!desktop) return null;
        layer = document.createElement('div');
        layer.id = LAYER_ID;
        layer.className = 'brow-widget-layer';
        desktop.appendChild(layer);
        return layer;
    }

    function ensureMenuButton() {
        var bar = document.querySelector('#menu-bar .status-bar');
        if (!bar || document.getElementById('brow-widgets-btn')) return;
        var btn = document.createElement('button');
        btn.id = 'brow-widgets-btn';
        btn.className = 'status-widgets-btn';
        btn.title = 'Widgets (F8)';
        btn.setAttribute('aria-label', 'Open widget gallery');
        btn.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="3.5" width="7" height="7" rx="3.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="3.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.8"/></svg>';
        btn.addEventListener('click', function (e) { e.stopPropagation(); openGallery(false); });
        bar.insertBefore(btn, bar.firstChild);
    }

    function bindShortcut() {
        // Gallery opens via the global F8 desktop key registered in
        // js/shortcuts.js (legacy Alt+W removed — menu-mnemonic conflict).
    }

    function init() {
        if (!ensureLayer()) return;
        ensureMenuButton();
        bindShortcut();
        loadLayout().forEach(function (entry) {
            try { spawnInstance(entry); } catch (e) {}
        });
        // keep pre-existing open gallery windows live
        document.querySelectorAll('.bw-gallery-host').forEach(mountGallery);
        if (!tickTimer) {
            tickTimer = setInterval(function () {
                for (const inst of instances.slice()) {
                    var def = defs[inst.id];
                    if (def && typeof def.tick === 'function' && inst.body && document.body.contains(inst.el)) {
                        try { def.tick(inst.body, apiFor(inst)); } catch (e) {}
                    }
                }
            }, 1000);
        }
        requestAnimationFrame(fpsLoop);
        window.addEventListener('resize', function () {
            instances.forEach(function (inst) {
                var s = SIZES[inst.size] || SIZES.m;
                var r = layer.getBoundingClientRect();
                inst.x = clamp(inst.x, -s.w + 60, r.width - 60);
                inst.y = clamp(inst.y, 40, r.height - 60);
                applyGeometry(inst);
            });
        });
    }

    // public surface
    window.BrowWidgets = {
        define: define,
        init: init,
        openGallery: openGallery,
        mountGallery: mountGallery,
        addWidget: addWidget,
        removeInstance: removeInstance,
        removeWidget: removeInstance,
        setEditMode: setEditMode,
        toggleEditMode: function () { setEditMode(!editMode); },
        isEditMode: function () { return editMode; },
        list: function () { return instances.slice(); },
        defs: function () { return defOrder.map(function (id) { return defs[id]; }); },
        storeGet: storeGet,
        storeSet: storeSet,
        esc: esc,
        fps: function () { return fpsState.fps; },
        SIZES: SIZES
    };
})();
