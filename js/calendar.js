/* BrowCalendar — month agenda app with a shared local event store.
 * The Calendar app reads the same store.
 */
(function () {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function pad2(n) { return String(n).padStart(2, '0'); }
    function dayKey(y, m, d) { return y + '-' + pad2(m + 1) + '-' + pad2(d); }
    function store() {
        var api = window.BrowCalendarStore;
        if (api) return { all: api.all, save: api.save, key: api.dayKey };
        var KEY = 'browos_calendar_events_v1';
        return {
            all: function () {
                try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; }
            },
            save: function (ev) {
                try { localStorage.setItem(KEY, JSON.stringify(ev)); } catch (e) {}
                try { window.dispatchEvent(new CustomEvent('browos:calendar-changed')); } catch (err) {}
            },
            key: dayKey
        };
    }

    var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    function mountApp(windowElement) {
        var host = windowElement && windowElement.querySelector('.cal-app-host');
        if (!host || host.dataset.mounted === 'true') return;
        host.dataset.mounted = 'true';
        var st = store();
        var now = new Date();
        var cursor = { y: now.getFullYear(), m: now.getMonth() };
        var selected = dayKey(now.getFullYear(), now.getMonth(), now.getDate());

        host.innerHTML =
            '<div class="cal-app"><div class="cal-main">' +
            '<div class="cal-head"><button data-nav="-1">‹</button><strong></strong><button data-nav="1">›</button>' +
            '<button data-nav="0" class="cal-today">Today</button></div>' +
            '<div class="cal-weekdays"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div>' +
            '<div class="cal-grid"></div></div>' +
            '<div class="cal-side"><h3></h3><div class="cal-events"></div>' +
            '<div class="cal-add"><input class="cal-in-title" type="text" placeholder="New event…" maxlength="80">' +
            '<input class="cal-in-time" type="time"><button class="cal-in-add">Add</button></div></div></div>';

        var titleEl = host.querySelector('.cal-head strong');
        var grid = host.querySelector('.cal-grid');
        var sideTitle = host.querySelector('.cal-side h3');
        var eventsBox = host.querySelector('.cal-events');

        function render() {
            var ev = st.all();
            titleEl.textContent = MONTHS[cursor.m] + ' ' + cursor.y;
            var first = new Date(cursor.y, cursor.m, 1).getDay();
            var days = new Date(cursor.y, cursor.m + 1, 0).getDate();
            var t = new Date();
            var html = '';
            for (var i = 0; i < first; i++) html += '<span class="cal-day is-empty"></span>';
            for (var d = 1; d <= days; d++) {
                var k = st.key(cursor.y, cursor.m, d);
                var cls = 'cal-day';
                if (d === t.getDate() && cursor.m === t.getMonth() && cursor.y === t.getFullYear()) cls += ' is-today';
                if (k === selected) cls += ' is-sel';
                if ((ev[k] || []).length) cls += ' has-ev';
                html += '<span class="' + cls + '" data-day="' + d + '">' + d + '</span>';
            }
            grid.innerHTML = html;
            grid.querySelectorAll('[data-day]').forEach(function (cell) {
                cell.addEventListener('click', function () {
                    selected = st.key(cursor.y, cursor.m, Number(cell.dataset.day));
                    render();
                });
            });
            var parts = selected.split('-');
            var label = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
                .toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
            sideTitle.textContent = label;
            var list = ev[selected] || [];
            eventsBox.innerHTML = list.length ? list.map(function (it) {
                return '<div class="cal-ev" data-id="' + it.id + '"><span class="cal-ev-time">' +
                    esc(it.time || 'all-day') + '</span><span class="cal-ev-title">' + esc(it.title) +
                    '</span><button>×</button></div>';
            }).join('') : '<div class="bw-empty">Nothing scheduled — enjoy the day.</div>';
            eventsBox.querySelectorAll('.cal-ev button').forEach(function (b) {
                b.addEventListener('click', function () {
                    var all = st.all();
                    all[selected] = (all[selected] || []).filter(function (it) {
                        return String(it.id) !== b.parentNode.dataset.id;
                    });
                    if (!all[selected].length) delete all[selected];
                    st.save(all);
                    render();
                });
            });
        }

        host.querySelectorAll('[data-nav]').forEach(function (b) {
            b.addEventListener('click', function () {
                var n = Number(b.dataset.nav);
                if (n === 0) {
                    var t = new Date();
                    cursor = { y: t.getFullYear(), m: t.getMonth() };
                    selected = st.key(t.getFullYear(), t.getMonth(), t.getDate());
                } else {
                    var d = new Date(cursor.y, cursor.m + n, 1);
                    cursor = { y: d.getFullYear(), m: d.getMonth() };
                }
                render();
            });
        });
        var titleIn = host.querySelector('.cal-in-title');
        var timeIn = host.querySelector('.cal-in-time');
        function add() {
            var v = titleIn.value.trim();
            if (!v) return;
            var all = st.all();
            (all[selected] = all[selected] || []).push({ id: 'e' + Date.now().toString(36), title: v, time: timeIn.value || '' });
            all[selected].sort(function (a, b) { return String(a.time || '99') < String(b.time || '99') ? -1 : 1; });
            st.save(all);
            titleIn.value = '';
            render();
        }
        host.querySelector('.cal-in-add').addEventListener('click', add);
        titleIn.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter') add(); });
        timeIn.addEventListener('keydown', function (e) { e.stopPropagation(); });
        render();
    }

    window.BrowCalendar = { mountApp: mountApp };
})();
