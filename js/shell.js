import init, { WasmShell } from '../assets/wasm/browos_terminal.js';

class BrowShell {
    constructor() {
        this.term = null;
        this.windowObj = null;
        this.wasmShell = null;
        this.wasmReady = false;
        this.inputBuffer = [];
        this.isProcessing = false;
        this.commandHistory = JSON.parse(localStorage.getItem('browos_terminal_history') || '[]');
        this.historyIndex = -1;
        this.currentInput = '';
        this.cursorPos = 0;
        this.lastPrompt = '';
        this.fitAddon = null;
        this._fitFrame = null;
        this._terminalElement = null;
        
        this.setupFsBridge();
        this.setupHttpBridge();
        this.initWasm();
    }

    saveHistory() {
        localStorage.setItem('browos_terminal_history', JSON.stringify(this.commandHistory));
    }

    setupFsBridge() {
        // Expose filesystem functions for Wasm to call
        window.browos_fs_list = async (path) => {
            if (!window.filesystem || typeof window.filesystem.list !== 'function') {
                throw new Error('Filesystem not available');
            }
            const entries = await window.filesystem.list(path);
            if (!entries) throw new Error('Path not found');
            return entries.map(e => ({ name: e.name, kind: e.kind === 'directory' ? 'directory' : 'file' }));
        };

        window.browos_fs_read = async (path) => {
            if (!window.filesystem || typeof window.filesystem.readFile !== 'function') {
                throw new Error('Filesystem not available');
            }
            const content = await window.filesystem.readFile(path);
            if (content === null) throw new Error('File not found');
            return content;
        };

        window.browos_fs_mkdir = async (path) => {
            if (!window.filesystem || typeof window.filesystem.createDirectory !== 'function') {
                throw new Error('Filesystem not available');
            }
            const success = await window.filesystem.createDirectory(path);
            if (!success) throw new Error('Failed to create directory');
            return true;
        };

        window.browos_fs_mkdir_p = async (path) => {
            if (!window.filesystem || typeof window.filesystem.ensureDirectory !== 'function') {
                throw new Error('Filesystem not available');
            }
            const success = await window.filesystem.ensureDirectory(path);
            if (!success) throw new Error('Failed to create directory structure');
            return true;
        };

        window.browos_fs_rm = async (path) => {
            if (!window.filesystem || typeof window.filesystem.delete !== 'function') {
                throw new Error('Filesystem not available');
            }
            const success = await window.filesystem.delete(path);
            if (!success) throw new Error('Failed to remove');
            return true;
        };

        window.browos_fs_write = async (path, content) => {
            if (!window.filesystem || typeof window.filesystem.createFile !== 'function') {
                throw new Error('Filesystem not available');
            }
            const success = await window.filesystem.createFile(path, content);
            if (!success) throw new Error('Failed to write file');
            return true;
        };

        window.browos_open_note = async (path) => {
            const binaryExtensions = ['.exe', '.dll', '.so', '.dylib', '.bin', '.dat', '.db', '.sqlite', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.ico', '.mp3', '.wav', '.ogg', '.flac', '.mp4', '.webm', '.mov', '.avi', '.mkv', '.zip', '.rar', '.7z', '.tar', '.gz', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'];
            const ext = '.' + path.split('.').pop().toLowerCase();
            
            if (binaryExtensions.includes(ext)) {
                return { ok: false, error: `Cannot open binary file '${path}' in Brow Note` };
            }

            const content = await window.filesystem.readFile(path);
            if (content === null) {
                return { ok: false, error: `File not found: ${path}` };
            }

            if (window.windowManager) {
                window.windowManager.openFileInBrowNote(path);
                return { ok: true, path };
            }
            return { ok: false, error: 'Window manager not available' };
        };

        window.browos_fs_move = async (src, dest) => {
            if (!window.filesystem || typeof window.filesystem.move !== 'function') {
                throw new Error('Filesystem not available');
            }
            const result = await window.filesystem.move(src, dest);
            if (!result.ok) throw new Error(result.error);
            return true;
        };

        window.browos_fs_copy = async (src, dest) => {
            if (!window.filesystem || typeof window.filesystem.copy !== 'function') {
                throw new Error('Filesystem not available');
            }
            const result = await window.filesystem.copy(src, dest);
            if (!result.ok) throw new Error(result.error);
            return true;
        };
    }

