const express = require('express');
const path = require('path');
const compression = require('compression');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const app = express();
const port = process.env.PORT || 3000;

// Compress responses
app.use(compression());

// Security headers
app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});

// BrowOS is edited locally during development, so keep app files fresh across browsers.
const NO_STORE_EXTENSIONS = /\.(html|js|css|wasm)$/i;
const CACHEABLE_EXTENSIONS = /\.(svg|png|jpg|jpeg|gif|ico|woff2|woff|ttf|eot)$/i;

app.use(express.static(path.join(__dirname, '.'), {
    setHeaders: (res, filePath) => {
        const ext = path.extname(filePath);
        if (NO_STORE_EXTENSIONS.test(ext)) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        } else if (CACHEABLE_EXTENSIONS.test(ext)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
    }
}));

// Web proxy endpoint to bypass iframe restrictions
// MUST be defined BEFORE the SPA fallback
const PROXY_PREFIX = '/__proxy__/';

// Caching and connection pooling to resolve asset/css desyncs and speed up loadings
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 100, keepAliveMsecs: 2000 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 100, keepAliveMsecs: 2000 });

const proxyCache = new Map();

// Regularly clean up proxy cache to save memory
setInterval(() => {
    if (proxyCache.size > 500) {
        proxyCache.clear();
    }
}, 300000);

function proxyFetch(urlStr, maxRedirects = 5) {
    return new Promise((resolve, reject) => {
        let currentUrl;
        try {
            currentUrl = new URL(urlStr);
        } catch (e) {
            return reject(new Error('Invalid URL: ' + urlStr));
        }

        let redirects = 0;

        function doFetch(url) {
            if (redirects > maxRedirects) {
                return reject(new Error('Too many redirects'));
            }

            const client = url.protocol === 'https:' ? https : http;
            const options = {
                hostname: url.hostname,
                port: url.port || (url.protocol === 'https:' ? 443 : 80),
                path: url.pathname + url.search,
                method: 'GET',
                agent: url.protocol === 'https:' ? httpsAgent : httpAgent,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5'
                }
            };

            const req = client.request(options, (proxyRes) => {
                // Follow redirects
                if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode)) {
                    const location = proxyRes.headers.location;
                    if (location) {
                        redirects++;
                        try {
                            const nextUrl = new URL(location, url.href);
                            doFetch(nextUrl);
                        } catch (e) {
                            reject(new Error('Invalid redirect URL: ' + location));
                        }
                    } else {
                        reject(new Error('Redirect with no Location header'));
                    }
                    return;
                }

                const chunks = [];
                proxyRes.on('data', chunk => chunks.push(chunk));
                proxyRes.on('end', () => {
                    resolve({
                        status: proxyRes.statusCode,
                        headers: proxyRes.headers,
                        body: Buffer.concat(chunks),
                        finalUrl: url.href
                    });
                });
            });

            req.on('error', (err) => {
                reject(new Error(`Connection failed: ${err.message}`));
            });

            req.setTimeout(30000, () => {
                req.destroy();
                reject(new Error('Request timed out'));
            });

            req.end();
        }

        doFetch(currentUrl);
    });
}

function rewriteSrcset(srcsetVal, originalUrl, proxyBase) {
    if (!srcsetVal) return srcsetVal;
    return srcsetVal.split(',').map(part => {
        const trimmed = part.trim();
        if (!trimmed) return part;
        const subParts = trimmed.split(/\s+/);
        const urlVal = subParts[0];
        if (!urlVal) return part;
        try {
            const absolute = new URL(urlVal, originalUrl).href;
            subParts[0] = proxyBase + encodeURIComponent(absolute);
            return subParts.join(' ');
        } catch (e) {
            return part;
        }
    }).join(', ');
}

