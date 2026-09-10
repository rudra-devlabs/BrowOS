    // ===========================================================================
    // GAME — orchestrator: state machine, input, sim loop, window lifecycle
    // ===========================================================================
    /** Respawn points. */
    const HOSPITAL = { x: 1077, z: 2266, heading: Math.PI };      // Bellevue front
    const SPRAY_FEE = 500;

    class Game {
        constructor(windowEl) {
            this.windowEl = windowEl;
            this.win = windowEl.querySelector('.gta-window');
            if (!this.win) return;
            this.canvas = this.win.querySelector('#gta-canvas');
            this.state = 'menu';
            this.time = 0;
            this.destroyed = false;
            this.stats = { kills: 0, maxWanted: 0, distance: 0, earned: 0 };
            this.input = { keys: {}, lookDx: 0, lookDy: 0, fire: false, aim: false, mouseFire: false, mouseAim: false, altAim: false, aShoot: false };
            this.shootMode = 'aim'; // 'aim' = A shoots when aiming with Alt/RMB; 'always' = A always shoots
            this._fPressed = false;
            this._gPressed = false;
            this._camModes = [4.6, 7.6, 2.4];
            this._camMode = 0;
            this._lookIdle = 0;
            this._sprayCd = 0;
            this._abandonCd = 5;
            this._waterT = 0;
            this._smokeT = 0;
            // GPS waypoint guidance.
            this.waypoint = null;   // {x, z}
            this.route = null;      // {pts: [{x,z}...], dist}
            this._routeT = 0;
            this._wpBeacon = null;
            // Pointer-lock mouse capture.
            this._locked = false;
            this._lockSupported = false;
            this._lockToastCd = 0;

            if (!this.initRenderer()) return;
            this.buildMenuScene();
            this.hud = new HudController(this.win);
            this.hud._game = this;
            this.audio = new AudioBus();
            this.bindDom();
            this.bindInput();
            this.refreshMenu();

            this._loadSettings();
            this.clock = performance.now();
            this.rafId = requestAnimationFrame((t) => this.loop(t));
        }

        /* ---- boot ------------------------------------------------------------ */
        initRenderer() {
            if (typeof THREE === 'undefined') { this.fatal('Three.js failed to load.'); return false; }
            try {
                this.renderer = new THREE.WebGLRenderer({
                    canvas: this.canvas,
                    // Keep MSAA enabled: without it, building silhouettes,
                    // road markings, and the player outline become visibly
                    // jagged and shimmer while the camera moves.
                    antialias: true,
                    logarithmicDepthBuffer: false,
                    powerPreference: 'high-performance'
                });
            } catch (e) { this.fatal('WebGL is unavailable in this browser.'); return false; }
            // A small high-DPI allowance removes the soft upscale look without
            // multiplying the framebuffer cost on very dense displays.
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
            // NOTE: vertex colors are authored in display space — no outputEncoding here,
            // or every surface gets gamma-lifted and the ground clips to white.
            this.renderer.setClearColor(0x9db8cc, 1);
            this.scene = new THREE.Scene();
            this.camera = new THREE.PerspectiveCamera(62, 1, 0.6, 950);
            this.camera.position.set(500, 12, 2000);
            this.resize();
            if (typeof ResizeObserver !== 'undefined') {
                this.observer = new ResizeObserver(() => this.resize());
                this.observer.observe(this.win);
            }
            return true;
        }

        buildMenuScene() {
            // Sky dome + soft light so the menu backdrop isn't pure black.
            const { mat } = TexFactory.build();
            this.sharedMat = mat;
            const sky = new THREE.Mesh(new THREE.SphereGeometry(2600, 16, 10), mat.sky);
            sky.position.set(770, 0, 1830);
            this.scene.add(sky);
            this.skyMesh = sky;
            this.scene.fog = new THREE.Fog(0xc8dce8, 260, 950);
        }

        resize() {
            const w = this.win.clientWidth || 640, h = this.win.clientHeight || 480;
            this.renderer.setSize(w, h, false);
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
        }

        _perfEl() {
            if (!this._perfDiv || !document.body.contains(this._perfDiv)) {
                const d = document.createElement('div');
                d.id = 'gta-perf';
                d.style.cssText = 'position:absolute;top:8px;left:8px;z-index:50;pointer-events:none;font:11px/1.5 monospace;color:#7dff8a;background:rgba(0,0,0,0.55);padding:6px 9px;border-radius:8px;display:none;white-space:pre;';
                this.win.appendChild(d);
                this._perfDiv = d;
            }
            return this._perfDiv;
        }
        _refreshPerf() {
            const el = this._perfEl();
            if (!el) return;
            if (this._perfOn && this.renderer) {
                const info = this.renderer.info;
                const fps = this._fpsE ? (1 / this._fpsE) : 0;
                el.style.display = 'block';
                el.textContent = fps.toFixed(0) + ' FPS · ' + (this._fpsE * 1000).toFixed(1) + ' ms\n' +
                    info.render.calls + ' calls · ' + (info.render.triangles / 1000).toFixed(0) + 'k tris\n' +
                    'render x' + Math.min(window.devicePixelRatio || 1, 1.0);
            } else {
                el.style.display = 'none';
            }
        }

        fatal(msg) {
            const el = this.win.querySelector('#gta-fatal');
            if (el) {
                el.style.display = 'flex';
                const m = el.querySelector('#gta-fatal-msg');
                if (m) m.textContent = msg;
            }
        }

        /* ---- settings menu ---------------------------------------------------- */
        /** Load persisted settings and mirror them into every live subsystem. */
        _loadSettings() {
            try {
                const raw = localStorage.getItem(GTA_SETTINGS_KEY);
                if (raw) Object.assign(SETTINGS, GTA_SETTINGS_DEFAULTS, JSON.parse(raw));
            } catch (e) { /* corrupted store — fall back to defaults */ }
            this._applySettings();
        }
        _saveSettings() {
            try { localStorage.setItem(GTA_SETTINGS_KEY, JSON.stringify(SETTINGS)); } catch (e) {}
        }
        /** Push every SETTINGS value into live systems (audio/render/world/input). */
        _applySettings() {
            if (this.audio) this.audio.setVolumes(SETTINGS);
            if (this.renderer) this.renderer.shadowMap.enabled = !!SETTINGS.shadows;
            if (this.scene && this.scene.fog) this.scene.fog.far = SETTINGS.drawDistance ? 950 : 620;
            if (this.traffic) this.traffic.target = Math.round(34 * clamp(SETTINGS.traffic, 0, 2));
            if (this.peds) this.peds.target = Math.round(44 * clamp(SETTINGS.peds, 0, 2));
            if (this.player) this.player.lookSens = clamp(SETTINGS.mouseSens, 0.2, 2.5);
            this._applyPixelRatio();
            this._saveSettings();
        }
        /** Render-resolution tiers: high = native (≤1.25 DPR cap), med = 1.0, low = 0.75. */
        _applyPixelRatio() {
            if (!this.renderer) return;
            const dpr = window.devicePixelRatio || 1;
            const pr = SETTINGS.pixelRatio === 'low' ? 0.75
                : SETTINGS.pixelRatio === 'medium' ? Math.min(dpr, 1.0)
                : Math.min(dpr, 1.25);
            this.renderer.setPixelRatio(pr);
            if (typeof this.resize === 'function') this.resize();
        }

        /* ---- menu / state ---------------------------------------------------- */
        bindDom() {
            const q = (s) => this.win.querySelector(s);
            this.elMenu = q('#gta-menu');
            this.elPause = q('#gta-pause');
            this.elOver = q('#gta-gameover');
            this.elLoading = q('#gta-loading');
            this.elSaveHint = q('#gta-save-hint');
            q('#gta-btn-new').addEventListener('click', () => { this.audio.ensure(); this.startGame(false); });
            q('#gta-btn-continue').addEventListener('click', () => { this.audio.ensure(); this.startGame(true); });
            q('#gta-btn-howto').addEventListener('click', () => {
                const p = q('#gta-howto-panel');
                p.style.display = p.style.display === 'none' ? 'block' : 'none';
            });
            q('#gta-btn-resume').addEventListener('click', () => this.resume());
            q('#gta-btn-save').addEventListener('click', () => this.saveGame());
            q('#gta-btn-load').addEventListener('click', () => this.loadGame());
            q('#gta-btn-quit').addEventListener('click', () => this.quitToMenu());
            q('#gta-btn-respawn').addEventListener('click', () => this.respawn());
            q('#gta-btn-loadgo').addEventListener('click', () => this.loadGame());
            q('#gta-btn-settings').addEventListener('click', () => this.openSettings('menu'));
            q('#gta-btn-settings2').addEventListener('click', () => this.openSettings('pause'));
            this._bindSettings();
            this.canvas.addEventListener('click', () => this.audio.ensure());
            window.addEventListener('beforeunload', () => { if (this.state === 'playing') this.autoSave(); });
        }

        refreshMenu() {
            const q = (s) => this.win.querySelector(s);
            q('#gta-menu-city').textContent = 'Manhattan, 2026';
            SaveSystem.load().then((data) => {
                if (!data || this.destroyed) return;
                q('#gta-menu-money').textContent = '$' + ((data.player && data.player.money) || 0);
                q('#gta-menu-wanted').textContent = ((data.stats && data.stats.maxWanted) || 0) + ' ★';
                const cont = q('#gta-btn-continue');
                cont.disabled = !data.player;
                cont.style.opacity = data.player ? '' : '0.45';
            });
        }

        async startGame(continueGame) {
            if (this.state !== 'menu') return;
            this.teardownWorld();
            this.state = 'loading';
            this.elMenu.style.display = 'flex';
            this.elLoading.textContent = 'Surveying the island…';
            try {
                // Optional GLB/audio pack — silently skipped when absent.
                this.assets = await loadAssetPack();
                this.audio.sampleUrls = this.assets && this.assets.audio;
                this.audio.setRadioTracks(this.assets && this.assets.radio);
                this.audio._samplesQueued = false;
                this.audio._preloadSamples();
                const { mat } = { mat: this.sharedMat };
                const builder = new CityBuilder(mat, this.assets);
                this.builder = builder;
                await builder.buildAsync((label, pct) => {
                    if (!this.destroyed) this.elLoading.textContent = label + '… ' + ((pct * 100) | 0) + '%';
                });
                if (this.destroyed) return;
                // Saved map edits fold into the build before physics indexes it.
                this.mapPatch = await MapEditor.apply(builder);
                this.initWorld();
                MapEditor.initCustomBlocks(this);
                if (continueGame) {
                    const data = await SaveSystem.load();
                    if (data && data.player) this.applySave(data);
                } else {
                    this.stats = { kills: 0, shotsFired: 0, carsStolen: 0, maxWanted: 0 };
                    this._garageInitialized = false;
                }
                this.ensureGarageHypercar(continueGame);
                this.clock = performance.now();
                this.state = 'playing';
                this.elMenu.style.display = 'none';
                this.hud.show(true);
                if (this.player) {
                    this.hud.setStats && this.hud.setStats(this.player);
                    this.hud.setWanted && this.hud.setWanted(this.police ? this.police.wanted : 0);
                }
                this.hud.toast('Welcome to Brow City', '#8ec5ff');
                if (this.physics && this.physics.wasmWorld) {
                    setTimeout(() => { if (this.hud) this.hud.toast('⚡ WASM Zero-GC Physics & Batch Engine: Active', '#34c759'); }, 900);
                } else {
                    setTimeout(() => { if (this.hud) this.hud.toast('⚙ JavaScript Physics Engine: Active (WASM Disabled)', '#ff9f0a'); }, 900);
                }

                if (typeof window !== 'undefined' && window.BrowSettings && typeof window.BrowSettings.subscribe === 'function') {
                    window.BrowSettings.subscribe('wasmAcceleration', (enabled) => {
                        if (!this.physics) return;
                        if (!enabled) {
                            this.physics.wasmWorld = null;
                            if (this.hud) this.hud.toast('⚙ Switched to JS Physics (WASM Disabled)', '#ff9f0a');
                        } else {
                            if (window.BrowPhysicsWasm && typeof window.BrowPhysicsWasm.createWorld === 'function') {
                                this.physics.rebuild(false);
                                if (this.hud) this.hud.toast('⚡ WASM Physics Acceleration Activated', '#34c759');
                            }
                        }
                    });
                }
                const mp = this.mapPatch;
                if (mp && mp.stale) this.hud.toast('Saved map edits skipped — the city layout changed', '#ffb04b');
                else if (mp && mp.count) this.hud.toast(mp.count + ' saved map edits applied', '#3fd0ff');
                setTimeout(() => {
                    if (this.hud && !this.destroyed && this.state === 'playing') this.hud.toast('Press B or F2 — Minecraft Creative Mode (Build & Edit Map)', '#3fd0ff');
                }, 2600);
            } catch (e) {
                this.state = 'menu';
                this.elLoading.textContent = 'Build failed: ' + e.message;
            }
        }

        initWorld() {
            const b = this.builder, mat = this.sharedMat;
            this.scene.add(b.root);
            // Ambient fill + sun + sky fill so deep building canyons remain lit and legible.
            const amb = new THREE.AmbientLight(0xdbe6f0, 0.42);
            this.scene.add(amb);
            const hemi = new THREE.HemisphereLight(0xd8e8ff, 0x9a8f80, 0.48);
            this.scene.add(hemi);
            this.amb = amb;
            this.hemi = hemi;
            const sun = new THREE.DirectionalLight(0xfff1d8, 0.78);
            sun.position.set(180, 300, 105);
            sun.castShadow = true;
            sun.shadow.mapSize.set(2048, 2048);
            sun.shadow.camera.left = -70;
            sun.shadow.camera.right = 70;
            sun.shadow.camera.top = 70;
            sun.shadow.camera.bottom = -70;
            sun.shadow.camera.far = 700;
            sun.shadow.bias = -0.0004;
            // normalBias offsets the shadow sample along the surface normal,
            // which removes the dark speckled "shadow acne" that criss-crosses
            // flat sun-facing walls (the raw bias alone can't, without bloating
            // shadows into peter-panning). 0.5 ~ a few shadow-map texels at
            // city scale.
            sun.shadow.normalBias = 0.5;
            this.scene.add(sun);
            this.scene.add(sun.target);
            this.sun = sun;
            this.dayNight = new DayNightSystem(this);

            this.physics = new PhysicsWorld(b.colliders, b.root, b);
            // Player.
            const rig = new HumanRig(mat.flat, { shirt: [0.25, 0.42, 0.68], pants: [0.18, 0.2, 0.28] },
                this.assets && (this.assets.characters.player || this.assets.characters.ped_street), this.assets);
            this.scene.add(rig.group);
            this.player = new PlayerController(rig, this.physics, this.camera);
            // Systems.
            this.field = new VehicleField(this.scene, mat.flat, this.assets);
            this.field.physics = this.physics;
            this.field.game = this;
            this.builder = b;
            this.streetLampGlowMesh = b.streetLampGlowMesh;
            this.streetLampPoolMesh = b.streetLampPoolMesh;
            this.lightsSys = new TrafficLightSystem(b);
            this.traffic = new TrafficSystem(this.field, b.map, this.lightsSys, this.physics);
            this.police = new PoliceController(this.field, b.map, this.physics, this.traffic, b);
            this.pedR = new PedRenderer(this.scene, mat.flat, 56, this.assets && this.assets.characters && (this.assets.characters.ped || this.assets.characters.ped_street));
            this.peds = new PedSystem(this.pedR, b.map, this.physics, this.field, this.lightsSys);
            this.traffic.peds = this.peds;
            this.gates = new ParkingGateSystem(this.scene, mat.flat, b.map.parkingGates || []);
            this.gates.field = this.field;
            this.gates.peds = this.peds;
            this.villaGate = new VillaGateSystem(b.villaGate || null);
            this.loot = new LootSystem(this.scene, mat);
            this.particles = new ParticleSystem(this.scene, mat);
            this.tracers = new BulletTracerSystem(this.scene);
            const rng = mulberry32(20260904);
            this.traffic.seedParked(rng);
            this.police.seedPatrol(rng);
            this.fx = this.makeFx();
            this.parkingLots = b.map.parkingLots || [];
            this.subwayStations = (b.map && b.map.subwayStations) || [];
            this.gunShops = (b.map && b.map.gunShops) || [];
            this.foodShops = (b.map && b.map.foodShops) || [];
            this.foodStalls = (b.map && b.map.foodStalls) || (b.propSpots && b.propSpots.vendorCarts) || [];
            this.map = b.map;
            this.hospital = (b.map && b.map.hospital) || null;
            this.policeHQ = (b.map && b.map.policeHQ) || null;
            this.initStaffNpcs();
            // Law-enforcement, emergency and transit subsystems.
            this.footCops = new FootCopSystem(this, this.scene, mat, this.assets);
            this.ambulance = new AmbulanceService(this, this.field, b.map, this.physics);
            this.bus = new BusSystem(this, this.scene, mat, this.field, b.map, this.physics, this.hud);
            this._jail = { active: false, mode: null, keys: false, cell: null, escapeT: 0, paid: false, escapeHud: false };
            this._jailGuard = null;
            this._busModalOpen = false;
            this._busPickMode = false;
            // Jail cell for the busted sequence: State Penitentiary block at Metro HQ or Manhattan West Wing.
            if (this.policeHQ && this.policeHQ.id === 'metro_police_hq') {
                this._jailCell = { cx: this.policeHQ.cx + 29.0, cz: this.policeHQ.cz + 17.0, rx: 3.5, rz: 3.5, doorZ: this.policeHQ.cz + 20.5 };
            } else {
                this._jailCell = { cx: 1041, cz: 3072, rx: 2.4, rz: 2.2, doorZ: 3074 };
            }
            this.carjackT = 0;
            this._carjackV = null;
            // Camera behind the spawn (facing North into villa estate courtyard).
            const sy = SPAWN.y !== undefined ? SPAWN.y : 0.2;
            this.camera.position.set(SPAWN.x, sy + 3.8, SPAWN.z + 7.5);
            this.camera.lookAt(SPAWN.x, sy + 1.4, SPAWN.z - 5);
        }

        /** The fx bus shared by every system (particles / audio / hud / crime). */
        makeFx() {
            const g = this, fx = {};
            fx.carImpact = (v, x, y, z) => {
                g.particles.burst('spark', x, y, z, clamp(v / 12, 0.4, 1.4));
                g.audio.impact(v, x, z);
            };
            fx.carDestroyed = (v) => {
                g.particles.burst('boom', v.x, v.y + 1, v.z, 1.3);
                g.audio.boom(v.x, v.z);
                g.peds.alert(v.x, v.z, 40, fx);
                if (g.traffic && g.traffic.alert) g.traffic.alert(v.x, v.z, 40);
                g.police.reportCrime(1, v.x, v.z, fx);
            };
            fx.splash = (x, y, z) => { g.particles.burst('splash', x, y, z, 0.8); g.audio.play('splash', 0.35, 1, x, z, 40, 3); };
            fx.foam = (x, y, z, s) => { g.particles.burst('foam', x, y, z, s || 1); };
            fx.wantedUp = (n) => {
                g.hud.setWanted(n);
                g.audio.wantedUp();
                g.stats.maxWanted = Math.max(g.stats.maxWanted, n);
            };
            fx.wantedDown = (n) => g.hud.setWanted(n);
            fx.copShot = (x, y, z, tx, ty, tz) => {
                g.particles.burst('muzzle', x, y, z, 1);
                g.particles.burst('spark', tx, ty, tz, 0.5);
                g.audio.shot(x, z);
            };
            fx.pedKilled = (p, cause) => {
                g.particles.burst('blood', p.x, p.y + 1.1, p.z, 1);
                g.loot.drop(p.x, p.z, Math.random);
                g.stats.kills++;
                g.peds.alert(p.x, p.z, 26, fx);
                if (g.traffic && g.traffic.alert) g.traffic.alert(p.x, p.z, 26);
                g.audio.scream(p.x, p.z);
                // Witnesses panic and report the crime.
                if (g.peds && g.peds.reportBody) g.peds.reportBody(p, this);
                // An ambulance will come to carry the fallen citizen away.
                if (g.ambulance && g.ambulance.queue) g.ambulance.queue(p.x, p.z);
                if (cause === 'player' || (cause && cause.driver === 'player')) {
                    g.police.reportCrime(1, p.x, p.z, fx);
                }
            };
            fx.lootCollected = (type, amount) => {
                const pl = g.player;
                g.audio.pickup(type === 'cash' || type === 'bag' ? 'cash' : 'item');
                if (type === 'cash') { pl.money += amount; g.stats.earned += amount; g.hud.toast('+$' + amount, '#7dff8a'); }
                else if (type === 'bag') { pl.money += amount; g.stats.earned += amount; g.hud.toast('Duffel bag +$' + amount, '#ffd24b'); }
                else if (type === 'health') { pl.heal(50); g.hud.toast('Health kit +50', '#ff8a80'); }
                else if (type === 'armor') { pl.armor = Math.min(100, pl.armor + 50); g.hud.toast('Armor vest +50', '#8ab4ff'); }
                else if (type === 'ammo') {
                    if (typeof pl.ammo === 'object') {
                        const targetKey = (pl.weapon === 'fist' || pl.weapon === 'bat') ? 'pistol' : pl.weapon;
                        pl.ammo[targetKey] = (pl.ammo[targetKey] || 0) + amount;
                    } else pl.ammo += amount;
                    g.hud.toast('Ammo +' + amount, '#ffd24b');
                }
                else if (type === 'pistol') {
                    if (typeof pl.ammo === 'object') pl.ammo.pistol = (pl.ammo.pistol || 0) + 12;
                    pl.selectWeapon('pistol', g.hud);
                }
                else if (type === 'shotgun') {
                    if (typeof pl.ammo === 'object') pl.ammo.shotgun = (pl.ammo.shotgun || 0) + 8;
                    pl.selectWeapon('shotgun', g.hud);
                }
                else if (type === 'smg') {
                    if (typeof pl.ammo === 'object') pl.ammo.smg = (pl.ammo.smg || 0) + 30;
                    pl.selectWeapon('smg', g.hud);
                }
                else if (type === 'rifle') {
                    if (typeof pl.ammo === 'object') pl.ammo.rifle = (pl.ammo.rifle || 0) + 30;
                    pl.selectWeapon('rifle', g.hud);
                }
                else if (type === 'bat') {
                    pl.selectWeapon('bat', g.hud);
                }
                g.particles.burst('cash', pl.pos.x, pl.pos.y + 1, pl.pos.z, 1);
            };
            fx.playerHurt = () => { g.hud.flash(); g.audio.hurt(); };
            fx.playerInWater = () => { /* handled per-frame in update */ };
            fx.muzzleFlash = (x, y, z) => {
                g.particles.burst('muzzle', x, y, z, 1);
                g.audio.shot(x, z);
                // Drivers scatter from gunfire the same way people do.
                if (g.traffic && g.traffic.alert) g.traffic.alert(x, z, 28);
            };
            // A line of speech over someone's head, and the two small beats that
            // come with a mugging: the wallet hitting the pavement, and a swing.
            fx.bark = (text, x, y, z) => g.hud.bark(text, x, y, z);
            fx.pedDropCash = (p) => {
                g.loot.drop(p.x + (Math.random() - 0.5) * 0.7, p.z + (Math.random() - 0.5) * 0.7,
                    Math.random, 'cash', 10 + ((Math.random() * 7) | 0) * 5);   // $10-40
                g.particles.burst('cash', p.x, p.y + 0.9, p.z, 0.5);
            };
            fx.pedPunch = (p) => {
                g.audio.punch(p.x, p.z);
                const pl = g.player;
                if (pl && !pl.inVehicle && dist2(p.x, p.z, pl.pos.x, pl.pos.z) < 2.2 * 2.2) {
                    pl.damage(6, fx);
                }
            };
            fx.footstep = (x, z) => g.audio.step(x, z);
            fx.pedScream = (x, z) => g.audio.scream(x, z);
            fx.dryFire = () => g.audio.dry();
            fx.skid = (x, z) => {
                const now = performance.now();
                if (!g._lastSkid || now - g._lastSkid > 450) {
                    g._lastSkid = now;
                    g.audio.skid(x, z);
                }
            };
            // Continuous skid: the one-shot above stays for AI cars seen from
            // afar; the player's own car drives the seamless loop instead.
            fx.setSkid = (on, x, z, level) => g.audio.setSkid(on, x, z, level);
            fx.tireSmoke = (x, y, z) => {
                g.particles.burst('tireSmoke', x, y, z, 0.7);
            };
            fx.trafficHorn = (x, z) => {
                g.audio.horn(x, z);
                if (g.peds && g.peds.onHorn) g.peds.onHorn(x, z, 16, fx);
            };
            fx.horn = (x, z) => fx.trafficHorn(x, z);
            fx._hornActive = false;
            fx._hornStartTime = 0;
            fx.setHorn = (on, x, z) => {
                const now = performance.now();
                if (on) {
                    if (!fx._hornActive) {
                        fx._hornActive = true;
                        fx._hornStartTime = now;
                        g.audio.setHorn(true);
                    } else if (now - fx._hornStartTime > 2200) {
                        // Anti-stuck safety cap: auto-kill horn after 2.2 seconds continuous hold
                        g.audio.setHorn(false);
                        return;
                    }
                    if (!g._lastHornPedAlert || now - g._lastHornPedAlert > 350) {
                        g._lastHornPedAlert = now;
                        const hx = x !== undefined ? x : (g.player && g.player.inVehicle ? g.player.inVehicle.x : (g.player ? g.player.pos.x : 0));
                        const hz = z !== undefined ? z : (g.player && g.player.inVehicle ? g.player.inVehicle.z : (g.player ? g.player.pos.z : 0));
                        if (g.peds && g.peds.onHorn) g.peds.onHorn(hx, hz, 25, fx);
                        if (g.traffic && g.traffic.onHorn) g.traffic.onHorn(hx, hz, 25);
                    }
                } else {
                    fx._hornActive = false;
                    g.audio.setHorn(false);
                }
            };
            return fx;
        }

        /* ---- input ----------------------------------------------------------- */
        bindInput() {
            const w = this.windowEl.ownerDocument.defaultView || window;
            this._kd = (e) => {
                this.audio.ensure();
                if (this.state !== 'playing') return;
                // While the map editor is open it owns the keyboard outright.
                if (this.editor && this.editor.on) {
                    if (e.code !== 'F5' && e.code !== 'F12') e.preventDefault();
                    this.input.keys[e.code] = true;
                    if (e.repeat || (e.code !== 'F2' && e.code !== 'KeyB')) this.editor.key(e);
                    else this.editor.toggle();
                    return;
                }
                // Radio browser arrows (repeat OK): ↑↓ pick, swallowed so they
                // don't drive while browsing (→ steers; L toggles repeat).
                if (this._radioBrowser && !this.hud._bigOpen && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) {
                    e.preventDefault();
                    this._radioMove(e.code === 'ArrowUp' ? -1 : 1);
                    return;
                }
                if (e.code === 'Tab' || e.code === 'Space' || e.code === 'AltLeft' || e.code === 'AltRight' || e.key === 'Alt') {
                    e.preventDefault();
                }
                this.input.keys[e.code] = true;

                // [Alt] key: Aim gun
                if (e.code === 'AltLeft' || e.code === 'AltRight' || e.key === 'Alt') {
                    e.preventDefault();
                    this.input.altAim = true;
                    this.input.aim = true;
                    if (this.player && !this.player.inVehicle) {
                        if (this.player.weapon === 'fist' || this.player.weapon === 'bat') {
                            this.player.selectWeapon('pistol', this.hud);
                        }
                        if (typeof this.player.ammo === 'object' && (this.player.ammo[this.player.weapon] || 0) <= 0) {
                            this.player.ammo[this.player.weapon] = 24;
                        }
                        this.player.aiming = true;
                    }
                }

                // [KeyA]: Shoot when aiming with Alt / RMB (or in 'always' shootMode)
                if (e.code === 'KeyA') {
                    const isAiming = !!(this.input.altAim || this.input.aim || e.altKey || this.input.keys.AltLeft || this.input.keys.AltRight || (this.player && this.player.aiming));
                    if (isAiming || this.shootMode === 'always') {
                        e.preventDefault();
                        this.input.aShoot = true;
                        this.input.fire = true;
                        if (this.player && !this.player.inVehicle) {
                            if (this.player.weapon === 'fist' || this.player.weapon === 'bat') {
                                this.player.selectWeapon('pistol', this.hud);
                            }
                            if (typeof this.player.ammo === 'object' && (this.player.ammo[this.player.weapon] || 0) <= 0) {
                                this.player.ammo[this.player.weapon] = 24;
                            }
                            this.handleAttack(0);
                        }
                    }
                }

                if (!e.repeat) {
                    if (e.code === 'F2' || e.code === 'KeyB') {
                        e.preventDefault();
                        if (!this.editor) this.editor = new MapEditor(this);
                        this.editor.toggle();
                        return;
                    }
                    if (e.code === 'F3') {
                        e.preventDefault();
                        this.toggleColliderDebug();
                        return;
                    }
                    if (e.code === 'F4') {
                        e.preventDefault();
                        this._perfOn = !this._perfOn;
                        this._refreshPerf();
                        return;
                    }
                    if (e.code === 'KeyF') this._fPressed = true;
                    if (e.code === 'KeyG') this._gPressed = true;
                    if (e.code === 'KeyH' && this.player && this.player.inVehicle) {
                        const pos = { x: this.player.inVehicle.x, z: this.player.inVehicle.z };
                        if (this.fx && this.fx.setHorn) this.fx.setHorn(true, pos.x, pos.z);
                    }
                    if (e.code === 'KeyE' && this.player && !this.player.inVehicle) {
                        if (this._jail && this._jail.active) { this.interactJail(); return; }
                        if (this._nearHospitalStaff || this._nearHospitalTriage) {
                            this.interactHospital(this._nearHospitalStaff);
                        } else if (this._nearPoliceDesk) {
                            this.interactPoliceDesk();
                        } else if (this._nearPoliceStaff) {
                            this.interactPoliceOfficer(this._nearPoliceStaff);
                        } else if (this._nearGunShop) {
                            this.openGunShop();
                        } else if (this._nearFoodShop || this._nearFoodStall) {
                            this.openFoodShop();
                        } else if (this._nearNpc) {
                            this.interactNpc(this._nearNpc);
                        } else if (this._nearSubway) {
                            this.openSubway();
                        } else if (this._nearBus && this.bus) {
                            this.openBus();
                        }
                    }
                    if (e.code === 'KeyV') {
                        this._camMode = (this._camMode + 1) % this._camModes.length;
                        this.player.camDist = this._camModes[this._camMode];
                    }
                    if (e.code === 'KeyT') {
                        if (this.dayNight) {
                            this.dayNight.advanceTime(3.0);
                            const t = this.dayNight.getTime();
                            const phase = t.hours >= 5 && t.hours < 9 ? 'Morning / Sunrise' :
                                          t.hours >= 9 && t.hours < 17 ? 'Day / Noon' :
                                          t.hours >= 17 && t.hours < 20 ? 'Sunset / Golden Hour' : 'Night';
                            this.hud.toast(`Time: ${t.str} (${phase}) · [T] Cycle Time`, '#ffd54f');
                            if (this.hud && this.hud.setTime) this.hud.setTime(t.hours, t.minutes, t.isDay);
                        }
                    }
                    // M = fullscreen map (GTA convention); N/U = mute.
                    // The bigmap's own capture-phase handler closes the map on
                    // M/Escape, so skip re-opening / pausing while it is open.
                    if (e.code === 'KeyM') {
                        if (!this.hud._bigOpen) this.hud.toggleBigmap(this);
                    }
                    // X drops a pin at the middle of the fullscreen map view
                    // (fallback if clicking ever misbehaves).
                    if (e.code === 'KeyX' && this.hud._bigOpen && this.player) {
                        const hx = this.hud._bigCX, hz = this.hud._bigCZ;
                        if (hx !== null && hx !== undefined && hz !== null && hz !== undefined) {
                            this.setWaypoint(hx, hz);
                        } else {
                            const a = this.player.heading || 0;
                            this.setWaypoint(this.player.pos.x - Math.sin(a) * 200, this.player.pos.z - Math.cos(a) * 200);
                        }
                    }
                    if (this.player && this.player.inVehicle) {
                        const v = this.player.inVehicle;
                        if (e.code === 'Digit1') {
                            v.gearMode = 'manual';
                            v.gear = 1;
                            v.currentGear = 1;
                            this.audio.blip(520, 0.06, 'triangle', 0.25);
                            this.hud.toast('⚙️ Manual Gear 1 (Max ~' + Math.round(v.spec.top * 0.28 * 2.237) + ' MPH · Launch)', '#ffd94d');
                        } else if (e.code === 'Digit2') {
                            v.gearMode = 'manual';
                            v.gear = 2;
                            v.currentGear = 2;
                            this.audio.blip(580, 0.06, 'triangle', 0.25);
                            this.hud.toast('⚙️ Manual Gear 2 (Max ~' + Math.round(v.spec.top * 0.52 * 2.237) + ' MPH · City)', '#ffd94d');
                        } else if (e.code === 'Digit3') {
                            v.gearMode = 'manual';
                            v.gear = 3;
                            v.currentGear = 3;
                            this.audio.blip(660, 0.06, 'triangle', 0.25);
                            this.hud.toast('⚙️ Manual Gear 3 (Max ~' + Math.round(v.spec.top * 0.78 * 2.237) + ' MPH · Cruise)', '#ffd94d');
                        } else if (e.code === 'Digit4') {
                            v.gearMode = 'manual';
                            v.gear = 4;
                            v.currentGear = 4;
                            this.audio.blip(740, 0.06, 'triangle', 0.25);
                            this.hud.toast('⚙️ Manual Gear 4 (Max ~' + Math.round(v.spec.top * 2.237) + ' MPH · Overdrive)', '#ffd94d');
                        } else if (e.code === 'Digit5') {
                            v.gearMode = 'auto';
                            v.gear = 5;
                            this.audio.blip(880, 0.07, 'sine', 0.25);
                            this.hud.toast('⚙️ Automatic Transmission (Dynamic Gears 1-4)', '#5ce1e6');
                        }
                    } else if (this.player) {
                        if (e.code === 'Digit1') this.player.selectWeapon('fist', this.hud);
                        if (e.code === 'Digit2') this.player.selectWeapon('bat', this.hud);
                        if (e.code === 'Digit3') this.player.selectWeapon('pistol', this.hud);
                        if (e.code === 'Digit4') this.player.selectWeapon('shotgun', this.hud);
                        if (e.code === 'Digit5') this.player.selectWeapon('smg', this.hud);
                        if (e.code === 'Digit6') this.player.selectWeapon('rifle', this.hud);
                        if (e.code === 'Digit7') this.player.selectWeapon('sniper', this.hud);
                    }
                    if (e.code === 'KeyQ') this.player.nextWeapon(this.hud);
                    if (e.code === 'KeyO') this.cyclePlayerCharacter();
                    if (e.code === 'KeyN' || e.code === 'KeyU') this.hud.toast(this.audio.toggleMute() ? 'Audio muted' : 'Audio on');
                    if (e.code === 'KeyR' && e.altKey) {
                        this._radioOpen();
                    } else if (e.code === 'KeyR') {
                        // Same controls in and out of the car: on foot this is
                        // the personal player (earbuds), in a car the radio.
                        const st = this.audio.radioNext();
                        const tag = (this.player && this.player.inVehicle) ? '📻' : '🎧';
                        this.hud.toast(!st ? 'No radio tracks — add files to assets/audio/gta/music (see README)' : (st.on ? tag + ' ' + st.title : tag + ' Player off'), '#7ee787');
                        this._updateEarbuds();
                    } else if (e.code === 'KeyL') {
                        const cur = this.audio.radioStatus ? this.audio.radioStatus() : null;
                        const i = cur && cur.idx >= 0 ? cur.idx : 0;
                        if (!this.audio.radioPlayIndex(i)) {
                            this.hud.toast('No playable radio tracks', '#ff8a80');
                        } else {
                            const st = this.audio.radioToggleRepeat(i);
                            if (st) this.hud.toast(st.repeat ? '🔂 Repeat on' : 'Repeat off', '#7ee787');
                        }
                        this._updateEarbuds();
                    }
                    if (e.code === 'Escape' && this._radioBrowser) { this._radioClose(); return; }
                    if ((e.code === 'KeyP' || e.code === 'Escape') && !this.hud._bigOpen) {
                        if (this._subwayModalOpen) {
                            this.hud.closeSubwayModal();
                            this._subwayModalOpen = false;
                            return;
                        }
                        if (this._busModalOpen) {
                            this.closeBus();
                            return;
                        }
                        this.pause();
                    }
                    if (e.code === 'Tab') this.toggleDebug();
                }
            };
            this._ku = (e) => {
                this.input.keys[e.code] = false;
                // Releasing Alt closes the radio browser (R may be released
                // freely to reach the arrows — the list stays while Alt is held).
                if (this._radioBrowser && (e.code === 'AltLeft' || e.code === 'AltRight' || e.key === 'Alt') &&
                    !this.input.keys.AltLeft && !this.input.keys.AltRight) this._radioClose();
                if (e.code === 'AltLeft' || e.code === 'AltRight' || e.key === 'Alt') {
                    e.preventDefault();
                    this.input.keys.AltLeft = false;
                    this.input.keys.AltRight = false;
                    this.input.altAim = false;
                    if (!this.input.mouseAim) this.input.aim = false;
                    if (this.player) this.player.aiming = !!this.input.aim;
                }
                if (e.code === 'KeyA') {
                    this.input.aShoot = false;
                    if (!this.input.mouseFire) this.input.fire = false;
                }
                if (e.code === 'KeyH') {
                    if (this.fx && this.fx.setHorn) {
                        this.fx.setHorn(false);
                    }
                }
            };
            this._wheel = (e) => {
                if (this.player && !this.player.inVehicle && !this.hud._bigOpen) {
                    const p = this.player;
                    // Aiming a scoped weapon: the wheel/trackpad adjusts the scope
                    // zoom (scroll/swipe down = zoom in, up = zoom out) instead of
                    // cycling weapons.
                    if (p.aiming && p.scopedWeapon) {
                        e.preventDefault();
                        p.adjustScope(e.deltaY > 0 ? 1 : -1);
                    } else if (e.deltaY > 0) {
                        p.nextWeapon(this.hud);
                    } else if (e.deltaY < 0) {
                        p.prevWeapon(this.hud);
                    }
                }
            };
            w.addEventListener('keydown', this._kd);
            w.addEventListener('keyup', this._ku);
            w.addEventListener('wheel', this._wheel, { passive: false });
            // Pointer-lock mouse capture: click the canvas to lock, Esc releases.
            // While unlocked the cursor stays free so the minimap / menus work.
            this._lockSupported = !!(this.canvas && typeof this.canvas.requestPointerLock === 'function');
            const doc = this.windowEl.ownerDocument || document;
            this._plc = () => {
                try {
                    this._locked = !!(doc.pointerLockElement && doc.pointerLockElement === this.canvas);
                } catch (e) { this._locked = false; }
            };
            this._ple = () => {
                if (this.time - this._lockToastCd > 5) {
                    this._lockToastCd = this.time;
                    this.hud.toast('Pointer lock blocked — mouse-look still works unlocked', '#ffb04b');
                }
            };
            try {
                doc.addEventListener('pointerlockchange', this._plc);
                doc.addEventListener('pointerlockerror', this._ple);
            } catch (e) { /* older browsers */ }
            this._mm = (e) => {
                if (this.state !== 'playing') return;
                if (this.editor && this.editor.on) {
                    this.editor.mousemove(e);
                    this.input.lookDx += e.movementX || 0;
                    this.input.lookDy += e.movementY || 0;
                    this._lookIdle = 0;
                    return;
                }
                // Gate camera orbit on capture so moving the cursor to the
                // minimap / big map never swings the camera.
                if (this._lockSupported && !this._locked) return;
                this.input.lookDx += e.movementX || 0;
                this.input.lookDy += e.movementY || 0;
                this._lookIdle = 0;
            };
            this._md = (e) => {
                if (this.state !== 'playing') return;
                if (this.editor && this.editor.on) { this.editor.click(e); return; }
                if (e.button === 0) {
                    // First click captures the cursor instead of firing.
                    if (this._lockSupported && !this._locked && !this.hud._bigOpen) {
                        this._requestLock();
                        return;
                    }
                    this.input.mouseFire = true;
                    this.input.fire = true;
                }
                if (e.button === 2) {
                    this.input.mouseAim = true;
                    this.input.aim = true;
                    if (this.player && !this.player.inVehicle) {
                        if (this.player.weapon === 'fist' || this.player.weapon === 'bat') {
                            this.player.selectWeapon('pistol', this.hud);
                        }
                        if (typeof this.player.ammo === 'object' && (this.player.ammo[this.player.weapon] || 0) <= 0) {
                            this.player.ammo[this.player.weapon] = 24;
                        }
                        this.player.aiming = true;
                    }
                }
            };
            this._mu = (e) => {
                if (e.button === 0) {
                    this.input.mouseFire = false;
                    if (!this.input.aShoot) this.input.fire = false;
                }
                if (e.button === 2) {
                    this.input.mouseAim = false;
                    if (!this.input.altAim && !this.input.keys.AltLeft && !this.input.keys.AltRight) {
                        this.input.aim = false;
                    }
                    if (this.player) this.player.aiming = !!this.input.aim;
                }
            };
            this._wh = (e) => {
                if (this.editor && this.editor.on) {
                    e.preventDefault();
                    this.editor.wheel(e);
                }
            };
            this._ctx = (e) => e.preventDefault();
            this.canvas.addEventListener('mousemove', this._mm);
            this.canvas.addEventListener('mousedown', this._md);
            this.canvas.addEventListener('wheel', this._wh, { passive: false });
            w.addEventListener('mouseup', this._mu);
            this.canvas.addEventListener('contextmenu', this._ctx);
            this._blur = () => {
                if (this.state === 'playing') this.pause();
                this.input.keys = {};
                this.input.altAim = false;
                this.input.aShoot = false;
                this.input.fire = false;
                this.input.aim = false;
                if (this.player) this.player.aiming = false;
                if (this.fx && this.fx.setHorn) this.fx.setHorn(false);
            };
            w.addEventListener('blur', this._blur);
            // Closing the whole browser tab (not just the BrowOS window) also
            // fires pagehide — save there so quitting the app keeps progress.
            this._pagehide = () => this.autoSave();
            w.addEventListener('pagehide', this._pagehide);
            this._closing = () => this.destroy();
            this.windowEl.addEventListener('window-closing', this._closing);
        }

        toggleDebug() {
            if (!this.builder) return;
            if (!this._debugLines) {
                const pts = [];
                for (const c of this.builder.colliders) {
                    const x0 = c.x - c.sx / 2, x1 = c.x + c.sx / 2;
                    const y0 = c.y - c.sy / 2, y1 = c.y + c.sy / 2;
                    const z0 = c.z - c.sz / 2, z1 = c.z + c.sz / 2;
                    const cor = [
                        [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
                        [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1],
                    ];
                    const ed = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
                    for (const [a, b] of ed) {
                        pts.push(cor[a][0], cor[a][1], cor[a][2], cor[b][0], cor[b][1], cor[b][2]);
                    }
                }
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
                this._debugLines = new THREE.LineSegments(geo,
                    new THREE.LineBasicMaterial({ color: 0x39ff88, transparent: true, opacity: 0.35 }));
                this._debugLines.frustumCulled = false;
                this.scene.add(this._debugLines);
            }
            this._debugLines.visible = !this._debugLines.visible;
        }

        /* ---- pointer lock ---------------------------------------------------- */
        _requestLock() {
            if (!this._lockSupported || this._locked) return;
            try {
                const r = this.canvas.requestPointerLock();
                if (r && typeof r.catch === 'function') {
                    r.catch(() => {
                        if (this.time - this._lockToastCd > 5) {
                            this._lockToastCd = this.time;
                            this.hud.toast('Pointer lock blocked — mouse-look still works unlocked', '#ffb04b');
                        }
                    });
                }
            } catch (e) { /* keep unlocked fallback */ }
        }

        _exitLock() {
            try {
                const d = this.windowEl.ownerDocument || document;
                if (d.exitPointerLock && d.pointerLockElement) d.exitPointerLock();
            } catch (e) { /* ignore */ }
        }

        /* ---- pause / save / game over ---------------------------------------- */
        pause() {
            if (this.state !== 'playing') return;
            this.state = 'paused';
            this.elPause.style.display = 'flex';
            this.audio.stopLoops();
            this.audio.radioPause();
            this._radioClose();
            this._exitLock();
        }
        resume() {
            if (this.state !== 'paused') return;
            this.state = 'playing';
            this.elPause.style.display = 'none';
            this.elSaveHint.textContent = '';
            // Unconditional: radioResume only acts if pause() actually parked
            // playback, so on-foot earbuds resume just like the car radio.
            this.audio.radioResume();
            this.clock = performance.now();
        }
        saveGame() {
            SaveSystem.save(this).then((ok) => {
                this.elSaveHint.textContent = ok ? 'Game saved ✓' : 'Save failed';
            });
        }
        autoSave() {
            // Persist progress silently when the player leaves the game. Skipped
            // when dead so a "Wasted"/"Busted" screen can't overwrite a good save.
            if (!this.player || this.player.dead) return;
            SaveSystem.save(this);
        }
        loadGame() {
            if (this.state === 'paused') this.resume();
            SaveSystem.load().then((data) => {
                if (!data || !data.player) { this.hud.toast('No save found', '#ff8a80'); return; }
                this.applySave(data);
                this.hud.toast('Save loaded', '#8ec5ff');
            });
        }
        applySave(data) {
            const p = this.player, s = data.player;
            // If the saved player position is the legacy default spawn point at Times Square, update it to the villa!
            if (s.x >= 495 && s.x <= 505 && s.z >= 1980 && s.z <= 1990) {
                s.x = SPAWN.x;
                s.y = SPAWN.y !== undefined ? SPAWN.y : 28.0;
                s.z = SPAWN.z;
                s.heading = SPAWN.heading;
            }
            p.pos.set(s.x, s.y !== undefined ? s.y : 0.2, s.z);
            p.heading = s.heading;
            p.camYaw = s.heading;
            p.vel.set(0, 0, 0);
            p.health = s.health; p.armor = s.armor; p.money = s.money;
            p.weapon = s.weapon || 'fist'; p.ammo = s.ammo || 0;
            p.dead = false;
            if (data.stats) this.stats = Object.assign(this.stats, data.stats);
            if (data.radio && this.audio && typeof this.audio.restoreRadioState === 'function') {
                this.audio.restoreRadioState(data.radio);
            }
            if (this.player.inVehicle) this.exitVehicle(true);
            this.loot.clear();
            this.particles.clear();
            this.police.wanted = 0;
            this.hud.setWanted(0);

            // Restore saved garage vehicles
            if (data.garageVehicles && Array.isArray(data.garageVehicles)) {
                this.restoreGarageVehicles(data.garageVehicles);
            }
            if (data.garageInitialized !== undefined) {
                this._garageInitialized = !!data.garageInitialized;
            }
        }
        isInsideGarage(x, z, y) {
            if (this.parkingLots) {
                for (let i = 0; i < this.parkingLots.length; i++) {
                    const lot = this.parkingLots[i];
                    if (lot.id === 'villa_garage') {
                        const minX = Math.min(lot.x0 !== undefined ? lot.x0 : lot.x1, lot.x1 !== undefined ? lot.x1 : lot.x2, lot.x2);
                        const maxX = Math.max(lot.x0 !== undefined ? lot.x0 : lot.x1, lot.x1 !== undefined ? lot.x1 : lot.x2, lot.x2);
                        const minZ = Math.min(lot.z0 !== undefined ? lot.z0 : lot.z1, lot.z1 !== undefined ? lot.z1 : lot.z2, lot.z2);
                        const maxZ = Math.max(lot.z0 !== undefined ? lot.z0 : lot.z1, lot.z1 !== undefined ? lot.z1 : lot.z2, lot.z2);
                        if (x >= minX - 0.5 && x <= maxX + 0.5 && z >= minZ - 0.5 && z <= maxZ + 0.5) {
                            if (y !== undefined && y !== null) {
                                if (y >= 27.5 && y <= 33.0) return true;
                            } else {
                                return true;
                            }
                        }
                    }
                }
            }
            // Strict interior room bounds for Villa garage (behind doors at z=1513.2)
            if (x >= -777.5 && x <= -764.5 && z >= 1501.0 && z <= 1513.2) {
                if (y !== undefined && y !== null) {
                    return (y >= 27.5 && y <= 33.0);
                }
                return true;
            }
            return false;
        }
        getGarageVehicles() {
            if (!this.field || !this.field.vehicles) return [];
            const result = [];
            for (let i = 0; i < this.field.vehicles.length; i++) {
                const v = this.field.vehicles[i];
                if (!v || v.dead || v.gone) continue;
                if (this.isInsideGarage(v.x, v.z, v.y)) {
                    result.push({
                        type: v.type,
                        x: Number(v.x.toFixed(3)),
                        y: Number(Math.max(v.y, 28.26).toFixed(3)),
                        z: Number(v.z.toFixed(3)),
                        heading: Number(v.heading.toFixed(3)),
                        color: v.color || (v.spec && v.spec.paint) || 0xffffff,
                        hp: v.hp !== undefined ? v.hp : (v.spec ? v.spec.hp : 100),
                        maxHp: v.maxHp !== undefined ? v.maxHp : (v.spec ? v.spec.hp : 100),
                    });
                }
            }
            return result;
        }
        restoreGarageVehicles(savedList) {
            if (!this.field || !Array.isArray(savedList)) return;
            // 1. Despawn any ambient/non-player cars currently inside the garage bounds
            for (let i = this.field.vehicles.length - 1; i >= 0; i--) {
                const v = this.field.vehicles[i];
                if (v && !v.isPlayerVehicle && v.driver !== 'player' && this.isInsideGarage(v.x, v.z, v.y)) {
                    v.isGarageVehicle = false;
                    v.safeParked = false;
                    this.field.remove(v);
                }
            }

            // 2. Spawn each saved garage vehicle
            for (let i = 0; i < savedList.length; i++) {
                const sv = savedList[i];
                if (!sv || !sv.type || !VEHICLE_TYPES[sv.type]) continue;
                // Snap to solid garage floor slab (floor top is at y = 28.26)
                let spawnY = (sv.y !== undefined && sv.y >= 28.25) ? sv.y : 28.26;
                if (this.physics && this.physics.groundAt) {
                    const gy = this.physics.groundAt(sv.x, sv.z, 30.0, 0);
                    if (gy !== null && gy >= 28.0 && gy <= 30.5) {
                        spawnY = Math.max(gy, 28.26);
                    }
                }
                const v = this.field.spawn(sv.type, sv.x, sv.z, sv.heading, {
                    y: spawnY,
                    color: sv.color,
                    parked: true,
                });
                if (v) {
                    v.x = sv.x;
                    v.y = spawnY;
                    v.z = sv.z;
                    v.heading = sv.heading;
                    v.color = sv.color;
                    v.hp = (sv.hp !== undefined) ? sv.hp : (v.spec ? v.spec.hp : 100);
                    v.maxHp = (sv.maxHp !== undefined) ? sv.maxHp : (v.spec ? v.spec.hp : 100);
                    v.damaged = (v.hp < v.maxHp);
                    v.parked = true;
                    v.safeParked = true;
                    v.isGarageVehicle = true;
                    v._parkRewarded = true;
                    v.speed = 0;
                    v.vx = 0; v.vy = 0; v.vz = 0;
                    this.field._color.set(sv.color);
                    this.field.pools[v.type].setColorAt(v.idx, this.field._color);
                    this.field.pools[v.type].instanceColor.needsUpdate = true;
                    this.field.writeMatrix(v);
                }
            }
        }
        ensureGarageHypercar(isContinue) {
            if (!this.field) return;
            const existing = this.getGarageVehicles();
            if (existing && existing.length > 0) {
                // If existing car is sunken from an earlier session/save, lift it to the floor slab
                for (let j = 0; j < this.field.vehicles.length; j++) {
                    const v = this.field.vehicles[j];
                    if (v && this.isInsideGarage(v.x, v.z, v.y) && v.y < 28.25) {
                        v.y = 28.26;
                        this.field.writeMatrix(v);
                    }
                }
                this._garageInitialized = true;
                return;
            }
            if (isContinue && this._garageInitialized) return;

            const type = 'supercar';
            const color = 0xd62828; // Torino Crimson Red
            const defaultCar = [{
                type,
                x: -770.9,
                y: 28.26,
                z: 1507.5,
                heading: Math.PI,
                color,
                hp: (typeof VEHICLE_TYPES !== 'undefined' && VEHICLE_TYPES[type] && VEHICLE_TYPES[type].hp) || 700,
                maxHp: (typeof VEHICLE_TYPES !== 'undefined' && VEHICLE_TYPES[type] && VEHICLE_TYPES[type].hp) || 700,
            }];
            this.restoreGarageVehicles(defaultCar);
            this._garageInitialized = true;
        }
        quitToMenu() {
            this.autoSave();
            this.teardownWorld();
            this.state = 'menu';
            this.elPause.style.display = 'none';
            this.elOver.style.display = 'none';
            this.hud.show(false);
            this.elMenu.style.display = 'flex';
            this.refreshMenu();
        }
        onWasted() {
            this.endGame('WASTED', 'You bit the big one.', '#ff3b30');
            this.audio.wasted();
        }
        onBusted() {
            this.startJail();
        }

        /* ---- jail / bail sequence ------------------------------------------- */
        startJail() {
            if (this._jail && this._jail.active) return;
            const p = this.player;
            if (p.inVehicle) this.exitVehicle(true);
            this._exitLock();
            this.audio.stopLoops();
            this.audio.radioStop();
            this._radioClose();
            // Locked up in the West Wing holding cell.
            const cell = this._jailCell;
            // Save the current trip's money so bail is affordable-ish.
            this._suspectCash = Math.round(p.money * 100) / 100;
            p.money = Math.round(p.money * 100) / 100;
            this.hud.setStats && this.hud.setStats(p);
            this._jail.active = true;
            this._jail.mode = 'lobby';
            this._jail.keys = false;
            this._jail.cellOpen = false;
            this._jail.guard = 0;
            this._jail.guardDir = 1;
            this._jail.escapeT = 0;
            this._jail.paid = false;
            // Park the player dead-centre in the cell, facing the bars.
            p.pos.set(cell.cx, 0.25, cell.cz + 1.4);
            p.vel.set(0, 0, 0);
            p.heading = Math.PI; // face the door
            p.camYaw = Math.PI;
            p.dead = false;
            this.camera.position.set(cell.cx, 2.2, cell.cz + 4);
            this.camera.lookAt(cell.cx, 1.2, cell.cz);
            // Clear the field so the escape isn't swarmed mid-cutscene.
            this.police.wanted = 0;
            this.hud.setWanted(0);
            for (const c of this.police.cruisers.slice()) this.field.remove(c);
            this.police.cruisers.length = 0;
            if (this.footCops && this.footCops.cops) {
                for (let i = this.footCops.cops.length - 1; i >= 0; i--) this.footCops.remove(this.footCops.cops[i]);
            }
            this.audio.busted && this.audio.busted();
            this.hud.showJailOverlay({
                bail: this._bailFee(),
                canBail: p.money >= this._bailFee(),
                onBail: () => this.payBail(),
                onEscape: () => this.chooseEscape(),
            });
        }

        _bailFee() {
            // Cap the fee so a broke player is never soft-locked out of the
            // escape choice, but a rich one actually has to pay up.
            return Math.min(2000, Math.max(150, Math.round(this._suspectCash * 0.4)));
        }

        chooseEscape() {
            if (!this._jail || !this._jail.active) return;
            this._jail.mode = 'keys';
            this.hud.closeJailOverlay();
            // The hallway officer (drops the keys on their belt) starts pacing.
            if (this.footCops) {
                const cell = this._jailCell;
                const guard = this.footCops.spawn(cell.cx, cell.doorZ - 1.6, 0, 0, {
                    mode: 'guard',
                    range: 16,
                    guard: { x: cell.cx, z: cell.doorZ - 2.2 },
                    health: 80,
                });
                if (guard) {
                    this._jailGuard = guard;
                    guard.jailKey = true;
                    guard.jailSpawn = (cell.doorZ - 1.6);
                    guard.docile = true;   // paces, doesn't shoot while you're caged
                    guard.jailDir = 1;
                    guard.x = cell.cx;
                    guard.z = cell.doorZ - 1.6;
                }
            }
            this.hud.showJailHud('Escape mode: grab the keys from the hallway officer', '#ffd54f');
        }

        updateJail(dt) {
            const g = this;
            const p = this.player;
            const cell = this._jailCell;
            if (!p) return;
            // Hallway officer pacing past the cell (the one who carries the keys).
            if (this._jailGuard && !this._jailGuard.dead) {
                const grd = this._jailGuard;
                const door = cell.doorZ;
                grd.z += grd.jailDir * 0.7 * dt;
                if (grd.z > door + 2.2) grd.jailDir = -1;
                if (grd.z < door - 5.2) grd.jailDir = 1;
                grd.x = cell.cx;
                grd.heading = grd.heading;
            } else if (this._jailGuard && this._jailGuard.dead) {
                // Officer killed — keys spill onto the floor.
                const grd = this._jailGuard;
                if (grd.jailKey && !grd.jailKeysDropped) {
                    grd.jailKeysDropped = true;
                    this._jail.keys = true;
                    this.hud.showJailHud('🗝️ You grabbed the jail keys from the officer', '#57ddba');
                }
            }

            // Keep the player contained.
            p.vel.set(0, 0, 0);
            if (this._jail.mode === 'lobby') {
                // Hard-locked in the centre; can only choose bail/escape.
                p.pos.set(cell.cx, p.pos.y, cell.cz + 1.4);
                return;
            }
            if (this._jail.mode === 'keys') {
                // Free to move inside the cell, not past the closed door yet.
                p.pos.x = clamp(p.pos.x, cell.cx - 1.7, cell.cx + 1.7);
                p.pos.z = clamp(p.pos.z, cell.cz - 0.5, cell.doorZ - 0.5);
                // Prompt: grab keys / open door.
                const nearDoor = p.pos.z > cell.doorZ - 1.6;
                if (!this._jail.keys) {
                    if (this._jailGuard && !this._jailGuard.dead && Math.abs(this._jailGuard.z - p.pos.z) < 1.8) {
                        this.hud.setPrompt('[E] Grab the officer’s jail keys');
                    } else if (nearDoor) {
                        this.hud.setPrompt('[E] Pry the bars (no keys yet)');
                    } else if (!this.input.keys.KeyE) {
                        this.hud.setPrompt('Wait for the officer to pass the door…');
                    }
                } else {
                    this.hud.setPrompt(nearDoor ? '[E] Unlock & Leave the Cell' : 'Bring the keys to the door');
                }
            }
            // mode === 'escape': the door is open, player is out in the HQ.
            if (this._jail.mode === 'escape') {
                const outside = this._outsideHQ(p.pos.x, p.pos.z);
                if (outside) { this.finishJail(true); return; }
                if (!this._jail.escapeHud) {
                    this._jail.escapeHud = true;
                    this.hud.showJailHud('🚨 KILL YOUR WAY OUT OF THE PRECINCT', '#ff8a80');
                }
                // Keep spawning a couple of hostile guards while inside the HQ.
                if (this.footCops) {
                    const guards = this.footCops.cops.filter((c) => c.hostile);
                    if (guards.length < 3) {
                        const base = this._jailCell;
                        this.footCops.spawn(base.cx + 38, base.cz + 4, 0, 0, {
                            mode: 'guard', range: 40, health: 70, hostile: true,
                            guard: { x: base.cx + 38, z: base.cz + 4 },
                        });
                    }
                }
            }
        }

        interactJail() {
            const cell = this._jailCell;
            const p = this.player;
            if (!this._jail || !this._jail.active) return;
            if (this._jail.mode === 'keys' && !this._jail.keys) {
                const grd = this._jailGuard;
                // Grab keys from a nearby (living) officer, or pry if they fell.
                if (grd && !grd.dead && Math.abs(grd.z - p.pos.z) < 2.0 && Math.hypot(grd.x - p.pos.x, grd.z - p.pos.z) < 2.6) {
                    this._jail.keys = true;
                    grd.dead = true; // disarmed
                    if (this.footCops) this.footCops.remove(grd);
                    this._jailGuard = null;
                    this.hud.showJailHud('🗝️ You swiped the jail keys', '#57ddba');
                    if (grd.jailKey && this.audio && this.audio.pickup) this.audio.pickup();
                    return;
                }
                this.hud.toast('No officer in reach — they pass by the door', '#ffd54f');
                return;
            }
            if (this._jail.mode === 'keys' && this._jail.keys) {
                const nearDoor = p.pos.z > cell.doorZ - 1.8;
                if (nearDoor) {
                    this._jail.cellOpen = true;
                    this._jail.mode = 'escape';
                    this.hud.closeJailHud();
                    this.hud.setPrompt(null);
                    this.audio.jailBreak && this.audio.jailBreak();
                    this.hud.toast('🔓 Cell door open — RUN!', '#ff8a80');
                    // The precinct officers now know you're out.
                    this.police.reportCrime(5, cell.cx, cell.doorZ, this.fx);
                } else {
                    this.hud.toast('Walk to the cell door first', '#ffd54f');
                }
            }
        }

        _outsideHQ(x, z) {
            const cell = this._jailCell;
            return x < cell.cx - 70 || x > cell.cx + 70 || z < cell.cz - 70 || z > cell.cz + 70;
        }

        payBail() {
            if (!this._jail || !this._jail.active) return;
            const fee = this._bailFee();
            if (this.player.money < fee) {
                this.hud.toast('Not enough cash for bail — take the hard way', '#ff8a80');
                return;
            }
            this._jail.paid = true;
            this.player.money = Math.round((this.player.money - fee) * 100) / 100;
            this.finishJail(false);
        }

        finishJail(escaped) {
            if (!this._jail || !this._jail.active) return;
            this.hud.closeJailOverlay();
            this.hud.closeJailHud();
            if (this._jailGuard) { this.footCops && this.footCops.remove(this._jailGuard); this._jailGuard = null; }
            // Release the player at the police HQ entrance.
            const cell = this._jailCell;
            this.player.pos.set(cell.cx, 0.25, cell.cz - 16);
            this.player.vel.set(0, 0, 0);
            this.player.heading = 0;
            this.player.camYaw = 0;
            this.player.dead = false;
            this.camera.position.set(cell.cx, 2.5, cell.cz - 12);
            this.camera.lookAt(cell.cx, 1.2, cell.cz);
            this.police.wanted = 0;
            this.hud.setWanted(0);
            for (const c of this.police.cruisers.slice()) this.field.remove(c);
            this.police.cruisers.length = 0;
            if (this.footCops && this.footCops.cops) {
                for (let i = this.footCops.cops.length - 1; i >= 0; i--) {
                    const c = this.footCops.cops[i];
                    if (c.hostile) this.footCops.remove(c);
                }
            }
            this._jail.active = false;
            this._jail.mode = null;
            this.state = 'playing';
            this.hud.show(true);
            if (escaped) {
                this.hud.toast('🔥 JAILBREAK! You busted out of the precinct', '#ff8a80');
                this.audio.wasted && this.audio.wasted(); // reuse a horn
            } else {
                this.hud.toast('Bail paid — you walk free of the precinct', '#57ddba');
            }
            this.hud.setStats && this.hud.setStats(this.player);
            this.clock = performance.now();
        }
        endGame(title, sub, color) {
            if (this.state !== 'playing') return;
            this.state = 'over';
            const q = (s) => this.win.querySelector(s);
            q('#gta-go-title').textContent = title;
            q('#gta-go-title').style.color = color;
            q('#gta-go-sub').textContent = sub;
            q('#gta-go-cash').textContent = '$' + this.player.money;
            q('#gta-go-wanted').textContent = this.stats.maxWanted + ' ★';
            q('#gta-go-kills').textContent = this.stats.kills;
            this.elOver.style.display = 'flex';
            this.audio.stopLoops();
            this.audio.radioStop();
            this._radioClose();
            this._exitLock();
        }
        respawn() {
            const p = this.player;
            p.dead = false;
            p.health = 100;
            p.armor = 0;
            p.money = Math.max(0, p.money - 100); // hospital bill
            p.pos.set(HOSPITAL.x, 0.2, HOSPITAL.z);
            p.heading = HOSPITAL.heading;
            p.camYaw = HOSPITAL.heading;
            p.vel.set(0, 0, 0);
            if (p.inVehicle) this.exitVehicle(true);
            this.police.wanted = 0;
            this.hud.setWanted(0);
            for (const c of this.police.cruisers.slice()) this.field.remove(c);
            this.police.cruisers.length = 0;
            this.elOver.style.display = 'none';
            this.state = 'playing';
            this.hud.toast('Hospital bill: $100', '#ff8a80');
            this.clock = performance.now();
        }

        /* ---- vehicles -------------------------------------------------------- */
        tryEnterExit() {
            const g = this;
            const p = this.player;
            if (p.inVehicle) { this.exitVehicle(false); return; }
            const v = this.field.nearest(p.pos.x, p.pos.z, 3.4);
            if (!v || v.dead) return;
            if (v.driver === 'ai' || v.driver === 'police') {
                const wasAi = (v.driver === 'ai');
                // Immediately claim the vehicle so traffic / police loops do not despawn it during the animation
                v.driver = 'player';
                v.isPlayerVehicle = true;
                v.ai = null;
                v.parked = false;
                v.tempPark = false;
                v.dropOff = false;
                v.wantsDrive = false;
                v.claimedBy = null;
                if (!wasAi) {
                    const i = this.police.cruisers.indexOf(v);
                    if (i !== -1) this.police.cruisers.splice(i, 1);
                }
                this._startCarjack(v, wasAi);
                return;
            }
            this._enterVehicle(v);
        }
        _startCarjack(v, wasAi) {
            const p = this.player;
            this._carjackV = v;
            this._carjackAi = wasAi;
            this.carjackTotal = 1.30;
            this.carjackT = 1.30;
            this._carjackGrappled = false;
            this._carjackEjected = false;
            this._carjackSlammed = false;
            this.hud.toast('Carjacking…', '#ffd27f');
            if (this.audio && this.audio.doorOpen) {
                this.audio.doorOpen(v.x, v.z);
            }
            v.doorAngle = 0.15;
            if (this.field && this.field.updateDoor) this.field.updateDoor(v);
        }
        _ejectDriver(v, civilian) {
            const rx = Math.cos(v.heading), rz = -Math.sin(v.heading);
            const fx_ = -Math.sin(v.heading), fz_ = -Math.cos(v.heading);
            const ex = v.x - rx * (v.spec.W * 0.5 + 0.6) + fx_ * (v.spec.L * 0.08);
            const ez = v.z - rz * (v.spec.W * 0.5 + 0.6) + fz_ * (v.spec.L * 0.08);
            let driver = null;
            if (this.peds && this.peds.spawn) {
                driver = this.peds.spawn(ex, ez, Math.random);
                if (driver) {
                    driver.state = 'flee';
                    driver.tf = 0;
                    driver.dvx = -rx * 5.2 + (Math.random() - 0.5) * 1.5;
                    driver.dvz = -rz * 5.2 + (Math.random() - 0.5) * 1.5;
                    driver.diveT = 0.95;
                    driver.diveSide = 1;
                    driver.fleeX = v.x - rx * 25;
                    driver.fleeZ = v.z - rz * 25;
                    driver.fleeT = 5.0;
                }
            }
            if (v.spec && v.spec.name) {
                this.hud.toast(civilian ? 'Driver ejected!' : 'Officer thrown from cruiser!', civilian ? '#ffd27f' : '#ff6b6b');
            }
            if (this.fx && this.fx.bark) {
                this.fx.bark(civilian ? 'Hey! That is my ride!' : 'Halt! Step away from the cruiser!', ex, 1.8, ez);
            }
            if (this.audio && this.audio.scream) {
                this.audio.scream(ex, ez);
            }
            if (civilian) {
                this.peds.alert(ex, ez, 20, this.fx);
                this.police.reportCrime(1, v.x, v.z, this.fx);
            } else {
                if (this.police.reportCrime) this.police.reportCrime(3, ex, ez, this.fx);
            }
            return driver;
        }
        updateCarjack(dt) {
            const g = this;
            const p = this.player;
            const v = this._carjackV;
            this.carjackT -= dt;
            const total = this.carjackTotal || 1.30;
            const elapsed = total - this.carjackT;

            if (v && p && p.rig) {
                let phase = 1;
                let phaseProg = 0;
                if (elapsed < 0.35) {
                    phase = 1;
                    phaseProg = elapsed / 0.35;
                    v.doorAngle = phaseProg * 1.15;
                } else if (elapsed < 0.80) {
                    phase = 2;
                    phaseProg = (elapsed - 0.35) / 0.45;
                    v.doorAngle = 1.15 - phaseProg * 0.25;
                    if (!this._carjackGrappled) {
                        this._carjackGrappled = true;
                        if (this.audio && this.audio.grapple) this.audio.grapple(v.x, v.z);
                    }
                    if (elapsed >= 0.58 && !this._carjackEjected) {
                        this._carjackEjected = true;
                        this._ejectDriver(v, this._carjackAi);
                    }
                } else {
                    phase = 3;
                    phaseProg = (elapsed - 0.80) / 0.50;
                    v.doorAngle = Math.max(0, (1 - phaseProg) * 0.90);
                    if (phaseProg >= 0.85 && !this._carjackSlammed) {
                        this._carjackSlammed = true;
                        if (this.audio && this.audio.doorSlam) this.audio.doorSlam(v.x, v.z);
                    }
                }

                const rx = Math.cos(v.heading), rz = -Math.sin(v.heading);
                const fx_ = -Math.sin(v.heading), fz_ = -Math.cos(v.heading);
                const doorX = v.x - rx * (v.spec.W * 0.5 + 0.38) + fx_ * (v.spec.L * 0.08);
                const doorZ = v.z - rz * (v.spec.W * 0.5 + 0.38) + fz_ * (v.spec.L * 0.08);
                p.pos.x = damp(p.pos.x, doorX, 12, dt);
                p.pos.z = damp(p.pos.z, doorZ, 12, dt);
                p.heading = damp(p.heading, v.heading + Math.PI * 0.5, 12, dt);
                p.rig.group.position.set(p.pos.x, p.pos.y, p.pos.z);
                p.rig.group.rotation.y = p.heading;

                p.rig.animate(g.time || 0, {
                    carjack: true,
                    carjackPhase: phase,
                    carjackProgress: phaseProg,
                    baseY: p.pos.y,
                });

                if (this.field && this.field.updateDoor) {
                    this.field.updateDoor(v);
                }
            }

            if (this.carjackT <= 0) {
                this.carjackT = 0;
                this._carjackGrappled = false;
                this._carjackSlammed = false;
                const v = this._carjackV;
                this._carjackV = null;
                if (v) {
                    v.doorAngle = 0;
                    if (this.field && this.field.updateDoor) this.field.updateDoor(null);
                    this._enterVehicle(v);
                }
            }
        }
        /* ---- vehicle-radio browser (hold Alt+R, ↑↓ to pick) ------------------ */
        _radioEsc(s) {
            return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        }
        /** Cover art for a track: explicit thumb, else a same-name image guess. */
        _radioThumb(t) {
            const base = (t.url || '').replace(/\.[^.]+$/, '');
            if (t.thumb) return { url: t.thumb, guess: '' };
            if (!base) return null;
            return { url: base + '.jpg', guess: base + '.png|' + base + '.webp|' + base + '.jpeg' };
        }
        _radioOpen() {
            if (!this.player) return;
            const tracks = (this.audio && this.audio.radioTracks) || [];
            if (!tracks.length) { this.hud.toast('No radio tracks — add files to assets/audio/gta/music (see README)', '#ff8a80'); return; }
            if (this._radioBrowser) return;
            const st = this.audio.radioStatus ? this.audio.radioStatus() : { idx: -1 };
            this._radioSel = st.idx >= 0 ? st.idx : 0;
            const box = document.createElement('div');
            box.style.cssText = 'position:absolute;top:50%;right:18px;transform:translateY(-50%);width:268px;max-height:70%;overflow-y:auto;' +
                'background:rgba(8,12,20,0.9);border:1px solid rgba(126,231,135,0.35);border-radius:12px;' +
                'padding:10px 10px 8px;z-index:60;pointer-events:auto;user-select:none;backdrop-filter:blur(6px);' +
                'box-shadow:0 8px 28px rgba(0,0,0,0.55);font-family:system-ui,-apple-system,sans-serif;';
            box.innerHTML = '<div style="color:#7ee787;font-size:11px;font-weight:800;letter-spacing:1.5px;margin:0 2px 6px;">📻 BROW RADIO</div>' +
                tracks.map((t, i) => {
                    const tn = this._radioThumb(t);
                    return '<div class="gta-radio-row" data-i="' + i + '" style="display:flex;align-items:center;gap:9px;' +
                        'padding:6px;border-radius:8px;cursor:pointer;border:1px solid transparent;">' +
                        '<span class="gta-radio-art" style="width:40px;height:40px;flex:0 0 40px;border-radius:7px;overflow:hidden;' +
                        'background:#1b2637;display:flex;align-items:center;justify-content:center;font-size:18px;color:#7ee787;">' +
                        (tn ? '<img src="' + tn.url + '" data-guess="' + tn.guess + '" alt="" style="width:100%;height:100%;object-fit:cover;display:block;"/>' : '♪') +
                        '</span>' +
                        '<span style="flex:1;min-width:0;"><span style="display:block;color:#fff;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + this._radioEsc(t.title) + '</span>' +
                        '<span class="gta-radio-state" style="display:block;color:#7ee787;font-size:11px;min-height:14px;"></span></span>' +
                        '<span class="gta-radio-eq" style="color:#7ee787;font-size:13px;width:16px;text-align:center;"></span>' +
                        '</div>';
                }).join('') +
                '<div style="color:#8ea2ba;font-size:11px;margin:7px 2px 1px;">Hold <b>Alt</b> · <b>↑↓</b> pick · <b>L</b> repeat · release <b>Alt</b> to play</div>';
            this.hud.hud.appendChild(box);
            this._radioBrowser = { box, tracks };
            for (const img of box.querySelectorAll('img[data-guess]')) {
                img.addEventListener('error', () => {
                    const rest = (img.getAttribute('data-guess') || '').split('|').filter(Boolean);
                    if (rest.length) { img.setAttribute('data-guess', rest.slice(1).join('|')); img.src = rest[0]; }
                    else if (img.parentNode) img.parentNode.textContent = '♪';
                });
            }
            for (const row of box.querySelectorAll('.gta-radio-row')) {
                row.addEventListener('click', (ev) => { ev.stopPropagation(); this._radioMove(parseInt(row.getAttribute('data-i'), 10), true); });
            }
            this._radioRender();
        }
        _radioMove(d, absolute) {
            const b = this._radioBrowser;
            if (!b || !b.tracks.length) return;
            const n = b.tracks.length;
            this._radioSel = absolute ? Math.max(0, Math.min(n - 1, d)) : (this._radioSel + d + n) % n;
            const title = this.audio.radioPlayIndex(this._radioSel);
            if (title === null) { this.hud.toast('No playable radio tracks', '#ff8a80'); this._radioClose(); return; }
            this._radioRender();
        }
        _radioRender() {
            const b = this._radioBrowser;
            if (!b) return;
            const st = this.audio.radioStatus();
            for (const row of b.box.querySelectorAll('.gta-radio-row')) {
                const i = parseInt(row.getAttribute('data-i'), 10);
                const sel = i === this._radioSel, playing = i === st.idx && st.on;
                row.style.background = sel ? 'rgba(126,231,135,0.16)' : 'transparent';
                row.style.borderColor = sel ? 'rgba(126,231,135,0.5)' : 'transparent';
                const eq = row.querySelector('.gta-radio-eq');
                if (eq) eq.textContent = playing ? '▶' : (i === st.repeatIdx ? '🔂' : '');
                const lab = row.querySelector('.gta-radio-state');
                if (lab) lab.textContent = playing ? (i === st.repeatIdx ? 'Repeating' : 'Now playing') : (sel ? 'Release to play' : '');
            }
            const selRow = b.box.querySelector('.gta-radio-row[data-i="' + this._radioSel + '"]');
            if (selRow && selRow.scrollIntoView) { try { selRow.scrollIntoView({ block: 'nearest' }); } catch (e) {} }
        }
        _radioRepeatToggle() {
            const b = this._radioBrowser;
            if (!b || !b.tracks.length) return;
            if (this.audio.radioToggleRepeat(this._radioSel)) this._radioRender();
        }
        _radioClose() {
            const b = this._radioBrowser;
            if (!b) return;
            this._radioBrowser = null;
            try { if (b.box.parentNode) b.box.parentNode.removeChild(b.box); } catch (e) {}
        }
        /** Earbud visibility: on foot + player preference on + tracks exist. */
        _updateEarbuds() {
            const r = this.player && this.player.rig;
            if (!r || typeof r.setEarbuds !== 'function') return;
            const a = this.audio;
            r.setEarbuds(!this.player.inVehicle && !!(a && a._radioOn && a.radioTracks && a.radioTracks.length));
        }
        _enterVehicle(v) {
            const p = this.player;
            if (this.audio && this.audio.doorOpen) this.audio.doorOpen(v.x, v.z);
            setTimeout(() => {
                if (this.audio && this.audio.doorSlam) this.audio.doorSlam(v.x, v.z);
            }, 260);
            v.parked = false;
            v.safeParked = false;
            // Whatever the NPC systems had planned for this car is void, and a
            // car in the player's hands must never be recycled as street
            // dressing however far they drive it.
            v.tempPark = false;
            v.dropOff = false;
            v.wantsDrive = false;
            v.claimedBy = null;
            v.ai = null;
            v.driver = 'player';
            v.isPlayerVehicle = true;
            p.inVehicle = v;
            p.scopeZoom = 1;
            this.camera.fov = p._baseFov;
            this.camera.updateProjectionMatrix();
            p.rig.group.visible = !!(v.spec.isBike || v.spec.isBoat || v.type === 'motorcycle' || v.type.startsWith('bike_') || v.type.startsWith('boat_'));
            if (this.input && this.input.keys) {
                this.input.keys.KeyH = false;
                this.input.keys.KeyE = false;
            }
            if (this.fx && this.fx.setHorn) this.fx.setHorn(false);
            const radioTitle = this.audio.radioEnter();
            this.hud.toast(v.spec.name + ' · [1-4] Gears · [5] Auto · [Space] Handbrake · [H] Horn' + (radioTitle ? ' · 📻 ' + radioTitle : ''), '#c9d4e8');
        }
        exitVehicle(instant) {
            const p = this.player, v = p.inVehicle;
            if (!v) return;
            if (!instant && this.audio && this.audio.doorOpen) {
                this.audio.doorOpen(v.x, v.z);
                setTimeout(() => {
                    if (this.audio && this.audio.doorSlam) this.audio.doorSlam(v.x, v.z);
                }, 280);
            }
            const rx = Math.cos(v.heading), rz = -Math.sin(v.heading);
            p.pos.set(v.x + rx * (v.spec.W / 2 + 0.8), v.y + 0.2, v.z + rz * (v.spec.W / 2 + 0.8));
            p.vel.set(v.speed * -Math.sin(v.heading) * 0.3, 0, v.speed * -Math.cos(v.heading) * 0.3);
            p.heading = v.heading;
            p.inVehicle = null;
            v.driver = null;
            v.isPlayerVehicle = false;
            v.ai = null;
            v.parked = true;
            if (this.isInsideGarage(v.x, v.z, v.y)) {
                v.safeParked = true;
                v.isGarageVehicle = true;
                if (v.y < 28.25) {
                    v.y = 28.26;
                    this.field.writeMatrix(v);
                }
            } else {
                v.safeParked = false;
                v.isGarageVehicle = false;
            }
            v.tempPark = false;
            p.rig.group.visible = true;
            this.camera.fov = p._baseFov;
            this.camera.updateProjectionMatrix();
            if (p.rig.torso) p.rig.torso.rotation.set(0, 0, 0);
            if (p.rig.head) p.rig.head.rotation.set(0, 0, 0);
            if (p.rig.armL) p.rig.armL.rotation.set(0, 0, 0);
            if (p.rig.armR) p.rig.armR.rotation.set(0, 0, 0);
            if (p.rig.legL) p.rig.legL.rotation.set(0, 0, 0);
            if (p.rig.legR) p.rig.legR.rotation.set(0, 0, 0);
            p.rig.group.rotation.set(0, p.heading, 0);
            if (this.input && this.input.keys) this.input.keys.KeyH = false;
            if (this.fx && this.fx.setHorn) this.fx.setHorn(false);
            this.audio.radioExit();
            this._radioClose();
            this._updateEarbuds();
            if (!instant) this.audio.setEngine(false, 0);
            this.autoSave();
        }

        /**
         * Detects when player drives into a parking stall, stops, and parks.
         * Awards $50 bonus, repairs vehicle, protects from despawning, and shows HUD toast.
         * Rewards once per visit (reset only upon completely leaving the parking zone).
         */
        updateParking(dt) {
            const v = this.player.inVehicle;
            if (!v || !this.parkingLots) return;
            let insideLot = null;
            for (let i = 0; i < this.parkingLots.length; i++) {
                const lot = this.parkingLots[i];
                if (v.x >= lot.x1 && v.x <= lot.x2 && v.z >= lot.z1 && v.z <= lot.z2) {
                    insideLot = lot;
                    break;
                }
            }
            const inGarage = (insideLot && insideLot.id === 'villa_garage') || this.isInsideGarage(v.x, v.z, v.y);
            if (!insideLot && !inGarage) {
                v._inParkLot = false;
                v._parkRewarded = false;
                return;
            }
            v._inParkLot = true;
            const sp = Math.abs(v.speed || 0);
            if (sp < 0.7 && !v._parkRewarded) {
                let insideStall = false;
                if (inGarage) {
                    // Villa garage stores vehicles parked inside the actual garage room
                    insideStall = true;
                } else if (insideLot && insideLot.stalls) {
                    for (let j = 0; j < insideLot.stalls.length; j++) {
                        const st = insideLot.stalls[j];
                        if (Math.abs(v.x - st.x) < 2.2 && Math.abs(v.z - st.z) < 3.2) {
                            insideStall = true;
                            break;
                        }
                    }
                }
                if (insideStall) {
                    v._parkRewarded = true;
                    v.parked = true;
                    v.safeParked = true;
                    if (inGarage) {
                        v.isGarageVehicle = true;
                        if (v.y < 28.25) v.y = 28.26;
                    }
                    if (v.hp < (v.maxHp || v.spec.hp || 100) || v.damaged) {
                        v.hp = v.maxHp || v.spec.hp || 100;
                        v.damaged = false;
                        v.dead = false;
                    }
                    this.player.money += 50;
                    if (this.hud && this.hud.setMoney) this.hud.setMoney(this.player.money);
                    if (this.hud && this.hud.setStats) this.hud.setStats(this.player);
                    if (inGarage) {
                        this.hud.toast('🏡 VIP VILLA GARAGE • Vehicle Stored & Game Saved (+$50) ✓', '#ffd700');
                        SaveSystem.save(this);
                    } else {
                        this.hud.toast('🅿️ VEHICLE PARKED • Repaired & Saved (+$50)', '#34c759');
                    }
                    if (this.audio && this.audio.blip) {
                        this.audio.blip(520, 0.12, 'sine', 0.25, 880);
                        setTimeout(() => { if (this.audio && this.audio.blip) this.audio.blip(880, 0.18, 'sine', 0.22, 1040); }, 110);
                    }
                    if (this.particles) this.particles.burst('spark', v.x, v.y + 1.2, v.z, 0.9);
                }
            }
        }

        /* ---- subway transit system -------------------------------------------- */
        updateSubway(dt) {
            const p = this.player;
            if (!p || p.inVehicle || p.dead || !this.subwayStations || this.subwayStations.length === 0) return;
            let near = null, minDist = 4.2;
            for (const st of this.subwayStations) {
                const d = Math.hypot(p.pos.x - st.x, p.pos.z - st.z);
                if (d < minDist) {
                    minDist = d;
                    near = st;
                }
            }
            if (near) {
                this._nearSubway = near;
                if (!this._subwayModalOpen) {
                    this.hud.setPrompt('[E] Enter Subway · MTA Fare $2.75');
                }
            } else {
                if (this._nearSubway && !this._subwayModalOpen) {
                    this.hud.setPrompt(null);
                }
                this._nearSubway = null;
            }
        }

        initStaffNpcs() {
            const matFlat = this.sharedMat && this.sharedMat.flat;
            if (!matFlat) return;
            this.staffNpcs = [];

            const addStaff = (name, role, x, y, z, heading, colors, opts = {}) => {
                let glb = null;
                if (this.assets && this.assets.characters) {
                    const c = this.assets.characters;
                    if (role === 'doctor' || role === 'emt' || role === 'orderly') glb = c.ped_medic || c.ped;
                    else if (role === 'nurse') glb = c.ped_female || c.ped_medic || c.ped;
                    else if (role.startsWith('police')) {
                        if (role === 'police_detective') glb = c.ped_business || c.ped;
                        else if (role === 'police_swat') glb = c.swat || c.cop || c.ped;
                        else glb = c.cop || c.ped;
                    } else if (role === 'gun_clerk') {
                        glb = (name.includes('Tactical')) ? (c.swat || c.ped_worker || c.ped) : (c.ped_worker || c.ped);
                    } else if (role === 'chef' || role === 'vendor') glb = c.ped_worker || c.ped_street || c.ped;
                    else glb = c.ped_business || c.ped;
                }
                const rig = new HumanRig(matFlat, colors, glb, this.assets);
                rig.group.position.set(x, y, z);
                rig.group.rotation.y = heading;
                this.scene.add(rig.group);
                const staff = {
                    name, role,
                    pos: { x, y, z },
                    heading,
                    rig,
                    baseRotY: heading,
                    talkCd: 0,
                    opts,
                    aimReacT: 0
                };
                this.staffNpcs.push(staff);
                return staff;
            };

            // 1. Bellevue Hospital Medical Staff (3 Floors: ER, ICU/Radiology, Surgical/Exec)
            // Floor 1 (ER Lobby & Triage Bays, Y = 0.18)
            addStaff('Dr. Mercer', 'doctor', 1073.5, 0.18, 2221.5, Math.PI, {
                shirt: [0.95, 0.96, 0.98],
                pants: [0.18, 0.22, 0.28],
                skin: [0.92, 0.78, 0.65]
            });
            addStaff('Nurse Clara', 'nurse', 1076.5, 0.18, 2221.5, Math.PI, {
                shirt: [0.35, 0.65, 0.85],
                pants: [0.35, 0.65, 0.85],
                skin: [0.98, 0.84, 0.74]
            });
            addStaff('Orderly Mike', 'orderly', 1085.0, 0.18, 2216.0, -1.57, {
                shirt: [0.45, 0.52, 0.60],
                pants: [0.22, 0.25, 0.30],
                skin: [0.85, 0.70, 0.58]
            });
            addStaff('EMT Martinez', 'emt', 1082.0, 0.18, 2210.0, Math.PI, {
                shirt: [0.88, 0.45, 0.15],
                pants: [0.12, 0.16, 0.22],
                skin: [0.82, 0.65, 0.52]
            });
            // Floor 2 (ICU & Radiology / MRI Diagnostics, Y = 6.2)
            addStaff('Dr. Patel', 'doctor', 1069.0, 6.2, 2228.0, 1.57, {
                shirt: [0.96, 0.96, 0.98],
                pants: [0.20, 0.20, 0.24],
                skin: [0.68, 0.50, 0.38]
            });
            addStaff('Nurse Jackson', 'nurse', 1071.0, 6.2, 2235.0, 0, {
                shirt: [0.22, 0.45, 0.75],
                pants: [0.22, 0.45, 0.75],
                skin: [0.55, 0.38, 0.28]
            });
            addStaff('Dr. Vance', 'doctor', 1085.0, 6.2, 2230.0, -1.57, {
                shirt: [0.92, 0.94, 0.96],
                pants: [0.22, 0.28, 0.38],
                skin: [0.78, 0.62, 0.48]
            });
            addStaff('Nurse Chloe', 'nurse', 1085.0, 6.2, 2238.0, -1.57, {
                shirt: [0.35, 0.65, 0.85],
                pants: [0.35, 0.65, 0.85],
                skin: [0.95, 0.80, 0.70]
            });
            // Floor 3 (Surgical Suites & Chief Executive Office, Y = 12.2)
            addStaff('Dr. Chen', 'doctor', 1069.0, 12.2, 2228.0, 1.57, {
                shirt: [0.18, 0.55, 0.42],
                pants: [0.18, 0.55, 0.42],
                skin: [0.94, 0.82, 0.68]
            });
            addStaff('Nurse Lisa', 'nurse', 1072.0, 12.2, 2228.0, -1.57, {
                shirt: [0.22, 0.45, 0.75],
                pants: [0.22, 0.45, 0.75],
                skin: [0.96, 0.82, 0.72]
            });
            addStaff('Dr. Ramirez', 'doctor', 1085.0, 12.2, 2230.0, -1.57, {
                shirt: [0.92, 0.94, 0.96],
                pants: [0.22, 0.28, 0.38],
                skin: [0.78, 0.62, 0.48]
            });

            // 2. Police Staff (Metro Police Headquarters & State Penitentiary or NYPD 1st Precinct)
            const polHq = (this.map && this.map.policeHQ) || null;
            const polCx = polHq ? polHq.cx : 1028.0;
            const polCz = polHq ? polHq.cz : 3076.0;
            const isMetro = polHq && polHq.id === 'metro_police_hq';

            if (isMetro) {
                // Grand Entrance steps & Lobby Reception Desk (y = 1.20)
                addStaff('Sgt. Callahan', 'police_sgt', polCx - 21.0, 1.20, polCz - 11.5, 0, {
                    shirt: [0.12, 0.18, 0.28], pants: [0.10, 0.14, 0.22], skin: [0.88, 0.75, 0.62]
                });
                addStaff('Officer Davis', 'police_officer', polCx - 17.5, 1.20, polCz - 11.5, 0, {
                    shirt: [0.12, 0.18, 0.28], pants: [0.10, 0.14, 0.22], skin: [0.92, 0.78, 0.65]
                });
                addStaff('Officer Miller', 'police_guard', polCx - 24.5, 1.20, polCz - 11.5, 0, {
                    shirt: [0.10, 0.15, 0.24], pants: [0.08, 0.10, 0.16], skin: [0.82, 0.68, 0.58]
                });
                // Front Guard Check-in Booth at Vehicle Barrier Gate
                addStaff('Officer Brooks', 'police_guard', polCx + 32.0, 0.18, polCz - 39.0, 0, {
                    shirt: [0.10, 0.15, 0.24], pants: [0.08, 0.10, 0.16], skin: [0.72, 0.55, 0.45]
                });
                // Motor Pool & Cruiser Fleet Patrol
                addStaff('Officer Vance', 'police_officer', polCx + 20.0, 0.18, polCz - 20.0, 0, {
                    shirt: [0.12, 0.18, 0.28], pants: [0.10, 0.14, 0.22], skin: [0.65, 0.48, 0.38]
                });
                addStaff('Officer Martinez', 'police_officer', polCx + 36.0, 0.18, polCz - 14.0, 0, {
                    shirt: [0.12, 0.18, 0.28], pants: [0.10, 0.14, 0.22], skin: [0.85, 0.70, 0.58]
                });
                // Detective in Atrium
                addStaff('Detective Rossi', 'police_detective', polCx - 23.0, 1.20, polCz - 8.0, 1.2, {
                    shirt: [0.22, 0.22, 0.24], pants: [0.18, 0.18, 0.20], skin: [0.90, 0.76, 0.64]
                });
                // Captain Higgins at High-Security Prison Sally Port Intake
                addStaff('Capt. Higgins', 'police_sgt', polCx + 8.5, 0.18, polCz + 12.0, 0, {
                    shirt: [0.10, 0.14, 0.22], pants: [0.08, 0.10, 0.16], skin: [0.88, 0.74, 0.60]
                });
            } else {
                addStaff('Sgt. Callahan', 'police_sgt', 1028.0, 0.90, 3083.5, 0, {
                    shirt: [0.12, 0.18, 0.28], pants: [0.10, 0.14, 0.22], skin: [0.88, 0.75, 0.62]
                });
                addStaff('Officer Davis', 'police_officer', 1031.5, 0.90, 3083.5, 0, {
                    shirt: [0.12, 0.18, 0.28], pants: [0.10, 0.14, 0.22], skin: [0.92, 0.78, 0.65]
                });
                addStaff('Officer Miller', 'police_guard', 1024.5, 0.90, 3083.5, 0, {
                    shirt: [0.10, 0.15, 0.24], pants: [0.08, 0.10, 0.16], skin: [0.82, 0.68, 0.58]
                });
                addStaff('Officer Brooks', 'police_guard', 1010.0, 0.18, 3087.0, -1.57, {
                    shirt: [0.10, 0.15, 0.24], pants: [0.08, 0.10, 0.16], skin: [0.72, 0.55, 0.45]
                });
                addStaff('Officer Vance', 'police_officer', 1022.0, 0.18, 3056.5, 0, {
                    shirt: [0.12, 0.18, 0.28], pants: [0.10, 0.14, 0.22], skin: [0.65, 0.48, 0.38]
                });
                addStaff('Officer Martinez', 'police_officer', 1032.0, 0.18, 3056.5, 0, {
                    shirt: [0.12, 0.18, 0.28], pants: [0.10, 0.14, 0.22], skin: [0.85, 0.70, 0.58]
                });
                addStaff('Detective Rossi', 'police_detective', 1016.0, 0.90, 3085.0, 1.2, {
                    shirt: [0.22, 0.22, 0.24], pants: [0.18, 0.18, 0.20], skin: [0.90, 0.76, 0.64]
                });
                addStaff('Capt. Higgins', 'police_sgt', 1028.0, 0.18, 3087.0, Math.PI, {
                    shirt: [0.10, 0.14, 0.22], pants: [0.08, 0.10, 0.16], skin: [0.88, 0.74, 0.60]
                });
            }

            // 3. Kings County Hospital Trauma Center Medical Staff (Outdoor Posts: Front Portico & Ambulance Bays)
            addStaff('Dr. Mercer', 'doctor', 1401.0, 0.18, 3386.0, 0, {
                shirt: [0.95, 0.96, 0.98],
                pants: [0.18, 0.22, 0.28],
                skin: [0.92, 0.78, 0.65]
            });
            addStaff('Nurse Clara', 'nurse', 1397.0, 0.18, 3386.0, 0, {
                shirt: [0.35, 0.65, 0.85],
                pants: [0.35, 0.65, 0.85],
                skin: [0.98, 0.84, 0.74]
            });
            addStaff('EMT Hayes', 'emt', 1374.0, 0.18, 3374.0, -1.57, {
                shirt: [0.88, 0.45, 0.15],
                pants: [0.12, 0.16, 0.22],
                skin: [0.82, 0.65, 0.52]
            });
            addStaff('EMT Jackson', 'emt', 1374.0, 0.18, 3370.0, -1.57, {
                shirt: [0.88, 0.45, 0.15],
                pants: [0.12, 0.16, 0.22],
                skin: [0.75, 0.58, 0.48]
            });
            addStaff('Officer Flores', 'police_officer', 1014.0, 0.18, 3087.0, 0, {
                shirt: [0.16, 0.28, 0.42], pants: [0.10, 0.14, 0.22], skin: [0.86, 0.70, 0.58]
            });
            addStaff('Desk Officer Young', 'police_officer', 1024.0, 0.18, 3085.0, 0, {
                shirt: [0.12, 0.18, 0.28], pants: [0.10, 0.14, 0.22], skin: [0.56, 0.40, 0.32]
            });

            // 3. Ammu-Nation Staff (2 Floors: Retail Showroom, Range & VIP Tactical Vault)
            if (this.gunShops) {
                for (const gs of this.gunShops) {
                    // Floor 1 Showroom clerk
                    addStaff(gs.name + ' Clerk', 'gun_clerk', gs.counterX, 0.18, gs.counterZ - 1.8, 0, {
                        shirt: [0.25, 0.35, 0.22],
                        pants: [0.18, 0.20, 0.18],
                        skin: [0.90, 0.76, 0.64]
                    }, { shopId: gs.id });
                    // Floor 1 Shooting Range Safety Officer
                    addStaff(gs.name + ' Range Master', 'gun_clerk', gs.counterX + 16, 0.18, gs.counterZ - 4.0, -1.57, {
                        shirt: [0.85, 0.25, 0.18],
                        pants: [0.18, 0.20, 0.18],
                        skin: [0.82, 0.65, 0.52]
                    }, { shopId: gs.id });
                    // Floor 2 VIP Tactical Gear Specialist
                    addStaff(gs.name + ' Tactical Specialist', 'gun_clerk', gs.counterX - 10, 5.35, gs.counterZ - 4.0, 1.57, {
                        shirt: [0.15, 0.18, 0.15],
                        pants: [0.12, 0.14, 0.12],
                        skin: [0.78, 0.62, 0.48]
                    }, { shopId: gs.id });
                    // Floor 2 Master Gunsmith
                    addStaff(gs.name + ' Master Armorer', 'gun_clerk', gs.counterX + 12, 5.35, gs.counterZ + 8.0, -1.57, {
                        shirt: [0.35, 0.28, 0.20],
                        pants: [0.15, 0.15, 0.15],
                        skin: [0.86, 0.72, 0.60]
                    }, { shopId: gs.id });
                }
            }

            // 4. Food & Dining Chefs / Baristas (behind dining counters)
            if (this.foodShops) {
                for (const fs of this.foodShops) {
                    const isPizza = fs.id.includes('midtown');
                    const chefName = isPizza ? "Chef Luigi" : (fs.id.includes('downtown') ? "Diner Cook Bob" : "Barista Maya");
                    addStaff(chefName, 'food_clerk', fs.counterX, 0.18, fs.counterZ - 1.8, 0, {
                        shirt: isPizza ? [0.98, 0.98, 0.98] : (fs.id.includes('downtown') ? [0.85, 0.3, 0.2] : [0.3, 0.4, 0.35]),
                        pants: [0.15, 0.15, 0.15],
                        skin: [0.88, 0.72, 0.60]
                    }, { shopId: fs.id });
                }
            }
        }

        updateStaffNpcs(dt) {
            if (!this.staffNpcs || !this.player) return;
            const px = this.player.pos.x, py = this.player.pos.y, pz = this.player.pos.z;
            const aiming = !!this.player.aiming;
            const time = this.time || 0;

            for (const s of this.staffNpcs) {
                if (s.talkCd > 0) s.talkCd -= dt;
                const dx = px - s.pos.x, dz = pz - s.pos.z;
                const dy = Math.abs(py - s.pos.y);
                const d2 = dx * dx + dz * dz;

                // Subtle idle breathing
                if (s.rig && s.rig.torso) {
                    s.rig.torso.position.y = 0.94 + Math.sin(time * 2.4 + s.pos.x) * 0.012;
                }

                // Only turn head / react if roughly on same floor (within 3.2m elevation)
                if (dy < 3.2 && d2 < 49) {
                    const d = Math.sqrt(d2);
                    const targetYaw = Math.atan2(dx, dz);
                    let diffYaw = targetYaw - s.baseRotY;
                    while (diffYaw > Math.PI) diffYaw -= Math.PI * 2;
                    while (diffYaw < -Math.PI) diffYaw += Math.PI * 2;

                    if (s.rig && s.rig.headPivot) {
                        s.rig.headPivot.rotation.y = Math.max(-0.85, Math.min(0.85, diffYaw));
                    }

                    // Aim intimidation reaction
                    if (aiming && d < 7.5) s.aimReacT = 1.6;

                    if (s.aimReacT > 0) {
                        s.aimReacT -= dt;
                        if (s.role === 'gun_clerk') {
                            if (s.rig.armR) s.rig.armR.rotation.x = -1.5;
                            if (s.rig.gun) s.rig.gun.visible = true;
                            if (s.talkCd <= 0) {
                                s.talkCd = 4.0;
                                this.hud.bark("Back off, pal! I'm armed to the teeth!", s.pos.x, 2.0, s.pos.z, '#ff4444');
                            }
                        } else if (s.role === 'food_clerk') {
                            if (s.rig.armL) s.rig.armL.rotation.x = -2.8;
                            if (s.rig.armR) s.rig.armR.rotation.x = -2.8;
                            if (s.talkCd <= 0) {
                                s.talkCd = 4.0;
                                this.hud.bark("Whoa, don't shoot! Take whatever is in the register!", s.pos.x, 2.0, s.pos.z, '#ffea79');
                            }
                        } else if (s.role === 'doctor' || s.role === 'nurse' || s.role === 'orderly' || s.role === 'emt') {
                            if (s.talkCd <= 0) {
                                s.talkCd = 4.0;
                                this.hud.bark(s.name + ": Put that weapon down! This is a medical facility!", s.pos.x, 2.0, s.pos.z, '#ff6666');
                            }
                        } else if (s.role && s.role.startsWith('police')) {
                            if (s.rig.armR) s.rig.armR.rotation.x = -1.5;
                            if (s.rig.gun) s.rig.gun.visible = true;
                            if (s.talkCd <= 0) {
                                s.talkCd = 4.0;
                                this.hud.bark(s.name + ": Drop that weapon immediately, citizen!", s.pos.x, 2.0, s.pos.z, '#4b8bff');
                            }
                        }
                    } else {
                        if (s.rig.gun) s.rig.gun.visible = false;
                        if (s.rig.armL) s.rig.armL.rotation.x = 0;
                        if (s.rig.armR) s.rig.armR.rotation.x = 0;
                    }
                }
            }
        }

        updateShops(dt) {
            this.updateStaffNpcs(dt);
            const p = this.player;
            if (!p || p.inVehicle || p.dead) {
                if (!this._gunShopModalOpen) this._nearGunShop = null;
                if (!this._foodShopModalOpen) { this._nearFoodShop = null; this._nearFoodStall = null; }
                this._nearHospitalTriage = null;
                this._nearHospitalStaff = null;
                this._nearPoliceDesk = null;
                this._nearPoliceStaff = null;
                this._nearNpc = null;
                return;
            }

            const px = p.pos.x, py = p.pos.y, pz = p.pos.z;

            // 1. Hospital Triage Counter Check
            let nearHospTriage = false;
            if (this.map && this.map.hospital) {
                const d = Math.hypot(px - this.map.hospital.triageX, pz - this.map.hospital.triageZ);
                const dy = Math.abs(py - 0.18);
                if (d < this.map.hospital.radius && dy < 2.5) nearHospTriage = true;
            }
            this._nearHospitalTriage = nearHospTriage;

            // 2. Hospital Medical Staff Check (Approach ANY doctor, nurse, orderly, EMT on their floor)
            let nearHospStaff = null, minHospD = 4.2;
            if (this.staffNpcs) {
                for (const s of this.staffNpcs) {
                    if (s.role === 'doctor' || s.role === 'nurse' || s.role === 'orderly' || s.role === 'emt') {
                        const dy = Math.abs(py - s.pos.y);
                        if (dy > 2.8) continue;
                        const d = Math.hypot(px - s.pos.x, pz - s.pos.z);
                        if (d < minHospD) { minHospD = d; nearHospStaff = s; }
                    }
                }
            }
            this._nearHospitalStaff = nearHospStaff;

            // 3. Police Desk Check (Sgt. Callahan)
            let nearPolDesk = false;
            if (this.map && this.map.policeHQ) {
                const d = Math.hypot(px - this.map.policeHQ.deskX, pz - this.map.policeHQ.deskZ);
                const dy = Math.abs(py - 0.18);
                if (d < this.map.policeHQ.radius && dy < 2.5) nearPolDesk = true;
            }
            this._nearPoliceDesk = nearPolDesk;

            // 4. Police Staff Check (Any other officer, guard, detective on their floor)
            let nearPolStaff = null, minPolD = 3.6;
            if (this.staffNpcs) {
                for (const s of this.staffNpcs) {
                    if (s.role && s.role.startsWith('police') && s.role !== 'police_sgt') {
                        const dy = Math.abs(py - s.pos.y);
                        if (dy > 2.8) continue;
                        const d = Math.hypot(px - s.pos.x, pz - s.pos.z);
                        if (d < minPolD) { minPolD = d; nearPolStaff = s; }
                    }
                }
            }
            this._nearPoliceStaff = nearPolStaff;

            // 5. Gun Shops check (Ground floor counter and Floor 2 tactical counter)
            let nearGun = null, minGunD = 5.5;
            if (this.gunShops) {
                for (const gs of this.gunShops) {
                    const d1 = Math.hypot(px - gs.counterX, pz - gs.counterZ);
                    const dy1 = Math.abs(py - 0.18);
                    const d2 = Math.hypot(px - (gs.counterX - 10), pz - (gs.counterZ - 4));
                    const dy2 = Math.abs(py - 5.35);
                    if (d1 < minGunD && dy1 < 2.5) { minGunD = d1; nearGun = gs; }
                    else if (d2 < minGunD && dy2 < 2.5) { minGunD = d2; nearGun = gs; }
                }
            }

            // 6. Food Shops / Restaurants check
            let nearFood = null, minFoodD = 5.5;
            if (this.foodShops) {
                for (const fs of this.foodShops) {
                    const d = Math.hypot(px - fs.counterX, pz - fs.counterZ);
                    if (d < minFoodD) { minFoodD = d; nearFood = fs; }
                }
            }

            // 7. Street Vendor Food Carts check
            let nearStall = null, minStallD = 3.8;
            if (!nearFood && this.foodStalls) {
                for (const st of this.foodStalls) {
                    const d = Math.hypot(px - st.x, pz - st.z);
                    if (d < minStallD) { minStallD = d; nearStall = st; }
                }
            }

            // 8. Nearest Roaming Pedestrian NPC check
            let nearPed = null, minPedD = 2.8;
            if (this.peds && this.peds.renderer && this.peds.renderer.peds) {
                for (const ped of this.peds.renderer.peds) {
                    if (ped.state === 'dead') continue;
                    const d = Math.hypot(px - ped.x, pz - ped.z);
                    if (d < minPedD) {
                        minPedD = d;
                        nearPed = ped;
                    }
                }
            }
            this._nearNpc = nearPed;

            if (!this._gunShopModalOpen) this._nearGunShop = nearGun;
            if (!this._foodShopModalOpen) { this._nearFoodShop = nearFood; this._nearFoodStall = nearStall; }

            // HUD Action Prompts
            if (!this._gunShopModalOpen && !this._foodShopModalOpen && !this._subwayModalOpen) {
                if (this._nearHospitalStaff || this._nearHospitalTriage) {
                    const hp = Math.round(p.health);
                    const docName = this._nearHospitalStaff ? this._nearHospitalStaff.name : 'Dr. Mercer';
                    if (hp < 100) {
                        this.hud.setPrompt('[E] ' + docName + ' · Medical Treatment ($100)');
                    } else {
                        this.hud.setPrompt('[E] ' + docName + ' · Speak with Medical Staff');
                    }
                } else if (this._nearPoliceDesk) {
                    const wanted = (this.police && this.police.wanted) || 0;
                    if (wanted > 0) {
                        const fine = wanted * 250;
                        this.hud.setPrompt('[E] NYPD Desk Sergeant · Pay Bail & Clear Wanted ($' + fine + ')');
                    } else {
                        this.hud.setPrompt('[E] NYPD Desk Sergeant · Speak with Sgt. Callahan');
                    }
                } else if (this._nearPoliceStaff) {
                    const title = this._nearPoliceStaff.role === 'police_detective' ? 'Detective' : 'Officer';
                    this.hud.setPrompt('[E] ' + this._nearPoliceStaff.name + ' · Speak with NYPD ' + title);
                } else if (nearGun) {
                    this.hud.setPrompt('[E] Ammu-Nation · Buy Weapons, Ammo & Armor');
                } else if (nearFood) {
                    this.hud.setPrompt('[E] ' + nearFood.name + ' · Order Food & Eat (Restore HP)');
                } else if (nearStall) {
                    this.hud.setPrompt('[E] Street Vendor Cart · Grab a Quick Bite (Restore HP)');
                } else if (this._nearNpc) {
                    this.hud.setPrompt('[E] Talk to Citizen');
                } else if (!this._nearSubway) {
                    // Handled by other systems
                }
            }
        }

        interactHospital(staff) {
            const p = this.player;
            if (!p) return;
            const cost = 100;
            const hp = Math.round(p.health);
            const staffName = staff ? staff.name : 'Dr. Mercer';
            const staffPos = staff ? staff.pos : { x: 1073.5, y: 0.18, z: 2221.5 };

            if (hp >= 100) {
                if (this.audio && this.audio.pedMumble) this.audio.pedMumble(1.1);
                const normalBarks = [
                    staffName + ': "Vitals are 100% normal! Blood pressure, pulse, and oxygen all optimal."',
                    staffName + ': "You are in peak physical health! No medical intervention required."',
                    staffName + ': "Looking healthy as ever! Stay safe out there on Manhattan streets."',
                    staffName + ': "No trauma detected. Keep eating healthy and stay out of crossfire."'
                ];
                const bark = normalBarks[(Math.random() * normalBarks.length) | 0];
                this.hud.bark(bark, staffPos.x, 2.0, staffPos.z, '#a8f5ff');
                return;
            }

            let msg = '';
            let deducted = 0;
            if (p.money >= cost) {
                p.money -= cost;
                deducted = cost;
                msg = 'Treated by ' + staffName + ' at Bellevue ER! Health fully restored (-$' + cost + ').';
            } else if (p.money > 0) {
                deducted = p.money;
                p.money = 0;
                msg = 'Subsidized ER treatment by ' + staffName + '! Health fully restored (-$' + deducted + ').';
            } else {
                msg = 'Emergency charity care by ' + staffName + '! Health fully restored (pro-bono).';
            }
            p.health = 100;
            if (this.hud) {
                this.hud.setStats(p);
                this.hud.toast(msg, '#2ecc71');
            }
            if (this.audio && this.audio.healChime) this.audio.healChime();

            const drBarks = [
                staffName + ': "Wounds treated and disinfected! You are back to 100%."',
                staffName + ': "Internal bleeding stopped and vitals stabilized. Good as new!"',
                staffName + ': "Administered plasma and sterile dressings. Take it easy out there!"',
                staffName + ': "All patched up! Try to avoid bullets and reckless crashes today."'
            ];
            const drBark = drBarks[(Math.random() * drBarks.length) | 0];
            this.hud.bark(drBark, staffPos.x, 2.0, staffPos.z, '#a8f5ff');
        }

        interactPoliceDesk() {
            const p = this.player;
            if (!p) return;
            const wanted = (this.police && this.police.wanted) || 0;

            if (wanted === 0) {
                if (this.audio && this.audio.pedMumble) this.audio.pedMumble(0.85);
                const sgtBarks = [
                    "NYPD 1st Precinct. Keep the peace and obey city laws, citizen.",
                    "No active warrants on your record. Have a safe day in Manhattan.",
                    "If you see suspicious syndicate activity, report it to dispatch.",
                    "Drive safely on FDR Drive and watch your speed."
                ];
                const bark = sgtBarks[(Math.random() * sgtBarks.length) | 0];
                this.hud.bark(bark, 1028.0, 2.0, 3068.0, '#7eccff');
                return;
            }

            const fine = wanted * 250;
            if (p.money >= fine) {
                p.money -= fine;
                this.police.wanted = 0;
                this.police.heat = 0;
                if (this.police.cruisers) {
                    for (const c of this.police.cruisers) {
                        if (c.driver === 'ai') c.pursuit = false;
                    }
                }
                if (this.hud) {
                    this.hud.setWanted(0);
                    this.hud.setStats(p);
                    this.hud.toast('Bail of $' + fine + ' paid! Wanted level cleared.', '#4b8bff');
                }
                if (this.audio && this.audio.policeBribe) this.audio.policeBribe();
                const sgtBarks = [
                    "Bail processed and charges cleared. Next time you're going into the holding cell.",
                    "Fine logged. All NYPD units stand down. Keep your record clean.",
                    "Record wiped clean. Don't let me catch you disturbing Manhattan again."
                ];
                const bark = sgtBarks[(Math.random() * sgtBarks.length) | 0];
                this.hud.bark(bark, 1028.0, 2.0, 3068.0, '#7eccff');
            } else {
                if (this.audio && this.audio.pedMumble) this.audio.pedMumble(0.8);
                this.hud.bark('You need $' + fine + ' for bail! Get that cash before we lock you up!', 1028.0, 2.0, 3068.0, '#ff4444');
            }
        }

        interactPoliceOfficer(officer) {
            if (!officer || !this.player) return;
            if (this.audio && this.audio.pedMumble) this.audio.pedMumble(0.85);
            const wanted = (this.police && this.police.wanted) || 0;
            const aiming = !!this.player.aiming;

            if (aiming) {
                this.hud.bark(officer.name + ': "Holster that weapon right now, citizen!"', officer.pos.x, 2.0, officer.pos.z, '#ff4444');
                return;
            }
            if (wanted > 0) {
                this.hud.bark(officer.name + ': "You have an active warrant! Go see Sgt. Callahan at the front desk!"', officer.pos.x, 2.0, officer.pos.z, '#ffaa44');
                return;
            }

            const LINES = {
                police_guard: [
                    officer.name + ': "Holding cells and armory are restricted. Keep moving."',
                    officer.name + ': "Prisoners are in lockup. Obey the law or you are next in line."',
                    officer.name + ': "High-security wing. No unauthorized civvies past this line."'
                ],
                police_detective: [
                    officer.name + ': "Working a major syndicate case in Chinatown. Keep your head down."',
                    officer.name + ': "Evidence points to organized car theft rings. Be careful with your vehicle."',
                    officer.name + ': "If you hear about street racing or contraband on FDR Drive, tip us off."'
                ],
                police_officer: [
                    officer.name + ': "NYPD 1st Precinct. Keeping Manhattan streets safe 24/7."',
                    officer.name + ': "Drive carefully and watch out for pedestrians on the crosswalks."',
                    officer.name + ': "Patrols are active across Midtown, Chinatown, and Financial District."',
                    officer.name + ': "Report any reckless drivers or syndicate activity immediately."'
                ]
            };
            const pool = LINES[officer.role] || LINES.police_officer;
            const line = pool[(Math.random() * pool.length) | 0];
            this.hud.bark(line, officer.pos.x, 2.0, officer.pos.z, '#7eccff');
        }

        interactNpc(ped) {
            if (!ped || ped.state === 'dead' || !this.player) return;

            const px = this.player.pos.x, pz = this.player.pos.z;
            ped.moveHeading = Math.atan2(px - ped.x, pz - ped.z);
            ped.heading = ped.moveHeading;
            ped.startleT = 0;
            ped.waitT = 3.5;

            if (this.audio && this.audio.pedMumble) {
                const pitch = ped.role === 'jogger' ? 1.2 : (ped.role === 'senior' ? 0.8 : 1.0);
                this.audio.pedMumble(pitch);
            }

            const wanted = (this.police && this.police.wanted) || 0;
            const aiming = !!this.player.aiming;

            let dialogue = '';
            if (wanted >= 2) {
                const wantedLines = [
                    "Wait... aren't you on the news?! Stay away from me!",
                    "NYPD is looking all over for you, man! Get back!",
                    "I don't know you, I saw nothing, leave me alone!",
                    "Someone call 911! It's the fugitive!"
                ];
                dialogue = wantedLines[(Math.random() * wantedLines.length) | 0];
                ped.state = 'flee';
                ped.fleeX = px; ped.fleeZ = pz;
                ped.fleeT = 4.0;
            } else if (aiming) {
                const gunLines = [
                    "Whoa! Put the gun down, man! I got kids!",
                    "Take whatever you want, just don't shoot!",
                    "Are you crazy?! Put that thing away!",
                    "Don't shoot! I'm just an innocent bystander!"
                ];
                dialogue = gunLines[(Math.random() * gunLines.length) | 0];
                ped.state = 'surrender';
                ped.surrT = 3.0;
            } else {
                const role = ped.role || 'casual';
                const DIALOGUE_BY_ROLE = {
                    tourist: [
                        "Excuse me! Which way to Times Square?",
                        "Wow, the skyscrapers are so tall! Is this 5th Avenue?",
                        "Could you take a quick photo of me in front of the diner?",
                        "I love New York! Do you know where I can get a genuine bagel?"
                    ],
                    executive: [
                        "I'm late for an acquisition meeting on Wall Street, make it quick.",
                        "Market's down 200 points today, I really don't have time.",
                        "My coffee alone costs more than your watch. Move along.",
                        "I have a conference call in 3 minutes, please excuse me."
                    ],
                    jogger: [
                        "Puff... puff... on mile eight, can't break my pace!",
                        "Heart rate's 155 bpm, trying to beat my Central Park record!",
                        "Great running weather today! Keep on moving!",
                        "Hydration is key! Catch you at the marathon!"
                    ],
                    senior: [
                        "Back in the 70s, the subway was only a nickel...",
                        "The city moves so fast nowadays. Slow down and enjoy the park.",
                        "Good afternoon, young man. Nice to see friendly folks.",
                        "Mind your manners in Manhattan, kiddo."
                    ],
                    worker: [
                        "Hard hat zone, buddy! Watch out for falling debris.",
                        "Union break in five minutes, need a hot cup of joe.",
                        "We're repaving 8th Avenue tomorrow, traffic's gonna be wild.",
                        "Watch your step around the steel beams, pal!"
                    ],
                    casual: [
                        "Yo, what's good in Brow City today?",
                        "Nice day out in Manhattan. Watch out for NYPD speed traps.",
                        "Hey, you got any spare change for a pizza slice?",
                        "I'm walkin' here! Catch the game later tonight?"
                    ]
                };
                const lines = DIALOGUE_BY_ROLE[role] || DIALOGUE_BY_ROLE['casual'];
                dialogue = lines[(Math.random() * lines.length) | 0];
            }

            this.hud.bark(dialogue, ped.x, ped.y + 2.0, ped.z, '#ffea79');
        }

        openGunShop(shop) {
            const target = shop || this._nearGunShop || (this.gunShops && this.gunShops[0]);
            if (!target || this._gunShopModalOpen || !this.player) return;
            this._nearGunShop = target;
            this._gunShopModalOpen = true;
            this._exitLock();
            this.hud.showGunShopModal(
                target,
                (item) => this.buyGunShopItem(item),
                () => { this._gunShopModalOpen = false; }
            );
        }

        openFoodShop(shop) {
            const target = shop || this._nearFoodShop || this._nearFoodStall || (this.foodShops && this.foodShops[0]);
            if (!target || this._foodShopModalOpen || !this.player) return;
            this._nearFoodShop = target;
            this._foodShopModalOpen = true;
            this._exitLock();
            this.hud.showFoodShopModal(
                target,
                (item) => this.eatFoodItem(item),
                () => { this._foodShopModalOpen = false; }
            );
        }

        buyGunShopItem(item) {
            const p = this.player;
            if (!p) return;
            if (p.money < item.price) {
                this.hud.toast('Insufficient funds! Need $' + item.price, '#ff4b3e');
                if (this.audio && this.audio.blip) this.audio.blip(180, 0.15, 'sawtooth', 0.2, 120);
                return false;
            }

            p.money -= item.price;
            if (this.audio && this.audio.buyChime) this.audio.buyChime();

            if (item.type === 'melee' || item.type === 'firearm') {
                p.acquireWeapon(item.id);
                p.selectWeapon(item.id, this.hud);
                if (item.ammo) {
                    p.ammo[item.id] = (p.ammo[item.id] || 0) + item.ammo;
                }
            } else if (item.type === 'armor') {
                p.armor = 100;
            } else if (item.type === 'ammo') {
                p.ammo[item.weapon] = (p.ammo[item.weapon] || 0) + item.ammo;
            }

            this.hud.setStats(p);
            this.hud.toast('Purchased ' + item.name + ' (-$' + item.price + ')', '#39ff88');
            return true;
        }

        eatFoodItem(item) {
            const p = this.player;
            if (!p) return;
            if (p.money < item.price) {
                this.hud.toast('Insufficient funds! Need $' + item.price, '#ff4b3e');
                return false;
            }

            p.money -= item.price;
            const healed = Math.min(100 - p.health, item.heal || item.health || 25);
            p.health = Math.min(100, p.health + (item.heal || item.health || 25));

            if (this.audio) {
                if (item.type === 'drink' && this.audio.drinkSip) this.audio.drinkSip();
                else if (this.audio.eatChomp) this.audio.eatChomp();
            }

            // Brief screen heal flash if flashEl exists
            if (this.hud && this.hud.flashEl) {
                this.hud.flashEl.style.background = 'rgba(57, 255, 136, 0.22)';
                this.hud.flashEl.style.opacity = '1';
                setTimeout(() => { if (this.hud && this.hud.flashEl) this.hud.flashEl.style.opacity = '0'; }, 180);
            }

            this.hud.setStats(p);
            const msg = (item.icon || '🍔') + ' ' + item.name + ' (+' + (healed > 0 ? healed : (item.heal || item.health || 25)) + ' HP, -$' + item.price + ')';
            this.hud.toast(msg, '#39ff88');
            return true;
        }

        openSubway() {
            if (!this._nearSubway || this._subwayModalOpen || !this.player) return;
            this._subwayModalOpen = true;
            this._exitLock();
            this.hud.showSubwayModal(
                this.subwayStations,
                this._nearSubway,
                (dest) => {
                    this._subwayModalOpen = false;
                    const fare = 2.75;
                    if (this.player.money >= fare) {
                        this.player.money = Math.round((this.player.money - fare) * 100) / 100;
                        this.hud.toast('Subway fare -$2.75', '#8ec5ff');
                    } else {
                        this.hud.toast('Fare evaded! 🚔', '#ff8a80');
                        this.police.reportCrime(1, this.player.pos.x, this.player.pos.z, this.fx);
                    }
                    this.audio.subwayChime();
                    this.hud.showSubwayRide(dest, () => {
                        this.player.pos.set(dest.x, 0.25, dest.z);
                        this.player.vel.set(0, 0, 0);
                        this.player.heading = dest.ry || 0;
                        this.camera.position.set(dest.x, 2.5, dest.z + 4);
                        this.camera.lookAt(dest.x, 1.2, dest.z);
                        this.hud.toast('Arrived at ' + dest.name, '#57ddba');
                    });
                },
                () => {
                    this._subwayModalOpen = false;
                }
            );
        }

        /* ---- bus transit system -------------------------------------------- */
        updateBusNear(dt) {
            const p = this.player;
            if (!p || p.inVehicle || p.dead || !this.bus) { this._nearBus = null; return; }
            const near = this.bus._near(p);
            if (near && this.bus.phase !== 'enroute' && this.bus.phase !== 'atStop') {
                this._nearBus = near;
                if (!this._busModalOpen && !this._subwayModalOpen) {
                    this.hud.setPrompt('[E] Board Brow City Bus ($2) · ride anywhere');
                }
            } else {
                if (this._nearBus && !this._busModalOpen) this.hud.setPrompt(null);
                this._nearBus = null;
            }
        }

        openBus() {
            if (!this._nearBus || this._busModalOpen || this._subwayModalOpen || !this.player) return;
            const riding = this.bus.phase === 'enroute' || this.bus.phase === 'atStop';
            if (riding) { this.hud.toast('A bus is already coming — wait for it', '#ffd54f'); return; }
            this._busModalOpen = true;
            this._exitLock();
            this.hud.showBusModal(
                this.bus.stops,
                (dest) => {
                    this._busModalOpen = false;
                    if (dest && dest.map) {
                        this._busPickMode = true;
                        this.hud.openBigmap(this);
                        this.hud.toast('Tap any green B marker to choose a bus destination', '#57ddba');
                        return;
                    }
                    this.closeBus();
                    this.bus._startBusRide(dest);
                },
                () => { this._busModalOpen = false; }
            );
        }

        closeBus() {
            this._busModalOpen = false;
            this._busPickMode = false;
            this.hud.closeBusModal();
        }

        switchPlayerCharacter(characterKey) {
            if (!this.assets || !this.assets.characters || !this.player || !this.player.rig) return;
            const glb = this.assets.characters[characterKey];
            if (!glb) return;
            const curPos = this.player.pos.clone();
            const curHeading = this.player.heading;
            const curWeapon = this.player.weapon;

            this.scene.remove(this.player.rig.group);

            const matFlat = (this.sharedMat && this.sharedMat.flat) || (this.builder && this.builder.mat && this.builder.mat.flat);
            const colors = { shirt: [0.25, 0.42, 0.68], pants: [0.18, 0.2, 0.28] };
            const newRig = new HumanRig(matFlat, colors, glb, this.assets);
            newRig.group.position.set(curPos.x, curPos.y, curPos.z);
            newRig.group.rotation.y = curHeading;
            if (curWeapon && newRig.setWeaponMesh) newRig.setWeaponMesh(curWeapon);
            this.scene.add(newRig.group);

            this.player.rig = newRig;
            this._currentCharKey = characterKey;

            const titles = {
                ped_female: '✨ Feminine Citizen',
                player: 'Street Hero',
                cop: 'NYPD Patrol Officer',
                swat: 'Tactical SWAT Enforcer',
                ped_street: 'Urban Streetwear',
                ped_business: 'Corporate Executive',
                ped_worker: 'City Construction Crew',
                ped_medic: 'Bellevue Paramedic',
                ped: 'Standard Civilian',
            };
            const name = titles[characterKey] || characterKey;
            if (this.hud) this.hud.toast('👤 Character: ' + name, '#ffd24b');
        }

        cyclePlayerCharacter() {
            const roster = ['ped_female', 'player', 'cop', 'swat', 'ped_street', 'ped_business', 'ped_worker', 'ped_medic', 'ped'];
            const curIdx = roster.indexOf(this._currentCharKey || 'player');
            const nextIdx = (curIdx + 1) % roster.length;
            this.switchPlayerCharacter(roster[nextIdx]);
        }

        /* ---- combat ---------------------------------------------------------- */
        handleAttack(dt) {
            const p = this.player;
            if (!this.input.fire || p.inVehicle) return;
            const shot = p.fire(this.fx);
            if (!shot) return;
            if (shot.type === 'punch') {
                if (shot.weapon === 'bat') {
                    this.audio.impact(10, shot.x, shot.z);
                    this.particles.burst('spark', shot.x, shot.y, shot.z, 0.6);
                } else {
                    this.audio.punch(shot.x, shot.z);
                    this.particles.burst('spark', shot.x, shot.y, shot.z, 0.35);
                }
                for (const ped of this.pedR.peds) {
                    if (ped.state === 'dead') continue;
                    if (dist2(ped.x, ped.z, shot.x, shot.z) < shot.r * shot.r) {
                        this.peds.kill(ped, this.fx, 'player');
                        this.audio.impact(shot.weapon === 'bat' ? 14 : 8, ped.x, ped.z);
                        return;
                    }
                }
                return;
            }
            if (shot.type === 'shotgun') {
                this.peds.alert(p.pos.x, p.pos.z, 45, this.fx);
                for (const pellet of shot.pellets) {
                    let bestT = pellet.range, hitPed = null, hitVeh = null;
                    const ray = { x: shot.x, y: shot.y, z: shot.z, dx: pellet.dx, dy: pellet.dy, dz: pellet.dz };
                    for (const ped of this.pedR.peds) {
                        if (ped.state === 'dead') continue;
                        const t = rayPointDist(ray, ped.x, ped.y + 1.0, ped.z, 0.55);
                        if (t !== null && t < bestT) { bestT = t; hitPed = ped; hitVeh = null; }
                    }
                    for (const v of this.field.vehicles) {
                        if (v === p.inVehicle) continue;
                        const t = rayPointDist(ray, v.x, v.y + 0.7, v.z, Math.max(v.spec.L, v.spec.W) * 0.45);
                        if (t !== null && t < bestT) { bestT = t; hitVeh = v; hitPed = null; }
                    }
                    const endX = shot.x + pellet.dx * bestT;
                    const endY = shot.y + pellet.dy * bestT;
                    const endZ = shot.z + pellet.dz * bestT;

                    // Visible 3D bullet tracer streak
                    if (this.tracers) this.tracers.spawn(shot.x, shot.y, shot.z, endX, endY, endZ, 'shotgun');

                    if (hitPed) {
                        this.peds.kill(hitPed, this.fx, 'player');
                        this.particles.burst('blood', hitPed.x, hitPed.y + 1.1, hitPed.z, 1.2);
                    } else if (hitVeh) {
                        hitVeh.hp -= pellet.damage * 0.6;
                        this.particles.burst('spark', endX, endY, endZ, 0.6);
                        if (hitVeh.driver === 'police') this.police.reportCrime(2, hitVeh.x, hitVeh.z, this.fx);
                        if (hitVeh.hp <= 0 && !hitVeh.dead) { hitVeh.dead = true; this.fx.carDestroyed(hitVeh); }
                    } else if (bestT >= pellet.range - 0.5) {
                        this.particles.burst('spark', endX, endY, endZ, 0.4);
                        this.particles.burst('debris', endX, endY, endZ, 0.3);
                    }
                }
                return;
            }
            // Raycast firearms (Pistol, SMG, Rifle)
            this.peds.alert(p.pos.x, p.pos.z, 30, this.fx);
            let bestT = shot.range, hitPed = null, hitVeh = null, hitCop = null;
            for (const ped of this.pedR.peds) {
                if (ped.state === 'dead') continue;
                const t = rayPointDist(shot, ped.x, ped.y + 1.0, ped.z, 0.55);
                if (t !== null && t < bestT) { bestT = t; hitPed = ped; hitVeh = null; hitCop = null; }
            }
            if (!hitPed && this.footCops && this.footCops.cops.length) {
                const ch = this.footCops.hitTest(shot.x, shot.y, shot.z, shot.dx, shot.dy, shot.dz, bestT);
                if (ch) { bestT = ch.t; hitCop = ch; hitPed = null; hitVeh = null; }
            }
            for (const v of this.field.vehicles) {
                if (v === p.inVehicle) continue;
                const t = rayPointDist(shot, v.x, v.y + 0.7, v.z, Math.max(v.spec.L, v.spec.W) * 0.45);
                if (t !== null && t < bestT) { bestT = t; hitVeh = v; hitPed = null; hitCop = null; }
            }
            const endX = shot.x + shot.dx * bestT;
            const endY = shot.y + shot.dy * bestT;
            const endZ = shot.z + shot.dz * bestT;

            // Visible 3D bullet tracer streak
            if (this.tracers) this.tracers.spawn(shot.x, shot.y, shot.z, endX, endY, endZ, shot.weapon);

            if (hitPed) {
                this.peds.kill(hitPed, this.fx, 'player');
                this.particles.burst('blood', hitPed.x, hitPed.y + 1.1, hitPed.z, 1.4);
                this.audio.scream(hitPed.x, hitPed.z);
            } else if (hitCop) {
                // Foot officer hit — handled inside hitTest (already applied).
            } else if (hitVeh) {
                hitVeh.hp -= shot.damage * 0.6;
                this.particles.burst('spark', endX, endY, endZ, 0.8);
                this.particles.burst('smoke', endX, endY, endZ, 0.4);
                this.audio.impact(6, endX, endZ);
                if (hitVeh.driver === 'police') this.police.reportCrime(2, hitVeh.x, hitVeh.z, this.fx);
                if (hitVeh.hp <= 0 && !hitVeh.dead) { hitVeh.dead = true; this.fx.carDestroyed(hitVeh); }
            } else if (bestT >= shot.range - 0.5) {
                this.particles.burst('spark', endX, endY, endZ, 0.6);
                this.particles.burst('debris', endX, endY, endZ, 0.5);
                this.particles.burst('smoke', endX, endY, endZ, 0.3);
            }
        }

        /* ---- on-foot collisions vs dynamic actors (cars, pedestrians) ------- */
        _collideOnFoot(p, dt, fx) {
            const r = PHYS.PLAYER_RADIUS;
            this._runOverCd = (this._runOverCd || 0) - dt;
            const out = this._q2 || (this._q2 = { x: 0, z: 0 }); // scratch
            // Player circle vs vehicle oriented box.
            for (const v of this.field.vehicles) {
                if (v.dead) continue;
                const vTop = v.y + (v.spec.H || 1.4);
                if (p.pos.y >= vTop - 0.28) {
                    const dx = p.pos.x - v.x, dz = p.pos.z - v.z;
                    const reach = (v.spec.L || 4.5) * 0.5 + r;
                    if (dx * dx + dz * dz <= reach * reach) {
                        const cos = Math.cos(v.heading), sin = Math.sin(v.heading);
                        const lx = dx * cos - dz * sin;
                        const lz = dx * sin + dz * cos;
                        if (Math.abs(lx) <= v.spec.W * 0.5 + 0.1 && Math.abs(lz) <= v.spec.L * 0.5 + 0.1) {
                            p.pos.y = Math.max(p.pos.y, vTop);
                            p.vel.y = Math.max(0, p.vel.y);
                            p.onGround = true;
                            continue;
                        }
                    }
                }
                if (p.pos.y < v.y - 0.6 || p.pos.y > vTop + 0.5) continue;
                if (this.carjackT > 0 && v === this._carjackV) continue;
                if (!circlePushOutOfVehicle(p.pos.x, p.pos.z, v, r, out)) continue;
                const pushVx = out.x - p.pos.x;
                const pushVz = out.z - p.pos.z;
                p.pos.x = out.x;
                p.pos.z = out.z;
                const pushLen = Math.hypot(pushVx, pushVz);
                if (pushLen > 1e-4) {
                    const nx = pushVx / pushLen, nz = pushVz / pushLen;
                    const vDotN = p.vel.x * nx + p.vel.z * nz;
                    if (vDotN < 0) {
                        p.vel.x -= vDotN * nx;
                        p.vel.z -= vDotN * nz;
                    }
                }
                // Run-over: fast contact hurts and hurls the player.
                if (Math.abs(v.speed) > 5 && this._runOverCd <= 0) {
                    this._runOverCd = 0.8;
                    p.damage(Math.min(Math.abs(v.speed) * 1.2, 45), fx);
                    this.particles.burst('spark', p.pos.x, p.pos.y + 0.9, p.pos.z, 1);
                    const dir = Math.sign(v.speed);
                    p.pos.x += -Math.sin(v.heading) * dir * 1.0;
                    p.pos.z += -Math.cos(v.heading) * dir * 1.0;
                }
            }
            // Soft mutual separation from living pedestrians.
            for (const q of this.pedR.peds) {
                if (q.state === 'dead') continue;
                const dx = p.pos.x - q.x, dz = p.pos.z - q.z;
                const rad = r + 0.32;
                const d2 = dx * dx + dz * dz;
                if (d2 >= rad * rad || d2 < 1e-6) continue;
                const d = Math.sqrt(d2), push = (rad - d) * 0.5;
                const nx = dx / d, nz = dz / d;
                p.pos.x += nx * push; p.pos.z += nz * push;
                q.x -= nx * push; q.z -= nz * push;
            }
        }

        /* ---- main loop ------------------------------------------------------- */
        loop(now) {
            if (this.destroyed) return;
            // Optional FPS cap: drop frames the display offers beyond the limit.
            const cap = SETTINGS.fpsCap || 0;
            if (cap > 0 && this._lastFrame !== undefined) {
                const minFrame = 1000 / cap - 1.5;
                if (now - this._lastFrame < minFrame) {
                    requestAnimationFrame((t) => this.loop(t));
                    return;
                }
            }
            this._lastFrame = now;
            this.rafId = requestAnimationFrame((t) => this.loop(t));
            if (!document.body.contains(this.canvas)) { this.destroy(); return; }
            const rawDt = Math.max((now - this.clock) / 1000, 0.0001);
            const dt = Math.min(rawDt, 0.05);
            this.clock = now;
            // FPS meter feeding the F4 overlay.
            this._fpsE = (this._fpsE === undefined) ? rawDt : this._fpsE + (rawDt - this._fpsE) * 0.04;
            this._perfT = (this._perfT || 0) + rawDt;
            if (this._perfT > 0.25) { this._perfT = 0; this._refreshPerf(); }
            if (this.state === 'playing' || this.state === 'jail') {
                try { this.update(dt); } catch (e) { console.error('[gta]', e); }
            }
            if (this.sharedMat && this.sharedMat.water && this.sharedMat.water.uniforms && this.sharedMat.water.uniforms.uTime) {
                this.sharedMat.water.uniforms.uTime.value = (now || performance.now()) * 0.001;
            }
            if (this.sharedMat && this.sharedMat.parkWater && this.sharedMat.parkWater.uniforms && this.sharedMat.parkWater.uniforms.uTime) {
                this.sharedMat.parkWater.uniforms.uTime.value = (now || performance.now()) * 0.001;
            }
            if (this.cinematicCam) {
                this.camera.position.set(this.cinematicCam.x, this.cinematicCam.y, this.cinematicCam.z);
                this.camera.lookAt(this.cinematicCam.tx, this.cinematicCam.ty, this.cinematicCam.tz);
            }
            this.renderer.render(this.scene, this.camera);
        }

        update(dt) {
            // The editor freezes the world: traffic, peds and time all hold
            // still while you fly around and move things.
            if (this.editor && this.editor.on) { this.editor.update(dt); return; }
            // The fullscreen map pauses the game: peds, traffic, physics and
            // the clock all hold while you pan/zoom/pin — but the map itself
            // keeps redrawing so it stays interactive.
            if (this.hud && this.hud._bigOpen) { this.hud.drawMinimap(this, dt); return; }
            const p = this.player, fx = this.fx;
            this.time += dt;
            // The jail sequence keeps the player behind bars but still lets
            // them move in the cell, aim and fight — only the "free world"
            // (police, traffic, peds) carries on in the background.
            if (this._jail && this._jail.active) this.updateJail(dt);
            this._lookIdle += dt;
            this.input.aim = !!(this.input.mouseAim || this.input.altAim || this.input.keys.AltLeft || this.input.keys.AltRight);
            p.aiming = this.input.aim && !p.inVehicle;

            // ---- enter / exit ------------------------------------------------
            if (this._fPressed) { this._fPressed = false; this.tryEnterExit(); }

            // ---- player or vehicle --------------------------------------------
            if (p.inVehicle) {
                const v = p.inVehicle;
                if (v.dead) { this.exitVehicle(true); p.damage(20, fx); }
                else {
                    this.field.driveStep(v, dt, this.input, this.physics, fx);
                    p.pos.set(v.x, v.y, v.z);
                    if (v.spec.isBike || v.type === 'motorcycle' || v.type.startsWith('bike_')) {
                        p.rig.group.visible = true;
                        const fwdX = -Math.sin(v.heading), fwdZ = -Math.cos(v.heading);
                        // Rig hip pivot sits at group-local y≈0.94; GLB seat top is at
                        // v.y+0.855, so the group rests at v.y−0.09 to seat the hips on
                        // the saddle (feet near the low floorboard). Tune −0.09 here.
                        p.rig.group.position.set(v.x - fwdX * 0.22, v.y - 0.09, v.z - fwdZ * 0.22);
                        p.rig.group.rotation.y = v.heading;
                        const lean = clamp(-v.steer * 0.42 - (v.yawRate || 0) * 0.15, -0.45, 0.45);
                        p.rig.group.rotation.z = lean;
                        const spd = clamp(Math.abs(v.speed) / 24, 0, 1);
                        if (p.rig.torso) p.rig.torso.rotation.set(-0.36 - spd * 0.18, 0, 0);
                        if (p.rig.head) p.rig.head.rotation.set(0.30 + spd * 0.14, 0, 0);
                        if (p.rig.armL) p.rig.armL.rotation.set(0.52 + spd * 0.14, -0.16, -0.20);
                        if (p.rig.armR) p.rig.armR.rotation.set(0.52 + spd * 0.14, 0.16, 0.20);
                        if (p.rig.legL) p.rig.legL.rotation.set(0.18, 0.18, -0.16);
                        if (p.rig.legR) p.rig.legR.rotation.set(0.18, -0.18, 0.16);
                    } else if (v.spec.isBoat || v.type === 'speedboat' || v.type.startsWith('boat_')) {
                        p.rig.group.visible = true;
                        const fwdX = -Math.sin(v.heading), fwdZ = -Math.cos(v.heading);
                        const helmZ = (v.type === 'boat_yacht') ? -0.8 : (v.type === 'boat_police' ? -0.5 : -0.6);
                        p.rig.group.position.set(v.x + fwdX * helmZ, v.y + 0.35, v.z + fwdZ * helmZ);
                        p.rig.group.rotation.y = v.heading;
                        p.rig.group.rotation.z = v.roll || 0;
                        p.rig.group.rotation.x = v.pitch || 0;
                        if (p.rig.torso) p.rig.torso.rotation.set(-0.1, 0, 0);
                        if (p.rig.head) p.rig.head.rotation.set(0.05, 0, 0);
                        if (p.rig.armL) p.rig.armL.rotation.set(0.65, 0.15, -0.1);
                        if (p.rig.armR) p.rig.armR.rotation.set(0.65, -0.15, 0.1);
                        if (p.rig.legL) p.rig.legL.rotation.set(0.05, 0.05, 0);
                        if (p.rig.legR) p.rig.legR.rotation.set(0.05, -0.05, 0);
                    } else {
                        p.rig.group.visible = false;
                    }
                    if (v.inWater) {
                        if (!v.spec.isBoat && (v.y < -1.4 || v.dead)) {
                            this.exitVehicle(false);
                            p.swimming = true;
                            p.pos.y = getWaterSurface(p.pos.x, p.pos.z, this.time) - 0.45;
                            p.vel.set(0, 2.0, 0);
                            this.hud.toast('Bailed out — swim to shore!', '#80d8ff');
                        }
                    }
                    // Camera orbit (mouse) + auto-follow behind the car.
                    p.camYaw -= this.input.lookDx * 0.0042 * (p.lookSens !== undefined ? p.lookSens : 1);
                    p.camPitch = clamp(p.camPitch + this.input.lookDy * 0.003 * (p.lookSens !== undefined ? p.lookSens : 1), -0.2, 1.0);
                    if (this._lookIdle > 1.2) {
                        p.camYaw += angleDelta(p.camYaw, v.heading) * clamp(dt * 2.2, 0, 1);
                    }
                    const dist = this._camModes[this._camMode] + v.spec.L * 0.45;
                    const cx = v.x + Math.sin(p.camYaw) * dist;
                    const cz = v.z + Math.cos(p.camYaw) * dist;
                    const cy = v.y + 2.4 + p.camPitch * 2;
                    this.camera.position.x = damp(this.camera.position.x, cx, 8, dt);
                    this.camera.position.y = damp(this.camera.position.y, cy, 6, dt);
                    this.camera.position.z = damp(this.camera.position.z, cz, 8, dt);
                    this.camera.lookAt(v.x, v.y + 1.2, v.z);
                    const speedFov = p._baseFov + clamp(Math.abs(v.speed) / 70, 0, 1) * 12;
                    if (Math.abs(this.camera.fov - speedFov) > 0.05) {
                        this.camera.fov = damp(this.camera.fov, speedFov, 4, dt);
                        this.camera.updateProjectionMatrix();
                    }
                    this.audio.setEngine(true, v.speed, v.rpm);
                    this.stats.distance += Math.abs(v.speed) * dt;
                    this.updateParking(dt);
                }
                this.input.lookDx = this.input.lookDy = 0;
            } else {
                const before = p.pos.x * p.pos.x + p.pos.z * p.pos.z;
                this.input.sitToggle = this._gPressed;
                this._gPressed = false;
                p.update(dt, this.input, this.time, fx);
                this.input.lookDx = this.input.lookDy = 0;
                const after = p.pos.x * p.pos.x + p.pos.z * p.pos.z;
                this.stats.distance += Math.sqrt(Math.abs(after - before));
                this.audio.setEngine(false, 0);
                this._collideOnFoot(p, dt, fx);
                if (p.dead) { this.onWasted(); return; }
                this.handleAttack(dt);
                this.updateSubway(dt);
                this.updateBusNear(dt);
                this.updateShops(dt);
                // Water immersion / safety check
                if (p.swimming) {
                    this._waterT = 0; // Surface swimming is safe and free
                } else if (p.pos.y < -3.0) {
                    // Pinned deep underwater
                    this._waterT += dt;
                    if (this._waterT > 10.0) {
                        p.damage(12 * dt, null);
                        if (Math.random() < dt * 4) fx.splash(p.pos.x, 0, p.pos.z);
                        if (p.dead) { this.onWasted(); return; }
                    }
                } else {
                    this._waterT = 0;
                }
            }

            // ---- world systems -------------------------------------------------
            this._updateEarbuds();
            const px = p.pos.x, pz = p.pos.z;
            if (this.audio && this.audio.setListener) {
                const lHeading = (p.inVehicle ? p.inVehicle.heading : p.heading) || 0;
                this.audio.setListener(px, p.pos.y, pz, lHeading);
            }
            if (!p.inVehicle) {
                // AI traffic brakes for the player, same as it does for peds.
                for (const v of this.field.vehicles) {
                    if (v.driver !== 'ai' || !v.ai || v.dead) continue;
                    const sp = Math.abs(v.speed);
                    if (sp < 0.5) continue;
                    const ox = px - v.x, oz = pz - v.z;
                    if (ox * ox + oz * oz > 20 * 20) continue;
                    // fd measured from the front bumper (see PedSystem).
                    const fd = ox * -Math.sin(v.heading) + oz * -Math.cos(v.heading) - v.spec.L * 0.5;
                    const ld = Math.abs(ox * Math.cos(v.heading) + oz * -Math.sin(v.heading));
                    const stopDist = sp * sp / 24 + 3;
                    if (fd > 0 && fd < stopDist && ld < 2.8) {
                        v.ai.brakeFor = Math.max(v.ai.brakeFor || 0, 0.3);
                    }
                }
            }
            this.lightsSys.update(this.time);
            this.traffic.update(dt, this.time, px, pz, fx);
            this.peds.update(dt, this.time, px, pz, fx, p);
            this.gates.update(dt, this.time);
            if (this.villaGate) this.villaGate.update(dt, this.time, p, this.input, this.audio, this.hud);
            this.hud.updateBarks(dt, this.camera);
            this.loot.update(dt, this.time, p, this.physics, fx);
            this.police.update(dt, this.time, p, p.inVehicle, fx, this);
            // Emergency, transit and on-foot law enforcement subsystems.
            this.ambulance.update(dt, this.time, p);
            this.bus.update(dt, this.time, p, fx);
            this.bus.updateBus(dt, p);
            this.footCops.update(dt, p, fx);
            this.field.separate(dt, this.physics, fx);
            // Carjack throw-out animation completion.
            if (this.carjackT !== undefined && this.carjackT > 0) this.updateCarjack(dt);
            this.particles.update(dt, this.camera);
            if (this.tracers) this.tracers.update(dt);
            // Siren when cruisers are close with distance-based falloff.
            let sirenNear = false;
            let minCruiserDist = Infinity;
            for (const c of this.police.cruisers) {
                const d = Math.sqrt(dist2(c.x, c.z, px, pz));
                if (d < minCruiserDist) minCruiserDist = d;
                if (d < 90) sirenNear = true;
            }
            this.audio.setSiren(sirenNear, minCruiserDist);
            // Smoke from wrecks — and from crippled cars under 35% hull —
            // near the player, so vehicle damage reads before it kills.
            this._smokeT -= dt;
            if (this._smokeT <= 0) {
                this._smokeT = 0.22;
                for (const v of this.field.vehicles) {
                    if (dist2(v.x, v.z, px, pz) > 70 * 70) continue;
                    if (v.dead) {
                        this.particles.burst('smoke', v.x, v.y + 1, v.z, 1);
                    } else {
                        const max = v.maxHp || v.spec.hp || 100;
                        const frac = v.hp / max;
                        if (frac < 0.35) this.particles.burst('smoke', v.x, v.y + 1, v.z, frac < 0.15 ? 0.9 : 0.5);
                    }
                }
            }
            // Clean up far-away abandoned cars.
            this._abandonCd -= dt;
            if (this._abandonCd <= 0) {
                this._abandonCd = 5;
                for (const v of this.field.vehicles.slice()) {
                    if (v.driver === 'player' || v.isPlayerVehicle || v === p.inVehicle || v === this._carjackV) continue;
                    if (!v.driver && !v.parked && !v.dead && dist2(v.x, v.z, px, pz) > 260 * 260) this.field.remove(v);
                }
            }
            // Pay-N-Spray zones.
            this._sprayCd -= dt;
            if (p.inVehicle && this._sprayCd <= 0 && Math.abs(p.inVehicle.speed) < 2.5) {
                const v = p.inVehicle;
                for (const lm of LANDMARKS) {
                    if (lm[5] !== 'spray') continue;
                    if (v.x >= lm[1] && v.x <= lm[3] && v.z >= lm[2] && v.z <= lm[4]) {
                        if (p.money >= SPRAY_FEE) {
                            p.money -= SPRAY_FEE;
                            this.police.wanted = 0;
                            this.hud.setWanted(0);
                            // Fresh coat of paint + full hull repair (GTA tradition).
                            v.color = PAINTS[(Math.random() * PAINTS.length) | 0];
                            v.hp = v.maxHp || v.spec.hp || 100;
                            this.field._color.setHex(v.color);
                            this.field.pools[v.type].setColorAt(v.idx, this.field._color);
                            this.field.pools[v.type].instanceColor.needsUpdate = true;
                            this._sprayCd = 12;
                            this.hud.toast('Resprayed — heat is off (-$' + SPRAY_FEE + ')', '#7dff8a');
                            this.audio.spray();
                        } else {
                            this._sprayCd = 5;
                            this.hud.toast('Brow Auto Body: need $' + SPRAY_FEE, '#ff8a80');
                        }
                        break;
                    }
                }
            }
            // Day-Night cycle updates lighting, sun/moon celestial positions, stars, clouds, and sky gradient
            if (this.dayNight) {
                this.dayNight.update(dt, px, pz);
                const t = this.dayNight.getTime();
                if (this.hud && this.hud.setTime) this.hud.setTime(t.hours, t.minutes, t.isDay);
            } else if (this.sun) {
                this.sun.position.set(px + 160, 300, pz + 95);
                this.sun.target.position.set(px, 0, pz);
                this.sun.target.updateMatrixWorld();
            }
            // Enter prompt.
            if (!p.inVehicle) {
                if (p.aiming && p.weapon !== 'fist' && p.weapon !== 'bat') {
                    const scopedTip = p.scopedWeapon ? ' · Scroll to Zoom' : '';
                    this.hud.setPrompt('🎯 AIMING · [A]/Click to Shoot · [1-7] Weapon' + scopedTip);
                } else {
                    const v = this.field.nearest(px, pz, 3.4);
                    if (v && !v.dead) {
                        this.hud.setPrompt('Press F to enter ' + v.spec.name);
                    } else if (this._nearSubway && !this._subwayModalOpen) {
                        this.hud.setPrompt('[E] Enter Subway · MTA Fare $2.75');
                    } else {
                        this.hud.setPrompt('');
                    }
                }
            } else {
                this.hud.setPrompt('Press F to exit');
            }
            // HUD.
            const scoped = p.aiming && p.scopedWeapon;
            this.hud.setStats(p);
            this.hud.setVehicle(p.inVehicle || null);
            this.hud.setWanted(this.police.wanted);
            this.hud.setReticle(p.aiming && p.weapon !== 'fist' && p.weapon !== 'bat' && !scoped);
            this.hud.setScope(scoped, p.scopeZoom);
            this.hud.drawMinimap(this, dt);
            this._guidanceTick(dt);
            if (this._colliderDebug) this._updateColliderDebug();

            // Throttled spatial culling across chunks, distant instanced props, vehicles, and villa
            this._cullTimer = (this._cullTimer || 0) + dt;
            if (this._cullTimer > 0.35 || !this._cullInit) {
                this._cullTimer = 0;
                this._cullInit = true;
                this._updateSpatialCulling(px, pz);
            }
        }

        /* ---- spatial culling & LOD ---------------------------------------------- */
        _updateSpatialCulling(px, pz) {
            if (this.editor && this.editor.on) return;
            // Prop compaction uploads every visible instance matrix. Avoid
            // repeating that work while the player is inside the same culling
            // bands; a 20m hysteresis is invisible at the 500m prop radius.
            if (this._cullLastX !== undefined) {
                const mdx = px - this._cullLastX, mdz = pz - this._cullLastZ;
                if (mdx * mdx + mdz * mdz < 20 * 20) return;
            }
            this._cullLastX = px;
            this._cullLastZ = pz;
            const maxDist2 = (WORLD.VIEW_CHUNK_DIST2 || (600 * 600));
            const propDist2 = 500 * 500;

            // 1. Procedural city chunk culling
            if (this.builder && this.builder.chunkGroups) {
                const groups = this.builder.chunkGroups;
                for (let i = 0; i < groups.length; i++) {
                    const cg = groups[i];
                    const cx = (cg.userData.cx + 0.5) * WORLD.CHUNK + WORLD.MIN_X;
                    const cz = (cg.userData.cz + 0.5) * WORLD.CHUNK + WORLD.MIN_Z;
                    const dx = cx - px, dz = cz - pz;
                    cg.visible = (dx * dx + dz * dz <= maxDist2);
                }
            }

            // 2. VIP Villa Estate culling (1,428 scene nodes)
            if (this.builder && this.builder.villa) {
                const vx = -757.3, vz = 1510;
                const dx = vx - px, dz = vz - pz;
                this.builder.villa.visible = (dx * dx + dz * dz <= maxDist2);
            }

            // 3. Dynamic vehicle & wheel pool visibility
            if (this.field && this.field.updatePoolVisibility) {
                this.field.updatePoolVisibility();
            }

            // 4. Instanced props & buildings compaction (trees, lamps, GLB buildings, houses)
            if (this.builder && this.builder.propMeshes) {
                const meshes = this.builder.propMeshes;
                for (let m = 0; m < meshes.length; m++) {
                    const mesh = meshes[m];
                    const edit = mesh.userData && mesh.userData.edit;
                    if (!edit || !edit.spots) continue;
                    const spots = edit.spots;
                    if (!mesh.userData._savedMatrices) {
                        mesh.userData._savedMatrices = new Float32Array(mesh.instanceMatrix.array);
                        if (mesh.instanceColor) {
                            mesh.userData._savedColors = new Float32Array(mesh.instanceColor.array);
                        }
                    }
                    const origMat = mesh.userData._savedMatrices;
                    const origCol = mesh.userData._savedColors;
                    const arrMat = mesh.instanceMatrix.array;
                    const arrCol = mesh.instanceColor ? mesh.instanceColor.array : null;
                    let writeIdx = 0;
                    for (let i = 0; i < spots.length; i++) {
                        const sp = spots[i];
                        const dx = sp.x - px, dz = sp.z - pz;
                        if (dx * dx + dz * dz <= propDist2) {
                            const srcOffset = i * 16;
                            const dstOffset = writeIdx * 16;
                            for (let k = 0; k < 16; k++) arrMat[dstOffset + k] = origMat[srcOffset + k];
                            if (arrCol && origCol) {
                                const cSrc = i * 3, cDst = writeIdx * 3;
                                arrCol[cDst] = origCol[cSrc];
                                arrCol[cDst + 1] = origCol[cSrc + 1];
                                arrCol[cDst + 2] = origCol[cSrc + 2];
                            }
                            writeIdx++;
                        }
                    }
                    mesh.count = writeIdx;
                    mesh.visible = (writeIdx > 0);
                    mesh.instanceMatrix.needsUpdate = true;
                    if (mesh.instanceColor && writeIdx > 0) mesh.instanceColor.needsUpdate = true;
                }
            }
        }

        /* ---- GPS waypoint ------------------------------------------------------ */
        setWaypoint(x, z) {
            if (!this.player) return;
            this.waypoint = { x, z };
            this._recomputeRoute();
            this._spawnBeacon();
            const m = this.route && this.route.dist
                ? this.route.dist
                : Math.hypot(x - this.player.pos.x, z - this.player.pos.z);
            const via = this.route && this.route.straight ? 'straight line — no road link' : 'via roads';
            this.hud.toast('Waypoint set — ' + (m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m) + ' m') + ' ' + via, WP_COLOR);
        }

        clearWaypoint(silent) {
            this.waypoint = null;
            this.route = null;
            this._clearBeacon();
            if (!silent) this.hud.toast('Waypoint cleared', '#8ec5ff');
        }

        _recomputeRoute() {
            this.route = null;
            if (!this.waypoint || !this.builder || !this.builder.map || !this.player) return;
            const nodes = this.builder.map.nodes;
            if (!nodes || !nodes.length) return;
            const p = this.player.pos;
            // Heading-aware start: orient route along vehicle/player facing direction
            // so mid-block starts don't loop backwards to an intersection behind you
            let hx, hz, spd = 0;
            const pv = this.player.inVehicle;
            const heading = pv ? pv.heading : this.player.heading;
            if (heading !== undefined) {
                hx = -Math.sin(heading);
                hz = -Math.cos(heading);
            }
            if (pv) spd = Math.abs(pv.speed || 0);
            else if (this.player.vel) spd = Math.hypot(this.player.vel.x || 0, this.player.vel.z || 0);

            const path = RoutePlanner.findPath(nodes, p.x, p.z, this.waypoint.x, this.waypoint.z, hx, hz);
            let pts, straight = false;
            if (path && path.length) {
                // If player is already past path[0] along the segment path[0] -> path[1], drop path[0]
                // to prevent sharp backwards U-turn loops at mid-block starts
                while (path.length >= 2) {
                    const ax = path[0].x, az = path[0].z;
                    const bx = path[1].x, bz = path[1].z;
                    const dx = bx - ax, dz = bz - az;
                    const L2 = dx * dx + dz * dz;
                    if (L2 < 1e-4) { path.shift(); continue; }
                    const t = ((p.x - ax) * dx + (p.z - az) * dz) / L2;
                    if (t > 0.05 && t < 1.05) {
                        path.shift();
                    } else break;
                }
                // If destination is already before the last node along segment path[n-2] -> path[n-1], drop last node
                const wp = this.waypoint;
                while (path.length >= 2) {
                    const n = path.length;
                    const ax = path[n - 2].x, az = path[n - 2].z;
                    const bx = path[n - 1].x, bz = path[n - 1].z;
                    const dx = bx - ax, dz = bz - az;
                    const L2 = dx * dx + dz * dz;
                    if (L2 < 1e-4) { path.pop(); continue; }
                    const t = ((wp.x - ax) * dx + (wp.z - az) * dz) / L2;
                    if (t < 0.95 && t > -0.05) {
                        path.pop();
                    } else break;
                }
                const raw = [{ x: p.x, z: p.z }];
                for (const pt of path) {
                    const prev = raw[raw.length - 1];
                    if (Math.hypot(pt.x - prev.x, pt.z - prev.z) > 1.2) raw.push({ x: pt.x, z: pt.z });
                }
                const dest = { x: this.waypoint.x, z: this.waypoint.z };
                const prev = raw[raw.length - 1];
                if (Math.hypot(dest.x - prev.x, dest.z - prev.z) > 1.2) raw.push(dest);
                pts = RoutePlanner.smoothPath(RoutePlanner.simplify(raw), 2);
            } else {
                // Disconnected graph (or lone node) — straight-line fallback,
                // flagged honest so the toast doesn't promise roads.
                straight = true;
                pts = [{ x: p.x, z: p.z }, { x: this.waypoint.x, z: this.waypoint.z }];
            }
            let dist = 0;
            for (let i = 0; i + 1 < pts.length; i++) {
                dist += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
            }
            this.route = { pts, dist, straight };
            this._lastRecompute = this.time;
            this._navHint = null; this._navHintT = 0;
            // Seed the first hint immediately so the pill never flashes blank.
            try { this._updateNavHint(spd); } catch (e) { /* ignore */ }
        }

        /** Stable next-maneuver hint for the minimap pill + big map label.
         *  Returns {text, dist} e.g. {text:'↑ 180m · TURN LEFT', dist:742}. */
        getNavHint() {
            if (!this.waypoint || !this.player) return null;
            if (this._navHint && this.time - (this._navHintT || 0) < 0.4) return this._navHint;
            let spd = 0;
            const pv = this.player.inVehicle;
            if (pv) spd = Math.abs(pv.speed || 0);
            else if (this.player.vel) spd = Math.hypot(this.player.vel.x || 0, this.player.vel.z || 0);
            return this._updateNavHint(spd);
        }

        _updateNavHint(spd) {
            const p = this.player.pos;
            let dist = Math.hypot(this.waypoint.x - p.x, this.waypoint.z - p.z);
            let text = dist < 25 ? '◉ ARRIVING' : '⬆ STRAIGHT';
            const r = this.route;
            if (r && r.pts && r.pts.length > 1 && !r.straight) {
                dist = r.dist || dist;
                // Look ahead scaled by speed so fast drivers get earlier calls.
                const ahead = clamp(30 + (spd || 0) * 4, 35, 160);
                let acc = 0, j = 0;
                for (let i = 0; i + 1 < r.pts.length && acc < ahead; i++) {
                    acc += Math.hypot(r.pts[i + 1].x - r.pts[i].x, r.pts[i + 1].z - r.pts[i].z);
                    j = i + 1;
                }
                if (j >= 1 && j + 1 < r.pts.length) {
                    const a = r.pts[j - 1], b = r.pts[j], c = r.pts[j + 1];
                    const v1x = b.x - a.x, v1z = b.z - a.z;
                    const v2x = c.x - b.x, v2z = c.z - b.z;
                    const l1 = Math.hypot(v1x, v1z) || 1, l2 = Math.hypot(v2x, v2z) || 1;
                    const cross = (v1x * v2z - v1z * v2x) / (l1 * l2);
                    const dot = (v1x * v2x + v1z * v2z) / (l1 * l2);
                    const turnDeg = Math.abs(Math.atan2(cross, dot)) * 180 / Math.PI;
                    // Hysteresis: keep the previous hint unless the new turn is
                    // decisive — kills flicker on gentle curves.
                    let next = '⬆ STRAIGHT';
                    if (turnDeg > 150) next = '↩ U-TURN';
                    else if (turnDeg > 30) next = cross > 0 ? '➡ TURN RIGHT' : '⬅ TURN LEFT';
                    else if (turnDeg > 12) next = cross > 0 ? '↗ BEAR RIGHT' : '↖ BEAR LEFT';
                    const prev = this._navHint && this._navHint.text;
                    if (!prev || next !== '⬆ STRAIGHT' || turnDeg < 8 || !prev.includes('TURN') && !prev.includes('BEAR') && !prev.includes('U-TURN')) {
                        text = next;
                        if (acc < 400) text += ' ' + Math.round(acc) + 'm';
                    } else {
                        text = prev;
                    }
                } else if (dist < 60) {
                    text = '◉ ARRIVING';
                } else {
                    text = '⬆ STRAIGHT';
                    if (dist < 400) text += ' ' + Math.round(Math.min(acc, dist)) + 'm';
                }
            }
            this._navHint = { text, dist };
            this._navHintT = this.time;
            return this._navHint;
        }

        _guidanceTick(dt) {
            // Capture hint: show only when the cursor is free and playable (hidden in map editor).
            this.hud.setLockHint(this.state === 'playing' && this._lockSupported && !this._locked && !this.hud._bigOpen && (!this.editor || !this.editor.on));
            // Beacon pulse (depth-tested off so it reads over the skyline).
            if (this._wpBeacon) {
                const s2 = 1 + 0.12 * Math.sin(this.time * 4);
                this._wpBeacon.userData.ring.scale.set(s2, s2, 1);
                this._wpBeacon.userData.beam.material.opacity = 0.26 + 0.1 * Math.sin(this.time * 4);
            }
            if (!this.waypoint || !this.player) return;
            const p = this.player.pos;
            const d = Math.hypot(this.waypoint.x - p.x, this.waypoint.z - p.z);
            if (d < 16) {
                this.hud.toast('Arrived at destination', WP_COLOR);
                this.clearWaypoint(true);
                return;
            }
            if (!this.route || !this.route.pts || this.route.pts.length < 2) { this._recomputeRoute(); return; }
            const r = this.route, pts = r.pts;
            if (pts.length < 2) {
                this.hud.toast('Arrived at destination', WP_COLOR);
                this.clearWaypoint(true);
                return;
            }

            let spd = 0;
            const pvNow = this.player.inVehicle;
            if (pvNow) spd = Math.abs(pvNow.speed || 0);
            else if (this.player.vel) spd = Math.hypot(this.player.vel.x || 0, this.player.vel.z || 0);

            // 1. Covered-path trimming: continuously clear the travelled path behind the player
            // Project player onto upcoming route segments to find the active segment
            const trimLat = clamp(14 + spd * 0.4, 16, 35);
            const maxLookSeg = Math.min(pts.length - 2, 8);
            let bestI = -1, bestScore = Infinity, bestT = 0, bestLat = Infinity;

            for (let i = 0; i <= maxLookSeg; i++) {
                const ax = pts[i].x, az = pts[i].z;
                const bx = pts[i + 1].x, bz = pts[i + 1].z;
                const dx = bx - ax, dz = bz - az;
                const L2 = dx * dx + dz * dz;
                if (L2 < 1e-6) continue;

                const t = ((p.x - ax) * dx + (p.z - az) * dz) / L2;
                const tc = clamp(t, 0, 1);
                const qx = ax + dx * tc, qz = az + dz * tc;
                const lat = Math.hypot(p.x - qx, p.z - qz);
                const penalty = (t < 0 ? (-t) * 12 : t > 1 ? (t - 1) * 18 : 0);
                const score = lat + penalty - i * 1.8;

                if (score < bestScore) {
                    bestScore = score;
                    bestI = i;
                    bestT = t;
                    bestLat = lat;
                }
            }

            // Drop all segments strictly behind the active segment (clears travelled path!)
            if (bestI > 0 && bestLat < trimLat) {
                pts.splice(0, bestI);
            }

            // Progress along active segment 0: advance pts[0] forward to eliminate backwards ribbon loops
            if (pts.length >= 2) {
                const ax = pts[0].x, az = pts[0].z;
                const bx = pts[1].x, bz = pts[1].z;
                const dx = bx - ax, dz = bz - az;
                const L2 = dx * dx + dz * dz;
                if (L2 > 1e-6) {
                    let t = ((p.x - ax) * dx + (p.z - az) * dz) / L2;
                    if (t >= 0.95 && pts.length > 2) {
                        pts.shift();
                        const ax2 = pts[0].x, az2 = pts[0].z;
                        const bx2 = pts[1].x, bz2 = pts[1].z;
                        const dx2 = bx2 - ax2, dz2 = bz2 - az2;
                        const L22 = dx2 * dx2 + dz2 * dz2;
                        if (L22 > 1e-6) {
                            t = clamp(((p.x - ax2) * dx2 + (p.z - az2) * dz2) / L22, 0, 0.95);
                            pts[0] = { x: ax2 + dx2 * t, z: az2 + dz2 * t };
                        }
                    } else if (t > 0.02) {
                        const advT = clamp(t, 0, 0.95);
                        const projX = ax + dx * advT, projZ = az + dz * advT;
                        const dCar = Math.hypot(p.x - projX, p.z - projZ);
                        if (dCar < 3.5) {
                            pts[0] = { x: projX, z: projZ };
                        } else {
                            pts[0] = { x: p.x, z: p.z };
                        }
                    } else {
                        pts[0] = { x: p.x, z: p.z };
                    }
                }
            }

            // Drop degenerate near-zero distance to next point
            while (pts.length > 2 && Math.hypot(pts[1].x - pts[0].x, pts[1].z - pts[0].z) < 1.2) {
                pts.splice(1, 1);
            }

            // Continuously update remaining distance
            let remDist = Math.hypot(pts[0].x - p.x, pts[0].z - p.z);
            for (let i = 0; i + 1 < pts.length; i++) {
                remDist += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
            }
            r.dist = remDist;

            // Keep turn hints up-to-date
            if (this.time - (this._navHintT || 0) > 0.35) {
                try { this._updateNavHint(spd); } catch (e) { /* ignore */ }
            }

            // 2. Responsive lost / deviation check
            this._routeT -= dt;
            if (this._routeT > 0) return;
            this._routeT = spd > 18 ? 0.25 : 0.5;

            // Minimum cooldown between route recomputes: 0.5s
            if (this.time - (this._lastRecompute || -10) < 0.5) return;

            const dev = RoutePlanner.distToPath(pts, p.x, p.z);
            if (dev > 28) {
                this._recomputeRoute();
            } else if (spd > 8 && pts.length > 2) {
                const nx = pts[1].x - pts[0].x, nz = pts[1].z - pts[0].z;
                const nl = Math.hypot(nx, nz) || 1;
                const vx = this.player.vel ? this.player.vel.x : 0;
                const vz = this.player.vel ? this.player.vel.z : 0;
                const vl = Math.hypot(vx, vz) || 1;
                const closing = (nx * vx + nz * vz) / (nl * vl);
                if (closing < -0.35 && dev > 12) this._recomputeRoute();
            }
        }

        _spawnBeacon() {
            this._clearBeacon();
            if (!this.waypoint || !this.scene) return;
            const g = new THREE.Group();
            const beamMat = new THREE.MeshBasicMaterial({
                color: 0xc86bff, transparent: true, opacity: 0.3,
                depthWrite: false, depthTest: false, side: THREE.DoubleSide,
            });
            const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 80, 12, 1, true), beamMat);
            beam.position.y = 40;
            beam.renderOrder = 10;
            const ringMat = new THREE.MeshBasicMaterial({
                color: 0xc86bff, transparent: true, opacity: 0.85,
                depthWrite: false, depthTest: false, side: THREE.DoubleSide,
            });
            const ring = new THREE.Mesh(new THREE.RingGeometry(2, 3, 32), ringMat);
            ring.rotation.x = -Math.PI / 2;
            ring.position.y = 0.4;
            ring.renderOrder = 10;
            g.add(beam);
            g.add(ring);
            g.position.set(this.waypoint.x, 0, this.waypoint.z);
            g.userData = { beam, ring };
            this.scene.add(g);
            this._wpBeacon = g;
        }

        _clearBeacon() {
            if (!this._wpBeacon) return;
            try { this.scene.remove(this._wpBeacon); } catch (e) { /* ignore */ }
            this._wpBeacon.traverse((o) => {
                if (o.geometry) o.geometry.dispose();
                if (o.material) o.material.dispose();
            });
            this._wpBeacon = null;
        }

        /* ---- teardown -------------------------------------------------------- */
        teardownWorld() {
            // 1. Unseat player, release pointer locks and map waypoints
            try {
                if (this.player && this.player.inVehicle) this.exitVehicle(true);
            } catch (e) {}
            this._exitLock();
            try { this._clearBeacon(); } catch (e) {}

            // 2. Stop audio loops, radio, and sounds
            if (this.audio) {
                try {
                    this.audio.stopLoops();
                    this.audio.radioStop();
                    this._radioClose();
                } catch (e) {}
            }

            // 3. Close and reset HUD elements
            if (this.hud) {
                try {
                    if (this.hud._bigOpen) this.hud.toggleBigmap(this);
                    if (this.hud.closeJailOverlay) this.hud.closeJailOverlay();
                    if (this.hud.closeJailHud) this.hud.closeJailHud();
                    if (this.hud.setPrompt) this.hud.setPrompt(null);
                    if (this.hud.setVehicle) this.hud.setVehicle(null);
                    if (this.hud.scopeEl) this.hud.scopeEl.style.display = 'none';
                    this.hud.show(false);
                } catch (e) {}
            }

            // 4. Clear transient visual / game systems
            if (this.loot) {
                try { this.loot.clear(); } catch (e) {}
                this.loot = null;
            }
            if (this.particles) {
                try { this.particles.clear(); } catch (e) {}
                this.particles = null;
            }
            this.tracers = null;
            if (this.editor) {
                try { if (typeof this.editor.destroy === 'function') this.editor.destroy(); } catch (e) {}
                this.editor = null;
            }
            if (this._colliderWireGroup) {
                try {
                    this.scene.remove(this._colliderWireGroup);
                    this._colliderWireGroup.traverse(c => {
                        if (c.geometry) c.geometry.dispose();
                        if (c.material) c.material.dispose();
                    });
                    this._colliderWireGroup = null;
                    this._colliderDebug = false;
                } catch (e) {}
            }

            // 5. Destroy Day-Night cycle and associated lights/clouds/celestial groups
            if (this.dayNight) {
                try {
                    if (typeof this.dayNight.destroy === 'function') this.dayNight.destroy();
                } catch (e) {}
                this.dayNight = null;
            }

            // 6. Remove and dispose specific lights
            if (this.amb) {
                try { this.scene.remove(this.amb); } catch (e) {}
                this.amb = null;
            }
            if (this.hemi) {
                try { this.scene.remove(this.hemi); } catch (e) {}
                this.hemi = null;
            }
            if (this.sun) {
                try {
                    if (this.sun.shadow && this.sun.shadow.map) {
                        this.sun.shadow.map.dispose();
                    }
                    this.scene.remove(this.sun);
                    if (this.sun.target) this.scene.remove(this.sun.target);
                } catch (e) {}
                this.sun = null;
            }

            // 7. Remove all scene objects except this.skyMesh and safely dispose geometries
            if (this.scene) {
                const sharedMaterials = new Set(Object.values(this.sharedMat || {}));
                const sharedTextures = new Set();
                for (const m of sharedMaterials) {
                    if (m && m.map) sharedTextures.add(m.map);
                }

                const children = this.scene.children.slice();
                for (let i = 0; i < children.length; i++) {
                    const child = children[i];
                    if (child === this.skyMesh) continue;
                    try { this.scene.remove(child); } catch (e) {}
                    try {
                        child.traverse((o) => {
                            if (o.shadow && o.shadow.map) {
                                try { o.shadow.map.dispose(); } catch (e) {}
                            }
                            if (o.geometry && o !== this.skyMesh) {
                                try { o.geometry.dispose(); } catch (e) {}
                            }
                            if (o.material) {
                                const mats = Array.isArray(o.material) ? o.material : [o.material];
                                mats.forEach((m) => {
                                    if (m && !sharedMaterials.has(m)) {
                                        if (m.map && !sharedTextures.has(m.map)) {
                                            try { m.map.dispose(); } catch (e) {}
                                        }
                                        try { m.dispose(); } catch (e) {}
                                    }
                                });
                            }
                        });
                    } catch (e) {}
                }

                // Reset fog and renderer clear color back to menu defaults
                if (this.scene.fog) {
                    try {
                        this.scene.fog.color.setHex(0xc8dce8);
                        this.scene.fog.near = 260;
                        this.scene.fog.far = 950;
                    } catch (e) {}
                }
            }
            if (this.skyMesh) {
                this.skyMesh.position.set(770, 0, 1830);
            }
            if (this.renderer) {
                try { this.renderer.setClearColor(0x9db8cc, 1); } catch (e) {}
            }

            // 8. Nullify world & gameplay system references
            this.builder = null;
            this.field = null;
            this.pedR = null;
            this.peds = null;
            this.traffic = null;
            this.police = null;
            this.footCops = null;
            this.ambulance = null;
            this.bus = null;
            this.gates = null;
            this.villaGate = null;
            this.physics = null;
            this.player = null;
            this.mapPatch = null;
            this.map = null;
            this.parkingLots = [];
            this.subwayStations = [];
            this.gunShops = [];
            this.foodShops = [];
            this.foodStalls = [];
            this.streetLampGlowMesh = null;
            this.streetLampPoolMesh = null;
            this._debugLines = null;
            this._jailGuard = null;
            this._jail = { active: false, mode: null, keys: false, cell: null, escapeT: 0, paid: false, escapeHud: false };
            this._busModalOpen = false;
            this._busPickMode = false;
            this._subwayModalOpen = false;
            this._nearBus = false;
            this.carjackT = 0;
            this._carjackV = null;
            this.cinematicCam = null;

            // Reset camera to menu view
            if (this.camera) {
                this.camera.position.set(500, 12, 2000);
                this.camera.lookAt(770, 0, 1830);
            }
        }

        toggleColliderDebug() {
            this._colliderDebug = !this._colliderDebug;
            if (this.hud && this.hud.toast) {
                this.hud.toast(`Collider Debug: ${this._colliderDebug ? 'ON' : 'OFF'} (F3)`, this._colliderDebug ? '#7dff8a' : '#ff8a80');
            }
            if (!this._colliderDebug) {
                if (this._colliderWireGroup) {
                    this.scene.remove(this._colliderWireGroup);
                    this._colliderWireGroup.traverse(c => {
                        if (c.geometry) c.geometry.dispose();
                        if (c.material) c.material.dispose();
                    });
                    this._colliderWireGroup = null;
                }
            } else {
                this._updateColliderDebug(true);
            }
        }

        _updateColliderDebug(force) {
            if (!this._colliderDebug || !this.physics || !this.scene || !this.player) return;
            const px = this.player.pos.x, pz = this.player.pos.z;
            if (!force && this._lastColliderDebugX !== undefined) {
                const dx = px - this._lastColliderDebugX, dz = pz - this._lastColliderDebugZ;
                if (dx * dx + dz * dz < 25) return; // Only rebuild wireframes when moved > 5m
            }
            this._lastColliderDebugX = px;
            this._lastColliderDebugZ = pz;

            if (this._colliderWireGroup) {
                this.scene.remove(this._colliderWireGroup);
                this._colliderWireGroup.traverse(c => {
                    if (c.geometry) c.geometry.dispose();
                    if (c.material) c.material.dispose();
                });
                this._colliderWireGroup = null;
            }

            const group = new THREE.Group();
            group.name = 'collider_debug_group';
            const radius = 100; // 100m radius around player
            const boxGeo = new THREE.BoxGeometry(1, 1, 1);
            const activeMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, wireframe: true });
            const bridgeMat = new THREE.MeshBasicMaterial({ color: 0x00d4ff, wireframe: true });
            const inactiveMat = new THREE.MeshBasicMaterial({ color: 0xff3333, wireframe: true, transparent: true, opacity: 0.35 });

            // 1. Visualize nearby Universal Trimesh BVH meshes (green/cyan)
            if (this.physics.indexedMeshes && this.physics.indexedMeshes.length > 0) {
                const bvhMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, wireframe: true, transparent: true, opacity: 0.4 });
                const bvhCands = [];
                this.physics.queryMeshes(px, pz, radius, bvhCands);
                for (let i = 0; i < bvhCands.length; i++) {
                    const rec = bvhCands[i];
                    if (rec.mesh.visible === false || !rec.mesh.parent) continue;
                    const wb = rec.worldBox;
                    const cx = (wb.min.x + wb.max.x) / 2, cy = (wb.min.y + wb.max.y) / 2, cz = (wb.min.z + wb.max.z) / 2;
                    const sx = wb.max.x - wb.min.x, sy = wb.max.y - wb.min.y, sz = wb.max.z - wb.min.z;
                    if (sx > 0.05 && sy > 0.05 && sz > 0.05) {
                        const m = new THREE.Mesh(boxGeo, bvhMat);
                        m.position.set(cx, cy, cz);
                        m.scale.set(sx, sy, sz);
                        group.add(m);
                    }
                }
            }

            // 2. Visualize legacy/custom colliders
            const colliders = this.physics.colliders || [];
            for (let i = 0; i < colliders.length; i++) {
                const c = colliders[i];
                const dx = c.x - px, dz = c.z - pz;
                if (dx * dx + dz * dz > radius * radius) continue;

                const isCulled = (c.mesh && (c.mesh.visible === false || !c.mesh.parent));
                const mat = isCulled ? inactiveMat : (c.tag && c.tag.startsWith('bridge') ? bridgeMat : activeMat);
                const mesh = new THREE.Mesh(boxGeo, mat);
                mesh.position.set(c.x, c.y, c.z);
                mesh.scale.set(c.sx, c.sy, c.sz);
                if (c.yaw) mesh.rotation.y = c.yaw;
                group.add(mesh);
            }
            this._colliderWireGroup = group;
            this.scene.add(group);
        }

        destroy() {
            if (this.destroyed) return;
            this.destroyed = true;
            if (this.rafId) cancelAnimationFrame(this.rafId);
            // Preserve progress when the game window is shut (window-closing).
            this.autoSave();
            this.teardownWorld();
            const w = this.windowEl.ownerDocument.defaultView || window;
            try { w.removeEventListener('keydown', this._kd); } catch (e) {}
            try { w.removeEventListener('keyup', this._ku); } catch (e) {}
            try { w.removeEventListener('mouseup', this._mu); } catch (e) {}
            try { w.removeEventListener('blur', this._blur); } catch (e) {}
            try { w.removeEventListener('pagehide', this._pagehide); } catch (e) {}
            try { this.windowEl.removeEventListener('window-closing', this._closing); } catch (e) {}
            try {
                this.canvas.removeEventListener('mousemove', this._mm);
                this.canvas.removeEventListener('mousedown', this._md);
                this.canvas.removeEventListener('wheel', this._wh);
                this.canvas.removeEventListener('contextmenu', this._ctx);
            } catch (e) {}
            if (this.observer) this.observer.disconnect();
            try {
                const d = this.windowEl.ownerDocument || document;
                d.removeEventListener('pointerlockchange', this._plc);
                d.removeEventListener('pointerlockerror', this._ple);
            } catch (e) { /* ignore */ }
            try { if (this.hud) this.hud.destroy(); } catch (e) { /* ignore */ }
            // Dispose the whole scene graph.
            if (this.scene) {
                this.scene.traverse((o) => {
                    if (o.geometry) o.geometry.dispose();
                    if (o.material) {
                        const mats = Array.isArray(o.material) ? o.material : [o.material];
                        mats.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
                    }
                });
            }
            if (this.sharedMat) {
                for (const k in this.sharedMat) {
                    const m = this.sharedMat[k];
                    if (m && m.dispose) m.dispose();
                }
            }
            if (this.renderer) this.renderer.dispose();
            this.windowEl.__gtaInstance = null;
        }
    }

    /**
     * Distance along a shot ray to a sphere, or null. Used for hit routing.
     * shot = {x, y, z, dx, dy, dz, range}.
     */
    function rayPointDist(shot, cx, cy, cz, r) {
        const ox = cx - shot.x, oy = cy - shot.y, oz = cz - shot.z;
        const t = ox * shot.dx + oy * shot.dy + oz * shot.dz;
        if (t < 0 || t > shot.range) return null;
        const px = ox - shot.dx * t, py = oy - shot.dy * t, pz = oz - shot.dz * t;
        return (px * px + py * py + pz * pz <= r * r) ? t : null;
    }

    /**
     * Push a circle out of a vehicle's oriented footprint box (2D, top-down).
     * Vehicle local frame: +x = right, +z = back (front = -z). Writes the
     * corrected position into `out` {x, z}; returns true if the circle was
     * overlapping and moved.
     */
    function circlePushOutOfVehicle(px, pz, v, r, out) {
        const dx = px - v.x, dz = pz - v.z;
        const reach = v.spec.L * 0.5 + r + 1;
        if (dx * dx + dz * dz > reach * reach) return false;
        const cos = Math.cos(v.heading), sin = Math.sin(v.heading);
        const lx = dx * cos - dz * sin; // along right axis
        const lz = dx * sin + dz * cos; // along back axis
        // Inset from the spec sheet: W includes mirrors/handles and L
        // includes soft bumpers, so a full-spec box halts characters
        // well short of the visible paint. The inset reads as true
        // contact while the circle radius still guards the torso.
        const hx = v.spec.W * 0.5 - 0.16 + r, hz = v.spec.L * 0.5 - 0.10 + r;
        const ox = hx - Math.abs(lx), oz = hz - Math.abs(lz);
        if (ox <= 0 || oz <= 0) return false;
        let ux = 0, uz = 0;
        if (ox < oz) ux = lx >= 0 ? ox : -ox; // shallower axis wins
        else uz = lz >= 0 ? oz : -oz;
        out.x = px + ux * cos + uz * sin;
        out.z = pz - ux * sin + uz * cos;
        return true;
    }
