'use strict';

/**
 * Brow City Vehicle Importer & Converter
 * ---------------------------------------
 * Reads downloaded vehicle models from C:\Users\rudra\Downloads\, converts them
 * to Brow City's runtime contract:
 *  - Orientation: +90° yaw around Y (front toward -Z, right toward +X, up +Y)
 *  - Standard wheel nodes: Wheel_FL, Wheel_FR, Wheel_RL, Wheel_RR
 *  - Hub-centered wheel geometry (axle along local X)
 *  - Pre-baked COLOR_0 vertex colors (paintable body white [1,1,1], details baked)
 *  - Writes optimized GLBs to assets/models/gta/vehicles/
 */

const fs = require('fs');
const path = require('path');

const SRC_DIR = 'C:\\Users\\rudra\\Downloads';
const DEST_DIR = path.resolve(__dirname, '../assets/models/gta/vehicles');
const MANIFEST_PATH = path.resolve(__dirname, '../assets/models/gta/manifest.json');

function minMax(values, stride) {
    const min = Array(stride).fill(Infinity);
    const max = Array(stride).fill(-Infinity);
    for (let index = 0; index < values.length; index++) {
        const component = index % stride;
        min[component] = Math.min(min[component], values[index]);
        max[component] = Math.max(max[component], values[index]);
    }
    return [min, max];
}

function buildGlb(json, chunks, totalBinaryLength) {
    const jsonBuffer = Buffer.from(JSON.stringify(json));
    const jsonPadding = Buffer.alloc((4 - jsonBuffer.length % 4) % 4, 0x20);
    const binary = Buffer.concat(chunks);
    const binaryPadding = Buffer.alloc((4 - binary.length % 4) % 4);
    const total = 12 + 8 + jsonBuffer.length + jsonPadding.length + 8 + binary.length + binaryPadding.length;

    const header = Buffer.alloc(12);
    header.writeUInt32LE(0x46546c67, 0); // glTF
    header.writeUInt32LE(2, 4);          // version 2
    header.writeUInt32LE(total, 8);

    const jsonHeader = Buffer.alloc(8);
    jsonHeader.writeUInt32LE(jsonBuffer.length + jsonPadding.length, 0);
    jsonHeader.writeUInt32LE(0x4e4f534a, 4); // JSON

    const binaryHeader = Buffer.alloc(8);
    binaryHeader.writeUInt32LE(binary.length + binaryPadding.length, 0);
    binaryHeader.writeUInt32LE(0x004e4942, 4); // BIN

    return Buffer.concat([header, jsonHeader, jsonBuffer, jsonPadding, binaryHeader, binary, binaryPadding]);
}

