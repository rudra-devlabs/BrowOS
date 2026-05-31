# 🌌 BrowOS: A Premium Browser-Based Operating System

Welcome to **BrowOS**, a state-of-the-art, hyper-polished client-side operating system simulation designed with modern **macOS Sonoma glassmorphism aesthetics** and robust multitasking capabilities. Built on pure vanilla HTML5, CSS3, and JavaScript, BrowOS provides a premium, responsive desktop environment directly in your browser.

---

## 🚀 Key System Features

### 🖥️ macOS-Inspired Desktop Environment
*   **Sonoma Aesthetics**: Experience vibrant, animated glassmorphism blobs, a translucent top menu bar with a live digital clock, and a sleek floating dock.
*   **Dock & Taskbar Morphing**: The pill-shaped floating dock morphs seamlessly into a full-width flat bottom taskbar whenever a window is maximized, maximizing your vertical productivity space.
*   **Active App Indicators & Highlighting**: Status dots track open or minimized applications. When in taskbar mode, active apps gain a premium background highlighting overlay (`rgba(255,255,255,0.13)`) and a bold bottom blue border (`#4ea1ff`).
*   **Task Depth Ordering**: Clicking taskbar buttons instantly manages window z-index layering, allowing you to cycle through overlapping applications effortlessly.

### 🪟 Advanced Window Management
*   **Edge-Docking Snapping**: Drag a window within `20px` of screen boundaries to display a gorgeous, translucent glassmorphic preview landing guide (`#snap-preview`). Release the mouse to snap the window to a Left 50% split, Right 50% split, or top-edge full maximize.
*   **Buttery-Smooth compositor Closing**: Leverages GPU-accelerated compositing layer overrides (`will-change`, `translate3d`) and pointers event blocking to guarantee standard `300ms` exit scales and fades without visual flash or snapbacks.
*   **Interactive Drag Peeling (Unsnapping)**: Simply drag any snapped or maximized window to instantly restore its floating state, smoothly centering the mouse cursor horizontally on the window header.

### 📊 Dynamic Right-Hand Widgets Sidebar
*   **Digital Clock Widget**: High-end glassmorphic typography showing digital hours/minutes with a pulsing divider colon, AM/PM indicators, and full calendar formatting.
*   **OS Health & Diagnostics Widget**: 
    *   Dynamic performance metrics tracking live uptime timers and system threads.
    *   Interactive deep system diagnostics scans triggering a `3-second` thread analysis reporting file state and cleaning cache memory.
*   **Disk Storage Analysis**: 
    *   Tracks live virtual storage limits (out of `10 GB`) in real-time, synchronized with the virtual filesystem.
    *   Segmented status bars dividing storage among System (`2.4 GB`), Apps (`0.8 GB`), and user-created files. 
    *   Features a one-click Disk Cleanup animation to purge redundant cache files.

---

## 📂 File System & Application Suite

### 📦 Virtual Filesystem (VFS)
*   Fully virtualized filesystem supporting read, write, create, list, and delete capabilities.
*   **Real-time Grid Synchronization**: File creation, renaming, or deletion immediately triggers desktop icon updates and FileBrow listings instantly in-system.

### 💻 CodeBrow: Web IDE & Text Editor
*   **Monaco Hybrid Engine**: Dynamically hooks into CDN to serve **Monaco Editor** (the core engine behind VS Code) with full syntax highlighting, autocompletion, and hover diagnostics.
*   **Silent Fallback Core**: Seamlessly degrades to a high-end, custom-built local fallback editor in offline/timeout scenarios, preserving complete editing capabilities.
*   **VS Code Typing Experience**: Supports standard braces auto-pairing expansions onto three lines, tab indentation syncing, multi-line indentation/outdents (`Tab` and `Shift+Tab`), and real-time cursor coordinate status bars.

