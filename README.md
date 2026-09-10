<div align="center">

# 🌌 BrowOS

**A premium, browser-native operating system simulation — no framework, no build step, no binaries.**

A full macOS Sonoma–inspired desktop: glassmorphic chrome, a morphing dock, virtual desktops, a real window manager, a virtual filesystem, a WASM-backed terminal, an IDE, 20 live desktop widgets, and five complete games — one of which is a hand-built Manhattan.

<sub>Vanilla HTML5 · CSS3 · JavaScript · Rust → WebAssembly · Three.js</sub>

</div>

---

## 📖 Table of Contents

- [What Is This?](#-what-is-this)
- [Quick Start](#-quick-start)
- [Feature Tour](#-feature-tour)
  - [Desktop Environment](#-desktop-environment)
  - [Windows & Spaces](#-windows--spaces)
  - [Virtual Filesystem](#-virtual-filesystem)
  - [Built-in Applications](#-built-in-applications)
  - [Desktop Widgets](#-desktop-widgets)
  - [Terminal & Shell](#-terminal--shell)
  - [Games](#-games)
  - [The Brow City Asset Pipeline](#-the-brow-city-asset-pipeline)
- [Keyboard Shortcuts](#-keyboard-shortcuts)
- [Architecture](#-architecture)
- [WebAssembly Modules](#-webassembly-modules)
- [The Backend Server](#-the-backend-server)
- [Development Workflows](#-development-workflows)
- [Project Layout](#-project-layout)
- [Extending BrowOS](#-extending-browos)
- [Troubleshooting](#-troubleshooting)
- [License](#-license)

---

## 🧭 What Is This?

BrowOS is a **client-side operating system experience** that runs entirely in a browser tab. It is not a toy skin over a web page — it implements the actual machinery an OS needs:

| Real OS concern | BrowOS implementation |
|---|---|
| Window manager | `js/window.js` — drag, resize, z-order, snapping, minimize/restore |
| Virtual desktops | `js/spaces.js` — up to 6 Spaces with animated switching + Mission Control |
| Filesystem | `js/filesystem.js` — real persisted storage via the File System Access / OPFS APIs |
| Terminal | `js/shell.js` + `js/cli/` on xterm.js, with a **Rust→WASM** backend |
| Preferences | `js/settings.js` — one schema, live CSS-variable application, legacy-key bridging |
| Global shortcuts | `js/shortcuts.js` — an OS-wide `Alt+Shift` chord layer |
| App registry | `js/apps.js` — declarative app manifest consumed by the dock and launcher |

Everything ships as plain script tags loaded by `index.html` — there is **no bundler, no transpiler, and no framework**. The one exception is the Brow City game, which is authored as a module tree and concatenated by a small Node build script.

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** (v18 or newer recommended)
- A **Chromium-based browser** (Chrome, Edge, Brave). BrowOS uses the File System Access API and `SharedArrayBuffer`, which Safari and Firefox do not fully support.

### Install & run

```bash
git clone <your-fork-url> BrowOS
cd BrowOS

npm install     # Express, compression, Monaco editor
npm start       # → http://localhost:3000
```

Then open **http://localhost:3000**.

> **Why not just open `index.html` directly?**
> BrowOS requires a server for three reasons: the filesystem needs a secure context to request storage permission, the WASM terminal needs `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` headers, and `js/server.js` exposes the `/__proxy__/` endpoint used by the browser app. `file://` will not work.

### Zero-install preview

```bash
npm run dev     # npx serve .  — static preview, no proxy or FS persistence
```

---

## 🎨 Feature Tour

### 🖥️ Desktop Environment

The chrome is built to feel like macOS Sonoma:

- **Animated glassmorphism wallpaper** — five independently drifting gradient blobs behind a noise layer, composited with `backdrop-filter`.
- **Translucent menu bar** with the BrowOS logo, an app-aware menu set, a Spotlight button, and a live clock.
- **Floating dock that morphs into a taskbar.** In floating mode it's a pill with magnification. When any window maximizes, the dock transitions to a full-width flat taskbar, giving back vertical space. Active apps get a highlight overlay and a blue underline.
- **Task depth cycling.** Clicking a taskbar icon brings that window forward; clicking again cycles through overlapping windows.
- **Launchpad overlay** — a searchable full-screen app index with a spotlight-style filter.
- **Alt+Shift shortcut cheat sheet** — press `Alt+Shift+/` for a live list generated from the registered bindings.

### 🪟 Windows & Spaces

**Window management** (`js/window.js`):

- Drag by the header, resize from all eight edges and corners.
- **Edge snapping** — drag within 20px of a screen edge and a translucent preview guide appears (`#snap-preview`). Release to snap left-50%, right-50%, or maximize on the top edge.
- **Drag-to-peel** — drag a snapped or maximized window and it smoothly returns to floating state, re-centering the cursor on the header.
- **Compositor-aware closing** — exit animations use `will-change`, `translate3d`, and a pointer-events guard so the 300ms scale-and-fade never flashes or snaps back.
- Three window controls (traffic lights) plus minimize-to-dock with a status dot.

**BrowSpaces** (`js/spaces.js`):

- Up to **6 virtual desktops**. Each window carries a `spaceIndex`; only the active space's windows render.
- **Animated switching** — outgoing windows slide out in the direction of travel, incoming ones glide in. Rapid `Ctrl`-less switching lands any in-flight animation instantly, so spamming the shortcut always ends on the right desktop.
- **Mission Control** (`Alt+Shift+Up`) — an overview grid of every window across every space, with drag-to-reassign.
- Space count persists in `localStorage`; the active space is session-only and resets to Desktop 1 on boot.

### 📂 Virtual Filesystem

`js/filesystem.js` implements a genuinely persistent filesystem — not a fake in-memory tree:

- Backed by the **File System Access API** (falling back to OPFS), with an explicit permission request flow and mount/unmount lifecycle.
- Full API: `list`, `readFile`, `readFileAsBlob`, `writeFile`, `createFile`, `createDirectory`, `ensureDirectory`, `delete`, `rename`, `move`, `copy`, `getMetadata`, `stat`, `exists`.
- **Event bus** — `on('mount' | 'state' | ...)` so the desktop, FileBrow, and terminal all stay in sync. Creating a file on the desktop immediately appears in FileBrow and `ls`.
- **Storage accounting** — live byte tracking with a segmented breakdown (System / Apps / user files) driving the Disk widget and Settings pane.
- Recursive directory copy, rename-on-collision handling, and a debounced storage-stat writer.

### 📱 Built-in Applications

23 apps are registered in `js/apps.js`, with more reachable through the Launchpad. The highlights:

| App | What it does |
|---|---|
| **FileBrow** | Full file explorer — directory tree sidebar, grid/list views, breadcrumbs, create/rename/delete, drag-and-drop into the VFS. |
| **CodeBrow** | Web IDE. Loads **Monaco Editor** (the engine behind VS Code) from local `node_modules` with a CDN fallback, plus a bespoke local editor if both fail. Brace auto-pairing, tab/indent syncing, multi-line indent, cursor coordinates. |
| **BrowShell Terminal** | xterm.js terminal with tabs, a real parser, autocomplete, `nano`, and ~70 built-in commands. See [Terminal & Shell](#-terminal--shell). |
| **Brow Note** | Markdown-ish notes app wired into the VFS — files open *from* FileBrow and save back. |
| **Settings** | Theme, accent color, glass blur, reduce-transparency, reduce-motion, UI sounds, volume, dock size/magnification/position/autohide, minimize effect, widget toggle, wallpaper animation, WASM acceleration, username. |
| **Spotlight** | Universal search. Blends apps, VFS documents, and an inline calculator, with a **SQLite-WASM** full-text index (loaded from CDN, degrading gracefully to in-memory search). |
| **BrowCut** | A real video editor in a browser tab — multi-track timeline, trim in/out, split tool, speed ramping, a canvas filter pipeline, aspect ratios, text overlays, undo/redo, and `MediaRecorder` export. |
| **BrowMacOS** | The macOS-flavored layer: an app-aware global menu bar and a Cmd+Tab-style app switcher. |
| **Weather · Calendar · Clock · System Monitor · Photos · Camera · Music · Calculator · Messages** | The supporting utility suite, all glassmorphic and VFS- or API-backed. |

### 📊 Desktop Widgets

`js/widgets.js` is a complete widget engine — a live free-positioning layer with drag, jiggle-edit mode, per-widget settings, S/M/L sizing, a 4px snap grid, and `localStorage` persistence. The gallery app is reachable from the menu bar, the desktop context menu, or `Alt+Shift+G`.

**20 built-in widgets** ship in `js/widgets-builtin.js`, all local-first with zero network dependencies:

- **Essentials** — Chrono Clock · Atmosphere Weather · Calendar Agenda · Desk Calculator · Battery Fuel
- **Media & Audio** — Vinyl Visualizer (Now Playing) · Ambient Oasis (Soundscapes) · Gallery Frame
- **Productivity** — Smart Tasks · Sticky Canvas · Focus Chrono · Event Horizon · Activity Rings
- **System** — Control Dock · Market Pulse (Crypto) · AI Companion · System Telemetry · Storage Matrix · Network Pulse · World Matrix (World Clock)

The calendar widget's event store is **shared** with the Calendar app, so events added in one appear in the other.

### 💻 Terminal & Shell

The terminal is a serious implementation, not an `eval` wrapper.

**Runtime** (`js/shell.js`, `js/cli/`):

- xterm.js with the fit addon, multiple tabs, and a full line editor (cursor movement, history, `Ctrl+A/E/U/K/W`).
- A hand-written **command parser** (`cli/parser.js`) with quoting, pipes, redirection, and chaining.
- **Autocomplete** backed by the VFS (`cli/autocomplete.js`).
- **`nano`** — a working full-screen text editor in the terminal (`cli/nano.js`).
- **Worker-isolated runtimes** (`cli/runtimes.js`) for `node`, `python`, and `sqlite3`, so a runaway script can't freeze the desktop.
- **Scripting layer** (`cli/scripting.js`) with `sh`/`bash`/`source` and shell functions.

**~70 built-in commands**, including:

```
Filesystem   ls  cd  pwd  tree  stat  cat  head  tail  wc  touch  mkdir  rm
             cp  mv  find  grep  sort  uniq  diff  file  ln
Text         echo  printf  jq
Environment  export  unset  env  alias  which  history  clear  true  false
Processes    ps  kill  uptime  free  df  whoami  uname
Network      curl  ping  getnet
Runtimes     js  node  python  python3  sqlite3  sh  bash  source
Apps         open  apps  launch  code  codebrow  theme  gta
```

The `gta` command is a chainable helper into the running game — `gta time sunset`, `gta.aim()`, `gta.shoot()`, plus cheat-style item commands (`pistol`, `armor`, `health`, and more).

### 🎮 Games

Five complete games, all written from scratch with procedural art and audio.

#### 🚀 Void Tactics 3D — `js/starship.js`

A Star Fox–style rail shooter on **Three.js r134**, vendored locally in `assets/vendor/` so it works fully offline.

- UnrealBloom post-processing, a scrolling synthwave grid tunnel, warp streaks, and a procedural nebula backdrop.
- **Everything is procedural** — ships, enemies, bosses, textures, the soundtrack, and SFX are generated at runtime. Zero binary assets.
- Player kit: rapid lasers, lock-on homing missiles, boost/brake with FOV kick, and barrel rolls (`Q`/`E`) granting brief invulnerability that deflects incoming fire.
- Enemy roster: Darts, Weavers, Sentinels, Lancers, and Mines — each with distinct flight patterns.
- A **Dreadnought boss** every 5th wave with four destroyable turrets and a telegraphed sweeping beam.
- Progression: combo multiplier to ×8, credit drops, and a space-station shop with 4 chassis and 5 upgrade lines. Credits, unlocks, and best scores persist in `localStorage`.
- **Robust by design** — segment-based (swept) projectile collision so shots never tunnel on frame drops, adaptive quality that drops bloom below ~30fps, and full GPU resource disposal on window close.

#### 🍄 Browrio Run — `js/browrio.js`

A Mario-style 2D platformer with a hand-rolled physics engine.

- Acceleration/friction, variable jump height, **coyote time**, jump buffering, head-bump block hits, stomping, and power-ups.
- **3 worlds / 12 designed levels**: Green Hills → Pipe Plains → Mushroom Ridge → Castle Entry, then the Mine / Crystal Cave / Lava Tunnel / Fortress set, then Cloud Garden → Airship Deck → Storm Tower → Browio Keep. Each has a goal flag, timer, coins, enemies, hidden mushrooms, and stair pyramids.
- Anti-aliased canvas sprites drawn in code — rounded cap with a "B" emblem, mustache, overalls with buttons, irised eyes with sparkle, gradient brick/stone/ground tiles with mortar, glowing coins, and an animated flag.
- Level-complete flow with a result panel, animated progress bar, NEW BEST SCORE banner, and 6-second auto-advance.
- Parallax hills, clouds, and stars with per-level sky palettes, particle bursts, and Web Audio synth SFX.
- Best scores save to `Desktop/BrowrioScores.txt` through the VFS.

#### 🌆 Brow City — `js/gta.js` + `js/gta/`

A GTA-style open-world 3D sandbox, and the largest single undertaking in the repo.

**The city.** A hand-built Manhattan from Houston St to the Battery: the real numbered-street and named-avenue grid, Broadway's diagonal, Central Park, Times Square, and landmarks including the Empire State, Chrysler, Flatiron, and One World Trade — plus two suspension bridges to a Brooklyn strip and the Statue of Liberty in the harbor. ~315k triangles across ~265 chunked, merged meshes, built time-sliced at ~14ms/frame so the loading screen stays animated.

**The art.** Stylized low-poly with **canvas-baked facade textures** (brick, limestone, glass, brownstone), 1916-zoning setback massing, cone/blob trees, two-tone instanced cars, a gradient sky dome, and real-time sun shadows.

**The life.** A 647-intersection lane graph with one-way awareness, 163 signalized intersections running a real NS/EW phase cycle (cars stop on red, queue, and pick turns), ~34 ambient cars plus 48 parked, and 44 pedestrians on a 5000-node sidewalk graph who window-shop, flee gunfire, and dodge speeding cars (which brake for them).

**The loop.** Walk/sprint/jump, punch or pistol combat, carjack any of 9 vehicle types with arcade physics, and a **5-star wanted system** — cruisers dispatch, pursue, ram, open fire at 3★, and bust you on foot. Escape via Pay-N-Spray garages or evasion decay.

**The feedback.** Fallen pedestrians drop magnet-collected pickups (cash $20–150, health, armor, ammo, rare pistols, $500 duffel bags) with toasts, damage flash, a rotating circular GTA-style minimap with police/loot blips, and a full WebAudio synth bus for engine, siren, gunfire, and impacts.

**BrowOS-native.** Saves to `Desktop/gta-save.json` through the VFS, draws the 5992-collider set as wireframes on `TAB`, and disposes all GPU resources on close.

#### 🐍 Snake 3D — `js/snake.js`

A cyberpunk Tron-style take on Snake, rendered in Three.js on a 22×22 arena. Neon grid, emissive trail geometry, and a Web Audio synth for retro sci-fi SFX — all generated at runtime.

#### ⛏️ Terrario — `js/terrario.js`

A 2D sandbox survival game in the Terraria mould: a 200×100-tile **procedurally generated world** with a day/night cycle, tile physics, mining and placing within a reach radius, crafting, and enemies. Sprites and audio are drawn and synthesized in code.

### 🏗️ The Brow City Asset Pipeline

Brow City is **fully procedural with zero required binary assets** — but it optionally loads an asset pack if present, upgrading the visuals without ever becoming dependent on it.

- **`assets/models/gta/`** — 143 GLB models across `buildings/`, `characters/`, `houses/`, `landmarks/`, `props/`, `vehicles/`, and `weapons/`.
- **`assets/audio/gta/`** — 33 engine, siren, gunshot, crash, and impact samples (`.mp3` + `.ogg`), with synth fallback.
- **`brow_city_assets/`** — 19 additional GLBs (police enforcer, SWAT, fire truck, supercar, speedboat, and props) with a `manifest.json`.

When assets load, they integrate into the existing pipelines: GLB vehicle bodies with real spinning wheels, contract-rigged player/ped models slotting into the instancing system, sculpted landmarks, and ten suburban house models that convert ~40% of the Brooklyn strip into residential blocks with yards and driveways.

---

## ⌨️ Keyboard Shortcuts

BrowOS binds its global shortcuts to the **`Alt+Shift+<key>`** family, on purpose. Every other common chord is already claimed before the page sees the keypress:

- `Ctrl+T/W/N/Tab/1..9/L` — reserved by the browser, never delivered
- `Ctrl+←/→` — word-jump in inputs, tab-move on many systems
- `Ctrl+Space` / `Ctrl+K` — Windows IME toggle, browser search bar
- `Cmd+Tab` / `Alt+Tab` — swallowed by the OS window switcher

`Alt+Shift` is safe on every platform and browser. Matching is done on the **physical `event.code`**, so bindings stay stable across QWERTY, AZERTY, and Dvorak.

| Shortcut | Action |
|---|---|
| `Alt+Shift+L` | Launchpad |
| `Alt+Shift+S` | Spotlight search |
| `Alt+Shift+Tab` | App switcher |
| `Alt+Shift+Up` | Mission Control |
| `Alt+Shift+←` / `→` | Previous / next desktop |
| `Alt+Shift+1` … `6` | Jump to desktop *N* |
| `Alt+Shift+G` | Widget gallery |
| `Alt+Shift+D` | Show desktop (minimize all) |
| `Alt+Shift+W` | Close window |
| `Alt+Shift+M` | Minimize window |
| `Alt+Shift+Enter` | Maximize / restore window |
| `Alt+Shift+[` / `]` | Snap window left / right |
| `Alt+Shift+/` | **Live shortcut cheat sheet** |

Press **`Alt+Shift+/`** inside the OS for the always-current list — it's generated from the live registration table, so it can never drift from the code.

> **Note on Spotlight:** the menu-bar Spotlight button works on every platform. The `Ctrl+Space` / `Ctrl+K` chords are deliberately **not** bound, because both are swallowed before the page receives them (Windows IME toggle and the browser search bar respectively). Use `Alt+Shift+S`.

---

## 🏗️ Architecture

### Boot sequence

`index.html` loads everything as ordered `<script>` tags and tracks progress through a hand-rolled **14-step boot sequencer** (`index.html:462`). Each critical script registers its own outcome:

```html
<script src="js/window.js"
        onload="window._bootStep('window', true)"
        onerror="window._bootFail('window', 'Failed to load window.js')">
```

A progress bar fills as steps report in. If **any** step fails, the sequencer shows a crash screen listing every failure — no silent breakage. There is also a full power lifecycle: boot screen → desktop → shutdown overlay → "powered off" screen with a start button.

### Load order and layering

Order is load-bearing. The dependency chain is:

```
settings → shortcuts
  → icons → apps
  → fuzzy, clock, widgets, widgets-builtin, weather, calendar, monitor
  → filesystem            (must exist before desktop subscribes to mount events)
  → desktop → window → filepicker → filebrow
  → Three.js vendor bundle → starship → browrio
  → wasm_physics → gta → shell → codebrow
  → snake, terrario, spotlight, browcut, spaces
  → macos/* → controls
```

`js/theme.css` is deliberately loaded **last** in the CSS list so its settings-driven overrides win at equal specificity.

### Core subsystems

| File | Lines | Responsibility |
|---|---:|---|
| `js/window.js` | ~4.8k | `WindowManager`, window templates, per-app content and event wiring, dialogs |
| `js/gta.js` | ~28k | Brow City — concatenated production build |
| `js/starship.js` | ~2.9k | Void Tactics 3D |
| `js/browrio.js` | ~2.3k | Browrio Run |
| `js/codebrow.js` | ~2.0k | Monaco loader, IDE integration |
| `js/desktop.js` | ~1.8k | Icon grid, context menus, dock/taskbar morphing |
| `js/widgets-builtin.js` | ~1.5k | 20 widget definitions |
| `js/shell.js` + `js/cli/` | ~1.3k + ~4.5k | Terminal session, tabs, parser, runtimes |
| `js/filesystem.js` | ~972 | Persistent VFS with event bus |
| `js/widgets.js` | ~856 | Widget engine, gallery, drag/edit, persistence |
| `js/filebrow.js` | ~736 | File explorer UI |
| `js/spaces.js` | ~620 | Virtual desktops + Mission Control |
| `js/spotlight.js` | ~537 | SQLite-WASM universal search |
| `js/shortcuts.js` | ~296 | Global `Alt+Shift` layer |
| `js/macos/` | ~4 files | Menu bar + app switcher |

### Data & persistence

| Store | Backing | Used by |
|---|---|---|
| BrowOS Filesystem | File System Access API / OPFS | FileBrow, CodeBrow, terminal, notes, games |
| `browos_settings_v2` | `localStorage` | Settings (bridged to legacy `browos_*` keys) |
| `browos_widgets_v1` | `localStorage` | Widget positions, sizes, settings |
| `browos_space_count` | `localStorage` | Virtual desktop count |
| Game saves | VFS (`gta-save.json`, `BrowrioScores.txt`) + `localStorage` | Brow City, Browrio |

---

## 🦀 WebAssembly Modules

Two Rust crates compile to WASM and are checked in under `assets/wasm/` so the app runs without a Rust toolchain:

### `browos-terminal/` → `assets/wasm/browos_terminal_bg.wasm` (230 KB)

The terminal's backend, built with `wasm-bindgen`. Handles command execution plumbing, virtual path resolution, base64 encoding, and time formatting — keeping the heavy string work out of the JS main thread. `js/cli/engine.js` is the JS-side bridge.

```toml
[dependencies]
wasm-bindgen = "0.2"   wasm-bindgen-futures = "0.4"
js-sys = "0.3"         serde = "1.0"   serde-wasm-bindgen = "0.6"
chrono = "0.4"         base64 = "0.22"
```

### `rust/brow_city_wasm/` → `assets/wasm/brow_city_physics.wasm` (20 KB)

Brow City's narrow-phase physics. Compiled with `opt-level = 3`, LTO, `codegen-units = 1`, `panic = "abort"`, and stripped — hence the tiny output. Consumed by `js/wasm_physics.js`, and toggleable from Settings.

Because both WASM modules need `SharedArrayBuffer`, `server.js` sets `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. `netlify.toml` mirrors these for static deploys.

**Rebuilding:**

```bash
cd browos-terminal            && wasm-pack build --release --target web
cd rust/brow_city_wasm        && cargo build --release --target wasm32-unknown-unknown
```

---

## 🌐 The Backend Server

`server.js` is a small Express app (~17 KB) doing three jobs:

1. **Static hosting** with deliberate cache policy — HTML/JS/CSS/WASM are served `no-store` so local edits always show up, while images and fonts get `max-age=31536000, immutable`.
2. **Security headers** — COOP/COEP for WASM, plus `X-Content-Type-Options`, `X-Frame-Options`, a disabled `X-XSS-Protection`, and a strict referrer policy.
3. **A reverse proxy at `/__proxy__/`.** Its main BrowOS client is the **custom wallpaper** feature — when you paste an external image URL in Settings or the desktop background picker, `js/window.js` routes it through this endpoint to sidestep CORS. It fetches upstream content, follows up to 5 redirects, keeps a 500-entry response cache, and **rewrites HTML** so proxied pages remain coherent:
   - Resolves and re-points `src`, `href`, `action`, `poster`, `data`, and lazyload attributes through the proxy.
   - Fully rewrites `srcset` / `data-srcset` with preserved width descriptors.
   - Rewrites `url()` references inside inline styles.
   - Injects a `<base>` tag and neutralizes `window.top` frame-busting scripts.
   - Uses keep-alive HTTP/HTTPS agents (100 sockets) with a 30s request timeout.

`compression()` runs globally, so responses are gzipped in transit.

---

## 🛠️ Development Workflows

### Brow City: modular source → single build

Brow City is authored across **30 files** in `js/gta/` and concatenated into the single `js/gta.js` that `index.html` loads. **Edit files in `js/gta/`, never `js/gta.js` directly** — the build overwrites it.

```bash
node scripts/build-gta.js     # js/gta/*  →  js/gta.js
```

The concatenation order in `scripts/build-gta.js` is explicit and matters — `core/constants` must precede the world builders, `world/city_builder` must precede `physics/colliders`, and `boot.js` must come last since it defines the BrowOS app entry point:

```
core/utils → core/constants → world/map_data → world/textures → world/geometry
  → world/land → world/city_data → world/city_builder → physics/colliders
  → entities/player → entities/vehicles → systems/traffic → systems/police
  → entities/peds → systems/loot → systems/particles → systems/bullet_tracers
  → systems/route → ui/hud → core/save → ui/map_editor → core/audio
  → world/daynight → game → systems/assets → systems/foot_cops
  → systems/ambulance → systems/bus → systems/villa_gate → boot
```

| `js/gta/` module | Lines | Contents |
|---|---:|---|
| `world/city_builder.js` | ~6.0k | The Manhattan generator |
| `game.js` | ~4.0k | Core game loop and state |
| `ui/map_editor.js` | ~3.2k | In-game map/layout editor |
| `entities/vehicles.js` | ~2.2k | Vehicle physics and models |
| `entities/peds.js` | ~1.8k | Pedestrian AI and instancing |
| `ui/hud.js` | ~1.7k | Minimap, wanted stars, toasts |
| `systems/traffic.js` | ~1.6k | Lane graph, signals, routing |
| `world/city_data.js` | ~1.0k | Street/landmark definitions |

### Asset tooling

| Script | Purpose |
|---|---|
| `scripts/build-gta.js` | Concatenate `js/gta/` → `js/gta.js` |
| `scripts/generate-gta-vehicles.js` | Generate vehicle GLBs |
| `scripts/import-downloaded-vehicles.js` | Import third-party vehicle packs |
| `scripts/import-new-vehicle-pack.js` | Import and normalize a vehicle pack |
| `scripts/generate-gta-combat-audio.js` | Synthesize combat audio |
| `scripts/export-vehicle-generator-core.js` | Export the shared vehicle generator |
| `scripts/generate_cinematic_sfx.py` | Cinematic SFX generation |
| `scripts/import_elevenlabs_sfx.py` | Import external SFX |
| `tools/build_police_hq*.{py,js,ps1}` | Bake the police HQ model |
| `tools/gen_city_glb.js` | City GLB generation |
| `build_koenigsegg.py` | Koenigsegg vehicle model builder |

### Standalone 3D viewers

Five self-contained HTML pages serve as development and demo surfaces for the 3D work:

- **`showcase.html`** — asset & landmark showcase (3.4k lines)
- **`showroom.html`** — vehicle showroom & fleet selector
- **`vehicle-preview.html`** — 27-vehicle fleet viewer
- **`villa-inspector.html`** — estate & mountain hills inspector
- **`preview-gta.html`** — quick asset preview

`scratch/` holds CDP-driven headless-browser capture and verification scripts plus reference screenshots.

---

## 📁 Project Layout

```
BrowOS/
├── index.html                  # Entry point — boot sequencer + all script tags
│
├── css/                        # 14 stylesheets, loaded in dependency order
│   ├── style.css               # Base desktop, dock/taskbar, menu bar
│   ├── window.css              # Window chrome, animations, snap guides
│   ├── desktop.css             # Desktop icon grid
│   ├── widgets.css             # Widget cards and gallery
│   ├── apps.css                # Per-application styling
│   ├── theme.css               # Settings-driven CSS variables (loaded LAST)
│   ├── spaces.css              # Virtual desktops + Mission Control
│   ├── spotlight.css           # Spotlight overlay
│   ├── browcut.css             # Video editor
│   ├── clock.css               # Clock surfaces
│   ├── macos.css               # Menu bar + app switcher
│   ├── terminal.css            # Terminal
│   ├── controls.css            # Platform form controls
│   └── filepicker.css          # File picker dialog
│
├── js/                         # Flat — loaded by index.html in dependency order
│   ├── icons.js                # Unified SVG path library
│   ├── apps.js                 # App registry (23 apps)
│   ├── settings.js             # Settings schema + persistence + apply path
│   ├── shortcuts.js            # Global Alt+Shift shortcut layer
│   ├── fuzzy.js                # Fuzzy match scoring
│   ├── desktop.js              # Icon grid, context menus, dock morphing
│   ├── spaces.js               # BrowSpaces + Mission Control
│   ├── window.js               # WindowManager, templates, app content
│   ├── filepicker.js           # Open/Save dialog
│   ├── filesystem.js           # Persistent VFS + event bus
│   ├── filebrow.js             # File explorer
│   ├── shell.js                # Terminal session host (xterm.js)
│   ├── codebrow.js             # Monaco IDE
│   ├── spotlight.js            # SQLite-WASM universal search
│   ├── widgets.js              # Widget engine + gallery
│   ├── widgets-builtin.js      # 20 built-in widget definitions
│   ├── clock.js                # Menu-bar clock + clock app
│   ├── weather.js              # Weather app
│   ├── calendar.js             # Calendar app
│   ├── monitor.js              # System Monitor app
│   ├── browcut.js              # Video editor
│   ├── controls.js             # Custom select/input styling
│   ├── wasm_physics.js         # Brow City physics WASM bridge
│   ├── vehicle-generator-core.js
│   ├── starship.js             # Void Tactics 3D
│   ├── browrio.js              # Browrio Run
│   ├── snake.js                # Snake 3D
│   ├── terrario.js             # Terrario
│   ├── gta.js                  # Brow City — GENERATED, do not edit
│   │
│   ├── cli/                    # Terminal internals
│   │   ├── engine.js           # Execution engine + WASM bridge
│   │   ├── parser.js           # Command parser (pipes, redirects, chaining)
│   │   ├── commands.js         # ~70 built-in commands
│   │   ├── autocomplete.js     # VFS-aware completion
│   │   ├── nano.js             # Full-screen terminal editor
│   │   ├── runtimes.js         # node / python / sqlite3 workers
│   │   ├── scripting.js        # sh/bash/source + shell functions
│   │   ├── environment.js      # Env vars, aliases, PATH
│   │   ├── node_worker.js      # Node runtime worker
│   │   └── python_worker.js    # Python runtime worker
│   │
│   ├── macos/                  # core · menubar · appswitch · init
│   │
│   └── gta/                    # Brow City — 30 editable source modules
│       ├── core/               # utils · constants · audio · save
│       ├── world/              # city_builder · city_data · map_data
│       │                       # textures · geometry · land · daynight
│       ├── entities/           # player · vehicles · peds
│       ├── systems/            # traffic · police · loot · route · bus
│       │                       # particles · bullet_tracers · ambulance
│       │                       # assets · foot_cops · villa_gate
│       ├── physics/            # colliders
│       ├── ui/                 # hud · map_editor
│       ├── game.js             # Core game loop and state
│       └── boot.js             # BrowOS app entry
│
├── assets/
│   ├── vendor/                 # Three.js r134 + bloom + GLTFLoader + three-mesh-bvh
│   ├── wasm/                   # Compiled Rust WASM + JS bindings
│   ├── models/gta/             # 143 GLB models across 7 categories
│   ├── models/custom/          # Hand-authored Blender exports
│   ├── audio/gta/              # 33 combat/vehicle/ambient samples
│   ├── icons/                  # 67 SVG icons (apps, ui, util)
│   ├── wallpapers/             # 5 SVG wallpapers
│   └── imported_vehicles/      # Third-party vehicle packs
│
├── brow_city_assets/           # 19 GLBs + manifest.json (asset pack)
├── browos-terminal/            # Rust crate → WASM terminal backend
├── rust/brow_city_wasm/        # Rust crate → WASM city physics
├── scripts/                    # Build and asset generation
├── tools/                      # Blender/headless model builders
├── scratch/                    # Headless capture + verification
│
├── server.js                   # Express: static + proxy + COOP/COEP
├── netlify.toml                # Static deploy headers
└── package.json
```

---

## 🧩 Extending BrowOS

### Add an application

1. **Register it** in `js/apps.js` with a name, icon, and window title:
   ```js
   'myapp': {
       name: 'My App',
       icon: BrowOSIcons.myapp,
       windowTitle: 'My App'
   }
   ```
2. **Add an icon** — a vector path in `js/icons.js`.
3. **Build the content** — add a `case 'myapp':` to `getAppContent(appName)` in `js/window.js`, and an `initMyAppEvents(windowElement)` method if it needs interactivity.
4. **Load your logic** — add `<script src="js/myapp.js">` to `index.html`, inside the boot sequence if it's essential.
5. **Add dock/launchpad presence** — a `.dock-app` element in `index.html` with `data-app="myapp"`.

### Add a widget

Append a definition to `js/widgets-builtin.js` with `id`, `name`, `category`, and a `render()` returning HTML plus an optional `mount()` for live behavior. It's automatically picked up by the gallery, sizing system, persistence, and edit mode.

### Add a terminal command

Add an `async` method to the command class in `js/cli/commands.js`. Autocomplete, help text, and the dispatcher discover it automatically.

### Change the look

Edit the CSS variables applied by `js/settings.js` and consumed in `css/theme.css`. Because `theme.css` loads last, overrides there win — no `!important` required anywhere else.

---

## 🔧 Troubleshooting

| Symptom | Cause & fix |
|---|---|
| **"BrowOS Failed to Start"** with a component list | The crash screen names each failed step. Usually a CDN hiccup (xterm, Google Fonts) or a missing `npm install`. Check the named script. |
| **Filesystem won't mount / "request access" loops** | You're not in a secure context. Use `http://localhost:3000`, not `file://`. |
| **WASM terminal or physics unavailable** | COOP/COEP headers are missing — you're served statically without `server.js`. Use `npm start`. |
| **CodeBrow editor has no styling** | Monaco's CSS resolves from `node_modules`. Run `npm install`. |
| **3D games stutter or drop effects** | Expected on integrated GPUs — quality adapts automatically. Lower the resolution or close other 3D windows. |
| **Nothing shows in Safari/Firefox** | BrowOS requires the File System Access API and `SharedArrayBuffer`. Use a Chromium browser. |

---

## 📄 License

This project is **educational**. Fork it, expand it, and build your own applications inside the sandbox.

<div align="center">
<sub>Built with vanilla web platform APIs — and a little Rust.</sub>
</div>
