# Brow City Vehicle Radio 🎵

Drop your music files in **this folder**, then list them in the radio
playlist so the game can find them (browsers can't list a folder's
contents, so the list lives in one place):

**`assets/models/gta/manifest.json`** → `"radio"` array:

```json
"radio": [
  { "title": "Midtown Cruise", "file": "audio/gta/music/midtown_cruise.wav" },
  { "title": "My Song",        "file": "audio/gta/music/my_song.mp3" }
]
```

Rules:
- `title` — shown on the HUD when the track starts. Keep it short.
- `file` — path **relative to `assets/`** (must start with `audio/`).
  Works with the dev server AND deployed builds.
- Formats: `.mp3`, `.ogg`, `.wav` (whatever your browser plays).
- Cover art (optional): add `"thumb": "audio/gta/music/my_song.jpg"` to the
  entry — shown in the Alt+R browser. Without it, the game tries
  `my_song.jpg` / `.png` / `.webp` / `.jpeg` next to the track automatically
  (SVG works too). Nothing found → a ♪ placeholder.
- Missing/unplayable files are **skipped automatically** — no crashes.
- **No rebuild needed**: `manifest.json` is fetched at runtime, so just
  refresh the page after adding files.

The two `.wav` files here are tiny procedural demos — delete or replace
them whenever you like.

## Controls (in a vehicle)

- **Enter car** — radio auto-plays (continues where you left off)
- **R** — next track, in the car 📻 or on foot 🎧 (after the last track:
  player off, press again for track 1)
- **L** — repeat the current song on/off (🔂), anywhere
- **Hold Alt+R** — track list with cover art, **↑↓** to pick (keep holding
  **Alt** while reaching for the arrows — releasing R is fine, releasing Alt
  closes the list and plays the pick)
- **Exit car** — the same song keeps playing through the earbuds 🎧
- **N** — mute everything (radio included)
- **Exit car / Wasted / Busted / Menu** — radio stops (on foot, exiting keeps
  playing via earbuds; wasted/busted/menu stop fully)
- **Pause menu** — radio pauses, resumes with the game

## Earbuds 🎧

The player always carries a music player: whenever it is on and you are on
foot, black earbuds show in the ears (hidden in cars with the rest of the
body, except on the motorcycle). Same songs, same R / L / Alt+R controls.