function rewriteHtml(html, originalUrl, proxyBase) {
    let result = html;

    // Bulletproof URL rewriter for HTML attributes: resolves relative URLs, srcset, and common lazyload properties
    const urlAttrs = ['src', 'href', 'action', 'data', 'poster', 'srcset', 'data-src', 'data-srcset', 'data-original', 'data-lazy', 'data-lazy-src'];
    urlAttrs.forEach(attr => {
        const regex = new RegExp(`(${attr}\\s*=\\s*)(["'])([^"']+)(["'])`, 'gi');
        result = result.replace(regex, (match, prefix, q1, urlVal, q2) => {
            const trimmed = urlVal.trim();
            if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('javascript:') || trimmed.startsWith('#') || trimmed.includes('__proxy__')) {
                return match;
            }
            if (attr === 'srcset' || attr === 'data-srcset') {
                const rewritten = rewriteSrcset(trimmed, originalUrl, proxyBase);
                return `${prefix}${q1}${rewritten}${q2}`;
            }
            try {
                const absolute = new URL(trimmed, originalUrl).href;
                return `${prefix}${q1}${proxyBase}${encodeURIComponent(absolute)}${q2}`;
            } catch (e) {
                return match;
            }
        });
    });

    // Rewrite url() in inline styles
    result = result.replace(/url\(\s*(["']?)([^"')\s]+)(["']?)\s*\)/gi, (match, q1, urlVal, q2) => {
        const trimmed = urlVal.trim();
        if (!trimmed || trimmed.startsWith('data:') || trimmed.includes('__proxy__')) {
            return match;
        }
        try {
            const absolute = new URL(trimmed, originalUrl).href;
            return `url(${q1}${proxyBase}${encodeURIComponent(absolute)}${q2})`;
        } catch (e) {
            return match;
        }
    });

    // Inject iframe-buster prevention and advanced dynamic fetch/XHR proxy rewrite
    const headClose = result.indexOf('</head>');
    if (headClose !== -1) {
        const inject = `<base href="${originalUrl}">
<script>
try {
    if (window.top !== window.self) {
        Object.defineProperty(window, 'top', { value: window.self });
    }
} catch(e) {}
(function() {
    function resolveAndProxy(url) {
        if (typeof url !== 'string') return url;
        try {
            var absolute = new URL(url, '${originalUrl}').href;
            if (absolute.indexOf('http') === 0 && absolute.indexOf('__proxy__') === -1) {
                return '${proxyBase}' + encodeURIComponent(absolute);
            }
            return absolute;
        } catch(e) {
            return url;
        }
    }

    function resolveAndProxySrcset(srcsetVal) {
        if (!srcsetVal) return srcsetVal;
        return srcsetVal.split(',').map(function(part) {
            var trimmed = part.trim();
            if (!trimmed) return part;
            var subParts = trimmed.split(/\\s+/);
            var urlVal = subParts[0];
            if (!urlVal) return part;
            try {
                var absolute = new URL(urlVal, '${originalUrl}').href;
                if (absolute.indexOf('http') === 0 && absolute.indexOf('__proxy__') === -1) {
                    subParts[0] = '${proxyBase}' + encodeURIComponent(absolute);
                }
                return subParts.join(' ');
            } catch(e) {
                return part;
            }
        }).join(', ');
    }

    var _origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
        arguments[1] = resolveAndProxy(url);
        return _origOpen.apply(this, arguments);
    };

    if (window.fetch) {
        var _origFetch = window.fetch;
        window.fetch = function(url, opts) {
            if (typeof url === 'string') {
                arguments[0] = resolveAndProxy(url);
            }
            return _origFetch.apply(this, arguments);
        };
    }

    // Rewrite dynamically created link/script/img elements and lazy-loading data attributes
    var _origSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function(name, value) {
        if (typeof value === 'string') {
            var lowerName = name.toLowerCase();
            if (lowerName === 'src' || lowerName === 'href' || lowerName === 'data-src' || lowerName === 'data-original' || lowerName === 'data-lazy' || lowerName === 'data-lazy-src') {
                value = resolveAndProxy(value);
            } else if (lowerName === 'srcset' || lowerName === 'data-srcset') {
                value = resolveAndProxySrcset(value);
            }
        }
        return _origSetAttribute.call(this, name, value);
    };

    // Rewrite img.src, script.src, link.href properties
    ['src', 'href'].forEach(function(prop) {
        var descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, prop) ||
                         Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop);
        if (descriptor && descriptor.set) {
            try {
                Object.defineProperty(HTMLImageElement.prototype, prop, {
                    set: function(val) {
                        descriptor.set.call(this, resolveAndProxy(val));
                    },
                    get: descriptor.get
                });
            } catch(e) {}
        }
    });

    // Rewrite img.srcset properties
    var imgDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'srcset');
    if (imgDescriptor && imgDescriptor.set) {
        try {
            Object.defineProperty(HTMLImageElement.prototype, 'srcset', {
                set: function(val) {
                    imgDescriptor.set.call(this, resolveAndProxySrcset(val));
                },
                get: imgDescriptor.get
            });
        } catch(e) {}
    }
})();
</script>`;
        result = result.slice(0, headClose) + inject + result.slice(headClose);
    }

    return result;
}

