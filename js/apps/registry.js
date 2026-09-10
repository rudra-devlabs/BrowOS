/**
 * BrowOS App Registry & On-Demand Loader
 * Coordinates app templates, modular lifecycle handlers, and game lazy-loading.
 */
(function(root) {
    'use strict';

    const registry = {};

    // Script loader cache
    const loadedScripts = new Set();
    const loadingPromises = {};

    function loadScript(src) {
        if (loadedScripts.has(src)) return Promise.resolve();
        if (loadingPromises[src]) return loadingPromises[src];

        loadingPromises[src] = new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[src="${src}"], script[src^="${src}?"]`);
            if (existing) {
                loadedScripts.add(src);
                return resolve();
            }
            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.onload = () => {
                loadedScripts.add(src);
                delete loadingPromises[src];
                resolve();
            };
            script.onerror = (err) => {
                delete loadingPromises[src];
                reject(new Error('Failed to load script: ' + src));
            };
            document.body.appendChild(script);
        });

        return loadingPromises[src];
    }

    // Lazy load configurations for games to eliminate 5.7 MB from boot
    const GAME_CONFIGS = {
        starship: {
            title: 'Void Tactics 3D',
            scripts: [
                'assets/vendor/three.min.js?v=r134',
                'assets/vendor/three-mesh-bvh.umd.js?v=0.7.8',
                'assets/vendor/three/CopyShader.js?v=r134',
                'assets/vendor/three/LuminosityHighPassShader.js?v=r134',
                'assets/vendor/three/EffectComposer.js?v=r134',
                'assets/vendor/three/RenderPass.js?v=r134',
                'assets/vendor/three/ShaderPass.js?v=r134',
                'assets/vendor/three/UnrealBloomPass.js?v=r134',
                'assets/vendor/GLTFLoader.js?v=r134',
                'js/starship.js?v=20260903-3d'
            ],
            isReady: () => typeof window.initStarshipGame === 'function',
            mount: (el) => window.initStarshipGame && window.initStarshipGame(el)
        },
        browrio: {
            title: 'Super Browrio',
            scripts: [
                'js/browrio.js?v=20260903-1'
            ],
            isReady: () => typeof window.initBrowrioGame === 'function',
            mount: (el) => window.initBrowrioGame && window.initBrowrioGame(el)
        },
        gta: {
            title: 'Brow City (GTA)',
            scripts: [
                'assets/vendor/three.min.js?v=r134',
                'js/wasm_physics.js?v=20260904-1',
                'js/gta.js?v=20260909-44'
            ],
            isReady: () => typeof window.initGtaGame === 'function',
            mount: (el) => window.initGtaGame && window.initGtaGame(el)
        },
        snake: {
            title: 'Snake 3D Arcade',
            scripts: [
                'assets/vendor/three.min.js?v=r134',
                'js/snake.js?v=20260904-3d'
            ],
            isReady: () => typeof window.initSnake3DGame === 'function',
            mount: (el) => window.initSnake3DGame && window.initSnake3DGame(el)
        },
        terrario: {
            title: 'Terrario 2D',
            scripts: [
                'js/terrario.js?v=20260904-1'
            ],
            isReady: () => typeof window.initTerrarioGame === 'function',
            mount: (el) => window.initTerrarioGame && window.initTerrarioGame(el)
        }
    };

    function mountLazyGame(gameKey, windowElement) {
        const cfg = GAME_CONFIGS[gameKey];
        if (!cfg) return;

        if (cfg.isReady()) {
            cfg.mount(windowElement);
            return;
        }

        const contentArea = windowElement.querySelector('.window-content') || windowElement;
        const loader = document.createElement('div');
        loader.className = 'game-lazy-loading-overlay';
        loader.style.cssText = 'position:absolute;inset:0;background:#0d0e12;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:99999;color:#fff;font-family:-apple-system,BlinkMacSystemFont,sans-serif;user-select:none;';
        loader.innerHTML = `
            <div style="width:36px;height:36px;border:3px solid rgba(255,255,255,0.15);border-top-color:#0a84ff;border-radius:50%;animation:boot-spin 0.75s linear infinite;margin-bottom:14px;"></div>
            <div style="font-size:14px;font-weight:600;letter-spacing:0.2px;">Launching ${cfg.title}...</div>
            <div style="font-size:11px;color:#8e8e93;margin-top:4px;">Loading game engine & assets on demand</div>
        `;
        contentArea.appendChild(loader);

        (async () => {
            try {
                for (const src of cfg.scripts) {
                    await loadScript(src);
                }
                if (loader.parentNode) loader.remove();
                cfg.mount(windowElement);
            } catch (err) {
                console.error(`[LazyGame] Failed to load ${gameKey}:`, err);
                loader.innerHTML = `
                    <div style="color:#ff453a;font-size:24px;margin-bottom:8px;">⚠️</div>
                    <div style="font-size:14px;font-weight:600;color:#fff;">Failed to launch ${cfg.title}</div>
                    <div style="font-size:12px;color:#8e8e93;margin-top:4px;max-width:280px;text-align:center;">Network error or resource unavailable.</div>
                    <button class="game-retry-btn" style="margin-top:14px;background:#0a84ff;border:none;color:#fff;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">Retry</button>
                `;
                loader.querySelector('.game-retry-btn')?.addEventListener('click', () => {
                    loader.remove();
                    mountLazyGame(gameKey, windowElement);
                });
            }
        })();
    }

    const AppRegistry = {
        loadScript,

        register(appName, appDef) {
            registry[appName] = appDef;
        },

        get(appName) {
            return registry[appName];
        },

        getContent(appName, windowCounter) {
            if (registry[appName] && typeof registry[appName].getContent === 'function') {
                return registry[appName].getContent(windowCounter);
            }

            switch (appName) {
                case 'filebrow':
                    return `<div id="filebrow-app-container-${windowCounter}" class="filebrow-window" style="height: 100%; width: 100%;"></div>`;
                case 'clock':
                    return `<div class="clock-window"><div class="clock-app-container"></div></div>`;
                case 'widgets':
                    return `<div class="widgets-window-content bw-gallery-host"></div>`;
                case 'weather':
                    return `<div class="weather-window"></div>`;
                case 'calendar':
                    return `<div class="calendar-window"></div>`;
                case 'monitor':
                    return `<div class="mon-app-host"></div>`;
                case 'terminal':
                    return `<div class="terminal-shell-container" style="height: 100%; width: 100%;"></div>`;
                case 'codebrow':
                return `
                    <div class="codebrow-window">
                        <div class="codebrow-menubar">
                            <div class="codebrow-menu-items">
                                <div class="codebrow-menu-item" data-menu="file">
                                    <span>File</span>
                                    <div class="codebrow-dropdown-menu">
                                        <div class="codebrow-menu-entry" data-action="new-file"><span>New File</span><span class="codebrow-menu-entry-shortcut">Ctrl+N</span></div>
                                        <div class="codebrow-menu-entry" data-action="open-file"><span>Open File...</span><span class="codebrow-menu-entry-shortcut">Ctrl+O</span></div>
                                        <div class="codebrow-menu-divider"></div>
                                        <div class="codebrow-menu-entry" data-action="save"><span>Save</span><span class="codebrow-menu-entry-shortcut">Ctrl+S</span></div>
                                        <div class="codebrow-menu-entry" data-action="save-as"><span>Save As...</span><span class="codebrow-menu-entry-shortcut">Ctrl+Shift+S</span></div>
                                        <div class="codebrow-menu-divider"></div>
                                        <div class="codebrow-menu-entry" data-action="close-editor"><span>Close Editor</span><span class="codebrow-menu-entry-shortcut">Ctrl+W</span></div>
                                    </div>
                                </div>
                                <div class="codebrow-menu-item" data-menu="edit">
                                    <span>Edit</span>
                                    <div class="codebrow-dropdown-menu">
                                        <div class="codebrow-menu-entry" data-action="undo"><span>Undo</span><span class="codebrow-menu-entry-shortcut">Ctrl+Z</span></div>
                                        <div class="codebrow-menu-entry" data-action="redo"><span>Redo</span><span class="codebrow-menu-entry-shortcut">Ctrl+Y</span></div>
                                        <div class="codebrow-menu-divider"></div>
                                        <div class="codebrow-menu-entry" data-action="cut"><span>Cut</span><span class="codebrow-menu-entry-shortcut">Ctrl+X</span></div>
                                        <div class="codebrow-menu-entry" data-action="copy"><span>Copy</span><span class="codebrow-menu-entry-shortcut">Ctrl+C</span></div>
                                        <div class="codebrow-menu-entry" data-action="paste"><span>Paste</span><span class="codebrow-menu-entry-shortcut">Ctrl+V</span></div>
                                        <div class="codebrow-menu-divider"></div>
                                        <div class="codebrow-menu-entry" data-action="find"><span>Find</span><span class="codebrow-menu-entry-shortcut">Ctrl+F</span></div>
                                        <div class="codebrow-menu-entry" data-action="replace"><span>Replace</span><span class="codebrow-menu-entry-shortcut">Ctrl+H</span></div>
                                    </div>
                                </div>
                                <div class="codebrow-menu-item" data-menu="selection">
                                    <span>Selection</span>
                                    <div class="codebrow-dropdown-menu">
                                        <div class="codebrow-menu-entry" data-action="select-all"><span>Select All</span><span class="codebrow-menu-entry-shortcut">Ctrl+A</span></div>
                                        <div class="codebrow-menu-entry" data-action="expand-sel"><span>Expand Selection</span></div>
                                        <div class="codebrow-menu-entry" data-action="shrink-sel"><span>Shrink Selection</span></div>
                                    </div>
                                </div>
                                <div class="codebrow-menu-item" data-menu="view">
                                    <span>View</span>
                                    <div class="codebrow-dropdown-menu">
                                        <div class="codebrow-menu-entry" data-action="toggle-sidebar"><span>Toggle Primary Side Bar</span><span class="codebrow-menu-entry-shortcut">Ctrl+B</span></div>
                                        <div class="codebrow-menu-entry" data-action="toggle-panel"><span>Toggle Panel</span><span class="codebrow-menu-entry-shortcut">Ctrl+\`</span></div>
                                        <div class="codebrow-menu-divider"></div>
                                        <div class="codebrow-menu-entry" data-action="zoom-in"><span>Zoom In</span><span class="codebrow-menu-entry-shortcut">Ctrl+=</span></div>
                                        <div class="codebrow-menu-entry" data-action="zoom-out"><span>Zoom Out</span><span class="codebrow-menu-entry-shortcut">Ctrl+-</span></div>
                                    </div>
                                </div>
                                <div class="codebrow-menu-item" data-menu="run">
                                    <span>Run</span>
                                    <div class="codebrow-dropdown-menu">
                                        <div class="codebrow-menu-entry" data-action="run-code"><span>Run Without Debugging</span><span class="codebrow-menu-entry-shortcut">Ctrl+F5</span></div>
                                    </div>
                                </div>
                                <div class="codebrow-menu-item" data-menu="terminal">
                                    <span>Terminal</span>
                                    <div class="codebrow-dropdown-menu">
                                        <div class="codebrow-menu-entry" data-action="new-terminal"><span>New Terminal</span><span class="codebrow-menu-entry-shortcut">Ctrl+Shift+\`</span></div>
                                        <div class="codebrow-menu-entry" data-action="clear-terminal"><span>Clear Terminal</span></div>
                                    </div>
                                </div>
                                <div class="codebrow-menu-item" data-menu="help">
                                    <span>Help</span>
                                    <div class="codebrow-dropdown-menu">
                                        <div class="codebrow-menu-entry" data-action="about"><span>About CodeBrow</span></div>
                                    </div>
                                </div>
                            </div>
                            <div class="codebrow-window-title">CodeBrow — Visual Studio Code for BrowOS</div>
                        </div>
                        <div class="codebrow-quick-input-overlay">
                            <div class="codebrow-quick-input-wrap">
                                <input type="text" class="codebrow-quick-input-box" placeholder="Type a file path to open..." />
                            </div>
                            <div class="codebrow-quick-input-list"></div>
                        </div>
                        <div class="codebrow-container">
                            <div class="codebrow-sidebar">
                                <div class="codebrow-sidebar-section open-editors-section">
                                    <div class="codebrow-section-header" data-section="open-editors">
                                        <span class="codebrow-section-chevron">
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                        </span>
                                        <span class="codebrow-section-title">Open Editors</span>
                                        <span class="codebrow-section-count">(0)</span>
                                    </div>
                                    <div class="codebrow-open-editors-list"></div>
                                </div>
                                <div class="codebrow-sidebar-section workspace-section" style="flex:1;min-height:0;display:flex;flex-direction:column;">
                                    <div class="codebrow-section-header" data-section="workspace">
                                        <span class="codebrow-section-chevron">
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                        </span>
                                        <span class="codebrow-section-title">BrowOS Workspace</span>
                                        <div class="codebrow-sidebar-header-actions" style="display:flex;gap:2px;">
                                            <button class="codebrow-sidebar-action codebrow-btn-new-file" title="New File">
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>
                                            </button>
                                            <button class="codebrow-sidebar-action codebrow-btn-new-folder" title="New Folder">
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><line x1="12" y1="11" x2="12" y2="17"></line><line x1="9" y1="14" x2="15" y2="14"></line></svg>
                                            </button>
                                            <button class="codebrow-sidebar-action codebrow-btn-refresh" title="Refresh">
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                                            </button>
                                        </div>
                                    </div>
                                    <div class="codebrow-sidebar-content" style="flex:1;overflow-y:auto;"></div>
                                </div>
                            </div>
                            <div class="codebrow-main">
                                <div class="codebrow-editor-panel-split">
                                    <div class="codebrow-editor-region">
                                        <div class="codebrow-tabs-bar">
                                            <div class="codebrow-tabs"></div>
                                        </div>
                                        <div class="codebrow-breadcrumbs">
                                            <span class="codebrow-breadcrumb-item">
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="#dcb67a"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"/></svg>
                                                <span>BrowOS</span>
                                            </span>
                                        </div>
                                        <div class="codebrow-monaco-container">
                                            <div class="codebrow-editor-loading" style="display:flex;align-items:center;justify-content:center;height:100%;color:#858585;font-size:13px;gap:8px;">
                                                <span>Initializing Monaco Editor...</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="codebrow-panel-divider" title="Drag to resize panel"></div>
                                    <div class="codebrow-bottom-panel">
                                        <div class="codebrow-panel-header">
                                            <div class="codebrow-panel-tabs">
                                                <div class="codebrow-panel-tab" data-panel="problems">Problems <span class="codebrow-panel-badge problems-badge" style="margin-left:4px;opacity:0.7;">0</span></div>
                                                <div class="codebrow-panel-tab" data-panel="output">Output</div>
                                                <div class="codebrow-panel-tab active" data-panel="terminal">Terminal</div>
                                            </div>
                                            <div class="codebrow-panel-actions">
                                                <select class="codebrow-panel-select" title="Active Terminal">
                                                    <option value="1">1: bash</option>
                                                </select>
                                                <button class="codebrow-panel-btn codebrow-btn-new-term" title="New Terminal (Ctrl+Shift+\`)">
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                                </button>
                                                <button class="codebrow-panel-btn codebrow-btn-clear-term" title="Clear Terminal">
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                                </button>
                                                <button class="codebrow-panel-btn codebrow-btn-maximize-panel" title="Toggle Maximize Panel">
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"></polyline></svg>
                                                </button>
                                                <button class="codebrow-panel-btn codebrow-btn-close-panel" title="Close Panel (Ctrl+\`)">
                                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                                </button>
                                            </div>
                                        </div>
                                        <div class="codebrow-panel-body">
                                            <div class="codebrow-panel-view problems-view">
                                                <div class="codebrow-problems-list">
                                                    <div style="color:#858585;padding:12px;font-style:italic;">No problems have been detected in the workspace.</div>
                                                </div>
                                            </div>
                                            <div class="codebrow-panel-view output-view">
                                                <div class="codebrow-output-content">[CodeBrow] Ready. Output channel initialized.</div>
                                            </div>
                                            <div class="codebrow-panel-view terminal-view active">
                                                <div class="codebrow-terminal-mount"></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="codebrow-statusbar">
                            <div class="codebrow-status-left">
                                <span class="codebrow-status-item codebrow-status-problems" title="View Problems">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:2px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                                    <span class="problems-status-text">0</span>
                                </span>
                                <span class="codebrow-status-item codebrow-status-git">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:2px;"><line x1="6" y1="3" x2="6" y2="15"></line><circle cx="18" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><path d="M18 9a9 9 0 0 1-9 9"></path></svg>
                                    main
                                </span>
                            </div>
                            <div class="codebrow-status-right">
                                <span class="codebrow-status-item codebrow-status-pos">Ln 1, Col 1</span>
                                <span class="codebrow-status-item">Spaces: 4</span>
                                <span class="codebrow-status-item">UTF-8</span>
                                <span class="codebrow-status-item">LF</span>
                                <span class="codebrow-status-item codebrow-status-lang">JavaScript</span>
                            </div>
                        </div>
                        <div class="codebrow-context-menu"></div>
                    </div>
                `;
                case 'starship':
                return `
                    <div class="starship-window">
                        <div class="vt-stage">
                            <canvas id="vt-canvas"></canvas>

                            <div id="vt-locks" class="vt-locks"></div>
                            <div id="vt-reticle" class="vt-reticle" style="display:none"><i></i></div>

                            <!-- ------------------------------- HUD ------------------------------- -->
                            <div id="vt-hud" class="vt-hud" style="display:none">
                                <div class="vt-hud-top">
                                    <div class="vt-hud-cell left">
                                        <div class="vt-cap">SCORE</div>
                                        <div class="vt-score" id="vt-score">0</div>
                                        <div class="vt-combo" id="vt-combo"></div>
                                    </div>
                                    <div class="vt-hud-cell mid">
                                        <div class="vt-cap">WAVE</div>
                                        <div class="vt-wave" id="vt-wave">1</div>
                                    </div>
                                    <div class="vt-hud-cell right">
                                        <div class="vt-cap">CREDITS</div>
                                        <div class="vt-credits" id="vt-credits">0</div>
                                    </div>
                                </div>

                                <div id="vt-boss" class="vt-boss" style="display:none">
                                    <div class="vt-boss-name" id="vt-boss-name">DREADNOUGHT</div>
                                    <div class="vt-boss-track"><div class="vt-boss-fill" id="vt-boss-fill"></div></div>
                                </div>

                                <div class="vt-hud-bottom">
                                    <div class="vt-bars">
                                        <div class="vt-bar-row">
                                            <span class="vt-bar-label">HULL</span>
                                            <div class="vt-bar"><div class="vt-bar-fill hull" id="vt-hull-fill"></div></div>
                                            <span class="vt-bar-num" id="vt-hull-text">100 / 100</span>
                                        </div>
                                        <div class="vt-bar-row">
                                            <span class="vt-bar-label">SHIELD</span>
                                            <div class="vt-bar"><div class="vt-bar-fill shield" id="vt-shield-fill"></div></div>
                                        </div>
                                        <div class="vt-bar-row">
                                            <span class="vt-bar-label">BOOST</span>
                                            <div class="vt-bar"><div class="vt-bar-fill boost" id="vt-boost-fill"></div></div>
                                        </div>
                                    </div>
                                    <div class="vt-missiles">
                                        <span class="vt-cap">MISSILES</span>
                                        <span class="vt-missile-count" id="vt-missiles">6</span>
                                    </div>
                                </div>
                            </div>

                            <!-- ---------------------------- wave banner -------------------------- -->
                            <div id="vt-banner" class="vt-banner">
                                <div class="vt-banner-title" id="vt-banner-title"></div>
                                <div class="vt-banner-sub" id="vt-banner-sub"></div>
                            </div>

                            <!-- ------------------------------- menu ------------------------------ -->
                            <div id="vt-menu" class="vt-overlay">
                                <div class="vt-panel">
                                    <div class="vt-title">VOID<span>TACTICS</span></div>
                                    <div class="vt-subtitle">3D TACTICAL STARSHIP COMBAT</div>

                                    <div class="vt-stats">
                                        <div class="vt-stat"><span class="vt-cap">BEST</span><b id="vt-menu-best">0</b></div>
                                        <div class="vt-stat"><span class="vt-cap">CREDITS</span><b id="vt-menu-credits">0</b></div>
                                        <div class="vt-stat"><span class="vt-cap">BEST WAVE</span><b id="vt-menu-last">—</b></div>
                                        <div class="vt-stat"><span class="vt-cap">CHASSIS</span><b id="vt-menu-ship">SCOUT CLASS</b></div>
                                    </div>

                                    <div class="vt-actions">
                                        <button id="vt-btn-launch" class="vt-btn primary">LAUNCH</button>
                                        <button id="vt-btn-station" class="vt-btn">SPACE STATION</button>
                                        <button id="vt-btn-howto" class="vt-btn ghost">HOW TO PLAY</button>
                                    </div>

                                    <button id="vt-btn-mute" class="vt-mute">SOUND: ON</button>
                                    <div class="vt-hint">Click the viewport once, then fly with WASD.</div>
                                </div>
                            </div>

                            <!-- ----------------------------- game over --------------------------- -->
                            <div id="vt-gameover" class="vt-overlay" style="display:none">
                                <div class="vt-panel">
                                    <div class="vt-go-title" id="vt-go-title">SHIP DESTROYED</div>
                                    <div class="vt-go-grid">
                                        <div><span class="vt-cap">SCORE</span><b id="vt-go-score">0</b></div>
                                        <div><span class="vt-cap">WAVE REACHED</span><b id="vt-go-wave">0</b></div>
                                        <div><span class="vt-cap">CREDITS EARNED</span><b id="vt-go-earned">0</b></div>
                                    </div>
                                    <div class="vt-go-best" id="vt-go-best"></div>
                                    <div class="vt-actions">
                                        <button id="vt-btn-again" class="vt-btn primary">FLY AGAIN</button>
                                        <button id="vt-btn-menu" class="vt-btn">RETURN TO MENU</button>
                                    </div>
                                </div>
                            </div>

                            <!-- ------------------------------- pause ----------------------------- -->
                            <div id="vt-pause" class="vt-overlay" style="display:none">
                                <div class="vt-panel">
                                    <div class="vt-go-title">PAUSED</div>
                                    <div class="vt-actions">
                                        <button id="vt-btn-resume" class="vt-btn primary">RESUME</button>
                                        <button id="vt-btn-abandon" class="vt-btn">ABANDON RUN</button>
                                    </div>
                                </div>
                            </div>

                            <!-- -------------------------- space station -------------------------- -->
                            <div id="vt-station" class="vt-overlay" style="display:none">
                                <div class="vt-panel wide">
                                    <div class="vt-panel-head">
                                        <div class="vt-title small">SPACE STATION</div>
                                        <div class="vt-wallet">CREDITS <b id="vt-station-credits">0</b></div>
                                    </div>
                                    <div id="vt-station-body" class="vt-shop"></div>
                                    <button id="vt-btn-station-back" class="vt-btn">RETURN TO MENU</button>
                                </div>
                            </div>

                            <!-- ----------------------------- how to play ------------------------- -->
                            <div id="vt-howto" class="vt-overlay" style="display:none">
                                <div class="vt-panel">
                                    <div class="vt-title small">FLIGHT MANUAL</div>
                                    <div class="vt-keys">
                                        <div><kbd>MOUSE</kbd><span>Aim reticle in 3D</span></div>
                                        <div><kbd>LEFT CLICK</kbd> / <kbd>SPACE</kbd><span>Fire directed lasers (hold)</span></div>
                                        <div><kbd>RIGHT CLICK</kbd> / <kbd>F</kbd><span>Launch homing missiles at aimed targets</span></div>
                                        <div><kbd>W A S D</kbd><span>Manoeuvre starship</span></div>
                                        <div><kbd>SHIFT</kbd><span>Boost — burn energy for speed</span></div>
                                        <div><kbd>CTRL</kbd><span>Brake for tight dodges</span></div>
                                        <div><kbd>Q</kbd> <kbd>E</kbd><span>Barrel roll — invulnerable, deflects shots</span></div>
                                        <div><kbd>P</kbd><span>Pause</span> <kbd>M</kbd><span>Mute</span></div>
                                    </div>
                                    <div class="vt-tips">
                                        Chain kills to build a multiplier up to <b>x8</b>. Destroy a
                                        dreadnought's turrets to silence its guns. Credits persist
                                        between sessions — spend them at the station.
                                    </div>
                                    <button id="vt-btn-howto-back" class="vt-btn primary">GOT IT</button>
                                </div>
                            </div>

                            <!-- ------------------------------- fatal ----------------------------- -->
                            <div id="vt-fatal" class="vt-overlay" style="display:none">
                                <div class="vt-panel">
                                    <div class="vt-go-title">UNABLE TO START</div>
                                    <div class="vt-fatal-msg"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                case 'browrio':
                return `
                    <div class="browrio-window" style="background: #0b1026; display: flex; align-items: center; justify-content: center; height: 100%; position: relative; overflow: hidden; font-family: monospace;">
                        <canvas id="browrio-canvas" width="640" height="360" tabindex="0" style="background: #5aa9ff; max-height: 100%; max-width: 100%; width: 100%; height: 100%; object-fit: contain; image-rendering: auto; outline: none;"></canvas>
                        <div id="browrio-hud" style="display:none;"></div>
                        <div id="browrio-overlay" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(5,8,20,0.88); color: white; z-index: 10; padding: 20px; text-align: center;">
                            <h1 id="browrio-title" style="color: #ffd94d; text-shadow: 3px 3px 0px #e33e2b, 6px 6px 0px rgba(0,0,0,0.5); margin: 0 0 10px; font-size: 44px; font-weight: bold; letter-spacing: 2px;">BROWIO RUN</h1>
                            <p style="color: #8ec5ff; font-size: 12px; letter-spacing: 3px; margin: 0 0 14px;">A 2D RETRO PLATFORMER · 3 WORLDS · 12 LEVELS</p>
                            <p id="browrio-msg" style="font-size: 13px; line-height: 1.6; margin: 0 0 14px; color: #c9d4e8; max-width: 500px;">Run, jump, stomp walkers, dodge spikes.<br>Hit ? blocks for coins &amp; power-ups. Reach the GOAL flag!</p>
                            <button id="browrio-start-btn" style="background: linear-gradient(135deg, #e33e2b 0%, #ffb52e 100%); border: none; color: white; font-family: monospace; font-size: 18px; font-weight: bold; padding: 12px 34px; border-radius: 24px; cursor: pointer; box-shadow: 0 4px 15px rgba(227,62,43,0.5); text-transform: uppercase; letter-spacing: 1px;">START GAME</button>
                            <div style="display: flex; gap: 6px; margin-top: 14px; flex-wrap: wrap; justify-content: center; max-width: 560px;">
                                <button data-browrio-level="0" style="background: linear-gradient(135deg,#46c24a,#2f9e33); border: none; color: white; font-family: monospace; font-size: 11px; padding: 6px 10px; cursor: pointer; border-radius: 6px;">1-1 HILLS</button>
                                <button data-browrio-level="1" style="background: linear-gradient(135deg,#46c24a,#2f9e33); border: none; color: white; font-family: monospace; font-size: 11px; padding: 6px 10px; cursor: pointer; border-radius: 6px;">1-2 PIPES</button>
                                <button data-browrio-level="2" style="background: linear-gradient(135deg,#46c24a,#2f9e33); border: none; color: white; font-family: monospace; font-size: 11px; padding: 6px 10px; cursor: pointer; border-radius: 6px;">1-3 RIDGE</button>
                                <button data-browrio-level="3" style="background: linear-gradient(135deg,#46c24a,#2f9e33); border: none; color: white; font-family: monospace; font-size: 11px; padding: 6px 10px; cursor: pointer; border-radius: 6px;">1-4 CASTLE</button>
                                <button data-browrio-level="4" style="background: linear-gradient(135deg,#7d6bff,#3a2a8a); border: none; color: white; font-family: monospace; font-size: 11px; padding: 6px 10px; cursor: pointer; border-radius: 6px;">2-1 MINE</button>
                                <button data-browrio-level="5" style="background: linear-gradient(135deg,#7d6bff,#3a2a8a); border: none; color: white; font-family: monospace; font-size: 11px; padding: 6px 10px; cursor: pointer; border-radius: 6px;">2-2 CAVE</button>
                                <button data-browrio-level="6" style="background: linear-gradient(135deg,#7d6bff,#3a2a8a); border: none; color: white; font-family: monospace; font-size: 11px; padding: 6px 10px; cursor: pointer; border-radius: 6px;">2-3 LAVA</button>
                                <button data-browrio-level="7" style="background: linear-gradient(135deg,#7d6bff,#3a2a8a); border: none; color: white; font-family: monospace; font-size: 11px; padding: 6px 10px; cursor: pointer; border-radius: 6px;">2-4 FORT</button>
                                <button data-browrio-level="8" style="background: linear-gradient(135deg,#ff9a5c,#e23b2b); border: none; color: white; font-family: monospace; font-size: 11px; padding: 6px 10px; cursor: pointer; border-radius: 6px;">3-1 CLOUDS</button>
                                <button data-browrio-level="9" style="background: linear-gradient(135deg,#ff9a5c,#e23b2b); border: none; color: white; font-family: monospace; font-size: 11px; padding: 6px 10px; cursor: pointer; border-radius: 6px;">3-2 SHIP</button>
                                <button data-browrio-level="10" style="background: linear-gradient(135deg,#ff9a5c,#e23b2b); border: none; color: white; font-family: monospace; font-size: 11px; padding: 6px 10px; cursor: pointer; border-radius: 6px;">3-3 TOWER</button>
                                <button data-browrio-level="11" style="background: linear-gradient(135deg,#ffd94d,#e23b2b); border: none; color: white; font-family: monospace; font-size: 11px; padding: 6px 10px; cursor: pointer; border-radius: 6px; font-weight: bold;">3-4 KEEP</button>
                            </div>
                            <div style="margin-top: 18px; font-size: 11px; color: rgba(255,255,255,0.55); line-height: 1.7; background: rgba(0,0,0,0.35); padding: 10px 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);">
                                MOVE: A/D or Arrows · JUMP: Space/W/Up · RUN: Shift<br>
                                PAUSE: P · MUTE: M · STOMP walkers, avoid red spikes!
                            </div>
                        </div>
                    </div>
                `;
                case 'gta':
                return `
                    <div class="gta-window">
                        <canvas id="gta-canvas" tabindex="0"></canvas>

                        <!-- in-game HUD -->
                        <div id="gta-hud" class="gta-hud" style="display:none">
                            <div class="gta-wanted" id="gta-wanted">
                                <span class="star">★</span>
                                <span class="star">★</span>
                                <span class="star">★</span>
                                <span class="star">★</span>
                                <span class="star">★</span>
                            </div>
                            <div class="gta-minimap"><canvas id="gta-minimap-canvas" width="180" height="180"></canvas></div>
                            <div class="gta-money" id="gta-money">$0</div>
                            <div class="gta-bars">
                                <div class="gta-bar"><span>HEALTH</span>
                                    <div class="gta-bar-track"><div class="gta-bar-fill health" id="gta-health-fill" style="width:100%"></div></div>
                                </div>
                                <div class="gta-bar"><span>ARMOR</span>
                                    <div class="gta-bar-track"><div class="gta-bar-fill armor" id="gta-armor-fill" style="width:0%"></div></div>
                                </div>
                            </div>
                            <div class="gta-weapon" id="gta-weapon">FIST</div>
                            <div class="gta-vehicle" id="gta-vehicle" style="display:none">
                                <div class="gta-vehicle-gear" id="gta-vehicle-gear" title="Current Gear (1-4 manual, 5 auto)">A1</div>
                                <div class="gta-vehicle-speed"><span id="gta-vehicle-speed">0</span><small>MPH</small></div>
                                <div class="gta-vehicle-meta">
                                    <div class="gta-vehicle-name" id="gta-vehicle-name">VEHICLE</div>
                                    <div class="gta-bar-track"><div class="gta-bar-fill vehicle" id="gta-vehicle-fill" style="width:100%"></div></div>
                                </div>
                            </div>
                            <div class="gta-prompt" id="gta-prompt">Press F to enter vehicle</div>
                            <div class="gta-reticle" id="gta-reticle"></div>
                            <div class="gta-lockhint" id="gta-lockhint" style="display:none">🖱 Click to capture mouse · <kbd>M</kbd> map</div>
                        </div>

                        <!-- start menu -->
                        <div id="gta-menu" class="gta-overlay">
                            <div class="gta-panel">
                                <h1 class="gta-title">BROW CITY</h1>
                                <p class="gta-subtitle">A 3D OPEN-WORLD SANDBOX · BROWOS EDITION</p>
                                <div id="gta-menu-stats" style="text-align:left; margin: 0 auto 14px; max-width: 320px; font-size: 12px;">
                                    <div class="gta-stat-row"><span>Last city</span><b id="gta-menu-city">—</b></div>
                                    <div class="gta-stat-row"><span>Money</span><b id="gta-menu-money">$0</b></div>
                                    <div class="gta-stat-row"><span>Wanted best</span><b id="gta-menu-wanted">0 ★</b></div>
                                </div>
                                <div>
                                    <button id="gta-btn-new" class="gta-btn">NEW GAME</button>
                                    <button id="gta-btn-continue" class="gta-btn ghost">CONTINUE</button>
                                    <button id="gta-btn-howto" class="gta-btn ghost">HOW TO PLAY</button>
                                    <button id="gta-btn-settings" class="gta-btn ghost">⚙ SETTINGS</button>
                                </div>
                                <div id="gta-howto-panel" style="display:none; text-align:left; margin-top: 14px; font-size: 11px; color: #c9d4e8; line-height: 1.6;">
                                    <div class="gta-keys">
                                        <div><kbd>W A S D</kbd> Walk / Drive</div>
                                        <div><kbd>ALT</kbd> / <kbd>RMB</kbd> Aim Gun</div>
                                        <div><kbd>A</kbd> / <kbd>LMB</kbd> Shoot / Fire</div>
                                        <div><kbd>1 - 7</kbd> Weapon (on foot)</div>
                                        <div><kbd>1 - 4</kbd> Gears 1-4 · <kbd>5</kbd> Auto (in car)</div>
                                        <div><kbd>SHIFT</kbd> Run / Horn</div>
                                        <div><kbd>SPACE</kbd> Jump / Handbrake</div>
                                        <div><kbd>F</kbd> Enter / exit vehicle</div>
                                        <div><kbd>V</kbd> Camera view</div>
                                        <div><kbd>TAB</kbd> Debug colliders</div>
                                        <div><kbd>P</kbd> Pause</div>
                                        <div><kbd>M</kbd> Full map</div>
                                        <div><kbd>F4</kbd> Perf stats</div>
                                        <div><kbd>N</kbd> Mute</div>
                                        <div><kbd>Click</kbd> Capture mouse</div>
                                        <div><kbd>Map click</kbd> Set waypoint</div>
                                        <div><kbd>X</kbd> Pin map center</div>
                                    </div>
                                    <p style="margin: 8px 0 0; color: #8ec5ff;">Rampage to earn stars, evade the police, find a Pay-N-Spray to lose them.</p>
                                </div>
                                <div class="gta-hint" id="gta-loading">Click a button to begin…</div>
                            </div>
                        </div>

                        <!-- pause menu -->
                        <div id="gta-pause" class="gta-overlay" style="display:none">
                            <div class="gta-panel">
                                <h1 class="gta-title" style="font-size: 32px;">PAUSED</h1>
                                <p class="gta-subtitle">Take a breather</p>
                                <div>
                                    <button id="gta-btn-resume" class="gta-btn">RESUME</button>
                                    <button id="gta-btn-save" class="gta-btn ghost">SAVE</button>
                                    <button id="gta-btn-load" class="gta-btn ghost">LOAD</button>
                                    <button id="gta-btn-settings2" class="gta-btn ghost">⚙ SETTINGS</button>
                                    <button id="gta-btn-quit" class="gta-btn ghost">QUIT TO MENU</button>
                                </div>
                                <div class="gta-hint" id="gta-save-hint"></div>
                            </div>
                        </div>

                        <!-- settings -->
                        <div id="gta-settings" class="gta-overlay" style="display:none">
                            <div class="gta-panel gta-settings-panel">
                                <h1 class="gta-title" style="font-size: 26px;">⚙ SETTINGS</h1>
                                <div class="gta-set-tabs">
                                    <button class="gta-set-tab active" data-tab="audio">AUDIO</button>
                                    <button class="gta-set-tab" data-tab="world">WORLD</button>
                                    <button class="gta-set-tab" data-tab="graphics">GRAPHICS</button>
                                    <button class="gta-set-tab" data-tab="controls">CONTROLS</button>
                                </div>
                                <div class="gta-set-body">
                                    <div class="gta-set-tabpage" data-tab="audio">
                                        <div class="gta-set-row"><label>Master volume</label><input type="range" id="gta-set-master" min="0" max="100" step="1"><span class="gta-set-val" id="gta-set-master-v">100%</span></div>
                                        <div class="gta-set-row"><label>Engine sound</label><input type="range" id="gta-set-engine" min="0" max="100" step="1"><span class="gta-set-val" id="gta-set-engine-v">80%</span></div>
                                        <div class="gta-set-row"><label>SFX volume</label><input type="range" id="gta-set-sfx" min="0" max="100" step="1"><span class="gta-set-val" id="gta-set-sfx-v">100%</span></div>
                                        <div class="gta-set-row"><label>Music / radio</label><input type="range" id="gta-set-music" min="0" max="100" step="1"><span class="gta-set-val" id="gta-set-music-v">80%</span></div>
                                        <div class="gta-set-row"><label>Mute all audio</label><button id="gta-set-mute" class="gta-set-toggle">OFF</button></div>
                                    </div>
                                    <div class="gta-set-tabpage" data-tab="world" hidden>
                                        <div class="gta-set-row"><label>Traffic density</label><input type="range" id="gta-set-traffic" min="0" max="200" step="5"><span class="gta-set-val" id="gta-set-traffic-v">100%</span></div>
                                        <div class="gta-set-row"><label>Pedestrian density</label><input type="range" id="gta-set-peds" min="0" max="200" step="5"><span class="gta-set-val" id="gta-set-peds-v">100%</span></div>
                                        <div class="gta-set-hint">100% is Brow City standard (34 ambient cars, 44 pedestrians). Density applies to newly spawned NPCs — lower it and the streets thin out as cars/peds cycle; raise it and they fill back in.</div>
                                    </div>
                                    <div class="gta-set-tabpage" data-tab="graphics" hidden>
                                        <div class="gta-set-row"><label>Shadows</label><button id="gta-set-shadows" class="gta-set-toggle">ON</button></div>
                                        <div class="gta-set-row"><label>Long draw distance</label><button id="gta-set-drawdist" class="gta-set-toggle">ON</button></div>
                                        <div class="gta-set-row"><label>Render resolution</label>
                                            <select id="gta-set-pixelratio" class="gta-set-select">
                                                <option value="low">Low (fastest)</option>
                                                <option value="medium">Medium</option>
                                                <option value="high">High (sharpest)</option>
                                            </select>
                                        </div>
                                        <div class="gta-set-row"><label>FPS limit</label>
                                            <select id="gta-set-fpscap" class="gta-set-select">
                                                <option value="0">Uncapped</option>
                                                <option value="30">30</option>
                                                <option value="45">45</option>
                                                <option value="60">60</option>
                                                <option value="120">120</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div class="gta-set-tabpage" data-tab="controls" hidden>
                                        <div class="gta-set-row"><label>Mouse sensitivity</label><input type="range" id="gta-set-sens" min="20" max="250" step="5"><span class="gta-set-val" id="gta-set-sens-v">100%</span></div>
                                        <div class="gta-set-hint">Applies to pointer-lock mouse look, on foot and in vehicles.</div>
                                    </div>
                                </div>
                                <div style="margin-top: 12px;">
                                    <button id="gta-set-back" class="gta-btn">BACK</button>
                                    <button id="gta-set-defaults" class="gta-btn ghost">RESET DEFAULTS</button>
                                </div>
                                <div class="gta-hint">Changes apply and save instantly.</div>
                            </div>
                        </div>

                        <!-- game over -->
                        <div id="gta-gameover" class="gta-overlay" style="display:none">
                            <div class="gta-panel">
                                <h1 class="gta-title" id="gta-go-title" style="color:#ff3b30; text-shadow: 2px 2px 0 #1a0a05;">WASTED</h1>
                                <p class="gta-subtitle" id="gta-go-sub">You bit the big one.</p>
                                <div style="font-size:12px; margin: 10px 0;">
                                    <div class="gta-stat-row"><span>Cash</span><b id="gta-go-cash">$0</b></div>
                                    <div class="gta-stat-row"><span>Wanted reached</span><b id="gta-go-wanted">0 ★</b></div>
                                    <div class="gta-stat-row"><span>Kills</span><b id="gta-go-kills">0</b></div>
                                </div>
                                <div>
                                    <button id="gta-btn-respawn" class="gta-btn">RESPAWN AT HOSPITAL</button>
                                    <button id="gta-btn-loadgo" class="gta-btn ghost">LOAD SAVE</button>
                                </div>
                            </div>
                        </div>

                        <!-- fatal (WebGL not available, etc.) -->
                        <div id="gta-fatal" class="gta-overlay" style="display:none">
                            <div class="gta-panel">
                                <h1 class="gta-title" style="color:#ff3b30;">UNABLE TO START</h1>
                                <p class="gta-subtitle" id="gta-fatal-msg">WebGL or Three.js failed to initialize.</p>
                            </div>
                        </div>
                    </div>
                `;
                case 'snake':
                return `
                    <div class="snake-window">
                        <canvas id="snake3d-canvas" tabindex="0"></canvas>

                        <!-- HUD -->
                        <div class="snake-hud">
                            <div class="snake-hud-card">
                                <div class="snake-hud-stat">
                                    <span class="snake-hud-label">SCORE</span>
                                    <span class="snake-hud-val" id="snake-score">0</span>
                                </div>
                                <div class="snake-hud-stat">
                                    <span class="snake-hud-label">BEST</span>
                                    <span class="snake-hud-val" id="snake-best">0</span>
                                </div>
                                <div class="snake-hud-stat">
                                    <span class="snake-hud-label">LENGTH</span>
                                    <span class="snake-hud-val" id="snake-length">3</span>
                                </div>
                                <div class="snake-hud-stat">
                                    <span class="snake-hud-label">SPEED</span>
                                    <span class="snake-hud-val" id="snake-speed">1x</span>
                                </div>
                                <div id="snake-buff-tag" class="snake-buff-tag" style="display:none"></div>
                            </div>
                            <div style="display:flex; gap:8px; pointer-events:auto;">
                                <button id="snake-cam-btn" class="snake-cam-btn">CAM: ISO</button>
                                <button id="snake-mute-btn" class="snake-tool-btn" title="Toggle Sound">🔊</button>
                            </div>
                        </div>

                        <!-- Start Overlay -->
                        <div id="snake-start-overlay" class="snake-overlay">
                            <h1 class="snake-title">SNAKE 3D</h1>
                            <p class="snake-sub">NEON CYBER ARENA · THREE.JS ARCADE</p>
                            <button id="snake-start-btn" class="snake-btn">START GAME</button>
                            <div class="snake-keys-guide">
                                MOVE: W A S D or Arrow Keys<br>
                                CAMERA: C / V · PAUSE: P or Escape<br>
                                Collect Cyber Apples, Golden Apples &amp; Power-Up Orbs!
                            </div>
                        </div>

                        <!-- Pause Overlay -->
                        <div id="snake-pause-overlay" class="snake-overlay" style="display:none">
                            <h1 class="snake-title" style="font-size:32px;">PAUSED</h1>
                            <p class="snake-sub">TACTICAL BREAK</p>
                            <button id="snake-resume-btn" class="snake-btn">RESUME</button>
                        </div>

                        <!-- Game Over Overlay -->
                        <div id="snake-gameover-overlay" class="snake-overlay" style="display:none">
                            <h1 class="snake-title" style="color:#ff0844; text-shadow: 0 0 20px #ff0844;">SYSTEM CRASH</h1>
                            <p class="snake-sub" id="snake-over-best">Score: 0</p>
                            <div style="margin:0 0 16px; font-size:18px; font-weight:bold;">
                                Final Score: <span id="snake-over-score" style="color:#00f2fe;">0</span>
                            </div>
                            <button id="snake-restart-btn" class="snake-btn">PLAY AGAIN</button>
                            <div style="margin-top:10px; font-size:11px; color:#8bb3db;">Press Enter or Space to restart</div>
                        </div>
                    </div>
                `;
                case 'terrario':
                return `
                    <div class="terrario-window">
                        <canvas id="terrario-canvas" width="640" height="360" tabindex="0"></canvas>

                        <!-- In-Game HUD -->
                        <div class="terrario-hud">
                            <div id="terrario-hotbar" class="terrario-hotbar"></div>
                            <div class="terrario-stats">
                                <div id="terrario-hearts" class="terrario-hearts"></div>
                                <div style="display:flex; gap:6px; align-items:center;">
                                    <div id="terrario-clock" class="terrario-clock">☀️ 08:00</div>
                                    <div class="terrario-actions">
                                        <button id="terrario-save-btn" class="terrario-btn" title="Save World">SAVE</button>
                                        <button id="terrario-export-btn" class="terrario-btn" title="Save to Desktop">EXPORT</button>
                                        <button id="terrario-mute-btn" class="terrario-btn" title="Toggle Sound">🔊</button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Inventory & Crafting Overlay (E / Tab) -->
                        <div id="terrario-inventory-overlay" class="terrario-overlay" style="display:none">
                            <div class="terrario-panel" style="flex:1;">
                                <div class="terrario-panel-title">INVENTORY (E / TAB TO CLOSE)</div>
                                <div id="terrario-inv-grid" class="terrario-grid-container"></div>
                                <div style="font-size:10px; color:#94a3b8; margin-top:8px; line-height:1.5;">
                                    LMB: Mine block / Attack monster<br>
                                    RMB: Place held block / Interact<br>
                                    1-9 / Scroll: Select hotbar slot<br>
                                    Shift: Run · Space: Jump · S / Down: Drop platform
                                </div>
                            </div>
                            <div class="terrario-panel" style="flex:1;">
                                <div class="terrario-panel-title">CRAFTING (WORK BENCH / FURNACE)</div>
                                <div id="terrario-craft-grid" style="display:flex; flex-direction:column; gap:6px; max-height:280px; overflow-y:auto; padding-right:4px;"></div>
                            </div>
                        </div>
                    </div>
                `;
                case 'browcut':
                return `
                    <div class="browcut-app">
                        <!-- Top Toolbar -->
                        <div class="browcut-toolbar">
                            <div class="browcut-toolbar-left">
                                <span class="browcut-badge">BROWCUT</span>
                                <span class="browcut-timecode" id="bc-timecode">00:00.00</span>
                            </div>
                            <div class="browcut-toolbar-center">
                                <button class="browcut-aspect-btn active" data-aspect="16:9">16:9</button>
                                <button class="browcut-aspect-btn" data-aspect="9:16">9:16 REELS</button>
                                <button class="browcut-aspect-btn" data-aspect="1:1">1:1</button>
                                <button class="browcut-aspect-btn" data-aspect="4:3">4:3</button>
                            </div>
                            <div class="browcut-toolbar-right">
                                <button class="browcut-btn" id="bc-undo-btn" title="Undo (Ctrl+Z)">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                                    Undo
                                </button>
                                <button class="browcut-btn" id="bc-redo-btn" title="Redo (Ctrl+Y)">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                                    Redo
                                </button>
                                <button class="browcut-btn" id="bc-demo-btn" title="Load demo footage">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                                    Demo
                                </button>
                                <button class="browcut-btn" id="bc-import-btn">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                    Import
                                </button>
                                <input type="file" id="bc-file-input" accept="video/*" style="display:none">
                                <button class="browcut-btn browcut-btn-primary" id="bc-export-btn">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
                                    Export
                                </button>
                            </div>
                        </div>

                        <!-- Main Stage & Sidebar -->
                        <div class="browcut-workspace">
                            <div class="browcut-stage">
                                <div class="browcut-canvas-wrap">
                                    <canvas id="browcut-canvas" width="640" height="360"></canvas>
                                </div>
                                <div class="browcut-controls-overlay">
                                    <button class="browcut-ctrl-btn" id="bc-in-btn" title="Set In Point ([)">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="11 17 6 12 11 7"/><line x1="18" y1="19" x2="18" y2="5"/></svg>
                                    </button>
                                    <button class="browcut-ctrl-btn primary" id="bc-play-btn" title="Play/Pause (Space)">
                                        <span id="bc-play-icon">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                                        </span>
                                    </button>
                                    <button class="browcut-ctrl-btn" id="bc-out-btn" title="Set Out Point (])">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="13 17 18 12 13 7"/><line x1="6" y1="19" x2="6" y2="5"/></svg>
                                    </button>
                                    <button class="browcut-ctrl-btn" id="bc-split-btn" title="Split Clip (S)">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>
                                    </button>
                                </div>
                            </div>

                            <div class="browcut-sidebar">
                                <div class="browcut-panel-title">Filters &amp; LUTs</div>
                                <div class="browcut-panel-group">
                                    <div class="browcut-filter-grid">
                                        <div class="browcut-filter-pill active" data-filter="normal">Normal</div>
                                        <div class="browcut-filter-pill" data-filter="cyberpunk">Cyberpunk</div>
                                        <div class="browcut-filter-pill" data-filter="vhs">90s VHS</div>
                                        <div class="browcut-filter-pill" data-filter="cinema">Cinema</div>
                                        <div class="browcut-filter-pill" data-filter="noir">Noir B&amp;W</div>
                                        <div class="browcut-filter-pill" data-filter="glitch">Glitch RGB</div>
                                    </div>
                                </div>

                                <div class="browcut-panel-title">Speed &amp; Audio</div>
                                <div class="browcut-panel-group">
                                    <div class="browcut-slider-row">
                                        <span class="browcut-label">Speed</span>
                                        <input type="range" class="browcut-slider" id="bc-speed-slider" min="0.25" max="3" step="0.25" value="1">
                                        <span class="browcut-slider-val" id="bc-speed-val">1.00x</span>
                                    </div>
                                    <div class="browcut-slider-row">
                                        <span class="browcut-label">Volume</span>
                                        <input type="range" class="browcut-slider" id="bc-vol-slider" min="0" max="1" step="0.05" value="1">
                                        <span class="browcut-slider-val" id="bc-vol-val">100%</span>
                                        <button class="browcut-ctrl-btn" id="bc-mute-btn" style="width:26px;height:26px;">
                                            <svg id="bc-mute-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                                        </button>
                                    </div>
                                </div>

                                <div class="browcut-panel-title">Text Overlay</div>
                                <div class="browcut-panel-group">
                                    <div class="browcut-input-row">
                                        <span class="browcut-label">Title / Caption</span>
                                        <input type="text" class="browcut-input" id="bc-text-input" value="BROWCUT STUDIO">
                                    </div>
                                    <div class="browcut-input-row">
                                        <span class="browcut-label">Position</span>
                                        <select class="browcut-input" id="bc-text-pos">
                                            <option value="bottom" selected>Bottom Subtitle</option>
                                            <option value="center">Center Banner</option>
                                            <option value="top">Top Header</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Multi-track Timeline -->
                        <div class="browcut-timeline-area">
                            <div class="browcut-timeline-header">
                                <div class="browcut-timeline-tools">
                                    <button class="browcut-tool-btn" id="bc-tl-split" title="Split clip at playhead">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle; margin-right:4px;"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>
                                        Split
                                    </button>
                                    <span style="font-size:11px;color:#64748b;">Trim Drag Handles · Space to Play · Ctrl+Z Undo</span>
                                </div>
                            </div>
                            <div class="browcut-timeline-body">
                                <div class="browcut-ruler" id="bc-ruler"></div>
                                <div class="browcut-tracks" id="bc-tracks">
                                    <div class="browcut-clip-block" id="bc-clip-block" style="left:0%; width:100%;">
                                        <div class="browcut-handle" id="bc-handle-in" title="Drag to trim In Point"></div>
                                        <span class="browcut-clip-label">VIDEO CLIP 01</span>
                                        <div class="browcut-handle" id="bc-handle-out" title="Drag to trim Out Point"></div>
                                    </div>
                                    <div class="browcut-playhead-line" id="bc-playhead" style="left:0%;">
                                        <div class="browcut-playhead-cap"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                default:
                    return `<div class="${appName}-window" style="height: 100%; width: 100%;"></div>`;
            }
        },

        initApp(appName, windowElement, windowManager) {
            if (registry[appName] && typeof registry[appName].initEvents === 'function') {
                return registry[appName].initEvents(windowElement, windowManager);
            }

            if (appName === 'filebrow') {
                window.filebrowApp = new window.FileBrow(`filebrow-app-container-${windowManager.windowCounter}`);
            } else if (appName === 'clock') {
                windowElement.classList.add('clock-app-window');
                windowElement.style.width = '360px';
                windowElement.style.height = '420px';
                const container = windowElement.querySelector('.clock-app-container');
                if (container && window.ClockApp) {
                    new window.ClockApp(container);
                }
            } else if (appName === 'widgets') {
                windowElement.classList.add('app-widgets-window');
                windowElement.style.width = '900px';
                windowElement.style.height = '680px';
                const wg = windowElement.querySelector('.bw-gallery-host');
                if (wg && window.BrowWidgets) window.BrowWidgets.mountGallery(wg);
            } else if (appName === 'weather') {
                windowElement.style.width = '560px';
                windowElement.style.height = '640px';
                if (window.BrowWeather) window.BrowWeather.mountApp(windowElement);
            } else if (appName === 'calendar') {
                windowElement.style.width = '720px';
                windowElement.style.height = '540px';
                if (window.BrowCalendar) window.BrowCalendar.mountApp(windowElement);
            } else if (appName === 'monitor') {
                windowElement.style.width = '640px';
                windowElement.style.height = '620px';
                if (window.BrowMonitor) window.BrowMonitor.mountApp(windowElement);
            } else if (appName === 'browcut') {
                windowElement.style.width = '880px';
                windowElement.style.height = '580px';
                if (window.initBrowCutApp) window.initBrowCutApp(windowElement);
            } else if (appName === 'showcase') {
                windowElement.style.width = '1060px';
                windowElement.style.height = '680px';
                const content = windowElement.querySelector('.window-content');
                if (content) {
                    content.style.overflow = 'hidden';
                    content.style.padding = '0';
                    content.innerHTML = '<iframe src="showcase.html" style="width:100%;height:100%;border:none;display:block;"></iframe>';
                }
            } else if (GAME_CONFIGS[appName]) {
                mountLazyGame(appName, windowElement);
            }
        }
    };

    root.AppRegistry = AppRegistry;
})(typeof window !== 'undefined' ? window : this);
