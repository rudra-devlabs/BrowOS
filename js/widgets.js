/* BrowWidgets — desktop widget engine + Widgets app.
 *
 * Two surfaces share one registry of widget definitions:
 *
 *   · the desktop layer — free-position tiles you can drag, remove and
 *     re-configure, persisted to localStorage
 *   · the Widgets app   — a poster grid of every widget on a grey canvas.
 *     Clicking a tile opens an options sheet holding a live preview, a size
 *     picker, the widget's own settings and an "Add to Desktop" action.
 *
 * Definition contract:
 *
 *   BW.define({
 *       id, name, desc,
 *       tone: 'dark' | 'light',        // opaque black or opaque white tile
 *       shape: 'rounded' | 'circle' | 'capsule',
 *       sizes: ['s','m','l'], defSize: 'm',
 *       settings: [{ key, label, type, def, options, min, max }],
 *       render(el, api),               // paint the interior; may return a cleanup fn
 *       tick(el, api),                 // once a second, while mounted
 *       onTap(el, api)                 // a press that did not turn into a drag
 *   });
 *
 * `onTap` is what makes a whole tile actionable without any extra markup: the
 * drag handler already swallows the press to move the tile, so a press that
 * never moved is a tap. Presses that land on a `data-nodrag` control never
 * reach it — those controls own their own click.
 *
 * The interior markup is written into an element that already carries
 * `bw-w bw-w-<id>`, so CSS owns all layout and the renderer owns only data.
 */
