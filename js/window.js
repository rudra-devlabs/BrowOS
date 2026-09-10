/**
 * BrowOS Window Lifecycle Subsystem
 * Pure window management: creation, dragging, resizing, snapping,
 * z-index ordering, minimizing, maximizing, multi-space tracking, and dialogs.
 * App templates and event handlers have been modularized into js/apps/*.
 */
// Window management system for BrowOS
class WindowManager {
    constructor() {
        this.windows = [];
        this.windowCounter = 0;
        this.zIndexCounter = 1000;
    }

    static createWindow(appName, title = appName, content = '') {
        if (!window.windowManager) {
            window.windowManager = new WindowManager();
        }
        return window.windowManager.createWindowInstance(appName, title, content);
    }

    createWindowInstance(appName, title, content) {
        this.windowCounter++;
        const windowId = `window-${this.windowCounter}`;
        
        const windowElement = document.createElement('div');
        windowElement.className = 'window window-opening';
        windowElement.id = windowId;
        windowElement.dataset.app = appName;
        windowElement.style.setProperty('z-index', `${++this.zIndexCounter}`, 'important');
        
        // Random position for new windows
        const posX = 100 + (this.windowCounter * 30);
        const posY = 100 + (this.windowCounter * 30);
        windowElement.style.left = `${posX}px`;
        windowElement.style.top = `${posY}px`;
        windowElement.style.width = '600px';
        windowElement.style.height = '400px';

        const appIcon = BrowOSIcons.forApp(appName);
        windowElement.innerHTML = `
            <div class="window-header">
                <div class="window-controls">
                    ${BrowOSIcons.control('close', 'Close')}
                    ${BrowOSIcons.control('minimize', 'Minimize')}
                    ${BrowOSIcons.control('maximize', 'Maximize')}
                </div>
                <div class="window-title">
                    ${BrowOSIcons.img(appIcon, title, 'window-app-icon')}
                    <span>${title}</span>
                </div>
            </div>
            <div class="window-content app-container">
                ${this.getAppContent(appName)}
            </div>
            <div class="window-resize-handle"></div>
        `;

        document.getElementById('windows-container').appendChild(windowElement);


        document.getElementById('windows-container').appendChild(windowElement);

        // Delegate app-specific initialization to AppRegistry
        if (window.AppRegistry && typeof window.AppRegistry.initApp === 'function') {
            window.AppRegistry.initApp(appName, windowElement, this);
        }

        const windowObj = {
            id: windowId,
            appName: appName,
            element: windowElement,
            isMinimized: false,
            isMaximized: false,
            // Virtual desktop (BrowSpaces). New windows open on the active space.
            spaceIndex: (window.BrowSpaces ? window.BrowSpaces.getActive() : 0)
        };
        this.windows.push(windowObj);

        // Setup event handlers for the window
        this.setupWindowEvents(windowElement, windowObj);

        // Initialize terminal shell asynchronously
        if (appName === 'terminal') {
            if (typeof window.BrowShell !== 'undefined') {
                const shell = new window.BrowShell();
                const container = windowElement.querySelector('.terminal-shell-container');
                if (container) {
                    setTimeout(() => shell.open(container, windowObj), 50);
                }
            } else {
                console.error("BrowShell not loaded. Check script order.");
            }
        }

        // Initialize CodeBrow IDE asynchronously
        if (appName === 'codebrow') {
            if (typeof window.CodeBrowApp !== 'undefined') {
                const codebrow = new window.CodeBrowApp();
                const container = windowElement.querySelector('.codebrow-window');
                if (container) {
                    setTimeout(() => codebrow.mount(container, windowObj), 50);
                }
            } else {
                console.error("CodeBrowApp not loaded. Check script order.");
            }
        }
        
        // Bring window to front
        this.bringToFront(windowElement);
        try { window.BrowSettings?.audio?.play('open'); } catch (e) {}

        // Remove opening animation class after animation completes
        setTimeout(() => {
            windowElement.classList.remove('window-opening');
        }, 300);

        return windowObj;
    }

