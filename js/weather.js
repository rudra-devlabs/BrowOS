/* BrowWeather — open-meteo backend (no key needed) + Weather app.
 * Shared API used by the weather widget: window.BrowWeatherAPI.
 */
(function () {
    'use strict';

    var CACHE_KEY = 'browos_weather_cache_v1';
    var LOC_KEY = 'browos_weather_loc_v1';
    var TTL = 15 * 60 * 1000;
    var DEFAULT_LOC = { name: 'New York', lat: 40.71, lon: -74.0 };

    var WMO = {
        0: ['☀', 'Clear sky'], 1: ['☀', 'Mainly clear'], 2: ['☁', 'Partly cloudy'], 3: ['☁', 'Overcast'],
        45: ['~', 'Fog'], 48: ['~', 'Icy fog'],
        51: ['☂', 'Light drizzle'], 53: ['☂', 'Drizzle'], 55: ['☂', 'Dense drizzle'],
        56: ['☂', 'Freezing drizzle'], 57: ['☂', 'Freezing drizzle'],
        61: ['☂', 'Slight rain'], 63: ['☂', 'Rain'], 65: ['☂', 'Heavy rain'],
        66: ['☂', 'Freezing rain'], 67: ['☂', 'Freezing rain'],
        71: ['❄', 'Slight snow'], 73: ['❄', 'Snow'], 75: ['❄', 'Heavy snow'], 77: ['❄', 'Snow grains'],
        80: ['☂', 'Slight showers'], 81: ['☂', 'Showers'], 82: ['☂', 'Violent showers'],
        85: ['❄', 'Snow showers'], 86: ['❄', 'Snow showers'],
        95: ['⚡', 'Thunderstorm'], 96: ['⚡', 'Storm + hail'], 99: ['⚡', 'Storm + hail']
    };
    function codeInfo(code) {
        var e = WMO[code];
        return e ? { icon: e[0], label: e[1] } : { icon: '☁', label: '—' };
    }

    function getLoc() {
        try {
            var raw = localStorage.getItem(LOC_KEY);
            if (raw) { var o = JSON.parse(raw); if (o && isFinite(o.lat)) return o; }
        } catch (e) {}
        return Object.assign({}, DEFAULT_LOC);
    }
    function setLoc(loc) {
        try { localStorage.setItem(LOC_KEY, JSON.stringify(loc)); } catch (e) {}
    }

    function cacheGet(key) {
        try {
            var raw = localStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            var c = JSON.parse(raw);
            if (!c || c.key !== key || (Date.now() - c.ts) > TTL) return c && c.key === key ? c.data : null;
            return c.data;
        } catch (e) { return null; }
    }
    function cacheSet(key, data) {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ key: key, ts: Date.now(), data: data })); } catch (e) {}
    }

    function searchCity(q) {
        return fetch('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(q) +
            '&count=6&language=en&format=json').then(function (r) {
            if (!r.ok) throw new Error('geo ' + r.status);
            return r.json();
        }).then(function (j) {
            return (j.results || []).map(function (g) {
                return {
                    name: g.name + (g.admin1 ? ', ' + g.admin1 : '') + (g.country_code ? ' ' + g.country_code.toUpperCase() : ''),
                    lat: g.latitude, lon: g.longitude
                };
            });
        });
    }

    function fmtHour(iso) {
        var d = new Date(iso);
        var h = d.getHours();
        var ap = h >= 12 ? 'PM' : 'AM';
        h = h % 12; if (!h) h = 12;
        return h + ' ' + ap;
    }
    function fmtDay(iso, i) {
        if (i === 0) return 'Today';
        var d = new Date(iso + 'T12:00:00');
        return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
    }

    function get(loc) {
        loc = loc || getLoc();
        var key = loc.lat.toFixed(2) + ',' + loc.lon.toFixed(2);
        var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + loc.lat + '&longitude=' + loc.lon +
            '&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m' +
            '&hourly=temperature_2m,precipitation_probability,weather_code' +
            '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset' +
            '&timezone=auto&forecast_days=7';
        return fetch(url).then(function (r) {
            if (!r.ok) throw new Error('wx ' + r.status);
            return r.json();
        }).then(function (j) {
            var cur = j.current || {};
            var hi = (j.daily && j.daily.temperature_2m_max) ? j.daily.temperature_2m_max[0] : cur.temperature_2m;
            var lo = (j.daily && j.daily.temperature_2m_min) ? j.daily.temperature_2m_min[0] : cur.temperature_2m;
            var nowH = cur.time ? cur.time.slice(0, 13) : '';
            var start = 0;
            if (j.hourly && j.hourly.time) {
                for (var i = 0; i < j.hourly.time.length; i++) {
                    if (j.hourly.time[i].slice(0, 13) >= nowH) { start = i; break; }
                }
            }
            var hourly = [];
            for (var k = start; k < Math.min(start + 24, (j.hourly.time || []).length); k++) {
                hourly.push({
                    t: fmtHour(j.hourly.time[k]),
                    temp: j.hourly.temperature_2m[k],
                    code: j.hourly.weather_code[k],
                    pop: j.hourly.precipitation_probability ? j.hourly.precipitation_probability[k] : 0
                });
            }
            var daily = [];
            for (var d = 0; d < Math.min(7, ((j.daily && j.daily.time) || []).length); d++) {
                daily.push({
                    day: fmtDay(j.daily.time[d], d),
                    code: j.daily.weather_code[d],
                    hi: j.daily.temperature_2m_max[d],
                    lo: j.daily.temperature_2m_min[d],
                    pop: j.daily.precipitation_probability_max ? j.daily.precipitation_probability_max[d] : 0
                });
            }
            var data = {
                place: loc.name, temp: cur.temperature_2m, feels: cur.apparent_temperature,
                humidity: cur.relative_humidity_2m, wind: cur.wind_speed_10m,
                code: cur.weather_code, hi: hi, lo: lo,
                precip: (j.daily && j.daily.precipitation_probability_max) ? j.daily.precipitation_probability_max[0] : 0,
                sunrise: (j.daily && j.daily.sunrise && j.daily.sunrise[0] || '').slice(11, 16),
                sunset: (j.daily && j.daily.sunset && j.daily.sunset[0] || '').slice(11, 16),
                hourly: hourly, daily: daily, fetchedAt: Date.now()
            };
            cacheSet(key, data);
            return data;
        }).catch(function (err) {
            var stale = cacheGet(key + ':stale-ok');
            if (stale) return stale;
            throw err;
        });
    }

    // keep last good response usable offline
    var _origCacheSet = cacheSet;
    cacheSet = function (key, data) {
        _origCacheSet(key, data);
        try { localStorage.setItem(CACHE_KEY + ':stale', JSON.stringify({ key: key, data: data })); } catch (e) {}
    };
    function cacheGetAny(key) {
        var fresh = cacheGet(key);
        if (fresh) return fresh;
        try {
            var raw = localStorage.getItem(CACHE_KEY + ':stale');
            if (!raw) return null;
            var c = JSON.parse(raw);
            return (c && c.key === key) ? c.data : null;
        } catch (e) { return null; }
    }
    // swap get's fallback to the tolerant reader
    var _get = get;
    get = function (loc) {
        loc = loc || getLoc();
        return _get(loc).catch(function () {
            var stale = cacheGetAny(loc.lat.toFixed(2) + ',' + loc.lon.toFixed(2));
            if (stale) { stale._stale = true; return stale; }
            throw new Error('offline');
        });
    };

    window.BrowWeatherAPI = {
        getLoc: getLoc, setLoc: setLoc, searchCity: searchCity, get: get,
        codeInfo: codeInfo, DEFAULT_LOC: DEFAULT_LOC
    };

    // ─── Weather app ─────────────────────────────────────────────────────
    function mountApp(windowElement) {
        var host = windowElement && windowElement.querySelector('.wx-app-host');
        if (!host || host.dataset.mounted === 'true') return;
        host.dataset.mounted = 'true';
        var loc = getLoc();
        host.innerHTML =
            '<div class="wx-app">' +
            '<div class="wx-search"><input type="search" placeholder="Search city…" value="' + esc(loc.name) + '">' +
            '<div class="wx-results"></div></div>' +
            '<div class="wx-body"><div class="wx-loading">Reading the sky…</div></div></div>';
        var input = host.querySelector('input');
        var results = host.querySelector('.wx-results');
        var body = host.querySelector('.wx-body');
        var deb = null;
        input.addEventListener('keydown', function (e) { e.stopPropagation(); });
        input.addEventListener('input', function () {
            clearTimeout(deb);
            var q = input.value.trim();
            if (q.length < 2) { results.innerHTML = ''; results.style.display = 'none'; return; }
            deb = setTimeout(function () {
                searchCity(q).then(function (list) {
                    if (!list.length) {
                        results.innerHTML = '<div class="wx-nohit">No matches</div>';
                    } else {
                        results.innerHTML = list.map(function (g, i) {
                            return '<button data-i="' + i + '">' + esc(g.name) + '</button>';
                        }).join('');
                    }
                    results.style.display = 'block';
                    results.querySelectorAll('button').forEach(function (b) {
                        b.addEventListener('click', function () {
                            var g = list[Number(b.dataset.i)];
                            loc = { name: g.name, lat: g.lat, lon: g.lon };
                            setLoc(loc);
                            input.value = g.name;
                            results.style.display = 'none';
                            load();
                        });
                    });
                }).catch(function () {
                    results.innerHTML = '<div class="wx-nohit">Search needs internet</div>';
                    results.style.display = 'block';
                });
            }, 350);
        });
        function esc(s) {
            return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
                return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
            });
        }
        function load() {
            body.innerHTML = '<div class="wx-loading">Reading the sky…</div>';
            get(loc).then(function (d) { body.innerHTML = renderFull(d); })
                .catch(function () {
                    body.innerHTML = '<div class="wx-loading">Could not reach the weather service.<br>Check your connection and try again.</div>';
                });
        }
        function renderFull(d) {
            var info = codeInfo(d.code);
            var hours = d.hourly.map(function (h) {
                var hi = codeInfo(h.code);
                return '<div class="wx-hcell"><span>' + esc(h.t) + '</span><span class="wx-hico">' + esc(hi.icon) +
                    '</span><b>' + Math.round(h.temp) + '°</b><i>' + h.pop + '%</i></div>';
            }).join('');
            var days = d.daily.map(function (x) {
                var di = codeInfo(x.code);
                return '<div class="wx-drow"><span class="wx-dday">' + esc(x.day) + '</span>' +
                    '<span class="wx-dico">' + esc(di.icon) + '</span>' +
                    '<span class="wx-dpop">' + x.pop + '%</span>' +
                    '<span class="wx-dtmp"><b>' + Math.round(x.hi) + '°</b> ' + Math.round(x.lo) + '°</span></div>';
            }).join('');
            return '<div class="wx-hero"><div class="wx-hero-icon">' + esc(info.icon) + '</div>' +
                '<div class="wx-hero-temp">' + Math.round(d.temp) + '°</div>' +
                '<div class="wx-hero-place">' + esc(d.place) + ' · ' + esc(info.label) + '</div>' +
                '<div class="wx-hero-hilo">H ' + Math.round(d.hi) + '°&nbsp;&nbsp;L ' + Math.round(d.lo) + '°' +
                (d._stale ? '&nbsp;&nbsp;· cached' : '') + '</div></div>' +
                '<div class="wx-sec">Hourly</div><div class="wx-hours">' + hours + '</div>' +
                '<div class="wx-sec">7-day forecast</div><div class="wx-days">' + days + '</div>' +
                '<div class="wx-sec">Details</div><div class="wx-grid">' +
                '<div><span>Feels like</span><b>' + Math.round(d.feels) + '°</b></div>' +
                '<div><span>Humidity</span><b>' + d.humidity + '%</b></div>' +
                '<div><span>Wind</span><b>' + Math.round(d.wind) + ' km/h</b></div>' +
                '<div><span>Sunrise</span><b>' + esc(d.sunrise || '—') + '</b></div>' +
                '<div><span>Sunset</span><b>' + esc(d.sunset || '—') + '</b></div>' +
                '<div><span>Rain chance</span><b>' + d.precip + '%</b></div></div>';
        }
        load();
    }

    window.BrowWeather = { mountApp: mountApp };
})();
