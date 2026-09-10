/**
 * Brow City (GTA) Modular Build Script
 * Concatenates modular source files in js/gta/ into production js/gta.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const GTA_SRC = path.join(ROOT_DIR, 'js', 'gta');
const TARGET_FILE = path.join(ROOT_DIR, 'js', 'gta.js');

const MODULE_ORDER = [
    'core/utils.js',
    'core/constants.js',
    'world/map_data.js',
    'world/textures.js',
    'world/geometry.js',
    'world/land.js',
    'world/city_data.js',
    'world/city_builder.js',
    'physics/colliders.js',
    'entities/player.js',
    'entities/vehicles.js',
    'systems/traffic.js',
    'systems/police.js',
    'entities/peds.js',
    'systems/loot.js',
    'systems/particles.js',
    'systems/bullet_tracers.js',
    'systems/route.js',
    'ui/hud.js',
    'core/save.js',
    'ui/map_editor.js',
    'core/audio.js',
    'world/daynight.js',
    'game.js',
    'systems/assets.js',
    'systems/foot_cops.js',
    'systems/ambulance.js',
    'systems/bus.js',
    'systems/villa_gate.js',
    'boot.js'
];

function build() {
    console.log('[build-gta] Assembling modular files from js/gta/ ...');

    const banner = `/* =============================================================================
   BROW CITY: NYC  ·  BrowOS (Modular Build)
   -----------------------------------------------------------------------------
   A 3D GTA-style open-world sandbox set on a hand-designed Manhattan island.
   Source modules are organized under js/gta/
   Auto-built by scripts/build-gta.js. Do not edit directly; edit js/gta/* instead.
   ============================================================================= */
(function () {
    'use strict';

`;

    const parts = [banner];

    for (const relPath of MODULE_ORDER) {
        const fullPath = path.join(GTA_SRC, relPath);
        if (!fs.existsSync(fullPath)) {
            console.error(`[build-gta] ERROR: Missing module ${fullPath}`);
            process.exit(1);
        }
        const content = fs.readFileSync(fullPath, 'utf8');
        parts.push(`    // =========================================================================\n`);
        parts.push(`    // MODULE: ${relPath}\n`);
        parts.push(`    // =========================================================================\n\n`);
        parts.push(content.trim());
        parts.push('\n\n');
    }

    parts.push('})();\n');

    const output = parts.join('');
    fs.writeFileSync(TARGET_FILE, output, 'utf8');
    console.log(`[build-gta] Successfully generated ${TARGET_FILE} (${output.length} bytes, ${MODULE_ORDER.length} modules).`);
}

if (require.main === module) {
    build();
}

module.exports = { build, MODULE_ORDER };
