// Browrio Run: 2D retro platformer for BrowOS (Mario-like, original art/code)
(function () {
    'use strict';

    var TILE = 24;
    var VIEW_W = 640;
    var VIEW_H = 360;
    var ROWS = 15;
    var GRAV = 0.55;
    var MAX_FALL = 12;

    // ---------------- Levels (designed) ----------------
    // y = tile row (0 top, 14 bottom). Ground top surface is row 12, ground body rows 13-14.
    // ---------------- LEVELS (12 levels, 3 worlds of 4) ----------------
    // World 1: GRASSLAND (sky 0, green)
    // World 2: UNDERGROUND (sky 1, night/stars)
    // World 3: SKY (sky 2, sunset)
    var LEVELS = [
        // ---------- WORLD 1 ----------
        {
            world: 1, subIndex: 1,
            name: '1-1  GREEN HILLS',
            sub: 'Tutorial: run, jump, stomp. Watch for pits!',
            sky: 0, width: 172, time: 300,
            gaps: [[30, 32], [62, 64], [104, 107]],
            pipes: [{ x: 36, h: 2 }, { x: 52, h: 3 }, { x: 78, h: 2 }],
            stairs: [{ x: 150, h: 4, dir: 1 }],
            blocks: [
                { x: 15, y: 9, t: 'qcoin' },
                { x: 20, y: 9, t: 'brick' }, { x: 21, y: 9, t: 'qcoin' }, { x: 22, y: 9, t: 'brick' },
                { x: 21, y: 5, t: 'qcoin' },
                { x: 41, y: 9, t: 'qmush' }, { x: 42, y: 9, t: 'brick' },
                { x: 57, y: 9, t: 'brick' }, { x: 58, y: 9, t: 'qcoin' }, { x: 59, y: 9, t: 'brick' },
                { x: 84, y: 9, t: 'solid' }, { x: 85, y: 9, t: 'solid' }, { x: 86, y: 9, t: 'solid' },
                { x: 88, y: 9, t: 'qcoin' },
                { x: 112, y: 9, t: 'platform' }, { x: 113, y: 9, t: 'platform' }, { x: 114, y: 9, t: 'platform' },
                { x: 122, y: 7, t: 'platform' }, { x: 123, y: 7, t: 'platform' }, { x: 124, y: 7, t: 'platform' },
                { x: 132, y: 9, t: 'brick' }, { x: 133, y: 9, t: 'qmush' }, { x: 134, y: 9, t: 'brick' }
            ],
            coins: [
                { x: 30, y: 8 }, { x: 31, y: 7 }, { x: 32, y: 8 },
                { x: 62, y: 8 }, { x: 63, y: 7 }, { x: 64, y: 8 },
                { x: 104, y: 8 }, { x: 105, y: 7 }, { x: 106, y: 7 }, { x: 107, y: 8 },
                { x: 112, y: 7 }, { x: 114, y: 7 }, { x: 122, y: 5 }, { x: 124, y: 5 }
            ],
            enemies: [
                { x: 24, t: 'walker' }, { x: 47, t: 'walker' },
                { x: 70, t: 'walker' }, { x: 90, t: 'walker' }, { x: 128, t: 'walker' }
            ],
            goalX: 162
        },
        {
            world: 1, subIndex: 2,
            name: '1-2  PIPE PLAINS',
            sub: 'Taller pipes, hidden coins above the pipes.',
            sky: 0, width: 200, time: 320,
            gaps: [[28, 30], [62, 64], [120, 122]],
            pipes: [{ x: 18, h: 2 }, { x: 36, h: 3 }, { x: 48, h: 4 }, { x: 70, h: 2 }, { x: 102, h: 3 }, { x: 148, h: 2 }],
            stairs: [{ x: 88, h: 3, dir: 1 }, { x: 92, h: 3, dir: -1 }, { x: 170, h: 5, dir: 1 }],
            blocks: [
                { x: 12, y: 9, t: 'qcoin' }, { x: 14, y: 9, t: 'brick' }, { x: 15, y: 9, t: 'qmush' },
                { x: 30, y: 9, t: 'brick' }, { x: 31, y: 9, t: 'qcoin' }, { x: 32, y: 9, t: 'brick' },
                { x: 50, y: 6, t: 'platform' }, { x: 51, y: 6, t: 'platform' }, { x: 52, y: 6, t: 'platform' },
                { x: 66, y: 9, t: 'solid' }, { x: 67, y: 9, t: 'solid' }, { x: 68, y: 9, t: 'solid' },
                { x: 67, y: 5, t: 'qcoin' },
                { x: 80, y: 9, t: 'brick' }, { x: 81, y: 9, t: 'brick' }, { x: 82, y: 9, t: 'qcoin' },
                { x: 110, y: 9, t: 'platform' }, { x: 111, y: 9, t: 'platform' }, { x: 112, y: 9, t: 'platform' }, { x: 113, y: 9, t: 'platform' },
                { x: 130, y: 8, t: 'brick' }, { x: 131, y: 8, t: 'qmush' }, { x: 132, y: 8, t: 'brick' },
                { x: 156, y: 9, t: 'qcoin' }, { x: 158, y: 9, t: 'brick' }
            ],
            coins: [
                { x: 28, y: 8 }, { x: 29, y: 7 }, { x: 30, y: 8 },
                { x: 62, y: 8 }, { x: 63, y: 7 }, { x: 64, y: 8 },
                { x: 120, y: 8 }, { x: 121, y: 7 }, { x: 122, y: 8 },
                { x: 50, y: 4 }, { x: 52, y: 4 }, { x: 110, y: 7 }, { x: 113, y: 7 }
            ],
            enemies: [
                { x: 22, t: 'walker' }, { x: 40, t: 'walker' }, { x: 56, t: 'spiky' },
                { x: 76, t: 'walker' }, { x: 86, t: 'walker' }, { x: 116, t: 'walker' },
                { x: 138, t: 'spiky' }, { x: 162, t: 'walker' }
            ],
            goalX: 192
        },
        {
            world: 1, subIndex: 3,
            name: '1-3  MUSHROOM RIDGE',
            sub: 'Hop mushroom platforms; spikes lurk below.',
            sky: 0, width: 210, time: 320,
            gaps: [[20, 23], [44, 48], [80, 84], [128, 131], [164, 167]],
            pipes: [{ x: 60, h: 2 }, { x: 140, h: 3 }],
            stairs: [{ x: 190, h: 4, dir: 1 }],
            blocks: [
                { x: 10, y: 9, t: 'qmush' },
                { x: 25, y: 8, t: 'platform' }, { x: 26, y: 8, t: 'platform' }, { x: 27, y: 8, t: 'platform' },
                { x: 32, y: 6, t: 'platform' }, { x: 33, y: 6, t: 'platform' }, { x: 34, y: 6, t: 'platform' },
                { x: 38, y: 8, t: 'qcoin' }, { x: 39, y: 8, t: 'qcoin' },
                { x: 50, y: 8, t: 'platform' }, { x: 51, y: 8, t: 'platform' },
                { x: 56, y: 6, t: 'platform' }, { x: 57, y: 6, t: 'platform' }, { x: 58, y: 6, t: 'qcoin' },
                { x: 70, y: 9, t: 'brick' }, { x: 71, y: 9, t: 'qcoin' }, { x: 72, y: 9, t: 'brick' },
                { x: 86, y: 7, t: 'platform' }, { x: 87, y: 7, t: 'platform' }, { x: 88, y: 7, t: 'platform' },
                { x: 96, y: 9, t: 'brick' }, { x: 97, y: 9, t: 'qmush' }, { x: 98, y: 9, t: 'brick' },
                { x: 110, y: 8, t: 'platform' }, { x: 111, y: 8, t: 'platform' }, { x: 112, y: 8, t: 'qcoin' },
                { x: 118, y: 6, t: 'platform' }, { x: 119, y: 6, t: 'platform' }, { x: 120, y: 6, t: 'platform' },
                { x: 134, y: 8, t: 'platform' }, { x: 135, y: 8, t: 'platform' }, { x: 136, y: 8, t: 'platform' },
                { x: 150, y: 9, t: 'brick' }, { x: 152, y: 9, t: 'qcoin' },
                { x: 170, y: 8, t: 'platform' }, { x: 171, y: 8, t: 'platform' }, { x: 172, y: 8, t: 'platform' },
                { x: 180, y: 6, t: 'platform' }, { x: 181, y: 6, t: 'platform' }, { x: 182, y: 6, t: 'qcoin' }
            ],
            coins: [
                { x: 20, y: 7 }, { x: 22, y: 6 }, { x: 23, y: 7 },
                { x: 44, y: 7 }, { x: 46, y: 6 }, { x: 48, y: 7 },
                { x: 80, y: 7 }, { x: 82, y: 6 }, { x: 84, y: 7 },
                { x: 128, y: 7 }, { x: 130, y: 6 }, { x: 131, y: 7 },
                { x: 164, y: 7 }, { x: 166, y: 6 }, { x: 167, y: 7 }
            ],
            enemies: [
                { x: 16, t: 'walker' }, { x: 36, t: 'spiky' }, { x: 54, t: 'walker' },
                { x: 76, t: 'walker' }, { x: 92, t: 'spiky' }, { x: 116, t: 'walker' },
                { x: 132, t: 'spiky' }, { x: 162, t: 'walker' }, { x: 186, t: 'spiky' }
            ],
            goalX: 200
        },
        {
            world: 1, subIndex: 4,
            name: '1-4  CASTLE ENTRY',
            sub: 'Boss climb: long stairway, fast walkers, big finish.',
            sky: 0, width: 220, time: 350,
            gaps: [[26, 28], [60, 62], [110, 112], [150, 152]],
            pipes: [{ x: 38, h: 2 }, { x: 100, h: 3 }],
            stairs: [
                { x: 70, h: 4, dir: 1 }, { x: 76, h: 4, dir: -1 },
                { x: 120, h: 5, dir: 1 }, { x: 130, h: 5, dir: -1 },
                { x: 200, h: 6, dir: 1 }
            ],
            blocks: [
                { x: 12, y: 9, t: 'qcoin' }, { x: 14, y: 9, t: 'qmush' },
                { x: 30, y: 9, t: 'brick' }, { x: 31, y: 9, t: 'qcoin' }, { x: 32, y: 9, t: 'brick' },
                { x: 46, y: 8, t: 'platform' }, { x: 47, y: 8, t: 'platform' }, { x: 48, y: 8, t: 'platform' },
                { x: 52, y: 6, t: 'platform' }, { x: 53, y: 6, t: 'platform' }, { x: 54, y: 6, t: 'platform' },
                { x: 70, y: 9, t: 'solid' }, { x: 71, y: 9, t: 'solid' }, { x: 72, y: 9, t: 'solid' },
                { x: 86, y: 9, t: 'brick' }, { x: 87, y: 9, t: 'qcoin' }, { x: 88, y: 9, t: 'brick' },
                { x: 104, y: 9, t: 'brick' }, { x: 105, y: 9, t: 'qcoin' }, { x: 106, y: 9, t: 'brick' },
                { x: 132, y: 9, t: 'brick' }, { x: 133, y: 9, t: 'qmush' }, { x: 134, y: 9, t: 'brick' },
                { x: 156, y: 8, t: 'platform' }, { x: 157, y: 8, t: 'platform' }, { x: 158, y: 8, t: 'platform' },
                { x: 164, y: 6, t: 'platform' }, { x: 165, y: 6, t: 'platform' }, { x: 166, y: 6, t: 'platform' },
                { x: 180, y: 9, t: 'brick' }, { x: 181, y: 9, t: 'qcoin' }, { x: 182, y: 9, t: 'brick' }
            ],
            coins: [
                { x: 26, y: 8 }, { x: 27, y: 7 }, { x: 28, y: 8 },
                { x: 60, y: 8 }, { x: 61, y: 7 }, { x: 62, y: 8 },
                { x: 110, y: 8 }, { x: 111, y: 7 }, { x: 112, y: 8 },
                { x: 150, y: 8 }, { x: 151, y: 7 }, { x: 152, y: 8 }
            ],
            enemies: [
                { x: 18, t: 'walker' }, { x: 34, t: 'walker' }, { x: 56, t: 'spiky' },
                { x: 80, t: 'walker' }, { x: 92, t: 'walker' }, { x: 116, t: 'spiky' },
                { x: 144, t: 'walker' }, { x: 168, t: 'walker' }, { x: 188, t: 'spiky' }
            ],
            goalX: 210
        },

        // ---------- WORLD 2 ----------
        {
            world: 2, subIndex: 1,
            name: '2-1  MINE ENTRANCE',
            sub: 'Welcome underground. Stone bricks, fewer coins.',
            sky: 1, width: 200, time: 320,
            gaps: [[24, 27], [56, 58], [88, 91], [128, 130]],
            pipes: [{ x: 32, h: 2 }, { x: 70, h: 3 }, { x: 140, h: 2 }],
            stairs: [{ x: 100, h: 4, dir: 1 }, { x: 106, h: 4, dir: -1 }, { x: 180, h: 5, dir: 1 }],
            blocks: [
                { x: 14, y: 9, t: 'qcoin' }, { x: 16, y: 9, t: 'solid' },
                { x: 30, y: 8, t: 'platform' }, { x: 31, y: 8, t: 'platform' },
                { x: 36, y: 6, t: 'platform' }, { x: 37, y: 6, t: 'platform' }, { x: 38, y: 6, t: 'qcoin' },
                { x: 44, y: 9, t: 'solid' }, { x: 45, y: 9, t: 'solid' },
                { x: 60, y: 9, t: 'solid' }, { x: 61, y: 9, t: 'qcoin' }, { x: 62, y: 9, t: 'solid' },
                { x: 78, y: 8, t: 'platform' }, { x: 79, y: 8, t: 'platform' },
                { x: 92, y: 9, t: 'solid' }, { x: 93, y: 9, t: 'solid' }, { x: 94, y: 9, t: 'solid' },
                { x: 110, y: 9, t: 'solid' }, { x: 111, y: 9, t: 'qmush' }, { x: 112, y: 9, t: 'solid' },
                { x: 134, y: 8, t: 'platform' }, { x: 135, y: 8, t: 'platform' }, { x: 136, y: 8, t: 'platform' },
                { x: 150, y: 9, t: 'solid' }, { x: 151, y: 9, t: 'qcoin' }, { x: 152, y: 9, t: 'solid' },
                { x: 168, y: 7, t: 'platform' }, { x: 169, y: 7, t: 'platform' }, { x: 170, y: 7, t: 'platform' }
            ],
            coins: [
                { x: 24, y: 7 }, { x: 26, y: 6 }, { x: 27, y: 7 },
                { x: 56, y: 7 }, { x: 57, y: 6 }, { x: 58, y: 7 },
                { x: 88, y: 7 }, { x: 90, y: 6 }, { x: 91, y: 7 },
                { x: 128, y: 7 }, { x: 129, y: 6 }, { x: 130, y: 7 }
            ],
            enemies: [
                { x: 20, t: 'walker' }, { x: 42, t: 'spiky' }, { x: 66, t: 'walker' },
                { x: 84, t: 'walker' }, { x: 108, t: 'spiky' }, { x: 132, t: 'walker' },
                { x: 156, t: 'walker' }, { x: 174, t: 'spiky' }
            ],
            goalX: 192
        },
        {
            world: 2, subIndex: 2,
            name: '2-2  CRYSTAL CAVE',
            sub: 'Tight jumps, no mushrooms, all hazards.',
            sky: 1, width: 215, time: 320,
            gaps: [[18, 20], [40, 42], [70, 73], [104, 106], [138, 140], [172, 175]],
            pipes: [{ x: 52, h: 2 }, { x: 120, h: 3 }],
            stairs: [{ x: 152, h: 4, dir: 1 }, { x: 158, h: 4, dir: -1 }, { x: 196, h: 5, dir: 1 }],
            blocks: [
                { x: 10, y: 9, t: 'qcoin' },
                { x: 24, y: 8, t: 'platform' }, { x: 25, y: 8, t: 'platform' }, { x: 26, y: 8, t: 'platform' },
                { x: 32, y: 6, t: 'platform' }, { x: 33, y: 6, t: 'platform' }, { x: 34, y: 6, t: 'qcoin' },
                { x: 44, y: 8, t: 'platform' }, { x: 45, y: 8, t: 'platform' },
                { x: 56, y: 9, t: 'solid' }, { x: 57, y: 9, t: 'solid' },
                { x: 76, y: 8, t: 'platform' }, { x: 77, y: 8, t: 'platform' }, { x: 78, y: 8, t: 'platform' },
                { x: 86, y: 6, t: 'platform' }, { x: 87, y: 6, t: 'platform' }, { x: 88, y: 6, t: 'qcoin' },
                { x: 98, y: 9, t: 'solid' }, { x: 99, y: 9, t: 'qcoin' }, { x: 100, y: 9, t: 'solid' },
                { x: 110, y: 8, t: 'platform' }, { x: 111, y: 8, t: 'platform' },
                { x: 124, y: 9, t: 'solid' }, { x: 125, y: 9, t: 'solid' }, { x: 126, y: 9, t: 'solid' },
                { x: 142, y: 8, t: 'platform' }, { x: 143, y: 8, t: 'platform' }, { x: 144, y: 8, t: 'platform' },
                { x: 162, y: 9, t: 'solid' }, { x: 163, y: 9, t: 'qcoin' }, { x: 164, y: 9, t: 'solid' },
                { x: 178, y: 8, t: 'platform' }, { x: 179, y: 8, t: 'platform' }, { x: 180, y: 8, t: 'platform' },
                { x: 186, y: 6, t: 'platform' }, { x: 187, y: 6, t: 'platform' }, { x: 188, y: 6, t: 'qcoin' }
            ],
            coins: [
                { x: 18, y: 7 }, { x: 19, y: 6 }, { x: 20, y: 7 },
                { x: 40, y: 7 }, { x: 41, y: 6 }, { x: 42, y: 7 },
                { x: 70, y: 7 }, { x: 72, y: 6 }, { x: 73, y: 7 },
                { x: 104, y: 7 }, { x: 105, y: 6 }, { x: 106, y: 7 },
                { x: 138, y: 7 }, { x: 139, y: 6 }, { x: 140, y: 7 },
                { x: 172, y: 7 }, { x: 174, y: 6 }, { x: 175, y: 7 }
            ],
            enemies: [
                { x: 14, t: 'walker' }, { x: 30, t: 'spiky' }, { x: 50, t: 'walker' },
                { x: 68, t: 'spiky' }, { x: 84, t: 'walker' }, { x: 102, t: 'spiky' },
                { x: 122, t: 'walker' }, { x: 146, t: 'spiky' }, { x: 170, t: 'walker' },
                { x: 184, t: 'spiky' }
            ],
            goalX: 206
        },
        {
            world: 2, subIndex: 3,
            name: '2-3  LAVA TUNNEL',
            sub: 'Floor gaps wider; spikes patrol. Stay alert!',
            sky: 1, width: 230, time: 350,
            gaps: [[16, 19], [38, 42], [64, 68], [94, 98], [124, 128], [156, 160], [188, 191]],
            pipes: [{ x: 48, h: 2 }, { x: 108, h: 3 }, { x: 168, h: 2 }],
            stairs: [{ x: 78, h: 3, dir: 1 }, { x: 82, h: 3, dir: -1 }, { x: 138, h: 4, dir: 1 }, { x: 144, h: 4, dir: -1 }, { x: 210, h: 6, dir: 1 }],
            blocks: [
                { x: 10, y: 9, t: 'qcoin' },
                { x: 22, y: 8, t: 'platform' }, { x: 23, y: 8, t: 'platform' }, { x: 24, y: 8, t: 'platform' },
                { x: 30, y: 6, t: 'platform' }, { x: 31, y: 6, t: 'platform' }, { x: 32, y: 6, t: 'qcoin' },
                { x: 44, y: 9, t: 'solid' }, { x: 45, y: 9, t: 'qcoin' }, { x: 46, y: 9, t: 'solid' },
                { x: 52, y: 7, t: 'platform' }, { x: 53, y: 7, t: 'platform' }, { x: 54, y: 7, t: 'platform' },
                { x: 70, y: 9, t: 'solid' }, { x: 71, y: 9, t: 'solid' }, { x: 72, y: 9, t: 'solid' },
                { x: 86, y: 8, t: 'platform' }, { x: 87, y: 8, t: 'platform' }, { x: 88, y: 8, t: 'platform' },
                { x: 100, y: 9, t: 'solid' }, { x: 101, y: 9, t: 'qmush' }, { x: 102, y: 9, t: 'solid' },
                { x: 112, y: 8, t: 'platform' }, { x: 113, y: 8, t: 'platform' }, { x: 114, y: 8, t: 'platform' },
                { x: 120, y: 6, t: 'platform' }, { x: 121, y: 6, t: 'platform' }, { x: 122, y: 6, t: 'qcoin' },
                { x: 130, y: 9, t: 'solid' }, { x: 131, y: 9, t: 'solid' }, { x: 132, y: 9, t: 'solid' },
                { x: 148, y: 8, t: 'platform' }, { x: 149, y: 8, t: 'platform' }, { x: 150, y: 8, t: 'platform' },
                { x: 164, y: 9, t: 'solid' }, { x: 165, y: 9, t: 'qcoin' }, { x: 166, y: 9, t: 'solid' },
                { x: 174, y: 7, t: 'platform' }, { x: 175, y: 7, t: 'platform' }, { x: 176, y: 7, t: 'platform' },
                { x: 194, y: 8, t: 'platform' }, { x: 195, y: 8, t: 'platform' }, { x: 196, y: 8, t: 'platform' },
                { x: 202, y: 6, t: 'platform' }, { x: 203, y: 6, t: 'platform' }, { x: 204, y: 6, t: 'qcoin' }
            ],
            coins: [
                { x: 16, y: 7 }, { x: 18, y: 6 }, { x: 19, y: 7 },
                { x: 38, y: 7 }, { x: 40, y: 6 }, { x: 42, y: 7 },
                { x: 64, y: 7 }, { x: 66, y: 6 }, { x: 68, y: 7 },
                { x: 94, y: 7 }, { x: 96, y: 6 }, { x: 98, y: 7 },
                { x: 124, y: 7 }, { x: 126, y: 6 }, { x: 128, y: 7 },
                { x: 156, y: 7 }, { x: 158, y: 6 }, { x: 160, y: 7 },
                { x: 188, y: 7 }, { x: 190, y: 6 }, { x: 191, y: 7 }
            ],
            enemies: [
                { x: 12, t: 'walker' }, { x: 28, t: 'spiky' }, { x: 44, t: 'walker' },
                { x: 60, t: 'spiky' }, { x: 76, t: 'walker' }, { x: 92, t: 'spiky' },
                { x: 108, t: 'walker' }, { x: 126, t: 'spiky' }, { x: 146, t: 'walker' },
                { x: 162, t: 'spiky' }, { x: 180, t: 'walker' }, { x: 198, t: 'spiky' }
            ],
            goalX: 220
        },
        {
            world: 2, subIndex: 4,
            name: '2-4  UNDERGROUND FORTRESS',
            sub: 'Final underground level. Long stairways, all enemy types.',
            sky: 1, width: 240, time: 380,
            gaps: [[22, 25], [54, 57], [86, 90], [122, 126], [158, 161], [196, 200]],
            pipes: [{ x: 40, h: 2 }, { x: 100, h: 3 }, { x: 172, h: 4 }],
            stairs: [
                { x: 60, h: 4, dir: 1 }, { x: 66, h: 4, dir: -1 },
                { x: 130, h: 5, dir: 1 }, { x: 138, h: 5, dir: -1 },
                { x: 220, h: 7, dir: 1 }
            ],
            blocks: [
                { x: 12, y: 9, t: 'qcoin' }, { x: 14, y: 9, t: 'qmush' },
                { x: 28, y: 8, t: 'platform' }, { x: 29, y: 8, t: 'platform' }, { x: 30, y: 8, t: 'platform' },
                { x: 36, y: 6, t: 'platform' }, { x: 37, y: 6, t: 'platform' }, { x: 38, y: 6, t: 'qcoin' },
                { x: 44, y: 9, t: 'solid' }, { x: 45, y: 9, t: 'solid' },
                { x: 60, y: 9, t: 'solid' }, { x: 61, y: 9, t: 'qcoin' }, { x: 62, y: 9, t: 'solid' },
                { x: 70, y: 8, t: 'platform' }, { x: 71, y: 8, t: 'platform' }, { x: 72, y: 8, t: 'platform' },
                { x: 78, y: 6, t: 'platform' }, { x: 79, y: 6, t: 'platform' }, { x: 80, y: 6, t: 'qcoin' },
                { x: 94, y: 9, t: 'solid' }, { x: 95, y: 9, t: 'solid' }, { x: 96, y: 9, t: 'solid' },
                { x: 104, y: 9, t: 'solid' }, { x: 105, y: 9, t: 'qmush' }, { x: 106, y: 9, t: 'solid' },
                { x: 116, y: 8, t: 'platform' }, { x: 117, y: 8, t: 'platform' }, { x: 118, y: 8, t: 'platform' },
                { x: 128, y: 9, t: 'solid' }, { x: 129, y: 9, t: 'qcoin' }, { x: 130, y: 9, t: 'solid' },
                { x: 144, y: 8, t: 'platform' }, { x: 145, y: 8, t: 'platform' }, { x: 146, y: 8, t: 'platform' },
                { x: 150, y: 6, t: 'platform' }, { x: 151, y: 6, t: 'platform' }, { x: 152, y: 6, t: 'qcoin' },
                { x: 164, y: 9, t: 'solid' }, { x: 165, y: 9, t: 'solid' }, { x: 166, y: 9, t: 'solid' },
                { x: 176, y: 9, t: 'solid' }, { x: 177, y: 9, t: 'qcoin' }, { x: 178, y: 9, t: 'solid' },
                { x: 188, y: 7, t: 'platform' }, { x: 189, y: 7, t: 'platform' }, { x: 190, y: 7, t: 'platform' },
                { x: 204, y: 8, t: 'platform' }, { x: 205, y: 8, t: 'platform' }, { x: 206, y: 8, t: 'platform' },
                { x: 212, y: 6, t: 'platform' }, { x: 213, y: 6, t: 'platform' }, { x: 214, y: 6, t: 'qcoin' }
            ],
            coins: [
                { x: 22, y: 7 }, { x: 24, y: 6 }, { x: 25, y: 7 },
                { x: 54, y: 7 }, { x: 56, y: 6 }, { x: 57, y: 7 },
                { x: 86, y: 7 }, { x: 88, y: 6 }, { x: 90, y: 7 },
                { x: 122, y: 7 }, { x: 124, y: 6 }, { x: 126, y: 7 },
                { x: 158, y: 7 }, { x: 160, y: 6 }, { x: 161, y: 7 },
                { x: 196, y: 7 }, { x: 198, y: 6 }, { x: 200, y: 7 }
            ],
            enemies: [
                { x: 18, t: 'walker' }, { x: 34, t: 'spiky' }, { x: 50, t: 'walker' },
                { x: 70, t: 'spiky' }, { x: 88, t: 'walker' }, { x: 102, t: 'spiky' },
                { x: 120, t: 'walker' }, { x: 140, t: 'spiky' }, { x: 160, t: 'walker' },
                { x: 180, t: 'spiky' }, { x: 198, t: 'walker' }, { x: 214, t: 'spiky' }
            ],
            goalX: 230
        },

        // ---------- WORLD 3 ----------
        {
            world: 3, subIndex: 1,
            name: '3-1  CLOUD GARDEN',
            sub: 'Sunset skies. Stair-steps, long platforms.',
            sky: 2, width: 210, time: 320,
            gaps: [[18, 21], [46, 50], [82, 86], [120, 124], [160, 163]],
            pipes: [{ x: 56, h: 2 }, { x: 132, h: 3 }],
            stairs: [{ x: 94, h: 4, dir: 1 }, { x: 102, h: 4, dir: -1 }, { x: 190, h: 5, dir: 1 }],
            blocks: [
                { x: 10, y: 9, t: 'qcoin' },
                { x: 24, y: 8, t: 'platform' }, { x: 25, y: 8, t: 'platform' }, { x: 26, y: 8, t: 'platform' },
                { x: 32, y: 6, t: 'platform' }, { x: 33, y: 6, t: 'platform' }, { x: 34, y: 6, t: 'qcoin' },
                { x: 40, y: 8, t: 'platform' }, { x: 41, y: 8, t: 'platform' },
                { x: 52, y: 9, t: 'solid' }, { x: 53, y: 9, t: 'qcoin' }, { x: 54, y: 9, t: 'solid' },
                { x: 64, y: 8, t: 'platform' }, { x: 65, y: 8, t: 'platform' }, { x: 66, y: 8, t: 'platform' },
                { x: 70, y: 6, t: 'platform' }, { x: 71, y: 6, t: 'platform' }, { x: 72, y: 6, t: 'qcoin' },
                { x: 88, y: 9, t: 'solid' }, { x: 89, y: 9, t: 'qmush' }, { x: 90, y: 9, t: 'solid' },
                { x: 110, y: 8, t: 'platform' }, { x: 111, y: 8, t: 'platform' }, { x: 112, y: 8, t: 'platform' },
                { x: 116, y: 6, t: 'platform' }, { x: 117, y: 6, t: 'platform' }, { x: 118, y: 6, t: 'qcoin' },
                { x: 130, y: 9, t: 'solid' }, { x: 131, y: 9, t: 'solid' }, { x: 132, y: 9, t: 'solid' },
                { x: 138, y: 8, t: 'platform' }, { x: 139, y: 8, t: 'platform' }, { x: 140, y: 8, t: 'platform' },
                { x: 148, y: 9, t: 'brick' }, { x: 149, y: 9, t: 'qcoin' }, { x: 150, y: 9, t: 'brick' },
                { x: 166, y: 8, t: 'platform' }, { x: 167, y: 8, t: 'platform' }, { x: 168, y: 8, t: 'platform' },
                { x: 174, y: 6, t: 'platform' }, { x: 175, y: 6, t: 'platform' }, { x: 176, y: 6, t: 'qcoin' }
            ],
            coins: [
                { x: 18, y: 7 }, { x: 20, y: 6 }, { x: 21, y: 7 },
                { x: 46, y: 7 }, { x: 48, y: 6 }, { x: 50, y: 7 },
                { x: 82, y: 7 }, { x: 84, y: 6 }, { x: 86, y: 7 },
                { x: 120, y: 7 }, { x: 122, y: 6 }, { x: 124, y: 7 },
                { x: 160, y: 7 }, { x: 162, y: 6 }, { x: 163, y: 7 }
            ],
            enemies: [
                { x: 14, t: 'walker' }, { x: 36, t: 'spiky' }, { x: 60, t: 'walker' },
                { x: 80, t: 'spiky' }, { x: 108, t: 'walker' }, { x: 134, t: 'spiky' },
                { x: 156, t: 'walker' }, { x: 180, t: 'spiky' }
            ],
            goalX: 200
        },
        {
            world: 3, subIndex: 2,
            name: '3-2  AIRSHIP DECK',
            sub: 'Long platforms. Tread carefully, no second chances.',
            sky: 2, width: 220, time: 320,
            gaps: [[16, 19], [42, 45], [70, 74], [98, 102], [128, 132], [160, 163]],
            pipes: [{ x: 50, h: 2 }, { x: 110, h: 3 }, { x: 168, h: 4 }],
            stairs: [{ x: 82, h: 3, dir: 1 }, { x: 86, h: 3, dir: -1 }, { x: 200, h: 5, dir: 1 }],
            blocks: [
                { x: 10, y: 9, t: 'qcoin' },
                { x: 22, y: 8, t: 'platform' }, { x: 23, y: 8, t: 'platform' }, { x: 24, y: 8, t: 'platform' },
                { x: 30, y: 6, t: 'platform' }, { x: 31, y: 6, t: 'platform' }, { x: 32, y: 6, t: 'qcoin' },
                { x: 38, y: 8, t: 'platform' }, { x: 39, y: 8, t: 'platform' },
                { x: 46, y: 9, t: 'solid' }, { x: 47, y: 9, t: 'solid' },
                { x: 56, y: 8, t: 'platform' }, { x: 57, y: 8, t: 'platform' }, { x: 58, y: 8, t: 'platform' },
                { x: 62, y: 6, t: 'platform' }, { x: 63, y: 6, t: 'platform' }, { x: 64, y: 6, t: 'qcoin' },
                { x: 76, y: 9, t: 'solid' }, { x: 77, y: 9, t: 'qcoin' }, { x: 78, y: 9, t: 'solid' },
                { x: 90, y: 8, t: 'platform' }, { x: 91, y: 8, t: 'platform' }, { x: 92, y: 8, t: 'platform' },
                { x: 96, y: 6, t: 'platform' }, { x: 97, y: 6, t: 'platform' }, { x: 98, y: 6, t: 'qcoin' },
                { x: 104, y: 9, t: 'solid' }, { x: 105, y: 9, t: 'qmush' }, { x: 106, y: 9, t: 'solid' },
                { x: 114, y: 8, t: 'platform' }, { x: 115, y: 8, t: 'platform' }, { x: 116, y: 8, t: 'platform' },
                { x: 122, y: 6, t: 'platform' }, { x: 123, y: 6, t: 'platform' }, { x: 124, y: 6, t: 'qcoin' },
                { x: 134, y: 9, t: 'solid' }, { x: 135, y: 9, t: 'solid' }, { x: 136, y: 9, t: 'solid' },
                { x: 144, y: 8, t: 'platform' }, { x: 145, y: 8, t: 'platform' }, { x: 146, y: 8, t: 'platform' },
                { x: 152, y: 6, t: 'platform' }, { x: 153, y: 6, t: 'platform' }, { x: 154, y: 6, t: 'qcoin' },
                { x: 166, y: 9, t: 'solid' }, { x: 167, y: 9, t: 'qcoin' }, { x: 168, y: 9, t: 'solid' },
                { x: 178, y: 8, t: 'platform' }, { x: 179, y: 8, t: 'platform' }, { x: 180, y: 8, t: 'platform' },
                { x: 186, y: 6, t: 'platform' }, { x: 187, y: 6, t: 'platform' }, { x: 188, y: 6, t: 'qcoin' }
            ],
            coins: [
                { x: 16, y: 7 }, { x: 18, y: 6 }, { x: 19, y: 7 },
                { x: 42, y: 7 }, { x: 44, y: 6 }, { x: 45, y: 7 },
                { x: 70, y: 7 }, { x: 72, y: 6 }, { x: 74, y: 7 },
                { x: 98, y: 7 }, { x: 100, y: 6 }, { x: 102, y: 7 },
                { x: 128, y: 7 }, { x: 130, y: 6 }, { x: 132, y: 7 },
                { x: 160, y: 7 }, { x: 162, y: 6 }, { x: 163, y: 7 }
            ],
            enemies: [
                { x: 12, t: 'walker' }, { x: 28, t: 'spiky' }, { x: 44, t: 'walker' },
                { x: 60, t: 'spiky' }, { x: 80, t: 'walker' }, { x: 100, t: 'spiky' },
                { x: 120, t: 'walker' }, { x: 140, t: 'spiky' }, { x: 162, t: 'walker' },
                { x: 184, t: 'spiky' }
            ],
            goalX: 210
        },
        {
            world: 3, subIndex: 3,
            name: '3-3  STORM TOWER',
            sub: 'Vertical climb. Stair pyramids to the sky.',
            sky: 2, width: 230, time: 350,
            gaps: [[20, 22], [50, 52], [84, 86], [118, 120], [154, 156], [188, 190]],
            pipes: [{ x: 60, h: 2 }, { x: 128, h: 3 }, { x: 180, h: 4 }],
            stairs: [
                { x: 28, h: 4, dir: 1 }, { x: 38, h: 4, dir: -1 },
                { x: 92, h: 5, dir: 1 }, { x: 104, h: 5, dir: -1 },
                { x: 162, h: 6, dir: 1 }, { x: 174, h: 6, dir: -1 },
                { x: 210, h: 7, dir: 1 }
            ],
            blocks: [
                { x: 12, y: 9, t: 'qcoin' }, { x: 14, y: 9, t: 'qmush' },
                { x: 32, y: 8, t: 'platform' }, { x: 33, y: 8, t: 'platform' }, { x: 34, y: 8, t: 'platform' },
                { x: 40, y: 6, t: 'platform' }, { x: 41, y: 6, t: 'platform' }, { x: 42, y: 6, t: 'qcoin' },
                { x: 46, y: 9, t: 'solid' }, { x: 47, y: 9, t: 'solid' },
                { x: 56, y: 9, t: 'solid' }, { x: 57, y: 9, t: 'qcoin' }, { x: 58, y: 9, t: 'solid' },
                { x: 66, y: 7, t: 'platform' }, { x: 67, y: 7, t: 'platform' }, { x: 68, y: 7, t: 'platform' },
                { x: 74, y: 5, t: 'platform' }, { x: 75, y: 5, t: 'platform' }, { x: 76, y: 5, t: 'qcoin' },
                { x: 88, y: 9, t: 'solid' }, { x: 89, y: 9, t: 'solid' }, { x: 90, y: 9, t: 'solid' },
                { x: 110, y: 8, t: 'platform' }, { x: 111, y: 8, t: 'platform' }, { x: 112, y: 8, t: 'platform' },
                { x: 116, y: 6, t: 'platform' }, { x: 117, y: 6, t: 'platform' }, { x: 118, y: 6, t: 'qcoin' },
                { x: 124, y: 9, t: 'solid' }, { x: 125, y: 9, t: 'solid' }, { x: 126, y: 9, t: 'solid' },
                { x: 134, y: 8, t: 'platform' }, { x: 135, y: 8, t: 'platform' }, { x: 136, y: 8, t: 'platform' },
                { x: 142, y: 6, t: 'platform' }, { x: 143, y: 6, t: 'platform' }, { x: 144, y: 6, t: 'qcoin' },
                { x: 150, y: 9, t: 'solid' }, { x: 151, y: 9, t: 'qmush' }, { x: 152, y: 9, t: 'solid' },
                { x: 168, y: 8, t: 'platform' }, { x: 169, y: 8, t: 'platform' }, { x: 170, y: 8, t: 'platform' },
                { x: 180, y: 9, t: 'solid' }, { x: 181, y: 9, t: 'solid' }, { x: 182, y: 9, t: 'solid' },
                { x: 194, y: 8, t: 'platform' }, { x: 195, y: 8, t: 'platform' }, { x: 196, y: 8, t: 'platform' },
                { x: 202, y: 6, t: 'platform' }, { x: 203, y: 6, t: 'platform' }, { x: 204, y: 6, t: 'qcoin' }
            ],
            coins: [
                { x: 20, y: 7 }, { x: 21, y: 6 }, { x: 22, y: 7 },
                { x: 50, y: 7 }, { x: 51, y: 6 }, { x: 52, y: 7 },
                { x: 84, y: 7 }, { x: 85, y: 6 }, { x: 86, y: 7 },
                { x: 118, y: 7 }, { x: 119, y: 6 }, { x: 120, y: 7 },
                { x: 154, y: 7 }, { x: 155, y: 6 }, { x: 156, y: 7 },
                { x: 188, y: 7 }, { x: 189, y: 6 }, { x: 190, y: 7 }
            ],
            enemies: [
                { x: 16, t: 'walker' }, { x: 36, t: 'spiky' }, { x: 52, t: 'walker' },
                { x: 70, t: 'spiky' }, { x: 92, t: 'walker' }, { x: 114, t: 'spiky' },
                { x: 138, t: 'walker' }, { x: 160, t: 'spiky' }, { x: 184, t: 'walker' },
                { x: 200, t: 'spiky' }
            ],
            goalX: 222
        },
        {
            world: 3, subIndex: 4,
            name: '3-4  BROWIO KEEP',
            sub: 'Final castle. The biggest stairway. You can do it!',
            sky: 2, width: 250, time: 400,
            gaps: [[20, 22], [52, 55], [88, 92], [124, 128], [160, 164], [200, 204]],
            pipes: [{ x: 60, h: 2 }, { x: 130, h: 3 }, { x: 210, h: 4 }],
            stairs: [
                { x: 32, h: 5, dir: 1 }, { x: 42, h: 5, dir: -1 },
                { x: 96, h: 5, dir: 1 }, { x: 106, h: 5, dir: -1 },
                { x: 168, h: 6, dir: 1 }, { x: 178, h: 6, dir: -1 },
                { x: 230, h: 8, dir: 1 }
            ],
            blocks: [
                { x: 12, y: 9, t: 'qcoin' }, { x: 14, y: 9, t: 'qmush' }, { x: 16, y: 9, t: 'qcoin' },
                { x: 28, y: 8, t: 'platform' }, { x: 29, y: 8, t: 'platform' }, { x: 30, y: 8, t: 'platform' },
                { x: 36, y: 6, t: 'platform' }, { x: 37, y: 6, t: 'platform' }, { x: 38, y: 6, t: 'qcoin' },
                { x: 44, y: 9, t: 'solid' }, { x: 45, y: 9, t: 'solid' },
                { x: 58, y: 9, t: 'solid' }, { x: 59, y: 9, t: 'qcoin' }, { x: 60, y: 9, t: 'solid' },
                { x: 68, y: 8, t: 'platform' }, { x: 69, y: 8, t: 'platform' }, { x: 70, y: 8, t: 'platform' },
                { x: 76, y: 6, t: 'platform' }, { x: 77, y: 6, t: 'platform' }, { x: 78, y: 6, t: 'qcoin' },
                { x: 84, y: 9, t: 'solid' }, { x: 85, y: 9, t: 'solid' }, { x: 86, y: 9, t: 'solid' },
                { x: 96, y: 9, t: 'solid' }, { x: 97, y: 9, t: 'qmush' }, { x: 98, y: 9, t: 'solid' },
                { x: 110, y: 8, t: 'platform' }, { x: 111, y: 8, t: 'platform' }, { x: 112, y: 8, t: 'platform' },
                { x: 118, y: 6, t: 'platform' }, { x: 119, y: 6, t: 'platform' }, { x: 120, y: 6, t: 'qcoin' },
                { x: 126, y: 9, t: 'solid' }, { x: 127, y: 9, t: 'solid' }, { x: 128, y: 9, t: 'solid' },
                { x: 136, y: 8, t: 'platform' }, { x: 137, y: 8, t: 'platform' }, { x: 138, y: 8, t: 'platform' },
                { x: 144, y: 6, t: 'platform' }, { x: 145, y: 6, t: 'platform' }, { x: 146, y: 6, t: 'qcoin' },
                { x: 152, y: 9, t: 'solid' }, { x: 153, y: 9, t: 'solid' }, { x: 154, y: 9, t: 'solid' },
                { x: 162, y: 9, t: 'solid' }, { x: 163, y: 9, t: 'qmush' }, { x: 164, y: 9, t: 'solid' },
                { x: 174, y: 8, t: 'platform' }, { x: 175, y: 8, t: 'platform' }, { x: 176, y: 8, t: 'platform' },
                { x: 182, y: 6, t: 'platform' }, { x: 183, y: 6, t: 'platform' }, { x: 184, y: 6, t: 'qcoin' },
                { x: 192, y: 9, t: 'solid' }, { x: 193, y: 9, t: 'solid' }, { x: 194, y: 9, t: 'solid' },
                { x: 202, y: 9, t: 'solid' }, { x: 203, y: 9, t: 'qcoin' }, { x: 204, y: 9, t: 'solid' },
                { x: 214, y: 9, t: 'solid' }, { x: 215, y: 9, t: 'solid' }, { x: 216, y: 9, t: 'solid' },
                { x: 222, y: 8, t: 'platform' }, { x: 223, y: 8, t: 'platform' }, { x: 224, y: 8, t: 'platform' }
            ],
            coins: [
                { x: 20, y: 7 }, { x: 21, y: 6 }, { x: 22, y: 7 },
                { x: 52, y: 7 }, { x: 54, y: 6 }, { x: 55, y: 7 },
                { x: 88, y: 7 }, { x: 90, y: 6 }, { x: 92, y: 7 },
                { x: 124, y: 7 }, { x: 126, y: 6 }, { x: 128, y: 7 },
                { x: 160, y: 7 }, { x: 162, y: 6 }, { x: 164, y: 7 },
                { x: 200, y: 7 }, { x: 202, y: 6 }, { x: 204, y: 7 }
            ],
            enemies: [
                { x: 18, t: 'walker' }, { x: 32, t: 'spiky' }, { x: 48, t: 'walker' },
                { x: 64, t: 'spiky' }, { x: 82, t: 'walker' }, { x: 100, t: 'spiky' },
                { x: 118, t: 'walker' }, { x: 134, t: 'spiky' }, { x: 152, t: 'walker' },
                { x: 170, t: 'spiky' }, { x: 188, t: 'walker' }, { x: 206, t: 'spiky' },
                { x: 220, t: 'walker' }
            ],
            goalX: 240
        }
    ];

    // ---------------- Game ----------------
    function BrowrioGame(windowEl) {
        this.root = windowEl.querySelector('.browrio-window');
        if (!this.root) return;
        this.canvas = this.root.querySelector('#browrio-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.ctx.imageSmoothingEnabled = true;
        this.overlay = this.root.querySelector('#browrio-overlay');
        this.titleEl = this.root.querySelector('#browrio-title');
        this.msgEl = this.root.querySelector('#browrio-msg');
        this.startBtn = this.root.querySelector('#browrio-start-btn');
        this.levelBtns = this.root.querySelectorAll('[data-browrio-level]');
        this.hudEl = this.root.querySelector('#browrio-hud');

        this.W = VIEW_W; this.H = VIEW_H;
        this.keys = {};
        this.particles = [];
        this.dead = false;
        this.muted = false;
        this.audio = null;
        this.master = null;

        this.score = 0; this.coins = 0; this.lives = 3;
        this.levelIndex = 0;
        this.state = 'menu'; // menu | playing | paused | dying | flag | levelclear | gameover | win
        this.stateT = 0;
        this.timeLeft = 300;
        this.timeAcc = 0;
        this.camX = 0;
        this.animT = 0;
        this.best = 0;

        this.bind();
        this.loadLevel(0, true);
        this.draw(); // paint menu backdrop behind overlay
        this.lastT = performance.now();
        var self = this;
        var frame = function (t) { self.loop(t); };
        this.raf = requestAnimationFrame(frame);
        this._frame = frame;
        this.loadBest();
    }

    BrowrioGame.prototype.bind = function () {
        var self = this;
        this._kd = function (e) { self.onKey(e, true); };
        this._ku = function (e) { self.onKey(e, false); };
        window.addEventListener('keydown', this._kd);
        window.addEventListener('keyup', this._ku);
        // auto-pause when window loses focus
        this._blur = function () {
            if (self.state === 'playing') { self.state = 'paused'; self.showPause(); }
        };
        window.addEventListener('blur', this._blur);

        this._start = function () {
            if (self.state === 'levelclear') { self.nextLevel(); return; }
            if (self.state === 'gameover' || self.state === 'win') { self.restartAll(); return; }
            if (self.state === 'paused') { self.state = 'playing'; self.hideOverlay(); return; }
            self.userStart(self.levelIndex);
        };
        this.startBtn.addEventListener('click', this._start);
        this._lvl = function (e) {
            var b = e.target.closest('[data-browrio-level]');
            if (!b) return;
            var i = parseInt(b.getAttribute('data-browrio-level'), 10) || 0;
            self.userStart(i);
        };
        this.root.addEventListener('click', this._lvl);

        // click canvas to refocus keyboard
        this._focus = function () { self.canvas.focus(); };
        this.canvas.addEventListener('click', this._focus);

        // safe disposal on window close (matches BrowOS window.js closeWindow event)
        var winEl = this.canvas.closest('.brow-window') || this.canvas.closest('.window');
        this._host = winEl || this.root;
        this._closing = function () { self.destroy(); };
        this._host.addEventListener('window-closing', this._closing);
    };

    BrowrioGame.prototype.ensureAudio = function () {
        if (this.audio) {
            if (this.audio.state === 'suspended') this.audio.resume();
            return;
        }
        try {
            var AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            this.audio = new AC();
            this.master = this.audio.createGain();
            this.master.gain.value = 0.35;
            this.master.connect(this.audio.destination);
        } catch (e) { this.audio = null; }
    };

    BrowrioGame.prototype.beep = function (f0, f1, dur, type, vol, delay) {
        if (!this.audio || this.muted) return;
        try {
            var t = this.audio.currentTime + (delay || 0);
            var o = this.audio.createOscillator();
            var g = this.audio.createGain();
            o.type = type || 'square';
            o.frequency.setValueAtTime(f0, t);
            o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
            g.gain.setValueAtTime(vol || 0.5, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + dur);
            o.connect(g); g.connect(this.master);
            o.start(t); o.stop(t + dur + 0.02);
        } catch (e) {}
    };

    BrowrioGame.prototype.sfx = function (name) {
        if (!this.audio || this.muted) return;
        if (name === 'jump') this.beep(280, 640, 0.16, 'square', 0.35);
        else if (name === 'coin') { this.beep(950, 950, 0.07, 'square', 0.3); this.beep(1420, 1420, 0.16, 'square', 0.3, 0.07); }
        else if (name === 'stomp') this.beep(420, 90, 0.16, 'square', 0.4);
        else if (name === 'bump') this.beep(140, 90, 0.09, 'square', 0.35);
        else if (name === 'break') this.beep(220, 60, 0.12, 'sawtooth', 0.4);
        else if (name === 'sprout') this.beep(300, 900, 0.25, 'sine', 0.4);
        else if (name === 'power') { this.beep(500, 500, 0.08, 'square', 0.35); this.beep(750, 750, 0.08, 'square', 0.35, 0.08); this.beep(1000, 1000, 0.14, 'square', 0.35, 0.16); }
        else if (name === 'hurt') this.beep(400, 120, 0.3, 'sawtooth', 0.4);
        else if (name === 'death') { this.beep(500, 500, 0.12, 'square', 0.4); this.beep(400, 400, 0.12, 'square', 0.4, 0.12); this.beep(300, 80, 0.4, 'square', 0.4, 0.24); }
        else if (name === 'flag') { var n = [523, 659, 784, 1046, 1318]; for (var i = 0; i < n.length; i++) this.beep(n[i], n[i], 0.12, 'square', 0.32, i * 0.1); }
        else if (name === 'win') { var m = [523, 659, 784, 1046, 784, 1046]; for (var j = 0; j < m.length; j++) this.beep(m[j], m[j], 0.14, 'triangle', 0.4, j * 0.12); }
    };

    // ---------------- Level building ----------------
    BrowrioGame.prototype.inGap = function (gaps, c) {
        for (var i = 0; i < gaps.length; i++) if (c >= gaps[i][0] && c <= gaps[i][1]) return true;
        return false;
    };

    BrowrioGame.prototype.setTile = function (c, r, type) {
        if (c < 0 || c >= this.cols || r < 0 || r >= ROWS) return;
        if (!type) { this.grid[r][c] = null; return; }
        // pole + flag-top are decorative, not solid
        var solid = (type !== 'pole' && type !== 'flag-top');
        this.grid[r][c] = { solid: solid, type: type };
    };

    BrowrioGame.prototype.loadLevel = function (idx, keepScore) {
        this.levelIndex = idx;
        var def = LEVELS[idx];
        this.def = def;
        this.cols = def.width;
        this.grid = [];
        for (var r = 0; r < ROWS; r++) { this.grid.push([]); for (var c = 0; c < this.cols; c++) this.grid[r].push(null); }

        // ground
        for (var x = 0; x < this.cols; x++) {
            if (this.inGap(def.gaps, x)) continue;
            // leave opening at flag base? keep ground under flag
            this.setTile(x, 13, 'ground');
            this.setTile(x, 14, 'ground');
        }
        // pipes (2 wide)
        (def.pipes || []).forEach(function (p) {
            for (var i = 0; i < p.h; i++) {
                var row = 12 - i;
                this.setTile(p.x, row, i === p.h - 1 ? 'pipe-tl' : 'pipe-bl');
                this.setTile(p.x + 1, row, i === p.h - 1 ? 'pipe-tr' : 'pipe-br');
            }
        }, this);
        // stairs
        (def.stairs || []).forEach(function (s) {
            for (var i = 0; i < s.h; i++) {
                var col = s.dir === 1 ? s.x + i : s.x - i;
                for (var k = 0; k <= i; k++) this.setTile(col, 12 - k, 'stair');
            }
        }, this);
        // blocks
        (def.blocks || []).forEach(function (b) { this.setTile(b.x, b.y, b.t); }, this);
        // flag pole + base (pole is decorative, not solid)
        var gx = def.goalX;
        for (var fr = 4; fr <= 12; fr++) this.setTile(gx, fr, 'pole');
        this.setTile(gx, 3, 'flag-top');
        this.setTile(gx - 1, 12, 'stair'); // base step

        // entities
        this.coinList = (def.coins || []).map(function (k) {
            return { x: k.x * TILE + TILE / 2, y: k.y * TILE + TILE / 2, taken: false, ph: Math.random() * 6 };
        });
        this.enemies = (def.enemies || []).map(function (e) {
            return this.spawnEnemy(e.x * TILE, e.t);
        }, this);
        this.shrooms = [];
        this.flag = { col: gx, x: gx * TILE + TILE / 2, raised: false, hit: false };

        // player spawn on ground (Browrio – chibi plumber hero, hand-drawn feel)
        var big = !!(this.player && this.player.big);
        this.player = {
            x: 2 * TILE, y: 12 * TILE - (big ? 30 : 14), w: 16, h: big ? 30 : 16,
            vx: 0, vy: 0, dir: 1, onGround: false,
            coyote: 0, jumpBuf: 0, big: big,
            anim: 0, deadV: 0,
            bob: 0, blink: 0, blinkT: 2 + Math.random() * 3,
            squash: 1, stretch: 1,
            deadSpin: 0
        };
        // keep big across levels? reset to small each level for fairness, keep flag from arg
        if (!keepScore || idx === 0) { /* score handled by caller */ }

        this.camX = 0;
        this.timeLeft = def.time;
        this.timeAcc = 0;
        this.particles = [];
    };

    BrowrioGame.prototype.spawnEnemy = function (px, type) {
        var gy = this.groundTopAt(px);
        return {
            x: px, y: gy - 18, w: 20, h: 18,
            vx: (type === 'spiky' ? -0.8 : -0.55), vy: 0,
            type: type, alive: true, anim: Math.random() * 10
        };
    };

    BrowrioGame.prototype.groundTopAt = function (px) {
        var c = Math.floor(px / TILE);
        for (var r = 0; r < ROWS; r++) {
            var t = (this.grid[r] && this.grid[r][c]);
            if (t && t.solid) return r * TILE;
        }
        return 13 * TILE;
    };

    BrowrioGame.prototype.solidAt = function (px, py) {
        var c = Math.floor(px / TILE), r = Math.floor(py / TILE);
        if (c < 0) return true;             // left wall
        if (c >= this.cols) return true;   // right wall
        if (r < 0 || r >= ROWS) return false;
        var t = this.grid[r][c];
        return !!(t && t.solid);
    };

    BrowrioGame.prototype.tileOf = function (px, py) {
        var c = Math.floor(px / TILE), r = Math.floor(py / TILE);
        if (c < 0 || c >= this.cols || r < 0 || r >= ROWS) return null;
        return { c: c, r: r, t: this.grid[r][c] };
    };

    // ---------------- Input ----------------
    BrowrioGame.prototype.onKey = function (e, down) {
        var k = e.key;
        var tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        var gameKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'a', 'A', 'd', 'D', 'w', 'W', 's', 'S', 'p', 'P', 'm', 'M', 'Enter', 'Shift'];
        if (gameKeys.indexOf(k) !== -1) {
            // only trap keys when our window is likely focused / playing
            if (this.state === 'playing' || this.state === 'paused' || this.state === 'menu') e.preventDefault();
        }
        if (down) {
            if (k === 'm' || k === 'M') { this.muted = !this.muted; return; }
            if (k === 'p' || k === 'P') {
                if (this.state === 'playing') { this.state = 'paused'; this.showPause(); }
                else if (this.state === 'paused') { this.state = 'playing'; this.hideOverlay(); }
                return;
            }
            if (k === 'Enter') {
                if (this.state === 'menu') { this.userStart(this.levelIndex); return; }
                if (this.state === 'gameover' || this.state === 'win') { this.restartAll(); return; }
                if (this.state === 'levelclear') { this.nextLevel(); return; }
                if (this.state === 'paused') { this.state = 'playing'; this.hideOverlay(); return; }
            }
            if ((k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W') && this.state === 'playing') {
                this.player.jumpBuf = 0.12;
            }
            this.keys[k] = true;
        } else {
            this.keys[k] = false;
            // variable jump: cut upward velocity on release
            if ((k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W') && this.player && this.player.vy < -3.5) {
                this.player.vy = -3.5;
            }
        }
    };

    BrowrioGame.prototype.left = function () { return this.keys['ArrowLeft'] || this.keys['a'] || this.keys['A']; };
    BrowrioGame.prototype.right = function () { return this.keys['ArrowRight'] || this.keys['d'] || this.keys['D']; };
    BrowrioGame.prototype.run = function () { return this.keys['Shift'] || this.keys['x'] || this.keys['X']; };
    BrowrioGame.prototype.jumpHeld = function () { return this.keys[' '] || this.keys['ArrowUp'] || this.keys['w'] || this.keys['W']; };

    // ---------------- Flow ----------------
    BrowrioGame.prototype.userStart = function (idx) {
        this.ensureAudio();
        if (typeof idx === 'number') {
            if (idx === 0 && this.state === 'menu' && this.score === 0) { /* fresh */ }
            else if (this.state === 'menu' || this.state === 'gameover' || this.state === 'win') {
                this.score = 0; this.coins = 0; this.lives = 3;
            }
            this.loadLevel(idx, true);
        }
        this.state = 'playing';
        this.hideOverlay();
        try { this.canvas.focus(); } catch (e) {}
    };

    BrowrioGame.prototype.restartAll = function () {
        this.score = 0; this.coins = 0; this.lives = 3;
        this.loadLevel(0, true);
        this.state = 'playing';
        this.hideOverlay();
    };

    BrowrioGame.prototype.nextLevel = function () {
        if (this.levelIndex + 1 >= LEVELS.length) {
            this.state = 'win';
            this.sfx('win');
            this.saveBest();
            this.showWin();
        } else {
            var keepBig = this.player.big;
            this.loadLevel(this.levelIndex + 1, true);
            this.player.big = false; // fresh small start feels fair
            if (keepBig) { this.score += 500; }
            this.state = 'playing';
            this.hideOverlay();
        }
    };

    BrowrioGame.prototype.die = function (fall) {
        if (this.state !== 'playing') return;
        this.state = 'dying';
        this.stateT = 0;
        this.sfx('death');
        this.player.deadV = fall ? 0 : -9;
    };

    BrowrioGame.prototype.finishDeath = function () {
        this.lives--;
        if (this.lives <= 0) {
            this.state = 'gameover';
            this.saveBest();
            this.showGameOver();
        } else {
            var big = false;
            this.loadLevel(this.levelIndex, true);
            this.player.big = big;
            this.state = 'playing';
        }
    };

    BrowrioGame.prototype.touchFlag = function () {
        if (this.state !== 'playing') return;
        this.state = 'flag';
        this.stateT = 0;
        this.sfx('flag');
        var bonus = 1000 + Math.floor(this.timeLeft) * 10 + this.levelIndex * 500;
        this.score += bonus;
        this.floatText(this.flag.x - 20, 3 * TILE, '+' + bonus);
        // celebration particles burst around the flag
        for (var i = 0; i < 30; i++) {
            this.particles.push({
                x: this.flag.x, y: 3 * TILE + 8,
                vx: (Math.random() - 0.5) * 6,
                vy: -Math.random() * 5 - 2,
                life: 1.5, grav: 0.18,
                color: ['#ffd94d', '#ff5c50', '#5ce07f', '#7d6bff', '#ffffff'][i % 5],
                size: 2 + Math.random() * 3, text: null
            });
        }
    };

    BrowrioGame.prototype.finishFlag = function () {
        this.state = 'levelclear';
        this.stateT = 0;
        this.saveBest();
        this.sfx('win');
        if (this.levelIndex + 1 >= LEVELS.length) {
            this.state = 'win';
            this.showWin();
        } else {
            this.showLevelClear();
        }
    };

    // ---------------- Physics ----------------
    BrowrioGame.prototype.moveAndCollide = function (ent, isPlayer) {
        // X axis
        ent.x += ent.vx;
        var top = ent.y + 2, bottom = ent.y + ent.h - 1;
        if (ent.vx > 0) {
            var rx = ent.x + ent.w;
            if (this.solidAt(rx, top) || this.solidAt(rx, ent.y + ent.h / 2) || this.solidAt(rx, bottom)) {
                var c = Math.floor(rx / TILE);
                ent.x = c * TILE - ent.w - 0.01;
                ent.vx = 0;
                if (!isPlayer) ent.turn = true;
            }
        } else if (ent.vx < 0) {
            var lx = ent.x;
            if (this.solidAt(lx, top) || this.solidAt(lx, ent.y + ent.h / 2) || this.solidAt(lx, bottom)) {
                var c2 = Math.floor(lx / TILE);
                ent.x = (c2 + 1) * TILE + 0.01;
                ent.vx = 0;
                if (!isPlayer) ent.turn = true;
            }
        }
        // Y axis
        ent.y += ent.vy;
        ent.onGround = false;
        if (ent.vy > 0) {
            var by = ent.y + ent.h;
            var hit = this.solidAt(ent.x + 2, by) || this.solidAt(ent.x + ent.w - 2, by) || this.solidAt(ent.x + ent.w / 2, by);
            if (hit) {
                var r = Math.floor(by / TILE);
                ent.y = r * TILE - ent.h - 0.01;
                ent.vy = 0;
                ent.onGround = true;
            }
        } else if (ent.vy < 0) {
            var hy = ent.y;
            var cx = ent.x + ent.w / 2;
            var t = this.tileOf(cx, hy);
            if (this.solidAt(ent.x + 2, hy) || this.solidAt(cx, hy) || this.solidAt(ent.x + ent.w - 2, hy)) {
                var r2 = Math.floor(hy / TILE);
                ent.y = (r2 + 1) * TILE + 0.01;
                ent.vy = 0;
                if (isPlayer && t && t.t) this.hitBlockFromBelow(t.c, t.r);
            }
        }
        ent.vy = Math.min(ent.vy + GRAV * 0.9, MAX_FALL);
    };

    BrowrioGame.prototype.hitBlockFromBelow = function (c, r) {
        var cell = this.grid[r][c];
        if (!cell) return;
        var cx = c * TILE + TILE / 2, topY = r * TILE;
        if (cell.type === 'qcoin') {
            this.grid[r][c] = { solid: true, type: 'used' };
            this.coins++; this.score += 100;
            this.sfx('coin');
            this.burst(cx, topY - 6, '#ffd94d', 10, 2.5);
            this.floatText(cx, topY - 14, '+100');
        } else if (cell.type === 'qmush') {
            this.grid[r][c] = { solid: true, type: 'used' };
            this.sfx('sprout');
            this.shrooms.push({ x: cx - 9, y: topY - 20, w: 18, h: 16, vx: 1.1, vy: -3, onGround: false });
        } else if (cell.type === 'brick') {
            if (this.player.big) {
                this.grid[r][c] = null;
                this.score += 50;
                this.sfx('break');
                this.burst(cx - 6, topY, '#c96b32', 8, 3);
                this.burst(cx + 6, topY, '#c96b32', 8, 3);
            } else {
                this.sfx('bump');
                this.burst(cx, topY, '#ffffff', 4, 1.2);
            }
        } else {
            this.sfx('bump');
        }
    };

    BrowrioGame.prototype.burst = function (x, y, color, n, spd) {
        for (var i = 0; i < n; i++) {
            this.particles.push({
                x: x, y: y,
                vx: (Math.random() - 0.5) * 2 * (spd || 2),
                vy: -Math.random() * (spd || 2) - 1,
                life: 1, color: color, size: 2 + Math.random() * 3, grav: 0.25, text: null
            });
        }
    };

    BrowrioGame.prototype.floatText = function (x, y, text) {
        this.particles.push({ x: x, y: y, vx: 0, vy: -0.8, life: 1, color: '#fff', size: 0, grav: 0, text: text });
    };

    BrowrioGame.prototype.updatePlayer = function (dt) {
        var p = this.player;
        var scale = dt / 16.667;
        var maxSpd = this.run() ? 4.1 : 2.6;
        var accel = p.onGround ? 0.45 : 0.28;
        if (this.left() && !this.right()) { p.vx = Math.max(p.vx - accel * scale, -maxSpd); p.dir = -1; }
        else if (this.right() && !this.left()) { p.vx = Math.min(p.vx + accel * scale, maxSpd); p.dir = 1; }
        else {
            var fr = p.onGround ? 0.4 * scale : 0.08 * scale;
            if (Math.abs(p.vx) <= fr) p.vx = 0; else p.vx -= Math.sign(p.vx) * fr;
        }
        // timers
        if (p.onGround) p.coyote = 0.1; else p.coyote -= dt / 1000;
        if (p.jumpBuf > 0) p.jumpBuf -= dt / 1000;
        if (p.jumpBuf > 0 && (p.onGround || p.coyote > 0)) {
            p.vy = -11.2;
            p.onGround = false; p.coyote = 0; p.jumpBuf = 0;
            p.squash = 1.25; p.stretch = 0.8;
            this.sfx('jump');
            this.burst(p.x + p.w / 2, p.y + p.h, '#ffffff', 5, 1.4);
        }
        if (!this.jumpHeld() && p.vy < -3.5) p.vy = -3.5; // extra safety for variable jump
        p.anim += Math.abs(p.vx) * 0.05 * scale;

        var wasAir = !p.onGround;
        this.moveAndCollide(p, true);
        // squash & stretch recovery + landing impact
        p.squash += (1 - p.squash) * 0.18;
        p.stretch += (1 - p.stretch) * 0.18;
        if (wasAir && p.onGround) { p.squash = 1.35; p.stretch = 0.7; this.burst(p.x + p.w/2, p.y + p.h, '#fff', 4, 1.2); }
        // bob: gentle idle breathing + running bob
        p.bob += (p.onGround ? 0 : 0.12) * scale;
        // blink
        p.blinkT -= dt / 1000;
        if (p.blinkT < 0) { p.blink = 0.18; if (p.blinkT < -0.05) { p.blink = 0; p.blinkT = 2 + Math.random() * 4; } }

        // fell in pit
        if (p.y > ROWS * TILE + 40) { this.die(true); return; }
        // flag touch — wide trigger window so the player doesn't need pixel-perfect contact
        var flagCol = this.flag.col;
        var poleLeft = flagCol * TILE;
        if (!this.flag.hit && p.x + p.w >= poleLeft && p.y + p.h > 3 * TILE) {
            this.flag.hit = true;
            this.touchFlag();
            return;
        }
        // clamp left
        if (p.x < 0) { p.x = 0; p.vx = 0; }
    };

    BrowrioGame.prototype.updateEnemies = function (dt) {
        var scale = dt / 16.667;
        var p = this.player;
        for (var i = 0; i < this.enemies.length; i++) {
            var e = this.enemies[i];
            if (!e.alive) continue;
            // cull far behind/ahead for perf
            if (Math.abs(e.x - p.x) > VIEW_W + 240) {
                // still apply nothing
                continue;
            }
            e.anim += 0.12 * scale;
            e.turn = false;
            // edge detection: turn if about to walk off and grounded
            var aheadX = e.vx < 0 ? e.x - 3 : e.x + e.w + 3;
            var footY = e.y + e.h + 4;
            e.vy = Math.min(e.vy + GRAV * 0.9, MAX_FALL);
            var oldVx = e.vx;
            this.moveAndCollide(e, false);
            if (e.turn) e.vx = -oldVx || (e.type === 'spiky' ? 0.8 : 0.55);
            // if vx got zeroed by wall but no turn flag edge case
            if (e.vx === 0) e.vx = oldVx < 0 ? Math.abs(oldVx) : -Math.abs(oldVx);
            if (e.onGround) {
                if (!this.solidAt(aheadX, footY)) e.vx = -e.vx;
            }
            // fell away
            if (e.y > ROWS * TILE + 80) { e.alive = false; continue; }
            // player interaction
            if (this.state !== 'playing') continue;
            var overlap = p.x < e.x + e.w - 3 && p.x + p.w > e.x + 3 && p.y < e.y + e.h && p.y + p.h > e.y + 2;
            if (!overlap) continue;
            var stomp = p.vy > 0.5 && (p.y + p.h - e.y) < 14;
            if (stomp && e.type === 'walker') {
                e.alive = false;
                p.vy = this.jumpHeld() ? -9.5 : -6.5;
                this.score += 200;
                this.sfx('stomp');
                this.burst(e.x + e.w / 2, e.y, '#ffffff', 10, 2.2);
                this.floatText(e.x + e.w / 2, e.y - 10, '+200');
            } else {
                // hurt
                if (p.big) {
                    p.big = false;
                    p.h = 16;
                    this.sfx('hurt');
                    p.vy = -7;
                    this.burst(p.x + p.w / 2, p.y + p.h / 2, '#ff5f57', 12, 2.5);
                } else {
                    this.die(false);
                    return;
                }
            }
        }
    };

    BrowrioGame.prototype.updateShrooms = function (dt) {
        var scale = dt / 16.667;
        var p = this.player;
        for (var i = this.shrooms.length - 1; i >= 0; i--) {
            var s = this.shrooms[i];
            s.vy = Math.min(s.vy + GRAV * 0.9, MAX_FALL);
            this.moveAndCollide(s, false);
            if (s.vx === 0) s.vx = 1.1;
            if (s.y > ROWS * TILE + 60) { this.shrooms.splice(i, 1); continue; }
            if (p.x < s.x + s.w && p.x + p.w > s.x && p.y < s.y + s.h && p.y + p.h > s.y) {
                this.shrooms.splice(i, 1);
                if (!p.big) {
                    p.big = true;
                    // grow: keep feet on ground, raise top
                    var newH = 30;
                    p.y = p.y + p.h - newH;
                    p.h = newH;
                    this.floatText(p.x + p.w / 2, p.y - 12, 'POWER UP!');
                }
                this.score += 500;
                this.sfx('power');
                this.burst(p.x + p.w / 2, p.y, '#ff8a5c', 12, 2.4);
            }
        }
    };

    BrowrioGame.prototype.updateCoins = function () {
        var p = this.player;
        for (var i = 0; i < this.coinList.length; i++) {
            var c = this.coinList[i];
            if (c.taken) continue;
            c.ph += 0.1;
            var dx = (p.x + p.w / 2) - c.x, dy = (p.y + p.h / 2) - c.y;
            if (Math.abs(dx) < 20 && Math.abs(dy) < 26) {
                c.taken = true;
                this.coins++; this.score += 100;
                this.sfx('coin');
                this.burst(c.x, c.y, '#ffd94d', 8, 2);
                this.floatText(c.x, c.y - 12, '+100');
            }
        }
    };

    BrowrioGame.prototype.updateParticles = function (dt) {
        var scale = dt / 16.667;
        for (var i = this.particles.length - 1; i >= 0; i--) {
            var q = this.particles[i];
            q.x += q.vx * scale; q.y += q.vy * scale;
            q.vy += (q.grav || 0) * scale;
            q.life -= 0.03 * scale;
            if (q.life <= 0) this.particles.splice(i, 1);
        }
    };

    BrowrioGame.prototype.update = function (dt) {
        this.animT += dt / 1000;
        if (this.state === 'playing') {
            this.updatePlayer(dt);
            if (this.state !== 'playing') return;
            this.updateEnemies(dt);
            if (this.state !== 'playing') return;
            this.updateShrooms(dt);
            this.updateCoins();
            this.updateParticles(dt);
            // timer
            this.timeAcc += dt;
            if (this.timeAcc >= 1000) {
                this.timeAcc -= 1000;
                this.timeLeft--;
                if (this.timeLeft <= 0) { this.timeLeft = 0; this.die(false); return; }
            }
            // camera
            var target = this.player.x + this.player.w / 2 - VIEW_W * 0.42;
            var maxCam = this.cols * TILE - VIEW_W;
            this.camX += (Math.max(0, Math.min(maxCam, target)) - this.camX) * 0.15;
        } else if (this.state === 'dying') {
            this.stateT += dt / 1000;
            this.player.deadV += 0.5;
            this.player.y += this.player.deadV * (dt / 16.667);
            this.player.deadSpin = (this.player.deadSpin || 0) + 0.18 * (dt / 16.667);
            this.updateParticles(dt);
            if (this.stateT > 1.6) this.finishDeath();
        } else if (this.state === 'flag') {
            this.stateT += dt / 1000;
            // slide down pole then auto-walk right briefly
            var baseY = 12 * TILE - this.player.h;
            if (this.player.y < baseY) { this.player.y = Math.min(baseY, this.player.y + 3 * (dt / 16.667)); }
            else { this.player.x += 1.6 * (dt / 16.667); }
            this.updateParticles(dt);
            if (this.stateT > 2.2) this.finishFlag();
        } else if (this.state === 'levelclear' || this.state === 'win') {
            this.stateT += dt / 1000;
            this.updateParticles(dt);
            // keep player onscreen walking off the right edge
            if (this.player) this.player.x += 1.0 * (dt / 16.667);
            // auto-advance after 6s if user does nothing
            if (this.stateT > 6.0) {
                if (this.state === 'win') this.restartAll();
                else this.nextLevel();
            }
        } else {
            this.updateParticles(dt);
        }
    };

    // ---------------- Best score (VFS) ----------------
    BrowrioGame.prototype.loadBest = function () {
        var self = this;
        try {
            if (window.filesystem && typeof window.filesystem.readFile === 'function') {
                window.filesystem.readFile('Desktop/BrowrioScores.txt').then(function (txt) {
                    if (!txt) return;
                    var m = /Best:\s*(\d+)/.exec(txt);
                    if (m) self.best = parseInt(m[1], 10) || 0;
                }).catch(function () {});
            }
        } catch (e) {}
    };

    BrowrioGame.prototype.saveBest = function () {
        try {
            var finalScore = Math.max(this.best, this.score);
            this.best = finalScore;
            if (window.filesystem && typeof window.filesystem.createFile === 'function') {
                var line = 'Browrio Run - Best: ' + finalScore + '  Coins: ' + this.coins +
                    '  Level: ' + (this.levelIndex + 1) + '/' + LEVELS.length +
                    '  Score: ' + this.score + '  ' + new Date().toLocaleString() + '\n';
                window.filesystem.createFile('Desktop/BrowrioScores.txt', line).catch(function () {});
            }
        } catch (e) {}
    };

    // ---------------- Overlays ----------------
    BrowrioGame.prototype.show = function (title, msg, btn, btnVisible) {
        this.titleEl.textContent = title;
        this.msgEl.innerHTML = msg;
        this.startBtn.textContent = btn;
        this.startBtn.style.display = btnVisible === false ? 'none' : '';
        this.overlay.style.display = 'flex';
        this._overlayShownT = this.animT || 0;
    };
    BrowrioGame.prototype.hideOverlay = function () { this.overlay.style.display = 'none'; };
    BrowrioGame.prototype.showPause = function () {
        this.show('PAUSED', 'Take a breather.<br><br>Arrows/AD move · Space jump · Shift run · P resume', 'RESUME', true);
    };

    BrowrioGame.prototype.showGameOver = function () {
        this.show('GAME OVER',
            'Score: <b>' + this.score + '</b> · Coins: <b>' + this.coins + '</b> · Best: <b>' + this.best + '</b><br><br>Press Enter or hit retry.',
            'TRY AGAIN', true);
    };

    BrowrioGame.prototype.showLevelClear = function () {
        var nxt = LEVELS[this.levelIndex + 1];
        var pct = Math.floor(((this.levelIndex + 1) / LEVELS.length) * 100);
        var newRecord = this.score > this.best;
        var bonus = 1000 + Math.floor(this.timeLeft) * 10 + this.levelIndex * 500;
        this.show('★ LEVEL CLEAR ★',
            '<div style="display:flex;justify-content:space-between;align-items:center;gap:14px;background:rgba(255,255,255,0.06);padding:12px 16px;border-radius:10px;border:1px solid rgba(255,217,77,0.35);margin-bottom:8px;">' +
                '<div style="text-align:left;">' +
                    '<div style="color:#a8c8ff;font-size:11px;letter-spacing:1px;">SCORE</div>' +
                    '<div style="color:#ffd94d;font-size:22px;font-weight:bold;text-shadow:1px 1px 0 #b11d10;">' + this.score + '</div>' +
                '</div>' +
                '<div style="text-align:center;">' +
                    '<div style="color:#a8c8ff;font-size:11px;letter-spacing:1px;">WORLD</div>' +
                    '<div style="color:#fff;font-size:18px;font-weight:bold;">' + (this.levelIndex + 1) + ' / ' + LEVELS.length + '</div>' +
                '</div>' +
                '<div style="text-align:right;">' +
                    '<div style="color:#a8c8ff;font-size:11px;letter-spacing:1px;">TIME BONUS</div>' +
                    '<div style="color:#7df0a0;font-size:18px;font-weight:bold;">+' + bonus + '</div>' +
                '</div>' +
            '</div>' +
            '<div style="color:#cfe0ff;margin:6px 0 4px;">Next: <b style="color:#fff;">' + nxt.name + '</b></div>' +
            '<div style="color:#9aa6bf;font-size:11px;margin-bottom:6px;">' + nxt.sub + '</div>' +
            '<div style="height:6px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden;margin-bottom:6px;">' +
                '<div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,#46c24a,#ffd94d,#e23b2b);"></div>' +
            '</div>' +
            '<div style="color:#7df0a0;font-size:11px;margin-bottom:4px;">Progress: ' + pct + '%</div>' +
            (newRecord ? '<div style="color:#ff6b5c;font-weight:bold;margin-top:4px;text-shadow:0 0 6px #ff6b5c;">NEW BEST SCORE!</div>' : ''),
            'NEXT LEVEL ▶', true);
    };

    BrowrioGame.prototype.showWin = function () {
        this.show('🏆 YOU WIN! 🏆',
            '<div style="background:linear-gradient(135deg,rgba(255,217,77,0.18),rgba(227,62,43,0.18));padding:14px;border-radius:10px;border:2px solid #ffd94d;margin-bottom:8px;">' +
                '<div style="color:#a8c8ff;font-size:11px;letter-spacing:2px;margin-bottom:4px;">FINAL TALLY</div>' +
                '<div style="color:#ffd94d;font-size:26px;font-weight:bold;text-shadow:2px 2px 0 #b11d10;">' + this.score + '</div>' +
                '<div style="color:#cfe0ff;font-size:12px;margin-top:6px;">Coins: <b style="color:#ffd94d;">' + this.coins + '</b> · Best: <b style="color:#ffd94d;">' + this.best + '</b></div>' +
            '</div>' +
            '<div style="color:#9aa6bf;font-size:12px;line-height:1.6;margin-bottom:4px;">You cleared all <b style="color:#fff;">' + LEVELS.length + ' levels</b> across <b style="color:#fff;">3 worlds</b>!</div>' +
            '<div style="color:#7df0a0;font-size:11px;margin-top:4px;">✓ Saved to Desktop/BrowrioScores.txt</div>',
            'PLAY AGAIN ↺', true);
    };

    // ---------------- Loop ----------------
    BrowrioGame.prototype.loop = function (t) {
        // stop if window closed (same pattern as starship.js)
        if (!document.body.contains(this.canvas)) { this.destroy(); return; }
        var dt = t - this.lastT;
        this.lastT = t;
        if (dt > 50) dt = 50;
        if (this.state !== 'paused' && this.state !== 'menu') this.update(dt);
        else if (this.state === 'menu') { this.animT += dt / 1000; }
        this.draw();
        this.raf = requestAnimationFrame(this._frame);
    };

    BrowrioGame.prototype.destroy = function () {
        try { cancelAnimationFrame(this.raf); } catch (e) {}
        try { window.removeEventListener('keydown', this._kd); } catch (e) {}
        try { window.removeEventListener('keyup', this._ku); } catch (e) {}
        try { window.removeEventListener('blur', this._blur); } catch (e) {}
        try { this.startBtn.removeEventListener('click', this._start); } catch (e) {}
        try { this.canvas.removeEventListener('click', this._focus); } catch (e) {}
        try { this._host.removeEventListener('window-closing', this._closing); } catch (e) {}
        try { if (this.audio && typeof this.audio.close === 'function') this.audio.close(); } catch (e) {}
        this.audio = null;
    };

    // ---------------- Drawing ----------------
    BrowrioGame.prototype.skyColors = function () {
        if (this.def.sky === 1) return { top: '#0b1026', bot: '#1c2b52', hill: '#141c3a', hill2: '#10162e', cloud: 'rgba(255,255,255,0.10)' };
        if (this.def.sky === 2) return { top: '#2b1a4d', bot: '#ff9a5c', hill: '#3a2560', hill2: '#2e1d4e', cloud: 'rgba(255,255,255,0.35)' };
        return { top: '#5aa9ff', bot: '#bfe6ff', hill: '#5fbf6a', hill2: '#4aa855', cloud: 'rgba(255,255,255,0.9)' };
    };

    BrowrioGame.prototype.draw = function () {
        var ctx = this.ctx, sky = this.skyColors();
        var g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
        g.addColorStop(0, sky.top); g.addColorStop(1, sky.bot);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);

        // parallax hills + clouds / stars
        ctx.save();
        ctx.translate(-Math.floor(this.camX * 0.3) % 400, 0);
        ctx.fillStyle = sky.hill2;
        for (var hx = -400; hx < VIEW_W + 400; hx += 200) {
            ctx.beginPath(); ctx.moveTo(hx, 300); ctx.lineTo(hx + 70, 220); ctx.lineTo(hx + 140, 300); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
        ctx.save();
        ctx.translate(-Math.floor(this.camX * 0.55) % 320, 0);
        if (this.def.sky === 1) {
            ctx.fillStyle = '#fff';
            for (var sx = 0; sx < VIEW_W + 320; sx += 47) {
                var sy = (sx * 37) % 180 + 10;
                ctx.fillRect(sx - (0), sy, 2, 2);
            }
        } else {
            ctx.fillStyle = sky.cloud;
            for (var cx = -320; cx < VIEW_W + 320; cx += 160) {
                var cy = 40 + ((cx * 53) % 90 + 90) % 90;
                ctx.fillRect(cx, cy, 60, 14); ctx.fillRect(cx + 12, cy - 10, 36, 12);
            }
        }
        ctx.restore();

        var c0 = Math.max(0, Math.floor(this.camX / TILE) - 1);
        var c1 = Math.min(this.cols - 1, Math.ceil((this.camX + VIEW_W) / TILE) + 1);

        // tiles
        for (var r = 0; r < ROWS; r++) {
            for (var c = c0; c <= c1; c++) {
                var t = this.grid[r][c];
                if (!t) continue;
                this.drawTile(c * TILE - this.camX, r * TILE, t.type, r, c);
            }
        }
        // flag
        this.drawFlag();
        // coins
        for (var i = 0; i < this.coinList.length; i++) {
            var k = this.coinList[i];
            if (k.taken) continue;
            var kx = k.x - this.camX;
            if (kx < -30 || kx > VIEW_W + 30) continue;
            this.drawCoin(kx, k.y + Math.sin(k.ph) * 2);
        }
        // mushrooms
        for (var m = 0; m < this.shrooms.length; m++) {
            var s = this.shrooms[m];
            this.drawShroom(s.x - this.camX, s.y);
        }
        // enemies
        for (var e = 0; e < this.enemies.length; e++) {
            var en = this.enemies[e];
            if (!en.alive) continue;
            var ex = en.x - this.camX;
            if (ex < -60 || ex > VIEW_W + 60) continue;
            if (en.type === 'spiky') this.drawSpiky(ex, en.y, en.anim);
            else this.drawWalker(ex, en.y, en.anim);
        }
        // player
        if (this.state !== 'menu') this.drawPlayer(this.player.x - this.camX, this.player.y);
        // particles
        for (var q = 0; q < this.particles.length; q++) {
            var pt = this.particles[q];
            if (pt.text) {
                ctx.globalAlpha = Math.max(0, pt.life);
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 12px monospace';
                ctx.textAlign = 'center';
                ctx.fillText(pt.text, pt.x - this.camX, pt.y);
                ctx.globalAlpha = 1;
            } else {
                ctx.globalAlpha = Math.max(0, pt.life);
                ctx.fillStyle = pt.color;
                ctx.fillRect(pt.x - this.camX, pt.y, pt.size, pt.size);
                ctx.globalAlpha = 1;
            }
        }
        this.drawHUD();
    };

    BrowrioGame.prototype.drawTile = function (x, y, type, r, c) {
        var ctx = this.ctx;
        if (type === 'ground') {
            // body
            var gg = ctx.createLinearGradient(0, y, 0, y + TILE);
            gg.addColorStop(0, '#b46631'); gg.addColorStop(1, '#7a3a14');
            ctx.fillStyle = gg;
            ctx.fillRect(x, y, TILE, TILE);
            // top crust
            var above = r > 0 ? this.grid[r - 1][c] : null;
            if (!above) {
                var cg = ctx.createLinearGradient(0, y, 0, y + 7);
                cg.addColorStop(0, '#6ee070'); cg.addColorStop(1, '#2f9e33');
                ctx.fillStyle = cg;
                ctx.fillRect(x, y, TILE, 7);
                // grass blades
                ctx.fillStyle = '#205a20';
                for (var i = 0; i < TILE; i += 5) ctx.fillRect(x + i, y + 7, 2, 3);
            }
            // subtle bottom shadow
            ctx.fillStyle = 'rgba(0,0,0,0.18)';
            ctx.fillRect(x, y + TILE - 3, TILE, 3);
        } else if (type === 'brick') {
            // body with gradient
            var bg = ctx.createLinearGradient(0, y, 0, y + TILE);
            bg.addColorStop(0, '#e08a4a'); bg.addColorStop(1, '#9a4a1a');
            ctx.fillStyle = bg;
            roundRect(ctx, x, y, TILE, TILE, 2); ctx.fill();
            // mortar lines
            ctx.strokeStyle = '#5a2a08';
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(x, y + 8); ctx.lineTo(x + TILE, y + 8);
            ctx.moveTo(x, y + 16); ctx.lineTo(x + TILE, y + 16);
            ctx.moveTo(x + 12, y); ctx.lineTo(x + 12, y + 8);
            ctx.moveTo(x + 6, y + 8); ctx.lineTo(x + 6, y + 16);
            ctx.moveTo(x + 18, y + 8); ctx.lineTo(x + 18, y + 16);
            ctx.moveTo(x + 12, y + 16); ctx.lineTo(x + 12, y + TILE);
            ctx.stroke();
            // top highlight
            ctx.fillStyle = 'rgba(255,210,160,0.4)';
            ctx.fillRect(x + 1, y + 0.5, TILE - 2, 1.5);
        } else if (type === 'qcoin' || type === 'qmush') {
            var blink = Math.floor(this.animT * 4) % 2 === 0;
            // body
            var qg = ctx.createLinearGradient(0, y, 0, y + TILE);
            qg.addColorStop(0, blink ? '#ffce3a' : '#e09a12');
            qg.addColorStop(1, blink ? '#d68a00' : '#9a6000');
            ctx.fillStyle = qg;
            roundRect(ctx, x + 1, y + 1, TILE - 2, TILE - 2, 4); ctx.fill();
            // rivets
            ctx.fillStyle = '#7a4a00';
            ctx.beginPath(); ctx.arc(x + 4, y + 4, 1, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(x + TILE - 4, y + 4, 1, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(x + 4, y + TILE - 4, 1, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(x + TILE - 4, y + TILE - 4, 1, 0, Math.PI * 2); ctx.fill();
            // icon
            ctx.fillStyle = '#fff3c4';
            ctx.font = 'bold 15px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(type === 'qcoin' ? '?' : 'M', x + TILE / 2, y + TILE / 2 + 1);
        } else if (type === 'used') {
            ctx.fillStyle = '#7a5230';
            roundRect(ctx, x, y, TILE, TILE, 2); ctx.fill();
            ctx.fillStyle = '#5a3a20';
            ctx.fillRect(x, y, TILE, 2); ctx.fillRect(x, y + TILE - 2, TILE, 2);
        } else if (type === 'solid' || type === 'stair') {
            // stone block, gradient
            var sg = ctx.createLinearGradient(0, y, 0, y + TILE);
            sg.addColorStop(0, '#c9cee0'); sg.addColorStop(1, '#7a8094');
            ctx.fillStyle = sg;
            roundRect(ctx, x, y, TILE, TILE, 2); ctx.fill();
            // dark border
            ctx.strokeStyle = '#4a5060';
            ctx.lineWidth = 0.7;
            roundRect(ctx, x + 0.5, y + 0.5, TILE - 1, TILE - 1, 2); ctx.stroke();
            // highlight
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.fillRect(x + 2, y + 2, TILE - 4, 2);
            // speckles
            ctx.fillStyle = '#9aa0b4';
            ctx.beginPath(); ctx.arc(x + 6, y + 8, 1, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(x + 16, y + 16, 1, 0, Math.PI * 2); ctx.fill();
        } else if (type === 'platform') {
            // wooden platform
            var pg = ctx.createLinearGradient(0, y, 0, y + 12);
            pg.addColorStop(0, '#d4925a'); pg.addColorStop(1, '#9a5a20');
            ctx.fillStyle = pg;
            roundRect(ctx, x, y, TILE, 12, 2); ctx.fill();
            ctx.fillStyle = '#7c4f1e';
            ctx.fillRect(x, y + 9, TILE, 3);
            // wood grain
            ctx.strokeStyle = '#5a3a17';
            ctx.lineWidth = 0.5;
            ctx.beginPath(); ctx.moveTo(x + 4, y + 3); ctx.lineTo(x + TILE - 4, y + 3); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x + 4, y + 6); ctx.lineTo(x + TILE - 4, y + 6); ctx.stroke();
            // supports
            ctx.fillStyle = '#7a4a1a';
            ctx.fillRect(x + 3, y + 12, 3, TILE - 12);
            ctx.fillRect(x + TILE - 6, y + 12, 3, TILE - 12);
        } else if (type === 'pipe-tl' || type === 'pipe-tr' || type === 'pipe-bl' || type === 'pipe-br') {
            var isTop = (type === 'pipe-tl' || type === 'pipe-tr');
            // body
            var pig = ctx.createLinearGradient(x, y, x + TILE, y);
            pig.addColorStop(0, '#5ce07f');
            pig.addColorStop(0.5, '#2fae4e');
            pig.addColorStop(1, '#1c7a34');
            ctx.fillStyle = pig;
            ctx.fillRect(x, y, TILE, TILE);
            // rim shine
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.fillRect(x + 2, y, 1.5, TILE);
            // dark right
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.fillRect(x + TILE - 4, y, 4, TILE);
            if (isTop) {
                ctx.fillStyle = '#2fae4e';
                roundRect(ctx, x - (type === 'pipe-tl' ? 3 : 0), y, TILE + 3, 6, 1.5); ctx.fill();
                ctx.fillStyle = '#1c7a34';
                ctx.fillRect(x - (type === 'pipe-tl' ? 3 : 0), y + 5, TILE + 3, 2);
                ctx.fillStyle = 'rgba(255,255,255,0.25)';
                ctx.fillRect(x - (type === 'pipe-tl' ? 3 : 0), y, TILE + 3, 1.5);
            }
        } else if (type === 'pole') {
            ctx.fillStyle = '#2f9e44';
            ctx.fillRect(x + TILE / 2 - 3, y, 6, TILE);
            ctx.fillStyle = '#5ce07f';
            ctx.fillRect(x + TILE / 2 - 3, y, 2, TILE);
        } else if (type === 'flag-top') {
            ctx.fillStyle = '#2f9e44';
            ctx.fillRect(x + TILE / 2 - 3, y, 6, TILE);
            ctx.fillStyle = '#ffd94d';
            ctx.beginPath(); ctx.arc(x + TILE / 2, y + 6, 5, 0, Math.PI * 2); ctx.fill();
        }
    };

    BrowrioGame.prototype.drawFlag = function () {
        var ctx = this.ctx;
        var fx = this.flag.x - this.camX;
        if (fx < -80 || fx > VIEW_W + 80) return;
        // pole
        ctx.fillStyle = '#2f9e44';
        ctx.beginPath();
        roundRectShape(ctx, fx - 2, 3 * TILE + 6, 4, 9 * TILE, 2);
        ctx.fill();
        ctx.fillStyle = '#5ce07f';
        ctx.fillRect(fx - 1, 3 * TILE + 6, 1.5, 9 * TILE);
        // ball on top
        var bg = ctx.createRadialGradient(fx - 0.5, 3 * TILE + 5, 0.4, fx, 3 * TILE + 6, 4);
        bg.addColorStop(0, '#fff0a5'); bg.addColorStop(1, '#d6a800');
        ctx.fillStyle = bg;
        ctx.beginPath(); ctx.arc(fx, 3 * TILE + 6, 4, 0, Math.PI * 2); ctx.fill();
        // waving flag (smooth gradient)
        var wave = Math.sin(this.animT * 6) * 3;
        var fg = ctx.createLinearGradient(fx, 3 * TILE + 10, fx - 44, 3 * TILE + 30);
        fg.addColorStop(0, '#ff5c50'); fg.addColorStop(1, '#c4231a');
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.moveTo(fx, 3 * TILE + 10);
        ctx.quadraticCurveTo(fx - 22, 3 * TILE + 8 + wave, fx - 44, 3 * TILE + 18 + wave);
        ctx.lineTo(fx, 3 * TILE + 30);
        ctx.closePath(); ctx.fill();
        // shine
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.moveTo(fx - 2, 3 * TILE + 12);
        ctx.lineTo(fx - 22, 3 * TILE + 14 + wave);
        ctx.lineTo(fx - 6, 3 * TILE + 22);
        ctx.closePath(); ctx.fill();
        // label
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
        ctx.fillText('GOAL', fx - 22, 3 * TILE + 22 + wave * 0.4);
    };

    BrowrioGame.prototype.drawCoin = function (x, y) {
        var ctx = this.ctx;
        var w = Math.abs(Math.cos(this.animT * 5)) * 4 + 3;
        // glow
        var g = ctx.createRadialGradient(x, y, 0, x, y, 9);
        g.addColorStop(0, 'rgba(255,236,150,0.55)');
        g.addColorStop(1, 'rgba(255,236,150,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
        // outer ring
        ctx.fillStyle = '#a8740a';
        ctx.beginPath();
        ctx.ellipse(x, y, w + 1.2, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        // face
        var cg = ctx.createLinearGradient(0, y - 7, 0, y + 7);
        cg.addColorStop(0, '#ffe066'); cg.addColorStop(1, '#d6a800');
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.ellipse(x, y, Math.max(1, w), 6, 0, 0, Math.PI * 2);
        ctx.fill();
        // highlight
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        ctx.ellipse(x - 1, y - 2, Math.max(0.5, w - 2), 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
        // $ mark
        ctx.fillStyle = '#7a4a00';
        ctx.font = 'bold 7px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('$', x, y + 0.5);
    };

    BrowrioGame.prototype.drawShroom = function (x, y) {
        var ctx = this.ctx;
        // cap (red, gradient)
        var g = ctx.createRadialGradient(x + 6, y + 2, 1, x + 9, y + 4, 12);
        g.addColorStop(0, '#ff9a8a'); g.addColorStop(1, '#c4231a');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x + 9, y + 4, 9, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        // spots
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(x + 4, y + 3, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 13, y + 3, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 9, y + 2, 1.2, 0, Math.PI * 2); ctx.fill();
        // stem
        ctx.fillStyle = '#ffe0c2';
        ctx.beginPath();
        roundRectShape(ctx, x + 2, y + 7, 14, 8, 2.5);
        ctx.fill();
        ctx.fillStyle = '#c69a6a';
        ctx.fillRect(x + 2, y + 13, 14, 2);
        // eyes
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath(); ctx.arc(x + 6, y + 11, 0.9, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 12, y + 11, 0.9, 0, Math.PI * 2); ctx.fill();
    };

    BrowrioGame.prototype.drawWalker = function (x, y, anim) {
        var ctx = this.ctx;
        var step = (Math.floor(anim) % 2 === 0) ? 1 : -1;
        // shadow
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.beginPath(); ctx.ellipse(x + 10, y + 20, 8, 2.4, 0, 0, Math.PI * 2); ctx.fill();
        // body (mushroom cap, gradient)
        var g = ctx.createLinearGradient(0, y, 0, y + 14);
        g.addColorStop(0, '#c66a2c'); g.addColorStop(1, '#8a4b1f');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x + 10, y + 6, 10, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        // cap highlight
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.beginPath();
        ctx.ellipse(x + 7, y + 4, 4, 2, -0.4, 0, Math.PI * 2);
        ctx.fill();
        // body stem
        ctx.fillStyle = '#f0d6a8';
        ctx.beginPath();
        roundRectShape(ctx, x + 4, y + 9, 12, 7, 2);
        ctx.fill();
        ctx.fillStyle = '#c79a64';
        ctx.fillRect(x + 4, y + 14, 12, 2);
        // feet
        ctx.fillStyle = '#3a1d08';
        ctx.beginPath();
        ctx.ellipse(x + 5 + step, y + 18, 3.2, 1.8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x + 13 - step, y + 18, 3.2, 1.8, 0, 0, Math.PI * 2);
        ctx.fill();
        // angry eyes
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(x + 6, y + 6, 1.8, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 12, y + 6, 1.8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(x + 7, y + 6.5, 0.9, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 13, y + 6.5, 0.9, 0, Math.PI * 2); ctx.fill();
        // angry brows
        ctx.strokeStyle = '#3a1a08';
        ctx.lineWidth = 0.9; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x + 4, y + 3.5); ctx.lineTo(x + 8, y + 5);
        ctx.moveTo(x + 16, y + 3.5); ctx.lineTo(x + 12, y + 5);
        ctx.stroke();
    };

    BrowrioGame.prototype.drawSpiky = function (x, y, anim) {
        var ctx = this.ctx;
        var bob = Math.sin(anim * 0.8) * 1.2;
        y += bob;
        // shadow
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.beginPath(); ctx.ellipse(x + 10, y + 20, 8, 2.4, 0, 0, Math.PI * 2); ctx.fill();
        // body (radial red)
        var g = ctx.createRadialGradient(x + 7, y + 6, 1, x + 10, y + 10, 12);
        g.addColorStop(0, '#ff7060'); g.addColorStop(1, '#a01a14');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x + 10, y + 11, 10, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        // spikes (polygon)
        ctx.fillStyle = '#ffd0c8';
        ctx.beginPath();
        ctx.moveTo(x + 1, y + 11);
        ctx.lineTo(x + 5, y + 1);
        ctx.lineTo(x + 9, y + 11);
        ctx.lineTo(x + 13, y + 1);
        ctx.lineTo(x + 17, y + 11);
        ctx.lineTo(x + 20, y + 6);
        ctx.lineTo(x + 17, y + 11);
        ctx.closePath();
        ctx.fill();
        // eyes (danger)
        ctx.fillStyle = '#fff5e6';
        ctx.beginPath(); ctx.arc(x + 6, y + 12, 1.4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 12, y + 12, 1.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath(); ctx.arc(x + 6, y + 12, 0.7, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 12, y + 12, 0.7, 0, Math.PI * 2); ctx.fill();
    };

    // ---------------------------------------------------------------
    // Browrio sprite — hand-drawn pixel plumber, original art
    // small: 16w x 16h cell | big: 16w x 32h cell
    // ---------------------------------------------------------------
    // tiny pixel helper
    BrowrioGame.prototype.px = function (ctx, x, y, c, w, h) {
        if (!c) return; ctx.fillStyle = c;
        ctx.fillRect(x | 0, y | 0, w || 1, h || 1);
    };

    // return state for current frame
    BrowrioGame.prototype.playerState = function () {
        var p = this.player;
        if (this.state === 'dying') return 'die';
        if (this.state === 'flag') return 'flag';
        if (!p.onGround) return p.vy < 0 ? 'jump' : 'fall';
        // grounded
        var moving = Math.abs(p.vx) > 0.25;
        var running = Math.abs(p.vx) > 2.6;
        // skid = quick direction change while moving
        if (moving && ((p.vx > 0.3 && this.left()) || (p.vx < -0.3 && this.right()))) return 'skid';
        if (running) return 'run';
        if (moving) return 'walk';
        return 'idle';
    };

    // draw one small 16x16 frame
    // cx,cy = top-left on screen; dir = 1 or -1; big = scale 2x
    BrowrioGame.prototype.drawBrowrioFrame = function (cx, cy, dir, big, state, t, blink) {
        var ctx = this.ctx;
        ctx.save();
        var S = big ? 2 : 1;
        if (S > 1) { ctx.translate(cx + 8, cy + 8); ctx.scale(S, S); ctx.translate(-(cx + 8), -(cy + 8)); }
        if (dir === -1) { ctx.translate(cx + 16, 0); ctx.scale(-1, 1); cx = 0; }

        // ---- PALETTE (warm + bold, with shades) ----
        var SKIN = '#ffd1a4', SKIN_S = '#e7a87a', SKIN_H = '#a86b3a', SKIN_O = '#7a4a20';
        var HAT = '#e23b2b', HAT_S = '#a11d10', HAT_H = '#ff6b5c', HAT_D = '#6a0a05';
        var OVER = '#2664d6', OVER_S = '#0d3a99', OVER_B = '#1c4ea8', OVER_L = '#5e8df0';
        var SHIRT = '#d83a31', SHIRT_S = '#a0231c', SHIRT_H = '#ff6b5c';
        var SHOE = '#5a2a14', SHOE_S = '#3a1a08', SHOE_L = '#9a5a30';
        var YEL = '#ffc23a', YEL_S = '#cc8a14', YEL_L = '#fff0a5';
        var WHT = '#ffffff', CREAM = '#fff3c4', BLK = '#1a1a1a', BROW = '#3a2a18', BROW_S = '#5a3a20';
        var GRN = '#3a8e3a', GRN_S = '#205a20';

        // ---- Animation phases ----
        var t8 = ((t * 8) | 0);
        var runCycle = ((t * 14) | 0);
        var idleBreath = state === 'idle' ? Math.sin(t * 2.4) * 0.4 : 0;
        var runBob = (state === 'run' || state === 'walk') ? Math.abs(Math.sin(t * (state === 'run' ? 18 : 10))) * 0.8 : 0;

        // Shadow under feet (grounded-ish)
        var onGround = (state === 'idle' || state === 'walk' || state === 'run' || state === 'skid');
        var groundY = cy + 16;

        // === LEGS / SHOES (drawn first so body covers tops) ===
        var shoeFront = false;
        var stepX = 0, stepY = 0;
        if (state === 'walk' || state === 'run') {
            var cyc = (state === 'run' ? runCycle : t8) % 4;
            // 0=neutral, 1=L forward, 2=neutral, 3=R forward
            if (cyc === 1) { stepX = 1.4; stepY = 1; }
            else if (cyc === 3) { stepX = -1.4; stepY = 1; }
        } else if (state === 'jump' || state === 'fall') {
            stepX = 0; stepY = 0; // tucked
        } else if (state === 'skid') {
            stepX = -dir * 1.5; stepY = 0;
        } else {
            // idle: subtle weight shift
            stepX = Math.sin(t * 1.2) * 0.4; stepY = 0;
        }

        // helper to draw a shoe blob
        function drawShoe(px, py, flipped) {
            ctx.fillStyle = SHOE;
            ctx.beginPath();
            var r = 1.8;
            if (flipped) {
                ctx.ellipse(px, py, 3, 1.8, 0, 0, Math.PI * 2);
            } else {
                ctx.ellipse(px, py, 2.6, 1.6, 0, 0, Math.PI * 2);
            }
            ctx.fill();
            // highlight
            ctx.fillStyle = SHOE_L;
            ctx.beginPath();
            ctx.ellipse(px - 0.5, py - 0.7, 1.1, 0.6, 0, 0, Math.PI * 2);
            ctx.fill();
            // sole
            ctx.fillStyle = SHOE_S;
            ctx.beginPath();
            ctx.ellipse(px, py + 0.9, 2.4, 0.5, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        // pants/legs (overalls color)
        function drawLeg(px, py, w, h) {
            ctx.fillStyle = OVER;
            roundRect(ctx, px - w / 2, py - h, w, h, 1.2);
            ctx.fill();
            // shadow on inside
            ctx.fillStyle = OVER_S;
            ctx.fillRect(px - w / 2 + w - 1.2, py - h, 1.2, h);
        }
        var lLegX = cx + 7 + stepX, rLegX = cx + 9 - stepX;
        var lLegY = groundY - 1.2, rLegY = groundY - 1.2;
        // back leg first (so front leg overlaps when walking)
        if (state === 'walk' || state === 'run') {
            var cyc2 = (state === 'run' ? runCycle : t8) % 4;
            if (cyc2 === 1) {
                drawLeg(rLegX, rLegY, 2.6, 3.2);
                drawLeg(lLegX, lLegY, 2.6, 3.2);
                drawShoe(lLegX, lLegY + 0.4, true);
                drawShoe(rLegX, rLegY + 0.4, false);
            } else if (cyc2 === 3) {
                drawLeg(lLegX, lLegY, 2.6, 3.2);
                drawLeg(rLegX, rLegY, 2.6, 3.2);
                drawShoe(rLegX, rLegY + 0.4, true);
                drawShoe(lLegX, lLegY + 0.4, false);
            } else {
                drawLeg(lLegX, lLegY, 2.6, 3.2);
                drawLeg(rLegX, rLegY, 2.6, 3.2);
                drawShoe(lLegX, lLegY + 0.4, false);
                drawShoe(rLegX, rLegY + 0.4, false);
            }
        } else if (state === 'jump' || state === 'fall') {
            // tucked back
            var tuckY = 1.0;
            drawLeg(lLegX, lLegY - tuckY, 2.6, 3.0);
            drawLeg(rLegX, rLegY - tuckY, 2.6, 3.0);
            drawShoe(lLegX, lLegY - tuckY + 0.4, true);
            drawShoe(rLegX, rLegY - tuckY + 0.4, true);
        } else {
            drawLeg(lLegX, lLegY, 2.6, 3.2);
            drawLeg(rLegX, rLegY, 2.6, 3.2);
            drawShoe(lLegX, lLegY + 0.4, false);
            drawShoe(rLegX, rLegY + 0.4, false);
        }

        // === BODY (overalls) ===
        var yOff = idleBreath - runBob * 0.4;
        var bodyTop = cy + 6 + yOff;
        var bodyH = 8.5;
        // overalls main shape (rounded shoulders)
        ctx.fillStyle = OVER;
        ctx.beginPath();
        roundRect(ctx, cx + 4.2, bodyTop, 7.6, bodyH, 1.5);
        ctx.fill();
        // overalls highlight (left)
        ctx.fillStyle = OVER_L;
        ctx.beginPath();
        roundRect(ctx, cx + 4.4, bodyTop + 0.3, 1.2, bodyH - 0.6, 0.6);
        ctx.fill();
        // overalls shadow (right)
        ctx.fillStyle = OVER_S;
        ctx.beginPath();
        roundRect(ctx, cx + 10.6, bodyTop + 0.3, 1.2, bodyH - 0.6, 0.6);
        ctx.fill();
        // belt (yellow)
        ctx.fillStyle = YEL;
        ctx.fillRect(cx + 4.2, bodyTop + 5.6, 7.6, 1.1);
        ctx.fillStyle = YEL_L;
        ctx.fillRect(cx + 4.2, bodyTop + 5.6, 7.6, 0.4);
        // belt buckle
        ctx.fillStyle = YEL_S;
        ctx.fillRect(cx + 7.5, bodyTop + 5.5, 1, 1.3);
        // chest buttons
        ctx.fillStyle = YEL;
        ctx.beginPath(); ctx.arc(cx + 5.5, bodyTop + 1.6, 0.55, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 10.5, bodyTop + 1.6, 0.55, 0, Math.PI * 2); ctx.fill();
        // shirt collar under cap
        ctx.fillStyle = SHIRT;
        ctx.beginPath();
        roundRect(ctx, cx + 5, bodyTop - 1.2, 6, 1.6, 0.6);
        ctx.fill();
        ctx.fillStyle = SHIRT_S;
        ctx.fillRect(cx + 5, bodyTop - 0.1, 6, 0.5);
        // overalls straps into shirt
        ctx.fillStyle = OVER_S;
        ctx.fillRect(cx + 5.5, bodyTop - 0.4, 1.4, 1.2);
        ctx.fillRect(cx + 9.1, bodyTop - 0.4, 1.4, 1.2);

        // === ARMS / GLOVES ===
        var armY = bodyTop + 1.2;
        if (state === 'run' || state === 'walk') {
            var armPh = (state === 'run' ? runCycle : t8) % 4;
            // opposite to legs
            if (armPh === 1) {
                // left arm back, right arm forward
                drawArm(cx + 3.4, armY + 1, 0.5);
                drawArm(cx + 12.6, armY - 0.5, -0.5);
            } else if (armPh === 3) {
                drawArm(cx + 3.4, armY - 0.5, -0.5);
                drawArm(cx + 12.6, armY + 1, 0.5);
            } else {
                drawArm(cx + 3.4, armY + 0.4, 0);
                drawArm(cx + 12.6, armY + 0.4, 0);
            }
        } else if (state === 'jump' || state === 'fall') {
            // arms out a bit
            drawArm(cx + 3.0, armY - 0.5, 0.3);
            drawArm(cx + 13.0, armY - 0.5, -0.3);
        } else if (state === 'skid') {
            drawArm(cx + 3.4, armY + 0.6, 0.2);
            drawArm(cx + 12.6, armY + 0.6, -0.2);
        } else if (state === 'flag') {
            // one arm raised
            drawArm(cx + 3.4, armY + 0.4, 0);
            drawArmRaised(cx + 12.6, armY - 3, cy + yOff);
        } else {
            drawArm(cx + 3.4, armY + 0.4, 0);
            drawArm(cx + 12.6, armY + 0.4, 0);
        }
        function drawArm(px, py, tilt) {
            // arm (skin)
            ctx.fillStyle = SKIN;
            ctx.beginPath();
            ctx.ellipse(px, py, 1.5, 2, tilt, 0, Math.PI * 2);
            ctx.fill();
            // shirt sleeve
            ctx.fillStyle = SHIRT;
            ctx.beginPath();
            ctx.ellipse(px, py - 0.8, 1.6, 1.0, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = SHIRT_S;
            ctx.fillRect(px - 1.3, py - 0.3, 2.6, 0.4);
            // glove
            ctx.fillStyle = WHT;
            ctx.beginPath();
            ctx.arc(px, py + 1.4, 1.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#e8e8e8';
            ctx.beginPath();
            ctx.arc(px - 0.4, py + 1.1, 0.5, 0, Math.PI * 2);
            ctx.fill();
        }
        function drawArmRaised(px, pyTop, headY) {
            // raised arm (pumping at flag)
            ctx.strokeStyle = SKIN;
            ctx.lineWidth = 2.4;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(px, pyTop + 4);
            ctx.lineTo(px, pyTop - 1);
            ctx.stroke();
            // glove
            ctx.fillStyle = WHT;
            ctx.beginPath();
            ctx.arc(px, pyTop - 1.4, 1.8, 0, Math.PI * 2);
            ctx.fill();
        }

        // === HEAD (face) ===
        var headX = cx + 8, headY = cy + 4 + yOff;
        // ear/sideburn (behind face) – shadow side
        ctx.fillStyle = SKIN_S;
        ctx.beginPath();
        ctx.ellipse(headX + (dir > 0 ? 3.2 : -3.2), headY + 0.5, 0.9, 1.4, 0, 0, Math.PI * 2);
        ctx.fill();
        // face oval
        var headGrad = ctx.createRadialGradient(headX - 1, headY - 1.5, 0.5, headX, headY, 5);
        headGrad.addColorStop(0, '#ffe4c4');
        headGrad.addColorStop(1, SKIN);
        ctx.fillStyle = headGrad;
        ctx.beginPath();
        ctx.ellipse(headX, headY, 3.4, 3.4, 0, 0, Math.PI * 2);
        ctx.fill();
        // face outline
        ctx.strokeStyle = SKIN_O;
        ctx.lineWidth = 0.4;
        ctx.beginPath();
        ctx.ellipse(headX, headY, 3.4, 3.4, 0, 0, Math.PI * 2);
        ctx.stroke();
        // hair tufts (brown sideburns)
        ctx.fillStyle = BROW;
        if (dir > 0) {
            ctx.beginPath(); ctx.ellipse(headX - 3.0, headY + 0.4, 0.9, 1.3, 0, 0, Math.PI * 2); ctx.fill();
        } else {
            ctx.beginPath(); ctx.ellipse(headX + 3.0, headY + 0.4, 0.9, 1.3, 0, 0, Math.PI * 2); ctx.fill();
        }
        // mustache
        ctx.fillStyle = BROW_S;
        ctx.beginPath();
        roundRect(ctx, headX - 2.0, headY + 1.2, 4.0, 0.8, 0.4);
        ctx.fill();
        // nose
        ctx.fillStyle = SKIN_S;
        ctx.beginPath();
        ctx.ellipse(headX + (dir > 0 ? 0.6 : -0.6), headY + 0.4, 0.7, 0.9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = SKIN_H;
        ctx.beginPath();
        ctx.ellipse(headX + (dir > 0 ? 0.8 : -0.8), headY + 0.7, 0.4, 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
        // eye + brow
        var eyeX = headX + (dir > 0 ? 1.3 : -1.3);
        ctx.fillStyle = BROW_S;
        ctx.beginPath();
        roundRect(ctx, eyeX - 0.7, headY - 1.4, 1.4, 0.4, 0.2);
        ctx.fill();
        // eye white
        ctx.fillStyle = WHT;
        ctx.beginPath();
        ctx.ellipse(eyeX, headY - 0.6, 0.7, blink > 0 ? 0.18 : 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        if (blink <= 0) {
            // iris (blue)
            ctx.fillStyle = '#2a5dca';
            ctx.beginPath();
            ctx.arc(eyeX, headY - 0.55, 0.4, 0, Math.PI * 2);
            ctx.fill();
            // pupil
            ctx.fillStyle = BLK;
            ctx.beginPath();
            ctx.arc(eyeX + 0.1, headY - 0.5, 0.2, 0, Math.PI * 2);
            ctx.fill();
            // sparkle
            ctx.fillStyle = WHT;
            ctx.beginPath();
            ctx.arc(eyeX - 0.05, headY - 0.7, 0.1, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // closed eye
            ctx.strokeStyle = BLK;
            ctx.lineWidth = 0.3;
            ctx.beginPath();
            ctx.moveTo(eyeX - 0.5, headY - 0.5); ctx.lineTo(eyeX + 0.5, headY - 0.5);
            ctx.stroke();
        }
        // mouth (smile)
        ctx.strokeStyle = BROW_S;
        ctx.lineWidth = 0.35;
        ctx.beginPath();
        ctx.arc(headX, headY + 1.6, 1.0, 0.1, Math.PI - 0.1);
        ctx.stroke();

        // === CAP ===
        var capY = headY - 3.4 + yOff * 0.5;
        // crown
        var capGrad = ctx.createLinearGradient(0, capY, 0, capY + 3);
        capGrad.addColorStop(0, HAT_H);
        capGrad.addColorStop(0.6, HAT);
        capGrad.addColorStop(1, HAT_S);
        ctx.fillStyle = capGrad;
        ctx.beginPath();
        roundRect(ctx, headX - 4, capY, 8, 3.4, 1.2);
        ctx.fill();
        // crown shading
        ctx.fillStyle = HAT_S;
        ctx.beginPath();
        roundRect(ctx, headX - 4, capY + 2.4, 8, 1, 0.5);
        ctx.fill();
        // emblem (B for Browrio)
        ctx.fillStyle = WHT;
        ctx.font = 'bold 2.6px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('B', headX, capY + 1.7);
        // brim
        ctx.fillStyle = HAT;
        if (dir > 0) {
            ctx.beginPath();
            ctx.ellipse(headX + 3.4, capY + 3, 4, 1.1, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = HAT_D;
            ctx.beginPath();
            ctx.ellipse(headX + 3.4, capY + 3.4, 4, 0.4, 0, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.beginPath();
            ctx.ellipse(headX - 3.4, capY + 3, 4, 1.1, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = HAT_D;
            ctx.beginPath();
            ctx.ellipse(headX - 3.4, capY + 3.4, 4, 0.4, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        // cap top highlight
        ctx.fillStyle = HAT_H;
        ctx.beginPath();
        ctx.ellipse(headX - 1.5, capY + 0.6, 1.4, 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    };

    // rounded-rect helpers
    function roundRect(ctx, x, y, w, h, r) {
        r = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }
    function roundRectShape(ctx, x, y, w, h, r) { roundRect(ctx, x, y, w, h, r); }

    BrowrioGame.prototype.drawPlayer = function (x, y) {
        var ctx = this.ctx;
        var p = this.player;
        var state = this.playerState();
        var t = this.animT;
        var big = !!p.big;
        var S = big ? 2 : 1;
        // base body height: small 16, big 32 (we draw inside 16x16 cell, scaled)
        // death: spin + flip
        if (state === 'die') {
            ctx.save();
            ctx.translate(x + 8, y + 14);
            ctx.rotate(-p.deadSpin);
            ctx.translate(-8, -14);
            ctx.globalAlpha = Math.floor(this.stateT * 14) % 2 === 0 ? 1 : 0.55;
            this.drawBrowrioFrame(0, 0, 1, false, 'idle', t, 0);
            ctx.restore();
            // soft shadow on ground
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.beginPath(); ctx.ellipse(x + 8, y + p.h + 2, 9, 3, 0, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1;
            return;
        }
        // squash/stretch via vertical scale around the hips
        var cx = x, cy = y;
        ctx.save();
        // jump apex: slight tilt forward, kick-up dust below
        if (state === 'jump' || state === 'fall') {
            var tilt = state === 'jump' ? -0.12 : 0.16;
            ctx.translate(x + 8, y + p.h - 2);
            ctx.rotate(tilt * p.dir);
            ctx.translate(-(x + 8), -(y + p.h - 2));
            // air dust trailing behind
            if ((t * 14) % 2 < 1) {
                var dustX = x + (p.dir > 0 ? -2 : 18);
                this.px(ctx, dustX, y + p.h - 2, 'rgba(255,255,255,0.7)');
                this.px(ctx, dustX + (p.dir > 0 ? -2 : 2), y + p.h - 1, 'rgba(255,255,255,0.5)');
            }
        }
        // run motion-blur: small copies behind
        if (state === 'run' || state === 'skid') {
            ctx.globalAlpha = 0.18;
            this.drawBrowrioFrame(x - p.dir * 1, y, p.dir, big, 'idle', t - 0.05, 0);
            ctx.globalAlpha = 1;
        }
        // squash/stretch vertical
        var sq = p.squash || 1, st = p.stretch || 1;
        // simulate squash by tiny offset: y shifts by (1 - st) * h, height grows by st
        var baseH = big ? 32 : 16;
        var drawY = y + (1 - st) * baseH;
        // body draw: draw at (x, drawY) with chosen state frame
        this.drawBrowrioFrame(x, drawY, p.dir, big, state, t, p.blink);
        // big mode scaling of overall frame
        if (S > 1) {
            // drawBrowrioFrame is in 16x16 space, we want to scale the head/body — handled via S in the frame,
            // so for big we re-draw a 2x size by simulating a stretch vertically on the body parts.
        }
        ctx.restore();
        // ground shadow
        var shY = y + p.h;
        var shAlpha = state === 'jump' ? 0.18 : (state === 'fall' ? 0.22 : 0.32);
        ctx.fillStyle = 'rgba(0,0,0,' + shAlpha + ')';
        ctx.beginPath();
        ctx.ellipse(x + 8, shY + 2, 8, 2.6, 0, 0, Math.PI * 2);
        ctx.fill();
        // skid: extra dust
        if (state === 'skid') {
            var dust = (t * 20) % 1;
            for (var i = 0; i < 2; i++) {
                var dx = p.dir > 0 ? -4 - i * 3 : 20 + i * 3;
                ctx.fillStyle = 'rgba(255,255,255,' + (0.45 - i * 0.2) + ')';
                ctx.fillRect(x + dx, y + p.h - 2 - i, 3, 2);
            }
        }
        ctx.globalAlpha = 1;
    };

    BrowrioGame.prototype.drawHUD = function () {
        var ctx = this.ctx;
        // gradient bar
        var bg = ctx.createLinearGradient(0, 0, 0, 32);
        bg.addColorStop(0, 'rgba(0,0,0,0.65)');
        bg.addColorStop(1, 'rgba(0,0,0,0.25)');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, VIEW_W, 32);
        ctx.strokeStyle = 'rgba(255,217,77,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, 32); ctx.lineTo(VIEW_W, 32); ctx.stroke();

        ctx.font = 'bold 11px monospace';
        ctx.textBaseline = 'middle';
        // BROWIO logo (left)
        ctx.fillStyle = '#ffd94d';
        ctx.textAlign = 'left';
        ctx.fillText('★ BROWIO', 8, 14);
        // SCORE
        ctx.fillStyle = '#a8c8ff';
        ctx.fillText('SCORE', 90, 14);
        ctx.fillStyle = '#fff';
        ctx.fillText(this.score, 132, 14);
        // COINS
        ctx.fillStyle = '#a8c8ff';
        ctx.fillText('COINS', 200, 14);
        ctx.fillStyle = '#ffd94d';
        ctx.fillText('◉ ' + this.coins, 244, 14);
        // WORLD (center)
        ctx.textAlign = 'center';
        ctx.fillStyle = '#a8c8ff';
        ctx.fillText('WORLD', VIEW_W / 2 - 50, 14);
        ctx.fillStyle = '#fff';
        ctx.fillText((this.levelIndex + 1) + '-' + (this.def.subIndex || 1), VIEW_W / 2 - 14, 14);
        ctx.fillStyle = '#a8c8ff';
        ctx.fillText('LIVES', VIEW_W / 2 + 30, 14);
        ctx.fillStyle = '#ff8a5c';
        ctx.fillText('♥ ' + this.lives, VIEW_W / 2 + 70, 14);
        // TIME (right)
        ctx.textAlign = 'right';
        var tcol = this.timeLeft < 30 ? '#ff5c50' : (this.timeLeft < 60 ? '#ff9a5c' : '#ffd94d');
        ctx.fillStyle = tcol;
        ctx.font = 'bold 14px monospace';
        ctx.fillText(Math.ceil(this.timeLeft) + '', VIEW_W - 28, 14);
        ctx.font = 'bold 10px monospace';
        ctx.fillStyle = '#a8c8ff';
        ctx.fillText('TIME', VIEW_W - 8, 14);

        if (this.muted) {
            ctx.textAlign = 'left';
            ctx.fillStyle = '#ff8a5c';
            ctx.font = 'bold 9px monospace';
            ctx.fillText('♪ MUTED (M)', 8, 28);
        }
    };

    // ---------------- Boot hook (same shape as starship) ----------------
    window.initBrowrioGame = function (windowEl) {
        if (windowEl.querySelector('.browrio-window')) {
            new BrowrioGame(windowEl);
        }
    };
    window.BrowrioGame = BrowrioGame;
    window.BrowrioLevels = LEVELS;
})();
