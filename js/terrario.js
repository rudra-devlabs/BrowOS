/**
 * BrowOS — Terrario (2D Sandbox Survival, Mining & Crafting Clone)
 * Inspired by Terraria · Authentic 2D Procedural World, Day/Night Cycle, Physics, Mining, Crafting & Enemies
 */

(function() {
    'use strict';

    const WORLD_W = 200; // Tiles wide
    const WORLD_H = 100; // Tiles deep
    const TILE = 16;      // Pixels per tile
    const REACH = 6 * TILE; // Mining/placing reach

    // Block ID constants
    const B = {
        AIR: 0,
        DIRT: 1,
        GRASS: 2,
        STONE: 3,
        WOOD: 4,
        LEAVES: 5,
        COPPER_ORE: 6,
        IRON_ORE: 7,
        GOLD_ORE: 8,
        PLANKS: 9,
        STONE_BRICK: 10,
        TORCH: 11,
        PLATFORM: 12,
        WORKBENCH: 13,
        FURNACE: 14,
        CHEST: 15,
        DOOR: 16,
        GEL: 17,
        COPPER_BAR: 18,
        IRON_BAR: 19,
        GOLD_BAR: 20,
        WOOD_SWORD: 21,
        IRON_SWORD: 22,
        WOOD_PICKAXE: 23,
        IRON_PICKAXE: 24,
        WOOD_AXE: 25
    };

    // Item Definitions & Tooltips
    const ITEMS = {
        [B.AIR]: { name: 'Air', stackable: false, isTile: false },
        [B.DIRT]: { name: 'Dirt Block', stackable: true, isTile: true, solid: true, color: '#6d4c41', hardness: 1.0 },
        [B.GRASS]: { name: 'Grass Block', stackable: true, isTile: true, solid: true, color: '#4caf50', hardness: 1.0 },
        [B.STONE]: { name: 'Stone Block', stackable: true, isTile: true, solid: true, color: '#78909c', hardness: 2.2 },
        [B.WOOD]: { name: 'Wood', stackable: true, isTile: true, solid: true, color: '#8d6e63', hardness: 1.2 },
        [B.LEAVES]: { name: 'Leaves', stackable: true, isTile: true, solid: false, color: '#2e7d32', hardness: 0.3 },
        [B.COPPER_ORE]: { name: 'Copper Ore', stackable: true, isTile: true, solid: true, color: '#d35400', hardness: 2.5 },
        [B.IRON_ORE]: { name: 'Iron Ore', stackable: true, isTile: true, solid: true, color: '#bdc3c7', hardness: 3.0 },
        [B.GOLD_ORE]: { name: 'Gold Ore', stackable: true, isTile: true, solid: true, color: '#f1c40f', hardness: 3.5 },
        [B.PLANKS]: { name: 'Wood Planks', stackable: true, isTile: true, solid: true, color: '#bcaaa4', hardness: 1.2 },
        [B.STONE_BRICK]: { name: 'Stone Brick', stackable: true, isTile: true, solid: true, color: '#546e7a', hardness: 2.5 },
        [B.TORCH]: { name: 'Torch', stackable: true, isTile: true, solid: false, light: 8, color: '#ffb300' },
        [B.PLATFORM]: { name: 'Wood Platform', stackable: true, isTile: true, solid: true, isPlatform: true, color: '#a1887f' },
        [B.WORKBENCH]: { name: 'Work Bench', stackable: true, isTile: true, solid: false, isStation: true, color: '#a0522d' },
        [B.FURNACE]: { name: 'Furnace', stackable: true, isTile: true, solid: false, isStation: true, light: 5, color: '#7f8c8d' },
        [B.CHEST]: { name: 'Chest', stackable: true, isTile: true, solid: false, color: '#d35400' },
        [B.DOOR]: { name: 'Wooden Door', stackable: true, isTile: true, solid: true, color: '#8d6e63' },
        [B.GEL]: { name: 'Gel', stackable: true, isTile: false, color: '#00e676' },
        [B.COPPER_BAR]: { name: 'Copper Bar', stackable: true, isTile: false, color: '#e67e22' },
        [B.IRON_BAR]: { name: 'Iron Bar', stackable: true, isTile: false, color: '#ecf0f1' },
        [B.GOLD_BAR]: { name: 'Gold Bar', stackable: true, isTile: false, color: '#f39c12' },
        [B.WOOD_SWORD]: { name: 'Wooden Sword', stackable: false, isTool: true, type: 'sword', damage: 8, color: '#8d6e63' },
        [B.IRON_SWORD]: { name: 'Iron Sword', stackable: false, isTool: true, type: 'sword', damage: 16, color: '#ecf0f1' },
        [B.WOOD_PICKAXE]: { name: 'Wooden Pickaxe', stackable: false, isTool: true, type: 'pickaxe', power: 1.0, damage: 4, color: '#8d6e63' },
        [B.IRON_PICKAXE]: { name: 'Iron Pickaxe', stackable: false, isTool: true, type: 'pickaxe', power: 2.2, damage: 7, color: '#ecf0f1' },
        [B.WOOD_AXE]: { name: 'Wooden Axe', stackable: false, isTool: true, type: 'axe', power: 1.4, damage: 5, color: '#8d6e63' }
    };

    // Crafting Recipes
    const RECIPES = [
        { result: B.TORCH, count: 3, reqStation: null, cost: [{ id: B.WOOD, count: 1 }, { id: B.GEL, count: 1 }] },
        { result: B.PLANKS, count: 4, reqStation: null, cost: [{ id: B.WOOD, count: 1 }] },
        { result: B.PLATFORM, count: 2, reqStation: null, cost: [{ id: B.WOOD, count: 1 }] },
        { result: B.WORKBENCH, count: 1, reqStation: null, cost: [{ id: B.WOOD, count: 10 }] },
        { result: B.WOOD_SWORD, count: 1, reqStation: B.WORKBENCH, cost: [{ id: B.WOOD, count: 7 }] },
        { result: B.WOOD_PICKAXE, count: 1, reqStation: B.WORKBENCH, cost: [{ id: B.WOOD, count: 10 }] },
        { result: B.WOOD_AXE, count: 1, reqStation: B.WORKBENCH, cost: [{ id: B.WOOD, count: 8 }] },
        { result: B.FURNACE, count: 1, reqStation: B.WORKBENCH, cost: [{ id: B.STONE, count: 20 }, { id: B.WOOD, count: 4 }, { id: B.TORCH, count: 3 }] },
        { result: B.CHEST, count: 1, reqStation: B.WORKBENCH, cost: [{ id: B.WOOD, count: 12 }] },
        { result: B.DOOR, count: 1, reqStation: B.WORKBENCH, cost: [{ id: B.WOOD, count: 6 }] },
        { result: B.STONE_BRICK, count: 2, reqStation: B.FURNACE, cost: [{ id: B.STONE, count: 2 }] },
        { result: B.COPPER_BAR, count: 1, reqStation: B.FURNACE, cost: [{ id: B.COPPER_ORE, count: 3 }] },
        { result: B.IRON_BAR, count: 1, reqStation: B.FURNACE, cost: [{ id: B.IRON_ORE, count: 3 }] },
        { result: B.GOLD_BAR, count: 1, reqStation: B.FURNACE, cost: [{ id: B.GOLD_ORE, count: 3 }] },
        { result: B.IRON_SWORD, count: 1, reqStation: B.WORKBENCH, cost: [{ id: B.IRON_BAR, count: 8 }, { id: B.WOOD, count: 3 }] },
        { result: B.IRON_PICKAXE, count: 1, reqStation: B.WORKBENCH, cost: [{ id: B.IRON_BAR, count: 12 }, { id: B.WOOD, count: 3 }] }
    ];

    // Sound Synthesizer for Terrario
    class TerrarioSfx {
        constructor() {
            this.ctx = null;
            this.muted = false;
        }

        init() {
            if (!this.ctx && typeof AudioContext !== 'undefined') {
                this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
        }

        play(type) {
            if (this.muted) return;
            this.init();
            if (!this.ctx) return;
            try {
                const t = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();

                if (type === 'mine') {
                    osc.type = 'square';
                    osc.frequency.setValueAtTime(140 + Math.random() * 40, t);
                    gain.gain.setValueAtTime(0.08, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
                    osc.connect(gain); gain.connect(this.ctx.destination);
                    osc.start(); osc.stop(t + 0.06);
                } else if (type === 'break') {
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(260, t);
                    osc.frequency.exponentialRampToValueAtTime(80, t + 0.12);
                    gain.gain.setValueAtTime(0.12, t);
                    gain.gain.linearRampToValueAtTime(0.001, t + 0.14);
                    osc.connect(gain); gain.connect(this.ctx.destination);
                    osc.start(); osc.stop(t + 0.14);
                } else if (type === 'place') {
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(220, t);
                    gain.gain.setValueAtTime(0.1, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
                    osc.connect(gain); gain.connect(this.ctx.destination);
                    osc.start(); osc.stop(t + 0.08);
                } else if (type === 'jump') {
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(160, t);
                    osc.frequency.exponentialRampToValueAtTime(320, t + 0.12);
                    gain.gain.setValueAtTime(0.1, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
                    osc.connect(gain); gain.connect(this.ctx.destination);
                    osc.start(); osc.stop(t + 0.14);
                } else if (type === 'hit') {
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(400, t);
                    osc.frequency.exponentialRampToValueAtTime(100, t + 0.15);
                    gain.gain.setValueAtTime(0.15, t);
                    gain.gain.linearRampToValueAtTime(0.001, t + 0.16);
                    osc.connect(gain); gain.connect(this.ctx.destination);
                    osc.start(); osc.stop(t + 0.16);
                } else if (type === 'craft') {
                    [440, 554, 659].forEach((f, i) => {
                        setTimeout(() => {
                            const o = this.ctx.createOscillator();
                            const g = this.ctx.createGain();
                            o.type = 'triangle';
                            o.frequency.setValueAtTime(f, this.ctx.currentTime);
                            g.gain.setValueAtTime(0.1, this.ctx.currentTime);
                            g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
                            o.connect(g); g.connect(this.ctx.destination);
                            o.start(); o.stop(this.ctx.currentTime + 0.15);
                        }, i * 50);
                    });
                }
            } catch (_) {}
        }
    }

    class TerrarioGame {
        constructor(container) {
            this.container = container;
            this.canvas = container.querySelector('#terrario-canvas');
            if (!this.canvas) return;
            this.ctx = this.canvas.getContext('2d');
            this.sfx = new TerrarioSfx();
            this.destroyed = false;

            // Dimensions
            this.width = this.canvas.width = 640;
            this.height = this.canvas.height = 360;

            // World Data
            this.tiles = new Uint8Array(WORLD_W * WORLD_H);
            this.damage = new Float32Array(WORLD_W * WORLD_H); // Tile damage accumulation

            // Day / Night Cycle (0.0 to 1.0, duration ~ 480 seconds)
            this.timeOfDay = 0.22; // Start in mid-morning
            this.daySpeed = 1 / 480;

            // Player State
            this.player = {
                x: 100 * TILE,
                y: 20 * TILE,
                vx: 0,
                vy: 0,
                w: 12,
                h: 22,
                onGround: false,
                hp: 100,
                maxHp: 100,
                invuln: 0,
                direction: 1,
                swingAngle: 0,
                isSwinging: false
            };

            // Controls
            this.keys = Object.create(null);
            this.mouse = { x: 0, y: 0, worldX: 0, worldY: 0, leftDown: false, rightDown: false };
            this.selectedHotbar = 0;
            this.inventoryOpen = false;

            // Inventory (32 slots)
            this.inventory = Array.from({ length: 32 }, () => ({ id: B.AIR, count: 0 }));

            // Starter Gear
            this.inventory[0] = { id: B.WOOD_PICKAXE, count: 1 };
            this.inventory[1] = { id: B.WOOD_SWORD, count: 1 };
            this.inventory[2] = { id: B.WOOD_AXE, count: 1 };
            this.inventory[3] = { id: B.TORCH, count: 16 };
            this.inventory[4] = { id: B.WOOD, count: 20 };

            // Entities: Slimes, Zombies, Flying Eyes, Drops, Popups
            this.enemies = [];
            this.itemDrops = [];
            this.popups = [];
            this.particles = [];

            // Camera
            this.cam = { x: this.player.x, y: this.player.y };

            this.generateWorld();
            this.spawnPlayerAtSurface();
            this.bindDom();
            this.bindEvents();

            this.lastTime = performance.now();
            this.rafId = requestAnimationFrame((t) => this.loop(t));
        }

        // Procedural World Generation
        generateWorld() {
            // Check saved world
            const saved = localStorage.getItem('browos_terrario_world');
            if (saved) {
                try {
                    const data = JSON.parse(saved);
                    if (data.tiles && data.tiles.length === WORLD_W * WORLD_H) {
                        this.tiles.set(data.tiles);
                        if (data.inventory) this.inventory = data.inventory;
                        return;
                    }
                } catch (_) {}
            }

            // Generate terrain surface height curve with sin waves
            const surfaceHeights = new Int32Array(WORLD_W);
            for (let x = 0; x < WORLD_W; x++) {
                const hill1 = Math.sin(x * 0.04) * 6;
                const hill2 = Math.sin(x * 0.12) * 2.5;
                surfaceHeights[x] = Math.floor(38 + hill1 + hill2);
            }

            // Fill solid layers
            for (let x = 0; x < WORLD_W; x++) {
                const sy = surfaceHeights[x];
                for (let y = 0; y < WORLD_H; y++) {
                    const idx = y * WORLD_W + x;
                    if (y < sy) {
                        this.tiles[idx] = B.AIR;
                    } else if (y === sy) {
                        this.tiles[idx] = B.GRASS;
                    } else if (y < sy + 8) {
                        this.tiles[idx] = B.DIRT;
                    } else {
                        this.tiles[idx] = B.STONE;
                    }
                }
            }

            // Carve Organic Caves using Perlin-like 2D noise
            for (let x = 4; x < WORLD_W - 4; x++) {
                for (let y = 48; y < WORLD_H - 4; y++) {
                    const n = Math.sin(x * 0.18) * Math.cos(y * 0.18) + Math.sin(x * 0.08 + y * 0.08);
                    if (n > 0.85) {
                        this.tiles[y * WORLD_W + x] = B.AIR;
                    }
                }
            }

            // Embed Ore Veins
            const placeVein = (oreId, count, minY, maxY, size) => {
                for (let i = 0; i < count; i++) {
                    const cx = Math.floor(Math.random() * (WORLD_W - 12)) + 6;
                    const cy = Math.floor(Math.random() * (maxY - minY)) + minY;
                    for (let ox = -size; ox <= size; ox++) {
                        for (let oy = -size; oy <= size; oy++) {
                            if (Math.hypot(ox, oy) <= size && Math.random() < 0.75) {
                                const idx = (cy + oy) * WORLD_W + (cx + ox);
                                if (this.tiles[idx] === B.STONE || this.tiles[idx] === B.DIRT) {
                                    this.tiles[idx] = oreId;
                                }
                            }
                        }
                    }
                }
            };

            placeVein(B.COPPER_ORE, 35, 42, 85, 2);
            placeVein(B.IRON_ORE, 28, 52, 95, 2);
            placeVein(B.GOLD_ORE, 18, 70, WORLD_H - 4, 2);

            // Plant Surface Trees
            for (let x = 6; x < WORLD_W - 6; x += Math.floor(Math.random() * 4) + 4) {
                const sy = surfaceHeights[x];
                if (this.tiles[sy * WORLD_W + x] === B.GRASS) {
                    const treeH = Math.floor(Math.random() * 4) + 5;
                    // Trunk
                    for (let ty = 1; ty <= treeH; ty++) {
                        this.tiles[(sy - ty) * WORLD_W + x] = B.WOOD;
                    }
                    // Bushy Leaves Crown
                    const topY = sy - treeH;
                    for (let lx = -2; lx <= 2; lx++) {
                        for (let ly = -3; ly <= 0; ly++) {
                            if (Math.hypot(lx, ly + 1.5) <= 2.2) {
                                const lidx = (topY + ly) * WORLD_W + (x + lx);
                                if (this.tiles[lidx] === B.AIR) {
                                    this.tiles[lidx] = B.LEAVES;
                                }
                            }
                        }
                    }
                }
            }
        }

        spawnPlayerAtSurface() {
            const midX = Math.floor(WORLD_W / 2);
            for (let y = 0; y < WORLD_H; y++) {
                if (this.tiles[y * WORLD_W + midX] !== B.AIR) {
                    this.player.x = midX * TILE;
                    this.player.y = (y - 3) * TILE;
                    this.cam.x = this.player.x;
                    this.cam.y = this.player.y;
                    break;
                }
            }
        }

        bindDom() {
            const q = (id) => this.container.querySelector('#' + id);
            this.dom = {
                hotbar: q('terrario-hotbar'),
                invOverlay: q('terrario-inventory-overlay'),
                invGrid: q('terrario-inv-grid'),
                craftGrid: q('terrario-craft-grid'),
                hearts: q('terrario-hearts'),
                clock: q('terrario-clock'),
                saveBtn: q('terrario-save-btn'),
                exportBtn: q('terrario-export-btn'),
                muteBtn: q('terrario-mute-btn')
            };

            this.renderHotbarUI();

            const click = (el, fn) => { if (el) el.addEventListener('click', fn); };
            click(this.dom.saveBtn, () => this.saveGame(true));
            click(this.dom.exportBtn, () => this.exportWorldFile());
            click(this.dom.muteBtn, () => {
                this.sfx.muted = !this.sfx.muted;
                if (this.dom.muteBtn) this.dom.muteBtn.textContent = this.sfx.muted ? '🔇' : '🔊';
            });
        }

        bindEvents() {
            this.onKeyDown = (e) => {
                const code = e.code;
                this.keys[code] = true;

                // Toggle Inventory with E or Tab
                if (code === 'KeyE' || code === 'Tab') {
                    e.preventDefault();
                    this.toggleInventory();
                    return;
                }

                // Hotbar select 1 to 9, 0
                if (code.startsWith('Digit')) {
                    const d = parseInt(code.replace('Digit', ''), 10);
                    const slot = d === 0 ? 9 : d - 1;
                    if (slot >= 0 && slot < 10) {
                        this.selectedHotbar = slot;
                        this.renderHotbarUI();
                    }
                }
            };

            this.onKeyUp = (e) => {
                this.keys[e.code] = false;
            };

            this.onMouseMove = (e) => {
                const rect = this.canvas.getBoundingClientRect();
                const scaleX = this.canvas.width / rect.width;
                const scaleY = this.canvas.height / rect.height;
                this.mouse.x = (e.clientX - rect.left) * scaleX;
                this.mouse.y = (e.clientY - rect.top) * scaleY;
                this.mouse.worldX = this.mouse.x + (this.cam.x - this.width / 2);
                this.mouse.worldY = this.mouse.y + (this.cam.y - this.height / 2);
            };

            this.onMouseDown = (e) => {
                this.sfx.init();
                if (e.button === 0) this.mouse.leftDown = true;
                if (e.button === 2) {
                    e.preventDefault();
                    this.mouse.rightDown = true;
                    this.handleRightClick();
                }
            };

            this.onMouseUp = (e) => {
                if (e.button === 0) this.mouse.leftDown = false;
                if (e.button === 2) this.mouse.rightDown = false;
            };

            this.onWheel = (e) => {
                if (this.inventoryOpen) return;
                if (e.deltaY > 0) {
                    this.selectedHotbar = (this.selectedHotbar + 1) % 10;
                } else {
                    this.selectedHotbar = (this.selectedHotbar + 9) % 10;
                }
                this.renderHotbarUI();
            };

            this.onContextMenu = (e) => e.preventDefault();

            window.addEventListener('keydown', this.onKeyDown);
            window.addEventListener('keyup', this.onKeyUp);
            this.canvas.addEventListener('mousemove', this.onMouseMove);
            this.canvas.addEventListener('mousedown', this.onMouseDown);
            window.addEventListener('mouseup', this.onMouseUp);
            this.canvas.addEventListener('wheel', this.onWheel);
            this.canvas.addEventListener('contextmenu', this.onContextMenu);
        }

        renderHotbarUI() {
            if (!this.dom.hotbar) return;
            let html = '';
            for (let i = 0; i < 10; i++) {
                const item = this.inventory[i];
                const def = ITEMS[item.id] || ITEMS[0];
                const active = i === this.selectedHotbar ? 'active' : '';
                html += `
                    <div class="terrario-slot ${active}" data-slot="${i}">
                        <div class="slot-num">${i === 9 ? 0 : i + 1}</div>
                        ${item.id !== B.AIR ? `
                            <div class="slot-icon" style="background:${def.color};"></div>
                            ${item.count > 1 ? `<span class="slot-count">${item.count}</span>` : ''}
                        ` : ''}
                    </div>
                `;
            }
            this.dom.hotbar.innerHTML = html;

            this.dom.hotbar.querySelectorAll('.terrario-slot').forEach(el => {
                el.addEventListener('click', (e) => {
                    const idx = parseInt(el.dataset.slot, 10);
                    this.selectedHotbar = idx;
                    this.renderHotbarUI();
                });
            });
        }

        toggleInventory() {
            this.inventoryOpen = !this.inventoryOpen;
            if (this.dom.invOverlay) {
                this.dom.invOverlay.style.display = this.inventoryOpen ? 'flex' : 'none';
            }
            if (this.inventoryOpen) {
                this.renderFullInventoryUI();
                this.renderCraftingUI();
            }
        }

        renderFullInventoryUI() {
            if (!this.dom.invGrid) return;
            let html = '';
            for (let i = 0; i < 32; i++) {
                const item = this.inventory[i];
                const def = ITEMS[item.id] || ITEMS[0];
                html += `
                    <div class="terrario-slot ${i === this.selectedHotbar ? 'active' : ''}" data-inv-slot="${i}" title="${def.name}">
                        ${item.id !== B.AIR ? `
                            <div class="slot-icon" style="background:${def.color};"></div>
                            ${item.count > 1 ? `<span class="slot-count">${item.count}</span>` : ''}
                        ` : ''}
                    </div>
                `;
            }
            this.dom.invGrid.innerHTML = html;

            // Slot interaction
            this.dom.invGrid.querySelectorAll('.terrario-slot').forEach(el => {
                el.addEventListener('click', () => {
                    const slot = parseInt(el.dataset.invSlot, 10);
                    if (slot < 10) {
                        this.selectedHotbar = slot;
                        this.renderHotbarUI();
                    }
                });
            });
        }

        renderCraftingUI() {
            if (!this.dom.craftGrid) return;

            // Check nearby crafting stations
            const ptx = Math.floor(this.player.x / TILE);
            const pty = Math.floor(this.player.y / TILE);
            let hasWorkbench = false;
            let hasFurnace = false;

            for (let ox = -4; ox <= 4; ox++) {
                for (let oy = -4; oy <= 4; oy++) {
                    const id = this.getTile(ptx + ox, pty + oy);
                    if (id === B.WORKBENCH) hasWorkbench = true;
                    if (id === B.FURNACE) hasFurnace = true;
                }
            }

            let html = '';
            RECIPES.forEach((rec, idx) => {
                if (rec.reqStation === B.WORKBENCH && !hasWorkbench) return;
                if (rec.reqStation === B.FURNACE && !hasFurnace) return;

                // Check materials available
                const canCraft = rec.cost.every(c => this.getItemCount(c.id) >= c.count);
                const resDef = ITEMS[rec.result];

                html += `
                    <div class="craft-recipe ${canCraft ? 'craftable' : 'locked'}" data-recipe-idx="${idx}">
                        <div class="craft-icon" style="background:${resDef.color};"></div>
                        <div class="craft-info">
                            <span class="craft-name">${resDef.name} ×${rec.count}</span>
                            <span class="craft-cost">${rec.cost.map(c => `${ITEMS[c.id].name} ×${c.count}`).join(', ')}</span>
                        </div>
                        <button class="craft-btn" ${canCraft ? '' : 'disabled'}>CRAFT</button>
                    </div>
                `;
            });

            this.dom.craftGrid.innerHTML = html || '<div style="color:#aaa;font-size:12px;padding:10px;">No recipes available here</div>';

            this.dom.craftGrid.querySelectorAll('.craft-recipe.craftable .craft-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const rIdx = parseInt(btn.closest('.craft-recipe').dataset.recipeIdx, 10);
                    this.craftItem(RECIPES[rIdx]);
                });
            });
        }

        craftItem(recipe) {
            // Deduct cost
            recipe.cost.forEach(c => this.removeItem(c.id, c.count));
            // Add result
            this.addItem(recipe.result, recipe.count);
            this.sfx.play('craft');
            this.renderHotbarUI();
            this.renderFullInventoryUI();
            this.renderCraftingUI();
        }

        getItemCount(id) {
            let total = 0;
            this.inventory.forEach(s => { if (s.id === id) total += s.count; });
            return total;
        }

        addItem(id, count = 1) {
            // Try stack first
            for (const s of this.inventory) {
                if (s.id === id && ITEMS[id].stackable && s.count < 99) {
                    const add = Math.min(count, 99 - s.count);
                    s.count += add;
                    count -= add;
                    if (count <= 0) return true;
                }
            }
            // Add to empty slot
            for (const s of this.inventory) {
                if (s.id === B.AIR) {
                    s.id = id;
                    s.count = count;
                    return true;
                }
            }
            return false;
        }

        removeItem(id, count = 1) {
            for (const s of this.inventory) {
                if (s.id === id) {
                    if (s.count >= count) {
                        s.count -= count;
                        if (s.count <= 0) s.id = B.AIR;
                        return true;
                    } else {
                        count -= s.count;
                        s.id = B.AIR;
                        s.count = 0;
                    }
                }
            }
            return false;
        }

        getTile(tx, ty) {
            if (tx < 0 || tx >= WORLD_W || ty < 0 || ty >= WORLD_H) return B.STONE;
            return this.tiles[ty * WORLD_W + tx];
        }

        setTile(tx, ty, id) {
            if (tx < 0 || tx >= WORLD_W || ty < 0 || ty >= WORLD_H) return;
            this.tiles[ty * WORLD_W + tx] = id;
            this.damage[ty * WORLD_W + tx] = 0;
        }

        // Mining & Attacking
        handleMining(dt) {
            if (!this.mouse.leftDown || this.inventoryOpen) return;

            const activeItem = this.inventory[this.selectedHotbar];
            const def = ITEMS[activeItem.id] || ITEMS[0];

            // 1. Attack Enemies in range
            const hitRadius = 26;
            for (const en of this.enemies) {
                const d = Math.hypot(en.x - this.mouse.worldX, en.y - this.mouse.worldY);
                if (d < hitRadius && Math.hypot(en.x - this.player.x, en.y - this.player.y) < REACH) {
                    const dmg = (def.isTool && def.damage) ? def.damage : 4;
                    en.hp -= dmg;
                    en.vx = (en.x > this.player.x ? 1 : -1) * 3.5;
                    en.vy = -3;
                    this.sfx.play('hit');
                    this.addPopup(en.x, en.y - 10, `-${dmg}`, '#ff4444');
                    this.player.isSwinging = true;
                    return;
                }
            }

            // 2. Mine Tile
            const tx = Math.floor(this.mouse.worldX / TILE);
            const ty = Math.floor(this.mouse.worldY / TILE);
            const tileId = this.getTile(tx, ty);
            if (tileId === B.AIR) return;

            const dist = Math.hypot((tx + 0.5) * TILE - (this.player.x + this.player.w / 2), (ty + 0.5) * TILE - (this.player.y + this.player.h / 2));
            if (dist > REACH) return;

            this.player.isSwinging = true;

            const tileDef = ITEMS[tileId];
            const hardness = tileDef.hardness || 1.0;
            let toolMultiplier = 1.0;
            if (def.isTool) {
                if (def.type === 'pickaxe' && (tileId === B.STONE || tileId === B.COPPER_ORE || tileId === B.IRON_ORE || tileId === B.GOLD_ORE || tileId === B.STONE_BRICK)) {
                    toolMultiplier = def.power * 2.8;
                } else if (def.type === 'axe' && (tileId === B.WOOD || tileId === B.PLANKS)) {
                    toolMultiplier = def.power * 2.8;
                }
            }

            const idx = ty * WORLD_W + tx;
            this.damage[idx] += dt * (3.5 * toolMultiplier) / hardness;

            if (Math.random() < 0.25) this.sfx.play('mine');

            if (this.damage[idx] >= 1.0) {
                this.sfx.play('break');
                this.spawnDrop((tx + 0.5) * TILE, (ty + 0.5) * TILE, tileId);
                this.setTile(tx, ty, B.AIR);

                // If chopped wood trunk, propagate up
                if (tileId === B.WOOD && this.getTile(tx, ty - 1) === B.WOOD) {
                    this.damage[(ty - 1) * WORLD_W + tx] = 0.9;
                }
            }
        }

        // Placing Blocks & Interacting
        handleRightClick() {
            if (this.inventoryOpen) return;

            const activeItem = this.inventory[this.selectedHotbar];
            if (activeItem.id === B.AIR || !ITEMS[activeItem.id].isTile) return;

            const tx = Math.floor(this.mouse.worldX / TILE);
            const ty = Math.floor(this.mouse.worldY / TILE);

            const dist = Math.hypot((tx + 0.5) * TILE - (this.player.x + this.player.w / 2), (ty + 0.5) * TILE - (this.player.y + this.player.h / 2));
            if (dist > REACH) return;

            // Target must be air
            if (this.getTile(tx, ty) !== B.AIR) return;

            // Must be adjacent to an existing block
            const hasAdjacent = (
                this.getTile(tx - 1, ty) !== B.AIR ||
                this.getTile(tx + 1, ty) !== B.AIR ||
                this.getTile(tx, ty - 1) !== B.AIR ||
                this.getTile(tx, ty + 1) !== B.AIR
            );
            if (!hasAdjacent) return;

            // Cannot place solid block inside player body
            const bLeft = tx * TILE;
            const bRight = bLeft + TILE;
            const bTop = ty * TILE;
            const bBottom = bTop + TILE;
            const p = this.player;

            if (ITEMS[activeItem.id].solid && !ITEMS[activeItem.id].isPlatform) {
                if (p.x < bRight && p.x + p.w > bLeft && p.y < bBottom && p.y + p.h > bTop) {
                    return;
                }
            }

            // Place Block
            this.setTile(tx, ty, activeItem.id);
            this.removeItem(activeItem.id, 1);
            this.sfx.play('place');
            this.renderHotbarUI();
        }

        spawnDrop(x, y, id) {
            this.itemDrops.push({
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 2,
                vy: -2.5,
                id: id,
                life: 60
            });
        }

        addPopup(x, y, text, color = '#ffffff') {
            this.popups.push({ x, y, text, color, life: 0.8 });
        }

        // Enemy Spawning & AI
        updateEnemies(dt) {
            // Spawn slimes during day, zombies & eyes at night
            const isNight = this.timeOfDay > 0.45 && this.timeOfDay < 0.95;
            if (this.enemies.length < 8 && Math.random() < 0.015) {
                const spawnDir = Math.random() < 0.5 ? -1 : 1;
                const sx = this.player.x + spawnDir * (this.width * 0.65 + Math.random() * 80);
                const stx = Math.floor(sx / TILE);
                let groundY = -1;
                for (let y = 10; y < WORLD_H - 10; y++) {
                    if (this.getTile(stx, y) !== B.AIR) {
                        groundY = (y - 2) * TILE;
                        break;
                    }
                }

                if (groundY > 0) {
                    if (!isNight) {
                        // Green / Blue Slime
                        this.enemies.push({
                            type: 'slime',
                            x: sx, y: groundY, vx: 0, vy: 0,
                            w: 16, h: 12, hp: 18, maxHp: 18,
                            jumpTimer: Math.random() * 2,
                            color: Math.random() < 0.4 ? '#00e676' : '#29b6f6'
                        });
                    } else {
                        // Zombie or Demon Eye
                        if (Math.random() < 0.6) {
                            this.enemies.push({
                                type: 'zombie',
                                x: sx, y: groundY, vx: 0, vy: 0,
                                w: 14, h: 24, hp: 35, maxHp: 35,
                                color: '#558b2f'
                            });
                        } else {
                            this.enemies.push({
                                type: 'eye',
                                x: sx, y: groundY - 80, vx: 0, vy: 0,
                                w: 16, h: 16, hp: 22, maxHp: 22,
                                color: '#e53935'
                            });
                        }
                    }
                }
            }

            // Update Enemy Physics & Tracking
            for (let i = this.enemies.length - 1; i >= 0; i--) {
                const en = this.enemies[i];

                if (en.type === 'slime') {
                    en.vy += 12 * dt;
                    en.jumpTimer -= dt;
                    if (en.jumpTimer <= 0) {
                        en.jumpTimer = 1.8 + Math.random() * 1.2;
                        const dir = en.x < this.player.x ? 1 : -1;
                        en.vx = dir * 2.2;
                        en.vy = -4.5;
                    }
                    en.x += en.vx;
                    en.y += en.vy;
                    // Ground collision
                    const btx = Math.floor((en.x + en.w / 2) / TILE);
                    const bty = Math.floor((en.y + en.h) / TILE);
                    if (ITEMS[this.getTile(btx, bty)].solid) {
                        en.y = bty * TILE - en.h;
                        en.vy = 0;
                        en.vx *= 0.6;
                    }
                } else if (en.type === 'zombie') {
                    en.vy += 14 * dt;
                    const dir = en.x < this.player.x ? 1 : -1;
                    en.vx = dir * 1.4;

                    // Obstacle jump
                    const frontTileX = Math.floor((en.x + (dir > 0 ? en.w + 2 : -2)) / TILE);
                    const feetTileY = Math.floor((en.y + en.h - 4) / TILE);
                    if (ITEMS[this.getTile(frontTileX, feetTileY)].solid && en.vy === 0) {
                        en.vy = -5.0;
                    }

                    en.x += en.vx;
                    en.y += en.vy;

                    const btx = Math.floor((en.x + en.w / 2) / TILE);
                    const bty = Math.floor((en.y + en.h) / TILE);
                    if (ITEMS[this.getTile(btx, bty)].solid) {
                        en.y = bty * TILE - en.h;
                        en.vy = 0;
                    }
                } else if (en.type === 'eye') {
                    // Fly & Swoop toward player
                    const dx = (this.player.x + this.player.w / 2) - (en.x + en.w / 2);
                    const dy = (this.player.y + this.player.h / 2) - (en.y + en.h / 2);
                    const dist = Math.hypot(dx, dy) || 1;
                    en.vx += (dx / dist) * 1.8 * dt * 4;
                    en.vy += (dy / dist) * 1.8 * dt * 4;
                    en.vx = Math.max(-2.5, Math.min(2.5, en.vx));
                    en.vy = Math.max(-2.5, Math.min(2.5, en.vy));
                    en.x += en.vx;
                    en.y += en.vy;
                }

                // Player Collision Damage
                if (this.player.invuln <= 0) {
                    if (en.x < this.player.x + this.player.w && en.x + en.w > this.player.x &&
                        en.y < this.player.y + this.player.h && en.y + en.h > this.player.y) {
                        const dmg = en.type === 'zombie' ? 14 : (en.type === 'eye' ? 12 : 8);
                        this.player.hp = Math.max(0, this.player.hp - dmg);
                        this.player.invuln = 0.6;
                        this.player.vx = (this.player.x > en.x ? 1 : -1) * 4;
                        this.player.vy = -3.5;
                        this.sfx.play('hit');
                        this.addPopup(this.player.x, this.player.y - 12, `-${dmg}`, '#ff3333');
                        if (this.player.hp <= 0) {
                            this.respawnPlayer();
                        }
                    }
                }

                // Enemy Death
                if (en.hp <= 0) {
                    this.sfx.play('break');
                    if (en.type === 'slime') {
                        this.spawnDrop(en.x + en.w / 2, en.y + en.h / 2, B.GEL);
                    } else if (en.type === 'zombie') {
                        this.spawnDrop(en.x + en.w / 2, en.y + en.h / 2, B.TORCH);
                    } else if (en.type === 'eye') {
                        this.spawnDrop(en.x + en.w / 2, en.y + en.h / 2, B.TORCH);
                    }
                    this.enemies.splice(i, 1);
                }
            }
        }

        respawnPlayer() {
            this.addPopup(this.player.x, this.player.y - 20, 'YOU DIED', '#ff0000');
            this.player.hp = this.player.maxHp;
            this.spawnPlayerAtSurface();
        }

        // Update Physics & Movement
        updatePlayer(dt) {
            const p = this.player;

            // Invulnerability timer
            if (p.invuln > 0) p.invuln -= dt;

            // Tool swing animation
            if (p.isSwinging) {
                p.swingAngle += dt * 14;
                if (p.swingAngle > Math.PI * 0.75) {
                    p.swingAngle = 0;
                    p.isSwinging = false;
                }
            }

            // Direction facing mouse
            p.direction = this.mouse.worldX >= p.x ? 1 : -1;

            // Horizontal Movement
            const moveSpeed = (this.keys['ShiftLeft'] || this.keys['ShiftRight']) ? 3.2 : 2.2;
            let moveDir = 0;
            if (this.keys['KeyA'] || this.keys['ArrowLeft']) moveDir -= 1;
            if (this.keys['KeyD'] || this.keys['ArrowRight']) moveDir += 1;

            p.vx = moveDir * moveSpeed;

            // Gravity
            p.vy += 15.5 * dt;
            if (p.vy > 12) p.vy = 12;

            // Jump
            if ((this.keys['Space'] || this.keys['KeyW'] || this.keys['ArrowUp']) && p.onGround) {
                p.vy = -6.2;
                p.onGround = false;
                this.sfx.play('jump');
            }

            // Drop down through wooden platforms (Down + Space / S)
            const dropThrough = (this.keys['KeyS'] || this.keys['ArrowDown']);

            // X-Axis Collision
            const nextX = p.x + p.vx;
            const txMin = Math.floor(nextX / TILE);
            const txMax = Math.floor((nextX + p.w) / TILE);
            const tyMin = Math.floor(p.y / TILE);
            const tyMax = Math.floor((p.y + p.h - 1) / TILE);

            let blockedX = false;
            for (let ty = tyMin; ty <= tyMax; ty++) {
                for (let tx = txMin; tx <= txMax; tx++) {
                    const tile = this.getTile(tx, ty);
                    if (ITEMS[tile].solid && !ITEMS[tile].isPlatform) {
                        blockedX = true;
                        break;
                    }
                }
                if (blockedX) break;
            }

            // Auto-step up 1 block if running into a 1-tile ledge
            if (blockedX && p.onGround) {
                let canStep = true;
                for (let tx = txMin; tx <= txMax; tx++) {
                    if (ITEMS[this.getTile(tx, tyMin - 1)].solid) {
                        canStep = false; break;
                    }
                }
                if (canStep) {
                    p.y -= TILE;
                    blockedX = false;
                }
            }

            if (!blockedX) {
                p.x = nextX;
            }

            // Y-Axis Collision
            const nextY = p.y + p.vy;
            const curTxMin = Math.floor(p.x / TILE);
            const curTxMax = Math.floor((p.x + p.w) / TILE);
            const nextTyMin = Math.floor(nextY / TILE);
            const nextTyMax = Math.floor((nextY + p.h) / TILE);

            p.onGround = false;
            if (p.vy > 0) {
                // Falling downward
                for (let tx = curTxMin; tx <= curTxMax; tx++) {
                    const tile = this.getTile(tx, nextTyMax);
                    const def = ITEMS[tile];
                    if (def.solid) {
                        if (def.isPlatform) {
                            // Only land on platform if coming from above and not dropping
                            if (p.y + p.h <= nextTyMax * TILE + 4 && !dropThrough) {
                                p.y = nextTyMax * TILE - p.h;
                                p.vy = 0;
                                p.onGround = true;
                                break;
                            }
                        } else {
                            p.y = nextTyMax * TILE - p.h;
                            p.vy = 0;
                            p.onGround = true;
                            break;
                        }
                    }
                }
            } else if (p.vy < 0) {
                // Jumping upward into ceiling
                for (let tx = curTxMin; tx <= curTxMax; tx++) {
                    const tile = this.getTile(tx, nextTyMin);
                    if (ITEMS[tile].solid && !ITEMS[tile].isPlatform) {
                        p.y = (nextTyMin + 1) * TILE;
                        p.vy = 0;
                        break;
                    }
                }
            }

            if (!p.onGround) {
                p.y = nextY;
            }

            // Smooth Camera Tracking
            this.cam.x += (p.x + p.w / 2 - this.cam.x) * 0.1;
            this.cam.y += (p.y + p.h / 2 - this.cam.y) * 0.1;

            // Clamp Camera to World
            this.cam.x = Math.max(this.width / 2, Math.min(WORLD_W * TILE - this.width / 2, this.cam.x));
            this.cam.y = Math.max(this.height / 2, Math.min(WORLD_H * TILE - this.height / 2, this.cam.y));
        }

        // Item Drops Physics & Magnet Pickups
        updateDrops(dt) {
            const p = this.player;
            for (let i = this.itemDrops.length - 1; i >= 0; i--) {
                const d = this.itemDrops[i];
                d.vy += 12 * dt;
                d.x += d.vx;
                d.y += d.vy;

                // Simple ground hit
                const tx = Math.floor(d.x / TILE);
                const ty = Math.floor((d.y + 4) / TILE);
                if (ITEMS[this.getTile(tx, ty)].solid) {
                    d.y = ty * TILE - 4;
                    d.vy = 0;
                    d.vx *= 0.7;
                }

                // Magnet to player
                const dist = Math.hypot(p.x + p.w / 2 - d.x, p.y + p.h / 2 - d.y);
                if (dist < 40) {
                    d.x += ((p.x + p.w / 2) - d.x) * 0.15;
                    d.y += ((p.y + p.h / 2) - d.y) * 0.15;
                    if (dist < 14) {
                        if (this.addItem(d.id, 1)) {
                            this.sfx.play('place');
                            this.renderHotbarUI();
                            this.itemDrops.splice(i, 1);
                            continue;
                        }
                    }
                }

                d.life -= dt;
                if (d.life <= 0) this.itemDrops.splice(i, 1);
            }
        }

        // Render Canvas Scene
        draw() {
            const ctx = this.ctx;
            ctx.clearRect(0, 0, this.width, this.height);

            // Day / Night sky color calculation
            let skyTop, skyBottom;
            const t = this.timeOfDay;
            if (t < 0.25) { // Dawn to noon
                skyTop = '#4facfe'; skyBottom = '#00f2fe';
            } else if (t < 0.5) { // Afternoon to Sunset
                skyTop = '#ff7e5f'; skyBottom = '#feb47b';
            } else if (t < 0.75) { // Dusk to Midnight
                skyTop = '#0b1026'; skyBottom = '#1c2951';
            } else { // Midnight to Dawn
                skyTop = '#050814'; skyBottom = '#2c3e50';
            }

            const skyGrad = ctx.createLinearGradient(0, 0, 0, this.height);
            skyGrad.addColorStop(0, skyTop);
            skyGrad.addColorStop(1, skyBottom);
            ctx.fillStyle = skyGrad;
            ctx.fillRect(0, 0, this.width, this.height);

            // Draw Sun or Moon along arc
            const celestialAngle = (t * Math.PI * 2) - Math.PI / 2;
            const cx = this.width / 2 + Math.cos(celestialAngle) * (this.width * 0.45);
            const cy = this.height * 0.75 + Math.sin(celestialAngle) * (this.height * 0.55);

            if (t >= 0 && t < 0.5) {
                // Sun
                ctx.fillStyle = '#ffea00';
                ctx.beginPath();
                ctx.arc(cx, cy, 18, 0, Math.PI * 2);
                ctx.fill();
            } else {
                // Moon
                ctx.fillStyle = '#f5f6fa';
                ctx.beginPath();
                ctx.arc(cx, cy, 14, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.save();
            ctx.translate(Math.floor(this.width / 2 - this.cam.x), Math.floor(this.height / 2 - this.cam.y));

            // Visible tile bounds
            const startTx = Math.max(0, Math.floor((this.cam.x - this.width / 2) / TILE));
            const endTx = Math.min(WORLD_W - 1, Math.ceil((this.cam.x + this.width / 2) / TILE));
            const startTy = Math.max(0, Math.floor((this.cam.y - this.height / 2) / TILE));
            const endTy = Math.min(WORLD_H - 1, Math.ceil((this.cam.y + this.height / 2) / TILE));

            // Draw Tiles
            for (let y = startTy; y <= endTy; y++) {
                for (let x = startTx; x <= endTx; x++) {
                    const id = this.tiles[y * WORLD_W + x];
                    if (id === B.AIR) continue;

                    const px = x * TILE;
                    const py = y * TILE;
                    const def = ITEMS[id];

                    if (id === B.GRASS) {
                        ctx.fillStyle = '#6d4c41'; // Dirt base
                        ctx.fillRect(px, py, TILE, TILE);
                        ctx.fillStyle = '#4caf50'; // Top grass strip
                        ctx.fillRect(px, py, TILE, 4);
                    } else if (id === B.TORCH) {
                        ctx.fillStyle = '#8d6e63'; // Stick
                        ctx.fillRect(px + 6, py + 5, 4, 10);
                        ctx.fillStyle = '#ff9800'; // Flame
                        ctx.fillRect(px + 5, py + 1, 6, 5);
                    } else if (id === B.PLATFORM) {
                        ctx.fillStyle = '#a1887f';
                        ctx.fillRect(px, py, TILE, 4);
                    } else if (id === B.WORKBENCH) {
                        ctx.fillStyle = '#a0522d';
                        ctx.fillRect(px + 1, py + 4, TILE - 2, TILE - 4);
                    } else if (id === B.FURNACE) {
                        ctx.fillStyle = '#7f8c8d';
                        ctx.fillRect(px + 1, py + 2, TILE - 2, TILE - 2);
                        ctx.fillStyle = '#e67e22'; // Fire core
                        ctx.fillRect(px + 4, py + 7, 8, 6);
                    } else {
                        ctx.fillStyle = def.color;
                        ctx.fillRect(px, py, TILE, TILE);
                        // Subtle grid edge
                        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
                        ctx.strokeRect(px, py, TILE, TILE);
                    }

                    // Tile damage cracks
                    const dmg = this.damage[y * WORLD_W + x];
                    if (dmg > 0.05) {
                        ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(0.7, dmg * 0.7)})`;
                        ctx.fillRect(px, py, TILE, TILE);
                    }
                }
            }

            // Draw Item Drops
            this.itemDrops.forEach(d => {
                const def = ITEMS[d.id] || ITEMS[0];
                ctx.fillStyle = def.color;
                ctx.fillRect(d.x - 3, d.y - 3, 6, 6);
                ctx.strokeStyle = '#fff';
                ctx.strokeRect(d.x - 3, d.y - 3, 6, 6);
            });

            // Draw Enemies
            this.enemies.forEach(en => {
                ctx.fillStyle = en.color;
                if (en.type === 'slime') {
                    ctx.beginPath();
                    ctx.ellipse(en.x + en.w / 2, en.y + en.h / 2, en.w / 2, en.h / 2, 0, 0, Math.PI * 2);
                    ctx.fill();
                    // Slime eyes
                    ctx.fillStyle = '#000';
                    ctx.fillRect(en.x + 4, en.y + 4, 2, 2);
                    ctx.fillRect(en.x + en.w - 6, en.y + 4, 2, 2);
                } else if (en.type === 'zombie') {
                    ctx.fillRect(en.x, en.y, en.w, en.h);
                    // Glowing eyes
                    ctx.fillStyle = '#ff0000';
                    ctx.fillRect(en.x + 3, en.y + 4, 2, 2);
                    ctx.fillRect(en.x + en.w - 5, en.y + 4, 2, 2);
                } else if (en.type === 'eye') {
                    ctx.beginPath();
                    ctx.arc(en.x + en.w / 2, en.y + en.h / 2, en.w / 2, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#000';
                    ctx.beginPath();
                    ctx.arc(en.x + en.w / 2, en.y + en.h / 2, 4, 0, Math.PI * 2);
                    ctx.fill();
                }
            });

            // Draw Player
            const p = this.player;
            ctx.save();
            ctx.translate(p.x + p.w / 2, p.y + p.h / 2);

            // Flicker on hurt
            if (p.invuln <= 0 || Math.sin(performance.now() * 0.05) > 0) {
                // Body
                ctx.fillStyle = '#3498db'; // Shirt
                ctx.fillRect(-p.w / 2, -p.h / 2 + 6, p.w, 10);
                ctx.fillStyle = '#2c3e50'; // Pants
                ctx.fillRect(-p.w / 2, -p.h / 2 + 16, p.w, 6);
                ctx.fillStyle = '#f1c40f'; // Hair / head
                ctx.fillRect(-p.w / 2, -p.h / 2, p.w, 6);
                ctx.fillStyle = '#ffe0bd'; // Face
                ctx.fillRect(p.direction > 0 ? -1 : -p.w / 2, -p.h / 2 + 2, 4, 3);

                // Held tool / weapon swinging
                const activeItem = this.inventory[this.selectedHotbar];
                if (activeItem.id !== B.AIR) {
                    ctx.save();
                    const swingBase = p.direction > 0 ? 0.3 : Math.PI - 0.3;
                    const swing = p.isSwinging ? (p.direction * p.swingAngle) : 0;
                    ctx.rotate(swingBase + swing);
                    ctx.fillStyle = ITEMS[activeItem.id].color;
                    ctx.fillRect(4, -2, 14, 4);
                    ctx.restore();
                }
            }
            ctx.restore();

            // Hovered Tile Reticle (Within Reach)
            const mtx = Math.floor(this.mouse.worldX / TILE);
            const mty = Math.floor(this.mouse.worldY / TILE);
            const mDist = Math.hypot((mtx + 0.5) * TILE - (p.x + p.w / 2), (mty + 0.5) * TILE - (p.y + p.h / 2));
            if (mDist <= REACH && !this.inventoryOpen) {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
                ctx.lineWidth = 1.5;
                ctx.strokeRect(mtx * TILE, mty * TILE, TILE, TILE);
            }

            // Damage Popups
            this.popups.forEach(pop => {
                ctx.fillStyle = pop.color;
                ctx.font = 'bold 11px monospace';
                ctx.fillText(pop.text, pop.x, pop.y);
            });

            ctx.restore();

            // Draw HUD (Hearts & Time of Day)
            this.drawHearts();
            this.drawTimeClock();
        }

        drawHearts() {
            if (!this.dom.hearts) return;
            const heartsCount = 5;
            const fullHearts = Math.ceil(this.player.hp / 20);
            let html = '';
            for (let i = 0; i < heartsCount; i++) {
                html += `<span class="terrario-heart ${i < fullHearts ? 'full' : 'empty'}">❤</span>`;
            }
            this.dom.hearts.innerHTML = html;
        }

        drawTimeClock() {
            if (!this.dom.clock) return;
            const totalHours = Math.floor(this.timeOfDay * 24);
            const mins = Math.floor((this.timeOfDay * 24 - totalHours) * 60);
            const isNight = this.timeOfDay > 0.45 && this.timeOfDay < 0.95;
            const pad = (n) => n.toString().padStart(2, '0');
            this.dom.clock.textContent = `${isNight ? '🌙' : '☀️'} ${pad(totalHours)}:${pad(mins)}`;
        }

        saveGame(showNotify = false) {
            const data = {
                tiles: Array.from(this.tiles),
                inventory: this.inventory
            };
            try {
                localStorage.setItem('browos_terrario_world', JSON.stringify(data));
                if (showNotify) this.addPopup(this.player.x, this.player.y - 30, 'WORLD SAVED', '#00ff88');
            } catch (e) {
                console.warn('LocalStorage save failed:', e);
            }
        }

        exportWorldFile() {
            const data = {
                game: 'Terrario',
                version: 1,
                date: new Date().toISOString(),
                inventory: this.inventory,
                tiles: Array.from(this.tiles)
            };
            const json = JSON.stringify(data);
            if (window.filesystem && window.filesystem.isMounted()) {
                window.filesystem.writeFile('/Desktop/Terrario_World.json', json).then(() => {
                    this.addPopup(this.player.x, this.player.y - 30, 'SAVED TO DESKTOP', '#00e5ff');
                });
            } else {
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'Terrario_World.json';
                a.click();
            }
        }

        // Main game loop
        loop(time) {
            if (this.destroyed) return;

            const dt = Math.min(0.1, (time - this.lastTime) / 1000);
            this.lastTime = time;

            // Day / Night progression
            this.timeOfDay = (this.timeOfDay + dt * this.daySpeed) % 1.0;

            // Popups
            for (let i = this.popups.length - 1; i >= 0; i--) {
                const pop = this.popups[i];
                pop.y -= dt * 25;
                pop.life -= dt;
                if (pop.life <= 0) this.popups.splice(i, 1);
            }

            this.updatePlayer(dt);
            this.handleMining(dt);
            this.updateEnemies(dt);
            this.updateDrops(dt);
            this.draw();

            this.rafId = requestAnimationFrame((t) => this.loop(t));
        }

        destroy() {
            this.destroyed = true;
            this.saveGame(false);
            cancelAnimationFrame(this.rafId);
            window.removeEventListener('keydown', this.onKeyDown);
            window.removeEventListener('keyup', this.onKeyUp);
            window.removeEventListener('mouseup', this.onMouseUp);
        }
    }

    // Global Initializer for WindowManager
    window.initTerrarioGame = function(windowElement) {
        if (!windowElement || windowElement._terrario) return;
        try {
            windowElement._terrario = new TerrarioGame(windowElement);
        } catch (e) {
            console.error('[Terrario] Failed to mount game:', e);
        }
    };
})();
