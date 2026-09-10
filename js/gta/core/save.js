    // ===========================================================================
    // SAVE — VFS persistence (Desktop/gta-save.json) mirrored to localStorage so
    // "Continue" survives even when no folder is mounted (or permission lapsed).
    // ===========================================================================
    const SAVE_PATH = 'Desktop/gta-save.json';
    const LS_SAVE_KEY = 'browos.gta.save.v4';

    class SaveSystem {
        static _pickNewer(a, b) {
            if (!a) return b;
            if (!b) return a;
            return new Date(a.savedAt || 0) >= new Date(b.savedAt || 0) ? a : b;
        }

        static _readLocal() {
            try {
                const txt = localStorage.getItem(LS_SAVE_KEY) || localStorage.getItem('browos.gta.save.v3');
                return txt ? JSON.parse(txt) : null;
            } catch (e) { return null; }
        }

        static _writeLocal(data) {
            try { localStorage.setItem(LS_SAVE_KEY, JSON.stringify(data)); return true; }
            catch (e) { return false; }
        }

        static save(game) {
            const p = game.player;
            let px = p.pos.x, py = p.pos.y, pz = p.pos.z, pHeading = p.heading;
            if (p.inVehicle) {
                px = p.inVehicle.x;
                py = p.inVehicle.y;
                pz = p.inVehicle.z;
                pHeading = p.inVehicle.heading;
            }
            const data = {
                version: 4,
                player: {
                    x: px, y: py, z: pz, heading: pHeading,
                    health: p.health, armor: p.armor, money: p.money,
                    weapon: p.weapon, ammo: p.ammo,
                },
                stats: {
                    kills: game.stats.kills, maxWanted: game.stats.maxWanted,
                    distance: Math.round(game.stats.distance), earned: game.stats.earned,
                },
                radio: game.audio ? {
                    on: !!game.audio._radioOn,
                    idx: game.audio._radioIdx | 0,
                    repeatIdx: game.audio._radioRepeatIdx | 0,
                } : null,
                garageVehicles: typeof game.getGarageVehicles === 'function' ? game.getGarageVehicles() : [],
                garageInitialized: !!game._garageInitialized,
                savedAt: new Date().toISOString(),
            };
            // Always keep a local copy so a reload (or a game window without a
            // mounted Desktop folder) still restores the player.
            const localOk = this._writeLocal(data);
            if (window.filesystem && typeof window.filesystem.createFile === 'function') {
                return window.filesystem.createFile(SAVE_PATH, JSON.stringify(data, null, 1))
                    .then(() => true).catch(() => localOk);
            }
            return Promise.resolve(localOk);
        }

        static load() {
            const local = this._readLocal();
            if (window.filesystem && typeof window.filesystem.readFile === 'function') {
                return window.filesystem.readFile(SAVE_PATH).then((txt) => {
                    let vfs = null;
                    if (txt) { try { vfs = JSON.parse(txt); } catch (e) { vfs = null; } }
                    return this._pickNewer(vfs, local);
                }).catch(() => local);
            }
            return Promise.resolve(local);
        }
    }
