/**
 * BrowOS Spotlight Universal Search Subsystem
 * High-performance OS-wide search powered by SQLite3-WASM full-text indexing,
 * app launcher, VFS document search, and inline calculation engine.
 */
(function(root) {
    'use strict';

    class SpotlightEngine {
        constructor() {
            this.isOpen = false;
            this.items = [];
            this.filteredItems = [];
            this.selectedIndex = 0;
            this.db = null;
            this.isWasmActive = false;
            this.overlay = null;
            this.input = null;
            this.resultsList = null;
            this.wasmTag = null;
            this.debounceTimer = null;

            this.initUI();
            this.bindHotkeys();
            this.initSqliteWasm();
        }

        async initSqliteWasm() {
            try {
                if (window.SqliteRuntime && typeof window.SqliteRuntime.initSqlJs === 'function') {
                    const SQL = await window.SqliteRuntime.initSqlJs();
                    this.db = new SQL.Database();
                    this.db.run(`
                        CREATE TABLE spotlight (
                            id TEXT PRIMARY KEY,
                            title TEXT,
                            subtitle TEXT,
                            category TEXT,
                            icon TEXT,
                            actionType TEXT,
                            actionData TEXT
                        );
                    `);
                    this.isWasmActive = true;
                    if (this.wasmTag) {
                        this.wasmTag.textContent = 'SQLite WASM';
                        this.wasmTag.title = 'Full-Text Indexing accelerated by SQLite3 WebAssembly';
                    }
                    this.rebuildIndex();
                }
            } catch (err) {
                console.warn('[Spotlight] SQLite WASM init fallback to in-memory index:', err);
                this.isWasmActive = false;
            }
        }

        initUI() {
            if (document.getElementById('spotlight-overlay')) return;

            const overlay = document.createElement('div');
            overlay.id = 'spotlight-overlay';
            overlay.innerHTML = `
                <div id="spotlight-container">
                    <div class="spotlight-search-bar">
                        <svg class="spotlight-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                        <input type="text" id="spotlight-input" placeholder="Spotlight Search (apps, files, math...)" autocomplete="off" spellcheck="false">
                        <span class="spotlight-wasm-tag" id="spotlight-wasm-tag">WASM Ready</span>
                    </div>
                    <ul class="spotlight-results" id="spotlight-results">
                        <li class="spotlight-empty">Type to search apps, files, or calculate...</li>
                    </ul>
                    <div class="spotlight-footer">
                        <span>BrowOS Spotlight</span>
                        <div class="spotlight-footer-keys">
                            <span><span class="spotlight-key">↑</span><span class="spotlight-key">↓</span> Navigate</span>
                            <span><span class="spotlight-key">↵</span> Open</span>
                            <span><span class="spotlight-key">ESC</span> Close</span>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);

            this.overlay = overlay;
            this.input = overlay.querySelector('#spotlight-input');
            this.resultsList = overlay.querySelector('#spotlight-results');
            this.wasmTag = overlay.querySelector('#spotlight-wasm-tag');

            // Overlay click backdrop to close
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) this.close();
            });

            // Input handlers
            this.input.addEventListener('input', () => this.handleInput());
            this.input.addEventListener('keydown', (e) => this.handleKeyDown(e));

            // Inject icon into Menu Bar
            this.injectMenuBarButton();
        }

        injectMenuBarButton() {
            const statusBar = document.querySelector('#menu-bar .status-bar');
            if (!statusBar) return;

            let btn = statusBar.querySelector('.status-spotlight-btn');
            if (!btn) {
                btn = document.createElement('div');
                btn.className = 'status-spotlight-btn';
                btn.id = 'status-spotlight-btn';
                btn.title = 'Spotlight Search ( ` )';
                btn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                `;
                const clock = statusBar.querySelector('#clock');
                if (clock) {
                    statusBar.insertBefore(btn, clock);
                } else {
                    statusBar.appendChild(btn);
                }
            }
            btn.onclick = () => this.toggle();
        }

        bindHotkeys() {
            window.addEventListener('keydown', (e) => {
                // Opened via the global ` desktop key (js/shortcuts.js).
                // Ctrl+Space / Ctrl+K are browser/IME-reserved — never used.
                if (e.key === 'Escape' && this.isOpen) {
                    e.preventDefault();
                    this.close();
                }
            }, true);
        }

        toggle() {
            if (this.isOpen) this.close();
            else this.open();
        }

        open() {
            this.isOpen = true;
            this.overlay.classList.add('visible');
            this.input.value = '';
            this.input.focus();
            this.rebuildIndex();
            this.renderResults(this.items.slice(0, 8));
        }

        close() {
            this.isOpen = false;
            this.overlay.classList.remove('visible');
            this.input.blur();
        }

        async rebuildIndex() {
            const items = [];

            // 1. Applications
            if (window.appsManager && window.appsManager.apps) {
                const apps = window.appsManager.apps;
                for (const [id, info] of Object.entries(apps)) {
                    items.push({
                        id: `app:${id}`,
                        title: info.name,
                        subtitle: `Application · ${info.windowTitle || info.name}`,
                        category: 'App',
                        icon: info.icon || (window.BrowOSIcons && window.BrowOSIcons.launchpad),
                        actionType: 'app',
                        actionData: id
                    });
                }
            }

            // 2. System Actions
            items.push({
                id: 'action:terminal',
                title: 'Open Terminal',
                subtitle: 'Launch BrowShell Command Line Interface',
                category: 'System',
                icon: window.BrowOSIcons ? window.BrowOSIcons.terminal : '',
                actionType: 'app',
                actionData: 'terminal'
            });
            items.push({
                id: 'action:settings_wasm',
                title: 'WASM Hardware Acceleration',
                subtitle: 'View active WebAssembly subsystems & live benchmarks',
                category: 'System',
                icon: window.BrowOSIcons ? window.BrowOSIcons.settings : '',
                actionType: 'settings_wasm',
                actionData: 'wasm'
            });
            items.push({
                id: 'action:restart',
                title: 'Restart BrowOS',
                subtitle: 'Reboot desktop environment',
                category: 'System',
                icon: window.BrowOSIcons ? window.BrowOSIcons.settings : '',
                actionType: 'restart',
                actionData: ''
            });

            // 3. Filesystem files
            if (window.filesystem && window.filesystem.isReady()) {
                try {
                    await this.crawlFilesystem('/', items, 3);
                } catch (e) {
                    console.warn('[Spotlight] Filesystem indexing warning:', e);
                }
            }

            this.items = items;

            // Sync with SQLite WASM table if active
            if (this.isWasmActive && this.db) {
                try {
                    this.db.run('DELETE FROM spotlight;');
                    const stmt = this.db.prepare(`
                        INSERT INTO spotlight (id, title, subtitle, category, icon, actionType, actionData)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `);
                    for (const item of items) {
                        stmt.run([item.id, item.title, item.subtitle, item.category, item.icon, item.actionType, item.actionData]);
                    }
                    stmt.free();
                } catch (e) {
                    console.error('[Spotlight] SQLite indexing error:', e);
                }
            }
        }

        async crawlFilesystem(dirPath, items, maxDepth) {
            if (maxDepth <= 0) return;
            const fs = window.filesystem;
            const entries = await fs.list(dirPath);
            if (!Array.isArray(entries)) return;

            for (const entry of entries) {
                const fullPath = dirPath === '/' ? `/${entry.name}` : `${dirPath}/${entry.name}`;
                if (entry.type === 'directory') {
                    items.push({
                        id: `dir:${fullPath}`,
                        title: entry.name,
                        subtitle: `Folder · ${fullPath}`,
                        category: 'Folder',
                        icon: (window.BrowOSIcons && window.BrowOSIcons.filebrow) || '',
                        actionType: 'open_folder',
                        actionData: fullPath
                    });
                    if (!entry.name.startsWith('.')) {
                        await this.crawlFilesystem(fullPath, items, maxDepth - 1);
                    }
                } else {
                    const ext = entry.name.includes('.') ? entry.name.split('.').pop().toLowerCase() : '';
                    let category = 'File';
                    if (['js', 'ts', 'py', 'c', 'cpp', 'html', 'css', 'json', 'wasm'].includes(ext)) category = 'Code';
                    else if (['txt', 'md', 'pdf', 'doc'].includes(ext)) category = 'Document';
                    else if (['png', 'jpg', 'jpeg', 'svg', 'gif'].includes(ext)) category = 'Image';

                    items.push({
                        id: `file:${fullPath}`,
                        title: entry.name,
                        subtitle: `${category} · ${fullPath}`,
                        category: category,
                        icon: (window.BrowOSIcons && window.BrowOSIcons.filebrow) || '',
                        actionType: 'open_file',
                        actionData: fullPath
                    });
                }
            }
        }

        handleInput() {
            const query = this.input.value.trim();
            if (!query) {
                this.renderResults(this.items.slice(0, 8));
                return;
            }

            // 1. Math expression evaluation (e.g. 25 * 4, sqrt(64), sin(1))
            const mathResult = this.evaluateMath(query);
            let matches = [];

            if (mathResult !== null) {
                matches.push({
                    id: 'calc:result',
                    title: `${query} = ${mathResult}`,
                    subtitle: 'Calculation Result (Press Enter to copy to clipboard)',
                    category: 'Calculator',
                    icon: (window.BrowOSIcons && window.BrowOSIcons.apps && window.BrowOSIcons.apps.calculator) || '',
                    actionType: 'copy',
                    actionData: String(mathResult),
                    highlightedTitle: `${this.escapeHtml(query)} = <strong>${this.escapeHtml(String(mathResult))}</strong>`
                });
            }

            // 2. High-Performance Universal Fuzzy Matching & Scoring
            const scoredItems = [];
            const queryLower = query.toLowerCase();

            for (const item of this.items) {
                let bestMatch = null;

                if (window.FuzzyMatcher) {
                    const titleMatch = window.FuzzyMatcher.match(query, item.title);
                    if (titleMatch) {
                        bestMatch = {
                            score: titleMatch.score + 60, // Title relevance bonus
                            indices: titleMatch.indices,
                            field: 'title'
                        };
                    } else {
                        const subMatch = window.FuzzyMatcher.match(query, item.subtitle);
                        if (subMatch) {
                            bestMatch = {
                                score: subMatch.score,
                                indices: subMatch.indices,
                                field: 'subtitle'
                            };
                        }
                    }
                } else {
                    const tIdx = item.title.toLowerCase().indexOf(queryLower);
                    if (tIdx !== -1) {
                        bestMatch = { score: 100 - tIdx, indices: [], field: 'title' };
                    } else {
                        const sIdx = item.subtitle.toLowerCase().indexOf(queryLower);
                        if (sIdx !== -1) {
                            bestMatch = { score: 50 - sIdx, indices: [], field: 'subtitle' };
                        }
                    }
                }

                if (bestMatch) {
                    scoredItems.push({
                        item,
                        score: bestMatch.score,
                        indices: bestMatch.indices,
                        field: bestMatch.field
                    });
                }
            }

            // Sort results descending by intelligent fuzzy score
            scoredItems.sort((a, b) => b.score - a.score);

            // Limit to top 15 results and attach highlights
            const topResults = scoredItems.slice(0, 15);
            for (const res of topResults) {
                const clone = { ...res.item };
                if (window.FuzzyMatcher && res.indices.length > 0) {
                    if (res.field === 'title') {
                        clone.highlightedTitle = window.FuzzyMatcher.highlight(res.item.title, res.indices, 'spotlight-match');
                    } else if (res.field === 'subtitle') {
                        clone.highlightedSubtitle = window.FuzzyMatcher.highlight(res.item.subtitle, res.indices, 'spotlight-match');
                    }
                }
                matches.push(clone);
            }

            this.renderResults(matches);
        }

        evaluateMath(expr) {
            if (/^[0-9+\-*/().\s^%eEpiPI]+$/.test(expr) && /[+\-*/^%]/.test(expr)) {
                try {
                    const sanitized = expr
                        .replace(/\^/g, '**')
                        .replace(/\bpi\b/gi, 'Math.PI')
                        .replace(/\bsin\b/gi, 'Math.sin')
                        .replace(/\bcos\b/gi, 'Math.cos')
                        .replace(/\bsqrt\b/gi, 'Math.sqrt');
                    // Safe evaluation
                    const fn = new Function(`"use strict"; return (${sanitized});`);
                    const val = fn();
                    if (typeof val === 'number' && !isNaN(val) && isFinite(val)) {
                        return Number.isInteger(val) ? val : parseFloat(val.toFixed(6));
                    }
                } catch (e) {
                    return null;
                }
            }
            return null;
        }

        renderResults(items) {
            this.filteredItems = items;
            this.selectedIndex = 0;
            this.resultsList.innerHTML = '';

            if (items.length === 0) {
                this.resultsList.innerHTML = `<li class="spotlight-empty">No results found for "${this.escapeHtml(this.input.value)}"</li>`;
                return;
            }

            items.forEach((item, idx) => {
                const li = document.createElement('li');
                li.className = `spotlight-item ${idx === 0 ? 'selected' : ''}`;
                li.dataset.index = idx;

                const iconHtml = item.icon
                    ? (item.icon.endsWith('.svg') || item.icon.endsWith('.png')
                        ? `<img src="${item.icon}" alt="">`
                        : `<div class="spotlight-svg-icon">${item.icon}</div>`)
                    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path></svg>`;

                const titleHtml = item.highlightedTitle || this.escapeHtml(item.title);
                const subtitleHtml = item.highlightedSubtitle || this.escapeHtml(item.subtitle);

                li.innerHTML = `
                    <div class="spotlight-item-icon">${iconHtml}</div>
                    <div class="spotlight-item-info">
                        <div class="spotlight-item-title">${titleHtml}</div>
                        <div class="spotlight-item-sub">${subtitleHtml}</div>
                    </div>
                    <span class="spotlight-item-badge">${this.escapeHtml(item.category)}</span>
                `;

                li.addEventListener('click', () => {
                    this.selectedIndex = idx;
                    this.executeSelected();
                });

                this.resultsList.appendChild(li);
            });
        }

        handleKeyDown(e) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (this.filteredItems.length > 0) {
                    this.selectedIndex = (this.selectedIndex + 1) % this.filteredItems.length;
                    this.updateSelection();
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (this.filteredItems.length > 0) {
                    this.selectedIndex = (this.selectedIndex - 1 + this.filteredItems.length) % this.filteredItems.length;
                    this.updateSelection();
                }
            } else if (e.key === 'Enter') {
                e.preventDefault();
                this.executeSelected();
            }
        }

        updateSelection() {
            const elements = this.resultsList.querySelectorAll('.spotlight-item');
            elements.forEach((el, idx) => {
                if (idx === this.selectedIndex) {
                    el.classList.add('selected');
                    el.scrollIntoView({ block: 'nearest' });
                } else {
                    el.classList.remove('selected');
                }
            });
        }

        executeSelected() {
            const item = this.filteredItems[this.selectedIndex];
            if (!item) return;

            this.close();

            switch (item.actionType) {
                case 'app':
                    if (window.appsManager) {
                        window.appsManager.launchApp(item.actionData);
                    }
                    break;

                case 'settings_wasm':
                    if (window.appsManager) {
                        window.appsManager.launchApp('settings');
                        setTimeout(() => {
                            const wasmTab = document.querySelector('[data-section="wasm"]');
                            if (wasmTab) wasmTab.click();
                        }, 200);
                    }
                    break;

                case 'open_file':
                    if (window.appsManager) {
                        // Open in CodeBrow
                        window.appsManager.launchApp('codebrow');
                        setTimeout(() => {
                            if (window.CodeBrowApp && window.CodeBrowApp.instance) {
                                window.CodeBrowApp.instance.openFile(item.actionData);
                            }
                        }, 300);
                    }
                    break;

                case 'open_folder':
                    if (window.appsManager) {
                        window.appsManager.launchApp('filebrow');
                    }
                    break;

                case 'copy':
                    if (navigator.clipboard) {
                        navigator.clipboard.writeText(item.actionData);
                        console.log('[Spotlight] Copied to clipboard:', item.actionData);
                    }
                    break;

                case 'restart':
                    if (window.BrowOS && window.BrowOS.restart) {
                        window.BrowOS.restart();
                    }
                    break;
            }
        }

        escapeHtml(s) {
            if (!s) return '';
            return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }
    }

    // Auto-mount on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            root.BrowOSSpotlight = new SpotlightEngine();
        });
    } else {
        root.BrowOSSpotlight = new SpotlightEngine();
    }
})(typeof window !== 'undefined' ? window : globalThis);
