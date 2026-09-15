/**
 * BrowShell Terminal v5.0 (POSIX Native Engine with Tab Multiplexing & Split Panes)
 * Bridges xterm.js with the BrowOS POSIX CLI subsystem, multi-tab sessions,
 * draggable split panes, and pro themes.
 */

const TerminalThemes = {
    dracula: {
        name: 'Dracula',
        background: '#282a36',
        foreground: '#f8f8f2',
        cursor: '#50fa7b',
        cursorAccent: '#282a36',
        selectionBackground: 'rgba(255, 121, 198, 0.3)',
        black: '#21222c',
        red: '#ff5555',
        green: '#50fa7b',
        yellow: '#f1fa8c',
        blue: '#bd93f9',
        magenta: '#ff79c6',
        cyan: '#8be9fd',
        white: '#f8f8f2',
        brightBlack: '#6272a4',
        brightRed: '#ff6e6e',
        brightGreen: '#69ff94',
        brightYellow: '#ffffa5',
        brightBlue: '#d6acff',
        brightMagenta: '#ff92df',
        brightCyan: '#a4ffff',
        brightWhite: '#ffffff'
    },
    onedark: {
        name: 'One Dark',
        background: '#1e1e24',
        foreground: '#abb2bf',
        cursor: '#528bff',
        cursorAccent: '#1e1e24',
        selectionBackground: '#3e4451',
        black: '#282c34',
        red: '#e06c75',
        green: '#98c379',
        yellow: '#e5c07b',
        blue: '#61afef',
        magenta: '#c678dd',
        cyan: '#56b6c2',
        white: '#abb2bf',
        brightBlack: '#5c6370',
        brightRed: '#e06c75',
        brightGreen: '#98c379',
        brightYellow: '#e5c07b',
        brightBlue: '#61afef',
        brightMagenta: '#c678dd',
        brightCyan: '#56b6c2',
        brightWhite: '#ffffff'
    },
    monokai: {
        name: 'Monokai Pro',
        background: '#272822',
        foreground: '#f8f8f2',
        cursor: '#f8f8f0',
        cursorAccent: '#272822',
        selectionBackground: '#49483e',
        black: '#272822',
        red: '#f92672',
        green: '#a6e22e',
        yellow: '#f4bf75',
        blue: '#66d9ef',
        magenta: '#ae81ff',
        cyan: '#a1efe4',
        white: '#f8f8f2',
        brightBlack: '#75715e',
        brightRed: '#f92672',
        brightGreen: '#a6e22e',
        brightYellow: '#f4bf75',
        brightBlue: '#66d9ef',
        brightMagenta: '#ae81ff',
        brightCyan: '#a1efe4',
        brightWhite: '#f9f8f5'
    },
    solarized: {
        name: 'Solarized Dark',
        background: '#002b36',
        foreground: '#839496',
        cursor: '#93a1a1',
        cursorAccent: '#002b36',
        selectionBackground: '#073642',
        black: '#073642',
        red: '#dc322f',
        green: '#859900',
        yellow: '#b58900',
        blue: '#268bd2',
        magenta: '#d33682',
        cyan: '#2aa198',
        white: '#eee8d5',
        brightBlack: '#586e75',
        brightRed: '#cb4b16',
        brightGreen: '#586e75',
        brightYellow: '#657b83',
        brightBlue: '#839496',
        brightMagenta: '#6c71c4',
        brightCyan: '#93a1a1',
        brightWhite: '#fdf6e3'
    },
    matrix: {
        name: 'Matrix CRT',
        background: '#0a140a',
        foreground: '#00ff66',
        cursor: '#00ff66',
        cursorAccent: '#0a140a',
        selectionBackground: 'rgba(0, 255, 102, 0.25)',
        black: '#001a00',
        red: '#00dd44',
        green: '#00ff66',
        yellow: '#66ff99',
        blue: '#33cc66',
        magenta: '#00ffaa',
        cyan: '#00ffcc',
        white: '#b3ffcc',
        brightBlack: '#004d00',
        brightRed: '#00ff55',
        brightGreen: '#33ff77',
        brightYellow: '#88ffaa',
        brightBlue: '#44dd77',
        brightMagenta: '#22ffbb',
        brightCyan: '#33ffdd',
        brightWhite: '#e6ffee'
    },
    glass: {
        name: 'macOS Glass',
        background: 'rgba(18, 18, 24, 0.88)',
        foreground: '#f3f4f6',
        cursor: '#38bdf8',
        cursorAccent: '#111827',
        selectionBackground: 'rgba(56, 189, 248, 0.25)',
        black: '#1f2937',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#fbbf24',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#38bdf8',
        white: '#f9fafb',
        brightBlack: '#4b5563',
        brightRed: '#ef4444',
        brightGreen: '#22c55e',
        brightYellow: '#f59e0b',
        brightBlue: '#3b82f6',
        brightMagenta: '#a855f7',
        brightCyan: '#06b6d4',
        brightWhite: '#ffffff'
    }
};

if (typeof window !== 'undefined') {
    window.TerminalThemes = TerminalThemes;
}

