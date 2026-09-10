/**
 * BrowOS Language Compilers & Database Runtimes
 * Provides native JavaScript runner, Pyodide Python 3 Wasm engine, and SQLite3 Wasm engine with REPLs.
 */

// ─── Reusable Interactive REPL Component ────────────────────────

class InteractiveRepl {
    constructor(term, promptStr, onLine, onExit) {
        this.term = term;
        this.promptStr = promptStr;
        this.onLine = onLine;
        this.onExit = onExit;

        this.inputBuffer = [];
        this.cursorPos = 0;
        this.history = [];
        this.historyIndex = -1;
        this.currentInput = '';
    }

    start(welcomeMessage = '') {
        if (welcomeMessage) {
            this.term.writeln(welcomeMessage);
        }
        this.term.write(this.promptStr);
    }

    setPrompt(newPrompt) {
        this.promptStr = newPrompt;
    }

    async handleInput(data) {
        // Enter: Evaluate line
        if (data === '\r') {
            this.term.write('\r\n');
            const line = this.inputBuffer.join('');
            this.inputBuffer = [];
            this.cursorPos = 0;
            this.historyIndex = -1;

            if (line.trim()) {
                this.history.push(line);
                if (this.history.length > 200) this.history.shift();
            }

            if (typeof this.onLine === 'function') {
                await this.onLine(line);
            }
            return;
        }

        // Backspace
        if (data === '\x7f' || data === '\b') {
            if (this.cursorPos > 0) {
                this.cursorPos--;
                this.inputBuffer.splice(this.cursorPos, 1);
                this.redrawLine();
            }
            return;
        }

        // Ctrl+C: Cancel line or Exit
        if (data === '\x03') {
            if (this.inputBuffer.length === 0) {
                this.term.write('^C\r\n');
                this.exit();
                return;
            }
            this.term.write('^C\r\n');
            this.inputBuffer = [];
            this.cursorPos = 0;
            this.term.write(this.promptStr);
            return;
        }

        // Ctrl+D: Exit
        if (data === '\x04') {
            if (this.inputBuffer.length === 0) {
                this.term.write('\r\n');
                this.exit();
                return;
            }
        }

        // Arrow Up: History Previous
        if (data === '\x1b[A') {
            if (this.history.length === 0) return;
            if (this.historyIndex === -1) {
                this.currentInput = this.inputBuffer.join('');
            }
            if (this.historyIndex < this.history.length - 1) {
                this.historyIndex++;
                const item = this.history[this.history.length - 1 - this.historyIndex];
                this.inputBuffer = item.split('');
                this.cursorPos = this.inputBuffer.length;
                this.redrawLine();
            }
            return;
        }

        // Arrow Down: History Next
        if (data === '\x1b[B') {
            if (this.historyIndex === -1) return;
            this.historyIndex--;
            if (this.historyIndex === -1) {
                this.inputBuffer = this.currentInput.split('');
            } else {
                const item = this.history[this.history.length - 1 - this.historyIndex];
                this.inputBuffer = item.split('');
            }
            this.cursorPos = this.inputBuffer.length;
            this.redrawLine();
            return;
        }

        // Arrow Left / Right
        if (data === '\x1b[D') {
            if (this.cursorPos > 0) {
                this.cursorPos--;
                this.term.write('\x1b[D');
            }
            return;
        }
        if (data === '\x1b[C') {
            if (this.cursorPos < this.inputBuffer.length) {
                this.cursorPos++;
                this.term.write('\x1b[C');
            }
            return;
        }

        // Printable characters
        if (data.length > 0 && [...data].every(ch => ch >= ' ' && ch <= '~')) {
            const chars = [...data];
            const isAppending = this.cursorPos === this.inputBuffer.length;
            this.inputBuffer.splice(this.cursorPos, 0, ...chars);
            this.cursorPos += chars.length;

            if (isAppending) {
                this.term.write(data);
            } else {
                this.redrawLine();
            }
        }
    }

