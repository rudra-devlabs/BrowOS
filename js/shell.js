import init, { WasmShell } from '../assets/wasm/browos_terminal.js';

class BrowShell {
    constructor() {
        this.term = null;
        this.windowObj = null;
        this.wasmShell = null;
        this.wasmReady = false;
        this.inputBuffer = [];
        this.isProcessing = false;
        this.commandHistory = [];
        this.historyIndex = -1;
        this.currentInput = '';
        this.cursorPos = 0;
        this.lastPrompt = '';
        
        this.setupFsBridge();
        this.setupHttpBridge();
        this.initWasm();
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
            contentArea.style.cssText = 'padding:0!important;margin:0!important;overflow:hidden!important;background:#000!important;display:flex!important;flex-direction:column!important;';
        }
        container.style.cssText = 'height:100%!important;width:100%!important;background:#000!important;padding:0!important;margin:0!important;position:relative!important;overflow:hidden!important;';
        container.innerHTML = '<div id="xterm-container" style="width:100%;height:100%;position:absolute;top:0;left:0;"></div>';

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
            fontFamily: '"Cascadia Code", "Cascadia Mono", Consolas, "Lucida Console", "SF Mono", "DejaVu Sans Mono", monospace',
            fontWeight: '400',
            fontWeightBold: '700',
            letterSpacing: 0,
            lineHeight: 1.15,
            convertEol: true,
            scrollback: 1000,
            allowProposedApi: true,
            rendererType: 'dom'
        });
        
        // Wait for font to load before opening terminal
        await document.fonts.ready;
        const terminalElement = container.querySelector('#xterm-container');
        this.term.open(terminalElement);
        
        // Force resize to ensure correct character measurement
        setTimeout(() => {
            this.term.resize(this.term.cols, this.term.rows);
            this.term.refresh(0, this.term.rows - 1);
        }, 50);

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
                    const output = await this.wasmShell.exec(line);
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
            } else if (data >= ' ' && data <= '~') {
                this.inputBuffer.splice(this.cursorPos, 0, data);
                this.cursorPos++;
                this.redrawInputLine();
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

        this.term.write('\r');
        for (let r = 0; r < cursorRow; r++) {
            this.term.write('\x1b[A');
        }
        this.term.write('\x1b[J');

        this.term.write(this.lastPrompt);
        this.term.write(line);

        for (let r = 0; r < endRow - targetRow; r++) {
            this.term.write('\x1b[A');
        }
        this.term.write('\r');
        for (let c = 0; c < targetCol; c++) {
            this.term.write('\x1b[C');
        }
    }

    _stripAnsi(str) {
        return str.replace(/\x1b\[[0-9;]*m/g, '');
    }
}

window.BrowShell = BrowShell;
