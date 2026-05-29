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
        windowElement.style.zIndex = this.zIndexCounter++;
        
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

        // Initialize specific app logic if needed
        if (appName === 'filebrow') {
            // Keep a global reference for the UI callbacks
            window.filebrowApp = new window.FileBrow(`filebrow-app-container-${this.windowCounter}`);
        } else if (appName === 'settings') {
            this.initSettingsEvents(windowElement);
        } else if (appName === 'brownote') {
            this.initBrowNoteEvents(windowElement);
        } else if (appName === 'safari') {
            this.initSafariEvents(windowElement);
        } else if (appName === 'calculator') {
            this.initCalculatorEvents(windowElement);
        } else if (appName === 'camera') {
            this.initCameraEvents(windowElement);
        } else if (appName === 'music') {
            this.initMusicEvents(windowElement);
        } else if (appName === 'photos') {
            this.initPhotosEvents(windowElement);
        } else if (appName === 'starship') {
            if (window.initStarshipGame) window.initStarshipGame(windowElement);
        } else if (appName === 'browracer') {
            if (window.initBrowRacerGame) window.initBrowRacerGame(windowElement);
        }

        // Add window to tracking
        const windowObj = {
            id: windowId,
            appName: appName,
            element: windowElement,
            isMinimized: false,
            isMaximized: false
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
        
        // Bring window to front
        this.bringToFront(windowElement);
        
        // Remove opening animation class after animation completes
        setTimeout(() => {
            windowElement.classList.remove('window-opening');
        }, 300);

        return windowObj;
    }

    openFileInBrowNote(filePath) {
        const existingWindow = this.windows.find(w => w.appName === 'brownote');
        if (existingWindow) {
            if (existingWindow.isMinimized) {
                this.restoreWindow(existingWindow.element, existingWindow);
            }
            this.bringToFront(existingWindow.element);
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
            if (existingWindow.isMinimized) {
                this.restoreWindow(existingWindow.element, existingWindow);
            }
            this.bringToFront(existingWindow.element);
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

    initSettingsEvents(windowElement) {
        const sidebarItems = windowElement.querySelectorAll('.sidebar-item');
        const sections = windowElement.querySelectorAll('.settings-section');

        sidebarItems.forEach(item => {
            item.addEventListener('click', () => {
                const section = item.getAttribute('data-section');

                sidebarItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');

                sections.forEach(s => s.classList.add('hidden'));
                const target = windowElement.querySelector(`#settings-${section}`);
                if (target) target.classList.remove('hidden');
            });
        });

        windowElement.querySelectorAll('.color-swatch').forEach(swatch => {
            swatch.addEventListener('click', () => {
                windowElement.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
                swatch.classList.add('active');
            });
        });

        const savedWallpaper = localStorage.getItem('browos_wallpaper') || 'sonoma';
        const customUrl = localStorage.getItem('browos_custom_wallpaper');
        const localWallpaper = localStorage.getItem('browos_local_wallpaper');
        const wallpaperEl = document.querySelector('#desktop .wallpaper');
        const blobs = wallpaperEl.querySelectorAll('.wallpaper-blob, .wallpaper-noise');
        const urlInput = windowElement.querySelector('#custom-wallpaper-url');
        const applyBtn = windowElement.querySelector('#apply-wallpaper-btn');
        const fileNameEl = windowElement.querySelector('#upload-file-name');

        const setWallpaper = (url) => {
            wallpaperEl.style.background = `url('${url}') center/cover no-repeat`;
            blobs.forEach(b => b.style.display = 'none');
        };

        if (localWallpaper) {
            windowElement.querySelectorAll('.wallpaper-thumb').forEach(t => t.classList.remove('active'));
            setWallpaper(localWallpaper);
            fileNameEl.textContent = 'Local image';
        } else if (customUrl) {
            urlInput.value = customUrl;
            windowElement.querySelectorAll('.wallpaper-thumb').forEach(t => t.classList.remove('active'));
            setWallpaper(customUrl);
        } else {
            setWallpaper(`assets/wallpapers/${savedWallpaper}.svg`);
            const activeThumb = windowElement.querySelector(`.wallpaper-thumb[data-wallpaper="${savedWallpaper}"]`);
            if (activeThumb) {
                windowElement.querySelectorAll('.wallpaper-thumb').forEach(t => t.classList.remove('active'));
                activeThumb.classList.add('active');
            }
        }

        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                const url = urlInput.value.trim();
                if (!url) return;
                localStorage.setItem('browos_custom_wallpaper', url);
                windowElement.querySelectorAll('.wallpaper-thumb').forEach(t => t.classList.remove('active'));
                const img = new Image();
                img.onload = () => setWallpaper(url);
                img.onerror = () => {
                    const savedWallpaper = localStorage.getItem('browos_wallpaper') || 'sonoma';
                    setWallpaper(`assets/wallpapers/${savedWallpaper}.svg`);
                    applyBtn.textContent = 'Failed';
                    setTimeout(() => { applyBtn.textContent = 'Apply'; }, 1500);
                };
                img.src = url;
            });
        }

        windowElement.querySelectorAll('.wallpaper-thumb').forEach(thumb => {
            thumb.addEventListener('click', () => {
                windowElement.querySelectorAll('.wallpaper-thumb').forEach(t => t.classList.remove('active'));
                thumb.classList.add('active');
                const wallpaper = thumb.dataset.wallpaper;
                localStorage.removeItem('browos_custom_wallpaper');
                localStorage.removeItem('browos_local_wallpaper');
                urlInput.value = '';
                setWallpaper(`assets/wallpapers/${wallpaper}.svg`);
                localStorage.setItem('browos_wallpaper', wallpaper);
            });
        });

        const fileInput = windowElement.querySelector('#wallpaper-file-input');
        const uploadBtn = windowElement.querySelector('#upload-wallpaper-btn');

        if (uploadBtn && fileInput) {
            uploadBtn.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                fileNameEl.textContent = file.name;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const dataUrl = ev.target.result;
                    localStorage.setItem('browos_local_wallpaper', dataUrl);
                    localStorage.removeItem('browos_custom_wallpaper');
                    windowElement.querySelectorAll('.wallpaper-thumb').forEach(t => t.classList.remove('active'));
                    setWallpaper(dataUrl);
                };
                reader.readAsDataURL(file);
            });
        }

        const fsBtn = windowElement.querySelector('#fs-wallpaper-btn');
        const fsGrid = windowElement.querySelector('#wallpaper-fs-grid');

        if (fsBtn && fsGrid) {
            fsBtn.addEventListener('click', async () => {
                fsGrid.classList.remove('hidden');
                fsGrid.innerHTML = '<div style="color: rgba(255,255,255,0.5); grid-column: 1/-1; text-align: center; padding: 20px;">Loading...</div>';
                try {
                    const files = await window.filesystem.list('/');
                    const imageFiles = files.filter(f => /\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i.test(f.name));
                    if (imageFiles.length === 0) {
                        fsGrid.innerHTML = '<div style="color: rgba(255,255,255,0.5); grid-column: 1/-1; text-align: center; padding: 20px;">No images found in root directory</div>';
                        return;
                    }
                    fsGrid.innerHTML = '';
                    for (const file of imageFiles) {
                        const blob = await window.filesystem.readFileAsBlob(file.path);
                        if (!blob) continue;
                        const dataUrl = await new Promise(resolve => {
                            const reader = new FileReader();
                            reader.onload = (e) => resolve(e.target.result);
                            reader.readAsDataURL(blob);
                        });
                        const item = document.createElement('div');
                        item.className = 'wallpaper-fs-item';
                        item.innerHTML = `<img src="${dataUrl}" alt="${file.name}">`;
                        item.addEventListener('click', () => {
                            localStorage.setItem('browos_local_wallpaper', dataUrl);
                            localStorage.removeItem('browos_custom_wallpaper');
                            windowElement.querySelectorAll('.wallpaper-thumb').forEach(t => t.classList.remove('active'));
                            setWallpaper(dataUrl);
                        });
                        fsGrid.appendChild(item);
                    }
                } catch (err) {
                    fsGrid.innerHTML = '<div style="color: rgba(255,255,255,0.5); grid-column: 1/-1; text-align: center; padding: 20px;">Error loading files</div>';
                }
            });
        }

        const usernameInput = windowElement.querySelector('#setting-username');
        if (usernameInput) {
            const saved = localStorage.getItem('browos_username');
            usernameInput.value = saved || 'BrowOS User';
        }

        const saveBtn = windowElement.querySelector('#save-general-settings');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                if (usernameInput) {
                    localStorage.setItem('browos_username', usernameInput.value);
                    saveBtn.textContent = 'Saved!';
                    saveBtn.style.background = '#34c759';
                    setTimeout(() => {
                        saveBtn.textContent = 'Save Changes';
                        saveBtn.style.background = '#ffffff';
                    }, 1500);
                }
            });
        }

        const storageInfo = windowElement.querySelector('#storage-info');
        const storageBar = windowElement.querySelector('#storage-bar');
        const totalGB = 10;
        const totalBytes = totalGB * 1024 * 1024 * 1024;

        async function updateStorage() {
            const usedBytes = await window.filesystem.getStorageUsed();
            const usedFormatted = window.filesystem.formatBytes(usedBytes);
            const availableBytes = totalBytes - usedBytes;
            const availableFormatted = window.filesystem.formatBytes(availableBytes);
            const percent = Math.min((usedBytes / totalBytes) * 100, 100);

            if (storageInfo) {
                storageInfo.textContent = `${usedFormatted} used of ${totalGB} GB (${availableFormatted} available)`;
            }
            if (storageBar) {
                storageBar.style.width = `${percent}%`;
            }
        }

        updateStorage();

        const manageBtn = windowElement.querySelector('#manage-storage-btn');
        if (manageBtn) {
            manageBtn.addEventListener('click', () => {
                window.windowManager.launchApp('filebrow');
            });
        }
    }

    initBrowNoteEvents(windowElement) {
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
                const folderPath = await window.BrowDialog.prompt('Save Location', 'Enter folder path:', '/');
                if (!folderPath) {
                    await window.BrowDialog.alert('Error', 'No folder path provided.');
                    return;
                }
                currentFilePath = `${folderPath}/${fileName}`;
                const success = await window.filesystem.createFile(folderPath, fileName, editor.innerText);
                if (success) {
                    if (fileLabel) fileLabel.textContent = fileName;
                    await window.BrowDialog.alert('Success', 'File saved successfully.');
                    if (window.filebrowApp) window.filebrowApp.render();
                } else {
                    await window.BrowDialog.alert('Error', 'Failed to save file.');
                }
                return;
            }

            const parts = currentFilePath.split('/').filter(Boolean);
            const fileName = parts.pop();
            const folderPath = '/' + parts.join('/');
            const success = await window.filesystem.createFile(folderPath, fileName, editor.innerText);
            if (success) {
                await window.BrowDialog.alert('Success', 'File saved successfully.');
                if (window.filebrowApp) window.filebrowApp.render();
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

    initSafariEvents(windowElement) {
        const iframe = windowElement.querySelector('.safari-iframe');
        const addressBar = windowElement.querySelector('.safari-address-bar');
        const backBtn = windowElement.querySelector('.safari-back-btn');
        const forwardBtn = windowElement.querySelector('.safari-forward-btn');
        const reloadBtn = windowElement.querySelector('.safari-reload-btn');
        const goBtn = windowElement.querySelector('.safari-go-btn');
        const contentArea = windowElement.querySelector('.safari-content');

        const loadingBar = document.createElement('div');
        loadingBar.className = 'safari-loading';
        loadingBar.style.display = 'none';
        contentArea.appendChild(loadingBar);

        const normalizeUrl = (input) => {
            let url = input.trim();
            if (!url) return 'https://www.example.com';
            if (!/^https?:\/\//i.test(url)) {
                if (url.includes('.') && !url.includes(' ')) {
                    url = 'https://' + url;
                } else {
                    url = 'https://www.google.com/search?igu=1&q=' + encodeURIComponent(url);
                }
            }
            return url;
        };

        const navigate = (url) => {
            const normalized = normalizeUrl(url);
            addressBar.value = normalized;
            loadingBar.style.display = 'block';
            iframe.src = normalized;
        };

        if (goBtn) {
            goBtn.addEventListener('click', () => navigate(addressBar.value));
        }

        if (addressBar) {
            addressBar.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') navigate(addressBar.value);
            });
            addressBar.addEventListener('focus', () => addressBar.select());
        }

        if (backBtn) {
            backBtn.addEventListener('click', () => {
                try { iframe.contentWindow.history.back(); } catch(e) {}
            });
        }

        if (forwardBtn) {
            forwardBtn.addEventListener('click', () => {
                try { iframe.contentWindow.history.forward(); } catch(e) {}
            });
        }

        if (reloadBtn) {
            reloadBtn.addEventListener('click', () => {
                loadingBar.style.display = 'block';
                iframe.src = iframe.src;
            });
        }

        iframe.addEventListener('load', () => {
            loadingBar.style.display = 'none';
            try {
                const title = iframe.contentDocument.title;
                if (title) {
                    const titleEl = windowElement.querySelector('.window-title span');
                    if (titleEl) titleEl.textContent = title;
                }
            } catch(e) {}
        });
    }

    initCalculatorEvents(windowElement) {
        const display = windowElement.querySelector('#calc-display');
        if (!display) return;

        windowElement.setAttribute('tabindex', '0');
        windowElement.style.outline = 'none';

        let current = '0';
        let previous = null;
        let operation = null;
        let resetNext = false;

        const formatDisplay = (val) => {
            if (val === 'Error') return val;
            const num = parseFloat(val);
            if (isNaN(num)) return '0';
            const str = String(num);
            if (str.length > 12) return num.toPrecision(8);
            return str;
        };

        const updateDisplay = () => {
            display.textContent = formatDisplay(current);
            const len = display.textContent.length;
            display.style.fontSize = len > 9 ? '28px' : len > 7 ? '34px' : '42px';
        };

        const updateActiveOp = () => {
            windowElement.querySelectorAll('.calc-op').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.action === operation && resetNext);
            });
        };

        const calculate = (a, op, b) => {
            const x = parseFloat(a), y = parseFloat(b);
            switch (op) {
                case 'add': return x + y;
                case 'subtract': return x - y;
                case 'multiply': return x * y;
                case 'divide': return y === 0 ? 'Error' : x / y;
                default: return y;
            }
        };

        const handleInput = (val, action) => {
            if (val !== undefined) {
                if (val === '.') {
                    if (resetNext) { current = '0'; resetNext = false; }
                    if (!current.includes('.')) current += '.';
                } else {
                    if (current === '0' || resetNext) { current = val; resetNext = false; }
                    else current += val;
                }
                updateActiveOp();
                updateDisplay();
                return;
            }

            switch (action) {
                case 'clear':
                    current = '0'; previous = null; operation = null; resetNext = false;
                    break;
                case 'negate':
                    current = String(parseFloat(current) * -1);
                    break;
                case 'percent':
                    current = String(parseFloat(current) / 100);
                    break;
                case 'equals':
                    if (operation && previous !== null) {
                        const result = calculate(previous, operation, current);
                        current = String(result);
                        previous = null;
                        operation = null;
                        resetNext = true;
                    }
                    break;
                default:
                    if (operation && previous !== null && !resetNext) {
                        const result = calculate(previous, operation, current);
                        current = String(result);
                    }
                    previous = current;
                    operation = action;
                    resetNext = true;
                    break;
            }
            updateActiveOp();
            updateDisplay();
        };

        windowElement.querySelectorAll('.calc-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                handleInput(btn.dataset.value, btn.dataset.action);
            });
        });

        windowElement.addEventListener('mousedown', () => windowElement.focus());
        windowElement.focus();

        const keyHandler = (e) => {
            if (document.activeElement !== windowElement) return;
            if (e.key >= '0' && e.key <= '9') {
                handleInput(e.key);
            } else if (e.key === '.') {
                handleInput('.');
            } else if (e.key === '+') {
                handleInput(undefined, 'add');
            } else if (e.key === '-') {
                handleInput(undefined, 'subtract');
            } else if (e.key === '*') {
                handleInput(undefined, 'multiply');
            } else if (e.key === '/') {
                e.preventDefault();
                handleInput(undefined, 'divide');
            } else if (e.key === 'Enter' || e.key === '=') {
                handleInput(undefined, 'equals');
            } else if (e.key === 'Escape') {
                handleInput(undefined, 'clear');
            } else if (e.key === '%') {
                handleInput(undefined, 'percent');
            } else if (e.key === 'Backspace') {
                if (current.length > 1) current = current.slice(0, -1);
                else current = '0';
                updateActiveOp();
                updateDisplay();
            }
        };

        windowElement.addEventListener('keydown', keyHandler);
        updateActiveOp();
        updateDisplay();
    }

    initCameraEvents(windowElement) {
        const video = windowElement.querySelector('#camera-viewfinder');
        const placeholder = windowElement.querySelector('#camera-placeholder');
        const captureBtn = windowElement.querySelector('#camera-capture-btn');
        const flipBtn = windowElement.querySelector('#camera-flip-btn');
        const canvas = windowElement.querySelector('#camera-canvas');
        const modeBtns = windowElement.querySelectorAll('.camera-mode-btn');

        let stream = null;
        let facingMode = 'user';
        let currentMode = 'photo';

        const startCamera = async () => {
            try {
                if (stream) {
                    stream.getTracks().forEach(track => track.stop());
                }
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
                    audio: currentMode === 'video'
                });
                video.srcObject = stream;
                video.style.display = 'block';
                placeholder.style.display = 'none';
            } catch (err) {
                console.error('Camera access denied:', err);
                video.style.display = 'none';
                placeholder.style.display = 'flex';
            }
        };

        const stopCamera = () => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
                stream = null;
                video.srcObject = null;
            }
        };

        modeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                modeBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentMode = btn.dataset.mode;
                if (currentMode === 'video') {
                    captureBtn.classList.add('video-mode');
                } else {
                    captureBtn.classList.remove('video-mode');
                }
                startCamera();
            });
        });

        captureBtn.addEventListener('click', async () => {
            if (!stream) {
                startCamera();
                return;
            }
            if (currentMode === 'photo') {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0);
                canvas.toBlob(async (blob) => {
                    const filename = `photo-${Date.now()}.png`;
                    if (window.filesystem && window.filesystem.isMounted()) {
                        await window.filesystem.ensureDirectory('Pictures');
                        const saved = await window.filesystem.createFileFromBlob(`Pictures/${filename}`, blob);
                        if (saved) {
                            console.log(`Photo saved to Pictures/${filename}`);
                        } else {
                            console.error('Failed to save photo to filesystem');
                        }
                    } else {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = filename;
                        a.click();
                        URL.revokeObjectURL(url);
                    }
                }, 'image/png');
                captureBtn.classList.add('flash');
                setTimeout(() => captureBtn.classList.remove('flash'), 200);
            }
        });

        flipBtn.addEventListener('click', () => {
            facingMode = facingMode === 'user' ? 'environment' : 'user';
            startCamera();
        });

        startCamera();

        windowElement.addEventListener('window-closing', () => {
            stopCamera();
        });

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    if (windowElement.classList.contains('window-minimized') || windowElement.classList.contains('window-closing')) {
                        stopCamera();
                    } else if (!windowElement.classList.contains('window-minimized') && !windowElement.classList.contains('window-closing')) {
                        if (!stream) startCamera();
                    }
                }
            }
        });
        observer.observe(windowElement, { attributes: true });
    }

    initMusicEvents(windowElement) {
        const audio = new Audio();
        audio.volume = 0.8;

        const trackList = windowElement.querySelector('#music-track-list');
        const emptyState = windowElement.querySelector('#music-empty-state');
        const playBtn = windowElement.querySelector('#music-play-btn');
        const playIcon = windowElement.querySelector('#music-play-icon');
        const prevBtn = windowElement.querySelector('#music-prev-btn');
        const nextBtn = windowElement.querySelector('#music-next-btn');
        const shuffleBtn = windowElement.querySelector('#music-shuffle-btn');
        const repeatBtn = windowElement.querySelector('#music-repeat-btn');
        const progressBar = windowElement.querySelector('#music-progress-bar');
        const progressFill = windowElement.querySelector('#music-progress-fill');
        const progressHandle = windowElement.querySelector('#music-progress-handle');
        const timeCurrent = windowElement.querySelector('#music-time-current');
        const timeTotal = windowElement.querySelector('#music-time-total');
        const playerTitle = windowElement.querySelector('#music-player-title');
        const playerArtist = windowElement.querySelector('#music-player-artist');
        const volumeSlider = windowElement.querySelector('#music-volume-slider');
        const volumeFill = windowElement.querySelector('#music-volume-fill');
        const volumeHandle = windowElement.querySelector('#music-volume-handle');
        const importBtn = windowElement.querySelector('#music-import-btn');
        const refreshBtn = windowElement.querySelector('#music-refresh-btn');
        const fileInput = windowElement.querySelector('#music-file-input');
        const sidebarItems = windowElement.querySelectorAll('.music-sidebar-item');
        const toolbarTitle = windowElement.querySelector('.music-toolbar-title');
        const countAll = windowElement.querySelector('#music-count-all');
        const countRecent = windowElement.querySelector('#music-count-recent');
        const countImported = windowElement.querySelector('#music-count-imported');

        let library = [];
        let imported = [];
        let currentIndex = -1;
        let isPlaying = false;
        let isShuffle = false;
        let repeatMode = 0;
        let currentView = 'all';
        let isDraggingProgress = false;
        let isDraggingVolume = false;

        const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.wma', '.opus'];

        const isAudioFile = (name) => {
            const ext = '.' + name.split('.').pop().toLowerCase();
            return AUDIO_EXTENSIONS.includes(ext);
        };

        const formatTime = (seconds) => {
            if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
            const m = Math.floor(seconds / 60);
            const s = Math.floor(seconds % 60);
            return `${m}:${s.toString().padStart(2, '0')}`;
        };

        const parseTitle = (filename) => {
            const name = filename.replace(/\.[^/.]+$/, '');
            const cleaned = name.replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
            return cleaned || filename;
        };

        const getFilteredTracks = () => {
            if (currentView === 'imported') return [...imported];
            if (currentView === 'recent') return [...library].reverse().slice(0, 20);
            return [...library];
        };

        const updateCounts = () => {
            if (countAll) countAll.textContent = library.length;
            if (countRecent) countRecent.textContent = Math.min(library.length, 20);
            if (countImported) countImported.textContent = imported.length;
        };

        const renderTrackList = () => {
            const tracks = getFilteredTracks();
            if (tracks.length === 0) {
                emptyState.style.display = 'flex';
                trackList.querySelectorAll('.music-track-item').forEach(el => el.remove());
                return;
            }
            emptyState.style.display = 'none';
            trackList.querySelectorAll('.music-track-item').forEach(el => el.remove());

            tracks.forEach((track, idx) => {
                const globalIdx = library.indexOf(track);
                const item = document.createElement('div');
                item.className = 'music-track-item' + (globalIdx === currentIndex ? ' playing' : '');
                item.innerHTML = `
                    <span class="music-track-num">${globalIdx === currentIndex && isPlaying ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>' : (idx + 1)}</span>
                    <div class="music-track-info">
                        <span class="music-track-title">${track.title}</span>
                        <span class="music-track-filename">${track.filename}</span>
                    </div>
                    <span class="music-track-duration">${track.duration || '--:--'}</span>
                `;
                item.addEventListener('click', () => {
                    playTrack(globalIdx);
                });
                trackList.appendChild(item);
            });
        };

        const playTrack = (idx) => {
            if (idx < 0 || idx >= library.length) return;
            currentIndex = idx;
            const track = library[idx];
            audio.src = track.url;
            audio.play();
            isPlaying = true;
            updatePlayButton();
            playerTitle.textContent = track.title;
            playerArtist.textContent = track.filename;
            renderTrackList();
        };

        const updatePlayButton = () => {
            if (isPlaying) {
                playIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
            } else {
                playIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
            }
        };

        const togglePlay = () => {
            if (currentIndex === -1 && library.length > 0) {
                playTrack(0);
                return;
            }
            if (isPlaying) {
                audio.pause();
                isPlaying = false;
            } else {
                audio.play();
                isPlaying = true;
            }
            updatePlayButton();
            renderTrackList();
        };

        const playNext = () => {
            if (library.length === 0) return;
            let next;
            if (isShuffle) {
                next = Math.floor(Math.random() * library.length);
            } else {
                next = (currentIndex + 1) % library.length;
            }
            playTrack(next);
        };

        const playPrev = () => {
            if (library.length === 0) return;
            if (audio.currentTime > 3) {
                audio.currentTime = 0;
                return;
            }
            let prev = (currentIndex - 1 + library.length) % library.length;
            playTrack(prev);
        };

        const loadFromMounted = async () => {
            if (!window.filesystem || !window.filesystem.isMounted()) return;
            const entries = await window.filesystem.list('Music');
            if (!entries) return;
            for (const entry of entries) {
                if (entry.type === 'file' && isAudioFile(entry.name)) {
                    if (library.some(t => t.filename === entry.name)) continue;
                    const blob = await window.filesystem.readFileAsBlob('Music/' + entry.name);
                    if (!blob) continue;
                    const url = URL.createObjectURL(blob);
                    const meta = await window.filesystem.getMetadata('Music/' + entry.name);
                    library.push({
                        filename: entry.name,
                        title: parseTitle(entry.name),
                        url: url,
                        source: 'mounted',
                        addedAt: meta ? meta.modified : Date.now(),
                        duration: '--:--'
                    });
                }
            }
            updateCounts();
            renderTrackList();
        };

        const loadImported = (files) => {
            for (const file of files) {
                if (!isAudioFile(file.name)) continue;
                if (imported.some(t => t.filename === file.name && t.size === file.size)) continue;
                const url = URL.createObjectURL(file);
                imported.push({
                    filename: file.name,
                    title: parseTitle(file.name),
                    url: url,
                    source: 'imported',
                    addedAt: Date.now(),
                    size: file.size,
                    duration: '--:--'
                });
                library.push(imported[imported.length - 1]);
            }
            updateCounts();
            renderTrackList();
        };

        audio.addEventListener('loadedmetadata', () => {
            timeTotal.textContent = formatTime(audio.duration);
            if (currentIndex >= 0 && library[currentIndex]) {
                library[currentIndex].duration = formatTime(audio.duration);
                renderTrackList();
            }
        });

        audio.addEventListener('timeupdate', () => {
            if (isDraggingProgress) return;
            const pct = (audio.currentTime / audio.duration) * 100;
            progressFill.style.width = pct + '%';
            progressHandle.style.left = pct + '%';
            timeCurrent.textContent = formatTime(audio.currentTime);
        });

        audio.addEventListener('ended', () => {
            if (repeatMode === 2) {
                audio.currentTime = 0;
                audio.play();
            } else if (repeatMode === 1) {
                playNext();
            } else {
                if (currentIndex < library.length - 1) {
                    playNext();
                } else {
                    isPlaying = false;
                    updatePlayButton();
                    renderTrackList();
                }
            }
        });

        playBtn.addEventListener('click', togglePlay);
        nextBtn.addEventListener('click', playNext);
        prevBtn.addEventListener('click', playPrev);

        shuffleBtn.addEventListener('click', () => {
            isShuffle = !isShuffle;
            shuffleBtn.classList.toggle('active', isShuffle);
        });

        repeatBtn.addEventListener('click', () => {
            repeatMode = (repeatMode + 1) % 3;
            repeatBtn.classList.toggle('active', repeatMode > 0);
            if (repeatMode === 2) {
                repeatBtn.querySelector('svg').style.color = '#ff2d55';
            } else {
                repeatBtn.querySelector('svg').style.color = '';
            }
        });

        const seekTo = (e) => {
            const rect = progressBar.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            audio.currentTime = pct * audio.duration;
            progressFill.style.width = (pct * 100) + '%';
            progressHandle.style.left = (pct * 100) + '%';
        };

        progressBar.addEventListener('mousedown', (e) => {
            isDraggingProgress = true;
            seekTo(e);
        });

        document.addEventListener('mousemove', (e) => {
            if (isDraggingProgress) seekTo(e);
            if (isDraggingVolume) {
                const rect = volumeSlider.getBoundingClientRect();
                const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                audio.volume = pct;
                volumeFill.style.width = (pct * 100) + '%';
                volumeHandle.style.left = (pct * 100) + '%';
            }
        });

        document.addEventListener('mouseup', () => {
            isDraggingProgress = false;
            isDraggingVolume = false;
        });

        volumeSlider.addEventListener('mousedown', (e) => {
            isDraggingVolume = true;
            const rect = volumeSlider.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            audio.volume = pct;
            volumeFill.style.width = (pct * 100) + '%';
            volumeHandle.style.left = (pct * 100) + '%';
        });

        importBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                loadImported(e.target.files);
                fileInput.value = '';
            }
        });

        refreshBtn.addEventListener('click', () => {
            loadFromMounted();
        });

        sidebarItems.forEach(item => {
            item.addEventListener('click', () => {
                sidebarItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                currentView = item.dataset.view;
                const titles = { all: 'All Songs', recent: 'Recently Added', imported: 'Local Files' };
                toolbarTitle.textContent = titles[currentView] || 'All Songs';
                renderTrackList();
            });
        });

        loadFromMounted();

        const cleanup = () => {
            audio.pause();
            audio.src = '';
            library.forEach(track => URL.revokeObjectURL(track.url));
            library = [];
            imported = [];
        };

        const closeObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    if (windowElement.classList.contains('window-closing') || !document.body.contains(windowElement)) {
                        cleanup();
                        closeObserver.disconnect();
                    }
                }
            }
        });
        closeObserver.observe(windowElement, { attributes: true });
    }

    initPhotosEvents(windowElement) {
        const grid = windowElement.querySelector('#photos-grid');
        const emptyState = windowElement.querySelector('#photos-empty-state');
        const importBtn = windowElement.querySelector('#photos-import-btn');
        const refreshBtn = windowElement.querySelector('#photos-refresh-btn');
        const fileInput = windowElement.querySelector('#photos-file-input');
        const sidebarItems = windowElement.querySelectorAll('.photos-sidebar-item');
        const toolbarTitle = windowElement.querySelector('#photos-toolbar-title');
        const countAll = windowElement.querySelector('#photos-count-all');
        const countImages = windowElement.querySelector('#photos-count-images');
        const countVideos = windowElement.querySelector('#photos-count-videos');

        let library = [];
        let imported = [];
        let currentView = 'all';
        let lightbox = null;
        let lightboxIndex = -1;
        let zoomLevel = 1;
        let isPanning = false;
        let panStart = { x: 0, y: 0 };
        let panOffset = { x: 0, y: 0 };

        const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico', '.tiff', '.tif'];
        const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogg', '.ogv', '.mov', '.avi', '.mkv'];

        const isImageFile = (name) => {
            const ext = '.' + name.split('.').pop().toLowerCase();
            return IMAGE_EXTENSIONS.includes(ext);
        };

        const isVideoFile = (name) => {
            const ext = '.' + name.split('.').pop().toLowerCase();
            return VIDEO_EXTENSIONS.includes(ext);
        };

        const getFilteredItems = () => {
            const all = [...library];
            if (currentView === 'images') return all.filter(i => i.type === 'image');
            if (currentView === 'videos') return all.filter(i => i.type === 'video');
            return all;
        };

        const updateCounts = () => {
            const images = library.filter(i => i.type === 'image').length;
            const videos = library.filter(i => i.type === 'video').length;
            if (countAll) countAll.textContent = library.length;
            if (countImages) countImages.textContent = images;
            if (countVideos) countVideos.textContent = videos;
        };

        const renderGrid = () => {
            const items = getFilteredItems();
            grid.querySelectorAll('.photos-grid-item').forEach(el => el.remove());

            if (items.length === 0) {
                emptyState.style.display = 'flex';
                return;
            }
            emptyState.style.display = 'none';

            items.forEach((item, idx) => {
                const globalIdx = library.indexOf(item);
                const el = document.createElement('div');
                el.className = 'photos-grid-item';
                if (item.type === 'image') {
                    el.innerHTML = `<img src="${item.url}" alt="${item.name}" loading="lazy">`;
                } else {
                    el.innerHTML = `
                        <video src="${item.url}" muted preload="metadata"></video>
                        <div class="photos-video-badge">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        </div>
                    `;
                }
                el.addEventListener('click', () => openLightbox(globalIdx));
                grid.appendChild(el);
            });
        };

        const openLightbox = (idx) => {
            if (idx < 0 || idx >= library.length) return;
            lightboxIndex = idx;
            zoomLevel = 1;
            panOffset = { x: 0, y: 0 };
            const item = library[idx];

            if (lightbox) lightbox.remove();

            lightbox = document.createElement('div');
            lightbox.className = 'photos-lightbox';
            lightbox.innerHTML = `
                <div class="photos-lightback"></div>
                <div class="photos-lightbox-content">
                    <button class="photos-lightbox-close" id="photos-lb-close">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                    <button class="photos-lightbox-nav photos-lightbox-prev" id="photos-lb-prev">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
                    </button>
                    <div class="photos-lightbox-viewer" id="photos-lb-viewer">
                        <div class="photos-lightbox-zoom-container" id="photos-lb-zoom-container"></div>
                    </div>
                    <button class="photos-lightbox-nav photos-lightbox-next" id="photos-lb-next">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                    <div class="photos-lightbox-toolbar">
                        <button class="photos-zoom-btn" id="photos-zoom-out" title="Zoom Out">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                        </button>
                        <span class="photos-zoom-level" id="photos-zoom-level">100%</span>
                        <button class="photos-zoom-btn" id="photos-zoom-in" title="Zoom In">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                        </button>
                        <button class="photos-zoom-btn" id="photos-zoom-fit" title="Fit to Screen">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
                        </button>
                    </div>
                    <div class="photos-lightbox-info">
                        <span class="photos-lightbox-name" id="photos-lb-name">${item.name}</span>
                        <span class="photos-lightbox-counter">${lightboxIndex + 1} / ${library.length}</span>
                    </div>
                </div>
            `;
            document.body.appendChild(lightbox);

            showLightboxItem();

            lightbox.querySelector('#photos-lb-close').addEventListener('click', closeLightbox);
            lightbox.querySelector('#photos-lb-prev').addEventListener('click', () => navigateLightbox(-1));
            lightbox.querySelector('#photos-lb-next').addEventListener('click', () => navigateLightbox(1));
            lightbox.querySelector('.photos-lightback').addEventListener('click', closeLightbox);

            const zoomInBtn = lightbox.querySelector('#photos-zoom-in');
            const zoomOutBtn = lightbox.querySelector('#photos-zoom-out');
            const zoomFitBtn = lightbox.querySelector('#photos-zoom-fit');
            const zoomContainer = lightbox.querySelector('#photos-lb-zoom-container');
            const viewer = lightbox.querySelector('#photos-lb-viewer');

            zoomInBtn.addEventListener('click', () => applyZoom(zoomLevel + 0.25));
            zoomOutBtn.addEventListener('click', () => applyZoom(zoomLevel - 0.25));
            zoomFitBtn.addEventListener('click', () => { zoomLevel = 1; panOffset = { x: 0, y: 0 }; updateZoom(); });

            viewer.addEventListener('wheel', (e) => {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -0.15 : 0.15;
                applyZoom(zoomLevel + delta);
            }, { passive: false });

            zoomContainer.addEventListener('mousedown', (e) => {
                if (zoomLevel <= 1) return;
                isPanning = true;
                panStart = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
                zoomContainer.style.cursor = 'grabbing';
                e.preventDefault();
            });

            document.addEventListener('mousemove', (e) => {
                if (!isPanning) return;
                panOffset.x = e.clientX - panStart.x;
                panOffset.y = e.clientY - panStart.y;
                updateZoom();
            });

            document.addEventListener('mouseup', () => {
                if (isPanning) {
                    isPanning = false;
                    zoomContainer.style.cursor = zoomLevel > 1 ? 'grab' : 'default';
                }
            });

            document.addEventListener('keydown', lightboxKeyHandler);
        };

        const applyZoom = (level) => {
            zoomLevel = Math.max(0.25, Math.min(10, level));
            if (zoomLevel <= 1) panOffset = { x: 0, y: 0 };
            updateZoom();
        };

        const updateZoom = () => {
            const zoomContainer = lightbox.querySelector('#photos-lb-zoom-container');
            const zoomLevelEl = lightbox.querySelector('#photos-zoom-level');
            if (!zoomContainer || !zoomLevelEl) return;
            zoomContainer.style.transform = `scale(${zoomLevel}) translate(${panOffset.x}px, ${panOffset.y}px)`;
            zoomLevelEl.textContent = Math.round(zoomLevel * 100) + '%';
            zoomContainer.style.cursor = zoomLevel > 1 ? 'grab' : 'default';
        };

        const showLightboxItem = () => {
            const item = library[lightboxIndex];
            const zoomContainer = lightbox.querySelector('#photos-lb-zoom-container');
            const nameEl = lightbox.querySelector('#photos-lb-name');
            const counterEl = lightbox.querySelector('.photos-lightbox-counter');
            const zoomLevelEl = lightbox.querySelector('#photos-zoom-level');

            zoomLevel = 1;
            panOffset = { x: 0, y: 0 };

            if (item.type === 'image') {
                zoomContainer.innerHTML = `<img src="${item.url}" alt="${item.name}">`;
            } else {
                zoomContainer.innerHTML = `<video src="${item.url}" controls autoplay style="max-width:100%;max-height:100%;"></video>`;
            }
            nameEl.textContent = item.name;
            counterEl.textContent = `${lightboxIndex + 1} / ${library.length}`;
            if (zoomLevelEl) zoomLevelEl.textContent = '100%';
            zoomContainer.style.transform = 'scale(1) translate(0px, 0px)';
            zoomContainer.style.cursor = 'default';
        };

        const navigateLightbox = (dir) => {
            lightboxIndex = (lightboxIndex + dir + library.length) % library.length;
            zoomLevel = 1;
            panOffset = { x: 0, y: 0 };
            showLightboxItem();
        };

        const closeLightbox = () => {
            if (lightbox) {
                lightbox.remove();
                lightbox = null;
            }
            document.removeEventListener('keydown', lightboxKeyHandler);
        };

        const lightboxKeyHandler = (e) => {
            if (!lightbox) return;
            if (e.key === 'Escape') closeLightbox();
            if (e.key === 'ArrowLeft') navigateLightbox(-1);
            if (e.key === 'ArrowRight') navigateLightbox(1);
            if (e.key === '+' || e.key === '=') applyZoom(zoomLevel + 0.25);
            if (e.key === '-') applyZoom(zoomLevel - 0.25);
            if (e.key === '0') { zoomLevel = 1; panOffset = { x: 0, y: 0 }; updateZoom(); }
        };

        const loadFromMounted = async () => {
            if (!window.filesystem || !window.filesystem.isMounted()) return;

            const scanFolder = async (folderPath) => {
                const entries = await window.filesystem.list(folderPath);
                if (!entries) return;
                for (const entry of entries) {
                    const fullPath = folderPath + (folderPath.endsWith('/') ? '' : '/') + entry.name;
                    if (entry.type === 'file') {
                        if (isImageFile(entry.name)) {
                            if (library.some(i => i.path === fullPath)) continue;
                            const blob = await window.filesystem.readFileAsBlob(fullPath);
                            if (!blob) continue;
                            library.push({ name: entry.name, path: fullPath, url: URL.createObjectURL(blob), type: 'image', source: 'mounted' });
                        } else if (isVideoFile(entry.name)) {
                            if (library.some(i => i.path === fullPath)) continue;
                            const blob = await window.filesystem.readFileAsBlob(fullPath);
                            if (!blob) continue;
                            library.push({ name: entry.name, path: fullPath, url: URL.createObjectURL(blob), type: 'video', source: 'mounted' });
                        }
                    }
                }
            };

            await scanFolder('Pictures');
            await scanFolder('Desktop');
            updateCounts();
            renderGrid();
        };

        const loadImported = (files) => {
            for (const file of files) {
                if (isImageFile(file.name)) {
                    if (imported.some(i => i.name === file.name && i.size === file.size)) continue;
                    const url = URL.createObjectURL(file);
                    const item = { name: file.name, url, type: 'image', source: 'imported', size: file.size };
                    imported.push(item);
                    library.push(item);
                } else if (isVideoFile(file.name)) {
                    if (imported.some(i => i.name === file.name && i.size === file.size)) continue;
                    const url = URL.createObjectURL(file);
                    const item = { name: file.name, url, type: 'video', source: 'imported', size: file.size };
                    imported.push(item);
                    library.push(item);
                }
            }
            updateCounts();
            renderGrid();
        };

        importBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                loadImported(e.target.files);
                fileInput.value = '';
            }
        });

        refreshBtn.addEventListener('click', () => {
            loadFromMounted();
        });

        sidebarItems.forEach(item => {
            item.addEventListener('click', () => {
                sidebarItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                currentView = item.dataset.view;
                const titles = { all: 'All Photos', images: 'Images', videos: 'Videos', pictures: 'Pictures Folder', desktop: 'Desktop' };
                toolbarTitle.textContent = titles[currentView] || 'All Photos';

                if (currentView === 'pictures' || currentView === 'desktop') {
                    if (!window.filesystem || !window.filesystem.isMounted()) {
                        renderGrid();
                        return;
                    }
                    const folderPath = currentView === 'pictures' ? 'Pictures' : 'Desktop';
                    window.filesystem.list(folderPath).then(async (entries) => {
                        if (!entries) { renderGrid(); return; }
                        const folderItems = [];
                        for (const entry of entries) {
                            const fullPath = folderPath + '/' + entry.name;
                            if (entry.type === 'file' && (isImageFile(entry.name) || isVideoFile(entry.name))) {
                                if (library.some(i => i.path === fullPath)) {
                                    folderItems.push(library.find(i => i.path === fullPath));
                                } else {
                                    const blob = await window.filesystem.readFileAsBlob(fullPath);
                                    if (!blob) continue;
                                    const item = { name: entry.name, path: fullPath, url: URL.createObjectURL(blob), type: isImageFile(entry.name) ? 'image' : 'video', source: 'mounted' };
                                    library.push(item);
                                    folderItems.push(item);
                                }
                            }
                        }
                        grid.querySelectorAll('.photos-grid-item').forEach(el => el.remove());
                        if (folderItems.length === 0) {
                            emptyState.style.display = 'flex';
                            return;
                        }
                        emptyState.style.display = 'none';
                        folderItems.forEach((item) => {
                            const el = document.createElement('div');
                            el.className = 'photos-grid-item';
                            const globalIdx = library.indexOf(item);
                            if (item.type === 'image') {
                                el.innerHTML = `<img src="${item.url}" alt="${item.name}" loading="lazy">`;
                            } else {
                                el.innerHTML = `
                                    <video src="${item.url}" muted preload="metadata"></video>
                                    <div class="photos-video-badge">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                                    </div>
                                `;
                            }
                            el.addEventListener('click', () => openLightbox(globalIdx));
                            grid.appendChild(el);
                        });
                    });
                } else {
                    renderGrid();
                }
            });
        });

        loadFromMounted();

        windowElement.openFileInPhotos = (item) => {
            if (library.some(i => i.path === item.path)) {
                const idx = library.findIndex(i => i.path === item.path);
                openLightbox(idx);
            } else {
                library.push(item);
                updateCounts();
                renderGrid();
                openLightbox(library.length - 1);
            }
        };

        const cleanup = () => {
            closeLightbox();
            library.forEach(item => { if (item.url) URL.revokeObjectURL(item.url); });
            library = [];
            imported = [];
        };

        const closeObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    if (windowElement.classList.contains('window-closing') || !document.body.contains(windowElement)) {
                        cleanup();
                        closeObserver.disconnect();
                    }
                }
            }
        });
        closeObserver.observe(windowElement, { attributes: true });
    }

    updateNoteCounts(editor, wordCountEl, charCountEl) {
        const text = editor.innerText.trim();
        const chars = text.length;
        const words = text === '' ? 0 : text.split(/\s+/).length;
        if (wordCountEl) wordCountEl.textContent = `${words} word${words !== 1 ? 's' : ''}`;
        if (charCountEl) charCountEl.textContent = `${chars} character${chars !== 1 ? 's' : ''}`;
    }

    getAppContent(appName) {
        switch(appName) {
            case 'filebrow':
                return `<div id="filebrow-app-container-${this.windowCounter}" class="filebrow-window" style="height: 100%; width: 100%;"></div>`;
            case 'safari':
                return `
                    <div class="safari-window">
                        <div class="safari-toolbar">
                            ${BrowOSIcons.toolbarBtn(BrowOSIcons.ui.back, 'Back', 'safari-back-btn')}
                            ${BrowOSIcons.toolbarBtn(BrowOSIcons.ui.forward, 'Forward', 'safari-forward-btn')}
                            ${BrowOSIcons.toolbarBtn(BrowOSIcons.ui.refresh, 'Reload', 'safari-reload-btn')}
                            <input type="text" class="safari-address-bar" value="https://www.example.com" placeholder="Search or enter website name">
                            ${BrowOSIcons.toolbarBtn(BrowOSIcons.ui.search, 'Go', 'safari-go-btn')}
                        </div>
                        <div class="safari-content">
                            <iframe class="safari-iframe" src="https://www.example.com" sandbox="allow-same-origin allow-scripts allow-popups allow-forms" loading="lazy"></iframe>
                        </div>
                    </div>
                `;
            case 'messages':
                return `
                    <div class="messages-window">
                        <div class="messages-content">
                            <h2>Messages</h2>
                            <div class="message">
                                <div class="message-header">
                                    <span class="message-sender">John Doe</span>
                                    <span class="message-time">10:30 AM</span>
                                </div>
                                <div class="message-text">Hello! This is a sample message in the Messages app.</div>
                            </div>
                            <div class="message">
                                <div class="message-header">
                                    <span class="message-sender">Jane Smith</span>
                                    <span class="message-time">10:32 AM</span>
                                </div>
                                <div class="message-text">How are you doing today?</div>
                            </div>
                            <div style="margin-top: 20px; display: flex;">
                                <input type="text" placeholder="Type a message..." style="flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
                                <button style="margin-left: 10px; padding: 10px 20px; background: #007AFF; color: white; border: none; border-radius: 4px;">Send</button>
                            </div>
                        </div>
                    </div>
                `;
            case 'settings':
                return `
                    <div class="settings-window">
                        <div style="display: flex; height: 100%;">
                            <div class="settings-sidebar">
                                <div class="sidebar-item active" data-section="general">
                                    ${BrowOSIcons.img(BrowOSIcons.ui.settingsGear, '', 'sidebar-item-icon')}
                                    <span>General</span>
                                </div>
                                <div class="sidebar-item" data-section="appearance">
                                    ${BrowOSIcons.img(BrowOSIcons.util.sun, '', 'sidebar-item-icon')}
                                    <span>Appearance</span>
                                </div>
                                <div class="sidebar-item" data-section="desktop">
                                    ${BrowOSIcons.img(BrowOSIcons.apps.monitor, '', 'sidebar-item-icon')}
                                    <span>Desktop & Dock</span>
                                </div>
                                <div class="sidebar-item" data-section="network">
                                    ${BrowOSIcons.img(BrowOSIcons.util.wifi, '', 'sidebar-item-icon')}
                                    <span>Network</span>
                                </div>
                                <div class="sidebar-item" data-section="bluetooth">
                                    ${BrowOSIcons.img(BrowOSIcons.util.bluetooth, '', 'sidebar-item-icon')}
                                    <span>Bluetooth</span>
                                </div>
                                <div class="sidebar-item" data-section="sound">
                                    ${BrowOSIcons.img(BrowOSIcons.util.volume, '', 'sidebar-item-icon')}
                                    <span>Sound</span>
                                </div>
                                <div class="sidebar-item" data-section="keyboard">
                                    ${BrowOSIcons.img(BrowOSIcons.util.keyboard, '', 'sidebar-item-icon')}
                                    <span>Keyboard</span>
                                </div>
                                <div class="sidebar-item" data-section="privacy">
                                    ${BrowOSIcons.img(BrowOSIcons.ui.lock, '', 'sidebar-item-icon')}
                                    <span>Privacy & Security</span>
                                </div>
                            </div>
                            <div class="settings-content">
                                <div class="settings-section" id="settings-general">
                                    <div class="settings-header">
                                        <h2>General</h2>
                                        <p class="settings-subtitle">Manage your account and system preferences</p>
                                    </div>
                                    <div class="settings-card">
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Username</span>
                                                <span class="setting-desc">Your display name</span>
                                            </div>
                                            <input type="text" class="setting-input" id="setting-username" value="">
                                        </div>
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Language</span>
                                                <span class="setting-desc">System language</span>
                                            </div>
                                            <select class="setting-select">
                                                <option>English</option>
                                                <option>Spanish</option>
                                                <option>French</option>
                                                <option>German</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div class="settings-card">
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Storage</span>
                                                <span class="setting-desc" id="storage-info">Calculating…</span>
                                            </div>
                                            <button class="setting-btn" id="manage-storage-btn">Manage</button>
                                        </div>
                                        <div class="storage-bar-container">
                                            <div class="storage-bar" id="storage-bar"></div>
                                        </div>
                                    </div>
                                    <div class="settings-actions">
                                        <button class="setting-btn save-btn" id="save-general-settings">Save Changes</button>
                                    </div>
                                </div>
                                <div class="settings-section hidden" id="settings-appearance">
                                    <div class="settings-header">
                                        <h2>Appearance</h2>
                                        <p class="settings-subtitle">Customize the look and feel</p>
                                    </div>
                                    <div class="settings-card">
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Theme</span>
                                                <span class="setting-desc">Choose your preferred theme</span>
                                            </div>
                                            <select class="setting-select">
                                                <option>Dark</option>
                                                <option>Light</option>
                                                <option>Auto</option>
                                            </select>
                                        </div>
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Accent Color</span>
                                                <span class="setting-desc">System accent color</span>
                                            </div>
                                            <div class="color-options">
                                                <div class="color-swatch active" style="background: #007aff;"></div>
                                                <div class="color-swatch" style="background: #5856d6;"></div>
                                                <div class="color-swatch" style="background: #ff2d55;"></div>
                                                <div class="color-swatch" style="background: #ff9500;"></div>
                                                <div class="color-swatch" style="background: #34c759;"></div>
                                            </div>
                                        </div>
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Wallpaper</span>
                                                <span class="setting-desc">Choose your desktop wallpaper</span>
                                            </div>
                                            <div class="wallpaper-options">
                                                <div class="wallpaper-thumb active" data-wallpaper="sonoma">
                                                    <img src="assets/wallpapers/sonoma.svg" alt="Sonoma">
                                                </div>
                                                <div class="wallpaper-thumb" data-wallpaper="midnight">
                                                    <img src="assets/wallpapers/midnight.svg" alt="Midnight">
                                                </div>
                                                <div class="wallpaper-thumb" data-wallpaper="ocean">
                                                    <img src="assets/wallpapers/ocean.svg" alt="Ocean">
                                                </div>
                                                <div class="wallpaper-thumb" data-wallpaper="sunset">
                                                    <img src="assets/wallpapers/sunset.svg" alt="Sunset">
                                                </div>
                                                <div class="wallpaper-thumb" data-wallpaper="forest">
                                                    <img src="assets/wallpapers/forest.svg" alt="Forest">
                                                </div>
                                            </div>
                                        </div>
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Custom Wallpaper URL</span>
                                                <span class="setting-desc">Enter an image URL for your wallpaper</span>
                                            </div>
                                            <div class="custom-wallpaper-input">
                                                <input type="text" id="custom-wallpaper-url" class="setting-input" placeholder="https://example.com/wallpaper.jpg">
                                                <button class="setting-btn apply-wallpaper-btn" id="apply-wallpaper-btn">Apply</button>
                                            </div>
                                        </div>
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Upload Wallpaper</span>
                                                <span class="setting-desc">Choose an image from your device</span>
                                            </div>
                                            <div class="wallpaper-upload-row">
                                                <button class="setting-btn upload-wallpaper-btn" id="upload-wallpaper-btn">Choose File</button>
                                                <span class="upload-file-name" id="upload-file-name">No file chosen</span>
                                                <input type="file" id="wallpaper-file-input" accept="image/*" hidden>
                                            </div>
                                        </div>
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">From Filesystem</span>
                                                <span class="setting-desc">Browse images in mounted filesystem</span>
                                            </div>
                                            <div class="wallpaper-fs-row">
                                                <button class="setting-btn fs-wallpaper-btn" id="fs-wallpaper-btn">Browse Files</button>
                                            </div>
                                            <div class="wallpaper-fs-grid hidden" id="wallpaper-fs-grid"></div>
                                        </div>
                                    </div>
                                </div>
                                <div class="settings-section hidden" id="settings-desktop">
                                    <div class="settings-header">
                                        <h2>Desktop & Dock</h2>
                                        <p class="settings-subtitle">Customize your desktop and dock</p>
                                    </div>
                                    <div class="settings-card">
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Dock Size</span>
                                                <span class="setting-desc">Adjust the dock icon size</span>
                                            </div>
                                            <input type="range" class="setting-slider" min="30" max="80" value="50">
                                        </div>
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Magnification</span>
                                                <span class="setting-desc">Enable dock magnification</span>
                                            </div>
                                            <label class="toggle-switch">
                                                <input type="checkbox" checked>
                                                <span class="toggle-slider"></span>
                                            </label>
                                        </div>
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Auto-hide Dock</span>
                                                <span class="setting-desc">Automatically hide and show the dock</span>
                                            </div>
                                            <label class="toggle-switch">
                                                <input type="checkbox">
                                                <span class="toggle-slider"></span>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                                <div class="settings-section hidden" id="settings-network">
                                    <div class="settings-header">
                                        <h2>Network</h2>
                                        <p class="settings-subtitle">Configure your network settings</p>
                                    </div>
                                    <div class="settings-card">
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Wi-Fi</span>
                                                <span class="setting-desc">Connected to BrowOS-Network</span>
                                            </div>
                                            <label class="toggle-switch">
                                                <input type="checkbox" checked>
                                                <span class="toggle-slider"></span>
                                            </label>
                                        </div>
                                    </div>
                                    <div class="settings-card">
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">DNS</span>
                                                <span class="setting-desc">8.8.8.8</span>
                                            </div>
                                            <button class="setting-btn">Edit</button>
                                        </div>
                                    </div>
                                </div>
                                <div class="settings-section hidden" id="settings-bluetooth">
                                    <div class="settings-header">
                                        <h2>Bluetooth</h2>
                                        <p class="settings-subtitle">Manage Bluetooth devices</p>
                                    </div>
                                    <div class="settings-card">
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Bluetooth</span>
                                                <span class="setting-desc">Enable Bluetooth connectivity</span>
                                            </div>
                                            <label class="toggle-switch">
                                                <input type="checkbox" checked>
                                                <span class="toggle-slider"></span>
                                            </label>
                                        </div>
                                    </div>
                                    <div class="settings-card">
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Devices</span>
                                                <span class="setting-desc">No devices connected</span>
                                            </div>
                                            <button class="setting-btn">Add Device</button>
                                        </div>
                                    </div>
                                </div>
                                <div class="settings-section hidden" id="settings-sound">
                                    <div class="settings-header">
                                        <h2>Sound</h2>
                                        <p class="settings-subtitle">Adjust volume and audio settings</p>
                                    </div>
                                    <div class="settings-card">
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Output Volume</span>
                                                <span class="setting-desc">System volume level</span>
                                            </div>
                                            <input type="range" class="setting-slider" min="0" max="100" value="75">
                                        </div>
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Alert Volume</span>
                                                <span class="setting-desc">Volume for system alerts</span>
                                            </div>
                                            <input type="range" class="setting-slider" min="0" max="100" value="50">
                                        </div>
                                    </div>
                                </div>
                                <div class="settings-section hidden" id="settings-keyboard">
                                    <div class="settings-header">
                                        <h2>Keyboard</h2>
                                        <p class="settings-subtitle">Configure keyboard preferences</p>
                                    </div>
                                    <div class="settings-card">
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Key Repeat Rate</span>
                                                <span class="setting-desc">Speed of key repeat</span>
                                            </div>
                                            <input type="range" class="setting-slider" min="1" max="10" value="6">
                                        </div>
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Key Repeat Delay</span>
                                                <span class="setting-desc">Delay before key repeat</span>
                                            </div>
                                            <input type="range" class="setting-slider" min="1" max="10" value="4">
                                        </div>
                                    </div>
                                </div>
                                <div class="settings-section hidden" id="settings-privacy">
                                    <div class="settings-header">
                                        <h2>Privacy & Security</h2>
                                        <p class="settings-subtitle">Manage your privacy settings</p>
                                    </div>
                                    <div class="settings-card">
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Location Services</span>
                                                <span class="setting-desc">Allow apps to access your location</span>
                                            </div>
                                            <label class="toggle-switch">
                                                <input type="checkbox">
                                                <span class="toggle-slider"></span>
                                            </label>
                                        </div>
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Analytics</span>
                                                <span class="setting-desc">Share usage data</span>
                                            </div>
                                            <label class="toggle-switch">
                                                <input type="checkbox">
                                                <span class="toggle-slider"></span>
                                            </label>
                                        </div>
                                    </div>
                                    <div class="settings-card">
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Firewall</span>
                                                <span class="setting-desc">Enable system firewall</span>
                                            </div>
                                            <button class="setting-btn">Configure</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            case 'terminal':
                return `<div class="terminal-shell-container"></div>`;
            case 'brownote':
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
            case 'calculator':
                return `
                    <div class="calculator-window">
                        <div class="calc-display" id="calc-display">0</div>
                        <div class="calc-buttons">
                            <button class="calc-btn calc-fn" data-action="clear">AC</button>
                            <button class="calc-btn calc-fn" data-action="negate">+/−</button>
                            <button class="calc-btn calc-fn" data-action="percent">%</button>
                            <button class="calc-btn calc-op" data-action="divide">÷</button>
                            <button class="calc-btn calc-num" data-value="7">7</button>
                            <button class="calc-btn calc-num" data-value="8">8</button>
                            <button class="calc-btn calc-num" data-value="9">9</button>
                            <button class="calc-btn calc-op" data-action="multiply">×</button>
                            <button class="calc-btn calc-num" data-value="4">4</button>
                            <button class="calc-btn calc-num" data-value="5">5</button>
                            <button class="calc-btn calc-num" data-value="6">6</button>
                            <button class="calc-btn calc-op" data-action="subtract">−</button>
                            <button class="calc-btn calc-num" data-value="1">1</button>
                            <button class="calc-btn calc-num" data-value="2">2</button>
                            <button class="calc-btn calc-num" data-value="3">3</button>
                            <button class="calc-btn calc-op" data-action="add">+</button>
                            <button class="calc-btn calc-num calc-wide" data-value="0">0</button>
                            <button class="calc-btn calc-num" data-value=".">.</button>
                            <button class="calc-btn calc-equals" data-action="equals">=</button>
                        </div>
                    </div>
                `;
            case 'camera':
                return `
                    <div class="camera-window">
                        <div class="camera-viewfinder-container">
                            <video class="camera-viewfinder" id="camera-viewfinder" autoplay playsinline></video>
                            <div class="camera-placeholder" id="camera-placeholder">
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                                    <circle cx="12" cy="13" r="4"/>
                                </svg>
                                <p>Camera Access Required</p>
                                <span>Click the button below to enable camera</span>
                            </div>
                        </div>
                        <div class="camera-toolbar">
                            <div class="camera-mode-switch">
                                <button class="camera-mode-btn active" data-mode="photo">PHOTO</button>
                                <button class="camera-mode-btn" data-mode="video">VIDEO</button>
                            </div>
                        </div>
                        <div class="camera-controls">
                            <button class="camera-btn camera-gallery-btn" id="camera-gallery-btn" title="Gallery">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                                    <circle cx="8.5" cy="8.5" r="1.5"/>
                                    <polyline points="21 15 16 10 5 21"/>
                                </svg>
                            </button>
                            <button class="camera-btn camera-capture-btn" id="camera-capture-btn" title="Capture">
                                <div class="capture-ring"></div>
                            </button>
                            <button class="camera-btn camera-flip-btn" id="camera-flip-btn" title="Flip Camera">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="23 4 23 10 17 10"/>
                                    <polyline points="1 20 1 14 7 14"/>
                                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                                </svg>
                            </button>
                        </div>
                        <canvas class="camera-canvas" id="camera-canvas" style="display:none;"></canvas>
                    </div>
                `;
            case 'music':
                return `
                    <div class="music-window">
                        <div class="music-layout">
                            <div class="music-sidebar">
                                <div class="music-sidebar-header">
                                    <span>Library</span>
                                </div>
                                <div class="music-sidebar-item active" data-view="all">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                                    <span>All Songs</span>
                                    <span class="music-sidebar-count" id="music-count-all">0</span>
                                </div>
                                <div class="music-sidebar-item" data-view="recent">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                    <span>Recently Added</span>
                                    <span class="music-sidebar-count" id="music-count-recent">0</span>
                                </div>
                                <div class="music-sidebar-divider"></div>
                                <div class="music-sidebar-header">
                                    <span>Imported</span>
                                </div>
                                <div class="music-sidebar-item" data-view="imported">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                    <span>Local Files</span>
                                    <span class="music-sidebar-count" id="music-count-imported">0</span>
                                </div>
                            </div>
                            <div class="music-main">
                                <div class="music-toolbar">
                                    <div class="music-toolbar-title">All Songs</div>
                                    <div class="music-toolbar-actions">
                                        <button class="music-import-btn" id="music-import-btn" title="Import music files">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                            <span>Import</span>
                                        </button>
                                        <button class="music-refresh-btn" id="music-refresh-btn" title="Refresh library">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                                        </button>
                                    </div>
                                </div>
                                <div class="music-track-list" id="music-track-list">
                                    <div class="music-empty-state" id="music-empty-state">
                                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                                            <path d="M9 18V5l12-2v13"/>
                                            <circle cx="6" cy="18" r="3"/>
                                            <circle cx="18" cy="16" r="3"/>
                                        </svg>
                                        <p>No music found</p>
                                        <span>Place audio files in the Music folder or import locally</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="music-player-bar">
                            <div class="music-player-track">
                                <div class="music-player-artwork" id="music-player-artwork">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                                </div>
                                <div class="music-player-info">
                                    <span class="music-player-title" id="music-player-title">Not Playing</span>
                                    <span class="music-player-artist" id="music-player-artist">—</span>
                                </div>
                            </div>
                            <div class="music-player-controls">
                                <div class="music-player-buttons">
                                    <button class="music-ctrl-btn" id="music-shuffle-btn" title="Shuffle">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
                                    </button>
                                    <button class="music-ctrl-btn" id="music-prev-btn" title="Previous">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
                                    </button>
                                    <button class="music-ctrl-btn music-play-btn" id="music-play-btn" title="Play">
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" id="music-play-icon"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                                    </button>
                                    <button class="music-ctrl-btn" id="music-next-btn" title="Next">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M16 18h2V6h-2zM5.5 12l8.5 6V6z"/></svg>
                                    </button>
                                    <button class="music-ctrl-btn" id="music-repeat-btn" title="Repeat">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                                    </button>
                                </div>
                                <div class="music-player-progress">
                                    <span class="music-time" id="music-time-current">0:00</span>
                                    <div class="music-progress-bar" id="music-progress-bar">
                                        <div class="music-progress-fill" id="music-progress-fill"></div>
                                        <div class="music-progress-handle" id="music-progress-handle"></div>
                                    </div>
                                    <span class="music-time" id="music-time-total">0:00</span>
                                </div>
                            </div>
                            <div class="music-player-volume">
                                <button class="music-ctrl-btn" id="music-volume-btn" title="Volume">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" id="music-volume-icon"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                                </button>
                                <div class="music-volume-slider" id="music-volume-slider">
                                    <div class="music-volume-fill" id="music-volume-fill" style="width: 80%"></div>
                                    <div class="music-volume-handle" id="music-volume-handle" style="left: 80%"></div>
                                </div>
                            </div>
                        </div>
                        <input type="file" id="music-file-input" accept="audio/*" multiple style="display:none;">
                    </div>
                `;
            case 'photos':
                return `
                    <div class="photos-window">
                        <div class="photos-layout">
                            <div class="photos-sidebar">
                                <div class="photos-sidebar-header">Library</div>
                                <div class="photos-sidebar-item active" data-view="all">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                                    <span>All Photos</span>
                                    <span class="photos-sidebar-count" id="photos-count-all">0</span>
                                </div>
                                <div class="photos-sidebar-item" data-view="images">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                                    <span>Images</span>
                                    <span class="photos-sidebar-count" id="photos-count-images">0</span>
                                </div>
                                <div class="photos-sidebar-item" data-view="videos">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                                    <span>Videos</span>
                                    <span class="photos-sidebar-count" id="photos-count-videos">0</span>
                                </div>
                                <div class="photos-sidebar-divider"></div>
                                <div class="photos-sidebar-header">Folders</div>
                                <div class="photos-sidebar-item" data-view="pictures">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                                    <span>Pictures</span>
                                </div>
                                <div class="photos-sidebar-item" data-view="desktop">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                                    <span>Desktop</span>
                                </div>
                            </div>
                            <div class="photos-main">
                                <div class="photos-toolbar">
                                    <div class="photos-toolbar-title" id="photos-toolbar-title">All Photos</div>
                                    <div class="photos-toolbar-actions">
                                        <button class="photos-import-btn" id="photos-import-btn" title="Import photos">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                            <span>Import</span>
                                        </button>
                                        <button class="photos-refresh-btn" id="photos-refresh-btn" title="Refresh">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                                        </button>
                                    </div>
                                </div>
                                <div class="photos-grid" id="photos-grid">
                                    <div class="photos-empty-state" id="photos-empty-state">
                                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                                            <circle cx="8.5" cy="8.5" r="1.5"/>
                                            <polyline points="21 15 16 10 5 21"/>
                                        </svg>
                                        <p>No photos or videos found</p>
                                        <span>Place files in the Pictures folder or import locally</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <input type="file" id="photos-file-input" accept="image/*,video/*" multiple style="display:none;">
                    </div>
                `;
            case 'starship':
                return `
                    <div class="starship-window" style="background: #00001a; display: flex; align-items: center; justify-content: center; height: 100%; position: relative; overflow: hidden; font-family: monospace;">
                        <canvas id="starship-canvas" width="600" height="700" style="background: transparent; max-height: 100%; max-width: 100%;"></canvas>
                        
                        <div id="starship-overlay" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(0,0,26,0.85); color: white; z-index: 10;">
                            <h1 style="color: #ff3366; text-shadow: 2px 2px 0px #000; margin-bottom: 20px; font-size: 40px; letter-spacing: 2px; text-align: center;">VOID INVADERS</h1>
                            <p id="starship-score-msg" style="display: none; font-size: 20px; margin-bottom: 10px; color: #4A90E2;">Score: 0</p>
                            <p id="starship-credits-msg" style="font-size: 18px; margin-bottom: 30px; color: #F6E05E;">Credits: 0</p>
                            <button id="starship-start-btn" style="background: transparent; border: 2px solid #ff3366; color: #ff3366; font-family: monospace; font-size: 20px; padding: 10px 20px; margin-bottom: 15px; cursor: pointer; transition: all 0.2s;">START GAME</button>
                            <button id="starship-station-btn" style="background: transparent; border: 2px solid #4A90E2; color: #4A90E2; font-family: monospace; font-size: 16px; padding: 8px 16px; cursor: pointer; transition: all 0.2s;">SPACE STATION (SHOP)</button>
                        </div>

                        <div id="starship-station" style="display: none; position: absolute; top: 0; left: 0; right: 0; bottom: 0; flex-direction: column; align-items: center; justify-content: flex-start; background: rgba(0,0,26,0.95); color: white; z-index: 20; padding: 40px;">
                            <h2 style="color: #4A90E2; font-size: 30px; margin-bottom: 10px; letter-spacing: 2px;">SPACE STATION</h2>
                            <p id="station-credits-display" style="color: #F6E05E; font-size: 20px; margin-bottom: 30px;">Credits: 0</p>
                            <div id="station-ships-list" style="display: flex; flex-direction: column; gap: 15px; width: 100%; max-width: 450px; overflow-y: auto; max-height: 400px; padding-right: 10px;">
                                <!-- Populated by JS -->
                            </div>
                            <button id="station-back-btn" style="margin-top: 30px; background: transparent; border: 2px solid #A0AEC0; color: #A0AEC0; font-family: monospace; font-size: 18px; padding: 8px 16px; cursor: pointer;">RETURN TO MENU</button>
                        </div>
                    </div>
                `;
            case 'browracer':
                return `
                    <div class="racer-window" style="background: #080810; display: flex; align-items: center; justify-content: center; height: 100%; position: relative; overflow: hidden; font-family: monospace;">
                        <canvas id="racer-canvas" width="600" height="400" style="background: transparent; max-height: 100%; max-width: 100%; width: 100%; height: 100%; object-fit: contain;"></canvas>
                        
                        <div id="racer-overlay" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(8, 8, 16, 0.85); color: white; z-index: 10; padding: 20px; text-align: center;">
                            <h1 id="racer-title-text" style="color: #ff3366; text-shadow: 0 0 10px rgba(255, 51, 102, 0.6); margin-bottom: 20px; font-size: 38px; font-weight: bold; letter-spacing: 3px; text-transform: uppercase;">SONOMA HIGHWAY</h1>
                            <p id="racer-score-msg" style="display: none; font-size: 14px; line-height: 1.6; margin-bottom: 25px; color: #a1a1a6; max-width: 400px; background: rgba(255, 255, 255, 0.05); padding: 15px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.1);"></p>
                            <button id="racer-start-btn" style="background: linear-gradient(135deg, #ff3366 0%, #8b5cf6 100%); border: none; color: white; font-family: monospace; font-size: 18px; font-weight: bold; padding: 12px 30px; border-radius: 24px; cursor: pointer; transition: all 0.25s ease; box-shadow: 0 4px 15px rgba(255, 51, 102, 0.4); text-transform: uppercase; letter-spacing: 1px;">START GAME</button>
                            <div style="margin-top: 30px; font-size: 11px; color: rgba(255, 255, 255, 0.4); line-height: 1.5; background: rgba(0,0,0,0.3); padding: 10px 15px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">
                                STEER: A/D or Arrow Keys | ACCEL: W or Up | BRAKE: S or Down<br>
                                Avoid traffic and hit checkpoints to extend your time!
                            </div>
                        </div>
                    </div>
                `;
            default:
                return `
                    <div style="padding: 20px;">
                        <h2>${appName.charAt(0).toUpperCase() + appName.slice(1)}</h2>
                        <p>This is a simulation of the ${appName} application.</p>
                    </div>
                `;
        }
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

        // Window dragging
        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('.window-control')) return;
            
            isDragging = true;
            this.bringToFront(windowElement);
            
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

        // Resize handle
        const resizeHandle = windowElement.querySelector('.window-resize-handle');
        resizeHandle.addEventListener('mousedown', (e) => {
            isResizing = true;
            originalSize.width = windowElement.offsetWidth;
            originalSize.height = windowElement.offsetHeight;
            e.preventDefault();
        });

        // Global mouse events
        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                const newLeft = e.clientX - dragOffset.x;
                const newTop = e.clientY - dragOffset.y;
                windowElement.style.left = newLeft + 'px';
                windowElement.style.top = newTop + 'px';

                // Screen edge snapping boundary checks (20px edge threshold)
                const edgeThreshold = 20;
                const mouseX = e.clientX;
                const mouseY = e.clientY;
                let activeZone = null;

                if (mouseX < edgeThreshold) {
                    activeZone = 'left';
                } else if (mouseX > window.innerWidth - edgeThreshold) {
                    activeZone = 'right';
                } else if (mouseY < edgeThreshold + 40) { // menu-bar height margin
                    activeZone = 'top';
                }

                // Calculate available heights deducting taskbar modes
                const hasTaskbar = document.getElementById('dock')?.classList.contains('taskbar-mode');
                const taskbarHeight = hasTaskbar ? 44 : 0;
                const menuBarHeight = 38;
                const availableHeight = window.innerHeight - taskbarHeight;

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
                    snapPreview.style.top = '0px';
                    snapPreview.style.left = '0px';
                    snapPreview.style.width = `${window.innerWidth}px`;
                    snapPreview.style.height = `${window.innerHeight}px`;
                    snapPreview.classList.add('visible');
                } else {
                    snapPreview.classList.remove('visible');
                }

                windowElement.dataset.activeSnapZone = activeZone || '';
            }
            
            if (isResizing) {
                const newWidth = originalSize.width + (e.clientX - (windowElement.offsetLeft + originalSize.width));
                const newHeight = originalSize.height + (e.clientY - (windowElement.offsetTop + originalSize.height));
                
                if (newWidth > 200) windowElement.style.width = newWidth + 'px';
                if (newHeight > 150) windowElement.style.height = newHeight + 'px';
            }
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                const activeZone = windowElement.dataset.activeSnapZone;
                const hasTaskbar = document.getElementById('dock')?.classList.contains('taskbar-mode');
                const taskbarHeight = hasTaskbar ? 44 : 0;
                const menuBarHeight = hasTaskbar ? 0 : 38;
                const availableHeight = window.innerHeight - taskbarHeight;

                if (activeZone === 'left' || activeZone === 'right') {
                    // Save floating position before docking
                    windowObj.savedPosition = {
                        top: windowElement.offsetTop,
                        left: windowElement.offsetLeft,
                        width: windowElement.offsetWidth,
                        height: windowElement.offsetHeight
                    };

                    windowElement.classList.add('snapped');
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
        windowElement.style.zIndex = this.zIndexCounter++;
        if (window.desktop && window.desktop.updateTaskbar) {
            window.desktop.updateTaskbar();
        }
    }

    closeWindow(windowElement, windowObj) {
        // Dispatch close event so apps can safely dispose resources immediately
        windowElement.dispatchEvent(new CustomEvent('window-closing'));
        windowElement.classList.add('window-closing');
        setTimeout(() => {
            windowElement.remove();
            this.windows = this.windows.filter(w => w.id !== windowObj.id);
            if (window.desktop && window.desktop.updateTaskbar) {
                window.desktop.updateTaskbar();
            }
        }, 300); // 300ms exit transition
    }

    minimizeWindow(windowElement, windowObj) {
        const rect = windowElement.getBoundingClientRect();
        const appName = windowObj.appName;

        const dockIcon = document.querySelector(`.dock-app[data-app="${appName}"]`);
        let destX, destY;

        if (dockIcon) {
            const iconRect = dockIcon.getBoundingClientRect();
            destX = iconRect.left + iconRect.width / 2 - (rect.left + rect.width / 2);
            destY = iconRect.top + iconRect.height / 2 - (rect.top + rect.height / 2);
        } else {
            destX = (window.innerWidth / 2) - (rect.left + rect.width / 2);
            destY = window.innerHeight - (rect.top + rect.height / 2);
        }

        windowElement.style.setProperty('--dash-x', `${destX}px`);
        windowElement.style.setProperty('--dash-y', `${destY}px`);

        windowElement.classList.add('window-minimizing');
        
        setTimeout(() => {
            windowElement.classList.remove('window-minimizing');
            windowElement.classList.add('window-minimized');
            windowObj.isMinimized = true;
            const dockIcon = document.querySelector(`.dock-app[data-app="${appName}"]`);
            if (dockIcon) dockIcon.classList.add('is-minimized');
            if (window.desktop && window.desktop.updateTaskbar) {
                window.desktop.updateTaskbar();
            }
        }, 550);
    }

    restoreWindow(windowElement, windowObj) {
        const appName = windowObj.appName;
        const dockIcon = document.querySelector(`.dock-app[data-app="${appName}"]`);
        if (dockIcon) dockIcon.classList.remove('is-minimized');

        windowElement.classList.remove('window-minimized');
        windowElement.classList.add('window-restoring');
        
        setTimeout(() => {
            windowElement.classList.remove('window-restoring');
            windowObj.isMinimized = false;
            if (window.desktop && window.desktop.updateTaskbar) {
                window.desktop.updateTaskbar();
            }
        }, 550);
    }

    maximizeWindow(windowElement, windowObj) {
        windowElement.classList.add('window-transitioning');
        
        if (windowObj.isMaximized) {
            windowElement.classList.remove('window-maximized');
            windowElement.style.removeProperty('position');
            windowElement.style.removeProperty('top');
            windowElement.style.removeProperty('left');
            windowElement.style.removeProperty('width');
            windowElement.style.removeProperty('height');
            windowElement.style.removeProperty('border-radius');
            windowElement.style.removeProperty('z-index');
            if (windowObj.savedPosition) {
                windowElement.style.top = windowObj.savedPosition.top + 'px';
                windowElement.style.left = windowObj.savedPosition.left + 'px';
                windowElement.style.width = windowObj.savedPosition.width + 'px';
                windowElement.style.height = windowObj.savedPosition.height + 'px';
            }
            windowObj.isMaximized = false;
        } else {
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
            windowElement.style.setProperty('width', `${window.innerWidth}px`, 'important');
            windowElement.style.setProperty('height', `${window.innerHeight}px`, 'important');
            windowElement.style.setProperty('border-radius', '0', 'important');
            windowElement.style.setProperty('z-index', '20000', 'important');
            windowObj.isMaximized = true;
        }

        if (window.desktop && window.desktop.updateTaskbar) {
            window.desktop.updateTaskbar();
        }

        setTimeout(() => {
            windowElement.classList.remove('window-transitioning');
        }, 350);
    }

    launchApp(appName) {
        if (!window.appsManager) return;
        const app = window.appsManager.getAppInfo(appName);
        if (!app) {
            console.warn(`App ${appName} not found`);
            return;
        }

        const existingWindow = this.windows.find(w => w.appName === appName);
        if (existingWindow) {
            if (existingWindow.isMinimized) {
                this.restoreWindow(existingWindow.element, existingWindow);
            }
            this.bringToFront(existingWindow.element);
            return;
        }

        this.createWindowInstance(appName, app.windowTitle);
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
