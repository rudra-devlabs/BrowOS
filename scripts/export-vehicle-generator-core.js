'use strict';
const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, 'generate-gta-vehicles.js');
const dstPath = path.join(__dirname, '..', 'js', 'vehicle-generator-core.js');

const src = fs.readFileSync(srcPath, 'utf8');

// Extract from lines 30 to 1402
const startMarker = 'const C = {';
const endMarker = 'fs.mkdirSync(OUT, { recursive: true });';

const startIdx = src.indexOf(startMarker);
const endIdx = src.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1) {
  console.error('Could not find markers in generate-gta-vehicles.js');
  process.exit(1);
}

const coreCode = src.substring(startIdx, endIdx).trim();

const fileContent = `/**
 * Brow City 3D Procedural Vehicle Generator Engine & Model Blueprints
 * Shared core for build pipelines (Node.js) and real-time live showcase viewer.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    const exports = factory();
    root.VehicleGenerator = exports;
    Object.assign(root, exports);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

${coreCode}

  return {
    C, geom, tri, quad, box, panel, symRing, loft, cylinderX, cylinderY, cylinderZ,
    sideQuad, slopedSideQuad, endQuad, wheelGeometry, headlights, taillights, plate,
    grille, bumpers, mirrors, truckMirrors, exhaustTips, roofRails, lightbar, pushBar,
    sideStripe, bodyLoft, greenhouse, roadCar,
    SPECS, AXLES, s_frontZ, s_rearZ, BUILDERS,
    buildCompact, buildHatchback, buildSedan, buildWagon, buildCoupe, buildMuscle,
    buildSuv, buildMinivan, buildTaxi, buildVan, buildPickup, buildOffroad,
    buildLimo, buildSupercar, buildMotorcycle, buildScooter, buildPolice,
    buildPoliceSuv, buildEnforcer, buildAmbulance, buildFiretruck, buildGarbage,
    buildTowtruck, buildBus, buildSchoolbus, buildTruck, buildSemi, buildSpeedboat,
  };
});
`;

fs.writeFileSync(dstPath, fileContent, 'utf8');
console.log('Successfully generated js/vehicle-generator-core.js (' + fileContent.length + ' bytes)');
