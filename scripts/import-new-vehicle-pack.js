'use strict';

const fs = require('fs');
const path = require('path');
const THREE = require('../assets/vendor/three.min.js');

global.THREE = THREE;
global.window = { URL: { createObjectURL: () => '', revokeObjectURL: () => {} } };
global.document = { createElement: () => ({ setAttribute: () => {} }) };

const GLTFLoaderCode = fs.readFileSync(path.join(__dirname, '..', 'assets', 'vendor', 'GLTFLoader.js'), 'utf8');
eval(GLTFLoaderCode);

const ROOT = path.resolve(__dirname, '..');
const SOURCE_GLB = path.join(ROOT, 'assets', 'imported_vehicles', 'free_low_poly_vehicles_pack.glb');
const OUT_DIR = path.join(ROOT, 'assets', 'models', 'gta', 'vehicles');
const MANIFEST_PATH = path.join(ROOT, 'assets', 'models', 'gta', 'manifest.json');
const SHOWCASE_PATH = path.join(ROOT, 'showcase.html');

if (!fs.existsSync(SOURCE_GLB)) {
  const downloadPath = 'C:\\Users\\rudra\\Downloads\\free_low_poly_vehicles_pack.glb';
  if (fs.existsSync(downloadPath)) {
    fs.mkdirSync(path.dirname(SOURCE_GLB), { recursive: true });
    fs.copyFileSync(downloadPath, SOURCE_GLB);
    console.log('Copied pack from Downloads to assets/imported_vehicles/');
  } else {
    console.error('Source pack not found at', SOURCE_GLB, 'or', downloadPath);
    process.exit(1);
  }
}

const VEHICLE_MAP = {
  sedan:           { prefix: 'Sedan',              isService: false, name: 'Sentinel Sedan' },
  taxi:            { prefix: 'Taxi',               isService: true,  name: 'Cabbie Taxi' },
  coupe:           { prefix: 'Roadster',           isService: false, name: 'Banshee Roadster' },
  hatchback:       { prefix: 'Hatchback',          isService: false, name: 'Blista Compact' },
  muscle:          { prefix: 'Muscle',             isService: false, name: 'Sabre Turbo' },
  suv:             { prefix: 'SUV',                isService: false, name: 'Patriot SUV' },
  offroad:         { prefix: 'Monster_Truck',      isService: false, name: 'Rancher 4x4' },
  pickup:          { prefix: 'Pickup',             isService: false, name: 'Bobcat Pickup' },
  supercar:        { prefix: 'Sports',             isService: false, name: 'Infernus Exotic' },
  van:             { prefix: 'Van',                isService: false, name: 'Burrito Cargo' },
  limo:            { prefix: 'Limousine',          isService: false, name: 'Stretch Limousine' },
  ambulance:       { prefix: 'Ambulance',          isService: true,  name: 'Paramedic Ambulance' },
  firetruck:       { prefix: 'Firetruck',          isService: true,  name: 'Engine 51 Fire Truck' },
  police:          { prefix: 'Police_Sedan',       isService: true,  name: 'NYPD Cruiser' },
  police_suv:      { prefix: 'Police_SUV',         isService: true,  name: 'Police Interceptor' },
  police_enforcer: { prefix: 'Police_Muscle',      isService: true,  name: 'Police Enforcer' },
  bus:             { prefix: 'Bus',                isService: true,  name: 'MTA City Transit Bus' },
  truck:           { prefix: 'Truck',              isService: false, name: 'Mule Box Truck' },
  semi:            { prefix: 'Truck_with_trailer', isService: false, name: 'Roadtrain Semi' }
};

function minMax(values, stride) {
  const min = Array(stride).fill(Infinity);
  const max = Array(stride).fill(-Infinity);
  for (let i = 0; i < values.length; i++) {
    const c = i % stride;
    min[c] = Math.min(min[c], values[i]);
    max[c] = Math.max(max[c], values[i]);
  }
  return [min, max];
}