const TerminalIcons = {
    bash: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>`,
    python: `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M11.91 2c-3.14 0-2.95 1.36-2.95 1.36l.03 1.41h2.98v.42H6.06S4 4.96 4 8.16s1.8 3.08 1.8 3.08h1.08v-1.52c0-1.74 1.51-1.63 1.51-1.63h2.94V7.67H7.42S7.42 6.5 8.7 6.5h3.21V2zm-1.55 1.25a.65.65 0 110 1.3.65.65 0 010-1.3zm1.73 18.75c3.14 0 2.95-1.36 2.95-1.36l-.03-1.41h-2.98v-.42h5.91s2.06.23 2.06-2.97-1.8-3.08-1.8-3.08h-1.08v1.52c0 1.74-1.51 1.63-1.51 1.63h-2.94v.42h3.91s0 1.17-1.28 1.17h-3.21v4.5zm1.55-1.25a.65.65 0 110-1.3.65.65 0 010 1.3z"/></svg>`,
    node: `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l9 5.2v10.4l-9 5.2-9-5.2V7.2L12 2zm0 2.3L4.8 8.5v7l7.2 4.2 7.2-4.2v-7L12 4.3z"/></svg>`,
    nano: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`,
    sqlite: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>`,
    gear: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
    plus: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
    splitVertical: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="12" y1="3" x2="12" y2="21"></line></svg>`,
    splitHorizontal: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="12" x2="21" y2="12"></line></svg>`,
    palette: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"></circle><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"></circle><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"></circle><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"></circle><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.563-2.512 5.563-5.563C22 6.5 17.5 2 12 2z"></path></svg>`,
    close: `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`
};

async function ensureCliSubsystem() {
    if (window.ShellEngine && window.ShellParser && window.ShellCommands && window.NanoEditor && window.ShellAutocomplete && window.ShellScriptRunner) {
        return;
    }
    const scripts = [
        'js/cli/environment.js',
        'js/cli/parser.js',
        'js/cli/commands.js',
        'js/cli/runtimes.js',
        'js/cli/nano.js',
        'js/cli/autocomplete.js',
        'js/cli/scripting.js',
        'js/cli/engine.js'
    ];
    for (const src of scripts) {
        if (!document.querySelector(`script[src^="${src}"]`)) {
            await new Promise((resolve) => {
                const s = document.createElement('script');
                s.src = src;
                s.onload = resolve;
                s.onerror = (e) => {
                    console.error('Failed to load CLI component:', src, e);
                    resolve();
                };
                document.head.appendChild(s);
            });
        }
    }
}

/**
 * Represents an individual terminal pane session.
 */
class TerminalSession {
    constructor(paneElement, initialCwd, themeKey, fontSize, onTitleChange, onFocus) {
        this.paneElement = paneElement;
        this.initialCwd = initialCwd || '/Desktop';
        this.themeKey = themeKey || 'dracula';
        this.fontSize = fontSize || 13;
        this.onTitleChange = onTitleChange;
        this.onFocus = onFocus;

        this.term = null;
        this.fitAddon = null;
        this.env = null;
        this.engine = null;
        this.commands = null;
        this.autocomplete = null;

        this.inputBuffer = [];
        this.cursorPos = 0;
        this.historyIndex = -1;
        this.currentInput = '';
        this.lastPrompt = '';
        this.isProcessing = false;
        this.activeEditor = null;
        this.activeRepl = null;
        this._cursorRow = 0;
        this._cursorCol = 0;

        this._xtermContainer = null;
        this._activeProcessName = 'bash';
    }

    async init(showBanner = false) {
        this._xtermContainer = document.createElement('div');
        this._xtermContainer.className = 'xterm-mount-point';
        this._xtermContainer.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:hidden;';
        this.paneElement.appendChild(this._xtermContainer);

        // Click pane to focus
        this.paneElement.addEventListener('pointerdown', () => {
            if (this.onFocus) this.onFocus(this);
            if (this.term) this.term.focus();
        });

        this.env = new window.ShellEnvironment(this.initialCwd);
        this.engine = new window.ShellEngine(this.env);
        this.commands = new window.ShellCommands(this.engine);
        this.engine.setCommands(this.commands);
        this.autocomplete = new window.ShellAutocomplete(this.commands, this.env);

        const theme = TerminalThemes[this.themeKey] || TerminalThemes.dracula;

        // Ensure web fonts are completely loaded before xterm measures character metrics
        if (document.fonts && document.fonts.ready) {
            await document.fonts.ready;
        }

        this.term = new Terminal({
            cursorBlink: true,
            theme: { ...theme },
            fontSize: this.fontSize,
            fontFamily: '"Ubuntu Mono", Consolas, "Cascadia Mono", monospace',
            fontWeight: '400',
            fontWeightBold: '700',
            letterSpacing: 0,
            lineHeight: 1.0,
            convertEol: true,
            scrollback: 2000,
            allowProposedApi: true
        });

        if (window.FitAddon && window.FitAddon.FitAddon) {
            this.fitAddon = new window.FitAddon.FitAddon();
            this.term.loadAddon(this.fitAddon);
        }

        this.term.open(this._xtermContainer);
        
        // Immediate and post-render fit to guarantee correct character width cells
        this.fit();
        requestAnimationFrame(() => {
            this.fit();
            setTimeout(() => this.fit(), 60);
        });

        if (showBanner) {
            this.term.writeln('\x1b[1;32mWelcome to BrowShell Terminal v5.0 (POSIX & Wasm Compilers)\x1b[0m');
            this.term.writeln('Tabs (\x1b[36mCtrl+Alt+T\x1b[0m), Splits (\x1b[36mCtrl+Alt+O / E\x1b[0m), and Themes (\x1b[33mtheme\x1b[0m) are supported.\r\n');
        }

        this.updatePrompt();
        this.setupClipboard();
        this.setupInputHandler();
    }

    setTheme(themeKey) {
        this.themeKey = themeKey;
        const theme = TerminalThemes[themeKey] || TerminalThemes.dracula;
        if (this.term) {
            this.term.options.theme = { ...theme };
        }
    }

    setFontSize(size) {
        this.fontSize = Math.max(10, Math.min(24, size));
        if (this.term) {
            this.term.options.fontSize = this.fontSize;
            this.fit();
        }
    }

