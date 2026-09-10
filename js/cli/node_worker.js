/**
 * BrowOS Node.js / JavaScript Web Worker
 * Runs user JavaScript and Node.js scripts in an isolated background thread.
 * Guarantees that heavy CPU loops, infinite loops, and data processing NEVER freeze BrowOS.
 */

function workerSleep(ms) {
    if (typeof SharedArrayBuffer !== 'undefined') {
        try {
            const sab = new SharedArrayBuffer(4);
            const int32 = new Int32Array(sab);
            Atomics.wait(int32, 0, 0, ms);
            return;
        } catch (e) {}
    }
    const start = performance.now();
    while (performance.now() - start < ms) {}
}

function formatResult(val) {
    if (val === undefined) return undefined;
    if (val === null) return '\x1b[1;30mnull\x1b[0m';
    if (typeof val === 'number') return `\x1b[36m${val}\x1b[0m`;
    if (typeof val === 'boolean') return `\x1b[33m${val}\x1b[0m`;
    if (typeof val === 'string') return `\x1b[32m'${val}'\x1b[0m`;
    if (typeof val === 'function') return `\x1b[35m[Function: ${val.name || 'anonymous'}]\x1b[0m`;
    if (Array.isArray(val)) {
        const inner = val.slice(0, 20).map(v => formatResult(v)).join(', ');
        return `[ ${inner}${val.length > 20 ? ', ...' : ''} ]`;
    }
    if (typeof val === 'object') {
        try {
            return JSON.stringify(val, null, 2);
        } catch (e) {
            return String(val);
        }
    }
    return String(val);
}

self.onmessage = async (e) => {
    const { action, id, code, files, env, cwd } = e.data;

    if (action === 'run') {
        const customConsole = {
            log: (...args) => {
                const text = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n';
                self.postMessage({ type: 'stdout', text });
            },
            error: (...args) => {
                const text = `\x1b[31m${args.map(a => String(a)).join(' ')}\x1b[0m\n`;
                self.postMessage({ type: 'stderr', text });
            },
            warn: (...args) => {
                const text = `\x1b[33m${args.map(a => String(a)).join(' ')}\x1b[0m\n`;
                self.postMessage({ type: 'stdout', text });
            },
            info: (...args) => {
                const text = args.map(a => String(a)).join(' ') + '\n';
                self.postMessage({ type: 'stdout', text });
            }
        };

        const vfs = files || {};

        const fsBridge = {
            readFile: async (p) => {
                const name = p.split('/').pop();
                return vfs[name] !== undefined ? vfs[name] : null;
            },
            createFile: async (p, content) => {
                const name = p.split('/').pop();
                vfs[name] = content;
                self.postMessage({ type: 'fs_write', path: p, content });
                return true;
            },
            list: async () => Object.keys(vfs).map(k => ({ name: k, kind: 'file' })),
            exists: async (p) => {
                const name = p.split('/').pop();
                return vfs[name] !== undefined;
            }
        };

        const mockProcess = {
            env: env || {},
            cwd: () => cwd || '/',
            version: 'v20.10.0-browos',
            exit: (code = 0) => {
                self.postMessage({ type: 'done', id, result: undefined });
            }
        };

        try {
            const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
            let result;

            try {
                // Try evaluating as expression first
                const fn = new AsyncFunction('console', 'fs', 'env', 'process', 'sleep', `
                    "use strict";
                    ${code.includes('return ') ? code : 'return (' + code + ')'};
                `);
                result = await fn(customConsole, fsBridge, env, mockProcess, workerSleep);
            } catch (syntaxOrExprErr) {
                // Execute as sequential statements
                const fn = new AsyncFunction('console', 'fs', 'env', 'process', 'sleep', `
                    "use strict";
                    ${code}
                `);
                result = await fn(customConsole, fsBridge, env, mockProcess, workerSleep);
            }

            self.postMessage({
                type: 'done',
                id,
                result: formatResult(result)
            });
        } catch (err) {
            self.postMessage({
                type: 'error',
                id,
                error: `Uncaught ${err.name}: ${err.message}`
            });
        }
    }
};
