    // ===========================================================================
    // CONSTANTS
    // ===========================================================================
    const PHYS = {
        GRAVITY: 26,
        PLAYER_WALK: 3.6,
        PLAYER_RUN: 7.2,
        PLAYER_JUMP: 8.6,
        PLAYER_HEIGHT: 1.8,
        PLAYER_RADIUS: 0.38,
        EYE_HEIGHT: 1.62,
        VEHICLE_TOP_SPEED: 34,
    };

    const WORLD = {
        // Expanded world extents: Manhattan, Paradise & hills, Queens, Vice Shores, Governors, Brooklyn & harbor waters
        MIN_X: -1600, MAX_X: 2350,  // water extents (incl. Paradise, Queens, Vice Shores, Brooklyn)
        MIN_Z: -300, MAX_Z: 4100,
        CHUNK: 300,                 // chunk edge in meters
        GROUND_Y: 0.12,             // road surface height
        SIDEWALK_Y: 0.22,           // sidewalk surface height
        VIEW_CHUNK_DIST2: 650 * 650, // chunks hidden beyond this (with 50m hysteresis)
        SHADOW_RANGE: 160,          // directional shadow ortho half-extent
    };

    // Number of chunks across the world (x and z), used by the city builder.
    const CHUNK_COLS = Math.ceil((WORLD.MAX_X - WORLD.MIN_X) / WORLD.CHUNK);
    const CHUNK_ROWS = Math.ceil((WORLD.MAX_Z - WORLD.MIN_Z) / WORLD.CHUNK);

    // ===========================================================================
    // SETTINGS — Brow City options menu (live store). Persisted to localStorage
    // by Game._saveSettings(); Game._applySettings mirrors audio values into the
    // AudioBus. PLAYER camera code and Traffic/Ped spawn targets read SETTINGS
    // directly so menu changes apply instantly.
    // ===========================================================================
    const GTA_SETTINGS_DEFAULTS = {
        // Audio (0..1 per-bus multipliers; master also scales mute-off loudness)
        master: 1, engine: 0.8, sfx: 1, music: 0.8, mute: false,
        // World density (1 = standard: 34 ambient cars, 44 pedestrians)
        traffic: 1, peds: 1,
        // Graphics
        shadows: true, drawDistance: true, pixelRatio: 'high', fpsCap: 0,
        // Controls
        mouseSens: 1,
    };
    const GTA_SETTINGS_KEY = 'browos.gta.settings.v1';
    const SETTINGS = Object.assign({}, GTA_SETTINGS_DEFAULTS);