    setupHttpBridge() {
        window.browos_http_fetch = async (url, proxy) => {
            const fetchUrl = proxy ? `${proxy}${encodeURIComponent(url)}` : url;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 30000);

            try {
                const response = await fetch(fetchUrl, {
                    signal: controller.signal,
                    headers: { 'Accept': '*/*' }
                });
                clearTimeout(timeout);

                if (!response.ok) {
                    return { ok: false, error: `HTTP ${response.status}: ${response.statusText}` };
                }

                const contentType = response.headers.get('content-type') || 'application/octet-stream';
                const contentLength = response.headers.get('content-length') || 'unknown';
                const blob = await response.blob();
                const buffer = await blob.arrayBuffer();
                const bytes = new Uint8Array(buffer);
                
                let binary = '';
                for (let i = 0; i < bytes.length; i++) {
                    binary += String.fromCharCode(bytes[i]);
                }
                const base64 = btoa(binary);

                return {
                    ok: true,
                    status: response.status,
                    contentType,
                    contentLength: parseInt(contentLength) || bytes.length,
                    data: base64
                };
            } catch (err) {
                clearTimeout(timeout);
                return { ok: false, error: `Failed to fetch: ${err.message}` };
            }
        };
    }

    async initWasm() {
        try {
            await init();
            this.wasmShell = new WasmShell();
            this.wasmReady = true;
        } catch (e) {
            console.error("Wasm init failed:", e);
        }
    }

    async open(container, windowObj) {
        this.windowObj = windowObj;
        const windowElement = windowObj.element;
        if (windowElement) windowElement.classList.add('terminal-window');
        
        const contentArea = container.closest('.window-content');
        if (contentArea) {
            contentArea.style.cssText = 'padding:0!important;margin:0!important;overflow:hidden!important;background:#000!important;display:flex!important;flex-direction:column!important;min-height:0!important;';
        }
        container.style.cssText = 'height:100%!important;width:100%!important;flex:1 1 auto!important;min-height:0!important;background:#000!important;padding:0!important;margin:0!important;position:relative!important;overflow:hidden!important;';
        container.innerHTML = '<div id="xterm-container" style="position:absolute;inset:0;width:100%;height:100%;"></div>';

        await this.waitForStableLayout(windowElement);
        
        this.term = new Terminal({
            cursorBlink: true,
            theme: {
                background: '#000000',
                foreground: '#ffffff',
                cursor: '#ffffff',
                selectionBackground: '#ffffff40',
                black: '#000000',
                red: '#ff5555',
                green: '#50fa7b',
                yellow: '#f1fa8c',
                blue: '#8be9fd',
                magenta: '#ff79c6',
                cyan: '#8be9fd',
                white: '#ffffff'
            },
            fontSize: 14,
            fontFamily: '"Ubuntu Mono", "Cascadia Mono", Consolas, "Lucida Console", "SF Mono", "DejaVu Sans Mono", monospace',
            fontWeight: '400',
            fontWeightBold: '700',
            letterSpacing: 0,
            lineHeight: 1.15,
            convertEol: true,
            scrollback: 1000,
            allowProposedApi: true,
            rendererType: 'dom'
        });

        if (window.FitAddon && window.FitAddon.FitAddon) {
            this.fitAddon = new window.FitAddon.FitAddon();
            this.term.loadAddon(this.fitAddon);
        }
        
        // Wait for font to load before opening terminal
        await document.fonts.ready;
        const terminalElement = container.querySelector('#xterm-container');
        this._terminalElement = terminalElement;
        this.term.open(terminalElement);
        
        this.scheduleFit();
        setTimeout(() => this.scheduleFit(), 50);

        // Auto-resize terminal when container size changes (maximize, drag, etc.)
        const resizeObserver = new ResizeObserver(() => this.scheduleFit());
        resizeObserver.observe(terminalElement);
        resizeObserver.observe(container);
        if (contentArea) resizeObserver.observe(contentArea);
        if (windowElement) resizeObserver.observe(windowElement);
        this._resizeObserver = resizeObserver;

        this.term.writeln('\x1b[32mWelcome to BrowShell Terminal v4.0 (Wasm Native)\x1b[0m');
        this.term.writeln('Type \x1b[1mhelp\x1b[0m for available commands.\n');
        
        this.updatePrompt();

        this.setupClipboard();
        
        this.term.onData(async (data) => {
            if (this.isProcessing) return;
            
            if (data === '\r') {
                this.term.write('\r\n');
                const line = this.inputBuffer.join('');
                if (line.trim()) {
                    this.commandHistory.push(line);
                    this.historyIndex = -1;
                    this.saveHistory();
                }
                this.inputBuffer = [];
                this.currentInput = '';
                this.cursorPos = 0;
                if (line.trim()) {
                    this.isProcessing = true;
                    const isGetnet = line.trim().startsWith('getnet ');
                    let spinnerInterval = null;
                    if (isGetnet) {
                        const spinnerChars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
                        let si = 0;
                        this.term.write(`\x1b[36mDownloading...\x1b[0m `);
                        spinnerInterval = setInterval(() => {
                            this.term.write(`\b${spinnerChars[si % spinnerChars.length]}`);
                            si++;
                        }, 80);
                    }
                    
                    const cwd = this.wasmShell ? this.wasmShell.get_cwd() : '/';
                    const output = await preprocessAndExecute(line, cwd, this.wasmShell);

                    if (spinnerInterval) {
                        clearInterval(spinnerInterval);
                        const spinnerLen = 'Downloading... ⠏'.length;
                        for (let i = 0; i < spinnerLen; i++) {
                            this.term.write('\b \b');
                        }
                    }
                    if (output) {
                        this.term.writeln(output);
                    }
                    this.isProcessing = false;
                }
                this.updatePrompt();
            } else if (data === '\u007F') {
                if (this.cursorPos > 0) {
                    this.cursorPos--;
                    this.inputBuffer.splice(this.cursorPos, 1);
                    this.redrawInputLine();
                }
            } else if (data === '\u001b[A') {
                if (this.commandHistory.length === 0) return;
                if (this.historyIndex === -1) {
                    this.currentInput = this.inputBuffer.join('');
                }
                if (this.historyIndex < this.commandHistory.length - 1) {
                    this.historyIndex++;
                    this.replaceInputLine(this.commandHistory[this.commandHistory.length - 1 - this.historyIndex]);
                }
            } else if (data === '\u001b[B') {
                if (this.historyIndex === -1) return;
                this.historyIndex--;
                if (this.historyIndex === -1) {
                    this.replaceInputLine(this.currentInput);
                } else {
                    this.replaceInputLine(this.commandHistory[this.commandHistory.length - 1 - this.historyIndex]);
                }
            } else if (data === '\u0003') {
                this.term.write('^C\r\n');
                this.inputBuffer = [];
                this.currentInput = '';
                this.cursorPos = 0;
                this.historyIndex = -1;
                this.updatePrompt();
            } else if (data === '\u000c') {
                this.term.clear();
                this.updatePrompt();
                this.redrawInputLine();
            } else if (data === '\u0015') {
                this.inputBuffer = [];
                this.cursorPos = 0;
                this.redrawInputLine();
            } else if (data === '\u0017') {
                while (this.cursorPos > 0 && this.inputBuffer[this.cursorPos - 1] === ' ') {
                    this.cursorPos--;
                    this.inputBuffer.splice(this.cursorPos, 1);
                }
                while (this.cursorPos > 0 && this.inputBuffer[this.cursorPos - 1] !== ' ') {
                    this.cursorPos--;
                    this.inputBuffer.splice(this.cursorPos, 1);
                }
                this.redrawInputLine();
            } else if (data === '\u001b[D') {
                if (this.cursorPos > 0) {
                    this.cursorPos--;
                    this.term.write('\x1b[D');
                }
            } else if (data === '\u001b[C') {
                if (this.cursorPos < this.inputBuffer.length) {
                    this.cursorPos++;
                    this.term.write('\x1b[C');
                }
            } else if (data === '\u001b[H' || data === '\u001bOH') {
                this.cursorPos = 0;
                this.redrawInputLine();
            } else if (data === '\u001b[F' || data === '\u001bOF') {
                this.cursorPos = this.inputBuffer.length;
                this.redrawInputLine();
            } else if (data === '\u001b[3~') {
                if (this.cursorPos < this.inputBuffer.length) {
                    this.inputBuffer.splice(this.cursorPos, 1);
                    this.redrawInputLine();
                }
            } else if (this.isPrintableInput(data)) {
                this.insertPrintableInput(data);
            }
        });
        
        container.addEventListener('click', () => this.term.focus());
        this.term.focus();

        this.term.onResize((size) => {
            this.redrawInputLine();
        });
    }

    setupClipboard() {
        let pastePending = false;

        this.term.attachCustomKeyEventHandler((e) => {
            if (e.type === 'keydown') {
                const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
                const mod = isMac ? e.metaKey : e.ctrlKey;

                if (mod && e.key === 'v') {
                    e.preventDefault();
                    if (!pastePending) {
                        pastePending = true;
                        navigator.clipboard.readText().then((text) => {
                            if (text && !this.isProcessing) {
                                const lines = text.split(/\r?\n/);
                                for (let i = 0; i < lines.length; i++) {
                                    for (const ch of lines[i]) {
                                        if (ch >= ' ' && ch <= '~') {
                                            this.inputBuffer.splice(this.cursorPos, 0, ch);
                                            this.cursorPos++;
                                        }
                                    }
                                    if (i < lines.length - 1) {
                                        const line = this.inputBuffer.join('');
                                        if (line.trim()) {
                                            this.commandHistory.push(line);
                                            this.historyIndex = -1;
                                            this.saveHistory();
                                        }
                                        this.inputBuffer = [];
                                        this.cursorPos = 0;
                                        this.term.writeln(line);
                                        this.updatePrompt();
                                    }
                                }
                                this.redrawInputLine();
                            }
                            pastePending = false;
                        }).catch(() => { pastePending = false; });
                    }
                    return false;
                }

                if (e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
                    const selection = this.term.getSelection();
                    if (selection) {
                        navigator.clipboard.writeText(selection).catch(() => {});
                    }
                    return false;
                }
            }
            return true;
        });

        document.addEventListener('paste', (e) => {
            if (!this.term || !this.term.element) return;
            const active = document.activeElement;
            if (active && (active === this.term.element || this.term.element.contains(active))) {
                e.preventDefault();
                const text = e.clipboardData.getData('text');
                if (text && !this.isProcessing) {
                    const lines = text.split(/\r?\n/);
                    for (let i = 0; i < lines.length; i++) {
                        for (const ch of lines[i]) {
                            if (ch >= ' ' && ch <= '~') {
                                this.inputBuffer.splice(this.cursorPos, 0, ch);
                                this.cursorPos++;
                            }
                        }
                        if (i < lines.length - 1) {
                            const line = this.inputBuffer.join('');
                            if (line.trim()) {
                                this.commandHistory.push(line);
                                this.historyIndex = -1;
                                this.saveHistory();
                            }
                            this.inputBuffer = [];
                            this.cursorPos = 0;
                            this.term.writeln(line);
                            this.updatePrompt();
                        }
                    }
                    this.redrawInputLine();
                }
            }
        });
    }

    scheduleFit() {
        if (this._fitFrame) {
            cancelAnimationFrame(this._fitFrame);
        }

        this._fitFrame = requestAnimationFrame(() => {
            this._fitFrame = null;
            this.fitTerminal();
        });
    }

    fitTerminal() {
        const terminalElement = this._terminalElement;
        if (!this.term || !this.term.element || !terminalElement) return;

        if (this.fitAddon) {
            try {
                this.fitAddon.fit();
                this.term.refresh(0, this.term.rows - 1);
                return;
            } catch (err) {
                console.warn('xterm fit addon failed, using manual fit:', err);
            }
        }

        const dims = this.term._core?._renderService?.dimensions;
        const cellWidth = dims?.css?.cell?.width || dims?.actualCellWidth;
        const cellHeight = dims?.css?.cell?.height || dims?.actualCellHeight;
        if (!cellWidth || !cellHeight) return;

        const terminalStyle = window.getComputedStyle(this.term.element);
        const paddingX = parseFloat(terminalStyle.paddingLeft) + parseFloat(terminalStyle.paddingRight);
        const paddingY = parseFloat(terminalStyle.paddingTop) + parseFloat(terminalStyle.paddingBottom);
        const availableWidth = Math.max(0, terminalElement.clientWidth - paddingX);
        const availableHeight = Math.max(0, terminalElement.clientHeight - paddingY);
        const newCols = Math.max(2, Math.floor(availableWidth / cellWidth));
        const newRows = Math.max(1, Math.floor(availableHeight / cellHeight));

        if (newCols !== this.term.cols || newRows !== this.term.rows) {
            this.term.resize(newCols, newRows);
            this.term.refresh(0, this.term.rows - 1);
        }
    }

    waitForStableLayout(windowElement) {
        return new Promise((resolve) => {
            if (!windowElement || !windowElement.classList.contains('window-opening')) {
                requestAnimationFrame(() => requestAnimationFrame(resolve));
                return;
            }

            const finish = () => {
                requestAnimationFrame(() => requestAnimationFrame(resolve));
            };

            windowElement.addEventListener('animationend', finish, { once: true });
            setTimeout(finish, 350);
        });
    }

    updatePrompt() {
        const cwd = this.wasmShell ? this.wasmShell.get_cwd() : '/';
        const prompt = `\x1b[34muser@browos\x1b[0m:\x1b[36m${cwd}\x1b[0m$ `;
        this.lastPrompt = prompt;
        this.term.write(prompt);
    }

    replaceInputLine(newText) {
        this.inputBuffer = newText.split('');
        this.cursorPos = this.inputBuffer.length;
        this.redrawInputLine();
    }

    isPrintableInput(data) {
        return data.length > 0 && [...data].every((ch) => ch >= ' ' && ch <= '~');
    }

    insertPrintableInput(data) {
        const chars = [...data];
        const isAppending = this.cursorPos === this.inputBuffer.length;

        this.inputBuffer.splice(this.cursorPos, 0, ...chars);
        this.cursorPos += chars.length;

        if (isAppending) {
            this.term.write(data);
            return;
        }

        this.redrawInputLine();
    }

    redrawInputLine() {
        const line = this.inputBuffer.join('');
        const cols = this.term.cols || 80;
        const promptLen = this._stripAnsi(this.lastPrompt).length;
        const inputLen = line.length;
        const totalLen = promptLen + inputLen;

        const cursorRow = Math.floor((promptLen + this.cursorPos) / cols);
        const endRow = Math.max(0, Math.ceil(Math.max(totalLen, promptLen) / cols) - 1);
        const targetRow = Math.floor((promptLen + this.cursorPos) / cols);
        const targetCol = (promptLen + this.cursorPos) % cols;

        let redraw = '\x1b[?25l\r';
        for (let r = 0; r < cursorRow; r++) {
            redraw += '\x1b[A';
        }
        redraw += '\x1b[J';

        redraw += this.lastPrompt;
        redraw += line;

        for (let r = 0; r < endRow - targetRow; r++) {
            redraw += '\x1b[A';
        }
        redraw += '\r';
        for (let c = 0; c < targetCol; c++) {
            redraw += '\x1b[C';
        }
        redraw += '\x1b[?25h';
        this.term.write(redraw);
    }

    _stripAnsi(str) {
        return str.replace(/\x1b\[[0-9;]*m/g, '');
    }
}

