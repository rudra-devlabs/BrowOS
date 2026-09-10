/**
 * BrowOS — CodeBrow (Monaco Editor IDE Subsystem)
 * Powered by Microsoft Monaco Editor & BrowOS Virtual FileSystem
 */

// Global Monaco loader with local node_modules & CDN fallback
window.ensureMonaco = function() {
    if (window.monaco && window.monaco.editor) {
        return Promise.resolve(window.monaco);
    }
    if (window._monacoLoadingPromise) {
        return window._monacoLoadingPromise;
    }

    window._monacoLoadingPromise = new Promise((resolve, reject) => {
        const loadScript = (src) => new Promise((res, rej) => {
            const s = document.createElement('script');
            s.src = src;
            s.onload = res;
            s.onerror = rej;
            document.head.appendChild(s);
        });

        const setupEnvironment = (vsBase, isLocal = true) => {
            const getWorkerUrl = function(workerId, label) {
                if (isLocal) {
                    if (label === 'json') return '/node_modules/monaco-editor/min/vs/language/json/json.worker.js';
                    if (label === 'css' || label === 'scss' || label === 'less') return '/node_modules/monaco-editor/min/vs/language/css/css.worker.js';
                    if (label === 'html' || label === 'handlebars' || label === 'razor') return '/node_modules/monaco-editor/min/vs/language/html/html.worker.js';
                    if (label === 'typescript' || label === 'javascript') return '/node_modules/monaco-editor/min/vs/language/typescript/ts.worker.js';
                    return '/node_modules/monaco-editor/min/vs/editor/editor.worker.js';
                }
                return `data:text/javascript;charset=utf-8,${encodeURIComponent(`
                    self.MonacoEnvironment = { baseUrl: '${vsBase.replace(/\/vs$/, '')}/' };
                    importScripts('${vsBase}/base/worker/workerMain.js');
                `)}`;
            };

            window.MonacoEnvironment = {
                getWorkerUrl: getWorkerUrl,
                getWorker: function(workerId, label) {
                    return new Worker(getWorkerUrl(workerId, label));
                }
            };

            window.require(['vs/editor/editor.main'], () => {
                resolve(window.monaco);
            }, (err) => {
                console.error('[CodeBrow] AMD require failed:', err);
                reject(err);
            });
        };

        // Try local node_modules first
        loadScript('/node_modules/monaco-editor/min/vs/loader.js')
            .then(() => {
                window.require.config({ paths: { vs: '/node_modules/monaco-editor/min/vs' } });
                setupEnvironment('/node_modules/monaco-editor/min/vs', true);
            })
            .catch(() => {
                console.warn('[CodeBrow] Local monaco-editor loader not reachable, attempting CDN fallback...');
                const cdnBase = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs';
                loadScript(cdnBase + '/loader.js')
                    .then(() => {
                        window.require.config({ paths: { vs: cdnBase } });
                        setupEnvironment(cdnBase, false);
                    })
                    .catch((cdnErr) => {
                        console.error('[CodeBrow] Failed to load Monaco Editor from CDN:', cdnErr);
                        reject(cdnErr);
                    });
            });
    });

    return window._monacoLoadingPromise;
};

/**
 * Clean SVG icons for CodeBrow
 */
