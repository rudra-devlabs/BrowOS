// ===========================================================================
    // VEHICLES — NYC fleet, instanced rendering, arcade sim, enter/exit
    // ===========================================================================
    /**
     * Fleet blueprints. Local frame: front = -z, +x = right, origin at
     * ground center. Body panels are vertex-white so instanceColor paints
     * the car; glass / trim / lights are baked.
     * hp = hull strength: heavies shrug off crashes and gunfire that would
     * total a coupe. Light/fast cars stay fragile by design.
     */
    const VEHICLE_TYPES = {
        // --- 1. Civilian & Luxury Road Fleet ---
        // top = m/s, accel = launch m/s^2, brake = m/s^2 service braking.
        // Calibrated vs real-world equivalents (0-60 mph + governed top speed,
        // sim-verified through this game's own gear/torque curve — e.g. a
        // Camry-class 7.6 s / 131 mph -> accel 5.5; Chiron-class 2.8 s /
        // 217 mph -> accel 10.9). Old values launched at ~3.5 g; family cars
        // now launch at ~0.4-0.8 g like the real thing.
        sedan:           { name: 'Sentinel Sedan',        L: 4.96, W: 2.00, H: 1.52, top: 58.6, accel: 5.5, brake: 9.5, pool: 14, hp: 750 }, // Camry 7.6s/131mph
        compact:         { name: 'Dilettante Compact',    L: 3.96, W: 2.00, H: 1.54, top: 49.2, accel: 4.6, brake: 9.0, pool: 12, hp: 650 }, // Civic 9.8s/110mph
        coupe:           { name: 'Banshee GT Coupe',      L: 4.71, W: 2.00, H: 1.38, top: 85.8, accel: 8.9, brake: 11.5, pool: 12, hp: 700 }, // 911 Turbo 3.6s/192mph
        wagon:           { name: 'Regina Station Wagon',  L: 5.11, W: 2.00, H: 1.61, top: 58.1, accel: 5.3, brake: 9.5, pool: 10, hp: 750 }, // Passat wagon 8.0s/130mph
        suv:             { name: 'Patriot 4x4 SUV',       L: 5.21, W: 2.03, H: 1.91, top: 50.1, accel: 5.4, brake: 8.5, pool: 12, hp: 950 }, // Wrangler 8.4s/112mph
        pickup:          { name: 'Bobcat Heavy Pickup',   L: 6.06, W: 2.10, H: 2.04, top: 50.1, accel: 6.4, brake: 8.0, pool: 10, hp: 1050 }, // F-150 7.0s/112mph
        luxury_sedan:    { name: 'Cognoscenti V12',       L: 5.86, W: 2.02, H: 1.63, top: 69.3, accel: 8.1, brake: 11.0, pool: 6,  hp: 850 }, // S63 4.4s/155mph
        luxury_limo:     { name: 'Presidential Limousine',L: 9.06, W: 2.10, H: 1.71, top: 53.6, accel: 5.0, brake: 7.5, pool: 4,  hp: 1200 }, // stretched S 8.8s/120mph
        limo:            { name: 'Presidential Limousine',L: 9.06, W: 2.10, H: 1.71, top: 53.6, accel: 5.0, brake: 7.5, pool: 4,  hp: 1200 },
        supercar:        { name: 'Infernus Hyper GT',     L: 5.02, W: 2.02, H: 1.23, top: 97.0, accel: 10.9, brake: 13.0, pool: 6,  hp: 700 }, // Chiron 2.8s/217mph
        supercar_hyper:  { name: 'Infernus Hyper GT',     L: 5.02, W: 2.02, H: 1.23, top: 97.0, accel: 10.9, brake: 13.0, pool: 6,  hp: 700 },
        supercar_track:  { name: 'Turismo Track Edition', L: 4.82, W: 2.00, H: 1.26, top: 89.4, accel: 10.1, brake: 13.0, pool: 6,  hp: 680 }, // 911 GT3 3.1s/200mph
        taxi:            { name: 'Metro Cabbie',          L: 5.21, W: 2.00, H: 1.82, top: 57.7, accel: 5.1, brake: 9.0, pool: 12, hp: 750 }, // hybrid cab 8.4s/129mph

        // --- 2. Emergency & Public Municipal Fleet ---
        police:          { name: 'Metro Police Cruiser',  L: 5.48, W: 2.00, H: 1.75, top: 67.1, accel: 6.3, brake: 11.0, pool: 10, hp: 950 }, // Charger Pursuit 5.8s/150mph
        police_cruiser:  { name: 'Metro Police Cruiser',  L: 5.48, W: 2.00, H: 1.75, top: 67.1, accel: 6.3, brake: 11.0, pool: 10, hp: 950 },
        police_suv:      { name: 'Police Tactical SUV',   L: 5.68, W: 2.08, H: 2.21, top: 61.2, accel: 5.9, brake: 9.5, pool: 6,  hp: 1200 }, // Tahoe PPV 6.8s/137mph
        police_enforcer: { name: 'SWAT Heavy Enforcer',   L: 7.23, W: 2.45, H: 3.13, top: 38.0, accel: 4.8, brake: 7.0, pool: 6,  hp: 1800 }, // BearCat 12s/85mph
        ambulance:       { name: 'EMS Rescue Ambulance',  L: 6.96, W: 2.38, H: 3.18, top: 44.7, accel: 4.4, brake: 7.0, pool: 5,  hp: 1200 }, // Type III 11s/100mph
        firetruck:       { name: 'Ladder 1 Fire Brigade', L: 8.66, W: 2.55, H: 3.33, top: 33.5, accel: 4.0, brake: 6.0, pool: 4,  hp: 1500 }, // ladder truck 16s/75mph
        garbage:         { name: 'City Trashmaster',      L: 8.70, W: 2.55, H: 3.66, top: 29.1, accel: 3.2, brake: 5.5, pool: 4,  hp: 1900 }, // refuse truck 24s/65mph
        garbage_truck:   { name: 'City Trashmaster',      L: 8.70, W: 2.55, H: 3.66, top: 29.1, accel: 3.2, brake: 5.5, pool: 4,  hp: 1500 },
        bus:             { name: 'Metro Transit City Bus',L: 12.06,W: 2.55, H: 3.21, top: 29.1, accel: 3.1, brake: 6.0, pool: 4,  hp: 1800 }, // city bus 22s/65mph
        bus_city:        { name: 'Metro Transit City Bus',L: 12.06,W: 2.55, H: 3.21, top: 29.1, accel: 3.1, brake: 6.0, pool: 4,  hp: 1800 },
        bus_coach:       { name: 'Grand Horizon Coach',   L: 12.76,W: 2.55, H: 3.71, top: 33.5, accel: 3.2, brake: 6.0, pool: 4,  hp: 1800 }, // coach 20s/75mph
        schoolbus:       { name: 'School Bus Coach',      L: 12.76,W: 2.55, H: 3.71, top: 29.1, accel: 3.1, brake: 6.0, pool: 4,  hp: 1800 },
        truck:           { name: 'Industrial Box Truck',  L: 8.06, W: 2.50, H: 3.56, top: 33.5, accel: 3.6, brake: 6.0, pool: 5,  hp: 1500 }, // box truck 18s/75mph
        truck_box:       { name: 'Industrial Box Truck',  L: 8.06, W: 2.50, H: 3.56, top: 33.5, accel: 3.6, brake: 6.0, pool: 5,  hp: 1500 },
        semi:            { name: 'Titan Hauler Semi',     L: 7.36, W: 2.62, H: 3.85, top: 33.5, accel: 2.9, brake: 5.5, pool: 4,  hp: 2200 }, // loaded semi 22s/75mph
        truck_semi:      { name: 'Titan Hauler Semi',     L: 7.36, W: 2.62, H: 3.85, top: 33.5, accel: 2.9, brake: 5.5, pool: 4,  hp: 2200 },

        // --- 3. Motorcycles (2-Wheel Steering Physics) ---
        motorcycle:      { name: 'NRG-1000 Superbike',    L: 2.13, W: 0.82, H: 1.32, top: 83.1, accel: 10.8, brake: 12.0, pool: 6,  hp: 400,  isBike: true }, // S1000RR 3.0s/186mph
        bike_sport:      { name: 'NRG-1000 Superbike',    L: 2.13, W: 0.82, H: 1.32, top: 83.1, accel: 10.8, brake: 12.0, pool: 6,  hp: 400,  isBike: true },
        bike_cruiser:    { name: 'Highway V-Twin Chopper',L: 2.35, W: 0.90, H: 1.32, top: 49.2, accel: 9.5, brake: 9.0, pool: 6,  hp: 450,  isBike: true }, // Fat Boy 4.8s/110mph
        bike_dirt:       { name: 'Sanchez Motocross',     L: 2.13, W: 0.85, H: 1.32, top: 40.2, accel: 10.2, brake: 9.0, pool: 6,  hp: 420,  isBike: true }, // 450 MX 5.2s/90mph
        scooter:         { name: 'City Vespa Scooter',    L: 1.95, W: 0.70, H: 1.20, top: 27.7, accel: 5.6, brake: 7.5, pool: 4,  hp: 350,  isBike: true }, // 150cc 12s/62mph

        // --- 4. Motorboats (Water Buoyancy & Hydrodynamics) ---
        speedboat:       { name: 'Offshore Speedboat',    L: 9.00, W: 2.65, H: 2.50, top: 34.9, accel: 8.3, brake: 6.0, pool: 4,  hp: 900, isBoat: true }, // twin outboard 7.5s/78mph
        boat_speedboat:  { name: 'Offshore Speedboat',    L: 9.00, W: 2.65, H: 2.50, top: 34.9, accel: 8.3, brake: 6.0, pool: 4,  hp: 900, isBoat: true },
        boat_police:     { name: 'Harbor Patrol Cutter',  L: 8.50, W: 2.65, H: 3.89, top: 24.6, accel: 7.5, brake: 5.0, pool: 3,  hp: 1300, isBoat: true }, // patrol boat 9s/55mph
        boat_yacht:      { name: 'Tropic Luxury Yacht',   L: 12.21,W: 3.45, H: 2.84, top: 15.6, accel: 4.8, brake: 4.0, pool: 3,  hp: 2000, isBoat: true }, // displacement yacht 14s/35mph

        // --- 5. Procedural Mesh Fallbacks & Aliases ---
        hatchback:       { name: 'Blista Compact',        L: 3.96, W: 2.00, H: 1.54, top: 56.8, accel: 5.5, brake: 9.0, pool: 6,  hp: 650 }, // Golf GTI 7.8s/127mph
        muscle:          { name: 'Sabre Turbo Coupe',     L: 4.71, W: 2.00, H: 1.38, top: 72.9, accel: 7.9, brake: 11.0, pool: 6,  hp: 700 }, // Mustang GT 4.4s/163mph
        minivan:         { name: 'Moonbeam Minivan',      L: 5.21, W: 2.03, H: 1.91, top: 51.4, accel: 5.4, brake: 8.5, pool: 6,  hp: 950 }, // Odyssey 8.2s/115mph
        van:             { name: 'Burrito Van',           L: 6.96, W: 2.38, H: 3.18, top: 49.2, accel: 5.3, brake: 8.0, pool: 6,  hp: 950 }, // Transit 8.6s/110mph
        offroad:         { name: 'Rancher 4x4',           L: 5.21, W: 2.03, H: 1.91, top: 44.7, accel: 6.5, brake: 8.0, pool: 6,  hp: 1000 }, // Bronco 7.4s/100mph
        towtruck:        { name: 'Heavy Duty Tow Truck',  L: 6.06, W: 2.10, H: 2.04, top: 38.0, accel: 4.8, brake: 6.5, pool: 4,  hp: 1200 }, // wrecker 12s/85mph
        armored_truck:   { name: 'Securicar Armored Vault', L: 7.20, W: 2.45, H: 2.95, top: 42.0, accel: 4.8, brake: 7.0, pool: 4, hp: 2500 },
        custom_vehicle:  { name: 'BrowOS Prototype GT',     L: 4.60, W: 2.15, H: 1.25, top: 92.0, accel: 9.8, brake: 12.0, pool: 4, hp: 800 },
    };
    const PAINTS = [
        0xd62828, // Torino Red
        0x1e56a0, // Cobalt Blue
        0xf77f00, // Amber Orange
        0x2a9d8f, // Emerald Teal
        0xf5f5f7, // Pearl White
        0x457b9d, // Steel Blue
        0x5c677d, // Slate Grey
        0xe63946, // Cherry Red
        0x2b9348, // Forest Green
        0xd4a373, // Bronze Tan
        0x7b2cbf, // Royal Purple
        0xadb5bd, // Silver Chrome
    ];

    const VehicleGeo = {
        cache: null,
        _base(b, L, W, bodyH, bodyY, opts = {}) {
            const fz = -L / 2, rz = L / 2;
            const paintCol = opts.paint || [1, 1, 1];
            // Main lower body chassis (paintable white)
            b.box(0, bodyY, 0, W, bodyH, L, paintCol);
            // Hood center sculpting / power crease
            b.box(0, bodyY + bodyH / 2 + 0.018, fz + L * 0.25, W * 0.32, 0.025, L * 0.32, paintCol);
            // Aerodynamic rocker panels
            b.box(0, 0.25, 0, W + 0.04, 0.11, L * 0.78, [0.14, 0.14, 0.16]);
            // Front bumper & lower splitter
            const fBumpW = W * 0.98;
            b.box(0, 0.33, fz + 0.08, fBumpW, 0.24, 0.22, [0.18, 0.19, 0.22]);
            b.box(0, 0.21, fz + 0.05, fBumpW * 0.94, 0.06, 0.26, [0.10, 0.10, 0.12]);
            // Rear bumper & diffuser
            const rBumpW = W * 1.0;
            b.box(0, 0.34, rz - 0.08, rBumpW, 0.25, 0.22, [0.18, 0.19, 0.22]);
            b.box(0, 0.22, rz - 0.05, rBumpW * 0.92, 0.08, 0.24, [0.10, 0.10, 0.12]);

            // Front Radiator Grille
            const grW = W * (opts.grilleW || 0.48), grH = opts.grilleH || 0.18;
            const grY = opts.grilleY || (bodyY - 0.02);
            b.box(0, grY, fz - 0.03, grW, grH, 0.05, [0.08, 0.08, 0.10]);
            // Chrome grille slats & emblem badge
            for (let i = -2; i <= 2; i++) {
                b.box(i * (grW * 0.18), grY, fz - 0.045, grW * 0.08, grH * 0.75, 0.02, [0.75, 0.78, 0.82]);
            }
            b.box(0, grY, fz - 0.05, 0.07, 0.07, 0.02, [0.85, 0.86, 0.90]);

            // Multi-element Headlights (projector + chrome bezel + amber blinker)
            const headX = W / 2 - 0.28;
            const headY = opts.headY || (bodyY + 0.06);
            for (const side of [-1, 1]) {
                // Housing bezel
                b.box(side * headX, headY, fz - 0.015, 0.38, 0.16, 0.06, [0.18, 0.19, 0.22]);
                // Main glowing projector lens
                b.box(side * headX, headY, fz - 0.04, 0.24, 0.12, 0.03, [1.0, 0.98, 0.80]);
                // Amber turn signal indicator
                b.box(side * (headX + 0.14), headY, fz - 0.02, 0.08, 0.12, 0.04, [1.0, 0.50, 0.05]);
            }

            // Multi-element Taillights (red brake + white reverse + amber blinker)
            const tailX = W / 2 - 0.28;
            const tailY = opts.tailY || (bodyY + 0.06);
            for (const side of [-1, 1]) {
                // Housing
                b.box(side * tailX, tailY, rz + 0.015, 0.38, 0.16, 0.06, [0.18, 0.19, 0.22]);
                // Red glowing brake bar
                b.box(side * tailX, tailY + 0.02, rz + 0.04, 0.26, 0.09, 0.03, [0.95, 0.03, 0.03]);
                // White reverse bar
                b.box(side * tailX, tailY - 0.04, rz + 0.035, 0.14, 0.05, 0.02, [0.88, 0.88, 0.90]);
                // Amber turn indicator
                b.box(side * (tailX + 0.13), tailY, rz + 0.035, 0.07, 0.11, 0.02, [1.0, 0.50, 0.05]);
            }

            // License Plates (Front & Rear)
            b.box(0, 0.25, fz - 0.045, 0.44, 0.14, 0.02, [0.88, 0.88, 0.90]);
            b.box(0, 0.25, fz - 0.05, 0.34, 0.08, 0.015, [0.15, 0.15, 0.18]);
            b.box(0, 0.34, rz + 0.045, 0.44, 0.14, 0.02, [0.88, 0.88, 0.90]);
            b.box(0, 0.34, rz + 0.05, 0.34, 0.08, 0.015, [0.15, 0.15, 0.18]);

            // Side View Mirrors (Arms, body-color housing, rear-facing glass & amber indicator)
            const mirY = bodyY + bodyH * 0.48;
            const mirZ = opts.mirrorZ !== undefined ? opts.mirrorZ : -L * 0.15;
            for (const side of [-1, 1]) {
                b.box(side * (W / 2 + 0.04), mirY + 0.015, mirZ, 0.08, 0.03, 0.05, [0.10, 0.10, 0.12]);
                b.box(side * (W / 2 + 0.11), mirY, mirZ, 0.14, 0.10, 0.07, paintCol);
                // Reflective mirror glass facing rear (+Z)
                b.box(side * (W / 2 + 0.11), mirY, mirZ + 0.035, 0.11, 0.075, 0.012, [0.45, 0.65, 0.85]);
                // Amber forward-facing indicator
                b.box(side * (W / 2 + 0.16), mirY, mirZ - 0.035, 0.03, 0.03, 0.012, [1.0, 0.50, 0.05]);
            }

            // Recessed Door Pull Handles (both sides)
            const handleY = bodyY + bodyH * 0.30;
            const doors = opts.doors || [-L * 0.08, L * 0.18];
            for (const dz of doors) {
                for (const side of [-1, 1]) {
                    b.box(side * (W / 2 + 0.008), handleY, dz, 0.018, 0.045, 0.16, [0.14, 0.14, 0.16]);
                    b.box(side * (W / 2 + 0.016), handleY, dz, 0.022, 0.030, 0.13, [0.72, 0.74, 0.78]);
                }
            }

            // Chrome Exhaust Tips
            const exX = opts.exhaustX !== undefined ? opts.exhaustX : W * 0.32;
            if (opts.quadExhaust) {
                for (const side of [-1, 1]) {
                    for (const offset of [-0.06, 0.06]) {
                        b.box(side * exX + offset, 0.28, rz + 0.06, 0.08, 0.08, 0.14, [0.75, 0.78, 0.82]);
                        b.box(side * exX + offset, 0.28, rz + 0.11, 0.055, 0.055, 0.08, [0.08, 0.08, 0.10]);
                    }
                }
            } else if (opts.dualExhaust) {
                for (const side of [-1, 1]) {
                    b.box(side * exX, 0.28, rz + 0.06, 0.09, 0.09, 0.14, [0.75, 0.78, 0.82]);
                    b.box(side * exX, 0.28, rz + 0.11, 0.06, 0.06, 0.08, [0.08, 0.08, 0.10]);
                }
            } else {
                b.box(-exX, 0.28, rz + 0.06, 0.09, 0.09, 0.14, [0.75, 0.78, 0.82]);
                b.box(-exX, 0.28, rz + 0.11, 0.06, 0.06, 0.08, [0.08, 0.08, 0.10]);
            }
        },
        _cabin(b, L, W, y0, h, zc, len, paintCol = [1, 1, 1], opts = {}) {
            const cabW = W - 0.20;
            // Tinted dark cabin glass
            b.box(0, y0 + h / 2, zc, cabW, h, len, [0.14, 0.18, 0.24]);
            // Raked windshield front frame
            b.box(0, y0 + h / 2, zc - len / 2 + 0.04, cabW + 0.02, h * 0.95, 0.08, [0.12, 0.14, 0.18]);
            // Rear glass frame
            b.box(0, y0 + h / 2, zc + len / 2 - 0.04, cabW + 0.02, h * 0.95, 0.08, [0.12, 0.14, 0.18]);
            // B-pillar side dividers
            for (const side of [-1, 1]) {
                b.box(side * (cabW / 2 + 0.006), y0 + h / 2, zc, 0.016, h * 0.92, 0.12, [0.12, 0.12, 0.14]);
            }
            // Sculpted roof slab (supports multi-color two-tone roofs)
            const roofW = cabW - 0.06;
            const roofCol = opts.roofCol || paintCol;
            b.box(0, y0 + h + 0.03, zc, roofW, 0.06, len + 0.04, roofCol);
        },
        build() {
            if (this.cache) return this.cache;
            const mk = (fn) => { const b = new GeoBatch(); fn(b); return b.buildGeometry(); };
            const g = {};

            // 1. SEDAN: Sentinel — Executive 4-door with two-tone Gloss Black roof
            g.sedan = mk((b) => {
                const L = 4.62, W = 1.82;
                this._base(b, L, W, 0.52, 0.64, { dualExhaust: true, grilleH: 0.18 });
                this._cabin(b, L, W, 0.90, 0.44, -0.06, L * 0.50, [1, 1, 1], { roofCol: [0.05, 0.05, 0.06] });
                b.box(0, 1.42, 0.35, 0.04, 0.08, 0.14, [0.12, 0.12, 0.14]);
                b.box(0, 0.96, L / 2 - 0.16, W * 0.68, 0.04, 0.18, [1, 1, 1]);
            });

            // 2. COUPE: Banshee — Sleek 2-door sports coupe with widebody rear
            g.coupe = mk((b) => {
                const L = 4.42, W = 1.86;
                this._base(b, L, W, 0.44, 0.54, { quadExhaust: true, grilleH: 0.14 });
                this._cabin(b, L, W, 0.76, 0.40, -0.32, L * 0.44, [1, 1, 1]);
                b.box(0, 0.88, -L * 0.26, W * 0.32, 0.06, 0.45, [1, 1, 1]);
                b.box(0, 0.89, -L * 0.22, W * 0.20, 0.035, 0.22, [0.12, 0.12, 0.14]);
                for (const side of [-1, 1]) {
                    b.box(side * (W * 0.46), 0.72, L * 0.14, 0.06, 0.24, L * 0.42, [1, 1, 1]);
                }
                b.box(0, 0.95, L / 2 - 0.15, W * 0.70, 0.06, 0.22, [1, 1, 1]);
                b.box(0, 0.24, -L / 2 - 0.04, W * 0.88, 0.04, 0.16, [0.12, 0.12, 0.14]);
            });

            // 3. HATCHBACK: Blista — Euro hot-hatch with roof wing
            g.hatchback = mk((b) => {
                const L = 4.10, W = 1.76;
                this._base(b, L, W, 0.52, 0.64, { dualExhaust: true, exhaustX: 0.08 });
                this._cabin(b, L, W, 0.90, 0.44, 0.10, L * 0.62, [1, 1, 1]);
                b.box(0, 1.43, L * 0.42, W * 0.76, 0.05, 0.28, [0.12, 0.12, 0.14]);
                b.box(0, 0.25, -L / 2 - 0.03, W * 0.86, 0.035, 0.14, [0.12, 0.12, 0.14]);
                b.box(0, 0.52, -L / 2 - 0.05, W * 0.44, 0.02, 0.04, [0.85, 0.12, 0.12]);
            });

            // 4. COMPACT: Dilettante — Rounded eco commuter
            g.compact = mk((b) => {
                const L = 3.60, W = 1.66;
                this._base(b, L, W, 0.54, 0.65, { exhaustX: W * 0.26 });
                this._cabin(b, L, W, 0.92, 0.46, 0.02, L * 0.54, [1, 1, 1]);
                for (const side of [-1, 1]) {
                    b.box(side * (W * 0.36), 1.08, L / 2 - 0.12, 0.05, 0.34, 0.06, [0.95, 0.03, 0.03]);
                }
                b.box(0, 1.45, L * 0.26, W * 0.64, 0.04, 0.20, [1, 1, 1]);
            });

            // 5. WAGON: Regina — Estate station wagon with roof rails
            g.wagon = mk((b) => {
                const L = 4.90, W = 1.82;
                this._base(b, L, W, 0.54, 0.66, { dualExhaust: true });
                this._cabin(b, L, W, 0.93, 0.46, 0.32, L * 0.68, [1, 1, 1]);
                for (const side of [-1, 1]) {
                    b.box(side * (W * 0.36), 1.48, 0.32, 0.035, 0.04, L * 0.62, [0.75, 0.78, 0.82]);
                }
                b.box(0, 0.46, L / 2 + 0.08, W * 0.58, 0.03, 0.10, [0.75, 0.78, 0.82]);
            });

            // 6. MUSCLE: Sabre — Aggressive American muscle with shaker scoop
            g.muscle = mk((b) => {
                const L = 4.94, W = 1.92;
                this._base(b, L, W, 0.48, 0.60, { dualExhaust: true, quadExhaust: false, exhaustX: W * 0.34 });
                this._cabin(b, L, W, 0.84, 0.42, -0.15, L * 0.45, [1, 1, 1]);
                b.box(0, 0.96, -L * 0.24, W * 0.32, 0.08, 0.55, [0.12, 0.12, 0.14]);
                b.box(0, 0.94, -L * 0.28, W * 0.44, 0.02, 0.82, [0.12, 0.12, 0.14]);
                for (const side of [-1, 1]) {
                    b.box(side * (W * 0.48), 0.74, 0.5, 0.06, 0.26, L * 0.44, [1, 1, 1]);
                }
                b.box(0, 1.34, L / 2 - 0.28, W * 0.74, 0.05, 0.30, [1, 1, 1]);
                for (const side of [-1, 1]) b.box(side * W * 0.26, 1.25, L / 2 - 0.28, 0.05, 0.14, 0.06, [1, 1, 1]);
            });

            // 7. MINIVAN: Moonbeam — Modern family MPV
            g.minivan = mk((b) => {
                const L = 5.08, W = 1.98;
                this._base(b, L, W, 0.64, 0.78, { dualExhaust: false, exhaustX: W * 0.30 });
                this._cabin(b, L, W, 1.10, 0.62, 0.28, L * 0.72, [1, 1, 1]);
                for (const side of [-1, 1]) {
                    b.box(side * (W / 2 + 0.015), 0.88, 0.8, 0.02, 0.025, L * 0.45, [0.12, 0.12, 0.14]);
                    b.box(side * (W * 0.38), 1.80, 0.3, 0.035, 0.04, L * 0.55, [0.20, 0.22, 0.25]);
                }
            });

            // 8. SUV: Patriot — Full-size rugged 4x4 SUV
            g.suv = mk((b) => {
                const L = 4.78, W = 1.96;
                this._base(b, L, W, 0.66, 0.82, { dualExhaust: true });
                this._cabin(b, L, W, 1.15, 0.56, 0.15, L * 0.64, [1, 1, 1]);
                for (const side of [-1, 1]) {
                    b.box(side * (W * 0.40), 1.80, 0.15, 0.04, 0.05, L * 0.55, [0.20, 0.22, 0.25]);
                }
                for (let i = -2; i <= 2; i++) {
                    b.box(0, 1.82, 0.15 + i * 0.42, W * 0.78, 0.035, 0.04, [0.20, 0.22, 0.25]);
                }
                b.box(0, 1.05, L / 2 + 0.15, 0.72, 0.72, 0.22, [0.12, 0.12, 0.14]);
                b.box(0, 1.05, L / 2 + 0.27, 0.38, 0.38, 0.06, [0.75, 0.78, 0.82]);
            });

            // 9. PICKUP: Bobcat — Double-cab utility pickup
            g.pickup = mk((b) => {
                const L = 5.30, W = 1.94;
                this._base(b, L, W, 0.62, 0.76, { dualExhaust: true });
                this._cabin(b, L, W, 1.07, 0.52, -L * 0.16, L * 0.36, [1, 1, 1]);
                const bedZ = L * 0.24, bedLen = L * 0.44;
                b.box(0, 0.80, bedZ, W * 0.88, 0.10, bedLen, [0.12, 0.12, 0.14]);
                for (let i = -3; i <= 3; i++) {
                    b.box(i * 0.18, 0.86, bedZ, 0.04, 0.02, bedLen - 0.1, [0.18, 0.19, 0.22]);
                }
                for (const side of [-1, 1]) {
                    b.box(side * (W * 0.46), 1.08, bedZ, 0.08, 0.50, bedLen, [1, 1, 1]);
                    b.box(side * (W * 0.46), 1.34, bedZ, 0.12, 0.06, bedLen + 0.04, [0.75, 0.78, 0.82]);
                }
                b.box(0, 1.08, L / 2 - 0.03, W * 0.88, 0.50, 0.08, [1, 1, 1]);
                for (const side of [-1, 1]) {
                    b.box(side * (W * 0.35), 1.48, 0.45, 0.07, 0.62, 0.07, [0.18, 0.19, 0.22]);
                }
                b.box(0, 1.82, 0.45, W * 0.74, 0.07, 0.07, [0.18, 0.19, 0.22]);
                for (let i = -1.5; i <= 1.5; i += 1.0) {
                    b.box(i * 0.24, 1.90, 0.45, 0.12, 0.12, 0.08, [1.0, 0.98, 0.80]);
                }
            });

            // 10. OFFROAD: Rancher — Lifted 4x4 trail conqueror
            g.offroad = mk((b) => {
                const L = 4.58, W = 1.94;
                this._base(b, L, W, 0.68, 0.88, { dualExhaust: false });
                this._cabin(b, L, W, 1.22, 0.55, 0.05, L * 0.55, [1, 1, 1]);
                b.box(0, 0.62, -L / 2 - 0.12, W * 0.85, 0.38, 0.12, [0.12, 0.12, 0.14]);
                b.box(0, 0.55, -L / 2 - 0.18, 0.26, 0.14, 0.16, [0.65, 0.68, 0.72]);
                b.box(W / 2 + 0.06, 1.35, -L * 0.20, 0.06, 0.85, 0.06, [0.12, 0.12, 0.14]);
                b.box(W / 2 + 0.06, 1.82, -L * 0.20, 0.10, 0.08, 0.14, [0.12, 0.12, 0.14]);
                b.box(0, 1.84, -0.15, W * 0.72, 0.06, 0.10, [1.0, 0.98, 0.80]);
                b.box(0, 1.15, L / 2 + 0.14, 0.74, 0.74, 0.22, [0.12, 0.12, 0.14]);
            });

            // 11. LIMO: Stretch — Ultra-luxury 6-door limousine
            g.limo = mk((b) => {
                const L = 8.40, W = 1.86;
                this._base(b, L, W, 0.52, 0.64, { dualExhaust: true, doors: [-2.2, -0.7, 0.7, 2.2] });
                this._cabin(b, L, W, 0.90, 0.44, 0.15, L * 0.68, [1, 1, 1]);
                b.box(0, 1.41, L * 0.24, W * 0.72, 0.04, L * 0.32, [0.10, 0.10, 0.12]);
                for (const side of [-1, 1]) {
                    b.box(side * (W * 0.35), 1.25, L / 2 - 0.4, 0.02, 0.55, 0.02, [0.75, 0.78, 0.82]);
                }
            });

            // 12. TAXI: Cabbie — NYC Yellow Cab
            g.taxi = mk((b) => {
                const L = 4.70, W = 1.84;
                this._base(b, L, W, 0.52, 0.64, { paint: [1.0, 0.78, 0.03], dualExhaust: false });
                this._cabin(b, L, W, 0.90, 0.44, -0.06, L * 0.50, [1.0, 0.78, 0.03]);
                b.box(0, 1.48, -0.05, 0.68, 0.18, 0.32, [1.0, 0.75, 0.02]);
                b.box(0, 1.48, -0.05, 0.52, 0.12, 0.34, [0.95, 0.95, 0.98]);
                for (const side of [-1, 1]) {
                    for (let i = 0; i < 8; i++) {
                        b.box(side * (W / 2 + 0.012), 0.70, -0.85 + i * 0.25, 0.016, 0.10, 0.12, i % 2 ? [0.12, 0.12, 0.14] : [0.95, 0.95, 0.95]);
                    }
                }
            });

            // 13. POLICE: Cruiser — NYPD Police Cruiser
            g.police = mk((b) => {
                const L = 4.82, W = 1.88;
                this._base(b, L, W, 0.54, 0.68, { paint: [0.95, 0.95, 0.98], dualExhaust: true });
                this._cabin(b, L, W, 0.95, 0.46, -0.06, L * 0.50, [0.95, 0.95, 0.98]);
                b.box(-0.28, 1.50, 0.02, 0.44, 0.09, 0.22, [0.95, 0.08, 0.08]);
                b.box(0.28, 1.50, 0.02, 0.44, 0.09, 0.22, [0.08, 0.20, 0.95]);
                b.box(0, 1.50, 0.02, 0.12, 0.09, 0.22, [0.95, 0.95, 0.98]);
                b.box(0, 0.46, -L / 2 - 0.08, W * 0.48, 0.35, 0.08, [0.12, 0.12, 0.14]);
                for (const side of [-1, 1]) {
                    b.box(side * (W / 2 + 0.012), 0.68, 0.05, 0.016, 0.22, L * 0.42, [0.04, 0.08, 0.20]);
                }
            });

            // 14. POLICE SUV: Interceptor — NYPD Police Interceptor SUV
            g.police_suv = mk((b) => {
                const L = 5.06, W = 2.00;
                this._base(b, L, W, 0.68, 0.84, { paint: [0.04, 0.08, 0.20], dualExhaust: true });
                this._cabin(b, L, W, 1.18, 0.56, 0.15, L * 0.64, [0.95, 0.95, 0.98]);
                b.box(-0.32, 1.80, 0.08, 0.46, 0.09, 0.22, [0.95, 0.08, 0.08]);
                b.box(0.32, 1.80, 0.08, 0.46, 0.09, 0.22, [0.08, 0.20, 0.95]);
                b.box(0, 0.52, -L / 2 - 0.10, W * 0.62, 0.42, 0.10, [0.12, 0.12, 0.14]);
            });

            // 15. POLICE ENFORCER: SWAT Armored Carrier
            g.police_enforcer = mk((b) => {
                const L = 5.30, W = 2.10;
                b.box(0, 1.15, 0, W, 1.85, L, [0.08, 0.10, 0.16]);
                b.box(0, 1.45, -L / 2 + 0.40, W - 0.3, 0.55, 0.12, [0.14, 0.18, 0.24]);
                b.box(0, 0.50, -L / 2 - 0.10, W + 0.08, 0.50, 0.16, [0.10, 0.10, 0.12]);
                b.box(0, 2.12, 0.2, 0.70, 0.12, 0.70, [0.10, 0.10, 0.12]);
                b.box(-0.38, 2.18, -L * 0.25, 0.30, 0.10, 0.16, [0.95, 0.08, 0.08]);
                b.box(0.38, 2.18, -L * 0.25, 0.30, 0.10, 0.16, [0.08, 0.20, 0.95]);
            });

            // 16. SUPERCAR: Infernus — Exotic mid-engine hypercar
            g.supercar = mk((b) => {
                const L = 4.40, W = 1.96;
                this._base(b, L, W, 0.38, 0.46, { quadExhaust: true, exhaustX: 0.12 });
                this._cabin(b, L, W, 0.66, 0.36, -0.22, L * 0.44, [1, 1, 1]);
                b.box(0, 0.70, 0.52, 0.46, 0.18, 0.56, [0.55, 0.58, 0.62]);
                b.box(-0.16, 0.80, 0.52, 0.10, 0.05, 0.52, [0.85, 0.12, 0.12]);
                b.box(0.16, 0.80, 0.52, 0.10, 0.05, 0.52, [0.85, 0.12, 0.12]);
                b.box(0, 1.06, L / 2 - 0.35, W * 0.88, 0.05, 0.34, [0.10, 0.10, 0.12]);
                for (const side of [-1, 1]) b.box(side * (W * 0.30), 0.90, L / 2 - 0.38, 0.05, 0.20, 0.07, [0.10, 0.10, 0.12]);
                b.box(0, 0.22, -L / 2 - 0.04, W * 0.94, 0.05, 0.32, [0.10, 0.10, 0.12]);
            });

            // 17. AMBULANCE: EMS Ambulance
            g.ambulance = mk((b) => {
                const L = 5.60, W = 2.10;
                this._base(b, L, W, 0.68, 0.82, { paint: [0.95, 0.95, 0.98] });
                this._cabin(b, L, W, 1.12, 0.55, -L * 0.22, L * 0.32, [0.95, 0.95, 0.98]);
                b.box(0, 1.62, 0.24, W * 0.96, 1.65, L * 0.64, [0.95, 0.95, 0.98]);
                b.box(0, 1.40, 0.24, W + 0.02, 0.24, L * 0.62, [0.85, 0.12, 0.12]);
                b.box(0, 2.48, -0.65, 0.92, 0.12, 0.24, [0.95, 0.12, 0.12]);
                b.box(0, 2.48, 1.85, 0.92, 0.12, 0.24, [0.95, 0.12, 0.12]);
            });

            // 18. FIRETRUCK: FDNY Fire Engine
            g.firetruck = mk((b) => {
                const L = 7.20, W = 2.36;
                b.box(0, 1.25, 0, W, 1.85, L, [0.78, 0.06, 0.05]);
                b.box(0, 1.65, -L / 2 + 1.2, W - 0.25, 0.70, 0.12, [0.14, 0.18, 0.24]);
                b.box(0, 2.35, -L * 0.10, 0.35, 0.30, 0.35, [0.75, 0.78, 0.82]);
                for (const side of [-1, 1]) {
                    b.box(side * (W * 0.34), 2.32, 0.4, 0.12, 0.10, L * 0.58, [0.75, 0.78, 0.82]);
                }
                b.box(0, 0.46, -L / 2 - 0.08, W + 0.06, 0.32, 0.22, [0.75, 0.78, 0.82]);
                b.box(0, 2.30, -L / 2 + 1.4, 1.20, 0.14, 0.26, [0.95, 0.12, 0.12]);
            });

            // 19. VAN: Burrito — Commercial Cargo Van
            g.van = mk((b) => {
                const L = 5.30, W = 1.98;
                this._base(b, L, W, 0.70, 0.86, {});
                b.box(0, 1.55, 0.05, W - 0.12, 1.15, L * 0.82, [1, 1, 1]);
                b.box(0, 1.42, -L / 2 + 0.75, W - 0.28, 0.55, 0.10, [0.14, 0.18, 0.24]);
                b.box(0, 2.15, 0.05, W - 0.12, 0.06, L * 0.82, [1, 1, 1]);
            });

            // 20. BUS: Metro Coach — Transit Passenger Coach
            g.bus = mk((b) => {
                const L = 11.20, W = 2.50;
                b.box(0, 1.70, 0, W, 2.20, L, [0.95, 0.95, 0.98]);
                b.box(0, 1.55, 0, W + 0.02, 0.45, L, [0.08, 0.24, 0.65]);
                b.box(0, 2.15, 0, W + 0.03, 0.65, L * 0.88, [0.14, 0.18, 0.24]);
                b.box(0, 2.72, -L / 2 - 0.02, 1.50, 0.26, 0.06, [1.0, 0.74, 0.02]);
                b.box(0, 2.92, 0.4, 1.40, 0.16, 2.50, [0.95, 0.95, 0.98]);
            });

            // 21. SCHOOLBUS: Classic American School Bus
            g.schoolbus = mk((b) => {
                const L = 9.80, W = 2.40;
                b.box(0, 1.55, 0, W, 2.05, L, [1.0, 0.78, 0.03]);
                b.box(0, 1.05, -L / 2 + 1.1, W * 0.75, 0.95, 2.2, [1.0, 0.78, 0.03]);
                b.box(0, 1.55, -L / 2 + 2.2, W - 0.3, 0.60, 0.10, [0.14, 0.18, 0.24]);
                b.box(0, 1.95, 0.8, W + 0.03, 0.55, L * 0.65, [0.14, 0.18, 0.24]);
                b.box(0, 1.15, 0, W + 0.02, 0.10, L, [0.10, 0.10, 0.12]);
            });

            // 22. TRUCK: Mule — Commercial Box Delivery Truck
            g.truck = mk((b) => {
                const L = 7.60, W = 2.40;
                b.box(0, 1.25, -L / 2 + 1.2, W, 1.70, 2.4, [1, 1, 1]);
                b.box(0, 1.52, -L / 2 + 0.45, W - 0.25, 0.65, 0.10, [0.14, 0.18, 0.24]);
                b.box(0, 2.32, -L / 2 + 1.4, W * 0.92, 0.45, 1.8, [1, 1, 1]);
                b.box(0, 1.75, 1.15, W, 2.40, L - 2.8, [0.88, 0.87, 0.84]);
            });

            // 23. SEMI: Roadtrain — Heavy Highway Tractor
            g.semi = mk((b) => {
                const L = 15.60, W = 2.50;
                b.box(0, 1.65, -4.8, W, 2.30, 4.2, [1, 1, 1]);
                b.box(0, 1.85, -6.6, W - 0.3, 0.70, 0.10, [0.14, 0.18, 0.24]);
                for (const side of [-1, 1]) {
                    b.box(side * (W * 0.45), 2.70, -3.2, 0.12, 1.80, 0.12, [0.75, 0.78, 0.82]);
                }
                b.box(0, 2.05, 2.2, W, 2.70, 10.2, [0.88, 0.87, 0.84]);
            });

            // 24. GARBAGE: Trashmaster — Municipal Waste Collector
            g.garbage = mk((b) => {
                const L = 7.20, W = 2.40;
                b.box(0, 1.25, -L / 2 + 1.2, W, 1.70, 2.4, [0.06, 0.34, 0.14]);
                b.box(0, 1.55, -L / 2 + 0.40, W - 0.25, 0.65, 0.10, [0.14, 0.18, 0.24]);
                b.box(0, 1.80, 1.0, W, 2.40, L - 2.6, [0.06, 0.34, 0.14]);
                b.box(0, 1.20, L / 2 - 0.2, W * 0.95, 1.10, 0.8, [0.34, 0.36, 0.39]);
            });

            // 25. TOWTRUCK: Heavy Duty Recovery Tow Truck
            g.towtruck = mk((b) => {
                const L = 5.60, W = 2.00;
                b.box(0, 1.10, -L * 0.22, W, 1.60, 2.4, [1, 1, 1]);
                b.box(0, 1.35, -L * 0.22 - 0.8, W - 0.25, 0.55, 0.10, [0.14, 0.18, 0.24]);
                b.box(0, 1.45, 1.1, 0.40, 0.80, 2.2, [0.18, 0.19, 0.22]);
                b.box(0, 1.95, -L * 0.22, 0.65, 0.12, 0.22, [1.0, 0.74, 0.02]);
            });

            // 26. MOTORCYCLE: Faggio / Street Bike
            g.motorcycle = mk((b) => {
                b.box(0, 0.55, 0, 0.32, 0.55, 1.6, [0.18, 0.18, 0.22]);
                b.box(0, 0.80, -0.25, 0.42, 0.28, 0.65, [1, 1, 1]);
                b.box(0, 0.75, 0.35, 0.36, 0.20, 0.55, [0.10, 0.10, 0.12]);
                b.box(0, 1.02, -0.55, 0.75, 0.06, 0.06, [0.75, 0.78, 0.82]);
                b.box(0, 0.90, -0.75, 0.18, 0.14, 0.06, [1.0, 0.98, 0.80]);
            });

            // 27. SCOOTER: Zippo — Urban Commuter Scooter
            g.scooter = mk((b) => {
                b.box(0, 0.28, 0, 0.32, 0.08, 0.85, [0.18, 0.18, 0.22]);
                b.box(0, 0.65, -0.45, 0.28, 0.65, 0.14, [1, 1, 1]);
                b.box(0, 0.62, 0.30, 0.36, 0.35, 0.70, [1, 1, 1]);
                b.box(0, 0.78, 0.28, 0.32, 0.12, 0.50, [0.10, 0.10, 0.12]);
                b.box(0, 0.98, -0.52, 0.65, 0.05, 0.05, [0.75, 0.78, 0.82]);
                b.box(0, 0.95, -0.60, 0.14, 0.12, 0.06, [1.0, 0.98, 0.80]);
            });

            this.cache = g;
            return g;
        },
    };

    const VEHICLE_LIGHT_SPECS = {
        sedan:           { head: { x: 0.62, y: 0.82, z: -2.28, w: 0.38, h: 0.16 }, tail: { x: 0.62, y: 0.82, z: 2.28, w: 0.38, h: 0.16 } },
        taxi:            { head: { x: 0.62, y: 0.82, z: -2.28, w: 0.38, h: 0.16 }, tail: { x: 0.62, y: 0.82, z: 2.28, w: 0.38, h: 0.16 } },
        police:          { head: { x: 0.62, y: 0.82, z: -2.28, w: 0.38, h: 0.16 }, tail: { x: 0.62, y: 0.82, z: 2.28, w: 0.38, h: 0.16 } },
        police_cruiser:  { head: { x: 0.62, y: 0.82, z: -2.28, w: 0.38, h: 0.16 }, tail: { x: 0.62, y: 0.82, z: 2.28, w: 0.38, h: 0.16 } },
        police_suv:      { head: { x: 0.68, y: 1.08, z: -2.38, w: 0.40, h: 0.20 }, tail: { x: 0.68, y: 1.08, z: 2.38, w: 0.40, h: 0.20 } },
        police_enforcer: { head: { x: 0.64, y: 1.04, z: -2.40, w: 0.40, h: 0.18 }, tail: { x: 0.81, y: 0.88, z: 2.58, w: 0.40, h: 0.18 } },
        coupe:           { head: { x: 0.70, y: 0.72, z: -2.22, w: 0.40, h: 0.14 }, tail: { x: 0.70, y: 0.72, z: 2.22, w: 0.40, h: 0.14 } },
        hatchback:       { head: { x: 0.60, y: 0.82, z: -1.98, w: 0.38, h: 0.16 }, tail: { x: 0.60, y: 0.82, z: 1.98, w: 0.38, h: 0.16 } },
        compact:         { head: { x: 0.56, y: 0.66, z: -1.82, w: 0.28, h: 0.16 }, tail: { x: 0.56, y: 0.68, z: 1.82, w: 0.28, h: 0.16 } },
        wagon:           { head: { x: 0.55, y: 0.68, z: -2.47, w: 0.38, h: 0.15 }, tail: { x: 0.57, y: 0.70, z: 2.47, w: 0.36, h: 0.15 } },
        minivan:         { head: { x: 0.63, y: 0.88, z: -2.56, w: 0.40, h: 0.16 }, tail: { x: 0.71, y: 1.00, z: 2.56, w: 0.30, h: 0.30 } },
        muscle:          { head: { x: 0.69, y: 0.62, z: -2.49, w: 0.32, h: 0.14 }, tail: { x: 0.69, y: 0.64, z: 2.49, w: 0.28, h: 0.13 } },
        offroad:         { head: { x: 0.66, y: 1.00, z: -2.31, w: 0.28, h: 0.16 }, tail: { x: 0.66, y: 1.00, z: 2.31, w: 0.26, h: 0.15 } },
        limo:            { head: { x: 0.55, y: 0.68, z: -4.22, w: 0.38, h: 0.14 }, tail: { x: 0.56, y: 0.70, z: 4.22, w: 0.36, h: 0.13 } },
        luxury_limo:     { head: { x: 0.55, y: 0.68, z: -4.22, w: 0.38, h: 0.14 }, tail: { x: 0.56, y: 0.70, z: 4.22, w: 0.36, h: 0.13 } },
        luxury_sedan:    { head: { x: 0.62, y: 0.82, z: -2.75, w: 0.38, h: 0.16 }, tail: { x: 0.62, y: 0.82, z: 2.75, w: 0.38, h: 0.16 } },
        garbage:         { head: { x: 0.72, y: 0.94, z: -3.62, w: 0.40, h: 0.16 }, tail: { x: 0.77, y: 1.05, z: 3.62, w: 0.38, h: 0.15 } },
        garbage_truck:   { head: { x: 0.72, y: 0.94, z: -3.62, w: 0.40, h: 0.16 }, tail: { x: 0.77, y: 1.05, z: 3.62, w: 0.38, h: 0.15 } },
        towtruck:        { head: { x: 0.64, y: 0.84, z: -2.82, w: 0.40, h: 0.15 }, tail: { x: 0.66, y: 0.86, z: 2.82, w: 0.38, h: 0.14 } },
        scooter:         { head: { x: 0.00, y: 0.98, z: -0.64, w: 0.20, h: 0.12 }, tail: { x: 0.00, y: 0.78, z: 0.87, w: 0.16, h: 0.06 } },
        suv:             { head: { x: 0.68, y: 1.08, z: -2.38, w: 0.40, h: 0.20 }, tail: { x: 0.68, y: 1.08, z: 2.38, w: 0.40, h: 0.20 } },
        van:             { head: { x: 0.70, y: 1.05, z: -2.52, w: 0.40, h: 0.20 }, tail: { x: 0.70, y: 1.05, z: 2.92, w: 0.40, h: 0.20 } },
        pickup:          { head: { x: 0.72, y: 0.98, z: -2.66, w: 0.42, h: 0.22 }, tail: { x: 0.72, y: 0.98, z: 2.66, w: 0.42, h: 0.22 } },
        truck:           { head: { x: 0.85, y: 0.95, z: -3.62, w: 0.42, h: 0.20 }, tail: { x: 0.85, y: 0.95, z: 3.52, w: 0.42, h: 0.20 } },
        truck_box:       { head: { x: 0.85, y: 0.95, z: -3.62, w: 0.42, h: 0.20 }, tail: { x: 0.85, y: 0.95, z: 3.52, w: 0.42, h: 0.20 } },
        semi:            { head: { x: 0.85, y: 1.25, z: -7.13, w: 0.42, h: 0.20 }, tail: { x: 0.85, y: 1.25, z: 8.52, w: 0.42, h: 0.20 } },
        truck_semi:      { head: { x: 0.85, y: 1.25, z: -7.13, w: 0.42, h: 0.20 }, tail: { x: 0.85, y: 1.25, z: 8.52, w: 0.42, h: 0.20 } },
        bus:             { head: { x: 0.90, y: 1.20, z: -5.79, w: 0.50, h: 0.30 }, tail: { x: 0.90, y: 1.20, z: 5.79, w: 0.50, h: 0.30 } },
        bus_city:        { head: { x: 0.90, y: 1.20, z: -5.79, w: 0.50, h: 0.30 }, tail: { x: 0.90, y: 1.20, z: 5.79, w: 0.50, h: 0.30 } },
        bus_coach:       { head: { x: 0.80, y: 1.40, z: -5.87, w: 0.40, h: 0.25 }, tail: { x: 0.80, y: 1.40, z: 4.37, w: 0.40, h: 0.25 } },
        schoolbus:       { head: { x: 0.80, y: 1.40, z: -5.87, w: 0.40, h: 0.25 }, tail: { x: 0.80, y: 1.40, z: 4.37, w: 0.40, h: 0.25 } },
        ambulance:       { head: { x: 0.69, y: 0.80, z: -2.66, w: 0.38, h: 0.16 }, tail: { x: 0.83, y: 1.00, z: 2.62, w: 0.38, h: 0.16 } },
        firetruck:       { head: { x: 0.76, y: 1.12, z: -3.22, w: 0.42, h: 0.20 }, tail: { x: 0.82, y: 1.06, z: 3.27, w: 0.42, h: 0.20 } },
        supercar:        { head: { x: 0.57, y: 0.445, z: -2.139, w: 0.29, h: 0.13 }, tail: { x: 0.57, y: 0.535, z: 2.036, w: 0.29, h: 0.13 } },
        supercar_hyper:  { head: { x: 0.57, y: 0.445, z: -2.139, w: 0.29, h: 0.13 }, tail: { x: 0.57, y: 0.535, z: 2.036, w: 0.29, h: 0.13 } },
        supercar_track:  { head: { x: 0.57, y: 0.445, z: -2.139, w: 0.29, h: 0.13 }, tail: { x: 0.57, y: 0.535, z: 2.036, w: 0.29, h: 0.13 } },
        motorcycle:      { head: { x: 0.00, y: 0.925, z: -0.812, w: 0.26, h: 0.15 }, tail: { x: 0.00, y: 0.805, z: 0.940, w: 0.22, h: 0.08 } },
        bike_sport:      { head: { x: 0.00, y: 0.925, z: -0.812, w: 0.26, h: 0.15 }, tail: { x: 0.00, y: 0.805, z: 0.940, w: 0.22, h: 0.08 } },
        bike_cruiser:    { head: { x: 0.00, y: 0.925, z: -0.850, w: 0.26, h: 0.15 }, tail: { x: 0.00, y: 0.805, z: 0.960, w: 0.22, h: 0.08 } },
        bike_dirt:       { head: { x: 0.00, y: 0.950, z: -0.812, w: 0.26, h: 0.15 }, tail: { x: 0.00, y: 0.820, z: 0.940, w: 0.22, h: 0.08 } },
        speedboat:       { head: { x: 0.70, y: 1.20, z: -4.00, w: 0.35, h: 0.20 }, tail: { x: 0.70, y: 0.80, z: 4.00, w: 0.35, h: 0.15 } },
        boat_speedboat:  { head: { x: 0.70, y: 1.20, z: -4.00, w: 0.35, h: 0.20 }, tail: { x: 0.70, y: 0.80, z: 4.00, w: 0.35, h: 0.15 } },
        boat_police:     { head: { x: 0.70, y: 1.20, z: -3.80, w: 0.35, h: 0.20 }, tail: { x: 0.70, y: 0.80, z: 3.80, w: 0.35, h: 0.15 } },
        boat_yacht:      { head: { x: 0.90, y: 1.40, z: -5.50, w: 0.45, h: 0.25 }, tail: { x: 0.90, y: 0.90, z: 5.50, w: 0.45, h: 0.20 } }
    };

    // ===========================================================================
    // TRANSMISSION & GEAR RATIOS (1-4 Manual Gears, 5 Auto Gear)
    // ===========================================================================
    const VEHICLE_GEARS = {
        1: { topFrac: 0.28, torqueMult: 1.45, minIdealFrac: 0.00, engineBrake: 2.4 },
        2: { topFrac: 0.52, torqueMult: 1.15, minIdealFrac: 0.12, engineBrake: 1.3 },
        3: { topFrac: 0.78, torqueMult: 0.90, minIdealFrac: 0.28, engineBrake: 0.6 },
        4: { topFrac: 1.00, torqueMult: 0.72, minIdealFrac: 0.44, engineBrake: 0.2 },
    };

    function getVehicleGear(v) {
        if (!v) return 1;
        if (v.gearMode === 'manual' && v.gear >= 1 && v.gear <= 4) {
            return v.gear;
        }
        // Auto gear mode (5): dynamic automatic transmission based on vehicle speed
        const top = (v.spec && v.spec.top) || 60;
        const spd = Math.max(0, Math.abs(v.speed || 0));
        const ratio = spd / top;
        if (ratio < 0.22) return 1;
        if (ratio < 0.46) return 2;
        if (ratio < 0.72) return 3;
        return 4;
    }

    class VehicleField {
        constructor(scene, matFlat, assets) {
            this.scene = scene;
            this.geos = Object.assign({}, VehicleGeo.build()); // copy: GLBs may override
            this.vehicles = [];
            this.pools = {};
            this.free = {};
            this.assets = assets || null;
            // GLB bodies: merged (wheels excluded) vertex-colored geometry.
            // GLB wheels: per-type instanced pools at the modeled hub offsets.
            this.glbWheels = null;
            if (this.assets) {
                for (const type in VEHICLE_TYPES) {
                    const g = this.assets.vehicles[type];
                    if (!g) continue;
                    const isLiveryType = (type === 'taxi' || type === 'police' || type === 'police_cruiser' || type === 'police_suv' || type === 'police_enforcer' || type === 'ambulance' || type === 'firetruck' || type === 'bus' || type === 'bus_city' || type === 'bus_coach' || type === 'schoolbus' || type === 'boat_police');
                    this.geos[type] = glbMergedGeometry(g.scene, {
                        isVehicleBody: true,
                        isLivery: isLiveryType,
                        skip: (name, o) => this._isWheelNode(name, o) || /^collider/i.test(name),
                    });
                    const fl = this._findWheelNode(g.scene);
                    const spec = VEHICLE_TYPES[type];
                    if (fl && !spec.isBoat) {
                        this.glbWheels = this.glbWheels || {};
                        const wp = new THREE.Vector3().setFromMatrixPosition(fl.matrixWorld);
                        const ox = spec.isBike ? 0 : (Math.abs(wp.x) > 0.05 ? Math.abs(wp.x) : spec.W / 2 - 0.06);
                        const oz = Math.abs(wp.z) > 0.05 ? Math.abs(wp.z) : this._wheelBase(type);
                        const wgeo = glbMergedGeometry(fl, { relTo: fl });
                        // Re-lay axles along local X: some importers bake the disc
                        // flat (axle along Y) or facing (axle along Z).
                        wgeo.computeBoundingBox();
                        const _wsz = new THREE.Vector3(); wgeo.boundingBox.getSize(_wsz);
                        if (_wsz.y <= _wsz.x && _wsz.y <= _wsz.z) wgeo.rotateZ(Math.PI / 2);
                        else if (_wsz.z <= _wsz.x && _wsz.z <= _wsz.y) { wgeo.rotateX(Math.PI / 2); wgeo.rotateZ(Math.PI / 2); }
                        wgeo.computeBoundingBox();
                        const _wsz2 = new THREE.Vector3(); wgeo.boundingBox.getSize(_wsz2);
                        const r = wp.y > 0.05 ? wp.y : clamp(Math.max(_wsz2.x, _wsz2.y, _wsz2.z) / 2, 0.25, 0.55);
                        this.glbWheels[type] = { geo: wgeo, r, ox, oz };
                    }
                }
            }
            this.mat = matFlat.clone();
            this.mat.side = THREE.DoubleSide;
            this.mat.onBeforeCompile = (shader) => {
                shader.vertexShader = 'varying float vIsTaillight;\nvarying float vIsHeadlight;\n' + shader.vertexShader.replace(
                    '#include <color_vertex>',
                    `#if defined( USE_COLOR_ALPHA )
                        vColor = vec4( 1.0 );
                    #elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
                        vColor = vec3( 1.0 );
                    #endif
                    #ifdef USE_COLOR
                        vColor *= color;
                    #endif
                    #ifdef USE_INSTANCING_COLOR
                        #ifdef USE_COLOR
                        // Only apply paint tint to white/paint vertices (r > 0.95 && g > 0.95 && b > 0.95).
                        // This preserves tinted windows, black chassis/trim, alloy chrome, and lights!
                        if (color.r > 0.95 && color.g > 0.95 && color.b > 0.95) {
                            vColor.xyz *= instanceColor.xyz;
                        }
                        #else
                        vColor.xyz *= instanceColor.xyz;
                        #endif
                    #endif
                    vIsTaillight = (color.r > 0.70 && color.g < 0.25 && color.b < 0.25 && position.z > 0.0) ? 1.0 : 0.0;
                    vIsHeadlight = (((color.r > 0.72 && color.r < 0.88 && color.g > 0.85 && color.b > 0.92) || (color.r > 0.92 && color.g > 0.85 && color.b > 0.50 && color.b < 0.88)) && position.z < 0.0) ? 1.0 : 0.0;`
                );
                shader.fragmentShader = 'varying float vIsTaillight;\nvarying float vIsHeadlight;\n' + shader.fragmentShader.replace(
                    '#include <dithering_fragment>',
                    `#include <dithering_fragment>
                    if (vIsTaillight > 0.5) {
                        gl_FragColor.rgb = vec3(1.0, 0.03, 0.03) * 2.8;
                    } else if (vIsHeadlight > 0.5) {
                        gl_FragColor.rgb = vec3(1.0, 0.98, 0.85) * 2.5;
                    }`
                );
            };
            for (const type in VEHICLE_TYPES) {
                const spec = VEHICLE_TYPES[type];
                const mesh = new THREE.InstancedMesh(this.geos[type], this.mat, spec.pool);
                mesh.count = spec.pool;
                mesh.instanceMatrix.setUsage && mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
                mesh.castShadow = true;
                mesh.receiveShadow = false;
                scene.add(mesh);
                this.pools[type] = mesh;
                this.free[type] = [];
                for (let i = spec.pool - 1; i >= 0; i--) this.free[type].push(i);
                // Pre-populate instanceColor so Three.js doesn't default to pitch-black zeros
                const isLivery = (type === 'taxi' || type === 'police' || type === 'police_cruiser' || type === 'police_suv' || type === 'police_enforcer' || type === 'ambulance' || type === 'firetruck' || type === 'bus' || type === 'bus_city' || type === 'bus_coach' || type === 'schoolbus' || type === 'boat_police');
                const defaultPaint = isLivery ? 0xffffff : PAINTS[spec.pool % PAINTS.length];
                const defCol = new THREE.Color(defaultPaint);
                for (let i = 0; i < spec.pool; i++) {
                    mesh.setColorAt(i, defCol);
                }
                if (mesh.instanceColor) {
                    mesh.instanceColor.setUsage && mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
                    mesh.instanceColor.needsUpdate = true;
                }
                // Park unused slots far below the world.
                this._dummy = this._dummy || new THREE.Object3D();
            }
            if (this.glbWheels) {
                // Per-type wheel pools (GLB wheel geometry, axle along local X).
                this.wheelPools = {};
                for (const type in VEHICLE_TYPES) {
                    const spec = VEHICLE_TYPES[type];
                    const w = this.glbWheels[type] || this.glbWheels.sedan || Object.values(this.glbWheels)[0];
                    if (!w) continue; // no wheel geometry anywhere: procedural mesh below covers it
                    const pool = new THREE.InstancedMesh(w.geo, this.mat, spec.pool * 4);
                    pool.count = spec.pool * 4;
                    pool.instanceMatrix.setUsage && pool.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
                    scene.add(pool);
                    this.wheelPools[type] = pool;
                }
            }
            // Shared procedural wheels (per-type fallback for wheel-less models).
            {
                const wb = new GeoBatch();
                wb.cylinderY(0, 0, 0, 0.34, 0.34, 0.24, 10, [0.12, 0.12, 0.14]);
                wb.disc(0.13, 0, 0, 0.34, 10, [0.35, 0.36, 0.4], true);
                wb.disc(-0.13, 0, 0, 0.34, 10, [0.35, 0.36, 0.4], false);
                const wgeo = wb.buildGeometry();
                const totalWheels = 4 * Object.values(VEHICLE_TYPES).reduce((s, t) => s + t.pool, 0);
                this.wheelMesh = new THREE.InstancedMesh(wgeo, this.mat, totalWheels);
                this.wheelMesh.count = totalWheels;
                this.wheelMesh.instanceMatrix.setUsage && this.wheelMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
                scene.add(this.wheelMesh);
            }
            // The GLB vehicle models already feature authentic, properly positioned,
            // shader-illuminated headlights and taillights with lenses and bezels.
            // Floating box overlays (taillightMesh/headlightMesh) are omitted to avoid duplicate floating lights.
            this.taillightMesh = null;
            this.headlightMesh = null;
            const totalVehicles = Object.values(VEHICLE_TYPES).reduce((s, t) => s + t.pool, 0);

            // Forward ground projection light cone (illuminates street ahead of car)
            const beamCanvas = document.createElement('canvas');
            beamCanvas.width = 64; beamCanvas.height = 128;
            const beamCtx = beamCanvas.getContext('2d');
            const beamGrad = beamCtx.createLinearGradient(0, 128, 0, 0);
            beamGrad.addColorStop(0, 'rgba(255, 252, 235, 0.48)');
            beamGrad.addColorStop(0.3, 'rgba(255, 248, 205, 0.32)');
            beamGrad.addColorStop(0.7, 'rgba(255, 238, 175, 0.14)');
            beamGrad.addColorStop(1, 'rgba(255, 220, 140, 0.0)');
            beamCtx.fillStyle = beamGrad;
            beamCtx.beginPath();
            beamCtx.moveTo(20, 128);
            beamCtx.lineTo(44, 128);
            beamCtx.lineTo(60, 4);
            beamCtx.lineTo(4, 4);
            beamCtx.closePath();
            beamCtx.fill();
            const beamTex = new THREE.CanvasTexture(beamCanvas);
            const beamGeo = new THREE.PlaneGeometry(4.8, 14.0);
            beamGeo.rotateX(-Math.PI / 2);
            beamGeo.translate(0, 0, -7.0); // 0 to -14m forward from nose
            const beamMat = new THREE.MeshBasicMaterial({
                map: beamTex,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            this.headlightBeamMesh = new THREE.InstancedMesh(beamGeo, beamMat, totalVehicles);
            this.headlightBeamMesh.count = totalVehicles;
            if (this.headlightBeamMesh.instanceMatrix.setUsage) this.headlightBeamMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            this.headlightBeamMesh.frustumCulled = false;
            scene.add(this.headlightBeamMesh);

            // NPC riders for AI-driven motorcycles
            this.motorcycleRiders = [];
            const riderPalettes = [
                { shirt: [0.12, 0.12, 0.14], pants: [0.15, 0.25, 0.45], skin: [1, 0.85, 0.72], hair: [0.15, 0.10, 0.08] },
                { shirt: [0.82, 0.18, 0.15], pants: [0.18, 0.18, 0.20], skin: [0.65, 0.48, 0.38], hair: [0.08, 0.08, 0.08] },
                { shirt: [0.25, 0.38, 0.22], pants: [0.45, 0.40, 0.32], skin: [0.92, 0.78, 0.65], hair: [0.45, 0.28, 0.14] },
                { shirt: [0.85, 0.85, 0.90], pants: [0.14, 0.14, 0.16], skin: [0.42, 0.28, 0.20], hair: [0.05, 0.05, 0.05] },
                { shirt: [0.85, 0.65, 0.12], pants: [0.12, 0.18, 0.32], skin: [0.95, 0.80, 0.68], hair: [0.20, 0.15, 0.10] },
                { shirt: [0.18, 0.35, 0.85], pants: [0.28, 0.30, 0.34], skin: [0.70, 0.52, 0.40], hair: [0.10, 0.08, 0.06] },
            ];
            let motoPool = 0;
            this._riderOffsets = {};
            for (const t in VEHICLE_TYPES) {
                if (VEHICLE_TYPES[t].isBike) {
                    this._riderOffsets[t] = motoPool;
                    motoPool += VEHICLE_TYPES[t].pool;
                }
            }
            motoPool = Math.max(motoPool, 18);
            for (let ri = 0; ri < motoPool; ri++) {
                const rig = new HumanRig(matFlat, riderPalettes[ri % riderPalettes.length], null, assets);
                rig.group.visible = false;
                scene.add(rig.group);
                this.motorcycleRiders.push(rig);
            }

            this._dummy = new THREE.Object3D();
            this._dummy.rotation.order = 'YXZ';
            this._carMat = new THREE.Matrix4();
            this._tempVec = new THREE.Vector3();
            this._q = [];
            this._color = new THREE.Color();
            this._hideAll();
        }

        _hideAll() {
            const d = this._dummy;
            d.position.set(0, -500, 0);
            d.scale.set(0.001, 0.001, 0.001);
            d.rotation.set(0, 0, 0);
            d.updateMatrix();
            for (const type in this.pools) {
                const mesh = this.pools[type];
                for (let i = 0; i < mesh.count; i++) mesh.setMatrixAt(i, d.matrix);
                mesh.instanceMatrix.needsUpdate = true;
            }
            if (this.wheelMesh) {
                for (let i = 0; i < this.wheelMesh.count; i++) this.wheelMesh.setMatrixAt(i, d.matrix);
                this.wheelMesh.instanceMatrix.needsUpdate = true;
            }
            if (this.wheelPools) {
                for (const type in this.wheelPools) {
                    const m = this.wheelPools[type];
                    for (let i = 0; i < m.count; i++) m.setMatrixAt(i, d.matrix);
                    m.instanceMatrix.needsUpdate = true;
                }
            }
            if (this.taillightMesh) {
                for (let i = 0; i < this.taillightMesh.count; i++) this.taillightMesh.setMatrixAt(i, d.matrix);
                this.taillightMesh.instanceMatrix.needsUpdate = true;
            }
            if (this.headlightMesh) {
                for (let i = 0; i < this.headlightMesh.count; i++) this.headlightMesh.setMatrixAt(i, d.matrix);
                this.headlightMesh.instanceMatrix.needsUpdate = true;
            }
            if (this.headlightBeamMesh) {
                for (let i = 0; i < this.headlightBeamMesh.count; i++) this.headlightBeamMesh.setMatrixAt(i, d.matrix);
                this.headlightBeamMesh.instanceMatrix.needsUpdate = true;
            }
            if (this.motorcycleRiders) {
                for (const r of this.motorcycleRiders) r.group.visible = false;
            }
            this._createDoorMesh();
        }

        _createDoorMesh() {
            const doorBatch = new GeoBatch();
            // Door outer skin
            doorBatch.box(0, 0, 0.45, 0.08, 0.72, 0.90, [1, 1, 1]);
            // Interior trim card
            doorBatch.box(0.02, 0, 0.45, 0.05, 0.68, 0.86, [0.15, 0.15, 0.16]);
            // Window glass
            doorBatch.box(0, 0.54, 0.45, 0.04, 0.36, 0.86, [0.12, 0.15, 0.22]);
            // Window top & pillar frames
            doorBatch.box(0, 0.73, 0.45, 0.07, 0.04, 0.88, [0.1, 0.1, 0.1]);
            doorBatch.box(0, 0.54, 0.01, 0.07, 0.38, 0.04, [0.1, 0.1, 0.1]);
            doorBatch.box(0, 0.54, 0.89, 0.07, 0.38, 0.04, [0.1, 0.1, 0.1]);
            // Chrome door handle
            doorBatch.box(-0.045, 0.08, 0.75, 0.03, 0.05, 0.14, [4.5, 4.5, 4.8]);
            const doorGeo = doorBatch.buildGeometry();
            this._doorMat = this.mat.clone();
            this._doorMesh = new THREE.Mesh(doorGeo, this._doorMat);
            this._doorMesh.visible = false;
            this.scene.add(this._doorMesh);
        }

        updateDoor(v) {
            if (!this._doorMesh) return;
            if (!v || !v.doorAngle || v.doorAngle <= 0.005) {
                this._doorMesh.visible = false;
                return;
            }
            this._doorMesh.visible = true;
            if (v.color !== undefined && this._doorMat.color) {
                this._doorMat.color.set(v.color);
            }
            const spec = v.spec || VEHICLE_TYPES[v.type] || VEHICLE_TYPES.sedan;
            const fx = -Math.sin(v.heading), fz = -Math.cos(v.heading);
            const rx = Math.cos(v.heading), rz = -Math.sin(v.heading);
            const halfW = spec.W * 0.5;
            const hingeX = v.x - rx * (halfW - 0.04) + fx * (spec.L * 0.18);
            const hingeY = (v.y || 0.15) + 0.42;
            const hingeZ = v.z - rz * (halfW - 0.04) + fz * (spec.L * 0.18);
            this._doorMesh.position.set(hingeX, hingeY, hingeZ);
            this._doorMesh.rotation.set(v.pitch || 0, v.heading - v.doorAngle, v.roll || 0);
        }

        /** Spawn a vehicle (returns it or null if the pool is full). */
        spawn(type, x, z, heading, opts) {
            if (!this.free[type] || !this.free[type].length) {
                // If the free pool is exhausted, recycle a distant non-essential ambient car
                let recycleCandidate = null;
                let maxDistSq = 0;
                const px = (this.game && this.game.player && this.game.player.pos) ? this.game.player.pos.x : x;
                const pz = (this.game && this.game.player && this.game.player.pos) ? this.game.player.pos.z : z;
                for (let k = 0; k < this.vehicles.length; k++) {
                    const cand = this.vehicles[k];
                    if (cand.type === type && !cand.safeParked && !cand.isGarageVehicle && cand.driver !== 'player' && !cand.isPlayerVehicle) {
                        const dSq = (cand.x - px) * (cand.x - px) + (cand.z - pz) * (cand.z - pz);
                        if (dSq > maxDistSq) {
                            maxDistSq = dSq;
                            recycleCandidate = cand;
                        }
                    }
                }
                if (recycleCandidate) {
                    this.remove(recycleCandidate);
                }
            }
            if (!this.free[type] || !this.free[type].length) return null;
            opts = opts || {};
            const spec = VEHICLE_TYPES[type];
            const idx = this.free[type].pop();
            const isLivery = (type === 'taxi' || type === 'police' || type === 'police_cruiser' || type === 'police_suv' || type === 'police_enforcer' || type === 'ambulance' || type === 'firetruck' || type === 'bus' || type === 'bus_city' || type === 'bus_coach' || type === 'schoolbus' || type === 'boat_police');
            const defaultPaint = isLivery ? 0xffffff : PAINTS[(Math.random() * PAINTS.length) | 0];
            const carColor = (opts.color != null && opts.color !== 0) ? opts.color : defaultPaint;
            const v = {
                type, spec, idx,
                x, y: opts.y !== undefined ? opts.y : Math.max(0.1, bridgeDeckY(x, z)), z, heading,
                speed: 0, steer: 0, spin: 0,
                parked: !!opts.parked,
                driver: opts.driver || null,
                hp: spec.hp, maxHp: spec.hp, dead: false, smokeT: 0,
                bumpX: 0, bumpZ: 0,
                color: carColor,
                braking: false, handbraking: false,
                ai: null, wheelBase: this._wheelBase(type), wheelHalf: spec.W / 2 - 0.06,
                // Real 3D rigid-body & 4-wheel suspension physics state
                vx: 0, vy: 0, vz: 0,
                pitch: 0, roll: 0,
                angPitch: 0, angYaw: 0, angRoll: 0,
                wheelSusp: [0.55, 0.55, 0.55, 0.55],
                wheelGround: [true, true, true, true],
                grounded: true, airTime: 0,
                // Hand-over flags shared with the ped system: a driver stepping
                // out of a car it just parked, a ped arriving to take one, and
                // the claim that stops two peds walking to the same door. They
                // live here so every vehicle keeps exactly one shape.
                gone: false, tempPark: false, dropOff: false, wantsDrive: false,
                claimedBy: null, claimExp: 0,
                // Turn indicators / reverse lamps (see writeMatrix) and the car
                // park bay this vehicle is sitting in, if any.
                signal: 0, signalT: 0, lotSpot: null,
                // Transmission gear state (1-4 manual, 5 auto)
                gearMode: opts.gearMode || 'auto',
                gear: opts.gear || 5,
                currentGear: 1,
                rpm: 0.20,
                doorAngle: 0,
            };
            this.vehicles.push(v);
            this._color.set(carColor);
            this.pools[type].setColorAt(idx, this._color);
            this.pools[type].instanceColor.needsUpdate = true;
            this.writeMatrix(v);
            return v;
        }

        getGear(v) {
            return getVehicleGear(v);
        }

        setGear(v, g) {
            if (!v) return;
            if (g >= 1 && g <= 4) {
                v.gearMode = 'manual';
                v.gear = g;
                v.currentGear = g;
            } else if (g === 5) {
                v.gearMode = 'auto';
                v.gear = 5;
                v.currentGear = getVehicleGear(v);
            }
        }

        /**
         * True when a node (or any of its ancestors) is a wheel part. Matches
         * the contract names (`Wheel_FL`…), bare `Wheel` hubs, and importer
         * variants (`Ambulance_wheel_front_left`…), so wheels never bake into
         * the body mesh no matter which pack produced the model.
         */
        _isWheelNodeName(nm) {
            nm = nm || '';
            if (/^wheels?(\d+|\.|$|_)/i.test(nm)) return true;
            return /wheel/i.test(nm) || /tire/i.test(nm);
        }
        _isWheelNode(name, o) {
            for (let n = o; n; n = n.parent) {
                if (this._isWheelNodeName(n.name)) return true;
            }
            return false;
        }
        /**
         * Front-left wheel node lookup, tolerant of importer naming variants:
         * exact `Wheel_FL` / `Wheel_Front`, then fuzzy (`wheel` + front/left
         * tags), then any bare `Wheel` node, else null for genuinely
         * wheel-less models. Forward is -z, left is -x.
         */
        _findWheelNode(scene) {
            const exact = glbChildByName(scene, 'Wheel_FL') || glbChildByName(scene, 'Wheel_Front') || glbChildByName(scene, 'Wheel_F');
            if (exact) return exact;
            let anyWheel = null, best = null, bestScore = 0;
            scene.traverse((o) => {
                const nm = o.name || '';
                if (!/wheel/i.test(nm)) return;
                if (!anyWheel) anyWheel = o;
                const low = nm.toLowerCase();
                const frontish = low.includes('front') || /(^|_)(fl|lf)($|_)/.test(low);
                const leftish = low.includes('left') || /(^|_)(fl|lf)($|_)/.test(low);
                const score = (frontish ? 2 : 0) + (leftish ? 1 : 0);
                if (score > bestScore) { bestScore = score; best = o; }
            });
            return best || anyWheel;
        }
        _wheelBase(type) {
            if (this.glbWheels && this.glbWheels[type]) return this.glbWheels[type].oz;
            const L = VEHICLE_TYPES[type].L;
            return type === 'bus' || type === 'schoolbus' || type === 'truck' || type === 'semi' || type === 'garbage' ? L * 0.32 : L * 0.34;
        }

        remove(v) {
            if (!v) return;
            // Hard protection: NEVER despawn or recycle a vehicle currently driven or carjacked by the player, or saved garage vehicles
            if (v.driver === 'player' || v.isPlayerVehicle || v.isGarageVehicle || v.safeParked) return;
            if (this.game && this.game.player && this.game.player.inVehicle === v) return;
            if (this.game && this.game._carjackV === v) return;
            const i = this.vehicles.indexOf(v);
            if (i === -1) return;
            this.vehicles.splice(i, 1);
            v.gone = true;               // so a ped walking to it can tell
            this.free[v.type].push(v.idx);
            const d = this._dummy;
            d.position.set(0, -500, 0);
            d.scale.set(0.001, 0.001, 0.001);
            d.updateMatrix();
            this.pools[v.type].setMatrixAt(v.idx, d.matrix);
            this.pools[v.type].instanceMatrix.needsUpdate = true;
            this._hideWheels(v, d);
            this._hideTaillights(v, d);
            this._hideHeadlights(v, d);
            if ((v.spec.isBike || v.type === 'motorcycle' || v.type.startsWith('bike_')) && this.motorcycleRiders) {
                const rIdx = (this._riderOffsets && this._riderOffsets[v.type] !== undefined)
                    ? (this._riderOffsets[v.type] + v.idx)
                    : (v.idx % this.motorcycleRiders.length);
                if (this.motorcycleRiders[rIdx]) this.motorcycleRiders[rIdx].group.visible = false;
            }
        }

        _hideWheels(v, d) {
            if (this.wheelPools) {
                const pool = this.wheelPools[v.type];
                for (let k = 0; k < 4; k++) pool.setMatrixAt(v.idx * 4 + k, d.matrix);
                pool.instanceMatrix.needsUpdate = true;
                return;
            }
            const base = this._typeWheelOffset(v.type) + v.idx * 4;
            for (let k = 0; k < 4; k++) this.wheelMesh.setMatrixAt(base + k, d.matrix);
            this.wheelMesh.instanceMatrix.needsUpdate = true;
        }

        _hideTaillights(v, d) {
            if (!this.taillightMesh) return;
            d.position.set(0, -500, 0);
            d.scale.set(0, 0, 0);
            d.updateMatrix();
            const base = this._typeTaillightOffset(v.type) + v.idx * 2;
            this.taillightMesh.setMatrixAt(base, d.matrix);
            this.taillightMesh.setMatrixAt(base + 1, d.matrix);
            this.taillightMesh.instanceMatrix.needsUpdate = true;
        }

        _hideHeadlights(v, d) {
            d.position.set(0, -500, 0);
            d.scale.set(0, 0, 0);
            d.updateMatrix();
            if (this.headlightMesh) {
                const base = this._typeTaillightOffset(v.type) + v.idx * 2;
                this.headlightMesh.setMatrixAt(base, d.matrix);
                this.headlightMesh.setMatrixAt(base + 1, d.matrix);
                this.headlightMesh.instanceMatrix.needsUpdate = true;
            }
            if (this.headlightBeamMesh) {
                const beamIdx = this._typeBeamOffset(v.type) + v.idx;
                this.headlightBeamMesh.setMatrixAt(beamIdx, d.matrix);
                this.headlightBeamMesh.instanceMatrix.needsUpdate = true;
            }
        }

        _typeBeamOffset(type) {
            if (!this._beamOffsets) {
                this._beamOffsets = {};
                let off = 0;
                for (const t in VEHICLE_TYPES) { this._beamOffsets[t] = off; off += VEHICLE_TYPES[t].pool; }
            }
            return this._beamOffsets[type];
        }

        updateAllLights() {
            for (let i = 0; i < this.vehicles.length; i++) {
                this.writeMatrix(this.vehicles[i]);
            }
        }

        /**
         * Push a vehicle's body + 4 wheels into their InstancedMesh pools.
         * Wheels spin with `v.spin` (accumulated angle) and front wheels turn
         * with `v.steer`.
         */
        writeMatrix(v) {
            const d = this._dummy;
            d.position.set(v.x, v.y, v.z);
            // Vehicles ride pitch/roll from terrain slopes and wave action
            d.rotation.set(v.pitch || 0, v.heading, v.roll || 0);
            d.scale.set(1, 1, 1);
            d.updateMatrix();
            this.pools[v.type].setMatrixAt(v.idx, d.matrix);
            this.pools[v.type].instanceMatrix.needsUpdate = true;

            const carMatrix = this._carMat = this._carMat || new THREE.Matrix4();
            carMatrix.copy(d.matrix);
            const tempVec = this._tempVec = this._tempVec || new THREE.Vector3();

            const fx = -Math.sin(v.heading), fz = -Math.cos(v.heading); // forward
            const rx = Math.cos(v.heading), rz = -Math.sin(v.heading);  // right
            if (this.wheelPools && this.wheelPools[v.type] && (this.glbWheels[v.type] || this.glbWheels.sedan)) {
                // GLB wheels: geometry is hub-centered with the axle along
                // local X, at the modeled hub offsets — no re-orientation.
                const w = this.glbWheels[v.type] || this.glbWheels.sedan;
                const pool = this.wheelPools[v.type];
                if (v.spec.isBoat) {
                    for (let k = 0; k < 4; k++) {
                        d.position.set(0, -500, 0);
                        d.updateMatrix();
                        pool.setMatrixAt(v.idx * 4 + k, d.matrix);
                    }
                } else if (v.spec.isBike || v.type === 'motorcycle' || v.type.startsWith('bike_')) {
                    for (let k = 0; k < 4; k++) {
                        if (k >= 2) {
                            d.position.set(0, -500, 0);
                            d.updateMatrix();
                            pool.setMatrixAt(v.idx * 4 + k, d.matrix);
                            continue;
                        }
                        const front = k === 0;
                        const distZ = front ? -(w.oz || 0.72) : (w.oz || 0.72);
                        const susp = (v.wheelSusp && v.wheelSusp[k] !== undefined) ? v.wheelSusp[k] : 0.55;
                        const suspOffset = 0.55 - susp;
                        tempVec.set(0, w.r + suspOffset, distZ).applyMatrix4(carMatrix);
                        d.position.copy(tempVec);
                        d.rotation.set(v.pitch || 0, v.heading + (front ? v.steer * 0.5 : 0), v.roll || 0);
                        d.rotateX(v.spin);
                        d.updateMatrix();
                        pool.setMatrixAt(v.idx * 4 + k, d.matrix);
                    }
                } else {
                    for (let k = 0; k < 4; k++) {
                        const front = k < 2, right = k % 2 === 0;
                        const lx = right ? w.ox : -w.ox;
                        const lz = front ? -w.oz : w.oz;
                        const susp = (v.wheelSusp && v.wheelSusp[k] !== undefined) ? v.wheelSusp[k] : 0.55;
                        const suspOffset = 0.55 - susp;
                        tempVec.set(lx, w.r + suspOffset, lz).applyMatrix4(carMatrix);
                        d.position.copy(tempVec);
                        d.rotation.set(v.pitch || 0, v.heading + (front ? v.steer * 0.5 : 0), v.roll || 0);
                        d.rotateX(v.spin);
                        d.updateMatrix();
                        pool.setMatrixAt(v.idx * 4 + k, d.matrix);
                    }
                }
                pool.instanceMatrix.needsUpdate = true;
            } else {
                // Procedural wheels: 4 slots keyed by vehicle's global slot offset.
                const typeOffset = this._typeWheelOffset(v.type);
                const base = typeOffset + v.idx * 4;
                if (v.spec.isBoat) {
                    for (let k = 0; k < 4; k++) {
                        d.position.set(0, -500, 0);
                        d.updateMatrix();
                        this.wheelMesh.setMatrixAt(base + k, d.matrix);
                    }
                } else if (v.spec.isBike || v.type === 'motorcycle' || v.type.startsWith('bike_')) {
                    for (let k = 0; k < 4; k++) {
                        if (k >= 2) {
                            d.position.set(0, -500, 0);
                            d.updateMatrix();
                            this.wheelMesh.setMatrixAt(base + k, d.matrix);
                            continue;
                        }
                        const front = k === 0;
                        const distZ = front ? -(v.wheelBase || 0.72) : (v.wheelBase || 0.72);
                        const susp = (v.wheelSusp && v.wheelSusp[k] !== undefined) ? v.wheelSusp[k] : 0.55;
                        const suspOffset = 0.55 - susp;
                        tempVec.set(0, 0.32 + suspOffset, distZ).applyMatrix4(carMatrix);
                        d.position.copy(tempVec);
                        d.rotation.set(v.pitch || 0, v.heading + (front ? v.steer * 0.5 : 0), v.roll || 0);
                        d.rotateZ(Math.PI / 2);
                        d.rotateX(v.spin);
                        d.updateMatrix();
                        this.wheelMesh.setMatrixAt(base + k, d.matrix);
                    }
                } else {
                    for (let k = 0; k < 4; k++) {
                        const front = k < 2, right = k % 2 === 0;
                        const lx = right ? v.wheelHalf : -v.wheelHalf;
                        const lz = front ? -v.wheelBase : v.wheelBase;
                        const susp = (v.wheelSusp && v.wheelSusp[k] !== undefined) ? v.wheelSusp[k] : 0.55;
                        const suspOffset = 0.55 - susp;
                        tempVec.set(lx, 0.34 + suspOffset, lz).applyMatrix4(carMatrix);
                        d.position.copy(tempVec);
                        // Yaw (car heading + wheel steer) first, lay cylinder on its
                        // side (axle along local x), then spin about that axle.
                        d.rotation.set(v.pitch || 0, v.heading + (front ? v.steer * 0.5 : 0), v.roll || 0);
                        d.rotateZ(Math.PI / 2);
                        d.rotateX(v.spin);
                        d.updateMatrix();
                        this.wheelMesh.setMatrixAt(base + k, d.matrix);
                    }
                }
                this.wheelMesh.instanceMatrix.needsUpdate = true;
            }

            // Red taillights / brake lights
            if (this.taillightMesh) {
                const tailBase = this._typeTaillightOffset(v.type) + v.idx * 2;
                if (v.dead || (v.parked && v.driver !== 'player')) {
                    this._hideTaillights(v, d);
                } else {
                    const ls = VEHICLE_LIGHT_SPECS[v.type] || VEHICLE_LIGHT_SPECS.sedan;
                    const isBraking = !!(v.braking || v.handbraking);
                    const isHandbrake = !!v.handbraking;
                    let s = isHandbrake ? 1.0 : (isBraking ? 1.0 : 0.88);
                    if (v.speed < -0.25) s = 1.0;
                    let sL = s, sR = s;
                    if (v.signal) {
                        const on = (v.signalT % 0.72) < 0.4;
                        if (v.signal < 0) sL = on ? 1.0 : 0.15;
                        else sR = on ? 1.0 : 0.15;
                    }
                    const distRear = -Math.abs(ls.tail.z);
                    const distLat = ls.tail.x;

                    if (v.spec.isBike || v.type === 'motorcycle' || v.type.startsWith('bike_')) {
                        // Single centered taillight
                        tempVec.set(0, ls.tail.y, distRear).applyMatrix4(carMatrix);
                        d.position.copy(tempVec);
                        d.rotation.set(v.pitch || 0, v.heading, v.roll || 0);
                        d.scale.set(ls.tail.w * s, ls.tail.h * s, 0.08);
                        d.updateMatrix();
                        this.taillightMesh.setMatrixAt(tailBase, d.matrix);

                        d.position.set(0, -500, 0);
                        d.scale.set(0, 0, 0);
                        d.updateMatrix();
                        this.taillightMesh.setMatrixAt(tailBase + 1, d.matrix);
                    } else {
                        // Left (k=0) and Right (k=1) taillights on vehicle body
                        for (let k = 0; k < 2; k++) {
                            const side = k === 0 ? -1 : 1;
                            const sk = k === 0 ? sL : sR;
                            tempVec.set(side * distLat, ls.tail.y, distRear).applyMatrix4(carMatrix);
                            d.position.copy(tempVec);
                            d.rotation.set(v.pitch || 0, v.heading, v.roll || 0);
                            d.scale.set(ls.tail.w * sk, ls.tail.h * sk, 0.08);
                            d.updateMatrix();
                            this.taillightMesh.setMatrixAt(tailBase + k, d.matrix);
                        }
                    }
                    this.taillightMesh.instanceMatrix.needsUpdate = true;
                }
            }

            // Forward road illumination beam at night (illuminates asphalt ahead of car)
            if (this.headlightBeamMesh) {
                const beamIdx = this._typeBeamOffset(v.type) + v.idx;
                const darkFactor = (this.game && this.game.dayNight && this.game.dayNight.getDarkAmount)
                    ? this.game.dayNight.getDarkAmount()
                    : ((this.game && this.game.dayNight && !this.game.dayNight.getTime().isDay) ? 1.0 : 0.0);

                if (v.dead || darkFactor <= 0.05 || (v.parked && v.driver !== 'player')) {
                    d.position.set(0, -500, 0);
                    d.scale.set(0, 0, 0);
                    d.updateMatrix();
                    this.headlightBeamMesh.setMatrixAt(beamIdx, d.matrix);
                    this.headlightBeamMesh.instanceMatrix.needsUpdate = true;
                } else {
                    const ls = VEHICLE_LIGHT_SPECS[v.type] || VEHICLE_LIGHT_SPECS.sedan;
                    const distFwd = Math.abs(ls.head.z);
                    d.position.set(v.x + fx * distFwd, Math.max(0.185, (v.y || 0) + 0.035), v.z + fz * distFwd);
                    d.rotation.set(v.pitch || 0, v.heading, v.roll || 0);
                    d.scale.set(1.0, 1.0, darkFactor);
                    d.updateMatrix();
                    this.headlightBeamMesh.setMatrixAt(beamIdx, d.matrix);
                    this.headlightBeamMesh.instanceMatrix.needsUpdate = true;
                }
            }

            // Animate and position mounted rider on AI-driven motorcycles
            if ((v.spec.isBike || v.type === 'motorcycle' || v.type.startsWith('bike_')) && this.motorcycleRiders) {
                const rIdx = (this._riderOffsets && this._riderOffsets[v.type] !== undefined)
                    ? (this._riderOffsets[v.type] + v.idx)
                    : (v.idx % this.motorcycleRiders.length);
                const rider = this.motorcycleRiders[rIdx];
                if (rider) {
                    if (v.driver === 'ai' && !v.dead && !v.gone && !v.parked) {
                        rider.group.visible = true;
                        rider.group.position.set(v.x - fx * 0.22, v.y - 0.09, v.z - fz * 0.22);
                        rider.group.rotation.y = v.heading;
                        const lean = clamp(-v.steer * 0.42 - (v.yawRate || 0) * 0.15, -0.45, 0.45);
                        rider.group.rotation.z = lean;
                        const spd = clamp(Math.abs(v.speed) / 24, 0, 1);
                        if (rider.torso) rider.torso.rotation.set(-0.36 - spd * 0.18, 0, 0);
                        if (rider.head) rider.head.rotation.set(0.30 + spd * 0.14, 0, 0);
                        if (rider.armL) rider.armL.rotation.set(0.52 + spd * 0.14, -0.16, -0.20);
                        if (rider.armR) rider.armR.rotation.set(0.52 + spd * 0.14, 0.16, 0.20);
                        if (rider.legL) rider.legL.rotation.set(0.18, 0.18, -0.16);
                        if (rider.legR) rider.legR.rotation.set(0.18, -0.18, 0.16);
                    } else {
                        rider.group.visible = false;
                    }
                }
            }
        }

        _typeTaillightOffset(type) {
            if (!this._taillightOffsets) {
                this._taillightOffsets = {};
                let off = 0;
                for (const t in VEHICLE_TYPES) { this._taillightOffsets[t] = off; off += VEHICLE_TYPES[t].pool * 2; }
            }
            return this._taillightOffsets[type];
        }

        _typeWheelOffset(type) {
            if (!this._wheelOffsets) {
                this._wheelOffsets = {};
                let off = 0;
                for (const t in VEHICLE_TYPES) { this._wheelOffsets[t] = off; off += VEHICLE_TYPES[t].pool * 4; }
            }
            return this._wheelOffsets[type];
        }

        /**
         * Player-driven arcade step (maps key input to controls, then steps).
         */
        driveStep(v, dt, input, physics, fx) {
            const c = { throttle: 0, brake: 0, steer: 0, handbrake: false };
            if (input) {
                if (input.keys.KeyW || input.keys.ArrowUp) c.throttle = 1;
                if (input.keys.KeyS || input.keys.ArrowDown) c.brake = 1;
                if (input.keys.KeyA || input.keys.ArrowLeft) c.steer = 1;  // positive steer turns left (heading +=)
                if (input.keys.KeyD || input.keys.ArrowRight) c.steer = -1;
                c.handbrake = !!(input.keys.Space || input.keys.Spacebar);
                const isHorn = !!input.keys.KeyH;
                if (fx && fx.setHorn) {
                    fx.setHorn(isHorn, v.x, v.z);
                }
            }
            return this.step(v, dt, c, physics, fx);
        }

        /**
         * Arcade physics step with abstract controls
         * { throttle 0..1, brake 0..1, steer -1..1, handbrake }.
         */
        step(v, dt, c, physics, fx) {
            const spec = v.spec;
            v.braking = false;
            v.handbraking = false;
            dt = Math.min(dt, 0.05); // Clamp dt to prevent physics simulation instability on frame spikes

            // Water surface & elevation
            const wt = performance.now() * 0.001;
            const waterSurf = getWaterSurface(v.x, v.z, wt);

            // Forward direction vector
            const fx_ = -Math.sin(v.heading), fz_ = -Math.cos(v.heading);

            // --- 1. MOTORBOATS HYDRODYNAMICS ---
            if (spec.isBoat) {
                const effGear = getVehicleGear(v);
                v.currentGear = effGear;
                const gData = VEHICLE_GEARS[effGear] || VEHICLE_GEARS[1];
                const maxGearSpeed = spec.top * gData.topFrac;

                if (c.throttle > 0) {
                    if (v.speed < maxGearSpeed) {
                        const minSpd = spec.top * gData.minIdealFrac;
                        const bogDown = (v.gearMode === 'manual' && v.speed < minSpd)
                            ? clamp(0.3 + 0.7 * (Math.max(0, v.speed) / Math.max(1, minSpd)), 0.3, 1.0)
                            : 1.0;
                        v.speed += spec.accel * gData.torqueMult * bogDown * Math.pow(Math.max(0, 1 - Math.max(0, v.speed) / maxGearSpeed), 0.7) * c.throttle * dt;
                    } else if (v.speed > maxGearSpeed + 0.5) {
                        v.speed -= Math.min(v.speed - maxGearSpeed, 6.0 * dt);
                    }
                } else if (c.brake > 0) {
                    v.speed = Math.max(-spec.top * 0.3, v.speed - spec.accel * 0.7 * dt);
                } else {
                    const engBrake = (v.gearMode === 'manual' && v.speed > 0.4) ? gData.engineBrake : 0;
                    v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), (3.5 + engBrake) * dt);
                }

                // Boat RPM calculation
                const minRange = (effGear === 1) ? 0 : spec.top * VEHICLE_GEARS[effGear - 1].topFrac * 0.85;
                const progress = clamp((Math.abs(v.speed) - minRange) / Math.max(2, (maxGearSpeed - minRange)), 0, 1);
                let targetRpm = 0.20 + progress * 0.75;
                if (c.throttle > 0) targetRpm = Math.min(1.05, targetRpm + 0.08);
                if (v.gearMode === 'manual' && v.speed >= maxGearSpeed - 0.5 && c.throttle > 0) {
                    targetRpm = 0.96 + Math.sin(performance.now() * 0.035) * 0.04;
                }
                v.rpm = damp(v.rpm || 0.2, targetRpm, 12, dt);

                v.steer = damp(v.steer || 0, clamp(c.steer || 0, -1, 1), 8, dt);
                if (Math.abs(v.speed) > 0.05) v.heading += v.steer * 1.5 * dt * Math.sign(v.speed);

                v.x += fx_ * v.speed * dt;
                v.z += fz_ * v.speed * dt;

                const inWater = (waterSurf > -900 && v.y <= waterSurf + 0.85);
                if (inWater) {
                    v.inWater = true;
                    v.wasInWater = true;
                    v.waterTime = 0;
                    v.y = damp(v.y, waterSurf - 0.14, 6.0, dt);

                    const n = getWaterNormal(v.x, v.z, wt);
                    let sF = 0, sR = 0;
                    if (n) {
                        sF = n.x * fx_ + n.z * fz_;
                        sR = n.x * fz_ - n.z * fx_;
                    }
                    const bowPitch = clamp((v.speed / spec.top) * 0.14, -0.05, 0.18);
                    v.pitch = damp(v.pitch || 0, clamp(Math.atan(sF) * 0.5 + bowPitch, -0.3, 0.3), 5, dt);
                    const turnRoll = clamp(-v.steer * (v.speed / spec.top) * 0.28, -0.32, 0.32);
                    v.roll = damp(v.roll || 0, clamp(-Math.atan(sR) * 0.5 + turnRoll, -0.35, 0.35), 5, dt);

                    if (Math.abs(v.speed) > 2.0 && fx) {
                        if (fx.foam && Math.random() < dt * 18) {
                            fx.foam(v.x - fx_ * spec.L * 0.46, waterSurf + 0.05, v.z - fz_ * spec.L * 0.46, 1.0 + Math.abs(v.speed) * 0.04);
                        }
                        if (fx.splash && Math.abs(v.speed) > 6.0 && Math.random() < dt * 10) {
                            const side = Math.random() < 0.5 ? -1 : 1;
                            fx.splash(v.x + (fz_ * side) * spec.W * 0.45, waterSurf + 0.1, v.z - (fx_ * side) * spec.W * 0.45);
                        }
                    }
                } else {
                    v.inWater = false;
                    v.speed = damp(v.speed, 0, 5.0, dt);
                    v.pitch = damp(v.pitch || 0, 0, 6, dt);
                    v.roll = damp(v.roll || 0, 0, 6, dt);
                    const g = physics.groundAt(v.x, v.z, v.y + 0.4, 0.6, this._q);
                    v.y = damp(v.y, g, 18, dt);
                }
                this.writeMatrix(v);
                return null;
            }

            // --- 2. SUBMERGED VEHICLE WATER BUOYANCY & DROWNING ---
            const inWater = (waterSurf > -900 && v.y <= waterSurf + 0.25);
            if (inWater) {
                v.inWater = true;
                v.waterTime = (v.waterTime || 0) + dt;

                v.speed = damp(v.speed || 0, 0, 3.2, dt);
                v.steer = damp(v.steer || 0, 0, 4.0, dt);
                if (v.vx) v.vx = damp(v.vx, 0, 3.2, dt);
                if (v.vz) v.vz = damp(v.vz, 0, 3.2, dt);

                const sinkDist = Math.min(v.waterTime * 0.08, 3.5);
                const targetY = (waterSurf - 0.22) - sinkDist;
                v.y = damp(v.y, targetY, 4.2, dt);

                const n = getWaterNormal(v.x, v.z, wt);
                if (n) {
                    const sF = n.x * fx_ + n.z * fz_;
                    const sR = n.x * fz_ - n.z * fx_;
                    v.pitch = damp(v.pitch || 0, clamp(Math.atan(sF) * 0.6, -0.28, 0.28), 5, dt);
                    v.roll = damp(v.roll || 0, clamp(-Math.atan(sR) * 0.6, -0.28, 0.28), 5, dt);
                }

                if (!v.wasInWater && fx) {
                    const entry = Math.hypot(v.vx || 0, v.vz || 0);
                    if (entry > 5) {
                        for (let k = 0; k < 3; k++) {
                            fx.splash(v.x + (Math.random() - 0.5) * spec.W * 1.4, waterSurf + 0.2, v.z + (Math.random() - 0.5) * spec.L * 1.4);
                        }
                    }
                }
                v.wasInWater = true;

                if (v.waterTime < 2.5 && Math.random() < dt * 6 && fx) {
                    fx.splash(v.x + (Math.random() - 0.5) * spec.W, waterSurf, v.z + (Math.random() - 0.5) * spec.L);
                }
                if (Math.abs(v.speed) > 3 && Math.random() < dt * 9 && fx && fx.foam) {
                    fx.foam(v.x - fx_ * spec.L * 0.45, waterSurf + 0.05, v.z - fz_ * spec.L * 0.45, 0.8 + Math.abs(v.speed) * 0.03);
                }
                if (v.waterTime > 1.5) {
                    v.hp = Math.max(0, v.hp - 16 * dt);
                    if (v.hp <= 0 && !v.dead) {
                        v.dead = true;
                        if (fx) fx.carDestroyed(v);
                    }
                }
                this.writeMatrix(v);
                return null;
            }

            // --- 3. REAL 3D RIGID-BODY & 4-WHEEL RAYCAST SUSPENSION ENGINE ---
            v.inWater = false;
            v.wasInWater = false;
            v.waterTime = 0;

            // Ensure physical state is properly initialized
            if (v.vx === undefined || isNaN(v.vx)) {
                v.vx = fx_ * (v.speed || 0);
                v.vy = 0;
                v.vz = fz_ * (v.speed || 0);
                v.angPitch = 0;
                v.angYaw = 0;
                v.angRoll = 0;
                v.pitch = v.pitch || 0;
                v.roll = v.roll || 0;
                v.wheelSusp = [0.55, 0.55, 0.55, 0.55];
                v.wheelGround = [true, true, true, true];
            }

            const L = spec.L || 4.8;
            const W = spec.W || 2.0;
            const H = spec.H || 1.5;
            const wb = v.wheelBase || (L * 0.36);
            const wh = spec.isBike ? 0 : (v.wheelHalf || (W * 0.42));

            const mountY = 0.35;
            const L0 = 0.55;
            const Rw = 0.34;

            // Input smoothing (responsive steering)
            v.steer = damp(v.steer || 0, clamp(c.steer || 0, -1, 1), 14, dt);
            if (c.brake > 0) v.braking = true;
            if (c.handbrake) {
                v.handbraking = true;
                v.braking = true;
            }

            // Substeps per frame for high-speed numerical stability and anti-tunneling
            const subSteps = Math.abs(v.speed) > 40 ? 3 : 2;
            const subDt = dt / subSteps;
            let hit = null;
            let totalDx = 0, totalDz = 0;
            let maxImpactVn = 0;

            // Gather nearby candidate vehicles for high-precision sub-step collision tests
            const searchR = (L + 14.0) * 0.5 + Math.abs(v.speed) * dt;
            const searchR2 = searchR * searchR;
            const nearVehicles = [];
            for (let k = 0; k < this.vehicles.length; k++) {
                const cand = this.vehicles[k];
                if (cand === v || cand.dead || cand.gone) continue;
                const ddx = cand.x - v.x, ddz = cand.z - v.z;
                if (ddx * ddx + ddz * ddz <= searchR2) {
                    nearVehicles.push(cand);
                }
            }

            for (let sub = 0; sub < subSteps; sub++) {
                const pitch = v.pitch || 0, heading = v.heading || 0, roll = v.roll || 0;
                const cp = Math.cos(pitch), sp = Math.sin(pitch);
                const sh = Math.sin(heading), ch = Math.cos(heading);
                const cr = Math.cos(roll), sr = Math.sin(roll);

                // Local chassis orthonormal 3D frame in world coordinates (unit length = 1.0)
                const Fx = -sh * cp, Fy = sp, Fz = -ch * cp;
                const Rx = ch * cr, Ry = -sr, Rz = -sh * cr;

                let groundedCount = 0;
                let gFront = 0, gRear = 0, gRight = 0, gLeft = 0;

                const numWheels = spec.isBike ? 2 : 4;
                for (let i = 0; i < numWheels; i++) {
                    let lx, lz;
                    if (spec.isBike) {
                        lx = 0;
                        lz = (i === 0) ? -wb : wb;
                    } else {
                        // k=0: FR (+wh, -wb), k=1: FL (-wh, -wb), k=2: RR (+wh, +wb), k=3: RL (-wh, +wb)
                        lx = (i % 2 === 0) ? wh : -wh;
                        lz = (i < 2) ? -wb : wb;
                    }

                    // World anchor position for suspension top mount
                    const ax = v.x + lx * Rx - lz * Fx;
                    const ay = v.y - lz * Fy + mountY;
                    const az = v.z + lx * Rz - lz * Fz;

                    // Ground raycast downwards
                    const rayStartY = ay + 0.6;
                    const gY = physics.groundAt(ax, az, rayStartY, 0, this._q);
                    const distToGround = ay - gY;

                    if (i < 2) gFront += gY / (numWheels * 0.5); else gRear += gY / (numWheels * 0.5);
                    if (i % 2 === 0) gRight += gY / (numWheels * 0.5); else gLeft += gY / (numWheels * 0.5);

                    if (gY > -990 && distToGround <= (L0 + Rw + 0.35)) {
                        v.wheelGround[i] = true;
                        groundedCount++;
                        const currentL = clamp(distToGround - Rw, 0.05, L0);
                        v.wheelSusp[i] = currentL;
                    } else {
                        v.wheelGround[i] = false;
                        v.wheelSusp[i] = L0;
                    }
                }

                // Grounded check
                v.grounded = (groundedCount >= (spec.isBike ? 1 : 2));

                const effGear = getVehicleGear(v);
                v.currentGear = effGear;
                const gData = VEHICLE_GEARS[effGear] || VEHICLE_GEARS[1];
                const maxGearSpeed = spec.top * gData.topFrac;

                if (v.grounded) {
                    // 1. Longitudinal Acceleration & Speed Integration (Zero slope cosine attenuation!)
                    if (c.throttle > 0) {
                        if (v.speed < maxGearSpeed) {
                            const minSpd = spec.top * gData.minIdealFrac;
                            const bogDown = (v.gearMode === 'manual' && v.speed < minSpd)
                                ? clamp(0.25 + 0.75 * (Math.max(0, v.speed) / Math.max(1, minSpd)), 0.25, 1.0)
                                : 1.0;
                            // Real-world launch feel: strong off the line (traction +
                            // low gears), fading as aero drag builds — the (1-v/max)
                            // curve with exponent < 1 holds mid-range pull so a
                            // family car still climbs past 100 km/h smartly but
                            // never rockets like the old linear 3.5 g launch.
                            const effectiveAccel = spec.accel * gData.torqueMult * bogDown;
                            v.speed += effectiveAccel * Math.pow(Math.max(0, 1 - Math.max(0, v.speed) / maxGearSpeed), 0.7) * c.throttle * subDt;
                        } else if (v.speed > maxGearSpeed + 0.5) {
                            v.speed -= Math.min(v.speed - maxGearSpeed, 8.0 * subDt);
                        }
                    } else if (c.brake > 0) {
                        if (v.speed > 0.4) {
                            v.speed -= spec.brake * c.brake * subDt;
                            if (v.speed < 0) v.speed = 0;
                        } else {
                            v.speed = Math.max(-18, v.speed - spec.accel * 0.6 * c.brake * subDt);
                        }
                    } else if (c.handbrake) {
                        // Handbrake slides (locks rears) — strong but not the
                        // old instant-stop 18 m/s^2 (~1.8 g, F1 territory).
                        v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), 8 * subDt);
                        if (Math.abs(v.speed) < 0.15) v.speed = 0;
                    } else {
                        // Natural automotive freewheeling coast: aerodynamic drag + rolling resistance + manual engine braking
                        const sAbs = Math.abs(v.speed);
                        const aeroDrag = 0.0008 * sAbs * sAbs;
                        const rollDrag = 0.55; // gentle mechanical drag
                        const engBrake = (v.gearMode === 'manual' && v.speed > 0.5) ? gData.engineBrake : 0;
                        const coastDecel = (rollDrag + aeroDrag + engBrake) * subDt;
                        if (sAbs > coastDecel) {
                            v.speed -= Math.sign(v.speed) * coastDecel;
                        } else {
                            v.speed = 0;
                        }
                    }

                    // Natural slope gravity dynamics: downhill accelerates smoothly, uphill slight incline resistance
                    v.speed -= 9.81 * Math.sin(pitch) * 0.35 * subDt;
                    const maxForwardAllowed = (v.gearMode === 'manual' && pitch >= -0.05) ? maxGearSpeed : spec.top * (pitch < -0.05 ? 1.25 : 1.0);
                    v.speed = clamp(v.speed, -18, maxForwardAllowed);

                    // Engine RPM for audio synthesis & HUD
                    const minRange = (effGear === 1) ? 0 : spec.top * VEHICLE_GEARS[effGear - 1].topFrac * 0.85;
                    const progress = clamp((Math.abs(v.speed) - minRange) / Math.max(2, (maxGearSpeed - minRange)), 0, 1);
                    let targetRpm = 0.20 + progress * 0.75;
                    if (c.throttle > 0) targetRpm = Math.min(1.05, targetRpm + 0.08);
                    if (v.gearMode === 'manual' && v.speed >= maxGearSpeed - 0.5 && c.throttle > 0) {
                        targetRpm = 0.96 + Math.sin(performance.now() * 0.035) * 0.04;
                    }
                    v.rpm = damp(v.rpm || 0.2, targetRpm, 12, subDt);

                    // 2. Ackerman Steering Yaw Rate (instant turn authority, stops immediately when released)
                    const driftMult = c.handbrake ? 2.3 : 1.0;
                    const steerRate = 1.9 * clamp(Math.abs(v.speed) / 5.5, 0, 1) * (1 - clamp(Math.abs(v.speed) / spec.top, 0, 1) * 0.45) * driftMult;
                    const targetYawRate = v.steer * steerRate * Math.sign(v.speed || 1);
                    v.angYaw = damp(v.angYaw || 0, targetYawRate, 16, subDt);
                    v.heading = (v.heading || 0) + v.angYaw * subDt;

                    // 3. 3D Chassis Velocity Construction
                    // Recompute chassis frame with updated heading & slope pitch
                    const ncp = Math.cos(v.pitch || 0), nsp = Math.sin(v.pitch || 0);
                    const nsh = Math.sin(v.heading), nch = Math.cos(v.heading);
                    const ncr = Math.cos(v.roll || 0), nsr = Math.sin(v.roll || 0);
                    const nFx = -nsh * ncp, nFy = nsp, nFz = -nch * ncp;
                    const nRx = nch * ncr, nRy = -nsr, nRz = -nsh * ncr;

                    // Lateral grip (anti side-slip)
                    const vLat = v.vx * Rx + v.vz * Rz;
                    // Remember raw side-slip magnitude for the skid audio/fx gate.
                    v._latSlip = Math.abs(vLat);
                    const gripRate = c.handbrake ? 3.8 : 22.0;
                    const newVLat = damp(vLat, 0, gripRate, subDt);

                    // Reconstruct full 3D velocity (preserves speed on any slope angle!)
                    v.vx = nFx * v.speed + nRx * newVLat;
                    v.vy = nFy * v.speed;
                    v.vz = nFz * v.speed + nRz * newVLat;

                    // Dynamic slope pitch matching (mountain roads & hills)
                    const slopePitch = Math.atan2(gFront - gRear, 2 * wb);
                    const squatDive = (c.throttle > 0) ? 0.015 : ((c.brake > 0 && v.speed > 1.0) ? -0.025 : 0);
                    v.pitch = damp(v.pitch || 0, clamp(slopePitch + squatDive, -0.65, 0.65), 14, subDt);

                    // Dynamic slope roll & turn body roll
                    const slopeRoll = spec.isBike ? 0 : Math.atan2(gRight - gLeft, 2 * wh);
                    const turnRoll = spec.isBike
                        ? clamp(-v.steer * (Math.abs(v.speed) / spec.top) * 0.48, -0.48, 0.48)
                        : clamp(-v.steer * (Math.abs(v.speed) / spec.top) * 0.22, -0.25, 0.25);
                    v.roll = damp(v.roll || 0, clamp(slopeRoll + turnRoll, -0.48, 0.48), 12, subDt);

                    // Terrain height following
                    const gCenter = (gFront + gRear) * 0.5;
                    v.y = damp(v.y, gCenter + 0.38, 16, subDt);
                } else {
                    // Airborne stunt flight
                    v.vy -= 9.81 * subDt;
                    v.vx = damp(v.vx, 0, 0.15, subDt);
                    v.vz = damp(v.vz, 0, 0.15, subDt);
                    v.y += v.vy * subDt;
                    v.heading = (v.heading || 0) + (v.angYaw || 0) * subDt;
                    v.speed = Math.hypot(v.vx, v.vz);

                    // Air gyro control
                    if (c.throttle > 0) {
                        v.pitch = clamp((v.pitch || 0) - 0.6 * subDt, -0.7, 0.7);
                        v.rpm = damp(v.rpm || 0.2, 1.02, 8, subDt);
                    } else {
                        v.rpm = damp(v.rpm || 0.2, 0.22, 4, subDt);
                    }
                    if (c.brake > 0)    v.pitch = clamp((v.pitch || 0) + 0.6 * subDt, -0.7, 0.7);
                    if (c.steer !== 0 && !spec.isBike) v.roll = clamp((v.roll || 0) - c.steer * 0.8 * subDt, -0.5, 0.5);
                }

                // Integrate horizontal positions
                v.x += v.vx * subDt;
                v.z += v.vz * subDt;

                // Obstacle multi-circle collision resolution (buildings & walls)
                const circleCount = Math.max(2, Math.ceil(L / 2.6));
                for (let i = 0; i < circleCount; i++) {
                    const t = -0.38 * L + (i / (circleCount - 1)) * (0.76 * L);
                    const cx = v.x + Fx * t, cz = v.z + Fz * t;
                    const p = { x: cx, z: cz };
                    const localG = physics.groundAt(cx, cz, v.y + 1.2, 0, this._q);
                    const yBot = Math.max(v.y + 0.38, localG + 0.35);
                    const ch = physics.resolveCircle(p, W * 0.48, yBot, Math.max(yBot + H * 0.7, v.y + H), this._q);
                    if (ch) {
                        const dx = p.x - cx, dz = p.z - cz;
                        v.x += dx; v.z += dz;
                        totalDx += dx; totalDz += dz;
                        hit = ch;
                    }
                }

                if (hit) {
                    const pushDist = Math.hypot(totalDx, totalDz);
                    if (pushDist > 1e-4) {
                        const nx = totalDx / pushDist;
                        const nz = totalDz / pushDist;
                        const vn = v.vx * nx + v.vz * nz;
                        if (vn < -0.5) {
                            if (-vn > maxImpactVn) maxImpactVn = -vn;
                            // Deflect velocity along obstacle surface so car glides smoothly along walls
                            v.vx -= vn * nx;
                            v.vz -= vn * nz;
                            const fwdProj = v.vx * Fx + v.vz * Fz;
                            if (Math.abs(fwdProj) < Math.abs(v.speed)) v.speed = fwdProj;
                        }
                    }
                }

                // Vehicle-to-vehicle pixel-perfect OBB collision resolution
                for (let ci = 0; ci < nearVehicles.length; ci++) {
                    const other = nearVehicles[ci];
                    if (other === v || other.dead || other.gone) continue;

                    // Vertical clearance check
                    const aY0 = v.y - 0.25, aY1 = v.y + H + 0.25;
                    const bY0 = other.y - 0.25, bY1 = other.y + ((other.spec && other.spec.H) || 1.6) + 0.25;
                    if (aY1 < bY0 || bY1 < aY0) continue;

                    // Broadphase bounding circle check
                    const reach = (L + ((other.spec && other.spec.L) || 4.8)) * 0.5 + 0.3;
                    const cdx = other.x - v.x, cdz = other.z - v.z;
                    if (cdx * cdx + cdz * cdz > reach * reach) continue;

                    // Exact SAT OBB Narrowphase
                    const col = this.testOBB(v, other);
                    if (!col) continue;

                    hit = true;
                    // Positional resolution (push v out so it cannot penetrate other)
                    const mA = this._getMass(v.spec), mB = this._getMass(other.spec);
                    let wA = 0.5, wB = 0.5;
                    if (other.parked) { wA = 1.0; wB = 0.0; }
                    else if (v.parked) { wA = 0.0; wB = 1.0; }
                    else { wA = mB / (mA + mB); wB = mA / (mA + mB); }

                    const pen = col.pen + 0.005;
                    v.x -= col.nx * pen * wA;
                    v.z -= col.nz * pen * wA;
                    if (!other.parked) {
                        other.x += col.nx * pen * wB;
                        other.z += col.nz * pen * wB;
                    }

                    // Velocity deflection & momentum transfer
                    const fAx = -Math.sin(v.heading), fAz = -Math.cos(v.heading);
                    const fBx = -Math.sin(other.heading), fBz = -Math.cos(other.heading);
                    const vAx = v.vx, vAz = v.vz;
                    const vBx = (other.vx != null && Math.hypot(other.vx, other.vz) > 0.05) ? other.vx : fBx * (other.speed || 0);
                    const vBz = (other.vz != null && Math.hypot(other.vx, other.vz) > 0.05) ? other.vz : fBz * (other.speed || 0);

                    // Normal relative velocity (col.nx points from v to other)
                    const relVn = (vBx - vAx) * col.nx + (vBz - vAz) * col.nz;
                    if (relVn < -0.2) {
                        const vClose = -relVn;
                        if (vClose > maxImpactVn) maxImpactVn = vClose;

                        const invMA = 1 / mA;
                        const invMB = other.parked ? 0 : 1 / mB;
                        const e = 0.25;
                        const jMag = (1 + e) * vClose / (invMA + invMB);

                        v.vx -= col.nx * jMag * invMA;
                        v.vz -= col.nz * jMag * invMA;
                        v.speed = v.vx * fAx + v.vz * fAz;

                        if (!other.parked) {
                            other.vx = vBx + col.nx * jMag * invMB;
                            other.vz = vBz + col.nz * jMag * invMB;
                            other.speed = other.vx * fBx + other.vz * fBz;
                        }

                        // Tangential friction (side scrape resistance)
                        const tx = -col.nz, tz = col.nx;
                        const relVt = (vBx - vAx) * tx + (vBz - vAz) * tz;
                        const fMag = clamp(relVt * 0.35, -jMag * 0.3, jMag * 0.3);
                        v.vx += tx * fMag * invMA;
                        v.vz += tz * fMag * invMA;
                        if (!other.parked) {
                            other.vx -= tx * fMag * invMB;
                            other.vz -= tz * fMag * invMB;
                        }

                        if (other.ai) {
                            other.ai.brakeFor = Math.max(other.ai.brakeFor || 0, 1.5);
                            other.ai.panicT = Math.max(other.ai.panicT || 0, 3.5);
                            other.speed = Math.max(0, other.speed - 3.0);
                        }

                        if (vClose > 4.5 && fx && fx.carImpact) {
                            const cx = (v.x + other.x) * 0.5, cz = (v.z + other.z) * 0.5;
                            fx.carImpact(vClose, cx, v.y + 0.6, cz);
                        }

                        if (vClose > 7.0 && (!v._impactCd || v._impactCd <= 0)) {
                            v._impactCd = 0.3;
                            const dmg = (vClose - 5.5) * 7.0;
                            v.hp = Math.max(0, v.hp - dmg);
                            if (!other.parked) other.hp = Math.max(0, other.hp - dmg);
                        }
                    }
                    if (!other.parked) this.writeMatrix(other);
                }
            }

            // Wheel rotation spin
            v.spin = (v.spin || 0) + (v.speed / 0.34) * dt;

            // Skid smoke, marks and the continuous tire-screech loop during
            // drift / slide. Any wheel losing traction at speed screeches —
            // not just handbrake slides.
            {
                const slip = (v._latSlip || 0) / Math.max(4, Math.abs(v.speed));
                const slamming = c.brake > 0 && Math.abs(v.speed) > spec.top * 0.45;
                const skidding = v.handbraking || slip > 0.28 || slamming;
                if (skidding && Math.abs(v.speed) > 2.5) {
                    if (v.driver === 'player' && fx && fx.setSkid) {
                        const lvl = clamp(0.25 + Math.max(slip, v.handbraking ? 0.55 : 0) * (Math.abs(v.speed) / spec.top), 0.2, 1);
                        fx.setSkid(true, v.x, v.z, lvl);
                        v._skidOn = true;
                    } else if (fx && fx.skid) {
                        // AI / parked-adjacent cars: throttled one-shot screech.
                        const nowMs = performance.now();
                        if (!v._skidSfxT || nowMs - v._skidSfxT > 620) {
                            v._skidSfxT = nowMs;
                            fx.skid(v.x, v.z);
                        }
                    }
                    if (fx && fx.tireSmoke) {
                        v._smokeT = (v._smokeT || 0) + dt;
                        if (v._smokeT > 0.06) {
                            v._smokeT = 0;
                            const rx = Math.cos(v.heading), rz = -Math.sin(v.heading);
                            const rearZ = -wb;
                            for (const side of [-1, 1]) {
                                const sx = v.x + rx * (wh * side) + fx_ * rearZ;
                                const sz = v.z + rz * (wh * side) + fz_ * rearZ;
                                fx.tireSmoke(sx, v.y + 0.18, sz);
                            }
                        }
                    }
                } else if (v._skidOn && v.driver === 'player' && fx && fx.setSkid) {
                    fx.setSkid(false);
                    v._skidOn = false;
                }
            }

            // Impact damage cooldown
            if (v._impactCd > 0) v._impactCd -= dt;

            // Realistic crash impact damage (applied on genuine head-on collision, with cooldown)
            if (maxImpactVn > 8.0 && (!v._impactCd || v._impactCd <= 0)) {
                v._impactCd = 0.35;
                const dmg = (maxImpactVn - 6.5) * 8.0;
                v.hp = Math.max(0, v.hp - dmg);
                if (fx && fx.carImpact) fx.carImpact(maxImpactVn, v.x, v.y + 0.6, v.z);
                if (v.hp <= 0 && !v.dead) {
                    v.dead = true;
                    if (fx && fx.carDestroyed) fx.carDestroyed(v);
                }
            }

            this.writeMatrix(v);
            return hit;
        }

        /** Nearest vehicle to a point within maxDist (for enter prompts). */
        nearest(x, z, maxDist) {
            let best = null, bestD = maxDist * maxDist;
            for (const v of this.vehicles) {
                const d = dist2(x, z, v.x, v.z);
                if (d < bestD) { bestD = d; best = v; }
            }
            return best;
        }

        _getMass(spec) {
            if (!spec) return 1500;
            if (spec.mass) return spec.mass;
            if (spec.isBike) return 250;
            if (spec.isBoat) return (spec.L || 8) > 10 ? 8000 : 2500;
            const vol = (spec.L || 4.8) * (spec.W || 2.0) * (spec.H || 1.5);
            return Math.round(clamp(vol * 120, 1100, 15000));
        }

        /**
         * Pixel-perfect 2D Oriented Bounding Box (OBB) vs OBB collision using
         * the Separating Axis Theorem (SAT).
         * Returns { pen, nx, nz } where normal (nx, nz) points from A to B,
         * or null if separated (no contact).
         */
        testOBB(a, b) {
            const Ahl = ((a.spec && a.spec.L) || 4.8) * 0.5, Ahw = ((a.spec && a.spec.W) || 2.0) * 0.5;
            const Bhl = ((b.spec && b.spec.L) || 4.8) * 0.5, Bhw = ((b.spec && b.spec.W) || 2.0) * 0.5;

            const AfwdX = -Math.sin(a.heading || 0), AfwdZ = -Math.cos(a.heading || 0);
            const ArgtX = Math.cos(a.heading || 0),  ArgtZ = -Math.sin(a.heading || 0);

            const BfwdX = -Math.sin(b.heading || 0), BfwdZ = -Math.cos(b.heading || 0);
            const BrgtX = Math.cos(b.heading || 0),  BrgtZ = -Math.sin(b.heading || 0);

            const dx = b.x - a.x, dz = b.z - a.z;

            const axes = [
                { x: AfwdX, z: AfwdZ },
                { x: ArgtX, z: ArgtZ },
                { x: BfwdX, z: BfwdZ },
                { x: BrgtX, z: BrgtZ },
            ];

            let minOverlap = Infinity;
            let bestAxis = null;

            for (let i = 0; i < 4; i++) {
                const ax = axes[i].x, az = axes[i].z;
                const rA = Ahl * Math.abs(AfwdX * ax + AfwdZ * az) + Ahw * Math.abs(ArgtX * ax + ArgtZ * az);
                const rB = Bhl * Math.abs(BfwdX * ax + BfwdZ * az) + Bhw * Math.abs(BrgtX * ax + BrgtZ * az);
                const dist = Math.abs(dx * ax + dz * az);
                const overlap = (rA + rB) - dist;
                if (overlap <= 0) return null; // Separating axis found: NO collision
                if (overlap < minOverlap) {
                    minOverlap = overlap;
                    bestAxis = axes[i];
                }
            }

            let nx = bestAxis.x, nz = bestAxis.z;
            if (dx * nx + dz * nz < 0) {
                nx = -nx;
                nz = -nz;
            } else if (dx === 0 && dz === 0) {
                nx = AfwdX;
                nz = AfwdZ;
            }

            return { pen: minOverlap, nx, nz };
        }

        /**
         * Global fleet vehicle-vs-vehicle collision resolution.
         * Uses 2D Oriented Bounding Box (OBB) SAT narrowphase for pixel-perfect
         * contact detection, rigid-body impulse exchange, friction, and visual sync.
         */
        separate(dt, physics, fx) {
            const vs = this.vehicles;
            if (!vs || vs.length < 2) return;

            const cellSize = 14;
            const grid = this._separationGrid || (this._separationGrid = new Map());
            grid.clear();

            for (let i = 0; i < vs.length; i++) {
                const v = vs[i];
                if (v.dead || v.gone) continue;
                const gx = Math.floor(v.x / cellSize), gz = Math.floor(v.z / cellSize);
                const key = (gx + 500) * 1000 + (gz + 500);
                let bucket = grid.get(key);
                if (!bucket) grid.set(key, bucket = []);
                bucket.push(i);
            }

            for (let i = 0; i < vs.length; i++) {
                const a = vs[i];
                if (a.dead || a.gone) continue;
                const agx = Math.floor(a.x / cellSize), agz = Math.floor(a.z / cellSize);

                for (let ox = -1; ox <= 1; ox++) {
                    for (let oz = -1; oz <= 1; oz++) {
                        const key = (agx + ox + 500) * 1000 + (agz + oz + 500);
                        const bucket = grid.get(key);
                        if (!bucket) continue;

                        for (let bi = 0; bi < bucket.length; bi++) {
                            const j = bucket[bi];
                            if (j <= i) continue;
                            const b = vs[j];
                            if (b.dead || b.gone) continue;

                            // 3D vertical height clearance check
                            const aY0 = a.y - 0.25, aY1 = a.y + ((a.spec && a.spec.H) || 1.6) + 0.25;
                            const bY0 = b.y - 0.25, bY1 = b.y + ((b.spec && b.spec.H) || 1.6) + 0.25;
                            if (aY1 < bY0 || bY1 < aY0) continue;

                            // Broadphase bounding sphere check
                            const reach = (((a.spec && a.spec.L) || 4.8) + ((b.spec && b.spec.L) || 4.8)) * 0.5 + 0.3;
                            const dx = b.x - a.x, dz = b.z - a.z;
                            if (dx * dx + dz * dz > reach * reach) continue;

                            // Exact SAT OBB Narrowphase
                            const col = this.testOBB(a, b);
                            if (!col) continue;

                            // Positional separation
                            const mA = this._getMass(a.spec), mB = this._getMass(b.spec);
                            let wA = 0.5, wB = 0.5;
                            if (a.parked && !b.parked) { wA = 0.0; wB = 1.0; }
                            else if (!a.parked && b.parked) { wA = 1.0; wB = 0.0; }
                            else if (a.parked && b.parked) { wA = 0.5; wB = 0.5; }
                            else { wA = mB / (mA + mB); wB = mA / (mA + mB); }

                            const pen = col.pen + 0.005;
                            a.x -= col.nx * pen * wA;
                            a.z -= col.nz * pen * wA;
                            b.x += col.nx * pen * wB;
                            b.z += col.nz * pen * wB;

                            // Momentum exchange & deflection
                            const fAx = -Math.sin(a.heading), fAz = -Math.cos(a.heading);
                            const fBx = -Math.sin(b.heading), fBz = -Math.cos(b.heading);
                            const vAx = (a.vx != null && Math.hypot(a.vx, a.vz) > 0.05) ? a.vx : fAx * (a.speed || 0);
                            const vAz = (a.vz != null && Math.hypot(a.vx, a.vz) > 0.05) ? a.vz : fAz * (a.speed || 0);
                            const vBx = (b.vx != null && Math.hypot(b.vx, b.vz) > 0.05) ? b.vx : fBx * (b.speed || 0);
                            const vBz = (b.vz != null && Math.hypot(b.vx, b.vz) > 0.05) ? b.vz : fBz * (b.speed || 0);

                            const relVn = (vBx - vAx) * col.nx + (vBz - vAz) * col.nz;
                            if (relVn < -0.1) {
                                const vClose = -relVn;
                                const invMA = a.parked ? 0 : 1 / mA;
                                const invMB = b.parked ? 0 : 1 / mB;
                                if (invMA + invMB > 0) {
                                    const e = 0.25;
                                    const jMag = (1 + e) * vClose / (invMA + invMB);
                                    if (!a.parked) {
                                        a.vx = vAx - col.nx * jMag * invMA;
                                        a.vz = vAz - col.nz * jMag * invMA;
                                        a.speed = a.vx * fAx + a.vz * fAz;
                                    }
                                    if (!b.parked) {
                                        b.vx = vBx + col.nx * jMag * invMB;
                                        b.vz = vBz + col.nz * jMag * invMB;
                                        b.speed = b.vx * fBx + b.vz * fBz;
                                    }

                                    // Tangential friction
                                    const tx = -col.nz, tz = col.nx;
                                    const relVt = (vBx - vAx) * tx + (vBz - vAz) * tz;
                                    const fMag = clamp(relVt * 0.35, -jMag * 0.3, jMag * 0.3);
                                    if (!a.parked) {
                                        a.vx += tx * fMag * invMA;
                                        a.vz += tz * fMag * invMA;
                                    }
                                    if (!b.parked) {
                                        b.vx -= tx * fMag * invMB;
                                        b.vz -= tz * fMag * invMB;
                                    }

                                    if (a.ai) {
                                        a.ai.brakeFor = Math.max(a.ai.brakeFor || 0, 1.2);
                                        a.ai.panicT = Math.max(a.ai.panicT || 0, 3.0);
                                    }
                                    if (b.ai) {
                                        b.ai.brakeFor = Math.max(b.ai.brakeFor || 0, 1.2);
                                        b.ai.panicT = Math.max(b.ai.panicT || 0, 3.0);
                                    }

                                    if (vClose > 4.5 && fx && fx.carImpact) {
                                        const cx = (a.x + b.x) * 0.5, cz = (a.z + b.z) * 0.5;
                                        const cy = Math.max(a.y, b.y) + 0.6;
                                        fx.carImpact(vClose, cx, cy, cz);
                                    }

                                    if (vClose > 7.0) {
                                        a._sepCd = (a._sepCd || 0) - dt;
                                        if (a._sepCd <= 0) {
                                            a._sepCd = 0.35;
                                            const dmg = (vClose - 5.5) * 7.0;
                                            if (!a.parked) a.hp = Math.max(0, a.hp - dmg);
                                            if (!b.parked) b.hp = Math.max(0, b.hp - dmg);
                                        }
                                    }
                                }
                            }

                            this.writeMatrix(a);
                            this.writeMatrix(b);
                        }
                    }
                }
            }
        }

        /** Culls idle vehicle and wheel instanced pools to save GPU draw calls & triangles. */
        updatePoolVisibility() {
            const activeCounts = {};
            for (let i = 0; i < this.vehicles.length; i++) {
                const v = this.vehicles[i];
                if (!v.dead && !v.gone) {
                    activeCounts[v.type] = (activeCounts[v.type] || 0) + 1;
                }
            }
            for (const type in this.pools) {
                const act = activeCounts[type] || 0;
                const pool = this.pools[type];
                pool.visible = (act > 0);
            }
            if (this.wheelPools) {
                for (const type in this.wheelPools) {
                    const act = activeCounts[type] || 0;
                    const pool = this.wheelPools[type];
                    pool.visible = (act > 0);
                }
            }
        }
    }
