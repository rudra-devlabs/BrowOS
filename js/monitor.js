/* BrowMonitor — system monitor app: live graphs, device facts, app processes.
 * Graphs are honest about what a web page can measure: frame rate, JS heap,
 * battery, network, storage quota, and the real window/process list.
 */
(function () {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function fmtBytes(b) {
        if (!isFinite(b) || b < 0) return '—';
        if (b < 1024) return Math.round(b) + ' B';
        if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
        if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
        return (b / 1073741824).toFixed(2) + ' GB';
    }

    function mountApp(windowElement) {
        var host = windowElement && windowElement.querySelector('.mon-app-host');
        if (!host || host.dataset.mounted === 'true') return;
        host.dataset.mounted = 'true';

        host.innerHTML =
            '<div class="mon-app">' +
            '<div class="mon-cards">' +
            '<div class="mon-card"><span>Frame rate</span><b class="mon-fps">—</b></div>' +
            '<div class="mon-card"><span>JS heap</span><b class="mon-heap">—</b></div>' +
            '<div class="mon-card"><span>Battery</span><b class="mon-batt">—</b></div>' +
            '<div class="mon-card"><span>Network</span><b class="mon-net">—</b></div>' +
            '<div class="mon-card"><span>Storage</span><b class="mon-disk">—</b></div>' +
            '<div class="mon-card"><span>Uptime</span><b class="mon-up">—</b></div>' +
            '</div>' +
            '<div class="mon-graphs"><div><h4>Frames per second</h4><canvas class="mon-cv-fps" width="520" height="120"></canvas></div>' +
            '<div><h4>JS heap (MB)</h4><canvas class="mon-cv-heap" width="520" height="120"></canvas></div></div>' +
            '<h4 class="mon-sec">Processes — live app windows</h4><div class="mon-procs"></div>' +
            '<div class="bw-muted">Graphs sample this tab only. Quitting a process closes its window.</div></div>';

        var q = function (c) { return host.querySelector(c); };
        var fpsHist = new Array(90).fill(0);
        var heapHist = new Array(90).fill(0);
        var last = performance.now(), frames = 0, fps = 0;
        var t0 = Date.now();
        var dead = false;

        function draw(cv, data, max, color) {
            var ctx = cv.getContext('2d');
            var W = cv.width, H = cv.height;
            ctx.clearRect(0, 0, W, H);
            ctx.strokeStyle = 'rgba(255,255,255,0.12)';
            ctx.lineWidth = 1;
            for (var g = 1; g < 4; g++) {
                ctx.beginPath();
                ctx.moveTo(0, (H / 4) * g + 0.5);
                ctx.lineTo(W, (H / 4) * g + 0.5);
                ctx.stroke();
            }
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            data.forEach(function (v, i) {
                var x = (i / (data.length - 1)) * W;
                var y = H - 6 - Math.max(0, Math.min(1, v / max)) * (H - 14);
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.stroke();
        }

        function raf(ts) {
            if (dead) return;
            frames++;
            if (ts - last >= 500) {
                fps = Math.round((frames * 1000) / (ts - last));
                frames = 0; last = ts;
                fpsHist.push(fps); fpsHist.shift();
                var heapMB = (performance.memory) ? performance.memory.usedJSHeapSize / 1048576 : 0;
                heapHist.push(heapMB); heapHist.shift();
            }
            requestAnimationFrame(raf);
        }
        requestAnimationFrame(raf);

        function battText() {
            if (!navigator.getBattery) return Promise.resolve('n/a');
            return navigator.getBattery().then(function (b) {
                return Math.round(b.level * 100) + '%' + (b.charging ? ' ⚡' : '');
            }).catch(function () { return 'n/a'; });
        }
        function netText() {
            if (navigator.onLine === false) return 'Offline';
            var c = navigator.connection || navigator.webkitConnection;
            if (c && c.effectiveType) return c.effectiveType.toUpperCase() + (c.downlink ? ' · ' + c.downlink + 'Mb/s' : '');
            return 'Online';
        }
        function diskText() {
            if (navigator.storage && navigator.storage.estimate) {
                return navigator.storage.estimate().then(function (e) {
                    return fmtBytes(e.usage) + ' / ' + fmtBytes(e.quota);
                }).catch(function () { return 'n/a'; });
            }
            return Promise.resolve('n/a');
        }

        function procs() {
            var box = q('.mon-procs');
            var wins = [];
            try { wins = window.windowManager ? window.windowManager.windows.slice() : []; } catch (e) {}
            if (!wins.length) { box.innerHTML = '<div class="bw-empty">No app windows open.</div>'; return; }
            box.innerHTML = '';
            wins.forEach(function (w) {
                var name = 'Window';
                try {
                    var info = window.appsManager && window.appsManager.getAppInfo(w.appName);
                    if (info && info.name) name = info.name;
                } catch (e) {}
                var row = document.createElement('div');
                row.className = 'mon-proc';
                row.innerHTML = '<span class="mon-dot"></span><span class="mon-proc-name">' + esc(name) + '</span>' +
                    '<span class="bw-muted">' + esc(w.isMinimized ? 'minimized' : (w.isMaximized ? 'fullscreen' : 'window')) + '</span>' +
                    '<button data-a="focus">Focus</button><button data-a="quit">Quit</button>';
                row.querySelector('[data-a=focus]').addEventListener('click', function () {
                    try {
                        if (w.isMinimized && window.windowManager.restoreWindow) window.windowManager.restoreWindow(w.element, w);
                        window.windowManager.bringToFront(w.element);
                    } catch (e) {}
                });
                row.querySelector('[data-a=quit]').addEventListener('click', function () {
                    try {
                        if (window.windowManager.closeWindow) window.windowManager.closeWindow(w.element, w);
                        else if (w.element && w.element.parentNode) w.element.parentNode.removeChild(w.element);
                    } catch (e) {}
                    setTimeout(procs, 300);
                });
                box.appendChild(row);
            });
        }

        var iv = setInterval(function () {
            if (dead || !document.body.contains(host)) return;
            q('.mon-fps').textContent = fps || '—';
            q('.mon-heap').textContent = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) + ' MB' : 'n/a';
            var s = Math.floor((Date.now() - t0) / 1000);
            q('.mon-up').textContent = String(Math.floor(s / 3600)).padStart(2, '0') + ':' +
                String(Math.floor((s % 3600) / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
            q('.mon-net').textContent = netText();
            battText().then(function (t) { if (!dead) q('.mon-batt').textContent = t; });
            diskText().then(function (t) { if (!dead) q('.mon-disk').textContent = t; });
            draw(q('.mon-cv-fps'), fpsHist, 90, '#30d158');
            var hmax = Math.max.apply(null, heapHist.concat([64]));
            draw(q('.mon-cv-heap'), heapHist, hmax, '#0a84ff');
            procs();
        }, 1000);

        var obs = new MutationObserver(function () {
            if (!document.body.contains(host)) { dead = true; clearInterval(iv); obs.disconnect(); }
        });
        obs.observe(document.body, { childList: true, subtree: true });
    }

    window.BrowMonitor = { mountApp: mountApp };
})();