function writeGLB(id, bodyGeom, wheelGeom, hubs) {
  const chunks = [], views = [], accessors = [];
  let offset = 0;
  const pad4 = () => { while (offset % 4) { chunks.push(Buffer.alloc(1)); offset++; } };
  const push = (values, componentType, type, stride, target) => {
    pad4();
    const typed = componentType === 5126 ? new Float32Array(values) : new Uint32Array(values);
    const buf = Buffer.from(typed.buffer);
    views.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, target });
    chunks.push(buf);
    offset += buf.length;
    const [min, max] = minMax(values, stride);
    const accessor = accessors.length;
    accessors.push({ bufferView: views.length - 1, componentType, count: values.length / stride, type, min, max });
    return accessor;
  };

  const meshFor = (geometry, name) => {
    const position = push(geometry.p, 5126, 'VEC3', 3, 34962);
    const normal = push(geometry.n, 5126, 'VEC3', 3, 34962);
    const color = push(geometry.c, 5126, 'VEC3', 3, 34962);
    const indices = push(geometry.i, 5125, 'SCALAR', 1, 34963);
    return { name, primitives: [{ attributes: { POSITION: position, NORMAL: normal, COLOR_0: color }, indices, material: 0 }] };
  };

  const meshes = [meshFor(bodyGeom, 'BodyMesh')];
  const nodes = [{ name: id, children: [1] }, { name: 'Body', mesh: 0 }];

  if (wheelGeom && wheelGeom.p.length > 0) {
    meshes.push(meshFor(wheelGeom, 'WheelMesh'));
    const wheelMeshIdx = meshes.length - 1;

    for (const [name, pos] of [
      ['Wheel_FL', hubs.fl],
      ['Wheel_FR', hubs.fr],
      ['Wheel_RL', hubs.rl],
      ['Wheel_RR', hubs.rr],
    ]) {
      nodes[0].children.push(nodes.length);
      nodes.push({
        name,
        translation: [pos.x, pos.y, pos.z],
        mesh: wheelMeshIdx
      });
    }
  }

  const json = {
    asset: { version: '2.0', generator: 'BrowOS new vehicle pack importer v1.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes, meshes,
    materials: [{
      name: 'LowPolyVertexColor',
      pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.85 },
      doubleSided: true,
    }],
    buffers: [{ byteLength: offset }],
    bufferViews: views, accessors,
  };

  const jsonBuf = Buffer.from(JSON.stringify(json));
  const jsonPad = Buffer.alloc((4 - jsonBuf.length % 4) % 4, 0x20);
  const bin = Buffer.concat(chunks);
  const binPad = Buffer.alloc((4 - bin.length % 4) % 4);
  const total = 12 + 8 + jsonBuf.length + jsonPad.length + 8 + bin.length + binPad.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8);
  jh.writeUInt32LE(jsonBuf.length + jsonPad.length, 0);
  jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8);
  bh.writeUInt32LE(bin.length + binPad.length, 0);
  bh.writeUInt32LE(0x004e4942, 4);

  return {
    buffer: Buffer.concat([header, jh, jsonBuf, jsonPad, bh, bin, binPad]),
    tris: (bodyGeom.i.length + (wheelGeom ? wheelGeom.i.length * 4 : 0)) / 3,
    bodyTris: bodyGeom.i.length / 3,
    wheelTris: wheelGeom ? wheelGeom.i.length / 3 : 0
  };
}

const rawBuf = fs.readFileSync(SOURCE_GLB);
const loader = new THREE.GLTFLoader();