function parseArgs(input) {
    let args = [];
    let currentArg = '';
    let inQuotes = false;
    let quoteChar = ' ';

    for (let i = 0; i < input.length; i++) {
        let c = input[i];
        if (inQuotes) {
            if (c === quoteChar) {
                inQuotes = false;
            } else {
                currentArg += c;
            }
        } else {
            if (c === '"' || c === "'") {
                inQuotes = true;
                quoteChar = c;
            } else if (/\s/.test(c)) {
                if (currentArg.length > 0) {
                    args.push(currentArg);
                    currentArg = '';
                }
            } else {
                currentArg += c;
            }
        }
    }
    if (currentArg.length > 0) {
        args.push(currentArg);
    }
    return args;
}

async function execGetnet(line, cwd) {
    const parts = parseArgs(line.trim());
    const args = parts.slice(1);
    
    if (args.length === 0) {
        return "\x1b[31mgetnet: missing URL operand\x1b[0m\n\x1b[1mUsage:\x1b[0m getnet <url> [-o|--out <file>] [-v|--verbose]";
    }

    let url = null;
    let outputFile = null;
    let verbose = false;

    let i = 0;
    while (i < args.length) {
        switch (args[i]) {
            case "-o":
            case "--out":
                if (i + 1 >= args.length) {
                    return `\x1b[31mgetnet: ${args[i]} requires a value\x1b[0m`;
                }
                outputFile = args[i + 1];
                i += 2;
                break;
            case "-v":
            case "--verbose":
                verbose = true;
                i += 1;
                break;
            default:
                if (!args[i].startsWith('-')) {
                    if (url === null) {
                        url = args[i];
                    } else {
                        return `\x1b[31mgetnet: unexpected argument '${args[i]}'\x1b[0m`;
                    }
                    i += 1;
                } else {
                    return `\x1b[31mgetnet: unknown flag '${args[i]}'\x1b[0m`;
                }
                break;
        }
    }

    if (url === null) {
        return "\x1b[31mgetnet: missing URL operand\x1b[0m";
    }

    if (!url.startsWith("http://") && !url.startsWith("https://")) {
        return "\x1b[31mgetnet: URL must start with http:// or https://\x1b[0m";
    }

    let filename = outputFile;
    if (!filename) {
        let pathPart = url.includes('?') ? url.split('?')[0] : url;
        let lastSlash = pathPart.lastIndexOf('/');
        if (lastSlash !== -1) {
            let afterSlash = pathPart.substring(lastSlash + 1);
            if (afterSlash.length > 0) {
                filename = afterSlash;
            }
        }
        if (!filename) {
            filename = "download";
        }
    }

    const filePath = cwd === "/" ? `/${filename}` : `${cwd}/${filename}`;
    let outputLines = [];

    if (verbose) {
        outputLines.push(`\x1b[36mFetching ${url}\x1b[0m`);
    }

    let blob = null;
    let status = 0;
    let contentType = "";

    const doFetch = async (fetchUrl) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        try {
            const response = await fetch(fetchUrl, {
                signal: controller.signal,
                headers: { 'Accept': '*/*' }
            });
            clearTimeout(timeout);
            if (response.ok) {
                status = response.status;
                contentType = response.headers.get('content-type') || 'application/octet-stream';
                blob = await response.blob();
                return true;
            }
        } catch (e) {
            clearTimeout(timeout);
        }
        return false;
    };

    let success = await doFetch(url);
    if (!success && verbose) {
        outputLines.push("\x1b[33mDirect fetch failed, retrying via proxy...\x1b[0m");
    }
    if (!success) {
        const proxyUrl = `/__proxy__/${encodeURIComponent(url)}`;
        success = await doFetch(proxyUrl);
    }

    if (!success || !blob) {
        return `\x1b[31mgetnet: Failed to download from ${url}\x1b[0m`;
    }

    if (verbose) {
        outputLines.push(`\x1b[36mHTTP ${status}\x1b[0m ${contentType}`);
        outputLines.push(`\x1b[36mSize:\x1b[0m ${blob.size} bytes`);
    }

    try {
        if (!window.filesystem || typeof window.filesystem.createFileFromBlob !== 'function') {
            return "\x1b[31mgetnet: Filesystem not available\x1b[0m";
        }
        const successWrite = await window.filesystem.createFileFromBlob(filePath, blob);
        if (successWrite) {
            if (verbose) {
                outputLines.push(`\x1b[32mSaved to ${filename}\x1b[0m (${blob.size} bytes)`);
            } else {
                outputLines.push(`\x1b[32mSaved ${filename}\x1b[0m (${blob.size} bytes)`);
            }
        } else {
            return `\x1b[31mgetnet: failed to save file '${filename}'\x1b[0m`;
        }
    } catch (err) {
        return `\x1b[31mgetnet: failed to save file '${filename}': ${err.message}\x1b[0m`;
    }

    return outputLines.join("\n");
}