    openFileInBrowNote(filePath) {
        const existingWindow = this.windows.find(w => w.appName === 'brownote');
        if (existingWindow) {
            if (window.BrowSpaces) {
                window.BrowSpaces.focusWindow(existingWindow);
            } else {
                if (existingWindow.isMinimized) {
                    this.restoreWindow(existingWindow.element, existingWindow);
                }
                this.bringToFront(existingWindow.element);
            }
            if (existingWindow.element.openFileInBrowNote) {
                existingWindow.element.openFileInBrowNote(filePath);
            }
            return;
        }

        const windowObj = this.createWindowInstance('brownote', 'Brow Note');
        setTimeout(() => {
            if (windowObj.element.openFileInBrowNote) {
                windowObj.element.openFileInBrowNote(filePath);
            }
        }, 100);
    }

    openFileInCodeBrow(filePath) {
        const existingWindow = this.windows.find(w => w.appName === 'codebrow');
        if (existingWindow) {
            if (window.BrowSpaces) {
                window.BrowSpaces.focusWindow(existingWindow);
            } else {
                if (existingWindow.isMinimized) {
                    this.restoreWindow(existingWindow.element, existingWindow);
                }
                this.bringToFront(existingWindow.element);
            }
            if (existingWindow.element.openFileInCodeBrow) {
                existingWindow.element.openFileInCodeBrow(filePath);
            }
            return;
        }

        const windowObj = this.createWindowInstance('codebrow', 'CodeBrow');
        setTimeout(() => {
            if (windowObj.element.openFileInCodeBrow) {
                windowObj.element.openFileInCodeBrow(filePath);
            }
        }, 150);
    }

    openFileInPhotos(filePath, fileName) {
        const existingWindow = this.windows.find(w => w.appName === 'photos');
        const loadFile = async () => {
            if (!window.filesystem || !window.filesystem.isMounted()) return;
            const blob = await window.filesystem.readFileAsBlob(filePath);
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const ext = '.' + fileName.split('.').pop().toLowerCase();
            const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico', '.tiff', '.tif'];
            const type = imageExts.includes(ext) ? 'image' : 'video';

            if (existingWindow && existingWindow.element.openFileInPhotos) {
                existingWindow.element.openFileInPhotos({ name: fileName, url, type, source: 'mounted', path: filePath });
            }
        };

        if (existingWindow) {
            if (window.BrowSpaces) {
                window.BrowSpaces.focusWindow(existingWindow);
            } else {
                if (existingWindow.isMinimized) {
                    this.restoreWindow(existingWindow.element, existingWindow);
                }
                this.bringToFront(existingWindow.element);
            }
            loadFile();
            return;
        }

        const windowObj = this.createWindowInstance('photos', 'Photos');
        setTimeout(() => {
            if (windowObj.element.openFileInPhotos) {
                loadFile();
            }
        }, 100);
    }


    // ─── Modular App Forwarders (Backward Compatibility) ───────────────
    getAppContent(appName) {
        if (window.AppRegistry && typeof window.AppRegistry.getContent === 'function') {
            return window.AppRegistry.getContent(appName, this.windowCounter);
        }
        return `<div class="${appName}-window" style="height: 100%; width: 100%;"></div>`;
    }

    initSettingsEvents(windowElement) {
        if (window.BrowAppSettings) return window.BrowAppSettings.initEvents(windowElement);
    }

    initBrowNoteEvents(windowElement) {
        if (window.BrowAppNote) return window.BrowAppNote.initEvents(windowElement);
    }

    initCalculatorEvents(windowElement) {
        if (window.BrowAppCalculator) return window.BrowAppCalculator.initEvents(windowElement);
    }

    initCameraEvents(windowElement) {
        if (window.BrowAppCamera) return window.BrowAppCamera.initEvents(windowElement);
    }

    initMusicEvents(windowElement) {
        if (window.BrowAppMusic) return window.BrowAppMusic.initEvents(windowElement);
    }

    initPhotosEvents(windowElement) {
        if (window.BrowAppPhotos) return window.BrowAppPhotos.initEvents(windowElement);
    }

    setupWindowEvents(windowElement, windowObj) {
        const header = windowElement.querySelector('.window-header');
        const closeBtn = windowElement.querySelector('.close');
        const minimizeBtn = windowElement.querySelector('.minimize');
        const maximizeBtn = windowElement.querySelector('.maximize');
        
        let isDragging = false;
        let isResizing = false;
        let dragOffset = { x: 0, y: 0 };
        let originalPosition = { x: 0, y: 0 };
        let originalSize = { width: 0, height: 0 };
        
        // Ensure the visual snap-preview landing guide exists in DOM
        let snapPreview = document.getElementById('snap-preview');
        if (!snapPreview) {
            snapPreview = document.createElement('div');
            snapPreview.id = 'snap-preview';
            document.body.appendChild(snapPreview);
        }

        let dragFrame = null;
        let pendingLeft = 0;
        let pendingTop = 0;
        let pendingMouseX = 0;
        let pendingMouseY = 0;

        // Window dragging with 120 FPS rAF coalescing
        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('.window-control')) return;
            
