/**
 * BrowOS In-Terminal Nano Text Editor
 * Runs an interactive nano editor directly inside xterm.js viewport.
 */

class NanoEditor {
    constructor(term, fs, env, filePath, onExit) {
        this.term = term;
        this.fs = fs;
        this.env = env;
        this.filePath = filePath;
        this.onExit = onExit;

        this.lines = [''];
        this.cursorRow = 0;
        this.cursorCol = 0;
        this.scrollOffset = 0;
        this.clipboard = '';
        this.isModified = false;
        this.statusMessage = '';

        this.rows = term.rows || 24;
        this.cols = term.cols || 80;
        this.viewportHeight = Math.max(5, this.rows - 4); // 1 header + 1 empty + 2 footer
    }

    async start() {
        if (this.fs && this.fs.isReady()) {
            const content = await this.fs.readFile(this.filePath);
            if (content !== null) {
                this.lines = content.split('\n');
                if (this.lines.length === 0) this.lines = [''];
            }
        }

        // Hide terminal normal cursor while rendering, then place it
        this.term.write('\x1b[?25l');
        this.renderAll();
        this.placeCursor();
        this.term.write('\x1b[?25h');
    }

    renderAll() {
        this.rows = this.term.rows || 24;
        this.cols = this.term.cols || 80;
        this.viewportHeight = Math.max(5, this.rows - 4);

        // Clear screen and go to top-left
        let out = '\x1b[H\x1b[2J';

        // 1. Header (Inverse video)
        const fileName = this.filePath.split('/').pop() || 'Untitled';
        const modFlag = this.isModified ? ' *' : '';
        const title = `  GNU nano (BrowOS)           File: ${fileName}${modFlag}`;
        const paddedTitle = title.padEnd(this.cols, ' ').substring(0, this.cols);
        out += `\x1b[7m${paddedTitle}\x1b[0m\r\n`;

        // 2. Text viewport
        for (let i = 0; i < this.viewportHeight; i++) {
            const lineIndex = this.scrollOffset + i;
            if (lineIndex < this.lines.length) {
                const line = this.lines[lineIndex] || '';
                out += line.substring(0, this.cols) + '\x1b[K\r\n';
            } else {
                out += '~\x1b[K\r\n';
            }
        }

        // 3. Status Line
        const status = this.statusMessage || `[ Lines: ${this.lines.length}  Col: ${this.cursorCol + 1} ]`;
        const paddedStatus = status.padEnd(this.cols, ' ').substring(0, this.cols);
        out += `\x1b[K${paddedStatus}\r\n`;

        // 4. Shortcut Bar (2 lines)
        const line1 = ' \x1b[7m^G\x1b[0m Help     \x1b[7m^O\x1b[0m WriteOut \x1b[7m^W\x1b[0m Where Is \x1b[7m^K\x1b[0m Cut Line';
        const line2 = ' \x1b[7m^X\x1b[0m Exit     \x1b[7m^R\x1b[0m Read File\x1b[7m^\x1b[0m Replace  \x1b[7m^U\x1b[0m Paste';
        out += line1 + '\x1b[K\r\n';
        out += line2 + '\x1b[K';

        this.term.write(out);
    }

    placeCursor() {
        const visualRow = (this.cursorRow - this.scrollOffset) + 2; // +1 header, 1-indexed
        const visualCol = this.cursorCol + 1; // 1-indexed
        this.term.write(`\x1b[${visualRow};${visualCol}H`);
    }

    adjustScroll() {
        if (this.cursorRow < this.scrollOffset) {
            this.scrollOffset = this.cursorRow;
        } else if (this.cursorRow >= this.scrollOffset + this.viewportHeight) {
            this.scrollOffset = this.cursorRow - this.viewportHeight + 1;
        }
    }