async function preprocessAndExecute(line, cwd, wasmShell) {
    const trimmed = line.trim();
    if (!trimmed) return "";

    let inQuotes = false;
    let quoteChar = ' ';
    
    let redirectOp = null;
    let redirectFile = '';
    let pipeOp = null;
    let pipeCommand = '';
    
    let commandPart = '';
    
    for (let i = 0; i < trimmed.length; i++) {
        let c = trimmed[i];
        if (inQuotes) {
            if (c === quoteChar) {
                inQuotes = false;
            }
            commandPart += c;
        } else {
            if (c === '"' || c === "'") {
                inQuotes = true;
                quoteChar = c;
                commandPart += c;
            } else if (c === '|' && !pipeOp && !redirectOp) {
                pipeOp = '|';
                pipeCommand = trimmed.substring(i + 1).trim();
                break;
            } else if (c === '>' && !pipeOp && !redirectOp) {
                if (trimmed[i + 1] === '>') {
                    redirectOp = '>>';
                    redirectFile = trimmed.substring(i + 2).trim();
                } else {
                    redirectOp = '>';
                    redirectFile = trimmed.substring(i + 1).trim();
                }
                break;
            } else {
                commandPart += c;
            }
        }
    }

    commandPart = commandPart.trim();

    const resolvePath = (file) => {
        let f = file.replace(/^["']|["']$/g, '').trim();
        if (f.startsWith('/')) return f;
        return cwd === "/" ? `/${f}` : `${cwd}/${f}`;
    };

    const writeRedirect = async (filePath, content, append) => {
        if (!window.filesystem || typeof window.filesystem.createFile !== 'function') {
            return "\x1b[31mFailed to redirect: Filesystem not available\x1b[0m";
        }
        let finalContent = content;
        if (append) {
            const existing = await window.filesystem.readFile(filePath);
            if (existing !== null) {
                finalContent = existing + "\n" + content;
            }
        }
        const success = await window.filesystem.createFile(filePath, finalContent);
        if (success) {
            return "";
        } else {
            return `\x1b[31mFailed to write to redirection target: ${filePath}\x1b[0m`;
        }
    };

    const runCoreCommand = async (cmd) => {
        if (cmd.startsWith('getnet ')) {
            return await execGetnet(cmd, cwd);
        } else if (wasmShell) {
            return await wasmShell.exec(cmd);
        }
        return `\x1b[31mCommand not found: ${cmd}\x1b[0m`;
    };

    if (pipeOp) {
        let stdout = await runCoreCommand(commandPart);
        let cleanStdout = stdout.replace(/\x1b\[[0-9;]*m/g, '');
        
        const pipeParts = parseArgs(pipeCommand);
        if (pipeParts[0] === 'grep') {
            if (pipeParts.length < 2) {
                return "\x1b[31mgrep: missing pattern\x1b[0m";
            }
            const pattern = pipeParts[1];
            const lines = cleanStdout.split('\n');
            const matches = lines.filter(line => line.includes(pattern));
            return matches.join('\n');
        } else {
            return `\x1b[31mUnsupported piped command: ${pipeParts[0]}. Only 'grep' is supported in pipes.\x1b[0m`;
        }
    }

    if (redirectOp) {
        if (!redirectFile) {
            return "\x1b[31mShell: missing redirection target\x1b[0m";
        }
        const filePath = resolvePath(redirectFile);
        let stdout = await runCoreCommand(commandPart);
        let cleanStdout = stdout.replace(/\x1b\[[0-9;]*m/g, '');
        
        const err = await writeRedirect(filePath, cleanStdout, redirectOp === '>>');
        if (err) return err;
        return "";
    }

    return await runCoreCommand(commandPart);
}

window.BrowShell = BrowShell;
