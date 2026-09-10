/**
 * BrowOS Camera App Module
 * Extracted from window.js
 */
(function(root) {
    'use strict';

    const CameraApp = {
        getContent() {
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
        },

        initEvents(windowElement) {
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
    };

    root.BrowAppCamera = CameraApp;
    if (root.AppRegistry) {
        root.AppRegistry.register('camera', CameraApp);
    }
})(typeof window !== 'undefined' ? window : this);