    async handleInput(data) {
        this.statusMessage = '';

        // Ctrl+X: Exit
        if (data === '\x18') {
            if (this.isModified) {
                this.statusMessage = 'Save modified buffer before exit? (Y/N/C)';
                this.renderAll();
                this.waitingForExitSave = true;
                return;
            }
            this.exit();
            return;
        }

        if (this.waitingForExitSave) {
            const key = data.toLowerCase();
            if (key === 'y') {
                await this.save();
                this.exit();
            } else if (key === 'n') {
                this.exit();
            } else {
                this.waitingForExitSave = false;
                this.statusMessage = 'Cancelled';
                this.renderAll();
                this.placeCursor();
            }
            return;
        }

        // Ctrl+O: WriteOut / Save
        if (data === '\x0f') {
            await this.save();
            this.renderAll();
            this.placeCursor();
            return;
        }

        // Ctrl+K: Cut Line
        if (data === '\x0b') {
            this.clipboard = this.lines[this.cursorRow] || '';
            if (this.lines.length > 1) {
                this.lines.splice(this.cursorRow, 1);
                if (this.cursorRow >= this.lines.length) this.cursorRow = this.lines.length - 1;
            } else {
                this.lines[0] = '';
            }
            this.cursorCol = 0;
            this.isModified = true;
            this.statusMessage = '[ Cut 1 line ]';
            this.renderAll();
            this.placeCursor();
            return;
        }

        // Ctrl+U: Paste Line
        if (data === '\x15') {
            if (this.clipboard !== undefined) {
                this.lines.splice(this.cursorRow, 0, this.clipboard);
                this.cursorRow++;
                this.cursorCol = 0;
                this.isModified = true;
                this.statusMessage = '[ Pasted 1 line ]';
                this.adjustScroll();
                this.renderAll();
                this.placeCursor();
            }
            return;
        }

        // Arrow Keys
        if (data === '\x1b[A') { // Up
            if (this.cursorRow > 0) {
                this.cursorRow--;
                this.cursorCol = Math.min(this.cursorCol, this.lines[this.cursorRow].length);
                this.adjustScroll();
                this.renderAll();
                this.placeCursor();
            }
            return;
        }
        if (data === '\x1b[B') { // Down
            if (this.cursorRow < this.lines.length - 1) {
                this.cursorRow++;
                this.cursorCol = Math.min(this.cursorCol, this.lines[this.cursorRow].length);
                this.adjustScroll();
                this.renderAll();
                this.placeCursor();
            }
            return;
        }
        if (data === '\x1b[C') { // Right
            const curLine = this.lines[this.cursorRow] || '';
            if (this.cursorCol < curLine.length) {
                this.cursorCol++;
                this.placeCursor();
            } else if (this.cursorRow < this.lines.length - 1) {
                this.cursorRow++;
                this.cursorCol = 0;
                this.adjustScroll();
                this.renderAll();
                this.placeCursor();
            }
            return;
        }
        if (data === '\x1b[D') { // Left
            if (this.cursorCol > 0) {
                this.cursorCol--;
                this.placeCursor();
            } else if (this.cursorRow > 0) {
                this.cursorRow--;
                this.cursorCol = this.lines[this.cursorRow].length;
                this.adjustScroll();
                this.renderAll();
                this.placeCursor();
            }
            return;
        }

        // Enter Key
        if (data === '\r') {
            const currentLine = this.lines[this.cursorRow] || '';
            const left = currentLine.substring(0, this.cursorCol);
            const right = currentLine.substring(this.cursorCol);
            this.lines[this.cursorRow] = left;
            this.lines.splice(this.cursorRow + 1, 0, right);
            this.cursorRow++;
            this.cursorCol = 0;
            this.isModified = true;
            this.adjustScroll();
            this.renderAll();
            this.placeCursor();
            return;
        }

        // Backspace
        if (data === '\x7f') {
            if (this.cursorCol > 0) {
                const currentLine = this.lines[this.cursorRow] || '';
                this.lines[this.cursorRow] = currentLine.substring(0, this.cursorCol - 1) + currentLine.substring(this.cursorCol);
                this.cursorCol--;
                this.isModified = true;
                this.renderAll();
                this.placeCursor();
            } else if (this.cursorRow > 0) {
                const prevLine = this.lines[this.cursorRow - 1] || '';
                const currentLine = this.lines[this.cursorRow] || '';
                this.cursorCol = prevLine.length;
                this.lines[this.cursorRow - 1] = prevLine + currentLine;
                this.lines.splice(this.cursorRow, 1);
                this.cursorRow--;
                this.isModified = true;
                this.adjustScroll();
                this.renderAll();
                this.placeCursor();
            }
            return;
        }

        // Printable text characters
        if (data.length === 1 && data.charCodeAt(0) >= 32) {
            const currentLine = this.lines[this.cursorRow] || '';
            this.lines[this.cursorRow] = currentLine.substring(0, this.cursorCol) + data + currentLine.substring(this.cursorCol);
            this.cursorCol++;
            this.isModified = true;
            this.renderAll();
            this.placeCursor();
        }
    }

    async save() {
        if (!this.fs || !this.fs.isReady()) {
            this.statusMessage = '[ Error: Filesystem not mounted ]';
            return;
        }
        const text = this.lines.join('\n');
        try {
            const ok = await this.fs.createFile(this.filePath, text);
            if (ok) {
                this.isModified = false;
                this.statusMessage = `[ Wrote ${this.lines.length} lines to ${this.filePath.split('/').pop()} ]`;
            } else {
                this.statusMessage = '[ Error: Write permission denied ]';
            }
        } catch (e) {
            this.statusMessage = `[ Error: ${e.message} ]`;
        }
    }

    exit() {
        // Clear screen and restore terminal
        this.term.write('\x1b[2J\x1b[H');
        if (typeof this.onExit === 'function') {
            this.onExit();
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { NanoEditor };
}
if (typeof window !== 'undefined') {
    window.NanoEditor = NanoEditor;
}