    fit() {
        if (!this.term || !this.fitAddon || !this._xtermContainer) return;
        try {
            if (this.paneElement.offsetWidth > 0 && this.paneElement.offsetHeight > 0) {
                this.fitAddon.fit();
                this.term.refresh(0, this.term.rows - 1);
            }
        } catch (e) {}
    }

    focus() {
        if (this.term) this.term.focus();
    }

    setProcessTitle(name, iconKey = 'bash') {
        this._activeProcessName = name;
        if (this.onTitleChange) {
            this.onTitleChange(name, iconKey);
        }
    }

    updatePrompt() {
        const cwd = this.env ? this.env.getCwd() : '/';
        const cwdBase = cwd === '/' ? '/' : cwd.split('/').filter(Boolean).pop();
        this.setProcessTitle(cwdBase || 'bash', 'bash');

        const prompt = `\x1b[1;32muser@browos\x1b[0m:\x1b[1;34m${cwd}\x1b[0m$ `;
        this.lastPrompt = prompt;
        this.term.write(prompt);
        this._cursorRow = 0;
        this._cursorCol = this._stripAnsi(prompt).length;
    }

    updateCursorPosition() {
        const cols = this.term.cols || 80;
        const promptLen = this._stripAnsi(this.lastPrompt).length;
        const targetRow = Math.floor((promptLen + this.cursorPos) / cols);
        const targetCol = (promptLen + this.cursorPos) % cols;

        const currentRow = typeof this._cursorRow === 'number' ? this._cursorRow : 0;
        const rowDiff = targetRow - currentRow;

        let seq = '';
        if (rowDiff < 0) {
            seq += `\x1b[${-rowDiff}A`;
        } else if (rowDiff > 0) {
            seq += `\x1b[${rowDiff}B`;
        }
        seq += `\r\x1b[${targetCol + 1}G`;

        this._cursorRow = targetRow;
        this._cursorCol = targetCol;
        this.term.write(seq);
    }

    redrawInputLine() {
        const line = this.inputBuffer.join('');
        const cols = this.term.cols || 80;
        const promptLen = this._stripAnsi(this.lastPrompt).length;
        const totalLen = promptLen + line.length;

        const targetRow = Math.floor((promptLen + this.cursorPos) / cols);
        const targetCol = (promptLen + this.cursorPos) % cols;
        const endRow = Math.floor(totalLen / cols);

        let redraw = '\x1b[?25l'; // Hide cursor during redraw

        // 1. Return from current cursor physical row back to row 0 (start of prompt)
        const currentRow = typeof this._cursorRow === 'number' ? this._cursorRow : 0;
        if (currentRow > 0) {
            redraw += `\x1b[${currentRow}A`;
        }
        redraw += '\r\x1b[J'; // Clear down to bottom of screen (never up into history!)

        // 2. Output prompt and full input line
        redraw += this.lastPrompt;
        redraw += line;

        // 3. Move cursor from endRow to targetRow
        const rowDiff = endRow - targetRow;
        if (rowDiff > 0) {
            redraw += `\x1b[${rowDiff}A`;
        }
        // 4. Move horizontally to targetCol (1-indexed)
        redraw += `\r\x1b[${targetCol + 1}G`;
        redraw += '\x1b[?25h'; // Restore cursor

        this._cursorRow = targetRow;
        this._cursorCol = targetCol;
        this.term.write(redraw);
    }

    replaceInputLine(newText) {
        this.inputBuffer = (newText || '').split('');
        this.cursorPos = this.inputBuffer.length;
        this.redrawInputLine();
    }

    insertPrintableInput(data) {
        const chars = [...data];
        this.inputBuffer.splice(this.cursorPos, 0, ...chars);
        this.cursorPos += chars.length;
        this.redrawInputLine();
    }

    _stripAnsi(str) {
        return str.replace(/\x1b\[[0-9;]*m/g, '');
    }

    setupClipboard() {
        if (!this.term) return;

        this.term.attachCustomKeyEventHandler((event) => {
            if (event.ctrlKey && event.type === 'keydown') {
                if (event.key === 'c' && this.term.hasSelection()) {
                    navigator.clipboard.writeText(this.term.getSelection()).catch(() => {});
                    return false;
                }
            }
            return true;
        });

        if (this._xtermContainer) {
            this._xtermContainer.addEventListener('paste', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const text = (e.clipboardData || window.clipboardData)?.getData('text');
                if (!text) return;
                if (this.activeEditor) {
                    for (let ch of text) this.activeEditor.handleInput(ch);
                } else {
                    this.insertPrintableInput(text.replace(/\r?\n/g, ' '));
                }
            }, true);
        }
    }

