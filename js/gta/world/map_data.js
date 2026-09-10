    // ===========================================================================
    // MAP — the Manhattan data tables
    // ===========================================================================
    /**
     * ISLAND — the land polygon (clockwise from the NW corner). Points are
     * [x, z]. This drives the water gaps, the shoreline skirt, the minimap
     * silhouette and the "you fell in the river" test.
     */
    const ISLAND_BASE = [
        [0, 0], [1130, 0], [1130, 2915], [1090, 3110], [800, 3340], [560, 3380],
        [300, 3300], [60, 2915], [35, 2590], [30, 2135], [30, 0],
    ];

    /**
     * ISLAND — the naturalized land polygon. The base rects above read as
     * ruler-straight river walls in-game, so each edge is subdivided (~30 m)
     * and pushed along its outward normal by layered deterministic swells.
     * Amplitude is capped (+-7 m on the N-S river walls, +-5 m elsewhere,
     * plus 1.8 m of fine detail) and clamped so the West St Hwy (x 46..64)
     * and FDR (x 1096..1114) corridors always stay on land. Everything
     * downstream (LandMask, roads, blocks, shore SDF, minimap, seawall)
     * derives from ISLAND, so it all follows automatically.
     */
    function _coastSwell(s) {
        return Math.sin(s * 0.011 + 1.7) * 0.55 + Math.sin(s * 0.023 + 0.4) * 0.30
            + Math.sin(s * 0.053 + 2.9) * 0.15;
    }
    function _coastDetail(s) {
        return Math.sin(s * 0.11 + 0.7) * 0.6 + Math.sin(s * 0.23 + 2.1) * 0.4;
    }
    const ISLAND = (function () {
        const CX = 580, CZ = 1690, STEP = 30;
        const out = [];
        let s = 0;
        for (let j = ISLAND_BASE.length - 1, i = 0; i < ISLAND_BASE.length; j = i++) {
            const ax = ISLAND_BASE[j][0], az = ISLAND_BASE[j][1];
            const bx = ISLAND_BASE[i][0], bz = ISLAND_BASE[i][1];
            const dx = bx - ax, dz = bz - az;
            const len = Math.sqrt(dx * dx + dz * dz);
            if (len < 1e-6) continue;
            const steps = Math.max(1, Math.round(len / STEP));
            let nx = dz / len, nz = -dx / len;
            const mx = (ax + bx) / 2, mz = (az + bz) / 2;
            if ((mx - CX) * nx + (mz - CZ) * nz < 0) { nx = -nx; nz = -nz; }
            const riverNS = Math.abs(dx) < 1e-6;
            const amp = riverNS ? 7 : 5;
            const westEdge = ax <= 35 && bx <= 35;
            const eastEdge = ax >= 1125 && bx >= 1125;
            for (let k = 0; k < steps; k++) {
                const t = k / steps;
                const ss = s + t * len;
                const w = _coastSwell(ss) * amp + _coastDetail(ss) * 1.8;
                const px0 = ax + dx * t, pz0 = az + dz * t;
                let x = px0 + nx * w;
                let z = pz0 + nz * w;
                // Asymmetric safety cap: inward encroachment (toward the road
                // corridors) is capped at 4 m past the base line, while outward
                // coves keep their full depth — coves are what read as natural.
                if (px0 < CX && x > px0 + 4) x = px0 + 4;
                if (px0 > CX && x < px0 - 4) x = px0 - 4;
                if (x < 15) x = 15;
                if (x > 1150) x = 1150;
                if (westEdge && x > 40) x = 40;
                if (eastEdge && x < 1120) x = 1120;
                out.push([Math.round(x * 10) / 10, Math.round(z * 10) / 10]);
            }
            s += len;
        }
        return out;
    })();

    /**
     * AVENUES — north-south roads. [name, centerline x, width, lanes, oneway]
     *   oneway: 'NB' = northbound only (toward -z), 'SB' = southbound only,
     *           null = two-way. Alternating directions mirror the real
     *           Manhattan pairings (5th SB / 6th NB / 7th SB / 8th NB ...).
     * West St and the FDR are the shore highways. Numbered avenues stop at
     * Houston (z 2720) — downtown traffic uses Broadway and West St, like
     * the real island. 6th and 7th are interrupted by Central Park.
     */
    const AVENUES = [
        ['West St Hwy',   55,  18, 4, null ],  // 12th Ave, Hudson shore, full length
        ['11th Ave',      160, 13, 2, 'NB' ],
        ['10th Ave',      262, 13, 2, 'SB' ],
        ['9th Ave',       357, 13, 2, 'NB' ],
        ['8th Ave',       452, 13, 2, 'SB' ],  // Central Park West inside the park band
        ['7th Ave',       545, 13, 2, 'NB' ],  // ends at 59th, resumes at 110th
        ['6th Ave',       642, 13, 2, 'NB' ],
        ['5th Ave',       733, 14, 2, 'SB' ],  // museum mile beside the park
        ['Madison Ave',   787, 10, 2, 'NB' ],
        ['Park Ave',      845, 16, 3, null ],  // planted median, two-way
        ['Lexington Ave', 903, 10, 2, 'SB' ],
        ['3rd Ave',       953, 11, 2, 'NB' ],
        ['2nd Ave',       1003, 11, 2, 'SB' ],
        ['1st Ave',       1053, 11, 2, 'NB' ],
        ['FDR Drive',     1105, 18, 3, null ], // East River shore highway
    ];
    const AVE_DOWNTOWN_END = 2720;      // Houston: numbered avenues stop here
    const FDR_END = 2960;               // FDR leaves land at the south taper
    // Central Park interruption band (streets/avenues crossing it are handled below)
    const PARK_WEST = 452, PARK_EAST = 733, PARK_NORTH = 575, PARK_SOUTH = 1550;
    // Streets that keep driving through the park (sunken transverses).
    const TRANSVERSE_Z = [835, 1030, 1160]; // 96th, 86th, 79th

    /**
     * STREETS — east-west roads. [name, z, cls, dir, x1?, x2?]
     *   cls: 'M' = major (13m, two-way, traffic lights), 'm' = minor
     *        (9m, one-way alternating EB (+x) / WB (-x) down the list).
     *   x1/x2 optional explicit extent (Wall and Water are downtown stubs).
     */
    const STREETS = [
        ['155th St', 60,   'm', 'EB'],
        ['150th St', 125,  'm', 'WB'],
        ['145th St', 190,  'm', 'EB'],
        ['141st St', 255,  'm', 'WB'],
        ['137th St', 320,  'm', 'EB'],
        ['125th St', 385,  'M', null],
        ['122nd St', 450,  'm', 'WB'],
        ['118th St', 515,  'm', 'EB'],
        ['110th St', 575,  'M', null],
        ['107th St', 640,  'm', 'EB'],
        ['103rd St', 705,  'm', 'WB'],
        ['99th St',  770,  'm', 'EB'],
        ['96th St',  835,  'M', null],
        ['93rd St',  900,  'm', 'WB'],
        ['90th St',  965,  'm', 'EB'],
        ['86th St',  1030, 'M', null],
        ['82nd St',  1095, 'm', 'EB'],
        ['79th St',  1160, 'm', 'WB'],
        ['76th St',  1225, 'm', 'EB'],
        ['72nd St',  1290, 'M', null],
        ['69th St',  1355, 'm', 'WB'],
        ['66th St',  1420, 'm', 'EB'],
        ['62nd St',  1485, 'm', 'WB'],
        ['59th St',  1550, 'M', null],
        ['57th St',  1615, 'm', 'EB'],
        ['54th St',  1680, 'm', 'WB'],
        ['51st St',  1745, 'm', 'EB'],
        ['48th St',  1810, 'm', 'WB'],
        ['45th St',  1875, 'm', 'EB'],
        ['42nd St',  1940, 'M', null],
        ['39th St',  2005, 'm', 'WB'],
        ['36th St',  2070, 'm', 'EB'],
        ['34th St',  2135, 'M', null],
        ['31st St',  2200, 'm', 'WB'],
        ['28th St',  2265, 'm', 'EB'],
        ['25th St',  2330, 'm', 'WB'],
        ['23rd St',  2395, 'M', null],
        ['20th St',  2460, 'm', 'EB'],
        ['17th St',  2525, 'm', 'WB'],
        ['14th St',  2590, 'M', null],
        ['Houston St', 2720, 'M', null],
        ['Prince St', 2785, 'm', 'EB'],
        ['Spring St', 2850, 'm', 'WB'],
        ['Canal St', 2915, 'M', null],
        ['White St', 2980, 'm', 'EB'],
        ['Franklin St', 3045, 'm', 'WB'],
        ['Chambers St', 3110, 'M', null],
        ['Warren St', 3175, 'm', 'EB'],
        ['Wall St', 3240, 'M', null],
        ['Water St', 3305, 'm', 'EB', 620, 900],
    ];
    const HOUSTON_W = 15, CANAL_W = 15; // the two widest crosstown streets

    /**
     * BROADWAY — the diagonal. Centerline polyline [x, z] from the top of the
     * Upper West Side down to Bowling Green. Two-way, 12 m. It slices the
     * grid, producing the Flatiron wedge and Times Square naturally.
     */
    const BROADWAY = [
        [300, 575],   // enters at 110th, between 9th/10th
        [330, 1290],  // ~72nd St
        [455, 1550],  // Columbus Circle (8th Ave / 59th)
        [545, 1940],  // TIMES SQUARE (7th Ave / 42nd)
        [600, 2200],
        [700, 2395],  // FLATIRON point (5th Ave / 23rd)
        [690, 2590],  // Union Square / 14th
        [688, 2915],  // Canal
        [655, 3110],
        [600, 3300],
        [560, 3360],  // Bowling Green / Battery
    ];
    const BROADWAY_W = 12;

    /**
     * DISTRICTS — [id, x1, z1, x2, z2, grammar]. Looked up by block center in
     * this order (first match wins). Grammar drives the block fill:
     *   brownstone  4-5 story rowhouses, stoops + cornices
     *   rowhouse    3-4 story low-rise rows
     *   tenement    6 story dense brick with fire escapes
     *   warehouse   6-10 story loft blocks
     *   prewar      8-12 story apartments with cornices + water towers
     *   midrise     10-18 story offices
     *   setback     1916-zoning skyscrapers: stepped base/mid/tower
     *   glass       slim modern glass towers
     */
    const DISTRICTS = [
        ['park',          452, 575, 733, 1550, 'park'],
        ['harlem',        55, 0, 1105, 575, 'brownstone'],
        ['uws',           55, 575, 452, 1550, 'prewar'],
        ['ues',           733, 575, 1105, 1550, 'limestone'],
        ['hellskitchen',  55, 1550, 545, 1940, 'tenement'],
        ['midtown',       545, 1550, 1105, 2135, 'setback'],
        ['chelsea',       55, 2135, 642, 2590, 'warehouse'],
        ['nomad',         642, 2135, 787, 2590, 'deco'],
        ['murrayhill',    787, 2135, 1105, 2590, 'midrise'],
        ['village',       55, 2590, 733, 2915, 'rowhouse'],
        ['les',           733, 2590, 1053, 2915, 'tenement'],
        ['soho',          55, 2915, 688, 3110, 'castiron'],
        ['chinatown',     688, 2915, 1003, 3175, 'tenement'],
        ['tribeca',       55, 3110, 688, 3240, 'warehouse'],
        ['fidi',          55, 3175, 1105, 3380, 'glass'],
    ];

    /**
     * PARKS — [x1, z1, x2, z2, kind]. kind 'park' = Central Park (special
     * internals), 'square' = small green square, 'battery' = harbor park.
     */
    const PARKS = [
        [452, 575, 733, 1550, 'central'],
        [620, 2620, 730, 2710, 'square'],      // Washington Square
        [660, 2530, 733, 2585, 'square'],      // Union Square
        [733, 2330, 787, 2390, 'square'],      // Madison Square
        [950, 2640, 1003, 2720, 'square'],     // Tompkins Square
        [1003, 3045, 1105, 3110, 'square'],    // City Hall Park
        [400, 3300, 900, 3380, 'battery'],     // Battery Park
        [545, 150, 642, 300, 'square'],        // Marcus Garvey Park
    ];

    /** Central Park internals (world rects). */
    const CENTRAL_PARK = {
        reservoir: { cx: 592, cz: 930, rx: 90, rz: 85 },  // the Reservoir
        greatLawn: [510, 1150, 680, 1290],
        sheepMeadow: [500, 1420, 690, 1510],
        lake: [500, 1330, 660, 1400],
        bowBridge: { x: 575, z: 1365 },
        mall: [580, 1440, 604, 1530],          // the Mall: double tree row
        bethesda: { x: 592, z: 1435 },
    };

    /**
     * LANDMARKS — [id, x1, z1, x2, z2, kind]. Lots overlapping these rects are
     * suppressed and the landmark builder fills the rect instead.
     */
    const LANDMARKS = [
        // Rects are snapped to block interiors (never overlapping a street
        // corridor) so the lane graph and landmark massing never collide.
        ['empire',    741, 2143, 781, 2194, 'empire'],      // Empire State, 5th/34th
        ['chrysler',  909, 1948, 947, 1999, 'chrysler'],    // Lex/42nd
        ['flatiron',  707, 2403, 725, 2454, 'flatiron'],   // 5th/Broadway/23rd wedge
        ['timessq',   566, 1948, 606, 1999, 'timessq'],     // Times Square plaza
        ['wtc',       705, 3181, 775, 3232, 'wtc'],         // One World Trade
        ['grandcentral', 854, 1948, 896, 1999, 'grandcentral'],
        ['rockefeller', 650, 1622, 724, 1674, 'rockefeller'],
        ['msg',       461, 2076, 536, 2127, 'msg'],         // Madison Square Garden
        ['un',        1060, 1881, 1094, 1932, 'un'],
        ['met',       741, 1038, 781, 1088, 'met'],
        ['guggenheim', 741, 971, 781, 1022, 'guggenheim'],
        ['stpatrick', 742, 2206, 780, 2259, 'cathedral'],
        ['bellevue',  1060, 2206, 1094, 2258, 'hospital'],
        ['policehq',  -510, 1955, -390, 2045, 'police'], // Metro Police Department Headquarters & High-Security Penitentiary Complex (120m x 90m)
        ['precinct_manhattan', 1004, 3051, 1052, 3102, 'precinct'], // NYPD 1st Precinct (Downtown Manhattan Outpost)
        ['apollo',    460, 393, 537, 444, 'apollo'],
        ['spray1',    270, 1751, 348, 1804, 'spray'],       // Brow Auto Body (Hell's Kitchen)
        ['spray2',    1337, 3009, 1461, 3141, 'spray'],     // Brow Auto Body (Brooklyn)
        ['parking_midtown', 465, 1886, 516, 1927, 'parking'], // Midtown Car Park (near player spawn)
        ['parking_fidi',    370, 3253, 440, 3293, 'parking'], // Wall St / Battery Car Park
        ['parking_bk',      1255, 3165, 1318, 3230, 'parking'], // Brooklyn DUMBO Waterfront Car Park
        ['parking_uptown',  370, 1465, 445, 1515, 'parking'], // Central Park West / Uptown Car Park
        ['gunshop_midtown',  365, 1751, 435, 1804, 'gunshop'],  // Ammu-Nation Midtown (Hell's Kitchen)
        ['gunshop_downtown', 545, 3181, 615, 3232, 'gunshop'],  // Ammu-Nation Downtown (Financial Dist)
        ['gunshop_bk',      1245, 3010, 1315, 3070, 'gunshop'],  // Ammu-Nation Brooklyn (DUMBO)
        ['food_midtown',     455, 1751, 525, 1804, 'foodshop'], // Luigi's Brick Oven Pizzeria (Midtown)
        ['food_downtown',    465, 3181, 535, 3232, 'foodshop'], // Downtown Classic Burger Diner
        ['food_bk',          1370, 3180, 1440, 3240, 'foodshop'], // DUMBO Waterfront Roastery & Bakery (moved off the Brooklyn Bridge descent)
        ['villa_estate',    -790, 1485, -725, 1540, 'villa_estate'],    // VIP Modern Luxury Villa on the Hill
        ['villa_garage',    -777, 1501, -765, 1513, 'villa_garage'],    // Big Safehouse Garage with vehicle save
        ['river_promenade', -1000, 1720, -400, 1840, 'river_promenade'], // Scenic Riverwalk & Promenade
        ['paradise_plaza',  -790, 2100, -710, 2180, 'paradise_plaza'],  // Downtown Modern Glass Plaza & Fountains
        ['liberty_plaza',   165, 3580, 205, 3620, 'liberty_plaza'],     // Statue of Liberty Scenic Overlook & Arrival Plaza
    ];
    LANDMARKS.forEach((lm) => {
        lm.id = lm[0];
        lm.x1 = lm[1];
        lm.z1 = lm[2];
        lm.x2 = lm[3];
        lm.z2 = lm[4];
        lm.kind = lm[5];
    });

    /** Charging Bull — small bronze sculpture near Wall St. */
    const BULL = { x: 615, z: 3300 };

    /** Statue of Liberty — deco-only island in the harbor. */
    const STATUE = { x: 200, z: 3560, islandR: 70 };

    /**
     * BROOKLYN — the playable strip beyond the East River, reachable by two
     * bridges. [x1, z1, x2, z2] land rect + its own little street grid.
     */
    const BROOKLYN = {
        x1: 1250, z1: 2960, x2: 1640, z2: 3560,
        streets: [ // E-W
            ['Brooklyn Bridge Blvd', 3000, 'M'],
            ['Fulton St', 3150, 'M'],
            ['Myrtle Ave', 3300, 'm'],
            ['Atlantic Ave', 3450, 'M'],
        ],
        avenues: [ // N-S, all two-way
            ['Old Fulton St', 1330, 'm'],
            ['4th Ave', 1470, 'M'],
            ['Bedford Ave', 1580, 'm'],
        ],
    };

    /**
     * PARADISE VALLEY & SAN ANDREAS HEIGHTS
     * An expansive luxury region west of Manhattan across the Hudson River.
     * Cut by a scenic river with landscaped promenades:
     * - South: Modern organized downtown with palm boulevards & glass towers
     * - North: Rolling elevated hills with the VIP Modern Luxury Villa at the summit (Y=28m)
     */
    const PARADISE = {
        x1: -1300, x2: -260,
        zSouth1: 1840, zSouth2: 2550, // modern plain city
        riverZ1: 1720, riverZ2: 1840, // scenic river water channel
        zNorth1: 1100, zNorth2: 1720, // rolling elevated hills
        streets: [
            ['Riverfront Promenade', 1850, 'M'],
            ['Grand Avenue', 1940, 'M'],
            ['Ocean Boulevard', 2200, 'M'],
            ['Marina Way', 2460, 'M'],
        ],
        avenues: [
            ['Coastal Way', -350, 'M'],
            ['Bayview Avenue', -550, 'm'],
            ['Palisades Parkway', -750, 'M'],
            ['Sunset Boulevard', -950, 'M'],
            ['West End Avenue', -1150, 'm'],
        ],
        villa: {
            x: -757.31, z: 1510, y: 27.6,
            x1: -790, z1: 1485, x2: -725, z2: 1540,
        }
    };

    const PARADISE_SOUTH_POLY = [
        [-260, 1840], [-260, 2550], [-1300, 2550], [-1300, 1840]
    ];
    const PARADISE_NORTH_POLY = [
        [-260, 1100], [-260, 1720], [-1300, 1720], [-1300, 1100]
    ];

    /**
     * QUEENS & ASTORIA INDUSTRIAL HARBOR (Northeast Landmass)
     * Massive industrial shipping port, container terminals, gantry cranes,
     * petroleum tank farms, rail yards, and brick warehouses.
     */
    const QUEENS = {
        x1: 1260, z1: 450, x2: 2150, z2: 1750,
        streets: [
            ['Astoria Blvd', 550, 'M'],
            ['Harbor Terminal Way', 850, 'M'],
            ['Industrial Parkway', 1150, 'm'],
            ['Queens Plaza North', 1450, 'M'],
            ['East River Wharf Rd', 1680, 'M'],
        ],
        avenues: [
            ['Docks Shore Highway', 1340, 'M'],
            ['Queens Boulevard', 1560, 'M'],
            ['Atlantic Rail Ave', 1780, 'M'],
            ['Container Express Way', 2000, 'm'],
        ],
    };
    const QUEENS_POLY = [
        [QUEENS.x1, QUEENS.z1], [QUEENS.x2, QUEENS.z1],
        [QUEENS.x2, QUEENS.z2], [QUEENS.x1, QUEENS.z2],
    ];

    /**
     * VICE SHORES & TROPICAL ATLANTIC BEACH DISTRICT (Southeast Landmass)
     * Sun-drenched golden beaches, Art Deco pastel hotels with neon, palm boulevards,
     * yacht marina with luxury speedboats, and ocean boardwalk promenade.
     */
    const VICE_SHORES = {
        x1: 1250, z1: 2000, x2: 2200, z2: 3600,
        streets: [
            ['Ocean Promenade', 2150, 'M'],
            ['Flamingo Way', 2400, 'M'],
            ['Sunset Coast Blvd', 2680, 'M'],
            ['Marina Boardwalk', 3200, 'M'],
            ['South Beach Way', 3500, 'M'],
        ],
        avenues: [
            ['Biscayne Coastal Way', 1720, 'M'],
            ['Ocean Drive', 1920, 'M'],
            ['Palm Beach Boulevard', 2120, 'M'],
        ],
    };
    const VICE_SHORES_POLY = [
        [1640, 2000], [2200, 2000], [2200, 3600], [1640, 3600], [1640, 2960], [1250, 2960], [1250, 2000]
    ];

    /**
     * GOVERNORS / BLACKWATER NAVAL FORTRESS (Central Harbor Fortress Island)
     * Historic stone star bastion with naval cannons, active military helipad,
     * radar surveillance tower, and armory barracks.
     */
    const GOVERNORS = {
        x1: 520, z1: 3420, x2: 860, z2: 3720,
        streets: [
            ['Bastion Perimeter Way', 3460, 'M'],
            ['Fortress Main Rampart', 3620, 'M'],
        ],
        avenues: [
            ['Citadel Boulevard', 580, 'M'],
            ['Naval Armory Way', 760, 'M'],
        ],
    };
    const GOVERNORS_POLY = [
        [520, 3420], [860, 3420], [860, 3720], [520, 3720]
    ];

    /** Analytic terrain elevation query for seamless driving & walking on hills. */
    function getTerrainElevation(x, z) {
        // Outside Paradise North, return standard city ground level
        if (x < -1350 || x > -250 || z < 1050 || z > 1720) return 0.12;
        // South of riverbank: standard city level
        if (z >= 1712) return 0.12;

        // Summit plateau: level ground for the luxury villa estate & garage
        if (x >= -795 && x <= -720 && z >= 1485 && z <= 1540) return 27.6;

        // Radial falloff from summit center
        const cx = -757.3, cz = 1510;
        const dx = Math.abs(x - cx), dz = Math.abs(z - cz);
        const hx = 35, hz = 25;
        const qx = Math.max(0, dx - hx), qz = Math.max(0, dz - hz);
        const d = Math.sqrt(qx * qx + qz * qz);

        const maxD = 180;
        if (d >= maxD) return 0.12;
        const u = d / maxD;
        const t = 1 - u * u * (3 - 2 * u);
        return 0.12 + (27.6 - 0.12) * t;
    }

    /**
     * BRIDGES — across East River to Brooklyn, and across Hudson River to Paradise.
     */
    const BRIDGES = [
        {
            // West end on Chambers St (z 3110), Brooklyn end on Fulton St.
            name: 'Brooklyn Bridge',
            deck: [1060, 3110, 1330, 3150], height: 10, ramp: 92,
            towerH: 38, suspension: true,
        },
        {
            // West end on White St (z 2980), Brooklyn end on Bridge Blvd (z 3000).
            name: 'Manhattan Bridge',
            deck: [1080, 2980, 1340, 3000], height: 8, ramp: 78,
            truss: 8.2, suspension: false,
        },
        {
            // Grand Golden Gate style suspension bridge spanning Hudson River from 42nd St to Paradise City.
            name: 'Grand San Andreas Bridge',
            deck: [55, 1940, -260, 1940], height: 14, ramp: 85,
            towerH: 48, suspension: true, wide: true,
        },
        {
            // Modern arched bridge spanning the scenic river inside Paradise Valley.
            name: 'Paradise River Bridge',
            deck: [-750, 1850, -750, 1710], height: 4.5, ramp: 42,
            towerH: 18, suspension: false, riverBridge: true,
        },
        // =========================================================================
        // GRAND TRANS-HARBOR MODERN EXPRESSWAY BRIDGE (Sweeping Southern Bay Megastructure)
        // =========================================================================
        {
            name: 'Grand Bay Bridge - Paradise Approach',
            deck: [-260, 2460, -210, 2700], height: 14, y0: 0.12, y1: 14,
            elevated: true, modern: true, wide: true, width: 18, hw: 10.5,
            rampStart: true,
        },
        {
            name: 'Grand Bay Bridge - Hudson South 1',
            deck: [-210, 2700, -160, 2915], height: 14, y0: 14, y1: 14,
            elevated: true, modern: true, wide: true, width: 18, hw: 10.5,
            junctionEnd: 'canal',
        },
        {
            name: 'Grand Bay Bridge - Canal Interchange',
            deck: [-160, 2915, -110, 3100], height: 14, y0: 14, y1: 14,
            elevated: true, modern: true, wide: true, width: 18, hw: 10.5,
            junctionStart: 'canal',
        },
        {
            name: 'Grand Bay Bridge - Hudson South 2',
            deck: [-110, 3100, -70, 3260], height: 14, y0: 14, y1: 14,
            elevated: true, modern: true, wide: true, width: 18, hw: 10.5,
            junctionEnd: 'battery',
        },
        {
            name: 'Grand Bay Bridge - Battery Approach',
            deck: [-70, 3260, -20, 3450], height: 15, y0: 14, y1: 15,
            elevated: true, modern: true, wide: true, width: 18, hw: 10.5,
            junctionStart: 'battery',
        },
        {
            name: 'Grand Bay Bridge - Liberty Gateway Span',
            deck: [-20, 3450, 60, 3620], height: 16, y0: 15, y1: 16,
            elevated: true, modern: true, wide: true, width: 18, hw: 10.5,
            pylon: true, towerH: 56,
        },
        {
            name: 'Grand Bay Bridge - Harbor South Reach',
            deck: [60, 3620, 180, 3720], height: 16, y0: 16, y1: 16,
            elevated: true, modern: true, wide: true, width: 18, hw: 10.5,
            junctionEnd: 'liberty',
        },
        {
            name: 'Grand Bay Bridge - South Viaduct',
            deck: [180, 3720, 450, 3770], height: 16, y0: 16, y1: 16,
            elevated: true, modern: true, wide: true, width: 18, hw: 10.5,
            junctionStart: 'liberty',
        },
        {
            name: 'Grand Bay Bridge - East Bay Main Span',
            deck: [450, 3770, 750, 3760], height: 16, y0: 16, y1: 16,
            elevated: true, modern: true, wide: true, width: 18, hw: 10.5,
            pylon: true, towerH: 58,
        },
        {
            name: 'Grand Bay Bridge - Brooklyn Reach',
            deck: [750, 3760, 1020, 3660], height: 14, y0: 16, y1: 14,
            elevated: true, modern: true, wide: true, width: 18, hw: 10.5,
        },
        {
            name: 'Grand Bay Bridge - Brooklyn Descent',
            deck: [1020, 3660, 1250, 3480], height: 14, y0: 14, y1: 0.12,
            elevated: true, modern: true, wide: true, width: 18, hw: 10.5,
            rampEnd: true,
        },
        // --- EXPRESSWAY CONNECTORS & RAMPS ---
        {
            name: 'Canal St Flyover Ramp',
            deck: [-160, 2915, 80, 2915], height: 14, y0: 14, y1: 0.12,
            elevated: true, modern: true, wide: false, width: 11, hw: 6.5,
            rampEnd: true, rampBranch: true, junctionStart: 'canal',
        },
        {
            name: 'Battery Express Ramp',
            deck: [-70, 3260, 300, 3240], height: 14, y0: 14, y1: 0.12,
            elevated: true, modern: true, wide: false, width: 11, hw: 6.5,
            rampEnd: true, rampBranch: true, junctionStart: 'battery',
        },
        {
            name: 'Liberty Island Scenic Spur',
            deck: [180, 3720, 180, 3610], height: 16, y0: 16, y1: 0.12,
            elevated: true, modern: true, wide: false, width: 11, hw: 6.5,
            rampEnd: true, rampBranch: true, junctionStart: 'liberty', libertySpur: true,
        },
        // =========================================================================
        // INTER-BOROUGH BRIDGES (Queens, Vice Shores, Governors Island)
        // =========================================================================
        {
            // Queensboro Suspension Bridge connecting 59th St Midtown (x 1053, z 1450) to Queens Plaza (x 1340, z 1450)
            name: 'Queensboro Bridge',
            deck: [1053, 1450, 1340, 1450], height: 12, ramp: 85,
            towerH: 42, suspension: true, wide: true,
        },
        {
            // Triborough Arch Bridge connecting Upper Manhattan Harlem (x 1053, z 550) to Astoria (x 1340, z 550)
            name: 'Triborough Bridge',
            deck: [1053, 550, 1340, 550], height: 11, ramp: 75,
            towerH: 36, truss: 9.0, suspension: false, wide: true,
        },
        {
            // Cross-Borough Marine Viaduct connecting Queens south to Vice Shores (x 1560, z 1680 to x 1720, z 2060)
            name: 'Cross-Borough Marine Viaduct',
            deck: [1560, 1680, 1720, 2060], height: 10, ramp: 65,
            elevated: false, modern: true, wide: true, width: 16, hw: 9.0,
            rampStart: true, rampEnd: true,
        },
        {
            // Governors Island Causeway connecting Manhattan Battery (x 560, z 3360) to Governors Island (x 580, z 3420)
            name: 'Battery Fortress Causeway',
            deck: [560, 3360, 580, 3420], height: 4.5, ramp: 35,
            towerH: 14, suspension: false, wide: false,
        },
        {
            // East Harbor Marine Span connecting Governors Island (x 860, z 3500) across to Brooklyn (x 1250, z 3450)
            name: 'Governors Brooklyn Marine Span',
            deck: [860, 3500, 1250, 3450], height: 12, ramp: 80,
            towerH: 38, suspension: true, wide: false,
        },
    ];

    /**
     * Deck geometry, derived once.
     */
    const BRIDGE_DECKS = BRIDGES.map(b => {
        const [ax, az, bx, bz] = b.deck;
        const dx = bx - ax, dz = bz - az;
        const len = Math.sqrt(dx * dx + dz * dz);
        const ux = dx / len, uz = dz / len;
        const hw = b.hw || (b.wide ? 10.8 : (b.suspension ? 9.25 : 8.4)); // deck body half-width
        const pad = hw + 3;
        const y0 = b.y0 !== undefined ? b.y0 : (b.rampStart ? 0.12 : b.height);
        const y1 = b.y1 !== undefined ? b.y1 : (b.rampEnd ? 0.12 : b.height);
        return {
            name: b.name,
            ax, az, len, hw, ux, uz, px: uz, pz: -ux,
            y0, y1, y: b.height, gy: 0.12,
            elevated: !!b.elevated,
            ramp: Math.min(b.ramp || 0, len * 0.45),
            x0: Math.min(ax, bx) - pad, x1: Math.max(ax, bx) + pad,
            z0: Math.min(az, bz) - pad, z1: Math.max(az, bz) + pad,
        };
    });

    /** Bridge deck surface height at (x,z), or -1 when off every deck. */
    function bridgeDeckY(x, z) {
        let bestY = -1;
        for (let i = 0; i < BRIDGE_DECKS.length; i++) {
            const d = BRIDGE_DECKS[i];
            if (x < d.x0 || x > d.x1 || z < d.z0 || z > d.z1) continue;
            const rx = x - d.ax, rz = z - d.az;
            const q = rx * d.px + rz * d.pz;
            const s = rx * d.ux + rz * d.uz;

            // Interior rectangular deck check
            if (Math.abs(q) <= d.hw && s >= 0 && s <= d.len) {
                let y;
                if (d.elevated) {
                    y = d.y0 + (d.y1 - d.y0) * (s / d.len);
                } else {
                    const r = d.ramp;
                    if (s < r) y = d.gy + (d.y - d.gy) * (s / r);
                    else if (s > d.len - r) y = d.gy + (d.y - d.gy) * ((d.len - s) / r);
                    else y = d.y;
                }
                if (y > bestY) bestY = y;
                continue;
            }

            // Circular junction caps at start and end vertices (fills triangular gaps on angled joints)
            const capR = d.hw + 0.6;
            const capRSq = capR * capR;
            const dStartSq = rx * rx + rz * rz;
            if (dStartSq <= capRSq) {
                const y = d.elevated ? d.y0 : (d.ramp ? d.gy : d.y);
                if (y > bestY) bestY = y;
            }
            const endRx = rx - d.ux * d.len;
            const endRz = rz - d.uz * d.len;
            const dEndSq = endRx * endRx + endRz * endRz;
            if (dEndSq <= capRSq) {
                const y = d.elevated ? d.y1 : (d.ramp ? d.gy : d.y);
                if (y > bestY) bestY = y;
            }
        }
        return bestY;
    }

    /** Player spawn — VIP Modern Luxury Villa estate motor court. */
    const SPAWN = { x: -762.0, y: 28.0, z: 1524.0, heading: 0 }; // VIP Modern Villa on the Hill, facing North into courtyard

    /** District display names for the menu / pause map labels. */
    const DISTRICT_NAMES = {
        park: 'Central Park', harlem: 'Harlem', uws: 'Upper West Side',
        ues: 'Upper East Side', hellskitchen: "Hell's Kitchen", midtown: 'Midtown',
        chelsea: 'Chelsea', nomad: 'NoMad', murrayhill: 'Murray Hill',
        village: 'Greenwich Village', les: 'Lower East Side', soho: 'SoHo',
        chinatown: 'Chinatown', tribeca: 'Tribeca', fidi: 'Financial District',
        paradise_city: 'Paradise City', san_andreas_heights: 'San Andreas Heights',
        queens: 'Queens Port', astoria: 'Astoria Harbor', docks: 'Industrial Docks',
        vice_shores: 'Vice Shores', ocean_drive: 'Ocean Drive Beach', governors: 'Governors Fortress',
    };
