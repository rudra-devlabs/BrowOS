    // ===========================================================================
    // ASSETS — optional drop-in pack under assets/models/gta (see manifest.json).
    // The game is fully procedural; every pack entry is a pure visual/audio
    // upgrade. Any missing file silently falls back to the built-in geometry
    // or synth sound, so partial packs are fine.
    // ===========================================================================
    const ASSET_BASE = 'assets/models/gta/';

    const FALLBACK_MANIFEST = {
        vehicles: {
            sedan: 'vehicles/sedan.glb', taxi: 'vehicles/taxi.glb', coupe: 'vehicles/coupe.glb',
            hatchback: 'vehicles/hatchback.glb', compact: 'vehicles/compact.glb', wagon: 'vehicles/wagon.glb',
            muscle: 'vehicles/muscle.glb', minivan: 'vehicles/minivan.glb', offroad: 'vehicles/offroad.glb',
            limo: 'vehicles/limo.glb', garbage: 'vehicles/garbage.glb', towtruck: 'vehicles/towtruck.glb',
            scooter: 'vehicles/scooter.glb',
            suv: 'vehicles/suv.glb', van: 'vehicles/van.glb',
            pickup: 'vehicles/pickup.glb', police: 'vehicles/police.glb', police_suv: 'vehicles/police_suv.glb',
            bus: 'vehicles/bus.glb', schoolbus: 'vehicles/schoolbus.glb', truck: 'vehicles/truck.glb',
            semi: 'vehicles/semi.glb', supercar: 'vehicles/supercar.glb', ambulance: 'vehicles/ambulance.glb',
            firetruck: 'vehicles/firetruck.glb', police_enforcer: 'vehicles/police_enforcer.glb',
            motorcycle: 'vehicles/motorcycle.glb', speedboat: 'vehicles/speedboat.glb',
            armored_truck: 'vehicles/armored_truck.glb',
        },
        characters: {
            player: 'characters/player.glb', ped: 'characters/ped.glb',
            cop: 'characters/cop.glb', swat: 'characters/swat.glb',
            ped_business: 'characters/ped_business.glb', ped_street: 'characters/ped_street.glb',
            ped_female: 'characters/ped_female.glb', ped_worker: 'characters/ped_worker.glb',
            ped_medic: 'characters/ped_medic.glb',
        },
        weapons: {
            bat: 'weapons/bat.glb', shotgun: 'weapons/shotgun.glb',
            smg: 'weapons/smg.glb', rifle: 'weapons/rifle.glb',
        },
        landmarks: {
            empire: 'landmarks/empire.glb', chrysler: 'landmarks/chrysler.glb', flatiron: 'landmarks/flatiron.glb',
            wtc: 'landmarks/wtc.glb', grandcentral: 'landmarks/grandcentral.glb', rockefeller: 'landmarks/rockefeller.glb',
            msg: 'landmarks/msg.glb', un: 'landmarks/un.glb', met: 'landmarks/met.glb',
            guggenheim: 'landmarks/guggenheim.glb', cathedral: 'landmarks/cathedral.glb', hospital: 'landmarks/hospital.glb',
            police: 'landmarks/police.glb', police_hq: 'landmarks/police_hq.glb', villa_land: 'landmarks/villa_land.glb', apollo: 'landmarks/apollo.glb', spray: 'landmarks/spray.glb',
            timesquare: 'landmarks/timesquare.glb',
        },
        props: {
            tree_round: 'props/tree_round.glb', tree_conifer: 'props/tree_conifer.glb',
            lamp: 'props/lamp.glb', hydrant: 'props/hydrant.glb', bin: 'props/bin.glb',
            bull: 'props/bull.glb', statue_liberty: 'props/statue_liberty.glb',
            parking_barrier: 'props/parking_barrier.glb', vendor_cart: 'props/vendor_cart.glb',
            subway_entrance: 'props/subway_entrance.glb', atm: 'props/atm.glb',
            traffic_cone: 'props/traffic_cone.glb',
            water_tower: 'props/water_tower.glb', rooftop_ac_unit: 'props/rooftop_ac_unit.glb',
            fire_escape: 'props/fire_escape.glb',
            mailbox_blue: 'props/mailbox_blue.glb',
        },
        houses: {
            colonial_brick: 'houses/colonial_brick.glb', cottage_stone: 'houses/cottage_stone.glb',
            craftsman_bungalow: 'houses/craftsman_bungalow.glb', duplex_mirror: 'houses/duplex_mirror.glb',
            farmhouse_country: 'houses/farmhouse_country.glb', mansion_suburban: 'houses/mansion_suburban.glb',
            modern_villa: 'houses/modern_villa.glb', ranch_single: 'houses/ranch_single.glb',
            townhouse_brownstone: 'houses/townhouse_brownstone.glb', victorian_queen: 'houses/victorian_queen.glb',
            bungalow_modern: 'houses/bungalow_modern.glb', split_level_ranch: 'houses/split_level_ranch.glb',
            colonial_white: 'houses/colonial_white.glb', tudor_cottage: 'houses/tudor_cottage.glb',
            brick_townhouse_2: 'houses/brick_townhouse_2.glb', cape_cod: 'houses/cape_cod.glb',
            cottage_beach: 'houses/cottage_beach.glb', modern_box: 'houses/modern_box.glb',
        },
        buildings: {
            building_tenement: 'buildings/building_tenement.glb',
            building_castiron: 'buildings/building_castiron.glb',
            building_commercial: 'buildings/building_commercial.glb',
            building_warehouse: 'buildings/building_warehouse.glb',
            tower_artdeco: 'buildings/tower_artdeco.glb',
            tower_glass: 'buildings/tower_glass.glb',
            tower_prewar: 'buildings/tower_prewar.glb',
            tower_setback: 'buildings/tower_setback.glb',
            office_glass_spire: 'buildings/office_glass_spire.glb',
            office_corporate_block: 'buildings/office_corporate_block.glb',
            gov_cityhall: 'buildings/gov_cityhall.glb',
            gov_courthouse: 'buildings/gov_courthouse.glb',
            bank_capital: 'buildings/bank_capital.glb',
            police_precinct: 'buildings/police_precinct.glb',
            fire_station: 'buildings/fire_station.glb',
            hospital: 'buildings/hospital.glb',
            hospital_tower: 'buildings/hospital_tower.glb',
            carpark_multistory: 'buildings/carpark_multistory.glb',
            carpark_garage: 'buildings/carpark_garage.glb',
            library_civic: 'buildings/library_civic.glb',
            theater_cinema: 'buildings/theater_cinema.glb',
            hotel_tower: 'buildings/hotel_tower.glb',
            department_store: 'buildings/department_store.glb',
            school_public: 'buildings/school_public.glb',
            university_hall: 'buildings/university_hall.glb',
            factory_plant: 'buildings/factory_plant.glb',
            transit_station: 'buildings/transit_station.glb',
            data_center: 'buildings/data_center.glb',
            warehouse_modern: 'buildings/warehouse_modern.glb',
        },
        audio: {
            engine_idle: 'audio/gta/engine_idle.ogg', engine_loop: 'audio/gta/engine_loop.ogg',
            siren_loop: 'audio/gta/siren_loop.ogg', horn: 'audio/gta/horn.ogg',
            skid: 'audio/gta/skid.ogg', crash: 'audio/gta/crash.ogg', gunshot: 'audio/gta/gunshot.ogg',
            punch: 'audio/gta/punch.ogg', pickup_cash: 'audio/gta/pickup_cash.ogg',
            pickup_item: 'audio/gta/pickup_item.ogg', splash: 'audio/gta/splash.ogg',
            boom: 'audio/gta/boom.ogg', footstep: 'audio/gta/footstep.ogg',
            scream: 'audio/gta/scream.ogg', spray: 'audio/gta/spray.ogg', bust: 'audio/gta/bust.ogg',
        },
        radio: [
            { title: 'Midtown Cruise', file: 'audio/gta/music/midtown_cruise.wav', thumb: 'audio/gta/music/midtown_cruise.svg' },
            { title: 'Harbor Nights', file: 'audio/gta/music/harbor_nights.wav', thumb: 'audio/gta/music/harbor_nights.svg' },
        ],
    };

    async function loadAssetPack(timeoutMs) {
        const pack = { vehicles: {}, characters: {}, weapons: {}, landmarks: {}, props: {}, houses: {}, buildings: {}, custom: {}, audio: {}, radio: [], manifest: null };
        let manifest;
        try {
            const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs || 4000) : null;
            const res = await fetch(ASSET_BASE + 'manifest.json', ctrl ? { signal: ctrl.signal } : undefined);
            if (timer) clearTimeout(timer);
            if (res && res.ok) manifest = await res.json();
            else manifest = FALLBACK_MANIFEST;
        } catch (e) {
            manifest = FALLBACK_MANIFEST;
        }
        pack.manifest = manifest;
        if (typeof THREE === 'undefined' || !THREE.GLTFLoader) return pack;
        const loader = new THREE.GLTFLoader();
        const loadGlb = (file) => new Promise((resolve) => {
            loader.load(ASSET_BASE + file, resolve, undefined, () => resolve(null));
        });
        const jobs = [];
        for (const group of ['vehicles', 'characters', 'weapons', 'landmarks', 'props', 'houses', 'buildings', 'custom']) {
            for (const key of Object.keys(manifest[group] || {})) {
                const entry = manifest[group][key];
                const file = entry && (entry.file || entry);
                if (typeof file !== 'string' || !/\.glb$/i.test(file)) continue;
                jobs.push(loadGlb(file).then((g) => { if (g) pack[group][key] = g; }));
            }
        }
        for (const key of Object.keys(manifest.audio || {})) {
            let file = manifest.audio[key];
            if (typeof file !== 'string') continue;
            pack.audio[key] = /^audio\//.test(file) ? 'assets/' + file : ASSET_BASE + file;
        }
        // Vehicle-radio playlist: [{title, file}] — same URL convention as audio.
        // Missing/unplayable entries are skipped at play time, so edits here
        // never break the game; no rebuild needed (manifest is fetched live).
        pack.radio = [];
        for (const t of manifest.radio || []) {
            const file = t && (t.file || t.url || t.src);
            if (typeof file !== 'string') continue;
            const name = (t && t.title) || file.split('/').pop().replace(/\.[^.]+$/, '');
            const entry = { title: String(name), url: /^audio\//.test(file) ? 'assets/' + file : ASSET_BASE + file };
            // Optional cover art: explicit "thumb", else the browser guesses a
            // same-name image (track.jpg/.png/.webp/.jpeg) and hides it on 404.
            const tf = t && t.thumb;
            if (typeof tf === 'string' && tf) {
                entry.thumb = /^audio\//.test(tf) ? 'assets/' + tf : (/^https?:\/\//.test(tf) ? tf : ASSET_BASE + tf);
            }
            pack.radio.push(entry);
        }
        await Promise.all(jobs);
        return pack;
    }

    /** Depth-first child lookup by exact name (direct children win first). */
    function glbChildByName(parent, name) {
        if (!parent) return null;
        for (const c of parent.children) if (c.name === name) return c;
        for (const c of parent.children) {
            const r = glbChildByName(c, name);
            if (r) return r;
        }
        return null;
    }

    /**
     * Merge every mesh under `root` into one flat vertex-colored BufferGeometry
     * (position/normal/color), suitable for the shared Lambert material and
     * InstancedMesh pools. `skip(name)` filters nodes out; `relTo` subtracts a
     * pivot node's world position so the result is pivot-local (joint/hub
     * centered) — the convention RigFactory / PedFactory / wheels use.
     */
    function glbMergedGeometry(root, opts) {
        opts = opts || {};
        root.updateMatrixWorld(true);
        const pos = [], nor = [], col = [];
        const v = new THREE.Vector3();
        const nm = new THREE.Matrix3();
        let bx = 0, by = 0, bz = 0;
        if (opts.relTo) {
            opts.relTo.updateMatrixWorld(true);
            v.setFromMatrixPosition(opts.relTo.matrixWorld);
            bx = v.x; by = v.y; bz = v.z;
        }
        root.traverse((o) => {
            if (!(o instanceof THREE.Mesh) && o.isMesh !== true) return;
            if (opts.skip && opts.skip(o.name, o)) return;
            const g = o.geometry;
            const p = g.attributes.position, n = g.attributes.normal, c = g.attributes.color;
            if (!p) return;
            nm.getNormalMatrix(o.matrixWorld);
            const idx = g.index;
            const count = idx ? idx.count : p.count;

            // Check if mesh has authentic non-white vertex colors, or if the exporter emitted dummy [1,1,1] attributes
            let hasRealColors = false;
            if (c) {
                for (let j = 0; j < c.count; j++) {
                    if (c.getX(j) < 0.98 || c.getY(j) < 0.98 || c.getZ(j) < 0.98) {
                        hasRealColors = true;
                        break;
                    }
                }
            }

            for (let i = 0; i < count; i++) {
                const vi = idx ? idx.getX(i) : i;
                v.fromBufferAttribute(p, vi).applyMatrix4(o.matrixWorld);
                const px = v.x - bx, py = v.y - by, pz = v.z - bz;
                pos.push(px, py, pz);
                let nx = 0, ny = 1, nz = 0;
                if (n) {
                    v.fromBufferAttribute(n, vi).applyMatrix3(nm).normalize();
                    nx = v.x; ny = v.y; nz = v.z;
                }
                // Hydrant fix: flip inverted horizontal normals on side nozzle caps
                if (opts.isHydrant && (px * nx + pz * nz < -0.05) && (nx * nx + nz * nz > 0.2)) {
                    nx = -nx; nz = -nz;
                }
                nor.push(nx, ny, nz);

                let cr = 1, cg = 1, cb = 1;
                if (c && hasRealColors) {
                    cr = c.getX(vi); cg = c.getY(vi); cb = c.getZ(vi);
                    if (cr > 1.01 || cg > 1.01 || cb > 1.01) {
                        cr /= 255; cg /= 255; cb /= 255;
                    }
                    if (opts.isVehicleBody) {
                        // Stylized tinted glass for vehicle windows (matches supercar's Stylized_Blue_Glass)
                        if (cb > 0.028 && cb > cg * 1.4 && cr < 0.05) {
                            cr = 0.22; cg = 0.42; cb = 0.53;
                        }
                    }
                } else if (o.material) {
                    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
                    if (mat && mat.color) {
                        cr = mat.color.r; cg = mat.color.g; cb = mat.color.b;
                    }
                    // Authentic signage tones for textured signs/decals on props
                    const mname = (mat && mat.name) || o.name || '';
                    if (/ATM_Display_Text/i.test(mname)) { cr = 0.07; cg = 0.45; cb = 0.35; }
                    else if (/ATM_Header/i.test(mname)) { cr = 0.05; cg = 0.35; cb = 0.75; }
                    else if (/Subway_Sign/i.test(mname)) { cr = 0.08; cg = 0.36; cb = 0.22; }
                    else if (/Hotdog_Sign/i.test(mname)) { cr = 0.90; cg = 0.22; cb = 0.15; }
                    else if (/cedar.*roof/i.test(mname)) { cr = 0.30; cg = 0.16; cb = 0.08; }
                    else if (/cedar/i.test(mname)) { cr = 0.44; cg = 0.26; cb = 0.14; }
                    else if (/iron.*hoop|castiron/i.test(mname)) { cr = 0.10; cg = 0.10; cb = 0.12; }
                    else if (/darksteel|black.*steel/i.test(mname)) { cr = 0.14; cg = 0.15; cb = 0.17; }
                    else if (/galvanized/i.test(mname)) { cr = 0.52; cg = 0.55; cb = 0.58; }
                    else if (/copper/i.test(mname)) { cr = 0.75; cg = 0.38; cb = 0.20; }
                    else if (/amber|warning/i.test(mname)) { cr = 0.90; cg = 0.65; cb = 0.08; }
                    else if (/grate/i.test(mname)) { cr = 0.18; cg = 0.19; cb = 0.21; }
                    else if (/chassis.*dark|louver/i.test(mname)) { cr = 0.12; cg = 0.13; cb = 0.15; }
                }
                if (opts.isVehicleBody) {
                    // Check if this primitive/mesh is vehicle body paint
                    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
                    const matName = (mat && mat.name) || '';
                    const isPaintMat = /clearcoat|pearlescent|body_paint|vehiclepaint/i.test(matName);
                    const isPaintNode = /faceted_body|^chassis$|driver_cab|medical_box|^roof$/i.test(o.name);
                    // For standard vehicles: set body paint vertices to 1.0, 1.0, 1.0 so instanceColor tints them!
                    // For livery vehicles (taxi, police, ambulance, firetruck, bus, schoolbus): keep authored livery colors!
                    if (isPaintMat || isPaintNode) {
                        if (!opts.isLivery) {
                            cr = 1.0; cg = 1.0; cb = 1.0;
                        }
                    }
                } else if (opts.isHydrant) {
                    // Brighten hydrant from dark dull maroon into vibrant safety fire-engine red & chrome
                    if (cr > 0.45 && cg < 0.22 && cb < 0.20) { cr = 0.94; cg = 0.16; cb = 0.12; } // safety red
                    else if (Math.abs(cr - cg) < 0.05 && Math.abs(cg - cb) < 0.05 && cr < 0.45) { cr = 0.88; cg = 0.90; cb = 0.94; } // silver nozzle caps
                    else if (cr > 0.65 && cg > 0.18 && cb < 0.20) { cr = 0.96; cg = 0.74; cb = 0.06; } // brass gold nut
                }
                col.push(cr, cg, cb);
            }
        });
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        return glbFixWinding(geo);
    }

    /**
     * Repair reversed triangle winding: flip any triangle whose geometric
     * normal opposes its vertex normals. The asset pack's exporter emits
     * back-facing triangles hidden behind doubleSided materials; the game's
     * fast single-sided Lambert would cull them (ghost/see-through meshes).
     * Handles indexed and non-indexed geometries, in place.
     */
    function glbFixWinding(geo) {
        const pos = geo.attributes.position, nor = geo.attributes.normal;
        if (!pos || !nor) return geo;
        const idx = geo.index;
        const col = geo.attributes.color;
        const count = idx ? idx.count : pos.count;
        const swapAttr = (attr, i, j) => {
            let t;
            t = attr.getX(i); attr.setX(i, attr.getX(j)); attr.setX(j, t);
            t = attr.getY(i); attr.setY(i, attr.getY(j)); attr.setY(j, t);
            t = attr.getZ(i); attr.setZ(i, attr.getZ(j)); attr.setZ(j, t);
        };
        for (let i = 0; i + 2 < count; i += 3) {
            const a = idx ? idx.getX(i) : i;
            const b = idx ? idx.getX(i + 1) : i + 1;
            const c = idx ? idx.getX(i + 2) : i + 2;
            const e1x = pos.getX(b) - pos.getX(a), e1y = pos.getY(b) - pos.getY(a), e1z = pos.getZ(b) - pos.getZ(a);
            const e2x = pos.getX(c) - pos.getX(a), e2y = pos.getY(c) - pos.getY(a), e2z = pos.getZ(c) - pos.getZ(a);
            const gx = e1y * e2z - e1z * e2y, gy = e1z * e2x - e1x * e2z, gz = e1x * e2y - e1y * e2x;
            const nx = nor.getX(a) + nor.getX(b) + nor.getX(c);
            const ny = nor.getY(a) + nor.getY(b) + nor.getY(c);
            const nz = nor.getZ(a) + nor.getZ(b) + nor.getZ(c);
            if (gx * nx + gy * ny + gz * nz < 0) {
                if (idx) { idx.setX(i + 1, c); idx.setX(i + 2, b); }
                else {
                    swapAttr(pos, b, c); swapAttr(nor, b, c);
                    if (col) swapAttr(col, b, c);
                }
            }
        }
        return geo;
    }

    /** Map of GLB prop file names to the CityBuilder's internal prop kinds. */
    const GLB_PROP_KINDS = {
        tree0: 'tree_round', tree1: 'tree_conifer', lamp: 'lamp',
        hydrant: 'hydrant', bin: 'bin',
        atm: 'atm', vendor_cart: 'vendor_cart',
        subway_entrance: 'subway_entrance', traffic_cone: 'traffic_cone',
        parking_barrier: 'parking_barrier',
        water_tower: 'water_tower', rooftop_ac_unit: 'rooftop_ac_unit',
        fire_escape: 'fire_escape', mailbox_blue: 'mailbox_blue',
    };