    setupInputHandler() {
        this.term.onData(async (data) => {
            if (this.activeEditor) {
                await this.activeEditor.handleInput(data);
                return;
            }

            if (this.activeRepl) {
                await this.activeRepl.handleInput(data);
                return;
            }

            // Interrupt (Ctrl+C)
            if (data === '\x03' && this.isProcessing) {
                if (window.PythonRuntime) window.PythonRuntime.terminate();
                if (window.JsRuntime) window.JsRuntime.terminate();
                if (window.ShellScriptRunner) window.ShellScriptRunner.interrupt();
                this.term.write('^C\r\n');
                this.isProcessing = false;
                this.updatePrompt();
                return;
            }

            if (this.isProcessing) return;

            // Enter: Execute command
            if (data === '\r') {
                this.term.write('\r\n');
                const line = this.inputBuffer.join('');
                this.inputBuffer = [];
                this.cursorPos = 0;
                this.historyIndex = -1;
                this._cursorRow = 0;
                this._cursorCol = 0;

                if (line.trim()) {
                    this.env.addHistory(line);
                    this.isProcessing = true;
                    const trimmed = line.trim();

                    // Nano
                    if (trimmed === 'nano' || trimmed.startsWith('nano ')) {
                        this.setProcessTitle('nano', 'nano');
                        const parts = trimmed.split(/\s+/);
                        const fileName = parts[1] || 'untitled.txt';
                        const filePath = this.env.resolvePath(fileName);
                        
                        this.activeEditor = new window.NanoEditor(
                            this.term,
                            window.filesystem,
                            this.env,
                            filePath,
                            () => {
                                this.activeEditor = null;
                                this.isProcessing = false;
                                this.updatePrompt();
                            }
                        );
                        await this.activeEditor.start();
                        return;
                    }

                    // Node REPL
                    if (trimmed === 'node' || trimmed === 'js') {
                        if (window.JsRuntime) {
                            this.setProcessTitle('node', 'node');
                            this.activeRepl = window.JsRuntime.startRepl(this.term, this.env, () => {
                                this.activeRepl = null;
                                this.isProcessing = false;
                                this.updatePrompt();
                            });
                            return;
                        }
                    }

                    // Python REPL
                    if (trimmed === 'python' || trimmed === 'python3') {
                        if (window.PythonRuntime) {
                            this.setProcessTitle('python3', 'python');
                            this.activeRepl = await window.PythonRuntime.startRepl(this.term, this.env, () => {
                                this.activeRepl = null;
                                this.isProcessing = false;
                                this.updatePrompt();
                            });
                            return;
                        }
                    }

                    // SQLite3 REPL
                    if (trimmed === 'sqlite3' || (trimmed.startsWith('sqlite3 ') && !trimmed.includes('"') && !trimmed.includes("'") && !trimmed.includes(';'))) {
                        const parts = trimmed.split(/\s+/);
                        const dbPath = parts[1] || 'database.db';
                        if (window.SqliteRuntime) {
                            this.setProcessTitle('sqlite3', 'sqlite');
                            this.activeRepl = await window.SqliteRuntime.startRepl(this.term, this.env, dbPath, () => {
                                this.activeRepl = null;
                                this.isProcessing = false;
                                this.updatePrompt();
                            });
                            return;
                        }
                    }

                    // BrowDrop & AirDrop Command
                    if (trimmed === 'browdrop' || trimmed === 'airdrop' || trimmed === 'drop' || trimmed.startsWith('browdrop ') || trimmed.startsWith('airdrop ')) {
                        this.term.writeln('\x1b[1;36m[BrowDrop]\x1b[0m Opening AirDrop Radar & Multiplayer Co-presence...');
                        if (window.windowManager && typeof window.windowManager.launchApp === 'function') {
                            window.windowManager.launchApp('browdrop');
                        }
                        this.isProcessing = false;
                        this.updatePrompt();
                        return;
                    }

                    // Standard Command
                    const firstWord = trimmed.split(/\s+/)[0];
                    this.setProcessTitle(firstWord, 'gear');
                    try {
                        await this.engine.execute(
                            line,
                            stdout => this.term.write(stdout),
                            stderr => this.term.write(stderr)
                        );
                    } catch (e) {
                        this.term.writeln(`\x1b[31mbrowsh: execution error: ${e.message}\x1b[0m`);
                    }

                    this.isProcessing = false;
                }

                this.updatePrompt();
                return;
            }

            // Tab: Autocomplete
            if (data === '\t') {
                const line = this.inputBuffer.join('');
                if (this.autocomplete) {
                    const result = await this.autocomplete.complete(line, this.cursorPos);
                    if (result) {
                        if (result.type === 'single') {
                            this.inputBuffer.splice(this.cursorPos, 0, ...result.insertText.split(''));
                            this.cursorPos += result.insertText.length;
                            this.redrawInputLine();
                        } else if (result.type === 'multiple') {
                            if (result.insertText) {
                                this.inputBuffer.splice(this.cursorPos, 0, ...result.insertText.split(''));
                                this.cursorPos += result.insertText.length;
                                this.redrawInputLine();
                            } else {
                                this.term.write('\r\n');
                                const coloredMatches = result.completions.map(c => {
                                    if (c.endsWith('/')) return `\x1b[1;34m${c}\x1b[0m`;
                                    return c;
                                });
                                this.term.writeln(coloredMatches.join('  '));
                                this.updatePrompt();
                                this.term.write(this.inputBuffer.join(''));
                                const curCol = this._stripAnsi(this.lastPrompt).length + this.cursorPos + 1;
                                this.term.write(`\x1b[${curCol}G`);
                            }
                        }
                    }
                }
                return;
            }

            // Backspace
            if (data === '\x7f' || data === '\b') {
                if (this.cursorPos > 0) {
                    this.cursorPos--;
                    this.inputBuffer.splice(this.cursorPos, 1);
                    this.redrawInputLine();
                }
                return;
            }

            // Arrow Up
            if (data === '\x1b[A') {
                const cols = this.term.cols || 80;
                const promptLen = this._stripAnsi(this.lastPrompt).length;
                const currentRow = Math.floor((promptLen + this.cursorPos) / cols);
                if (currentRow > 0) {
                    // Navigate up one visual line within multiline command
                    this.cursorPos = Math.max(0, this.cursorPos - cols);
                    this.updateCursorPosition();
                    return;
                }

                // At top row of prompt: recall previous history item
                const history = this.env.getHistory();
                if (history.length === 0) return;
                if (this.historyIndex === -1) {
                    this.currentInput = this.inputBuffer.join('');
                }
                if (this.historyIndex < history.length - 1) {
                    this.historyIndex++;
                    const item = history[history.length - 1 - this.historyIndex];
                    this.replaceInputLine(item);
                }
                return;
            }

            // Arrow Down
            if (data === '\x1b[B') {
                const cols = this.term.cols || 80;
                const promptLen = this._stripAnsi(this.lastPrompt).length;
                const totalLen = promptLen + this.inputBuffer.length;
                const currentRow = Math.floor((promptLen + this.cursorPos) / cols);
                const lastRow = Math.floor(totalLen / cols);
                if (currentRow < lastRow) {
                    // Navigate down one visual line within multiline command
                    this.cursorPos = Math.min(this.inputBuffer.length, this.cursorPos + cols);
                    this.updateCursorPosition();
                    return;
                }

                // At bottom row of prompt: recall next history item
                const history = this.env.getHistory();
                if (this.historyIndex === -1) return;
                if (this.historyIndex > 0) {
                    this.historyIndex--;
                    const item = history[history.length - 1 - this.historyIndex];
                    this.replaceInputLine(item);
                } else if (this.historyIndex === 0) {
                    this.historyIndex = -1;
                    this.replaceInputLine(this.currentInput);
                }
                return;
            }

            // Arrow Left
            if (data === '\x1b[D') {
                if (this.cursorPos > 0) {
                    this.cursorPos--;
                    this.updateCursorPosition();
                }
                return;
            }

            // Arrow Right
            if (data === '\x1b[C') {
                if (this.cursorPos < this.inputBuffer.length) {
                    this.cursorPos++;
                    this.updateCursorPosition();
                }
                return;
            }

            // Ctrl+A / Home: Jump to start
            if (data === '\x01' || data === '\x1b[H' || data === '\x1b[1~') {
                this.cursorPos = 0;
                this.updateCursorPosition();
                return;
            }

            // Ctrl+E / End: Jump to end
            if (data === '\x05' || data === '\x1b[F' || data === '\x1b[4~') {
                this.cursorPos = this.inputBuffer.length;
                this.updateCursorPosition();
                return;
            }

            // Ctrl+C: Cancel line
            if (data === '\x03') {
                this.term.write('^C\r\n');
                this.inputBuffer = [];
                this.cursorPos = 0;
                this.historyIndex = -1;
                this.updatePrompt();
                return;
            }

            // Ctrl+L: Clear screen
            if (data === '\x0c') {
                this.term.clear();
                this.updatePrompt();
                this.term.write(this.inputBuffer.join(''));
                return;
            }

            // Ctrl+U: Erase before cursor
            if (data === '\x15') {
                this.inputBuffer = this.inputBuffer.slice(this.cursorPos);
                this.cursorPos = 0;
                this.redrawInputLine();
                return;
            }

            // Printable characters
            if (data.length > 0 && [...data].every(ch => ch >= ' ' && ch <= '~')) {
                this.insertPrintableInput(data);
            }
        });
    }