            isDragging = true;
            this.bringToFront(windowElement);
            windowElement.classList.add('is-dragging');
            document.body.classList.add('is-window-dragging');
            
            // Interactive peeling: if snapped or maximized, drag immediately peels it off
            if (windowObj.isMaximized || windowElement.classList.contains('snapped')) {
                if (windowObj.isMaximized) {
                    this.maximizeWindow(windowElement, windowObj);
                }
                
                windowElement.classList.remove('snapped', 'window-snapped-left', 'window-snapped-right');
                windowElement.style.removeProperty('position');
                windowElement.style.removeProperty('top');
                windowElement.style.removeProperty('left');
                windowElement.style.removeProperty('width');
                windowElement.style.removeProperty('height');
                windowElement.style.removeProperty('border-radius');
                windowElement.style.removeProperty('z-index');

                // Center cursor horizontally on the peeled floating header
                const floatWidth = windowObj.savedPosition ? windowObj.savedPosition.width : 600;
                const floatHeight = windowObj.savedPosition ? windowObj.savedPosition.height : 400;
                
                windowElement.style.width = floatWidth + 'px';
                windowElement.style.height = floatHeight + 'px';
                windowElement.style.left = (e.clientX - floatWidth / 2) + 'px';
                windowElement.style.top = (e.clientY - 16) + 'px'; // center vertically on header
                
                dragOffset.x = floatWidth / 2;
                dragOffset.y = 16;
            } else {
                const rect = windowElement.getBoundingClientRect();
                dragOffset.x = e.clientX - rect.left;
                dragOffset.y = e.clientY - rect.top;
            }
            
