    // ===========================================================================
    // MAP EDITOR & MINECRAFT CREATIVE MODE — F2 or B while playing.
    // Full creative world building:
    // - Carve anything out of anything in the world [K or Carver Tool]
    // - Move, delete, or duplicate anything [G / Del / C]
    // - Universal selection of any object in the world [Click / Aim]
    // - Full 3D model inventory with 163 placeable items [E or Hotbar]
    // - Flawless double-layered world save system (FileSystem + LocalStorage)
    // ===========================================================================
    const MAP_PATH = 'Desktop/gta-map.json';

    class MapEditor {
        /** Every InstancedMesh that opted in, keyed by its edit name. */
        static groups(builder) {
            const out = new Map();
            const meshes = (builder && builder.propMeshes) || [];
            for (let i = 0; i < meshes.length; i++) {
                const ed = meshes[i].userData && meshes[i].userData.edit;
                if (ed) out.set(ed.key, { key: ed.key, spots: ed.spots, write: ed.write, y0: ed.y0, mesh: meshes[i] });
            }
            return out;
        }

        static assign(sp, e) {
            if (e.x !== undefined) sp.x = e.x;
            if (e.z !== undefined) sp.z = e.z;
            if (e.y !== undefined) sp.y = e.y;
            if (e.ry !== undefined) sp.ry = e.ry;
            if (e.s !== undefined) sp.s = e.s;
            if (e.sx !== undefined) { sp.sx = e.sx; sp.sy = e.sy; sp.sz = e.sz; }
            sp.gone = !!e.gone;
        }

        /** Boxes are never spliced out — their index is the patch key. Park it. */
        static kill(c) {
            if (!c) return;
            c.y = -9999;
            c.sx = 0.001;
            c.sy = 0.001;
            c.sz = 0.001;
        }

        static pkey(x, z) {
            return Math.round(x * 20) * 262144 + Math.round(z * 20);
        }

        static apply(builder) {
            const res = { base: builder.colliders.length, added: 0, colKeys: null, instKeys: null, stale: false, count: 0 };
            let doc = null;
            try {
                const raw = localStorage.getItem('gta_world_save');
                if (raw) doc = JSON.parse(raw);
            } catch (_) {}

            const applyDoc = (doc) => {
                if (!doc || (doc.v !== 1 && doc.v !== 2)) return res;
                const cols = builder.colliders;
                res.stale = doc.base && doc.base !== res.base;
                if (doc.cols && !res.stale) {
                    res.colKeys = Object.keys(doc.cols);
                    for (const k of res.colKeys) {
                        const c = cols[+k], e = doc.cols[k];
                        if (!c || !e) continue;
                        c.x = e.x; c.y = e.y; c.z = e.z; c.sx = e.sx; c.sy = e.sy; c.sz = e.sz;
                        res.count++;
                    }
                }
                if (doc.add) {
                    for (const e of doc.add) {
                        cols.push({ x: e.x, y: e.y, z: e.z, sx: e.sx, sy: e.sy, sz: e.sz, tag: e.tag || 'edit' });
                        res.added++; res.count++;
                    }
                }
                if (doc.inst) {
                    const groups = MapEditor.groups(builder);
                    const touched = [];
                    res.instKeys = Object.keys(doc.inst);
                    for (const k of res.instKeys) {
                        const cut = k.lastIndexOf('#');
                        const g = groups.get(k.slice(0, cut));
                        if (!g) continue;
                        const i = +k.slice(cut + 1), sp = g.spots[i];
                        if (!sp) continue;
                        MapEditor.assign(sp, doc.inst[k]);
                        g.write(i);
                        if (touched.indexOf(g) === -1) touched.push(g);
                        res.count++;
                    }
                    for (const g of touched) g.mesh.instanceMatrix.needsUpdate = true;
                }
                return res;
            };

            if (!window.filesystem || typeof window.filesystem.readFile !== 'function') {
                return Promise.resolve(applyDoc(doc));
            }
            return window.filesystem.readFile(MAP_PATH).then((txt) => {
                let fdoc = null;
                try { fdoc = txt ? JSON.parse(txt) : null; } catch (e) { fdoc = null; }
                return applyDoc(fdoc || doc);
            }).catch(() => applyDoc(doc));
        }

        static get CATALOG() {
            if (!MapEditor._CATALOG) {
                const list = [];

                // 1. Creative Tools
                list.push({
                    id: 'tool_carver',
                    name: 'Carver & Chisel',
                    icon: '✂️',
                    desc: 'Carve custom blocks and shapes out of ANY surface in the world [K]',
                    category: 'tools',
                    isTool: true,
                    size: { sx: 2, sy: 2, sz: 2 }
                });
                list.push({
                    id: 'tool_pickaxe',
                    name: 'Diamond Pickaxe',
                    icon: '⛏️',
                    desc: 'Break any custom block or model instantly with LMB',
                    category: 'tools',
                    isTool: true,
                    size: { sx: 2, sy: 2, sz: 2 }
                });

                // 2. Core Minecraft Blocks
                const coreBlocks = [
                    { id: 'brick', name: 'Red Brick', icon: '🧱', desc: 'Solid structural red brick cube', size: { sx: 2, sy: 2, sz: 2 }, color: 0xa34434, tag: 'mc_brick' },
                    { id: 'concrete', name: 'Concrete Block', icon: '🏢', desc: 'Reinforced concrete foundation block', size: { sx: 2, sy: 2, sz: 2 }, color: 0x8c9098, tag: 'mc_concrete' },
                    { id: 'road', name: 'Road Slab', icon: '🛣️', desc: 'Highway road slab with center stripe', size: { sx: 4, sy: 0.35, sz: 4 }, color: 0x272a30, tag: 'mc_road' },
                    { id: 'ramp', name: 'Stunt Launch Ramp', icon: '🛹', desc: 'Mega launch ramp for extreme car jumps (20° slope)', size: { sx: 4, sy: 2.2, sz: 6 }, color: 0xe67e22, tag: 'mc_ramp' },
                    { id: 'barrier', name: 'Jersey Barrier', icon: '🚧', desc: 'Highway safety concrete barricade', size: { sx: 3, sy: 1.0, sz: 0.6 }, color: 0xd2d6dc, tag: 'mc_barrier' },
                    { id: 'glass', name: 'Tinted Glass', icon: '🪟', desc: 'Observation glass block with edge frame', size: { sx: 2, sy: 2, sz: 2 }, color: 0x3a88b5, transparent: true, opacity: 0.45, tag: 'mc_glass' },
                    { id: 'lamp', name: 'Street Lamp Pole', icon: '💡', desc: 'Modern LED streetlight pole with glowing lantern', size: { sx: 0.8, sy: 6.0, sz: 0.8 }, color: 0x374151, tag: 'mc_lamp' },
                    { id: 'tree', name: 'Palm Tree Prop', icon: '🌴', desc: 'Tropical coconut palm tree prop', size: { sx: 1.2, sy: 7.0, sz: 1.2 }, color: 0x5c4033, tag: 'mc_tree' },
                    { id: 'neon', name: 'Neon Glow Cube', icon: '🔮', desc: 'Cyberpunk emissive glowing neon cube', size: { sx: 2, sy: 2, sz: 2 }, color: 0x00e5ff, tag: 'mc_neon' },
                    { id: 'stone', name: 'Smooth Stone', icon: '🏛️', desc: 'Polished architectural stone block', size: { sx: 2, sy: 2, sz: 2 }, color: 0x787c82, tag: 'mc_stone' },
                    { id: 'cobblestone', name: 'Cobblestone', icon: '🪨', desc: 'Textured weathered cobblestone cube', size: { sx: 2, sy: 2, sz: 2 }, color: 0x5a5e65, tag: 'mc_cobble' },
                    { id: 'wood', name: 'Oak Wood Log', icon: '🪵', desc: 'Solid oak timber wood log', size: { sx: 2, sy: 2, sz: 2 }, color: 0x4a2e18, tag: 'mc_wood' },
                    { id: 'planks', name: 'Wood Planks', icon: '🪵', desc: 'Refined carpentry wood planks', size: { sx: 2, sy: 2, sz: 2 }, color: 0xa07844, tag: 'mc_planks' },
                    { id: 'dirt', name: 'Dirt Block', icon: '🟫', desc: 'Organic soil and earth block', size: { sx: 2, sy: 2, sz: 2 }, color: 0x6e4a2d, tag: 'mc_dirt' },
                    { id: 'grass', name: 'Grass Block', icon: '🌱', desc: 'Lush green surface turf block', size: { sx: 2, sy: 2, sz: 2 }, color: 0x438a2e, tag: 'mc_grass' },
                    { id: 'glowstone', name: 'Glowstone', icon: '✨', desc: 'Radiant golden luminous block', size: { sx: 2, sy: 2, sz: 2 }, color: 0xffd54f, tag: 'mc_glowstone' },
                    { id: 'gold', name: 'Gold Block', icon: '🪙', desc: 'Heavy metallic pure gold ingot block', size: { sx: 2, sy: 2, sz: 2 }, color: 0xffc107, tag: 'mc_gold' },
                    { id: 'iron', name: 'Iron Block', icon: '⚙️', desc: 'Refined industrial iron plating cube', size: { sx: 2, sy: 2, sz: 2 }, color: 0xd8d8d8, tag: 'mc_iron' },
                    { id: 'diamond', name: 'Diamond Block', icon: '💎', desc: 'Precious sparkling cyan diamond block', size: { sx: 2, sy: 2, sz: 2 }, color: 0x00e5ff, tag: 'mc_diamond' },
                    { id: 'obsidian', name: 'Obsidian Block', icon: '🖤', desc: 'Blast-proof deep volcanic obsidian block', size: { sx: 2, sy: 2, sz: 2 }, color: 0x1f162e, tag: 'mc_obsidian' },
                    { id: 'tnt', name: 'TNT Explosive', icon: '🧨', desc: 'Volatile high-explosive demolition block', size: { sx: 2, sy: 2, sz: 2 }, color: 0xd32f2f, tag: 'mc_tnt' }
                ];
                coreBlocks.forEach(b => {
                    b.category = 'blocks';
                    list.push(b);
                });

                // 3. Placeable 3D GLB Models from Manifest
                const MODEL_DEFS = {
                    props: [
                        ['tree_round', 'Tree Round', '🌳', { sx: 2.5, sy: 6.0, sz: 2.5 }],
                        ['tree_conifer', 'Tree Conifer', '🌲', { sx: 2.5, sy: 7.0, sz: 2.5 }],
                        ['lamp', 'Street Lamp Prop', '💡', { sx: 1.0, sy: 5.8, sz: 1.0 }],
                        ['hydrant', 'Fire Hydrant', '🚰', { sx: 0.8, sy: 1.2, sz: 0.8 }],
                        ['bin', 'Trash Bin', '🗑️', { sx: 1.0, sy: 1.4, sz: 1.0 }],
                        ['bull', 'Charging Wall St Bull', '🐂', { sx: 2.0, sy: 2.2, sz: 3.5 }],
                        ['statue_liberty', 'Statue of Liberty', '🗽', { sx: 4.0, sy: 12.0, sz: 4.0 }],
                        ['parking_barrier', 'Parking Barrier Gate', '🚧', { sx: 3.0, sy: 1.0, sz: 0.6 }],
                        ['vendor_cart', 'Street Vendor Cart', '🛒', { sx: 2.0, sy: 2.4, sz: 2.5 }],
                        ['subway_entrance', 'Subway Entrance Kiosk', '🚇', { sx: 3.5, sy: 2.8, sz: 5.0 }],
                        ['atm', 'Bank ATM Machine', '🏧', { sx: 1.0, sy: 2.0, sz: 1.0 }],
                        ['traffic_cone', 'Orange Traffic Cone', '⚠️', { sx: 0.6, sy: 1.0, sz: 0.6 }],
                        ['water_tower', 'Rooftop Water Tower', '🗼', { sx: 4.0, sy: 7.0, sz: 4.0 }],
                        ['rooftop_ac_unit', 'Rooftop AC Unit', '❄️', { sx: 2.5, sy: 2.0, sz: 3.0 }],
                        ['fire_escape', 'Fire Escape Ladder', '🪜', { sx: 2.0, sy: 8.0, sz: 1.5 }],
                        ['mailbox_blue', 'Blue Mailbox', '📬', { sx: 0.8, sy: 1.4, sz: 0.8 }]
                    ],
                    houses: [
                        ['colonial_brick', 'Colonial Brick House', '🏡', { sx: 16, sy: 9, sz: 18 }],
                        ['cottage_stone', 'Stone Cottage', '🏡', { sx: 14, sy: 8, sz: 16 }],
                        ['craftsman_bungalow', 'Craftsman Bungalow', '🏡', { sx: 15, sy: 8, sz: 17 }],
                        ['duplex_mirror', 'Duplex Mirror House', '🏡', { sx: 20, sy: 9, sz: 18 }],
                        ['farmhouse_country', 'Country Farmhouse', '🏡', { sx: 18, sy: 10, sz: 18 }],
                        ['mansion_suburban', 'Suburban Mansion', '🏡', { sx: 24, sy: 11, sz: 22 }],
                        ['modern_villa', 'Modern Villa Estate', '🏖️', { sx: 22, sy: 10, sz: 24 }],
                        ['ranch_single', 'Single Ranch House', '🏡', { sx: 18, sy: 7, sz: 16 }],
                        ['townhouse_brownstone', 'Brownstone Townhouse', '🏡', { sx: 12, sy: 14, sz: 18 }],
                        ['victorian_queen', 'Queen Victorian House', '🏡', { sx: 18, sy: 12, sz: 20 }],
                        ['bungalow_modern', 'Modern Bungalow', '🏡', { sx: 16, sy: 8, sz: 18 }],
                        ['split_level_ranch', 'Split Level Ranch', '🏡', { sx: 18, sy: 8, sz: 18 }],
                        ['colonial_white', 'White Colonial House', '🏡', { sx: 16, sy: 9, sz: 18 }],
                        ['tudor_cottage', 'Tudor Cottage', '🏡', { sx: 15, sy: 9, sz: 16 }],
                        ['brick_townhouse_2', 'Brick Townhouse II', '🏡', { sx: 12, sy: 14, sz: 18 }],
                        ['cape_cod', 'Cape Cod House', '🏡', { sx: 15, sy: 8, sz: 16 }],
                        ['cottage_beach', 'Beach Cottage', '🏡', { sx: 14, sy: 8, sz: 15 }],
                        ['modern_box', 'Modern Box Villa', '🏡', { sx: 18, sy: 9, sz: 18 }]
                    ],
                    buildings: [
                        ['building_tenement', 'Tenement Building', '🏢', { sx: 20, sy: 26, sz: 24 }],
                        ['building_castiron', 'Cast Iron Building', '🏢', { sx: 22, sy: 30, sz: 24 }],
                        ['building_commercial', 'Commercial Building', '🏢', { sx: 24, sy: 28, sz: 24 }],
                        ['building_warehouse', 'Industrial Warehouse', '🏭', { sx: 32, sy: 14, sz: 36 }],
                        ['tower_artdeco', 'Art Deco Skyscraper', '🏙️', { sx: 28, sy: 75, sz: 28 }],
                        ['tower_glass', 'Glass Skyscraper', '🏙️', { sx: 26, sy: 80, sz: 26 }],
                        ['tower_prewar', 'Pre-War Skyscraper', '🏙️', { sx: 28, sy: 65, sz: 28 }],
                        ['tower_setback', 'Setback Skyscraper', '🏙️', { sx: 30, sy: 70, sz: 30 }],
                        ['office_glass_spire', 'Glass Spire Tower', '🏙️', { sx: 28, sy: 88, sz: 28 }],
                        ['office_corporate_block', 'Corporate Office Block', '🏢', { sx: 30, sy: 42, sz: 30 }],
                        ['gov_cityhall', 'City Hall', '🏛️', { sx: 36, sy: 28, sz: 32 }],
                        ['gov_courthouse', 'Courthouse', '🏛️', { sx: 34, sy: 24, sz: 30 }],
                        ['bank_capital', 'Capital Bank', '🏦', { sx: 30, sy: 24, sz: 28 }],
                        ['police_precinct', 'Police Precinct', '🚓', { sx: 26, sy: 20, sz: 26 }],
                        ['fire_station', 'Fire Station', '🚒', { sx: 24, sy: 18, sz: 26 }],
                        ['hospital', 'City Hospital', '🏥', { sx: 36, sy: 28, sz: 34 }],
                        ['hospital_tower', 'Hospital Tower', '🏥', { sx: 30, sy: 52, sz: 30 }],
                        ['carpark_multistory', 'Multi-Story Parking Garage', '🅿️', { sx: 34, sy: 20, sz: 34 }],
                        ['carpark_garage', 'City Garage', '🅿️', { sx: 28, sy: 16, sz: 28 }],
                        ['library_civic', 'Civic Library', '📚', { sx: 28, sy: 20, sz: 28 }],
                        ['theater_cinema', 'Cinema & Theater', '🎭', { sx: 28, sy: 22, sz: 30 }],
                        ['hotel_tower', 'Grand Hotel Tower', '🏨', { sx: 28, sy: 65, sz: 28 }],
                        ['department_store', 'Department Store', '🏬', { sx: 30, sy: 22, sz: 30 }],
                        ['school_public', 'Public School', '🏫', { sx: 34, sy: 18, sz: 30 }],
                        ['university_hall', 'University Hall', '🏛️', { sx: 36, sy: 24, sz: 32 }],
                        ['factory_plant', 'Factory Plant', '🏭', { sx: 36, sy: 18, sz: 36 }],
                        ['transit_station', 'Transit Central Station', '🚊', { sx: 34, sy: 18, sz: 34 }],
                        ['data_center', 'Tech Data Center', '💾', { sx: 30, sy: 16, sz: 32 }],
                        ['warehouse_modern', 'Modern Logistics Warehouse', '🏭', { sx: 34, sy: 16, sz: 36 }]
                    ],
                    landmarks: [
                        ['empire', 'Empire State Building', '🏙️', { sx: 40, sy: 140, sz: 40 }],
                        ['chrysler', 'Chrysler Building', '🏙️', { sx: 38, sy: 130, sz: 38 }],
                        ['flatiron', 'Flatiron Building', '🏙️', { sx: 24, sy: 60, sz: 34 }],
                        ['wtc', 'One World Trade Center', '🏙️', { sx: 42, sy: 150, sz: 42 }],
                        ['grandcentral', 'Grand Central Terminal', '🏛️', { sx: 44, sy: 32, sz: 40 }],
                        ['rockefeller', 'Rockefeller Center', '🏙️', { sx: 38, sy: 95, sz: 38 }],
                        ['msg', 'Madison Square Garden', '🏟️', { sx: 50, sy: 26, sz: 50 }],
                        ['un', 'United Nations HQ', '🌐', { sx: 40, sy: 70, sz: 32 }],
                        ['met', 'Metropolitan Museum', '🏛️', { sx: 46, sy: 24, sz: 42 }],
                        ['guggenheim', 'Guggenheim Museum', '🏛️', { sx: 32, sy: 24, sz: 32 }],
                        ['cathedral', 'St. Patrick Cathedral', '⛪', { sx: 34, sy: 50, sz: 44 }],
                        ['hospital', 'Metropolitan Hospital Center', '🏥', { sx: 40, sy: 36, sz: 38 }],
                        ['police', 'Metropolitan Police Dept', '🚓', { sx: 32, sy: 26, sz: 32 }],
                        ['police_hq', 'Police One Plaza HQ', '🚓', { sx: 36, sy: 42, sz: 36 }],
                        ['villa_land', 'Luxury Villa Estate', '🏖️', { sx: 45, sy: 16, sz: 45 }],
                        ['apollo', 'Apollo Theater', '🎭', { sx: 26, sy: 18, sz: 28 }],
                        ['spray', 'Pay N Spray Garage', '🔧', { sx: 22, sy: 12, sz: 24 }],
                        ['timesquare', 'Times Square Megaboard', '✨', { sx: 30, sy: 40, sz: 12 }]
                    ],
                    vehicles: [
                        ['sedan', 'City Sedan', '🚗', { sx: 2.2, sy: 1.6, sz: 4.8 }],
                        ['taxi', 'NYC Yellow Taxi', '🚕', { sx: 2.2, sy: 1.6, sz: 4.8 }],
                        ['coupe', 'Sport Coupe', '🚗', { sx: 2.2, sy: 1.5, sz: 4.6 }],
                        ['suv', 'Executive SUV', '🚙', { sx: 2.4, sy: 1.9, sz: 5.0 }],
                        ['van', 'Cargo Van', '🚐', { sx: 2.4, sy: 2.2, sz: 5.2 }],
                        ['pickup', 'Pickup Truck', '🛻', { sx: 2.4, sy: 2.0, sz: 5.4 }],
                        ['police', 'Police Patrol Cruiser', '🚓', { sx: 2.3, sy: 1.7, sz: 4.9 }],
                        ['bus', 'City Metro Bus', '🚌', { sx: 3.0, sy: 3.4, sz: 11.5 }],
                        ['truck', 'Heavy Duty Box Truck', '🚛', { sx: 2.8, sy: 3.4, sz: 8.5 }],
                        ['hatchback', 'Compact Hatchback', '🚗', { sx: 2.0, sy: 1.5, sz: 4.2 }],
                        ['semi', 'Commercial Semi Tractor', '🚛', { sx: 3.0, sy: 3.8, sz: 8.0 }],
                        ['schoolbus', 'Yellow School Bus', '🚌', { sx: 3.0, sy: 3.4, sz: 10.5 }],
                        ['police_suv', 'Police Interceptor SUV', '🚓', { sx: 2.5, sy: 2.0, sz: 5.2 }],
                        ['supercar', 'Hyper Supercar', '🏎️', { sx: 2.3, sy: 1.3, sz: 4.7 }],
                        ['ambulance', 'EMS Ambulance', '🚑', { sx: 2.6, sy: 2.8, sz: 6.2 }],
                        ['firetruck', 'Fire Rescue Engine', '🚒', { sx: 2.9, sy: 3.6, sz: 9.8 }],
                        ['police_enforcer', 'Police Enforcer Van', '🚓', { sx: 2.6, sy: 2.6, sz: 6.0 }],
                        ['motorcycle', 'Street Motorcycle', '🏍️', { sx: 1.0, sy: 1.4, sz: 2.3 }],
                        ['speedboat', 'Speedboat', '🚤', { sx: 2.6, sy: 1.6, sz: 6.8 }],
                        ['compact', 'City Compact', '🚗', { sx: 2.0, sy: 1.5, sz: 4.0 }],
                        ['wagon', 'Family Station Wagon', '🚗', { sx: 2.2, sy: 1.6, sz: 4.9 }],
                        ['muscle', 'American Muscle V8', '🏎️', { sx: 2.3, sy: 1.5, sz: 4.9 }],
                        ['minivan', 'Family Minivan', '🚐', { sx: 2.3, sy: 1.8, sz: 5.0 }],
                        ['offroad', '4x4 Offroad Truck', '🚙', { sx: 2.4, sy: 2.1, sz: 5.0 }],
                        ['limo', 'Stretch Limousine', '🚗', { sx: 2.3, sy: 1.7, sz: 8.5 }],
                        ['scooter', 'City Moped Scooter', '🛵', { sx: 0.9, sy: 1.3, sz: 1.9 }],
                        ['garbage', 'Sanitation Garbage Truck', '🚛', { sx: 3.0, sy: 3.6, sz: 9.0 }],
                        ['towtruck', 'Heavy Tow Truck', '🚛', { sx: 2.8, sy: 3.2, sz: 8.0 }],
                        ['custom_vehicle', 'Custom Tuner Car', '🏎️', { sx: 2.3, sy: 1.4, sz: 4.8 }],
                        ['luxury_sedan', 'Luxury Flagship Sedan', '🚗', { sx: 2.3, sy: 1.6, sz: 5.1 }],
                        ['luxury_limo', 'Presidential Limousine', '🚗', { sx: 2.4, sy: 1.8, sz: 8.8 }],
                        ['supercar_hyper', 'Koenigsegg Hypercar', '🏎️', { sx: 2.3, sy: 1.25, sz: 4.7 }],
                        ['supercar_track', 'GT Track Racer', '🏎️', { sx: 2.3, sy: 1.25, sz: 4.8 }],
                        ['police_cruiser', 'Highway Pursuit Cruiser', '🚓', { sx: 2.3, sy: 1.7, sz: 5.0 }],
                        ['garbage_truck', 'Industrial Waste Hauler', '🚛', { sx: 3.0, sy: 3.6, sz: 9.2 }],
                        ['bus_city', 'City Transit Low-Floor Bus', '🚌', { sx: 3.0, sy: 3.3, sz: 12.0 }],
                        ['bus_coach', 'Touring Coach Bus', '🚌', { sx: 3.1, sy: 3.6, sz: 12.5 }],
                        ['truck_box', 'Commercial Delivery Truck', '🚛', { sx: 2.8, sy: 3.4, sz: 8.2 }],
                        ['truck_semi', 'Heavy Hauler Semi Truck', '🚛', { sx: 3.0, sy: 3.8, sz: 8.2 }],
                        ['bike_sport', 'Sportbike 1000cc', '🏍️', { sx: 0.9, sy: 1.3, sz: 2.2 }],
                        ['bike_cruiser', 'Chopper Cruiser Bike', '🏍️', { sx: 1.0, sy: 1.3, sz: 2.4 }],
                        ['bike_dirt', 'Dirt Motocross Bike', '🏍️', { sx: 0.9, sy: 1.4, sz: 2.2 }],
                        ['boat_speedboat', 'Twin-Engine Speedboat', '🚤', { sx: 2.6, sy: 1.6, sz: 7.2 }],
                        ['boat_police', 'Police Harbor Patrol Boat', '🚤', { sx: 2.8, sy: 2.0, sz: 8.0 }],
                        ['boat_yacht', 'Luxury Ocean Yacht', '🛥️', { sx: 4.5, sy: 4.0, sz: 14.0 }],
                        ['armored_truck', 'Bank Armored Security Truck', '🛡️', { sx: 2.8, sy: 3.0, sz: 7.0 }]
                    ],
                    characters: [
                        ['player', 'Protagonist (Player)', '🧍', { sx: 0.8, sy: 1.9, sz: 0.8 }],
                        ['ped', 'Civilian Pedestrian', '🧍', { sx: 0.8, sy: 1.85, sz: 0.8 }],
                        ['cop', 'NYPD Police Officer', '👮', { sx: 0.8, sy: 1.9, sz: 0.8 }],
                        ['swat', 'Tactical SWAT Operative', '👮', { sx: 0.9, sy: 1.95, sz: 0.9 }],
                        ['ped_business', 'Wall Street Executive', '🤵', { sx: 0.8, sy: 1.9, sz: 0.8 }],
                        ['ped_street', 'Street Style Civilian', '🧍', { sx: 0.8, sy: 1.85, sz: 0.8 }],
                        ['ped_female', 'Female Pedestrian', '👩', { sx: 0.8, sy: 1.8, sz: 0.8 }],
                        ['ped_worker', 'Construction Worker', '👷', { sx: 0.8, sy: 1.9, sz: 0.8 }],
                        ['ped_medic', 'Paramedic First Responder', '🧑‍⚕️', { sx: 0.8, sy: 1.85, sz: 0.8 }]
                    ],
                    weapons: [
                        ['bat', 'Baseball Bat', '🏏', { sx: 0.3, sy: 1.0, sz: 0.3 }],
                        ['shotgun', 'Tactical Shotgun', '🔫', { sx: 0.3, sy: 0.5, sz: 1.1 }],
                        ['smg', 'Compact SMG', '🔫', { sx: 0.3, sy: 0.4, sz: 0.8 }],
                        ['rifle', 'Assault Rifle', '🔫', { sx: 0.3, sy: 0.5, sz: 1.2 }]
                    ]
                };

                for (const [cat, entries] of Object.entries(MODEL_DEFS)) {
                    entries.forEach(([key, name, icon, size]) => {
                        list.push({
                            id: 'm_' + cat + '_' + key,
                            name,
                            icon,
                            desc: `3D ${cat.slice(0, -1)} asset (${key})`,
                            category: cat,
                            isModel: true,
                            modelCategory: cat,
                            modelKey: key,
                            size: size || { sx: 3, sy: 2, sz: 3 },
                            tag: 'mc_model_' + cat + '_' + key
                        });
                    });
                }

                MapEditor._CATALOG = list;
            }
            return MapEditor._CATALOG;
        }

        static get MINECRAFT_BLOCKS() {
            if (!MapEditor._MINECRAFT_BLOCKS) {
                const defaultIds = [
                    'tool_carver',
                    'brick',
                    'concrete',
                    'road',
                    'ramp',
                    'glass',
                    'lamp',
                    'm_houses_modern_villa',
                    'm_vehicles_supercar'
                ];
                MapEditor._MINECRAFT_BLOCKS = defaultIds.map(id => MapEditor.CATALOG.find(b => b.id === id) || MapEditor.CATALOG[0]);
            }
            return MapEditor._MINECRAFT_BLOCKS;
        }

        static createRampGeometry(w = 4, h = 2.2, d = 6) {
            const hw = w / 2, hh = h / 2, hd = d / 2;
            const positions = [
                -hw, -hh, -hd,   hw, -hh, -hd,   hw, -hh,  hd,
                -hw, -hh, -hd,   hw, -hh,  hd,  -hw, -hh,  hd,
                -hw, -hh,  hd,   hw, -hh,  hd,   hw,  hh,  hd,
                -hw, -hh,  hd,   hw,  hh,  hd,  -hw,  hh,  hd,
                -hw, -hh, -hd,  -hw,  hh,  hd,   hw,  hh,  hd,
                -hw, -hh, -hd,   hw,  hh,  hd,   hw, -hh, -hd,
                -hw, -hh, -hd,  -hw, -hh,  hd,  -hw,  hh,  hd,
                 hw, -hh, -hd,   hw,  hh,  hd,   hw, -hh,  hd
            ];
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geo.computeVertexNormals();
            return geo;
        }

        static createCarvedBlockMesh(color, size = 2.0) {
            const group = new THREE.Group();
            const geo = new THREE.BoxGeometry(size, size, size);
            const mat = new THREE.MeshStandardMaterial({
                color: color || 0x8c9098,
                roughness: 0.85,
                metalness: 0.15
            });
            const m = new THREE.Mesh(geo, mat);
            group.add(m);

            const edgeGeo = new THREE.EdgesGeometry(geo);
            const edgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 });
            group.add(new THREE.LineSegments(edgeGeo, edgeMat));
            return group;
        }

        static createBlockMesh(blockDef, isGhost = false, passedAssets = null) {
            const group = new THREE.Group();
            if (!blockDef) return group;

            const assets = passedAssets || MapEditor._lastAssets || (typeof window !== 'undefined' && window.game && window.game.assets);

            if (blockDef.isModel) {
                const cat = blockDef.modelCategory;
                const key = blockDef.modelKey;
                let gltf = assets && assets[cat] && assets[cat][key];

                if (gltf && gltf.scene) {
                    const cloned = gltf.scene.clone(true);
                    const bbox = new THREE.Box3().setFromObject(cloned);
                    const center = new THREE.Vector3();
                    bbox.getCenter(center);
                    const sz = new THREE.Vector3();
                    bbox.getSize(sz);

                    cloned.position.x = -center.x;
                    cloned.position.y = -bbox.min.y;
                    cloned.position.z = -center.z;

                    if (isGhost) {
                        const ghostMat = new THREE.MeshStandardMaterial({
                            color: 0x00ffff,
                            transparent: true,
                            opacity: 0.45,
                            roughness: 0.2,
                            metalness: 0.8,
                            emissive: 0x0088aa,
                            emissiveIntensity: 0.5,
                            depthWrite: false
                        });
                        cloned.traverse(child => {
                            if (child.isMesh) child.material = ghostMat;
                        });
                        const boundGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(Math.max(0.5, sz.x), Math.max(0.5, sz.y), Math.max(0.5, sz.z)));
                        const boundMat = new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.85 });
                        const wireBox = new THREE.LineSegments(boundGeo, boundMat);
                        wireBox.position.y = sz.y / 2;
                        group.add(wireBox);
                    } else {
                        cloned.traverse(child => {
                            if (child.isMesh) {
                                child.castShadow = true;
                                child.receiveShadow = true;
                            }
                        });
                    }
                    group.add(cloned);
                    return group;
                } else {
                    const sx = (blockDef.size && blockDef.size.sx) || 3;
                    const sy = (blockDef.size && blockDef.size.sy) || 2;
                    const sz = (blockDef.size && blockDef.size.sz) || 4;
                    const geo = new THREE.BoxGeometry(sx, sy, sz);
                    const mat = new THREE.MeshStandardMaterial({
                        color: isGhost ? 0x00ffff : 0x4a90e2,
                        transparent: isGhost,
                        opacity: isGhost ? 0.45 : 1.0,
                        wireframe: isGhost
                    });
                    const m = new THREE.Mesh(geo, mat);
                    m.position.y = sy / 2;
                    group.add(m);
                    return group;
                }
            }

            if (blockDef.id === 'tool_carver') {
                const chiselGeo = new THREE.CylinderGeometry(0.05, 0.4, 1.8, 6);
                const chiselMat = new THREE.MeshStandardMaterial({
                    color: isGhost ? 0x00f0ff : 0xe67e22,
                    emissive: isGhost ? 0x0088aa : 0x331100,
                    emissiveIntensity: 0.5,
                    transparent: isGhost,
                    opacity: isGhost ? 0.55 : 1.0
                });
                const chisel = new THREE.Mesh(chiselGeo, chiselMat);
                chisel.rotation.z = Math.PI / 4;
                group.add(chisel);
                return group;
            }

            const op = isGhost ? 0.55 : (blockDef.transparent ? blockDef.opacity || 0.5 : 1.0);
            const trans = isGhost || !!blockDef.transparent;

            const mkMat = (color, rough = 0.7, metal = 0.1, emissive = 0x000000, emissiveInt = 0) => {
                return new THREE.MeshStandardMaterial({
                    color: isGhost ? 0x55ffcc : color,
                    roughness: rough,
                    metalness: metal,
                    transparent: trans,
                    opacity: op,
                    depthWrite: !isGhost,
                    emissive: isGhost ? 0x008866 : emissive,
                    emissiveIntensity: isGhost ? 0.35 : emissiveInt
                });
            };

            switch (blockDef.id) {
                case 'brick': {
                    const geo = new THREE.BoxGeometry(2, 2, 2);
                    const mat = mkMat(blockDef.color || 0xa34434, 0.85, 0.05);
                    group.add(new THREE.Mesh(geo, mat));
                    break;
                }
                case 'concrete':
                case 'stone':
                case 'cobblestone':
                case 'wood':
                case 'planks':
                case 'dirt':
                case 'gold':
                case 'iron':
                case 'obsidian': {
                    const geo = new THREE.BoxGeometry(2, 2, 2);
                    const metalness = (blockDef.id === 'gold' || blockDef.id === 'iron') ? 0.85 : 0.1;
                    const roughness = (blockDef.id === 'gold' || blockDef.id === 'iron') ? 0.25 : 0.8;
                    const mat = mkMat(blockDef.color || 0x8c9098, roughness, metalness);
                    group.add(new THREE.Mesh(geo, mat));
                    break;
                }
                case 'grass': {
                    const geo = new THREE.BoxGeometry(2, 2, 2);
                    const topMat = mkMat(0x438a2e, 0.8, 0.1);
                    const sideMat = mkMat(0x6e4a2d, 0.9, 0.05);
                    const mats = [sideMat, sideMat, topMat, sideMat, sideMat, sideMat];
                    group.add(new THREE.Mesh(geo, mats));
                    break;
                }
                case 'diamond':
                case 'neon': {
                    const geo = new THREE.BoxGeometry(2, 2, 2);
                    const col = blockDef.color || 0x00e5ff;
                    const mat = mkMat(col, 0.1, 0.2, col, isGhost ? 0.6 : 2.0);
                    group.add(new THREE.Mesh(geo, mat));
                    const edgeGeo = new THREE.EdgesGeometry(geo);
                    const edgeMat = new THREE.LineBasicMaterial({ color: 0x80d8ff });
                    group.add(new THREE.LineSegments(edgeGeo, edgeMat));
                    break;
                }
                case 'glowstone': {
                    const geo = new THREE.BoxGeometry(2, 2, 2);
                    const mat = mkMat(0xffd54f, 0.3, 0.1, 0xffaa00, isGhost ? 0.6 : 2.2);
                    group.add(new THREE.Mesh(geo, mat));
                    break;
                }
                case 'tnt': {
                    const geo = new THREE.BoxGeometry(2, 2, 2);
                    const baseMat = mkMat(0xd32f2f, 0.7, 0.1);
                    group.add(new THREE.Mesh(geo, baseMat));
                    const bandGeo = new THREE.BoxGeometry(2.02, 0.6, 2.02);
                    const bandMat = mkMat(0xffffff, 0.5, 0.1);
                    group.add(new THREE.Mesh(bandGeo, bandMat));
                    break;
                }
                case 'road': {
                    const baseGeo = new THREE.BoxGeometry(4, 0.35, 4);
                    const baseMat = mkMat(0x272a30, 0.8, 0.1);
                    group.add(new THREE.Mesh(baseGeo, baseMat));
                    const stripeGeo = new THREE.BoxGeometry(0.3, 0.03, 3.4);
                    const stripeMat = mkMat(0xffcc00, 0.5, 0.1, 0x554400, 0.3);
                    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
                    stripe.position.y = 0.18;
                    group.add(stripe);
                    break;
                }
                case 'ramp': {
                    const rampGeo = MapEditor.createRampGeometry(4, 2.2, 6);
                    const rampMat = mkMat(0xe67e22, 0.5, 0.2);
                    group.add(new THREE.Mesh(rampGeo, rampMat));
                    const stripeGeo = new THREE.BoxGeometry(0.35, 0.05, 5.0);
                    const stripeMat = mkMat(0xffe600, 0.4, 0.1, 0x443300, 0.4);
                    const s1 = new THREE.Mesh(stripeGeo, stripeMat);
                    s1.position.set(-1.7, 0.05, 0);
                    s1.rotation.x = Math.atan2(2.2, 6);
                    group.add(s1);
                    const s2 = new THREE.Mesh(stripeGeo, stripeMat);
                    s2.position.set(1.7, 0.05, 0);
                    s2.rotation.x = Math.atan2(2.2, 6);
                    group.add(s2);
                    break;
                }
                case 'barrier': {
                    const baseGeo = new THREE.BoxGeometry(3.0, 0.4, 0.6);
                    const topGeo = new THREE.BoxGeometry(2.95, 0.6, 0.36);
                    const barMat = mkMat(0xd2d6dc, 0.7, 0.1);
                    const bBase = new THREE.Mesh(baseGeo, barMat);
                    bBase.position.y = -0.3;
                    group.add(bBase);
                    const bTop = new THREE.Mesh(topGeo, barMat);
                    bTop.position.y = 0.2;
                    group.add(bTop);
                    break;
                }
                case 'glass': {
                    const geo = new THREE.BoxGeometry(2, 2, 2);
                    const mat = mkMat(0x3a88b5, 0.1, 0.85);
                    mat.transparent = true;
                    mat.opacity = isGhost ? 0.4 : 0.45;
                    group.add(new THREE.Mesh(geo, mat));
                    const edgeGeo = new THREE.EdgesGeometry(geo);
                    const edgeMat = new THREE.LineBasicMaterial({ color: 0x64b5f6, transparent: true, opacity: 0.7 });
                    group.add(new THREE.LineSegments(edgeGeo, edgeMat));
                    break;
                }
                case 'lamp': {
                    const poleGeo = new THREE.CylinderGeometry(0.08, 0.1, 5.8, 8);
                    const poleMat = mkMat(0x374151, 0.4, 0.6);
                    group.add(new THREE.Mesh(poleGeo, poleMat));
                    const armGeo = new THREE.BoxGeometry(0.08, 0.08, 1.4);
                    const arm = new THREE.Mesh(armGeo, poleMat);
                    arm.position.set(0, 2.9, 0.6);
                    group.add(arm);
                    const fixGeo = new THREE.BoxGeometry(0.28, 0.1, 0.5);
                    const fix = new THREE.Mesh(fixGeo, poleMat);
                    fix.position.set(0, 2.85, 1.2);
                    group.add(fix);
                    const ledGeo = new THREE.BoxGeometry(0.22, 0.04, 0.44);
                    const ledMat = mkMat(0xffffff, 0.2, 0.1, 0xfff3cc, isGhost ? 0.5 : 2.5);
                    const led = new THREE.Mesh(ledGeo, ledMat);
                    led.position.set(0, 2.78, 1.2);
                    group.add(led);
                    break;
                }
                case 'tree': {
                    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.32, 6.2, 7);
                    const trunkMat = mkMat(0x5c4033, 0.9, 0.05);
                    group.add(new THREE.Mesh(trunkGeo, trunkMat));
                    const frondGeo = new THREE.BoxGeometry(0.4, 0.04, 2.2);
                    const frondMat = mkMat(0x2e7d32, 0.8, 0.1);
                    for (let f = 0; f < 6; f++) {
                        const frond = new THREE.Mesh(frondGeo, frondMat);
                        frond.position.set(0, 3.1, 0);
                        frond.rotation.y = (f * Math.PI) / 3;
                        frond.rotation.x = 0.45;
                        frond.position.x += Math.sin((f * Math.PI) / 3) * 0.9;
                        frond.position.z += Math.cos((f * Math.PI) / 3) * 0.9;
                        group.add(frond);
                    }
                    break;
                }
                default: {
                    const sx = (blockDef.size && blockDef.size.sx) || 2;
                    const sy = (blockDef.size && blockDef.size.sy) || 2;
                    const sz = (blockDef.size && blockDef.size.sz) || 2;
                    const geo = new THREE.BoxGeometry(sx, sy, sz);
                    const mat = mkMat(blockDef.color || 0x8c9098, 0.7, 0.1);
                    group.add(new THREE.Mesh(geo, mat));
                    break;
                }
            }

            if (isGhost && blockDef.size) {
                const boundGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(blockDef.size.sx, blockDef.size.sy, blockDef.size.sz));
                const boundMat = new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.85 });
                group.add(new THREE.LineSegments(boundGeo, boundMat));
            }

            return group;
        }

        static disposeHierarchy(obj) {
            if (!obj) return;
            obj.traverse(child => {
                if (child.geometry) {
                    try { child.geometry.dispose(); } catch (_) {}
                }
                if (child.material) {
                    try {
                        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                        else child.material.dispose();
                    } catch (_) {}
                }
            });
        }

        static initCustomBlocks(game) {
            if (!game.scene) return;
            MapEditor._lastAssets = game.assets;
            if (!game._customBlocksGroup) {
                game._customBlocksGroup = new THREE.Group();
                game._customBlocksGroup.name = 'MinecraftCustomBlocks';
                game.scene.add(game._customBlocksGroup);
            }
            MapEditor.customBlocks = [];

            let saved = null;
            try {
                const rawWorld = localStorage.getItem('gta_world_save');
                if (rawWorld) {
                    const parsed = JSON.parse(rawWorld);
                    if (parsed && parsed.mc_blocks) saved = parsed.mc_blocks;
                }
                if (!saved) {
                    const raw = localStorage.getItem('gta_mc_blocks');
                    if (raw) saved = JSON.parse(raw);
                }
            } catch (_) {}

            if (window.filesystem && typeof window.filesystem.readFile === 'function') {
                window.filesystem.readFile(MAP_PATH).then(txt => {
                    try {
                        const doc = txt ? JSON.parse(txt) : null;
                        if (doc && doc.mc_blocks && doc.mc_blocks.length > 0) {
                            MapEditor._spawnLoadedBlocks(game, doc.mc_blocks);
                            return;
                        }
                    } catch (_) {}
                    if (saved && Array.isArray(saved) && saved.length > 0) {
                        MapEditor._spawnLoadedBlocks(game, saved);
                    }
                }).catch(() => {
                    if (saved && Array.isArray(saved) && saved.length > 0) {
                        MapEditor._spawnLoadedBlocks(game, saved);
                    }
                });
            } else if (saved && Array.isArray(saved) && saved.length > 0) {
                MapEditor._spawnLoadedBlocks(game, saved);
            }
        }

        static _spawnLoadedBlocks(game, list) {
            if (!list || !Array.isArray(list)) return;
            let count = 0;
            for (const b of list) {
                let blockDef = MapEditor.CATALOG.find(def => def.id === b.type) || MapEditor.MINECRAFT_BLOCKS.find(def => def.id === b.type);
                if (!blockDef && b.modelCategory && b.modelKey) {
                    blockDef = {
                        id: b.type,
                        name: b.modelKey,
                        isModel: true,
                        modelCategory: b.modelCategory,
                        modelKey: b.modelKey,
                        size: { sx: 4, sy: 3, sz: 4 },
                        tag: 'mc_model_' + b.modelCategory + '_' + b.modelKey
                    };
                }

                let mesh;
                if (b.isCarved) {
                    mesh = MapEditor.createCarvedBlockMesh(b.color || 0x8c9098, 2.0);
                } else if (blockDef && blockDef.isModel) {
                    mesh = MapEditor.createBlockMesh(blockDef, false, game.assets);
                } else if (blockDef) {
                    mesh = MapEditor.createBlockMesh(blockDef, false);
                } else {
                    mesh = MapEditor.createCarvedBlockMesh(b.color || 0x8c9098, 2.0);
                }

                mesh.position.set(b.x, b.y, b.z);
                mesh.rotation.y = b.yaw || 0;
                mesh.userData = {
                    mcBlockId: b.id,
                    blockType: b.type,
                    isCarved: !!b.isCarved,
                    isModel: !!(blockDef && blockDef.isModel),
                    modelCategory: b.modelCategory || (blockDef && blockDef.modelCategory),
                    modelKey: b.modelKey || (blockDef && blockDef.modelKey),
                    customColor: b.color
                };
                game._customBlocksGroup.add(mesh);

                const bbox = new THREE.Box3().setFromObject(mesh);
                const sx = Math.max(0.6, bbox.max.x - bbox.min.x);
                const sy = Math.max(0.6, bbox.max.y - bbox.min.y);
                const sz = Math.max(0.6, bbox.max.z - bbox.min.z);
                const cy = (bbox.max.y + bbox.min.y) / 2;

                const col = {
                    x: b.x,
                    y: (blockDef && blockDef.size) ? b.y : cy,
                    z: b.z,
                    sx: (blockDef && blockDef.size) ? blockDef.size.sx : sx,
                    sy: (blockDef && blockDef.size) ? blockDef.size.sy : sy,
                    sz: (blockDef && blockDef.size) ? blockDef.size.sz : sz,
                    yaw: b.yaw || 0,
                    tag: b.isCarved ? 'mc_carved' : (blockDef ? blockDef.tag : 'mc_block'),
                    mcBlockId: b.id
                };
                mesh.userData.col = col;
                game.physics.colliders.push(col);

                MapEditor.customBlocks.push({
                    id: b.id,
                    type: b.type,
                    x: b.x,
                    y: b.y,
                    z: b.z,
                    yaw: b.yaw || 0,
                    color: b.color,
                    isCarved: !!b.isCarved,
                    isModel: !!(blockDef && blockDef.isModel),
                    modelCategory: b.modelCategory || (blockDef && blockDef.modelCategory),
                    modelKey: b.modelKey || (blockDef && blockDef.modelKey),
                    mesh,
                    col
                });
                count++;
            }
            if (count > 0) {
                game.physics.rebuild();
                console.log(`[BrowCity Minecraft] Loaded ${count} custom built and carved objects into world.`);
            }
        }

        static saveWorld(game, editorInstance) {
            const r = (v, p = 100) => Math.round(v * p) / p;

            const mc_blocks = (MapEditor.customBlocks || []).map(b => ({
                id: b.id,
                type: b.type,
                x: r(b.x),
                y: r(b.y),
                z: r(b.z),
                yaw: r(b.yaw || 0, 1000),
                color: b.color || null,
                isCarved: !!b.isCarved,
                isModel: !!b.isModel,
                modelCategory: b.modelCategory || null,
                modelKey: b.modelKey || null
            }));

            let patch = { cols: {}, add: [], inst: {}, deletedScene: MapEditor.deletedScene || [] };
            let base = (game.physics && game.physics.colliders) ? game.physics.colliders.length : 0;

            if (editorInstance) {
                base = editorInstance.base;
                for (const i of editorInstance.dirtyCols) {
                    if (i >= editorInstance.base) continue;
                    const c = editorInstance.cols[i];
                    if (!c) continue;
                    patch.cols[i] = { x: r(c.x), y: r(c.y), z: r(c.z), sx: r(c.sx), sy: r(c.sy), sz: r(c.sz) };
                }
                for (let k = 0; k < editorInstance.added.length; k++) {
                    const c = editorInstance.cols[editorInstance.added[k]];
                    if (!c || c.sx <= 0.002) continue;
                    patch.add.push({ x: r(c.x), y: r(c.y), z: r(c.z), sx: r(c.sx), sy: r(c.sy), sz: r(c.sz), tag: c.tag || 'edit' });
                }
                for (const key of editorInstance.dirtyInst) {
                    const cut = key.lastIndexOf('#');
                    const g = editorInstance.groups.get(key.slice(0, cut));
                    const sp = g && g.spots[+key.slice(cut + 1)];
                    if (!sp) continue;
                    const e = { x: r(sp.x), z: r(sp.z) };
                    if (sp.y !== undefined) e.y = r(sp.y);
                    if (sp.ry !== undefined) e.ry = r(sp.ry, 10000);
                    if (sp.s !== undefined) e.s = r(sp.s, 1000);
                    if (sp.sx !== undefined) { e.sx = r(sp.sx, 1000); e.sy = r(sp.sy, 1000); e.sz = r(sp.sz, 1000); }
                    if (sp.gone) e.gone = 1;
                    patch.inst[key] = e;
                }
            } else {
                try {
                    const existing = localStorage.getItem('gta_map_patch');
                    if (existing) patch = JSON.parse(existing);
                } catch (_) {}
            }

            const doc = {
                v: 2,
                base: base,
                savedAt: new Date().toISOString(),
                mc_blocks: mc_blocks,
                cols: patch.cols || {},
                add: patch.add || [],
                inst: patch.inst || {},
                deletedScene: patch.deletedScene || []
            };

            try {
                localStorage.setItem('gta_world_save', JSON.stringify(doc));
                localStorage.setItem('gta_mc_blocks', JSON.stringify(mc_blocks));
                localStorage.setItem('gta_map_patch', JSON.stringify(patch));
            } catch (e) {
                console.warn('[MapEditor] LocalStorage write warn:', e);
            }

            if (window.filesystem && typeof window.filesystem.createFile === 'function') {
                window.filesystem.createFile(MAP_PATH, JSON.stringify(doc, null, 1)).then(() => {
                    if (game.hud) game.hud.toast(`💾 World Saved (${mc_blocks.length} blocks & edits)`, '#34c759');
                    if (editorInstance) { editorInstance._flash('World saved'); editorInstance._sync(); }
                }).catch(() => {
                    if (game.hud) game.hud.toast('Saved to LocalStorage', '#ffd23f');
                });
            } else {
                if (game.hud) game.hud.toast(`💾 World Saved (${mc_blocks.length} items)`, '#34c759');
                if (editorInstance) { editorInstance._flash('Saved to storage'); editorInstance._sync(); }
            }
        }

        static saveCustomBlocks(game) {
            MapEditor.saveWorld(game, null);
        }

        static _box(arr, o, c) {
            const x0 = c.x - c.sx / 2, x1 = c.x + c.sx / 2;
            const y0 = c.y - c.sy / 2, y1 = c.y + c.sy / 2;
            const z0 = c.z - c.sz / 2, z1 = c.z + c.sz / 2;
            const E = MapEditor.EDGES;
            for (let e = 0; e < 24; e++) {
                const id = E[e];
                arr[o++] = (id & 1) ? x1 : x0;
                arr[o++] = (id & 2) ? y1 : y0;
                arr[o++] = (id & 4) ? z1 : z0;
            }
            return o;
        }

        constructor(game) {
            this.game = game;
            MapEditor._lastAssets = game.assets;
            this.on = false;
            this.cols = game.physics.colliders;
            const p = game.mapPatch || null;
            this.base = p ? p.base : this.cols.length;
            this.groups = MapEditor.groups(game.builder);
            this.dirtyCols = new Set();
            this.dirtyInst = new Set();
            this.added = [];
            if (p) {
                if (p.colKeys) for (const k of p.colKeys) this.dirtyCols.add(+k);
                if (p.instKeys) for (const k of p.instKeys) this.dirtyInst.add(k);
                for (let i = 0; i < p.added; i++) this.added.push(this.base + i);
            }
            this.sel = null;
            this.step = 0.5;
            this.undo = [];
            this.msg = '';
            this.byPos = null;
            this.cam = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
            this.wire = null; this.selWire = null; this.wirePos = null; this.selPos = null;
            this.wireMax = 600; this.wireOn = true; this.wireCd = 0;
            this.physDirty = false; this.physCd = 0;
            this.hoverCd = 0;
            this.panel = null; this.info = null;
            this.crosshair = null;
            this._q = [];
            this._v = new THREE.Vector3();
            this._rc = null;
            this._camRc = null;

            this.grabbing = false;
            this.grabDist = 12;
            this.grabHeightOffset = 0;
            this.grabOrigin = null;
            this.colOffset = null;
            this.mouseNDC = null;
            this.lastMouse = null;

            this.selectedSlot = 0;
            this.selectedYaw = 0;
            this.creativeFlight = true;
            this.hotbarPage = 0;
            this.hotbarSlots = [];
            this._initHotbarSlots();

            this._ghostMesh = null;
            this._ghostPos = new THREE.Vector3();
            this._hotbarEl = null;
            this._hotbarLabelEl = null;
            this._slotEls = [];
            this._mcHudEl = null;
            this._flightBadgeEl = null;
            this._activeParticles = [];
            this._customRaycaster = new THREE.Raycaster();
            this._audioCtx = null;

            this.invOpen = false;
            this._invModalEl = null;
            this._invSearchInput = null;
            this._invGrid = null;
            this._invCountLabel = null;
            this._categoryTabBtns = [];
        }

        _initHotbarSlots() {
            const defaultIds = [
                'tool_carver',
                'brick',
                'concrete',
                'road',
                'ramp',
                'glass',
                'lamp',
                'm_houses_modern_villa',
                'm_vehicles_supercar'
            ];
            this.hotbarSlots = defaultIds.map(id => MapEditor.CATALOG.find(b => b.id === id) || MapEditor.CATALOG[0]);
        }

        toggle() {
            this.on = !this.on;
            const g = this.game;
            MapEditor._lastAssets = g.assets;
            if (this.on) {
                const c = g.camera;
                c.getWorldDirection(this._v);
                this.cam.x = c.position.x; this.cam.y = Math.max(1.5, c.position.y); this.cam.z = c.position.z;
                this.cam.yaw = Math.atan2(-this._v.x, -this._v.z);
                this.cam.pitch = Math.asin(clamp(this._v.y, -1, 1));
                this._ensureWire();
                this._ensurePanel();
                this._ensureCrosshair();
                this._ensureHotbar();
                this._ensureInventoryModal();
                this._ensureMcHud();
                this._ensureGhostMesh();
                if (this.panel) this.panel.style.display = 'block';
                if (this.crosshair) this.crosshair.style.display = 'block';
                if (this._hotbarEl) this._hotbarEl.style.display = 'flex';
                if (this._hotbarLabelEl) this._hotbarLabelEl.style.display = 'block';
                if (this._mcHudEl) this._mcHudEl.style.display = 'block';
                this._setCrosshairColor('#3fd0ff');
                this.wireCd = 0;
                this.hoverCd = 0;
                this._flash('');
                this._updateHotbarUI();
                if (g.hud) g.hud.setLockHint(false);
                if (g._lockSupported && !g._locked) {
                    try { g.canvas.requestPointerLock(); } catch (_) {}
                }
                g.canvas.style.cursor = 'none';
                g.hud.toast('⛏️ Minecraft Creative Mode — 163 Items! RMB: Place · LMB: Break/Pick · K: Carve · E: Inventory', '#3fd0ff');
            } else {
                if (this.grabbing) this._cancelGrab();
                if (this.invOpen) this._closeInventoryModal();
                if (this.wire) this.wire.visible = false;
                if (this.selWire) this.selWire.visible = false;
                if (this.panel) this.panel.style.display = 'none';
                if (this.crosshair) this.crosshair.style.display = 'none';
                if (this._hotbarEl) this._hotbarEl.style.display = 'none';
                if (this._hotbarLabelEl) this._hotbarLabelEl.style.display = 'none';
                if (this._mcHudEl) this._mcHudEl.style.display = 'none';
                if (this._ghostMesh) this._ghostMesh.visible = false;
                g.canvas.style.cursor = 'default';
                if (g.hud) g.hud.setLockHint(g._lockSupported && !g._locked && !g.hud._bigOpen);
                if (this.physDirty) { this.game.physics.rebuild(); this.physDirty = false; }
                MapEditor.saveWorld(g, this);
                g.hud.toast('Back to the street', '#8ec5ff');
            }
        }

        update(dt) {
            const g = this.game, inp = g.input, k = inp.keys, cam = this.cam;

            if (!this.invOpen) {
                cam.yaw -= inp.lookDx * 0.0028;
                cam.pitch = clamp(cam.pitch - inp.lookDy * 0.0025, -1.45, 1.45);
                inp.lookDx = 0; inp.lookDy = 0;
                const cy = Math.cos(cam.pitch);
                const fx = -Math.sin(cam.yaw) * cy, fy = Math.sin(cam.pitch), fz = -Math.cos(cam.yaw) * cy;
                const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
                let mx = 0, my = 0, mz = 0;
                if (k.KeyW) { mx += fx; my += fy; mz += fz; }
                if (k.KeyS) { mx -= fx; my -= fy; mz -= fz; }
                if (k.KeyD) { mx += rx; mz += rz; }
                if (k.KeyA) { mx -= rx; mz += rz; }
                if (k.Space) my += 1;
                if (k.KeyQ || k.ControlLeft) my -= 1;
                const len = Math.hypot(mx, my, mz);
                if (len > 1e-4) {
                    const sp = ((k.ShiftLeft || k.ShiftRight) ? 95 : k.ControlLeft ? 8 : (this.creativeFlight ? 34 : 26)) * dt / len;
                    cam.x = clamp(cam.x + mx * sp, WORLD.MIN_X, WORLD.MAX_X);
                    cam.y = clamp(cam.y + my * sp, 0.5, 700);
                    cam.z = clamp(cam.z + mz * sp, WORLD.MIN_Z, WORLD.MAX_Z);
                }
            }

            const c = g.camera;
            const cy = Math.cos(cam.pitch);
            const fx = -Math.sin(cam.yaw) * cy, fy = Math.sin(cam.pitch), fz = -Math.cos(cam.yaw) * cy;
            c.position.set(cam.x, cam.y, cam.z);
            c.lookAt(cam.x + fx, cam.y + fy, cam.z + fz);

            if (this.grabbing && this.sel) {
                const ro = c.position;
                const rd = { x: fx, y: fy, z: fz };
                const maxRayDist = Math.max(this.grabDist * 2.5, 140);
                const hit = g.physics.raycast(ro.x, ro.y, ro.z, rd.x, rd.y, rd.z, maxRayDist, this._q, this.sel.c);
                let tx, ty, tz;
                if (hit) {
                    tx = hit.x;
                    tz = hit.z;
                    ty = hit.y + this.grabHeightOffset;
                    this.grabDist = Math.max(2, Math.min(hit.dist, 200));
                } else {
                    tx = ro.x + rd.x * this.grabDist;
                    ty = Math.max(0.1, ro.y + rd.y * this.grabDist + this.grabHeightOffset);
                    tz = ro.z + rd.z * this.grabDist;
                }
                this._moveTo(tx, ty, tz);
                this._wires();
            } else {
                this._updatePlacementTarget();
            }

            this._updateParticles(dt);

            this.hoverCd -= dt;
            if (this.hoverCd <= 0) {
                this.hoverCd = 0.04;
                if (!this.grabbing) {
                    const hMesh = this._rayMesh(250, null);
                    const hCol = this._ray(250, null);
                    const isHovering = (hMesh && hMesh.g) || (hCol && hCol.collider);
                    this._setCrosshairColor(isHovering ? '#ffd23f' : '#3fd0ff');
                } else {
                    this._setCrosshairColor('#34c759');
                }
            }

            if (this.physDirty) {
                this.physCd -= dt;
                if (this.physCd <= 0) { g.physics.rebuild(); this.physDirty = false; }
            }
            this.wireCd -= dt;
            if (this.wireCd <= 0) {
                this.wireCd = 0.25;
                this._wires();
                this._sync();
            }
        }

        mousemove(e) {
            this.lastMouse = { x: e.clientX, y: e.clientY };
            const rect = this.game.canvas.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                this.mouseNDC = {
                    x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
                    y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
                };
            }
        }

        wheel(e) {
            if (this.invOpen) return;
            if (this.grabbing && this.sel) {
                if (e.shiftKey || e.altKey) {
                    const dy = (e.deltaY > 0 ? -0.3 : 0.3) * (e.ctrlKey ? 0.2 : 1);
                    this.grabHeightOffset = clamp(this.grabHeightOffset + dy, -20, 100);
                    this._flash('Height offset: ' + (this.grabHeightOffset >= 0 ? '+' : '') + this.grabHeightOffset.toFixed(2) + 'm');
                } else {
                    const dd = (e.deltaY > 0 ? 1.5 : -1.5) * (e.ctrlKey ? 0.2 : 1);
                    this.grabDist = clamp(this.grabDist + dd, 2, 200);
                    this._flash('Distance: ' + this.grabDist.toFixed(1) + 'm');
                }
                this._sync();
            } else {
                if (e.deltaY > 0) {
                    this.selectBlockSlot((this.selectedSlot + 1) % 9);
                } else if (e.deltaY < 0) {
                    this.selectBlockSlot((this.selectedSlot - 1 + 9) % 9);
                }
            }
        }

        click(e) {
            if (this.invOpen) return;
            const g = this.game;
            if (g._lockSupported && !g._locked) {
                try { g.canvas.requestPointerLock(); } catch (_) {}
            }

            const currentItem = this.hotbarSlots[this.selectedSlot];

            if (e.button === 2) {
                if (this.grabbing) {
                    this._cancelGrab();
                } else if (currentItem && currentItem.id === 'tool_carver') {
                    this._carve();
                } else {
                    this._placeBlock();
                }
                return;
            }

            if (e.button !== 0) return;

            if (this.grabbing) {
                this._dropGrab();
                return;
            }

            if (currentItem && currentItem.id === 'tool_carver') {
                this._carve();
                return;
            }

            if (this._breakBlock()) {
                return;
            }

            const prevSel = this.sel;
            this.pick(null);
            if (prevSel && this.sel && (
                (prevSel.c && this.sel.c && prevSel.ci === this.sel.ci) ||
                (prevSel.mesh && this.sel.mesh && prevSel.mesh === this.sel.mesh) ||
                (prevSel.g && this.sel.g && prevSel.g === this.sel.g && prevSel.gi === this.sel.gi)
            )) {
                this._startGrab();
            }
        }

        key(e) {
            if (e.code === 'KeyE') {
                if (this.invOpen) this._closeInventoryModal();
                else this._openInventoryModal();
                return;
            }

            if (e.code === 'Escape') {
                if (this.invOpen) { this._closeInventoryModal(); return; }
                if (this.grabbing) { this._cancelGrab(); return; }
                this.toggle();
                return;
            }

            if (this.invOpen) return;

            if (e.code.startsWith('Digit') || e.code.startsWith('Numpad')) {
                const char = e.code.replace('Digit', '').replace('Numpad', '');
                const num = parseInt(char, 10);
                if (num >= 1 && num <= 9) {
                    this.selectBlockSlot(num - 1);
                    return;
                }
            }

            const st = this.step * (e.shiftKey ? 5 : e.ctrlKey ? 0.2 : 1), alt = e.altKey;
            switch (e.code) {
                case 'ArrowLeft': alt ? this._size(-st, 0, 0) : this._move(-st, 0, 0); return;
                case 'ArrowRight': alt ? this._size(st, 0, 0) : this._move(st, 0, 0); return;
                case 'ArrowUp': alt ? this._size(0, 0, -st) : this._move(0, 0, -st); return;
                case 'ArrowDown': alt ? this._size(0, 0, st) : this._move(0, 0, st); return;
                case 'PageUp':
                    if (this.grabbing) { this.grabHeightOffset = clamp(this.grabHeightOffset + (e.shiftKey ? 2 : 0.5), -20, 100); this._sync(); return; }
                    alt ? this._size(0, st, 0) : this._move(0, st, 0); return;
                case 'PageDown':
                    if (this.grabbing) { this.grabHeightOffset = clamp(this.grabHeightOffset - (e.shiftKey ? 2 : 0.5), -20, 100); this._sync(); return; }
                    alt ? this._size(0, -st, 0) : this._move(0, -st, 0); return;
                case 'Comma': this._scale(1 / 1.06); return;
                case 'Period': this._scale(1.06); return;
                case 'KeyR':
                    this.selectedYaw = (this.selectedYaw + Math.PI / 2) % (Math.PI * 2);
                    if (this._ghostMesh) this._ghostMesh.rotation.y = this.selectedYaw;
                    this._updateHotbarUI();
                    if (this.sel) this._turn(e.shiftKey ? Math.PI / 36 : Math.PI / 12);
                    else this._flash(`Rotated block to ${Math.round(this.selectedYaw * 180 / Math.PI)}°`);
                    return;
                case 'KeyF': this._turn(e.shiftKey ? -Math.PI / 36 : -Math.PI / 12); return;
                case 'KeyV':
                    this.creativeFlight = !this.creativeFlight;
                    if (this._flightBadgeEl) this._flightBadgeEl.style.display = this.creativeFlight ? 'inline-block' : 'none';
                    this._flash(this.creativeFlight ? '✈️ Creative Flight ON (WASD + Space/Q)' : 'Creative Flight OFF');
                    return;
                case 'BracketLeft': this.prevHotbarPage(); return;
                case 'BracketRight': this.nextHotbarPage(); return;
                default: break;
            }
            if (e.repeat) return;
            switch (e.code) {
                case 'KeyK': this._carve(); return;
                case 'KeyG': e.shiftKey ? this._snapGrid() : this._toggleGrab(); return;
                case 'Enter': case 'Space':
                    if (this.grabbing) { this._dropGrab(); return; }
                    this.pick(); return;
                case 'Delete': case 'KeyX':
                    if (this.grabbing) this._cancelGrab();
                    this._delete(); return;
                case 'KeyC': this._clone(); return;
                case 'KeyB': this.toggle(); return;
                case 'KeyZ':
                    if (this.grabbing) this._cancelGrab();
                    this._undo(); return;
                case 'KeyT': this.wireOn = !this.wireOn; this.wireCd = 0; this._flash(this.wireOn ? 'wires on' : 'wires off'); return;
                case 'KeyO': this.save(); return;
                case 'KeyL':
                    if (e.shiftKey) this.reset();
                    else this._toggleLock();
                    return;
                default: break;
            }
        }

        _toggleLock() {
            const g = this.game, doc = g.windowEl.ownerDocument || document;
            if (g._locked) {
                try { doc.exitPointerLock(); } catch (_) {}
                this._flash('Mouse look unlocked (free pointer)');
            } else if (g._lockSupported) {
                try { g.canvas.requestPointerLock(); } catch (_) {}
                this._flash('Mouse look locked (FPS mode)');
            }
            this._sync();
        }

        /* ---- Carving: Carve anything out of anything --------------------------- */
        _carve() {
            const g = this.game;
            const c = g.camera;
            const cy = Math.cos(this.cam.pitch);
            const fx = -Math.sin(this.cam.yaw) * cy;
            const fy = Math.sin(this.cam.pitch);
            const fz = -Math.cos(this.cam.yaw) * cy;
            const ro = c.position;
            const rd = new THREE.Vector3(fx, fy, fz).normalize();

            let hitPoint = null;
            let hitNormal = new THREE.Vector3(0, 1, 0);
            let hitColor = 0x8c9098;
            let hitName = 'Surface';

            // 1. Check custom placed blocks first
            if (g._customBlocksGroup && g._customBlocksGroup.children.length > 0) {
                this._customRaycaster.set(ro, rd);
                const hits = this._customRaycaster.intersectObjects(g._customBlocksGroup.children, true);
                if (hits.length > 0 && hits[0].distance < 120) {
                    const h = hits[0];
                    hitPoint = h.point;
                    if (h.face) hitNormal.copy(h.face.normal).applyQuaternion(h.object.getWorldQuaternion(new THREE.Quaternion()));
                    if (h.object.material && h.object.material.color) hitColor = h.object.material.color.getHex();
                    hitName = (h.object.userData && h.object.userData.blockType) || 'Custom Block';
                }
            }

            // 2. Check instanced props
            if (!hitPoint) {
                const mh = this._rayMesh(120, null);
                if (mh && mh.g) {
                    const sp = mh.g.spots[mh.i];
                    hitPoint = new THREE.Vector3(sp.x, (sp.y !== undefined ? sp.y : mh.g.y0) + 1.5, sp.z);
                    hitName = mh.g.key || 'Prop';
                    hitColor = 0x5c4033;
                }
            }

            // 3. Check physics colliders
            if (!hitPoint) {
                const ph = this._ray(120, null);
                if (ph && ph.collider) {
                    hitPoint = new THREE.Vector3(ph.x, ph.y, ph.z);
                    hitNormal.set(0, 1, 0);
                    hitName = ph.collider.tag || 'World Geometry';
                    hitColor = 0x787c82;
                }
            }

            // 4. Check scene meshes (buildings, terrain, roads, cars)
            if (!hitPoint) {
                this._customRaycaster.set(ro, rd);
                const hits = this._customRaycaster.intersectObjects(g.scene.children, true);
                for (let i = 0; i < hits.length; i++) {
                    const h = hits[i];
                    if (h.distance > 150) continue;
                    if (h.object === this.wire || h.object === this.selWire || h.object === this._ghostMesh) continue;
                    if (h.object.type === 'LineSegments' || h.object.type === 'Line') continue;
                    hitPoint = h.point;
                    if (h.face) hitNormal.copy(h.face.normal).applyQuaternion(h.object.getWorldQuaternion(new THREE.Quaternion()));
                    if (h.object.material) {
                        const mat = Array.isArray(h.object.material) ? h.object.material[0] : h.object.material;
                        if (mat && mat.color) hitColor = mat.color.getHex();
                    }
                    hitName = h.object.name || 'World Element';
                    break;
                }
            }

            if (!hitPoint) {
                this._flash('Aim at any surface in range to carve');
                return;
            }

            this._playChiselSound();
            this._spawnCarveParticles(hitPoint, hitNormal, hitColor);

            const size = 2.0;
            const spawnPos = hitPoint.clone().addScaledVector(hitNormal, size * 0.55);
            const id = 'carved_' + Date.now() + '_' + Math.floor(Math.random() * 10000);

            if (!g._customBlocksGroup) {
                g._customBlocksGroup = new THREE.Group();
                g._customBlocksGroup.name = 'MinecraftCustomBlocks';
                g.scene.add(g._customBlocksGroup);
            }

            const mesh = MapEditor.createCarvedBlockMesh(hitColor, size);
            mesh.position.copy(spawnPos);
            mesh.userData = { mcBlockId: id, blockType: 'carved', isCarved: true, customColor: hitColor, carvedFrom: hitName };
            g._customBlocksGroup.add(mesh);

            const col = {
                x: spawnPos.x,
                y: spawnPos.y,
                z: spawnPos.z,
                sx: size,
                sy: size,
                sz: size,
                yaw: 0,
                tag: 'mc_carved',
                mcBlockId: id
            };
            mesh.userData.col = col;
            g.physics.colliders.push(col);

            const blockRecord = {
                id,
                type: 'carved',
                x: spawnPos.x,
                y: spawnPos.y,
                z: spawnPos.z,
                yaw: 0,
                color: hitColor,
                isCarved: true,
                carvedFrom: hitName,
                mesh,
                col
            };
            MapEditor.customBlocks.push(blockRecord);
            this.undo.push({ type: 'place_mc', block: blockRecord });
            if (this.undo.length > 80) this.undo.shift();

            g.physics.rebuild();
            MapEditor.saveWorld(g, this);

            this.sel = {
                isCustom: true,
                block: blockRecord,
                mesh,
                c: col,
                ci: g.physics.colliders.indexOf(col)
            };
            this._startGrab();

            g.hud.toast(`✂️ Carved piece from ${hitName}! Move mouse to pull it out · LMB: Drop · C: Clone · Del: Delete`, '#3fd0ff');
            this._flash(`Carved from ${hitName} (Grabbing)`);
            this._sync();
        }

        /* ---- Universal Selection ---------------------------------------------- */
        _ray(maxD, ndc, ignoreCol) {
            let ro, rd;
            if (ndc) {
                if (!this._camRc) this._camRc = new THREE.Raycaster();
                this._camRc.setFromCamera(ndc, this.game.camera);
                ro = this._camRc.ray.origin;
                rd = this._camRc.ray.direction;
            } else {
                const cy = Math.cos(this.cam.pitch);
                const dx = -Math.sin(this.cam.yaw) * cy, dy = Math.sin(this.cam.pitch), dz = -Math.cos(this.cam.yaw) * cy;
                ro = this.game.camera.position;
                rd = { x: dx, y: dy, z: dz };
            }
            if (this.physDirty) { this.game.physics.rebuild(); this.physDirty = false; }
            return this.game.physics.raycast(ro.x, ro.y, ro.z, rd.x, rd.y, rd.z, maxD, this._q, ignoreCol);
        }

        _rayMesh(maxD, ndc) {
            if (!this._rc) {
                this._rc = new THREE.Raycaster();
                this._ro = new THREE.Vector3();
                this._rd = new THREE.Vector3();
                this._hits = [];
                this._meshes = [];
                for (const g of this.groups.values()) this._meshes.push(g.mesh);
            }
            if (ndc) {
                this._rc.setFromCamera(ndc, this.game.camera);
            } else {
                const cy = Math.cos(this.cam.pitch);
                this._ro.set(this.cam.x, this.cam.y, this.cam.z);
                this._rd.set(-Math.sin(this.cam.yaw) * cy, Math.sin(this.cam.pitch), -Math.cos(this.cam.yaw) * cy);
                this._rc.set(this._ro, this._rd);
            }
            this._rc.far = maxD;
            this._hits.length = 0;
            this._rc.intersectObjects(this._meshes, false, this._hits);
            for (let i = 0; i < this._hits.length; i++) {
                const h = this._hits[i], ed = h.object.userData.edit;
                if (!ed || h.instanceId === undefined || h.instanceId === null) continue;
                return { g: this.groups.get(ed.key), i: h.instanceId, d: h.distance };
            }
            return null;
        }

        pick(ndc) {
            if (!ndc && !this.game._locked && this.mouseNDC) ndc = this.mouseNDC;
            const g = this.game;

            let ro, rd;
            if (ndc) {
                if (!this._camRc) this._camRc = new THREE.Raycaster();
                this._camRc.setFromCamera(ndc, g.camera);
                ro = this._camRc.ray.origin;
                rd = this._camRc.ray.direction;
            } else {
                const cy = Math.cos(this.cam.pitch);
                const dx = -Math.sin(this.cam.yaw) * cy, dy = Math.sin(this.cam.pitch), dz = -Math.cos(this.cam.yaw) * cy;
                ro = g.camera.position;
                rd = new THREE.Vector3(dx, dy, dz).normalize();
            }

            // 1. Custom placed / carved blocks
            if (g._customBlocksGroup && g._customBlocksGroup.children.length > 0) {
                this._customRaycaster.set(ro, rd);
                const hits = this._customRaycaster.intersectObjects(g._customBlocksGroup.children, true);
                if (hits.length > 0 && hits[0].distance < 200) {
                    let topObj = hits[0].object;
                    while (topObj.parent && topObj.parent !== g._customBlocksGroup) {
                        topObj = topObj.parent;
                    }
                    if (topObj && topObj.userData && topObj.userData.mcBlockId) {
                        const blockRecord = MapEditor.customBlocks.find(b => b.id === topObj.userData.mcBlockId);
                        if (blockRecord) {
                            this.sel = {
                                isCustom: true,
                                block: blockRecord,
                                mesh: topObj,
                                c: blockRecord.col,
                                ci: blockRecord.col ? this.cols.indexOf(blockRecord.col) : -1
                            };
                            const name = blockRecord.isCarved ? 'Carved Piece' : blockRecord.type;
                            this._flash(`Selected: ${name} [G: Grab · Del: Delete · C: Clone]`);
                            this._setCrosshairColor('#ffd23f');
                            this._sync();
                            return;
                        }
                    }
                }
            }

            // 2. Instanced props
            let mh = this._rayMesh(300, ndc);
            let ph = this._ray(300, ndc);

            if ((!mh || !mh.g) && (!ph || !ph.collider) && ndc) {
                const cph = this._ray(300, null), cmh = this._rayMesh(300, null);
                if ((cmh && cmh.g) || (cph && cph.collider)) { ph = cph; mh = cmh; }
            }

            if (mh && mh.g && (!ph || mh.d < ph.dist + 0.5)) {
                const sp = mh.g.spots[mh.i], b = this._boxAt(sp.x, sp.z);
                this.sel = { g: mh.g, gi: mh.i, c: b.c, ci: b.i };
                this._flash(`Selected: ${mh.g.key} #${mh.i} [G: Grab · Del: Delete · C: Clone]`);
                this._setCrosshairColor('#ffd23f');
                this._sync();
                return;
            }

            // 3. Physics collider
            if (ph && ph.collider) {
                const own = this._owner(ph.collider);
                this.sel = { g: own ? own.g : null, gi: own ? own.i : -1, c: ph.collider, ci: this.cols.indexOf(ph.collider) };
                this._flash(`Selected: ${own ? own.g.key : (ph.collider.tag || 'box')} [G: Grab · Del: Delete · C: Clone]`);
                this._setCrosshairColor('#ffd23f');
                this._sync();
                return;
            }

            // 4. Any scene mesh (vehicles, characters, buildings, landmarks)
            this._customRaycaster.set(ro, rd);
            const sceneHits = this._customRaycaster.intersectObjects(g.scene.children, true);
            for (let i = 0; i < sceneHits.length; i++) {
                const h = sceneHits[i];
                if (h.distance > 250) continue;
                if (h.object === this.wire || h.object === this.selWire || h.object === this._ghostMesh) continue;
                if (h.object.type === 'LineSegments' || h.object.type === 'Line') continue;

                let root = h.object;
                while (root.parent && root.parent !== g.scene && !root.userData.isVehicle && !root.userData.isPed) {
                    root = root.parent;
                }
                this.sel = {
                    isSceneObj: true,
                    mesh: root,
                    c: root.userData && root.userData.col ? root.userData.col : null
                };
                this._flash(`Selected: ${root.name || 'World Object'} [G: Grab · Del: Delete · C: Clone]`);
                this._setCrosshairColor('#ffd23f');
                this._sync();
                return;
            }

            this.sel = null;
            this._flash('Nothing under cursor/crosshair');
            this._setCrosshairColor('#3fd0ff');
            this._sync();
        }

        _owner(c) {
            if (!this.byPos) {
                this.byPos = new Map();
                for (const g of this.groups.values()) {
                    for (let i = 0; i < g.spots.length; i++) {
                        this.byPos.set(MapEditor.pkey(g.spots[i].x, g.spots[i].z), { g, i });
                    }
                }
            }
            return this.byPos.get(MapEditor.pkey(c.x, c.z)) || null;
        }

        _boxAt(x, z) {
            const q = this._q;
            this.game.physics.queryCircle(x, z, 1.2, q);
            for (let k = 0; k < q.length; k++) {
                const i = q[k], c = this.cols[i];
                if (c && c.sx > 0.002 && Math.abs(c.x - x) < 0.06 && Math.abs(c.z - z) < 0.06) return { c, i };
            }
            return { c: null, i: -1 };
        }

        /* ---- Transform & Editing operations ----------------------------------- */
        _getPos(s) {
            if (!s) return { x: 0, y: 0, z: 0 };
            if (s.isCustom && s.mesh) {
                return { x: s.mesh.position.x, y: s.mesh.position.y, z: s.mesh.position.z };
            }
            if (s.isSceneObj && s.mesh) {
                return { x: s.mesh.position.x, y: s.mesh.position.y, z: s.mesh.position.z };
            }
            if (s.g) {
                const sp = s.g.spots[s.gi];
                return { x: sp.x, y: sp.y !== undefined ? sp.y : (s.g.y0 || 0), z: sp.z };
            }
            if (s.c) {
                return { x: s.c.x, y: s.c.y - s.c.sy / 2, z: s.c.z };
            }
            return { x: 0, y: 0, z: 0 };
        }

        _getTransform(s) {
            const t = {};
            if (s.isCustom && s.mesh) {
                t.custom = { x: s.mesh.position.x, y: s.mesh.position.y, z: s.mesh.position.z, ry: s.mesh.rotation.y };
            }
            if (s.isSceneObj && s.mesh) {
                t.scene = { x: s.mesh.position.x, y: s.mesh.position.y, z: s.mesh.position.z, ry: s.mesh.rotation.y };
            }
            if (s.g) {
                const sp = s.g.spots[s.gi];
                t.sp = { x: sp.x, y: sp.y, z: sp.z, ry: sp.ry, s: sp.s, sx: sp.sx, sy: sp.sy, sz: sp.sz, gone: sp.gone };
            }
            if (s.c) {
                t.c = { x: s.c.x, y: s.c.y, z: s.c.z, sx: s.c.sx, sy: s.c.sy, sz: s.c.sz };
            }
            return t;
        }

        _restoreTransform(s, t) {
            if (!s || !t) return;
            if (s.isCustom && t.custom && s.mesh) {
                s.mesh.position.set(t.custom.x, t.custom.y, t.custom.z);
                s.mesh.rotation.y = t.custom.ry;
                if (s.block) { s.block.x = t.custom.x; s.block.y = t.custom.y; s.block.z = t.custom.z; s.block.yaw = t.custom.ry; }
            }
            if (s.isSceneObj && t.scene && s.mesh) {
                s.mesh.position.set(t.scene.x, t.scene.y, t.scene.z);
                s.mesh.rotation.y = t.scene.ry;
            }
            if (s.g && t.sp) {
                const sp = s.g.spots[s.gi];
                MapEditor.assign(sp, t.sp);
                this._writeInst(s);
            }
            if (s.c && t.c) {
                s.c.x = t.c.x; s.c.y = t.c.y; s.c.z = t.c.z;
                s.c.sx = t.c.sx; s.c.sy = t.c.sy; s.c.sz = t.c.sz;
                this._markCol(s);
            }
            this._sync();
        }

        _startGrab(sel) {
            if (!sel) sel = this.sel;
            if (!sel) return false;
            this.sel = sel;
            this.grabbing = true;
            this._snap();
            this.grabOrigin = this._getTransform(this.sel);
            const p = this._getPos(this.sel);
            const d = Math.hypot(p.x - this.cam.x, p.y - this.cam.y, p.z - this.cam.z);
            this.grabDist = Math.max(2, Math.min(d, 150));
            this.grabHeightOffset = 0;
            if (this.sel.c && this.sel.g) {
                const sp = this.sel.g.spots[this.sel.gi];
                const sy = sp.y !== undefined ? sp.y : (this.sel.g.y0 || 0);
                this.colOffset = { dx: this.sel.c.x - sp.x, dy: this.sel.c.y - sy, dz: this.sel.c.z - sp.z };
            } else {
                this.colOffset = null;
            }
            if (this.selWire) this.selWire.material.color.setHex(0x34c759);
            const name = this.sel.block ? (this.sel.block.isCarved ? 'Carved Piece' : this.sel.block.type) : (this.sel.g ? this.sel.g.key : 'Selected Object');
            this._flash('GRABBING ' + name);
            this._sync();
            return true;
        }

        _dropGrab() {
            if (!this.grabbing || !this.sel) return;
            this.grabbing = false;
            if (this.selWire) this.selWire.material.color.setHex(0xffd23f);
            if (this.sel.c) {
                this.dirtyCols.add(this.sel.ci);
                this.physDirty = true;
                this.physCd = 0.05;
            }
            MapEditor.saveWorld(this.game, this);
            this._flash('Placed');
            this._sync();
        }

        _cancelGrab() {
            if (!this.grabbing || !this.sel) return;
            this._restoreTransform(this.sel, this.grabOrigin);
            this.undo.pop();
            this.grabbing = false;
            if (this.selWire) this.selWire.material.color.setHex(0xffd23f);
            this._flash('Grab cancelled');
            this._sync();
        }

        _toggleGrab() {
            if (this.grabbing) {
                this._dropGrab();
            } else {
                if (!this.sel) this.pick();
                if (this.sel) this._startGrab();
            }
        }

        _moveTo(tx, ty, tz) {
            const s = this.sel;
            if (!s) return;
            if (s.isCustom && s.block) {
                s.block.x = tx; s.block.y = ty; s.block.z = tz;
                if (s.mesh) s.mesh.position.set(tx, ty, tz);
                if (s.c) {
                    s.c.x = tx;
                    s.c.z = tz;
                    s.c.y = ty + (s.c.sy ? s.c.sy / 2 : 0);
                    this._markCol(s);
                }
                return;
            }
            if (s.isSceneObj && s.mesh) {
                s.mesh.position.set(tx, ty, tz);
                if (s.c) {
                    s.c.x = tx;
                    s.c.z = tz;
                    s.c.y = ty;
                    this._markCol(s);
                }
                return;
            }
            if (s.g) {
                const sp = s.g.spots[s.gi];
                sp.x = tx; sp.z = tz; sp.y = ty;
                this._writeInst(s);
            }
            if (s.c) {
                if (this.colOffset && s.g) {
                    s.c.x = tx + this.colOffset.dx;
                    s.c.y = ty + this.colOffset.dy;
                    s.c.z = tz + this.colOffset.dz;
                } else {
                    s.c.x = tx;
                    s.c.z = tz;
                    s.c.y = ty + s.c.sy / 2;
                }
                this._markCol(s);
            }
            this._sync();
        }

        _snap() {
            const s = this.sel;
            if (!s) return;
            const e = { ci: s.ci, add: 0, c: null, key: s.g ? s.g.key : null, gi: s.gi, sp: null };
            if (s.c) e.c = { x: s.c.x, y: s.c.y, z: s.c.z, sx: s.c.sx, sy: s.c.sy, sz: s.c.sz };
            if (s.g) {
                const sp = s.g.spots[s.gi];
                e.sp = { x: sp.x, y: sp.y, z: sp.z, ry: sp.ry, s: sp.s, sx: sp.sx, sy: sp.sy, sz: sp.sz, gone: sp.gone };
            }
            this.undo.push(e);
            if (this.undo.length > 80) this.undo.shift();
        }

        _writeInst(s) {
            s.g.write(s.gi);
            s.g.mesh.instanceMatrix.needsUpdate = true;
            this.dirtyInst.add(s.g.key + '#' + s.gi);
            this.byPos = null;
        }

        _markCol(s) {
            this.dirtyCols.add(s.ci);
            this.physDirty = true;
            this.physCd = 0.3;
        }

        _move(dx, dy, dz) {
            const s = this.sel;
            if (!s) return;
            this._snap();
            if (s.isCustom && s.mesh) {
                s.mesh.position.x += dx; s.mesh.position.y += dy; s.mesh.position.z += dz;
                if (s.block) { s.block.x = s.mesh.position.x; s.block.y = s.mesh.position.y; s.block.z = s.mesh.position.z; }
                if (s.c) { s.c.x += dx; s.c.y += dy; s.c.z += dz; this._markCol(s); }
            } else if (s.g) {
                const sp = s.g.spots[s.gi];
                sp.x += dx; sp.z += dz;
                if (dy) sp.y = (sp.y !== undefined ? sp.y : s.g.y0) + dy;
                this._writeInst(s);
            } else if (s.c) {
                s.c.x += dx; s.c.y += dy; s.c.z += dz; this._markCol(s);
            }
            this._sync();
        }

        _size(dx, dy, dz) {
            const s = this.sel;
            if (!s || !s.c) { this._flash('no box on this one'); return; }
            this._snap();
            const c = s.c;
            if (dx) c.sx = Math.max(0.1, c.sx + dx);
            if (dz) c.sz = Math.max(0.1, c.sz + dz);
            if (dy) { const b = c.y - c.sy / 2; c.sy = Math.max(0.1, c.sy + dy); c.y = b + c.sy / 2; }
            this._markCol(s);
            this._sync();
        }

        _scale(f) {
            const s = this.sel;
            if (!s) return;
            this._snap();
            if (s.isCustom && s.mesh) {
                s.mesh.scale.multiplyScalar(f);
                if (s.c) {
                    s.c.sx *= f; s.c.sy *= f; s.c.sz *= f;
                    this._markCol(s);
                }
            } else if (s.g) {
                const sp = s.g.spots[s.gi];
                if (sp.sx !== undefined) { sp.sx *= f; sp.sy *= f; sp.sz *= f; }
                else sp.s = (sp.s || 1) * f;
                this._writeInst(s);
            } else if (s.c) {
                const c = s.c, b = c.y - c.sy / 2;
                c.sx *= f; c.sy *= f; c.sz *= f;
                c.y = b + c.sy / 2;
                this._markCol(s);
            }
            this._sync();
        }

        _turn(a) {
            const s = this.sel;
            if (!s) return;
            this._snap();
            if (s.isCustom && s.mesh) {
                s.mesh.rotation.y += a;
                if (s.block) s.block.yaw = s.mesh.rotation.y;
                if (s.c) s.c.yaw = s.mesh.rotation.y;
                this._sync();
                return;
            }
            if (s.g) {
                const sp = s.g.spots[s.gi];
                const q0 = Math.round(Math.abs(sp.ry || 0) / (Math.PI / 2)) & 1;
                sp.ry = (sp.ry || 0) + a;
                this._writeInst(s);
                if (s.c && (Math.round(Math.abs(sp.ry) / (Math.PI / 2)) & 1) !== q0) {
                    const t = s.c.sx; s.c.sx = s.c.sz; s.c.sz = t;
                    this._markCol(s);
                }
                this._sync();
            }
        }

        _snapGrid() {
            const s = this.sel;
            if (!s) return;
            this._snap();
            const g = 0.5, r = (v) => Math.round(v / g) * g;
            if (s.isCustom && s.mesh) {
                s.mesh.position.x = r(s.mesh.position.x);
                s.mesh.position.z = r(s.mesh.position.z);
                if (s.block) { s.block.x = s.mesh.position.x; s.block.z = s.mesh.position.z; }
                if (s.c) { s.c.x = s.mesh.position.x; s.c.z = s.mesh.position.z; this._markCol(s); }
            } else if (s.g) {
                const sp = s.g.spots[s.gi]; sp.x = r(sp.x); sp.z = r(sp.z); this._writeInst(s);
            } else if (s.c) {
                s.c.x = r(s.c.x); s.c.z = r(s.c.z); this._markCol(s);
            }
            this._flash('snapped to 0.5 m');
            this._sync();
        }

        /* ---- Universal Delete ------------------------------------------------- */
        _delete() {
            const s = this.sel;
            if (!s) { this._flash('Nothing selected to delete'); return; }
            const g = this.game;

            if (s.isCustom && s.block) {
                const b = s.block;
                const idx = MapEditor.customBlocks.indexOf(b);
                if (idx !== -1) MapEditor.customBlocks.splice(idx, 1);
                if (b.mesh && b.mesh.parent) {
                    b.mesh.parent.remove(b.mesh);
                    MapEditor.disposeHierarchy(b.mesh);
                }
                if (b.col) MapEditor.kill(b.col);
                this.undo.push({ type: 'break_mc', block: b });
                if (this.undo.length > 80) this.undo.shift();
                g.physics.rebuild();
                MapEditor.saveWorld(g, this);
                this.sel = null;
                g.hud.toast(`🗑️ Deleted ${b.isCarved ? 'carved piece' : b.type}! (Z to undo)`, '#ff5f56');
                this._flash('Deleted custom block');
                this._sync();
                return;
            }

            if (s.g) {
                this._snap();
                s.g.spots[s.gi].gone = true;
                this._writeInst(s);
                if (s.c) { MapEditor.kill(s.c); this._markCol(s); }
                MapEditor.saveWorld(g, this);
                this.sel = null;
                g.hud.toast(`🗑️ Deleted prop ${s.g.key}! (Z to undo)`, '#ff5f56');
                this._flash('Deleted prop');
                this._sync();
                return;
            }

            if (s.c) {
                this._snap();
                MapEditor.kill(s.c);
                this._markCol(s);
                MapEditor.saveWorld(g, this);
                this.sel = null;
                g.hud.toast(`🗑️ Deleted collider! (Z to undo)`, '#ff5f56');
                this._flash('Deleted collider');
                this._sync();
                return;
            }

            if (s.isSceneObj && s.mesh) {
                s.mesh.visible = false;
                if (s.c) MapEditor.kill(s.c);
                if (!MapEditor.deletedScene) MapEditor.deletedScene = [];
                if (s.mesh.uuid) MapEditor.deletedScene.push(s.mesh.uuid);
                MapEditor.saveWorld(g, this);
                this.sel = null;
                g.hud.toast('🗑️ Deleted scene object!', '#ff5f56');
                this._flash('Deleted scene object');
                this._sync();
            }
        }

        /* ---- Universal Duplicate / Clone -------------------------------------- */
        _clone() {
            const s = this.sel;
            if (!s) { this._flash('Select something first to duplicate'); return; }
            const g = this.game;

            if (s.isCustom && s.block) {
                const b = s.block;
                const blockDef = MapEditor.CATALOG.find(def => def.id === b.type) || { id: b.type, name: 'Custom Block', size: { sx: 2, sy: 2, sz: 2 } };
                const id = 'mc_clone_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
                const nx = b.x + 2, ny = b.y, nz = b.z;

                let newMesh;
                if (b.isCarved) {
                    newMesh = MapEditor.createCarvedBlockMesh(b.color || 0x8c9098, b.col ? b.col.sx : 2);
                } else if (blockDef.isModel) {
                    newMesh = MapEditor.createBlockMesh(blockDef, false, g.assets);
                } else {
                    newMesh = MapEditor.createBlockMesh(blockDef, false);
                }
                newMesh.position.set(nx, ny, nz);
                newMesh.rotation.y = b.yaw || 0;
                newMesh.userData = { mcBlockId: id, blockType: b.type, isCarved: b.isCarved, customColor: b.color };
                g._customBlocksGroup.add(newMesh);

                const col = {
                    x: nx, y: ny, z: nz,
                    sx: b.col ? b.col.sx : (blockDef.size ? blockDef.size.sx : 2),
                    sy: b.col ? b.col.sy : (blockDef.size ? blockDef.size.sy : 2),
                    sz: b.col ? b.col.sz : (blockDef.size ? blockDef.size.sz : 2),
                    yaw: b.yaw || 0,
                    tag: b.col ? b.col.tag : 'mc_clone',
                    mcBlockId: id
                };
                newMesh.userData.col = col;
                g.physics.colliders.push(col);

                const newBlock = {
                    id,
                    type: b.type,
                    x: nx, y: ny, z: nz,
                    yaw: b.yaw || 0,
                    color: b.color,
                    isCarved: b.isCarved,
                    isModel: blockDef.isModel,
                    modelCategory: blockDef.modelCategory,
                    modelKey: blockDef.modelKey,
                    mesh: newMesh,
                    col
                };
                MapEditor.customBlocks.push(newBlock);
                this.undo.push({ type: 'place_mc', block: newBlock });

                g.physics.rebuild();
                MapEditor.saveWorld(g, this);

                this.sel = { isCustom: true, block: newBlock, mesh: newMesh, c: col, ci: g.physics.colliders.indexOf(col) };
                this._startGrab();
                g.hud.toast(`📋 Duplicated ${blockDef.name || 'Block'}! (Grabbing)`, '#ffd23f');
                return;
            }

            if (s.g) {
                const sp = s.g.spots[s.gi];
                const nx = sp.x + 2, ny = (sp.y !== undefined ? sp.y : s.g.y0 || 0), nz = sp.z;
                const id = 'mc_prop_clone_' + Date.now();
                const cloneMesh = s.g.mesh.clone();
                cloneMesh.position.set(nx, ny, nz);
                g._customBlocksGroup.add(cloneMesh);

                const col = {
                    x: nx, y: ny + 1.5, z: nz,
                    sx: 2, sy: 3, sz: 2, yaw: sp.ry || 0,
                    tag: 'mc_prop_clone', mcBlockId: id
                };
                g.physics.colliders.push(col);

                const newBlock = {
                    id, type: s.g.key, x: nx, y: ny, z: nz, yaw: sp.ry || 0, mesh: cloneMesh, col
                };
                MapEditor.customBlocks.push(newBlock);
                g.physics.rebuild();
                MapEditor.saveWorld(g, this);

                this.sel = { isCustom: true, block: newBlock, mesh: cloneMesh, c: col, ci: g.physics.colliders.indexOf(col) };
                this._startGrab();
                g.hud.toast(`📋 Duplicated prop ${s.g.key}!`, '#ffd23f');
                return;
            }

            if (s.c) {
                const c = s.c;
                this._push({ x: c.x + 2, y: c.y, z: c.z, sx: c.sx, sy: c.sy, sz: c.sz, tag: c.tag || 'edit' });
                this._startGrab();
                g.hud.toast('📋 Duplicated Box Collider!', '#ffd23f');
                return;
            }

            if (s.isSceneObj && s.mesh) {
                const clonedMesh = s.mesh.clone(true);
                clonedMesh.position.x += 2;
                g._customBlocksGroup.add(clonedMesh);
                const bbox = new THREE.Box3().setFromObject(clonedMesh);
                const col = {
                    x: clonedMesh.position.x, y: (bbox.max.y + bbox.min.y) / 2, z: clonedMesh.position.z,
                    sx: Math.max(1, bbox.max.x - bbox.min.x),
                    sy: Math.max(1, bbox.max.y - bbox.min.y),
                    sz: Math.max(1, bbox.max.z - bbox.min.z),
                    yaw: clonedMesh.rotation.y || 0,
                    tag: 'mc_scene_clone'
                };
                g.physics.colliders.push(col);
                g.physics.rebuild();
                this.sel = { isSceneObj: true, mesh: clonedMesh, c: col, ci: g.physics.colliders.indexOf(col) };
                this._startGrab();
                g.hud.toast('📋 Duplicated Scene Object!', '#ffd23f');
            }
        }

        _addBox() {
            const h = this._ray(140);
            const cy = Math.cos(this.cam.pitch);
            const x = h ? h.x : this.cam.x - Math.sin(this.cam.yaw) * cy * 8;
            const z = h ? h.z : this.cam.z - Math.cos(this.cam.yaw) * cy * 8;
            const y = h ? h.y : this.cam.y;
            this._push({ x, y: y + 1.5, z, sx: 4, sy: 3, sz: 4, tag: 'edit' });
        }

        _push(c) {
            const i = this.cols.length;
            this.cols.push(c);
            this.added.push(i);
            this.dirtyCols.add(i);
            this.physDirty = true; this.physCd = 0.25;
            this.sel = { g: null, gi: -1, c, ci: i };
            this.undo.push({ ci: i, add: 1, c: null, key: null, gi: -1, sp: null });
            if (this.undo.length > 80) this.undo.shift();
            this._flash('box added');
            this._sync();
        }

        _undo() {
            const e = this.undo.pop();
            if (!e) { this._flash('nothing to undo'); return; }
            if (e.type === 'place_mc') {
                const b = e.block;
                const idx = MapEditor.customBlocks.indexOf(b);
                if (idx !== -1) MapEditor.customBlocks.splice(idx, 1);
                if (b.mesh && b.mesh.parent) {
                    b.mesh.parent.remove(b.mesh);
                    MapEditor.disposeHierarchy(b.mesh);
                }
                if (b.col) MapEditor.kill(b.col);
                this.game.physics.rebuild();
                MapEditor.saveWorld(this.game, this);
                this._flash('Undid block placement');
                this._sync();
                return;
            }
            if (e.type === 'break_mc') {
                const b = e.block;
                const blockDef = MapEditor.CATALOG.find(def => def.id === b.type) || MapEditor.CATALOG[0];
                let mesh;
                if (b.isCarved) {
                    mesh = MapEditor.createCarvedBlockMesh(b.color || 0x8c9098, b.col ? b.col.sx : 2.0);
                } else if (blockDef.isModel) {
                    mesh = MapEditor.createBlockMesh(blockDef, false, this.game.assets);
                } else {
                    mesh = MapEditor.createBlockMesh(blockDef, false);
                }
                mesh.position.set(b.x, b.y, b.z);
                mesh.rotation.y = b.yaw || 0;
                mesh.userData = { mcBlockId: b.id, blockType: b.type };
                this.game._customBlocksGroup.add(mesh);

                const col = {
                    x: b.x, y: b.y, z: b.z,
                    sx: b.col ? b.col.sx : (blockDef.size ? blockDef.size.sx : 2),
                    sy: b.col ? b.col.sy : (blockDef.size ? blockDef.size.sy : 2),
                    sz: b.col ? b.col.sz : (blockDef.size ? blockDef.size.sz : 2),
                    yaw: b.yaw || 0,
                    tag: b.isCarved ? 'mc_carved' : (blockDef ? blockDef.tag : 'mc_block'),
                    mcBlockId: b.id
                };
                mesh.userData.col = col;
                b.mesh = mesh;
                b.col = col;
                this.game.physics.colliders.push(col);
                MapEditor.customBlocks.push(b);

                this.game.physics.rebuild();
                MapEditor.saveWorld(this.game, this);
                this._flash('Restored broken block');
                this._sync();
                return;
            }
            if (e.add) {
                const c = this.cols[e.ci];
                if (c) MapEditor.kill(c);
                if (this.sel && this.sel.ci === e.ci) this.sel = null;
                this.physDirty = true; this.physCd = 0.2;
            } else {
                const c = this.cols[e.ci];
                if (e.c && c) {
                    c.x = e.c.x; c.y = e.c.y; c.z = e.c.z; c.sx = e.c.sx; c.sy = e.c.sy; c.sz = e.c.sz;
                    this.physDirty = true; this.physCd = 0.2;
                }
                if (e.key) {
                    const g = this.groups.get(e.key), sp = g && g.spots[e.gi];
                    if (sp) {
                        const p = e.sp;
                        sp.x = p.x; sp.y = p.y; sp.z = p.z; sp.ry = p.ry; sp.gone = p.gone;
                        if (p.s !== undefined) sp.s = p.s;
                        if (p.sx !== undefined) { sp.sx = p.sx; sp.sy = p.sy; sp.sz = p.sz; }
                        g.write(e.gi);
                        g.mesh.instanceMatrix.needsUpdate = true;
                        this.byPos = null;
                    }
                }
            }
            this._flash('undone');
            this._sync();
        }

        /* ---- Overlay & Wireframes -------------------------------------------- */
        _ensureWire() {
            if (this.wire) return;
            const mkLines = (n, color, op) => {
                const pos = new Float32Array(n * 24 * 3);
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
                geo.setDrawRange(0, 0);
                const seg = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
                    color, transparent: op < 1, opacity: op, depthTest: false, depthWrite: false,
                }));
                seg.frustumCulled = false;
                seg.renderOrder = 999;
                seg.visible = false;
                this.game.scene.add(seg);
                return { seg, pos };
            };
            const a = mkLines(this.wireMax, 0x3fd0ff, 0.5);
            this.wire = a.seg; this.wirePos = a.pos;
            const b = mkLines(1, 0xffd23f, 1);
            this.selWire = b.seg; this.selPos = b.pos;
            this.selWire.renderOrder = 1000;
        }

        _wires() {
            if (!this.wire) return;
            if (!this.wireOn) { this.wire.visible = false; this.selWire.visible = false; return; }
            this.game.physics.queryCircle(this.cam.x, this.cam.z, 45, this._q);
            const q = this._q;
            let o = 0, n = 0;
            for (let k = 0; k < q.length && n < this.wireMax; k++) {
                const c = this.cols[q[k]];
                if (!c || c.sx <= 0.002) continue;
                o = MapEditor._box(this.wirePos, o, c);
                n++;
            }
            this.wire.geometry.setDrawRange(0, n * 24);
            this.wire.geometry.attributes.position.needsUpdate = true;
            this.wire.visible = n > 0;

            const s = this.sel;
            if (s) {
                let box = null;
                if (s.c) {
                    box = s.c;
                } else if (s.mesh) {
                    const bb = new THREE.Box3().setFromObject(s.mesh);
                    box = {
                        x: (bb.max.x + bb.min.x) / 2,
                        y: (bb.max.y + bb.min.y) / 2,
                        z: (bb.max.z + bb.min.z) / 2,
                        sx: Math.max(0.4, bb.max.x - bb.min.x),
                        sy: Math.max(0.4, bb.max.y - bb.min.y),
                        sz: Math.max(0.4, bb.max.z - bb.min.z)
                    };
                } else if (s.g) {
                    const sp = s.g.spots[s.gi];
                    const mesh = s.g.mesh;
                    if (mesh && mesh.geometry) {
                        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
                        const bb = mesh.geometry.boundingBox;
                        const sx = sp.sx !== undefined ? sp.sx : (sp.s || 1);
                        const sy = sp.sy !== undefined ? sp.sy : (sp.s || 1);
                        const sz = sp.sz !== undefined ? sp.sz : (sp.s || 1);
                        const w = Math.max(0.6, (bb.max.x - bb.min.x) * sx);
                        const h = Math.max(0.6, (bb.max.y - bb.min.y) * sy);
                        const d = Math.max(0.6, (bb.max.z - bb.min.z) * sz);
                        const cy = (sp.y !== undefined ? sp.y : s.g.y0) + (bb.max.y + bb.min.y) * 0.5 * sy;
                        box = { x: sp.x, y: cy, z: sp.z, sx: w, sy: h, sz: d };
                    }
                }
                if (box) {
                    MapEditor._box(this.selPos, 0, box);
                    this.selWire.geometry.setDrawRange(0, 24);
                    this.selWire.geometry.attributes.position.needsUpdate = true;
                    this.selWire.material.color.setHex(this.grabbing ? 0x34c759 : 0xffd23f);
                    this.selWire.visible = true;
                } else {
                    this.selWire.visible = false;
                }
            } else this.selWire.visible = false;
        }

        _ensurePanel() {
            if (this.panel) return;
            const d = this.game.windowEl.ownerDocument;
            const el = d.createElement('div');
            el.style.cssText = 'position:absolute;left:10px;top:10px;z-index:60;pointer-events:none;' +
                'font:11px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#cfe9ff;' +
                'background:rgba(8,14,22,0.85);border:1px solid rgba(63,208,255,0.4);border-radius:8px;' +
                'padding:9px 12px;white-space:pre;text-shadow:0 1px 2px #000;box-shadow:0 4px 16px rgba(0,0,0,0.5)';
            const info = d.createElement('div');
            info.style.cssText = 'color:#ffd23f;margin-bottom:6px';
            const help = d.createElement('div');
            help.style.cssText = 'opacity:0.75';
            help.textContent = MapEditor.HELP;
            el.appendChild(info);
            el.appendChild(help);
            this.game.windowEl.appendChild(el);
            this.panel = el;
            this.info = info;
        }

        _ensureCrosshair() {
            if (this.crosshair) return;
            const d = this.game.windowEl.ownerDocument || document;
            const el = d.createElement('div');
            el.id = 'gta-editor-crosshair';
            el.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);' +
                'width:36px;height:36px;pointer-events:none;z-index:58;display:none;';
            el.innerHTML = `
                <svg width="36" height="36" viewBox="0 0 36 36" style="display:block;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.95));">
                    <circle id="gta-xhair-ring" cx="18" cy="18" r="11" fill="none" stroke="#3fd0ff" stroke-width="1.8" stroke-dasharray="4 3" opacity="0.9" />
                    <line id="gta-xhair-t" x1="18" y1="2" x2="18" y2="10" stroke="#3fd0ff" stroke-width="2" stroke-linecap="round" />
                    <line id="gta-xhair-b" x1="18" y1="26" x2="18" y2="34" stroke="#3fd0ff" stroke-width="2" stroke-linecap="round" />
                    <line id="gta-xhair-l" x1="2" y1="18" x2="10" y2="18" stroke="#3fd0ff" stroke-width="2" stroke-linecap="round" />
                    <line id="gta-xhair-r" x1="26" y1="18" x2="34" y2="18" stroke="#3fd0ff" stroke-width="2" stroke-linecap="round" />
                    <circle id="gta-xhair-pip" cx="18" cy="18" r="2.5" fill="#ffd23f" />
                </svg>
            `;
            const parent = this.game.win || (this.game.canvas && this.game.canvas.parentElement) || this.game.windowEl;
            parent.appendChild(el);
            this.crosshair = el;
        }

        _setCrosshairColor(hex) {
            if (!this.crosshair) return;
            const ring = this.crosshair.querySelector('#gta-xhair-ring');
            const t = this.crosshair.querySelector('#gta-xhair-t');
            const b = this.crosshair.querySelector('#gta-xhair-b');
            const l = this.crosshair.querySelector('#gta-xhair-l');
            const r = this.crosshair.querySelector('#gta-xhair-r');
            const pip = this.crosshair.querySelector('#gta-xhair-pip');
            if (ring) ring.setAttribute('stroke', hex);
            if (t) t.setAttribute('stroke', hex);
            if (b) b.setAttribute('stroke', hex);
            if (l) l.setAttribute('stroke', hex);
            if (r) r.setAttribute('stroke', hex);
            if (pip) pip.setAttribute('fill', hex === '#34c759' ? '#34c759' : '#ffd23f');
        }

        _flash(m) { this.msg = m; }

        _sync() {
            if (!this.info) return;
            const s = this.sel, c = s && s.c;
            let t = 'MAP EDITOR & MINECRAFT MODE   cam ' + this.cam.x.toFixed(0) + ' ' + this.cam.y.toFixed(0) + ' ' +
                this.cam.z.toFixed(0) + '   step ' + this.step.toFixed(2) +
                '   custom ' + (MapEditor.customBlocks ? MapEditor.customBlocks.length : 0) +
                '   [' + (this.game._locked ? 'POINTER CAPTURED' : 'CLICK TO CAPTURE') + ' · L toggle]\n';
            if (this.grabbing && s) {
                const name = s.block ? (s.block.isCarved ? 'Carved Piece' : s.block.type) : (s.g ? s.g.key : 'Object');
                t += '🟢 [GRABBING ' + name + '] dist ' + this.grabDist.toFixed(1) + 'm' +
                    (this.grabHeightOffset ? ' h+' + this.grabHeightOffset.toFixed(2) + 'm' : '') +
                    ' · Move mouse · Wheel dist · R/F turn · LMB/G drop · C clone · Del delete';
            } else if (!s) {
                t += 'Aim at anything · K to CARVE · E for 163 3D Models Inventory · LMB/RMB place · WASD fly';
            } else {
                const name = s.block ? (s.block.isCarved ? 'Carved Piece' : s.block.type) : (s.g ? s.g.key : 'Selected Object');
                t += name;
                if (c) {
                    t += '   ' + c.sx.toFixed(1) + '×' + c.sy.toFixed(1) + '×' + c.sz.toFixed(1) +
                        ' @ ' + c.x.toFixed(1) + ' ' + c.y.toFixed(1) + ' ' + c.z.toFixed(1);
                }
                t += '   [Click / G to GRAB · C to DUPLICATE · Del to DELETE · RMB deselect]';
            }
            if (this.msg && !this.grabbing) t += '   · ' + this.msg;
            this.info.textContent = t;
        }

        save() {
            MapEditor.saveWorld(this.game, this);
        }

        reset() {
            this.dirtyCols.clear(); this.dirtyInst.clear();
            this.added.length = 0; this.undo.length = 0;
            if (!window.filesystem || typeof window.filesystem.createFile !== 'function') return;
            const doc = { v: 2, base: this.base, cols: {}, add: [], inst: {}, mc_blocks: [] };
            window.filesystem.createFile(MAP_PATH, JSON.stringify(doc, null, 1)).then(() => {
                this.game.hud.toast('Edits cleared — restart Brow City to rebuild', '#ffb04b');
                this._flash('cleared'); this._sync();
            }).catch(() => {});
        }

        /* ---- Minecraft Creative Hotbar --------------------------------------- */
        _ensureHotbar() {
            if (this._hotbarEl) return;
            const doc = this.game.windowEl.ownerDocument || document;
            const wrapper = doc.createElement('div');
            wrapper.id = 'gta-minecraft-hotbar-wrapper';
            wrapper.style.cssText = 'position:absolute;bottom:18px;left:50%;transform:translateX(-50%);z-index:65;display:none;align-items:center;gap:8px;pointer-events:auto;user-select:none;';

            const prevBtn = doc.createElement('button');
            prevBtn.innerHTML = '◀';
            prevBtn.title = 'Previous Catalog Page [ [ ]';
            prevBtn.style.cssText = 'height:48px;padding:0 10px;background:rgba(18,24,36,0.9);border:1px solid rgba(63,208,255,0.4);border-radius:6px;color:#3fd0ff;font-size:16px;cursor:pointer;transition:all 0.12s;';
            prevBtn.addEventListener('click', (ev) => { ev.stopPropagation(); this.prevHotbarPage(); });
            wrapper.appendChild(prevBtn);

            const container = doc.createElement('div');
            container.id = 'gta-minecraft-hotbar';
            container.style.cssText = 'display:flex;gap:6px;padding:6px;background:rgba(12,16,24,0.9);border:2px solid rgba(63,208,255,0.3);border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,0.7);backdrop-filter:blur(10px);';
            wrapper.appendChild(container);

            const nextBtn = doc.createElement('button');
            nextBtn.innerHTML = '▶';
            nextBtn.title = 'Next Catalog Page [ ] ]';
            nextBtn.style.cssText = 'height:48px;padding:0 10px;background:rgba(18,24,36,0.9);border:1px solid rgba(63,208,255,0.4);border-radius:6px;color:#3fd0ff;font-size:16px;cursor:pointer;transition:all 0.12s;';
            nextBtn.addEventListener('click', (ev) => { ev.stopPropagation(); this.nextHotbarPage(); });
            wrapper.appendChild(nextBtn);

            const invBtn = doc.createElement('button');
            invBtn.innerHTML = '🎒 Inventory [E]';
            invBtn.title = 'Open Full 3D Model Inventory (163 items) [E]';
            invBtn.style.cssText = 'height:48px;padding:0 14px;background:rgba(63,208,255,0.15);border:2px solid #3fd0ff;border-radius:8px;color:#fff;font:bold 12px ui-monospace,monospace;cursor:pointer;display:flex;align-items:center;gap:6px;box-shadow:0 0 14px rgba(63,208,255,0.3);transition:all 0.15s;';
            invBtn.addEventListener('click', (ev) => { ev.stopPropagation(); this._openInventoryModal(); });
            wrapper.appendChild(invBtn);

            const label = doc.createElement('div');
            label.id = 'gta-hotbar-label';
            label.style.cssText = 'position:absolute;bottom:76px;left:50%;transform:translateX(-50%);color:#fff;font:bold 13px/1.4 ui-monospace,Consolas,monospace;text-shadow:0 2px 6px #000, 0 0 10px rgba(0,0,0,0.9);letter-spacing:0.8px;pointer-events:none;white-space:nowrap;background:rgba(0,0,0,0.7);padding:4px 12px;border-radius:6px;border:1px solid rgba(63,208,255,0.3);display:none;';
            this.game.windowEl.appendChild(label);
            this._hotbarLabelEl = label;

            this._slotEls = [];
            this._hotbarContainer = container;
            this._rebuildHotbarSlotsUI();

            this.game.windowEl.appendChild(wrapper);
            this._hotbarEl = wrapper;
            this._updateHotbarUI();
        }

        _rebuildHotbarSlotsUI() {
            if (!this._hotbarContainer) return;
            const doc = this.game.windowEl.ownerDocument || document;
            this._hotbarContainer.innerHTML = '';
            this._slotEls = [];

            this.hotbarSlots.forEach((b, idx) => {
                const slot = doc.createElement('div');
                slot.className = 'gta-mc-slot';
                slot.style.cssText = 'width:52px;height:52px;background:rgba(25,32,44,0.75);border:2px solid rgba(255,255,255,0.16);border-radius:6px;position:relative;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.12s ease;';
                slot.innerHTML = `
                    <span style="position:absolute;top:2px;left:4px;font:bold 10px monospace;color:#ffd23f;text-shadow:0 1px 2px #000;">${idx + 1}</span>
                    <span style="font-size:26px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.7));">${b.icon}</span>
                `;
                slot.title = `${idx + 1}: ${b.name} — ${b.desc || b.category}`;
                slot.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    this.selectBlockSlot(idx);
                });
                this._hotbarContainer.appendChild(slot);
                this._slotEls.push(slot);
            });
            this._updateHotbarUI();
        }

        _updateHotbarUI() {
            if (!this._hotbarEl) return;
            const block = this.hotbarSlots[this.selectedSlot] || this.hotbarSlots[0];
            this._slotEls.forEach((el, idx) => {
                if (idx === this.selectedSlot) {
                    el.style.border = '3px solid #ffd23f';
                    el.style.background = 'rgba(56, 78, 110, 0.95)';
                    el.style.boxShadow = '0 0 16px rgba(255, 210, 63, 0.75), inset 0 0 8px rgba(255, 210, 63, 0.3)';
                    el.style.transform = 'scale(1.1) translateY(-2px)';
                } else {
                    el.style.border = '2px solid rgba(255,255,255,0.16)';
                    el.style.background = 'rgba(25,32,44,0.75)';
                    el.style.boxShadow = 'none';
                    el.style.transform = 'scale(1) translateY(0)';
                }
            });
            if (this._hotbarLabelEl && block) {
                const deg = Math.round(this.selectedYaw * 180 / Math.PI);
                const tagInfo = block.isTool ? '<span style="color:#ff9800">[TOOL]</span>' : (block.isModel ? '<span style="color:#00e5ff">[3D MODEL]</span>' : '<span style="color:#2ecc71">[BLOCK]</span>');
                this._hotbarLabelEl.innerHTML = `<span style="color:#ffd23f">[${this.selectedSlot + 1}]</span> ${tagInfo} <b>${block.name}</b> <span style="opacity:0.75;font-weight:normal;">(${block.desc || block.category}) · Yaw ${deg}° [R: Turn · K: Carve · E: Inventory]</span>`;
            }
        }

        nextHotbarPage() {
            const totalPages = Math.ceil(MapEditor.CATALOG.length / 9);
            this.hotbarPage = (this.hotbarPage + 1) % totalPages;
            const start = this.hotbarPage * 9;
            this.hotbarSlots = MapEditor.CATALOG.slice(start, start + 9);
            while (this.hotbarSlots.length < 9) {
                this.hotbarSlots.push(MapEditor.CATALOG[0]);
            }
            this._rebuildHotbarSlotsUI();
            this.selectBlockSlot(this.selectedSlot);
            this._flash(`Catalog Page ${this.hotbarPage + 1} / ${totalPages}`);
        }

        prevHotbarPage() {
            const totalPages = Math.ceil(MapEditor.CATALOG.length / 9);
            this.hotbarPage = (this.hotbarPage - 1 + totalPages) % totalPages;
            const start = this.hotbarPage * 9;
            this.hotbarSlots = MapEditor.CATALOG.slice(start, start + 9);
            while (this.hotbarSlots.length < 9) {
                this.hotbarSlots.push(MapEditor.CATALOG[0]);
            }
            this._rebuildHotbarSlotsUI();
            this.selectBlockSlot(this.selectedSlot);
            this._flash(`Catalog Page ${this.hotbarPage + 1} / ${totalPages}`);
        }

        selectBlockSlot(idx) {
            if (idx < 0 || idx >= 9) return;
            this.selectedSlot = idx;
            this._ensureGhostMesh();
            this._updateHotbarUI();
            const b = this.hotbarSlots[idx];
            if (b) {
                this._flash(`Selected: ${b.name}`);
                this._sync();
            }
        }

        equipToHotbar(item) {
            this.hotbarSlots[this.selectedSlot] = item;
            this._rebuildHotbarSlotsUI();
            this.selectBlockSlot(this.selectedSlot);
            this.game.hud.toast(`🎒 Equipped ${item.name} into Slot ${this.selectedSlot + 1}!`, '#34c759');
            this._flash(`Equipped ${item.name}`);
        }

        /* ---- Creative Inventory Modal ----------------------------------------- */
        _ensureInventoryModal() {
            if (this._invModalEl) return;
            const doc = this.game.windowEl.ownerDocument || document;

            const overlay = doc.createElement('div');
            overlay.id = 'gta-creative-inventory-modal';
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(8,12,20,0.85);backdrop-filter:blur(8px);z-index:999;display:none;align-items:center;justify-content:center;font-family:ui-monospace,Consolas,monospace;user-select:none;';

            const modal = doc.createElement('div');
            modal.style.cssText = 'width:940px;max-width:94vw;height:680px;max-height:88vh;background:#101622;border:2px solid #3fd0ff;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.9), 0 0 30px rgba(63,208,255,0.2);display:flex;flex-direction:column;overflow:hidden;';

            const header = doc.createElement('div');
            header.style.cssText = 'padding:14px 20px;background:rgba(18,26,40,0.95);border-bottom:1px solid rgba(63,208,255,0.3);display:flex;align-items:center;justify-content:space-between;';
            header.innerHTML = `
                <div>
                    <div style="font-size:16px;font-weight:bold;color:#fff;display:flex;align-items:center;gap:8px;">
                        <span>🎒 CREATIVE INVENTORY</span>
                        <span style="background:rgba(63,208,255,0.2);color:#3fd0ff;font-size:11px;padding:2px 8px;border-radius:4px;border:1px solid rgba(63,208,255,0.4);">${MapEditor.CATALOG.length} ITEMS & 3D MODELS</span>
                    </div>
                    <div style="font-size:11px;color:#8ab4f8;margin-top:2px;">Click any item to equip it into Hotbar Slot <span id="gta-inv-slot-num" style="color:#ffd23f;font-weight:bold;">${this.selectedSlot + 1}</span> · Esc to close</div>
                </div>
                <button id="gta-inv-close-btn" style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#fff;font-size:18px;width:32px;height:32px;border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.15s;">✕</button>
            `;
            modal.appendChild(header);

            const controls = doc.createElement('div');
            controls.style.cssText = 'padding:12px 20px;background:rgba(14,20,32,0.85);border-bottom:1px solid rgba(255,255,255,0.08);display:flex;flex-direction:column;gap:10px;';

            const searchInput = doc.createElement('input');
            searchInput.type = 'text';
            searchInput.placeholder = '🔍 Search models, houses, cars, blocks... (e.g. villa, supercar, tree, ramp)';
            searchInput.style.cssText = 'width:100%;padding:9px 14px;background:rgba(22,32,50,0.9);border:1px solid rgba(63,208,255,0.4);border-radius:6px;color:#fff;font-size:13px;outline:none;font-family:inherit;box-sizing:border-box;';
            controls.appendChild(searchInput);

            const tabsContainer = doc.createElement('div');
            tabsContainer.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';

            const categories = [
                { id: 'all', label: `⭐ All (${MapEditor.CATALOG.length})` },
                { id: 'tools', label: '✂️ Tools' },
                { id: 'blocks', label: '🧱 Blocks' },
                { id: 'houses', label: '🏡 Houses (18)' },
                { id: 'buildings', label: '🏢 Buildings (29)' },
                { id: 'landmarks', label: '🗽 Landmarks (18)' },
                { id: 'props', label: '🌳 Props (16)' },
                { id: 'vehicles', label: '🚗 Vehicles (46)' },
                { id: 'characters', label: '🧍 Characters (9)' },
                { id: 'weapons', label: '⚔️ Weapons (4)' }
            ];

            let activeCategory = 'all';
            this._categoryTabBtns = [];

            categories.forEach(cat => {
                const btn = doc.createElement('button');
                btn.textContent = cat.label;
                btn.style.cssText = 'padding:5px 11px;background:rgba(25,36,54,0.8);border:1px solid rgba(255,255,255,0.15);border-radius:5px;color:#cfd8dc;font-size:11px;font-family:inherit;cursor:pointer;transition:all 0.12s;';
                if (cat.id === 'all') {
                    btn.style.background = '#3fd0ff';
                    btn.style.color = '#000';
                    btn.style.fontWeight = 'bold';
                    btn.style.borderColor = '#3fd0ff';
                }
                btn.addEventListener('click', () => {
                    activeCategory = cat.id;
                    this._categoryTabBtns.forEach(b => {
                        b.style.background = 'rgba(25,36,54,0.8)';
                        b.style.color = '#cfd8dc';
                        b.style.fontWeight = 'normal';
                        b.style.borderColor = 'rgba(255,255,255,0.15)';
                    });
                    btn.style.background = '#3fd0ff';
                    btn.style.color = '#000';
                    btn.style.fontWeight = 'bold';
                    btn.style.borderColor = '#3fd0ff';
                    renderGrid();
                });
                tabsContainer.appendChild(btn);
                this._categoryTabBtns.push(btn);
            });
            controls.appendChild(tabsContainer);
            modal.appendChild(controls);

            const grid = doc.createElement('div');
            grid.style.cssText = 'flex:1;padding:16px 20px;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill, minmax(130px, 1fr));gap:10px;align-content:start;background:rgba(10,14,22,0.95);';
            modal.appendChild(grid);

            const footer = doc.createElement('div');
            footer.style.cssText = 'padding:10px 20px;background:rgba(16,22,34,0.95);border-top:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:space-between;font-size:11px;color:#90caf9;';
            footer.innerHTML = `
                <div>Press <b style="color:#ffd23f">E</b> or <b style="color:#ffd23f">Esc</b> to close · Hover for dimensions</div>
                <div id="gta-inv-count-label" style="color:#cfd8dc;">Showing ${MapEditor.CATALOG.length} items</div>
            `;
            modal.appendChild(footer);

            overlay.appendChild(modal);
            doc.body.appendChild(overlay);

            this._invModalEl = overlay;
            this._invSearchInput = searchInput;
            this._invGrid = grid;
            this._invCountLabel = footer.querySelector('#gta-inv-count-label');

            const closeBtn = header.querySelector('#gta-inv-close-btn');
            closeBtn.addEventListener('click', () => this._closeInventoryModal());

            overlay.addEventListener('click', (ev) => {
                if (ev.target === overlay) this._closeInventoryModal();
            });

            searchInput.addEventListener('input', () => renderGrid());

            const renderGrid = () => {
                grid.innerHTML = '';
                const q = (searchInput.value || '').toLowerCase().trim();
                const filtered = MapEditor.CATALOG.filter(item => {
                    if (activeCategory !== 'all' && item.category !== activeCategory) return false;
                    if (q) {
                        return item.name.toLowerCase().includes(q) ||
                               (item.desc && item.desc.toLowerCase().includes(q)) ||
                               (item.category && item.category.toLowerCase().includes(q)) ||
                               item.id.toLowerCase().includes(q);
                    }
                    return true;
                });

                this._invCountLabel.textContent = `Showing ${filtered.length} of ${MapEditor.CATALOG.length} items`;

                filtered.forEach(item => {
                    const card = doc.createElement('div');
                    card.className = 'gta-inv-card';
                    card.style.cssText = 'background:rgba(24,34,50,0.85);border:1px solid rgba(63,208,255,0.2);border-radius:8px;padding:10px 8px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;cursor:pointer;transition:all 0.12s ease;position:relative;';
                    const dimStr = item.size ? `${item.size.sx}×${item.size.sy}×${item.size.sz}m` : '';
                    card.innerHTML = `
                        <div style="font-size:32px;line-height:1;margin-bottom:6px;filter:drop-shadow(0 2px 5px rgba(0,0,0,0.6));">${item.icon}</div>
                        <div style="font-size:11px;font-weight:bold;color:#fff;line-height:1.2;margin-bottom:3px;word-break:break-word;">${item.name}</div>
                        <div style="font-size:9px;color:#3fd0ff;opacity:0.85;text-transform:uppercase;letter-spacing:0.5px;">${item.category}</div>
                    `;
                    card.title = `${item.name}
${item.desc || ''}
Category: ${item.category}${dimStr ? '\nSize: ' + dimStr : ''}
Click to equip to active hotbar slot`;

                    card.addEventListener('mouseenter', () => {
                        card.style.background = 'rgba(40,58,84,0.95)';
                        card.style.borderColor = '#ffd23f';
                        card.style.transform = 'translateY(-2px) scale(1.03)';
                        card.style.boxShadow = '0 6px 16px rgba(0,0,0,0.5), 0 0 12px rgba(255,210,63,0.3)';
                    });
                    card.addEventListener('mouseleave', () => {
                        card.style.background = 'rgba(24,34,50,0.85)';
                        card.style.borderColor = 'rgba(63,208,255,0.2)';
                        card.style.transform = 'translateY(0) scale(1)';
                        card.style.boxShadow = 'none';
                    });

                    card.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        this.equipToHotbar(item);
                        this._closeInventoryModal();
                    });

                    grid.appendChild(card);
                });
            };

            this._renderInvGrid = renderGrid;
        }

        _openInventoryModal() {
            this._ensureInventoryModal();
            this.invOpen = true;
            const doc = this.game.windowEl.ownerDocument || document;
            if (doc.pointerLockElement) {
                try { doc.exitPointerLock(); } catch (_) {}
            }
            const slotNumEl = this._invModalEl.querySelector('#gta-inv-slot-num');
            if (slotNumEl) slotNumEl.textContent = String(this.selectedSlot + 1);

            this._invModalEl.style.display = 'flex';
            if (this._renderInvGrid) this._renderInvGrid();
            if (this._invSearchInput) {
                this._invSearchInput.value = '';
                setTimeout(() => { try { this._invSearchInput.focus(); } catch (_) {} }, 50);
            }
        }

        _closeInventoryModal() {
            if (!this._invModalEl) return;
            this.invOpen = false;
            this._invModalEl.style.display = 'none';
            const g = this.game;
            if (g._lockSupported && !g._locked) {
                try { g.canvas.requestPointerLock(); } catch (_) {}
            }
            this._updateHotbarUI();
            this._ensureGhostMesh();
        }

        /* ---- Minecraft HUD & Ghost Hologram ----------------------------------- */
        _ensureMcHud() {
            if (this._mcHudEl) return;
            const doc = this.game.windowEl.ownerDocument || document;
            const el = doc.createElement('div');
            el.id = 'gta-minecraft-hud';
            el.style.cssText = 'position:absolute;top:12px;right:12px;z-index:60;background:rgba(10,16,26,0.92);border:1px solid rgba(63,208,255,0.4);border-radius:8px;padding:12px 16px;font:11px/1.55 ui-monospace,Consolas,monospace;color:#d0e8ff;box-shadow:0 6px 24px rgba(0,0,0,0.6);pointer-events:none;text-shadow:0 1px 2px #000;display:none;';
            el.innerHTML = `
                <div style="color:#3fd0ff;font-weight:bold;font-size:13px;margin-bottom:6px;display:flex;align-items:center;gap:6px;">
                    <span>⛏️ MINECRAFT CREATIVE MODE</span>
                    <span id="gta-flight-badge" style="background:#27ae60;color:#fff;font-size:9px;padding:1px 5px;border-radius:3px;">FLYING</span>
                </div>
                <div><b style="color:#ffd23f">✂️ K:</b> CARVE piece out of ANY surface</div>
                <div><b style="color:#3fd0ff">🎒 E:</b> Open 3D Models Inventory (163 Items)</div>
                <div><b style="color:#ffd23f">RMB:</b> Place Active Block / 3D Model</div>
                <div><b style="color:#ff5f56">LMB:</b> Break Block / Grab / Drop</div>
                <div><b style="color:#34c759">Click / G:</b> Select & Grab ANY World Object</div>
                <div><b style="color:#2ecc71">C:</b> Duplicate / Clone Selected Object</div>
                <div><b style="color:#ff5f56">Del / X:</b> Delete Selected Object</div>
                <div><b style="color:#fff">1 – 9 / Scroll:</b> Select Hotbar Slot</div>
                <div><b style="color:#fff">[ / ]:</b> Previous / Next Hotbar Page</div>
                <div><b style="color:#fff">R / F:</b> Rotate Yaw · <b style="color:#fff">Wheel:</b> Distance</div>
                <div><b style="color:#2ecc71">V:</b> Flight · <b style="color:#fff">Z:</b> Undo · <b style="color:#fff">O:</b> Save World</div>
                <div style="margin-top:6px;color:#8ab4f8"><b style="color:#8ab4f8">B or F2:</b> Exit / Resume Game</div>
            `;
            this.game.windowEl.appendChild(el);
            this._mcHudEl = el;
            this._flightBadgeEl = el.querySelector('#gta-flight-badge');
        }

        _ensureGhostMesh() {
            if (this._ghostMesh) {
                if (this._ghostMesh.parent) this._ghostMesh.parent.remove(this._ghostMesh);
                MapEditor.disposeHierarchy(this._ghostMesh);
                this._ghostMesh = null;
            }
            const blockDef = this.hotbarSlots[this.selectedSlot] || this.hotbarSlots[0];
            if (!blockDef) return;
            this._ghostMesh = MapEditor.createBlockMesh(blockDef, true, this.game.assets);
            this._ghostMesh.visible = false;
            this.game.scene.add(this._ghostMesh);
        }

        _updatePlacementTarget() {
            if (!this._ghostMesh) return;
            const g = this.game;
            const c = g.camera;
            const cy = Math.cos(this.cam.pitch);
            const fx = -Math.sin(this.cam.yaw) * cy;
            const fy = Math.sin(this.cam.pitch);
            const fz = -Math.cos(this.cam.yaw) * cy;
            const ro = c.position;
            const rd = { x: fx, y: fy, z: fz };

            const blockDef = this.hotbarSlots[this.selectedSlot] || this.hotbarSlots[0];
            if (!blockDef) return;

            const snapGrid = (blockDef.id === 'road' || blockDef.id === 'ramp') ? 2.0 : 1.0;
            let targetX = 0, targetY = 0, targetZ = 0;
            let foundHit = false;

            if (g._customBlocksGroup && g._customBlocksGroup.children.length > 0) {
                this._customRaycaster.set(ro, new THREE.Vector3(rd.x, rd.y, rd.z));
                const hits = this._customRaycaster.intersectObjects(g._customBlocksGroup.children, true);
                if (hits.length > 0 && hits[0].distance < 80) {
                    const h = hits[0];
                    let topObj = h.object;
                    while (topObj.parent && topObj.parent !== g._customBlocksGroup) {
                        topObj = topObj.parent;
                    }
                    if (topObj && topObj.userData && topObj.userData.mcBlockId) {
                        const norm = h.face ? h.face.normal.clone().applyQuaternion(topObj.quaternion) : new THREE.Vector3(0, 1, 0);
                        const hitDef = MapEditor.CATALOG.find(b => b.id === topObj.userData.blockType) || blockDef;
                        const hsy = (hitDef.size ? hitDef.size.sy : 2);
                        const bsy = (blockDef.size ? blockDef.size.sy : 2);

                        if (Math.abs(norm.y) > 0.7) {
                            targetX = topObj.position.x;
                            targetZ = topObj.position.z;
                            targetY = norm.y > 0 ? (topObj.position.y + hsy / 2 + bsy / 2) : (topObj.position.y - hsy / 2 - bsy / 2);
                        } else if (Math.abs(norm.x) > 0.7) {
                            const dir = norm.x > 0 ? 1 : -1;
                            const hsx = (hitDef.size ? hitDef.size.sx : 2);
                            const bsx = (blockDef.size ? blockDef.size.sx : 2);
                            targetX = topObj.position.x + dir * (hsx / 2 + bsx / 2);
                            targetY = topObj.position.y;
                            targetZ = topObj.position.z;
                        } else {
                            const dir = norm.z > 0 ? 1 : -1;
                            const hsz = (hitDef.size ? hitDef.size.sz : 2);
                            const bsz = (blockDef.size ? blockDef.size.sz : 2);
                            targetX = topObj.position.x;
                            targetY = topObj.position.y;
                            targetZ = topObj.position.z + dir * (hsz / 2 + bsz / 2);
                        }
                        foundHit = true;
                    }
                }
            }

            if (!foundHit) {
                const hit = g.physics.raycast(ro.x, ro.y, ro.z, rd.x, rd.y, rd.z, 90, this._q);
                const bsy = (blockDef.size ? blockDef.size.sy : 2);
                if (hit) {
                    targetX = Math.round(hit.x / snapGrid) * snapGrid;
                    targetZ = Math.round(hit.z / snapGrid) * snapGrid;
                    targetY = blockDef.isModel ? hit.y : (hit.y + bsy / 2);
                    foundHit = true;
                } else {
                    const dist = 12;
                    targetX = Math.round((ro.x + rd.x * dist) / snapGrid) * snapGrid;
                    targetY = Math.max(bsy / 2, Math.round((ro.y + rd.y * dist) / 0.5) * 0.5);
                    targetZ = Math.round((ro.z + rd.z * dist) / snapGrid) * snapGrid;
                }
            }

            this._ghostPos.set(targetX, targetY, targetZ);
            this._ghostMesh.position.set(targetX, targetY, targetZ);
            this._ghostMesh.rotation.y = this.selectedYaw;
            this._ghostMesh.visible = true;
        }

        _placeBlock() {
            const blockDef = this.hotbarSlots[this.selectedSlot] || this.hotbarSlots[0];
            if (!blockDef) return;
            const pos = this._ghostPos;
            const yaw = this.selectedYaw;
            const id = 'mc_' + Date.now() + '_' + Math.floor(Math.random() * 100000);

            if (!this.game._customBlocksGroup) {
                this.game._customBlocksGroup = new THREE.Group();
                this.game._customBlocksGroup.name = 'MinecraftCustomBlocks';
                this.game.scene.add(this.game._customBlocksGroup);
            }

            const mesh = MapEditor.createBlockMesh(blockDef, false, this.game.assets);
            mesh.position.set(pos.x, pos.y, pos.z);
            mesh.rotation.y = yaw;
            mesh.userData = {
                mcBlockId: id,
                blockType: blockDef.id,
                isModel: !!blockDef.isModel,
                modelCategory: blockDef.modelCategory,
                modelKey: blockDef.modelKey
            };
            this.game._customBlocksGroup.add(mesh);

            const bbox = new THREE.Box3().setFromObject(mesh);
            const sx = Math.max(0.6, bbox.max.x - bbox.min.x);
            const sy = Math.max(0.6, bbox.max.y - bbox.min.y);
            const sz = Math.max(0.6, bbox.max.z - bbox.min.z);
            const cy = (bbox.max.y + bbox.min.y) / 2;

            const col = {
                x: pos.x,
                y: blockDef.isModel ? cy : pos.y,
                z: pos.z,
                sx: blockDef.size ? blockDef.size.sx : sx,
                sy: blockDef.size ? blockDef.size.sy : sy,
                sz: blockDef.size ? blockDef.size.sz : sz,
                yaw: yaw,
                tag: blockDef.tag || 'mc_custom',
                mcBlockId: id
            };
            mesh.userData.col = col;
            this.game.physics.colliders.push(col);

            const blockRecord = {
                id,
                type: blockDef.id,
                x: pos.x,
                y: pos.y,
                z: pos.z,
                yaw: yaw,
                isModel: !!blockDef.isModel,
                modelCategory: blockDef.modelCategory,
                modelKey: blockDef.modelKey,
                mesh,
                col
            };
            MapEditor.customBlocks.push(blockRecord);

            this.undo.push({ type: 'place_mc', block: blockRecord });
            if (this.undo.length > 80) this.undo.shift();

            this.game.physics.rebuild();
            this._playPlaceSound();
            this._spawnPlacePuff(pos, blockDef.color || 0x3fd0ff);

            MapEditor.saveWorld(this.game, this);
            this.game.hud.toast(`🧱 Placed ${blockDef.name} at (${pos.x.toFixed(0)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(0)})`, '#34c759');
            this._flash(`Placed ${blockDef.name}`);
            this._sync();
        }

        _breakBlock() {
            const g = this.game;
            if (!g._customBlocksGroup || g._customBlocksGroup.children.length === 0) return false;
            const c = g.camera;
            const cy = Math.cos(this.cam.pitch);
            const fx = -Math.sin(this.cam.yaw) * cy;
            const fy = Math.sin(this.cam.pitch);
            const fz = -Math.cos(this.cam.yaw) * cy;

            this._customRaycaster.set(c.position, new THREE.Vector3(fx, fy, fz));
            const hits = this._customRaycaster.intersectObjects(g._customBlocksGroup.children, true);
            if (hits.length === 0 || hits[0].distance > 100) return false;

            let topObj = hits[0].object;
            while (topObj.parent && topObj.parent !== g._customBlocksGroup) {
                topObj = topObj.parent;
            }
            if (!topObj || !topObj.userData || !topObj.userData.mcBlockId) return false;

            const blockId = topObj.userData.mcBlockId;
            const idx = MapEditor.customBlocks.findIndex(b => b.id === blockId);
            if (idx === -1) return false;

            const blockRecord = MapEditor.customBlocks[idx];
            const blockDef = MapEditor.CATALOG.find(b => b.id === blockRecord.type) || { name: 'Custom Block', color: 0x8c9098 };

            this._spawnBreakParticles(topObj.position, blockRecord.color || blockDef.color);
            this._playBreakSound();

            if (blockRecord.col) {
                MapEditor.kill(blockRecord.col);
            }

            g._customBlocksGroup.remove(topObj);
            MapEditor.disposeHierarchy(topObj);

            MapEditor.customBlocks.splice(idx, 1);
            this.undo.push({ type: 'break_mc', block: blockRecord });
            if (this.undo.length > 80) this.undo.shift();

            g.physics.rebuild();
            MapEditor.saveWorld(g, this);

            g.hud.toast(`💥 Destroyed ${blockRecord.isCarved ? 'carved piece' : blockDef.name}!`, '#ff5f56');
            this._flash(`Destroyed ${blockDef.name}`);
            this._sync();
            return true;
        }

        /* ---- Audio synthesis -------------------------------------------------- */
        _playPlaceSound() {
            try {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (!this._audioCtx && AC) this._audioCtx = new AC();
                if (this._audioCtx && this._audioCtx.state === 'suspended') this._audioCtx.resume();
                if (!this._audioCtx) return;
                const ctx = this._audioCtx;
                const t = ctx.currentTime;
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(220, t);
                osc.frequency.exponentialRampToValueAtTime(70, t + 0.08);
                gain.gain.setValueAtTime(0.35, t);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(t);
                osc.stop(t + 0.08);
            } catch (_) {}
        }

        _playBreakSound() {
            try {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (!this._audioCtx && AC) this._audioCtx = new AC();
                if (this._audioCtx && this._audioCtx.state === 'suspended') this._audioCtx.resume();
                if (!this._audioCtx) return;
                const ctx = this._audioCtx;
                const t = ctx.currentTime;
                const bufferSize = Math.floor(ctx.sampleRate * 0.1);
                const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) {
                    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
                }
                const noise = ctx.createBufferSource();
                noise.buffer = buffer;
                const filter = ctx.createBiquadFilter();
                filter.type = 'bandpass';
                filter.frequency.setValueAtTime(900, t);
                filter.Q.setValueAtTime(1.5, t);
                const gain = ctx.createGain();
                gain.gain.setValueAtTime(0.4, t);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
                noise.connect(filter);
                filter.connect(gain);
                gain.connect(ctx.destination);
                noise.start(t);
            } catch (_) {}
        }

        _playChiselSound() {
            try {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (!this._audioCtx && AC) this._audioCtx = new AC();
                if (this._audioCtx && this._audioCtx.state === 'suspended') this._audioCtx.resume();
                if (!this._audioCtx) return;
                const ctx = this._audioCtx;
                const t = ctx.currentTime;

                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(1800, t);
                osc.frequency.exponentialRampToValueAtTime(400, t + 0.06);
                gain.gain.setValueAtTime(0.4, t);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.06);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(t);
                osc.stop(t + 0.06);

                const bufferSize = Math.floor(ctx.sampleRate * 0.08);
                const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) {
                    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
                }
                const noise = ctx.createBufferSource();
                noise.buffer = buffer;
                const filter = ctx.createBiquadFilter();
                filter.type = 'bandpass';
                filter.frequency.setValueAtTime(800, t);
                const ngain = ctx.createGain();
                ngain.gain.setValueAtTime(0.3, t);
                ngain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);
                noise.connect(filter);
                filter.connect(ngain);
                gain.connect(ctx.destination);
                noise.start(t);
            } catch (_) {}
        }

        /* ---- Particles -------------------------------------------------------- */
        _spawnBreakParticles(pos, color) {
            if (!this.game || !this.game.scene) return;
            const count = 12;
            const geo = new THREE.BoxGeometry(0.25, 0.25, 0.25);
            const mat = new THREE.MeshBasicMaterial({ color: color || 0x888888 });
            for (let i = 0; i < count; i++) {
                const p = new THREE.Mesh(geo, mat);
                p.position.set(
                    pos.x + (Math.random() - 0.5) * 1.4,
                    pos.y + (Math.random() - 0.5) * 1.4,
                    pos.z + (Math.random() - 0.5) * 1.4
                );
                this.game.scene.add(p);
                this._activeParticles.push({
                    mesh: p,
                    vx: (Math.random() - 0.5) * 8,
                    vy: Math.random() * 5 + 3,
                    vz: (Math.random() - 0.5) * 8,
                    rx: (Math.random() - 0.5) * 12,
                    ry: (Math.random() - 0.5) * 12,
                    life: 0.5,
                    maxLife: 0.5
                });
            }
        }

        _spawnCarveParticles(pos, normal, color) {
            if (!this.game || !this.game.scene) return;
            const count = 16;
            const geo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
            const mat = new THREE.MeshBasicMaterial({ color: color || 0xcccccc });
            for (let i = 0; i < count; i++) {
                const p = new THREE.Mesh(geo, mat);
                p.position.copy(pos).add(new THREE.Vector3(
                    (Math.random() - 0.5) * 0.5,
                    (Math.random() - 0.5) * 0.5,
                    (Math.random() - 0.5) * 0.5
                ));
                this.game.scene.add(p);
                const speed = Math.random() * 6 + 3;
                this._activeParticles.push({
                    mesh: p,
                    vx: normal.x * speed + (Math.random() - 0.5) * 4,
                    vy: Math.max(1, normal.y * speed) + Math.random() * 4,
                    vz: normal.z * speed + (Math.random() - 0.5) * 4,
                    rx: (Math.random() - 0.5) * 15,
                    ry: (Math.random() - 0.5) * 15,
                    life: 0.45,
                    maxLife: 0.45
                });
            }
        }

        _spawnPlacePuff(pos, color) {
            if (!this.game || !this.game.scene) return;
            const count = 6;
            const geo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
            const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
            for (let i = 0; i < count; i++) {
                const p = new THREE.Mesh(geo, mat);
                p.position.set(
                    pos.x + (Math.random() - 0.5) * 1.8,
                    pos.y - 0.3,
                    pos.z + (Math.random() - 0.5) * 1.8
                );
                this.game.scene.add(p);
                this._activeParticles.push({
                    mesh: p,
                    vx: (Math.random() - 0.5) * 3,
                    vy: Math.random() * 2 + 1,
                    vz: (Math.random() - 0.5) * 3,
                    rx: 0,
                    ry: 0,
                    life: 0.35,
                    maxLife: 0.35
                });
            }
        }

        _updateParticles(dt) {
            for (let i = this._activeParticles.length - 1; i >= 0; i--) {
                const p = this._activeParticles[i];
                p.life -= dt;
                if (p.life <= 0) {
                    if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
                    p.mesh.geometry.dispose();
                    p.mesh.material.dispose();
                    this._activeParticles.splice(i, 1);
                    continue;
                }
                p.vy -= 18 * dt;
                p.mesh.position.x += p.vx * dt;
                p.mesh.position.y += p.vy * dt;
                p.mesh.position.z += p.vz * dt;
                p.mesh.rotation.x += p.rx * dt;
                p.mesh.rotation.y += p.ry * dt;
                const scale = Math.max(0.01, p.life / p.maxLife);
                p.mesh.scale.set(scale, scale, scale);
            }
        }

        destroy() {
            if (this.on) {
                try { this.toggle(); } catch (e) {}
            }
            if (this._ghostMesh) {
                try { this.game.scene.remove(this._ghostMesh); } catch (_) {}
                MapEditor.disposeHierarchy(this._ghostMesh);
                this._ghostMesh = null;
            }
            if (this._hotbarEl && this._hotbarEl.parentElement) {
                this._hotbarEl.parentElement.removeChild(this._hotbarEl);
                this._hotbarEl = null;
            }
            if (this._hotbarLabelEl && this._hotbarLabelEl.parentElement) {
                this._hotbarLabelEl.parentElement.removeChild(this._hotbarLabelEl);
                this._hotbarLabelEl = null;
            }
            if (this._mcHudEl && this._mcHudEl.parentElement) {
                this._mcHudEl.parentElement.removeChild(this._mcHudEl);
                this._mcHudEl = null;
            }
            if (this._invModalEl && this._invModalEl.parentElement) {
                this._invModalEl.parentElement.removeChild(this._invModalEl);
                this._invModalEl = null;
            }
            if (this.wire) {
                try { this.game.scene.remove(this.wire); } catch (e) {}
                if (this.wire.geometry) try { this.wire.geometry.dispose(); } catch (e) {}
                if (this.wire.material) try { this.wire.material.dispose(); } catch (e) {}
                this.wire = null;
            }
            if (this.selWire) {
                try { this.game.scene.remove(this.selWire); } catch (e) {}
                if (this.selWire.geometry) try { this.selWire.geometry.dispose(); } catch (e) {}
                if (this.selWire.material) try { this.selWire.material.dispose(); } catch (e) {}
                this.selWire = null;
            }
        }
    }

    MapEditor.EDGES = [
        0, 1, 1, 5, 5, 4, 4, 0,   // floor
        2, 3, 3, 7, 7, 6, 6, 2,   // ceiling
        0, 2, 1, 3, 4, 6, 5, 7,   // uprights
    ];
    MapEditor.HELP = [
        'K                   CARVE piece out of ANY surface at aim',
        'E                   Open Full 3D Model Inventory (163 items)',
        'RMB (Right-Click)   PLACE active block / 3D model',
        'LMB (Left-Click)    BREAK block under crosshair / Grab / Drop',
        'Click / G           SELECT & GRAB any object in the world',
        'C                   DUPLICATE / CLONE selected object',
        'Del / X             DELETE selected object',
        '1 – 9 / Mouse Wheel SELECT hotbar slot',
        '[ / ]               PREV / NEXT hotbar catalog page',
        'R / F               ROTATE block yaw 90° / 5°',
        'Wheel               distance closer/farther (when grabbing)',
        'V                   TOGGLE Creative Flight mode',
        'WASD Space Q        fly camera (Shift fast · Ctrl slow)',
        'Z                   UNDO block placement / destruction',
        'O                   SAVE custom blocks & map patch',
        'B or F2             EXIT / RESUME normal gameplay',
    ].join('\n');