    dispose() {
        if (window.PythonRuntime) window.PythonRuntime.terminate();
        if (window.JsRuntime) window.JsRuntime.terminate();
        if (this.term) {
            this.term.dispose();
            this.term = null;
        }
        if (this.paneElement && this.paneElement.parentNode) {
            this.paneElement.remove();
        }
    }
}

/**
 * Represents a single Tab containing 1 or 2 split panes.
 */
class TerminalTab {
    constructor(id, initialCwd, themeKey, fontSize, onTabClose, onTitleChange, onSessionFocus) {
        this.id = id;
        this.initialCwd = initialCwd || '/Desktop';
        this.themeKey = themeKey;
        this.fontSize = fontSize;
        this.onTabClose = onTabClose;
        this.onTitleChange = onTitleChange;
        this.onSessionFocus = onSessionFocus;

        this.pageElement = null;
        this.tabElement = null;
        this.titleElement = null;
        this.iconElement = null;

        this.sessions = [];
        this.activeSession = null;
        this.splitOrientation = 'none'; // 'none' | 'vertical' | 'horizontal'
        this.dividerElement = null;
    }

    mount(viewportElement, tabsTrackElement, showBanner = false) {
        // 1. Tab Page inside Viewport
        this.pageElement = document.createElement('div');
        this.pageElement.className = 'terminal-tab-page';
        this.pageElement.dataset.tabId = this.id;
        viewportElement.appendChild(this.pageElement);

        // 2. Tab Pill inside Tab Bar
        this.tabElement = document.createElement('div');
        this.tabElement.className = 'terminal-tab';
        this.tabElement.dataset.tabId = this.id;

        this.iconElement = document.createElement('span');
        this.iconElement.className = 'terminal-tab-icon';
        this.iconElement.innerHTML = TerminalIcons.bash;

        this.titleElement = document.createElement('span');
        this.titleElement.className = 'terminal-tab-title';
        this.titleElement.textContent = 'bash';

        const closeBtn = document.createElement('span');
        closeBtn.className = 'terminal-tab-close';
        closeBtn.innerHTML = TerminalIcons.close;
        closeBtn.title = 'Close Tab (Ctrl+Alt+X)';
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.onTabClose) this.onTabClose(this);
        });

        this.tabElement.appendChild(this.iconElement);
        this.tabElement.appendChild(this.titleElement);
        this.tabElement.appendChild(closeBtn);
        tabsTrackElement.appendChild(this.tabElement);

        // 3. Create primary pane
        const paneEl = document.createElement('div');
        paneEl.className = 'terminal-pane is-active';
        this.pageElement.appendChild(paneEl);

        const session = new TerminalSession(
            paneEl,
            this.initialCwd,
            this.themeKey,
            this.fontSize,
            (title, iconKey) => this.handleTitleChange(session, title, iconKey),
            (sess) => this.handleSessionFocus(sess)
        );

        this.sessions.push(session);
        this.activeSession = session;
    }

    async initPrimarySession(showBanner = false) {
        if (this.sessions.length > 0) {
            await this.sessions[0].init(showBanner);
        }
    }

    handleTitleChange(session, title, iconKey) {
        if (session === this.activeSession) {
            if (this.titleElement) this.titleElement.textContent = title;
            if (this.iconElement && iconKey) this.iconElement.innerHTML = TerminalIcons[iconKey] || TerminalIcons.bash;
            if (this.onTitleChange) this.onTitleChange(this, title);
        }
    }

    handleSessionFocus(session) {
        this.activeSession = session;
        this.sessions.forEach(s => {
            if (s.paneElement) {
                s.paneElement.classList.toggle('is-active', s === session);
            }
        });
        if (this.onSessionFocus) this.onSessionFocus(session);
    }

    async split(orientation = 'vertical') {
        if (this.sessions.length >= 2) return; // Support dual-pane split per tab

        this.splitOrientation = orientation;
        this.pageElement.classList.remove('split-vertical', 'split-horizontal');
        this.pageElement.classList.add(orientation === 'vertical' ? 'split-vertical' : 'split-horizontal');

        // Draggable divider
        this.dividerElement = document.createElement('div');
        this.dividerElement.className = 'terminal-pane-divider';
        this.pageElement.appendChild(this.dividerElement);

        // Second pane
        const pane2El = document.createElement('div');
        pane2El.className = 'terminal-pane';
        this.pageElement.appendChild(pane2El);

        const cwd = (this.activeSession && this.activeSession.env) ? this.activeSession.env.getCwd() : this.initialCwd;
        const session2 = new TerminalSession(
            pane2El,
            cwd,
            this.themeKey,
            this.fontSize,
            (title, icon) => this.handleTitleChange(session2, title, icon),
            (sess) => this.handleSessionFocus(sess)
        );

        this.sessions.push(session2);
        this.setupDividerDrag();
        await session2.init(false);

        // Focus second pane
        setTimeout(() => {
            this.handleSessionFocus(session2);
            session2.focus();
            this.fit();
        }, 50);
    }

    setupDividerDrag() {
        if (!this.dividerElement) return;

        let isDragging = false;
        const isVertical = this.splitOrientation === 'vertical';

        const onPointerDown = (e) => {
            isDragging = true;
            this.dividerElement.classList.add('is-dragging');
            this.dividerElement.setPointerCapture(e.pointerId);
            e.preventDefault();
        };

        const onPointerMove = (e) => {
            if (!isDragging || this.sessions.length < 2) return;
            const rect = this.pageElement.getBoundingClientRect();
            let pct;
            if (isVertical) {
                pct = ((e.clientX - rect.left) / rect.width) * 100;
            } else {
                pct = ((e.clientY - rect.top) / rect.height) * 100;
            }

            pct = Math.max(20, Math.min(80, pct));
            this.sessions[0].paneElement.style.flex = `0 0 ${pct}%`;
            this.sessions[1].paneElement.style.flex = `1 1 0%`;
            this.fit();
        };

        const onPointerUp = (e) => {
            if (isDragging) {
                isDragging = false;
                this.dividerElement.classList.remove('is-dragging');
                try {
                    this.dividerElement.releasePointerCapture(e.pointerId);
                } catch (err) {}
                this.fit();
            }
        };

        this.dividerElement.addEventListener('pointerdown', onPointerDown);
        this.dividerElement.addEventListener('pointermove', onPointerMove);
        this.dividerElement.addEventListener('pointerup', onPointerUp);
        this.dividerElement.addEventListener('pointercancel', onPointerUp);
    }

    closeActivePane() {
        if (this.sessions.length > 1 && this.activeSession) {
            const idx = this.sessions.indexOf(this.activeSession);
            const dyingSession = this.activeSession;
            this.sessions.splice(idx, 1);
            dyingSession.dispose();

            if (this.dividerElement) {
                this.dividerElement.remove();
                this.dividerElement = null;
            }

            this.pageElement.classList.remove('split-vertical', 'split-horizontal');
            this.splitOrientation = 'none';

            const remaining = this.sessions[0];
            remaining.paneElement.style.flex = '1 1 0%';
            this.handleSessionFocus(remaining);
            remaining.focus();
            this.fit();
            return true;
        }
        return false;
    }

    fit() {
        this.sessions.forEach(s => s.fit());
    }

    setFontSize(size) {
        this.fontSize = size;
        this.sessions.forEach(s => s.setFontSize(size));
    }

    setTheme(themeKey) {
        this.themeKey = themeKey;
        this.sessions.forEach(s => s.setTheme(themeKey));
    }

    dispose() {
        this.sessions.forEach(s => s.dispose());
        this.sessions = [];
        if (this.pageElement) this.pageElement.remove();
        if (this.tabElement) this.tabElement.remove();
    }
}