const CodeBrowIcons = {
    folder: `<svg width="14" height="14" viewBox="0 0 24 24" fill="#dcb67a"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"/></svg>`,
    folderOpen: `<svg width="14" height="14" viewBox="0 0 24 24" fill="#dcb67a"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
    chevronRight: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>`,
    chevronDown: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>`,
    close: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
    fileCode: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`,
    fileText: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`,
    js: `<svg width="13" height="13" viewBox="0 0 24 24" fill="#f7df1e"><rect width="24" height="24" rx="3" fill="#323330"/><path d="M16.5 17c-.8 0-1.4-.4-1.8-1l1.1-1.1c.3.4.6.6 1 .6.5 0 .8-.2.8-.6 0-.4-.3-.5-.9-.8l-.4-.2c-1-.5-1.5-1-1.5-1.9 0-1.1.9-1.9 2.2-1.9 1 0 1.6.4 2 1l-1 1.1c-.3-.3-.6-.5-.9-.5-.4 0-.7.2-.7.5 0 .4.3.5.8.7l.4.2c1.1.5 1.7 1 1.7 2 0 1.2-.9 2-2.3 2zM9 17c-1.3 0-2.1-.8-2.1-2.1h1.5c0 .5.3.8.8.8.4 0 .7-.3.7-.8V9.5H11v5.4C11 16.2 10.2 17 9 17z"/></svg>`,
    py: `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path fill="#3776AB" d="M11.91 2c-3.14 0-2.95 1.36-2.95 1.36l.03 1.41h2.98v.42H6.06S4 4.96 4 8.16s1.8 3.08 1.8 3.08h1.08v-1.52c0-1.74 1.51-1.63 1.51-1.63h2.94V7.67H7.42S7.42 6.5 8.7 6.5h3.21V2zm-1.55 1.25a.65.65 0 110 1.3.65.65 0 010-1.3z"/><path fill="#FFD43B" d="M12.09 22c3.14 0 2.95-1.36 2.95-1.36l-.03-1.41h-2.98v-.42h5.91s2.06.23 2.06-2.97-1.8-3.08-1.8-3.08h-1.08v1.52c0 1.74-1.51 1.63-1.51 1.63h-2.94v.42h3.91s0 1.17-1.28 1.17h-3.21V22zm1.55-1.25a.65.65 0 110-1.3.65.65 0 010 1.3z"/></svg>`,
    html: `<svg width="13" height="13" viewBox="0 0 24 24" fill="#e34f26"><path d="M12 2L3 5l2 14 7 3 7-3 2-14-9-3zm6 5.5l-.2 2.5H8.3l.2 2H17l-.5 5.5-4.5 1.5-4.5-1.5-.3-3.5h2l.1 1.8 2.7.8 2.7-.8.3-2.8H7.7L7 5.5h11z"/></svg>`,
    css: `<svg width="13" height="13" viewBox="0 0 24 24" fill="#1572b6"><path d="M12 2L3 5l2 14 7 3 7-3 2-14-9-3zm6 5.5l-.2 2.5H8.3l.2 2H17l-.5 5.5-4.5 1.5-4.5-1.5-.3-3.5h2l.1 1.8 2.7.8 2.7-.8.3-2.8H7.7L7 5.5h11z"/></svg>`,
    json: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M4 7c0-2 1-3 3-3h1M4 17c0 2 1 3 3 3h1M20 7c0-2-1-3-3-3h-1M20 17c0 2-1 3-3 3h-1M2 12h3M22 12h-3"/></svg>`,
    md: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="7 15 7 9 10 12 13 9 13 15"/><polyline points="17 12 17 15 15 13"/></svg>`
};

/**
 * Main CodeBrow Controller (Full Visual Studio Code Workstation with Deep FileSystem Integration)
 */
class CodeBrowApp {
    constructor() {
        this.container = null;
        this.windowObj = null;
        this.editor = null;
        this.openTabs = []; // { path, name, model, isDirty, tabElement, uri, isDeleted }
        this.activeTab = null;
        this.sidebarOpen = true;
        this.panelOpen = true;
        this.activePanelTab = 'terminal';
        this.expandedFolders = new Set(['/', '/Desktop']);
        this.selectedFolderPath = '/Desktop';
        this.terminalSession = null;
        this.fontSize = 13;
        this._resizeObserver = null;
        this._menuListener = null;
        this._contextMenuListener = null;
        this._prevPanelHeight = 200;
        this._treeRefreshTimer = null;
        this._fsChangeUnsub = null;
        this._fsMountUnsub = null;
        this._fsStateUnsub = null;
    }

    async mount(container, windowObj) {
        this.container = container;
        this.windowObj = windowObj;

        // Expose openFileInCodeBrow hook on windowElement
        if (this.windowObj && this.windowObj.element) {
            this.windowObj.element.openFileInCodeBrow = (filePath) => this.openFile(filePath);
        }

        // 1. Initialize UI Controls, Menus, & Resizing
        this.initMenuBar();
        this.initSidebarAccordions();
        this.initContextMenu();
        this.initPanelResize();
        this.initPanelTabs();
        this.initKeyboardShortcuts();

        // 2. Initialize Deep FileSystem Event Sync
        this.initFilesystemEvents();

        // 3. Initialize Monaco Editor first (prevents blocking)
        try {
            await window.ensureMonaco();
            this.initMonaco();
        } catch (err) {
            console.error('[CodeBrow] Failed to initialize Monaco:', err);
            const loading = this.container.querySelector('.codebrow-editor-loading');
            if (loading) {
                loading.innerHTML = `<span style="color:#ef4444;">Failed to load Monaco Editor: ${err.message || err}</span>`;
            }
        }

        // 4. Initialize Embedded Terminal Session in Bottom Panel
        this.initEmbeddedTerminal();

        // 5. Render File Tree independently
        try {
            this.updateWorkspaceHeader();
            await this.renderFileTree();
        } catch (err) {
            console.warn('[CodeBrow] Error rendering file tree:', err);
        }

        // 6. Open initial tab (Welcome file or untitled)
        try {
            const defaultFile = '/Desktop/Welcome.txt';
            let hasFile = false;
            if (window.filesystem && typeof window.filesystem.exists === 'function') {
                hasFile = await window.filesystem.exists(defaultFile);
            }
            if (hasFile) {
                await this.openFile(defaultFile);
            } else {
                this.createUntitledTab();
            }
        } catch (err) {
            this.createUntitledTab();
        }
    }

    /* ─── Deep FileSystem Event Subscriptions & Auto-Sync ─── */
    initFilesystemEvents() {
        if (!window.filesystem || typeof window.filesystem.on !== 'function') return;

        // Live filesystem change subscription
        this._fsChangeUnsub = window.filesystem.on('change', (event) => {
            this.handleFsChange(event);
        });

        // Mount / Unmount lifecycle
        this._fsMountUnsub = window.filesystem.on('mount', () => {
            this.updateWorkspaceHeader();
            this.renderFileTree();
            this.appendOutput('[FileSystem] Volume mounted. Tree reloaded.\n');
        });

        this._fsStateUnsub = window.filesystem.on('statechange', () => {
            this.updateWorkspaceHeader();
        });
    }

    updateWorkspaceHeader() {
        const titleEl = this.container.querySelector('.workspace-section .codebrow-section-title');
        if (!titleEl) return;
        const mountedName = window.filesystem?.getMountedName?.();
        titleEl.textContent = mountedName ? `${mountedName} (Workspace)` : 'BrowOS Workspace';
    }

    handleFsChange(event) {
        if (!event) return;

        // Debounce tree re-render to support bulk operations smoothly
        clearTimeout(this._treeRefreshTimer);
        this._treeRefreshTimer = setTimeout(() => {
            this.renderFileTree();
        }, 120);

        const changePath = event.path || event.newPath;
        if (!changePath) return;

        // Live sync with open tabs
        this.openTabs.forEach(async (tab) => {
            if (!tab.path) return;

            // 1. External Deletion
            if (event.type === 'delete' && tab.path === event.path) {
                tab.isDeleted = true;
                const nameEl = tab.tabElement.querySelector('.codebrow-tab-name');
                if (nameEl) nameEl.textContent = `${tab.name} (deleted)`;
                this.appendOutput(`[FileSystem] ${tab.path} was deleted from disk.\n`);
                return;
            }

            // 2. External Rename / Move
            if ((event.type === 'rename' || event.type === 'move') && tab.path === event.oldPath) {
                const newPath = event.newPath;
                tab.path = newPath;
                tab.name = newPath.split('/').pop();
                tab.language = this.getLanguageForFile(tab.name);
                const nameEl = tab.tabElement.querySelector('.codebrow-tab-name');
                if (nameEl) nameEl.textContent = tab.name;
                const iconEl = tab.tabElement.querySelector('.codebrow-tab-icon');
                if (iconEl) iconEl.innerHTML = this.getFileIcon(tab.name);

                if (tab === this.activeTab) {
                    this.updateBreadcrumbs(newPath);
                    const langEl = this.container.querySelector('.codebrow-status-lang');
                    if (langEl) langEl.textContent = tab.language.toUpperCase();
                }
                this.updateOpenEditorsUI();
                this.appendOutput(`[FileSystem] ${event.oldPath} moved to ${newPath}\n`);
                return;
            }

            // 3. External Content Modification (from terminal, python script, or filebrow)
            if ((event.type === 'write' || event.type === 'create') && tab.path === changePath) {
                // If the user hasn't made unsaved edits in Monaco, auto-reload content from disk!
                if (!tab.isDirty && tab.model) {
                    try {
                        const newContent = await window.filesystem.readFile(tab.path);
                        if (newContent !== null && newContent !== undefined && newContent !== tab.model.getValue()) {
                            // Preserve cursor position during reload
                            const pos = this.editor?.getPosition();
                            tab.model.setValue(newContent);
                            if (pos && tab === this.activeTab && this.editor) {
                                this.editor.setPosition(pos);
                            }
                            this.appendOutput(`[FileSystem] Auto-reloaded ${tab.path} from disk.\n`);
                        }
                    } catch (_) {}
                }
            }
        });
    }

    /* ─── Top Menu Bar & Shortcuts ─── */
    initMenuBar() {
        const menuBar = this.container.querySelector('.codebrow-menubar');
        if (!menuBar) return;

        let menuOpen = false;
        const menuItems = menuBar.querySelectorAll('.codebrow-menu-item');

        const closeAllMenus = () => {
            menuItems.forEach(item => item.classList.remove('active'));
            menuOpen = false;
        };

        menuItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const wasActive = item.classList.contains('active');
                closeAllMenus();
                if (!wasActive) {
                    item.classList.add('active');
                    menuOpen = true;
                }
            });

            item.addEventListener('mouseenter', () => {
                if (menuOpen) {
                    menuItems.forEach(i => i.classList.remove('active'));
                    item.classList.add('active');
                }
            });
        });

        // Global click to dismiss dropdowns
        this._menuListener = (e) => {
            if (!e.target.closest('.codebrow-menubar')) {
                closeAllMenus();
            }
            if (!e.target.closest('.codebrow-context-menu')) {
                this.hideContextMenu();
            }
        };
        window.addEventListener('click', this._menuListener);

        // Menu entry actions
        const entries = menuBar.querySelectorAll('.codebrow-menu-entry');
        entries.forEach(entry => {
            entry.addEventListener('click', (e) => {
                e.stopPropagation();
                closeAllMenus();
                const action = entry.dataset.action;
                this.handleMenuAction(action);
            });
        });
    }

    handleMenuAction(action) {
        switch (action) {
            case 'new-file':
                this.createNewFilePrompt();
                break;
            case 'open-file':
                this.openFilePrompt();
                break;
            case 'save':
                this.saveCurrentFile();
                break;
            case 'save-as':
                this.saveAsPrompt();
                break;
            case 'close-editor':
                if (this.activeTab) this.closeTab(this.activeTab);
                break;
            case 'undo':
                if (this.editor) this.editor.trigger('menu', 'undo');
                break;
            case 'redo':
                if (this.editor) this.editor.trigger('menu', 'redo');
                break;
            case 'cut':
                document.execCommand('cut');
                break;
            case 'copy':
                document.execCommand('copy');
                break;
            case 'paste':
                navigator.clipboard?.readText?.().then(text => {
                    if (this.editor) {
                        const sel = this.editor.getSelection();
                        this.editor.executeEdits('menu', [{ range: sel, text: text, forceMoveMarkers: true }]);
                    }
                }).catch(() => {});
                break;
            case 'find':
                if (this.editor) this.editor.getAction('actions.find')?.run();
                break;
            case 'replace':
                if (this.editor) this.editor.getAction('editor.action.startFindReplaceAction')?.run();
                break;
            case 'select-all':
                if (this.editor) this.editor.getAction('editor.action.selectAll')?.run();
                break;
            case 'toggle-sidebar':
                this.toggleSidebar();
                break;
            case 'toggle-panel':
                this.toggleBottomPanel();
                break;
            case 'zoom-in':
                this.fontSize = Math.min(24, this.fontSize + 1);
                if (this.editor) this.editor.updateOptions({ fontSize: this.fontSize });
                break;
            case 'zoom-out':
                this.fontSize = Math.max(9, this.fontSize - 1);
                if (this.editor) this.editor.updateOptions({ fontSize: this.fontSize });
                break;
            case 'run-code':
                this.runCurrentFile();
                break;
            case 'new-terminal':
                this.restartTerminal();
                break;
            case 'clear-terminal':
                if (this.terminalSession?.term) this.terminalSession.term.clear();
                break;
            case 'about':
                this._browAlert('CodeBrow', 'CodeBrow — VS Code in BrowOS\nBuilt with Monaco Editor & BrowShell POSIX Virtual Kernel.');
                break;
        }
    }

    initKeyboardShortcuts() {
        if (!this.container) return;
        // NOTE: legacy Ctrl+W/P/B/` and Alt+Shift bindings removed — the
        // former collide with browser close/print/bookmarks, the latter with
        // the Windows layout hotkey. Rebound to Ctrl+Alt chords, which the
        // browser always delivers:
        //   Ctrl+Alt+B sidebar · Ctrl+Alt+` bottom panel
        //   Ctrl+Alt+X close tab · Ctrl+Alt+O open file · Ctrl+Alt+R run
        this.container.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.altKey && !e.shiftKey && !e.metaKey
                && !(e.getModifierState && e.getModifierState('AltGraph'))) {
                switch (e.code) {
                    case 'KeyB': e.preventDefault(); this.toggleSidebar(); return;
                    case 'Backquote': e.preventDefault(); this.toggleBottomPanel(); return;
                    case 'KeyX': e.preventDefault(); if (this.activeTab) this.closeTab(this.activeTab); return;
                    case 'KeyO': e.preventDefault(); this.openFilePrompt(); return;
                    case 'KeyR': e.preventDefault(); this.runCurrentFile(); return;
                }
            }
            if (e.key === 'F5') {
                e.preventDefault();
                this.runCurrentFile();
            }
        });
    }

    /* ─── Quick Input Palette Overlay ─── */
    showQuickInput({ placeholder = '', defaultValue = '', onAccept }) {
        const overlay = this.container.querySelector('.codebrow-quick-input-overlay');
        const box = this.container.querySelector('.codebrow-quick-input-box');
        const list = this.container.querySelector('.codebrow-quick-input-list');
        if (!overlay || !box) return;

        overlay.style.display = 'flex';
        box.placeholder = placeholder;
        box.value = defaultValue;
        if (list) list.innerHTML = '';

        setTimeout(() => {
            box.focus();
            box.select();
        }, 30);

        let closed = false;
        const close = () => {
            if (closed) return;
            closed = true;
            overlay.style.display = 'none';
            if (this.editor) this.editor.focus();
        };

        const onKeyDown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const val = box.value.trim();
                close();
                box.removeEventListener('keydown', onKeyDown);
                box.removeEventListener('blur', onBlur);
                if (val && onAccept) onAccept(val);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                close();
                box.removeEventListener('keydown', onKeyDown);
                box.removeEventListener('blur', onBlur);
            }
        };

        const onBlur = () => {
            setTimeout(() => {
                if (document.activeElement !== box && !overlay.contains(document.activeElement)) {
                    close();
                    box.removeEventListener('keydown', onKeyDown);
                    box.removeEventListener('blur', onBlur);
                }
            }, 150);
        };

        box.addEventListener('keydown', onKeyDown);
        box.addEventListener('blur', onBlur);
    }

    /* ─── Sidebar Accordions & Explorer ─── */
    initSidebarAccordions() {
        const headers = this.container.querySelectorAll('.codebrow-section-header');
        headers.forEach(hdr => {
            hdr.addEventListener('click', (e) => {
                if (e.target.closest('.codebrow-sidebar-header-actions')) return;
                const section = hdr.closest('.codebrow-sidebar-section');
                if (!section) return;
                const chevron = hdr.querySelector('.codebrow-section-chevron');
                const list = section.querySelector('.codebrow-open-editors-list, .codebrow-sidebar-content');
                if (list) {
                    const isClosed = list.style.display === 'none';
                    list.style.display = isClosed ? (list.classList.contains('codebrow-sidebar-content') ? 'block' : 'flex') : 'none';
                    if (chevron) chevron.classList.toggle('closed', !isClosed);
                }
            });
        });

        // New File in Explorer Header
        const newFileBtn = this.container.querySelector('.codebrow-btn-new-file');
        if (newFileBtn) {
            newFileBtn.addEventListener('click', () => this.createNewFilePrompt());
        }

        // New Folder in Explorer Header
        const newFolderBtn = this.container.querySelector('.codebrow-btn-new-folder');
        if (newFolderBtn) {
            newFolderBtn.addEventListener('click', () => this.createNewFolderPrompt());
        }

        // Refresh Explorer Header
        const refreshBtn = this.container.querySelector('.codebrow-btn-refresh');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.renderFileTree());
        }
    }

    toggleSidebar() {
        const sidebar = this.container.querySelector('.codebrow-sidebar');
        if (!sidebar) return;
        this.sidebarOpen = !this.sidebarOpen;
        sidebar.style.display = this.sidebarOpen ? 'flex' : 'none';
        if (this.editor) setTimeout(() => this.editor.layout(), 50);
        if (this.terminalSession?.fit) setTimeout(() => this.terminalSession.fit(), 50);
    }

    /* ─── Explorer Context Menu (Right Click) ─── */
    initContextMenu() {
        const sidebar = this.container.querySelector('.codebrow-sidebar');
        if (!sidebar) return;

        sidebar.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const treeItem = e.target.closest('.codebrow-tree-item');
            if (treeItem) {
                const itemPath = treeItem.dataset.itemPath;
                const isDir = treeItem.dataset.isDir === 'true';
                this.showContextMenu(e.clientX, e.clientY, itemPath, isDir, treeItem);
            } else {
                // Empty area context menu
                this.showContextMenu(e.clientX, e.clientY, this.selectedFolderPath || '/', true, null);
            }
        });
    }

    showContextMenu(x, y, itemPath, isDir, element) {
        const menu = this.container.querySelector('.codebrow-context-menu');
        if (!menu) return;

        menu.innerHTML = '';

        const addItem = (label, action, shortcut = '', danger = false) => {
            const div = document.createElement('div');
            div.className = `codebrow-context-item${danger ? ' danger' : ''}`;
            div.innerHTML = `<span>${label}</span>${shortcut ? `<span class="codebrow-context-shortcut">${shortcut}</span>` : ''}`;
            div.addEventListener('click', (e) => {
                e.stopPropagation();
                this.hideContextMenu();
                action();
            });
            menu.appendChild(div);
        };

        const addSep = () => {
            const sep = document.createElement('div');
            sep.className = 'codebrow-context-sep';
            menu.appendChild(sep);
        };

        if (isDir) {
            addItem('New File', () => this.createNewFilePrompt(itemPath));
            addItem('New Folder', () => this.createNewFolderPrompt(itemPath));
            addSep();
            addItem('Open in Integrated Terminal', () => this.openInTerminal(itemPath));
            addItem('Reveal in FileBrow', () => this.revealInFileBrow(itemPath));
            addItem('Copy Path', () => this._copyPath(itemPath));
            addSep();
            if (itemPath !== '/') {
                addItem('Rename', () => this.renameTreeItem(itemPath, true, element), 'F2');
                addItem('Delete Folder', () => this.deleteItem(itemPath, true), 'Del', true);
            }
        } else {
            addItem('Open', () => this.openFile(itemPath));
            addItem('Run in Terminal', () => this.runFile(itemPath));
            addSep();
            addItem('Copy Path', () => this._copyPath(itemPath));
            addItem('Reveal in FileBrow', () => this.revealInFileBrow(itemPath));
            addSep();
            addItem('Rename', () => this.renameTreeItem(itemPath, false, element), 'F2');
            addItem('Duplicate', () => this.duplicateFile(itemPath));
            addSep();
            addItem('Delete', () => this.deleteItem(itemPath, false), 'Del', true);
        }

        // Position menu within viewport
        menu.style.display = 'flex';
        const rect = menu.getBoundingClientRect();
        const winW = window.innerWidth;
        const winH = window.innerHeight;

        const left = (x + rect.width > winW) ? (winW - rect.width - 10) : x;
        const top = (y + rect.height > winH) ? (winH - rect.height - 10) : y;

        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
    }

    hideContextMenu() {
        const menu = this.container.querySelector('.codebrow-context-menu');
        if (menu) menu.style.display = 'none';
    }

    openInTerminal(folderPath) {
        if (!this.panelOpen) this.toggleBottomPanel();
        this.switchPanelTab('terminal');

        const cmd = `cd "${folderPath}"`;
        this.appendOutput(`[Terminal] ${cmd}\n`);
        if (this.terminalSession?.engine?.execute) {
            this.terminalSession.engine.execute(cmd);
        } else if (this.terminalSession?.term) {
            this.terminalSession.term.paste(cmd + '\r');
        }
    }

    _browAlert(title, message) {
        if (window.BrowDialog && typeof window.BrowDialog.alert === 'function') {
            return window.BrowDialog.alert(title, message);
        }
        alert(`${title}\n\n${message}`);
        return Promise.resolve();
    }

    _browConfirm(title, message) {
        if (window.BrowDialog && typeof window.BrowDialog.confirm === 'function') {
            return window.BrowDialog.confirm(title, message, true);
        }
        return Promise.resolve(confirm(`${title}\n\n${message}`));
    }

    async _copyPath(itemPath) {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(itemPath);
            } else {
                const ta = document.createElement('textarea');
                ta.value = itemPath;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                ta.remove();
            }
            this.appendOutput(`[FileSystem] Copied path: ${itemPath}\n`);
        } catch (err) {
            this.appendOutput(`[FileSystem] Copy path failed: ${err.message}\n`);
        }
    }

    revealInFileBrow(itemPath) {
        if (!window.windowManager) return;
        const launch = window.windowManager.launchApp
            ? window.windowManager.launchApp('filebrow')
            : (typeof window.windowManager.openWindow === 'function' ? window.windowManager.openWindow('filebrow') : null);
        void launch;
        const dir = itemPath.includes('/') ? (itemPath.substring(0, itemPath.lastIndexOf('/')) || '/') : '/';
        setTimeout(() => {
            try {
                if (window.filebrowApp && typeof window.filebrowApp.navigateTo === 'function') {
                    window.filebrowApp.navigateTo(dir.startsWith('/') ? dir : `/${dir}`);
                }
            } catch {}
        }, 400);
        this.appendOutput(`[FileBrow] Revealed ${itemPath}\n`);
    }

    async duplicateFile(filePath) {
        if (!window.filesystem) return;
        try {
            const content = await window.filesystem.readFile(filePath);
            const dir = filePath.substring(0, filePath.lastIndexOf('/')) || '/';
            const fullName = filePath.split('/').pop();
            const dotIdx = fullName.lastIndexOf('.');
            const base = dotIdx !== -1 ? fullName.substring(0, dotIdx) : fullName;
            const ext = dotIdx !== -1 ? fullName.substring(dotIdx) : '';
            const newPath = dir.endsWith('/') ? `${dir}${base}_copy${ext}` : `${dir}/${base}_copy${ext}`;

            const saveFn = window.filesystem.writeFile || window.filesystem.createFile;
            await saveFn.call(window.filesystem, newPath, content || '');
            await this.renderFileTree();
            await this.openFile(newPath);
            this.appendOutput(`[FileSystem] Duplicated ${filePath} -> ${newPath}\n`);
        } catch (err) {
            this.appendOutput(`[FileSystem] Duplicate failed: ${err.message}\n`);
            await this._browAlert('Duplicate Failed', err.message);
        }
    }

    async deleteItem(itemPath, isDir) {
        if (!window.filesystem) return;
        const name = itemPath.split('/').pop();
        const ok = await this._browConfirm('Delete', `Are you sure you want to delete '${name}'?`);
        if (!ok) return;

        try {
            await window.filesystem.delete(itemPath);
            try { window.BrowSettings?.audio?.play('trash'); } catch (e) {}

            // Close tab if deleted file was open
            const openTab = this.openTabs.find(t => t.path === itemPath);
            if (openTab) {
                this.closeTab(openTab);
            }
            await this.renderFileTree();
            this.appendOutput(`[FileSystem] Deleted ${itemPath}\n`);
        } catch (err) {
            this.appendOutput(`[FileSystem] Delete failed: ${err.message}\n`);
            await this._browAlert('Delete Failed', `Failed to delete '${name}': ${err.message}`);
        }
    }

    renameTreeItem(itemPath, isDir, element) {
        if (!element) return;
        const labelEl = element.querySelector('.codebrow-tree-label');
        if (!labelEl) return;

        const oldName = itemPath.split('/').pop();
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'codebrow-inline-create-input';
        input.value = oldName;
        input.style.width = '120px';

        labelEl.style.display = 'none';
        element.insertBefore(input, labelEl.nextSibling);

        setTimeout(() => {
            input.focus();
            const dot = oldName.lastIndexOf('.');
            if (!isDir && dot > 0) {
                input.setSelectionRange(0, dot);
            } else {
                input.select();
            }
        }, 20);

        let committed = false;

        const commitRename = async () => {
            if (committed) return;
            committed = true;
            const newName = input.value.trim();
            input.remove();
            labelEl.style.display = '';

            if (!newName || newName === oldName || /[\/\\:*?"<>|]/.test(newName)) {
                return;
            }

            try {
                await window.filesystem.rename(itemPath, newName);
                await this.renderFileTree();
                this.appendOutput(`[FileSystem] Renamed ${itemPath} -> ${newName}\n`);
            } catch (err) {
                this.appendOutput(`[FileSystem] Rename failed: ${err.message}\n`);
                await this._browAlert('Rename Failed', err.message);
            }
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                commitRename();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                committed = true;
                input.remove();
                labelEl.style.display = '';
            }
        });

        input.addEventListener('blur', () => {
            commitRename();
        });
    }

    /* ─── Bottom Panel & Draggable Resizer ─── */
    initPanelTabs() {
        const tabs = this.container.querySelectorAll('.codebrow-panel-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.dataset.panel;
                this.switchPanelTab(target);
            });
        });

        // Header Action Buttons
        const newTermBtn = this.container.querySelector('.codebrow-btn-new-term');
        if (newTermBtn) {
            newTermBtn.addEventListener('click', () => this.restartTerminal());
        }

        const clearTermBtn = this.container.querySelector('.codebrow-btn-clear-term');
        if (clearTermBtn) {
            clearTermBtn.addEventListener('click', () => {
                if (this.terminalSession?.term) this.terminalSession.term.clear();
            });
        }

        const maxBtn = this.container.querySelector('.codebrow-btn-maximize-panel');
        if (maxBtn) {
            maxBtn.addEventListener('click', () => this.toggleMaximizePanel());
        }

        const closeBtn = this.container.querySelector('.codebrow-btn-close-panel');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.toggleBottomPanel());
        }

        // Status Bar Problems Button
        const statusProb = this.container.querySelector('.codebrow-status-problems');
        if (statusProb) {
            statusProb.addEventListener('click', () => {
                this.switchPanelTab('problems');
                if (!this.panelOpen) this.toggleBottomPanel();
            });
        }
    }

    switchPanelTab(tabName) {
        this.activePanelTab = tabName;
        const tabs = this.container.querySelectorAll('.codebrow-panel-tab');
        tabs.forEach(t => t.classList.toggle('active', t.dataset.panel === tabName));

        const views = this.container.querySelectorAll('.codebrow-panel-view');
        views.forEach(v => {
            v.classList.toggle('active', v.classList.contains(`${tabName}-view`));
        });

        if (tabName === 'terminal' && this.terminalSession) {
            setTimeout(() => {
                this.terminalSession.fit();
                this.terminalSession.term?.focus();
            }, 30);
        }
    }

    toggleBottomPanel() {
        const panel = this.container.querySelector('.codebrow-bottom-panel');
        const divider = this.container.querySelector('.codebrow-panel-divider');
        if (!panel) return;

        this.panelOpen = !this.panelOpen;
        panel.classList.toggle('collapsed', !this.panelOpen);
        if (divider) divider.style.display = this.panelOpen ? 'block' : 'none';

        if (this.editor) setTimeout(() => this.editor.layout(), 50);
        if (this.panelOpen && this.activePanelTab === 'terminal' && this.terminalSession) {
            setTimeout(() => {
                this.terminalSession.fit();
                this.terminalSession.term?.focus();
            }, 60);
        }
    }

    toggleMaximizePanel() {
        const panel = this.container.querySelector('.codebrow-bottom-panel');
        const split = this.container.querySelector('.codebrow-editor-panel-split');
        if (!panel || !split) return;

        const maxH = Math.floor(split.clientHeight * 0.85);
        if (panel.offsetHeight >= maxH - 20) {
            panel.style.height = `${this._prevPanelHeight || 200}px`;
        } else {
            this._prevPanelHeight = panel.offsetHeight;
            panel.style.height = `${maxH}px`;
        }
        if (this.editor) this.editor.layout();
        if (this.terminalSession?.fit) this.terminalSession.fit();
    }

    initPanelResize() {
        const divider = this.container.querySelector('.codebrow-panel-divider');
        const panel = this.container.querySelector('.codebrow-bottom-panel');
        const split = this.container.querySelector('.codebrow-editor-panel-split');
        if (!divider || !panel || !split) return;

        let isDragging = false;
        let startY = 0;
        let startH = 0;

        divider.addEventListener('pointerdown', (e) => {
            isDragging = true;
            divider.classList.add('is-dragging');
            startY = e.clientY;
            startH = panel.offsetHeight;
            divider.setPointerCapture(e.pointerId);
        });

        divider.addEventListener('pointermove', (e) => {
            if (!isDragging) return;
            const delta = startY - e.clientY;
            const maxH = split.clientHeight - 70;
            const newH = Math.max(35, Math.min(maxH, startH + delta));
            panel.style.height = `${newH}px`;
            this._prevPanelHeight = newH;
            if (this.editor) this.editor.layout();
            if (this.terminalSession?.fit) this.terminalSession.fit();
        });

        const stopDrag = (e) => {
            if (!isDragging) return;
            isDragging = false;
            divider.classList.remove('is-dragging');
            try { divider.releasePointerCapture(e.pointerId); } catch (_) {}
            if (this.editor) this.editor.layout();
            if (this.terminalSession?.fit) this.terminalSession.fit();
        };

        divider.addEventListener('pointerup', stopDrag);
        divider.addEventListener('pointercancel', stopDrag);
    }

    /* ─── Integrated Terminal ─── */
    async initEmbeddedTerminal() {
        const mount = this.container.querySelector('.codebrow-terminal-mount');
        if (!mount) return;

        if (typeof window.ensureCliSubsystem === 'function') {
            await window.ensureCliSubsystem();
        }

        if (typeof window.TerminalSession !== 'function') {
            console.warn('[CodeBrow] TerminalSession class not yet exported.');
            return;
        }

        // Clean any existing
        if (this.terminalSession) {
            this.terminalSession.dispose();
            this.terminalSession = null;
        }
        mount.innerHTML = '';

        const paneEl = document.createElement('div');
        paneEl.className = 'terminal-pane is-active';
        mount.appendChild(paneEl);

        const session = new window.TerminalSession(
            paneEl,
            this.selectedFolderPath || '/Desktop',
            'dracula',
            13,
            (title) => {
                const sel = this.container.querySelector('.codebrow-panel-select');
                if (sel) sel.innerHTML = `<option value="1">1: ${title.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bash'}</option>`;
            },
            () => {}
        );

        this.terminalSession = session;
        await session.init(false);
        setTimeout(() => session.fit(), 80);
    }

    restartTerminal() {
        this.initEmbeddedTerminal();
        this.switchPanelTab('terminal');
    }

    runCurrentFile() {
        if (!this.activeTab || !this.activeTab.path) {
            this._browAlert('Run File', 'Please save the file to BrowOS FileSystem before running.');
            return;
        }
        this.runFile(this.activeTab.path);
    }

    runFile(filePath) {
        if (!this.panelOpen) this.toggleBottomPanel();
        this.switchPanelTab('terminal');

        const ext = (filePath.split('.').pop() || '').toLowerCase();
        let cmd = '';

        if (ext === 'py') {
            cmd = `python3 "${filePath}"`;
        } else if (ext === 'js' || ext === 'mjs') {
            cmd = `node "${filePath}"`;
        } else if (ext === 'sh' || ext === 'bash') {
            cmd = `bash "${filePath}"`;
        } else {
            cmd = `cat "${filePath}"`;
        }

        this.appendOutput(`[Running] ${cmd}\n`);

        if (this.terminalSession?.engine?.execute) {
            this.terminalSession.engine.execute(cmd);
        } else if (this.terminalSession?.term) {
            this.terminalSession.term.paste(cmd + '\r');
        }
    }

    appendOutput(text) {
        const out = this.container.querySelector('.codebrow-output-content');
        if (out) {
            out.textContent += text;
            out.scrollTop = out.scrollHeight;
        }
    }

    /* ─── Monaco Editor Instance ─── */
    initMonaco() {
        const monacoContainer = this.container.querySelector('.codebrow-monaco-container');
        if (!monacoContainer) return;

        monacoContainer.innerHTML = '';

        this.editor = monaco.editor.create(monacoContainer, {
            theme: 'vs-dark',
            fontSize: this.fontSize,
            fontFamily: '"Ubuntu Mono", Consolas, "Courier New", monospace',
            lineNumbers: 'on',
            roundedSelection: true,
            scrollBeyondLastLine: false,
            readOnly: false,
            cursorBlinking: 'smooth',
            smoothScrolling: true,
            renderWhitespace: 'selection',
            minimap: { enabled: true },
            tabSize: 4,
            automaticLayout: true
        });

        // Cursor position tracking -> Status Bar
        this.editor.onDidChangeCursorPosition((e) => {
            const posEl = this.container.querySelector('.codebrow-status-pos');
            if (posEl && e.position) {
                posEl.textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
            }
        });

        // Content modification tracking -> Tab dirty dot & Open Editors list
        this.editor.onDidChangeModelContent(() => {
            if (this.activeTab && !this.activeTab.isDirty) {
                this.activeTab.isDirty = true;
                if (this.activeTab.modifiedDot) this.activeTab.modifiedDot.style.display = 'block';
                this.updateOpenEditorsUI();
            }
        });

        // Save shortcut
        this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
            this.saveCurrentFile();
        });

        // Monaco Diagnostics / Problem Markers Listener
        monaco.editor.onDidChangeMarkers(() => {
            this.updateDiagnosticsUI();
        });

        // Window resize observer
        this._resizeObserver = new ResizeObserver(() => {
            if (this.editor) this.editor.layout();
            if (this.terminalSession?.fit) this.terminalSession.fit();
        });
        this._resizeObserver.observe(monacoContainer);

        // Window close cleanup
        if (this.windowObj) {
            const origClose = this.windowObj.onClose;
            this.windowObj.onClose = () => {
                this.dispose();
                if (origClose) origClose();
            };
        }
    }

    updateDiagnosticsUI() {
        if (!window.monaco) return;
        const markers = monaco.editor.getModelMarkers({});
        const errors = markers.filter(m => m.severity === 8).length; // MarkerSeverity.Error = 8
        const warnings = markers.filter(m => m.severity === 4).length; // MarkerSeverity.Warning = 4

        // Update status bar problems text
        const statusTxt = this.container.querySelector('.problems-status-text');
        if (statusTxt) {
            statusTxt.textContent = `⊗ ${errors}  ⚠ ${warnings}`;
        }

        // Update panel problems badge
        const badge = this.container.querySelector('.problems-badge');
        if (badge) {
            badge.textContent = markers.length.toString();
        }

        // Update problems list view
        const listEl = this.container.querySelector('.codebrow-problems-list');
        if (!listEl) return;

        if (markers.length === 0) {
            listEl.innerHTML = `<div style="color:#858585;padding:12px;font-style:italic;">No problems have been detected in the workspace.</div>`;
            return;
        }

        listEl.innerHTML = '';
        markers.forEach(m => {
            const row = document.createElement('div');
            row.className = 'codebrow-problem-item';
            const iconColor = m.severity === 8 ? '#f87171' : '#f59e0b';
            const iconSym = m.severity === 8 ? '⊗' : '⚠';
            const fileName = m.resource?.path?.split('/')?.pop() || 'file';

            row.innerHTML = `
                <span style="color:${iconColor};font-weight:bold;margin-right:4px;">${iconSym}</span>
                <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${m.message}</span>
                <span style="color:#858585;font-size:11px;margin-left:8px;">${fileName} [${m.startLineNumber}, ${m.startColumn}]</span>
            `;

            row.addEventListener('click', () => {
                if (this.editor && m.resource) {
                    const model = monaco.editor.getModel(m.resource);
                    if (model) {
                        this.editor.setModel(model);
                        this.editor.revealPositionInCenter({ lineNumber: m.startLineNumber, column: m.startColumn });
                        this.editor.setPosition({ lineNumber: m.startLineNumber, column: m.startColumn });
                        this.editor.focus();
                    }
                }
            });

            listEl.appendChild(row);
        });
    }

    /* ─── Breadcrumbs Trail ─── */
    updateBreadcrumbs(filePath) {
        const crumbEl = this.container.querySelector('.codebrow-breadcrumbs');
        if (!crumbEl) return;

        if (!filePath) {
            crumbEl.innerHTML = `
                <span class="codebrow-breadcrumb-item">
                    ${CodeBrowIcons.folder}
                    <span>BrowOS</span>
                </span>
                <span class="codebrow-breadcrumb-sep">&gt;</span>
                <span class="codebrow-breadcrumb-item">
                    ${CodeBrowIcons.js}
                    <span>Untitled</span>
                </span>
            `;
            return;
        }

        const parts = filePath.split('/').filter(Boolean);
        let html = `
            <span class="codebrow-breadcrumb-item">
                ${CodeBrowIcons.folder}
                <span>BrowOS</span>
            </span>
        `;

        parts.forEach((p, i) => {
            html += `<span class="codebrow-breadcrumb-sep">&gt;</span>`;
            const isLast = i === parts.length - 1;
            const icon = isLast ? this.getFileIcon(p) : CodeBrowIcons.folder;
            html += `
                <span class="codebrow-breadcrumb-item">
                    ${icon}
                    <span>${p}</span>
                </span>
            `;
        });

        crumbEl.innerHTML = html;
    }

    /* ─── Open Editors List Sync ─── */
    updateOpenEditorsUI() {
        const listEl = this.container.querySelector('.codebrow-open-editors-list');
        const countEl = this.container.querySelector('.open-editors-section .codebrow-section-count');
        if (countEl) countEl.textContent = `(${this.openTabs.length})`;
        if (!listEl) return;

        listEl.innerHTML = '';
        this.openTabs.forEach(tab => {
            const itemEl = document.createElement('div');
            itemEl.className = 'codebrow-open-editor-item' + (tab === this.activeTab ? ' active' : '');
            itemEl.innerHTML = `
                <span class="codebrow-open-editor-dot" style="display:${tab.isDirty ? 'block' : 'none'};"></span>
                <span style="display:flex;align-items:center;margin-right:4px;">${this.getFileIcon(tab.name)}</span>
                <span class="codebrow-open-editor-name">${tab.name}${tab.isDeleted ? ' (deleted)' : ''}</span>
                <span class="codebrow-open-editor-close" title="Close">${CodeBrowIcons.close}</span>
            `;

            itemEl.addEventListener('click', (e) => {
                if (!e.target.closest('.codebrow-open-editor-close')) {
                    this.switchTab(tab);
                }
            });

            itemEl.querySelector('.codebrow-open-editor-close').addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeTab(tab);
            });

            listEl.appendChild(itemEl);
        });
    }

    /* ─── Workspace Tree (with Drag & Drop + Deep FS) ─── */
    async renderFileTree() {
        const contentEl = this.container.querySelector('.codebrow-sidebar-content');
        if (!contentEl || !window.filesystem) return;

        contentEl.dataset.dirPath = '/';
        contentEl.innerHTML = '';

        const renderDirectory = async (dirPath, containerEl, depth = 0) => {
            let items = null;
            if (typeof window.filesystem.readdir === 'function') {
                items = await window.filesystem.readdir(dirPath);
            } else if (typeof window.filesystem.list === 'function') {
                items = await window.filesystem.list(dirPath);
            }
            if (!items || !Array.isArray(items)) return;

            items.sort((a, b) => {
                const aDir = a.isDirectory || a.type === 'directory' || a.kind === 'directory';
                const bDir = b.isDirectory || b.type === 'directory' || b.kind === 'directory';
                if (aDir !== bDir) return aDir ? -1 : 1;
                return (a.name || '').localeCompare(b.name || '');
            });

            for (const item of items) {
                const isDir = item.isDirectory || item.type === 'directory' || item.kind === 'directory';
                const itemPath = dirPath === '/' ? `/${item.name}` : `${dirPath}/${item.name}`;
                const row = document.createElement('div');
                row.className = 'codebrow-tree-item';
                row.style.paddingLeft = `${depth * 14 + 10}px`;
                row.dataset.itemPath = itemPath;
                row.dataset.isDir = isDir ? 'true' : 'false';
                row.draggable = true;

                // Drag and drop event handlers
                row.addEventListener('dragstart', (e) => {
                    e.stopPropagation();
                    row.classList.add('is-dragging');
                    e.dataTransfer.setData('text/plain', itemPath);
                    e.dataTransfer.effectAllowed = 'move';
                });

                row.addEventListener('dragend', () => {
                    row.classList.remove('is-dragging');
                });

                if (isDir) {
                    const isExpanded = this.expandedFolders.has(itemPath);
                    row.innerHTML = `
                        <span class="codebrow-tree-chevron" style="display:flex;align-items:center;">
                            ${isExpanded ? CodeBrowIcons.chevronDown : CodeBrowIcons.chevronRight}
                        </span>
                        <span class="codebrow-tree-icon folder" style="display:flex;align-items:center;margin:0 4px;">
                            ${isExpanded ? CodeBrowIcons.folderOpen : CodeBrowIcons.folder}
                        </span>
                        <span class="codebrow-tree-label">${item.name}</span>
                    `;

                    const childWrap = document.createElement('div');
                    childWrap.className = 'codebrow-tree-children';
                    childWrap.dataset.dirPath = itemPath;
                    childWrap.style.display = isExpanded ? 'block' : 'none';

                    // Drag target onto folder
                    row.addEventListener('dragover', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        row.classList.add('drag-over');
                    });

                    row.addEventListener('dragleave', () => {
                        row.classList.remove('drag-over');
                    });

                    row.addEventListener('drop', async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        row.classList.remove('drag-over');
                        const sourcePath = e.dataTransfer.getData('text/plain');
                        if (!sourcePath || sourcePath === itemPath || itemPath.startsWith(sourcePath + '/')) return;

                        const fileName = sourcePath.split('/').pop();
                        const destPath = itemPath.endsWith('/') ? `${itemPath}${fileName}` : `${itemPath}/${fileName}`;
                        try {
                            await window.filesystem.move(sourcePath, destPath);
                            this.appendOutput(`[FileSystem] Moved ${sourcePath} -> ${destPath}\n`);
                            await this.renderFileTree();
                        } catch (err) {
                            this.appendOutput(`[FileSystem] Move failed: ${err.message}\n`);
                            await this._browAlert('Move Failed', err.message);
                        }
                    });

                    row.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        this.selectedFolderPath = itemPath;
                        this.container.querySelectorAll('.codebrow-tree-item').forEach(el => el.classList.remove('active'));
                        row.classList.add('active');

                        if (this.expandedFolders.has(itemPath)) {
                            this.expandedFolders.delete(itemPath);
                            childWrap.style.display = 'none';
                            const chev = row.querySelector('.codebrow-tree-chevron');
                            const icn = row.querySelector('.codebrow-tree-icon');
                            if (chev) chev.innerHTML = CodeBrowIcons.chevronRight;
                            if (icn) icn.innerHTML = CodeBrowIcons.folder;
                        } else {
                            this.expandedFolders.add(itemPath);
                            childWrap.innerHTML = '';
                            await renderDirectory(itemPath, childWrap, depth + 1);
                            childWrap.style.display = 'block';
                            const chev = row.querySelector('.codebrow-tree-chevron');
                            const icn = row.querySelector('.codebrow-tree-icon');
                            if (chev) chev.innerHTML = CodeBrowIcons.chevronDown;
                            if (icn) icn.innerHTML = CodeBrowIcons.folderOpen;
                        }
                    });

                    containerEl.appendChild(row);
                    containerEl.appendChild(childWrap);

                    if (isExpanded) {
                        await renderDirectory(itemPath, childWrap, depth + 1);
                    }
                } else {
                    const icon = this.getFileIcon(item.name);
                    row.innerHTML = `
                        <span class="codebrow-tree-chevron" style="width:11px;display:inline-block;"></span>
                        <span class="codebrow-tree-icon file" style="display:flex;align-items:center;margin:0 4px;">
                            ${icon}
                        </span>
                        <span class="codebrow-tree-label">${item.name}</span>
                    `;

                    row.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.selectedFolderPath = itemPath.substring(0, itemPath.lastIndexOf('/')) || '/';
                        this.container.querySelectorAll('.codebrow-tree-item').forEach(el => el.classList.remove('active'));
                        row.classList.add('active');
                        this.openFile(itemPath);
                    });

                    containerEl.appendChild(row);
                }
            }
        };

        await renderDirectory('/', contentEl, 0);
    }

    getFileIcon(filename) {
        const ext = (filename.split('.').pop() || '').toLowerCase();
        if (ext === 'js' || ext === 'mjs') return CodeBrowIcons.js;
        if (ext === 'py') return CodeBrowIcons.py;
        if (ext === 'html' || ext === 'htm') return CodeBrowIcons.html;
        if (ext === 'css') return CodeBrowIcons.css;
        if (ext === 'json') return CodeBrowIcons.json;
        if (ext === 'md') return CodeBrowIcons.md;
        if (ext === 'sh' || ext === 'bash') return CodeBrowIcons.fileCode;
        return CodeBrowIcons.fileText;
    }

    getLanguageForFile(filename) {
        const ext = (filename.split('.').pop() || '').toLowerCase();
        const map = {
            js: 'javascript',
            mjs: 'javascript',
            jsx: 'javascript',
            ts: 'typescript',
            tsx: 'typescript',
            py: 'python',
            html: 'html',
            htm: 'html',
            css: 'css',
            scss: 'scss',
            json: 'json',
            md: 'markdown',
            sh: 'shell',
            bash: 'shell',
            sql: 'sql',
            xml: 'xml',
            yaml: 'yaml',
            yml: 'yaml',
            c: 'c',
            cpp: 'cpp',
            java: 'java',
            txt: 'plaintext'
        };
        return map[ext] || 'plaintext';
    }

    /* ─── File Operations & Tabs ─── */
    async openFile(filePath) {
        if (!window.filesystem) return;

        const existing = this.openTabs.find(t => t.path === filePath);
        if (existing) {
            this.switchTab(existing);
            return;
        }

        const fileName = filePath.split('/').filter(Boolean).pop() || 'untitled';
        let content = '';
        try {
            content = await window.filesystem.readFile(filePath);
            if (content === null || content === undefined) content = '';
        } catch (e) {
            content = '';
        }

        await window.ensureMonaco();

        const language = this.getLanguageForFile(fileName);
        const uri = monaco.Uri.file(filePath);
        let model = monaco.editor.getModel(uri);
        if (!model) {
            model = monaco.editor.createModel(content, language, uri);
        } else {
            model.setValue(content);
        }

        const tabsContainer = this.container.querySelector('.codebrow-tabs');
        const tabEl = document.createElement('div');
        tabEl.className = 'codebrow-tab';

        const iconHtml = this.getFileIcon(fileName);
        tabEl.innerHTML = `
            <span class="codebrow-tab-icon">${iconHtml}</span>
            <span class="codebrow-tab-name">${fileName}</span>
            <span class="codebrow-tab-modified"></span>
            <span class="codebrow-tab-close" title="Close">${CodeBrowIcons.close}</span>
        `;

        const modifiedDot = tabEl.querySelector('.codebrow-tab-modified');
        const closeBtn = tabEl.querySelector('.codebrow-tab-close');

        const tabObj = {
            path: filePath,
            name: fileName,
            language: language,
            model: model,
            isDirty: false,
            tabElement: tabEl,
            modifiedDot: modifiedDot,
            isDeleted: false
        };

        tabEl.addEventListener('click', (e) => {
            if (!e.target.closest('.codebrow-tab-close')) {
                this.switchTab(tabObj);
            }
        });

        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeTab(tabObj);
        });

        tabsContainer.appendChild(tabEl);
        this.openTabs.push(tabObj);
        this.switchTab(tabObj);
        this.updateOpenEditorsUI();
    }

    createUntitledTab() {
        if (!this.editor || !window.monaco) return;

        const name = `Untitled-${this.openTabs.length + 1}.js`;
        const uri = monaco.Uri.file(`/${name}`);
        const model = monaco.editor.createModel('// Type your code here\nconsole.log("Welcome to CodeBrow!");\n', 'javascript', uri);

        const tabsContainer = this.container.querySelector('.codebrow-tabs');
        const tabEl = document.createElement('div');
        tabEl.className = 'codebrow-tab';

        tabEl.innerHTML = `
            <span class="codebrow-tab-icon">${CodeBrowIcons.js}</span>
            <span class="codebrow-tab-name">${name}</span>
            <span class="codebrow-tab-modified"></span>
            <span class="codebrow-tab-close" title="Close">${CodeBrowIcons.close}</span>
        `;

        const tabObj = {
            path: null,
            name: name,
            language: 'javascript',
            model: model,
            isDirty: false,
            tabElement: tabEl,
            modifiedDot: tabEl.querySelector('.codebrow-tab-modified'),
            isDeleted: false
        };

        tabEl.addEventListener('click', (e) => {
            if (!e.target.closest('.codebrow-tab-close')) {
                this.switchTab(tabObj);
            }
        });

        tabEl.querySelector('.codebrow-tab-close').addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeTab(tabObj);
        });

        tabsContainer.appendChild(tabEl);
        this.openTabs.push(tabObj);
        this.switchTab(tabObj);
        this.updateOpenEditorsUI();
    }

    switchTab(tabObj) {
        if (!tabObj || !this.editor) return;

        this.activeTab = tabObj;
        this.editor.setModel(tabObj.model);

        // Update tab styling
        this.openTabs.forEach(t => {
            t.tabElement.classList.toggle('active', t === tabObj);
        });

        // Update breadcrumbs
        this.updateBreadcrumbs(tabObj.path);

        // Update open editors active highlight
        this.updateOpenEditorsUI();

        // Update status bar
        const langEl = this.container.querySelector('.codebrow-status-lang');
        if (langEl) {
            langEl.textContent = tabObj.language.toUpperCase();
        }

        // Update Window Title
        const titleText = `${tabObj.name} — CodeBrow`;
        const centerTitle = this.container.querySelector('.codebrow-window-title');
        if (centerTitle) centerTitle.textContent = titleText;
        if (this.windowObj?.element) {
            const osTitle = this.windowObj.element.querySelector('.window-title');
            if (osTitle) osTitle.textContent = titleText;
        }

        this.editor.focus();
    }

    async saveCurrentFile() {
        if (!this.activeTab || !this.editor || !window.filesystem) return;

        let path = this.activeTab.path;
        if (!path) {
            this.saveAsPrompt();
            return;
        }

        const value = this.editor.getValue();
        try {
            const saveFn = window.filesystem.writeFile || window.filesystem.createFile;
            await saveFn.call(window.filesystem, path, value);
            this.activeTab.isDirty = false;
            this.activeTab.isDeleted = false;
            if (this.activeTab.modifiedDot) this.activeTab.modifiedDot.style.display = 'none';

            this.updateBreadcrumbs(path);
            this.updateOpenEditorsUI();

            // Flash status
            const langEl = this.container.querySelector('.codebrow-status-lang');
            if (langEl) {
                const orig = langEl.textContent;
                langEl.textContent = 'Saved ✔';
                setTimeout(() => { langEl.textContent = orig; }, 1200);
            }
            this.appendOutput(`[FileSystem] Saved ${path}\n`);
        } catch (err) {
            console.error('[CodeBrow] Save failed:', err);
            this.appendOutput(`[FileSystem] Save failed: ${err.message}\n`);
            await this._browAlert('Save Failed', `Failed to save ${path}: ${err.message}`);
        }
    }

    saveAsPrompt() {
        if (!this.activeTab) return;
        const currentPath = this.activeTab.path || `/Desktop/${this.activeTab.name}`;
        this.showQuickInput({
            placeholder: 'Save As path (e.g. /Desktop/script.js)',
            defaultValue: currentPath,
            onAccept: async (newPath) => {
                const norm = newPath.startsWith('/') ? newPath : `/${newPath}`;
                this.activeTab.path = norm;
                this.activeTab.name = norm.split('/').pop();
                const nameEl = this.activeTab.tabElement.querySelector('.codebrow-tab-name');
                if (nameEl) nameEl.textContent = this.activeTab.name;
                await this.saveCurrentFile();
            }
        });
    }

    closeTab(tabObj) {
        const index = this.openTabs.indexOf(tabObj);
        if (index === -1) return;

        tabObj.tabElement.remove();
        this.openTabs.splice(index, 1);

        if (this.activeTab === tabObj) {
            if (this.openTabs.length > 0) {
                const nextTab = this.openTabs[Math.max(0, index - 1)];
                this.switchTab(nextTab);
            } else {
                this.activeTab = null;
                if (this.editor) this.createUntitledTab();
            }
        }
        this.updateOpenEditorsUI();
    }

    /* ─── Inline File Creation in File Tree (VS Code Style) ─── */
    async createNewFilePrompt(targetDir = null) {
        if (!window.filesystem) return;

        // Ensure workspace section is open
        const workspaceSection = this.container.querySelector('.workspace-section');
        const contentEl = this.container.querySelector('.codebrow-sidebar-content');
        if (contentEl && contentEl.style.display === 'none') {
            contentEl.style.display = 'block';
            const chev = workspaceSection?.querySelector('.codebrow-section-chevron');
            if (chev) chev.classList.remove('closed');
        }

        const dir = targetDir || this.selectedFolderPath || '/Desktop';

        // Ensure directory is in expanded folders
        if (dir !== '/' && !this.expandedFolders.has(dir)) {
            this.expandedFolders.add(dir);
            await this.renderFileTree();
        }

        // Find container element
        let targetContainer = null;
        if (dir === '/') {
            targetContainer = contentEl;
        } else {
            targetContainer = this.container.querySelector(`.codebrow-sidebar-content [data-dir-path="${dir}"]`) || contentEl;
        }

        if (!targetContainer) return;

        // Check if inline creation row already exists
        const existingRow = this.container.querySelector('.codebrow-inline-create-row');
        if (existingRow) {
            existingRow.querySelector('input')?.focus();
            return;
        }

        const depth = (targetContainer === contentEl) ? 0 : dir.split('/').filter(Boolean).length;

        const inlineRow = document.createElement('div');
        inlineRow.className = 'codebrow-tree-item codebrow-inline-create-row';
        inlineRow.style.paddingLeft = `${depth * 14 + 10}px`;

        const chevronSpacer = document.createElement('span');
        chevronSpacer.className = 'codebrow-tree-chevron';
        chevronSpacer.style.width = '11px';
        chevronSpacer.style.display = 'inline-block';

        const iconSpan = document.createElement('span');
        iconSpan.className = 'codebrow-tree-icon file';
        iconSpan.style.display = 'flex';
        iconSpan.style.alignItems = 'center';
        iconSpan.style.margin = '0 4px';
        iconSpan.innerHTML = this.getFileIcon('untitled.txt');

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'codebrow-inline-create-input';
        input.placeholder = 'file name';
        input.spellcheck = false;
        input.autocomplete = 'off';

        const tooltip = document.createElement('div');
        tooltip.className = 'codebrow-inline-error-tooltip';

        inlineRow.appendChild(chevronSpacer);
        inlineRow.appendChild(iconSpan);
        inlineRow.appendChild(input);
        inlineRow.appendChild(tooltip);

        targetContainer.prepend(inlineRow);
        inlineRow.scrollIntoView({ block: 'nearest' });

        setTimeout(() => {
            input.focus();
            input.select();
        }, 30);

        let committed = false;

        const commitCreation = async () => {
            if (committed) return;
            const val = input.value.trim();
            if (!val) {
                inlineRow.remove();
                return;
            }

            if (/[\/\\:*?"<>|]/.test(val)) {
                tooltip.textContent = 'A file name cannot contain \\ / : * ? " < > |';
                tooltip.style.display = 'block';
                input.focus();
                return;
            }

            const fullPath = dir.endsWith('/') ? `${dir}${val}` : `${dir}/${val}`;
            const exists = window.filesystem && typeof window.filesystem.exists === 'function' && (await window.filesystem.exists(fullPath));
            if (exists) {
                tooltip.textContent = `A file '${val}' already exists at this location.`;
                tooltip.style.display = 'block';
                input.focus();
                return;
            }

            committed = true;
            try {
                const saveFn = window.filesystem.writeFile || window.filesystem.createFile;
                await saveFn.call(window.filesystem, fullPath, '');
                inlineRow.remove();
                await this.renderFileTree();
                await this.openFile(fullPath);
                this.appendOutput(`[FileSystem] Created ${fullPath}\n`);
            } catch (err) {
                committed = false;
                tooltip.textContent = err.message || 'Error creating file';
                tooltip.style.display = 'block';
                input.focus();
            }
        };

        input.addEventListener('input', () => {
            const val = input.value.trim();
            iconSpan.innerHTML = this.getFileIcon(val || 'file.txt');
            tooltip.style.display = 'none';
        });

        input.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                await commitCreation();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                committed = true;
                inlineRow.remove();
            }
        });

        input.addEventListener('blur', () => {
            setTimeout(async () => {
                if (committed) return;
                const val = input.value.trim();
                if (!val || /[\/\\:*?"<>|]/.test(val)) {
                    inlineRow.remove();
                } else {
                    await commitCreation();
                }
            }, 180);
        });
    }

    /* ─── Inline Folder Creation in File Tree (VS Code Style) ─── */
    async createNewFolderPrompt(targetDir = null) {
        if (!window.filesystem) return;

        const workspaceSection = this.container.querySelector('.workspace-section');
        const contentEl = this.container.querySelector('.codebrow-sidebar-content');
        if (contentEl && contentEl.style.display === 'none') {
            contentEl.style.display = 'block';
            const chev = workspaceSection?.querySelector('.codebrow-section-chevron');
            if (chev) chev.classList.remove('closed');
        }

        const dir = targetDir || this.selectedFolderPath || '/Desktop';

        if (dir !== '/' && !this.expandedFolders.has(dir)) {
            this.expandedFolders.add(dir);
            await this.renderFileTree();
        }

        let targetContainer = null;
        if (dir === '/') {
            targetContainer = contentEl;
        } else {
            targetContainer = this.container.querySelector(`.codebrow-sidebar-content [data-dir-path="${dir}"]`) || contentEl;
        }

        if (!targetContainer) return;

        const existingRow = this.container.querySelector('.codebrow-inline-create-row');
        if (existingRow) {
            existingRow.querySelector('input')?.focus();
            return;
        }

        const depth = (targetContainer === contentEl) ? 0 : dir.split('/').filter(Boolean).length;

        const inlineRow = document.createElement('div');
        inlineRow.className = 'codebrow-tree-item codebrow-inline-create-row';
        inlineRow.style.paddingLeft = `${depth * 14 + 10}px`;

        const chevronSpacer = document.createElement('span');
        chevronSpacer.className = 'codebrow-tree-chevron';
        chevronSpacer.style.width = '11px';
        chevronSpacer.style.display = 'inline-block';

        const iconSpan = document.createElement('span');
        iconSpan.className = 'codebrow-tree-icon folder';
        iconSpan.style.display = 'flex';
        iconSpan.style.alignItems = 'center';
        iconSpan.style.margin = '0 4px';
        iconSpan.innerHTML = CodeBrowIcons.folder;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'codebrow-inline-create-input';
        input.placeholder = 'folder name';
        input.spellcheck = false;
        input.autocomplete = 'off';

        const tooltip = document.createElement('div');
        tooltip.className = 'codebrow-inline-error-tooltip';

        inlineRow.appendChild(chevronSpacer);
        inlineRow.appendChild(iconSpan);
        inlineRow.appendChild(input);
        inlineRow.appendChild(tooltip);

        targetContainer.prepend(inlineRow);
        inlineRow.scrollIntoView({ block: 'nearest' });

        setTimeout(() => {
            input.focus();
            input.select();
        }, 30);

        let committed = false;

        const commitFolderCreation = async () => {
            if (committed) return;
            const val = input.value.trim();
            if (!val) {
                inlineRow.remove();
                return;
            }

            if (/[\/\\:*?"<>|]/.test(val)) {
                tooltip.textContent = 'A folder name cannot contain \\ / : * ? " < > |';
                tooltip.style.display = 'block';
                input.focus();
                return;
            }

            const fullPath = dir.endsWith('/') ? `${dir}${val}` : `${dir}/${val}`;
            const exists = window.filesystem && typeof window.filesystem.exists === 'function' && (await window.filesystem.exists(fullPath));
            if (exists) {
                tooltip.textContent = `A folder '${val}' already exists at this location.`;
                tooltip.style.display = 'block';
                input.focus();
                return;
            }

            committed = true;
            try {
                if (typeof window.filesystem.createDirectory === 'function') {
                    await window.filesystem.createDirectory(fullPath);
                } else if (typeof window.filesystem.ensureDirectory === 'function') {
                    await window.filesystem.ensureDirectory(fullPath);
                }
                inlineRow.remove();
                this.expandedFolders.add(fullPath);
                await this.renderFileTree();
                this.appendOutput(`[FileSystem] Created directory ${fullPath}\n`);
            } catch (err) {
                committed = false;
                tooltip.textContent = err.message || 'Error creating folder';
                tooltip.style.display = 'block';
                input.focus();
            }
        };

        input.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                await commitFolderCreation();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                committed = true;
                inlineRow.remove();
            }
        });

        input.addEventListener('blur', () => {
            setTimeout(async () => {
                if (committed) return;
                const val = input.value.trim();
                if (!val || /[\/\\:*?"<>|]/.test(val)) {
                    inlineRow.remove();
                } else {
                    await commitFolderCreation();
                }
            }, 180);
        });
    }

    openFilePrompt() {
        this.showQuickInput({
            placeholder: 'Type file path to open (e.g. /Desktop/Welcome.txt)',
            defaultValue: '/Desktop/',
            onAccept: (path) => {
                const norm = path.startsWith('/') ? path : `/${path}`;
                this.openFile(norm);
            }
        });
    }

    dispose() {
        if (this._menuListener) {
            window.removeEventListener('click', this._menuListener);
            this._menuListener = null;
        }
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }
        if (this._fsChangeUnsub) {
            this._fsChangeUnsub();
            this._fsChangeUnsub = null;
        }
        if (this._fsMountUnsub) {
            this._fsMountUnsub();
            this._fsMountUnsub = null;
        }
        if (this._fsStateUnsub) {
            this._fsStateUnsub();
            this._fsStateUnsub = null;
        }
        if (this.terminalSession) {
            this.terminalSession.dispose();
            this.terminalSession = null;
        }
        if (this.editor) {
            this.editor.dispose();
            this.editor = null;
        }
        this.openTabs.forEach(t => {
            if (t.model) t.model.dispose();
        });
        this.openTabs = [];
        this.activeTab = null;
    }
}

// Register globally
if (typeof window !== 'undefined') {
    window.CodeBrowApp = CodeBrowApp;
}
