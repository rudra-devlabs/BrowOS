    // ===========================================================================
    // PEDS — instanced part-based pedestrians with sidewalk-graph AI
    // ===========================================================================
    /**
     * Ped geometries. Unlike the player rig (one Group of meshes), peds are
     * rendered as 8 InstancedMeshes of body parts; per-ped coloring rides on
     * instanceColor multiplying the white vertex colors. Parts that keep a
     * fixed color (belt) carry baked vertex colors + a white tint.
     */
    const PedFactory = {
        geo: null,
        build() {
            if (this.geo) return this.geo;
            const mk = (fn) => { const b = new GeoBatch(); fn(b); return b.buildGeometry(); };
            this.geo = {
                // Origins sit at the part's joint (same convention as RigFactory).
                chest: mk((b) => {
                    // Tapered stylish torso with collar, seam, and chest pocket
                    b.box(0, 0.36, 0, 0.44, 0.32, 0.25, [1, 1, 1]);
                    b.box(0, 0.17, 0, 0.38, 0.22, 0.22, [0.96, 0.96, 0.96]);
                    b.box(0, 0.49, -0.015, 0.14, 0.08, 0.14, [0.98, 0.98, 0.98]); // collar
                    b.box(0, 0.33, -0.128, 0.02, 0.34, 0.01, [0.85, 0.85, 0.85]); // seam
                    b.box(0.12, 0.38, -0.128, 0.08, 0.07, 0.012, [0.92, 0.92, 0.92]); // pocket
                }),
                belt: mk((b) => {
                    b.box(0, 0.02, 0, 0.39, 0.08, 0.23, [1, 1, 1]);
                    b.box(0, 0.02, -0.122, 0.08, 0.065, 0.02, [4.5, 4.5, 4.8]); // polished silver buckle
                }),
                face: mk((b) => {
                    // Stylized head with chin, nose, ears, and dark sunglasses
                    b.box(0, 0.10, 0, 0.22, 0.22, 0.22, [1, 1, 1]);
                    b.box(0, -0.01, -0.01, 0.18, 0.05, 0.18, [1, 1, 1]); // chin
                    b.box(0, 0.09, -0.125, 0.045, 0.065, 0.045, [1, 1, 1]); // nose
                    b.box(-0.115, 0.10, 0, 0.03, 0.07, 0.05, [1, 1, 1]); // left ear
                    b.box(0.115, 0.10, 0, 0.03, 0.07, 0.05, [1, 1, 1]); // right ear
                    // Aviator sunglasses (dark tint)
                    b.box(0, 0.125, -0.118, 0.18, 0.055, 0.035, [0.10, 0.10, 0.12]);
                    b.box(0, 0.13, -0.114, 0.20, 0.02, 0.015, [0.18, 0.18, 0.20]);
                }),
                hair: mk((b) => {
                    // Volumetric textured haircut / cap
                    b.box(0, 0.22, -0.01, 0.23, 0.08, 0.23, [1, 1, 1]);
                    b.box(0, 0.23, -0.07, 0.21, 0.07, 0.12, [1, 1, 1]);
                    b.box(0, 0.16, 0.02, 0.235, 0.12, 0.20, [0.92, 0.92, 0.92]);
                }),
                sleeve: mk((b) => {
                    b.box(0, -0.08, 0, 0.15, 0.18, 0.15, [1, 1, 1]); // shoulder
                    b.box(0, -0.24, 0, 0.13, 0.22, 0.13, [0.96, 0.96, 0.96]); // arm
                    b.box(0, -0.38, 0, 0.135, 0.08, 0.135, [0.92, 0.92, 0.92]); // cuff
                }),
                hand: mk((b) => {
                    b.box(0, -0.48, 0, 0.10, 0.12, 0.10, [1, 1, 1]);
                    b.box(0, -0.55, 0, 0.09, 0.06, 0.09, [0.95, 0.95, 0.95]); // knuckles
                    b.box(0.045, -0.47, -0.025, 0.04, 0.06, 0.04, [0.95, 0.95, 0.95]); // thumb
                }),
                pant: mk((b) => {
                    b.box(0, -0.20, 0, 0.18, 0.38, 0.19, [1, 1, 1]); // thigh
                    b.box(0, -0.52, 0, 0.16, 0.38, 0.17, [0.96, 0.96, 0.96]); // shin
                    b.box(0, -0.71, 0, 0.17, 0.04, 0.18, [0.90, 0.90, 0.90]); // cuff
                }),
                shoe: mk((b) => {
                    b.box(0, -0.78, -0.05, 0.17, 0.10, 0.28, [1, 1, 1]); // shoe upper
                    b.box(0, -0.84, -0.05, 0.18, 0.04, 0.30, [4.0, 4.0, 4.0]); // bright white rubber sole
                    b.box(0, -0.80, -0.19, 0.16, 0.06, 0.05, [4.0, 4.0, 4.0]); // toe bumper
                }),
            };
            return this.geo;
        },
    };

    // Realistic diverse human skin & hair spectrum
    const PED_SKINS = [
        [1.0, 0.86, 0.74],  // Fair / porcelain
        [0.96, 0.80, 0.65], // Light beige / peach
        [0.88, 0.70, 0.54], // Warm sand / golden
        [0.76, 0.56, 0.40], // Olive / honey
        [0.62, 0.44, 0.32], // Bronze / warm brown
        [0.48, 0.33, 0.24], // Deep chestnut
        [0.35, 0.23, 0.17], // Rich espresso
        [0.24, 0.16, 0.12], // Deep dark umber
    ];
    const PED_HAIRS = [
        [0.10, 0.08, 0.07], // Jet black
        [0.22, 0.15, 0.10], // Dark chocolate brown
        [0.42, 0.28, 0.16], // Chestnut / medium brown
        [0.65, 0.42, 0.20], // Auburn / ginger
        [0.82, 0.70, 0.44], // Golden blonde
        [0.90, 0.85, 0.72], // Platinum / ash blonde
        [0.65, 0.65, 0.68], // Silver / salt & pepper
        [0.88, 0.88, 0.90], // White
    ];

    // Real-life citizen archetypes with authentic city color palettes and speeds
    const PED_ROLES = {
        business: {
            name: 'business',
            weight: 22,
            baseSpeed: 1.32,
            shirts: [
                [0.18, 0.22, 0.32], // Navy suit
                [0.15, 0.15, 0.17], // Charcoal suit
                [0.26, 0.28, 0.30], // Slate grey suit
                [0.86, 0.86, 0.88], // Crisp white shirt
                [0.70, 0.66, 0.58], // Beige / cream executive
            ],
            pants: [
                [0.18, 0.22, 0.32], // Matching navy
                [0.15, 0.15, 0.17], // Matching charcoal
                [0.22, 0.24, 0.26], // Matching slate grey
                [0.20, 0.20, 0.22], // Classic black slacks
            ],
            shoes: [
                [0.12, 0.12, 0.12], // Oxford black
                [0.28, 0.18, 0.12], // Cordovan leather
                [0.38, 0.24, 0.16], // Tan brogues
            ],
        },
        casual: {
            name: 'casual',
            weight: 34,
            baseSpeed: 1.25,
            shirts: [
                [0.85, 0.22, 0.18], // Crimson tee
                [0.22, 0.48, 0.78], // Cobalt blue tee
                [0.24, 0.62, 0.42], // Forest green hoodie
                [0.82, 0.72, 0.24], // Mustard gold shirt
                [0.78, 0.78, 0.80], // Heather grey hoodie
                [0.16, 0.16, 0.18], // Pitch black tee
                [0.88, 0.88, 0.86], // Off-white tee
            ],
            pants: [
                [0.18, 0.26, 0.42], // Denim blue jeans
                [0.12, 0.16, 0.26], // Dark wash indigo
                [0.55, 0.50, 0.40], // Khaki chinos
                [0.22, 0.22, 0.24], // Black denim
                [0.34, 0.38, 0.32], // Olive cargos
            ],
            shoes: [
                [0.88, 0.88, 0.88], // White canvas low-tops
                [0.82, 0.20, 0.18], // Red street sneakers
                [0.18, 0.18, 0.20], // Black court shoes
                [0.25, 0.38, 0.60], // Navy trainers
            ],
        },
        jogger: {
            name: 'jogger',
            weight: 12,
            baseSpeed: 2.70,
            shirts: [
                [0.92, 0.32, 0.18], // Neon orange athletic
                [0.15, 0.78, 0.82], // Bright cyan technical tee
                [0.86, 0.90, 0.22], // Hi-vis volt yellow
                [0.82, 0.20, 0.52], // Magenta runner top
                [0.18, 0.18, 0.20], // Sleek black compression
            ],
            pants: [
                [0.14, 0.14, 0.16], // Black running tights
                [0.22, 0.24, 0.28], // Charcoal track pants
                [0.18, 0.22, 0.34], // Deep navy performance
            ],
            shoes: [
                [0.90, 0.85, 0.20], // Neon yellow marathon shoes
                [0.18, 0.82, 0.88], // Cyan racing flats
                [0.92, 0.30, 0.20], // Infrared running shoes
            ],
        },
        worker: {
            name: 'worker',
            weight: 10,
            baseSpeed: 1.15,
            shirts: [
                [0.94, 0.52, 0.12], // Safety high-vis orange
                [0.88, 0.82, 0.14], // Safety high-vis neon yellow
                [0.22, 0.34, 0.52], // Heavy navy work shirt
                [0.52, 0.44, 0.34], // Canvas utility jacket
            ],
            pants: [
                [0.28, 0.26, 0.22], // Heavy brown duck canvas
                [0.18, 0.22, 0.32], // Dark denim work pants
                [0.32, 0.34, 0.28], // Utility khaki
            ],
            shoes: [
                [0.48, 0.32, 0.18], // Tan nubuck steel-toes
                [0.32, 0.20, 0.12], // Heavy brown work boots
                [0.15, 0.15, 0.15], // Black steel-toe boots
            ],
        },
        senior: {
            name: 'senior',
            weight: 8,
            baseSpeed: 0.86,
            shirts: [
                [0.56, 0.48, 0.42], // Taupe cardigan
                [0.34, 0.42, 0.38], // Muted moss sweater
                [0.46, 0.46, 0.56], // Soft blue cardigan
                [0.62, 0.54, 0.50], // Camel sweater
            ],
            pants: [
                [0.38, 0.36, 0.34], // Grey-brown slacks
                [0.25, 0.25, 0.28], // Dark grey trousers
                [0.50, 0.48, 0.42], // Tan slacks
            ],
            shoes: [
                [0.18, 0.16, 0.15], // Orthopedic black walkers
                [0.35, 0.28, 0.22], // Brown comfort shoes
            ],
        },
        // Police officers — uniformed, used by dismount shooters, ambulance
        // being built on, and the jailbreak sequence. Kept out of the ambient
        // sidewalk spawn pool (weight 0) so civilians are always civilians.
        police: {
            name: 'police',
            weight: 0,
            baseSpeed: 1.45,
            shirts: [
                [0.13, 0.20, 0.36], // NYPD navy
                [0.16, 0.22, 0.40], // Patrol navy
                [0.11, 0.18, 0.32], // Midnight navy
            ],
            pants: [
                [0.11, 0.12, 0.15], // Dark duty trousers
                [0.14, 0.15, 0.18], // Charcoal duty trousers
            ],
            shoes: [
                [0.08, 0.08, 0.09], // Black patrol boots
            ],
        },
        // Paramedics — white-yellow duty uniform, used by the ambulance crew.
        medic: {
            name: 'medic',
            weight: 0,
            baseSpeed: 1.30,
            shirts: [
                [0.88, 0.88, 0.88], // Crisp medical whites
                [0.90, 0.90, 0.92], // Cool white scrubs
            ],
            pants: [
                [0.16, 0.34, 0.40], // Teal EMS pants
                [0.18, 0.30, 0.42], // Navy EMS pants
            ],
            shoes: [
                [0.90, 0.90, 0.90], // White EMS shoes
            ],
        },
    };

    /**
     * Pool of instanced pedestrian bodies. Handles spawn/remove, per-ped
     * tinting, and the procedural walk / flee / collapse poses.
     */
    class PedRenderer {
        constructor(scene, matFlat, count, glb) {
            const geo = (glb && glb.scene) ? PedRenderer.glbParts(glb) : PedFactory.build();
            this.count = count;
            this.mat = matFlat.clone();
            const mk = (g, n) => {
                const m = new THREE.InstancedMesh(g, this.mat, n);
                if (m.instanceMatrix.setUsage) m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
                m.frustumCulled = false;
                scene.add(m);
                return m;
            };
            this.chest = mk(geo.chest, count);
            this.belt = mk(geo.belt, count);
            this.face = mk(geo.face, count);
            this.hair = mk(geo.hair, count);
            this.sleeve = mk(geo.sleeve, count * 2);
            this.hand = mk(geo.hand, count * 2);
            this.pant = mk(geo.pant, count * 2);
            this.shoe = mk(geo.shoe, count * 2);
            this._dummy = new THREE.Object3D();
            this._dummy.rotation.order = 'YXZ';
            this._col = new THREE.Color();
            this.free = [];
            for (let i = count - 1; i >= 0; i--) this.free.push(i);
            this.peds = [];
            this._hideAll();
        }

        /**
         * Extract the 8 instanced part geometries from a contract ped GLB.
         * Uses prefix/regex matching so GLTFLoader name de-duplication
         * (e.g. Skin_2, Shirt_1) resolves correctly, with guaranteed procedural fallbacks.
         */
        static glbParts(gltf) {
            const root = gltf.scene;
            root.updateMatrixWorld(true);
            const fallback = PedFactory.build();
            const findChild = (parent, pattern) => {
                if (!parent) return null;
                const re = typeof pattern === 'string' ? new RegExp('^' + pattern + '(_\\d+)?$', 'i') : pattern;
                for (const c of parent.children) if (re.test(c.name)) return c;
                for (const c of parent.children) {
                    const r = findChild(c, re);
                    if (r) return r;
                }
                return null;
            };
            const torso = findChild(root, 'Torso');
            const head = findChild(root, 'Head');
            const armL = findChild(root, 'ArmL') || findChild(root, 'Arm_L');
            const legL = findChild(root, 'LegL') || findChild(root, 'Leg_L');
            const mergePart = (pivot, skipFn) => {
                if (!pivot) return null;
                const g = glbMergedGeometry(pivot, { relTo: pivot, skip: skipFn });
                return (g && g.attributes && g.attributes.position && g.attributes.position.count > 0) ? g : null;
            };
            // In ped contract GLB: torso has Head and Gun as children. Skip them so chest only holds torso geometry!
            const chestGeo = mergePart(torso, (name, o) => {
                if (o === torso) return false;
                return (name === 'Head' || name === 'Gun' || o.name === 'Head' || o.name === 'Gun' || (o.parent && o.parent.name === 'Head'));
            });
            const armGeo = mergePart(armL);
            const legGeo = mergePart(legL);
            const headGeo = mergePart(head);
            return {
                chest: chestGeo || fallback.chest,
                belt: fallback.belt,
                face: headGeo || fallback.face,
                hair: fallback.hair,
                sleeve: armGeo || fallback.sleeve,
                hand: fallback.hand,
                pant: legGeo || fallback.pant,
                shoe: fallback.shoe,
            };
        }

        _hideAll() {
            const d = this._dummy;
            d.position.set(0, -500, 0);
            d.rotation.set(0, 0, 0);
            d.scale.set(0.001, 0.001, 0.001);
            d.updateMatrix();
            for (const m of [this.chest, this.belt, this.face, this.hair]) {
                for (let i = 0; i < this.count; i++) m.setMatrixAt(i, d.matrix);
                m.instanceMatrix.needsUpdate = true;
            }
            for (const m of [this.sleeve, this.hand, this.pant, this.shoe]) {
                for (let i = 0; i < this.count * 2; i++) m.setMatrixAt(i, d.matrix);
                m.instanceMatrix.needsUpdate = true;
            }
        }

        spawn(x, z, rng) {
            const idx = this.free.pop();
            if (idx === undefined) return null;

            // Pick archetype role based on city distribution weights
            const roleKeys = Object.keys(PED_ROLES);
            const totalWeight = roleKeys.reduce((s, k) => s + PED_ROLES[k].weight, 0);
            let rw = rng() * totalWeight, roleKey = 'casual';
            for (const k of roleKeys) {
                rw -= PED_ROLES[k].weight;
                if (rw <= 0) { roleKey = k; break; }
            }
            const role = PED_ROLES[roleKey];

            const p = {
                idx, x, z, y: 0,
                role: roleKey,
                heading: rng() * Math.PI * 2, moveHeading: 0,
                speed: 0, phase: rng() * 10, amp: 0.3,
                scale: 0.92 + rng() * 0.14,
                state: roleKey === 'jogger' ? 'jog' : 'walk',
                node: -1, prev: -1,
                // Route: a node index list from SidewalkRouter, walked front to back.
                path: null, pathI: 0, goal: -1,
                pendingXw: null, crossXw: null,
                baseSpeed: role.baseSpeed * (0.93 + rng() * 0.14),
                vx: 0, vz: 0, sepX: 0, sepZ: 0, hurryT: 0,
                lastD: 1e9, stuckT: 0,
                fleeX: 0, fleeZ: 0, fleeT: 0, deadT: 0, waitT: 0,
                // Life behaviors & gestures
                actionT: 0,
                headPitch: 0,
                headYaw: 0,
                startleT: 0,
                chatTarget: null,
                socialT: 4 + rng() * 30,      // cooldown before this one will chat
                waveT: 0,                     // >0 while nodding to someone passing
                carT: null,                   // car this ped is walking to get into
                enterT: 0,                    // gives up on that car when it runs out
                // Nerve decides what happens when a gun comes out: 0 folds
                // (60%), 1 runs (30%), 2 comes at you (10%). Rolled once, at
                // spawn, so the same person always reacts the same way.
                nerve: rng() < 0.6 ? 0 : rng() < 0.75 ? 1 : 2,
                surrT: 0,                     // >0 while hands are up
                diveT: 0,                     // >0 mid dive-and-roll
                punchT: 0,                    // >0 while throwing a punch
                chargeT: 0,                   // >0 while closing on the player
                dvx: 0, dvz: 0,               // one-shot dive impulse, consumed in _advance
                diveSide: 1,                  // which shoulder the dive rolls over
                surrUp: 0,                    // 0..1 ramp on the hands-up pose
                barkT: 0,                     // cooldown on speech
                threatT: 0,                   // cooldown on re-reading the same threat
                gaveCash: false,              // only hands over the wallet once
            };

            const tint = (mesh, slot, c) => {
                this._col.setRGB(c[0], c[1], c[2]);
                mesh.setColorAt(slot, this._col);
            };

            const shirt = pick(role.shirts, rng);
            const pants = pick(role.pants, rng);
            const skin = pick(PED_SKINS, rng);
            let hair;
            if (roleKey === 'senior') {
                hair = pick([[0.65, 0.65, 0.68], [0.85, 0.85, 0.88], [0.45, 0.42, 0.40]], rng);
            } else if (roleKey === 'worker' && rng() < 0.65) {
                hair = [0.94, 0.82, 0.08]; // Safety hard hat
            } else {
                hair = pick(PED_HAIRS, rng);
            }
            const shoe = pick(role.shoes, rng);

            tint(this.chest, idx, shirt);
            tint(this.belt, idx, [0.18, 0.16, 0.14]);
            tint(this.face, idx, skin);
            tint(this.hair, idx, hair);
            tint(this.sleeve, idx * 2, shirt); tint(this.sleeve, idx * 2 + 1, shirt);
            tint(this.hand, idx * 2, skin); tint(this.hand, idx * 2 + 1, skin);
            tint(this.pant, idx * 2, pants); tint(this.pant, idx * 2 + 1, pants);
            tint(this.shoe, idx * 2, shoe); tint(this.shoe, idx * 2 + 1, shoe);
            for (const m of [this.chest, this.belt, this.face, this.hair, this.sleeve, this.hand, this.pant, this.shoe]) {
                if (m.instanceColor) m.instanceColor.needsUpdate = true;
            }
            this.peds.push(p);
            return p;
        }

        remove(p) {
            const i = this.peds.indexOf(p);
            if (i !== -1) this.peds.splice(i, 1);
            this.free.push(p.idx);
            const d = this._dummy;
            d.position.set(0, -500, 0);
            d.rotation.set(0, 0, 0);
            d.scale.set(0.001, 0.001, 0.001);
            d.updateMatrix();
            for (const m of [this.chest, this.belt, this.face, this.hair]) m.setMatrixAt(p.idx, d.matrix);
            for (const m of [this.sleeve, this.hand, this.pant, this.shoe]) {
                m.setMatrixAt(p.idx * 2, d.matrix);
                m.setMatrixAt(p.idx * 2 + 1, d.matrix);
            }
            for (const m of [this.chest, this.belt, this.face, this.hair, this.sleeve, this.hand, this.pant, this.shoe]) {
                m.instanceMatrix.needsUpdate = true;
            }
        }

        /** Procedural pose: walk cycle, flee run, or collapse + sink, with life-like animations. */
        writePose(p, time) {
            const d = this._dummy;
            const s = p.scale;
            const isJogger = p.role === 'jogger' || p.state === 'jog';
            const run = clamp(p.speed / (isJogger ? 2.8 : 3.8), 0, 1);
            const amp = isJogger ? (0.42 + run * 0.45) : (0.22 + run * 0.6);
            const sw = Math.sin(p.phase) * amp;
            const bob = p.state === 'dead' ? 0 : Math.abs(Math.cos(p.phase)) * (isJogger ? 0.07 : 0.04) * (run > 0.05 ? run : 0.1);
            const h = p.heading;
            let hipY = 0.94, headY = 1.5, fall = 0;
            let armL = -sw * 0.8, armR = sw * 0.8, legL = sw, legR = -sw;
            let armL_z = 0, armR_z = 0;
            let lean = isJogger ? (0.14 + run * 0.08) : (run * 0.12);
            let roll = 0;
            let headPitch = p.headPitch || 0;
            let headYaw = p.headYaw || 0;

            if (p.state === 'dead') {
                const k = Math.min(1, p.deadT / 0.45);
                const ease = k * k * (3 - 2 * k);
                const fallAngle = -ease * 1.52; // -87 degrees forward pitch
                const sink = p.deadT > 3.4 ? Math.min(0.35, (p.deadT - 3.4) * 0.22) * s : 0;

                const fwdX = -Math.sin(h), fwdZ = -Math.cos(h);
                const rightX = Math.cos(h), rightZ = -Math.sin(h);

                // Pelvis / hip drops down to pavement level and slides forward slightly with momentum
                const hipX = p.x + fwdX * (0.35 * ease * s);
                const hipZ = p.z + fwdZ * (0.35 * ease * s);
                const hipY = p.y + lerp(0.94, 0.16, ease) * s - sink;

                // 1. Torso + belt (flat on the ground, back facing up)
                d.position.set(hipX, hipY, hipZ);
                d.rotation.set(fallAngle, h, 0);
                d.scale.set(s, s, s);
                d.updateMatrix();
                this.chest.setMatrixAt(p.idx, d.matrix);
                this.belt.setMatrixAt(p.idx, d.matrix);

                // 2. Head + hair (neck arcs forward onto pavement, head tilted resting on cheek)
                const deltaUp = Math.cos(fallAngle) * (0.56 * s);
                const deltaFwd = -Math.sin(fallAngle) * (0.56 * s);
                d.position.set(hipX + fwdX * deltaFwd, hipY + deltaUp, hipZ + fwdZ * deltaFwd);
                d.rotation.set(fallAngle, h, 0.35 * ease);
                d.scale.set(s, s, s);
                d.updateMatrix();
                this.face.setMatrixAt(p.idx, d.matrix);
                this.hair.setMatrixAt(p.idx, d.matrix);

                // 3. Shoulders + arms (shoulders arc forward with torso, arms rest flat alongside ribs)
                const shUp = Math.cos(fallAngle) * (0.50 * s);
                const shFwd = -Math.sin(fallAngle) * (0.50 * s);
                const shL_x = hipX + fwdX * shFwd - rightX * (0.28 * s);
                const shL_z = hipZ + fwdZ * shFwd - rightZ * (0.28 * s);
                const shL_y = hipY + shUp;
                const shR_x = hipX + fwdX * shFwd + rightX * (0.28 * s);
                const shR_z = hipZ + fwdZ * shFwd + rightZ * (0.28 * s);
                const shR_y = hipY + shUp;

                // Left arm
                d.position.set(shL_x, shL_y, shL_z);
                d.rotation.set(fallAngle, h, -0.15 * ease);
                d.scale.set(s, s, s);
                d.updateMatrix();
                this.sleeve.setMatrixAt(p.idx * 2, d.matrix);
                this.hand.setMatrixAt(p.idx * 2, d.matrix);

                // Right arm
                d.position.set(shR_x, shR_y, shR_z);
                d.rotation.set(fallAngle, h, 0.15 * ease);
                d.scale.set(s, s, s);
                d.updateMatrix();
                this.sleeve.setMatrixAt(p.idx * 2 + 1, d.matrix);
                this.hand.setMatrixAt(p.idx * 2 + 1, d.matrix);

                // 4. Hips + legs (extending backwards behind pelvis, resting flat along pavement)
                const hipL_x = hipX - rightX * (0.11 * s);
                const hipL_z = hipZ - rightZ * (0.11 * s);
                const hipR_x = hipX + rightX * (0.11 * s);
                const hipR_z = hipZ + rightZ * (0.11 * s);

                // Left leg
                d.position.set(hipL_x, hipY, hipL_z);
                d.rotation.set(fallAngle, h, -0.10 * ease);
                d.scale.set(s, s, s);
                d.updateMatrix();
                this.pant.setMatrixAt(p.idx * 2, d.matrix);
                this.shoe.setMatrixAt(p.idx * 2, d.matrix);

                // Right leg
                d.position.set(hipR_x, hipY, hipR_z);
                d.rotation.set(fallAngle, h, 0.10 * ease);
                d.scale.set(s, s, s);
                d.updateMatrix();
                this.pant.setMatrixAt(p.idx * 2 + 1, d.matrix);
                this.shoe.setMatrixAt(p.idx * 2 + 1, d.matrix);

                return;
            } else if (p.diveT > 0) {
                // Dive clear of a car: launch off one foot, tuck, roll over a
                // shoulder, come back up. One hop of air, one roll, no snap.
                const u = clamp(1 - p.diveT / 0.95, 0, 1);
                const air = Math.sin(Math.min(1, u * 1.7) * Math.PI);
                const tuck = u < 0.62 ? u / 0.62 : Math.max(0, (1 - u) / 0.38);
                hipY = 0.94 - 0.52 * tuck + air * 0.20;
                headY = 1.50 - 0.62 * tuck + air * 0.20;
                fall = -1.15 * tuck;
                roll = p.diveSide * 1.35 * tuck;
                armL = -2.10 * tuck; armR = -2.10 * tuck;
                armL_z = -0.50 * tuck; armR_z = 0.50 * tuck;
                legL = 1.25 * tuck; legR = 1.05 * tuck;
                lean = 0;
                headPitch = 0.35 * tuck;
            } else if (p.surrT > 0) {
                // Hands up and trembling. Arms go to -2.8 rad, straight up.
                const up = p.surrUp;
                const tr = (Math.sin(time * 22) * 0.055 + Math.sin(time * 13.5) * 0.03) * up;
                armL = lerp(-0.10, -2.80, up) + tr;
                armR = lerp(0.10, -2.80, up) - tr;
                armL_z = -0.30 * up; armR_z = 0.30 * up;
                legL = 0; legR = 0;
                lean = -0.05 * up;
                roll = tr * 0.35;
                headPitch = 0.16 * up;
                headYaw = tr * 1.2;
                hipY = 0.94 - 0.02 * up;
            } else if (p.punchT > 0) {
                // Windup and a straight right, guard up on the other side.
                const u = clamp(1 - p.punchT / 0.55, 0, 1);
                const jab = Math.sin(u * Math.PI);
                armR = -0.55 - jab * 1.35;
                armR_z = 0.12 - jab * 0.10;
                armL = -1.05 + jab * 0.25;
                armL_z = -0.34;
                legL = sw * 0.45; legR = -sw * 0.45;
                lean = 0.16 + jab * 0.12;
                headPitch = -0.06;
            } else if (p.startleT > 0) {
                // Startle jump reaction (from car honk or near-miss)
                const st = Math.sin(p.startleT * 12);
                hipY += Math.max(0, st * 0.09);
                headY += Math.max(0, st * 0.09);
                armL = -0.75; armR = -0.75; // Hands thrown up in surprise
                armL_z = -0.35; armR_z = 0.35;
                headPitch = -0.16;
            } else if (p.state === 'phone') {
                // Checking smartphone: right hand raised to chest, head tilted down
                armR = -1.15; // Arm lifted up holding phone
                armR_z = -0.28; // Arm brought inwards towards chest
                armL = 0.08 * Math.sin(time * 2); // Left arm relaxed
                headPitch = 0.32; // Looking down at screen
                headYaw = Math.sin(time * 0.8) * 0.06;
                legL = 0; legR = 0;
            } else if (p.state === 'chat') {
                // Conversing: facing partner, conversational arm gestures
                armL = Math.sin(time * 2.5) * 0.2 - 0.15;
                armR = -0.62 + Math.sin(time * 3.2) * 0.28; // Right hand gesturing
                armR_z = -0.22;
                headPitch = -0.05 + Math.sin(time * 2) * 0.07;
                headYaw = Math.sin(time * 1.4) * 0.15;
                legL = 0; legR = 0;
            } else if (p.state === 'sightsee') {
                // Sightseeing: head tilted back looking up at skyscrapers, taking photos
                armL = -0.92; armR = -0.95; // Hands raised taking photo / holding binoculars
                armL_z = -0.16; armR_z = 0.16;
                headPitch = -0.38 + Math.sin(time * 0.9) * 0.08; // Looking up
                headYaw = Math.sin(time * 0.6) * 0.35; // Panning view
                legL = 0; legR = 0;
            } else if (p.state === 'browse') {
                // Window shopping / looking at shopfront
                headYaw = Math.sin(time * 1.2) * 0.42;
                headPitch = 0.12;
                armL = -0.15; armR = -0.15;
                legL = 0; legR = 0;
            } else if (p.state === 'eat') {
                // Customers at food stalls: one hand holds the meal and the head dips between bites.
                armR = -1.02 + Math.sin(time * 2.4) * 0.12;
                armR_z = -0.22;
                armL = -0.18;
                headPitch = 0.28 + Math.sin(time * 1.5) * 0.04;
                legL = 0; legR = 0;
            } else if (p.state === 'wait') {
                // Waiting at crosswalk: look left and right for cars
                headYaw = p.headYaw !== undefined ? p.headYaw : Math.sin(time * 2.2) * 0.58;
                headPitch = 0.05;
                armL = 0; armR = 0;
                legL = 0; legR = 0;
            } else if (p.state === 'sit') {
                // Seated on the kerb / a bench edge: hips dropped, knees
                // bent forward, hands resting on the knees, a lazy sway.
                const idle = Math.sin(time * 1.1 + p.idx) * 0.03;
                hipY = 0.55;
                headY = 1.02;
                legL = 1.22; legR = 1.22;
                armL = -0.74 + idle; armR = -0.74 - idle;
                armL_z = -0.16; armR_z = 0.16;
                lean = 0.03 + idle * 0.3;
                headPitch = 0.05 + idle * 0.5;
            } else if (p.waveT > 0) {
                // A nod and a half-raised hand to someone going the other way.
                // The legs keep their walk cycle — nobody stops to say hello.
                const w = Math.sin((0.9 - p.waveT) * 12);
                armR = -1.28 + w * 0.2;
                armR_z = 0.24;
                armL = -sw * 0.5;
                headYaw = 0.2;
                headPitch = -0.06;
            } else if (isJogger) {
                // Jogger arm pump (elbows bent forward)
                armL = -sw * 1.15 - 0.42;
                armR = sw * 1.15 - 0.42;
                armL_z = -0.16; armR_z = 0.16;
            } else if (p.state === 'flee' || p.state === 'charge') {
                // Full sprint: hard forward lean, bent elbows pumping
                // aggressively, and a longer, higher-knee stride.
                const pump = Math.sin(p.phase) * amp;
                lean = 0.34 + run * 0.14;
                armL = -1.05 + pump * 0.85;
                armR = -1.05 - pump * 0.85;
                armL_z = -0.30; armR_z = 0.30;
                legL = sw * 1.25; legR = -sw * 1.25;
                roll = Math.sin(p.phase * 0.5) * 0.03;
            }

            // Torso + belt share the hip transform.
            d.position.set(p.x, p.y + hipY * s + bob, p.z);
            d.rotation.set(fall + lean, h, roll);
            d.scale.set(s, s, s);
            d.updateMatrix();
            this.chest.setMatrixAt(p.idx, d.matrix);
            this.belt.setMatrixAt(p.idx, d.matrix);

            // Head + hair (with head pitch and yaw).
            d.position.set(p.x, p.y + headY * s + bob, p.z);
            d.rotation.set(fall + lean + headPitch, h + headYaw, roll);
            d.scale.set(s, s, s);
            d.updateMatrix();
            this.face.setMatrixAt(p.idx, d.matrix);
            this.hair.setMatrixAt(p.idx, d.matrix);

            // Limbs: sleeve + hand share the joint pivot (zero double-offset).
            // Pivots ride the hip so the shoulders stay welded to the torso when
            // a pose drops the body (dive, surrender crouch) — 1.44 / 0.94 in
            // the standing case, exactly as before.
            const shY = hipY + 0.50;
            this._limb(this.sleeve, this.hand, p.idx * 2, p, shY, -0.28, armL, armL_z + roll, bob);
            this._limb(this.sleeve, this.hand, p.idx * 2 + 1, p, shY, 0.28, armR, armR_z + roll, bob);
            // Legs: pant + shoe share the hip joint pivot (zero double-offset).
            this._limb(this.pant, this.shoe, p.idx * 2, p, hipY, -0.11, legL, roll, 0);
            this._limb(this.pant, this.shoe, p.idx * 2 + 1, p, hipY, 0.11, legR, roll, 0);
        }

        /**
         * One limb: sleeve + hand (or pant + shoe) share the joint pivot.
         * The sleeve / pant geometry hangs from the pivot; the hand / shoe
         * geometry hangs from the exact same pivot so they form a continuous,
         * seamless limb.
         */
        _limb(mesh, endMesh, slot, p, pivotY, offX, swingX, swingZ, bob) {
            const d = this._dummy;
            const s = p.scale;
            const h = p.heading;
            const px = p.x + Math.cos(h) * offX * s;
            const pz = p.z - Math.sin(h) * offX * s;
            const py = p.y + (pivotY * s) + (pivotY > 1 ? bob : 0);
            d.position.set(px, py, pz);
            d.rotation.set(swingX, h, swingZ || 0);
            d.scale.set(s, s, s);
            d.updateMatrix();
            mesh.setMatrixAt(slot, d.matrix);
            endMesh.setMatrixAt(slot, d.matrix);
        }

        flush() {
            for (const m of [this.chest, this.belt, this.face, this.hair, this.sleeve, this.hand, this.pant, this.shoe]) {
                m.instanceMatrix.needsUpdate = true;
            }
        }
    }

    /**
     * A* over the sidewalk graph.
     *
     * Everything is preallocated and reused: a generation stamp stands in for
     * clearing 5k slots per search, and the open set is a flat binary heap, so a
     * replanning ped allocates nothing. `budget` caps the pops so even a
     * city-wide goal on a bad day cannot stall a frame — an exhausted search
     * just returns null and the ped picks a nearer goal instead.
     */
    class SidewalkRouter {
        constructor(map) {
            this.map = map;
            const n = map.sidewalkNodes.length;
            this.g = new Float32Array(n);
            this.came = new Int32Array(n);
            this.stamp = new Int32Array(n);
            this.closed = new Uint8Array(n);
            this.gen = 0;
            const cap = n * 4 + 16;
            this.hId = new Int32Array(cap);
            this.hF = new Float32Array(cap);
            this.hN = 0;
            this.cap = cap;
            this.pops = 0;      // last search cost, for diagnostics
            // A node can only be closed once, so this many pops is an exhaustive
            // sweep: search with it and connectivity alone decides the answer.
            this.full = n + 8;
        }

        _push(id, f) {
            if (this.hN + 1 >= this.cap) return;       // degrade, never throw
            let i = ++this.hN;
            this.hId[i] = id; this.hF[i] = f;
            while (i > 1) {
                const p = i >> 1;
                if (this.hF[p] <= this.hF[i]) break;
                const ti = this.hId[p], tf = this.hF[p];
                this.hId[p] = this.hId[i]; this.hF[p] = this.hF[i];
                this.hId[i] = ti; this.hF[i] = tf;
                i = p;
            }
        }

        _pop() {
            const top = this.hId[1];
            this.hId[1] = this.hId[this.hN]; this.hF[1] = this.hF[this.hN];
            this.hN--;
            let i = 1;
            for (;;) {
                const l = i << 1, r = l + 1;
                let s = i;
                if (l <= this.hN && this.hF[l] < this.hF[s]) s = l;
                if (r <= this.hN && this.hF[r] < this.hF[s]) s = r;
                if (s === i) break;
                const ti = this.hId[s], tf = this.hF[s];
                this.hId[s] = this.hId[i]; this.hF[s] = this.hF[i];
                this.hId[i] = ti; this.hF[i] = tf;
                i = s;
            }
            return top;
        }

        /**
         * Shortest walk from `start` to `goal`, written into `out` as node
         * indices (start excluded, goal last). Returns true on success.
         * Crossings carry a surcharge so a route only steps into the road when
         * that genuinely saves distance — peds stay on one side of the street
         * the way people actually do.
         */
        find(start, goal, out, budget) {
            out.length = 0;
            const nodes = this.map.sidewalkNodes;
            if (start === goal || start < 0 || goal < 0) return false;
            if (!nodes[start] || !nodes[goal] || !nodes[goal].nbrs.length) return false;
            const gen = ++this.gen;
            const gx = nodes[goal].x, gz = nodes[goal].z;
            // Manhattan, lightly overweighted. Sidewalk rings run along block
            // faces, so |dx|+|dz| is a far tighter bound than the straight line
            // and the search stops fanning out sideways; the 1.15 weight trades
            // a few metres of optimality for a fraction of the pops, which for a
            // ped choosing which corner to turn at is a trade worth making.
            const h = (i) => (Math.abs(nodes[i].x - gx) + Math.abs(nodes[i].z - gz)) * 1.15;
            this.hN = 0;
            this.stamp[start] = gen; this.g[start] = 0;
            this.closed[start] = 0; this.came[start] = -1;
            this._push(start, h(start));
            let pops = 0;
            const cap = budget || 2200;
            while (this.hN > 0 && pops < cap) {
                const cur = this._pop();
                if (this.stamp[cur] !== gen || this.closed[cur]) continue;
                this.closed[cur] = 1;
                pops++;
                if (cur === goal) {
                    this.pops = pops;
                    for (let k = cur; k !== start && k !== -1; k = this.came[k]) out.push(k);
                    out.reverse();
                    return out.length > 0;
                }
                const n = nodes[cur];
                for (let k = 0; k < n.nbrs.length; k++) {
                    const nb = n.nbrs[k];
                    const m = nodes[nb];
                    let step = Math.hypot(m.x - n.x, m.z - n.z);
                    const xw = n.xw[k];
                    if (xw) step += xw.width * 0.5 + (xw.light ? 5 : 12);
                    const ng = this.g[cur] + step;
                    if (this.stamp[nb] !== gen) {
                        this.stamp[nb] = gen; this.closed[nb] = 0;
                        this.g[nb] = ng; this.came[nb] = cur;
                        this._push(nb, ng + h(nb));
                    } else if (!this.closed[nb] && ng < this.g[nb]) {
                        this.g[nb] = ng; this.came[nb] = cur;
                        this._push(nb, ng + h(nb));
                    }
                }
            }
            this.pops = pops;
            return false;
        }
    }

    /**
     * Pedestrian AI.
     *
     * Peds are commuters, not particles: each one picks a destination somewhere
     * in the district (weighted toward shopping frontage and signalized
     * corners), routes to it with A* over the sidewalk graph, and walks the
     * route — waiting at the curb for a walk signal or a gap in traffic before
     * stepping into a crosswalk, hurrying across, then browsing a shopfront for
     * a while when it arrives and picking somewhere new. They keep out of each
     * other's way, step aside for the player, bolt from gunfire, and collapse
     * when run over.
     */
    class PedSystem {
        constructor(renderer, map, physics, field, lights) {
            this.renderer = renderer;
            this.map = map;
            this.physics = physics;
            this.field = field;
            this.lights = lights || null;
            this.router = new SidewalkRouter(map);
            this.target = 44;
            this.spawnCd = 0;
            this.goalCd = 0;
            this._q = [];
            this._ring = [];
            this._goals = [];
            this._replans = 0;      // A* searches left this frame
            this.stats = { plans: 0, planFails: 0, crossings: 0, waits: 0, unwedged: 0, chats: 0, drives: 0, dropOffs: 0, threats: 0, dives: 0 };
        }

        update(dt, time, px, pz, fx, player) {
            this.spawnCd -= dt;
            if (this.spawnCd <= 0) {
                this.spawnCd = 0.3;
                this._scanRing(px, pz);
                this._trySpawn(px, pz);
                this._recycle(px, pz);
                if (this.field) this._serviceCars(px, pz);
            }
            this.goalCd -= dt;
            if (this.goalCd <= 0) {
                this.goalCd = 1.5;
                this._scanGoals(px, pz);
            }
            // A* is cheap but not free; spread replans over frames so a panic
            // that ends with 44 peds rerouting at once cannot spike a frame.
            this._replans = 3;
            const peds = this.renderer.peds;
            const vs = this.field ? this.field.vehicles : null;
            // The player's aim cone, resolved once for the whole pass. Rounds go
            // where the camera looks, so that is what a ped reads as a threat.
            const aiming = !!(player && player.aiming);
            const afX = aiming ? -Math.sin(player.camYaw) : 0;
            const afZ = aiming ? -Math.cos(player.camYaw) : 0;
            this._separate(peds, px, pz);
            for (let i = peds.length - 1; i >= 0; i--) {
                const p = peds[i];
                if (p.state === 'dead') {
                    p.deadT += dt;
                    if (p.deadT > 4.8) { this.renderer.remove(p); continue; }
                    this.renderer.writePose(p, time);
                    continue;
                }
                if (p.hurryT > 0) p.hurryT -= dt;
                if (p.startleT > 0) p.startleT -= dt;
                if (p.waveT > 0) p.waveT -= dt;
                if (p.barkT > 0) p.barkT -= dt;
                if (p.threatT > 0) p.threatT -= dt;
                if (p.diveT > 0) p.diveT -= dt;
                if (p.punchT > 0) p.punchT -= dt;
                if (p.surrT > 0) { p.surrT -= dt; p.surrUp = damp(p.surrUp, 1, 9, dt); }
                else if (p.surrUp > 0.001) p.surrUp = damp(p.surrUp, 0, 7, dt);
                // A gun pointed their way, inside 18 m and roughly at their face.
                if (aiming && p.threatT <= 0 && p.diveT <= 0 &&
                    p.state !== 'flee' && p.state !== 'surrender' && p.state !== 'charge' &&
                    dist2(p.x, p.z, px, pz) < 18 * 18) {
                    const tx = p.x - px, tz = p.z - pz;
                    const td = Math.hypot(tx, tz) || 1;
                    if ((tx / td) * afX + (tz / td) * afZ > 0.86) this._threaten(p, fx, px, pz);
                }
                if (p.state === 'flee') {
                    p.fleeT -= dt;
                    const dx = p.x - p.fleeX, dz = p.z - p.fleeZ;
                    const d = Math.hypot(dx, dz) || 1;
                    p.speed = 4.2;
                    p.vx = (dx / d) * p.speed;
                    p.vz = (dz / d) * p.speed;
                    if (p.fleeT <= 0) { p.state = p.role === 'jogger' ? 'jog' : 'walk'; p.path = null; p.crossXw = null; p.pendingXw = null; }
                } else if (p.state === 'surrender') {
                    // Frozen, hands up, facing whoever is holding the gun. The
                    // wallet comes out halfway through; then they bolt.
                    p.speed = Math.max(0, p.speed - 10 * dt);
                    p.vx = 0; p.vz = 0;
                    p.moveHeading = Math.atan2(-(px - p.x), -(pz - p.z));
                    p.headYaw = 0; p.headPitch = 0;
                    if (!p.gaveCash && p.surrUp > 0.85) {
                        p.gaveCash = true;
                        if (fx && fx.pedDropCash) fx.pedDropCash(p);
                        this._bark(p, 'Take my money!', fx, true);
                    }
                    if (p.surrT <= 0) {
                        this._bark(p, 'Aaaagh!', fx, true);
                        p.state = 'flee';
                        p.fleeX = px; p.fleeZ = pz;
                        p.fleeT = 3.5 + Math.random() * 2.5;
                        p.path = null; p.pendingXw = null; p.crossXw = null;
                    }
                } else if (p.state === 'charge') {
                    // Not everyone runs. Close the distance, then swing.
                    p.chargeT -= dt;
                    const dx = px - p.x, dz = pz - p.z;
                    const d = Math.hypot(dx, dz) || 1;
                    p.moveHeading = Math.atan2(-dx, -dz);
                    if (d > 1.6) {
                        p.speed = 4.0;
                        p.vx = (dx / d) * p.speed;
                        p.vz = (dz / d) * p.speed;
                    } else {
                        p.speed = Math.max(0, p.speed - 10 * dt);
                        p.vx = 0; p.vz = 0;
                        if (p.punchT <= 0) {
                            p.punchT = 0.55;
                            if (fx && fx.pedPunch) fx.pedPunch(p);
                        }
                    }
                    if (p.chargeT <= 0 || d > 28) {
                        p.state = p.role === 'jogger' ? 'jog' : 'walk';
                        p.path = null; p.punchT = 0;
                    }
                } else {
                    // Sidewalk sociability. One dt-scaled roll finds the nearest
                    // oncoming walker: close enough and the two stop to talk, a
                    // little further out and they just nod as they pass. Both
                    // sides then sit out a long cooldown — without one the pair
                    // is still within arm's reach when a chat ends and instantly
                    // re-rolls into another, which reads as a stutter rather
                    // than a conversation. Scaling by dt keeps a 60 fps machine
                    // from being twice as chatty as a 30 fps one.
                    if (p.socialT > 0) p.socialT -= dt;
                    if (p.state === 'walk' && p.role !== 'jogger' && p.socialT <= 0 &&
                        p.startleT <= 0 && Math.random() < dt * 0.5) {
                        let other = null, bestD = 2.6 * 2.6;
                        for (let j = 0; j < peds.length; j++) {
                            const q = peds[j];
                            if (q === p || q.state !== 'walk' || q.role === 'jogger') continue;
                            if (q.socialT > 0 || q.startleT > 0) continue;
                            // Closing on each other, not two strangers abreast.
                            if (p.vx * q.vx + p.vz * q.vz > 0) continue;
                            const d2 = dist2(p.x, p.z, q.x, q.z);
                            if (d2 < bestD && d2 > 0.35 * 0.35) { bestD = d2; other = q; }
                        }
                        if (other && bestD < 1.8 * 1.8) this._startChat(p, other, peds);
                        else if (other) {
                            p.waveT = other.waveT = 0.9;
                            p.socialT = other.socialT = 9 + Math.random() * 12;
                        }
                    }
                    this._advance(p, dt, time, vs, px, pz);
                    // _advance may have decided this ped just got into a car. It
                    // cannot remove itself there: the rest of this loop still
                    // poses `p`, and a freed slot can be re-used under us.
                    if (p.state === 'gone') { this.renderer.remove(p); continue; }
                }
                // Integrate: intent + neighbour steering, then push out of walls.
                let vx = p.vx, vz = p.vz;
                const sx = p.sepX * 1.9, sz = p.sepZ * 1.9;
                const isp = Math.hypot(p.vx, p.vz);
                if (isp > 0.05) {
                    const ux = p.vx / isp, uz = p.vz / isp;
                    let along = sx * ux + sz * uz;
                    const perpX = sx - along * ux, perpZ = sz - along * uz;
                    if (along < -isp * 0.55) along = -isp * 0.55;
                    vx += along * ux + perpX;
                    vz += along * uz + perpZ;
                } else { vx += sx; vz += sz; }
                if (vx || vz) {
                    const pt = { x: p.x + vx * dt, z: p.z + vz * dt };
                    this.physics.resolveCircle(pt, 0.3, p.y + 0.35, p.y + 1.6, this._q);
                    p.x = pt.x; p.z = pt.z;
                }
                // Solid vehicle bodies: slide around parked / slow cars
                // instead of clipping through them. Same tight OBB the
                // player uses, so contact reads at the paint. Fast traffic
                // is left alone here — it run-overs via _trafficInteract.
                if (vs && (p.vx || p.vz) && p.state !== 'enter') {
                    const qv2 = this._qV || (this._qV = { x: 0, z: 0 });
                    for (let vi = 0; vi < vs.length; vi++) {
                        const veh = vs[vi];
                        if (veh.dead || veh.gone) continue;
                        if (Math.abs(veh.speed) > 4) continue;
                        const dx = p.x - veh.x, dz = p.z - veh.z;
                        if (Math.abs(p.y - veh.y) > 2.0) continue;
                        const rr = veh.spec.L * 0.5 + 1.3;
                        if (dx * dx + dz * dz > rr * rr) continue;
                        if (circlePushOutOfVehicle(p.x, p.z, veh, 0.30, qv2)) { p.x = qv2.x; p.z = qv2.z; }
                    }
                }
                if (p.vx || p.vz) p.moveHeading = Math.atan2(-p.vx, -p.vz);
                else p.speed = Math.max(0, p.speed - 8 * dt);
                p.heading += angleDelta(p.heading, p.moveHeading) * clamp(dt * 8, 0, 1);
                p.phase += (0.9 + p.speed * 1.9) * dt * 3.2;
                p.y = this.physics.groundAt(p.x, p.z, p.y + 0.5, 0.6, this._q);

                // Head tracking: glance towards player when walking nearby
                const dp2 = dist2(p.x, p.z, px, pz);
                if (dp2 < 4.5 * 4.5 && p.state !== 'dead' && p.state !== 'flee' && p.startleT <= 0) {
                    const targetYaw = angleDelta(p.heading, Math.atan2(-(px - p.x), -(pz - p.z)));
                    if (Math.abs(targetYaw) < 1.3) p.headYaw = damp(p.headYaw || 0, targetYaw * 0.7, 5, dt);
                } else if (p.headYaw && p.state !== 'browse' && p.state !== 'wait' && p.state !== 'sightsee') {
                    p.headYaw = damp(p.headYaw, 0, 4, dt);
                }

                if (vs) {
                    this._trafficInteract(p, vs, fx);
                    if (p.state === 'dead') continue;
                }
                this.renderer.writePose(p, time);
            }
            this.renderer.flush();
        }

        /**
         * Decide where this ped wants to be a moment from now. Sets p.vx/p.vz;
         * the caller integrates so separation and collision stay in one place.
         */
        _advance(p, dt, time, vs, px, pz) {
            const nodes = this.map.sidewalkNodes;
            // Mid-dive: the launch impulse carries them clear, decaying fast.
            // Nothing else gets a say until they are back on their feet.
            if (p.diveT > 0) {
                const k = Math.exp(-3.4 * dt);
                p.dvx *= k; p.dvz *= k;
                p.vx = p.dvx; p.vz = p.dvz;
                p.speed = Math.hypot(p.vx, p.vz);
                return;
            }
            p.vx = 0; p.vz = 0;

            // Walking to a car door, then getting in. The door is on the far
            // side from the kerb, so they step into the road for it — which is
            // exactly what people do.
            if (p.state === 'enter') {
                const v = p.carT;
                p.enterT -= dt;
                if (!v || v.gone || !v.parked || v.driver || v.claimedBy !== p || p.enterT <= 0) {
                    if (v && v.claimedBy === p) v.claimedBy = null;
                    p.carT = null;
                    p.state = p.role === 'jogger' ? 'jog' : 'walk';
                    p.path = null;
                    const back = this.map.nearestSidewalk(p.x, p.z);
                    if (back >= 0) { p.node = back; p.prev = -1; }
                    return;
                }
                const rx = Math.cos(v.heading), rz = -Math.sin(v.heading);
                const off = v.spec.W / 2 + 0.5;
                const dx = (v.x - rx * off) - p.x, dz = (v.z - rz * off) - p.z;
                const d = Math.hypot(dx, dz);
                if (d < 0.85) {
                    v.claimedBy = null;
                    v.wantsDrive = true;        // traffic takes it over on its tick
                    this.stats.drives++;
                    p.carT = null;
                    p.state = 'gone';           // removed by update(), never here
                    return;
                }
                p.speed = p.baseSpeed * 1.12;
                p.vx = (dx / d) * p.speed;
                p.vz = (dz / d) * p.speed;
                p.moveHeading = Math.atan2(-p.vx, -p.vz);
                return;
            }

            // Life activities: browsing, checking phone, chatting, sightseeing, sitting
            if (p.state === 'browse' || p.state === 'phone' || p.state === 'chat' || p.state === 'sightsee' || p.state === 'eat' || p.state === 'sit') {
                p.waitT -= dt;
                p.speed = Math.max(0, p.speed - 12 * dt);
                if (p.waitT <= 0) {
                    p.state = p.role === 'jogger' ? 'jog' : 'walk';
                    p.headPitch = 0; p.headYaw = 0;
                    p.chatTarget = null;    // don't pin a recycled ped in memory
                }
                return;
            }

            if (p.state !== 'cross' || !p.path) {
                if (!p.path || p.pathI >= p.path.length) {
                    if (!this._plan(p)) {
                        p.state = 'browse';
                        p.waitT = 0.4 + Math.random() * 0.8;   // retry shortly
                        return;
                    }
                }
            }
            const tgt = p.path[p.pathI];
            const tn = nodes[tgt];
            if (!tn) { p.path = null; p.state = p.role === 'jogger' ? 'jog' : 'walk'; p.crossXw = null; return; }

            // At the curb: hold, scan left and right for incoming vehicles, and cross when clear.
            if (p.state === 'wait') {
                p.waitT += dt;
                const isClear = this._crossClear(p.pendingXw, p, time, vs);

                // Head tracking: look towards approaching vehicle or scan left and right
                if (p.threatCar && !p.threatCar.dead && dist2(p.x, p.z, p.threatCar.x, p.threatCar.z) < 65 * 65) {
                    const toCarX = p.threatCar.x - p.x, toCarZ = p.threatCar.z - p.z;
                    const angleToCar = angleDelta(p.heading, Math.atan2(-toCarX, -toCarZ));
                    p.headYaw = damp(p.headYaw || 0, clamp(angleToCar, -1.25, 1.25), 6.5, dt);
                } else {
                    // Actively scan left, center, right, center before stepping into road
                    const lookCycle = 2.2;
                    const phase = (p.waitT % lookCycle) / lookCycle;
                    let targetYaw = 0;
                    if (phase < 0.38) targetYaw = 0.72;        // look left towards traffic
                    else if (phase < 0.5) targetYaw = 0.0;
                    else if (phase < 0.88) targetYaw = -0.72;  // look right towards traffic
                    else targetYaw = 0.0;
                    p.headYaw = damp(p.headYaw || 0, targetYaw, 5.5, dt);
                }

                // Minimum 0.7s curb pause to actually look both ways before stepping off into the road
                if (isClear && p.waitT >= 0.7) {
                    p.state = 'cross';
                    p.crossXw = p.pendingXw;
                    p.pendingXw = null;
                    p.hurryT = 0;
                    p.headYaw = 0;
                    p.threatCar = null;
                    this.stats.crossings++;
                } else if ((!p.pendingXw.light && p.waitT > 12.0) || (p.pendingXw.light && p.waitT > 25.0)) {
                    // Persistent heavy traffic: DO NOT suicidal jaywalk into moving cars.
                    // Safely abandon crossing, stay on the sidewalk of the current block.
                    p.state = p.role === 'jogger' ? 'jog' : 'walk';
                    p.crossXw = null;
                    p.pendingXw = null;
                    p.path = null;
                    p.threatCar = null;
                    p.headYaw = 0;
                    p.waitT = 0.6 + Math.random() * 0.8;
                }
                return;
            }

            const dx = tn.x - p.x, dz = tn.z - p.z;
            const d = Math.hypot(dx, dz);
            // Progress watchdog
            if (d < p.lastD - 0.15) { p.lastD = d; p.stuckT = 0; }
            else {
                p.stuckT += dt;
                if (p.stuckT > 2.5) {
                    p.stuckT = 0; p.lastD = 1e9;
                    const nxt = p.pathI + 1 < p.path.length ? nodes[p.path[p.pathI + 1]] : null;
                    const back = p.prev >= 0 ? nodes[p.prev] : null;
                    if (nxt && dist2(nxt.x, nxt.z, p.x, p.z) < 30 * 30) {
                        p.prev = p.node; p.node = tgt; p.pathI++;
                    } else if (back && dist2(back.x, back.z, p.x, p.z) < 40 * 40) {
                        p.path.length = 0; p.path.push(p.prev); p.pathI = 0;
                    } else {
                        p.path = null;
                        const near = this.map.nearestSidewalk(p.x, p.z);
                        if (near >= 0) p.node = near;
                    }
                    if (p.state === 'cross') { p.state = p.role === 'jogger' ? 'jog' : 'walk'; p.crossXw = null; }
                    this.stats.unwedged++;
                    return;
                }
            }
            if (d < 0.9) {
                p.prev = p.node;
                p.node = tgt;
                p.pathI++;
                p.lastD = 1e9; p.stuckT = 0;
                if (p.state === 'cross') { p.state = p.role === 'jogger' ? 'jog' : 'walk'; p.crossXw = null; }
                if (p.pathI >= p.path.length) {            // arrived at destination
                    // Some of them came here to drive somewhere.
                    if (this.field && p.role !== 'jogger' && p.role !== 'tourist' &&
                        Math.random() < 0.18 && this._claimCar(p, time)) {
                        p.path = null;
                        return;
                    }
                    if (p.role === 'tourist') {
                        p.state = 'sightsee'; p.waitT = 3 + Math.random() * 4;
                    } else if (p.role === 'jogger') {
                        p.state = 'jog'; this._plan(p); return;
                    } else if (p.state === 'chat') {
                        p.state = 'sit'; p.waitT = 4 + Math.random() * 5;
                    } else if (Math.random() < 0.35) {
                        p.state = 'phone'; p.waitT = 2.5 + Math.random() * 4;
                    } else if (Math.random() < 0.22) {
                        p.state = 'sit'; p.waitT = 5 + Math.random() * 7;
                    } else {
                        p.state = 'browse'; p.waitT = 2 + Math.random() * 6;
                    }
                    p.path = null;
                    return;
                }
                const xw = this.map.crossingBetween(p.node, p.path[p.pathI]);
                if (xw) {
                    p.state = 'wait'; p.pendingXw = xw; p.waitT = 0;
                    this.stats.waits++;
                    return;
                }
                // Spontaneous sidewalk life moments
                if (p.role === 'tourist' && Math.random() < 0.16) {
                    p.state = 'sightsee'; p.waitT = 2.5 + Math.random() * 3.5;
                } else if (p.role !== 'jogger' && Math.random() < 0.06) {
                    p.state = 'phone'; p.waitT = 2.0 + Math.random() * 3.0;
                } else if (p.role !== 'jogger' && Math.random() < 0.05) {
                    p.state = 'sit'; p.waitT = 4 + Math.random() * 6;
                } else if (Math.random() < 0.03) {
                    p.state = 'browse'; p.waitT = 1.5 + Math.random() * 3.0;
                }
                return;
            }
            if (p.state === 'cross') {
                // While crossing, stay aware of approaching vehicles in the roadway
                let closeThreat = null, minThreatDist = Infinity;
                if (vs) {
                    for (let vi = 0; vi < vs.length; vi++) {
                        const veh = vs[vi];
                        if (veh.parked || veh.dead) continue;
                        const vd = Math.hypot(veh.x - p.x, veh.z - p.z);
                        if (vd < 32 && vd < minThreatDist && Math.abs(veh.speed) > 2.0) {
                            minThreatDist = vd;
                            closeThreat = veh;
                        }
                    }
                }
                if (closeThreat) {
                    const toCarX = closeThreat.x - p.x, toCarZ = closeThreat.z - p.z;
                    const angleToCar = angleDelta(p.heading, Math.atan2(-toCarX, -toCarZ));
                    p.headYaw = damp(p.headYaw || 0, clamp(angleToCar, -1.2, 1.2), 6, dt);
                    if (minThreatDist < 20) p.hurryT = Math.max(p.hurryT || 0, 1.8);
                } else {
                    p.headYaw = damp(p.headYaw || 0, 0, 4, dt);
                }
            }
            // The player standing deliberately in this ped's path: stop and face
            // them instead of shouldering straight through. Works on foot and
            // when the player is parked up in a vehicle (px/pz is the player pos).
            const pX = px - p.x, pZ = pz - p.z;
            const pDist = Math.hypot(pX, pZ);
            if (pDist < 2.4 && pDist > 1e-4) {
                const ahead = (dx / d) * (pX / pDist) + (dz / d) * (pZ / pDist);
                if (ahead > 0.4) {
                    p.speed = 0;
                    p.vx = 0;
                    p.vz = 0;
                    p.moveHeading = Math.atan2(-pX, -pZ);
                    return;
                }
            }
            const isJog = p.role === 'jogger' || p.state === 'jog';
            const hurry = p.state === 'cross' ? (p.hurryT > 0 ? 2.1 : 1.45) : (p.hurryT > 0 ? 1.9 : (isJog ? 1.15 : 1));
            p.speed = damp(p.speed, p.baseSpeed * hurry, 4, dt);
            p.vx = (dx / d) * p.speed;
            p.vz = (dz / d) * p.speed;
        }

        /** Route to a fresh destination. False if the budget is spent or no goal fits. */
        _plan(p) {
            if (this._replans <= 0) return false;
            const nodes = this.map.sidewalkNodes;
            if (p.node < 0 || !nodes[p.node] || !nodes[p.node].nbrs.length) {
                p.node = this.map.nearestSidewalk(p.x, p.z);
                if (p.node < 0) return false;
            }
            const goal = this._pickGoal(p);
            if (goal < 0 || goal === p.node) return false;
            this._replans--;
            this.stats.plans++;
            if (!p.path) p.path = [];
            if (!this.router.find(p.node, goal, p.path, this.router.full)) {
                this.stats.planFails++;
                const n = nodes[p.node];
                if (!n.nbrs.length) return false;
                // If routing fails, prefer staying on current block's sidewalk rather than stepping onto road
                let chosen = -1;
                for (let k = 0; k < n.nbrs.length; k++) {
                    if (!n.xw[k]) { chosen = n.nbrs[k]; break; }
                }
                if (chosen < 0) chosen = n.nbrs[(Math.random() * n.nbrs.length) | 0];
                p.path.length = 0;
                p.path.push(chosen);
            }
            p.pathI = 0;
            p.lastD = 1e9; p.stuckT = 0;
            p.goal = p.path[p.path.length - 1];
            const xw = this.map.crossingBetween(p.node, p.path[0]);
            if (xw) { p.state = 'wait'; p.pendingXw = xw; p.waitT = 0; this.stats.waits++; }
            else p.state = p.role === 'jogger' ? 'jog' : 'walk';
            return true;
        }

        /** A destination from the weighted pool, far enough to be worth walking to. */
        _pickGoal(p) {
            const pool = this._goals;
            if (!pool.length) return -1;
            const nodes = this.map.sidewalkNodes;
            let fallback = -1;
            for (let t = 0; t < 10; t++) {
                const i = pool[(Math.random() * pool.length) | 0];
                if (i === p.node) continue;
                const d2 = dist2(nodes[i].x, nodes[i].z, p.x, p.z);
                if (d2 > 55 * 55 && d2 < 420 * 420) return i;
                if (fallback < 0) fallback = i;
            }
            return fallback;
        }

        /**
         * Is it safe to step off this curb?
         * Signalized crossings obey the walk phase (traffic signal on crossed road is red),
         * and every crossing scans for approaching vehicles to guarantee a safe arrival window.
         */
        _crossClear(xw, p, time, vs) {
            if (!xw) return true;
            if (p) p.threatCar = null;
            if (xw.light && this.lights && this.lights.stateFor(xw.road, time) !== 'red') return false;
            if (!vs || !vs.length) return true;

            const across = xw.width * 0.5 + 2.5;
            let closestThreatDist = Infinity;
            let mostDangerousCar = null;

            for (let vi = 0; vi < vs.length; vi++) {
                const v = vs[vi];
                if (v.parked || v.dead) continue;
                const d2 = dist2(v.x, v.z, xw.mx, xw.mz);
                if (d2 > 85 * 85) continue;

                const dAlong = xw.axis === 'z' ? Math.abs(v.x - xw.mx) : Math.abs(v.z - xw.mz);
                const dAcross = xw.axis === 'z' ? Math.abs(v.z - xw.mz) : Math.abs(v.x - xw.mx);
                if (dAlong < v.spec.L * 0.5 + 2.0 && dAcross < across) {
                    if (p) p.threatCar = v;
                    return false;
                }

                const sp = Math.abs(v.speed);
                const fx = -Math.sin(v.heading), fz = -Math.cos(v.heading);
                const rx = Math.cos(v.heading), rz = -Math.sin(v.heading);
                const ox = xw.mx - v.x, oz = xw.mz - v.z;
                const along = ox * fx + oz * fz;
                const lat = Math.abs(ox * rx + oz * rz);

                if (along > -1.5 && along < 80.0 && lat < xw.width * 0.75 + 3.0) {
                    if (sp < 0.6 && along > 3.8) continue; // stopped before line
                    const tArrival = along / Math.max(0.8, sp);
                    if (tArrival < 5.8 || (along < 28.0 && sp > 1.5)) {
                        if (along < closestThreatDist) {
                            closestThreatDist = along;
                            mostDangerousCar = v;
                        }
                    }
                }
            }

            if (mostDangerousCar) {
                if (p) p.threatCar = mostDangerousCar;
                return false;
            }
            return true;
        }

        /** Keep peds out of each other and out of the player's way. */
        _separate(peds, px, pz) {
            if (this.physics && this.physics.wasmWorld && typeof this.physics.wasmWorld.batchSolvePedSeparation === 'function') {
                if (this.physics.wasmWorld.batchSolvePedSeparation(peds, px, pz)) {
                    return;
                }
            }
            const R = 1.45, R2 = R * R;
            const CS = 0.866, SN = 0.5;
            for (let i = 0; i < peds.length; i++) { peds[i].sepX = 0; peds[i].sepZ = 0; }
            for (let i = 0; i < peds.length; i++) {
                const a = peds[i];
                if (a.state === 'dead') continue;
                for (let j = i + 1; j < peds.length; j++) {
                    const b = peds[j];
                    if (b.state === 'dead') continue;
                    const dx = a.x - b.x, dz = a.z - b.z;
                    const d2 = dx * dx + dz * dz;
                    if (d2 > R2 || d2 < 1e-6) continue;
                    const d = Math.sqrt(d2), f = (R - d) / R / d;
                    const ux = dx * f, uz = dz * f;
                    const rx = ux * CS - uz * SN, rz = ux * SN + uz * CS;
                    a.sepX += rx; a.sepZ += rz;
                    b.sepX -= rx; b.sepZ -= rz;
                }
                const dx = a.x - px, dz = a.z - pz;
                const d2 = dx * dx + dz * dz;
                if (d2 < 4.4 && d2 > 1e-6) {
                    const d = Math.sqrt(d2), f = (2.1 - d) / 2.1 / d * 1.7;
                    a.sepX += dx * f; a.sepZ += dz * f;
                    if (d < 1.65 && a.barkT <= 0 && a.state !== 'dead') {
                        a.startleT = 1.1;
                        const bumpBarks = [
                            "Hey! I'm walkin' here!",
                            "Watch where you're goin', jerk!",
                            "Outta my way, buddy!",
                            "Keep your hands to yourself!",
                            "You blind or somethin'?!",
                            "Watch the jacket, pal!"
                        ];
                        this._bark(a, bumpBarks[(Math.random() * bumpBarks.length) | 0], this.field ? this.field.fx : null, false);
                    }
                }
            }
        }

        /** Run-over check, plus make AI drivers brake and crossing peds hurry. */
        _trafficInteract(p, vs, fx) {
            for (const v of vs) {
                const sp = Math.abs(v.speed);
                if (sp < 0.5) {
                    // Even if the vehicle is stopped, keep it braking if a pedestrian is right in front of its bumper!
                    if (v.driver === 'ai' && v.ai) {
                        const fxv = -Math.sin(v.heading), fzv = -Math.cos(v.heading);
                        const rx = Math.cos(v.heading), rz = -Math.sin(v.heading);
                        const ox = p.x - v.x, oz = p.z - v.z;
                        const fd = ox * fxv + oz * fzv - v.spec.L * 0.5;
                        const ld = Math.abs(ox * rx + oz * rz);
                        if (fd > -0.2 && fd < 3.8 && ld < 2.5) {
                            v.ai.brakeFor = Math.max(v.ai.brakeFor || 0, 0.4);
                        }
                    }
                    continue;
                }
                const d2 = dist2(v.x, v.z, p.x, p.z);
                if (d2 > 18 * 18) continue;
                if (Math.abs(v.y - p.y) > 2.0) continue;
                // True contact test in the car's own frame. The old radial
                // check (L/2 + 0.7 from the CENTER) killed peds standing
                // 1-2m to the SIDE of a sedan — 5m+ beside a bus — without
                // ever touching the car.
                const qv = this._qV || (this._qV = { x: 0, z: 0 });
                if (circlePushOutOfVehicle(p.x, p.z, v, 0.30, qv)) {
                    if (sp > 4) this.kill(p, fx, v);       // actual contact at speed
                    break;
                }
                const fxv = -Math.sin(v.heading), fzv = -Math.cos(v.heading);
                const rx = Math.cos(v.heading), rz = -Math.sin(v.heading);
                const ox = p.x - v.x, oz = p.z - v.z;
                const fd = ox * fxv + oz * fzv - v.spec.L * 0.5;
                const ld = Math.abs(ox * rx + oz * rz);
                if (v.driver === 'ai' && v.ai) {
                    const stopDist = sp * sp / 24 + 3;
                    const maxLd = (p.state === 'cross') ? 3.6 : 2.6;
                    if (fd > 0 && fd < stopDist + 1.5 && ld < maxLd) {
                        v.ai.brakeFor = Math.max(v.ai.brakeFor || 0, 0.35);
                    }
                }
                // Caught in the road with a car bearing down: break into a run.
                if (p.state === 'cross' && sp > 3.5 && fd > 0 && fd < 20 && ld < 4.5) p.hurryT = 1.8;

                // Too late to run: dive. Straight sideways off the car's line,
                // towards whichever side they are already nearer.
                if (sp > 7.5 && p.diveT <= 0 && fd > 0.2 && fd < 7 && ld < 2.2) {
                    const side = (ox * rx + oz * rz) >= 0 ? 1 : -1;
                    p.diveT = 0.95;
                    p.diveSide = side;
                    p.dvx = rx * side * 6.5;
                    p.dvz = rz * side * 6.5;
                    p.startleT = 0; p.surrT = 0; p.punchT = 0;
                    if (p.state === 'surrender' || p.state === 'charge' || p.state === 'enter') {
                        if (p.carT && p.carT.claimedBy === p) p.carT.claimedBy = null;
                        p.carT = null;
                        p.state = p.role === 'jogger' ? 'jog' : 'walk';
                    }
                    p.path = null; p.pendingXw = null; p.crossXw = null;
                    this.stats.dives++;
                    this._bark(p, Math.random() < 0.5 ? 'Watch it, maniac!' : 'Get off the sidewalk!', fx, true);
                    break;
                }

                // Near-miss startled reaction
                if (sp > 6 && d2 < 4.8 * 4.8 && (p.startleT || 0) <= 0 && p.state !== 'flee' && p.state !== 'dead') {
                    p.startleT = 0.85;
                    const awayX = p.x - v.x, awayZ = p.z - v.z;
                    const awayDist = Math.hypot(awayX, awayZ) || 1;
                    p.sepX += (awayX / awayDist) * 3.6;
                    p.sepZ += (awayZ / awayDist) * 3.6;
                }
            }
        }

        /**
         * A gun is pointed at this ped. What happens next was decided at spawn:
         * most fold, some run, a few come at you. Rolling it here instead would
         * make the same person behave differently every time you drew.
         */
        _threaten(p, fx, px, pz) {
            p.threatT = 3.0;
            p.path = null; p.pendingXw = null; p.crossXw = null;
            p.waveT = 0; p.chatTarget = null;
            if (p.carT && p.carT.claimedBy === p) p.carT.claimedBy = null;
            p.carT = null;
            this.stats.threats++;
            if (p.nerve === 0) {
                p.state = 'surrender';
                p.surrT = 2.6 + Math.random() * 1.3;
                p.surrUp = 0;
                p.gaveCash = false;
                this._bark(p, "Please don't shoot!", fx, true);
            } else if (p.nerve === 1) {
                p.state = 'flee';
                p.fleeX = px; p.fleeZ = pz;
                p.fleeT = 4 + Math.random() * 3;
                this._bark(p, Math.random() < 0.5 ? "He's got a gun!" : 'Somebody help!', fx, true);
            } else {
                p.state = 'charge';
                p.chargeT = 7 + Math.random() * 4;
                p.punchT = 0;
                this._bark(p, Math.random() < 0.5 ? 'You picked the wrong guy!' : 'Come on then!', fx, true);
            }
        }

        /**
         * A line of speech over someone's head. Rate-limited per ped, and the
         * HUD pools the elements, so a street full of shouting allocates nothing.
         */
        _bark(p, text, fx, urgent) {
            if (p.barkT > 0 || !fx || !fx.bark) return;
            p.barkT = urgent ? 2.6 + Math.random() * 1.4 : 5 + Math.random() * 4;
            fx.bark(text, p.x, p.y + 1.98, p.z);
        }

        /** Panic from vehicle horn honking nearby. */
        onHorn(x, z, radius = 22, fx) {
            const r2 = radius * radius;
            for (const p of this.renderer.peds) {
                if (p.state === 'dead' || p.state === 'flee') continue;
                const d2 = dist2(p.x, p.z, x, z);
                if (d2 < r2) {
                    p.startleT = 0.9 + Math.random() * 0.6;
                    const toX = x - p.x, toZ = z - p.z;
                    p.moveHeading = Math.atan2(-toX, -toZ);
                    if (p.state === 'cross') p.hurryT = 2.2;
                    if (d2 < 9 * 9 && Math.random() < 0.35) {
                        this._bark(p, Math.random() < 0.5 ? 'Move this piece of junk!' : 'I’m walking here!', fx);
                    }
                }
            }
        }

        kill(p, fx, cause) {
            if (p.state === 'dead') return;
            p.state = 'dead';
            p.deadT = 0;
            if (fx && fx.pedKilled) fx.pedKilled(p, cause);
        }

        /** Panic radius: gunfire, explosions, big crashes. */
        alert(x, z, radius, fx) {
            const r2 = radius * radius;
            let screamed = false;
            for (const p of this.renderer.peds) {
                if (p.state === 'dead') continue;
                if (dist2(p.x, p.z, x, z) < r2) {
                    if (p.state !== 'flee' && !screamed && Math.random() < 0.35) {
                        screamed = true;
                        if (fx && fx.pedScream) fx.pedScream(p.x, p.z);
                    }
                    p.state = 'flee';
                    p.fleeX = x; p.fleeZ = z;
                    p.fleeT = 3 + Math.random() * 3;
                    p.path = null; p.pendingXw = null; p.crossXw = null;
                }
            }
        }

        /**
         * A citizen has been downed: nearby alive pedestrians notice the body
         * and react — some bolt, others scream and this counts as a witness to
         * whatever killed them. Makes the street feel alive around a kill.
         */
        reportBody(p, fx) {
            if (p._bodyReported) return;
            p._bodyReported = true;
            const r2 = 24 * 24;
            for (const o of this.renderer.peds) {
                if (o === p || o.state === 'dead') continue;
                if (dist2(o.x, o.z, p.x, p.z) > r2) continue;
                o.startleT = 0.9;
                if (Math.random() < 0.78) {
                    if (o.state !== 'flee') {
                        o.state = 'flee';
                        o.fleeX = p.x; o.fleeZ = p.z;
                        o.fleeT = 3.5 + Math.random() * 3;
                        o.path = null; o.pendingXw = null; o.crossXw = null;
                    }
                    if (Math.random() < 0.28) this._bark(o, pick(['Oh my god!', 'Someone call 911!', 'There\'s a body!', 'Not again…']), fx, true);
                } else {
                    // Some peds keep their nerve and watch from a distance.
                    o.moveHeading = Math.atan2(-(o.x - p.x), -(o.z - p.z)) + (Math.random() - 0.5) * 0.4;
                    o.heading = o.moveHeading;
                    o.waitT = 4 + Math.random() * 3;
                }
            }
        }

        /** Nodes in the spawn annulus around the player (out of sight, in range). */
        _scanRing(px, pz) {
            const nodes = this.map.sidewalkNodes;
            this._ring.length = 0;
            for (let i = 0; i < nodes.length; i++) {
                if (!nodes[i].nbrs.length) continue;
                const d2 = dist2(nodes[i].x, nodes[i].z, px, pz);
                if (d2 > 45 * 45 && d2 < 130 * 130) this._ring.push(i);
            }
        }

        /**
         * Destination pool, weighted by district foot traffic — repeating a node
         * once per unit of pull is the cheapest weighted pick there is, and the
         * pool only needs rebuilding as the player moves.
         */
        _scanGoals(px, pz) {
            const nodes = this.map.sidewalkNodes;
            const pool = this._goals;
            pool.length = 0;
            for (let i = 0; i < nodes.length; i++) {
                const n = nodes[i];
                if (!n.nbrs.length) continue;
                if (dist2(n.x, n.z, px, pz) > 420 * 420) continue;
                const w = Math.min(4, 1 + (n.poi | 0));
                for (let k = 0; k < w; k++) pool.push(i);
                if (pool.length > 6000) break;
            }
        }

        /**
         * Two walkers stop and talk, and a third one passing close by joins the
         * huddle instead of threading between them — groups of three are what a
         * busy pavement actually looks like. moveHeading is set alongside
         * heading, or the damping in update() would slowly turn them away from
         * each other while they talk.
         */
        _startChat(a, b, peds) {
            const dur = 4 + Math.random() * 5;
            const cool = dur + 24 + Math.random() * 22;
            const face = (m, tx, tz) => {
                m.heading = Math.atan2(-(tx - m.x), -(tz - m.z));
                m.moveHeading = m.heading;
                m.headYaw = 0;
            };
            a.state = 'chat'; b.state = 'chat';
            a.waitT = dur; b.waitT = dur;
            a.socialT = cool; b.socialT = cool;
            a.chatTarget = b; b.chatTarget = a;
            face(a, b.x, b.z); face(b, a.x, a.z);
            this.stats.chats++;
            const mx = (a.x + b.x) * 0.5, mz = (a.z + b.z) * 0.5;
            for (let i = 0; i < peds.length; i++) {
                const c = peds[i];
                if (c === a || c === b || c.state !== 'walk' || c.role === 'jogger') continue;
                if (c.socialT > 0 || c.startleT > 0) continue;
                if (dist2(c.x, c.z, mx, mz) > 2.3 * 2.3) continue;
                c.state = 'chat';
                c.waitT = dur * 0.8;
                c.socialT = cool;
                c.chatTarget = a;
                face(c, mx, mz);
                break;
            }
        }

        /**
         * Someone who has arrived at a kerb with a parked car sometimes gets in
         * and drives off. Called on arrival only, so the scan over vehicles is
         * paid a handful of times a minute, and the claim keeps two peds from
         * converging on the same door.
         */
        _claimCar(p, time) {
            const vs = this.field.vehicles;
            let best = null, bestD = 15 * 15;
            for (let i = 0; i < vs.length; i++) {
                const v = vs[i];
                if (!v.parked || v.dead || v.gone || v.driver || v.type === 'bus') continue;
                if (v.dropOff) continue;                    // its own driver is still getting out
                if (v.claimedBy && v.claimedBy !== p && v.claimExp > time) continue;
                const d2 = dist2(v.x, v.z, p.x, p.z);
                // Prefer a car in a marked bay: a lot emptying out is the other
                // half of the parking loop, and it reads far better than another
                // kerbside car pulling away.
                const w = v.lotSpot ? d2 * 0.5 : d2;
                if (w < bestD) { bestD = w; best = v; }
            }
            if (!best) return false;
            best.claimedBy = p;
            best.claimExp = time + 22;
            p.carT = best;
            p.enterT = 20;
            p.state = 'enter';
            p.crossXw = null; p.pendingXw = null;
            return true;
        }

        /**
         * Let the driver out of a car the AI has just parked. One ped per
         * flagged car on the existing 0.3 s tick; if the pool is empty the flag
         * is dropped rather than queued, so a busy city never builds a backlog
         * of doors waiting to open.
         */
        _serviceCars(px, pz) {
            const vs = this.field.vehicles;
            for (let i = 0; i < vs.length; i++) {
                const v = vs[i];
                if (!v.dropOff) continue;
                v.dropOff = false;
                if (dist2(v.x, v.z, px, pz) > 170 * 170) continue;
                const rx = Math.cos(v.heading), rz = -Math.sin(v.heading);
                const off = v.spec.W / 2 + 0.55;
                const dx = v.x - rx * off, dz = v.z - rz * off;
                const p = this.renderer.spawn(dx, dz, Math.random);
                if (!p) continue;
                const n = this.map.nearestSidewalk(dx, dz);
                if (n < 0) { this.renderer.remove(p); continue; }
                p.node = n; p.prev = -1;
                p.baseSpeed = 1.05 + Math.random() * 0.6;
                p.heading = v.heading; p.moveHeading = v.heading;
                // A beat by the door — locking up, glancing at the phone — so
                // they read as having got out rather than having popped in.
                p.state = 'phone';
                p.waitT = 1.2 + Math.random() * 1.4;
                p.socialT = 12 + Math.random() * 20;
                this.stats.dropOffs++;
            }
        }

        _trySpawn(px, pz) {
            let alive = 0;
            for (const p of this.renderer.peds) if (p.state !== 'dead') alive++;
            if (alive >= this.target) return;
            const nodes = this.map.sidewalkNodes;
            for (let n = 0; n < 3 && alive < this.target; n++) {
                if (!this._ring.length) return;
                const ni = this._ring[(Math.random() * this._ring.length) | 0];
                const node = nodes[ni];
                const p = this.renderer.spawn(node.x, node.z, Math.random);
                if (p) {
                    p.node = ni;
                    p.prev = -1;
                    p.baseSpeed = 1.05 + Math.random() * 0.6;
                    alive++;
                }
            }
        }

        _recycle(px, pz) {
            const ped = this.renderer.peds;
            for (let i = ped.length - 1; i >= 0; i--) {
                const p = ped[i];
                if (p.state !== 'dead' && dist2(p.x, p.z, px, pz) > 175 * 175) this.renderer.remove(p);
            }
        }
    }