loader.parse(rawBuf.buffer.slice(rawBuf.byteOffset, rawBuf.byteOffset + rawBuf.byteLength), '', (gltf) => {
  gltf.scene.updateMatrixWorld(true);
  console.log('Loaded source pack. Parsing', Object.keys(VEHICLE_MAP).length, 'vehicles...');

  let manifest = {};
  if (fs.existsSync(MANIFEST_PATH)) {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  }
  manifest.vehicles = manifest.vehicles || {};

  const summary = [];

  for (const [id, info] of Object.entries(VEHICLE_MAP)) {
    const prefix = info.prefix;
    const bodyMeshes = [];
    const wheels = { fl: [], fr: [], rl: [], rr: [] };

    gltf.scene.traverse(o => {
      if (!o.isMesh) return;
      const name = o.name;

      let isMatch = false;
      if (prefix === 'Muscle') {
        isMatch = (name.startsWith('Muscle_') && !name.startsWith('Muscle_2_') && !name.startsWith('Police_Muscle_'));
      } else if (prefix === 'Truck') {
        isMatch = (name.startsWith('Truck_') && !name.startsWith('Truck_with_trailer_'));
      } else {
        isMatch = name.startsWith(prefix + '_');
      }

      if (!isMatch) return;

      if (!name.includes('wheel')) {
        bodyMeshes.push(o);
      } else {
        if (name.includes('front_left')) wheels.fl.push(o);
        else if (name.includes('front_right')) wheels.fr.push(o);
        else if (name.includes('rear_left')) wheels.rl.push(o);
        else if (name.includes('rear_right')) wheels.rr.push(o);
      }
    });

    if (bodyMeshes.length === 0 || wheels.fl.length === 0) {
      console.warn('Skipping ' + id + ': body or wheels not found for prefix ' + prefix);
      continue;
    }

    const hubs = {};
    for (const [side, meshes] of Object.entries(wheels)) {
      const b = new THREE.Box3();
      meshes.forEach(m => b.expandByObject(m));
      hubs[side] = b.getCenter(new THREE.Vector3());
    }

    const fullBox = new THREE.Box3();
    bodyMeshes.forEach(m => fullBox.expandByObject(m));
    Object.values(wheels).flat().forEach(m => fullBox.expandByObject(m));

    const centerX = (hubs.fl.x + hubs.fr.x + hubs.rl.x + hubs.rr.x) / 4;
    const centerZ = (hubs.fl.z + hubs.fr.z + hubs.rl.z + hubs.rr.z) / 4;
    const groundY = fullBox.min.y;

    const transformedHubs = {};
    for (const [side, h] of Object.entries(hubs)) {
      const x0 = h.x - centerX;
      const y0 = h.y - groundY;
      const z0 = h.z - centerZ;
      transformedHubs[side] = new THREE.Vector3(-x0, y0, -z0);
    }

    const bodyGeom = { p: [], n: [], c: [], i: [] };
    const nm = new THREE.Matrix3();
    const v = new THREE.Vector3();
    const vNorm = new THREE.Vector3();

    for (const m of bodyMeshes) {
      const g = m.geometry;
      if (!g || !g.attributes.position) continue;
      nm.getNormalMatrix(m.matrixWorld);

      let col = [1.0, 1.0, 1.0];
      const mName = m.name.toLowerCase();

      if (mName.includes('rear_lights')) {
        col = [0.95, 0.03, 0.03];
      } else if (mName.includes('headlights')) {
        col = [1.0, 0.98, 0.80];
      } else if (mName.includes('windows')) {
        col = [0.08, 0.14, 0.20];
      } else if (mName.includes('flashers_siren_red')) {
        col = [1.0, 0.05, 0.05];
      } else if (mName.includes('flashers_siren_blue')) {
        col = [0.05, 0.25, 0.95];
      } else if (mName.includes('body_black')) {
        col = [0.04, 0.045, 0.05];
      } else if (mName.includes('body_white')) {
        col = [0.92, 0.92, 0.92];
      } else if (mName.includes('body_grey') || mName.includes('body_dark_grey')) {
        col = [0.35, 0.38, 0.42];
      } else {
        if (!info.isService) {
          col = [1.0, 1.0, 1.0];
        } else {
          if (id === 'taxi') {
            col = [1.0, 0.78, 0.03];
          } else if (id.startsWith('police')) {
            col = [0.04, 0.045, 0.05];
          } else if (id === 'ambulance') {
            col = [0.92, 0.92, 0.94];
          } else if (id === 'firetruck') {
            col = [0.82, 0.08, 0.06];
          } else if (id === 'bus') {
            col = [0.06, 0.20, 0.68];
          } else if (m.material && m.material.color) {
            col = [m.material.color.r, m.material.color.g, m.material.color.b];
          }
        }
      }

      const pAttr = g.attributes.position;
      const nAttr = g.attributes.normal;
      const firstIdx = bodyGeom.p.length / 3;

      const pCount = pAttr.count;
      for (let i = 0; i < pCount; i++) {
        v.fromBufferAttribute(pAttr, i).applyMatrix4(m.matrixWorld);
        const x0 = v.x - centerX;
        const y0 = v.y - groundY;
        const z0 = v.z - centerZ;
        bodyGeom.p.push(-x0, y0, -z0);

        if (nAttr) {
          vNorm.fromBufferAttribute(nAttr, i).applyMatrix3(nm).normalize();
          bodyGeom.n.push(-vNorm.x, vNorm.y, -vNorm.z);
        } else {
          bodyGeom.n.push(0, 1, 0);
        }

        bodyGeom.c.push(...col);
      }

      if (g.index) {
        const iCount = g.index.count;
        for (let i = 0; i < iCount; i++) {
          bodyGeom.i.push(firstIdx + g.index.getX(i));
        }
      } else {
        for (let i = 0; i < pCount; i++) {
          bodyGeom.i.push(firstIdx + i);
        }
      }
    }

    const wheelGeom = { p: [], n: [], c: [], i: [] };
    const flHubWorld = hubs.fl;

    for (const m of wheels.fl) {
      const g = m.geometry;
      if (!g || !g.attributes.position) continue;
      nm.getNormalMatrix(m.matrixWorld);

      const mName = m.name.toLowerCase();
      let col = [0.78, 0.80, 0.83];
      if (mName.includes('tires')) {
        col = [0.03, 0.032, 0.038];
      }

      const pAttr = g.attributes.position;
      const nAttr = g.attributes.normal;
      const firstIdx = wheelGeom.p.length / 3;
      const pCount = pAttr.count;

      for (let i = 0; i < pCount; i++) {
        v.fromBufferAttribute(pAttr, i).applyMatrix4(m.matrixWorld);
        const x0 = v.x - flHubWorld.x;
        const y0 = v.y - flHubWorld.y;
        const z0 = v.z - flHubWorld.z;
        wheelGeom.p.push(-x0, y0, -z0);

        if (nAttr) {
          vNorm.fromBufferAttribute(nAttr, i).applyMatrix3(nm).normalize();
          wheelGeom.n.push(-vNorm.x, vNorm.y, -vNorm.z);
        } else {
          wheelGeom.n.push(0, 1, 0);
        }

        wheelGeom.c.push(...col);
      }

      if (g.index) {
        const iCount = g.index.count;
        for (let i = 0; i < iCount; i++) {
          wheelGeom.i.push(firstIdx + g.index.getX(i));
        }
      } else {
        for (let i = 0; i < pCount; i++) {
          wheelGeom.i.push(firstIdx + i);
        }
      }
    }

    const minX = Math.min(...bodyGeom.p.filter((_, idx) => idx % 3 === 0));
    const maxX = Math.max(...bodyGeom.p.filter((_, idx) => idx % 3 === 0));
    const minY = Math.min(...bodyGeom.p.filter((_, idx) => idx % 3 === 1));
    const maxY = Math.max(...bodyGeom.p.filter((_, idx) => idx % 3 === 1));
    const minZ = Math.min(...bodyGeom.p.filter((_, idx) => idx % 3 === 2));
    const maxZ = Math.max(...bodyGeom.p.filter((_, idx) => idx % 3 === 2));

    const width = Number((maxX - minX).toFixed(2));
    const height = Number((maxY - minY).toFixed(2));
    const length = Number((maxZ - minZ).toFixed(2));

    const flTrans = transformedHubs.fl;
    const frTrans = transformedHubs.fr;
    const rlTrans = transformedHubs.rl;
    const rrTrans = transformedHubs.rr;

    const wheelRadius = Number(flTrans.y.toFixed(2));
    const wheelbase = Number(Math.abs(rlTrans.z - flTrans.z).toFixed(2));

    const glbData = writeGLB(id, bodyGeom, wheelGeom, {
      fl: flTrans,
      fr: frTrans,
      rl: rlTrans,
      rr: rrTrans
    });

    const outPath = path.join(OUT_DIR, id + '.glb');
    fs.writeFileSync(outPath, glbData.buffer);

    manifest.vehicles[id] = {
      file: 'vehicles/' + id + '.glb',
      tris: glbData.tris,
      materials: 1,
      dimensions_m: { width, height, length },
      orientation: 'Y-up, front -Z',
      wheels: ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR'],
      wheelbase_m: wheelbase,
      wheel_radius_m: wheelRadius,
      features: info.name,
      style: 'New imported low-poly vehicle pack'
    };

    summary.push({
      id,
      name: info.name,
      bodyTris: glbData.bodyTris,
      wheelTris: glbData.wheelTris,
      totalTris: glbData.tris,
      dims: length + 'm x ' + width + 'm x ' + height + 'm',
      wb: wheelbase,
      wheel: wheelRadius
    });
  }

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
  console.log('Successfully updated manifest.json');

  if (fs.existsSync(SHOWCASE_PATH)) {
    let html = fs.readFileSync(SHOWCASE_PATH, 'utf8');
    for (const item of summary) {
      const regex = new RegExp('(' + item.id + ':\\s*\\{[^}]*tris:\\s*)\\d+([^}]*\\})', 's');
      if (regex.test(html)) {
        html = html.replace(regex, '$1' + item.totalTris + '$2');
      }
    }
    fs.writeFileSync(SHOWCASE_PATH, html, 'utf8');
    console.log('Successfully updated showcase.html vehicle stats');
  }

  console.log('--- VEHICLE IMPORT SUMMARY ---');
  console.table(summary);
  console.log('Total vehicles replaced:', summary.length);
  console.log('Preserved stock models for: compact, minivan, wagon, schoolbus, garbage, towtruck, motorcycle, scooter, speedboat, custom_vehicle.');
});