/**
 * BrowShell Master Window & Multi-Tab Coordinator
 */
class BrowShell {
    static activeInstances = new Set();

    static setGlobalTheme(themeKey) {
        if (!TerminalThemes[themeKey]) return;
        localStorage.setItem('browos_terminal_theme', themeKey);
        for (const shell of BrowShell.activeInstances) {
            shell.applyTheme(themeKey);
        }
    }

    constructor() {
        this.windowObj = null;
        this.container = null;
        this.viewportElement = null;
        this.tabsTrackElement = null;
        this.themePopover = null;

        this.tabs = [];
        this.activeTab = null;
        this.tabCounter = 0;

        this.currentTheme = localStorage.getItem('browos_terminal_theme') || 'dracula';
        this.fontSize = parseInt(localStorage.getItem('browos_terminal_fontsize'), 10) || 13;

        this._resizeObserver = null;
        this._boundShortcuts = null;

        this.setupFsBridge();
    }

    setupFsBridge() {
        window.browos_fs_list = async (path) => {
            if (!window.filesystem || typeof window.filesystem.list !== 'function') throw new Error('Filesystem not available');
            const entries = await window.filesystem.list(path);
            if (!entries) throw new Error('Path not found');
            return entries.map(e => ({ name: e.name, kind: e.kind === 'directory' ? 'directory' : 'file' }));
        };

        window.browos_fs_read = async (path) => {
            if (!window.filesystem || typeof window.filesystem.readFile !== 'function') throw new Error('Filesystem not available');
            const content = await window.filesystem.readFile(path);
            if (content === null) throw new Error('File not found');
            return content;
        };

        window.browos_fs_write = async (path, content) => {
            if (!window.filesystem || typeof window.filesystem.createFile !== 'function') throw new Error('Filesystem not available');
            return await window.filesystem.createFile(path, content);
        };
    }