    redrawLine() {
        const line = this.inputBuffer.join('');
        const promptLen = this.promptStr.replace(/\x1b\[[0-9;]*m/g, '').length;
        const curCol = promptLen + this.cursorPos + 1;

        // Clear line from start of prompt and rewrite
        this.term.write(`\r\x1b[K${this.promptStr}${line}`);
        this.term.write(`\x1b[${curCol}G`);
    }

    exit() {
        if (typeof this.onExit === 'function') {
            this.onExit();
        }
    }
}

// ─── 1. JavaScript / Node Runtime ───────────────────────────────

class JsRuntime {
    static formatResult(val) {
        if (val === undefined) return '\x1b[2mundefined\x1b[0m';
        if (val === null) return '\x1b[1;30mnull\x1b[0m';
        if (typeof val === 'number') return `\x1b[36m${val}\x1b[0m`;
        if (typeof val === 'boolean') return `\x1b[33m${val}\x1b[0m`;
        if (typeof val === 'string') return `\x1b[32m'${val}'\x1b[0m`;
        if (typeof val === 'function') return `\x1b[35m[Function: ${val.name || 'anonymous'}]\x1b[0m`;
        if (Array.isArray(val)) {
            const inner = val.slice(0, 20).map(v => this.formatResult(v)).join(', ');
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

    static worker = null;
    static activeExecution = null;

    static getWorker() {
        if (this.worker) return this.worker;
        if (typeof Worker === 'undefined') return null;

        try {
            const worker = new Worker('js/cli/node_worker.js');

            worker.onmessage = (e) => {
                const { type, text, result, error, path, content } = e.data;

                if (type === 'stdout') {
                    if (this.activeExecution && this.activeExecution.stdout) {
                        this.activeExecution.stdout.write(text);
                    }
                } else if (type === 'stderr') {
                    if (this.activeExecution && this.activeExecution.stderr) {
                        this.activeExecution.stderr.write(text);
                    }
                } else if (type === 'fs_write') {
                    if (typeof window !== 'undefined' && window.filesystem) {
                        window.filesystem.createFile(path, content).catch(() => {});
                    }
                } else if (type === 'done') {
                    if (this.activeExecution && this.activeExecution.resolve) {
                        this.activeExecution.resolve({ ok: true, result });
                        this.activeExecution = null;
                    }
                } else if (type === 'error') {
                    if (this.activeExecution && this.activeExecution.stderr) {
                        this.activeExecution.stderr.write(`\x1b[31m${error}\x1b[0m\n`);
                    }
                    if (this.activeExecution && this.activeExecution.resolve) {
                        this.activeExecution.resolve({ ok: false, error });
                        this.activeExecution = null;
                    }
                }
            };

            worker.onerror = (err) => {
                if (this.activeExecution) {
                    if (this.activeExecution.stderr) {
                        this.activeExecution.stderr.write(`\x1b[31mNode Worker Error: ${err.message || 'Terminated'}\x1b[0m\n`);
                    }
                    if (this.activeExecution.resolve) {
                        this.activeExecution.resolve({ ok: false, error: err.message });
                    }
                    this.activeExecution = null;
                }
            };

            this.worker = worker;
            return worker;
        } catch (e) {
            console.warn('Failed to start Node Web Worker, using direct execution:', e);
            return null;
        }
    }

    static terminate() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        if (this.activeExecution) {
            if (this.activeExecution.stderr) {
                this.activeExecution.stderr.write('\x1b[33mProcess terminated by user.\x1b[0m\n');
            }
            if (this.activeExecution.resolve) {
                this.activeExecution.resolve({ ok: false, error: 'SIGINT' });
            }
            this.activeExecution = null;
        }
    }

    static async executeCode(code, stdout, stderr, env) {
        const worker = this.getWorker();

        // Collect directory files to sync
        const files = {};
        const fs = typeof window !== 'undefined' ? window.filesystem : null;
        if (fs && fs.isReady()) {
            try {
                const list = await fs.list(env ? env.getCwd() : '/');
                if (list) {
                    for (let entry of list) {
                        if (entry.kind === 'file' && (!entry.size || entry.size < 500000)) {
                            const p = env ? env.resolvePath(entry.name) : entry.name;
                            const content = await fs.readFile(p);
                            if (content !== null) files[entry.name] = content;
                        }
                    }
                }
            } catch (e) {}
        }

        if (worker) {
            return new Promise((resolve, reject) => {
                this.activeExecution = { resolve, reject, stdout, stderr };
                worker.postMessage({
                    action: 'run',
                    code,
                    files,
                    env: env ? env.getAll() : {},
                    cwd: env ? env.getCwd() : '/'
                });
            });
        }

        // Direct in-thread execution fallback (for Node tests)
        const customConsole = {
            log: (...args) => stdout.write(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n'),
            error: (...args) => stderr.write(`\x1b[31m${args.map(a => String(a)).join(' ')}\x1b[0m\n`),
            warn: (...args) => stdout.write(`\x1b[33m${args.map(a => String(a)).join(' ')}\x1b[0m\n`),
            info: (...args) => stdout.write(args.map(a => String(a)).join(' ') + '\n')
        };

        const fsBridge = {
            readFile: async (p) => fs ? fs.readFile(env ? env.resolvePath(p) : p) : null,
            createFile: async (p, c) => fs ? fs.createFile(env ? env.resolvePath(p) : p, c) : false,
            list: async (p) => fs ? fs.list(env ? env.resolvePath(p) : p) : [],
            delete: async (p) => fs ? fs.delete(env ? env.resolvePath(p) : p) : false,
            exists: async (p) => {
                if (!fs) return false;
                if (typeof fs.exists === 'function') return await fs.exists(env ? env.resolvePath(p) : p);
                const m = await (fs.stat || fs.getMetadata).call(fs, env ? env.resolvePath(p) : p);
                return m !== null;
            },
            stat: async (p) => {
                if (!fs) return null;
                const fn = fs.stat || fs.getMetadata;
                return fn ? await fn.call(fs, env ? env.resolvePath(p) : p) : null;
            }
        };

        try {
            const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
            const fn = new AsyncFunction('console', 'fs', 'env', 'process', `
                "use strict";
                ${code.includes('return ') ? code : 'return (' + code + ')'};
            `);
            const mockProcess = {
                env: env ? env.getAll() : {},
                cwd: () => env ? env.getCwd() : '/',
                version: 'v20.10.0-browos'
            };
            const result = await fn(customConsole, fsBridge, env, mockProcess);
            return { ok: true, result: JsRuntime.formatResult(result) };
        } catch (e) {
            try {
                const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
                const fn = new AsyncFunction('console', 'fs', 'env', 'process', `
                    "use strict";
                    ${code}
                `);
                const mockProcess = {
                    env: env ? env.getAll() : {},
                    cwd: () => env ? env.getCwd() : '/',
                    version: 'v20.10.0-browos'
                };
                const result = await fn(customConsole, fsBridge, env, mockProcess);
                return { ok: true, result: JsRuntime.formatResult(result) };
            } catch (err) {
                stderr.write(`\x1b[31mUncaught ${err.name}: ${err.message}\x1b[0m\n`);
                return { ok: false, error: err };
            }
        }
    }

    static startRepl(term, env, onExit) {
        const prompt = '\x1b[1;32m>\x1b[0m ';
        const repl = new InteractiveRepl(term, prompt, async (line) => {
            const trimmed = line.trim();
            if (!trimmed) {
                term.write(prompt);
                return;
            }

            if (trimmed === '.exit' || trimmed === 'exit()' || trimmed === 'process.exit()') {
                repl.exit();
                return;
            }

            if (trimmed === '.help') {
                term.writeln('BrowOS Node.js / JavaScript REPL');
                term.writeln('  .exit        Exit the REPL');
                term.writeln('  .help        Show this help');
                term.writeln('  fs           Filesystem API (fs.readFile, fs.createFile, fs.list)');
                term.write(prompt);
                return;
            }

            const stdout = { write: (t) => term.write(t) };
            const stderr = { write: (t) => term.write(t) };

            const res = await JsRuntime.executeCode(trimmed, stdout, stderr, env);
            if (res.ok && res.result !== undefined) {
                term.writeln(JsRuntime.formatResult(res.result));
            }
            term.write(prompt);
        }, onExit);

        repl.start('\x1b[1;36mWelcome to Node.js v20.10.0 (BrowOS Native Engine)\x1b[0m\r\nType ".help" for more information, ".exit" to exit.\r\n');
        return repl;
    }
}

// ─── 2. Python 3 Runtime (Pyodide Wasm) ──────────────────────────

class PythonRuntime {
    static worker = null;
    static activeExecution = null;

    static getWorker() {
        if (this.worker) return this.worker;

        if (typeof Worker === 'undefined') {
            return null; // non-browser or worker-disabled environment
        }

        try {
            const worker = new Worker('js/cli/python_worker.js');

            worker.onmessage = (e) => {
                const { type, text, message, result, error } = e.data;

                if (type === 'status') {
                    if (this.activeExecution && this.activeExecution.stdout) {
                        this.activeExecution.stdout.write(text || message);
                    }
                } else if (type === 'stdout') {
                    if (this.activeExecution && this.activeExecution.stdout) {
                        this.activeExecution.stdout.write(text);
                    }
                } else if (type === 'stderr') {
                    if (this.activeExecution && this.activeExecution.stderr) {
                        this.activeExecution.stderr.write(`\x1b[31m${text}\x1b[0m`);
                    }
                } else if (type === 'done') {
                    if (this.activeExecution && this.activeExecution.resolve) {
                        this.activeExecution.resolve({ ok: true, result });
                        this.activeExecution = null;
                    }
                } else if (type === 'error') {
                    if (this.activeExecution && this.activeExecution.stderr) {
                        this.activeExecution.stderr.write(`\x1b[31m${error}\x1b[0m\n`);
                    }
                    if (this.activeExecution && this.activeExecution.resolve) {
                        this.activeExecution.resolve({ ok: false, error });
                        this.activeExecution = null;
                    }
                }
            };

            worker.onerror = (err) => {
                if (this.activeExecution) {
                    if (this.activeExecution.stderr) {
                        this.activeExecution.stderr.write(`\x1b[31mPython Worker Error: ${err.message || 'Script terminated'}\x1b[0m\n`);
                    }
                    if (this.activeExecution.resolve) {
                        this.activeExecution.resolve({ ok: false, error: err.message });
                    }
                    this.activeExecution = null;
                }
            };

            this.worker = worker;
            return worker;
        } catch (e) {
            console.warn('Failed to start Python Web Worker, falling back:', e);
            return null;
        }
    }

    static terminate() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        if (this.activeExecution) {
            if (this.activeExecution.stderr) {
                this.activeExecution.stderr.write('\x1b[33mProcess terminated by user.\x1b[0m\n');
            }
            if (this.activeExecution.resolve) {
                this.activeExecution.resolve({ ok: false, error: 'SIGINT' });
            }
            this.activeExecution = null;
        }
    }

    static async executeCode(code, stdout, stderr, env) {
        const worker = this.getWorker();

        // Collect directory files to sync to virtual filesystem
        const files = {};
        const fs = typeof window !== 'undefined' ? window.filesystem : null;
        if (fs && fs.isReady()) {
            try {
                const list = await fs.list(env ? env.getCwd() : '/');
                if (list) {
                    for (let entry of list) {
                        if (entry.kind === 'file' && (!entry.size || entry.size < 500000)) {
                            const p = env ? env.resolvePath(entry.name) : entry.name;
                            const content = await fs.readFile(p);
                            if (content !== null) files[entry.name] = content;
                        }
                    }
                }
            } catch (e) {}
        }

        if (worker) {
            return new Promise((resolve, reject) => {
                this.activeExecution = { resolve, reject, stdout, stderr };
                worker.postMessage({ action: 'run', code, files });
            });
        }

        // Fallback for non-worker environments (e.g. Node tests)
        stderr.write('python: Web Worker not supported in this environment\n');
        return { ok: false, error: 'Web Worker not supported' };
    }

    static async startRepl(term, env, onExit) {
        const prompt = '\x1b[1;33m>>>\x1b[0m ';
        const worker = this.getWorker();
        if (worker) {
            worker.postMessage({ action: 'init' });
        }

        const repl = new InteractiveRepl(term, prompt, async (line) => {
            const trimmed = line.trim();
            if (!trimmed) {
                term.write(prompt);
                return;
            }

            if (trimmed === 'exit()' || trimmed === 'quit()' || trimmed === 'exit') {
                repl.exit();
                return;
            }

            const stdout = { write: (t) => term.write(t.replace(/\n/g, '\r\n')) };
            const stderr = { write: (t) => term.write(t.replace(/\n/g, '\r\n')) };

            const res = await PythonRuntime.executeCode(line, stdout, stderr, env);
            if (res.ok && res.result !== undefined && res.result !== 'None') {
                term.writeln(res.result);
            }

            term.write(prompt);
        }, () => {
            if (onExit) onExit();
        });

        repl.start('\x1b[1;33mPython 3.11.3 (Pyodide Web Worker on BrowOS)\x1b[0m\r\nType "help", "copyright", or "license" for more info. Type exit() to exit.\r\n');
        return repl;
    }
}

// ─── 3. SQLite 3 Runtime (sql.js Wasm) ───────────────────────────

class SqliteRuntime {
    static SQL = null;
    static loadingPromise = null;