            e.preventDefault();
        });

        // Close button
        closeBtn.addEventListener('click', () => {
            this.closeWindow(windowElement, windowObj);
        });

        // Minimize button
        minimizeBtn.addEventListener('click', () => {
            this.minimizeWindow(windowElement, windowObj);
        });

        // Maximize button
        maximizeBtn.addEventListener('click', () => {
            this.maximizeWindow(windowElement, windowObj);
        });

        // Right-click header → move window between desktops (BrowSpaces)
        header.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (window.desktop && typeof window.desktop.hideContextMenu === 'function') {
                window.desktop.hideContextMenu();
            }
            document.querySelectorAll('.mac-context-menu[data-source="window"]').forEach(m => m.remove());

            const spaces = window.BrowSpaces;
            const total = spaces ? spaces.getCount() : 1;
            const cur = windowObj.spaceIndex ?? 0;

            const menu = document.createElement('div');
            menu.className = 'mac-context-menu visible';
            menu.dataset.source = 'window';

            for (let i = 0; i < total; i++) {
                const el = document.createElement('div');
                el.className = 'mac-context-menu-item';
                el.innerHTML = `<span>${i === cur ? '✓ ' : ''}Move to Desktop ${i + 1}</span>`;
                if (i === cur) {
                    el.style.opacity = '0.5';
                    el.style.pointerEvents = 'none';
                } else {
                    el.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        menu.remove();
                        if (spaces) spaces.moveWindowTo(windowObj, i);
                    });
                }
                menu.appendChild(el);
            }

            const div = document.createElement('div');
            div.className = 'mac-context-menu-divider';
            menu.appendChild(div);

            const mc = document.createElement('div');
            mc.className = 'mac-context-menu-item';
            mc.textContent = 'Mission Control';
            mc.addEventListener('click', (ev) => {
                ev.stopPropagation();
                menu.remove();
                if (spaces) spaces.openOverview();
            });
            menu.appendChild(mc);

            document.body.appendChild(menu);

            let left = e.clientX;
            let top = e.clientY;
            requestAnimationFrame(() => {
                const rect = menu.getBoundingClientRect();
                if (left + rect.width > window.innerWidth) left -= rect.width;
                if (top + rect.height > window.innerHeight) top -= rect.height;
                menu.style.left = left + 'px';
                menu.style.top = top + 'px';
            });

            const onDocDown = (ev) => {
                if (!menu.contains(ev.target)) {
                    menu.remove();
                    document.removeEventListener('mousedown', onDocDown);
                }
            };
            setTimeout(() => document.addEventListener('mousedown', onDocDown), 50);
        });

        // Resize handle
        const resizeHandle = windowElement.querySelector('.window-resize-handle');
        resizeHandle.addEventListener('mousedown', (e) => {
            isResizing = true;
            originalSize.width = windowElement.offsetWidth;
            originalSize.height = windowElement.offsetHeight;
            e.preventDefault();
        });

        // Global mouse events with rAF coalescing (120 FPS buttery smooth)
        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                pendingLeft = e.clientX - dragOffset.x;
                pendingTop = e.clientY - dragOffset.y;
                pendingMouseX = e.clientX;
                pendingMouseY = e.clientY;

                if (!dragFrame) {
                    dragFrame = requestAnimationFrame(() => {
                        dragFrame = null;
                        if (!isDragging) return;

                        windowElement.style.left = pendingLeft + 'px';
                        windowElement.style.top = pendingTop + 'px';

                        // Screen edge snapping boundary checks (20px edge threshold)
                        const edgeThreshold = 20;
                        let activeZone = null;

                        if (pendingMouseX < edgeThreshold) {
                            activeZone = 'left';
                        } else if (pendingMouseX > window.innerWidth - edgeThreshold) {
                            activeZone = 'right';
                        } else if (pendingMouseY < edgeThreshold + 40) { // menu-bar height margin
                            activeZone = 'top';
                        }

                        const menuBarHeight = 38;
                        const availableHeight = window.innerHeight;

                        if (activeZone === 'left') {
                            snapPreview.style.top = `${menuBarHeight}px`;
                            snapPreview.style.left = '0px';
                            snapPreview.style.width = `${window.innerWidth / 2}px`;
                            snapPreview.style.height = `${availableHeight - menuBarHeight}px`;
                            snapPreview.classList.add('visible');
                        } else if (activeZone === 'right') {
                            snapPreview.style.top = `${menuBarHeight}px`;
                            snapPreview.style.left = `${window.innerWidth / 2}px`;
                            snapPreview.style.width = `${window.innerWidth / 2}px`;
                            snapPreview.style.height = `${availableHeight - menuBarHeight}px`;
                            snapPreview.classList.add('visible');
                        } else if (activeZone === 'top') {
                            snapPreview.style.top = `${menuBarHeight}px`;
                            snapPreview.style.left = '0px';
                            snapPreview.style.width = `${window.innerWidth}px`;
                            snapPreview.style.height = `${availableHeight - menuBarHeight}px`;
                            snapPreview.classList.add('visible');
                        } else {
                            snapPreview.classList.remove('visible');
                        }

                        windowElement.dataset.activeSnapZone = activeZone || '';
                    });
                }
            }
            
            if (isResizing) {
                const newWidth = originalSize.width + (e.clientX - (windowElement.offsetLeft + originalSize.width));
                const newHeight = originalSize.height + (e.clientY - (windowElement.offsetTop + originalSize.height));
                
                if (newWidth > 200) windowElement.style.width = newWidth + 'px';
                if (newHeight > 150) windowElement.style.height = newHeight + 'px';
            }
        });

        document.addEventListener('mouseup', () => {
            if (dragFrame) {
                cancelAnimationFrame(dragFrame);
                dragFrame = null;
            }

            if (isDragging) {
                windowElement.classList.remove('is-dragging');
                document.body.classList.remove('is-window-dragging');

                const activeZone = windowElement.dataset.activeSnapZone;
                const menuBarHeight = 38;
                const availableHeight = window.innerHeight;

                if (activeZone === 'left' || activeZone === 'right') {
                    // Save floating position before docking
                    windowObj.savedPosition = {
                        top: windowElement.offsetTop,
                        left: windowElement.offsetLeft,
                        width: windowElement.offsetWidth,
                        height: windowElement.offsetHeight
                    };

                    windowElement.classList.add('snapped');
                    try { window.BrowSettings?.audio?.play('snap'); } catch (e) {}
                    if (activeZone === 'left') {
                        windowElement.classList.add('window-snapped-left');
                        windowElement.style.setProperty('left', '0', 'important');
                        windowElement.style.setProperty('border-radius', '12px 0 0 12px', 'important');
                    } else {
                        windowElement.classList.add('window-snapped-right');
                        windowElement.style.setProperty('left', `${window.innerWidth / 2}px`, 'important');
                        windowElement.style.setProperty('border-radius', '0 12px 12px 0', 'important');
                    }

                    windowElement.style.setProperty('position', 'fixed', 'important');
                    windowElement.style.setProperty('top', `${menuBarHeight}px`, 'important');
                    windowElement.style.setProperty('width', `${window.innerWidth / 2}px`, 'important');
                    windowElement.style.setProperty('height', `${availableHeight - menuBarHeight}px`, 'important');
                    windowElement.style.setProperty('z-index', '19999', 'important');
                } else if (activeZone === 'top') {
                    this.maximizeWindow(windowElement, windowObj);
                }

                if (snapPreview) snapPreview.classList.remove('visible');
                windowElement.dataset.activeSnapZone = '';
            }

            isDragging = false;
            isResizing = false;
        });

        // Bring to front when clicked
        windowElement.addEventListener('mousedown', () => {
            this.bringToFront(windowElement);
        });

        window.addEventListener('resize', () => {
            if (!windowObj.isMaximized) return;
            windowElement.style.setProperty('width', `${window.innerWidth}px`, 'important');
            windowElement.style.setProperty('height', `${window.innerHeight}px`, 'important');
        });
    }

    bringToFront(windowElement) {
        const nextZ = ++this.zIndexCounter;
        windowElement.style.setProperty('z-index', `${nextZ}`, 'important');

        // Spatial Focus Elevation
        for (const w of this.windows) {
            if (w.element) {
                w.element.classList.remove('is-active');
            }
        }
        windowElement.classList.add('is-active');

        if (window.desktop && window.desktop.updateTaskbar) {
            window.desktop.updateTaskbar();
        }
    }

    closeWindow(windowElement, windowObj) {
        try { window.BrowSettings?.audio?.play('close'); } catch (e) {}
        // Dispatch close event so apps can safely dispose resources immediately
        windowElement.dispatchEvent(new CustomEvent('window-closing'));
        if (windowElement._snake3D && typeof windowElement._snake3D.destroy === 'function') {
            windowElement._snake3D.destroy();
        }
        if (windowElement._terrario && typeof windowElement._terrario.destroy === 'function') {
            windowElement._terrario.destroy();
        }
        if (windowElement._browcut && typeof windowElement._browcut.destroy === 'function') {
            windowElement._browcut.destroy();
        }
        windowElement.classList.add('window-closing');
        setTimeout(() => {
            windowElement.remove();
            this.windows = this.windows.filter(w => w.id !== windowObj.id);
            if (window.desktop && window.desktop.updateTaskbar) {
                window.desktop.updateTaskbar();
            }
        }, 160); // 160ms snappy spring exit
    }

    minimizeWindow(windowElement, windowObj) {
        try { window.BrowSettings?.audio?.play('minimize'); } catch (e) {}
        const rect = windowElement.getBoundingClientRect();
        const appName = windowObj.appName;
        const effect = localStorage.getItem('browos_minimize_effect') || 'scale';

        const dock = document.getElementById('dock');
        const dockIcon = document.querySelector(`.dock-app[data-app="${appName}"]`);

        // Target center: Symmetrically into the horizontal center of the dock
        const targetCenterX = window.innerWidth / 2;
        const targetCenterY = window.innerHeight - 44;

        const winCenterX = rect.left + rect.width / 2;
        const winCenterY = rect.top + rect.height / 2;

        const destX = targetCenterX - winCenterX;
        const destY = (effect === 'genie') ? (targetCenterY - rect.bottom) : (targetCenterY - winCenterY);

        let dockPinchPct = 50;
        if (rect.width > 0) {
            const rawPct = ((targetCenterX - rect.left) / rect.width) * 100;
            dockPinchPct = Math.max(10, Math.min(90, rawPct));
        }

        let targetScale = 0.08;
        if (rect.width > 0 && rect.height > 0) {
            targetScale = Math.max(0.04, Math.min(0.22, 52 / Math.max(rect.width, rect.height)));
        }

        windowElement.style.setProperty('--dash-x', `${destX.toFixed(1)}px`);
        windowElement.style.setProperty('--dash-y', `${destY.toFixed(1)}px`);
        windowElement.style.setProperty('--target-scale', targetScale.toFixed(4));
        windowElement.style.setProperty('--dock-pinch', `${dockPinchPct.toFixed(1)}%`);

        // 1. Mark window minimized state immediately at t = 0
        windowObj.isMinimized = true;

        // 2. Animate window going DOWN
        windowElement.classList.remove('window-opening', 'window-restoring', 'window-genie-restoring');
        const minClass = (effect === 'genie') ? 'window-genie-minimizing' : 'window-minimizing';
        windowElement.classList.add(minClass);

        // 3. Immediately trigger dock update so if dock was hidden/maximized, it smoothly comes UP concurrently
        const wasHidden = dock && (dock.classList.contains('dock-auto-hidden') || dock.classList.contains('hidden-maximized'));
        if (window.desktop && window.desktop.updateTaskbar) {
            window.desktop.updateTaskbar();
        }

        // 4. If dock was already visible (non-maximized), smoothly animate dock coming up to meet the descending window
        if (dock && !wasHidden) {
            dock.style.transition = 'none';
            dock.style.transform = 'translateX(-50%) translateY(22px)';
            void dock.offsetHeight; // force reflow
            dock.style.transition = 'transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)';
            dock.style.transform = 'translateX(-50%) translateY(0)';
            setTimeout(() => {
                dock.style.transition = '';
                dock.style.transform = '';
            }, 290);
        }

        if (dockIcon) {
            dockIcon.classList.add('is-minimized');
        }

        const duration = (effect === 'genie') ? 320 : 280;
        setTimeout(() => {
            windowElement.classList.remove('window-minimizing', 'window-genie-minimizing');
            windowElement.classList.add('window-minimized');
        }, duration);
    }

    restoreWindow(windowElement, windowObj) {
        try { window.BrowSettings?.audio?.play('restore'); } catch (e) {}
        const appName = windowObj.appName;
        const effect = localStorage.getItem('browos_minimize_effect') || 'scale';
        const dock = document.getElementById('dock');
        const dockIcon = document.querySelector(`.dock-app[data-app="${appName}"]`);

        // Remove minimized state first so getBoundingClientRect() has accurate non-zero geometry
        windowElement.classList.remove('window-minimized', 'window-minimizing', 'window-genie-minimizing');
        const rect = windowElement.getBoundingClientRect();

        // Origin center: emerges straight from the center of the dock
        const targetCenterX = window.innerWidth / 2;
        const targetCenterY = window.innerHeight - 44;

        const winCenterX = rect.left + rect.width / 2;
        const winCenterY = rect.top + rect.height / 2;

        const destX = targetCenterX - winCenterX;
        const destY = (effect === 'genie') ? (targetCenterY - rect.bottom) : (targetCenterY - winCenterY);

        let dockPinchPct = 50;
        if (rect.width > 0) {
            const rawPct = ((targetCenterX - rect.left) / rect.width) * 100;
            dockPinchPct = Math.max(10, Math.min(90, rawPct));
        }

        let targetScale = 0.08;
        if (rect.width > 0 && rect.height > 0) {
            targetScale = Math.max(0.04, Math.min(0.22, 52 / Math.max(rect.width, rect.height)));
        }

        windowElement.style.setProperty('--dash-x', `${destX.toFixed(1)}px`);
        windowElement.style.setProperty('--dash-y', `${destY.toFixed(1)}px`);
        windowElement.style.setProperty('--target-scale', targetScale.toFixed(4));
        windowElement.style.setProperty('--dock-pinch', `${dockPinchPct.toFixed(1)}%`);

        // 1. Mark un-minimized at t = 0
        windowObj.isMinimized = false;
        this.bringToFront(windowElement);

        // 2. Play restore animation
        const restClass = (effect === 'genie') ? 'window-genie-restoring' : 'window-restoring';
        windowElement.classList.add(restClass);

        // 3. If window was maximized, update taskbar at t = 0 so dock smoothly slides down
        if (window.desktop && window.desktop.updateTaskbar) {
            window.desktop.updateTaskbar();
        }

        if (dockIcon) {
            dockIcon.classList.remove('is-minimized');
        }

        const duration = (effect === 'genie') ? 300 : 280;
        setTimeout(() => {
            windowElement.classList.remove('window-restoring', 'window-genie-restoring');
        }, duration);
    }

    maximizeWindow(windowElement, windowObj) {
        if (windowObj.isMaximized) {
            // Restore from maximized using FLIP (zero reflow during animation)
            const firstRect = windowElement.getBoundingClientRect();

            windowElement.classList.remove('window-maximized');
            windowElement.style.removeProperty('position');
            windowElement.style.removeProperty('top');
            windowElement.style.removeProperty('left');
            windowElement.style.removeProperty('width');
            windowElement.style.removeProperty('height');
            windowElement.style.removeProperty('border-radius');

            if (windowObj.savedPosition) {
                windowElement.style.top = windowObj.savedPosition.top + 'px';
                windowElement.style.left = windowObj.savedPosition.left + 'px';
                windowElement.style.width = windowObj.savedPosition.width + 'px';
                windowElement.style.height = windowObj.savedPosition.height + 'px';
            }

            const lastRect = windowElement.getBoundingClientRect();

            const deltaX = firstRect.left - lastRect.left;
            const deltaY = firstRect.top - lastRect.top;
            const scaleX = firstRect.width / Math.max(1, lastRect.width);
            const scaleY = firstRect.height / Math.max(1, lastRect.height);

            windowElement.classList.add('window-maximizing-flip');
            windowElement.style.transformOrigin = 'top left';
            windowElement.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0) scale(${scaleX}, ${scaleY})`;
            windowElement.style.transition = 'none';

            // Force reflow for initial transform state
            void windowElement.offsetWidth;

            requestAnimationFrame(() => {
                windowElement.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), border-radius 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
                windowElement.style.transform = 'translate3d(0, 0, 0) scale(1, 1)';
            });

            setTimeout(() => {
                windowElement.classList.remove('window-maximizing-flip');
                windowElement.style.removeProperty('transform');
                windowElement.style.removeProperty('transform-origin');
                windowElement.style.removeProperty('transition');
            }, 260);

            windowObj.isMaximized = false;
            this.bringToFront(windowElement);
        } else {
            // Maximize using FLIP (zero reflow during animation)
            try { window.BrowSettings?.audio?.play('maximize'); } catch (e) {}
            const firstRect = windowElement.getBoundingClientRect();

            windowObj.savedPosition = {
                top: windowElement.offsetTop,
                left: windowElement.offsetLeft,
                width: windowElement.offsetWidth,
                height: windowElement.offsetHeight
            };

            windowElement.classList.add('window-maximized');
            windowElement.style.setProperty('position', 'fixed', 'important');
            windowElement.style.setProperty('top', '0', 'important');
            windowElement.style.setProperty('left', '0', 'important');
            windowElement.style.setProperty('width', '100vw', 'important');
            windowElement.style.setProperty('height', '100vh', 'important');
            windowElement.style.setProperty('border-radius', '0', 'important');

            const lastRect = windowElement.getBoundingClientRect();

            const deltaX = firstRect.left - lastRect.left;
            const deltaY = firstRect.top - lastRect.top;
            const scaleX = firstRect.width / Math.max(1, lastRect.width);
            const scaleY = firstRect.height / Math.max(1, lastRect.height);

            windowElement.classList.add('window-maximizing-flip');
            windowElement.style.transformOrigin = 'top left';
            windowElement.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0) scale(${scaleX}, ${scaleY})`;
            windowElement.style.transition = 'none';

            // Force reflow for initial transform state
            void windowElement.offsetWidth;

            requestAnimationFrame(() => {
                windowElement.style.transition = 'transform 0.26s cubic-bezier(0.16, 1, 0.3, 1), border-radius 0.26s cubic-bezier(0.16, 1, 0.3, 1)';
                windowElement.style.transform = 'translate3d(0, 0, 0) scale(1, 1)';
            });

            setTimeout(() => {
                windowElement.classList.remove('window-maximizing-flip');
                windowElement.style.removeProperty('transform');
                windowElement.style.removeProperty('transform-origin');
                windowElement.style.removeProperty('transition');
            }, 270);

            windowObj.isMaximized = true;
            this.bringToFront(windowElement);
        }

        if (window.desktop && window.desktop.updateTaskbar) {
            window.desktop.updateTaskbar();
        }
    }

    launchApp(appName) {
        if (!window.appsManager) return;
        const app = window.appsManager.getAppInfo(appName);
        if (!app) {
            console.warn(`App ${appName} not found`);
            return;
        }

        // Apps are single-instance from launch surfaces. Reuse an existing
        // window so duplicate click/event signals cannot create duplicates.
        const existingWindow = this.windows.find(w => w.appName === appName);
        if (existingWindow) {
            // Jump to the window's desktop first (BrowSpaces), then focus it.
            if (window.BrowSpaces) {
                window.BrowSpaces.focusWindow(existingWindow);
            } else {
                if (existingWindow.isMinimized) {
                    this.restoreWindow(existingWindow.element, existingWindow);
                }
                this.bringToFront(existingWindow.element);
            }
            return existingWindow;
        }

        return this.createWindowInstance(appName, app.windowTitle);
    }
}