function processVehicle(config) {
    const { srcFile, destFile, name, isCivilianPaintable, skipNodes = [], extraBodyBoxes = [], isTaxi = false } = config;
    const srcPath = path.join(SRC_DIR, srcFile);
    const destPath = path.join(DEST_DIR, destFile);

    if (!fs.existsSync(srcPath)) {
        console.error(`Missing source file: ${srcPath}`);
        return null;
    }

    const buf = fs.readFileSync(srcPath);
    const jsonLen = buf.readUInt32LE(12);
    const gltf = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
    const binStart = 20 + jsonLen + 8;
    const binLen = buf.readUInt32LE(20 + jsonLen);
    const bin = buf.subarray(binStart, binStart + binLen);

    function readAccessor(accIdx) {
        const acc = gltf.accessors[accIdx];
        const bv = gltf.bufferViews[acc.bufferView];
        const byteOffset = (bv.byteOffset || 0) + (acc.byteOffset || 0);
        const count = acc.count;
        const typeSize = acc.type === 'VEC3' ? 3 : acc.type === 'VEC2' ? 2 : acc.type === 'VEC4' ? 4 : 1;

        if (acc.componentType === 5126) {
            return new Float32Array(bin.buffer, bin.byteOffset + byteOffset, count * typeSize);
        } else if (acc.componentType === 5123) {
            return new Uint16Array(bin.buffer, bin.byteOffset + byteOffset, count * typeSize);
        } else if (acc.componentType === 5125) {
            return new Uint32Array(bin.buffer, bin.byteOffset + byteOffset, count * typeSize);
        }
        throw new Error('Unsupported component: ' + acc.componentType);
    }

    const matColors = (gltf.materials || []).map(m => {
        const c = m.pbrMetallicRoughness?.baseColorFactor || [1, 1, 1, 1];
        return [c[0], c[1], c[2]];
    });

    // Compute node world matrices
    const worldMats = new Map();
    function computeWorldMats(nodeIdx, parentMat) {
        const n = gltf.nodes[nodeIdx];
        let m = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
        if (n.matrix) m = n.matrix.slice();
        else {
            const tx = n.translation ? n.translation[0] : 0;
            const ty = n.translation ? n.translation[1] : 0;
            const tz = n.translation ? n.translation[2] : 0;
            m[12] = tx; m[13] = ty; m[14] = tz;
        }
        let wm = m;
        if (parentMat) {
            wm = new Array(16);
            for (let r = 0; r < 4; r++) {
                for (let c = 0; c < 4; c++) {
                    let s = 0;
                    for (let k = 0; k < 4; k++) s += parentMat[r + k * 4] * m[k + c * 4];
                    wm[r + c * 4] = s;
                }
            }
        }
        worldMats.set(nodeIdx, wm);
        if (n.children) {
            for (const c of n.children) computeWorldMats(c, wm);
        }
    }

    const scene = gltf.scenes[gltf.scene || 0];
    for (const r of scene.nodes) computeWorldMats(r, null);

    // Identify wheel nodes vs body nodes
    const wheelNodes = [];
    const wheelChildNodes = new Set();
    gltf.nodes.forEach((n, idx) => {
        if (n.name === 'Wheel') {
            wheelNodes.push(idx);
            if (n.children) n.children.forEach(c => wheelChildNodes.add(c));
        }
    });

    // Helper: apply 4x4 matrix to vector
    function applyMat4(v, m) {
        const x = v[0], y = v[1], z = v[2];
        const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
        return [
            (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
            (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
            (m[2] * x + m[6] * y + m[10] * z + m[14]) / w
        ];
    }

    // Helper: apply 3x3 normal matrix
    function applyNorm(n, m) {
        const x = n[0], y = n[1], z = n[2];
        const nx = m[0] * x + m[4] * y + m[8] * z;
        const ny = m[1] * x + m[5] * y + m[9] * z;
        const nz = m[2] * x + m[6] * y + m[10] * z;
        const l = Math.hypot(nx, ny, nz) || 1;
        return [nx / l, ny / l, nz / l];
    }

    // Rotation R: X' = Z, Y' = Y, Z' = -X
    function rotR(p) { return [p[2], p[1], -p[0]]; }

    // Collect wheel hubs
    const hubs = wheelNodes.map(wIdx => {
        const wm = worldMats.get(wIdx);
        const orig = [wm[12], wm[13], wm[14]];
        const rot = rotR(orig);
        return { orig, rot, wIdx };
    });

    // Find 4 primary wheels:
    // Front wheels have the lowest (most negative) rot[2] (front is -Z)
    // Rear wheels have positive rot[2] (rear is +Z)
    const sortedByZ = hubs.slice().sort((a, b) => a.rot[2] - b.rot[2]);
    const frontHalf = sortedByZ.filter(h => h.rot[2] < 0);
    const rearHalf = sortedByZ.filter(h => h.rot[2] >= 0);

    // FL: frontmost with X < 0; FR: frontmost with X > 0
    let fl = frontHalf.find(h => h.rot[0] < 0) || hubs[0];
    let fr = frontHalf.find(h => h.rot[0] > 0) || hubs[1] || hubs[0];
    let rl = rearHalf.find(h => h.rot[0] < 0) || hubs[2] || hubs[0];
    let rr = rearHalf.find(h => h.rot[0] > 0) || hubs[3] || hubs[0];

    // Collect extra wheels that should be baked into the body mesh (e.g. tandem wheels on long truck / boxtruck)
    const primaryWheelNodeSet = new Set([fl.wIdx, fr.wIdx, rl.wIdx, rr.wIdx]);
    const extraWheelNodes = hubs.filter(h => !primaryWheelNodeSet.has(h.wIdx));

    // Determine body nodes
    const bodyNodes = [];
    gltf.nodes.forEach((n, idx) => {
        if (skipNodes.includes(n.name)) return;
        if (n.mesh !== undefined && !wheelChildNodes.has(idx) && n.name !== 'Wheel') {
            bodyNodes.push(idx);
        }
    });

    // Collect Body Geometry
    const bodyP = [], bodyN = [], bodyC = [], bodyI = [];
    let bodyVertCount = 0;

    for (const nodeIdx of bodyNodes) {
        const n = gltf.nodes[nodeIdx];
        const wm = worldMats.get(nodeIdx);
        const m = gltf.meshes[n.mesh];

        for (const p of m.primitives) {
            const rawPos = readAccessor(p.attributes.POSITION);
            const rawNor = p.attributes.NORMAL !== undefined ? readAccessor(p.attributes.NORMAL) : null;
            const rawInd = p.indices !== undefined ? readAccessor(p.indices) : null;

            let col = [1, 1, 1];
            if (p.material !== undefined && matColors[p.material]) {
                const mc = matColors[p.material];
                if (isTaxi) {
                    if (p.material === 0) col = [0.98, 0.76, 0.05]; // NYC Yellow
                    else col = [mc[0], mc[1], mc[2]];
                } else if (isCivilianPaintable && p.material === 0) {
                    col = [1, 1, 1]; // pure white for instanceColor tinting
                } else {
                    col = [mc[0], mc[1], mc[2]];
                }
            }

            const numVerts = rawPos.length / 3;
            const baseIdx = bodyVertCount;

            for (let i = 0; i < numVerts; i++) {
                const origP = [rawPos[i * 3], rawPos[i * 3 + 1], rawPos[i * 3 + 2]];
                const worldP = applyMat4(origP, wm);
                const finalP = rotR(worldP);
                bodyP.push(...finalP);

                if (rawNor) {
                    const origN = [rawNor[i * 3], rawNor[i * 3 + 1], rawNor[i * 3 + 2]];
                    const worldN = applyNorm(origN, wm);
                    const finalN = rotR(worldN);
                    bodyN.push(...finalN);
                } else {
                    bodyN.push(0, 1, 0);
                }

                bodyC.push(...col);
            }

            if (rawInd) {
                for (let i = 0; i < rawInd.length; i++) bodyI.push(baseIdx + rawInd[i]);
            } else {
                for (let i = 0; i < numVerts; i++) bodyI.push(baseIdx + i);
            }

            bodyVertCount += numVerts;
        }
    }

    // Add extra wheels to body if any (for multi-axle trucks)
    for (const ew of extraWheelNodes) {
        const wn = gltf.nodes[ew.wIdx];
        const children = wn.children || [];
        const wm = worldMats.get(ew.wIdx);

        for (const cIdx of children) {
            const cn = gltf.nodes[cIdx];
            if (cn.mesh === undefined) continue;
            const cm = gltf.meshes[cn.mesh];
            const localM = cn.matrix ? cn.matrix.slice() : [1,0,0,0, 0,1,0,0, 0,0,1,0, cn.translation?.[0]||0, cn.translation?.[1]||0, cn.translation?.[2]||0, 1];

            for (const p of cm.primitives) {
                const rawPos = readAccessor(p.attributes.POSITION);
                const rawNor = p.attributes.NORMAL !== undefined ? readAccessor(p.attributes.NORMAL) : null;
                const rawInd = p.indices !== undefined ? readAccessor(p.indices) : null;

                let col = [0.15, 0.15, 0.15];
                if (p.material !== undefined && matColors[p.material]) {
                    const mc = matColors[p.material];
                    if (mc[0] > 0.4 && mc[1] > 0.4 && mc[2] > 0.4) col = [0.72, 0.76, 0.80];
                    else col = [0.02, 0.02, 0.02];
                }

                const numVerts = rawPos.length / 3;
                const baseIdx = bodyVertCount;

                for (let i = 0; i < numVerts; i++) {
                    const origP = [rawPos[i * 3], rawPos[i * 3 + 1], rawPos[i * 3 + 2]];
                    const hubP = applyMat4(origP, localM);
                    const worldP = applyMat4(hubP, wm);
                    const finalP = rotR(worldP);
                    bodyP.push(...finalP);

                    if (rawNor) {
                        const origN = [rawNor[i * 3], rawNor[i * 3 + 1], rawNor[i * 3 + 2]];
                        const hubN = applyNorm(origN, localM);
                        const worldN = applyNorm(hubN, wm);
                        const finalN = rotR(worldN);
                        bodyN.push(...finalN);
                    } else {
                        bodyN.push(0, 1, 0);
                    }

                    bodyC.push(...col);
                }

                if (rawInd) {
                    for (let i = 0; i < rawInd.length; i++) bodyI.push(baseIdx + rawInd[i]);
                } else {
                    for (let i = 0; i < numVerts; i++) bodyI.push(baseIdx + i);
                }

                bodyVertCount += numVerts;
            }
        }
    }

    // Add extra procedural boxes (e.g. taxi roof sign)
    for (const eb of extraBodyBoxes) {
        const { x, y, z, sx, sy, sz, color } = eb;
        const hx = sx / 2, hy = sy / 2, hz = sz / 2;
        const boxCorners = [
            [-hx, -hy, -hz], [ hx, -hy, -hz], [ hx,  hy, -hz], [-hx,  hy, -hz],
            [-hx, -hy,  hz], [ hx, -hy,  hz], [ hx,  hy,  hz], [-hx,  hy,  hz],
        ];
        const faces = [
            [0, 3, 2, 1, [0, 0, -1]], [4, 5, 6, 7, [0, 0, 1]],
            [0, 4, 7, 3, [-1, 0, 0]], [1, 2, 6, 5, [1, 0, 0]],
            [0, 1, 5, 4, [0, -1, 0]], [3, 7, 6, 2, [0, 1, 0]],
        ];
        for (const [v0, v1, v2, v3, norm] of faces) {
            const base = bodyVertCount;
            for (const ci of [v0, v1, v2, v0, v2, v3]) {
                const cp = boxCorners[ci];
                bodyP.push(cp[0] + x, cp[1] + y, cp[2] + z);
                bodyN.push(...norm);
                bodyC.push(...color);
                bodyI.push(bodyVertCount++);
            }
        }
    }

    // Collect Wheel Geometry (hub-centered, axle along X)
    const wheelP = [], wheelN = [], wheelC = [], wheelI = [];
    let wheelVertCount = 0;

    const flNode = gltf.nodes[fl.wIdx];
    const flChildren = flNode.children || [];

    for (const childIdx of flChildren) {
        const n = gltf.nodes[childIdx];
        if (n.mesh === undefined) continue;
        const localM = n.matrix ? n.matrix.slice() : [1,0,0,0, 0,1,0,0, 0,0,1,0, n.translation?.[0]||0, n.translation?.[1]||0, n.translation?.[2]||0, 1];
        const m = gltf.meshes[n.mesh];

        for (const p of m.primitives) {
            const rawPos = readAccessor(p.attributes.POSITION);
            const rawNor = p.attributes.NORMAL !== undefined ? readAccessor(p.attributes.NORMAL) : null;
            const rawInd = p.indices !== undefined ? readAccessor(p.indices) : null;

            let col = [0.15, 0.15, 0.15];
            if (p.material !== undefined && matColors[p.material]) {
                const mc = matColors[p.material];
                if (mc[0] > 0.4 && mc[1] > 0.4 && mc[2] > 0.4) col = [0.72, 0.76, 0.80]; // chrome rim
                else col = [0.02, 0.02, 0.02]; // black rubber tire
            }

            const numVerts = rawPos.length / 3;
            const baseIdx = wheelVertCount;

            for (let i = 0; i < numVerts; i++) {
                const origP = [rawPos[i * 3], rawPos[i * 3 + 1], rawPos[i * 3 + 2]];
                const hubP = applyMat4(origP, localM);
                const finalP = rotR(hubP);
                wheelP.push(...finalP);

                if (rawNor) {
                    const origN = [rawNor[i * 3], rawNor[i * 3 + 1], rawNor[i * 3 + 2]];
                    const hubN = applyNorm(origN, localM);
                    const finalN = rotR(hubN);
                    wheelN.push(...finalN);
                } else {
                    wheelN.push(0, 1, 0);
                }

                wheelC.push(...col);
            }

            if (rawInd) {
                for (let i = 0; i < rawInd.length; i++) wheelI.push(baseIdx + rawInd[i]);
            } else {
                for (let i = 0; i < numVerts; i++) wheelI.push(baseIdx + i);
            }

            wheelVertCount += numVerts;
        }
    }

    // Build binary buffers and views
    const chunks = [], views = [], accessors = [];
    let offset = 0;

    const pushBuf = (values, componentType, type, stride, target) => {
        while (offset % 4) { chunks.push(Buffer.alloc(1)); offset++; }
        const typed = componentType === 5126 ? new Float32Array(values) : new Uint32Array(values);
        const b = Buffer.from(typed.buffer);
        const viewIdx = views.length;
        views.push({ buffer: 0, byteOffset: offset, byteLength: b.length, target });
        chunks.push(b);
        offset += b.length;
        const [min, max] = minMax(values, stride);
        const accIdx = accessors.length;
        accessors.push({ bufferView: viewIdx, componentType, count: values.length / stride, type, min, max });
        return accIdx;
    };

    const bodyPosAcc = pushBuf(bodyP, 5126, 'VEC3', 3, 34962);
    const bodyNorAcc = pushBuf(bodyN, 5126, 'VEC3', 3, 34962);
    const bodyColAcc = pushBuf(bodyC, 5126, 'VEC3', 3, 34962);
    const bodyIndAcc = pushBuf(bodyI, 5125, 'SCALAR', 1, 34963);

    const wheelPosAcc = pushBuf(wheelP, 5126, 'VEC3', 3, 34962);
    const wheelNorAcc = pushBuf(wheelN, 5126, 'VEC3', 3, 34962);
    const wheelColAcc = pushBuf(wheelC, 5126, 'VEC3', 3, 34962);
    const wheelIndAcc = pushBuf(wheelI, 5125, 'SCALAR', 1, 34963);

    const meshes = [
        { name: 'BodyMesh', primitives: [{ attributes: { POSITION: bodyPosAcc, NORMAL: bodyNorAcc, COLOR_0: bodyColAcc }, indices: bodyIndAcc, material: 0 }] },
        { name: 'WheelMesh', primitives: [{ attributes: { POSITION: wheelPosAcc, NORMAL: wheelNorAcc, COLOR_0: wheelColAcc }, indices: wheelIndAcc, material: 0 }] }
    ];

    // Calculate dimensions
    const [bMin, bMax] = minMax(bodyP, 3);
    const dims = {
        width: Math.round((bMax[0] - bMin[0]) * 100) / 100,
        height: Math.round((bMax[1] - bMin[1]) * 100) / 100,
        length: Math.round((bMax[2] - bMin[2]) * 100) / 100
    };

    // Wheel nodes
    const ox = Math.abs(fl.rot[0]), oz = Math.abs(fl.rot[2]), r = fl.rot[1];
    const wheelNodesDef = [
        { name: 'Wheel_FL', translation: [-ox, r, -oz], mesh: 1 },
        { name: 'Wheel_FR', translation: [ ox, r, -oz], mesh: 1 },
        { name: 'Wheel_RL', translation: [-ox, r,  oz], mesh: 1 },
        { name: 'Wheel_RR', translation: [ ox, r,  oz], mesh: 1 }
    ];

    const nodes = [
        { name: name || 'Vehicle', children: [1, 2, 3, 4, 5] },
        { name: 'Body', mesh: 0 },
        ...wheelNodesDef
    ];

    const outJson = {
        asset: { version: '2.0', generator: 'BrowOS low-poly fleet pipeline v3' },
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes,
        meshes,
        materials: [{
            name: 'LowPolyVertexColor',
            pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.86 },
            doubleSided: true
        }],
        buffers: [{ byteLength: offset }],
        bufferViews: views,
        accessors
    };

    const outBuffer = buildGlb(outJson, chunks, offset);
    fs.writeFileSync(destPath, outBuffer);
    const tris = (bodyI.length + wheelI.length * 4) / 3;
    console.log(`✓ ${destFile.padEnd(16)}: ${outBuffer.length} bytes, ${tris} tris (Body: ${bodyI.length / 3}, Wheels: 4x${wheelI.length / 3}), L=${dims.length}m, W=${dims.width}m, H=${dims.height}m, wheelR=${r.toFixed(2)}m`);

    return {
        file: `vehicles/${destFile}`,
        tris,
        materials: 1,
        dimensions_m: dims,
        orientation: 'Y-up, front -Z',
        wheels: ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR'],
        wheelRadius: r,
        ox,
        oz
    };
}

// ----------------------------------------------------------------------------
// Run batch conversion for all 12 downloaded vehicles + taxi
// ----------------------------------------------------------------------------

fs.mkdirSync(DEST_DIR, { recursive: true });

const FLEET_CONFIGS = [
    {
        srcFile: 'sedan.glb',
        destFile: 'sedan.glb',
        name: 'Sentinel',
        isCivilianPaintable: true,
        typeKey: 'sedan'
    },
    {
        srcFile: 'sedan.glb',
        destFile: 'taxi.glb',
        name: 'Cabbie',
        isTaxi: true,
        extraBodyBoxes: [
            // Taxi roof sign
            { x: 0, y: 1.70, z: -0.15, sx: 0.70, sy: 0.16, sz: 0.30, color: [1.0, 0.85, 0.15] }
        ],
        typeKey: 'taxi'
    },
    {
        srcFile: 'hatchback.glb',
        destFile: 'hatchback.glb',
        name: 'Blista',
        isCivilianPaintable: true,
        typeKey: 'hatchback'
    },
    {
        srcFile: 'sports.glb',
        destFile: 'coupe.glb',
        name: 'Banshee',
        isCivilianPaintable: true,
        typeKey: 'coupe'
    },
    {
        srcFile: 'suv.glb',
        destFile: 'suv.glb',
        name: 'Patriot',
        isCivilianPaintable: true,
        typeKey: 'suv'
    },
    {
        srcFile: 'pickup.glb',
        destFile: 'pickup.glb',
        name: 'Bobcat',
        isCivilianPaintable: true,
        typeKey: 'pickup'
    },
    {
        srcFile: 'police-van.glb',
        destFile: 'van.glb',
        name: 'Burrito',
        isCivilianPaintable: true,
        skipNodes: ['Lightbar'], // civilian van without lightbar
        typeKey: 'van'
    },
    {
        srcFile: 'boxtruck.glb',
        destFile: 'truck.glb',
        name: 'Mule',
        isCivilianPaintable: true,
        typeKey: 'truck'
    },
    {
        srcFile: 'long-truck.glb',
        destFile: 'semi.glb',
        name: 'Roadtrain',
        isCivilianPaintable: true,
        typeKey: 'semi'
    },
    {
        srcFile: 'citybus.glb',
        destFile: 'bus.glb',
        name: 'Coach',
        isCivilianPaintable: false, // baked transit livery
        typeKey: 'bus'
    },
    {
        srcFile: 'schoolbus.glb',
        destFile: 'schoolbus.glb',
        name: 'School Bus',
        isCivilianPaintable: false, // baked school bus yellow
        typeKey: 'schoolbus'
    },
    {
        srcFile: 'police-cruiser.glb',
        destFile: 'police.glb',
        name: 'Cruiser',
        isCivilianPaintable: false, // baked police cruiser black & white
        typeKey: 'police'
    },
    {
        srcFile: 'police-suv.glb',
        destFile: 'police_suv.glb',
        name: 'Interceptor',
        isCivilianPaintable: false, // baked police SUV black & white
        typeKey: 'police_suv'
    }
];

console.log('Converting 12 downloaded vehicle models into Brow City fleet...');
const manifestData = fs.existsSync(MANIFEST_PATH) ? JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) : { vehicles: {} };
manifestData.vehicles = manifestData.vehicles || {};

const manifestOutputs = {};

for (const cfg of FLEET_CONFIGS) {
    const meta = processVehicle(cfg);
    if (meta) {
        manifestOutputs[cfg.typeKey] = meta;
        manifestData.vehicles[cfg.typeKey] = {
            file: meta.file,
            tris: meta.tris,
            materials: 1,
            dimensions_m: meta.dimensions_m,
            orientation: meta.orientation,
            wheels: meta.wheels,
            features: cfg.name,
            style: 'faceted low-poly vehicle pack'
        };
    }
}

fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifestData, null, 2) + '\n');
console.log('✓ Updated assets/models/gta/manifest.json');
console.log('Vehicle import & conversion completed successfully!');