### 🌐 BrowOSer: Web Browser Simulation
*   **Local Start Page Welcome Grid**: Resolves frame-busting security headers by routing frame-friendly links (Wikipedia Mobile, Internet Archive,ThreeJS Docs) directly inside a sandboxed viewport.
*   **Dynamic Search Engine Router**: DuckDuckGo and Bing searches execute inside the sandbox, while Google searches securely route to external tabs to bypass clickjacking headers.
*   **Socket Keep-Alive Proxy Server**: Standard URLs route through the Express reverse proxy backend utilizing connection socket pooling for a **10x subresource speedup** and in-memory caches for static assets.

---

## 🎮 Built-in Arcade Suite

### 🏎️ BrowRacer: Retro Pseudo-3D Highway Racer
*   **Classic Road Projection Engine**: Operates a 60fps classic OutRun-style road perspective math engine in [racer.js](file:///c:/Users/rudra/OneDrive/Desktop/BrowOS/js/racer.js), drawing curves, slopes, and dynamic opponent cars.
*   **Real-time Sound Synthesis (Web Audio API)**: Generates synthesized audio directly in-browser. Creates a lowpass-filtered sawtooth engine hum that dynamically pitch-shifts (45Hz idle to 220Hz max) to match speed, crash noise bursts, and checkpoint pass arpeggios.
*   **Highscore VFS Logger**: Logs scores on game over directly to `Desktop/Highscores.txt`, instantly spawning the file icon on the desktop grid.
*   **Mute on Close**: Captures window closing events to safely dispose of the `AudioContext` immediately, preventing background sound leaks.

### 🚀 Void Tactics (Starship Tactical Shooter)
*   Pixel-art starship space combat featuring particle explosions, waves, interactive Space Station Shop configurations to buy/equip upgraded ships (Twin-Fang, Scout, Dreadnought), wave HUD metrics, and persistent highscore logging.

---

## 🏗️ Architecture Layout

```
├── index.html                   # Core OS entry, boot sequencing, and dependency loading
├── css/
│   ├── style.css                # Base desktop environment layout, Dock/Taskbar, Menu Bar styles
│   ├── window.css               # Window animations, layouts, and edge snapping guides
│   ├── widgets.css              # Glassmorphic clock, diagnostics, and disk storage widgets
│   └── apps.css                 # Application and game-specific styles
├── js/
│   ├── icons.js                 # Unified vector SVG path library
│   ├── apps.js                  # AppsManager launching registration and window mappings
│   ├── window.js                # WindowManager instance, templates, close/maximize hooks
│   ├── desktop.js               # Grid icon rendering, widgets, and taskbar morphing
│   ├── racer.js                 # Retro racing game engine physics, synth audio and telemetry
│   ├── starship.js              # Void Tactics shooter game loops and shop loops
│   ├── filebrow.js              # File explorer directory tree
│   ├── filesystem.js            # Virtualized local storage database mapper
│   └── shell.js                 # Terminal shell emulator
└── server.js                    # Express backend serving reverse proxy and assets cache
```

---

## 🛠️ Developer Guide

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed.

### Setup and Running
1. Navigate to the project directory:
   ```bash
   cd BrowOS
   ```
2. Install the necessary dependencies:
   ```bash
   npm install
   ```
3. Launch the Express server:
   ```bash
   npm start
   ```
4. Open your web browser and navigate to `http://localhost:3000` to boot BrowOS.

---

## 📝 Customization & Expansion

*   **Custom Wallpapers**: Modify the `.wallpaper` styling in `css/style.css` to add custom background loops, colors, or animations.
*   **Creating New Apps**:
    1.  Register your app in `js/apps.js` with its icon and window title.
    2.  Add a vector SVG icon path in `js/icons.js`.
    3.  Add the HTML skeleton inside the `getAppContent` method in `js/window.js`.
    4.  Create your game/app logic file under `js/` and load it inside `index.html` within the boot process sequence.

---

## 🛡️ License
This project is educational. Feel free to fork, expand, and create your own web applications within this sandbox!