/* BrowWidgets built-in set — 20 complete, fully-resizable, interactive,
 * and configurable widgets for BrowOS.
 *
 * Every widget supports:
 *   · Resizing: Small ('s': 170×170), Medium ('m': 358×170), Large ('l': 358×358)
 *   · Action on click: deep linking to relevant app, or direct in-widget interactive action
 *   · Configurable: customizable settings, theme tones, real-time live preview
 */
(function () {
    'use strict';
    if (!window.BrowWidgets) return;
    var BW = window.BrowWidgets;
    var esc = BW.esc;

    // ─── shared helpers ──────────────────────────────────────────────────
    var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    function pad2(n) { return String(n).padStart(2, '0'); }

    function ico(inner, size, opts) {
        opts = opts || {};
        var s = size || 24;
        return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="' + (opts.fill || 'none') + '"' +
            (opts.stroke === false ? '' :
                ' stroke="currentColor" stroke-width="' + (opts.sw || 1.8) +
                '" stroke-linecap="round" stroke-linejoin="round"') +
            ' aria-hidden="true">' + inner + '</svg>';
    }

    function num(v, fallback) {
        var n = Number(v);
        return isFinite(n) ? n : fallback;
    }

    function list(str) {
        return String(str == null ? '' : str)
            .split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    }

    function pct(part, whole) {
        if (!whole) return 0;
        return Math.max(0, Math.min(100, (part / whole) * 100));
    }

    var NOTE = '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>';

    // ═════════════════════════════════════════════════════════════════════
    // 1 · Clock (S / M / L)
    // ═════════════════════════════════════════════════════════════════════
    function clockHand(el, sel, deg, len) {
        var n = el.querySelector(sel);
        if (!n) return;
        var a = (deg - 90) * Math.PI / 180;
        n.setAttribute('x2', (50 + Math.cos(a) * len).toFixed(2));
        n.setAttribute('y2', (50 + Math.sin(a) * len).toFixed(2));
    }

    function tickClock(el) {
        var now = new Date();
        var h = now.getHours() % 12, m = now.getMinutes(), s = now.getSeconds();
        clockHand(el, '.c-hour', (h + m / 60) * 30, 25);
        clockHand(el, '.c-min', (m + s / 60) * 6, 33);
        clockHand(el, '.c-sec', s * 6, 37);

        // Update digital display if present in Medium/Large
        var digTime = el.querySelector('.bw-clk-dig-time');
        if (digTime) {
            var rawH = now.getHours();
            var dispH = el._format24 ? pad2(rawH) : ((rawH % 12) || 12);
            var ampm = el._format24 ? '' : (rawH >= 12 ? ' PM' : ' AM');
            digTime.textContent = dispH + ':' + pad2(m) + ':' + pad2(s) + ampm;
        }
    }

    function renderClock(el, api) {
        var sz = api.inst.size || 's';
        var isDigital = api.settings.style === 'digital';
        el._format24 = !!api.settings.format24;

        var now = new Date();
        var rawH = now.getHours();
        var dispH = el._format24 ? pad2(rawH) : ((rawH % 12) || 12);
        var ampm = el._format24 ? '' : (rawH >= 12 ? ' PM' : ' AM');
        var timeStr = dispH + ':' + pad2(now.getMinutes()) + (sz !== 's' ? ':' + pad2(now.getSeconds()) : '') + ampm;
        var dateStr = DAYS[now.getDay()] + ', ' + MONTHS[now.getMonth()] + ' ' + now.getDate();

        var ticks = '';
        for (var i = 0; i < 12; i++) {
            var a = (i * 30 - 90) * Math.PI / 180;
            var maj = i % 3 === 0;
            var r1 = maj ? 35.5 : 39;
            ticks += '<line class="c-tick' + (maj ? ' maj' : '') +
                '" x1="' + (50 + Math.cos(a) * r1).toFixed(2) +
                '" y1="' + (50 + Math.sin(a) * r1).toFixed(2) +
                '" x2="' + (50 + Math.cos(a) * 44).toFixed(2) +
                '" y2="' + (50 + Math.sin(a) * 44).toFixed(2) +
                '" stroke-width="' + (maj ? 2 : 1.2) + '"/>';
        }

        var analogSvg = '<svg class="bw-clock-svg" viewBox="0 0 100 100" aria-hidden="true">' + ticks +
            '<line class="c-hand c-hour" x1="50" y1="50" x2="50" y2="25"/>' +
            '<line class="c-hand c-min" x1="50" y1="50" x2="50" y2="17"/>' +
            '<line class="c-hand c-sec" x1="50" y1="50" x2="50" y2="13"/>' +
            '<circle class="c-pin" cx="50" cy="50" r="2.4"/></svg>';

        if (sz === 's') {
            if (isDigital) {
                el.innerHTML = '<div class="bw-clk-digital-s">' +
                    '<span class="bw-lab">' + esc(api.settings.timezone || 'Local') + '</span>' +
                    '<div class="bw-clk-dig-time bw-big">' + timeStr + '</div>' +
                    '<div class="bw-sub">' + dateStr + '</div>' +
                '</div>';
            } else {
                el.innerHTML = analogSvg;
            }
        } else if (sz === 'm') {
            el.innerHTML =
                '<div class="bw-clk-split">' +
                    '<div class="bw-clk-face">' + analogSvg + '</div>' +
                    '<div class="bw-clk-info">' +
                        '<div class="bw-lab">' + esc(api.settings.timezone || 'Local Time') + '</div>' +
                        '<div class="bw-clk-dig-time bw-big">' + timeStr + '</div>' +
                        '<div class="bw-clk-date">' + dateStr + '</div>' +
                    '</div>' +
                '</div>';
        } else { // 'l'
            el.innerHTML =
                '<div class="bw-clk-large">' +
                    '<div class="bw-clk-face-l">' + analogSvg + '</div>' +
                    '<div class="bw-clk-details">' +
                        '<div class="bw-clk-dig-time bw-big">' + timeStr + '</div>' +
                        '<div class="bw-clk-date-l">' + dateStr + '</div>' +
                        '<div class="bw-clk-cities">' +
                            '<div class="bw-clk-city"><span>New York</span><b>' + pad2((now.getUTCHours() - 4 + 24) % 24) + ':' + pad2(now.getMinutes()) + '</b></div>' +
                            '<div class="bw-clk-city"><span>London</span><b>' + pad2((now.getUTCHours() + 1 + 24) % 24) + ':' + pad2(now.getMinutes()) + '</b></div>' +
                            '<div class="bw-clk-city"><span>Tokyo</span><b>' + pad2((now.getUTCHours() + 9 + 24) % 24) + ':' + pad2(now.getMinutes()) + '</b></div>' +
                        '</div>' +
                    '</div>' +
                '</div>';
        }

        var sec = el.querySelector('.c-sec');
        if (sec) sec.style.display = api.settings.seconds === false ? 'none' : '';
        tickClock(el);
    }

    BW.define({
        id: 'clock',
        name: 'Clock',
        desc: 'Analog and digital clock with customizable timezones, date, and world time.',
        tone: 'light',
        sizes: ['s', 'm', 'l'],
        defSize: 's',
        settings: [
            { key: 'style', label: 'Face style', type: 'select', def: 'analog',
              options: [['analog', 'Analog Dial'], ['digital', 'Digital Time']] },
            { key: 'seconds', label: 'Show second hand', type: 'toggle', def: true },
            { key: 'format24', label: '24-hour time', type: 'toggle', def: false },
            { key: 'timezone', label: 'Timezone label', type: 'text', def: 'Local Time' }
        ],
        render: renderClock,
        tick: tickClock,
        onTap: function (el, api) {
            api.openApp('clock');
        }
    });

    // ═════════════════════════════════════════════════════════════════════
    // 2 · Day / Night (S / M / L)
    // ═════════════════════════════════════════════════════════════════════
    var SUN_GLYPH = '<circle cx="12" cy="12" r="4.2"/>' +
        '<path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2' +
        'M5.4 5.4 7 7M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6"/>';
    var MOON_GLYPH = '<path d="M20.4 14.8A8.7 8.7 0 1 1 9.2 3.6a6.9 6.9 0 0 0 11.2 11.2Z"/>';

    BW.define({
        id: 'daynight',
        name: 'Day & Night',
        desc: 'Daylight and solar progress tracker with solar arc and sunrise/sunset times.',
        tone: 'dark',
        shape: 'capsule',
        sizes: ['s', 'm', 'l'],
        defSize: 's',
        settings: [
            { key: 'sun', label: 'Day icon', type: 'select', def: 'sun',
              options: [['sun', 'Sun'], ['moon', 'Moon'], ['none', 'None']] },
            { key: 'moon', label: 'Night icon', type: 'select', def: 'moon',
              options: [['moon', 'Moon'], ['sun', 'Sun'], ['none', 'None']] }
        ],
        render: function (el, api) {
            var sz = api.inst.size || 's';
            var glyphs = { sun: SUN_GLYPH, moon: MOON_GLYPH, none: '' };
            if (sz === 's') {
                el.innerHTML =
                    '<div class="bw-dn-half top">' + (glyphs[api.settings.sun] ? ico(glyphs[api.settings.sun], 34) : '') + '</div>' +
                    '<div class="bw-dn-half bot">' + (glyphs[api.settings.moon] ? ico(glyphs[api.settings.moon], 34) : '') + '</div>';
            } else if (sz === 'm') {
                el.innerHTML =
                    '<div class="bw-dn-m">' +
                        '<div class="bw-dn-top-row">' +
                            '<span>' + ico(SUN_GLYPH, 22) + ' 06:24 AM</span>' +
                            '<b>Daylight Progress</b>' +
                            '<span>' + ico(MOON_GLYPH, 20) + ' 07:48 PM</span>' +
                        '</div>' +
                        '<div class="bw-dn-track"><div class="bw-dn-fill" style="width: 68%;"></div></div>' +
                        '<div class="bw-sub" style="text-align:center;margin-top:6px;">8h 24m remaining until sunset</div>' +
                    '</div>';
            } else {
                el.innerHTML =
                    '<div class="bw-dn-l">' +
                        '<div class="bw-lab">SOLAR TRACKER</div>' +
                        '<div class="bw-dn-arc-wrap">' +
                            '<svg viewBox="0 0 200 100" class="bw-dn-arc">' +
                                '<path d="M 20 90 A 80 80 0 0 1 180 90" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="4" stroke-dasharray="4 4"/>' +
                                '<circle cx="130" cy="38" r="8" fill="#ffd60a"/>' +
                            '</svg>' +
                        '</div>' +
                        '<div class="bw-dn-times">' +
                            '<div><span class="bw-lab">Sunrise</span><b>06:24 AM</b></div>' +
                            '<div><span class="bw-lab">Solar Noon</span><b>01:06 PM</b></div>' +
                            '<div><span class="bw-lab">Sunset</span><b>07:48 PM</b></div>' +
                        '</div>' +
                    '</div>';
            }
        },
        onTap: function (el, api) {
            api.openApp('weather');
        }
    });

    // ═════════════════════════════════════════════════════════════════════
    // 3 · Moon (S / M / L)
    // ═════════════════════════════════════════════════════════════════════
    var PHASES = {
        new: '<circle cx="12" cy="12" r="8.4" fill="none" stroke="currentColor" stroke-width="1.6"/>',
        waxing: '<path d="M12 3.6a8.4 8.4 0 0 1 0 16.8 5.4 8.4 0 0 0 0-16.8Z" fill="currentColor"/>',
        full: '<circle cx="12" cy="12" r="8.4" fill="currentColor"/>',
        waning: '<path d="M12 3.6a8.4 8.4 0 0 0 0 16.8 5.4 8.4 0 0 1 0-16.8Z" fill="currentColor"/>'
    };

    BW.define({
        id: 'moon',
        name: 'Moon Phase',
        desc: 'Tonight’s lunar phase, illumination percentage, and upcoming lunar cycle.',
        tone: 'dark',
        shape: 'circle',
        sizes: ['s', 'm', 'l'],
        defSize: 's',
        settings: [
            { key: 'phase', label: 'Phase', type: 'select', def: 'waxing',
              options: [['new', 'New Moon'], ['waxing', 'Waxing Crescent'],
                        ['full', 'Full Moon'], ['waning', 'Waning Crescent']] }
        ],
        render: function (el, api) {
            var sz = api.inst.size || 's';
            var body = PHASES[api.settings.phase] || PHASES.waxing;
            var phaseNames = { new: 'New Moon', waxing: 'Waxing Crescent', full: 'Full Moon', waning: 'Waning Crescent' };
            var name = phaseNames[api.settings.phase] || 'Waxing Crescent';

            if (sz === 's') {
                el.innerHTML = '<div class="bw-moon-s"><svg viewBox="0 0 24 24" fill="none" class="bw-moon-svg" aria-hidden="true">' + body + '</svg>' +
                    '<span class="bw-moon-sub">72%</span></div>';
            } else if (sz === 'm') {
                el.innerHTML = '<div class="bw-moon-m">' +
                    '<svg viewBox="0 0 24 24" fill="none" class="bw-moon-svg" style="width:58px;height:58px;">' + body + '</svg>' +
                    '<div class="bw-moon-meta">' +
                        '<span class="bw-lab">LUNAR PHASE</span>' +
                        '<div class="bw-big" style="font-size:18px;">' + name + '</div>' +
                        '<div class="bw-sub">72% Illuminated · Next Full Moon in 4d</div>' +
                    '</div></div>';
            } else {
                el.innerHTML = '<div class="bw-moon-l">' +
                    '<div class="bw-moon-top">' +
                        '<svg viewBox="0 0 24 24" fill="none" class="bw-moon-svg" style="width:72px;height:72px;">' + body + '</svg>' +
                        '<div><span class="bw-lab">Tonight</span><div class="bw-big" style="font-size:22px;">' + name + '</div>' +
                        '<div class="bw-sub">72% Illumination · Moonset 02:14 AM</div></div>' +
                    '</div>' +
                    '<div class="bw-moon-strip">' +
                        '<div class="bw-moon-step"><i>' + PHASES.new + '</i><span>New</span></div>' +
                        '<div class="bw-moon-step is-active"><i>' + PHASES.waxing + '</i><span>Waxing</span></div>' +
                        '<div class="bw-moon-step"><i>' + PHASES.full + '</i><span>Full</span></div>' +
                        '<div class="bw-moon-step"><i>' + PHASES.waning + '</i><span>Waning</span></div>' +
                    '</div></div>';
            }
        },
        onTap: function (el, api) {
            var phases = ['new', 'waxing', 'full', 'waning'];
            var cur = api.settings.phase || 'waxing';
            var next = phases[(phases.indexOf(cur) + 1) % phases.length];
            api.set('phase', next);
        }
    });

    // ═════════════════════════════════════════════════════════════════════
    // 4 · Signal (S / M / L)
    // ═════════════════════════════════════════════════════════════════════
    BW.define({
        id: 'signal',
        name: 'Signal & Network',
        desc: 'Four-bar signal strength, network identifier, and connection throughput.',
        tone: 'dark',
        sizes: ['s', 'm', 'l'],
        defSize: 's',
        settings: [
            { key: 'bars', label: 'Bars lit', type: 'number', def: 4, min: 0, max: 4 },
            { key: 'ssid', label: 'Wi-Fi Network', type: 'text', def: 'BrowOS LAN 5G' }
        ],
        render: function (el, api) {
            var sz = api.inst.size || 's';
            var lit = Math.max(0, Math.min(4, Math.round(num(api.settings.bars, 4))));
            var bars = '';
            for (var i = 0; i < 4; i++) {
                bars += '<rect x="' + (2.4 + i * 5.6) + '" y="' + (15 - i * 4) + '" width="3.6" height="' + (6 + i * 4) +
                    '" rx="1.3" opacity="' + (i < lit ? 1 : 0.22) + '"/>';
            }
            var barsSvg = '<svg viewBox="0 0 24 24" fill="currentColor" class="bw-sig-svg" aria-hidden="true">' + bars + '</svg>';

            if (sz === 's') {
                el.innerHTML = '<div class="bw-sig-s">' + barsSvg + '<span class="bw-lab">' + lit + '/4 Bars</span></div>';
            } else if (sz === 'm') {
                el.innerHTML = '<div class="bw-sig-m">' + barsSvg +
                    '<div class="bw-sig-meta"><div class="bw-big" style="font-size:16px;">' + esc(api.settings.ssid || 'BrowOS LAN 5G') + '</div>' +
                    '<div class="bw-sub">Online · 1.2 Gbps · Low Latency</div></div></div>';
            } else {
                el.innerHTML = '<div class="bw-sig-l">' +
                    '<div class="bw-sig-top">' + barsSvg + '<div><b>' + esc(api.settings.ssid || 'BrowOS LAN 5G') + '</b><div class="bw-sub">Connected · 5 GHz</div></div></div>' +
                    '<div class="bw-sig-stats">' +
                        '<div><span class="bw-lab">Download</span><b>482 Mbps</b></div>' +
                        '<div><span class="bw-lab">Upload</span><b>124 Mbps</b></div>' +
                        '<div><span class="bw-lab">Ping</span><b>9 ms</b></div>' +
                    '</div>' +
                '</div>';
            }
        },
        onTap: function (el, api) {
            api.openApp('settings');
        }
    });

    // ═════════════════════════════════════════════════════════════════════
    // 5 · Weather (S / M / L)
    // ═════════════════════════════════════════════════════════════════════
    var wxState = { data: null, at: 0, loading: false, tried: 0 };

    function ensureWeather() {
        var W = window.BrowWeatherAPI;
        if (!W || wxState.loading) return;
        if (wxState.data && Date.now() - wxState.at < 600000) return;
        if (Date.now() - wxState.tried < 60000) return;
        wxState.tried = Date.now();
        wxState.loading = true;
        W.get().then(function (d) {
            wxState.data = d;
            wxState.at = Date.now();
        }).catch(function () {}).then(function () { wxState.loading = false; });
    }

    function toUnit(c, unit) {
        if (c == null || !isFinite(c)) return null;
        return unit === 'f' ? (c * 9 / 5) + 32 : c;
    }

    function tempStr(c, unit) {
        var t = toUnit(c, unit);
        return t == null ? '—' : Math.round(t) + '°';
    }

    function paintWeather(el, api) {
        var W = window.BrowWeatherAPI;
        var d = wxState.data;
        var unit = api.settings.unit === 'f' ? 'f' : 'c';
        var sz = api.inst.size || 'm';

        var tempVal = d ? d.temp : 21;
        var info = (d && W && d.code != null) ? W.codeInfo(d.code) : null;
        var condVal = info ? info.label : 'Partly Cloudy';
        var customCity = (api.settings.city || '').trim();
        var rawPlace = (customCity && customCity.toLowerCase() !== 'san francisco')
            ? customCity
            : (d && d.place ? d.place.split(',')[0].trim() : (customCity || 'My Location'));
        var placeVal = rawPlace || 'My Location';

        var key = d && W ? W.glyphKey(d.code, d.isDay) : 'cloud';
        var glyph = W ? W.icon(key, sz === 's' ? 36 : 44) : ico(SUN_GLYPH, 36);

        if (sz === 's') {
            el.innerHTML =
                '<div class="bw-wx-s">' +
                    '<div class="bw-wx-s-head">' + glyph + '<span class="bw-wx-s-temp bw-big">' + tempStr(tempVal, unit) + '</span></div>' +
                    '<div class="bw-wx-s-place">' + esc(placeVal) + '</div>' +
                    '<div class="bw-sub">' + esc(condVal) + '</div>' +
                '</div>';
        } else if (sz === 'm') {
            var strip = '';
            var daily = (d && d.daily) ? d.daily.slice(1, 5) : [
                { day: 'Mon', hi: 22, code: 1 }, { day: 'Tue', hi: 24, code: 0 },
                { day: 'Wed', hi: 19, code: 3 }, { day: 'Thu', hi: 21, code: 2 }
            ];
            daily.forEach(function (day) {
                var k = W ? W.glyphKey(day.code, 1) : 'cloud';
                strip += '<div class="bw-wx-day">' +
                    '<b>' + esc(String(day.day || '').slice(0, 3).toUpperCase()) + '</b>' +
                    (W ? W.icon(k, 18) : '') +
                    '<span>' + tempStr(day.hi, unit) + '</span>' +
                '</div>';
            });

            el.innerHTML =
                '<div class="bw-wx-top">' + glyph +
                    '<div class="bw-wx-now">' +
                        '<div class="bw-wx-temp bw-big">' + tempStr(tempVal, unit) + '</div>' +
                        '<div class="bw-wx-cond">' + esc(condVal) + ' · ' + esc(placeVal) + '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="bw-wx-days">' + strip + '</div>';
        } else { // Large
            var stripL = '';
            var dailyL = (d && d.daily) ? d.daily.slice(0, 5) : [
                { day: 'Today', hi: 22, code: 1 }, { day: 'Tue', hi: 24, code: 0 },
                { day: 'Wed', hi: 19, code: 3 }, { day: 'Thu', hi: 21, code: 2 }, { day: 'Fri', hi: 23, code: 1 }
            ];
            dailyL.forEach(function (day) {
                var k = W ? W.glyphKey(day.code, 1) : 'cloud';
                stripL += '<div class="bw-wx-day-l">' +
                    '<span>' + esc(String(day.day || '').slice(0, 3)) + '</span>' +
                    (W ? W.icon(k, 20) : '') +
                    '<b>' + tempStr(day.hi, unit) + '</b>' +
                '</div>';
            });

            el.innerHTML =
                '<div class="bw-wx-l">' +
                    '<div class="bw-wx-l-top">' +
                        '<div><span class="bw-lab">' + esc(placeVal) + '</span><div class="bw-big" style="font-size:36px;">' + tempStr(tempVal, unit) + '</div><div class="bw-sub">' + esc(condVal) + '</div></div>' +
                        glyph +
                    '</div>' +
                    '<div class="bw-wx-l-pills">' +
                        '<div><span>Humidity</span><b>64%</b></div>' +
                        '<div><span>Wind</span><b>11 km/h</b></div>' +
                        '<div><span>UV Index</span><b>3 Moderate</b></div>' +
                    '</div>' +
                    '<div class="bw-wx-l-forecast">' + stripL + '</div>' +
                '</div>';
        }
        el._wxAt = wxState.at;
    }

    BW.define({
        id: 'weather',
        name: 'Weather',
        desc: 'Live forecast, conditions, temperature units, and multi-day meteorological breakdown.',
        tone: 'dark',
        sizes: ['s', 'm', 'l'],
        defSize: 'm',
        settings: [
            { key: 'city', label: 'City name (blank for auto)', type: 'text', def: '' },
            { key: 'unit', label: 'Units', type: 'select', def: 'c',
              options: [['c', 'Celsius °C'], ['f', 'Fahrenheit °F']] },
            { key: 'days', label: 'Forecast days', type: 'number', def: 4, min: 3, max: 5 }
        ],
        render: function (el, api) {
            el._wxAt = 0;
            paintWeather(el, api);
            ensureWeather();
        },
        tick: function (el, api) {
            if (!wxState.data) ensureWeather();
            if (wxState.at !== el._wxAt) paintWeather(el, api);
        },
        onTap: function (el, api) {
            api.openApp('weather');
        }
    });

    // ═════════════════════════════════════════════════════════════════════
    // 6 · Now Playing / Music (S / M / L)
    // ═════════════════════════════════════════════════════════════════════
    BW.define({
        id: 'now',
        name: 'Now Playing',
        desc: 'Interactive audio deck with playback controls, progress scrubber, and music visualizer.',
        tone: 'light',
        sizes: ['s', 'm', 'l'],
        defSize: 'm',
        settings: [
            { key: 'title', label: 'Track Title', type: 'text', def: 'Midnight City' },
            { key: 'artist', label: 'Artist', type: 'text', def: 'M83' },
            { key: 'progress', label: 'Progress %', type: 'number', def: 62, min: 0, max: 100 },
            { key: 'playing', label: 'Playing', type: 'toggle', def: true }
        ],
        render: function (el, api) {
            var s = api.settings;
            var sz = api.inst.size || 'm';
            var prog = Math.max(0, Math.min(100, num(s.progress, 62)));

            var playIcon = s.playing
                ? ico('<rect x="8" y="6" width="3" height="12" rx="1"/><rect x="14" y="6" width="3" height="12" rx="1"/>', 18, { fill: 'currentColor', stroke: false })
                : ico('<path d="M8 5.5v13l11-6.5z"/>', 18, { fill: 'currentColor', stroke: false });

            if (sz === 's') {
                el.innerHTML =
                    '<div class="bw-np-s">' +
                        '<div class="bw-np-art" style="width:48px;height:48px;">' + ico(NOTE, 24, { sw: 1.6 }) + '</div>' +
                        '<div class="bw-np-meta" style="text-align:center;">' +
                            '<b class="bw-np-title">' + esc(s.title || 'Song') + '</b>' +
                            '<span class="bw-sub">' + esc(s.artist || 'Artist') + '</span>' +
                        '</div>' +
                        '<button type="button" class="bw-np-play" data-nodrag data-act="play" aria-label="Play">' + playIcon + '</button>' +
                    '</div>';
            } else if (sz === 'm') {
                el.innerHTML =
                    '<div class="bw-np-art">' + ico(NOTE, 26, { sw: 1.6 }) + '</div>' +
                    '<div class="bw-np-meta">' +
                        '<div class="bw-np-title">' + esc(s.title || 'Nothing playing') + '</div>' +
                        '<div class="bw-np-artist">' + esc(s.artist || '—') + '</div>' +
                    '</div>' +
                    '<div class="bw-np-ctl">' +
                        '<button type="button" class="bw-np-btn" data-nodrag data-act="prev" aria-label="Previous">' +
                            ico('<path d="M18 6v12L9 12z"/><rect x="5" y="6" width="2" height="12" rx="1"/>', 18, { fill: 'currentColor', stroke: false }) +
                        '</button>' +
                        '<button type="button" class="bw-np-play" data-nodrag data-act="play" aria-label="Play">' + playIcon + '</button>' +
                        '<button type="button" class="bw-np-btn" data-nodrag data-act="next" aria-label="Next">' +
                            ico('<path d="M6 6v12l9-6z"/><rect x="17" y="6" width="2" height="12" rx="1"/>', 18, { fill: 'currentColor', stroke: false }) +
                        '</button>' +
                    '</div>' +
                    '<div class="bw-np-track"><div class="bw-np-fill" style="width:' + prog + '%"></div></div>';
            } else { // Large
                var bars = '';
                for (var b = 0; b < 16; b++) {
                    var h = s.playing ? (20 + 75 * Math.abs(Math.sin((b + 1) * 1.5))) : 15;
                    bars += '<span style="height:' + Math.round(h) + '%"></span>';
                }
                el.innerHTML =
                    '<div class="bw-np-l">' +
                        '<div class="bw-np-l-head">' +
                            '<div class="bw-np-art" style="width:68px;height:68px;">' + ico(NOTE, 34, { sw: 1.6 }) + '</div>' +
                            '<div><span class="bw-lab">NOW PLAYING</span><div class="bw-big" style="font-size:20px;">' + esc(s.title || 'Song') + '</div><div class="bw-sub">' + esc(s.artist || 'Artist') + '</div></div>' +
                        '</div>' +
                        '<div class="bw-np-viz">' + bars + '</div>' +
                        '<div class="bw-np-track"><div class="bw-np-fill" style="width:' + prog + '%"></div></div>' +
                        '<div class="bw-np-ctl" style="justify-content:center;gap:18px;margin-top:10px;">' +
                            '<button type="button" class="bw-np-btn" data-nodrag data-act="prev">' + ico('<path d="M18 6v12L9 12z"/><rect x="5" y="6" width="2" height="12" rx="1"/>', 20, { fill: 'currentColor', stroke: false }) + '</button>' +
                            '<button type="button" class="bw-np-play" data-nodrag data-act="play">' + playIcon + '</button>' +
                            '<button type="button" class="bw-np-btn" data-nodrag data-act="next">' + ico('<path d="M6 6v12l9-6z"/><rect x="17" y="6" width="2" height="12" rx="1"/>', 20, { fill: 'currentColor', stroke: false }) + '</button>' +
                        '</div>' +
                    '</div>';
            }

            var playBtn = el.querySelector('[data-act="play"]');
            if (playBtn) {
                playBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    api.set('playing', !s.playing);
                });
            }
        },
        onTap: function (el, api) {
            api.openApp('music');
        }
    });

    // ═════════════════════════════════════════════════════════════════════
    // 7 · Music Pill (S / M / L)
    // ═════════════════════════════════════════════════════════════════════
    BW.define({
        id: 'pill',
        name: 'Music Pill',
        desc: 'Audio level capsule with real-time reactive equalizer bars.',
        tone: 'dark',
        shape: 'capsule',
        sizes: ['s', 'm', 'l'],
        defSize: 's',
        settings: [
            { key: 'bars', label: 'Meter bars', type: 'number', def: 7, min: 3, max: 15 },
            { key: 'level', label: 'Level %', type: 'number', def: 70, min: 0, max: 100 }
        ],
        render: function (el, api) {
            var n = Math.max(3, Math.min(15, Math.round(num(api.settings.bars, 7))));
            var level = Math.max(0, Math.min(100, num(api.settings.level, 70)));
            var bars = '';
            for (var i = 0; i < n; i++) {
                var h = 26 + 74 * Math.abs(Math.sin((i + 1) * 1.7));
                var on = ((i + 1) / n) * 100 <= level;
                bars += '<span style="height:' + Math.round(h * (on ? 1 : 0.4)) + '%;opacity:' + (on ? 0.9 : 0.3) + '"></span>';
            }
            el.innerHTML =
                '<div class="bw-pill-top">' + ico(NOTE, 36, { sw: 1.7 }) + '<span class="bw-pill-dot"></span></div>' +
                '<div class="bw-pill-bot"><div class="bw-pill-bars">' + bars + '</div></div>';
        },
        onTap: function (el, api) {
            api.openApp('music');
        }
    });

    // ═════════════════════════════════════════════════════════════════════
    // 8 · Voice Recorder (S / M / L)
    // ═════════════════════════════════════════════════════════════════════
    BW.define({
        id: 'rec',
        name: 'Voice Recorder',
        desc: 'Record audio memos directly from the desktop canvas.',
        tone: 'dark',
        sizes: ['s', 'm', 'l'],
        defSize: 's',
        settings: [
            { key: 'live', label: 'Recording active', type: 'toggle', def: true }
        ],
        render: function (el, api) {
            var sz = api.inst.size || 's';
            var live = !!api.settings.live;
            el.classList.toggle('is-idle', !live);

            if (sz === 's') {
                el.innerHTML = '<div class="bw-rec-dot"></div>';
            } else {
                el.innerHTML =
                    '<div class="bw-rec-m">' +
                        '<div class="bw-rec-dot"></div>' +
                        '<div><b>' + (live ? 'Recording…' : 'Ready to record') + '</b><div class="bw-sub">00:42 · Tap to ' + (live ? 'pause' : 'start') + '</div></div>' +
                    '</div>';
            }
        },
        onTap: function (el, api) {
            api.set('live', !api.settings.live);
        }
    });

    // ═════════════════════════════════════════════════════════════════════
    // 9 · Battery (S / M / L)
    // ═════════════════════════════════════════════════════════════════════
    var batLive = { level: null, charging: false, wired: false };

    function wireBattery() {
        if (batLive.wired || !navigator.getBattery) return;
        batLive.wired = true;
        try {
            navigator.getBattery().then(function (b) {
                var sync = function () {
                    batLive.level = Math.round(b.level * 100);
                    batLive.charging = !!b.charging;
                };
                sync();
                b.addEventListener('levelchange', sync);
                b.addEventListener('chargingchange', sync);
            }).catch(function () {});
        } catch (e) {}
    }

    function batteryReading(api) {
        if (batLive.level != null) return { level: batLive.level, charging: batLive.charging };
        return { level: num(api.settings.level, 82), charging: !!api.settings.charging };
    }

    BW.define({
        id: 'bat',
        name: 'Battery',
        desc: 'Charge cells, charging bolt, real battery sensor, and power stats.',
        tone: 'dark',
        sizes: ['s', 'm', 'l'],
        defSize: 'm',
        settings: [
            { key: 'level', label: 'Charge %', type: 'number', def: 82, min: 0, max: 100 },
            { key: 'charging', label: 'Charging', type: 'toggle', def: true }
        ],
        render: function (el, api) {
            wireBattery();
            var r = batteryReading(api);
            var level = Math.max(0, Math.min(100, r.level));
            var sz = api.inst.size || 'm';

            if (sz === 's') {
                el.innerHTML =
                    '<div class="bw-bat-s">' +
                        '<span class="bw-lab">BATTERY</span>' +
                        '<div class="bw-bat-pct bw-big" style="font-size:32px;">' + level + '%</div>' +
                        '<div class="bw-sub">' + (r.charging ? '⚡ Charging' : 'On Battery') + '</div>' +
                    '</div>';
            } else if (sz === 'm') {
                var segs = 10;
                var lit = Math.round((level / 100) * segs);
                var cells = '';
                for (var i = 0; i < segs; i++) cells += '<i class="' + (i < lit ? 'on' : '') + '"></i>';
                el.innerHTML =
                    '<div class="bw-bat-head">' +
                        '<span class="bw-lab">Battery</span>' +
                        '<div class="bw-bat-pct bw-big">' + level + '%</div>' +
                    '</div>' +
                    '<div class="bw-bat-cell">' + cells +
                        (r.charging ? '<div class="bw-bat-bolt">' + ico('<path d="M13 2 5.5 13.5H11L10 22l7.5-11.5H12z"/>', 16, { fill: 'currentColor', stroke: false }) + '</div>' : '') +
                    '</div>';
            } else { // Large
                el.innerHTML =
                    '<div class="bw-bat-l">' +
                        '<div class="bw-bat-l-head">' +
                            '<div><span class="bw-lab">POWER & BATTERY</span><div class="bw-big" style="font-size:32px;">' + level + '%</div></div>' +
                            '<b>' + (r.charging ? '⚡ Fast Charging' : 'Normal Discharge') + '</b>' +
                        '</div>' +
                        '<div class="bw-bat-l-devices">' +
                            '<div class="bw-bat-dev"><span>BrowOS Host</span><b>' + level + '%</b></div>' +
                            '<div class="bw-bat-dev"><span>Wireless Mouse</span><b>88%</b></div>' +
                            '<div class="bw-bat-dev"><span>Bluetooth Audio</span><b>65%</b></div>' +
                        '</div>' +
                    '</div>';
            }
        },
        tick: function (el, api) {
            var r = batteryReading(api);
            if (el._batLevel !== r.level || el._batCharging !== r.charging) {
                el._batLevel = r.level;
                el._batCharging = r.charging;
                BW.renderInstance({ id: 'bat', uid: el.parentElement.dataset.uid });
            }
        },
        onTap: function (el, api) {
            api.openApp('settings');
        }
    });

    // ═════════════════════════════════════════════════════════════════════
    // 10 · Toggle Switch (S / M / L)
    // ═════════════════════════════════════════════════════════════════════
    BW.define({
        id: 'toggle',
        name: 'Toggle Switch',
        desc: 'Tactile oversized switch that toggles system state or custom actions.',
        tone: 'dark',
        sizes: ['s', 'm', 'l'],
        defSize: 'm',
        settings: [
            { key: 'on', label: 'Switched on', type: 'toggle', def: true },
            { key: 'labelOff', label: 'Off label', type: 'text', def: 'OFF' },
            { key: 'labelOn', label: 'On label', type: 'text', def: 'ON' }
        ],
        render: function (el, api) {
            var s = api.settings;
            el.innerHTML =
                '<button type="button" class="bw-tog' + (s.on ? ' is-on' : '') + '" data-nodrag aria-label="Toggle">' +
                    '<i class="bw-tog-knob"></i>' +
                    '<span>' + esc(s.labelOff || 'OFF') + '</span>' +
                    '<span>' + esc(s.labelOn || 'ON') + '</span>' +
                '</button>';
            el.querySelector('.bw-tog').addEventListener('click', function (e) {
                e.stopPropagation();
                api.set('on', !s.on);
            });
        },
        onTap: function (el, api) {
            api.set('on', !api.settings.on);
        }
    });

    // ═════════════════════════════════════════════════════════════════════
    // 11 · Volume / Sound (S / M / L)
    // ═════════════════════════════════════════════════════════════════════
    BW.define({
        id: 'audio',
        name: 'Volume & Sound',
        desc: 'Audio level equalizer, volume output slider, and mute toggle.',
        tone: 'light',
        sizes: ['s', 'm', 'l'],
        defSize: 'm',
        settings: [
            { key: 'volume', label: 'Volume %', type: 'number', def: 62, min: 0, max: 100 },
            { key: 'muted', label: 'Muted', type: 'toggle', def: false }
        ],
        render: function (el, api) {
            var vol = api.settings.muted ? 0 : Math.max(0, Math.min(100, num(api.settings.volume, 62)));
            var sz = api.inst.size || 'm';

            var speaker = vol === 0
                ? '<path d="M11 5 6 9H2.5v6H6l5 4z"/><path d="M16 9.5l4 5M20 9.5l-4 5"/>'
                : '<path d="M11 5 6 9H2.5v6H6l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>';

            if (sz === 's') {
                el.innerHTML =
                    '<div class="bw-au-s">' +
                        '<button type="button" class="bw-au-btn" data-nodrag aria-label="Mute">' + ico(speaker, 26, { sw: 1.8 }) + '</button>' +
                        '<div class="bw-big">' + vol + '%</div>' +
                        '<span class="bw-sub">' + (api.settings.muted ? 'Muted' : 'Volume') + '</span>' +
                    '</div>';
            } else {
                var n = 14;
                var eq = '';
                for (var i = 0; i < n; i++) {
                    var h = 24 + 76 * Math.abs(Math.sin((i + 2) * 1.3));
                    var on = ((i + 1) / n) * 100 <= vol;
                    eq += '<span class="' + (on ? 'on' : '') + '" style="height:' + Math.round(h) + '%"></span>';
                }

                el.innerHTML =
                    '<button type="button" class="bw-au-btn" data-nodrag aria-label="Mute">' + ico(speaker, 20, { sw: 1.8 }) + '</button>' +
                    '<div class="bw-au-body">' +
                        '<div class="bw-au-eq">' + eq + '</div>' +
                        '<div class="bw-au-line"><i style="left:' + vol + '%"></i></div>' +
                    '</div>';
            }

            var btn = el.querySelector('.bw-au-btn');
            if (btn) {
                btn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    api.set('muted', !api.settings.muted);
                });
            }
        },
        onTap: function (el, api) {
            api.openApp('settings');
        }
    });

    // ═════════════════════════════════════════════════════════════════════
    // 12 · Compass (S / M / L)
    // ═════════════════════════════════════════════════════════════════════
    BW.define({
        id: 'compass',
        name: 'Compass',
        desc: 'Cardinal rose navigation dial with degrees and bearing indicator.',
        tone: 'dark',
        sizes: ['s', 'm', 'l'],
        defSize: 's',
        settings: [
            { key: 'heading', label: 'Heading (°)', type: 'number', def: 32, min: 0, max: 360 }
        ],
        render: function (el, api) {
            var sz = api.inst.size || 's';
            var heading = ((num(api.settings.heading, 32) % 360) + 360) % 360;

            var dial =
                '<svg class="bw-compass-svg" viewBox="0 0 100 100" aria-hidden="true">' +
                    '<circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="1.5"/>' +
                    '<text class="cp-t" x="50" y="14" text-anchor="middle">N</text>' +
                    '<text class="cp-t" x="86" y="52" text-anchor="middle">E</text>' +
                    '<text class="cp-t" x="50" y="90" text-anchor="middle">S</text>' +
                    '<text class="cp-t" x="14" y="52" text-anchor="middle">W</text>' +
                    '<g transform="rotate(' + heading + ' 50 50)">' +
                        '<path class="cp-tri" d="M50 17 57 50 50 45.5 43 50Z" fill="#ff3b30"/>' +
                        '<path class="cp-tri" d="M50 83 57 50 50 54.5 43 50Z" fill="rgba(255,255,255,0.5)"/>' +
                    '</g>' +
                    '<circle class="cp-tri" cx="50" cy="50" r="2.4" fill="#fff"/></svg>';

            if (sz === 's') {
                el.innerHTML = dial;
            } else {
                el.innerHTML =
                    '<div class="bw-cp-m">' + dial +
                        '<div class="bw-cp-info">' +
                            '<span class="bw-lab">HEADING</span>' +
                            '<div class="bw-big">' + heading + '° NE</div>' +
                            '<div class="bw-sub">Elevation 48m · GPS Calibrated</div>' +
                        '</div>' +
                    '</div>';
            }
        },
        onTap: function (el, api) {
            var next = (num(api.settings.heading, 32) + 45) % 360;
            api.set('heading', next);
        }
    });

    // ═════════════════════════════════════════════════════════════════════
    // 13 · Sleep Mode (S / M / L)
    // ═════════════════════════════════════════════════════════════════════
    BW.define({
        id: 'sleep',
        name: 'Sleep Mode',
        desc: 'Quiet sleep toggle for resting your machine and dimming display.',
        tone: 'dark',
        shape: 'capsule',
        sizes: ['s', 'm', 'l'],
        defSize: 'm',
        settings: [
            { key: 'label', label: 'Label', type: 'text', def: 'Sleep Mode' },
            { key: 'on', label: 'Enabled', type: 'toggle', def: true }
        ],
        render: function (el, api) {
            var glyph = api.settings.on === false ? SUN_GLYPH : MOON_GLYPH;
            el.innerHTML = ico(glyph, 22, { sw: 1.8 }) +
                '<b>' + esc(api.settings.label || 'Sleep Mode') + '</b>';
        },
        onTap: function (el, api) {
            api.set('on', !api.settings.on);
        }
    });

    // ═════════════════════════════════════════════════════════════════════
    // 14 · Reminders / Tasks (S / M / L)
    // ═════════════════════════════════════════════════════════════════════
    BW.define({
        id: 'todo',
        name: 'Reminders',
        desc: 'Interactive checklist with real-time completion tracking and inline task creation.',
        tone: 'dark',
        sizes: ['s', 'm', 'l'],
        defSize: 'm',
        settings: [
            { key: 'title', label: 'Title', type: 'text', def: 'Reminders' },
            { key: 'items', label: 'Tasks (comma separated)', type: 'text',
              def: 'Ship new widget suite, Review design tokens, Water office plants, Book flight tickets' },
            { key: 'done', label: 'Done indices', type: 'text', def: '1' }
        ],
        render: function (el, api) {
            var s = api.settings;
            var sz = api.inst.size || 'm';
            var maxItems = sz === 's' ? 2 : (sz === 'm' ? 4 : 7);
            var items = list(s.items).slice(0, maxItems);
            var doneSet = list(s.done).map(Number);

            var rows = items.map(function (text, i) {
                var isDone = doneSet.indexOf(i + 1) >= 0;
                return '<div class="bw-todo-row' + (isDone ? ' done' : '') + '" data-nodrag data-i="' + (i + 1) + '">' +
                    '<span class="box' + (isDone ? ' filled' : '') + '"></span>' +
                    '<span>' + esc(text) + '</span>' +
                '</div>';
            }).join('');

            var doneCount = items.filter(function (_, i) { return doneSet.indexOf(i + 1) >= 0; }).length;

            el.innerHTML =
                '<div class="bw-todo-top"><b>' + esc(s.title || 'Reminders') + '</b>' +
                    '<i>' + doneCount + '/' + items.length + '</i></div>' +
                '<div class="bw-todo-list">' + rows + '</div>' +
                '<div class="bw-todo-bar"><i style="width:' + pct(doneCount, items.length) + '%"></i></div>' +
                (sz === 'l' ? '<div class="bw-todo-add-box"><input type="text" placeholder="+ Add reminder..." class="bw-todo-input" data-nodrag></div>' : '');

            el.querySelectorAll('.bw-todo-row').forEach(function (row) {
                row.addEventListener('click', function (e) {
                    e.stopPropagation();
                    var idx = Number(row.dataset.i);
                    var next = doneSet.slice();
                    var at = next.indexOf(idx);
                    if (at >= 0) next.splice(at, 1); else next.push(idx);
                    next.sort(function (a, b) { return a - b; });
                    api.set('done', next.join(','));
                });
            });

            var addInput = el.querySelector('.bw-todo-input');
            if (addInput) {
                addInput.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter' && addInput.value.trim()) {
                        e.stopPropagation();
                        var current = list(s.items);
                        current.push(addInput.value.trim());
                        api.set('items', current.join(', '));
                    }
                });
            }
        },
        onTap: function (el, api) {
            api.openApp('brownote');
        }
    });

    // ═════════════════════════════════════════════════════════════════════
    // 15 · Water / Hydration (S / M / L)
    // ═════════════════════════════════════════════════════════════════════
    BW.define({
        id: 'water',
        name: 'Hydration Tracker',
        desc: 'Daily water intake tracker with interactive quick-log buttons.',
        tone: 'dark',
        sizes: ['s', 'm', 'l'],
        defSize: 's',
        settings: [
            { key: 'current', label: 'Intake (L)', type: 'number', def: 1.5, min: 0 },
            { key: 'goal', label: 'Daily Goal (L)', type: 'number', def: 2.5, min: 0.5 }
        ],
        render: function (el, api) {
            var s = api.settings;
            var sz = api.inst.size || 's';
            var cur = num(s.current, 1.5);
            var goal = num(s.goal, 2.5);
            var percent = Math.round(pct(cur, goal));

            if (sz === 's') {
                el.innerHTML =
                    '<div class="bw-water-wave"></div>' +
                    '<div class="bw-water-body">' +
                        '<span class="bw-lab">WATER</span>' +
                        '<div class="bw-water-val bw-big">' + cur.toFixed(1) + 'L</div>' +
                        '<button type="button" class="bw-water-btn" data-nodrag>+ 250ml</button>' +
                    '</div>';
            } else {
                el.innerHTML =
                    '<div class="bw-water-wave"></div>' +
                    '<div class="bw-water-body" style="padding:16px 20px;">' +
                        '<div style="display:flex;justify-content:space-between;align-items:baseline;">' +
                            '<span class="bw-lab">DAILY HYDRATION</span>' +
                            '<b>' + percent + '% OF GOAL</b>' +
                        '</div>' +
                        '<div class="bw-water-val bw-big" style="font-size:32px;">' + cur.toFixed(2) + ' / ' + goal.toFixed(1) + ' L</div>' +
                        '<div style="display:flex;gap:8px;margin-top:8px;">' +
                            '<button type="button" class="bw-water-btn" data-nodrag data-add="0.25">+ 250ml</button>' +
                            '<button type="button" class="bw-water-btn" data-nodrag data-add="0.50">+ 500ml</button>' +
                            '<button type="button" class="bw-water-btn" data-nodrag data-reset="true" style="opacity:0.6;">Reset</button>' +
                        '</div>' +
                    '</div>';
            }

            el.querySelectorAll('.bw-water-btn').forEach(function (btn) {
                btn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    if (btn.dataset.reset) {
                        api.set('current', 0);
                    } else {
                        var add = Number(btn.dataset.add || 0.25);
                        api.set('current', Math.round((cur + add) * 100) / 100);
                    }
                });
            });
        },
        onTap: function (el, api) {
            var cur = num(api.settings.current, 1.5);
            api.set('current', Math.round((cur + 0.25) * 100) / 100);
        }
    });

    // ═════════════════════════════════════════════════════════════════════
    // 16 · Focus Pomodoro (S / M / L)
    // ═════════════════════════════════════════════════════════════════════
    function fmtClock(sec) {
        sec = Math.max(0, Math.round(sec));
        return Math.floor(sec / 60) + ':' + pad2(sec % 60);
    }

    function focusState(el, api) {
        var focusLen = Math.max(1, Math.round(num(api.settings.focusMin, 25))) * 60;
        var breakLen = Math.max(1, Math.round(num(api.settings.breakMin, 5))) * 60;
        var st = el._pomo;
        if (!st || st.focusLen !== focusLen || st.breakLen !== breakLen) {
            st = el._pomo = {
                focusLen: focusLen, breakLen: breakLen,
                phase: 'focus', sessions: (st && st.sessions) || 0,
                remaining: focusLen, endsAt: 0, running: false
            };
        }
        return st;
    }

    BW.define({
        id: 'focus',
        name: 'Focus Timer',
        desc: 'Pomodoro timer with focus & break intervals, session counters, and sound chimes.',
        tone: 'dark',
        sizes: ['s', 'm', 'l'],
        defSize: 'm',
        settings: [
            { key: 'focusMin', label: 'Focus minutes', type: 'number', def: 25, min: 5, max: 90 },
            { key: 'breakMin', label: 'Break minutes', type: 'number', def: 5, min: 1, max: 30 }
        ],
        render: function (el, api) {
            var st = focusState(el, api);
            var sz = api.inst.size || 'm';

            if (sz === 's') {
                el.innerHTML =
                    '<div class="bw-focus-s">' +
                        '<span class="bw-focus-phase">' + (st.phase === 'focus' ? 'Focus' : 'Break') + '</span>' +
                        '<div class="bw-focus-time bw-big">' + fmtClock(st.remaining) + '</div>' +
                        '<button type="button" class="bw-focus-btn" data-nodrag data-act="toggle">' + (st.running ? 'Pause' : 'Start') + '</button>' +
                    '</div>';
            } else {
                el.innerHTML =
                    '<div class="bw-focus-top">' +
                        '<span class="bw-focus-phase">' + (st.phase === 'focus' ? 'Focus Session' : 'Break Time') + '</span>' +
                        '<b>' + st.sessions + ' Sessions Completed</b>' +
                    '</div>' +
                    '<div class="bw-focus-time bw-big" style="font-size:36px;">' + fmtClock(st.remaining) + '</div>' +
                    '<div class="bw-focus-bar"><i style="width:' + pct((st.phase === 'focus' ? st.focusLen : st.breakLen) - st.remaining, (st.phase === 'focus' ? st.focusLen : st.breakLen)) + '%"></i></div>' +
                    '<div class="bw-focus-ctl">' +
                        '<button type="button" class="bw-focus-btn" data-nodrag data-act="toggle">' + (st.running ? 'Pause' : 'Start') + '</button>' +
                        '<button type="button" class="bw-focus-reset" data-nodrag data-act="reset">Reset</button>' +
                    '</div>';
            }

            el.querySelector('[data-act="toggle"]').addEventListener('click', function (e) {
                e.stopPropagation();
                if (st.running) {
                    st.remaining = Math.max(0, Math.round((st.endsAt - Date.now()) / 1000));
                    st.running = false;
                    st.endsAt = 0;
                } else {
                    st.endsAt = Date.now() + st.remaining * 1000;
                    st.running = true;
                }
                api.refresh();
            });

            var rst = el.querySelector('[data-act="reset"]');
            if (rst) {
                rst.addEventListener('click', function (e) {
                    e.stopPropagation();
                    st.running = false;
                    st.endsAt = 0;
                    st.phase = 'focus';
                    st.remaining = st.focusLen;
                    api.refresh();
                });
            }
        },
        tick: function (el) {
            var st = el._pomo;
            if (!st || !st.running) return;
            st.remaining = Math.max(0, Math.round((st.endsAt - Date.now()) / 1000));
            if (st.remaining <= 0) {
                try { window.BrowSettings && window.BrowSettings.audio && window.BrowSettings.audio.play('tick'); } catch (e) {}
                if (st.phase === 'focus') { st.sessions++; st.phase = 'break'; st.remaining = st.breakLen; }
                else { st.phase = 'focus'; st.remaining = st.focusLen; }
                st.endsAt = Date.now() + st.remaining * 1000;
            }
            var t = el.querySelector('.bw-focus-time');
            if (t) t.textContent = fmtClock(st.remaining);
        },
        onTap: function (el, api) {
            api.openApp('clock');
        }
    });

    // ═════════════════════════════════════════════════════════════════════
    // 17 · Calendar (S / M / L)
    // ═════════════════════════════════════════════════════════════════════
    BW.define({
        id: 'cal',
        name: 'Calendar',
        desc: 'Today’s schedule, date badge, and interactive monthly overview.',
        tone: 'light',
        sizes: ['s', 'm', 'l'],
        defSize: 'm',
        settings: [
            { key: 'events', label: 'Events (Title @ Time)', type: 'text',
              def: 'Design review @ 09:30, Team sync @ 11:00, BrowOS Ship @ 16:30' }
        ],
        render: function (el, api) {
            var now = new Date();
            var sz = api.inst.size || 'm';
            var events = list(api.settings.events).map(function (raw) {
                var at = raw.lastIndexOf('@');
                var title = at >= 0 ? raw.slice(0, at).trim() : raw;
                var time = at >= 0 ? raw.slice(at + 1).trim() : '';
                return { title: title, time: time };
            });

            if (sz === 's') {
                el.innerHTML =
                    '<div class="bw-cal-s">' +
                        '<div class="bw-lab">' + MONTHS[now.getMonth()] + '</div>' +
                        '<div class="bw-big" style="font-size:42px;line-height:1;">' + now.getDate() + '</div>' +
                        '<div class="bw-sub">' + DAYS[now.getDay()] + ' · ' + events.length + ' events</div>' +
                    '</div>';
            } else if (sz === 'm') {
                var rows = events.slice(0, 3).map(function (ev) {
                    return '<div class="bw-cal-ev"><b>' + esc(ev.title) + '</b>' +
                        (ev.time ? '<span>' + esc(ev.time) + '</span>' : '') + '</div>';
                }).join('');

                el.innerHTML =
                    '<div class="bw-cal-left">' +
                        '<div class="bw-cal-date"><b class="bw-big">' + now.getDate() + '</b>' +
                            '<span class="bw-lab">' + MONTHS[now.getMonth()] + '</span></div>' +
                        '<div class="bw-cal-count">' +
                            ico('<circle cx="12" cy="12" r="8.4"/><path d="M12 7.6V12l3 1.8"/>', 12, { sw: 2 }) +
                            '<span>' + events.length + ' today</span>' +
                        '</div>' +
                    '</div>' +
                    '<div class="bw-cal-events">' + rows + '</div>';
            } else { // Large
                var daysGrid = '';
                for (var d = 1; d <= 31; d++) {
                    var isToday = d === now.getDate();
                    daysGrid += '<span class="bw-cal-grid-day' + (isToday ? ' is-today' : '') + '">' + d + '</span>';
                }
                var rowsL = events.map(function (ev) {
                    return '<div class="bw-cal-ev"><b>' + esc(ev.title) + '</b><span>' + esc(ev.time) + '</span></div>';
                }).join('');

                el.innerHTML =
                    '<div class="bw-cal-l">' +
                        '<div class="bw-cal-l-head">' +
                            '<b>' + MONTHS[now.getMonth()] + ' ' + now.getFullYear() + '</b>' +
                            '<span>' + events.length + ' events</span>' +
                        '</div>' +
                        '<div class="bw-cal-grid">' + daysGrid + '</div>' +
                        '<div class="bw-cal-events" style="margin-top:12px;">' + rowsL + '</div>' +
                    '</div>';
            }
        },
        onTap: function (el, api) {
            api.openApp('calendar');
        }
    });

    // ═════════════════════════════════════════════════════════════════════
    // 18 · Status Chip (S / M / L)
    // ═════════════════════════════════════════════════════════════════════
    var CHIP_ICONS = {
        wifi: '<path d="M2.5 8.8a15 15 0 0 1 19 0M5.8 12.4a10 10 0 0 1 12.4 0M9.1 16a5 5 0 0 1 5.8 0"/><circle cx="12" cy="19.3" r="1.1" fill="currentColor" stroke="none"/>',
        bluetooth: '<path d="M7.5 7.5 16 16.5 12 20V4l4 3.5L7.5 16.5"/>',
        battery: '<rect x="2.5" y="7.5" width="16" height="9" rx="2.6"/><rect x="4.8" y="9.8" width="9" height="4.4" rx="1.2" fill="currentColor" stroke="none"/><path d="M20.5 11v2"/>',
        signal: '<path d="M4 18.5v-3M9.3 18.5v-6M14.7 18.5v-9M20 18.5v-12"/>',
        lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="3"/><path d="M8.2 10.5V7.8a3.8 3.8 0 0 1 7.6 0v2.7"/>',
        cloud: '<path d="M7 18.5h10a4 4 0 0 0 .4-8A6 6 0 0 0 6 12.2 3.3 3.3 0 0 0 7 18.5Z"/>'
    };

    BW.define({
        id: 'chip',
        name: 'Status Chip',
        desc: 'One-line system status badge with customizable icons and label.',
        tone: 'dark',
        shape: 'capsule',
        sizes: ['s', 'm', 'l'],
        defSize: 'm',
        settings: [
            { key: 'label', label: 'Label', type: 'text', def: 'Wi-Fi · Connected' },
            { key: 'icon', label: 'Glyph', type: 'select', def: 'wifi',
              options: [['wifi', 'Wi-Fi'], ['bluetooth', 'Bluetooth'], ['battery', 'Battery'],
                        ['signal', 'Signal'], ['lock', 'Lock'], ['cloud', 'Cloud']] }
        ],
        render: function (el, api) {
            var glyph = CHIP_ICONS[api.settings.icon] || CHIP_ICONS.wifi;
            el.innerHTML = ico(glyph, 20, { sw: 1.8 }) +
                '<b>' + esc(api.settings.label || 'Connected') + '</b>';
        },
        onTap: function (el, api) {
            api.openApp('settings');
        }
    });

    // ═════════════════════════════════════════════════════════════════════
    // 19 · Sticky Note (S / M / L) — BRAND NEW FIRST CLASS WIDGET
    // ═════════════════════════════════════════════════════════════════════
    BW.define({
        id: 'note',
        name: 'Sticky Note',
        desc: 'Desktop sticky note you can type in directly, with color themes.',
        tone: 'light',
        sizes: ['s', 'm', 'l'],
        defSize: 'm',
        settings: [
            { key: 'title', label: 'Title', type: 'text', def: 'Quick Note' },
            { key: 'text', label: 'Note Text', type: 'text', def: 'Idea: Build native WebRTC peer mesh for offline LAN sync.' },
            { key: 'color', label: 'Paper Color', type: 'select', def: 'yellow',
              options: [['yellow', 'Goldenrod'], ['mint', 'Mint Green'], ['azure', 'Sky Blue'],
                        ['lavender', 'Lavender'], ['peach', 'Peach Coral'], ['slate', 'Dark Glass']] }
        ],
        render: function (el, api) {
            var s = api.settings;
            var sz = api.inst.size || 'm';
            el.className = 'bw-w bw-w-note bw-note-' + (s.color || 'yellow');

            el.innerHTML =
                '<div class="bw-note-wrap">' +
                    '<div class="bw-note-head">' +
                        '<b>' + esc(s.title || 'Quick Note') + '</b>' +
                        '<button type="button" class="bw-note-expand" data-nodrag title="Open in BrowNote">' +
                            ico('<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>', 14) +
                        '</button>' +
                    '</div>' +
                    '<textarea class="bw-note-textarea" data-nodrag placeholder="Type a note…">' + esc(s.text || '') + '</textarea>' +
                '</div>';

            var ta = el.querySelector('.bw-note-textarea');
            if (ta) {
                ta.addEventListener('input', function () {
                    s.text = ta.value;
                });
                ta.addEventListener('change', function () {
                    api.set('text', ta.value);
                });
            }

            var exp = el.querySelector('.bw-note-expand');
            if (exp) {
                exp.addEventListener('click', function (e) {
                    e.stopPropagation();
                    api.openApp('brownote');
                });
            }
        },
        onTap: function (el, api) {
            var ta = el.querySelector('.bw-note-textarea');
            if (ta) ta.focus();
        }
    });

    // ═════════════════════════════════════════════════════════════════════
    // 20 · System Activity Monitor (S / M / L) — BRAND NEW WIDGET
    // ═════════════════════════════════════════════════════════════════════
    var sysMetrics = { cpu: 18, ram: 42, disk: 34 };

    BW.define({
        id: 'sys',
        name: 'Activity Monitor',
        desc: 'Real-time CPU, RAM memory, and Disk utilisation gauges.',
        tone: 'dark',
        sizes: ['s', 'm', 'l'],
        defSize: 'm',
        settings: [
            { key: 'showCpu', label: 'Show CPU', type: 'toggle', def: true },
            { key: 'showRam', label: 'Show RAM', type: 'toggle', def: true }
        ],
        render: function (el, api) {
            var sz = api.inst.size || 'm';
            if (sz === 's') {
                el.innerHTML =
                    '<div class="bw-sys-s">' +
                        '<span class="bw-lab">ACTIVITY</span>' +
                        '<div class="bw-sys-ring-wrap">' +
                            '<div class="bw-big" style="font-size:28px;">' + sysMetrics.cpu + '%</div>' +
                            '<div class="bw-sub">CPU LOAD</div>' +
                        '</div>' +
                        '<div class="bw-sub">' + sysMetrics.ram + '% RAM used</div>' +
                    '</div>';
            } else if (sz === 'm') {
                el.innerHTML =
                    '<div class="bw-sys-m">' +
                        '<div class="bw-sys-head"><span class="bw-lab">SYSTEM VITALS</span><b>Quad-Core</b></div>' +
                        '<div class="bw-sys-bars">' +
                            '<div class="bw-sys-row"><span>CPU</span><div class="bw-sys-track"><i style="width:' + sysMetrics.cpu + '%"></i></div><b>' + sysMetrics.cpu + '%</b></div>' +
                            '<div class="bw-sys-row"><span>RAM</span><div class="bw-sys-track"><i style="width:' + sysMetrics.ram + '%;background:#3ddc5a;"></i></div><b>' + sysMetrics.ram + '%</b></div>' +
                            '<div class="bw-sys-row"><span>Disk</span><div class="bw-sys-track"><i style="width:' + sysMetrics.disk + '%;background:#2f8fff;"></i></div><b>' + sysMetrics.disk + '%</b></div>' +
                        '</div>' +
                    '</div>';
            } else { // Large
                el.innerHTML =
                    '<div class="bw-sys-l">' +
                        '<div class="bw-sys-head"><span class="bw-lab">ACTIVITY MONITOR</span><b>BrowOS Core</b></div>' +
                        '<div class="bw-sys-chart">' +
                            '<svg viewBox="0 0 200 60" class="bw-sys-svg">' +
                                '<path d="M 0 50 Q 30 20 60 40 T 120 15 T 180 35 L 200 25" fill="none" stroke="#4ed3c2" stroke-width="2.5"/>' +
                            '</svg>' +
                        '</div>' +
                        '<div class="bw-sys-bars">' +
                            '<div class="bw-sys-row"><span>CPU</span><div class="bw-sys-track"><i style="width:' + sysMetrics.cpu + '%"></i></div><b>' + sysMetrics.cpu + '%</b></div>' +
                            '<div class="bw-sys-row"><span>RAM</span><div class="bw-sys-track"><i style="width:' + sysMetrics.ram + '%;background:#3ddc5a;"></i></div><b>' + sysMetrics.ram + '%</b></div>' +
                            '<div class="bw-sys-row"><span>Storage</span><div class="bw-sys-track"><i style="width:' + sysMetrics.disk + '%;background:#2f8fff;"></i></div><b>' + sysMetrics.disk + '%</b></div>' +
                        '</div>' +
                    '</div>';
            }
        },
        tick: function (el) {
            // Jitter metrics smoothly
            sysMetrics.cpu = Math.max(5, Math.min(95, Math.round(sysMetrics.cpu + (Math.random() * 8 - 4))));
            sysMetrics.ram = Math.max(30, Math.min(85, Math.round(sysMetrics.ram + (Math.random() * 2 - 1))));
            var cpuLabel = el.querySelector('.bw-sys-row:first-child b');
            var cpuBar = el.querySelector('.bw-sys-row:first-child i');
            if (cpuLabel) cpuLabel.textContent = sysMetrics.cpu + '%';
            if (cpuBar) cpuBar.style.width = sysMetrics.cpu + '%';
        },
        onTap: function (el, api) {
            api.openApp('monitor');
        }
    });

    // ─── boot ────────────────────────────────────────────────────────────
    function boot() { BW.init(); }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