    async open(container, windowObj) {
        this.container = container;
        this.windowObj = windowObj;
        BrowShell.activeInstances.add(this);

        const windowElement = windowObj.element;
        if (windowElement) windowElement.classList.add('terminal-window');

        const contentArea = container.closest('.window-content');
        if (contentArea) {
            contentArea.style.cssText = 'padding:0!important;margin:0!important;overflow:hidden!important;background:#18181c!important;display:flex!important;flex-direction:column!important;min-height:0!important;';
        }
        container.style.cssText = 'height:100%!important;width:100%!important;flex:1 1 auto!important;min-height:0!important;background:#18181c!important;padding:0!important;margin:0!important;position:relative!important;overflow:hidden!important;display:flex!important;flex-direction:column!important;';

        await ensureCliSubsystem();

        // 1. Build Tab Bar & Viewport Layout
        container.innerHTML = `
            <div class="terminal-tab-bar">
                <div class="terminal-tabs-track"></div>
                <div class="terminal-tab-actions">
                    <button class="terminal-action-btn terminal-btn-add" title="New Tab (Ctrl+Alt+T)">${TerminalIcons.plus}</button>
                    <button class="terminal-action-btn terminal-btn-split-v" title="Split Vertical (Ctrl+Alt+O)">${TerminalIcons.splitVertical}</button>
                    <button class="terminal-action-btn terminal-btn-split-h" title="Split Horizontal (Ctrl+Alt+E)">${TerminalIcons.splitHorizontal}</button>
                    <button class="terminal-action-btn terminal-btn-theme" title="Theme Selector">${TerminalIcons.palette}</button>
                </div>
            </div>
            <div class="terminal-viewport"></div>
        `;

        this.tabsTrackElement = container.querySelector('.terminal-tabs-track');
        this.viewportElement = container.querySelector('.terminal-viewport');

        // 2. Action button listeners
        const addBtn = container.querySelector('.terminal-btn-add');
        const splitVBtn = container.querySelector('.terminal-btn-split-v');
        const splitHBtn = container.querySelector('.terminal-btn-split-h');
        const themeBtn = container.querySelector('.terminal-btn-theme');

        addBtn.addEventListener('click', () => this.createTab());
        splitVBtn.addEventListener('click', () => this.splitCurrentTab('vertical'));
        splitHBtn.addEventListener('click', () => this.splitCurrentTab('horizontal'));
        themeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleThemePopover(themeBtn);
        });

        // 3. Global window resize observer
        this._resizeObserver = new ResizeObserver(() => {
            if (this.activeTab) this.activeTab.fit();
        });
        this._resizeObserver.observe(this.viewportElement);
        if (contentArea) this._resizeObserver.observe(contentArea);
        if (windowElement) this._resizeObserver.observe(windowElement);

        // 4. Keyboard shortcuts listener
        this.setupKeyboardShortcuts(windowElement);

        // 5. Open primary Tab 1
        await this.waitForStableLayout(windowElement);
        this.createTab('/Desktop', true);

        // Clean up on window close
        if (windowObj.onClose) {
            const originalClose = windowObj.onClose;
            windowObj.onClose = () => {
                this.dispose();
                originalClose();
            };
        }
    }

    async createTab(initialCwd = '/Desktop', showBanner = false) {
        this.tabCounter++;
        const tabId = `tab-${this.tabCounter}`;

        const tab = new TerminalTab(
            tabId,
            initialCwd,
            this.currentTheme,
            this.fontSize,
            (t) => this.closeTab(t),
            (t, title) => {
                if (t === this.activeTab && this.windowObj) {
                    this.windowObj.element.querySelector('.window-title').textContent = `${title} — BrowShell`;
                }
            },
            (session) => {
                // Focus update
            }
        );

        tab.mount(this.viewportElement, this.tabsTrackElement);

        tab.tabElement.addEventListener('click', () => {
            this.switchTab(tab);
        });

        this.tabs.push(tab);
        this.switchTab(tab);
        await tab.initPrimarySession(showBanner);
        return tab;
    }

    switchTab(targetTab) {
        if (!targetTab) return;
        this.activeTab = targetTab;

        this.tabs.forEach(t => {
            const isActive = (t === targetTab);
            t.pageElement.classList.toggle('is-active', isActive);
            t.tabElement.classList.toggle('is-active', isActive);
        });

        if (this.windowObj && targetTab.activeSession) {
            const title = targetTab.activeSession._activeProcessName || 'bash';
            this.windowObj.element.querySelector('.window-title').textContent = `${title} — BrowShell`;
        }

        setTimeout(() => {
            targetTab.fit();
            if (targetTab.activeSession) targetTab.activeSession.focus();
        }, 30);
    }

    closeTab(tabToClose) {
        const idx = this.tabs.indexOf(tabToClose);
        if (idx === -1) return;

        tabToClose.dispose();
        this.tabs.splice(idx, 1);

        if (this.tabs.length === 0) {
            // Close window if last tab is closed
            if (this.windowObj) {
                window.windowManager.closeWindow(this.windowObj.element);
            }
            return;
        }

        // Switch to adjacent tab
        const nextTab = this.tabs[Math.max(0, idx - 1)];
        this.switchTab(nextTab);
    }

    splitCurrentTab(orientation) {
        if (this.activeTab) {
            this.activeTab.split(orientation);
        }
    }

    setupKeyboardShortcuts(windowElement) {
        this._boundShortcuts = (e) => {
            // Check if this window is currently focused / active
            if (!this.windowObj || !this.windowObj.element.classList.contains('active-window')) {
                return;
            }

            // NOTE: legacy Ctrl+Shift and Alt+Shift combos were removed —
            // browsers reserve the former, Windows eats the latter (layout
            // hotkey). The terminal now uses Ctrl+Alt chords, which the
            // browser always delivers:
            //   Ctrl+Alt+T new tab   · Ctrl+Alt+X close tab/pane
            //   Ctrl+Alt+E split down · Ctrl+Alt+O split right
            //   Ctrl+Alt+Tab cycle tabs
            const isCtrl = e.ctrlKey || e.metaKey;

            if (e.ctrlKey && e.altKey && !e.shiftKey && !e.metaKey
                && !(e.getModifierState && e.getModifierState('AltGraph'))) {
                switch (e.code) {
                    case 'KeyT':
                        e.preventDefault();
                        this.createTab();
                        return;
                    case 'KeyX':
                        e.preventDefault();
                        if (this.activeTab) {
                            const closedPane = this.activeTab.closeActivePane();
                            if (!closedPane) {
                                this.closeTab(this.activeTab);
                            }
                        }
                        return;
                    case 'KeyE':
                        e.preventDefault();
                        this.splitCurrentTab('vertical');
                        return;
                    case 'KeyO':
                        e.preventDefault();
                        this.splitCurrentTab('horizontal');
                        return;
                    case 'Tab':
                        e.preventDefault();
                        if (this.tabs.length > 1) {
                            const currentIdx = this.tabs.indexOf(this.activeTab);
                            const nextIdx = (currentIdx + 1) % this.tabs.length;
                            this.switchTab(this.tabs[nextIdx]);
                        }
                        return;
                }
                return;
            }

            if (isCtrl && e.key === 'Tab') return; // browser-reserved: never ours

            // Ctrl + = / Ctrl + +: Font Zoom In
            if (isCtrl && (e.key === '=' || e.key === '+')) {
                e.preventDefault();
                this.adjustFontSize(1);
                return;
            }

            // Ctrl + -: Font Zoom Out
            if (isCtrl && e.key === '-') {
                e.preventDefault();
                this.adjustFontSize(-1);
                return;
            }
        };

        window.addEventListener('keydown', this._boundShortcuts);
    }

    adjustFontSize(delta) {
        this.fontSize = Math.max(10, Math.min(24, this.fontSize + delta));
        localStorage.setItem('browos_terminal_fontsize', String(this.fontSize));
        this.tabs.forEach(t => t.setFontSize(this.fontSize));
    }

    applyTheme(themeKey) {
        this.currentTheme = themeKey;
        this.tabs.forEach(t => t.setTheme(themeKey));
    }

    toggleThemePopover(anchorBtn) {
        if (this.themePopover) {
            this.themePopover.remove();
            this.themePopover = null;
            return;
        }

        const popover = document.createElement('div');
        popover.className = 'terminal-theme-popover';

        Object.keys(TerminalThemes).forEach(k => {
            const theme = TerminalThemes[k];
            const item = document.createElement('div');
            item.className = 'terminal-theme-item' + (k === this.currentTheme ? ' is-selected' : '');
            
            const dot = document.createElement('span');
            dot.className = 'terminal-theme-dot';
            dot.style.background = theme.cursor || theme.green || '#50fa7b';

            const name = document.createElement('span');
            name.textContent = theme.name;

            item.appendChild(dot);
            item.appendChild(name);

            item.addEventListener('click', () => {
                BrowShell.setGlobalTheme(k);
                if (this.themePopover) {
                    this.themePopover.remove();
                    this.themePopover = null;
                }
            });

            popover.appendChild(item);
        });

        this.container.appendChild(popover);
        this.themePopover = popover;

        // Auto close when clicking outside
        const closeHandler = (e) => {
            if (!popover.contains(e.target) && e.target !== anchorBtn) {
                popover.remove();
                this.themePopover = null;
                document.removeEventListener('pointerdown', closeHandler);
            }
        };
        setTimeout(() => document.addEventListener('pointerdown', closeHandler), 10);
    }

    waitForStableLayout(windowElement) {
        return new Promise((resolve) => {
            if (!windowElement || !windowElement.classList.contains('window-opening')) {
                requestAnimationFrame(() => requestAnimationFrame(resolve));
                return;
            }
            const finish = () => requestAnimationFrame(() => requestAnimationFrame(resolve));
            windowElement.addEventListener('animationend', finish, { once: true });
            setTimeout(finish, 350);
        });
    }

    dispose() {
        BrowShell.activeInstances.delete(this);
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }
        if (this._boundShortcuts) {
            window.removeEventListener('keydown', this._boundShortcuts);
            this._boundShortcuts = null;
        }
        this.tabs.forEach(t => t.dispose());
        this.tabs = [];
    }
}

window.BrowShell = BrowShell;
window.TerminalSession = TerminalSession;
window.ensureCliSubsystem = ensureCliSubsystem;