    static formatAsciiTable(columns, values) {
        if (!columns || columns.length === 0) return '';
        const colWidths = columns.map((col, idx) => {
            let max = String(col).length;
            for (let row of values) {
                const cell = row[idx] !== null && row[idx] !== undefined ? String(row[idx]) : 'NULL';
                if (cell.length > max) max = cell.length;
            }
            return max;
        });

        const separator = '+' + colWidths.map(w => '-'.repeat(w + 2)).join('+') + '\n';
        const headerRow = '|' + columns.map((col, idx) => ` \x1b[1m${String(col).padEnd(colWidths[idx], ' ')}\x1b[0m `).join('|') + '|\n';

        let out = separator + headerRow + separator;
        for (let row of values) {
            const rowStr = '|' + row.map((cell, idx) => {
                const val = cell !== null && cell !== undefined ? String(cell) : '\x1b[2mNULL\x1b[0m';
                return ` ${val.padEnd(colWidths[idx], ' ')} `;
            }).join('|') + '|\n';
            out += rowStr;
        }
        out += separator;
        return out;
    }

    static async initSqlJs(statusCallback = null) {
        if (this.SQL) return this.SQL;
        if (this.loadingPromise) return await this.loadingPromise;

        this.loadingPromise = (async () => {
            if (statusCallback) statusCallback('\x1b[36mInitializing SQLite3 Wasm...\x1b[0m\n');

            if (!window.initSqlJs) {
                await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js';
                    script.onload = resolve;
                    script.onerror = () => reject(new Error('Failed to load sql.js script from CDN'));
                    document.head.appendChild(script);
                });
            }

            const SQL = await window.initSqlJs({
                locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${file}`
            });

            this.SQL = SQL;
            if (statusCallback) statusCallback('\x1b[32mSQLite3 engine ready.\x1b[0m\n');
            return SQL;
        })();

        return await this.loadingPromise;
    }

    static async loadDatabase(dbPath, env) {
        const SQL = await this.initSqlJs();
        const fs = window.filesystem;
        let db;

        if (fs && fs.isReady()) {
            const resolved = env ? env.resolvePath(dbPath) : dbPath;
            try {
                // Try reading binary or text
                const content = await fs.readFile(resolved);
                if (content) {
                    const u8 = new TextEncoder().encode(content);
                    db = new SQL.Database(u8);
                } else {
                    db = new SQL.Database();
                }
            } catch (e) {
                db = new SQL.Database();
            }
        } else {
            db = new SQL.Database();
        }

        return db;
    }

    static async saveDatabase(db, dbPath, env) {
        const fs = window.filesystem;
        if (!fs || !fs.isReady() || !dbPath) return;

        try {
            const binaryArray = db.export();
            // Convert to string for storage
            let binaryString = '';
            const len = binaryArray.byteLength;
            for (let i = 0; i < len; i++) {
                binaryString += String.fromCharCode(binaryArray[i]);
            }
            await fs.createFile(env ? env.resolvePath(dbPath) : dbPath, binaryString);
        } catch (e) {
            console.error('Failed to save sqlite database:', e);
        }
    }

    static async executeQuery(dbPath, sqlQuery, stdout, stderr, env) {
        try {
            const SQL = await this.initSqlJs((msg) => stdout.write(msg));
            const db = await this.loadDatabase(dbPath, env);

            const res = db.exec(sqlQuery);
            if (res && res.length > 0) {
                for (let r of res) {
                    const tableStr = this.formatAsciiTable(r.columns, r.values);
                    stdout.write(tableStr);
                }
            } else {
                stdout.write('\x1b[2mQuery executed successfully (0 rows returned).\x1b[0m\n');
            }

            // Save changes back to disk
            await this.saveDatabase(db, dbPath, env);
            db.close();
            return 0;
        } catch (e) {
            stderr.write(`\x1b[31mError: ${e.message}\x1b[0m\n`);
            return 1;
        }
    }

    static async startRepl(term, env, dbPath, onExit) {
        term.write('\x1b[36mStarting SQLite3 REPL...\x1b[0m\r\n');
        let db;
        try {
            await this.initSqlJs((msg) => term.write(msg.replace(/\n/g, '\r\n')));
            db = await this.loadDatabase(dbPath, env);
        } catch (e) {
            term.writeln(`\x1b[31mFailed to load SQLite: ${e.message}\x1b[0m`);
            if (onExit) onExit();
            return null;
        }

        const prompt = '\x1b[1;36msqlite>\x1b[0m ';
        const fileName = dbPath ? dbPath.split('/').pop() : ':memory:';

        const repl = new InteractiveRepl(term, prompt, async (line) => {
            const trimmed = line.trim();
            if (!trimmed) {
                term.write(prompt);
                return;
            }

            if (trimmed === '.exit' || trimmed === '.quit') {
                await SqliteRuntime.saveDatabase(db, dbPath, env);
                db.close();
                repl.exit();
                return;
            }

            if (trimmed === '.tables') {
                try {
                    const res = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;");
                    if (res && res[0]) {
                        term.writeln(res[0].values.map(v => v[0]).join('  '));
                    } else {
                        term.writeln('\x1b[2mNo tables found.\x1b[0m');
                    }
                } catch (e) {
                    term.writeln(`\x1b[31mError: ${e.message}\x1b[0m`);
                }
                term.write(prompt);
                return;
            }

            if (trimmed.startsWith('.schema')) {
                const parts = trimmed.split(/\s+/);
                const table = parts[1];
                try {
                    const query = table 
                        ? `SELECT sql FROM sqlite_master WHERE type='table' AND name='${table}';`
                        : "SELECT sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';";
                    const res = db.exec(query);
                    if (res && res[0]) {
                        for (let row of res[0].values) {
                            term.writeln(row[0] + ';');
                        }
                    } else {
                        term.writeln('\x1b[2mNo schema found.\x1b[0m');
                    }
                } catch (e) {
                    term.writeln(`\x1b[31mError: ${e.message}\x1b[0m`);
                }
                term.write(prompt);
                return;
            }

            try {
                const res = db.exec(trimmed);
                if (res && res.length > 0) {
                    for (let r of res) {
                        const tableStr = SqliteRuntime.formatAsciiTable(r.columns, r.values);
                        term.write(tableStr.replace(/\n/g, '\r\n'));
                    }
                } else {
                    term.writeln('\x1b[2mQuery executed successfully.\x1b[0m');
                }
                await SqliteRuntime.saveDatabase(db, dbPath, env);
            } catch (err) {
                term.writeln(`\x1b[31mError: ${err.message}\x1b[0m`);
            }

            term.write(prompt);
        }, onExit);

        repl.start(`\x1b[1;36mSQLite version 3.45.0 (Wasm)\x1b[0m\r\nEnter ".help" for usage hints. Connected to ${fileName}\r\nType ".exit" to save and return to shell.\r\n`);
        return repl;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { JsRuntime, PythonRuntime, SqliteRuntime, InteractiveRepl };
}
if (typeof window !== 'undefined') {
    window.JsRuntime = JsRuntime;
    window.PythonRuntime = PythonRuntime;
    window.SqliteRuntime = SqliteRuntime;
    window.InteractiveRepl = InteractiveRepl;
}
