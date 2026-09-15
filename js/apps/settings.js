/**
 * BrowOS Settings App Module
 * Extracted from window.js
 */
(function(root) {
    'use strict';

    const SettingsApp = {
        getContent() {
                return `
                    <div class="settings-window">
                        <div style="display: flex; height: 100%;">
                            <div class="settings-sidebar">
                                <div class="sidebar-item active" data-section="general">
                                    <span class="sidebar-item-icon icon-tile" style="background:linear-gradient(135deg,#8e8e93,#636366);"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" width="13" height="13"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg></span>
                                    <span>General</span>
                                </div>
                                <div class="sidebar-item" data-section="appearance">
                                    <span class="sidebar-item-icon icon-tile" style="background:linear-gradient(135deg,#1c1c1e,#3a3a3c);"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" width="13" height="13"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"></path></svg></span>
                                    <span>Appearance</span>
                                </div>
                                <div class="sidebar-item" data-section="desktop">
                                    <span class="sidebar-item-icon icon-tile" style="background:linear-gradient(135deg,#0a84ff,#0060df);"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" width="13" height="13"><rect x="2" y="3" width="20" height="14" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg></span>
                                    <span>Desktop &amp; Dock</span>
                                </div>
                                <div class="sidebar-item" data-section="sound">
                                    <span class="sidebar-item-icon icon-tile" style="background:linear-gradient(135deg,#ff375f,#c81e4a);"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" width="13" height="13"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg></span>
                                    <span>Sound</span>
                                </div>
                                <div class="sidebar-item" data-section="network">
                                    <span class="sidebar-item-icon icon-tile" style="background:linear-gradient(135deg,#32d74b,#1d9a33);"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" width="13" height="13"><path d="M5 12.55a11 11 0 0 1 14.08 0"></path><path d="M1.42 9a16 16 0 0 1 21.16 0"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg></span>
                                    <span>Network</span>
                                </div>
                                <div class="sidebar-item" data-section="bluetooth">
                                    <span class="sidebar-item-icon icon-tile" style="background:linear-gradient(135deg,#5e5ce6,#3634a3);"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" width="13" height="13"><polyline points="6.5 6.5 17.5 17.5 12 23 12 1 17.5 6.5 6.5 17.5"></polyline></svg></span>
                                    <span>Bluetooth</span>
                                </div>
                                <div class="sidebar-item" data-section="privacy">
                                    <span class="sidebar-item-icon icon-tile" style="background:linear-gradient(135deg,#ff9f0a,#c96e00);"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" width="13" height="13"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg></span>
                                    <span>Privacy &amp; Security</span>
                                </div>
                                <div class="sidebar-item" data-section="performance">
                                    <span class="sidebar-item-icon icon-tile" style="background:linear-gradient(135deg,#30d158,#0a84ff);"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" width="13" height="13"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg></span>
                                    <span>Performance</span>
                                </div>
                                <div class="sidebar-item" data-section="about">
                                    <span class="sidebar-item-icon icon-tile" style="background:linear-gradient(135deg,#64d2ff,#0a84ff);"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" width="13" height="13"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg></span>
                                    <span>About</span>
                                </div>
                            </div>
                            <div class="settings-content">
                                <div class="settings-section" id="settings-general">
                                    <div class="settings-header">
                                        <h2>General</h2>
                                        <p class="settings-subtitle">Account name and system storage</p>
                                    </div>
                                    <div class="settings-card">
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Username</span>
                                                <span class="setting-desc">Shown by the system. Changes save automatically.</span>
                                            </div>
                                            <input type="text" class="setting-input" id="setting-username" value="">
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
                                </div>
                                <div class="settings-section hidden" id="settings-appearance">
                                    <div class="settings-header">
                                        <h2>Appearance</h2>
                                        <p class="settings-subtitle">Theme, accent color, wallpaper and glass effects. Every change applies instantly.</p>
                                    </div>
                                    <div class="settings-card">
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Theme</span>
                                                <span class="setting-desc">System chrome color scheme</span>
                                            </div>
                                            <div class="seg-control" data-setting="theme">
                                                <button data-value="dark">Dark</button>
                                                <button data-value="light">Light</button>
                                                <button data-value="system">System</button>
                                            </div>
                                        </div>
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Accent Color</span>
                                                <span class="setting-desc">Highlights, buttons and focus rings</span>
                                            </div>
                                            <div class="color-options">
                                                <div class="accent-swatch" data-accent="#0a84ff" style="background: #0a84ff;"></div>
                                                <div class="accent-swatch" data-accent="#5e5ce6" style="background: #5e5ce6;"></div>
                                                <div class="accent-swatch" data-accent="#bf5af2" style="background: #bf5af2;"></div>
                                                <div class="accent-swatch" data-accent="#ff375f" style="background: #ff375f;"></div>
                                                <div class="accent-swatch" data-accent="#ff9f0a" style="background: #ff9f0a;"></div>
                                                <div class="accent-swatch" data-accent="#ffd60a" style="background: #ffd60a;"></div>
                                                <div class="accent-swatch" data-accent="#32d74b" style="background: #32d74b;"></div>
                                                <div class="accent-swatch" data-accent="#8e8e93" style="background: #8e8e93;"></div>
                                                <label class="accent-swatch accent-custom" title="Custom color" style="background: conic-gradient(#ff375f,#ff9f0a,#ffd60a,#32d74b,#64d2ff,#5e5ce6,#bf5af2,#ff375f);">
                                                    <input type="color" id="custom-accent" hidden>
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="settings-card">
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
                                    <div class="settings-card">
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Reduce Transparency</span>
                                                <span class="setting-desc">Solid surfaces instead of glass — faster on low-end GPUs</span>
                                            </div>
                                            <label class="toggle-switch">
                                                <input type="checkbox" data-setting="reduceTransparency">
                                                <span class="toggle-slider"></span>
                                            </label>
                                        </div>
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Glass Blur</span>
                                                <span class="setting-desc">Blur radius behind translucent surfaces</span>
                                            </div>
                                            <input type="range" class="setting-slider" data-setting="glassBlur" min="0" max="40" step="2" data-suffix="px">
                                        </div>
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Reduce Motion</span>
                                                <span class="setting-desc">Minimize animations across the system</span>
                                            </div>
                                            <label class="toggle-switch">
                                                <input type="checkbox" data-setting="reduceMotion">
                                                <span class="toggle-slider"></span>
                                            </label>
                                        </div>
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Animate Wallpaper</span>
                                                <span class="setting-desc">Drifting color blobs behind the desktop</span>
                                            </div>
                                            <label class="toggle-switch">
                                                <input type="checkbox" data-setting="animateWallpaper">
                                                <span class="toggle-slider"></span>
                                            </label>
                                        </div>
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Show Widgets</span>
                                                <span class="setting-desc">Widget tiles on the desktop — press F8 for the gallery</span>
                                            </div>
                                            <label class="toggle-switch">
                                                <input type="checkbox" data-setting="showWidgets">
                                                <span class="toggle-slider"></span>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                                <div class="settings-section hidden" id="settings-desktop">
                                    <div class="settings-header">
                                        <h2>Desktop &amp; Dock</h2>
                                        <p class="settings-subtitle">Dock behavior and desktop surfaces</p>
                                    </div>
                                    <div class="settings-card">
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Dock Size</span>
                                                <span class="setting-desc">Maximum dock icon size</span>
                                            </div>
                                            <input type="range" class="setting-slider" data-setting="dockSize" min="30" max="80" data-suffix="px">
                                        </div>
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Magnification</span>
                                                <span class="setting-desc">Icons swell under the pointer</span>
                                            </div>
                                            <label class="toggle-switch">
                                                <input type="checkbox" data-setting="dockMagnification">
                                                <span class="toggle-slider"></span>
                                            </label>
                                        </div>
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Automatically Hide Dock</span>
                                                <span class="setting-desc">Show the dock when you move to the screen edge</span>
                                            </div>
                                            <label class="toggle-switch">
                                                <input type="checkbox" data-setting="dockAutohide">
                                                <span class="toggle-slider"></span>
                                            </label>
                                        </div>
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Dock Position</span>
                                                <span class="setting-desc">Choose the dock edge</span>
                                            </div>
                                            <select class="setting-select" data-setting="dockPosition">
                                                <option value="bottom">Bottom</option>
                                                <option value="left">Left (Vertical)</option>
                                                <option value="right">Right (Vertical)</option>
                                            </select>
                                        </div>
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Minimize Windows Using</span>
                                                <span class="setting-desc">Window minimization animation</span>
                                            </div>
                                            <select class="setting-select" data-setting="minimizeEffect">
                                                <option value="scale">Scale effect (Smooth 120 FPS)</option>
                                                <option value="genie">Genie effect (Funnel)</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                                <div class="settings-section hidden" id="settings-sound">
                                    <div class="settings-header">
                                        <h2>Sound</h2>
                                        <p class="settings-subtitle">System alert sounds and volume</p>
                                    </div>
                                    <div class="settings-card">
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Mute</span>
                                                <span class="setting-desc">Silence all system sounds</span>
                                            </div>
                                            <label class="toggle-switch">
                                                <input type="checkbox" data-setting="mute">
                                                <span class="toggle-slider"></span>
                                            </label>
                                        </div>
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Output Volume</span>
                                                <span class="setting-desc">System sound volume level</span>
                                            </div>
                                            <input type="range" class="setting-slider" data-setting="volume" min="0" max="100" data-suffix="%">
                                        </div>
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Alert Volume</span>
                                                <span class="setting-desc">Volume for system alerts</span>
                                            </div>
                                            <input type="range" class="setting-slider" data-setting="alertVolume" min="0" max="100" data-suffix="%">
                                        </div>
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">UI Sounds</span>
                                                <span class="setting-desc">Clicks and feedback while you navigate</span>
                                            </div>
                                            <label class="toggle-switch">
                                                <input type="checkbox" data-setting="uiSounds">
                                                <span class="toggle-slider"></span>
                                            </label>
                                        </div>
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Test Sound</span>
                                                <span class="setting-desc">Play a sample alert</span>
                                            </div>
                                            <button class="setting-btn" id="test-sound-btn">Play</button>
                                        </div>
                                    </div>
                                </div>
                                <div class="settings-section hidden" id="settings-network">
                                    <div class="settings-header">
                                        <h2>Network</h2>
                                        <p class="settings-subtitle">Your browser's real connection, reported live</p>
                                    </div>
                                    <div class="settings-card">
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Connection</span>
                                                <span class="setting-desc">Updates automatically when the network changes</span>
                                            </div>
                                            <span class="perm-badge" id="net-status">Checking…</span>
                                        </div>
                                        <div class="setting-row">
                                            <div class="setting-label"><span class="setting-title">Connection Type</span></div>
                                            <span class="value-chip" id="net-type">—</span>
                                        </div>
                                        <div class="setting-row">
                                            <div class="setting-label"><span class="setting-title">Downlink</span></div>
                                            <span class="value-chip" id="net-downlink">—</span>
                                        </div>
                                        <div class="setting-row">
                                            <div class="setting-label"><span class="setting-title">Round-trip Time</span></div>
                                            <span class="value-chip" id="net-rtt">—</span>
                                        </div>
                                        <div class="setting-row">
                                            <div class="setting-label"><span class="setting-title">Data Saver</span></div>
                                            <span class="value-chip" id="net-save-data">—</span>
                                        </div>
                                    </div>
                                </div>
                                <div class="settings-section hidden" id="settings-bluetooth">
                                    <div class="settings-header">
                                        <h2>Bluetooth</h2>
                                        <p class="settings-subtitle">Scan for real devices through the Web Bluetooth API</p>
                                    </div>
                                    <div class="settings-card">
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Web Bluetooth</span>
                                                <span class="setting-desc">Requires a Chromium browser on a secure origin</span>
                                            </div>
                                            <span class="perm-badge" id="bt-capability">Checking…</span>
                                        </div>
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Devices</span>
                                                <span class="setting-desc" id="bt-results">No device selected</span>
                                            </div>
                                            <button class="setting-btn" id="bt-scan-btn">Scan</button>
                                        </div>
                                    </div>
                                </div>
                                <div class="settings-section hidden" id="settings-privacy">
                                    <div class="settings-header">
                                        <h2>Privacy &amp; Security</h2>
                                        <span class="settings-subtitle">Real browser permissions, checked live</span>
                                    </div>
                                    <div class="settings-card">
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Camera</span>
                                                <span class="setting-desc">Used by the Camera app</span>
                                            </div>
                                            <span class="perm-badge" id="perm-camera">Checking…</span>
                                            <button class="setting-btn" id="perm-camera-btn">Request</button>
                                        </div>
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Microphone</span>
                                                <span class="setting-desc">Used by voice features</span>
                                            </div>
                                            <span class="perm-badge" id="perm-microphone">Checking…</span>
                                            <button class="setting-btn" id="perm-microphone-btn">Request</button>
                                        </div>
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Location</span>
                                                <span class="setting-desc">Used by Weather and Maps</span>
                                            </div>
                                            <span class="perm-badge" id="perm-location">Checking…</span>
                                            <button class="setting-btn" id="perm-location-btn">Request</button>
                                        </div>
                                    </div>
                                </div>
                                <div class="settings-section hidden" id="settings-performance">
                                    <div class="settings-header">
                                        <h2>Performance</h2>
                                        <p class="settings-subtitle">Compiled engines and live speed diagnostics</p>
                                    </div>
                                    <div class="settings-card">
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">WebAssembly</span>
                                                <span class="setting-desc">Baseline runtime</span>
                                            </div>
                                            <span class="perm-badge" id="cap-wasm">Checking…</span>
                                        </div>
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">SIMD128</span>
                                                <span class="setting-desc">Hardware vectorization for compiled engines</span>
                                            </div>
                                            <span class="perm-badge" id="cap-simd">Checking…</span>
                                        </div>
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Thread Isolation</span>
                                                <span class="setting-desc">COOP/COEP cross-origin isolation for SharedArrayBuffer</span>
                                            </div>
                                            <span class="perm-badge" id="cap-threads">Checking…</span>
                                        </div>
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Bulk Memory</span>
                                                <span class="setting-desc">Fast linear-memory copies in WASM modules</span>
                                            </div>
                                            <span class="perm-badge" id="cap-bulk">Checking…</span>
                                        </div>
                                    </div>
                                    <div class="settings-card">
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Frame Rate</span>
                                                <span class="setting-desc">Live compositor speed</span>
                                            </div>
                                            <span class="perm-badge" id="perf-fps">Measuring…</span>
                                        </div>
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">JavaScript Heap</span>
                                                <span class="setting-desc">Live memory usage</span>
                                            </div>
                                            <span class="value-chip" id="perf-heap">—</span>
                                        </div>
                                        <div class="setting-row">
                                            <div class="setting-label">
                                                <span class="setting-title">Physics Engine (WASM)</span>
                                                <span class="setting-desc">Zero-GC spatial broadphase for Brow City and the benchmark below</span>
                                            </div>
                                            <label class="toggle-switch">
                                                <input type="checkbox" data-setting="wasmAcceleration">
                                                <span class="toggle-slider"></span>
                                            </label>
                                        </div>
                                    </div>
                                    <div class="settings-card">
                                        <div class="settings-header" style="margin-bottom:12px;">
                                            <h3 style="font-size:14px;color:#fff;margin:0 0 4px;">Live Benchmark</h3>
                                            <p class="settings-subtitle" style="margin:0;">JavaScript vs WebAssembly for 100,000 spatial collision queries</p>
                                        </div>
                                        <div style="display:flex;gap:12px;align-items:center;margin-bottom:14px;">
                                            <button class="setting-btn accent-btn" id="btn-run-wasm-bench">Run Benchmark (100k Queries)</button>
                                            <span id="wasm-bench-status" class="bench-status">Ready to test</span>
                                        </div>
                                        <div id="wasm-bench-results">
                                            <div class="bench-grid">
                                                <div class="bench-cell">
                                                    <div class="bench-cell-label">JavaScript</div>
                                                    <div id="bench-js-time" class="bench-value js">--</div>
                                                </div>
                                                <div class="bench-cell">
                                                    <div class="bench-cell-label">WebAssembly</div>
                                                    <div id="bench-wasm-time" class="bench-value wasm">--</div>
                                                </div>
                                                <div class="bench-cell bench-cell-accent">
                                                    <div class="bench-cell-label">Speedup</div>
                                                    <div id="bench-speedup" class="bench-value speedup">--</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="settings-section hidden" id="settings-about">
                                    <div class="settings-header">
                                        <h2>About</h2>
                                        <p class="settings-subtitle">This machine, as the browser sees it</p>
                                    </div>
                                    <div class="settings-card">
                                        <div class="setting-row">
                                            <div class="setting-label"><span class="setting-title">Version</span></div>
                                            <span class="value-chip">BrowOS 1.0.0</span>
                                        </div>
                                        <div class="setting-row">
                                            <div class="setting-label"><span class="setting-title">Browser</span></div>
                                            <span class="value-chip" id="about-browser">—</span>
                                        </div>
                                        <div class="setting-row">
                                            <div class="setting-label"><span class="setting-title">CPU Cores</span></div>
                                            <span class="value-chip" id="about-cores">—</span>
                                        </div>
                                        <div class="setting-row">
                                            <div class="setting-label"><span class="setting-title">Device Memory</span></div>
                                            <span class="value-chip" id="about-memory">—</span>
                                        </div>
                                        <div class="setting-row">
                                            <div class="setting-label"><span class="setting-title">Screen</span></div>
                                            <span class="value-chip" id="about-screen">—</span>
                                        </div>
                                        <div class="setting-row">
                                            <div class="setting-label"><span class="setting-title">Session Uptime</span></div>
                                            <span class="value-chip" id="about-uptime">—</span>
                                        </div>
                                    </div>
                                    <div class="settings-actions">
                                        <button class="setting-btn" id="export-settings-btn">Export Settings</button>
                                        <button class="setting-btn danger-btn" id="reset-settings-btn">Reset All Settings</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
        },

        initEvents(windowElement) {
        const $ = (sel) => windowElement.querySelector(sel);
        const $$ = (sel) => Array.from(windowElement.querySelectorAll(sel));
        const S = window.BrowSettings;
        if (!S) return;

        // ─── Sidebar navigation ────────────────────────────────────────────
        const sidebarItems = $$('.sidebar-item');
        const sections = $$('.settings-section');
        sidebarItems.forEach(item => {
            item.addEventListener('click', () => {
                const section = item.getAttribute('data-section');
                sidebarItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                sections.forEach(s => s.classList.add('hidden'));
                const target = windowElement.querySelector(`#settings-${section}`);
                if (target) target.classList.remove('hidden');
                S.audio.play('tick');
            });
        });

        // ─── Generic setting binders ───────────────────────────────────────
        // Segmented controls
        $$('.seg-control').forEach(seg => {
            const key = seg.dataset.setting;
            const sync = () => {
                // 'auto' is the legacy spelling of 'system'; normalize so the
                // System button lights up for users migrating from older builds.
                let cur = String(S.get(key));
                if (key === 'theme' && cur === 'auto') cur = 'system';
                seg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.value === cur));
            };
            seg.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-value]');
                if (!btn || btn.classList.contains('active')) return;
                S.set(key, btn.dataset.value);
                S.audio.play('tick');
                sync();
            });
            sync();
        });

        // Toggles
        $$('input[type="checkbox"][data-setting]').forEach(input => {
            const key = input.dataset.setting;
            input.checked = !!S.get(key);
            input.addEventListener('change', () => {
                S.set(key, input.checked);
                S.audio.play('tick');
            });
        });

        // Sliders (with live value output)
        $$('input[type="range"][data-setting]').forEach(range => {
            const key = range.dataset.setting;
            const out = range.closest('.setting-row')?.querySelector('output');
            const suffix = range.dataset.suffix || '';
            range.value = S.get(key);
            const update = () => { if (out) out.textContent = range.value + suffix; };
            range.addEventListener('input', () => {
                S.set(key, Number(range.value));
                update();
            });
            update();
        });

        // Selects
        $$('select[data-setting]').forEach(select => {
            const key = select.dataset.setting;
            select.value = S.get(key);
            select.addEventListener('change', () => {
                S.set(key, select.value);
                S.audio.play('tick');
                if (key === 'dockPosition') window.desktop?.setDockPosition?.(select.value);
            });
        });

        // Live side-effects for dock controls
        S.onChange('dockSize', () => window.desktop?.dockFit?.());
        S.onChange('dockAutohide', () => window.desktop?.dockAutoHideSync?.());
        S.onChange('accent', () => S.audio.play('tick'));

        // ─── Accent color ──────────────────────────────────────────────────
        const accentSwatches = $$('.accent-swatch');
        const syncAccent = () => {
            const cur = String(S.get('accent')).toLowerCase();
            accentSwatches.forEach(sw => sw.classList.toggle('active', (sw.dataset.accent || '').toLowerCase() === cur));
        };
        accentSwatches.forEach(sw => {
            sw.addEventListener('click', () => {
                S.set('accent', sw.dataset.accent);
                syncAccent();
            });
        });
        const customAccent = $('#custom-accent');
        if (customAccent) {
            customAccent.value = S.get('accent');
            customAccent.addEventListener('input', () => {
                S.set('accent', customAccent.value);
                syncAccent();
            });
        }
        syncAccent();

        // ─── Username (saves as you type) ──────────────────────────────────
        const usernameInput = $('#setting-username');
        if (usernameInput) {
            usernameInput.value = S.get('username');
            let nameTimer = null;
            usernameInput.addEventListener('input', () => {
                clearTimeout(nameTimer);
                nameTimer = setTimeout(() => S.set('username', usernameInput.value.trim() || 'BrowOS User'), 300);
            });
        }

        // ─── Wallpaper ─────────────────────────────────────────────────────
        const savedWallpaper = localStorage.getItem('browos_wallpaper') || 'sonoma';
        const customUrl = localStorage.getItem('browos_custom_wallpaper');
        const localWallpaper = localStorage.getItem('browos_local_wallpaper');
        const wallpaperEl = document.querySelector('#desktop .wallpaper');
        const blobs = wallpaperEl.querySelectorAll('.wallpaper-blob, .wallpaper-noise');
        const urlInput = $('#custom-wallpaper-url');
        const applyBtn = $('#apply-wallpaper-btn');
        const fileNameEl = $('#upload-file-name');

        const convertToDataUrl = (imgOrBlob, maxWidth = 2560, maxHeight = 1440) => {
            return new Promise((resolve, reject) => {
                const processImg = (img) => {
                    try {
                        let w = img.naturalWidth || img.width;
                        let h = img.naturalHeight || img.height;
                        if (!w || !h) return resolve(img.src);
                        if (w > maxWidth || h > maxHeight) {
                            const ratio = Math.min(maxWidth / w, maxHeight / h);
                            w = Math.round(w * ratio);
                            h = Math.round(h * ratio);
                        }
                        const canvas = document.createElement('canvas');
                        canvas.width = w;
                        canvas.height = h;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, w, h);
                        resolve(canvas.toDataURL('image/jpeg', 0.88));
                    } catch (e) {
                        resolve(img.src);
                    }
                };

                if (imgOrBlob instanceof Blob) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const img = new Image();
                        img.onload = () => processImg(img);
                        img.onerror = () => resolve(e.target.result);
                        img.src = e.target.result;
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(imgOrBlob);
                } else if (imgOrBlob instanceof HTMLImageElement) {
                    processImg(imgOrBlob);
                } else {
                    reject(new Error('Invalid image'));
                }
            });
        };

        const fetchAndStoreWallpaper = async (rawUrl) => {
            const url = rawUrl.trim();
            if (!url) throw new Error('No URL provided');

            // 1. Fetch through the same-origin external-resource proxy.
            try {
                const proxyUrl = url.includes('__proxy__/') ? url : ('/__proxy__/' + encodeURIComponent(url));
                const res = await fetch(proxyUrl);
                if (res.ok) {
                    const blob = await res.blob();
                    if (blob && blob.size > 0) {
                        return await convertToDataUrl(blob);
                    }
                }
            } catch (e) {}

            // 2. Direct fetch (works on credentialless COEP or CORS-enabled origins)
            try {
                const res = await fetch(url, { mode: 'cors' });
                if (res.ok) {
                    const blob = await res.blob();
                    if (blob && blob.size > 0) {
                        return await convertToDataUrl(blob);
                    }
                }
            } catch (e) {}

            // 3. Offscreen Image element
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = async () => {
                    try {
                        const dUrl = await convertToDataUrl(img);
                        resolve(dUrl);
                    } catch (err) {
                        resolve(img.src);
                    }
                };
                img.onerror = () => {
                    const fallbackImg = new Image();
                    fallbackImg.onload = () => resolve(fallbackImg.src);
                    fallbackImg.onerror = () => reject(new Error('Unable to load image from URL'));
                    fallbackImg.src = url;
                };
                img.src = url;
            });
        };

        const setWallpaper = (url) => {
            wallpaperEl.style.background = `url('${url}') center/cover no-repeat`;
            blobs.forEach(b => b.style.display = 'none');
        };

        const clearThumbSelection = () => $$('.wallpaper-thumb').forEach(t => t.classList.remove('active'));
        const customUrlStored = localStorage.getItem('browos_custom_wallpaper_url');
        if (localWallpaper) {
            clearThumbSelection();
            setWallpaper(localWallpaper);
            if (customUrlStored) {
                urlInput.value = customUrlStored;
                fileNameEl.textContent = 'Custom URL (Saved offline)';
            } else {
                fileNameEl.textContent = 'Local image';
            }
        } else if (customUrl) {
            urlInput.value = customUrlStored || (customUrl.includes('__proxy__/') ? decodeURIComponent(customUrl.split('__proxy__/')[1]) : customUrl);
            clearThumbSelection();
            setWallpaper(customUrl);
        } else {
            setWallpaper(`assets/wallpapers/${savedWallpaper}.svg`);
            const activeThumb = windowElement.querySelector(`.wallpaper-thumb[data-wallpaper="${savedWallpaper}"]`);
            clearThumbSelection();
            if (activeThumb) activeThumb.classList.add('active');
        }

        if (applyBtn) {
            applyBtn.addEventListener('click', async () => {
                const url = urlInput.value.trim();
                if (!url) return;
                applyBtn.textContent = 'Downloading...';
                applyBtn.disabled = true;
                try {
                    const dataUrl = await fetchAndStoreWallpaper(url);
                    localStorage.setItem('browos_local_wallpaper', dataUrl);
                    localStorage.setItem('browos_custom_wallpaper_url', url);
                    localStorage.removeItem('browos_custom_wallpaper');

                    clearThumbSelection();
                    setWallpaper(dataUrl);
                    fileNameEl.textContent = 'Custom URL (Saved offline)';
                    applyBtn.textContent = 'Applied!';
                    applyBtn.disabled = false;
                    S.audio.play('success');
                    setTimeout(() => { applyBtn.textContent = 'Apply'; }, 1500);
                } catch (err) {
                    console.error('[Wallpaper] apply error:', err);
                    const wp = localStorage.getItem('browos_wallpaper') || 'sonoma';
                    setWallpaper(`assets/wallpapers/${wp}.svg`);
                    applyBtn.textContent = 'Failed';
                    applyBtn.disabled = false;
                    S.audio.play('fail');
                    setTimeout(() => { applyBtn.textContent = 'Apply'; }, 1500);
                }
            });
        }

        $$('.wallpaper-thumb').forEach(thumb => {
            thumb.addEventListener('click', () => {
                clearThumbSelection();
                thumb.classList.add('active');
                const wallpaper = thumb.dataset.wallpaper;
                localStorage.removeItem('browos_custom_wallpaper');
                localStorage.removeItem('browos_custom_wallpaper_url');
                localStorage.removeItem('browos_local_wallpaper');
                urlInput.value = '';
                fileNameEl.textContent = 'No file chosen';
                setWallpaper(`assets/wallpapers/${wallpaper}.svg`);
                localStorage.setItem('browos_wallpaper', wallpaper);
                S.audio.play('tick');
            });
        });

        const fileInput = $('#wallpaper-file-input');
        const uploadBtn = $('#upload-wallpaper-btn');

        if (uploadBtn && fileInput) {
            uploadBtn.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                fileNameEl.textContent = file.name;
                urlInput.value = '';
                try {
                    const dataUrl = await convertToDataUrl(file);
                    localStorage.setItem('browos_local_wallpaper', dataUrl);
                    localStorage.removeItem('browos_custom_wallpaper');
                    localStorage.removeItem('browos_custom_wallpaper_url');
                    clearThumbSelection();
                    setWallpaper(dataUrl);
                    S.audio.play('success');
                } catch (err) {
                    console.error('[Wallpaper] file read error:', err);
                    S.audio.play('fail');
                }
            });
        }

        const fsBtn = $('#fs-wallpaper-btn');
        const fsGrid = $('#wallpaper-fs-grid');

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
                            clearThumbSelection();
                            setWallpaper(dataUrl);
                        });
                        fsGrid.appendChild(item);
                    }
                } catch (err) {
                    fsGrid.innerHTML = '<div style="color: rgba(255,255,255,0.5); grid-column: 1/-1; text-align: center; padding: 20px;">Error loading files</div>';
                }
            });
        }

        // ─── Storage (shared filesystem snapshot) ──────────────────────────
        const storageInfo = $('#storage-info');
        const storageBar = $('#storage-bar');

        async function updateStorage() {
            if (!windowElement.isConnected) return;
            const fs = window.filesystem;
            const snap = (fs && typeof fs.getStorageSnapshot === 'function')
                ? await fs.getStorageSnapshot()
                : { mounted: false, totalUsed: 0, quota: 0, hasQuota: false };
            if (!windowElement.isConnected) return;
            const fmt = (b) => (fs && typeof fs.formatBytes === 'function') ? fs.formatBytes(b) : `${b} B`;

            if (!snap.mounted) {
                if (storageInfo) storageInfo.textContent = 'No storage mounted — mount a folder in FileBrow';
                if (storageBar) storageBar.style.width = '0%';
                return;
            }
            if (snap.hasQuota) {
                const availableBytes = Math.max(0, snap.quota - snap.totalUsed);
                const percent = Math.min((snap.totalUsed / snap.quota) * 100, 100);
                if (storageInfo) {
                    storageInfo.textContent = `${fmt(snap.totalUsed)} used of ${fmt(snap.quota)} (${fmt(availableBytes)} available)`;
                }
                if (storageBar) {
                    storageBar.style.width = `${percent}%`;
                }
            } else {
                if (storageInfo) storageInfo.textContent = `${fmt(snap.totalUsed)} used`;
                if (storageBar) storageBar.style.width = '0%';
            }
        }

        updateStorage();
        try {
            const fs = window.filesystem;
            if (fs && typeof fs.on === 'function') {
                ['change', 'mount', 'unmount', 'statechange'].forEach(ev => fs.on(ev, updateStorage));
            }
        } catch (e) { /* one-shot update above still stands */ }

        const manageBtn = $('#manage-storage-btn');
        if (manageBtn) {
            manageBtn.addEventListener('click', async () => {
                if (!window.BrowDialog) {
                    window.windowManager.launchApp('filebrow');
                    return;
                }
                const proceed = await window.BrowDialog.confirm(
                    'Disk Cleanup',
                    'Recalculate storage statistics and clear cached web data (CacheStorage) for this site?\n\nYour files will not be touched.'
                );
                if (!proceed) return;
                const fs = window.filesystem;
                const result = (fs && typeof fs.runStorageCleanup === 'function')
                    ? await fs.runStorageCleanup()
                    : { cachesCleared: 0, reclaimedBytes: 0 };
                const fmt = (b) => (fs && typeof fs.formatBytes === 'function') ? fs.formatBytes(b) : `${b} B`;
                await updateStorage();
                await window.BrowDialog.alert(
                    'Cleanup Complete',
                    `Web caches cleared: ${result.cachesCleared}\nStorage statistics recalculated.\nReclaimed: ${fmt(result.reclaimedBytes)}`
                );
            });
        }

        // ─── Sound: test tone ──────────────────────────────────────────────
        const testSoundBtn = $('#test-sound-btn');
        if (testSoundBtn) {
            testSoundBtn.addEventListener('click', () => S.audio.play('success'));
        }

        // ─── Network: live connection report ───────────────────────────────
        const netStatus = $('#net-status');
        const netType = $('#net-type');
        const netDownlink = $('#net-downlink');
        const netRtt = $('#net-rtt');
        const netSave = $('#net-save-data');

        const updateNetwork = () => {
            const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
            const online = navigator.onLine;
            if (netStatus) {
                netStatus.textContent = online ? 'Online' : 'Offline';
                netStatus.className = 'perm-badge ' + (online ? 'ok' : 'bad');
            }
            if (netType) netType.textContent = conn && conn.effectiveType ? conn.effectiveType.toUpperCase() : 'Unknown';
            if (netDownlink) netDownlink.textContent = conn && conn.downlink != null ? `${conn.downlink} Mb/s` : '—';
            if (netRtt) netRtt.textContent = conn && conn.rtt != null ? `${conn.rtt} ms` : '—';
            if (netSave) netSave.textContent = conn && conn.saveData ? 'On' : 'Off';
        };
        updateNetwork();
        window.addEventListener('online', updateNetwork);
        window.addEventListener('offline', updateNetwork);
        if (navigator.connection) navigator.connection.addEventListener('change', updateNetwork);

        // ─── Bluetooth: real Web Bluetooth scan when available ─────────────
        const btBadge = $('#bt-capability');
        const btScanBtn = $('#bt-scan-btn');
        const btResults = $('#bt-results');

        if (btBadge) {
            const supported = !!navigator.bluetooth;
            btBadge.textContent = supported ? 'Available' : 'Not supported by this browser';
            btBadge.className = 'perm-badge ' + (supported ? 'ok' : 'muted');
            if (btScanBtn) btScanBtn.disabled = !supported;
        }
        if (btScanBtn) {
            btScanBtn.addEventListener('click', async () => {
                if (!navigator.bluetooth) return;
                btResults.textContent = 'Choose a device in the browser picker…';
                try {
                    const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true });
                    btResults.textContent = device.name || 'Unnamed device';
                    S.audio.play('success');
                } catch (err) {
                    btResults.textContent = err.name === 'NotFoundError' ? 'No device selected' : `Scan failed: ${err.message}`;
                    S.audio.play('fail');
                }
            });
        }

        // ─── Privacy: real browser permission states ───────────────────────
        const permRows = [
            { name: 'camera', badge: '#perm-camera', btn: '#perm-camera-btn', request: () => navigator.mediaDevices.getUserMedia({ video: true }) },
            { name: 'microphone', badge: '#perm-microphone', btn: '#perm-microphone-btn', request: () => navigator.mediaDevices.getUserMedia({ audio: true }) },
            { name: 'geolocation', badge: '#perm-location', btn: '#perm-location-btn', request: () => new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000 })) }
        ];
        const paintPerm = (badgeEl, stateName) => {
            if (!badgeEl) return;
            const map = { granted: ['Granted', 'ok'], prompt: ['Not requested', 'muted'], denied: ['Denied', 'bad'], unsupported: ['Unsupported', 'muted'] };
            const [text, cls] = map[stateName] || [stateName, 'muted'];
            badgeEl.textContent = text;
            badgeEl.className = 'perm-badge ' + cls;
        };
        permRows.forEach(row => {
            const badgeEl = $(row.badge);
            const btn = $(row.btn);
            if (navigator.permissions && navigator.permissions.query) {
                navigator.permissions.query({ name: row.name })
                    .then(st => {
                        paintPerm(badgeEl, st.state);
                        st.onchange = () => paintPerm(badgeEl, st.state);
                    })
                    .catch(() => paintPerm(badgeEl, 'unsupported'));
            } else {
                paintPerm(badgeEl, 'unsupported');
            }
            if (btn) {
                btn.addEventListener('click', async () => {
                    btn.disabled = true;
                    try {
                        const stream = await row.request();
                        if (stream && stream.getTracks) stream.getTracks().forEach(t => t.stop());
                        S.audio.play('success');
                    } catch (err) {
                        S.audio.play('fail');
                    }
                    btn.disabled = false;
                    // Permission state change propagates via st.onchange above.
                });
            }
        });

        // ─── Performance: live capability + FPS panel ──────────────────────
        const capWasm = $('#cap-wasm');
        const capSimd = $('#cap-simd');
        const capThreads = $('#cap-threads');
        const capBulk = $('#cap-bulk');
        const fpsValue = $('#perf-fps');
        const heapValue = $('#perf-heap');

        if (capWasm) {
            const hasWasm = typeof WebAssembly === 'object';
            capWasm.textContent = hasWasm ? 'Supported' : 'Unsupported';
            capWasm.className = 'perm-badge ' + (hasWasm ? 'ok' : 'bad');
        }
        if (capSimd) {
            // SIMD feature detection via a minimal validated module.
            const simdBytes = new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,10,1,8,0,65,0,253,15,253,98,11]);
            let simd = false;
            try { simd = WebAssembly.validate(simdBytes); } catch (e) {}
            capSimd.textContent = simd ? 'Supported' : 'Unsupported';
            capSimd.className = 'perm-badge ' + (simd ? 'ok' : 'muted');
        }
        if (capThreads) {
            const isolated = !!window.crossOriginIsolated;
            capThreads.textContent = isolated ? 'Isolated (COOP/COEP)' : 'Not isolated';
            capThreads.className = 'perm-badge ' + (isolated ? 'ok' : 'muted');
        }
        if (capBulk) {
            const bulkBytes = new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,127,3,2,1,0,10,6,1,4,0,65,0,251,10,11]);
            let bulk = false;
            try { bulk = WebAssembly.validate(bulkBytes); } catch (e) {}
            capBulk.textContent = bulk ? 'Supported' : 'Unsupported';
            capBulk.className = 'perm-badge ' + (bulk ? 'ok' : 'muted');
        }

        let fpsFrames = 0;
        let fpsLast = performance.now();
        const fpsLoop = (now) => {
            fpsFrames++;
            if (now - fpsLast >= 500) {
                const fps = Math.round(fpsFrames * 1000 / (now - fpsLast));
                if (fpsValue) {
                    fpsValue.textContent = `${fps} FPS`;
                    fpsValue.className = 'perm-badge ' + (fps >= 50 ? 'ok' : fps >= 30 ? 'warn' : 'bad');
                }
                fpsFrames = 0;
                fpsLast = now;
            }
            if (windowElement.isConnected) requestAnimationFrame(fpsLoop);
        };
        requestAnimationFrame(fpsLoop);

        const updateHeap = () => {
            if (!heapValue) return;
            if (performance.memory) {
                const mb = (performance.memory.usedJSHeapSize / 1048576).toFixed(1);
                heapValue.textContent = `${mb} MB`;
            } else {
                heapValue.textContent = 'Not exposed by browser';
            }
        };
        updateHeap();
        const heapTimer = setInterval(() => {
            if (!windowElement.isConnected) { clearInterval(heapTimer); return; }
            updateHeap();
        }, 2000);

        // ─── WASM benchmark (existing engine) ──────────────────────────────
        const benchBtn = $('#btn-run-wasm-bench');
        const benchStatus = $('#wasm-bench-status');
        const benchResults = $('#wasm-bench-results');
        const jsTimeEl = $('#bench-js-time');
        const wasmTimeEl = $('#bench-wasm-time');
        const speedupEl = $('#bench-speedup');

        if (benchBtn) {
            benchBtn.addEventListener('click', () => {
                if (!S.get('wasmAcceleration')) {
                    if (benchStatus) benchStatus.textContent = 'Physics engine is turned off — enable it above first.';
                    return;
                }
                if (benchStatus) benchStatus.textContent = 'Running 100,000 spatial queries...';
                benchBtn.disabled = true;
                setTimeout(() => {
                    if (window.BrowPhysicsWasm && typeof window.BrowPhysicsWasm.runBenchmark === 'function') {
                        const res = window.BrowPhysicsWasm.runBenchmark(100000);
                        if (!res.error) {
                            if (jsTimeEl) jsTimeEl.textContent = `${res.jsTimeMs} ms`;
                            if (wasmTimeEl) wasmTimeEl.textContent = `${res.wasmTimeMs} ms`;
                            if (speedupEl) speedupEl.textContent = `${res.speedup}x FASTER`;
                            if (benchResults) benchResults.classList.add('visible');
                            if (benchStatus) benchStatus.textContent = `100,000 queries finished (${res.wasmMips}M ops/s)`;
                            S.audio.play('success');
                        } else {
                            if (benchStatus) benchStatus.textContent = `Error: ${res.error}`;
                        }
                    } else {
                        if (benchStatus) benchStatus.textContent = 'WASM physics engine not initialized';
                    }
                    benchBtn.disabled = false;
                }, 50);
            });
        }

        // ─── About: system facts + reset/export ────────────────────────────
        const aboutUptime = $('#about-uptime');
        if (aboutUptime) {
            const bootTime = performance.timeOrigin || Date.now();
            const tick = () => {
                if (!windowElement.isConnected) { clearInterval(aboutTimer); return; }
                const s = Math.floor((Date.now() - bootTime) / 1000);
                const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
                aboutUptime.textContent = h ? `${h}h ${m}m ${sec}s` : m ? `${m}m ${sec}s` : `${sec}s`;
            };
            const aboutTimer = setInterval(tick, 1000);
            tick();
        }

        const uaBrand = (navigator.userAgentData && navigator.userAgentData.brands)
            ? navigator.userAgentData.brands.map(b => b.brand + ' ' + b.version).slice(-2).join(' / ')
            : null;
        const aboutBrowser = $('#about-browser');
        if (aboutBrowser) aboutBrowser.textContent = uaBrand || navigator.userAgent.replace(/^Mozilla\/5\.0 \(([^)]+)\).*$/, '$1');
        const aboutCores = $('#about-cores');
        if (aboutCores) aboutCores.textContent = navigator.hardwareConcurrency ? navigator.hardwareConcurrency + ' cores' : 'Unknown';
        const aboutMemory = $('#about-memory');
        if (aboutMemory) aboutMemory.textContent = navigator.deviceMemory ? navigator.deviceMemory + ' GB (approx)' : 'Not exposed by browser';
        const aboutScreen = $('#about-screen');
        if (aboutScreen) aboutScreen.textContent = `${screen.width} × ${screen.height} @ ${window.devicePixelRatio}x`;

        const resetBtn = $('#reset-settings-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', async () => {
                if (!window.BrowDialog) { S.resetAll(); return; }
                const proceed = await window.BrowDialog.confirm(
                    'Reset All Settings',
                    'Every preference returns to its default and the desktop reloads. Files are not touched.'
                );
                if (!proceed) return;
                S.resetAll();
                window.location.reload();
            });
        }

        const exportBtn = $('#export-settings-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                const blob = new Blob([JSON.stringify(S.all(), null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'browos-settings.json';
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 2000);
                S.audio.play('success');
            });
        }
        }
    };

    root.BrowAppSettings = SettingsApp;
    if (root.AppRegistry) {
        root.AppRegistry.register('settings', SettingsApp);
    }
})(typeof window !== 'undefined' ? window : this);
