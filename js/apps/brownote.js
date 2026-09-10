/**
 * Brow Note App Module
 * Extracted from window.js
 */
(function(root) {
    'use strict';

    const NoteApp = {
        getContent() {
                return `
                    <div class="brownote-window">
                        <div class="brownote-toolbar">
                            <div class="brownote-toolbar-group">
                                <button class="brownote-tool-btn" id="brownote-open" title="Open File">
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M.5 2a.5.5 0 0 0-.5.5v11a.5.5 0 0 0 .5.5h15a.5.5 0 0 0 .5-.5v-11a.5.5 0 0 0-.5-.5H.5zM1 3h14v1H1V3zm0 2h14v8H1V5z"/></svg>
                                </button>
                                <button class="brownote-tool-btn" id="brownote-save" title="Save">
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H9.5a1 1 0 0 0-1 1v7.5H3v-8H2zM4 2h5v6H4V2z"/></svg>
                                </button>
                            </div>
                            <div class="brownote-toolbar-divider"></div>
                            <div class="brownote-toolbar-group">
                                <button class="brownote-tool-btn" data-action="bold" title="Bold">
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2h5a3 3 0 0 1 2.1 5.15A3.5 3.5 0 0 1 9.5 14H4V2zm2 5h3a1 1 0 1 0 0-2H6v2zm0 2v3h3.5a1.5 1.5 0 0 0 0-3H6z"/></svg>
                                </button>
                                <button class="brownote-tool-btn" data-action="italic" title="Italic">
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M6 2h6v2h-2.2l-2.6 8H9v2H3v-2h2.2l2.6-8H6V2z"/></svg>
                                </button>
                                <button class="brownote-tool-btn" data-action="underline" title="Underline">
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2h2v4a2 2 0 0 0 4 0V2h2v4a4 4 0 0 1-8 0V2zm0 12h8v2H4v-2z"/></svg>
                                </button>
                            </div>
                            <div class="brownote-toolbar-divider"></div>
                            <div class="brownote-toolbar-group">
                                <select class="brownote-font-select" id="brownote-font-family">
                                    <option value="-apple-system, sans-serif">System</option>
                                    <option value="Georgia, serif">Georgia</option>
                                    <option value="'Courier New', monospace">Courier</option>
                                </select>
                                <select class="brownote-size-select" id="brownote-font-size">
                                    <option value="14">14</option>
                                    <option value="16" selected>16</option>
                                    <option value="18">18</option>
                                    <option value="20">20</option>
                                    <option value="24">24</option>
                                </select>
                            </div>
                            <div class="brownote-toolbar-spacer"></div>
                            <div class="brownote-toolbar-group">
                                <span class="brownote-file-label" id="brownote-file-label">Untitled</span>
                                <button class="brownote-tool-btn" id="brownote-clear" title="Clear">
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6zM14.5 3a1 1 0 0 0-1-1h-11a1 1 0 0 0-1 1v1h12V3z"/><path d="M14 5H2v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V5z"/></svg>
                                </button>
                            </div>
                        </div>
                        <div class="brownote-editor" id="brownote-editor" contenteditable="true" spellcheck="true"></div>
                        <div class="brownote-statusbar">
                            <span class="brownote-status" id="brownote-word-count">0 words</span>
                            <span class="brownote-status" id="brownote-char-count">0 characters</span>
                        </div>
                    </div>
                `;
        },

            updateNoteCounts(editor, wordCountEl, charCountEl) {
        const text = editor.innerText.trim();
        const chars = text.length;
        const words = text === '' ? 0 : text.split(/\s+/).length;
        if (wordCountEl) wordCountEl.textContent = `${words} word${words !== 1 ? 's' : ''}`;
        if (charCountEl) charCountEl.textContent = `${chars} character${chars !== 1 ? 's' : ''}`;
    },

        initEvents(windowElement) {
        const editor = windowElement.querySelector('#brownote-editor');
        const wordCount = windowElement.querySelector('#brownote-word-count');
        const charCount = windowElement.querySelector('#brownote-char-count');
        const fontSelect = windowElement.querySelector('#brownote-font-family');
        const sizeSelect = windowElement.querySelector('#brownote-font-size');
        const clearBtn = windowElement.querySelector('#brownote-clear');
        const openBtn = windowElement.querySelector('#brownote-open');
        const saveBtn = windowElement.querySelector('#brownote-save');
        const fileLabel = windowElement.querySelector('#brownote-file-label');

        let currentFilePath = null;

        const loadFile = async (filePath) => {
            const content = await window.filesystem.readFile(filePath);
            if (content !== null) {
                editor.innerText = content;
                currentFilePath = filePath;
                const fileName = filePath.split('/').pop();
                if (fileLabel) fileLabel.textContent = fileName;
                this.updateNoteCounts(editor, wordCount, charCount);
            }
        };

        const saveFile = async () => {
            if (!currentFilePath) {
                const fileName = await window.BrowDialog.prompt('Save File', 'Enter file name:', 'untitled.txt');
                if (!fileName) return;
                const folderPath = await window.BrowDialog.prompt('Save Location', 'Enter folder path:', '/Documents');
                if (!folderPath) {
                    await window.BrowDialog.alert('Error', 'No folder path provided.');
                    return;
                }
                const cleanFolder = folderPath.endsWith('/') ? folderPath.slice(0, -1) : folderPath;
                currentFilePath = `${cleanFolder}/${fileName}`;
                const success = await window.filesystem.createFile(currentFilePath, editor.innerText);
                if (success) {
                    if (fileLabel) fileLabel.textContent = fileName;
                    await window.BrowDialog.alert('Success', 'File saved successfully.');
                } else {
                    await window.BrowDialog.alert('Error', 'Failed to save file.');
                }
                return;
            }

            const success = await window.filesystem.createFile(currentFilePath, editor.innerText);
            if (success) {
                await window.BrowDialog.alert('Success', 'File saved successfully.');
            } else {
                await window.BrowDialog.alert('Error', 'Failed to save file.');
            }
        };

        if (openBtn) {
            openBtn.addEventListener('click', async () => {
                const filePath = await window.BrowDialog.prompt('Open File', 'Enter full file path:', '/');
                if (filePath) {
                    await loadFile(filePath);
                }
            });
        }

        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                await saveFile();
            });
        }

        const saved = localStorage.getItem('browos_note_content');
        if (editor) {
            editor.innerHTML = saved || '';
            this.updateNoteCounts(editor, wordCount, charCount);

            editor.addEventListener('input', () => {
                localStorage.setItem('browos_note_content', editor.innerHTML);
                this.updateNoteCounts(editor, wordCount, charCount);
            });
        }

        if (fontSelect) {
            fontSelect.addEventListener('change', () => {
                editor.style.fontFamily = fontSelect.value;
                localStorage.setItem('browos_note_font', fontSelect.value);
            });
            const savedFont = localStorage.getItem('browos_note_font');
            if (savedFont) {
                editor.style.fontFamily = savedFont;
                fontSelect.value = savedFont;
            }
        }

        if (sizeSelect) {
            sizeSelect.addEventListener('change', () => {
                editor.style.fontSize = `${sizeSelect.value}px`;
                localStorage.setItem('browos_note_size', sizeSelect.value);
            });
            const savedSize = localStorage.getItem('browos_note_size');
            if (savedSize) {
                editor.style.fontSize = `${savedSize}px`;
                sizeSelect.value = savedSize;
            }
        }

        windowElement.querySelectorAll('.brownote-tool-btn[data-action]').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.getAttribute('data-action');
                document.execCommand(action, false, null);
                editor.focus();
            });
        });

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                editor.innerHTML = '';
                currentFilePath = null;
                if (fileLabel) fileLabel.textContent = 'Untitled';
                localStorage.setItem('browos_note_content', '');
                this.updateNoteCounts(editor, wordCount, charCount);
            });
        }

        windowElement.openFileInBrowNote = loadFile;
        }
    };

    root.BrowAppNote = NoteApp;
    if (root.AppRegistry) {
        root.AppRegistry.register('brownote', NoteApp);
    }
})(typeof window !== 'undefined' ? window : this);
