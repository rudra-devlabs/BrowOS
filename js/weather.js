/* BrowWeather — open-meteo backend (no key needed) + Weather app.
 *
 * Shared API for the Weather app: window.BrowWeatherAPI.
 *
 * Everything Open-Meteo returns for the requested parameter set is parsed and
 * surfaced — current conditions, the full 24-hour window (temperature, weather
 * code, precipitation probability, UV index, visibility), the 7-day outlook
 * (highs/lows, apparent highs/lows, precipitation probability + sum, rain sum,
 * UV index, clear-sky UV index, max wind, max gusts, sunrise, sunset) and the
 * European AQI + pollutant breakdown from the air-quality endpoint.
 *
 * Location is auto-detected via navigator.geolocation (reverse-geocoded to a
 * city name) and can be overridden by picking a city.
 *
 * Glyphs are inline SVG rather than emoji so the app has one crisp,
 * theme-aware visual language.
 */
(function () {
    'use strict';

    var CACHE_KEY = 'browos_weather_cache_v1';
    var LOC_KEY = 'browos_weather_loc_v2';
    var LOC_AUTO_KEY = 'browos_weather_loc_auto_v1';
    var LOC_KEY_OLD = 'browos_weather_loc_v1';
    var CITIES_KEY = 'browos_weather_cities_v1';
    var TTL = 15 * 60 * 1000;
    var DEFAULT_LOC = { name: 'New York', lat: 40.71, lon: -74.0 };

    /* Seeded so the sidebar is not empty on a first run; fully editable. */
    var SEED_CITIES = [
        { name: 'New York', lat: 40.71, lon: -74.0 },
        { name: 'London', lat: 51.51, lon: -0.13 },
        { name: 'Tokyo', lat: 35.68, lon: 139.69 },
        { name: 'Dubai', lat: 25.2, lon: 55.27 },
        { name: 'Sydney', lat: -33.87, lon: 151.21 }
    ];

    // ─── weather codes ───────────────────────────────────────────────────
    // icon: legacy text glyph (kept so any older consumer still resolves);
    // key:  semantic slug into the SVG glyph table below.
    var WMO = {
        0: ['☀', 'Clear sky', 'clear'],
        1: ['☀', 'Mainly clear', 'mainly-clear'],
        2: ['☁', 'Partly cloudy', 'partly'],
        3: ['☁', 'Overcast', 'overcast'],
        45: ['~', 'Fog', 'fog'],
        48: ['~', 'Icy fog', 'fog'],
        51: ['☂', 'Light drizzle', 'drizzle'],
        53: ['☂', 'Drizzle', 'drizzle'],
        55: ['☂', 'Dense drizzle', 'drizzle'],
        56: ['☂', 'Freezing drizzle', 'drizzle'],
        57: ['☂', 'Freezing drizzle', 'drizzle'],
        61: ['☂', 'Slight rain', 'rain'],
        63: ['☂', 'Rain', 'rain'],
        65: ['☂', 'Heavy rain', 'heavy-rain'],
        66: ['☂', 'Freezing rain', 'heavy-rain'],
        67: ['☂', 'Freezing rain', 'heavy-rain'],
        71: ['❄', 'Slight snow', 'snow'],
        73: ['❄', 'Snow', 'snow'],
        75: ['❄', 'Heavy snow', 'snow'],
        77: ['❄', 'Snow grains', 'snow'],
        80: ['☂', 'Slight showers', 'rain'],
        81: ['☂', 'Showers', 'rain'],
        82: ['☂', 'Violent showers', 'heavy-rain'],
        85: ['❄', 'Snow showers', 'snow'],
        86: ['❄', 'Snow showers', 'snow'],
        95: ['⚡', 'Thunderstorm', 'thunder'],
        96: ['⚡', 'Storm + hail', 'thunder'],
        99: ['⚡', 'Storm + hail', 'thunder']
    };

    function codeInfo(code) {
        var e = WMO[code];
        return e
            ? { icon: e[0], label: e[1], key: e[2] }
            : { icon: '☁', label: '—', key: 'overcast' };
    }

    /* Which SVG glyph represents this code. Day/night only changes the
     * clear / mainly-clear / partly variants. */
    function glyphKey(code, isDay) {
        var day = isDay !== 0 && isDay !== false;
        if (code === 0 || code === 1) return day ? 'sun' : 'moon';
        if (code === 2) return day ? 'partly-day' : 'partly-night';
        if (code === 3) return 'cloud';
        if (code === 45 || code === 48) return 'fog';
        if (code >= 51 && code <= 57) return 'drizzle';
        if (code === 61 || code === 63 || code === 80 || code === 81) return 'rain';
        if (code === 65 || code === 66 || code === 67 || code === 82) return 'heavy-rain';
        if (code >= 71 && code <= 77) return 'snow';
        if (code === 85 || code === 86) return 'snow';
        if (code >= 95) return 'thunder';
        return 'cloud';
    }

    // ─── SVG icon system ─────────────────────────────────────────────────
    function g(inner, tx, ty, s) {
        return '<g transform="translate(' + tx + ' ' + ty + ') scale(' + s + ')">' + inner + '</g>';
    }
    var SUN = '<circle cx="12" cy="12" r="4.1"/>' +
        '<path d="M12 2.4v2.3M12 19.3v2.3M2.4 12h2.3M19.3 12h2.3' +
        'M5.3 5.3l1.7 1.7M17 17l1.7 1.7M18.7 5.3 17 7M7 17l-1.7 1.7"/>';
    var MOON = '<path d="M20.4 14.8A8.7 8.7 0 1 1 9.2 3.6a6.9 6.9 0 0 0 11.2 11.2Z"/>';
    var CLOUD = '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>';

    var GLYPH = {
        sun: SUN,
        moon: MOON,
        cloud: CLOUD,
        'partly-day': g(SUN, -2.6, -3, 0.46) + g(CLOUD, 4.2, 7.2, 0.68),
        'partly-night': g(MOON, -2.6, -3, 0.46) + g(CLOUD, 4.2, 7.2, 0.68),
        fog: g(CLOUD, 0, -3, 0.84) + '<path d="M5 19.2h11.6M7.4 22h9.4"/>',
        drizzle: g(CLOUD, 0, -3.4, 0.84) + '<path d="M9.8 17.4l-.9 2.6M14 17.4l-.9 2.6"/>',
        rain: g(CLOUD, 0, -3.4, 0.84) +
            '<path d="M9.2 17.1 7.5 20.9M12.4 17.1 10.7 20.9M15.6 17.1 13.9 20.9"/>',
        'heavy-rain': g(CLOUD, 0, -3.6, 0.84) +
            '<path d="M8.4 16.7 6.6 21M11.4 16.7 9.6 21M14.4 16.7 12.6 21M17.2 16.7 15.4 21"/>',
        snow: g(CLOUD, 0, -3.4, 0.84) +
            '<path d="M9.2 17.4v3.2M7.8 18.2l2.8 1.6M10.6 18.2l-2.8 1.6' +
            'M14.9 17.4v3.2M13.5 18.2l2.8 1.6M16.3 18.2l-2.8 1.6"/>',
        thunder: g(CLOUD, 0, -3.6, 0.84) + '<path d="M13.4 16.2 10.8 20.4h2.8l-.8 2.8"/>'
    };

    var UI = {
        feels: '<path d="M14 14.6V5a2 2 0 1 0-4 0v9.6a4 4 0 1 0 4 0Z"/><path d="M12 9.4v7.2"/>',
        humidity: '<path d="M12 3.2S6.4 9.4 6.4 13.4a5.6 5.6 0 0 0 11.2 0C17.6 9.4 12 3.2 12 3.2Z"/>',
        wind: '<path d="M3.6 8.4h11.2a2.8 2.8 0 1 0-2.8-2.8M3.6 12.4h15.2a2.8 2.8 0 1 1-2.8 2.8M3.6 16.4h8"/>',
        gust: '<path d="M3.6 7.6h9.6a2.6 2.6 0 1 0-2.6-2.6M3.6 12.2h12.2a2.6 2.6 0 1 1-2.6 2.6M3.6 16.8h6.4"/>' +
            '<path d="M17.6 20.4v-5.2M15.4 17.4l2.2-2.2 2.2 2.2"/>',
        pressure: '<path d="M4.4 17.6a8.4 8.4 0 1 1 15.2 0"/><path d="M12 13.6 15.6 9"/><circle cx="12" cy="15" r="1.6"/>',
        cloud: CLOUD,
        uv: '<circle cx="12" cy="12" r="3.6"/>' +
            '<path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.5 5.5 7 7M17 17l1.5 1.5M18.5 5.5 17 7M7 17l-1.5 1.5"/>',
        eye: '<path d="M2.4 12S6 5.8 12 5.8 21.6 12 21.6 12 18 18.2 12 18.2 2.4 12 2.4 12Z"/><circle cx="12" cy="12" r="3"/>',
        drop: '<path d="M12 3.2S6.4 9.4 6.4 13.4a5.6 5.6 0 0 0 11.2 0C17.6 9.4 12 3.2 12 3.2Z"/>',
        rain: '<path d="M12 3.4S6.8 9.2 6.8 13a5.2 5.2 0 0 0 10.4 0C17.2 9.2 12 3.4 12 3.4Z"/><path d="M9.6 14.4a2.6 2.6 0 0 0 2.4 2.6"/>',
        sunrise: '<path d="M12 8.6v-5M9 6.6 12 3.6l3 3"/><path d="M3.6 17.4h16.8"/><path d="M6.4 17.4a5.6 5.6 0 0 1 11.2 0"/>',
        sunset: '<path d="M12 3.6v5M9 5.6 12 8.6l3-3"/><path d="M3.6 17.4h16.8"/><path d="M6.4 17.4a5.6 5.6 0 0 1 11.2 0"/>',
        compass: '<circle cx="12" cy="12" r="8.4"/><path d="M15.6 8.4l-2.2 5-5 2.2 2.2-5z"/>',
        clock: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.6V12l3 1.8"/>',
        pin: '<path d="M12 21.2s6.4-6.2 6.4-11a6.4 6.4 0 1 0-12.8 0c0 4.8 6.4 11 6.4 11Z"/><circle cx="12" cy="10.2" r="2.4"/>',
        refresh: '<path d="M20.2 11.4A8.4 8.4 0 0 0 6.2 6.6L3.8 9"/><path d="M3.8 4.4V9h4.6"/>' +
            '<path d="M3.8 12.6a8.4 8.4 0 0 0 14 4.8L20.2 15"/><path d="M20.2 19.6V15h-4.6"/>',
        search: '<circle cx="11" cy="11" r="6.4"/><path d="M15.7 15.7 20.4 20.4"/>',
        up: '<path d="M12 19.4V5M6.4 10.6 12 5l5.6 5.6"/>',
        down: '<path d="M12 4.6V19M6.4 13.4 12 19l5.6-5.6"/>',
        thermo: '<path d="M14 14.6V5a2 2 0 1 0-4 0v9.6a4 4 0 1 0 4 0Z"/>',
        locate: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.4"/>' +
            '<path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
        home: '<path d="M3.6 10.4 12 3.6l8.4 6.8"/><path d="M5.6 9.6V20h12.8V9.6"/><path d="M10 20v-5.2h4V20"/>',
        chart: '<path d="M4 19.4V13M9.4 19.4V6.6M14.8 19.4v-8.6M20.2 19.4V9.4"/>',
        dots: '<circle cx="6" cy="6" r="1.5"/><circle cx="12" cy="6" r="1.5"/><circle cx="18" cy="6" r="1.5"/>' +
            '<circle cx="6" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/>' +
            '<circle cx="6" cy="18" r="1.5"/><circle cx="12" cy="18" r="1.5"/><circle cx="18" cy="18" r="1.5"/>',
        gear: '<circle cx="12" cy="12" r="3.1"/>' +
            '<path d="M19.2 14.6a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.84 2.84l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.84-2.84l.06-.06a1.7 1.7 0 0 0 .34-1.88 1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.56-1.1 1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.84-2.84l.06.06a1.7 1.7 0 0 0 1.88.34H9a1.7 1.7 0 0 0 1.04-1.56V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.84 2.84l-.06.06a1.7 1.7 0 0 0-.34 1.88V9a1.7 1.7 0 0 0 1.56 1.04H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.56 1.04Z"/>',
        edit: '<path d="M4 20h4.2l9.6-9.6-4.2-4.2L4 15.8Z"/><path d="M14.6 5.2 16.8 3l4.2 4.2-2.2 2.2"/>',
        swap: '<path d="M4.6 8.4h12.2l-3.2-3.2M19.4 15.6H7.2l3.2 3.2"/>',
        chev: '<path d="M9.6 5.4 16.2 12l-6.6 6.6"/>'
    };

    function svg(inner, size, cls) {
        return '<svg class="wx-ico' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" width="' + size +
            '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="1.6" ' +
            'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
            inner + '</svg>';
    }
    function icon(key, size, cls) { return svg(GLYPH[key] || GLYPH.cloud, size || 24, cls); }
    function uiIcon(name, size, cls) { return svg(UI[name] || UI.cloud, size || 18, cls); }

    // ─── illustrated glyphs ──────────────────────────────────────────────
    /* The line-art icons above are right for chrome and for 18px slots, but a
     * hero weather glyph wants what the reference has: filled shapes with a
     * soft vertical gradient, a warm sun/moon accent and a saturated bolt.
     * Gradients are declared once in a shared hidden sprite so every glyph can
     * reference them by id without duplicating (and colliding on) ids. */
    var ART_READY = false;
    var ART_VIEWBOX = '0 0 100 100';

    function artDefs() {
        if (ART_READY || !document.body || document.getElementById('wx-art-defs')) {
            ART_READY = true;
            return;
        }
        ART_READY = true;
        var host = document.createElement('div');
        host.id = 'wx-art-defs';
        host.setAttribute('aria-hidden', 'true');
        host.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
        host.innerHTML =
            '<svg xmlns="http://www.w3.org/2000/svg"><defs>' +
            '<linearGradient id="wxGCloud" x1="0" y1="0" x2="0.25" y2="1">' +
                '<stop offset="0" stop-color="#cbd3df"/><stop offset="1" stop-color="#8d97a9"/>' +
            '</linearGradient>' +
            '<linearGradient id="wxGCloudMid" x1="0" y1="0" x2="0.25" y2="1">' +
                '<stop offset="0" stop-color="#a3adbd"/><stop offset="1" stop-color="#69738a"/>' +
            '</linearGradient>' +
            '<linearGradient id="wxGCloudDark" x1="0" y1="0" x2="0.25" y2="1">' +
                '<stop offset="0" stop-color="#79839a"/><stop offset="1" stop-color="#3f4757"/>' +
            '</linearGradient>' +
            '<linearGradient id="wxGBolt" x1="0" y1="0" x2="0" y2="1">' +
                '<stop offset="0" stop-color="#ffdc6b"/><stop offset="1" stop-color="#ff8a1f"/>' +
            '</linearGradient>' +
            '<linearGradient id="wxGSun" x1="0" y1="0" x2="0.3" y2="1">' +
                '<stop offset="0" stop-color="#ffdc76"/><stop offset="1" stop-color="#ff9a2b"/>' +
            '</linearGradient>' +
            '<linearGradient id="wxGMoon" x1="0" y1="0" x2="0.3" y2="1">' +
                '<stop offset="0" stop-color="#fff6d5"/><stop offset="1" stop-color="#f0d489"/>' +
            '</linearGradient>' +
            '<linearGradient id="wxGRain" x1="0" y1="0" x2="0" y2="1">' +
                '<stop offset="0" stop-color="#9ad6ff"/><stop offset="1" stop-color="#4aa8ff"/>' +
            '</linearGradient>' +
            '</defs></svg>';
        document.body.appendChild(host);
    }

    /* Cumulus built from overlapping lobes on a flat base — reads as one shape
     * once a single fill is applied to the group. Spans x 16..92, y 17..76. */
    var CLOUD_PARTS =
        '<circle cx="36" cy="56" r="20"/>' +
        '<circle cx="57" cy="42" r="25"/>' +
        '<circle cx="76" cy="58" r="16"/>' +
        '<rect x="30" y="58" width="50" height="18" rx="9"/>';

    function artCloud(fill, s, dx, dy) {
        s = (s == null) ? 1 : s;
        var cx = 54, cy = 46;                       // approximate cloud centre
        var tf = 'translate(' + (dx || 0) + ',' + (dy || 0) + ') translate(' +
            (cx - cx * s).toFixed(2) + ',' + (cy - cy * s).toFixed(2) + ') scale(' + s + ')';
        return '<g fill="' + fill + '" transform="' + tf + '">' + CLOUD_PARTS + '</g>';
    }

    var ART_BOLT = '<path d="M60 52 L40 78 H52 L46 96 L68 70 H56 Z" fill="url(#wxGBolt)"/>';
    var ART_RAIN = '<g stroke="url(#wxGRain)" stroke-width="6" stroke-linecap="round">' +
        '<path d="M42 82l-5 12"/><path d="M58 82l-5 12"/><path d="M74 82l-5 12"/></g>';
    var ART_DRIZZLE = '<g stroke="url(#wxGRain)" stroke-width="4.5" stroke-linecap="round">' +
        '<path d="M46 84l-3 8"/><path d="M60 84l-3 8"/><path d="M74 84l-3 8"/></g>';
    var ART_SNOW = '<g fill="#e9f4ff">' +
        '<circle cx="42" cy="86" r="4.6"/><circle cx="58" cy="94" r="4.6"/>' +
        '<circle cx="74" cy="86" r="4.6"/></g>';
    var ART_FOG = '<g stroke="url(#wxGCloudMid)" stroke-width="6" stroke-linecap="round">' +
        '<path d="M26 82h48"/><path d="M34 94h40"/></g>';
    /* Crescent drawn in a 24-box then scaled up, so the curve is known-good. */
    var ART_MOON = '<g fill="url(#wxGMoon)" transform="scale(4.1667)">' +
        '<path d="M20.4 14.8A8.7 8.7 0 1 1 9.2 3.6a6.9 6.9 0 0 0 11.2 11.2Z"/></g>';
    var ART_MOON_SM = '<g transform="translate(34,8) scale(0.6)">' + ART_MOON + '</g>';
    var ART_SUN_SM = '<circle cx="64" cy="36" r="23" fill="url(#wxGSun)"/>';

    var ART_LIGHT = 'url(#wxGCloud)';
    var ART_MID = 'url(#wxGCloudMid)';
    var ART_DARK = 'url(#wxGCloudDark)';

    function artFor(code, isDay) {
        var day = isDay !== 0 && isDay !== false;
        var c = Number(code) || 0;

        if (c === 0) return day
            ? '<circle cx="50" cy="50" r="33" fill="url(#wxGSun)"/>'
            : ART_MOON;
        if (c === 1 || c === 2) {
            return (day ? ART_SUN_SM : ART_MOON_SM) + artCloud(ART_LIGHT, 0.9, -3, 11);
        }
        if (c === 3) return artCloud(ART_DARK, 1, 0, 5);
        if (c === 45 || c === 48) return artCloud(ART_MID, 0.96, 0, 2) + ART_FOG;
        if (c >= 95) return artCloud(ART_DARK, 1, 0, 2) + ART_BOLT;
        if (c === 85 || c === 86) return artCloud(ART_LIGHT, 1, 0, 2) + ART_SNOW;
        if (c >= 80) return artCloud(ART_MID, 1, 0, 2) + ART_RAIN;
        if (c >= 71) return artCloud(ART_LIGHT, 1, 0, 2) + ART_SNOW;
        if (c >= 61) return artCloud(ART_MID, 1, 0, 2) + ART_RAIN;
        if (c >= 51) return artCloud(ART_MID, 1, 0, 2) + ART_DRIZZLE;
        return artCloud(ART_LIGHT, 1, 0, 2);
    }

    function art(code, isDay, size, cls) {
        artDefs();
        size = size || 48;
        return '<svg class="wx-art' + (cls ? ' ' + cls : '') + '" viewBox="' + ART_VIEWBOX +
            '" width="' + size + '" height="' + size + '" aria-hidden="true" focusable="false">' +
            artFor(code, isDay) + '</svg>';
    }

    // ─── location ────────────────────────────────────────────────────────
    /* Two location modes:
     *   auto   — navigator.geolocation, reverse-geocoded to a city name
     *   manual — a city the user picked from search or the sidebar list
     * Because the record lives in one localStorage slot, every view
     * agrees on the same city. */
    var LOC_TTL = 6 * 60 * 60 * 1000;   // re-detect at most every 6 h
    var GEO_TIMEOUT = 9000;
    var _locKey = null;                  // memoised key for cheap change detection
    var _locPromise = null;              // in-flight autoLocate(), de-duped

    function readLoc() {
        try {
            var raw = localStorage.getItem(LOC_KEY);
            if (raw) {
                var o = JSON.parse(raw);
                if (o && (o.mode === 'auto' || o.mode === 'manual')) return o;
            }
            // migrate the pre-geolocation manual-only record
            var old = localStorage.getItem(LOC_KEY_OLD);
            if (old) {
                var p = JSON.parse(old);
                if (p && isFinite(p.lat)) {
                    var m = { mode: 'manual', name: p.name, lat: p.lat, lon: p.lon, at: Date.now() };
                    writeLoc(m);
                    return m;
                }
            }
        } catch (e) {}
        return { mode: 'auto' };
    }

    function writeLoc(rec) {
        _locKey = null;
        try { localStorage.setItem(LOC_KEY, JSON.stringify(rec)); } catch (e) {}
    }

    /* The last successful geolocation fix lives in its own slot so a manual
     * override does not erase it — the sidebar's "My Location" card keeps
     * showing the detected place (and its weather) while a city is pinned. */
    function writeAuto(rec) {
        try { localStorage.setItem(LOC_AUTO_KEY, JSON.stringify(rec)); } catch (e) {}
    }
    function autoLoc() {
        try {
            var raw = localStorage.getItem(LOC_AUTO_KEY);
            if (raw) {
                var o = JSON.parse(raw);
                if (o && isFinite(o.lat) && isFinite(o.lon)) return o;
            }
        } catch (e) {}
        return null;
    }

    /* Synchronous best-known location. `_pending` means "auto-detect is in
     * flight and we have never had a fix" — the UI shows a locating state
     * rather than confidently displaying the wrong city. */
    function getLoc() {
        var rec = readLoc();
        if (rec && isFinite(rec.lat) && isFinite(rec.lon)) return rec;
        return {
            mode: 'auto', name: DEFAULT_LOC.name, lat: DEFAULT_LOC.lat,
            lon: DEFAULT_LOC.lon, _pending: true
        };
    }

    function setLoc(loc) {
        writeLoc({ mode: 'manual', name: loc.name, lat: loc.lat, lon: loc.lon, at: Date.now() });
    }
    /* Switching back to auto restores the last detected fix immediately, so
     * picking "My Location" never re-prompts for permission. */
    function setAuto() {
        var a = autoLoc();
        writeLoc(a || { mode: 'auto' });
    }
    function locMode() { var r = readLoc(); return (r && r.mode) || 'auto'; }

    function locKey() {
        if (_locKey != null) return _locKey;
        var r = readLoc();
        _locKey = (r && isFinite(r.lat) && isFinite(r.lon))
            ? r.mode + ':' + r.lat.toFixed(3) + ',' + r.lon.toFixed(3)
            : 'none';
        return _locKey;
    }

    function coordsLabel(lat, lon) {
        return Math.abs(lat).toFixed(1) + '\u00b0' + (lat >= 0 ? 'N' : 'S') + ', ' +
            Math.abs(lon).toFixed(1) + '\u00b0' + (lon >= 0 ? 'E' : 'W');
    }

    function geoPosition() {
        return new Promise(function (resolve, reject) {
            if (!navigator.geolocation) return reject(new Error('geolocation unavailable'));
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: false, timeout: GEO_TIMEOUT, maximumAge: 10 * 60 * 1000
            });
        });
    }

    /* Geolocation only yields coordinates. BigDataCloud's keyless client
     * endpoint turns them into a city name; if it is unreachable we still work,
     * the label just degrades to the coordinates. */
    function reverseGeocode(lat, lon) {
        return fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' + lat +
            '&longitude=' + lon + '&localityLanguage=en')
            .then(function (r) { if (!r.ok) throw new Error('rev ' + r.status); return r.json(); })
            .then(function (j) {
                var city = j.city || j.locality || '';
                var region = j.principalSubdivision || '';
                var cc = j.countryCode || '';
                if (!city && !region) return null;
                var name = city || region;
                if (region && region !== name) name += ', ' + region;
                if (cc) name += ' ' + String(cc).toUpperCase();
                return name;
            });
    }

    function autoLocate() {
        return geoPosition().then(function (pos) {
            var lat = pos.coords.latitude, lon = pos.coords.longitude;
            return reverseGeocode(lat, lon).catch(function () { return null; }).then(function (name) {
                var rec = {
                    mode: 'auto', name: name || coordsLabel(lat, lon),
                    lat: lat, lon: lon, at: Date.now()
                };
                writeAuto(rec);
                writeLoc(rec);
                return rec;
            });
        });
    }

    /* Resolve the location to render with. Never rejects: if geolocation is
     * denied or unavailable we keep the last fix, or fall back to DEFAULT_LOC
     * with `_denied` set so the UI can explain itself. */
    function ensureLoc(opts) {
        opts = opts || {};
        var rec = readLoc();

        if (!opts.force) {
            if (rec && rec.mode === 'manual' && isFinite(rec.lat)) return Promise.resolve(rec);
            if (rec && isFinite(rec.lat) && (Date.now() - (rec.at || 0)) < LOC_TTL) {
                return Promise.resolve(rec);
            }
            if (_locPromise) return _locPromise;
        }

        _locPromise = autoLocate().catch(function () {
            var keep = autoLoc() || readLoc();
            if (keep && isFinite(keep.lat)) return keep;
            /* Remember the fallback so `getLoc()` stops reporting "pending"
             * (which would re-enter the locating state forever), but stamp it
             * `at: 0` + `denied` so the next call retries geolocation instead of
             * treating it as a fresh 6-hour-old fix. */
            var fb = {
                mode: 'auto', name: DEFAULT_LOC.name, lat: DEFAULT_LOC.lat,
                lon: DEFAULT_LOC.lon, at: 0, denied: true
            };
            writeAuto(fb);
            writeLoc(fb);
            return fb;
        }).then(function (loc) { _locPromise = null; return loc; });
        return _locPromise;
    }

    // ─── saved cities (the app sidebar list) ─────────────────────────────
    function getCities() {
        try {
            var raw = localStorage.getItem(CITIES_KEY);
            if (raw) { var a = JSON.parse(raw); if (Array.isArray(a)) return a; }
        } catch (e) {}
        return SEED_CITIES.slice();
    }
    function setCities(list) {
        try { localStorage.setItem(CITIES_KEY, JSON.stringify(list)); } catch (e) {}
    }
    function addCity(c) {
        var list = getCities().filter(function (x) {
            return Math.abs(x.lat - c.lat) > 0.01 || Math.abs(x.lon - c.lon) > 0.01;
        });
        list.push({ name: c.name, lat: c.lat, lon: c.lon });
        setCities(list);
        return list;
    }
    function removeCity(i) {
        var list = getCities();
        if (i >= 0 && i < list.length) list.splice(i, 1);
        setCities(list);
        return list;
    }

    // ─── cache ───────────────────────────────────────────────────────────
    function cacheGet(key) {
        try {
            var raw = localStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            var c = JSON.parse(raw);
            if (!c || c.key !== key) return null;
            if ((Date.now() - c.ts) > TTL) return null;
            return c.data;
        } catch (e) { return null; }
    }
    function cacheAny(key) {
        try {
            var raw = localStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            var c = JSON.parse(raw);
            return (c && c.key === key) ? c.data : null;
        } catch (e) { return null; }
    }
    function cacheSet(key, data) {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ key: key, ts: Date.now(), data: data })); } catch (e) {}
    }

    // ─── helpers ─────────────────────────────────────────────────────────
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
    function fmtDateNum(iso) {
        var d = new Date(iso + 'T12:00:00');
        return d.getDate();
    }
    function hhmm(iso) { return iso ? String(iso).slice(11, 16) : ''; }

    var DIRS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    function dirCard(deg) {
        if (deg == null || !isFinite(deg)) return '';
        return DIRS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
    }
    function minutesOfDay(hm) {
        if (!hm) return null;
        var p = hm.split(':');
        return Number(p[0]) * 60 + Number(p[1]);
    }
    function clockNow() {
        var n = new Date();
        return n.getHours() * 60 + n.getMinutes();
    }
    /* Open-Meteo answers with wall-clock strings for the *target city*, so the
     * sun arc and the "observed" stamp must be evaluated in that city's local
     * time — never the viewer's. */
    function cityNowMinutes(offsetSec) {
        if (offsetSec == null || !isFinite(offsetSec)) return clockNow();
        var n = new Date();
        var shifted = new Date(n.getTime() + (offsetSec * 1000) + (n.getTimezoneOffset() * 60000));
        return shifted.getHours() * 60 + shifted.getMinutes();
    }
    function fmtClockHM(iso) {
        if (!iso) return '';
        var parts = String(iso).slice(11, 16).split(':');
        if (parts.length < 2) return '';
        var h = Number(parts[0]);
        var ap = h >= 12 ? 'PM' : 'AM';
        h = h % 12; if (!h) h = 12;
        return h + ':' + parts[1] + ' ' + ap;
    }
    function humidityWord(h) {
        if (h == null) return '';
        if (h >= 90) return 'saturated';
        if (h >= 75) return 'muggy';
        if (h >= 45) return 'comfortable';
        if (h >= 25) return 'dry';
        return 'very dry';
    }

    function uvLevel(uv) {
        uv = uv || 0;
        if (uv < 3) return { label: 'Low', tone: '#5ad27a' };
        if (uv < 6) return { label: 'Moderate', tone: '#f5b13d' };
        if (uv < 8) return { label: 'High', tone: '#f5763d' };
        if (uv < 11) return { label: 'Very high', tone: '#e4557f' };
        return { label: 'Extreme', tone: '#b06bff' };
    }

    function searchCity(q) {
        return fetch('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(q) +
            '&count=6&language=en&format=json').then(function (r) {
            if (!r.ok) throw new Error('geo ' + r.status);
            return r.json();
        }).then(function (j) {
            return (j.results || []).map(function (g2) {
                return {
                    name: g2.name + (g2.admin1 ? ', ' + g2.admin1 : '') +
                        (g2.country_code ? ' ' + g2.country_code.toUpperCase() : ''),
                    lat: g2.latitude, lon: g2.longitude
                };
            });
        });
    }

    // ─── fetch + parse ───────────────────────────────────────────────────
    var PARAMS =
        '&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,' +
        'weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl,cloud_cover,' +
        'uv_index,dew_point_2m' +
        '&hourly=temperature_2m,precipitation_probability,weather_code,uv_index,visibility' +
        '&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,' +
        'apparent_temperature_min,precipitation_probability_max,sunrise,sunset,uv_index_max,' +
        'uv_index_clear_sky_max,precipitation_sum,rain_sum,wind_speed_10m_max,wind_gusts_10m_max' +
        '&timezone=auto&forecast_days=7';

    /* Separate host, same keyless deal. `timezone=auto` matters: without it the
     * air-quality endpoint stamps everything in GMT. */
    var AQI_PARAMS =
        '&current=european_aqi,us_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,' +
        'sulphur_dioxide,ozone,alder_pollen,birch_pollen,grass_pollen&timezone=auto';

    /* European AQI bands (0-20 good … >100 extremely poor). */
    function aqiBand(aqi) {
        if (aqi == null || !isFinite(aqi)) return { label: '\u2014', tone: '#8b93a5' };
        if (aqi <= 20) return { label: 'Good', tone: '#5ad27a' };
        if (aqi <= 40) return { label: 'Fair', tone: '#a8d95a' };
        if (aqi <= 60) return { label: 'Moderate', tone: '#f5b13d' };
        if (aqi <= 80) return { label: 'Poor', tone: '#f5763d' };
        if (aqi <= 100) return { label: 'Very poor', tone: '#e4557f' };
        return { label: 'Extremely poor', tone: '#b06bff' };
    }

    function parseAir(j) {
        if (!j) return null;
        var c = j.current || {};
        var pollen = Math.max(c.alder_pollen || 0, c.birch_pollen || 0, c.grass_pollen || 0);
        return {
            aqi: c.european_aqi != null ? c.european_aqi : null,
            us: c.us_aqi != null ? c.us_aqi : null,
            pm25: c.pm2_5, pm10: c.pm10,
            co: c.carbon_monoxide, no2: c.nitrogen_dioxide,
            so2: c.sulphur_dioxide, o3: c.ozone,
            pollen: pollen || null,
            observed: c.time
        };
    }

    /* The sidebar wants a one-line summary for every saved city. Open-Meteo
     * accepts comma-separated coordinates and answers with an array, so the
     * whole list costs a single request. */
    function summaries(locs) {
        if (!locs.length) return Promise.resolve([]);
        var url = 'https://api.open-meteo.com/v1/forecast?latitude=' +
            locs.map(function (l) { return l.lat; }).join(',') +
            '&longitude=' + locs.map(function (l) { return l.lon; }).join(',') +
            '&current=temperature_2m,weather_code,is_day,relative_humidity_2m' +
            '&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1';
        return fetch(url).then(function (r) {
            if (!r.ok) throw new Error('sum ' + r.status);
            return r.json();
        }).then(function (j) {
            var arr = Array.isArray(j) ? j : [j];
            return locs.map(function (l, i) {
                var d = arr[i] || {};
                var c = d.current || {}, dl = d.daily || {};
                return {
                    name: l.name, lat: l.lat, lon: l.lon,
                    temp: c.temperature_2m,
                    code: c.weather_code,
                    isDay: c.is_day,
                    humidity: c.relative_humidity_2m,
                    hi: (dl.temperature_2m_max || [])[0],
                    lo: (dl.temperature_2m_min || [])[0],
                    clock: c.time ? fmtClockHM(c.time) : ''
                };
            });
        });
    }

    function parse(j, loc) {
        var cur = j.current || {};
        var hr = j.hourly || {};
        var dl = j.daily || {};
        var pick = function (arr, i) { return (arr && arr[i] != null) ? arr[i] : null; };

        // ── daily first: the hourly pass needs sunrise/sunset per day ──
        var daily = [];
        var dayCount = Math.min(7, (dl.time || []).length);
        for (var x = 0; x < dayCount; x++) {
            var sr = hhmm(pick(dl.sunrise, x));
            var ss = hhmm(pick(dl.sunset, x));
            daily.push({
                iso: dl.time[x],
                day: fmtDay(dl.time[x], x),
                dateNum: fmtDateNum(dl.time[x]),
                code: pick(dl.weather_code, x),
                hi: pick(dl.temperature_2m_max, x),
                lo: pick(dl.temperature_2m_min, x),
                feelsHi: pick(dl.apparent_temperature_max, x),
                feelsLo: pick(dl.apparent_temperature_min, x),
                pop: pick(dl.precipitation_probability_max, x) || 0,
                uv: pick(dl.uv_index_max, x) || 0,
                uvClear: pick(dl.uv_index_clear_sky_max, x) || 0,
                precip: pick(dl.precipitation_sum, x) || 0,
                rain: pick(dl.rain_sum, x) || 0,
                windMax: pick(dl.wind_speed_10m_max, x) || 0,
                gustMax: pick(dl.wind_gusts_10m_max, x) || 0,
                sunrise: sr,
                sunset: ss
            });
        }

        function dayRecordFor(iso) {
            var key = String(iso).slice(0, 10);
            for (var i = 0; i < daily.length; i++) if (daily[i].iso === key) return daily[i];
            return null;
        }
        function isHourDaylight(iso) {
            var hm = String(iso).slice(11, 16);
            var rec = dayRecordFor(iso);
            var sr = (rec && rec.sunrise) || '06:00';
            var ss = (rec && rec.sunset) || '18:00';
            return hm >= sr && hm < ss;
        }

        // ── the 24-hour window starting at the current hour ──
        var nowH = cur.time ? String(cur.time).slice(0, 13) : '';
        var start = 0;
        if (hr.time) {
            for (var i = 0; i < hr.time.length; i++) {
                if (String(hr.time[i]).slice(0, 13) >= nowH) { start = i; break; }
            }
        }
        var hourly = [];
        var end = Math.min(start + 24, (hr.time || []).length);
        for (var k = start; k < end; k++) {
            hourly.push({
                iso: hr.time[k],
                t: fmtHour(hr.time[k]),
                temp: pick(hr.temperature_2m, k),
                code: pick(hr.weather_code, k),
                pop: pick(hr.precipitation_probability, k) || 0,
                uv: pick(hr.uv_index, k) || 0,
                vis: pick(hr.visibility, k),            // metres
                isDay: isHourDaylight(hr.time[k]),
                isNow: k === start
            });
        }

        var today = daily[0] || {};
        var uvNow = (cur.uv_index != null) ? cur.uv_index : 0;

        // day-length + how far through the daylight we are (for the sun arc)
        var srMin = minutesOfDay(today.sunrise);
        var ssMin = minutesOfDay(today.sunset);
        var dayLen = (srMin != null && ssMin != null) ? Math.max(0, ssMin - srMin) : null;
        var nowMin = cityNowMinutes(j.utc_offset_seconds);
        var sunProgress = null;
        if (dayLen) {
            if (ssMin <= srMin) sunProgress = 1;                  // wraps midnight
            else sunProgress = Math.min(1, Math.max(0, (nowMin - srMin) / (ssMin - srMin)));
        }

        return {
            place: loc.name,
            lat: loc.lat, lon: loc.lon,
            tz: j.timezone || '',
            tzAbbr: j.timezone_abbreviation || '',
            utcOffset: j.utc_offset_seconds,
            observed: cur.time || '',
            elevation: j.elevation,
            temp: cur.temperature_2m,
            feels: cur.apparent_temperature,
            humidity: cur.relative_humidity_2m,
            dew: cur.dew_point_2m,
            wind: cur.wind_speed_10m,
            windDirDeg: cur.wind_direction_10m,
            windDir: dirCard(cur.wind_direction_10m),
            windGust: cur.wind_gusts_10m,
            pressure: cur.pressure_msl,
            cloudCover: cur.cloud_cover,
            uv: uvNow,
            precipNow: cur.precipitation,
            isDay: cur.is_day,
            code: cur.weather_code,
            hi: today.hi != null ? today.hi : cur.temperature_2m,
            lo: today.lo != null ? today.lo : cur.temperature_2m,
            feelsHi: today.feelsHi != null ? today.feelsHi : cur.apparent_temperature,
            feelsLo: today.feelsLo != null ? today.feelsLo : cur.apparent_temperature,
            precip: today.pop || 0,
            precipSum: today.precip || 0,
            rainSum: today.rain || 0,
            uvMax: today.uv || 0,
            uvClearMax: today.uvClear || 0,
            windMax: today.windMax || 0,
            gustMax: today.gustMax || 0,
            sunrise: today.sunrise || '',
            sunset: today.sunset || '',
            dayLength: dayLen,
            sunProgress: sunProgress,
            visNow: hourly.length ? hourly[0].vis : null,
            uvNow: hourly.length ? hourly[0].uv : uvNow,
            hourly: hourly,
            daily: daily,
            fetchedAt: Date.now()
        };
    }

    function get(loc, opts) {
        opts = opts || {};
        loc = loc || getLoc();
        var key = loc.lat.toFixed(2) + ',' + loc.lon.toFixed(2);

        if (!opts.force) {
            var fresh = cacheGet(key);
            if (fresh) return Promise.resolve(fresh);
        }

        var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + loc.lat +
            '&longitude=' + loc.lon + PARAMS;
        var airUrl = 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' + loc.lat +
            '&longitude=' + loc.lon + AQI_PARAMS;

        var forecast = fetch(url).then(function (r) {
            if (!r.ok) throw new Error('wx ' + r.status);
            return r.json();
        });
        // Air quality is a bonus: a failure there must not sink the forecast.
        var air = fetch(airUrl).then(function (r) {
            if (!r.ok) throw new Error('aq ' + r.status);
            return r.json();
        }).catch(function () { return null; });

        return Promise.all([forecast, air]).then(function (both) {
            var data = parse(both[0], loc);
            data.air = parseAir(both[1]);
            cacheSet(key, data);
            return data;
        }).catch(function (err) {
            var stale = cacheAny(key);
            if (stale) { stale._stale = true; return stale; }
            throw err;
        });
    }

    window.BrowWeatherAPI = {
        // location
        getLoc: getLoc, setLoc: setLoc, setAuto: setAuto, locMode: locMode,
        locKey: locKey, ensureLoc: ensureLoc, autoLocate: autoLocate, autoLoc: autoLoc,
        getCities: getCities, setCities: setCities, addCity: addCity, removeCity: removeCity,
        // data
        get: get, summaries: summaries, searchCity: searchCity,
        // presentation
        codeInfo: codeInfo, glyphKey: glyphKey, icon: icon, ui: uiIcon, art: art,
        uvLevel: uvLevel, aqiBand: aqiBand, dirCard: dirCard,
        humidityWord: humidityWord, skyTone: skyTone, fmtClockHM: fmtClockHM,
        DEFAULT_LOC: DEFAULT_LOC
    };

    // ═════════════════════════════════════════════════════════════════════
    // Weather app
    // ═════════════════════════════════════════════════════════════════════

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function n1(v) { return (v == null || !isFinite(v)) ? '—' : (Math.round(v * 10) / 10).toFixed(1); }
    function n0(v) { return (v == null || !isFinite(v)) ? '—' : String(Math.round(v)); }
    function pct(v) { return (v == null || !isFinite(v)) ? 0 : Math.round(v); }
    function kmFromM(m) {
        if (m == null || !isFinite(m)) return null;
        return m / 1000;
    }
    /* Sky gradient per condition + day/night. */
    function skyTone(code, isDay) {
        var day = isDay !== 0;
        if (code >= 95) return ['#08091a', '#231f4d', '#4a3f92'];
        if (code >= 71 && code <= 86) return ['#0c1422', '#2b405e', '#7fa0c4'];
        if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return ['#07101c', '#1b3a56', '#3f6c93'];
        if (code === 45 || code === 48) return ['#12181f', '#39434f', '#79848f'];
        if (code === 3) return ['#101822', '#2d3b4c', '#5b6d82'];
        if (code === 2) return day ? ['#092541', '#1f6ba3', '#74b6de'] : ['#060c1a', '#141f42', '#2a3970'];
        return day ? ['#07203d', '#1173b9', '#66c4f0'] : ['#03060e', '#0c1630', '#1c2952'];
    }

    // ═════════════════════════════════════════════════════════════════════
    // Weather app — city sidebar + metrics dashboard
    // ═════════════════════════════════════════════════════════════════════

    var ORDER_KEY = 'browos_weather_cards_v1';
    /* Default order reproduces the reference: the two wide cards lead, then the
     * narrow metrics. `week` spans two rows so the columns bottom out level. */
    var CARD_ORDER = ['home', 'uv', 'sun', 'vis', 'week', 'feels', 'average',
        'rain', 'wind', 'air', 'humidity'];
    var WIDE_CARDS = { home: true, week: true };

    function readOrder() {
        try {
            var raw = localStorage.getItem(ORDER_KEY);
            if (raw) {
                var a = JSON.parse(raw);
                if (Array.isArray(a)) {
                    var ok = a.filter(function (k) { return CARD_ORDER.indexOf(k) >= 0; });
                    CARD_ORDER.forEach(function (k) { if (ok.indexOf(k) < 0) ok.push(k); });
                    if (ok.length) return ok;
                }
            }
        } catch (e) {}
        return CARD_ORDER.slice();
    }
    function writeOrder(a) {
        try { localStorage.setItem(ORDER_KEY, JSON.stringify(a)); } catch (e) {}
    }

    /* Signed temperature: "+18°" / "-2°". */
    function signed(v) {
        if (v == null || !isFinite(v)) return '\u2014';
        var n = Math.round(v);
        return (n > 0 ? '+' : '') + n + '\u00b0';
    }
    function deg(v) {
        if (v == null || !isFinite(v)) return '\u2014';
        return Math.round(v) + '\u00b0';
    }

    function mountApp(windowElement) {
        if (!windowElement) return;
        // The registry renders `.weather-window`; older builds used `.wx-app-host`.
        var host = windowElement.querySelector('.wx-app-host') ||
            windowElement.querySelector('.weather-window');
        if (!host) {
            host = document.createElement('div');
            (windowElement.querySelector('.window-content') || windowElement).appendChild(host);
        }
        host.classList.add('wx-app-host');
        if (host.dataset.mounted === 'true') return;
        host.dataset.mounted = 'true';

        var content = windowElement.querySelector('.window-content');
        if (content) { content.style.padding = '0'; content.style.overflow = 'hidden'; }

        var A = window.BrowWeatherAPI;

        var view = 'metrics';            // hourly | week | metrics
        var sel = { kind: 'here', index: -1 };
        var cities = [];                 // saved city locs
        var summary = [];                // sidebar readings, parallel to cities
        var hereSummary = null;          // sidebar reading for My Location
        var data = null;                 // full reading for the selection
        var editing = false;             // sidebar remove-mode
        var reordering = false;
        var order = readOrder();
        var timer = null;

        host.innerHTML =
            '<div class="wx-app">' +
            '  <aside class="wx-side">' +
            '    <div class="wx-side-head"><h1>Weather</h1></div>' +
            '    <div class="wx-csearch">' +
            '      <span class="wx-search-ico">' + uiIcon('search', 15) + '</span>' +
            '      <input type="search" placeholder="Search for a city or airport" spellcheck="false">' +
            '      <div class="wx-results"></div>' +
            '    </div>' +
            '    <div class="wx-citylist"></div>' +
            '    <div class="wx-side-foot">' +
            '      <button type="button" class="wx-edit">Edit</button>' +
            '      <button type="button" class="wx-gearbtn" title="Use my location">' +
                     uiIcon('locate', 15) + '</button>' +
            '    </div>' +
            '  </aside>' +
            '  <main class="wx-main">' +
            '    <div class="wx-topbar">' +
            '      <div class="wx-seg">' +
            '        <button type="button" data-view="hourly">Hourly</button>' +
            '        <button type="button" data-view="week">Week</button>' +
            '        <button type="button" data-view="metrics" class="is-active">Metrics</button>' +
            '      </div>' +
            '      <div class="wx-topright">' +
            '        <button type="button" class="wx-reorder">Change order</button>' +
            '        <button type="button" class="wx-iconbtn wx-refresh" title="Refresh">' +
                     uiIcon('refresh', 15) + '</button>' +
            '      </div>' +
            '    </div>' +
            '    <div class="wx-stage"><div class="wx-loading">Reading the sky\u2026</div></div>' +
            '  </main>' +
            '</div>';

        var listEl = host.querySelector('.wx-citylist');
        var stage = host.querySelector('.wx-stage');
        var input = host.querySelector('.wx-csearch input');
        var results = host.querySelector('.wx-results');
        var editBtn = host.querySelector('.wx-edit');
        var refreshBtn = host.querySelector('.wx-refresh');
        var reorderBtn = host.querySelector('.wx-reorder');
        var deb = null;

        // ─── selection ───────────────────────────────────────────────────
        function currentLoc() {
            if (sel.kind === 'here') return A.getLoc();
            var c = cities[sel.index];
            return c || A.getLoc();
        }
        function locLabel() {
            var l = currentLoc();
            return (l && l.name) || '';
        }

        function pickHere() {
            sel = { kind: 'here', index: -1 };
            A.setAuto();
            load(true);
        }
        function pickCity(i) {
            sel = { kind: 'city', index: i };
            var c = cities[i];
            if (c) A.setLoc({ name: c.name, lat: c.lat, lon: c.lon });
            load(true);
        }

        // ─── sidebar ─────────────────────────────────────────────────────
        function cityCard(kind, i, name, sub, s) {
            var active = sel.kind === kind && (kind === 'here' || sel.index === i);
            var temp = (s && s.temp != null) ? Math.round(s.temp) + '\u00b0' : '\u2014';
            var hi = (s && s.hi != null) ? 'H:' + Math.round(s.hi) + '\u00b0' : '';
            var lo = (s && s.lo != null) ? ' L:' + Math.round(s.lo) + '\u00b0' : '';
            var cond = s ? A.codeInfo(s.code).label : '\u2026';
            var clock = (s && s.clock) ? s.clock : '';
            var attr = kind === 'here'
                ? ' data-kind="here"'
                : ' data-kind="city" data-i="' + i + '"';
            return '<button type="button" class="wx-city' + (active ? ' is-active' : '') +
                '"' + attr + '>' +
                '<span class="wx-city-l">' +
                '<b>' + esc(name) + '</b>' +
                '<i>' + esc(sub) + '</i>' +
                '<em>' + esc(cond) + '</em>' +
                '</span>' +
                '<span class="wx-city-r">' +
                '<b>' + temp + '</b>' +
                '<i>' + (clock ? esc(clock) : '') + '</i>' +
                '<em>' + esc(hi + lo) + '</em>' +
                '</span>' +
                (editing && kind === 'city'
                    ? '<span class="wx-city-x" data-rm="' + i + '" title="Remove">\u00d7</span>' : '') +
                '</button>';
        }

        function renderSidebar() {
            /* "My Location" always describes the *detected* place, even while a
             * city is pinned — the blue highlight is what tells the user which
             * one is currently in force. */
            var here = A.autoLoc();
            var pending = !here;
            var sub = pending ? 'Locating\u2026'
                : here.denied ? 'Location unavailable' : here.name;
            var html = cityCard('here', -1, 'My Location', sub, hereSummary);
            cities.forEach(function (c, i) {
                html += cityCard('city', i, c.name.split(',')[0],
                    c.name.split(',').slice(1).join(',').trim() || 'Saved city', summary[i]);
            });
            listEl.innerHTML = html;
            editBtn.textContent = editing ? 'Done' : 'Edit';
            editBtn.classList.toggle('is-on', editing);
        }

        listEl.addEventListener('click', function (e) {
            var rm = e.target.closest('[data-rm]');
            if (rm) {
                e.stopPropagation();
                var idx = Number(rm.dataset.rm);
                A.removeCity(idx);
                cities = A.getCities();
                summary = [];
                if (sel.kind === 'city' && sel.index === idx) sel = { kind: 'here', index: -1 };
                renderSidebar();
                loadSummaries();
                return;
            }
            var b = e.target.closest('.wx-city');
            if (!b) return;
            if (b.dataset.kind === 'here') pickHere();
            else pickCity(Number(b.dataset.i));
        });

        editBtn.addEventListener('click', function () {
            editing = !editing;
            renderSidebar();
        });

        // ─── search ──────────────────────────────────────────────────────
        function hideResults() { results.style.display = 'none'; }

        function showResults(html) {
            results.innerHTML = html;
            results.style.display = 'block';
        }

        function renderHits(list) {
            var html = '<button type="button" data-here="1">' +
                uiIcon('locate', 13) + '<span>Use my current location</span></button>';
            html += list.length
                ? list.map(function (g2, i) {
                    return '<button type="button" data-i="' + i + '">' +
                        uiIcon('pin', 13) + '<span>' + esc(g2.name) + '</span></button>';
                }).join('')
                : '<div class="wx-nohit">No matches</div>';
            showResults(html);
            results.querySelectorAll('button').forEach(function (b) {
                b.addEventListener('click', function () {
                    if (b.dataset.here) {
                        input.value = '';
                        hideResults();
                        pickHere();
                        return;
                    }
                    var g2 = list[Number(b.dataset.i)];
                    cities = A.addCity({ name: g2.name, lat: g2.lat, lon: g2.lon });
                    input.value = '';
                    hideResults();
                    sel = { kind: 'city', index: cities.length - 1 };
                    A.setLoc({ name: g2.name, lat: g2.lat, lon: g2.lon });
                    renderSidebar();
                    load(true);
                });
            });
        }

        input.addEventListener('keydown', function (e) {
            e.stopPropagation();
            if (e.key === 'Escape') { hideResults(); input.blur(); }
        });
        input.addEventListener('input', function () {
            clearTimeout(deb);
            var q = input.value.trim();
            if (q.length < 2) { results.innerHTML = ''; hideResults(); return; }
            deb = setTimeout(function () {
                A.searchCity(q).then(renderHits).catch(function () {
                    showResults('<div class="wx-nohit">Search needs a connection</div>');
                });
            }, 320);
        });
        input.addEventListener('focus', function () {
            if (input.value.trim().length < 2) showResults(
                '<button type="button" data-here="1">' + uiIcon('locate', 13) +
                '<span>Use my current location</span></button>' +
                '<div class="wx-nohit">Type at least two letters to search.</div>');
        });

        // ─── loading ─────────────────────────────────────────────────────
        function loadSummaries() {
            A.summaries(cities.slice()).then(function (list) {
                summary = list;
                renderSidebar();
            }).catch(function () { renderSidebar(); });

            // the "My Location" card reads the detected place, not the pin
            A.ensureLoc().then(function () {
                var a = A.autoLoc();
                return a ? A.summaries([a]) : null;
            }).then(function (l) {
                hereSummary = (l && l[0]) || null;
                renderSidebar();
            }).catch(function () {});
        }

        function load(force) {
            stage.innerHTML = '<div class="wx-loading"><span class="wx-spin">' +
                uiIcon('refresh', 18) + '</span>Reading the sky\u2026</div>';
            if (refreshBtn) refreshBtn.classList.add('is-busy');

            var loc = currentLoc();
            if (loc._pending) {
                // auto-detect has never produced a fix — resolve it first
                return A.ensureLoc().then(function (l) {
                    if (sel.kind === 'here') { load(force); }
                    else { applyLoad(l, force); }
                }).catch(function () { fail(); });
            }
            applyLoad(loc, force);
        }

        function applyLoad(loc, force) {
            A.get(loc, { force: !!force }).then(function (d) {
                if (refreshBtn) refreshBtn.classList.remove('is-busy');
                d.place = loc.name;
                data = d;
                renderMain();
            }).catch(fail);
        }

        function fail() {
            if (refreshBtn) refreshBtn.classList.remove('is-busy');
            stage.innerHTML = '<div class="wx-loading wx-error">' + uiIcon('cloud', 26) +
                '<b>Could not reach the weather service</b>' +
                '<span>Check your connection and try again.</span>' +
                '<button type="button" class="wx-retry">Try again</button></div>';
            var r = stage.querySelector('.wx-retry');
            if (r) r.addEventListener('click', function () { load(true); });
        }

        // ─── card frames ─────────────────────────────────────────────────
        function card(key, ico, title, body, opts) {
            opts = opts || {};
            var wide = WIDE_CARDS[key] ? ' wx-card-wide' : '';
            var see = opts.see
                ? '<footer class="wx-card-f"><button type="button" class="wx-see" data-see="' +
                  opts.see + '">See more</button>' + uiIcon('chev', 13) + '</footer>'
                : '';
            var grip = reordering
                ? '<span class="wx-grip"><button type="button" data-mv="-1" title="Move">\u2039</button>' +
                  '<button type="button" data-mv="1" title="Move">\u203a</button></span>'
                : '';
            return '<section class="wx-card' + wide + '" data-card="' + key + '">' +
                '<header class="wx-card-h"><span class="wx-card-ico">' + uiIcon(ico, 13) + '</span>' +
                '<h3>' + esc(title) + '</h3>' + grip + '</header>' +
                '<div class="wx-card-b">' + body + '</div>' + see +
                '</section>';
        }

        function bigValue(v, sub) {
            return '<div class="wx-big">' + esc(v) + '</div>' +
                (sub ? '<div class="wx-sub">' + esc(sub) + '</div>' : '');
        }

        // ─── individual cards ────────────────────────────────────────────
        function cardHome(d) {
            var info = A.codeInfo(d.code);
            var tone = skyTone(d.code, d.isDay !== 0);
            var hrs = (d.hourly || []).slice(0, 6).map(function (h) {
                return '<span class="wx-mini">' +
                    '<i>' + (h.isNow ? 'Now' : esc(h.t.replace(/\s+/g, ''))) + '</i>' +
                    A.art(h.code, h.isDay, 20) +
                    '<b>' + Math.round(h.temp) + '\u00b0</b>' +
                    '</span>';
            }).join('');
            var body =
                '<div class="wx-now">' +
                '<div class="wx-now-l">' +
                '<div class="wx-big">' + deg(d.temp) + '</div>' +
                '<div class="wx-sub">' + esc(info.label) + ' conditions from ' +
                    esc(String(d.observed).slice(5, 10).replace('-', '-')) + '</div>' +
                '</div>' +
                '<div class="wx-now-glyph">' + A.art(d.code, d.isDay, 56) + '</div>' +
                '</div>' +
                '<div class="wx-minis">' + hrs + '</div>';
            return '<section class="wx-card wx-card-wide wx-card-home" data-card="home" ' +
                'style="--wx-tone-a:' + tone[0] + ';--wx-tone-b:' + tone[1] + ';--wx-tone-c:' + tone[2] + '">' +
                '<header class="wx-card-h"><span class="wx-card-ico">' + uiIcon('home', 13) + '</span>' +
                '<h3>Home \u00b7 ' + esc(String(d.place).split(',')[0]) + '</h3></header>' +
                '<div class="wx-card-b">' + body + '</div>' +
                '<footer class="wx-card-f"><button type="button" class="wx-see" data-see="hourly">' +
                'See more</button>' + uiIcon('chev', 13) + '</footer>' +
                '</section>';
        }

        function cardWeek(d) {
            var days = d.daily || [];
            var lo = Math.min.apply(null, days.map(function (x) { return x.lo; }));
            var hi = Math.max.apply(null, days.map(function (x) { return x.hi; }));
            var span = (hi - lo) || 1;
            var rows = days.map(function (x) {
                var left = ((x.lo - lo) / span) * 100;
                var width = Math.max(8, ((x.hi - x.lo) / span) * 100);
                return '<div class="wx-drow">' +
                    '<span class="wx-dday">' + esc(x.day) + '</span>' +
                    '<span class="wx-dico">' + A.art(x.code, 1, 20) + '</span>' +
                    '<span class="wx-dlo">' + Math.round(x.lo) + '\u00b0</span>' +
                    '<span class="wx-dtrack"><i style="left:' + left.toFixed(1) +
                        '%;width:' + width.toFixed(1) + '%"></i></span>' +
                    '<span class="wx-dhi">' + Math.round(x.hi) + '\u00b0</span>' +
                    '</div>';
            }).join('');
            return card('week', 'clock', '7-day forecast', '<div class="wx-week">' + rows + '</div>',
                { see: 'week' });
        }

        function cardUV(d) {
            var uv = d.uvNow != null ? d.uvNow : (d.uv || 0);
            var lvl = uvLevel(uv);
            var pos = Math.min(100, (uv / 11) * 100);
            var peak = d.uvMax || 0;
            var body = bigValue(n1(uv), 'Current UV index') +
                '<div class="wx-scale">' +
                '<i class="wx-scale-bar wx-scale-uv"></i>' +
                '<b class="wx-scale-pin" style="left:' + pos.toFixed(1) + '%"></b>' +
                '</div>' +
                '<div class="wx-note"><b style="color:' + lvl.tone + '">' + esc(lvl.label) +
                '</b> \u00b7 peaks at ' + n1(peak) + ' today</div>';
            return card('uv', 'uv', 'UV index', body, { see: 'hourly' });
        }

        function cardFeels(d) {
            var diff = (d.feels != null && d.temp != null) ? (d.feels - d.temp) : 0;
            var word = Math.abs(diff) < 1.5 ? 'Similar to the actual temperature'
                : diff > 0 ? 'Feels warmer than the actual temperature'
                    : 'Feels cooler than the actual temperature';
            var body = bigValue(deg(d.feels), word) +
                '<div class="wx-note">Actual ' + deg(d.temp) + ' \u00b7 range ' +
                deg(d.feelsLo) + ' to ' + deg(d.feelsHi) + '</div>';
            return card('feels', 'thermo', 'Feels like', body);
        }

        function cardWind(d) {
            var dir = d.windDirDeg || 0;
            var body =
                '<div class="wx-windrow">' +
                '<div class="wx-compass">' +
                '<svg viewBox="0 0 100 100" aria-hidden="true">' +
                '<circle cx="50" cy="50" r="34" class="wx-cmp-ring"/>' +
                '<g class="wx-cmp-arrow" transform="rotate(' + dir + ' 50 50)">' +
                '<path d="M50 20 L56 52 L50 47 L44 52 Z"/></g>' +
                '<text x="50" y="12" class="wx-cmp-t">N</text>' +
                '<text x="90" y="54" class="wx-cmp-t">E</text>' +
                '<text x="50" y="96" class="wx-cmp-t">S</text>' +
                '<text x="10" y="54" class="wx-cmp-t">W</text>' +
                '</svg>' +
                '</div>' +
                '<div class="wx-windval"><b>' + n0(d.wind) + '</b><span>km/h</span>' +
                '<em>' + esc(d.windDir || '') + ' \u00b7 gusts ' + n0(d.windGust) + '</em></div>' +
                '</div>' +
                '<div class="wx-note">Max today ' + n0(d.windMax) + ' km/h, gusts to ' +
                n0(d.gustMax) + ' km/h</div>';
            return card('wind', 'wind', 'Wind', body);
        }

        function cardSun(d) {
            var p = d.sunProgress == null ? 0 : d.sunProgress;
            var up = d.sunProgress != null && p > 0 && p < 1;
            /* The track is a half-ellipse (cx 100, cy 56, rx 92, ry 48). The dot
             * must take BOTH coordinates from the same parameterisation — a
             * linear x paired with a sine y drifts off the curve. */
            var th = Math.PI * (1 - p);
            var dotX = 100 + 92 * Math.cos(th);
            var dotY = 56 - 48 * Math.sin(th);
            var ss = d.sunset || '\u2014';
            /* Keep this to one line — the narrow cards are ~123px of content
             * width, so "Sunset 18:23 · 92% through" wraps and costs a whole row
             * of height. The dot on the arc already conveys the progress. */
            var note = d.sunProgress == null ? 'Sun times unavailable'
                : up ? 'Sunset ' + ss + ' \u00b7 ' + Math.round(p * 100) + '%'
                    : 'Sunset ' + ss + ' \u00b7 below horizon';
            var body = bigValue(d.sunrise || '\u2014', 'Sunrise') +
                '<div class="wx-arc">' +
                '<svg viewBox="0 0 200 62" aria-hidden="true">' +
                '<path d="M8 56 A92 48 0 0 1 192 56" class="wx-arc-line"/>' +
                (up ? '<circle cx="' + dotX.toFixed(1) + '" cy="' + dotY.toFixed(1) +
                    '" r="4.4" class="wx-arc-dot"/>' : '') +
                '</svg>' +
                '</div>' +
                '<div class="wx-note">' + esc(note) + '</div>';
            return card('sun', 'sunrise', 'Sunrise', body, { see: 'week' });
        }

        function cardAverage(d) {
            // the reference's headline is the deviation from the week's mean high
            var days = d.daily || [];
            var hiAvg = days.length ? days.reduce(function (a, x) { return a + x.hi; }, 0) / days.length : d.hi;
            var loAvg = days.length ? days.reduce(function (a, x) { return a + x.lo; }, 0) / days.length : d.lo;
            /* Round once and derive the wording from that same number, so the
             * label can never contradict the figure ("-1° / right on average"). */
            var diff = Math.round(d.hi - hiAvg);
            var word = diff === 0 ? 'Right on the weekly average'
                : diff > 0 ? 'Above the weekly average high'
                    : 'Below the weekly average high';
            var body = bigValue(signed(diff), word) +
                '<div class="wx-stat"><span>Average</span><b>H:' + Math.round(hiAvg) +
                '\u00b0 L:' + Math.round(loAvg) + '\u00b0</b></div>';
            return card('average', 'chart', 'Averages', body);
        }

        function cardAir(d) {
            var air = d.air;
            if (!air || air.aqi == null) {
                return card('air', 'dots', 'Air quality',
                    bigValue('\u2014', 'No air-quality reading for this location'));
            }
            var band = aqiBand(air.aqi);
            var pos = Math.min(100, (air.aqi / 110) * 100);
            var body = '<div class="wx-bigline"><b>' + n0(air.aqi) + '</b>' +
                '<em style="color:' + band.tone + '">' + esc(band.label) + '</em></div>' +
                '<div class="wx-sub">European AQI</div>' +
                '<div class="wx-scale">' +
                '<i class="wx-scale-bar wx-scale-aqi"></i>' +
                '<b class="wx-scale-pin" style="left:' + pos.toFixed(1) + '%"></b>' +
                '</div>' +
                '<div class="wx-note">PM2.5 ' + n1(air.pm25) + ' \u00b7 PM10 ' + n1(air.pm10) +
                ' \u00b7 O\u2083 ' + n0(air.o3) + ' \u00b5g/m\u00b3</div>';
            return card('air', 'dots', 'Air quality', body, { see: 'hourly' });
        }

        function cardVis(d) {
            var km = kmFromM(d.visNow);
            var word = km == null ? 'No visibility reading'
                : km >= 20 ? 'Perfectly clear view'
                    : km >= 10 ? 'Clear view'
                        : km >= 4 ? 'Moderate visibility'
                            : km >= 1 ? 'Poor visibility' : 'Dense fog';
            return card('vis', 'eye', 'Visibility',
                bigValue(km == null ? '\u2014' : n1(km) + ' km', word));
        }

        function cardRain(d) {
            /* `rainSum` / `precipSum` / `precip` are all *today's* daily values
             * from Open-Meteo, not a rolling 24-hour window — label them as such.
             * Only `precipNow` is genuinely current. */
            var body = bigValue(n1(d.rainSum) + ' mm', 'Rain today') +
                '<div class="wx-note">' + n0(d.precip) + '% peak chance \u00b7 ' +
                n1(d.precipSum) + ' mm total precipitation today' +
                (d.precipNow > 0 ? ' \u00b7 ' + n1(d.precipNow) + ' mm falling now' : '') +
                '</div>';
            return card('rain', 'rain', 'Rainfall', body);
        }

        function cardHumidity(d) {
            var body = bigValue(n0(d.humidity) + '%', A.humidityWord(d.humidity)) +
                '<div class="wx-note">The dew point is ' + deg(d.dew) + ' right now.</div>';
            return card('humidity', 'humidity', 'Humidity', body);
        }

        function buildCard(key, d) {
            switch (key) {
                case 'home': return cardHome(d);
                case 'week': return cardWeek(d);
                case 'uv': return cardUV(d);
                case 'feels': return cardFeels(d);
                case 'wind': return cardWind(d);
                case 'sun': return cardSun(d);
                case 'average': return cardAverage(d);
                case 'air': return cardAir(d);
                case 'vis': return cardVis(d);
                case 'rain': return cardRain(d);
                case 'humidity': return cardHumidity(d);
                default: return '';
            }
        }

        // ─── the other two views ─────────────────────────────────────────
        function viewHourly(d) {
            var cells = (d.hourly || []).map(function (h) {
                var km = kmFromM(h.vis);
                return '<div class="wx-hcell' + (h.isNow ? ' is-now' : '') + '">' +
                    '<span class="wx-htime">' + (h.isNow ? 'Now' : esc(h.t)) + '</span>' +
                    '<span class="wx-hico">' + A.art(h.code, h.isDay, 24) + '</span>' +
                    '<b class="wx-htemp">' + Math.round(h.temp) + '\u00b0</b>' +
                    '<span class="wx-hpop' + (h.pop >= 30 ? ' is-wet' : '') + '">' +
                        Math.round(h.pop) + '%</span>' +
                    '<span class="wx-hmeta">UV ' + n1(h.uv) + '</span>' +
                    '<span class="wx-hmeta">' + (km == null ? '\u2014' : n1(km) + ' km') + '</span>' +
                    '</div>';
            }).join('');
            return '<div class="wx-panel"><div class="wx-panel-head"><h3>' +
                uiIcon('clock', 14) + 'Next 24 hours</h3><span>' + esc(d.place) + '</span></div>' +
                '<div class="wx-hgrid">' + cells + '</div></div>';
        }

        function viewWeek(d) {
            var days = d.daily || [];
            var lo = Math.min.apply(null, days.map(function (x) { return x.lo; }));
            var hi = Math.max.apply(null, days.map(function (x) { return x.hi; }));
            var span = (hi - lo) || 1;
            var rows = days.map(function (x) {
                var left = ((x.lo - lo) / span) * 100;
                var width = Math.max(8, ((x.hi - x.lo) / span) * 100);
                return '<div class="wx-wrow">' +
                    '<span class="wx-wday">' + esc(x.day) + ' <i>' + x.dateNum + '</i></span>' +
                    '<span class="wx-wico">' + A.art(x.code, 1, 26) + '</span>' +
                    '<span class="wx-wcond">' + esc(A.codeInfo(x.code).label) + '</span>' +
                    '<span class="wx-wlo">' + Math.round(x.lo) + '\u00b0</span>' +
                    '<span class="wx-wtrack"><i style="left:' + left.toFixed(1) +
                        '%;width:' + width.toFixed(1) + '%"></i></span>' +
                    '<span class="wx-whi">' + Math.round(x.hi) + '\u00b0</span>' +
                    '<span class="wx-wmeta">UV ' + n1(x.uv) + '</span>' +
                    '<span class="wx-wmeta">' + n1(x.precip) + ' mm</span>' +
                    '<span class="wx-wmeta">' + n0(x.windMax) + ' km/h</span>' +
                    '<span class="wx-wmeta">' + esc(x.sunrise) + ' \u00b7 ' + esc(x.sunset) + '</span>' +
                    '</div>';
            }).join('');
            return '<div class="wx-panel"><div class="wx-panel-head"><h3>' +
                uiIcon('clock', 14) + '7-day outlook</h3><span>' + Math.round(lo) +
                '\u00b0 to ' + Math.round(hi) + '\u00b0</span></div>' +
                '<div class="wx-week-detail">' + rows + '</div></div>';
        }

        function viewMetrics(d) {
            var cards = order.map(function (k) { return buildCard(k, d); }).join('');
            return '<div class="wx-grid' + (reordering ? ' is-reordering' : '') + '">' +
                cards + '</div>';
        }

        function renderMain() {
            var d = data;
            if (!d) return;
            var body = view === 'hourly' ? viewHourly(d)
                : view === 'week' ? viewWeek(d)
                    : viewMetrics(d);
            var foot = '<div class="wx-foot">' +
                uiIcon('clock', 12) + '<span>Observed ' + esc(A.fmtClockHM(d.observed)) +
                (d.tzAbbr ? ' ' + esc(d.tzAbbr) : '') + '</span>' +
                '<i></i><span>' + esc(d.place) + '</span>' +
                (d.elevation != null ? '<i></i><span>' + Math.round(d.elevation) + ' m a.s.l.</span>' : '') +
                '<i></i><span>Open-Meteo</span>' +
                (d._stale ? '<i></i><span class="wx-stale">cached</span>' : '') +
                '</div>';
            stage.innerHTML = body + foot;
            stage.scrollTop = 0;

            host.querySelectorAll('.wx-seg button').forEach(function (b) {
                b.classList.toggle('is-active', b.dataset.view === view);
            });
            host.querySelector('.wx-app').classList.toggle('is-reordering', reordering);
            reorderBtn.textContent = reordering ? 'Done' : 'Change order';
            reorderBtn.classList.toggle('is-on', reordering);
        }

        // ─── interaction wiring ──────────────────────────────────────────
        host.querySelector('.wx-seg').addEventListener('click', function (e) {
            var b = e.target.closest('button[data-view]');
            if (!b) return;
            view = b.dataset.view;
            reordering = false;
            renderMain();
        });

        stage.addEventListener('click', function (e) {
            var see = e.target.closest('[data-see]');
            if (see) { view = see.dataset.see; reordering = false; renderMain(); return; }
            var mv = e.target.closest('[data-mv]');
            if (mv) {
                var key = mv.closest('.wx-card').dataset.card;
                var i = order.indexOf(key);
                var j = i + Number(mv.dataset.mv);
                if (i >= 0 && j >= 0 && j < order.length) {
                    order.splice(i, 1);
                    order.splice(j, 0, key);
                    writeOrder(order);
                    renderMain();
                }
            }
        });

        reorderBtn.addEventListener('click', function () {
            reordering = !reordering;
            if (reordering) view = 'metrics';
            renderMain();
        });

        host.querySelector('.wx-gearbtn').addEventListener('click', function () {
            // an explicit "find me" — forces a fresh fix even in manual mode
            A.setAuto();
            sel = { kind: 'here', index: -1 };
            renderSidebar();
            stage.innerHTML = '<div class="wx-loading"><span class="wx-spin">' +
                uiIcon('locate', 18) + '</span>Locating you\u2026</div>';
            A.ensureLoc({ force: true }).then(function () {
                renderSidebar();
                loadSummaries();
                load(true);
            }).catch(function () {
                renderSidebar();
                load(true);
            });
        });

        if (refreshBtn) {
            refreshBtn.addEventListener('click', function () {
                loadSummaries();
                load(true);
            });
        }

        // ─── boot ────────────────────────────────────────────────────────
        cities = A.getCities();
        renderSidebar();
        loadSummaries();
        load(false);

        // repaint every 15 minutes; self-clears once the window is gone
        timer = setInterval(function () {
            if (!document.body.contains(host)) { clearInterval(timer); return; }
            loadSummaries();
            load(false);
        }, TTL);
    }

    window.BrowWeather = { mountApp: mountApp };
})();