(function () {
    'use strict';

    var LAYOUT_KEY = 'browos_widgets_v2';
    var LAYER_ID = 'brow-widget-layer';
    // The size system is deliberately self-consistent, the way macOS sizes its
    // widgets: a medium is exactly two smalls plus one gutter, and a large is
    // two mediums stacked. That single property is what lets the gallery lay
    // out on a real grid with flush edges — 170 + 18 + 170 = 358. It is also
    // what a "medium" should mean on the desktop: twice a small, not a third
    // width that tiles with nothing. If you change the gutter, change
    // .bw-g-grid's `gap` in css/widgets.css to match or the grid stops tiling.
    var SIZES = {
        s: { w: 170, h: 170, label: 'Small' },
        m: { w: 358, h: 170, label: 'Medium' },
        l: { w: 358, h: 358, label: 'Large' }
    };
    var UNIT = SIZES.s.w;      // gallery grid column width
    var GRID = 4;              // desktop drag snap, in px
    var STAGE_BOX = 208;       // options-sheet preview bounding box

    var defs = {};
    var defOrder = [];
    var instances = [];        // { uid, id, size, x, y, settings, el, body }
    var uidSeq = 1;
    var editMode = false;
    var initialized = false;
    var layer = null;
    var sheet = null;          // { scrim, close }
    var tickTimer = null;
    var galleryLive = [];      // live previews inside the gallery grid
    var fpsState = { frames: 0, last: 0, fps: 0 };

    // ─── helpers ─────────────────────────────────────────────────────────
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

    function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

    function pad2(n) { return String(n).padStart(2, '0'); }

    function tickSound(ok) {
        try {
            if (window.BrowSettings && window.BrowSettings.audio) {
                window.BrowSettings.audio.play(ok === false ? 'fail' : 'tick');
            }
        } catch (e) {}
    }

    function openApp(app) {
        try {
            if (window.appsManager && window.appsManager.launchApp) window.appsManager.launchApp(app);
            else if (window.desktop && window.desktop.launchApp) window.desktop.launchApp(app);
        } catch (e) {}
    }

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
        // Derive from SIZES so the starter layout cannot drift when a size
        // changes — the old hardcoded `vw - 310` assumed a 290px medium.
        var MW = SIZES.m.w, MH = SIZES.m.h, SW = SIZES.s.w, PAD = 20, GAP = 14;
        return [
            { uid: 'w-cal',     id: 'cal',     size: 'm', x: vw - MW - PAD, y: 44, settings: {} },
            { uid: 'w-todo',    id: 'todo',    size: 'm', x: vw - MW - PAD, y: 44 + MH + GAP, settings: {} },
            { uid: 'w-weather', id: 'weather', size: 'm', x: Math.max(40, vw - SW - PAD - 24 - MW), y: vh - MH - 50, settings: {} },
            { uid: 'w-clock',   id: 'clock',   size: 's', x: vw - SW - PAD, y: vh - MH - 50, settings: {} }
        ];
    }

    function loadLayout() {
        var saved = storeGet(LAYOUT_KEY, null);
        if (!Array.isArray(saved)) return defaultLayout();
        // Drop entries whose widget no longer exists (forward-compatible).
        return saved.filter(function (e) { return e && defs[e.id]; });
    }

    function saveLayout() {
        storeSet(LAYOUT_KEY, instances.map(function (inst) {
            return {
                uid: inst.uid, id: inst.id, size: inst.size,
                x: Math.round(inst.x), y: Math.round(inst.y),
                settings: inst.settings || {}
            };
        }));
    }

    // ─── engine ──────────────────────────────────────────────────────────
    function define(def) {
        if (!def || !def.id || typeof def.render !== 'function') return;
        def.sizes = (def.sizes && def.sizes.length) ? def.sizes : ['m'];
        if (def.sizes.indexOf(def.defSize) < 0) def.defSize = def.sizes[0];
        def.tone = def.tone || 'dark';
        def.shape = def.shape || 'rounded';
        if (!defs[def.id]) defOrder.push(def.id);
        defs[def.id] = def;
    }

    function getDim(def, sz) { return SIZES[sz] || SIZES.m; }

    function defaultSettings(def) {
        var out = {};
        (def.settings || []).forEach(function (f) { out[f.key] = f.def; });
        return out;
    }

    function makeApi(def, size, settings, el, refresh) {
        return {
            inst: { id: def.id, size: size, settings: settings },
            settings: settings,
            el: el,
            refresh: refresh,
            set: function (key, val) { settings[key] = val; refresh(); },
            openApp: openApp
        };
    }

    function renderInto(def, el, settings, size, refresh) {
        el.innerHTML = '';
        try {
            return def.render(el, makeApi(def, size, settings, el, refresh));
        } catch (e) {
            console.warn('[widgets] render failed for ' + def.id, e);
            el.innerHTML = '<div class="bw-sub" style="margin:auto">' + esc(def.name) + '</div>';
            return null;
        }
    }

    function renderInstance(inst) {
        var def = defs[inst.id];
        if (!def || !inst.body) return;
        if (inst._cleanup) { try { inst._cleanup(); } catch (e) {} inst._cleanup = null; }
        var cleanup = renderInto(def, inst.body, inst.settings, inst.size, function () {
            renderInstance(inst);
        });
        if (typeof cleanup === 'function') inst._cleanup = cleanup;
    }

    function applyGeometry(inst) {
        var s = getDim(defs[inst.id], inst.size);
        inst.el.style.width = s.w + 'px';
        inst.el.style.height = s.h + 'px';
        inst.el.style.transform = 'translate(' + inst.x + 'px,' + inst.y + 'px)';
        inst.el.dataset.size = inst.size;
    }

    // ─── a scaled widget surface (shared by the gallery and the sheet) ───
    // Returns a box whose layout size is the scaled size; the widget inside
    // is laid out at its natural size and scaled about its own centre, so
    // every internal proportion (type, radius, hairlines) stays exact.
    function buildSurface(def, size, k) {
        var dim = getDim(def, size);
        var box = document.createElement('div');
        box.className = 'bw-sbox';
        box.style.width = Math.round(dim.w * k) + 'px';
        box.style.height = Math.round(dim.h * k) + 'px';

        var shell = document.createElement('div');
        shell.className = 'desktop-widget';
        shell.dataset.tone = def.tone;
        if (def.shape !== 'rounded') shell.classList.add('bw-shape-' + def.shape);
        shell.style.width = dim.w + 'px';
        shell.style.height = dim.h + 'px';
        shell.style.transform = 'translate(-50%,-50%) scale(' + k + ')';

        var body = document.createElement('div');
        body.className = 'bw-w bw-w-' + def.id;

        shell.appendChild(body);
        box.appendChild(shell);
        return { box: box, shell: shell, body: body, dim: dim };
    }

    // ─── desktop instances ───────────────────────────────────────────────
    function resizeInstance(uid, newSize) {
        var inst = null;
        for (var i = 0; i < instances.length; i++) {
            if (instances[i].uid === uid) { inst = instances[i]; break; }
        }
        if (!inst) return;
        var def = defs[inst.id];
        if (!def || (def.sizes && def.sizes.indexOf(newSize) < 0)) return;

        inst.size = newSize;
        var dim = getDim(def, newSize);
        var r = layer ? layer.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight };
        inst.x = clamp(inst.x, 16, Math.max(16, r.width - dim.w - 16));
        inst.y = clamp(inst.y, 40, Math.max(40, r.height - dim.h - 16));

        // Update size badge label if present
        var sizeBadge = inst.el.querySelector('.bw-size-badge');
        if (sizeBadge) sizeBadge.textContent = newSize.toUpperCase();

        applyGeometry(inst);
        renderInstance(inst);
        saveLayout();
        tickSound(true);
        refreshGallery();
    }

    function showWidgetContextMenu(x, y, inst) {
        // Remove any open context menus
        document.querySelectorAll('.mac-context-menu').forEach(function (m) { m.remove(); });

        var def = defs[inst.id];
        if (!def) return;

        var menu = document.createElement('div');
        menu.className = 'mac-context-menu visible bw-widget-ctx';
        menu.dataset.source = 'widget';

        var titleItem = document.createElement('div');
        titleItem.className = 'mac-context-menu-item bw-ctx-header';
        titleItem.textContent = def.name || 'Widget';
        menu.appendChild(titleItem);

        var div1 = document.createElement('div');
        div1.className = 'mac-context-menu-divider';
        menu.appendChild(div1);

        // Size options: Small, Medium, Large
        var sizes = def.sizes || ['s', 'm', 'l'];
        sizes.forEach(function (s) {
            var label = SIZES[s] ? SIZES[s].label : s.toUpperCase();
            var item = document.createElement('div');
            item.className = 'mac-context-menu-item';
            var isCurrent = inst.size === s;
            item.innerHTML = (isCurrent ? '✓ ' : '&nbsp;&nbsp;&nbsp;') + esc(label);
            item.addEventListener('click', function () {
                menu.remove();
                if (inst.size !== s) resizeInstance(inst.uid, s);
            });
            menu.appendChild(item);
        });

        var div2 = document.createElement('div');
        div2.className = 'mac-context-menu-divider';
        menu.appendChild(div2);

        // Configure Widget option
        var editItem = document.createElement('div');
        editItem.className = 'mac-context-menu-item';
        editItem.innerHTML = '⚙ Configure Widget...';
        editItem.addEventListener('click', function () {
            menu.remove();
            openSheet(def, null, inst);
        });
        menu.appendChild(editItem);

        // Remove Widget option
        var removeItem = document.createElement('div');
        removeItem.className = 'mac-context-menu-item danger';
        removeItem.innerHTML = '✕ Remove Widget';
        removeItem.addEventListener('click', function () {
            menu.remove();
            removeInstance(inst.uid);
        });
        menu.appendChild(removeItem);

        document.body.appendChild(menu);

        // Keep inside screen bounds
        var rect = menu.getBoundingClientRect();
        var left = Math.min(x, window.innerWidth - rect.width - 8);
        var top = Math.min(y, window.innerHeight - rect.height - 8);
        menu.style.left = Math.max(8, left) + 'px';
        menu.style.top = Math.max(8, top) + 'px';

        function dismiss(e) {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('pointerdown', dismiss);
            }
        }
        setTimeout(function () { document.addEventListener('pointerdown', dismiss); }, 10);
    }

    // ─── desktop instances ───────────────────────────────────────────────
    function makeBadges(inst) {
        var remove = document.createElement('button');
        remove.className = 'bw-badge bw-remove';
        remove.type = 'button';
        remove.textContent = '×';
        remove.title = 'Remove widget';
        remove.addEventListener('click', function (e) {
            e.stopPropagation();
            removeInstance(inst.uid);
        });

        var gear = document.createElement('button');
        gear.className = 'bw-badge bw-gear';
        gear.type = 'button';
        gear.textContent = '⚙';
        gear.title = 'Widget options';
        gear.addEventListener('click', function (e) {
            e.stopPropagation();
            openSheet(defs[inst.id], null, inst);
        });

        // Size cycle badge in edit mode
        var sizeBadge = document.createElement('button');
        sizeBadge.className = 'bw-badge bw-size-badge';
        sizeBadge.type = 'button';
        sizeBadge.textContent = inst.size.toUpperCase();
        sizeBadge.title = 'Cycle size (S/M/L)';
        sizeBadge.addEventListener('click', function (e) {
            e.stopPropagation();
            var def = defs[inst.id];
            var sizes = (def && def.sizes) || ['s', 'm', 'l'];
            var nextIdx = (sizes.indexOf(inst.size) + 1) % sizes.length;
            resizeInstance(inst.uid, sizes[nextIdx]);
        });

        // Bottom-right corner resize handle
        var resizeHandle = document.createElement('div');
        resizeHandle.className = 'bw-resize-handle';
        resizeHandle.title = 'Drag or click to resize';
        resizeHandle.setAttribute('data-nodrag', 'true');

        // Click on handle cycles size
        resizeHandle.addEventListener('click', function (e) {
            e.stopPropagation();
            var def = defs[inst.id];
            var sizes = (def && def.sizes) || ['s', 'm', 'l'];
            var nextIdx = (sizes.indexOf(inst.size) + 1) % sizes.length;
            resizeInstance(inst.uid, sizes[nextIdx]);
        });

        // Drag on handle resizes dynamically
        bindResizeHandle(resizeHandle, inst);

        inst.el.appendChild(remove);
        inst.el.appendChild(gear);
        inst.el.appendChild(sizeBadge);
        inst.el.appendChild(resizeHandle);
    }

    function bindResizeHandle(handle, inst) {
        handle.addEventListener('pointerdown', function (e) {
            if (e.button !== 0 && e.pointerType === 'mouse') return;
            e.preventDefault();
            e.stopPropagation();

            var startX = e.clientX;
            var startY = e.clientY;
            var initialSize = inst.size;
            var def = defs[inst.id];
            var sizes = (def && def.sizes) || ['s', 'm', 'l'];
            var moved = false;

            handle.classList.add('is-resizing');
            try { handle.setPointerCapture(e.pointerId); } catch (err) {}

            function onMove(ev) {
                var dx = ev.clientX - startX;
                var dy = ev.clientY - startY;
                if (Math.abs(dx) > 10 || Math.abs(dy) > 10) moved = true;

                // Thresholds based on current size
                var targetSize = initialSize;
                if (dx > 100 && dy > 100) {
                    targetSize = sizes.indexOf('l') >= 0 ? 'l' : (sizes.indexOf('m') >= 0 ? 'm' : sizes[0]);
                } else if (dx > 90 || dy > 60) {
                    targetSize = sizes.indexOf('m') >= 0 ? 'm' : (sizes.indexOf('l') >= 0 ? 'l' : sizes[0]);
                } else if (dx < -60 || dy < -60) {
                    targetSize = sizes[0];
                }

                if (targetSize !== inst.size) {
                    resizeInstance(inst.uid, targetSize);
                }
            }

            function onUp(ev) {
                handle.classList.remove('is-resizing');
                handle.removeEventListener('pointermove', onMove);
                handle.removeEventListener('pointerup', onUp);
                handle.removeEventListener('pointercancel', onUp);
                if (!moved) {
                    // Quick click: cycle size
                    var nextIdx = (sizes.indexOf(inst.size) + 1) % sizes.length;
                    resizeInstance(inst.uid, sizes[nextIdx]);
                }
            }

            handle.addEventListener('pointermove', onMove);
            handle.addEventListener('pointerup', onUp);
            handle.addEventListener('pointercancel', onUp);
        });
    }

    function spawnInstance(entry) {
        var def = defs[entry.id];
        if (!def) return null;

        var inst = {
            uid: entry.uid || ('w' + Date.now().toString(36) + (uidSeq++)),
            id: entry.id,
            size: (def.sizes && def.sizes.indexOf(entry.size) >= 0) ? entry.size : def.defSize,
            x: typeof entry.x === 'number' ? entry.x : 120,
            y: typeof entry.y === 'number' ? entry.y : 80,
            settings: Object.assign(defaultSettings(def), entry.settings || {})
        };

        var el = document.createElement('div');
        el.className = 'brow-widget';
        el.dataset.uid = inst.uid;
        el.dataset.wid = inst.id;

        var shell = document.createElement('div');
        shell.className = 'desktop-widget';
        shell.dataset.tone = def.tone;
        if (def.shape !== 'rounded') shell.classList.add('bw-shape-' + def.shape);

        var body = document.createElement('div');
        body.className = 'bw-w bw-w-' + def.id;

        shell.appendChild(body);
        el.appendChild(shell);

        inst.el = el;
        inst.shell = shell;
        inst.body = body;

        makeBadges(inst);
        bindDrag(inst);

        // Right-click context menu
        el.addEventListener('contextmenu', function (e) {
            e.preventDefault();
            e.stopPropagation();
            showWidgetContextMenu(e.clientX, e.clientY, inst);
        });

        layer.appendChild(el);
        applyGeometry(inst);
        renderInstance(inst);
        instances.push(inst);
        return inst;
    }

    function removeInstance(uid) {
        var i = -1;
        instances.forEach(function (x, n) { if (x.uid === uid) i = n; });
        if (i < 0) return;
        var inst = instances[i];
        if (inst._cleanup) { try { inst._cleanup(); } catch (e) {} }
        if (inst.el && inst.el.parentNode) inst.el.parentNode.removeChild(inst.el);
        instances.splice(i, 1);
        saveLayout();
        tickSound(true);
        refreshGallery();
    }

    function addWidget(id, size) {
        var def = defs[id];
        if (!def) return null;
        var s = (def.sizes && def.sizes.indexOf(size) >= 0) ? size : def.defSize;
        // Cascade new tiles down the right edge, clear of the menu bar.
        var n = instances.length;
        var dim = getDim(def, s);
        var x = Math.max(16, window.innerWidth - dim.w - 48 - (n % 3) * 24);
        var y = 56 + (n % 5) * 32;
        var inst = spawnInstance({ id: id, size: s, x: x, y: y, settings: {} });
        if (inst) { saveLayout(); tickSound(true); refreshGallery(); }
        return inst;
    }

    function setEditMode(on) {
        editMode = !!on;
        document.body.classList.toggle('brow-widgets-edit', editMode);
        if (!editMode) closeSheet();
    }

    // ─── drag & tap ──────────────────────────────────────────────────────
    var INTERACTIVE = 'input,textarea,button,select,a,[contenteditable],[data-nodrag],.bw-badge,.bw-resize-handle';

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

            function onMove(ev) {
                var r = layer.getBoundingClientRect();
                var dim = getDim(defs[inst.id], inst.size);
                var nx = clamp(ev.clientX - r.left - sx, -dim.w + 60, r.width - 60);
                var ny = clamp(ev.clientY - r.top - sy, 40, r.height - 60);
                nx = Math.round(nx / GRID) * GRID;
                ny = Math.round(ny / GRID) * GRID;
                if (nx !== inst.x || ny !== inst.y) moved = true;
                inst.x = nx;
                inst.y = ny;
                applyGeometry(inst);
            }

            function onUp(ev) {
                el.classList.remove('is-dragging');
                el.removeEventListener('pointermove', onMove);
                el.removeEventListener('pointerup', onUp);
                el.removeEventListener('pointercancel', onUp);
                if (moved) { saveLayout(); return; }

                // A press that never moved is a tap!
                if (!ev || ev.type !== 'pointerup') return;
                var def = defs[inst.id];
                if (!def) return;

                if (typeof def.onTap === 'function') {
                    try {
                        def.onTap(inst.body, makeApi(def, inst.size, inst.settings, inst.body,
                            function () { renderInstance(inst); }), ev);
                    } catch (e) { console.warn('[widgets] onTap failed for ' + inst.id, e); }
                } else {
                    // Default fallback action: launch the matching application!
                    openApp(inst.id);
                }
            }

            el.addEventListener('pointermove', onMove);
            el.addEventListener('pointerup', onUp);
            el.addEventListener('pointercancel', onUp);
        });
    }

    // ─── gallery (the Widgets app) ───────────────────────────────────────
    function openGallery() {
        openApp('widgets');
        setTimeout(function () {
            var host = document.querySelector('.bw-gallery-host');
            if (host && !host.querySelector('.bw-gallery')) mountGallery(host);
        }, 240);
    }

    function mountGallery(host) {
        host.innerHTML = '';
        galleryLive = [];

        var root = document.createElement('div');
        root.className = 'bw-gallery';
        root.innerHTML =
            '<div class="bw-g-head">' +
                '<h2>Widgets</h2>' +
                '<p>Pick a widget to choose its size and options, then add it to your desktop.</p>' +
            '</div>' +
            '<div class="bw-g-grid"></div>';

        host.appendChild(root);
        renderGalleryGrid(root);
    }

    function renderGalleryGrid(root) {
        var grid = root.querySelector('.bw-g-grid');
        if (!grid) return;

        galleryLive = [];
        grid.innerHTML = '';

        defOrder.forEach(function (id) {
            var def = defs[id];
            if (!def) return;

            var size = def.defSize;
            var settings = instanceSettingsFor(id, def);

            var tile = document.createElement('button');
            tile.type = 'button';
            tile.className = 'bw-g-tile';
            tile.dataset.wid = id;
            // Lay the tile out on the shared 170px grid: a small is one column,
            // a medium/large is two (358 = 170 + 18 + 170). Declaring the span
            // from the real dimensions — rather than a size->span lookup — means
            // a future size cannot silently fall out of the grid.
            tile.style.gridColumn = 'span ' + Math.max(1, Math.round(getDim(def, size).w / UNIT));
            if (getDim(def, size).h > UNIT) tile.style.gridRow = 'span 2';
            // No caption — the name is the tooltip, and the sheet repeats it.
            tile.title = def.name;
            tile.setAttribute('aria-label', def.name + ' — options');

            // Natural size (scale 1). Upscaling a small widget to fill a column
            // would misrepresent the tile you are about to place.
            var surf = buildSurface(def, size, 1);
            var repaint = function () { renderInto(def, surf.body, settings, size, repaint); };
            var api = makeApi(def, size, settings, surf.body, repaint);
            repaint();
            tile.appendChild(surf.box);

            tile.addEventListener('click', function () { openSheet(def, tile); });
            grid.appendChild(tile);

            galleryLive.push({ def: def, el: surf.body, api: api });
        });
    }

    // A tile previews the settings you already have on the desktop, so the
    // gallery and the desktop never disagree about what a widget looks like.
    function instanceSettingsFor(id, def) {
        for (var i = 0; i < instances.length; i++) {
            if (instances[i].id === id) return instances[i].settings;
        }
        return defaultSettings(def);
    }

    function refreshGallery() {
        document.querySelectorAll('.bw-gallery').forEach(function (root) {
            renderGalleryGrid(root);
        });
    }

    // ─── options sheet ───────────────────────────────────────────────────
    // Opened by clicking a gallery tile, or by the gear on a desktop widget.
    function closeSheet() {
        if (!sheet) return;
        document.removeEventListener('keydown', sheet.onKey, true);
        if (sheet.scrim && sheet.scrim.parentNode) sheet.scrim.parentNode.removeChild(sheet.scrim);
        sheet = null;
    }

    function sheetHost() {
        var el = document.querySelector('.bw-gallery') ||
                 document.querySelector('.window.is-active') ||
                 document.body;
        while (el && el.nodeType === 1 && el !== document.body) {
            if (getComputedStyle(el).position !== 'static') return el;
            el = el.parentNode;
        }
        return document.body;
    }

    function openSheet(def, anchor, existing) {
        if (!def) return;
        closeSheet();

        var size = existing ? existing.size : def.defSize;
        var draft = Object.assign(
            defaultSettings(def),
            existing ? existing.settings : (function () {
                for (var i = 0; i < instances.length; i++) {
                    if (instances[i].id === def.id) return instances[i].settings;
                }
                return {};
            })()
        );

        var scrim = document.createElement('div');
        scrim.className = 'bw-sheet-scrim';
        scrim.innerHTML =
            '<div class="bw-sheet" role="dialog" aria-modal="true" aria-label="' + esc(def.name) + ' options">' +
                '<div class="bw-sheet-top">' +
                    '<h3>' + esc(def.name) + '</h3>' +
                    '<button type="button" class="bw-sheet-x" aria-label="Close">✕</button>' +
                '</div>' +
                '<div class="bw-sheet-mid">' +
                    '<div class="bw-sheet-stage"></div>' +
                    '<div class="bw-sheet-info">' +
                        '<p>' + esc(def.desc || '') + '</p>' +
                        '<div class="bw-field">' +
                            '<label>Size</label>' +
                            '<div class="bw-seg">' +
                                def.sizes.map(function (s) {
                                    return '<button type="button" class="bw-seg-btn' +
                                        (s === size ? ' is-active' : '') + '" data-size="' + s + '">' +
                                        esc(SIZES[s].label) + '</button>';
                                }).join('') +
                            '</div>' +
                        '</div>' +
                        (def.settings || []).map(function (f) {
                            return fieldHtml(f, draft[f.key]);
                        }).join('') +
                    '</div>' +
                '</div>' +
                '<div class="bw-sheet-foot">' +
                    '<button type="button" class="bw-btn-add">' +
                        (existing ? 'Save Changes' : 'Add to Desktop') +
                    '</button>' +
                    '<button type="button" class="bw-btn-ghost">' + (existing ? 'Remove' : 'Close') + '</button>' +
                '</div>' +
            '</div>';

        sheetHost().appendChild(scrim);
        sheet = { scrim: scrim, onKey: onKey };
        document.addEventListener('keydown', onKey, true);

        var stage = scrim.querySelector('.bw-sheet-stage');
        var painting = false;

        function paint() {
            if (painting) return;
            painting = true;
            stage.innerHTML = '';
            var dim = getDim(def, size);
            var k = Math.min(STAGE_BOX / dim.w, STAGE_BOX / dim.h);
            var surf = buildSurface(def, size, k);
            stage.appendChild(surf.box);
            var api = makeApi(def, size, draft, surf.body, paint);
            renderInto(def, surf.body, draft, size, paint);
            painting = false;
            return api;
        }
        paint();

        // size segmented control
        scrim.querySelectorAll('.bw-seg button').forEach(function (b) {
            b.addEventListener('click', function () {
                size = b.dataset.size;
                scrim.querySelectorAll('.bw-seg button').forEach(function (x) {
                    x.classList.toggle('is-active', x === b);
                });
                paint();
            });
        });

        // per-widget settings
        (def.settings || []).forEach(function (f) {
            var input = scrim.querySelector('[data-key="' + f.key + '"]');
            if (!input) return;
            if (f.type === 'toggle') {
                input.addEventListener('click', function () {
                    draft[f.key] = !draft[f.key];
                    input.classList.toggle('is-on', !!draft[f.key]);
                    paint();
                });
            } else {
                var commit = function () {
                    draft[f.key] = f.type === 'number' ? Number(input.value) : input.value;
                    paint();
                };
                input.addEventListener('change', commit);
                if (f.type === 'text' || f.type === 'number') input.addEventListener('input', commit);
            }
            input.addEventListener('keydown', function (e) { e.stopPropagation(); });
        });

        // actions
        var addBtn = scrim.querySelector('.bw-btn-add');
        var ghost = scrim.querySelector('.bw-btn-ghost');
        var label = addBtn.textContent;

        addBtn.addEventListener('click', function () {
            if (existing) {
                existing.size = size;
                existing.settings = draft;
                applyGeometry(existing);
                renderInstance(existing);
                saveLayout();
            } else {
                var inst = spawnInstance({
                    id: def.id, size: size,
                    x: Math.max(16, window.innerWidth - getDim(def, size).w - 48),
                    y: 56 + (instances.length % 5) * 32,
                    settings: draft
                });
                if (inst) saveLayout();
            }
            tickSound(true);
            refreshGallery();
            addBtn.classList.add('is-done');
            addBtn.textContent = existing ? 'Saved Changes' : 'Added to Desktop';
            setTimeout(function () {
                if (!addBtn.isConnected) return;
                addBtn.classList.remove('is-done');
                addBtn.textContent = label;
                closeSheet();
            }, 600);
        });

        ghost.addEventListener('click', function () {
            if (existing) {
                removeInstance(existing.uid);
                closeSheet();
            } else {
                closeSheet();
            }
        });

        scrim.querySelector('.bw-sheet-x').addEventListener('click', closeSheet);
        scrim.addEventListener('pointerdown', function (e) {
            if (e.target === scrim) closeSheet();
        });
        scrim.addEventListener('keydown', function (e) { e.stopPropagation(); });
        scrim.querySelector('.bw-sheet').addEventListener('pointerdown', function (e) {
            e.stopPropagation();
        });

        function onKey(e) {
            if (e.key === 'Escape') {
                e.stopPropagation();
                closeSheet();
            }
        }

        // Keep the tile the sheet grew out of in view.
        if (anchor && anchor.scrollIntoView) {
            try { anchor.scrollIntoView({ block: 'nearest' }); } catch (e) {}
        }
    }

    // Every control the sheet injects carries a class. That is not cosmetic:
    // js/controls.js auto-tags any class-less button/input with
    // `brow-auto-control`, whose gradients would leak into the sheet. The
    // `data-brow-enhanced` flag is the same module's opt-out for native
    // selects — it keeps a plain <select> instead of the custom dropdown.
    function fieldHtml(f, value) {
        var v = value === undefined ? f.def : value;
        var label = '<label>' + esc(f.label) + '</label>';

        if (f.type === 'toggle') {
            return '<div class="bw-field"><div class="bw-switch-row"><span>' + esc(f.label) + '</span>' +
                '<button type="button" class="bw-switch' + (v ? ' is-on' : '') + '" data-key="' + esc(f.key) + '" ' +
                'aria-label="' + esc(f.label) + '"></button></div></div>';
        }
        if (f.type === 'select') {
            return '<div class="bw-field">' + label +
                '<select class="bw-input" data-brow-enhanced="true" data-key="' + esc(f.key) + '">' +
                    (f.options || []).map(function (o) {
                        var val = Array.isArray(o) ? o[0] : o;
                        var text = Array.isArray(o) ? o[1] : o;
                        return '<option value="' + esc(val) + '"' +
                            (String(val) === String(v) ? ' selected' : '') + '>' + esc(text) + '</option>';
                    }).join('') +
                '</select></div>';
        }
        if (f.type === 'number') {
            return '<div class="bw-field">' + label +
                '<input type="number" class="bw-input" data-key="' + esc(f.key) + '" value="' + esc(v) + '"' +
                (f.min !== undefined ? ' min="' + f.min + '"' : '') +
                (f.max !== undefined ? ' max="' + f.max + '"' : '') + '></div>';
        }
        return '<div class="bw-field">' + label +
            '<input type="text" class="bw-input" data-key="' + esc(f.key) + '" value="' + esc(v == null ? '' : v) + '"' +
            (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '') + '></div>';
    }

    // ─── layer + lifecycle ───────────────────────────────────────────────
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
        btn.setAttribute('aria-label', 'Open widgets');
        btn.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" ' +
            'stroke-width="2" stroke-linecap="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1.8"/>' +
            '<circle cx="17" cy="7" r="3.5"/><circle cx="7" cy="17" r="3.5"/>' +
            '<rect x="13.5" y="13.5" width="7" height="7" rx="3.5"/></svg>';
        btn.addEventListener('click', function (e) { e.stopPropagation(); openGallery(); });
        bar.insertBefore(btn, bar.firstChild);
    }

    function init() {
        if (initialized) return;
        if (!ensureLayer()) return;
        initialized = true;
        ensureMenuButton();

        loadLayout().forEach(function (entry) {
            try { spawnInstance(entry); } catch (e) {}
        });

        document.querySelectorAll('.bw-gallery-host').forEach(function (host) {
            if (!host.querySelector('.bw-gallery')) mountGallery(host);
        });

        if (!tickTimer) {
            tickTimer = setInterval(function () {
                instances.slice().forEach(function (inst) {
                    var def = defs[inst.id];
                    if (def && typeof def.tick === 'function' && inst.body && document.body.contains(inst.el)) {
                        try { def.tick(inst.body, makeApi(def, inst.size, inst.settings, inst.body, function () { renderInstance(inst); })); } catch (e) {}
                    }
                });
                galleryLive.forEach(function (g) {
                    if (typeof g.def.tick === 'function' && document.body.contains(g.el)) {
                        try { g.def.tick(g.el, g.api); } catch (e) {}
                    }
                });
            }, 1000);
        }

        requestAnimationFrame(fpsLoop);

        window.addEventListener('resize', function () {
            instances.forEach(function (inst) {
                var dim = getDim(defs[inst.id], inst.size);
                var r = layer.getBoundingClientRect();
                inst.x = clamp(inst.x, -dim.w + 60, r.width - 60);
                inst.y = clamp(inst.y, 40, r.height - 60);
                applyGeometry(inst);
            });
        });
    }

    // ─── public surface ──────────────────────────────────────────────────
    window.BrowWidgets = {
        define: define,
        init: init,
        openGallery: openGallery,
        mountGallery: mountGallery,
        addWidget: addWidget,
        removeInstance: removeInstance,
        removeWidget: removeInstance,
        resizeInstance: resizeInstance,
        showContextMenu: showWidgetContextMenu,
        renderInstance: renderInstance,
        setEditMode: setEditMode,
        toggleEditMode: function () { setEditMode(!editMode); },
        isEditMode: function () { return editMode; },
        list: function () { return instances.slice(); },
        defs: function () { return defOrder.map(function (id) { return defs[id]; }); },
        openSheet: openSheet,
        storeGet: storeGet,
        storeSet: storeSet,
        esc: esc,
        fps: function () { return fpsState.fps; },
        SIZES: SIZES
    };
})();