// Initialize window manager
window.windowManager = new WindowManager();

// BrowDialog system for macOS-like alerts and prompts
class BrowDialog {
    static _createBaseDialog(title, message) {
        const backdrop = document.createElement('div');
        backdrop.className = 'brow-dialog-backdrop';

        const dialog = document.createElement('div');
        dialog.className = 'brow-dialog';

        const titleEl = document.createElement('div');
        titleEl.className = 'brow-dialog-title';
        titleEl.textContent = title;

        const msgEl = document.createElement('div');
        msgEl.className = 'brow-dialog-message';
        msgEl.textContent = message;

        dialog.appendChild(titleEl);
        dialog.appendChild(msgEl);
        backdrop.appendChild(dialog);

        return { backdrop, dialog };
    }

    static alert(title, message) {
        return new Promise((resolve) => {
            const { backdrop, dialog } = this._createBaseDialog(title, message);

            const btnContainer = document.createElement('div');
            btnContainer.className = 'brow-dialog-buttons';

            const okBtn = document.createElement('button');
            okBtn.className = 'brow-dialog-btn primary';
            okBtn.textContent = 'OK';

            okBtn.onclick = () => {
                document.body.removeChild(backdrop);
                resolve();
            };

            btnContainer.appendChild(okBtn);
            dialog.appendChild(btnContainer);
            document.body.appendChild(backdrop);
            try { window.BrowSettings?.audio?.play('notification'); } catch (e) {}
            okBtn.focus();
        });
    }