function rewriteCss(css, originalUrl, proxyBase) {
    let result = css;

    // Rewrite url() and imports in CSS files
    result = result.replace(/url\(\s*(["']?)([^"')\s]+)(["']?)\s*\)/gi, (match, q1, urlVal, q2) => {
        const trimmed = urlVal.trim();
        if (!trimmed || trimmed.startsWith('data:') || trimmed.includes('__proxy__')) {
            return match;
        }
        try {
            const absolute = new URL(trimmed, originalUrl).href;
            return `url(${q1}${proxyBase}${encodeURIComponent(absolute)}${q2})`;
        } catch (e) {
            return match;
        }
    });

    result = result.replace(/@import\s+(?:url\s*)?\(\s*(["']?)([^"')\s]+)(["']?)\s*\)/gi, (match, q1, urlVal, q2) => {
        const trimmed = urlVal.trim();
        if (!trimmed || trimmed.includes('__proxy__')) {
            return match;
        }
        try {
            const absolute = new URL(trimmed, originalUrl).href;
            return `@import url(${q1}${proxyBase}${encodeURIComponent(absolute)}${q2})`;
        } catch (e) {
            return match;
        }
    });

    return result;
}

app.get(`${PROXY_PREFIX}*`, async (req, res) => {
    const encodedUrl = req.path.slice(PROXY_PREFIX.length);
    const targetUrl = decodeURIComponent(encodedUrl);

    if (!targetUrl || (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://'))) {
        return res.status(400).send('Invalid URL');
    }

    // Serve from cache if available to speed up loading
    if (proxyCache.has(targetUrl)) {
        const cached = proxyCache.get(targetUrl);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        return res.status(cached.status).type(cached.contentType).send(cached.body);
    }

    console.log('[proxy] fetching:', targetUrl);

    try {
        const result = await proxyFetch(targetUrl);
        let contentType = result.headers['content-type'] || '';

        console.log('[proxy] status:', result.status, 'content-type:', contentType);

        // Strip framing-restricting headers
        delete result.headers['x-frame-options'];
        delete result.headers['content-security-policy'];
        delete result.headers['x-content-security-policy'];
        delete result.headers['x-webkit-csp'];

        // Detect content types
        const isHtml = contentType.includes('text/html') || contentType.includes('application/xhtml');
        const isCss = contentType.includes('text/css') || (targetUrl.endsWith('.css') && (contentType.includes('text') || contentType.includes('octet')));
        const isJs = contentType.includes('javascript') || contentType.includes('application/json') || targetUrl.endsWith('.js');
        const isAsset = isCss || isJs || contentType.includes('image/') || contentType.includes('font/') || contentType.includes('audio/') || contentType.includes('video/');

        let responseBody = result.body;
        let finalContentType = contentType;

        if (isHtml) {
            const html = result.body.toString('utf-8');
            responseBody = rewriteHtml(html, result.finalUrl || targetUrl, PROXY_PREFIX);
            finalContentType = 'text/html; charset=utf-8';
        } else if (isCss) {
            const css = result.body.toString('utf-8');
            responseBody = rewriteCss(css, result.finalUrl || targetUrl, PROXY_PREFIX);
            finalContentType = 'text/css; charset=utf-8';
        }

        // Cache static assets
        if (isAsset && result.status === 200) {
            proxyCache.set(targetUrl, {
                status: result.status,
                contentType: finalContentType,
                body: responseBody
            });
        }

        res.setHeader('Cache-Control', isAsset ? 'public, max-age=86400' : 'no-store');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.status(result.status).type(finalContentType).send(responseBody);
    } catch (err) {
        console.error('[proxy] error:', err.message);
        res.status(502).type('text/html').send(`
            <html><body style="background:#1a1a1a;color:#fff;font-family:system-ui;padding:40px;text-align:center;">
                <h1>Unable to load page</h1>
                <p style="color:#888;">${err.message}</p>
                <p style="color:#666;font-size:12px;margin-top:20px;">${targetUrl}</p>
            </body></html>
        `);
    }
});

// SPA fallback: serve index.html only for non-file routes
app.get('*', (req, res, next) => {
    // Never intercept proxy requests
    if (req.path.startsWith(PROXY_PREFIX)) {
        return next();
    }
    const filePath = path.join(__dirname, req.path);
    if (filePath.startsWith(__dirname) && !path.extname(req.path)) {
        res.sendFile(path.join(__dirname, 'index.html'));
    } else {
        next();
    }
});

// 404 handler
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`BrowOS is running at http://localhost:${port}`);
});
