/**
 * BrowOS — Snake 3D (Cyberpunk Tron-Style Three.js Arcade Game)
 * Powered by Three.js WebGL Engine
 */

(function() {
    'use strict';

    const GRID_SIZE = 22; // 22 x 22 arena
    const TILE_SIZE = 1.2;
    const ARENA_EXTENT = (GRID_SIZE * TILE_SIZE) / 2;

    // Web Audio Synthesizer for Retro Sci-Fi SFX
    class Snake3DSfx {
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

        playTone(freq, duration, type = 'sine', gainVal = 0.15) {
            if (this.muted) return;
            this.init();
            if (!this.ctx) return;
            try {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = type;
                osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
                gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start();
                osc.stop(this.ctx.currentTime + duration);
            } catch (_) {}
        }

        turn() {
            this.playTone(440, 0.05, 'triangle', 0.06);
        }

        eat() {
            this.init();
            if (this.muted || !this.ctx) return;
            try {
                const t = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(520, t);
                osc.frequency.exponentialRampToValueAtTime(980, t + 0.12);
                gain.gain.setValueAtTime(0.2, t);
                gain.gain.linearRampToValueAtTime(0.001, t + 0.14);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start();
                osc.stop(t + 0.14);
            } catch (_) {}
        }

        golden() {
            this.init();
            if (this.muted || !this.ctx) return;
            try {
                [523, 659, 784, 1046].forEach((f, i) => {
                    setTimeout(() => this.playTone(f, 0.18, 'sine', 0.15), i * 40);
                });
            } catch (_) {}
        }

        powerup() {
            this.init();
            if (this.muted || !this.ctx) return;
            try {
                const t = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(320, t);
                osc.frequency.exponentialRampToValueAtTime(840, t + 0.25);
                gain.gain.setValueAtTime(0.12, t);
                gain.gain.linearRampToValueAtTime(0.001, t + 0.28);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start();
                osc.stop(t + 0.28);
            } catch (_) {}
        }

        crash() {
            this.init();
            if (this.muted || !this.ctx) return;
            try {
                const t = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(220, t);
                osc.frequency.exponentialRampToValueAtTime(40, t + 0.45);
                gain.gain.setValueAtTime(0.35, t);
                gain.gain.linearRampToValueAtTime(0.0001, t + 0.5);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start();
                osc.stop(t + 0.5);
            } catch (_) {}
        }
    }

    class SnakeGame3D {
        constructor(container) {
            this.container = container;
            this.sfx = new Snake3DSfx();
            this.destroyed = false;

            // Load best score
            this.bestScore = parseInt(localStorage.getItem('browos_snake3d_best') || '0', 10);

            // Canvas & Renderer
            this.canvas = container.querySelector('#snake3d-canvas');
            if (!this.canvas) return;

            // Game State
            this.grid = { width: GRID_SIZE, height: GRID_SIZE };
            this.snake = []; // Array of grid coordinates {x, z}
            this.prevSnake = []; // Interpolation coordinates
            this.direction = { x: 1, z: 0 };
            this.nextDirection = { x: 1, z: 0 };
            this.inputQueue = [];
            this.score = 0;
            this.multiplier = 1;
            this.state = 'menu'; // 'menu', 'playing', 'paused', 'gameover'
            this.cameraMode = 'isometric'; // 'isometric', 'chase', 'topdown'

            // Timings & Kinematics
            this.stepInterval = 120; // ms per grid tick
            this.lastStepTime = performance.now();
            this.shake = 0;

            // Power-ups
            this.food = null; // {x, z, type, mesh, halo}
            this.powerups = []; // Floating bonus pickups
            this.activeBuff = null; // {type: 'speed'|'ghost'|'freeze', timer: seconds}

            // Particles
            this.particles = [];

            // 3D Objects
            this.scene = null;
            this.camera = null;
            this.renderer = null;
            this.snakeMeshes = [];
            this.foodGroup = null;

            this.init3D();
            this.bindDom();
            this.bindEvents();
            this.resetGame();

            this.lastFrameTime = performance.now();
            this.rafId = requestAnimationFrame((t) => this.loop(t));
        }

        init3D() {
            const w = Math.max(1, this.container.clientWidth || 600);
            const h = Math.max(1, this.container.clientHeight || 400);

            this.scene = new THREE.Scene();
            this.scene.fog = new THREE.FogExp2(0x040814, 0.015);

            this.camera = new THREE.PerspectiveCamera(52, w / h, 0.1, 400);
            this.updateCameraTransform(0);

            this.renderer = new THREE.WebGLRenderer({
                canvas: this.canvas,
                antialias: true,
                powerPreference: 'high-performance'
            });
            this.renderer.setSize(w, h, false);
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
            this.renderer.setClearColor(0x040814, 1);

            // Lighting
            const ambient = new THREE.AmbientLight(0x223355, 1.2);
            this.scene.add(ambient);

            const dirLight = new THREE.DirectionalLight(0x00f2fe, 1.4);
            dirLight.position.set(10, 24, 12);
            this.scene.add(dirLight);

            const rimLight = new THREE.DirectionalLight(0xff0844, 0.8);
            rimLight.position.set(-14, 12, -14);
            this.scene.add(rimLight);

            // Arena Base
            this.buildArena();

            // Starfield Background
            this.buildStarfield();
        }

        buildArena() {
            // Dark reflective ground platform
            const floorGeo = new THREE.BoxGeometry(GRID_SIZE * TILE_SIZE + 0.8, 1.2, GRID_SIZE * TILE_SIZE + 0.8);
            const floorMat = new THREE.MeshStandardMaterial({
                color: 0x060c18,
                roughness: 0.25,
                metalness: 0.85
            });
            const floor = new THREE.Mesh(floorGeo, floorMat);
            floor.position.y = -0.6;
            this.scene.add(floor);

            // Glowing Grid Lines
            const gridHelper = new THREE.GridHelper(GRID_SIZE * TILE_SIZE, GRID_SIZE, 0x00f2fe, 0x0d2847);
            gridHelper.position.y = 0.02;
            this.scene.add(gridHelper);

            // Neon Perimeter Energy Barrier
            const wallH = 1.0;
            const wallMat = new THREE.MeshBasicMaterial({
                color: 0x00f2fe,
                transparent: true,
                opacity: 0.45,
                wireframe: false
            });

            const borderMat = new THREE.MeshBasicMaterial({ color: 0x00f2fe });

            const ext = ARENA_EXTENT;
            const walls = [
                { pos: [0, wallH / 2, -ext], size: [GRID_SIZE * TILE_SIZE, wallH, 0.15] },
                { pos: [0, wallH / 2, ext], size: [GRID_SIZE * TILE_SIZE, wallH, 0.15] },
                { pos: [-ext, wallH / 2, 0], size: [0.15, wallH, GRID_SIZE * TILE_SIZE] },
                { pos: [ext, wallH / 2, 0], size: [0.15, wallH, GRID_SIZE * TILE_SIZE] },
            ];

            walls.forEach(w => {
                const geo = new THREE.BoxGeometry(...w.size);
                const mesh = new THREE.Mesh(geo, wallMat);
                mesh.position.set(...w.pos);
                this.scene.add(mesh);

                // Top neon rail
                const topGeo = new THREE.BoxGeometry(
                    w.size[0] === 0.15 ? 0.2 : w.size[0],
                    0.15,
                    w.size[2] === 0.15 ? 0.2 : w.size[2]
                );
                const topRail = new THREE.Mesh(topGeo, borderMat);
                topRail.position.set(w.pos[0], wallH, w.pos[2]);
                this.scene.add(topRail);
            });

            // Corner energy pylons
            const pylonGeo = new THREE.CylinderGeometry(0.3, 0.35, wallH * 1.5, 8);
            const pylonMat = new THREE.MeshStandardMaterial({ color: 0x00f2fe, emissive: 0x00a8ff, roughness: 0.2 });
            const corners = [
                [-ext, -ext], [ext, -ext], [-ext, ext], [ext, ext]
            ];
            corners.forEach(([cx, cz]) => {
                const pylon = new THREE.Mesh(pylonGeo, pylonMat);
                pylon.position.set(cx, (wallH * 1.5) / 2, cz);
                this.scene.add(pylon);
            });
        }

        buildStarfield() {
            const count = 700;
            const geo = new THREE.BufferGeometry();
            const pos = new Float32Array(count * 3);
            for (let i = 0; i < count * 3; i += 3) {
                pos[i] = (Math.random() - 0.5) * 220;
                pos[i + 1] = Math.random() * 80 + 10;
                pos[i + 2] = (Math.random() - 0.5) * 220;
            }
            geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            const mat = new THREE.PointsMaterial({
                color: 0x88ccff,
                size: 1.2,
                transparent: true,
                opacity: 0.75
            });
            const stars = new THREE.Points(geo, mat);
            this.scene.add(stars);
        }

        bindDom() {
            const q = (id) => this.container.querySelector('#' + id);
            this.dom = {
                score: q('snake-score'),
                best: q('snake-best'),
                length: q('snake-length'),
                speed: q('snake-speed'),
                buffTag: q('snake-buff-tag'),
                camBtn: q('snake-cam-btn'),
                startOverlay: q('snake-start-overlay'),
                pauseOverlay: q('snake-pause-overlay'),
                overOverlay: q('snake-gameover-overlay'),
                overScore: q('snake-over-score'),
                overBest: q('snake-over-best'),
                startBtn: q('snake-start-btn'),
                resumeBtn: q('snake-resume-btn'),
                restartBtn: q('snake-restart-btn'),
                muteBtn: q('snake-mute-btn')
            };

            if (this.dom.best) this.dom.best.textContent = this.bestScore.toLocaleString();

            const click = (el, fn) => {
                if (el) el.addEventListener('click', (e) => { e.stopPropagation(); this.sfx.init(); fn(); });
            };

            click(this.dom.startBtn, () => this.startGame());
            click(this.dom.resumeBtn, () => this.togglePause());
            click(this.dom.restartBtn, () => this.startGame());
            click(this.dom.camBtn, () => this.cycleCamera());
            click(this.dom.muteBtn, () => {
                this.sfx.muted = !this.sfx.muted;
                if (this.dom.muteBtn) this.dom.muteBtn.textContent = this.sfx.muted ? '🔇' : '🔊';
            });
        }

        bindEvents() {
            this.onKeyDown = (e) => {
                const code = e.code;

                // Restart on Game Over
                if (this.state === 'gameover' && (code === 'Enter' || code === 'Space')) {
                    e.preventDefault();
                    this.startGame();
                    return;
                }

                // Pause toggle
                if (code === 'KeyP' || code === 'Escape') {
                    e.preventDefault();
                    this.togglePause();
                    return;
                }

                // Camera toggle
                if (code === 'KeyC' || code === 'KeyV') {
                    e.preventDefault();
                    this.cycleCamera();
                    return;
                }

                if (this.state !== 'playing') return;

                let req = null;
                if (code === 'ArrowUp' || code === 'KeyW') req = { x: 0, z: -1 };
                else if (code === 'ArrowDown' || code === 'KeyS') req = { x: 0, z: 1 };
                else if (code === 'ArrowLeft' || code === 'KeyA') req = { x: -1, z: 0 };
                else if (code === 'ArrowRight' || code === 'KeyD') req = { x: 1, z: 0 };

                if (req) {
                    e.preventDefault();
                    this.queueDirection(req);
                }
            };

            window.addEventListener('keydown', this.onKeyDown);

            // Resize observer
            this.resizeObserver = new ResizeObserver(() => this.onResize());
            this.resizeObserver.observe(this.container);
        }

        queueDirection(req) {
            const cur = this.inputQueue.length > 0 ? this.inputQueue[this.inputQueue.length - 1] : this.direction;
            // Prevent exact reverse into self unless ghost buff active
            if (cur.x + req.x === 0 && cur.z + req.z === 0) {
                return;
            }
            if (this.inputQueue.length < 2) {
                this.inputQueue.push(req);
                this.sfx.turn();
            }
        }

        cycleCamera() {
            const modes = ['isometric', 'chase', 'topdown'];
            const idx = modes.indexOf(this.cameraMode);
            this.cameraMode = modes[(idx + 1) % modes.length];
            if (this.dom.camBtn) {
                this.dom.camBtn.textContent = `CAM: ${this.cameraMode.toUpperCase()}`;
            }
        }

        onResize() {
            if (!this.renderer || !this.camera) return;
            const w = Math.max(1, this.container.clientWidth);
            const h = Math.max(1, this.container.clientHeight);
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(w, h, false);
        }

        resetGame() {
            // Clean up snake meshes
            this.snakeMeshes.forEach(m => this.scene.remove(m));
            this.snakeMeshes = [];

            // Clean up food
            if (this.foodGroup) {
                this.scene.remove(this.foodGroup);
                this.foodGroup = null;
            }

            // Clean up powerups
            this.powerups.forEach(p => this.scene.remove(p.mesh));
            this.powerups = [];

            // Initialize Snake at center
            const cx = Math.floor(GRID_SIZE / 2);
            const cz = Math.floor(GRID_SIZE / 2);
            this.snake = [
                { x: cx, z: cz },
                { x: cx - 1, z: cz },
                { x: cx - 2, z: cz }
            ];
            this.prevSnake = JSON.parse(JSON.stringify(this.snake));
            this.direction = { x: 1, z: 0 };
            this.nextDirection = { x: 1, z: 0 };
            this.inputQueue = [];
            this.score = 0;
            this.multiplier = 1;
            this.stepInterval = 120;
            this.activeBuff = null;

            this.createSnakeMeshes();
            this.spawnFood();
            this.updateHud();
        }

        startGame() {
            this.resetGame();
            this.state = 'playing';
            this.lastStepTime = performance.now();
            if (this.dom.startOverlay) this.dom.startOverlay.style.display = 'none';
            if (this.dom.pauseOverlay) this.dom.pauseOverlay.style.display = 'none';
            if (this.dom.overOverlay) this.dom.overOverlay.style.display = 'none';
        }

        togglePause() {
            if (this.state === 'playing') {
                this.state = 'paused';
                if (this.dom.pauseOverlay) this.dom.pauseOverlay.style.display = 'flex';
            } else if (this.state === 'paused') {
                this.state = 'playing';
                this.lastStepTime = performance.now();
                if (this.dom.pauseOverlay) this.dom.pauseOverlay.style.display = 'none';
            }
        }

        createSnakeMeshes() {
            // Materials
            this.headMat = new THREE.MeshStandardMaterial({
                color: 0x00f2fe,
                emissive: 0x0072ff,
                roughness: 0.15,
                metalness: 0.8
            });

            this.visorMat = new THREE.MeshBasicMaterial({ color: 0xff0844 });

            this.bodyMatBase = new THREE.MeshStandardMaterial({
                color: 0x00c6ff,
                emissive: 0x003366,
                roughness: 0.2,
                metalness: 0.7
            });

            this.syncMeshesToLength();
        }

        syncMeshesToLength() {
            while (this.snakeMeshes.length < this.snake.length) {
                const i = this.snakeMeshes.length;
                let mesh;
                if (i === 0) {
                    // Head: Sleek cybernetic head with glowing visor
                    const headGroup = new THREE.Group();
                    const headBox = new THREE.Mesh(
                        new THREE.BoxGeometry(TILE_SIZE * 0.92, TILE_SIZE * 0.8, TILE_SIZE * 1.05),
                        this.headMat
                    );
                    headGroup.add(headBox);

                    // Dual glowing neon eyes/visors
                    const visorGeo = new THREE.BoxGeometry(0.2, 0.15, 0.45);
                    const leftEye = new THREE.Mesh(visorGeo, this.visorMat);
                    leftEye.position.set(0.38, 0.15, -0.4);
                    const rightEye = new THREE.Mesh(visorGeo, this.visorMat);
                    rightEye.position.set(-0.38, 0.15, -0.4);
                    headGroup.add(leftEye);
                    headGroup.add(rightEye);

                    mesh = headGroup;
                } else {
                    // Body segments: Chamfered futuristic segments with pulsing spine core
                    const t = i / Math.max(1, this.snake.length);
                    const segColor = new THREE.Color().setHSL(0.52 - t * 0.25, 1, 0.55);
                    const segMat = new THREE.MeshStandardMaterial({
                        color: segColor,
                        emissive: segColor.clone().multiplyScalar(0.35),
                        roughness: 0.25,
                        metalness: 0.6
                    });
                    const segGeo = new THREE.BoxGeometry(TILE_SIZE * 0.82, TILE_SIZE * 0.75, TILE_SIZE * 0.82);
                    mesh = new THREE.Mesh(segGeo, segMat);
                }
                this.scene.add(mesh);
                this.snakeMeshes.push(mesh);
            }

            while (this.snakeMeshes.length > this.snake.length) {
                const mesh = this.snakeMeshes.pop();
                this.scene.remove(mesh);
            }
        }

        spawnFood() {
            if (this.foodGroup) {
                this.scene.remove(this.foodGroup);
            }

            // Find unoccupied grid cell
            let fx, fz, safe = false;
            let attempts = 0;
            while (!safe && attempts < 200) {
                attempts++;
                fx = Math.floor(Math.random() * GRID_SIZE);
                fz = Math.floor(Math.random() * GRID_SIZE);
                safe = !this.snake.some(s => s.x === fx && s.z === fz);
            }

            const isGolden = Math.random() < 0.18; // 18% chance of Golden Apple
            const type = isGolden ? 'golden' : 'normal';

            const group = new THREE.Group();
            const color = isGolden ? 0xffd700 : 0xff0844;

            // Faceted Neon Polyhedron
            const appleGeo = new THREE.IcosahedronGeometry(TILE_SIZE * 0.4, 0);
            const appleMat = new THREE.MeshStandardMaterial({
                color: color,
                emissive: color,
                emissiveIntensity: 0.6,
                roughness: 0.15
            });
            const appleMesh = new THREE.Mesh(appleGeo, appleMat);
            group.add(appleMesh);

            // Orbiting Halo Ring
            const haloGeo = new THREE.TorusGeometry(TILE_SIZE * 0.58, 0.04, 6, 24);
            const haloMat = new THREE.MeshBasicMaterial({ color: isGolden ? 0xffeb3b : 0x00f2fe });
            const halo = new THREE.Mesh(haloGeo, haloMat);
            halo.rotation.x = Math.PI / 2;
            group.add(halo);

            const wx = (fx - GRID_SIZE / 2 + 0.5) * TILE_SIZE;
            const wz = (fz - GRID_SIZE / 2 + 0.5) * TILE_SIZE;
            group.position.set(wx, 0.45, wz);

            this.scene.add(group);
            this.foodGroup = group;
            this.food = { x: fx, z: fz, type: type, group: group, halo: halo };
        }

        spawnPowerup() {
            if (this.powerups.length >= 2) return;
            const types = ['freeze', 'ghost'];
            const type = types[Math.floor(Math.random() * types.length)];

            let px, pz, safe = false;
            let attempts = 0;
            while (!safe && attempts < 100) {
                attempts++;
                px = Math.floor(Math.random() * GRID_SIZE);
                pz = Math.floor(Math.random() * GRID_SIZE);
                safe = !this.snake.some(s => s.x === px && s.z === pz) && (!this.food || this.food.x !== px || this.food.z !== pz);
            }

            const color = type === 'freeze' ? 0x00f2fe : 0xd946ef;
            const geo = new THREE.OctahedronGeometry(TILE_SIZE * 0.38, 0);
            const mat = new THREE.MeshStandardMaterial({
                color: color,
                emissive: color,
                emissiveIntensity: 0.7,
                roughness: 0.1
            });
            const mesh = new THREE.Mesh(geo, mat);
            const wx = (px - GRID_SIZE / 2 + 0.5) * TILE_SIZE;
            const wz = (pz - GRID_SIZE / 2 + 0.5) * TILE_SIZE;
            mesh.position.set(wx, 0.45, wz);
            this.scene.add(mesh);

            this.powerups.push({ x: px, z: pz, type: type, mesh: mesh, life: 14 });
        }

        // Discrete game logic step
        step() {
            if (this.state !== 'playing') return;

            // Process direction input queue
            if (this.inputQueue.length > 0) {
                this.direction = this.inputQueue.shift();
            }

            // Save previous positions for smooth lerp rendering
            this.prevSnake = JSON.parse(JSON.stringify(this.snake));

            const head = this.snake[0];
            let nx = head.x + this.direction.x;
            let nz = head.z + this.direction.z;

            // Check Ghost Pass-Through buff
            const isGhost = this.activeBuff && this.activeBuff.type === 'ghost';

            // Wall Collision
            if (nx < 0 || nx >= GRID_SIZE || nz < 0 || nz >= GRID_SIZE) {
                if (isGhost) {
                    // Wrap around walls
                    nx = (nx + GRID_SIZE) % GRID_SIZE;
                    nz = (nz + GRID_SIZE) % GRID_SIZE;
                } else {
                    this.gameOver('WALL COLLISION');
                    return;
                }
            }

            // Self Collision
            if (this.snake.some((s, idx) => idx > 0 && s.x === nx && s.z === nz)) {
                if (!isGhost) {
                    this.gameOver('SELF DESTRUCTION');
                    return;
                }
            }

            const newHead = { x: nx, z: nz };
            this.snake.unshift(newHead);

            // Check Food Collision
            let ate = false;
            if (this.food && nx === this.food.x && nz === this.food.z) {
                ate = true;
                const isGolden = this.food.type === 'golden';
                const pts = (isGolden ? 350 : 100) * this.multiplier;
                this.score += pts;

                if (isGolden) {
                    this.sfx.golden();
                    this.multiplier = Math.min(8, this.multiplier + 1);
                } else {
                    this.sfx.eat();
                }

                // Burst particles
                this.spawnBurstParticles(
                    (nx - GRID_SIZE / 2 + 0.5) * TILE_SIZE,
                    0.45,
                    (nz - GRID_SIZE / 2 + 0.5) * TILE_SIZE,
                    isGolden ? 0xffd700 : 0xff0844
                );

                this.syncMeshesToLength();
                this.spawnFood();

                // Chance to spawn power-up
                if (Math.random() < 0.25) this.spawnPowerup();

                // Speed ramp
                this.stepInterval = Math.max(65, 120 - Math.floor(this.snake.length * 1.5));
            }

            // Check Powerup Pickups
            for (let i = this.powerups.length - 1; i >= 0; i--) {
                const pu = this.powerups[i];
                if (nx === pu.x && nz === pu.z) {
                    this.sfx.powerup();
                    this.activeBuff = { type: pu.type, timer: 7 };
                    this.spawnBurstParticles(
                        (pu.x - GRID_SIZE / 2 + 0.5) * TILE_SIZE,
                        0.45,
                        (pu.z - GRID_SIZE / 2 + 0.5) * TILE_SIZE,
                        pu.type === 'freeze' ? 0x00f2fe : 0xd946ef
                    );
                    this.scene.remove(pu.mesh);
                    this.powerups.splice(i, 1);
                    break;
                }
            }

            if (!ate) {
                this.snake.pop();
            }

            this.updateHud();
        }

        gameOver(reason) {
            this.state = 'gameover';
            this.sfx.crash();
            this.shake = 0.9;

            // Spawn explosion particles for snake body
            this.snake.forEach(s => {
                const wx = (s.x - GRID_SIZE / 2 + 0.5) * TILE_SIZE;
                const wz = (s.z - GRID_SIZE / 2 + 0.5) * TILE_SIZE;
                this.spawnBurstParticles(wx, 0.45, wz, 0x00f2fe, 12);
            });

            // Update Highscore
            const isBest = this.score > this.bestScore;
            if (isBest) {
                this.bestScore = this.score;
                localStorage.setItem('browos_snake3d_best', this.bestScore.toString());
            }

            if (this.dom.overOverlay) {
                this.dom.overOverlay.style.display = 'flex';
                if (this.dom.overScore) this.dom.overScore.textContent = this.score.toLocaleString();
                if (this.dom.overBest) this.dom.overBest.textContent = isBest ? 'NEW HIGH SCORE!' : `Best: ${this.bestScore.toLocaleString()}`;
            }
        }

        spawnBurstParticles(x, y, z, color, count = 24) {
            for (let i = 0; i < count; i++) {
                const geo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
                const mat = new THREE.MeshBasicMaterial({ color: color });
                const mesh = new THREE.Mesh(geo, mat);
                mesh.position.set(x, y, z);
                this.scene.add(mesh);

                const a = Math.random() * Math.PI * 2;
                const sp = Math.random() * 8 + 2;
                this.particles.push({
                    mesh: mesh,
                    vx: Math.cos(a) * sp,
                    vy: Math.random() * 7 + 2,
                    vz: Math.sin(a) * sp,
                    life: 0.65,
                    maxLife: 0.65
                });
            }
        }

        updateParticles(dt) {
            for (let i = this.particles.length - 1; i >= 0; i--) {
                const p = this.particles[i];
                p.life -= dt;
                p.vy -= 16 * dt; // Gravity
                p.mesh.position.x += p.vx * dt;
                p.mesh.position.y += p.vy * dt;
                p.mesh.position.z += p.vz * dt;

                const scale = Math.max(0.01, p.life / p.maxLife);
                p.mesh.scale.set(scale, scale, scale);

                if (p.life <= 0 || p.mesh.position.y < -1) {
                    this.scene.remove(p.mesh);
                    this.particles.splice(i, 1);
                }
            }
        }

        updateCameraTransform(dt) {
            if (!this.camera) return;

            const head = this.snake[0] || { x: GRID_SIZE / 2, z: GRID_SIZE / 2 };
            const hx = (head.x - GRID_SIZE / 2 + 0.5) * TILE_SIZE;
            const hz = (head.z - GRID_SIZE / 2 + 0.5) * TILE_SIZE;

            let targetPos = new THREE.Vector3();
            let lookAtPos = new THREE.Vector3(0, 0, 0);

            if (this.cameraMode === 'isometric') {
                targetPos.set(hx * 0.35, 23, hz * 0.35 + 21);
                lookAtPos.set(hx * 0.2, 0, hz * 0.2);
            } else if (this.cameraMode === 'chase') {
                const backX = -this.direction.x * 6.5;
                const backZ = -this.direction.z * 6.5;
                targetPos.set(hx + backX, 7.5, hz + backZ);
                lookAtPos.set(hx + this.direction.x * 4, 1.2, hz + this.direction.z * 4);
            } else if (this.cameraMode === 'topdown') {
                targetPos.set(0, 31, 0.1);
                lookAtPos.set(0, 0, 0);
            }

            if (dt === 0) {
                this.camera.position.copy(targetPos);
            } else {
                this.camera.position.lerp(targetPos, Math.min(1, dt * 6.5));
            }

            // Screen shake
            if (this.shake > 0) {
                this.shake = Math.max(0, this.shake - dt * 2.5);
                const s = this.shake * 0.7;
                this.camera.position.x += (Math.random() - 0.5) * s;
                this.camera.position.y += (Math.random() - 0.5) * s;
            }

            this.camera.lookAt(lookAtPos);
        }

        updateHud() {
            if (this.dom.score) this.dom.score.textContent = this.score.toLocaleString();
            if (this.dom.length) this.dom.length.textContent = this.snake.length.toString();
            if (this.dom.best) this.dom.best.textContent = this.bestScore.toLocaleString();
            if (this.dom.speed) {
                const spd = Math.round((140 - this.stepInterval) / 10) + 1;
                this.dom.speed.textContent = `${spd}x`;
            }

            if (this.dom.buffTag) {
                if (this.activeBuff) {
                    const tag = this.activeBuff.type === 'freeze' ? '❄ CRYO SLOW' : '👻 GHOST PHASE';
                    this.dom.buffTag.textContent = `${tag} (${this.activeBuff.timer.toFixed(1)}s)`;
                    this.dom.buffTag.style.display = 'block';
                } else {
                    this.dom.buffTag.style.display = 'none';
                }
            }
        }

        // Main game render loop
        loop(time) {
            if (this.destroyed) return;

            const dt = Math.min(0.1, (time - this.lastFrameTime) / 1000);
            this.lastFrameTime = time;

            // Power-up buff timers
            if (this.activeBuff) {
                this.activeBuff.timer -= dt;
                if (this.activeBuff.timer <= 0) {
                    this.activeBuff = null;
                    this.updateHud();
                }
            }

            // Step tick execution
            const currentSpeedInterval = (this.activeBuff && this.activeBuff.type === 'freeze') ? (this.stepInterval * 1.5) : this.stepInterval;
            if (this.state === 'playing' && time - this.lastStepTime >= currentSpeedInterval) {
                this.lastStepTime = time;
                this.step();
            }

            // Interpolation alpha between ticks
            const alpha = Math.min(1, Math.max(0, (time - this.lastStepTime) / currentSpeedInterval));

            // Render smooth snake positions
            for (let i = 0; i < this.snake.length; i++) {
                const cur = this.snake[i];
                const prev = this.prevSnake[i] || cur;
                const mesh = this.snakeMeshes[i];
                if (!mesh) continue;

                const curX = (cur.x - GRID_SIZE / 2 + 0.5) * TILE_SIZE;
                const curZ = (cur.z - GRID_SIZE / 2 + 0.5) * TILE_SIZE;
                const prevX = (prev.x - GRID_SIZE / 2 + 0.5) * TILE_SIZE;
                const prevZ = (prev.z - GRID_SIZE / 2 + 0.5) * TILE_SIZE;

                // Handle wrapping interpolation
                let ix = prevX + (curX - prevX) * alpha;
                let iz = prevZ + (curZ - prevZ) * alpha;
                if (Math.abs(curX - prevX) > TILE_SIZE * 2) ix = curX;
                if (Math.abs(curZ - prevZ) > TILE_SIZE * 2) iz = curZ;

                mesh.position.set(ix, 0.45, iz);

                // Rotate Head toward direction
                if (i === 0) {
                    const angle = Math.atan2(this.direction.x, this.direction.z);
                    mesh.rotation.y = angle;
                }
            }

            // Animate Food & Halo
            if (this.foodGroup) {
                this.foodGroup.rotation.y += dt * 2.2;
                this.foodGroup.position.y = 0.45 + Math.sin(time * 0.005) * 0.12;
                if (this.food && this.food.halo) {
                    this.food.halo.rotation.z += dt * 3.4;
                }
            }

            // Animate Powerup Pickups
            this.powerups.forEach(pu => {
                pu.mesh.rotation.x += dt * 1.8;
                pu.mesh.rotation.y += dt * 2.5;
                pu.mesh.position.y = 0.45 + Math.cos(time * 0.004) * 0.1;
            });

            this.updateParticles(dt);
            this.updateCameraTransform(dt);

            // Render WebGL
            if (this.renderer && this.scene && this.camera) {
                this.renderer.render(this.scene, this.camera);
            }

            this.rafId = requestAnimationFrame((t) => this.loop(t));
        }

        destroy() {
            this.destroyed = true;
            cancelAnimationFrame(this.rafId);
            window.removeEventListener('keydown', this.onKeyDown);
            if (this.resizeObserver) this.resizeObserver.disconnect();

            if (this.scene) {
                this.scene.traverse(o => {
                    if (o.geometry) o.geometry.dispose();
                    if (o.material) {
                        const m = Array.isArray(o.material) ? o.material : [o.material];
                        m.forEach(mat => mat.dispose());
                    }
                });
            }
            if (this.renderer) this.renderer.dispose();
        }
    }

    // Global initializer for BrowOS WindowManager
    window.initSnake3DGame = function(windowElement) {
        if (!windowElement || windowElement._snake3D) return;
        try {
            windowElement._snake3D = new SnakeGame3D(windowElement);
        } catch (e) {
            console.error('[Snake3D] Failed to mount game:', e);
        }
    };

    window.SnakeGame = SnakeGame3D;
})();