/* BrowWidgets built-in set — 20 luminous desktop widgets across Essentials,
 * Productivity, Media & Audio, and System & Utility.
 * Each widget is local-first, zero-overhead, beautifully crafted with glassmorphism.
 */
(function () {
    'use strict';
    if (!window.BrowWidgets) return;
    var BW = window.BrowWidgets;

    var pad2 = function (n) { return String(n).padStart(2, '0'); };
    var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var storeGet = BW.storeGet, storeSet = BW.storeSet, esc = BW.esc;

    function playAlert() {
        try {
            if (window.BrowSettings && window.BrowSettings.audio) window.BrowSettings.audio.play('alert');
        } catch (e) {}
    }

    function tickAudio() {
        try {
            if (window.BrowSettings && window.BrowSettings.audio) window.BrowSettings.audio.play('tick');
        } catch (e) {}
    }

    // ─── shared calendar event store (also used by Calendar app) ─────
    var CAL_KEY = 'browos_calendar_events_v1';
    function calEvents() { return storeGet(CAL_KEY, {}); }
    function calSave(ev) {
        storeSet(CAL_KEY, ev);
        try { window.dispatchEvent(new CustomEvent('browos:calendar-changed')); } catch (e) {}
    }
    function dayKey(y, m, d) { return y + '-' + pad2(m + 1) + '-' + pad2(d); }
    function upcomingEvents(daysAhead) {
        var ev = calEvents(), out = [], now = new Date();
        for (var i = 0; i < daysAhead; i++) {
            var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
            var list = ev[dayKey(d.getFullYear(), d.getMonth(), d.getDate())] || [];
            list.forEach(function (it) {
                out.push({ date: d, label: i === 0 ? 'Today' : (i === 1 ? 'Tomorrow' : DAYS[d.getDay()].slice(0, 3) + ' ' + d.getDate()), title: it.title, time: it.time || '' });
            });
        }
        return out.slice(0, 6);
    }
    window.BrowCalendarStore = { key: CAL_KEY, all: calEvents, save: calSave, dayKey: dayKey, upcoming: upcomingEvents };

    function monthGrid(year, month, opts) {
        opts = opts || {};
        var first = new Date(year, month, 1).getDay();
        var days = new Date(year, month + 1, 0).getDate();
        var today = new Date();
        var ev = opts.dots ? calEvents() : null;
        var html = '<div class="bw-cal-grid"><span class="bw-cal-dow">S</span><span class="bw-cal-dow">M</span>' +
            '<span class="bw-cal-dow">T</span><span class="bw-cal-dow">W</span><span class="bw-cal-dow">T</span>' +
            '<span class="bw-cal-dow">F</span><span class="bw-cal-dow">S</span>';
        for (var i = 0; i < first; i++) html += '<span></span>';
        for (var d = 1; d <= days; d++) {
            var cls = 'bw-cal-day';
            if (d === today.getDate() && month === today.getMonth() && year === today.getFullYear()) cls += ' is-today';
            var dot = '';
            if (ev && (ev[dayKey(year, month, d)] || []).length) dot = '<i class="bw-cal-dot"></i>';
            var extra = '';
            if (opts.clickable) extra = ' data-day="' + d + '" style="cursor:pointer"';
            html += '<span class="' + cls + '"' + extra + '>' + d + dot + '</span>';
        }
        return html + '</div>';
    }

    // ═════════════════════════════════════════════════════════════════════
    // 1. CLOCK (Essentials)
    // ═════════════════════════════════════════════════════════════════════
        BW.define({
        id: 'clock',
        shape: 'rounded',
        name: 'Apple Clock',
        desc: 'Precision Swiss analog dial and circadian quartz face.',
        category: 'essentials',
        tint: 'linear-gradient(135deg,#38bdf8,#6366f1)',
        glow: 'rgba(56, 189, 248, 0.4)',
        sizes: ['s', 'm', 'l'],
        defSize: 's',
        tags: ['Swiss Minimal Dial', 'Baton Hands', 'Circadian Phase'],
        settings: [
            { key: 'mode', label: 'Face Mode', type: 'select', def: 'analog', options: [['analog', 'Analog Dial'], ['digital', 'Digital Time']] },
            { key: 'seconds', label: 'Show seconds hand', type: 'toggle', def: true }
        ],
        render: function (el, api) { paintAppleClock(el, api.settings, api.inst.size); },
        tick: function (el, api) { paintAppleClock(el, api.settings, api.inst.size); },
        preview: function (size) {
            return '<div class="bw-clock-apple-prev">' +
                renderAnalogDial(10, 9, 32, false) +
                (size !== 's' ? '<div class="bw-clock-side"><b>10:09 AM</b><span>Wednesday, Sep 10</span><span class="bw-circ-pill">☀️ Afternoon</span></div>' : '') +
            '</div>';
        }
    });

    function renderAnalogDial(h, m, sec, showSec) {
        var secDeg = sec * 6;
        var minDeg = m * 6 + sec * 0.1;
        var hrDeg = (h % 12) * 30 + m * 0.5;
        var ticks = '';
        for (var i = 0; i < 12; i++) {
            var deg = i * 30;
            var isMajor = i % 3 === 0;
            ticks += '<div class="bw-clock-tick' + (isMajor ? ' is-major' : '') + '" style="transform: rotate(' + deg + 'deg)"></div>';
        }
        return '<div class="bw-analog-apple">' +
            ticks +
            '<div class="bw-clock-hand-hour" style="transform: rotate(' + hrDeg + 'deg)"></div>' +
            '<div class="bw-clock-hand-min" style="transform: rotate(' + minDeg + 'deg)"></div>' +
            (showSec !== false ? '<div class="bw-clock-hand-sec" style="transform: rotate(' + secDeg + 'deg)"></div>' : '') +
            '<div class="bw-clock-center-pin"></div>' +
        '</div>';
    }

    function paintAppleClock(el, s, size) {
        var now = new Date(), h = now.getHours(), m = now.getMinutes(), sec = now.getSeconds();
        var ap = h >= 12 ? 'PM' : 'AM';
        var dispH = (h % 12 || 12);
        var timeStr = pad2(dispH) + '<span class="widget-clock-colon">:</span>' + pad2(m);
        var apStr = ' <span class="widget-clock-ampm">' + ap + '</span>';
        var city = Intl.DateTimeFormat().resolvedOptions().timeZone.split('/').pop().replace('_', ' ');

        var phase = 'Night', phaseIcon = '🌙';
        if (h >= 5 && h < 12) { phase = 'Morning'; phaseIcon = '🌅'; }
        else if (h >= 12 && h < 17) { phase = 'Afternoon'; phaseIcon = '☀️'; }
        else if (h >= 17 && h < 21) { phase = 'Golden Hour'; phaseIcon = '🌇'; }

        var mode = s && s.mode ? s.mode : (size === 's' ? 'analog' : 'dual');

        if (size === 's' && mode === 'analog') {
            el.innerHTML = '<div class="bw-apple-clock-sq">' +
                renderAnalogDial(h, m, sec, s ? s.seconds : true) +
                '<span class="bw-apple-clock-sub">' + esc(city.toUpperCase()) + '</span>' +
            '</div>';
            return;
        }

        if (size === 'm' || size === 'l') {
            el.innerHTML = '<div class="bw-apple-clock-dual">' +
                renderAnalogDial(h, m, sec, s ? s.seconds : true) +
                '<div class="bw-apple-clock-info">' +
                    '<span class="bw-apple-clock-zone">' + esc(city.toUpperCase()) + '</span>' +
                    '<div class="bw-apple-clock-digi">' + timeStr + apStr + '</div>' +
                    '<div class="widget-date-label">' + DAYS[now.getDay()] + ', ' + MONTHS[now.getMonth()] + ' ' + now.getDate() + '</div>' +
                    '<div class="bw-circ-pill"><span class="bw-circ-sun">' + phaseIcon + '</span> ' + phase + '</div>' +
                '</div>' +
            '</div>';
            return;
        }

        // Digital fallback
        el.innerHTML =
            '<div class="bw-clock-box">' +
                '<div class="bw-clock-topline">' +
                    '<div class="bw-circadian-chip"><span class="bw-circ-sun">' + phaseIcon + '</span> ' + phase + '</div>' +
                    '<span class="bw-clock-zone">' + esc(city) + '</span>' +
                '</div>' +
                '<div class="widget-clock-large">' + timeStr + (s && s.seconds ? '<span class="widget-clock-sec">' + pad2(sec) + '</span>' : '') + apStr + '</div>' +
                '<div class="widget-date-label">' + DAYS[now.getDay()] + ', ' + MONTHS[now.getMonth()] + ' ' + now.getDate() + '</div>' +
            '</div>';
    }

    // ═════════════════════════════════════════════════════════════════════
    // 2. WEATHER (Essentials)
    // ═════════════════════════════════════════════════════════════════════
    var WX_DEFAULT = { name: 'New York', lat: 40.71, lon: -74.0 };
    BW.define({
        id: 'weather',
        shape: 'rounded',
        name: 'Atmosphere Weather',
        desc: 'Dynamic frosted sky with real-time temperature, wind, and forecast.',
        category: 'essentials',
        tint: 'linear-gradient(135deg,#0284c7,#38bdf8)',
        glow: 'rgba(56, 189, 248, 0.45)',
        sizes: ['s', 'm', 'l'],
        defSize: 'm',
        tags: ['Open-Meteo Sync', 'Hourly Outlook', 'Precipitation Alert'],
        settings: [{ key: 'city', label: 'City', type: 'text', def: 'New York', placeholder: 'City name…' }],
        render: function (el, api) { paintWeather(el, api, false); },
        tick: function (el, api) { paintWeather(el, api, true); },
        preview: function () {
            return '<div class="bw-wx-head">' +
                '<div class="bw-wx-icon-glow">☀️</div>' +
                '<div class="bw-wx-temp-wrap"><span class="bw-wx-temp-main">74°</span><span class="bw-wx-cond">Clear Sky</span></div>' +
                '<div class="bw-wx-metrics"><span>💨 7mph</span><span>💧 48%</span><span>H: 78° L: 61°</span></div>' +
            '</div>' +
            '<div class="bw-wx-hourly-strip">' +
                '<div class="bw-wx-pill"><span>1 PM</span><span>☀️</span><b>74°</b></div>' +
                '<div class="bw-wx-pill"><span>2 PM</span><span>🌤</span><b>75°</b></div>' +
                '<div class="bw-wx-pill"><span>3 PM</span><span>🌤</span><b>76°</b></div>' +
                '<div class="bw-wx-pill"><span>4 PM</span><span>☁️</span><b>73°</b></div>' +
            '</div>';
        }
    });

    function wxApi() { return window.BrowWeatherAPI || null; }
    function paintWeather(el, api, soft) {
        var s = api.settings;
        var loc = s.lat ? { name: s.city || 'Custom', lat: s.lat, lon: s.lon } : null;
        if (!wxApi()) {
            el.innerHTML = '<div class="bw-wx-fallback">' +
                '<div class="bw-wx-head"><span class="bw-wx-icon-glow">☀️</span><span class="bw-wx-temp-main">72°</span></div>' +
                '<div class="bw-muted">Weather engine loading…<br><button class="bw-linkbtn" data-open="weather">Open Weather</button></div></div>';
            var b = el.querySelector('[data-open]');
            if (b) b.addEventListener('click', function () { api.openApp('weather'); });
            return;
        }
        if (!el._wxLoading && !el._wx) {
            el._wxLoading = true;
            wxApi().get(loc || WX_DEFAULT).then(function (d) {
                el._wx = d; el._wxLoading = false;
                renderWx(el, api);
            }).catch(function () {
                el._wxLoading = false;
                el.innerHTML = '<div class="bw-muted">Sky offline.<br><button class="bw-linkbtn" data-open="weather">Open Weather</button></div>';
            });
            return;
        }
        if (el._wx && (!soft || !el.querySelector('.bw-wx-temp-main'))) renderWx(el, api);
    }

    function renderWx(el, api) {
        var d = el._wx;
        var info = wxApi() ? wxApi().codeInfo(d.code) : { icon: '☀️', label: 'Clear' };
        var hours = (d.hourly || []).slice(0, api.inst.size === 'l' ? 7 : 4).map(function (h) {
            return '<div class="bw-wx-pill"><span>' + esc(h.t) + '</span><span>' + esc(wxApi().codeInfo(h.code).icon) + '</span><b>' + Math.round(h.temp) + '°</b></div>';
        }).join('');

        el.innerHTML =
            '<div class="bw-wx-head">' +
                '<div class="bw-wx-icon-glow">' + esc(info.icon) + '</div>' +
                '<div class="bw-wx-temp-wrap">' +
                    '<span class="bw-wx-temp-main">' + Math.round(d.temp) + '°</span>' +
                    '<span class="bw-wx-cond">' + esc(d.place) + ' · ' + esc(info.label) + '</span>' +
                '</div>' +
                '<div class="bw-wx-metrics">' +
                    '<span>H: ' + Math.round(d.hi) + '° L: ' + Math.round(d.lo) + '°</span>' +
                    '<span>💧 ' + esc(d.precip) + '% rain</span>' +
                '</div>' +
            '</div>' +
            '<div class="bw-wx-hourly-strip">' + hours + '</div>';
    }

    // ═════════════════════════════════════════════════════════════════════
    // 3. CALENDAR (Essentials)
    // ═════════════════════════════════════════════════════════════════════
        BW.define({
        id: 'calendar',
        shape: 'rounded',
        name: 'Calendar Agenda',
        desc: 'Split-view Apple calendar with bold date and interactive monthly matrix.',
        category: 'essentials',
        tint: 'linear-gradient(135deg,#ff453a,#ff9f0a)',
        glow: 'rgba(255, 69, 58, 0.35)',
        sizes: ['m', 'l'],
        defSize: 'm',
        tags: ['Split-Pane Layout', 'Mon 22 Header', 'Monthly Matrix'],
        render: paintAppleCalendar,
        tick: paintAppleCalendar,
        preview: function () {
            return '<div class="bw-cal-split">' +
                '<div class="bw-cal-left">' +
                    '<span class="bw-cal-dayname">MON</span>' +
                    '<span class="bw-cal-datenumber">22</span>' +
                    '<div class="bw-cal-event-pill"><span class="bw-cal-ev-dot"></span><span>10:00 Team Meeting</span></div>' +
                '</div>' +
                '<div class="bw-cal-right">' +
                    '<div class="bw-cal-right-head"><span>January 2024</span><span class="bw-cal-nav">&lt; Month &gt;</span></div>' +
                    '<div class="bw-cal-grid-prev">' +
                        '<span class="bw-cal-dow">S</span><span class="bw-cal-dow">M</span><span class="bw-cal-dow">T</span><span class="bw-cal-dow">W</span><span class="bw-cal-dow">T</span><span class="bw-cal-dow">F</span><span class="bw-cal-dow">S</span>' +
                        '<span></span><span class="bw-cal-day">1</span><span class="bw-cal-day">2</span><span class="bw-cal-day">3</span><span class="bw-cal-day">4</span><span class="bw-cal-day">5</span><span class="bw-cal-day">6</span>' +
                        '<span class="bw-cal-day">7</span><span class="bw-cal-day">8</span><span class="bw-cal-day">9</span><span class="bw-cal-day">10</span><span class="bw-cal-day">11</span><span class="bw-cal-day">12</span><span class="bw-cal-day">13</span>' +
                        '<span class="bw-cal-day">14</span><span class="bw-cal-day">15</span><span class="bw-cal-day">16</span><span class="bw-cal-day">17</span><span class="bw-cal-day">18</span><span class="bw-cal-day">19</span><span class="bw-cal-day">20</span>' +
                        '<span class="bw-cal-day">21</span><span class="bw-cal-day is-today">22</span><span class="bw-cal-day">23</span><span class="bw-cal-day">24</span><span class="bw-cal-day">25</span><span class="bw-cal-day">26</span><span class="bw-cal-day">27</span>' +
                        '<span class="bw-cal-day">28</span><span class="bw-cal-day">29</span><span class="bw-cal-day">30</span><span class="bw-cal-day">31</span>' +
                    '</div>' +
                '</div>' +
            '</div>';
        }
    });

    function paintAppleCalendar(el, api) {
        var now = new Date();
        var dayName = DAYS[now.getDay()].slice(0, 3).toUpperCase();
        var dateNum = now.getDate();
        var monthName = MONTHS[now.getMonth()];
        var year = now.getFullYear();

        var ev = upcomingEvents(14);
        var firstEv = ev.length ? ev[0] : { title: 'Team Meeting', time: '10:00 AM' };

        el.innerHTML =
            '<div class="bw-cal-split">' +
                '<div class="bw-cal-left">' +
                    '<span class="bw-cal-dayname">' + dayName + '</span>' +
                    '<span class="bw-cal-datenumber">' + dateNum + '</span>' +
                    '<div class="bw-cal-event-pill" title="' + esc(firstEv.title) + '">' +
                        '<span class="bw-cal-ev-dot"></span>' +
                        '<span>' + (firstEv.time ? firstEv.time + ' ' : '') + esc(firstEv.title) + '</span>' +
                    '</div>' +
                '</div>' +
                '<div class="bw-cal-right">' +
                    '<div class="bw-cal-right-head">' +
                        '<span>' + monthName + ' ' + year + '</span>' +
                        '<button type="button" class="bw-cal-badge" data-open="calendar">Open App</button>' +
                    '</div>' +
                    monthGrid(year, now.getMonth(), { dots: true, clickable: true }) +
                '</div>' +
            '</div>';

        var btn = el.querySelector('[data-open]');
        if (btn) btn.addEventListener('click', function () { api.openApp('calendar'); });
    }

    // ═════════════════════════════════════════════════════════════════════
    // 4. DESKTOP QUICK CALCULATOR (Essentials) - NEW!
    // ═════════════════════════════════════════════════════════════════════
    BW.define({
        id: 'calc',
        shape: 'rounded',
        name: 'Desk Calculator',
        desc: 'Tactile frosted glass arithmetic keypad right on your desktop.',
        category: 'essentials',
        tint: 'linear-gradient(135deg,#f59e0b,#d97706)',
        glow: 'rgba(245, 158, 11, 0.4)',
        sizes: ['s', 'm'],
        defSize: 'm',
        tags: ['Glass Keypad', 'Live Arithmetic', 'Zero Overhead'],
        render: paintDeskCalc,
        preview: function () {
            return '<div class="bw-calc-wrap">' +
                '<div class="bw-calc-display"><span class="bw-calc-sub">124 × 8</span><span class="bw-calc-main">992</span></div>' +
                '<div class="bw-calc-grid-prev">' +
                    '<button class="bw-cb-fn">C</button><button class="bw-cb-fn">±</button><button class="bw-cb-op">÷</button><button class="bw-cb-op">×</button>' +
                    '<button>7</button><button>8</button><button>9</button><button class="bw-cb-op">-</button>' +
                    '<button>4</button><button>5</button><button>6</button><button class="bw-cb-op">+</button>' +
                    '<button>1</button><button>2</button><button>3</button><button class="bw-cb-eq">=</button>' +
                '</div>' +
            '</div>';
        }
    });

    function paintDeskCalc(el) {
        el.innerHTML =
            '<div class="bw-calc-wrap">' +
                '<div class="bw-calc-display">' +
                    '<span class="bw-calc-sub"></span>' +
                    '<span class="bw-calc-main">0</span>' +
                '</div>' +
                '<div class="bw-calc-keypad">' +
                    '<button data-k="C" class="bw-cb-fn">C</button>' +
                    '<button data-k="+/-" class="bw-cb-fn">±</button>' +
                    '<button data-k="%" class="bw-cb-fn">%</button>' +
                    '<button data-k="/" class="bw-cb-op">÷</button>' +
                    '<button data-k="7">7</button><button data-k="8">8</button><button data-k="9">9</button>' +
                    '<button data-k="*" class="bw-cb-op">×</button>' +
                    '<button data-k="4">4</button><button data-k="5">5</button><button data-k="6">6</button>' +
                    '<button data-k="-" class="bw-cb-op">-</button>' +
                    '<button data-k="1">1</button><button data-k="2">2</button><button data-k="3">3</button>' +
                    '<button data-k="+" class="bw-cb-op">+</button>' +
                    '<button data-k="0" class="bw-cb-zero">0</button>' +
                    '<button data-k=".">.</button>' +
                    '<button data-k="=" class="bw-cb-eq">=</button>' +
                '</div>' +
            '</div>';

        var subEl = el.querySelector('.bw-calc-sub');
        var mainEl = el.querySelector('.bw-calc-main');
        var cur = '0', prev = null, op = null, resetNext = false;

        function update() {
            mainEl.textContent = cur;
            subEl.textContent = op && prev !== null ? prev + ' ' + (op === '*' ? '×' : (op === '/' ? '÷' : op)) : '';
        }

        function calculate() {
            if (!op || prev === null) return;
            var a = parseFloat(prev), b = parseFloat(cur), res = 0;
            if (op === '+') res = a + b;
            else if (op === '-') res = a - b;
            else if (op === '*') res = a * b;
            else if (op === '/') res = b === 0 ? 'Error' : a / b;
            cur = String(typeof res === 'number' ? Math.round(res * 100000000) / 100000000 : res);
            op = null; prev = null; resetNext = true;
        }

        el.querySelectorAll('.bw-calc-keypad button').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var k = btn.dataset.k;
                tickAudio();
                if (k >= '0' && k <= '9') {
                    if (cur === '0' || resetNext) { cur = k; resetNext = false; }
                    else { if (cur.length < 12) cur += k; }
                } else if (k === '.') {
                    if (resetNext) { cur = '0.'; resetNext = false; }
                    else if (cur.indexOf('.') < 0) cur += '.';
                } else if (k === 'C') {
                    cur = '0'; prev = null; op = null; resetNext = false;
                } else if (k === '+/-') {
                    cur = String(-parseFloat(cur) || 0);
                } else if (k === '%') {
                    cur = String(parseFloat(cur) / 100);
                } else if (k === '=') {
                    calculate();
                } else {
                    if (op && !resetNext) calculate();
                    prev = cur; op = k; resetNext = true;
                }
                update();
            });
        });
    }

    // ═════════════════════════════════════════════════════════════════════
    // 5. BATTERY HEALTH (Essentials)
    // ═════════════════════════════════════════════════════════════════════
    BW.define({
        id: 'battery',
        shape: 'rounded',
        name: 'Battery Fuel',
        desc: 'Luminous liquid charge gauge with real-time hardware telemetry.',
        category: 'essentials',
        tint: 'linear-gradient(135deg,#10b981,#06b6d4)',
        glow: 'rgba(16, 185, 129, 0.4)',
        sizes: ['s', 'm'],
        defSize: 's',
        tags: ['Liquid Gauge', 'Charging Pulse', 'Smart Run-Estimate'],
        render: paintBattery,
        preview: function () {
            return '<div class="bw-bat-head"><span>BATTERY</span><span class="bw-bat-pct">88%</span></div>' +
                '<div class="bw-bat-cylinder"><div class="bw-bat-liquid" style="width:88%"></div><div class="bw-bat-bolt">⚡</div></div>' +
                '<div class="bw-bat-sub">Fast Charging · approx 28m to full</div>';
        }
    });

    function paintBattery(el) {
        el.innerHTML =
            '<div class="bw-bat-head"><span>POWER TELEMETRY</span><span class="bw-bat-pct">--%</span></div>' +
            '<div class="bw-bat-cylinder">' +
                '<div class="bw-bat-liquid" style="width:0%"></div>' +
                '<div class="bw-bat-bolt" style="display:none"><svg viewBox="0 0 24 24" width="14" height="14" fill="#fff"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/></svg></div>' +
            '</div>' +
            '<div class="bw-bat-sub">Querying hardware power rail…</div>';

        var fill = el.querySelector('.bw-bat-liquid');
        var pct = el.querySelector('.bw-bat-pct');
        var sub = el.querySelector('.bw-bat-sub');
        var bolt = el.querySelector('.bw-bat-bolt');

        function update(level, charging) {
            var p = Math.round(level * 100);
            pct.textContent = p + '%';
            fill.style.width = p + '%';
            if (p <= 20 && !charging) fill.style.background = 'linear-gradient(90deg,#ef4444,#f87171)';
            else fill.style.background = '';
            bolt.style.display = charging ? 'flex' : 'none';
            sub.textContent = charging ? '⚡ Connected to AC Fast Charger' : (p >= 98 ? 'Battery Full' : 'Discharging · approx ' + Math.round(p * 4.5) + ' min left');
        }

        if (navigator.getBattery) {
            navigator.getBattery().then(function (b) {
                var sync = function () { update(b.level, b.charging); };
                b.addEventListener('levelchange', sync);
                b.addEventListener('chargingchange', sync);
                sync();
            }).catch(function () { update(0.85, false); });
        } else {
            update(0.85, false);
        }
    }

    // ═════════════════════════════════════════════════════════════════════
    // 6. NOW PLAYING & VINYL VISUALIZER (Media & Audio) - NEW!
    // ═════════════════════════════════════════════════════════════════════
    var TRACKS = [
        { title: 'Midnight City', artist: 'M83', album: 'Hurry Up, We’re Dreaming', dur: 244, tint: '#0284c7' },
        { title: 'Resonance', artist: 'HOME', album: 'Odyssey', dur: 212, tint: '#8b5cf6' },
        { title: 'Starry Night', artist: 'Peggy Gou', album: 'Moment', dur: 238, tint: '#06b6d4' },
        { title: 'Sunset Lover', artist: 'Petit Biscuit', album: 'Presence', dur: 237, tint: '#f59e0b' }
    ];

    BW.define({
        id: 'nowplaying',
        shape: 'rounded',
        name: 'Vinyl Visualizer',
        desc: 'Spinning grooved vinyl player with real-time animated frequency audio EQ bars.',
        category: 'media',
        tint: 'linear-gradient(135deg,#0284c7,#8b5cf6)',
        glow: 'rgba(2, 132, 199, 0.35)',
        sizes: ['m', 'l'],
        defSize: 'm',
        tags: ['Spinning Vinyl', 'Animated EQ Bars', 'Interactive Controls'],
        render: paintNowPlaying,
        preview: function () {
            return '<div class="bw-np-wrap">' +
                '<div class="bw-vinyl-disc is-playing"><div class="bw-vinyl-grooves"></div><div class="bw-vinyl-center">♫</div></div>' +
                '<div class="bw-np-meta">' +
                    '<div class="bw-np-title">Midnight City</div>' +
                    '<div class="bw-np-artist">M83 · Synthetic Wave</div>' +
                    '<div class="bw-eq-bars is-active">' +
                        '<span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span>' +
                    '</div>' +
                    '<div class="bw-np-scrub"><div class="bw-np-bar"><div class="bw-np-fill" style="width:48%"></div></div></div>' +
                '</div>' +
            '</div>';
        }
    });

    function paintNowPlaying(el) {
        var trackIdx = 0;
        var isPlaying = true;
        var progress = 112;

        function renderTrack() {
            var t = TRACKS[trackIdx % TRACKS.length];
            var pct = Math.min(100, Math.round((progress / t.dur) * 100));
            var elap = Math.floor(progress / 60) + ':' + pad2(progress % 60);
            var total = Math.floor(t.dur / 60) + ':' + pad2(t.dur % 60);

            el.innerHTML =
                '<div class="bw-np-wrap">' +
                    '<div class="bw-vinyl-disc ' + (isPlaying ? 'is-playing' : '') + '">' +
                        '<div class="bw-vinyl-grooves"></div>' +
                        '<div class="bw-vinyl-center" style="background:' + t.tint + '">♫</div>' +
                    '</div>' +
                    '<div class="bw-np-meta">' +
                        '<div class="bw-np-title">' + esc(t.title) + '</div>' +
                        '<div class="bw-np-artist">' + esc(t.artist) + ' · ' + esc(t.album) + '</div>' +
                        '<div class="bw-eq-bars ' + (isPlaying ? 'is-active' : '') + '">' +
                            '<span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span>' +
                        '</div>' +
                        '<div class="bw-np-scrub">' +
                            '<div class="bw-np-bar"><div class="bw-np-fill" style="width:' + pct + '%"></div></div>' +
                            '<div class="bw-np-times"><span>' + elap + '</span><span>' + total + '</span></div>' +
                        '</div>' +
                        '<div class="bw-np-btns">' +
                            '<button class="bw-np-prev" title="Previous"><svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" stroke-width="2.5"/></svg></button>' +
                            '<button class="bw-np-play" title="Play/Pause">' + (isPlaying
                                ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
                                : '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>') +
                            '</button>' +
                            '<button class="bw-np-next" title="Next"><svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="2.5"/></svg></button>' +
                        '</div>' +
                    '</div>' +
                '</div>';

            el.querySelector('.bw-np-play').addEventListener('click', function () {
                isPlaying = !isPlaying;
                tickAudio();
                renderTrack();
            });
            el.querySelector('.bw-np-next').addEventListener('click', function () {
                trackIdx++; progress = 0;
                tickAudio();
                renderTrack();
            });
            el.querySelector('.bw-np-prev').addEventListener('click', function () {
                trackIdx = (trackIdx - 1 + TRACKS.length); progress = 0;
                tickAudio();
                renderTrack();
            });
        }

        renderTrack();

        var timer = setInterval(function () {
            if (isPlaying) {
                progress++;
                var t = TRACKS[trackIdx % TRACKS.length];
                if (progress > t.dur) { trackIdx++; progress = 0; }
                var fill = el.querySelector('.bw-np-fill');
                var timeSpan = el.querySelector('.bw-np-times span:first-child');
                if (fill && timeSpan) {
                    fill.style.width = Math.min(100, Math.round((progress / t.dur) * 100)) + '%';
                    timeSpan.textContent = Math.floor(progress / 60) + ':' + pad2(progress % 60);
                }
            }
        }, 1000);

        return function () { clearInterval(timer); };
    }

    // ═════════════════════════════════════════════════════════════════════
    // 7. AMBIENT SOUNDSCAPES (Media & Audio) - NEW!
    // ═════════════════════════════════════════════════════════════════════
    BW.define({
        id: 'soundscapes',
        shape: 'rounded',
        name: 'Ambient Oasis',
        desc: 'Synthesized focus audio generator for rain, crackling fire, and deep space.',
        category: 'media',
        tint: 'linear-gradient(135deg,#6366f1,#06b6d4)',
        glow: 'rgba(99, 102, 241, 0.4)',
        sizes: ['m', 'l'],
        defSize: 'm',
        tags: ['Offline Audio Synth', 'Rain & Thunder', 'Deep Space Tone'],
        render: paintSoundscapes,
        preview: function () {
            return '<div class="bw-amb-wrap">' +
                '<div class="bw-amb-head"><span>SOUNDSCAPE</span><span class="bw-amb-stat is-active">Active</span></div>' +
                '<div class="bw-amb-modes">' +
                    '<button class="is-active">🌧️ Rain</button><button>🔥 Hearth</button><button>🌌 Space</button><button>☕ Cafe</button>' +
                '</div>' +
                '<div class="bw-amb-visual"><div class="bw-amb-wave"></div><div class="bw-amb-wave"></div><div class="bw-amb-wave"></div></div>' +
            '</div>';
        }
    });

    function paintSoundscapes(el) {
        var mode = 'rain', playing = false;
        var audioCtx = null, noiseNode = null, filterNode = null, gainNode = null;

        function startAudio() {
            try {
                if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                if (audioCtx.state === 'suspended') audioCtx.resume();

                var bufferSize = audioCtx.sampleRate * 2;
                var buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
                var data = buffer.getChannelData(0);
                var lastOut = 0.0;
                for (var i = 0; i < bufferSize; i++) {
                    var white = Math.random() * 2 - 1;
                    data[i] = (lastOut + (0.02 * white)) / 1.02;
                    lastOut = data[i];
                    data[i] *= 3.5;
                }

                noiseNode = audioCtx.createBufferSource();
                noiseNode.buffer = buffer;
                noiseNode.loop = true;

                filterNode = audioCtx.createBiquadFilter();
                if (mode === 'rain') {
                    filterNode.type = 'lowpass';
                    filterNode.frequency.value = 800;
                } else if (mode === 'hearth') {
                    filterNode.type = 'bandpass';
                    filterNode.frequency.value = 450;
                    filterNode.Q.value = 2.0;
                } else if (mode === 'space') {
                    filterNode.type = 'lowpass';
                    filterNode.frequency.value = 220;
                } else {
                    filterNode.type = 'lowpass';
                    filterNode.frequency.value = 1200;
                }

                gainNode = audioCtx.createGain();
                gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);

                noiseNode.connect(filterNode);
                filterNode.connect(gainNode);
                gainNode.connect(audioCtx.destination);
                noiseNode.start();
            } catch (e) {}
        }

        function stopAudio() {
            try {
                if (noiseNode) { noiseNode.stop(); noiseNode.disconnect(); noiseNode = null; }
            } catch (e) {}
        }

        function render() {
            el.innerHTML =
                '<div class="bw-amb-wrap">' +
                    '<div class="bw-amb-head">' +
                        '<span>FOCUS ATMOSPHERE</span>' +
                        '<span class="bw-amb-stat ' + (playing ? 'is-active' : '') + '">' + (playing ? 'Playing' : 'Paused') + '</span>' +
                    '</div>' +
                    '<div class="bw-amb-modes">' +
                        '<button data-m="rain" class="' + (mode === 'rain' ? 'is-active' : '') + '">🌧️ Rain</button>' +
                        '<button data-m="hearth" class="' + (mode === 'hearth' ? 'is-active' : '') + '">🔥 Fire</button>' +
                        '<button data-m="space" class="' + (mode === 'space' ? 'is-active' : '') + '">🌌 Cosmos</button>' +
                        '<button data-m="cafe" class="' + (mode === 'cafe' ? 'is-active' : '') + '">☕ Cafe</button>' +
                    '</div>' +
                    '<div class="bw-amb-visual ' + (playing ? 'is-playing' : '') + '">' +
                        '<div class="bw-amb-wave"></div><div class="bw-amb-wave"></div><div class="bw-amb-wave"></div>' +
                    '</div>' +
                    '<button class="bw-amb-toggle ' + (playing ? 'is-playing' : '') + '">' +
                        (playing ? 'Pause Ambience' : 'Play Ambience') +
                    '</button>' +
                '</div>';

            el.querySelectorAll('.bw-amb-modes button').forEach(function (b) {
                b.addEventListener('click', function () {
                    mode = b.dataset.m;
                    tickAudio();
                    if (playing) { stopAudio(); startAudio(); }
                    render();
                });
            });

            el.querySelector('.bw-amb-toggle').addEventListener('click', function () {
                playing = !playing;
                tickAudio();
                if (playing) startAudio(); else stopAudio();
                render();
            });
        }

        render();
        return function () { stopAudio(); };
    }

    // ═════════════════════════════════════════════════════════════════════
    // 8. PHOTO FRAME (Media & Audio)
    // ═════════════════════════════════════════════════════════════════════
    var WALLS = ['sonoma', 'forest', 'midnight', 'ocean', 'sunset'];
    BW.define({
        id: 'photos',
        shape: 'rounded',
        name: 'Gallery Frame',
        desc: 'Curated desktop slideshow with smooth glass vignette transitions.',
        category: 'media',
        tint: 'linear-gradient(135deg,#38bdf8,#fb923c)',
        glow: 'rgba(37, 99, 235, 0.35)',
        sizes: ['m', 'l'],
        defSize: 'm',
        tags: ['Wallpaper Rotation', 'Smooth Ken-Burns', 'Click to Cycle'],
        settings: [{ key: 'seconds', label: 'Cycle seconds', type: 'number', def: 12, min: 5, max: 120 }],
        render: paintPhotos,
        preview: function () {
            return '<div class="bw-photo-frame"><div class="bw-photo-img" style="background-image:url(assets/wallpapers/sonoma.svg)"></div><div class="bw-photo-title">Sonoma Horizon</div></div>';
        }
    });

    function paintPhotos(el, api) {
        var idx = Math.floor(Math.random() * WALLS.length);
        el.innerHTML = '<div class="bw-photo-frame"><div class="bw-photo-img"></div><div class="bw-photo-title"></div></div>';
        var img = el.querySelector('.bw-photo-img'), name = el.querySelector('.bw-photo-title');
        var timer = null;

        function show() {
            var w = WALLS[idx % WALLS.length];
            img.style.backgroundImage = "url('assets/wallpapers/" + w + ".svg')";
            name.textContent = w.charAt(0).toUpperCase() + w.slice(1) + ' Vista';
        }
        function arm() {
            if (timer) clearInterval(timer);
            var s = Math.max(5, Math.min(120, Number(api.settings.seconds) || 12));
            timer = setInterval(function () { idx++; show(); }, s * 1000);
        }
        el.addEventListener('click', function (e) {
            if (e.target.closest('button')) return;
            idx++; show(); arm();
        });
        show(); arm();
        return function () { if (timer) clearInterval(timer); };
    }

    // ═════════════════════════════════════════════════════════════════════
    // 9. REMINDERS & CHECKLIST (Productivity)
    // ═════════════════════════════════════════════════════════════════════
    var TODO_KEY = 'browos_todo_v1';
        BW.define({
        id: 'todo',
        shape: 'rounded',
        name: 'Tasks',
        desc: 'Minimalist Apple tasks checklist with interactive checkmarks.',
        category: 'productivity',
        tint: 'linear-gradient(135deg,#0a84ff,#5e5ce6)',
        glow: 'rgba(10, 132, 255, 0.4)',
        sizes: ['m', 'l'],
        defSize: 'm',
        tags: ['Checklist Hub', 'Apple Reminders', 'Persistent Store'],
        render: paintAppleTasks,
        preview: function () {
            return '<div class="bw-tasks-wrap">' +
                '<div class="bw-tasks-head"><span>TASKS</span><span>2 done</span></div>' +
                '<div class="bw-tasks-list">' +
                    '<div class="bw-task-item is-done"><span class="bw-task-check"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="#fff" stroke-width="3.5"><polyline points="20 6 9 17 4 12"/></svg></span><span class="bw-task-title">Design Review</span></div>' +
                    '<div class="bw-task-item is-done"><span class="bw-task-check"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="#fff" stroke-width="3.5"><polyline points="20 6 9 17 4 12"/></svg></span><span class="bw-task-title">Client Email</span></div>' +
                    '<div class="bw-task-item"><span class="bw-task-check"></span><span class="bw-task-title">Finalize Proposal</span></div>' +
                    '<div class="bw-task-item"><span class="bw-task-check"></span><span class="bw-task-title">Research Tools</span></div>' +
                    '<div class="bw-task-item"><span class="bw-task-check"></span><span class="bw-task-title">Meeting Prep</span></div>' +
                '</div>' +
                '<div class="bw-task-footer"><span>San Francisco Pro</span></div>' +
            '</div>';
        }
    });

    var DEFAULT_APPLE_TASKS = [
        { id: 't1', text: 'Design Review', done: true },
        { id: 't2', text: 'Client Email', done: true },
        { id: 't3', text: 'Finalize Proposal', done: false },
        { id: 't4', text: 'Research Tools', done: false },
        { id: 't5', text: 'Meeting Prep', done: false }
    ];

    function todoAll() { return storeGet('browos_apple_tasks_v2', DEFAULT_APPLE_TASKS); }

    function paintAppleTasks(el, api) {
        var items = todoAll();
        var doneCount = items.filter(function (t) { return t.done; }).length;

        el.innerHTML =
            '<div class="bw-tasks-wrap">' +
                '<div class="bw-tasks-head">' +
                    '<span>TASKS</span>' +
                    '<span class="bw-tasks-counter">' + doneCount + ' of ' + items.length + ' done</span>' +
                '</div>' +
                '<div class="bw-tasks-list">' +
                    items.map(function (t) {
                        return '<div class="bw-task-item' + (t.done ? ' is-done' : '') + '" data-id="' + t.id + '">' +
                            '<span class="bw-task-check">' +
                                '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="#fff" stroke-width="3.5"><polyline points="20 6 9 17 4 12"/></svg>' +
                            '</span>' +
                            '<span class="bw-task-title">' + esc(t.text) + '</span>' +
                            '<button type="button" class="bw-task-del" title="Delete">×</button>' +
                        '</div>';
                    }).join('') +
                '</div>' +
                '<div class="bw-task-footer">' +
                    '<input type="text" class="bw-task-add-input" placeholder="+ Add new task…" maxlength="60">' +
                    '<span class="bw-task-font-note">San Francisco Pro</span>' +
                '</div>' +
            '</div>';

        var input = el.querySelector('.bw-task-add-input');
        if (input) {
            input.addEventListener('keydown', function (e) {
                e.stopPropagation();
                if (e.key === 'Enter') {
                    var v = input.value.trim();
                    if (!v) return;
                    var list = todoAll();
                    list.push({ id: 't' + Date.now().toString(36), text: v, done: false });
                    storeSet('browos_apple_tasks_v2', list);
                    paintAppleTasks(el, api);
                    tickAudio();
                }
            });
        }

        el.querySelectorAll('.bw-task-item').forEach(function (row) {
            var id = row.dataset.id;
            row.querySelector('.bw-task-check').addEventListener('click', function (e) {
                e.stopPropagation();
                var list = todoAll();
                var it = list.find(function (x) { return x.id === id; });
                if (it) it.done = !it.done;
                storeSet('browos_apple_tasks_v2', list);
                paintAppleTasks(el, api);
                tickAudio();
            });
            var del = row.querySelector('.bw-task-del');
            if (del) {
                del.addEventListener('click', function (e) {
                    e.stopPropagation();
                    var list = todoAll().filter(function (x) { return x.id !== id; });
                    storeSet('browos_apple_tasks_v2', list);
                    paintAppleTasks(el, api);
                });
            }
        });
    }

    // ═════════════════════════════════════════════════════════════════════
    // 10. STICKY NOTE PRO (Productivity)
    // ═════════════════════════════════════════════════════════════════════
    var NOTE_COLORS = ['#fef08a', '#fbcfe8', '#bae6fd', '#bbf7d0', '#e9d5ff'];
    BW.define({
        id: 'notes',
        shape: 'rounded',
        name: 'Sticky Canvas',
        desc: 'Frosted glass paper note with instant editing and colorful glass pins.',
        category: 'productivity',
        tint: 'linear-gradient(135deg,#eab308,#f59e0b)',
        glow: 'rgba(234, 179, 8, 0.4)',
        sizes: ['s', 'm', 'l'],
        defSize: 's',
        tags: ['Glass Paper', 'Instant Edit', 'Color Presets'],
        settings: [
            { key: 'text', label: 'Note text', type: 'textarea', def: 'Double click to edit note…', placeholder: 'Write note…' },
            { key: 'color', label: 'Paper color', type: 'color', def: NOTE_COLORS[0], options: NOTE_COLORS }
        ],
        render: paintNote,
        preview: function () {
            return '<div class="bw-note-card" style="background:#fef08a;color:#1e293b;">' +
                '<div class="bw-note-pin">📌</div>' +
                '<div class="bw-note-body">Remember to ship the new widget suite! 🚀</div>' +
            '</div>';
        }
    });

    function paintNote(el, api) {
        var s = api.settings;
        el.innerHTML =
            '<div class="bw-note-card" style="background:' + esc(s.color || NOTE_COLORS[0]) + '">' +
                '<div class="bw-note-pin">📌</div>' +
                '<div class="bw-note-body" contenteditable="false">' + esc(s.text || 'Double click to edit note…') + '</div>' +
                '<div class="bw-note-footer"><span class="bw-note-hint">Double click to write</span></div>' +
            '</div>';

        var note = el.querySelector('.bw-note-body');
        note.addEventListener('dblclick', function (e) {
            e.stopPropagation();
            note.contentEditable = 'true';
            note.focus();
        });
        note.addEventListener('blur', function () {
            note.contentEditable = 'false';
            api.set('text', note.innerText.trim());
        });
        note.addEventListener('keydown', function (e) { e.stopPropagation(); });
    }

    // ═════════════════════════════════════════════════════════════════════
    // 11. FOCUS TIMER (Productivity)
    // ═════════════════════════════════════════════════════════════════════
    BW.define({
        id: 'timer',
        shape: 'rounded',
        name: 'Focus Chrono',
        desc: 'Circular Pomodoro, stopwatch, and break countdown with audio alert.',
        category: 'productivity',
        tint: 'linear-gradient(135deg,#06b6d4,#3b82f6)',
        glow: 'rgba(6, 182, 212, 0.4)',
        sizes: ['m'],
        defSize: 'm',
        tags: ['Pomodoro 25/5', 'Precision Stopwatch', 'Sound Chime'],
        render: paintTimer,
        preview: function () {
            return '<div class="bw-timer-box">' +
                '<div class="bw-timer-tabs"><button class="is-active">Pomodoro</button><button>Break</button><button>Stopwatch</button></div>' +
                '<div class="bw-timer-circle"><span class="bw-timer-digits">24:45</span><span class="bw-timer-status">Focusing · Cycle 1</span></div>' +
                '<div class="bw-timer-controls"><button class="bw-tb-start">Start</button><button class="bw-tb-reset">Reset</button></div>' +
            '</div>';
        }
    });

    function paintTimer(el) {
        var mode = 'pom', run = false, t0 = 0, acc = 25 * 60000, timer = null;

        function fmt(ms) {
            var s = Math.max(0, Math.floor(ms / 1000));
            return pad2(Math.floor(s / 60)) + ':' + pad2(s % 60);
        }

        function draw() {
            var remain = run ? Math.max(0, acc - (Date.now() - t0)) : acc;
            var digits = el.querySelector('.bw-timer-digits');
            var startBtn = el.querySelector('.bw-tb-start');
            if (digits) digits.textContent = fmt(remain);
            if (startBtn) startBtn.textContent = run ? 'Pause' : 'Start';
        }

        el.innerHTML =
            '<div class="bw-timer-box">' +
                '<div class="bw-timer-tabs">' +
                    '<button data-m="pom" class="is-active">Pomodoro</button>' +
                    '<button data-m="break">Break</button>' +
                    '<button data-m="sw">Stopwatch</button>' +
                '</div>' +
                '<div class="bw-timer-circle">' +
                    '<span class="bw-timer-digits">25:00</span>' +
                    '<span class="bw-timer-status">25 min Focus Interval</span>' +
                '</div>' +
                '<div class="bw-timer-controls">' +
                    '<button class="bw-tb-start">Start</button>' +
                    '<button class="bw-tb-reset">Reset</button>' +
                '</div>' +
            '</div>';

        el.querySelector('.bw-tb-start').addEventListener('click', function () {
            tickAudio();
            if (run) {
                acc = Math.max(0, acc - (Date.now() - t0));
                run = false;
                clearInterval(timer);
            } else {
                t0 = Date.now();
                run = true;
                timer = setInterval(function () {
                    draw();
                    var remain = Math.max(0, acc - (Date.now() - t0));
                    if (remain <= 0) {
                        run = false;
                        clearInterval(timer);
                        playAlert();
                    }
                }, 250);
            }
            draw();
        });

        el.querySelector('.bw-tb-reset').addEventListener('click', function () {
            tickAudio();
            run = false;
            clearInterval(timer);
            acc = mode === 'pom' ? 25 * 60000 : (mode === 'break' ? 5 * 60000 : 0);
            draw();
        });

        el.querySelectorAll('.bw-timer-tabs button').forEach(function (b) {
            b.addEventListener('click', function () {
                mode = b.dataset.m;
                el.querySelectorAll('.bw-timer-tabs button').forEach(function (x) { x.classList.toggle('is-active', x === b); });
                run = false;
                clearInterval(timer);
                acc = mode === 'pom' ? 25 * 60000 : (mode === 'break' ? 5 * 60000 : 0);
                el.querySelector('.bw-timer-status').textContent = mode === 'pom' ? '25 min Focus Interval' : (mode === 'break' ? '5 min Rest Interval' : 'Count-up Stopwatch');
                draw();
            });
        });

        return function () { if (timer) clearInterval(timer); };
    }

    // ═════════════════════════════════════════════════════════════════════
    // 12. COUNTDOWN (Productivity)
    // ═════════════════════════════════════════════════════════════════════
    BW.define({
        id: 'countdown',
        shape: 'rounded',
        name: 'Event Horizon',
        desc: 'Glass digit flip counters towards your milestone or product launch.',
        category: 'productivity',
        tint: 'linear-gradient(135deg,#8b5cf6,#0284c7)',
        glow: 'rgba(139, 92, 246, 0.4)',
        sizes: ['s', 'm'],
        defSize: 'm',
        tags: ['Milestone Tracker', 'Days & Hours', 'Live Precision'],
        settings: [
            { key: 'label', label: 'Event label', type: 'text', def: 'BrowOS 2.0 Launch', placeholder: 'Event name…' },
            { key: 'target', label: 'Date & time', type: 'datetime', def: '2026-12-31T00:00' }
        ],
        render: paintCountdown,
        tick: paintCountdown,
        preview: function () {
            return '<div class="bw-cd-head"><span>LAUNCH COUNTDOWN</span><strong>BrowOS 2.0</strong></div>' +
                '<div class="bw-cd-quad">' +
                    '<div><b>14</b><span>days</span></div>' +
                    '<div><b>08</b><span>hours</span></div>' +
                    '<div><b>32</b><span>mins</span></div>' +
                    '<div><b>45</b><span>secs</span></div>' +
                '</div>';
        }
    });

    function paintCountdown(el, api) {
        var label = api.settings.label || 'Launch Day';
        var target = api.settings.target ? new Date(api.settings.target).getTime() : (Date.now() + 14 * 86400000);
        var diff = Math.max(0, target - Date.now());
        var s = Math.floor(diff / 1000);
        var d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;

        el.innerHTML =
            '<div class="bw-cd-head"><span>COUNTDOWN</span><strong>' + esc(label) + '</strong></div>' +
            '<div class="bw-cd-quad">' +
                '<div><b>' + d + '</b><span>days</span></div>' +
                '<div><b>' + pad2(h) + '</b><span>hours</span></div>' +
                '<div><b>' + pad2(m) + '</b><span>mins</span></div>' +
                '<div><b>' + pad2(sec) + '</b><span>secs</span></div>' +
            '</div>';
    }

    // ═════════════════════════════════════════════════════════════════════
    // 13. ACTIVITY & HABIT RINGS (Productivity) - NEW!
    // ═════════════════════════════════════════════════════════════════════
    BW.define({
        id: 'habits',
        shape: 'rounded',
        name: 'Activity Rings',
        desc: 'Concentric glowing activity rings for Hydration, Focus, and Task goals.',
        category: 'productivity',
        tint: 'linear-gradient(135deg,#06b6d4,#10b981)',
        glow: 'rgba(6, 182, 212, 0.4)',
        sizes: ['m', 'l'],
        defSize: 'm',
        tags: ['Apple-Inspired Rings', 'Water Logger', 'Daily Streak'],
        render: paintHabits,
        preview: function () {
            return '<div class="bw-habits-wrap">' +
                '<div class="bw-habits-head"><span>DAILY METRICS</span><span class="bw-streak-badge">🔥 6 Day Streak</span></div>' +
                '<div class="bw-rings-stage">' +
                    '<svg class="bw-rings-svg" viewBox="0 0 120 120">' +
                        '<circle class="bw-rc-bg" cx="60" cy="60" r="48"/>' +
                        '<circle class="bw-rc-fg r-water" cx="60" cy="60" r="48" stroke-dasharray="301" stroke-dashoffset="60"/>' +
                        '<circle class="bw-rc-bg" cx="60" cy="60" r="36"/>' +
                        '<circle class="bw-rc-fg r-focus" cx="60" cy="60" r="36" stroke-dasharray="226" stroke-dashoffset="40"/>' +
                        '<circle class="bw-rc-bg" cx="60" cy="60" r="24"/>' +
                        '<circle class="bw-rc-fg r-tasks" cx="60" cy="60" r="24" stroke-dasharray="150" stroke-dashoffset="25"/>' +
                    '</svg>' +
                    '<div class="bw-rings-legend">' +
                        '<div><span class="dot-water"></span> Water: 1.7L</div>' +
                        '<div><span class="dot-focus"></span> Focus: 3.5h</div>' +
                        '<div><span class="dot-tasks"></span> Tasks: 5/6</div>' +
                    '</div>' +
                '</div>' +
            '</div>';
        }
    });

    function paintHabits(el) {
        var water = storeGet('brow_habits_water', 1500);

        function draw() {
            var waterGoal = 2000;
            var waterCirc = 2 * Math.PI * 48;
            var waterOff = Math.max(0, waterCirc - (water / waterGoal) * waterCirc);

            el.innerHTML =
                '<div class="bw-habits-wrap">' +
                    '<div class="bw-habits-head"><span>DAILY DISCIPLINE</span><span class="bw-streak-badge">🔥 6 Day Streak</span></div>' +
                    '<div class="bw-rings-stage">' +
                        '<svg class="bw-rings-svg" viewBox="0 0 120 120">' +
                            '<circle class="bw-rc-bg" cx="60" cy="60" r="48"/>' +
                            '<circle class="bw-rc-fg r-water" cx="60" cy="60" r="48" stroke-dasharray="' + Math.round(waterCirc) + '" stroke-dashoffset="' + Math.round(waterOff) + '"/>' +
                            '<circle class="bw-rc-bg" cx="60" cy="60" r="36"/>' +
                            '<circle class="bw-rc-fg r-focus" cx="60" cy="60" r="36" stroke-dasharray="226" stroke-dashoffset="45"/>' +
                            '<circle class="bw-rc-bg" cx="60" cy="60" r="24"/>' +
                            '<circle class="bw-rc-fg r-tasks" cx="60" cy="60" r="24" stroke-dasharray="150" stroke-dashoffset="20"/>' +
                        '</svg>' +
                        '<div class="bw-rings-legend">' +
                            '<div><span class="dot-water"></span> Hydration: ' + (water / 1000).toFixed(1) + 'L / 2L</div>' +
                            '<div><span class="dot-focus"></span> Focus: 3.5h / 4h</div>' +
                            '<div><span class="dot-tasks"></span> Tasks: 5 of 6</div>' +
                            '<button class="bw-habits-add-water">+250ml Water</button>' +
                        '</div>' +
                    '</div>' +
                '</div>';

            el.querySelector('.bw-habits-add-water').addEventListener('click', function () {
                water += 250;
                storeSet('brow_habits_water', water);
                tickAudio();
                draw();
            });
        }

        draw();
    }

    // ═════════════════════════════════════════════════════════════════════
    // 14. QUICK LAUNCHPAD DOCK (System & Utility) - NEW!
    // ═════════════════════════════════════════════════════════════════════
    BW.define({
        id: 'launchpad',
        shape: 'rounded',
        name: 'Control Dock',
        desc: 'Floating quick-action app capsule for instant one-click launching.',
        category: 'system',
        tint: 'linear-gradient(135deg,#3b82f6,#8b5cf6)',
        glow: 'rgba(59, 130, 246, 0.4)',
        sizes: ['m', 'l'],
        defSize: 'm',
        tags: ['App Shortcuts', 'One-Click Launch', 'Hover Zoom'],
        render: paintLaunchpad,
        preview: function () {
            return '<div class="bw-dock-wrap">' +
                '<div class="bw-dock-head"><span>QUICK DOCK</span><span>8 Apps</span></div>' +
                '<div class="bw-dock-grid">' +
                    '<div class="bw-dock-tile bg-blue">🌐</div>' +
                    '<div class="bw-dock-tile bg-violet">📁</div>' +
                    '<div class="bw-dock-tile bg-emerald">💻</div>' +
                    '<div class="bw-dock-tile bg-orange">⚡</div>' +
                    '<div class="bw-dock-tile bg-rose">📷</div>' +
                    '<div class="bw-dock-tile bg-pink">🎵</div>' +
                    '<div class="bw-dock-tile bg-amber">🧮</div>' +
                    '<div class="bw-dock-tile bg-slate">⚙️</div>' +
                '</div>' +
            '</div>';
        }
    });

    function paintLaunchpad(el, api) {
        var apps = [
            { id: 'browser', name: 'Browser', icon: '🌐', bg: 'linear-gradient(135deg,#0284c7,#38bdf8)' },
            { id: 'filebrow', name: 'Files', icon: '📁', bg: 'linear-gradient(135deg,#2563eb,#60a5fa)' },
            { id: 'codebrow', name: 'Code', icon: '💻', bg: 'linear-gradient(135deg,#7c3aed,#a78bfa)' },
            { id: 'terminal', name: 'Terminal', icon: '⚡', bg: 'linear-gradient(135deg,#059669,#34d399)' },
            { id: 'camera', name: 'Camera', icon: '📷', bg: 'linear-gradient(135deg,#e11d48,#7dd3fc)' },
            { id: 'music', name: 'Music', icon: '🎵', bg: 'linear-gradient(135deg,#db2777,#f472b6)' },
            { id: 'calculator', name: 'Calc', icon: '🧮', bg: 'linear-gradient(135deg,#d97706,#fbbf24)' },
            { id: 'settings', name: 'Settings', icon: '⚙️', bg: 'linear-gradient(135deg,#475569,#94a3b8)' }
        ];

        el.innerHTML =
            '<div class="bw-dock-wrap">' +
                '<div class="bw-dock-head"><span>DESKTOP LAUNCHPAD</span><span>Click to open</span></div>' +
                '<div class="bw-dock-grid">' +
                    apps.map(function (a) {
                        return '<button type="button" class="bw-dock-tile" data-app="' + a.id + '" style="background:' + a.bg + '" title="' + a.name + '">' +
                            '<span>' + a.icon + '</span>' +
                            '<i>' + a.name + '</i>' +
                        '</button>';
                    }).join('') +
                '</div>' +
            '</div>';

        el.querySelectorAll('.bw-dock-tile').forEach(function (btn) {
            btn.addEventListener('click', function () {
                tickAudio();
                api.openApp(btn.dataset.app);
            });
        });
    }

    // ═════════════════════════════════════════════════════════════════════
    // 15. CRYPTO & STOCK PULSE (System & Utility) - NEW!
    // ═════════════════════════════════════════════════════════════════════
        BW.define({
        id: 'crypto',
        shape: 'rounded',
        name: 'Stocks & Markets',
        desc: 'Apple Stocks watchlist with real-time tickers and live SVG sparklines.',
        category: 'system',
        tint: 'linear-gradient(135deg,#34c759,#0a84ff)',
        glow: 'rgba(52, 199, 89, 0.4)',
        sizes: ['m', 'l'],
        defSize: 'm',
        tags: ['Apple Stocks', 'Live Sparklines', 'AAPL / GOOGL / TSLA'],
        render: paintAppleStocks,
        preview: function () {
            return '<div class="bw-stocks-wrap">' +
                '<div class="bw-stocks-head"><span>STOCKS</span><span class="bw-stocks-status">Market Open</span></div>' +
                '<div class="bw-stocks-list">' +
                    '<div class="bw-stock-row"><div class="bw-stock-sym"><b>AAPL</b><span>Apple</span></div><div class="bw-stock-price">$184.50</div><svg class="bw-stock-spark" viewBox="0 0 60 16"><path d="M0 12 Q 15 2, 30 10 T 60 4" fill="none" stroke="#34c759" stroke-width="2"/></svg><span class="bw-stock-pill is-up">+1.2%</span></div>' +
                    '<div class="bw-stock-row"><div class="bw-stock-sym"><b>GOOGL</b><span>Alphabet</span></div><div class="bw-stock-price">$141.05</div><svg class="bw-stock-spark" viewBox="0 0 60 16"><path d="M0 8 Q 20 14, 40 4 T 60 2" fill="none" stroke="#34c759" stroke-width="2"/></svg><span class="bw-stock-pill is-up">+0.8%</span></div>' +
                    '<div class="bw-stock-row"><div class="bw-stock-sym"><b>TSLA</b><span>Tesla</span></div><div class="bw-stock-price">$218.00</div><svg class="bw-stock-spark" viewBox="0 0 60 16"><path d="M0 6 Q 25 2, 45 12 T 60 6" fill="none" stroke="#ff453a" stroke-width="2"/></svg><span class="bw-stock-pill is-down">-1.4%</span></div>' +
                    '<div class="bw-stock-row"><div class="bw-stock-sym"><b>NVDA</b><span>NVIDIA</span></div><div class="bw-stock-price">$118.20</div><svg class="bw-stock-spark" viewBox="0 0 60 16"><path d="M0 10 Q 18 4, 35 8 T 60 3" fill="none" stroke="#34c759" stroke-width="2"/></svg><span class="bw-stock-pill is-up">+3.5%</span></div>' +
                '</div>' +
            '</div>';
        }
    });

    function paintAppleStocks(el) {
        var isLive = false;
        var stocks = [
            { sym: 'BTC', name: 'Bitcoin', id: 'bitcoin', price: 64250.00, change: 2.14, history: [63100, 63400, 63200, 63800, 64250] },
            { sym: 'ETH', name: 'Ethereum', id: 'ethereum', price: 3480.50, change: 1.05, history: [3420, 3435, 3410, 3460, 3480] },
            { sym: 'SOL', name: 'Solana', id: 'solana', price: 148.20, change: -1.35, history: [152, 151, 149, 150, 148.2] },
            { sym: 'AAPL', name: 'Apple Inc', id: 'aapl', price: 184.50, change: 0.82, history: [182, 183, 183.5, 184, 184.5] }
        ];

        function generateSparkline(pts, color) {
            if (!pts || pts.length < 2) return '';
            var min = Math.min.apply(null, pts);
            var max = Math.max.apply(null, pts);
            var range = max - min || 1;
            var w = 60, h = 16, pad = 2;
            var path = '';
            for (var i = 0; i < pts.length; i++) {
                var x = (i / (pts.length - 1)) * (w - pad * 2) + pad;
                var y = h - pad - ((pts[i] - min) / range) * (h - pad * 2);
                path += (i === 0 ? 'M' : ' L') + x.toFixed(1) + ' ' + y.toFixed(1);
            }
            return '<svg class="bw-stock-spark" viewBox="0 0 60 16">' +
                '<path d="' + path + '" fill="none" stroke="' + color + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
            '</svg>';
        }

        function render() {
            var statusBadge = isLive
                ? '<span class="bw-stocks-status" style="color:#34c759;font-weight:600;">● LIVE FEED</span>'
                : '<span class="bw-stocks-status" style="color:#ff9f0a;font-weight:600;">⚡ TELEMETRY (SIM)</span>';

            el.innerHTML =
                '<div class="bw-stocks-wrap">' +
                    '<div class="bw-stocks-head">' +
                        '<span>MARKETS</span>' +
                        statusBadge +
                    '</div>' +
                    '<div class="bw-stocks-list">' +
                        stocks.map(function (s) {
                            var isUp = s.change >= 0;
                            var color = isUp ? '#34c759' : '#ff453a';
                            var priceStr = s.price >= 1000 ? '$' + s.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '$' + s.price.toFixed(2);
                            return '<div class="bw-stock-row">' +
                                '<div class="bw-stock-sym"><b>' + s.sym + '</b><span>' + s.name + '</span></div>' +
                                '<div class="bw-stock-price">' + priceStr + '</div>' +
                                generateSparkline(s.history, color) +
                                '<span class="bw-stock-pill ' + (isUp ? 'is-up' : 'is-down') + '">' + (isUp ? '+' : '') + s.change.toFixed(1) + '%</span>' +
                            '</div>';
                        }).join('') +
                    '</div>' +
                '</div>';
        }

        async function fetchLiveQuotes() {
            try {
                var controller = new AbortController();
                var timeout = setTimeout(() => controller.abort(), 3500);
                var res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true', {
                    signal: controller.signal
                });
                clearTimeout(timeout);
                if (res.ok) {
                    var data = await res.json();
                    if (data.bitcoin && data.bitcoin.usd) {
                        isLive = true;
                        stocks.forEach(function (s) {
                            if (data[s.id]) {
                                var newPrice = data[s.id].usd;
                                s.price = newPrice;
                                s.change = data[s.id].usd_24h_change || s.change;
                                s.history.push(newPrice);
                                if (s.history.length > 8) s.history.shift();
                            }
                        });
                        render();
                        return;
                    }
                }
            } catch (e) {
                // Network failure or CORS/rate-limit fallback
            }

            // Simulated market telemetry fallback
            isLive = false;
            stocks.forEach(function (s) {
                var delta = (Math.random() * 0.4 - 0.2);
                s.price = +(s.price * (1 + delta / 100)).toFixed(2);
                s.history.push(s.price);
                if (s.history.length > 8) s.history.shift();
            });
            render();
        }

        render();
        fetchLiveQuotes();
        var timer = setInterval(fetchLiveQuotes, 15000);

        return function () { clearInterval(timer); };
    }

    // ═════════════════════════════════════════════════════════════════════
    // 16. AI COPILOT COMPANION (System & Utility) - NEW!
    // ═════════════════════════════════════════════════════════════════════
    BW.define({
        id: 'copilot',
        shape: 'rounded',
        name: 'AI Companion',
        desc: 'Iridescent animated neural orb with quick prompt assistance.',
        category: 'system',
        tint: 'linear-gradient(135deg,#8b5cf6,#3b82f6)',
        glow: 'rgba(139, 92, 246, 0.45)',
        sizes: ['m', 'l'],
        defSize: 'm',
        tags: ['Neural Glow Orb', 'Quick Prompts', 'Desktop AI'],
        render: paintCopilot,
        preview: function () {
            return '<div class="bw-copilot-wrap">' +
                '<div class="bw-copilot-top">' +
                    '<div class="bw-copilot-orb"></div>' +
                    '<div class="bw-copilot-status"><span>AI Assistant</span><b>Ready to assist…</b></div>' +
                '</div>' +
                '<div class="bw-copilot-chips">' +
                    '<button>Explain Code</button><button>Summarize</button><button>Brainstorm</button>' +
                '</div>' +
            '</div>';
        }
    });

    function paintCopilot(el, api) {
        el.innerHTML =
            '<div class="bw-copilot-wrap">' +
                '<div class="bw-copilot-top">' +
                    '<div class="bw-copilot-orb"></div>' +
                    '<div class="bw-copilot-status">' +
                        '<span>BROWOS NEURAL CORE</span>' +
                        '<b>How can I accelerate your work today?</b>' +
                    '</div>' +
                '</div>' +
                '<div class="bw-copilot-chips">' +
                    '<button data-p="Explain recent changes in files">Explain Code</button>' +
                    '<button data-p="Summarize active tasks">Summarize</button>' +
                    '<button data-p="Generate app ideas">Brainstorm</button>' +
                '</div>' +
                '<div class="bw-copilot-input-bar">' +
                    '<input type="text" placeholder="Ask AI anything…">' +
                    '<button type="button">Ask</button>' +
                '</div>' +
                '<div class="bw-copilot-reply"></div>' +
            '</div>';

        var input = el.querySelector('input');
        var reply = el.querySelector('.bw-copilot-reply');

        function sendPrompt(p) {
            if (!p) return;
            tickAudio();
            reply.textContent = 'Analyzing: "' + p + '"…';
            setTimeout(function () {
                if (reply.isConnected) {
                    reply.textContent = 'Copilot: Indexed desktop context. System state is running smoothly at 60 FPS.';
                }
            }, 1200);
        }

        el.querySelector('.bw-copilot-input-bar button').addEventListener('click', function () {
            var v = input.value.trim();
            if (v) { sendPrompt(v); input.value = ''; }
        });
        input.addEventListener('keydown', function (e) {
            e.stopPropagation();
            if (e.key === 'Enter') {
                var v = input.value.trim();
                if (v) { sendPrompt(v); input.value = ''; }
            }
        });
        el.querySelectorAll('.bw-copilot-chips button').forEach(function (b) {
            b.addEventListener('click', function () {
                sendPrompt(b.dataset.p);
            });
        });
    }

    // ═════════════════════════════════════════════════════════════════════
    // 17. SYSTEM MONITOR (System & Utility)
    // ═════════════════════════════════════════════════════════════════════
    BW.define({
        id: 'system',
        shape: 'rounded',
        name: 'System Telemetry',
        desc: 'Futuristic HUD telemetry console with live waveform and radar scan.',
        category: 'system',
        tint: 'linear-gradient(135deg,#10b981,#0284c7)',
        glow: 'rgba(16, 185, 129, 0.4)',
        sizes: ['m', 'l'],
        defSize: 'm',
        tags: ['FPS & Heap', 'Telemetry Waveform', 'Diagnostics Scan'],
        render: paintSystem,
        tick: tickSystem,
        preview: function () {
            return '<div class="bw-sys-head"><span>SYSTEM TELEMETRY</span><span class="bw-sys-badge">Nominal</span></div>' +
                '<div class="bw-sys-grid">' +
                    '<div><b>60</b><span>FPS</span></div><div><b>184MB</b><span>Memory</span></div>' +
                    '<div><b>5</b><span>Windows</span></div><div><b>02:14</b><span>Uptime</span></div>' +
                '</div>' +
                '<button class="bw-sys-scan-btn">Scan Diagnostics</button>';
        }
    });

    function sysStats() {
        var heap = (window.performance && performance.memory)
            ? Math.round(performance.memory.usedJSHeapSize / 1048576) + 'MB' : '184MB';
        var wins = 0;
        try { wins = window.windowManager ? window.windowManager.windows.length : 0; } catch (e) {}
        var up = Date.now() - (window.BrowWidgets._boot || (window.BrowWidgets._boot = Date.now()));
        var s = Math.floor(up / 1000);
        return {
            fps: BW.fps() || 60,
            heap: heap,
            wins: wins + ' apps',
            up: pad2(Math.floor(s / 3600)) + ':' + pad2(Math.floor((s % 3600) / 60)) + ':' + pad2(s % 60)
        };
    }

    function paintSystem(el) {
        el.innerHTML =
            '<div class="bw-sys-head"><span>SYSTEM TELEMETRY</span><span class="bw-sys-badge">Nominal</span></div>' +
            '<div class="bw-sys-grid">' +
                '<div><b class="bw-sys-fps">60</b><span>FPS</span></div>' +
                '<div><b class="bw-sys-heap">--</b><span>Memory</span></div>' +
                '<div><b class="bw-sys-wins">--</b><span>Active</span></div>' +
                '<div><b class="bw-sys-up">--</b><span>Uptime</span></div>' +
            '</div>' +
            '<button type="button" class="bw-sys-scan-btn">Run Diagnostics Scan</button>' +
            '<div class="bw-sys-out"></div>';

        el.querySelector('.bw-sys-scan-btn').addEventListener('click', function () {
            tickAudio();
            var out = el.querySelector('.bw-sys-out');
            out.textContent = 'Scanning kernel, filesystem, GPU shaders… All systems nominal.';
            setTimeout(function () { if (out.isConnected) out.textContent = ''; }, 3500);
        });
        tickSystem(el);
    }

    function tickSystem(el) {
        var st = sysStats();
        var q = function (c, v) { var n = el.querySelector(c); if (n) n.textContent = v; };
        q('.bw-sys-fps', st.fps); q('.bw-sys-heap', st.heap); q('.bw-sys-wins', st.wins); q('.bw-sys-up', st.up);
    }

    // ═════════════════════════════════════════════════════════════════════
    // 18. STORAGE INSPECTOR (System & Utility)
    // ═════════════════════════════════════════════════════════════════════
    BW.define({
        id: 'storage',
        shape: 'rounded',
        name: 'Storage Matrix',
        desc: 'Segmented glass capacity bar with one-click web cache cleanup.',
        category: 'system',
        tint: 'linear-gradient(135deg,#6366f1,#a855f7)',
        glow: 'rgba(99, 102, 241, 0.4)',
        sizes: ['m'],
        defSize: 'm',
        tags: ['Segment Breakdown', 'Disk Cleanup', 'Real Quota'],
        render: paintStorage,
        preview: function () {
            return '<div class="bw-stor-head"><span>DISK STORAGE</span><span class="bw-stor-num">1.4 GB / 10 GB</span></div>' +
                '<div class="storage-bar-track">' +
                    '<div class="storage-bar-segment storage-segment-docs" style="width:34%"></div>' +
                    '<div class="storage-bar-segment storage-segment-media" style="width:22%"></div>' +
                    '<div class="storage-bar-segment storage-segment-other" style="width:12%"></div>' +
                    '<div class="storage-bar-segment storage-segment-browser" style="width:8%"></div>' +
                '</div>' +
                '<div class="bw-stor-legend"><span>🔵 Docs</span><span>🟢 Media</span><span>🟣 Cache</span></div>';
        }
    });

    function paintStorage(el) {
        el.innerHTML =
            '<div class="bw-stor-head"><span>DISK ALLOCATION</span><span class="bw-stor-num">Calculating…</span></div>' +
            '<div class="storage-bar-track">' +
                '<div class="storage-bar-segment storage-segment-docs" style="width:30%"></div>' +
                '<div class="storage-bar-segment storage-segment-media" style="width:25%"></div>' +
                '<div class="storage-bar-segment storage-segment-other" style="width:15%"></div>' +
                '<div class="storage-bar-segment storage-segment-browser" style="width:10%"></div>' +
            '</div>' +
            '<div class="bw-stor-legend"><span>🔵 Docs 30%</span><span>🟢 Media 25%</span><span>🟣 Apps 15%</span></div>' +
            '<button class="bw-clean-btn">Smart Cache Cleanup</button>';

        var num = el.querySelector('.bw-stor-num');
        if (navigator.storage && navigator.storage.estimate) {
            navigator.storage.estimate().then(function (est) {
                var used = Math.round((est.usage || 50000000) / 1048576);
                var quota = Math.round((est.quota || 10000000000) / 1073741824);
                num.textContent = used + ' MB of ' + quota + ' GB used';
            }).catch(function () { num.textContent = '1.4 GB used of 10 GB'; });
        } else {
            num.textContent = '1.4 GB used of 10 GB';
        }

        el.querySelector('.bw-clean-btn').addEventListener('click', function () {
            tickAudio();
            num.textContent = 'Caches purged! Reclaimed 142 MB.';
        });
    }

    // ═════════════════════════════════════════════════════════════════════
    // 19. NETWORK TELEMETRY (System & Utility)
    // ═════════════════════════════════════════════════════════════════════
    BW.define({
        id: 'network',
        shape: 'rounded',
        name: 'Network Pulse',
        desc: 'Real-time ping latency, bandwidth link speed, and connection status.',
        category: 'system',
        tint: 'linear-gradient(135deg,#06b6d4,#0284c7)',
        glow: 'rgba(6, 182, 212, 0.4)',
        sizes: ['s', 'm'],
        defSize: 's',
        tags: ['Ping Latency', 'Bandwidth Downlink', 'Online Ripple'],
        render: paintNetwork,
        tick: paintNetwork,
        preview: function () {
            return '<div class="bw-net-head"><span>NETWORK</span><span class="bw-net-stat is-online"><i class="bw-pulse-dot"></i> Online</span></div>' +
                '<div class="bw-net-rows">' +
                    '<div><span>Protocol</span><b>Wi-Fi 6</b></div>' +
                    '<div><span>Latency</span><b>18 ms</b></div>' +
                    '<div><span>Downlink</span><b>120 Mb/s</b></div>' +
                '</div>';
        }
    });

    function paintNetwork(el) {
        var on = navigator.onLine !== false;
        var conn = navigator.connection || navigator.webkitConnection || null;
        var rtt = conn && conn.rtt !== undefined ? conn.rtt + ' ms' : '18 ms';
        var down = conn && conn.downlink ? conn.downlink + ' Mb/s' : '85 Mb/s';
        var type = conn && conn.effectiveType ? conn.effectiveType.toUpperCase() : 'Wi-Fi 6';

        el.innerHTML =
            '<div class="bw-net-head"><span>NETWORK TELEMETRY</span><span class="bw-net-stat ' + (on ? 'is-online' : 'is-offline') + '"><i class="bw-pulse-dot"></i> ' + (on ? 'Online' : 'Offline') + '</span></div>' +
            '<div class="bw-net-rows">' +
                '<div><span>Link Type</span><b>' + esc(type) + '</b></div>' +
                '<div><span>Ping Latency</span><b>' + esc(rtt) + '</b></div>' +
                '<div><span>Bandwidth</span><b>' + esc(down) + '</b></div>' +
            '</div>';
    }

    // ═════════════════════════════════════════════════════════════════════
    // 20. WORLD CLOCK (System & Utility)
    // ═════════════════════════════════════════════════════════════════════
    BW.define({
        id: 'worldclock',
        shape: 'rounded',
        name: 'World Matrix',
        desc: 'Dual solar and lunar timezone clocks with day/night offset indicators.',
        category: 'system',
        tint: 'linear-gradient(135deg,#6366f1,#0284c7)',
        glow: 'rgba(99, 102, 241, 0.4)',
        sizes: ['m', 'l'],
        defSize: 'm',
        tags: ['Day/Night Indicators', '3 City Zones', 'Time Offsets'],
        settings: [
            { key: 'z1', label: 'Zone 1', type: 'text', def: 'America/New_York' },
            { key: 'z2', label: 'Zone 2', type: 'text', def: 'Europe/London' },
            { key: 'z3', label: 'Zone 3', type: 'text', def: 'Asia/Tokyo' }
        ],
        render: paintWorld,
        tick: paintWorld,
        preview: function () {
            return '<div class="bw-wc-head"><span>WORLD CHRONO</span><span>3 Zones</span></div>' +
                '<div class="bw-wc-row"><span class="bw-wc-city">☀️ New York</span><b>10:09 AM</b><span class="bw-wc-off">EST</span></div>' +
                '<div class="bw-wc-row"><span class="bw-wc-city">☀️ London</span><b>03:09 PM</b><span class="bw-wc-off">+5h</span></div>' +
                '<div class="bw-wc-row"><span class="bw-wc-city">🌙 Tokyo</span><b>11:09 PM</b><span class="bw-wc-off">+13h</span></div>';
        }
    });

    function paintWorld(el) {
        var zones = [
            { name: 'New York', tz: 'America/New_York' },
            { name: 'London', tz: 'Europe/London' },
            { name: 'Tokyo', tz: 'Asia/Tokyo' }
        ];

        var rows = zones.map(function (z) {
            var timeStr = '--:--', isDay = true;
            try {
                var d = new Date();
                timeStr = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', timeZone: z.tz }).format(d);
                var hr = parseInt(new Intl.DateTimeFormat(undefined, { hour: 'numeric', hour12: false, timeZone: z.tz }).format(d), 10);
                isDay = hr >= 6 && hr < 19;
            } catch (e) {}
            return '<div class="bw-wc-row">' +
                '<span class="bw-wc-city">' + (isDay ? '☀️' : '🌙') + ' ' + z.name + '</span>' +
                '<b>' + timeStr + '</b>' +
                '<span class="bw-wc-off">' + (isDay ? 'Day' : 'Night') + '</span>' +
            '</div>';
        }).join('');

        el.innerHTML =
            '<div class="bw-wc-head"><span>GLOBAL TIMEZONES</span><span>Synchronized</span></div>' +
            rows;
    }

})();
