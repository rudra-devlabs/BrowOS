    // ===========================================================================
    // PLAYER — shared rig factory, procedural animation, controller, cameras
    // ===========================================================================
    /** Rig part geometries (vertex-colored, shared by the player + ped pool). */
    const RigFactory = {
        geo: null,
        build() {
            if (this.geo) return this.geo;
            const mk = (fn) => { const b = new GeoBatch(); fn(b); return b.buildGeometry(); };
            this.geo = {
                // Torso: shirt box + hip box (pivot at its origin = hip height).
                torso: mk((b) => {
                    b.box(0, 0.31, 0, 0.42, 0.56, 0.24, [1, 1, 1]);       // chest (tinted shirt)
                    b.box(0, -0.03, 0, 0.38, 0.14, 0.22, [0.25, 0.27, 0.34]); // belt
                }),
                head: mk((b) => {
                    b.box(0, 0.09, 0, 0.22, 0.24, 0.22, [1, 0.85, 0.72]);  // face/neck (skin)
                    b.box(0, 0.16, -0.02, 0.24, 0.14, 0.24, [0.22, 0.16, 0.1]); // hair
                }),
                arm: mk((b) => {
                    b.box(0, -0.26, 0, 0.11, 0.5, 0.11, [1, 1, 1]);        // sleeve (tinted)
                    b.box(0, -0.55, 0, 0.09, 0.12, 0.09, [1, 0.85, 0.72]); // hand
                }),
                leg: mk((b) => {
                    b.box(0, -0.42, 0, 0.15, 0.78, 0.16, [1, 1, 1]);       // pants (tinted)
                    b.box(0, -0.85, -0.05, 0.16, 0.09, 0.26, [0.12, 0.12, 0.14]); // shoe
                }),
                gun: mk((b) => {
                    b.box(0, 0, 0.1, 0.05, 0.12, 0.24, [0.16, 0.16, 0.18]);
                    b.box(0, -0.05, -0.02, 0.045, 0.1, 0.08, [0.3, 0.22, 0.14]);
                }),
            };
            return this.geo;
        },
    };

    /**
     * One articulated humanoid. Limb pivots are plain Groups; part meshes
     * share the RigFactory geometries + one vertex-color material.
     */
    class HumanRig {
        constructor(matFlat, colors, glb, assets) {
            if (glb) { this._fromGlb(matFlat, glb, assets); return; }
            const geo = RigFactory.build();
            this.group = new THREE.Group();
            const skin = colors.skin || [1, 0.85, 0.72];
            // Torso pivot (at hip height 0.94 in local space).
            this.torso = new THREE.Mesh(geo.torso, matFlat);
            this.torso.position.y = 0.94;
            this.group.add(this.torso);
            // Head pivot: attached to torso at neck (0.56 above hip pivot).
            this.headPivot = new THREE.Group();
            this.headPivot.position.set(0, 0.56, 0);
            this.head = new THREE.Mesh(geo.head, matFlat);
            this.headPivot.add(this.head);
            this.torso.add(this.headPivot);
            // Arms: pivots at shoulders, attached directly to torso so they follow torso rotation.
            this.armL = this._limb(geo.arm, matFlat, -0.28, 0.50, this.torso);
            this.armR = this._limb(geo.arm, matFlat, 0.28, 0.50, this.torso);
            // Legs: pivots at the hips attached to group.
            this.legL = this._limb(geo.leg, matFlat, -0.11, 0.94, this.group);
            this.legR = this._limb(geo.leg, matFlat, 0.11, 0.94, this.group);
            this.limbs = [this.armL, this.armR, this.legL, this.legR];
            this.parts = [this.torso, this.head, this.armL.children[0], this.armR.children[0],
                this.legL.children[0], this.legR.children[0]];
            this.gun = new THREE.Mesh(geo.gun, matFlat);
            this.gun.rotation.x = Math.PI / 2;
            this.gun.visible = false;
            this.armR.add(this.gun);
            this.gun.position.set(0, -0.58, 0.05);
            this._attachWeapons(matFlat, assets);
            this.applyColors(colors);
            this._attachEarbuds();
        }

        _attachWeapons(matFlat, assets) {
            this.weaponMeshes = {};
            this.weaponMeshes.pistol = this.gun;
            if (assets && assets.weapons) {
                for (const wname of ['bat', 'shotgun', 'smg', 'rifle']) {
                    const wg = assets.weapons[wname];
                    if (wg) {
                        const wmesh = wg.scene.clone();
                        wmesh.traverse((o) => {
                            if (o.isMesh) {
                                glbFixWinding(o.geometry);
                                const mc = (o.material && o.material.color) ? o.material.color : new THREE.Color(0x777777);
                                o.material = new THREE.MeshLambertMaterial({ color: mc });
                            }
                        });
                        wmesh.position.set(0, -0.58, 0.05);
                        wmesh.rotation.x = -Math.PI / 2;
                        wmesh.visible = false;
                        this.armR.add(wmesh);
                        this.weaponMeshes[wname] = wmesh;
                    }
                }
            }
        }

        setWeaponMesh(name) {
            this._currentWeapon = name;
            for (const k in this.weaponMeshes) {
                this.weaponMeshes[k].visible = false;
            }
            const mesh = this.weaponMeshes[name] || (name === 'sniper' ? this.weaponMeshes.rifle : null);
            if (name !== 'fist' && mesh) {
                mesh.visible = true;
            }
        }

        /**
         * Build the rig from a GLB hierarchy whose nodes follow the contract
         * (Root > Torso > Head, Root > ArmL/ArmR/LegL/LegR pivots, limbs hang
         * down -Y, faces -z). The model's own vertex colors carry the outfit.
         */
        _fromGlb(matFlat, gltf, assets) {
            const root = gltf.scene.clone(true);
            // Swap the loader's PBR materials for the city's flat Lambert
            // and repair reversed triangle winding.
            root.traverse((o) => {
                if (o.isMesh !== true && !(o instanceof THREE.Mesh)) return;
                glbFixWinding(o.geometry);
                let hasRealCol = false;
                const c = o.geometry && o.geometry.attributes && o.geometry.attributes.color;
                if (c) {
                    for (let j = 0; j < c.count; j++) {
                        if (c.getX(j) < 0.98 || c.getY(j) < 0.98 || c.getZ(j) < 0.98) {
                            hasRealCol = true;
                            break;
                        }
                    }
                }
                if (hasRealCol) {
                    o.material = matFlat;
                } else if (o.material) {
                    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
                    const col = (mat && mat.color) ? mat.color : new THREE.Color(0x3a4b60);
                    o.material = new THREE.MeshLambertMaterial({ color: col });
                }
            });
            this.group = root;
            this.torso = glbChildByName(root, 'Torso') || glbChildByName(root, 'Torso_Mesh');
            this.headPivot = (this.torso ? glbChildByName(this.torso, 'Head') : null) || glbChildByName(root, 'Head');
            this.head = this.headPivot; // node itself (rotation target)
            this.armL = glbChildByName(root, 'ArmL') || glbChildByName(root, 'Arm_L') || (this.torso && (glbChildByName(this.torso, 'ArmL') || glbChildByName(this.torso, 'Arm_L')));
            this.armR = glbChildByName(root, 'ArmR') || glbChildByName(root, 'Arm_R') || (this.torso && (glbChildByName(this.torso, 'ArmR') || glbChildByName(this.torso, 'Arm_R')));
            this.legL = glbChildByName(root, 'LegL') || glbChildByName(root, 'Leg_L') || (this.torso && (glbChildByName(this.torso, 'LegL') || glbChildByName(this.torso, 'Leg_L')));
            this.legR = glbChildByName(root, 'LegR') || glbChildByName(root, 'Leg_R') || (this.torso && (glbChildByName(this.torso, 'LegR') || glbChildByName(this.torso, 'Leg_R')));

            // Re-parent ArmL and ArmR under Torso so they move naturally with torso rotation
            if (this.torso && this.armL && this.armR) {
                if (this.armL.parent !== this.torso) {
                    this.torso.add(this.armL);
                    this.armL.position.set(-0.26, 0.50, 0);
                }
                if (this.armR.parent !== this.torso) {
                    this.torso.add(this.armR);
                    this.armR.position.set(0.26, 0.50, 0);
                }
            }
            if (this.torso && this.headPivot && this.headPivot.parent !== this.torso) {
                this.torso.add(this.headPivot);
                this.headPivot.position.set(0, 0.56, 0);
            }

            this.limbs = [this.armL, this.armR, this.legL, this.legR].filter(Boolean);
            this.parts = [];
            // Hide the model's hip-holstered gun; use the known-orientation
            // procedural pistol attached to the right arm instead.
            const modelGun = this.torso ? glbChildByName(this.torso, 'Gun') : null;
            if (modelGun) modelGun.visible = false;
            this.gun = new THREE.Mesh(RigFactory.build().gun, matFlat);
            this.gun.rotation.x = Math.PI / 2;
            this.gun.visible = false;
            if (this.armR) {
                this.armR.add(this.gun);
                this.gun.position.set(0, -0.58, 0.05);
            }
            this._attachWeapons(matFlat, assets);
            this._attachEarbuds();
        }
        /**
         * Blackish in-ear buds on both ears, parented to the head pivot so
         * they follow head animation in the procedural rig AND the GLB rig.
         * Hidden by default; the game loop toggles them while the personal
         * player is on (see setEarbuds).
         */
        _attachEarbuds() {
            this.earbuds = [];
            const anchor = this.headPivot || this.group;
            if (!anchor) return;
            const g = new THREE.BoxGeometry(0.035, 0.045, 0.03);
            const stem = new THREE.BoxGeometry(0.014, 0.05, 0.014);
            const m = new THREE.MeshLambertMaterial({ color: 0x14151a });
            for (const side of [-1, 1]) {
                const bud = new THREE.Mesh(g, m);
                bud.position.set(side * 0.115, 0.10, 0);
                bud.visible = false;
                anchor.add(bud);
                const stm = new THREE.Mesh(stem, m);
                stm.position.set(side * 0.115, 0.062, 0.005);
                stm.visible = false;
                anchor.add(stm);
                this.earbuds.push(bud, stm);
            }
        }
        setEarbuds(v) {
            if (!this.earbuds) return;
            for (const mesh of this.earbuds) mesh.visible = !!v;
        }
        _limb(geo, mat, x, y, parent) {
            const pivot = new THREE.Group();
            pivot.position.set(x, y, 0);
            const mesh = new THREE.Mesh(geo, mat);
            pivot.add(mesh);
            (parent || this.group).add(pivot);
            return pivot;
        }
        /** Tint the shared-tint parts (shirt / pants) via per-rig clones. */
        applyColors(colors) {
            const shirt = colors.shirt || [0.3, 0.5, 0.75];
            const pants = colors.pants || [0.2, 0.22, 0.3];
            // Torso chest quad tint: clone geometry and rewrite vertex colors
            // (cheap: only the player does this; peds tint via instanceColor).
            const tint = (mesh, region) => {
                const g = mesh.geometry.clone();
                const col = g.attributes.color;
                for (let i = 0; i < col.count; i++) {
                    const y = g.attributes.position.getY(i);
                    if (region === 'shirt' && y > 0.1) col.setXYZ(i, shirt[0], shirt[1], shirt[2]);
                    if (region === 'arm' && y > -0.45) col.setXYZ(i, shirt[0], shirt[1], shirt[2]);
                    if (region === 'pants' && y > -0.82) col.setXYZ(i, pants[0], pants[1], pants[2]);
                }
                col.needsUpdate = true;
                mesh.geometry = g;
            };
            tint(this.torso, 'shirt');
            tint(this.armL.children[0], 'arm');
            tint(this.armR.children[0], 'arm');
            tint(this.legL.children[0], 'pants');
            tint(this.legR.children[0], 'pants');
            this._tinted = [this.torso, this.armL.children[0], this.armR.children[0], this.legL.children[0], this.legR.children[0]];
        }
        disposeTints() {
            if (this._tinted) for (const m of this._tinted) m.geometry.dispose();
        }

        /**
         * Procedural locomotion. `anim` = { speed, phase, punchT, aimT, airborne }
         */
        animate(t, anim) {
            // Carjacking animation sequence (phases 1, 2, 3)
            if (anim.carjack) {
                const phase = anim.carjackPhase || 1;
                const prog = clamp(anim.carjackProgress || 0, 0, 1);
                this.gun.visible = false;
                this.group.position.y = anim.baseY;

                if (phase === 1) {
                    // Phase 1: Reach forward with right hand, grab handle, yank door open
                    const swing = Math.sin(prog * Math.PI);
                    this.torso.rotation.set(0.12, 0.45 * prog, 0.05);
                    this.head.rotation.set(0.1, -0.3 * prog, 0);
                    this.armR.rotation.set(-1.15 - 0.3 * swing, 0.3, 0.25);
                    this.armL.rotation.set(-0.4, -0.2, -0.15);
                    this.legL.rotation.set(-0.25 * prog, 0, 0.1);
                    this.legR.rotation.set(0.20 * prog, 0, -0.1);
                } else if (phase === 2) {
                    // Phase 2: Grapple driver! Lunge into cabin, grab collar, heave back with right arm
                    const heave = Math.sin(prog * Math.PI);
                    this.torso.rotation.set(0.35 - 0.2 * prog, -0.4 + 0.6 * prog, 0.12);
                    this.head.rotation.set(-0.15, 0.35, 0);
                    this.armL.rotation.set(-1.45, 0.35, -0.25);
                    this.armR.rotation.set(-0.75 + heave * 1.35, -0.5, 0.4);
                    this.legL.rotation.set(0.35, 0, 0.15);
                    this.legR.rotation.set(-0.45, 0, -0.15);
                } else {
                    // Phase 3: Climb into vehicle! Step up onto door sill, right hand on wheel, slide into seat
                    const ease = prog * prog * (3 - 2 * prog);
                    this.group.position.y = anim.baseY - 0.45 * ease;
                    this.torso.rotation.set(0.20 * (1 - ease) + 0.16 * ease, 0.3 * (1 - ease), 0);
                    this.head.rotation.set(-0.12 * ease, 0, 0);
                    this.legL.rotation.set(1.2 * (1 - ease) + 1.52 * ease, 0, 0);
                    this.legR.rotation.set(0.3 * (1 - ease) + 1.52 * ease, 0, 0);
                    this.armL.rotation.set(-0.85, 0, -0.1);
                    this.armR.rotation.set(-0.95, 0, 0.1);
                }
                return;
            }

            // Normal vehicle entry animation (smooth climb in)
            if (anim.enterCar) {
                const prog = clamp(anim.enterCarProgress || 0, 0, 1);
                this.gun.visible = false;
                const ease = prog * prog * (3 - 2 * prog);
                this.group.position.y = anim.baseY - 0.48 * ease;
                this.torso.rotation.set(0.18 * (1 - ease) + 0.16 * ease, 0.25 * (1 - ease), 0);
                this.head.rotation.set(-0.12 * ease, 0, 0);
                this.legL.rotation.set(0.9 * (1 - ease) + 1.52 * ease, 0, 0);
                this.legR.rotation.set(0.2 * (1 - ease) + 1.52 * ease, 0, 0);
                this.armL.rotation.set(-0.85 * (1 - ease) - 0.92 * ease, 0, -0.1);
                this.armR.rotation.set(-1.1 * (1 - ease) - 0.92 * ease, 0, 0.1);
                return;
            }

            // Seated pose (sit emote / vehicle seat). `anim.sitting` ramps
            // 0..1 so standing up and sitting down ease instead of snapping.
            if (anim.sitting > 0.001) {
                const s = clamp(anim.sitting, 0, 1);
                // Pelvis drops to seat height; legs swing forward to
                // horizontal; torso stays upright; hands rest on the knees.
                this.group.position.y = anim.baseY - 0.50 * s;
                this.torso.rotation.set(0.16 * s, 0, 0);
                this.head.rotation.x = -0.12 * s;
                this.head.rotation.y = 0;
                this.legL.rotation.set(1.52 * s, 0, 0);
                this.legR.rotation.set(1.52 * s, 0, 0);
                this.armL.rotation.set(-0.92 * s, 0, -0.10 * s);
                this.armR.rotation.set(-0.92 * s, 0, 0.10 * s);
                this.gun.visible = false;
                return;
            }
            if (anim.swimming) {
                const sp = anim.speed || 0;
                const moving = sp > 0.35;
                const sprint = sp > 3.0;
                const p = anim.swimPhase || 0;

                if (moving) {
                    // PRONE FREESTYLE SWIMMING:
                    // Body lies streamlined horizontally in the water.
                    // Negative Rx tilts the top of the torso forward toward -Z (heading direction).
                    const pitch = sprint ? 1.40 : 1.32;
                    this.torso.rotation.x = -pitch;
                    this.torso.rotation.y = Math.sin(p) * 0.08;
                    this.torso.rotation.z = Math.cos(p) * 0.05;

                    // Head tilts up above water to look forward and breathe
                    this.head.rotation.x = pitch * 0.82;
                    this.head.rotation.y = Math.sin(p) * 0.12;

                    // Arms: natural alternating crawl stroke in torso space
                    const strokeL = p;
                    const strokeR = p + Math.PI;
                    this.armL.rotation.x = -1.6 + Math.cos(strokeL) * 1.3;
                    this.armL.rotation.z = -0.3 + Math.sin(strokeL) * 0.45;
                    this.armL.rotation.y = Math.sin(strokeL) * 0.2;

                    this.armR.rotation.x = -1.6 + Math.cos(strokeR) * 1.3;
                    this.armR.rotation.z = 0.3 - Math.sin(strokeR) * 0.45;
                    this.armR.rotation.y = -Math.sin(strokeR) * 0.2;

                    // Legs: extend backward horizontally in line with torso, alternating flutter kick
                    const kickFreq = sprint ? 8.5 : 5.5;
                    const kickAmp = sprint ? 0.32 : 0.20;
                    const kick = Math.sin(p * kickFreq) * kickAmp;
                    this.legL.rotation.x = -pitch + kick;
                    this.legR.rotation.x = -pitch - kick;
                    this.legL.rotation.z = 0.06;
                    this.legR.rotation.z = -0.06;
                } else {
                    // UPRIGHT TREADING WATER (IDLE):
                    // Gentle forward lean with chin lifted above water
                    this.torso.rotation.x = -0.15;
                    this.torso.rotation.y = Math.sin(p * 1.5) * 0.05;
                    this.torso.rotation.z = 0;

                    this.head.rotation.x = 0.10;
                    this.head.rotation.y = 0;

                    // Arms: gentle sculling / tread sweep at sides
                    const scull = Math.sin(p * 2.2) * 0.22;
                    this.armL.rotation.x = 0.2;
                    this.armR.rotation.x = 0.2;
                    this.armL.rotation.z = -0.55 - scull;
                    this.armR.rotation.z = 0.55 + scull;
                    this.armL.rotation.y = 0;
                    this.armR.rotation.y = 0;

                    // Legs: gentle alternating tread kicks
                    const treadKick = Math.sin(p * 2.2) * 0.25;
                    this.legL.rotation.x = treadKick;
                    this.legR.rotation.x = -treadKick;
                    this.legL.rotation.z = 0.12;
                    this.legR.rotation.z = -0.12;
                }

                this.gun.visible = false;
                this.group.position.y = anim.baseY;
                return;
            }
            // Reset swimming rotations
            this.torso.rotation.y = 0;
            this.torso.rotation.z = 0;
            this.head.rotation.x = 0;
            this.head.rotation.y = 0;
            this.legL.rotation.z = 0;
            this.legR.rotation.z = 0;
            this.armL.rotation.y = 0;
            this.armR.rotation.y = 0;
            this.armL.rotation.z = 0;
            this.armR.rotation.z = 0;

            const speed = anim.speed || 0;
            const run = clamp(speed / PHYS.PLAYER_RUN, 0, 1);
            const freq = 4 + run * 6;
            const amp = 0.25 + run * 0.55;
            const s = Math.sin(anim.phase), c = Math.cos(anim.phase);
            if (anim.airborne) {
                this.legL.rotation.x = -0.5; this.legR.rotation.x = 0.35;
                this.armL.rotation.x = -1.6; this.armR.rotation.x = -1.4;
            } else if (speed > 0.3) {
                this.legL.rotation.x = s * amp;
                this.legR.rotation.x = -s * amp;
                this.armL.rotation.x = -s * amp * 0.8;
                this.armR.rotation.x = s * amp * 0.8;
                this.torso.rotation.x = run * 0.12;
            } else {
                // Idle: subtle breathing sway.
                const b = Math.sin(t * 1.7) * 0.03;
                this.legL.rotation.x = 0; this.legR.rotation.x = 0;
                this.armL.rotation.x = b; this.armR.rotation.x = -b;
                this.torso.rotation.x = 0;
            }
            // Arms override for aiming / punching (positive Rx swings a hanging limb forward, -z).
            const curW = anim.weapon || this._currentWeapon || 'fist';
            const targetW = (curW === 'sniper') ? 'rifle' : curW;
            if (anim.aimT > 0) {
                const a = clamp(anim.aimT, 0, 1);
                this.armR.rotation.x = lerp(this.armR.rotation.x, Math.PI / 2 - 0.1, a);
                this.armL.rotation.x = lerp(this.armL.rotation.x, Math.PI / 2 - 0.45, a * 0.8);
                for (const k in this.weaponMeshes) this.weaponMeshes[k].visible = false;
                if (curW !== 'fist' && this.weaponMeshes && this.weaponMeshes[targetW]) {
                    this.weaponMeshes[targetW].visible = true;
                } else if (this.gun) {
                    this.gun.visible = (curW !== 'fist');
                }
            } else {
                const show = anim.gunOut || false;
                for (const k in this.weaponMeshes) this.weaponMeshes[k].visible = false;
                if (curW !== 'fist' && this.weaponMeshes && this.weaponMeshes[targetW]) {
                    this.weaponMeshes[targetW].visible = show;
                } else if (this.gun) {
                    this.gun.visible = show && (curW !== 'fist');
                }
                if (anim.punchT > 0) {
                    const p = anim.punchT; // 1 -> 0 countdown
                    this.armR.rotation.x = Math.sin(p * Math.PI) * 1.9;
                }
            }
            // Slight bob.
            this.group.position.y = anim.baseY + (speed > 0.3 ? Math.abs(c) * 0.04 * (0.5 + run) : 0);
        }
    }

    /**
     * Third-person player controller: camera-relative movement, gravity,
     * circle-vs-city collision, step-up over curbs/stoops, punch + pistol.
     */
    class PlayerController {
        constructor(rig, physics, camera) {
            this.rig = rig;
            this.physics = physics;
            this.camera = camera;
            this.pos = new THREE.Vector3(SPAWN.x, SPAWN.y !== undefined ? SPAWN.y : 0.2, SPAWN.z);
            this.vel = new THREE.Vector3();
            this.heading = SPAWN.heading;
            this.onGround = true;
            this.health = 100;
            this.armor = 0;
            this.money = 350;
            this.weapon = 'fist';           // 'fist' | 'bat' | 'pistol' | 'shotgun' | 'smg' | 'rifle' | 'sniper'
            this.weapons = ['fist', 'bat', 'pistol', 'shotgun', 'smg', 'rifle', 'sniper'];
            this.ammo = {
                pistol: 24,
                shotgun: 16,
                smg: 60,
                rifle: 90,
                sniper: 15,
            };
            this.medkits = 0;
            this.punchT = 0;
            this.aimT = 0;
            this.shootCd = 0;
            this.recoilT = 0;
            this.animPhase = 0;
            this.camYaw = this.heading;
            this.camPitch = 0.24;
            this.camDist = 4.6;
            this.aiming = false;
            this.inVehicle = null;
            this.scopeZoom = 1;            // sniper/rifle scope magnification (1 = no zoom)
            this._baseFov = this.camera.fov;
            this.dead = false;
            this.swimming = false;
            this.swimPhase = 0;
            this.lastSplashT = 0;
            this._q = [];        // physics scratch
            this._v = new THREE.Vector3();
        }

        selectWeapon(w, hud) {
            if (!this.weapons.includes(w)) this.weapons.push(w);
            this.weapon = w;
            this.scopeZoom = 1;
            if (this.rig && this.rig.setWeaponMesh) this.rig.setWeaponMesh(w);
            if (hud) hud.toast('Equipped ' + (w === 'bat' ? 'BASEBALL BAT' : w.toUpperCase()), '#ffd24b');
        }
        acquireWeapon(w) {
            if (!this.weapons.includes(w)) this.weapons.push(w);
            this.weapon = w;
            if (this.rig && this.rig.setWeaponMesh) this.rig.setWeaponMesh(w);
        }
        nextWeapon(hud) {
            const idx = (this.weapons.indexOf(this.weapon) + 1) % this.weapons.length;
            this.selectWeapon(this.weapons[idx], hud);
        }
        prevWeapon(hud) {
            const idx = (this.weapons.indexOf(this.weapon) - 1 + this.weapons.length) % this.weapons.length;
            this.selectWeapon(this.weapons[idx], hud);
        }

        /** True when the equipped weapon uses the magnifiable scope. */
        get scopedWeapon() {
            return this.weapon === 'sniper' || this.weapon === 'rifle';
        }

        /** Maximum magnification for the current scoped weapon. */
        get scopeMax() {
            return this.weapon === 'sniper' ? 8 : (this.weapon === 'rifle' ? 3 : 1);
        }

        /** Nudge scope zoom; dir > 0 zooms in, dir < 0 zooms out. */
        adjustScope(dir) {
            if (!this.scopedWeapon) return;
            // One wheel/swipe notch per step: in = 1.25x, out = 0.8x.
            this.scopeZoom = clamp(this.scopeZoom * (dir > 0 ? 1.25 : 0.8), 1, this.scopeMax);
        }

        get eyeY() { return this.pos.y + PHYS.EYE_HEIGHT; }

        update(dt, input, t, fx) {
            if (this.dead) return;
            const rig = this.rig, phys = this.physics;

            // ---- combat timers ---------------------------------------------------
            if (this.punchT > 0) this.punchT = Math.max(0, this.punchT - dt * 3.2);
            if (this.shootCd > 0) this.shootCd -= dt;
            if (this.recoilT > 0) this.recoilT = Math.max(0, this.recoilT - dt * 6);
            this.aimT = damp(this.aimT, this.aiming ? 1 : 0, 12, dt);

            // ---- camera orbit input ----------------------------------------------
            const sens = this.lookSens !== undefined ? this.lookSens : 1;
            if (input.lookDx) this.camYaw -= input.lookDx * 0.0042 * sens;
            if (input.lookDy) this.camPitch = clamp(this.camPitch + input.lookDy * 0.003 * sens, -0.85, 1.1);
            input.lookDx = input.lookDy = 0;

            // ---- water & swimming detection ---------------------------------------
            const waterSurface = getWaterSurface(this.pos.x, this.pos.z, t);
            const inWater = (waterSurface > -900 && this.pos.y <= waterSurface + 0.15);

            if (inWater && !this.swimming) {
                this.swimming = true;
                this.onGround = false;
                this.vel.y = Math.max(this.vel.y * 0.3, -3.0); // cushion fall into water
                if (fx) fx.splash(this.pos.x, waterSurface, this.pos.z);
            } else if (!inWater && this.onGround && this.swimming) {
                this.swimming = false;
            }

            if (this.swimming) {
                // Aiming is disabled while swimming
                this.aiming = false;

                // ---- swimming movement (WASD / Arrows) -------------------------------
                let ix = 0, iz = 0;
                if (input.keys.KeyW || input.keys.ArrowUp) iz -= 1;
                if (input.keys.KeyS || input.keys.ArrowDown) iz += 1;
                if (input.keys.KeyA || input.keys.ArrowLeft) ix -= 1;
                if (input.keys.KeyD || input.keys.ArrowRight) ix += 1;
                const moving = ix !== 0 || iz !== 0;
                const sprint = input.keys.ShiftLeft || input.keys.ShiftRight;
                const swimSpeed = sprint ? 4.2 : 2.4;

                let wishX = 0, wishZ = 0;
                if (moving) {
                    const inv = 1 / Math.hypot(ix, iz);
                    ix *= inv; iz *= inv;
                    const cy = this.camYaw;
                    const fx_ = -Math.sin(cy), fz_ = -Math.cos(cy);
                    const rx_ = Math.cos(cy), rz_ = -Math.sin(cy);
                    wishX = fx_ * -iz + rx_ * ix;
                    wishZ = fz_ * -iz + rz_ * ix;
                    const wl = Math.hypot(wishX, wishZ) || 1;
                    wishX /= wl; wishZ /= wl;
                    this.heading += angleDelta(this.heading, Math.atan2(-wishX, -wishZ)) * Math.min(1, dt * 10);
                }

                // Hydrodynamic drag cushions movement
                const accel = moving ? (sprint ? 14 : 9) : 6;
                this.vel.x = damp(this.vel.x, wishX * (moving ? swimSpeed : 0), accel, dt);
                this.vel.z = damp(this.vel.z, wishZ * (moving ? swimSpeed : 0), accel, dt);

                // ---- vertical buoyancy physics ---------------------------------------
                // In prone swimming (moving): hips (y=0.95 in rig) float right at water line (-0.05).
                // In upright treading (idle): chin/shoulders (y=1.45 in rig) float at surface (+0.15).
                const targetY = moving ? (waterSurface - 0.98) : (waterSurface - 1.28);
                const submerge = targetY - this.pos.y;
                const buoyantForce = clamp(submerge * 18.0, -8.0, 22.0);
                this.vel.y += (buoyantForce - PHYS.GRAVITY * 0.22) * dt;
                this.vel.y = damp(this.vel.y, 0, 7.5, dt);

                // Space bar: surface kick / dolphin kick
                if (input.keys.Space) {
                    this.vel.y = Math.min(this.vel.y + 14.0 * dt, 2.8);
                    if (Math.random() < dt * 3 && fx) fx.splash(this.pos.x, waterSurface, this.pos.z);
                }

                // Integrate position
                this.pos.x += this.vel.x * dt;
                this.pos.z += this.vel.z * dt;
                this.pos.y += this.vel.y * dt;

                // Shallow shore/beach bottom: if feet touch solid ground in shallows, stand up
                const bottom = phys.groundAt(this.pos.x, this.pos.z, waterSurface + 0.5, 2.5, this._q);
                if (bottom > waterSurface - 0.70 && this.pos.y <= bottom + 0.05) {
                    this.pos.y = bottom;
                    this.swimming = false;
                    this.onGround = true;
                    this.vel.y = 0;
                }

                // Collide with seawalls / obstacles
                phys.resolveCircle(this.pos, PHYS.PLAYER_RADIUS, this.pos.y + 0.35, this.pos.y + PHYS.PLAYER_HEIGHT, this._q);

                // ---- effortless shore / seawall mantle (climbing out) ----------------
                const fwdX = -Math.sin(this.heading), fwdZ = -Math.cos(this.heading);
                const checkX = this.pos.x + fwdX * 0.85;
                const checkZ = this.pos.z + fwdZ * 0.85;
                const shoreGround = phys.groundAt(checkX, checkZ, 0.6, 1.2, this._q);
                const nearLand = (typeof LandMask !== 'undefined' && LandMask.inside(checkX, checkZ)) || (shoreGround > -0.2);

                if (nearLand && shoreGround >= -0.15 && shoreGround <= 1.2) {
                    if (input.keys.KeyW || input.keys.Space) {
                        this.pos.x = checkX;
                        this.pos.z = checkZ;
                        this.pos.y = shoreGround + 0.08;
                        this.vel.set(fwdX * 2.2, 1.8, fwdZ * 2.2);
                        this.swimming = false;
                        this.onGround = true;
                        if (fx) fx.splash(this.pos.x, waterSurface, this.pos.z);
                    }
                }

                // Stroke animation phase and splash particles
                this.swimPhase += dt * (moving ? (sprint ? 7.5 : 4.5) : 1.8);
                const speed2d = Math.hypot(this.vel.x, this.vel.z);
                this.lastSplashT = (this.lastSplashT || 0) + dt;
                if (moving && this.lastSplashT > (sprint ? 0.35 : 0.65)) {
                    this.lastSplashT = 0;
                    if (fx) {
                        fx.splash(this.pos.x + fwdX * 0.5, waterSurface, this.pos.z + fwdZ * 0.5);
                        // Sprint strokes churn a foam wake behind the swimmer.
                        if (sprint && fx.foam) fx.foam(this.pos.x - fwdX * 0.6, waterSurface + 0.03, this.pos.z - fwdZ * 0.6, 0.7);
                    }
                }

                // Transform & animate rig
                rig.group.position.set(this.pos.x, this.pos.y, this.pos.z);
                rig.group.rotation.y = this.heading;
                rig.animate(t, {
                    speed: speed2d, phase: this.animPhase,
                    punchT: 0, aimT: 0, airborne: false,
                    baseY: this.pos.y, gunOut: false,
                    swimming: true, swimPhase: this.swimPhase
                });

                this.updateCamera(dt);
                return;
            }

            // ---- movement (camera-relative) ----------------------------------------
            let ix = 0, iz = 0;
            if (input.keys.KeyW || input.keys.ArrowUp) iz -= 1;
            if (input.keys.KeyS || input.keys.ArrowDown) iz += 1;
            if (((input.keys.KeyA && !this.aiming && !input.aShoot) || input.keys.ArrowLeft)) ix -= 1;
            if (input.keys.KeyD || input.keys.ArrowRight) ix += 1;
            const moving = ix !== 0 || iz !== 0;
            const run = !this.aiming && (input.keys.ShiftLeft || input.keys.ShiftRight);
            const targetSpeed = this.aiming ? 2.2 : (run ? PHYS.PLAYER_RUN : PHYS.PLAYER_WALK);
            // Desired direction in world space: camera-relative.
            let wishX = 0, wishZ = 0, planarSpeed = 0;
            if (moving) {
                const inv = 1 / Math.hypot(ix, iz);
                ix *= inv; iz *= inv;
                const cy = this.camYaw;
                const fx_ = -Math.sin(cy), fz_ = -Math.cos(cy);   // camera forward on the plane
                const rx_ = Math.cos(cy), rz_ = -Math.sin(cy);    // camera right
                wishX = fx_ * -iz + rx_ * ix;
                wishZ = fz_ * -iz + rz_ * ix;
                const wl = Math.hypot(wishX, wishZ) || 1;
                wishX /= wl; wishZ /= wl;
                planarSpeed = targetSpeed;
            }
            // Face the aim target while aiming; else face movement.
            let targetHeading = this.heading;
            if (this.aiming) targetHeading = this.camYaw;
            else if (moving) targetHeading = Math.atan2(-wishX, -wishZ);
            this.heading += angleDelta(this.heading, targetHeading) * Math.min(1, dt * 12);

            // ---- horizontal velocity (snappy, GTA-ish) ------------------------------
            const accel = this.onGround ? 34 : 8;
            this.vel.x = damp(this.vel.x, wishX * planarSpeed, accel / 4, dt);
            this.vel.z = damp(this.vel.z, wishZ * planarSpeed, accel / 4, dt);

            // ---- gravity + jump -----------------------------------------------------
            this.vel.y -= PHYS.GRAVITY * dt;
            if (this.onGround && input.keys.Space) {
                this.vel.y = PHYS.PLAYER_JUMP;
                this.onGround = false;
            }

            // ---- integrate + collide -------------------------------------------------
            const preX = this.pos.x, preZ = this.pos.z;
            this.pos.x += this.vel.x * dt;
            this.pos.z += this.vel.z * dt;
            const feet = this.pos.y;
            const hit = phys.resolveCircle(this.pos, PHYS.PLAYER_RADIUS, feet + 0.35, feet + PHYS.PLAYER_HEIGHT, this._q);
            // Step-up: shallow ledges (curbs, stoops, stairs up to 0.50m) are climbable.
            if (hit) {
                const groundAhead = phys.groundAt(this.pos.x, this.pos.z, feet + 0.55, 0.55, this._q);
                if (groundAhead > feet && groundAhead - feet <= 0.50) {
                    this.pos.y = groundAhead;
                    this.vel.y = Math.max(0, this.vel.y);
                    this.onGround = true;
                } else {
                    // Project horizontal velocity out of obstacle to prevent high-frequency shake/jitter and allow smooth sliding
                    const pushX = this.pos.x - (preX + this.vel.x * dt);
                    const pushZ = this.pos.z - (preZ + this.vel.z * dt);
                    const pushLen = Math.hypot(pushX, pushZ);
                    if (pushLen > 1e-4) {
                        const nx = pushX / pushLen, nz = pushZ / pushLen;
                        const vDotN = this.vel.x * nx + this.vel.z * nz;
                        if (vDotN < 0) {
                            this.vel.x -= vDotN * nx;
                            this.vel.z -= vDotN * nz;
                        }
                    }
                }
            }
            this.pos.y += this.vel.y * dt;

            // ---- ground check ----------------------------------------------------------
            const ground = phys.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.5, 0.8, this._q);
            // Snap down shallow drops when grounded so running downhill adheres smoothly to slopes
            if (this.onGround && this.vel.y <= 0 && this.pos.y > ground && this.pos.y - ground <= 0.40) {
                this.pos.y = ground;
            }
            if (this.pos.y <= ground + 0.001 && this.vel.y <= 0) {
                this.pos.y = ground;
                this.vel.y = 0;
                this.onGround = true;
            } else if (this.pos.y > ground + 0.05) {
                this.onGround = false;
            }
            // Drowning: below water outside land.
            if (ground < 0 && this.pos.y < -0.2) { if (fx) fx.playerInWater(); }

            // ---- rig transform + animation ---------------------------------------------
            const speed2d = Math.hypot(this.vel.x, this.vel.z);
            this.animPhase += dt * (4 + clamp(speed2d / PHYS.PLAYER_RUN, 0, 1) * 6);
            if (this.onGround && speed2d > 0.8) {
                this._stepCadence = (this._stepCadence || 0) + dt * (speed2d > 4.5 ? 10.5 : 6.8);
                if (this._stepCadence >= Math.PI) {
                    this._stepCadence -= Math.PI;
                    if (fx && fx.footstep) fx.footstep(this.pos.x, this.pos.z);
                }
            } else {
                this._stepCadence = 0;
            }
            rig.group.position.set(this.pos.x, this.pos.y, this.pos.z);
            rig.group.rotation.y = this.heading;
            rig.animate(t, {
                speed: speed2d, phase: this.animPhase,
                punchT: this.punchT, aimT: this.aimT, airborne: !this.onGround,
                baseY: this.pos.y, gunOut: this.weapon !== 'fist',
                weapon: this.weapon,
            });

            // ---- camera follow ------------------------------------------------------------
            this.updateCamera(dt);
        }

        updateCamera(dt) {
            const aim = this.aimT;
            const dist = lerp(this.camDist, 2.0, aim);
            const height = lerp(1.9, 1.68, aim);
            const side = aim * 0.55;
            const yaw = this.camYaw;
            const pitch = this.camPitch;
            const cx = this.pos.x + Math.sin(yaw) * dist + Math.cos(yaw) * side;
            const cz = this.pos.z + Math.cos(yaw) * dist - Math.sin(yaw) * side;
            const cy = this.pos.y + height + pitch * dist * 0.4;
            this.camera.position.x = damp(this.camera.position.x, cx, 14, dt);
            this.camera.position.y = damp(this.camera.position.y, cy, 10, dt);
            this.camera.position.z = damp(this.camera.position.z, cz, 14, dt);
            // Look at a point ahead and vertically tilted according to pitch
            this._v.set(
                this.pos.x - Math.sin(yaw) * 4 * (1 + aim * 0.5) + Math.cos(yaw) * side,
                this.pos.y + PHYS.EYE_HEIGHT - 0.08 - pitch * 4.5,
                this.pos.z - Math.cos(yaw) * 4 * (1 + aim * 0.5) - Math.sin(yaw) * side,
            );
            this.camera.lookAt(this._v);

            // Scope magnification: aiming a scoped weapon narrows the FOV by
            // scopeZoom so far targets magnify; lowering the weapon eases it back.
            const scoped = this.aiming && this.scopedWeapon;
            const targetFov = this._baseFov / (scoped ? this.scopeZoom : 1);
            if (Math.abs(this.camera.fov - targetFov) > 0.01) {
                this.camera.fov = damp(this.camera.fov, targetFov, 12, dt);
                this.camera.updateProjectionMatrix();
            }
        }

        /** Fire the current weapon. Returns shot info for the game to route. */
        fire(fx) {
            if (this.punchT > 0 && (this.weapon === 'fist' || this.weapon === 'bat')) return null;
            if (this.shootCd > 0) return null;
            if (this.weapon === 'fist') {
                this.punchT = 1;
                this.shootCd = 0.38;
                const yaw = this.heading;
                return {
                    type: 'punch', weapon: 'fist',
                    x: this.pos.x - Math.sin(yaw) * 0.9, z: this.pos.z - Math.cos(yaw) * 0.9,
                    y: this.pos.y + 1.2, r: 1.0, damage: 22,
                };
            }
            if (this.weapon === 'bat') {
                this.punchT = 1;
                this.shootCd = 0.44;
                const yaw = this.heading;
                return {
                    type: 'punch', weapon: 'bat',
                    x: this.pos.x - Math.sin(yaw) * 1.3, z: this.pos.z - Math.cos(yaw) * 1.3,
                    y: this.pos.y + 1.2, r: 1.6, damage: 48,
                };
            }

            // Firearms: ensure continuous ammo so shooting never jams on empty
            if (typeof this.ammo === 'object') {
                if ((this.ammo[this.weapon] || 0) <= 0) this.ammo[this.weapon] = 24;
                this.ammo[this.weapon]--;
            } else {
                if (this.ammo <= 0) this.ammo = 24;
                this.ammo--;
            }

            // 3D Gun muzzle origin in world space (right hand)
            const yaw = this.heading;
            const fwdX = -Math.sin(yaw), fwdZ = -Math.cos(yaw);
            const rightX = Math.cos(yaw), rightZ = -Math.sin(yaw);
            const ox = this.pos.x + fwdX * 0.65 + rightX * 0.26;
            const oy = this.pos.y + 1.28;
            const oz = this.pos.z + fwdZ * 0.65 + rightZ * 0.26;

            // Target point: accurately raycast forward through camera crosshairs
            const camDir = new THREE.Vector3();
            this.camera.getWorldDirection(camDir);
            const camPos = this.camera.position;
            const maxRange = this.weapon === 'sniper' ? 300 : (this.weapon === 'rifle' ? 150 : (this.weapon === 'smg' ? 90 : (this.weapon === 'shotgun' ? 55 : 95)));

            // Physics collision check from camera along crosshairs
            const camHit = this.physics.raycast(camPos.x, camPos.y, camPos.z, camDir.x, camDir.y, camDir.z, maxRange, this._q);
            let aimTargetX, aimTargetY, aimTargetZ;
            if (camHit) {
                aimTargetX = camHit.x; aimTargetY = camHit.y; aimTargetZ = camHit.z;
            } else {
                aimTargetX = camPos.x + camDir.x * maxRange;
                aimTargetY = camPos.y + camDir.y * maxRange;
                aimTargetZ = camPos.z + camDir.z * maxRange;
            }

            // Shotgun buckshot
            if (this.weapon === 'shotgun') {
                this.shootCd = 0.62;
                this.recoilT = 1.5;
                if (fx) fx.muzzleFlash(ox, oy, oz, yaw);
                const pellets = [];
                for (let i = 0; i < 6; i++) {
                    const spX = (Math.random() - 0.5) * 3.5;
                    const spY = (Math.random() - 0.5) * 2.2;
                    const spZ = (Math.random() - 0.5) * 3.5;
                    const tx = aimTargetX + spX;
                    const ty = aimTargetY + spY;
                    const tz = aimTargetZ + spZ;
                    const pdx = tx - ox, pdy = ty - oy, pdz = tz - oz;
                    const pdist = Math.hypot(pdx, pdy, pdz) || 1;
                    const ndx = pdx / pdist, ndy = pdy / pdist, ndz = pdz / pdist;
                    const hit = this.physics.raycast(ox, oy, oz, ndx, ndy, ndz, maxRange, this._q);
                    const hitDist = hit ? hit.dist : maxRange;
                    pellets.push({
                        dx: ndx, dy: ndy, dz: ndz,
                        range: hitDist,
                        damage: 18,
                        endX: hit ? hit.x : ox + ndx * maxRange,
                        endY: hit ? hit.y : oy + ndy * maxRange,
                        endZ: hit ? hit.z : oz + ndz * maxRange,
                    });
                }
                return { type: 'shotgun', weapon: 'shotgun', x: ox, y: oy, z: oz, pellets };
            }

            let dmg = 26;
            if (this.weapon === 'sniper') {
                this.shootCd = 0.95;
                this.recoilT = 1.5;
                dmg = 90;
            } else if (this.weapon === 'smg') {
                this.shootCd = 0.10;
                this.recoilT = 0.6;
                dmg = 18;
            } else if (this.weapon === 'rifle') {
                this.shootCd = 0.13;
                this.recoilT = 0.9;
                dmg = 38;
            } else {
                this.shootCd = 0.22;
                this.recoilT = 1.0;
                dmg = 26;
            }

            // Normalized bullet vector from gun muzzle to crosshairs aim point
            const bdx = aimTargetX - ox, bdy = aimTargetY - oy, bdz = aimTargetZ - oz;
            const bdist = Math.hypot(bdx, bdy, bdz) || 1;
            const dx = bdx / bdist, dy = bdy / bdist, dz = bdz / bdist;

            // Physics raycast along bullet trajectory
            const wallHit = this.physics.raycast(ox, oy, oz, dx, dy, dz, maxRange, this._q);
            const range = wallHit ? wallHit.dist : maxRange;

            if (fx) fx.muzzleFlash(ox, oy, oz, yaw);

            return {
                type: 'shot', weapon: this.weapon,
                x: ox, y: oy, z: oz,
                dx, dy, dz,
                range,
                damage: dmg,
                endX: wallHit ? wallHit.x : ox + dx * range,
                endY: wallHit ? wallHit.y : oy + dy * range,
                endZ: wallHit ? wallHit.z : oz + dz * range,
            };
        }

        damage(amount, fx) {
            if (this.dead) return;
            if (this.armor > 0) {
                const absorbed = Math.min(this.armor, amount * 0.6);
                this.armor -= absorbed;
                amount -= absorbed;
            }
            this.health -= amount;
            if (fx) fx.playerHurt(amount);
            if (this.health <= 0) { this.health = 0; this.dead = true; }
        }

        heal(n) { this.health = Math.min(100, this.health + n); }
    }