    static confirm(title, message, isDanger = false) {
        return new Promise((resolve) => {
            const { backdrop, dialog } = this._createBaseDialog(title, message);

            const btnContainer = document.createElement('div');
            btnContainer.className = 'brow-dialog-buttons';

            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'brow-dialog-btn secondary';
            cancelBtn.textContent = 'Cancel';

            const confirmBtn = document.createElement('button');
            confirmBtn.className = `brow-dialog-btn ${isDanger ? 'danger' : 'primary'}`;
            confirmBtn.textContent = 'OK';

            const close = (result) => {
                document.body.removeChild(backdrop);
                resolve(result);
            };

            cancelBtn.onclick = () => close(false);
            confirmBtn.onclick = () => close(true);

            btnContainer.appendChild(cancelBtn);
            btnContainer.appendChild(confirmBtn);
            dialog.appendChild(btnContainer);
            document.body.appendChild(backdrop);
            cancelBtn.focus();
        });
    }

    static prompt(title, message, defaultValue = '') {
        return new Promise((resolve) => {
            const { backdrop, dialog } = this._createBaseDialog(title, message);

            const input = document.createElement('input');
            input.className = 'brow-dialog-input';
            input.type = 'text';
            input.value = defaultValue;

            const btnContainer = document.createElement('div');
            btnContainer.className = 'brow-dialog-buttons';

            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'brow-dialog-btn secondary';
            cancelBtn.textContent = 'Cancel';

            const confirmBtn = document.createElement('button');
            confirmBtn.className = 'brow-dialog-btn primary';
            confirmBtn.textContent = 'OK';

            const close = (result) => {
                document.body.removeChild(backdrop);
                resolve(result);
            };

            cancelBtn.onclick = () => close(null);
            confirmBtn.onclick = () => close(input.value);
            
            input.onkeydown = (e) => {
                if (e.key === 'Enter') close(input.value);
                if (e.key === 'Escape') close(null);
            };

            dialog.appendChild(input);
            btnContainer.appendChild(cancelBtn);
            btnContainer.appendChild(confirmBtn);
            dialog.appendChild(btnContainer);
            document.body.appendChild(backdrop);
            
            input.focus();
            input.select();
        });
    }
}
window.BrowDialog = BrowDialog;

